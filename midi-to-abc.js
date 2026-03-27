function createReader(uint8Array) {
  let offset = 0;

  return {
    eof() {
      return offset >= uint8Array.length;
    },
    tell() {
      return offset;
    },
    readUint8() {
      return uint8Array[offset++];
    },
    readUint16() {
      const value = (uint8Array[offset] << 8) | uint8Array[offset + 1];
      offset += 2;
      return value;
    },
    readUint32() {
      const value = (uint8Array[offset] * 0x1000000)
        + ((uint8Array[offset + 1] << 16) | (uint8Array[offset + 2] << 8) | uint8Array[offset + 3]);
      offset += 4;
      return value >>> 0;
    },
    readString(length) {
      const value = new TextDecoder('ascii').decode(uint8Array.slice(offset, offset + length));
      offset += length;
      return value;
    },
    readBytes(length) {
      const value = uint8Array.slice(offset, offset + length);
      offset += length;
      return value;
    },
    readVarUint() {
      let value = 0;
      let byte = 0;

      do {
        byte = this.readUint8();
        value = (value << 7) | (byte & 0x7f);
      } while (byte & 0x80);

      return value;
    }
  };
}

function parseHeader(reader) {
  const chunkType = reader.readString(4);
  if (chunkType !== 'MThd') {
    throw new Error('不是有效的 MIDI 檔案：缺少 MThd 標頭。');
  }

  const headerLength = reader.readUint32();
  const format = reader.readUint16();
  const trackCount = reader.readUint16();
  const division = reader.readUint16();

  if (headerLength > 6) {
    reader.readBytes(headerLength - 6);
  }

  if (division & 0x8000) {
    throw new Error('目前只支援 PPQ 時基的 MIDI 檔案。');
  }

  return { format, trackCount, division };
}

function parseTrackProper(reader) {
  const chunkType = reader.readString(4);
  if (chunkType !== 'MTrk') {
    throw new Error('不是有效的 MIDI 檔案：缺少 MTrk 區塊。');
  }

  const trackLength = reader.readUint32();
  const trackEnd = reader.tell() + trackLength;
  const events = [];
  let absoluteTicks = 0;
  let runningStatus = null;

  while (reader.tell() < trackEnd) {
    absoluteTicks += reader.readVarUint();
    let statusOrData = reader.readUint8();
    let statusByte = statusOrData;
    let firstDataByte = null;

    if (statusOrData < 0x80) {
      if (runningStatus === null) {
        throw new Error('遇到不完整的 running status。');
      }
      statusByte = runningStatus;
      firstDataByte = statusOrData;
    } else if (statusByte < 0xf0) {
      runningStatus = statusByte;
    }

    if (statusByte < 0xf0) {
      const eventType = statusByte >> 4;
      const channel = statusByte & 0x0f;
      const data1 = firstDataByte ?? reader.readUint8();
      const data2 = eventType === 0xc || eventType === 0xd ? null : reader.readUint8();
      events.push({ absoluteTicks, statusByte, eventType, channel, data1, data2 });
      continue;
    }

    if (statusByte === 0xff) {
      const metaType = reader.readUint8();
      const length = reader.readVarUint();
      const data = reader.readBytes(length);
      events.push({ absoluteTicks, statusByte, metaType, data });
      continue;
    }

    if (statusByte === 0xf0 || statusByte === 0xf7) {
      const length = reader.readVarUint();
      reader.readBytes(length);
    }
  }

  return events;
}

function extractSongData(tracks, division) {
  const noteStarts = new Map();
  const notes = [];
  let tempo = 500000;
  let timeSignature = { numerator: 4, denominator: 4 };

  tracks.flat().forEach((event) => {
    if (event.statusByte === 0xff && event.metaType === 0x51 && event.data.length === 3) {
      tempo = (event.data[0] << 16) | (event.data[1] << 8) | event.data[2];
      return;
    }

    if (event.statusByte === 0xff && event.metaType === 0x58 && event.data.length >= 2) {
      timeSignature = {
        numerator: event.data[0],
        denominator: 2 ** event.data[1]
      };
      return;
    }

    if (event.eventType !== 0x8 && event.eventType !== 0x9) {
      return;
    }

    const key = `${event.channel}:${event.data1}`;
    const isNoteOn = event.eventType === 0x9 && event.data2 > 0;
    const isNoteOff = event.eventType === 0x8 || (event.eventType === 0x9 && event.data2 === 0);

    if (isNoteOn) {
      if (!noteStarts.has(key)) {
        noteStarts.set(key, []);
      }
      noteStarts.get(key).push({ tick: event.absoluteTicks, velocity: event.data2 });
      return;
    }

    if (isNoteOff && noteStarts.has(key)) {
      const starts = noteStarts.get(key);
      const start = starts.shift();
      if (starts.length === 0) {
        noteStarts.delete(key);
      }

      if (start && event.absoluteTicks > start.tick) {
        notes.push({
          pitch: event.data1,
          startTick: start.tick,
          durationTicks: event.absoluteTicks - start.tick,
          velocity: start.velocity
        });
      }
    }
  });

  if (notes.length === 0) {
    throw new Error('找不到可轉換的 note event，請確認 MIDI 檔案中有音符資料。');
  }

  notes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
  return { division, tempo, timeSignature, notes };
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}

function ticksToAbcLength(durationTicks, division) {
  const numerator = durationTicks * 2;
  const denominator = division;
  const factor = gcd(numerator, denominator);
  const reducedNumerator = numerator / factor;
  const reducedDenominator = denominator / factor;

  if (reducedNumerator === 1 && reducedDenominator === 1) {
    return '';
  }
  if (reducedDenominator === 1) {
    return String(reducedNumerator);
  }
  if (reducedNumerator === 1) {
    return `/${reducedDenominator}`;
  }
  return `${reducedNumerator}/${reducedDenominator}`;
}

function midiPitchToAbc(pitch) {
  const noteNames = ['C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B'];
  const octave = Math.floor(pitch / 12) - 1;
  const pitchClass = pitch % 12;
  const note = noteNames[pitchClass];
  const baseLetter = note.endsWith('C') || note.endsWith('D') || note.endsWith('E') || note.endsWith('F') || note.endsWith('G') || note.endsWith('A') || note.endsWith('B')
    ? note.slice(-1)
    : note;
  const accidental = note.slice(0, -1);

  if (octave < 4) {
    return `${accidental}${baseLetter}${','.repeat(4 - octave)}`;
  }
  if (octave === 4) {
    return `${accidental}${baseLetter}`;
  }
  return `${accidental}${baseLetter.toLowerCase()}${"'".repeat(octave - 5)}`;
}

function groupNotesIntoMoments(notes) {
  const moments = [];

  notes.forEach((note) => {
    const existing = moments.find((moment) => moment.startTick === note.startTick && moment.durationTicks === note.durationTicks);
    if (existing) {
      existing.notes.push(note);
      return;
    }

    moments.push({
      startTick: note.startTick,
      durationTicks: note.durationTicks,
      notes: [note]
    });
  });

  moments.sort((a, b) => a.startTick - b.startTick || a.notes[0].pitch - b.notes[0].pitch);
  return moments;
}

function renderMoment(moment, division) {
  const length = ticksToAbcLength(moment.durationTicks, division);
  if (moment.notes.length === 1) {
    return `${midiPitchToAbc(moment.notes[0].pitch)}${length}`;
  }
  const chord = moment.notes.map((note) => midiPitchToAbc(note.pitch)).join('');
  return `[${chord}]${length}`;
}

function renderRest(durationTicks, division) {
  return `z${ticksToAbcLength(durationTicks, division)}`;
}

function wrapAbcBody(tokens, timeSignature, division) {
  const barTicks = division * timeSignature.numerator * (4 / timeSignature.denominator);
  let currentBarTick = 0;
  let absoluteTick = 0;
  const rendered = [];

  tokens.forEach((token) => {
    rendered.push(token.text);
    absoluteTick += token.durationTicks;
    currentBarTick += token.durationTicks;

    if (barTicks > 0 && absoluteTick > 0 && currentBarTick >= barTicks) {
      rendered.push(' | ');
      currentBarTick %= barTicks;
    } else {
      rendered.push(' ');
    }
  });

  return rendered.join('').trim();
}

export function convertMidiBufferToAbc(arrayBuffer, fileName = 'untitled.mid') {
  const reader = createReader(new Uint8Array(arrayBuffer));
  const header = parseHeader(reader);
  const tracks = [];

  for (let i = 0; i < header.trackCount; i += 1) {
    tracks.push(parseTrackProper(reader));
  }

  const song = extractSongData(tracks, header.division);
  const moments = groupNotesIntoMoments(song.notes);
  const tokens = [];
  let currentTick = 0;

  moments.forEach((moment) => {
    if (moment.startTick > currentTick) {
      tokens.push({
        text: renderRest(moment.startTick - currentTick, song.division),
        durationTicks: moment.startTick - currentTick
      });
    }

    tokens.push({
      text: renderMoment(moment, song.division),
      durationTicks: moment.durationTicks
    });
    currentTick = Math.max(currentTick, moment.startTick + moment.durationTicks);
  });

  const bpm = Math.round(60000000 / song.tempo);
  const abcLines = [
    'X:1',
    `T:${fileName.replace(/\.mid$/i, '') || 'Untitled MIDI'}`,
    `M:${song.timeSignature.numerator}/${song.timeSignature.denominator}`,
    'L:1/8',
    `Q:1/4=${bpm}`,
    'K:C',
    wrapAbcBody(tokens, song.timeSignature, song.division)
  ];

  return abcLines.join('\n');
}
