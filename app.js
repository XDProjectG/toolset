import { convertMidiBufferToAbc } from './midi-to-abc.js';

const BASE_TITLE = '音樂工具箱';
const PIANO_START_MIDI = 21;
const PIANO_KEY_COUNT = 88;
const DEFAULT_VELOCITY = 0.8;
const PIANO_SHORTCUTS = {
  whiteCenter: '1',
  whiteRight: '234567890-=qwertyuiop',
  whiteLeft: "';lkjhgfdsa",
  blackCenter: 'v',
  blackRight: 'bnm,./[]\\',
  blackLeft: 'cxz',
};

let stopwatchRunning = false;
let stopwatchStartAt = 0;
let elapsedBeforeRun = 0;
let animationFrameId = null;
let activeLap = null;
const laps = [];

let timerIdSeed = 1;
const timers = [];
let timerIntervalId = null;
let timerAnchorEnabled = false;
let titleIntervalId = null;
let pianoAudioContext = null;
let pianoMasterGain = null;
let midiOutput = null;
let activeProgram = 0;
const activeNotes = new Map();
const keyElementsByMidi = new Map();
const midiByShortcut = new Map();

function formatElapsedParts(milliseconds) {
  const totalMilliseconds = Math.max(0, Math.floor(milliseconds));
  const hours = Math.floor(totalMilliseconds / 3600000);
  const minutes = Math.floor((totalMilliseconds % 3600000) / 60000);
  const seconds = Math.floor((totalMilliseconds % 60000) / 1000);
  const ms = totalMilliseconds % 1000;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const mmm = String(ms).padStart(3, '0');
  const major = hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;

  return { major, minor: `.${mmm}` };
}

function formatElapsed(milliseconds) {
  const parts = formatElapsedParts(milliseconds);
  return `${parts.major}${parts.minor}`;
}

function formatNoMs(milliseconds) {
  const totalMilliseconds = Math.max(0, Math.floor(milliseconds));
  const hours = Math.floor(totalMilliseconds / 3600000);
  const minutes = Math.floor((totalMilliseconds % 3600000) / 60000);
  const seconds = Math.floor((totalMilliseconds % 60000) / 1000);
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatCountdownWithOverflow(remainMs, overflowUnit) {
  const totalSeconds = Math.max(0, Math.ceil(remainMs / 1000));

  if (overflowUnit === 'h') {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  if (overflowUnit === 'm') {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  if (overflowUnit === 's') {
    return String(totalSeconds);
  }

  return formatNoMs(remainMs);
}

function getCurrentElapsed() {
  if (!stopwatchRunning) {
    return elapsedBeforeRun;
  }

  return elapsedBeforeRun + (performance.now() - stopwatchStartAt);
}

function updateDocumentTitle(elapsed) {
  if (elapsed <= 0 && !stopwatchRunning) {
    document.title = BASE_TITLE;
    return;
  }
  document.title = `[${formatNoMs(elapsed)}] - ${BASE_TITLE}`;
}

function updateStopwatchDisplay() {
  const display = document.getElementById('stopwatch-display');
  const elapsed = getCurrentElapsed();
  const parts = formatElapsedParts(elapsed);
  display.innerHTML = `<span class="time-major">${parts.major}</span><span class="time-minor">${parts.minor}</span>`;
  updateDocumentTitle(elapsed);

  if (activeLap) {
    const lapElapsed = elapsed - activeLap.startedAt;
    activeLap.timeCell.textContent = formatElapsed(lapElapsed);
    activeLap.totalCell.textContent = formatElapsed(elapsed);
  }

  updateAnchorTimers();
}

function renderFrozenLap(lapData) {
  const item = document.createElement('li');
  item.className = 'lap-row';

  const lapIndex = document.createElement('span');
  lapIndex.textContent = String(lapData.number);

  const lapTime = document.createElement('span');
  lapTime.textContent = formatElapsed(lapData.lapTime);

  const totalTime = document.createElement('span');
  totalTime.textContent = lapData.number === 1 ? '—' : formatElapsed(lapData.totalTime);

  item.append(lapIndex, lapTime, totalTime);
  return item;
}

function createActiveLapRow(startedAt) {
  const item = document.createElement('li');
  item.className = 'lap-row lap-row-active';

  const lapIndex = document.createElement('span');
  lapIndex.textContent = String(laps.length + 1);

  const lapTime = document.createElement('span');
  lapTime.textContent = '00:00.000';

  const totalTime = document.createElement('span');
  totalTime.textContent = formatElapsed(startedAt);

  item.append(lapIndex, lapTime, totalTime);

  return {
    number: laps.length + 1,
    startedAt,
    element: item,
    timeCell: lapTime,
    totalCell: totalTime,
  };
}

function showLapsSection() {
  document.getElementById('laps-section').hidden = false;
}

function hideLapsSection() {
  document.getElementById('laps-section').hidden = true;
}

function commitLap() {
  if (!activeLap) {
    return;
  }

  const elapsed = getCurrentElapsed();
  const lapTime = elapsed - activeLap.startedAt;
  const completedLap = {
    number: activeLap.number,
    lapTime,
    totalTime: elapsed,
  };

  const list = document.getElementById('laps-list');
  list.replaceChild(renderFrozenLap(completedLap), activeLap.element);
  laps.push(completedLap);

  activeLap = createActiveLapRow(elapsed);
  list.prepend(activeLap.element);
  updateStopwatchDisplay();
}

function startTicker() {
  const tick = () => {
    updateStopwatchDisplay();
    if (stopwatchRunning) {
      animationFrameId = window.requestAnimationFrame(tick);
    }
  };

  animationFrameId = window.requestAnimationFrame(tick);
}

function stopTicker() {
  if (animationFrameId) {
    window.cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function ensureTitleTicker() {
  if (titleIntervalId) {
    return;
  }

  titleIntervalId = window.setInterval(() => {
    updateDocumentTitle(getCurrentElapsed());
  }, 1000);
}

function stopTitleTicker() {
  if (!titleIntervalId) {
    return;
  }
  window.clearInterval(titleIntervalId);
  titleIntervalId = null;
}

function setButtonsForInitial() {
  const primary = document.getElementById('stopwatch-primary');
  const secondary = document.getElementById('stopwatch-secondary');
  primary.textContent = '開始';
  primary.dataset.intent = 'start';
  secondary.textContent = '重設';
  secondary.dataset.intent = 'reset';
  secondary.disabled = true;
}

function setButtonsForRunning() {
  const primary = document.getElementById('stopwatch-primary');
  const secondary = document.getElementById('stopwatch-secondary');
  primary.textContent = '停止';
  primary.dataset.intent = 'stop';
  secondary.textContent = '圈數';
  secondary.dataset.intent = 'lap';
  secondary.disabled = false;
}

function setButtonsForPaused() {
  const primary = document.getElementById('stopwatch-primary');
  const secondary = document.getElementById('stopwatch-secondary');
  primary.textContent = '繼續';
  primary.dataset.intent = 'start';
  secondary.textContent = '重設';
  secondary.dataset.intent = 'reset';
  secondary.disabled = false;
}

function resetStopwatch() {
  stopwatchRunning = false;
  stopTicker();
  stopTitleTicker();

  elapsedBeforeRun = 0;
  stopwatchStartAt = 0;
  activeLap = null;
  laps.length = 0;

  document.getElementById('laps-list').innerHTML = '';
  hideLapsSection();
  setButtonsForInitial();
  clearAllTimers();
  updateStopwatchDisplay();
}

function startOrResumeStopwatch() {
  if (stopwatchRunning) {
    return;
  }

  stopwatchRunning = true;
  stopwatchStartAt = performance.now();

  if (!activeLap) {
    showLapsSection();
    activeLap = createActiveLapRow(elapsedBeforeRun);
    document.getElementById('laps-list').prepend(activeLap.element);
  }

  setButtonsForRunning();
  ensureTitleTicker();
  startTicker();
}

function stopStopwatch() {
  if (!stopwatchRunning) {
    return;
  }

  elapsedBeforeRun = getCurrentElapsed();
  stopwatchRunning = false;
  stopTicker();
  stopTitleTicker();
  updateStopwatchDisplay();
  setButtonsForPaused();
}

function handlePrimaryAction() {
  const label = document.getElementById('stopwatch-primary').textContent;

  if (label === '停止') {
    stopStopwatch();
    return;
  }

  startOrResumeStopwatch();
}

function handleSecondaryAction() {
  const secondary = document.getElementById('stopwatch-secondary');

  if (secondary.disabled) {
    return;
  }

  if (secondary.textContent === '圈數') {
    commitLap();
    return;
  }

  resetStopwatch();
}

function activateTab(tabId) {
  const tabs = document.querySelectorAll('[role="tab"]');
  const panels = document.querySelectorAll('[role="tabpanel"]');

  tabs.forEach((tab) => {
    const isActive = tab.id === tabId;
    tab.setAttribute('aria-selected', String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
  });

  panels.forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== tabId;
  });
}

function bindTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab.id));
    tab.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        tabs[(index + 1) % tabs.length].focus();
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        tabs[(index - 1 + tabs.length) % tabs.length].focus();
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activateTab(tab.id);
      }
    });
  });
}

function closeTimerSettingPanel() {
  document.getElementById('timer-setting-panel').hidden = true;
}

function readDurationInput() {
  const hour = Number.parseInt(document.getElementById('timer-hour').value, 10);
  const minute = Number.parseInt(document.getElementById('timer-minute').value, 10);
  const second = Number.parseInt(document.getElementById('timer-second').value, 10);

  const h = Number.isFinite(hour) && hour >= 0 ? hour : 0;
  const m = Number.isFinite(minute) && minute >= 0 ? minute : 0;
  const s = Number.isFinite(second) && second >= 0 ? second : 0;
  const hasAny = [hour, minute, second].some((value) => Number.isFinite(value));

  return { h, m, s, hasAny };
}

function getOverflowInfo({ h, m, s }) {
  const overflowFields = [];
  if (h > 23) overflowFields.push('h');
  if (m > 59) overflowFields.push('m');
  if (s > 59) overflowFields.push('s');
  return overflowFields;
}

function formatTimerSetting(timer) {
  return timer.anchor
    ? `連動 ${formatNoMs(timer.targetMs)}`
    : `計時 ${String(timer.source.h).padStart(2, '0')}:${String(timer.source.m).padStart(2, '0')}:${String(timer.source.s).padStart(2, '0')}`;
}

function formatRemaining(timer, nowElapsed) {
  const remainMs = timer.anchor ? Math.max(0, timer.targetMs - nowElapsed) : Math.max(0, timer.endAt - Date.now());
  return formatCountdownWithOverflow(remainMs, timer.overflowUnit);
}

function ensureTimerSectionVisible() {
  document.getElementById('timers-section').hidden = timers.length === 0;
}

function renderTimers() {
  const list = document.getElementById('timers-list');
  list.innerHTML = '';
  const elapsed = getCurrentElapsed();

  timers.forEach((timer) => {
    const item = document.createElement('li');
    item.className = `timer-item ${timer.done ? 'timer-completed' : ''}`;

    const setting = document.createElement('small');
    setting.className = 'timer-setting-note';
    setting.textContent = formatTimerSetting(timer);

    const value = document.createElement('strong');
    value.textContent = timer.done ? '完成' : formatRemaining(timer, elapsed);

    item.append(value, setting);
    list.appendChild(item);
  });

  ensureTimerSectionVisible();
}

function toneAt(ctx, startAt, freq, duration) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

function playDoneMelody() {
  if (!window.AudioContext && !window.webkitAudioContext) {
    return;
  }

  const Context = window.AudioContext || window.webkitAudioContext;
  const ctx = new Context();
  const base = ctx.currentTime + 0.05;
  const phrase = [523.25, 659.25, 783.99, 659.25];

  for (let loop = 0; loop < 3; loop += 1) {
    phrase.forEach((freq, idx) => {
      toneAt(ctx, base + loop * 0.9 + idx * 0.2, freq, 0.16);
    });
  }
}

function updateIndependentTimers() {
  const now = Date.now();
  let changed = false;

  timers.forEach((timer) => {
    if (timer.done || timer.anchor) return;
    if (now >= timer.endAt) {
      timer.done = true;
      changed = true;
      playDoneMelody();
    }
  });

  if (changed || timers.some((timer) => !timer.done && !timer.anchor)) {
    renderTimers();
  }
}

function updateAnchorTimers() {
  const elapsed = getCurrentElapsed();
  let changed = false;

  timers.forEach((timer) => {
    if (timer.done || !timer.anchor) return;
    if (elapsed >= timer.targetMs) {
      timer.done = true;
      changed = true;
      playDoneMelody();
    }
  });

  if (changed || timers.some((timer) => !timer.done && timer.anchor)) {
    renderTimers();
  }
}

function ensureTimerTicker() {
  if (!timerIntervalId) {
    timerIntervalId = window.setInterval(updateIndependentTimers, 120);
  }
}

function clearAllTimers() {
  timers.length = 0;
  timerAnchorEnabled = false;
  const anchorButton = document.getElementById('timer-anchor');
  anchorButton.classList.remove('active');
  anchorButton.setAttribute('aria-pressed', 'false');
  document.getElementById('timers-list').innerHTML = '';
  ensureTimerSectionVisible();
  closeTimerSettingPanel();
}

function addTimer() {
  const anchor = timerAnchorEnabled;
  const source = readDurationInput();
  let cancelled = false;

  if (!source.hasAny) {
    cancelled = true;
  }

  const overflowFields = getOverflowInfo(source);
  if (overflowFields.length > 1) {
    cancelled = true;
  }

  const totalMs = (source.h * 3600 + source.m * 60 + source.s) * 1000;
  if (totalMs <= 0) {
    cancelled = true;
  }

  if (anchor) {
    if (overflowFields.length > 0) {
      cancelled = true;
    }
    const currentElapsed = getCurrentElapsed();
    if (currentElapsed >= totalMs) {
      cancelled = true;
    }
  }

  if (!cancelled) {
    timers.unshift({
      id: timerIdSeed += 1,
      source,
      anchor,
      overflowUnit: overflowFields[0] ?? null,
      targetMs: anchor ? totalMs : null,
      endAt: anchor ? null : Date.now() + totalMs,
      done: false,
    });
    renderTimers();
    ensureTimerTicker();
  }

  closeTimerSettingPanel();
}

function addPresetTimer(minutes) {
  document.getElementById('timer-hour').value = '';
  document.getElementById('timer-minute').value = String(minutes);
  document.getElementById('timer-second').value = '';
  addTimer();
}

function bindTimerSettings() {
  const toggle = document.getElementById('timer-setting-toggle');
  const panel = document.getElementById('timer-setting-panel');
  const addButton = document.getElementById('timer-add');
  const anchorButton = document.getElementById('timer-anchor');

  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
  });

  addButton.addEventListener('click', addTimer);

  anchorButton.addEventListener('click', () => {
    timerAnchorEnabled = !timerAnchorEnabled;
    anchorButton.classList.toggle('active', timerAnchorEnabled);
    anchorButton.setAttribute('aria-pressed', String(timerAnchorEnabled));
  });

  document.querySelectorAll('[data-preset-minutes]').forEach((button) => {
    button.addEventListener('click', () => {
      addPresetTimer(Number.parseInt(button.dataset.presetMinutes ?? '0', 10));
    });
  });
}

async function handleMidiFileSelection(event) {
  const status = document.getElementById('midi-status');
  const output = document.getElementById('abc-output');
  const file = event.target.files?.[0];

  if (!file) {
    status.textContent = '請先選擇一個 MIDI 檔案。';
    output.value = '';
    return;
  }

  status.textContent = `正在讀取 ${file.name}...`;

  try {
    const arrayBuffer = await file.arrayBuffer();
    output.value = convertMidiBufferToAbc(arrayBuffer, file.name);
    status.textContent = `已完成轉換：${file.name}`;
  } catch (error) {
    output.value = '';
    status.textContent = error instanceof Error ? error.message : '轉換失敗，請確認 MIDI 檔案格式。';
  }
}

async function copyAbcOutput() {
  const output = document.getElementById('abc-output');
  const status = document.getElementById('midi-status');

  if (!output.value.trim()) {
    status.textContent = '目前沒有可複製的 ABC 內容。';
    return;
  }

  try {
    await navigator.clipboard.writeText(output.value);
    status.textContent = 'ABC 內容已複製到剪貼簿。';
  } catch (_error) {
    status.textContent = '瀏覽器無法直接寫入剪貼簿，請手動複製文字。';
  }
}

function midiToFrequency(midiNote) {
  return 440 * (2 ** ((midiNote - 69) / 12));
}

function isBlackKey(midiNote) {
  return [1, 3, 6, 8, 10].includes(midiNote % 12);
}

function createShortcutMap() {
  const map = new Map();
  const centerWhiteMidi = 60;
  const centerBlackMidi = 61;

  map.set(PIANO_SHORTCUTS.whiteCenter, centerWhiteMidi);
  map.set(PIANO_SHORTCUTS.blackCenter, centerBlackMidi);

  let whiteLeftMidi = centerWhiteMidi;
  [...PIANO_SHORTCUTS.whiteLeft].forEach((shortcut) => {
    whiteLeftMidi -= whiteLeftMidi % 12 === 0 ? 1 : 2;
    map.set(shortcut, whiteLeftMidi);
  });

  let whiteRightMidi = centerWhiteMidi;
  [...PIANO_SHORTCUTS.whiteRight].forEach((shortcut) => {
    whiteRightMidi += [4, 11].includes(whiteRightMidi % 12) ? 1 : 2;
    map.set(shortcut, whiteRightMidi);
  });

  let blackLeftMidi = centerBlackMidi;
  [...PIANO_SHORTCUTS.blackLeft].forEach((shortcut) => {
    blackLeftMidi -= blackLeftMidi % 12 === 10 ? 1 : 2;
    map.set(shortcut, blackLeftMidi);
  });

  let blackRightMidi = centerBlackMidi;
  [...PIANO_SHORTCUTS.blackRight].forEach((shortcut) => {
    blackRightMidi += [1, 6].includes(blackRightMidi % 12) ? 2 : 3;
    map.set(shortcut, blackRightMidi);
  });

  return map;
}

function findShortcutByMidi(midiNote) {
  for (const [shortcut, mappedMidi] of midiByShortcut.entries()) {
    if (mappedMidi === midiNote) {
      return shortcut;
    }
  }
  return '';
}

function ensureAudioContext() {
  if (pianoAudioContext) {
    return pianoAudioContext;
  }
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) {
    return null;
  }
  pianoAudioContext = new Context();
  pianoMasterGain = pianoAudioContext.createGain();
  pianoMasterGain.gain.value = 0.22;
  pianoMasterGain.connect(pianoAudioContext.destination);
  return pianoAudioContext;
}

async function initMidiOutput() {
  const status = document.getElementById('piano-status');
  if (!navigator.requestMIDIAccess) {
    status.textContent = '此瀏覽器不支援 Web MIDI，改用內建合成音源。';
    return;
  }

  try {
    const access = await navigator.requestMIDIAccess();
    const outputs = [...access.outputs.values()];
    midiOutput = outputs[0] ?? null;
    if (midiOutput) {
      status.textContent = `使用 MIDI 音源：${midiOutput.name}`;
      midiOutput.send([0xC0, activeProgram]);
      return;
    }
    status.textContent = '找不到可用 MIDI 輸出裝置，改用內建合成音源。';
  } catch (_error) {
    status.textContent = '無法啟用 MIDI 音源，改用內建合成音源。';
  }
}

function noteOnSynth(midiNote) {
  const context = ensureAudioContext();
  if (!context || !pianoMasterGain) return;
  if (context.state === 'suspended') {
    context.resume();
  }
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = midiToFrequency(midiNote);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.22 * DEFAULT_VELOCITY, context.currentTime + 0.02);
  oscillator.connect(gain).connect(pianoMasterGain);
  oscillator.start();
  activeNotes.set(`synth-${midiNote}`, { oscillator, gain });
}

function noteOffSynth(midiNote) {
  const context = pianoAudioContext;
  const note = activeNotes.get(`synth-${midiNote}`);
  if (!context || !note) return;
  const stopAt = context.currentTime + 0.15;
  note.gain.gain.cancelScheduledValues(context.currentTime);
  note.gain.gain.setValueAtTime(note.gain.gain.value, context.currentTime);
  note.gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
  note.oscillator.stop(stopAt + 0.02);
  activeNotes.delete(`synth-${midiNote}`);
}

function noteOn(midiNote) {
  if (midiOutput) {
    midiOutput.send([0x90, midiNote, Math.round(127 * DEFAULT_VELOCITY)]);
  } else {
    noteOnSynth(midiNote);
  }
}

function noteOff(midiNote) {
  if (midiOutput) {
    midiOutput.send([0x80, midiNote, 0]);
  } else {
    noteOffSynth(midiNote);
  }
}

function updateActiveProgram(program) {
  activeProgram = program;
  if (midiOutput) {
    midiOutput.send([0xC0, program]);
  }
}

function releaseVisualKey(midiNote) {
  const keyElement = keyElementsByMidi.get(midiNote);
  if (keyElement) {
    keyElement.classList.remove('active');
  }
}

function pressVisualKey(midiNote) {
  const keyElement = keyElementsByMidi.get(midiNote);
  if (keyElement) {
    keyElement.classList.add('active');
  }
}

function playKey(midiNote) {
  pressVisualKey(midiNote);
  noteOn(midiNote);
}

function stopKey(midiNote) {
  releaseVisualKey(midiNote);
  noteOff(midiNote);
}

function renderPianoKeyboard() {
  const keyboard = document.getElementById('piano-keyboard');
  if (!keyboard) return;

  keyboard.innerHTML = '';
  keyElementsByMidi.clear();
  const whiteMidiNotes = [];

  for (let midi = PIANO_START_MIDI; midi < PIANO_START_MIDI + PIANO_KEY_COUNT; midi += 1) {
    if (!isBlackKey(midi)) {
      whiteMidiNotes.push(midi);
      const key = document.createElement('button');
      key.type = 'button';
      key.className = 'piano-key white-key';
      key.dataset.midi = String(midi);
      key.style.left = `${whiteMidiNotes.length * 42}px`;
      const shortcut = findShortcutByMidi(midi);
      key.innerHTML = `<span class="key-label bottom">${shortcut}</span>`;
      keyboard.appendChild(key);
      keyElementsByMidi.set(midi, key);
    }
  }

  for (let index = 0; index < whiteMidiNotes.length; index += 1) {
    const whiteMidi = whiteMidiNotes[index];
    const blackMidi = whiteMidi + 1;
    if (!isBlackKey(blackMidi) || blackMidi > PIANO_START_MIDI + PIANO_KEY_COUNT - 1) {
      continue;
    }
    const whiteKey = keyElementsByMidi.get(whiteMidi);
    if (!whiteKey) continue;
    const blackKey = document.createElement('button');
    blackKey.type = 'button';
    blackKey.className = 'piano-key black-key';
    blackKey.dataset.midi = String(blackMidi);
    const shortcut = findShortcutByMidi(blackMidi);
    blackKey.innerHTML = `<span class="key-label top">${shortcut}</span>`;
    blackKey.style.left = `${index * 42 + 30}px`;
    keyboard.appendChild(blackKey);
    keyElementsByMidi.set(blackMidi, blackKey);
  }
}

function bindPianoInput() {
  const keyboard = document.getElementById('piano-keyboard');
  const instrumentSelect = document.getElementById('instrument-select');
  const pressedByKeyboard = new Set();

  keyboard.addEventListener('pointerdown', (event) => {
    const key = event.target.closest('.piano-key');
    if (!key) return;
    const midiNote = Number.parseInt(key.dataset.midi ?? '', 10);
    if (!Number.isFinite(midiNote)) return;
    playKey(midiNote);
    key.setPointerCapture(event.pointerId);
  });

  keyboard.addEventListener('pointerup', (event) => {
    const key = event.target.closest('.piano-key');
    if (!key) return;
    const midiNote = Number.parseInt(key.dataset.midi ?? '', 10);
    if (!Number.isFinite(midiNote)) return;
    stopKey(midiNote);
  });

  keyboard.addEventListener('pointercancel', (event) => {
    const key = event.target.closest('.piano-key');
    if (!key) return;
    const midiNote = Number.parseInt(key.dataset.midi ?? '', 10);
    if (!Number.isFinite(midiNote)) return;
    stopKey(midiNote);
  });

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      return;
    }
    if (event.repeat) return;
    const midiNote = midiByShortcut.get(event.key);
    if (!midiNote) return;
    event.preventDefault();
    if (pressedByKeyboard.has(event.key)) return;
    pressedByKeyboard.add(event.key);
    playKey(midiNote);
  });

  document.addEventListener('keyup', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      return;
    }
    const midiNote = midiByShortcut.get(event.key);
    if (!midiNote) return;
    pressedByKeyboard.delete(event.key);
    stopKey(midiNote);
  });

  instrumentSelect.addEventListener('change', () => {
    updateActiveProgram(Number.parseInt(instrumentSelect.value, 10) || 0);
  });
}

function initPiano() {
  const generatedMap = createShortcutMap();
  midiByShortcut.clear();
  generatedMap.forEach((midi, shortcut) => {
    if (midi >= PIANO_START_MIDI && midi < PIANO_START_MIDI + PIANO_KEY_COUNT) {
      midiByShortcut.set(shortcut, midi);
    }
  });
  renderPianoKeyboard();
  bindPianoInput();
  initMidiOutput();
}

function bindEvents() {
  const primary = document.getElementById('stopwatch-primary');
  const secondary = document.getElementById('stopwatch-secondary');
  const midiInput = document.getElementById('midi-file');
  const copyButton = document.getElementById('copy-abc');

  primary.addEventListener('click', handlePrimaryAction);
  secondary.addEventListener('click', handleSecondaryAction);
  midiInput.addEventListener('change', handleMidiFileSelection);
  copyButton.addEventListener('click', copyAbcOutput);

  bindTabs();
  bindTimerSettings();
  initPiano();

  document.addEventListener('visibilitychange', () => {
    updateDocumentTitle(getCurrentElapsed());
  });
}

window.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  activateTab('tab-stopwatch');
  resetStopwatch();
});
