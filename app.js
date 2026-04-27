import { convertMidiBufferToAbc } from './midi-to-abc.js';

const BASE_TITLE = '工具箱';
const PIANO_LAYOUTS = {
  49: { startMidi: 36, endMidi: 84, label: 'C2–C6' },
  61: { startMidi: 36, endMidi: 96, label: 'C2–C7' },
  76: { startMidi: 28, endMidi: 103, label: 'E1–G7' },
  88: { startMidi: 21, endMidi: 108, label: 'A0–C8' },
  108: { startMidi: 12, endMidi: 119, label: 'C0–B8' },
};
const DEFAULT_VELOCITY = 0.8;
const BLACK_KEY_RATIO = 0.62;
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
let pianoDynamicsCompressor = null;
const instrumentNodes = new Map();
let activeInstrument = 'tone-piano';
let activeKeyboardSize = 88;
let pianoQuickLoadEnabled = true;
const activeNotes = new Map();
const keyElementsByMidi = new Map();
const midiByShortcut = new Map();
const tonejsInstrumentSampleFiles = new Map();
let pointerDown = false;
let pointerActiveMidi = null;
const replacerButtons = [];
let editingButtonIndex = null;
let replacerDraft = { name: '', rules: [] };
let activeRemoveConfirmHost = null;
let activeDeleteButtonConfirm = null;
let activeTabId = 'tab-stopwatch';
let shortcutOctaveShift = 0;
const pressedByKeyboardCode = new Map();

const PASSWORD_CHARSETS = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  commonSymbols: '!@#$%^&*()-_=+[]{};:,.?/',
  rareSymbols: '"`~\|<>',
};
const AMBIGUOUS_CHARS = new Set(['0', 'O', '1', 'I', 'l']);
const TONEJS_INSTRUMENTS_BASE_URL = 'https://nbrosowsky.github.io/tonejs-instruments/samples/';
const TONEJS_INSTRUMENTS_CONTENTS_API = 'https://api.github.com/repos/nbrosowsky/tonejs-instruments/contents/samples';
const TONEJS_INSTRUMENTS = {
  'bass-electric': { label: 'tonejs-instruments：Bass Electric' },
  bassoon: { label: 'tonejs-instruments：Bassoon' },
  cello: { label: 'tonejs-instruments：Cello' },
  clarinet: { label: 'tonejs-instruments：Clarinet' },
  contrabass: { label: 'tonejs-instruments：Contrabass' },
  flute: { label: 'tonejs-instruments：Flute' },
  'french-horn': { label: 'tonejs-instruments：French Horn' },
  'guitar-acoustic': { label: 'tonejs-instruments：Guitar Acoustic' },
  'guitar-electric': { label: 'tonejs-instruments：Guitar Electric' },
  'guitar-nylon': { label: 'tonejs-instruments：Guitar Nylon' },
  harmonium: { label: 'tonejs-instruments：Harmonium' },
  harp: { label: 'tonejs-instruments：Harp' },
  organ: { label: 'tonejs-instruments：Organ' },
  piano: { label: 'tonejs-instruments：Piano' },
  saxophone: { label: 'tonejs-instruments：Saxophone' },
  trombone: { label: 'tonejs-instruments：Trombone' },
  trumpet: { label: 'tonejs-instruments：Trumpet' },
  tuba: { label: 'tonejs-instruments：Tuba' },
  violin: { label: 'tonejs-instruments：Violin' },
  xylophone: { label: 'tonejs-instruments：Xylophone' },
};
const REFERENCE_C4_MIDI = 60;
const REFERENCE_C4_FREQUENCY = 261.6255653005986;

const INSTRUMENT_LIBRARY = {
  'tone-piano': { kind: 'sampler', label: 'Tone.js 鋼琴（Salamander）' },
  'tone-synth': { kind: 'tone-poly', synthType: 'Synth', label: 'Tone Synth（經典）' },
  'tone-am-synth': { kind: 'tone-poly', synthType: 'AMSynth', label: 'Tone AMSynth（AM）' },
  'tone-fm-synth': { kind: 'tone-poly', synthType: 'FMSynth', label: 'Tone FMSynth（FM）' },
  'tone-mono-synth': { kind: 'tone-poly', synthType: 'MonoSynth', label: 'Tone MonoSynth（單音）' },
  'tone-duo-synth': { kind: 'tone-poly', synthType: 'DuoSynth', label: 'Tone DuoSynth（雙振盪器）' },
  'tone-membrane-synth': { kind: 'tone-poly', synthType: 'MembraneSynth', label: 'Tone MembraneSynth（鼓膜）' },
  'tone-metal-synth': { kind: 'tone-poly', synthType: 'MetalSynth', label: 'Tone MetalSynth（金屬）' },
  'tone-pluck-synth': {
    kind: 'tone-poly',
    synthType: 'Synth',
    synthOptions: {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.08 },
    },
    label: 'Tone PluckSynth（撥弦）',
  },
  'tji-bass-electric': { kind: 'tonejs-instruments', instrumentName: 'bass-electric', label: TONEJS_INSTRUMENTS['bass-electric'].label },
  'tji-bassoon': { kind: 'tonejs-instruments', instrumentName: 'bassoon', label: TONEJS_INSTRUMENTS.bassoon.label },
  'tji-cello': { kind: 'tonejs-instruments', instrumentName: 'cello', label: TONEJS_INSTRUMENTS.cello.label },
  'tji-clarinet': { kind: 'tonejs-instruments', instrumentName: 'clarinet', label: TONEJS_INSTRUMENTS.clarinet.label },
  'tji-contrabass': { kind: 'tonejs-instruments', instrumentName: 'contrabass', label: TONEJS_INSTRUMENTS.contrabass.label },
  'tji-flute': { kind: 'tonejs-instruments', instrumentName: 'flute', label: TONEJS_INSTRUMENTS.flute.label },
  'tji-french-horn': { kind: 'tonejs-instruments', instrumentName: 'french-horn', label: TONEJS_INSTRUMENTS['french-horn'].label },
  'tji-guitar-acoustic': { kind: 'tonejs-instruments', instrumentName: 'guitar-acoustic', label: TONEJS_INSTRUMENTS['guitar-acoustic'].label },
  'tji-guitar-electric': { kind: 'tonejs-instruments', instrumentName: 'guitar-electric', label: TONEJS_INSTRUMENTS['guitar-electric'].label },
  'tji-guitar-nylon': { kind: 'tonejs-instruments', instrumentName: 'guitar-nylon', label: TONEJS_INSTRUMENTS['guitar-nylon'].label },
  'tji-harmonium': { kind: 'tonejs-instruments', instrumentName: 'harmonium', label: TONEJS_INSTRUMENTS.harmonium.label },
  'tji-harp': { kind: 'tonejs-instruments', instrumentName: 'harp', label: TONEJS_INSTRUMENTS.harp.label },
  'tji-organ': { kind: 'tonejs-instruments', instrumentName: 'organ', label: TONEJS_INSTRUMENTS.organ.label },
  'tji-piano': { kind: 'tonejs-instruments', instrumentName: 'piano', label: TONEJS_INSTRUMENTS.piano.label },
  'tji-saxophone': { kind: 'tonejs-instruments', instrumentName: 'saxophone', label: TONEJS_INSTRUMENTS.saxophone.label },
  'tji-trombone': { kind: 'tonejs-instruments', instrumentName: 'trombone', label: TONEJS_INSTRUMENTS.trombone.label },
  'tji-trumpet': { kind: 'tonejs-instruments', instrumentName: 'trumpet', label: TONEJS_INSTRUMENTS.trumpet.label },
  'tji-tuba': { kind: 'tonejs-instruments', instrumentName: 'tuba', label: TONEJS_INSTRUMENTS.tuba.label },
  'tji-violin': { kind: 'tonejs-instruments', instrumentName: 'violin', label: TONEJS_INSTRUMENTS.violin.label },
  'tji-xylophone': { kind: 'tonejs-instruments', instrumentName: 'xylophone', label: TONEJS_INSTRUMENTS.xylophone.label },
  'berklee-gong': { kind: 'berklee-sampler', sampleUrl: 'https://tonejs.github.io/audio/berklee/gong_1.mp3', label: 'Berklee Gong' },
  'berklee-theremin': { kind: 'berklee-sampler', sampleUrl: 'https://tonejs.github.io/audio/berklee/gurgling_theremin_1.mp3', label: 'Berklee Gurgling Theremin' },
  'builtin-12tet': { kind: 'builtin', label: '內建合成（12 平均律）' },
  'builtin-just': { kind: 'builtin', label: '內建合成（純律）' },
  'builtin-pythagorean': { kind: 'builtin', label: '內建合成（5 度相生律）' },
};

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

  activeTabId = tabId;
  if (tabId !== 'tab-piano') {
    pressedByKeyboardCode.clear();
    stopAllPlayingNotes();
  }
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
  oscillator.type = 'triangle';
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

function getCurrentLayout() {
  return PIANO_LAYOUTS[activeKeyboardSize] ?? PIANO_LAYOUTS[88];
}

function getCurrentLayoutBounds() {
  const layout = getCurrentLayout();
  return { startMidi: layout.startMidi, endMidi: layout.endMidi, keyCount: layout.endMidi - layout.startMidi + 1 };
}

function isBlackKey(midiNote) {
  return [1, 3, 6, 8, 10].includes(midiNote % 12);
}

function createShortcutMap() {
  const map = new Map();
  const centerWhiteMidi = 60 + (shortcutOctaveShift * 12);
  const centerBlackMidi = 61 + (shortcutOctaveShift * 12);
  const getPreviousWhiteMidi = (midiNote) => {
    let cursor = midiNote - 1;
    while (isBlackKey(cursor)) {
      cursor -= 1;
    }
    return cursor;
  };
  const getNextWhiteMidi = (midiNote) => {
    let cursor = midiNote + 1;
    while (isBlackKey(cursor)) {
      cursor += 1;
    }
    return cursor;
  };
  const getPreviousBlackMidi = (midiNote) => {
    let cursor = midiNote - 1;
    while (!isBlackKey(cursor)) {
      cursor -= 1;
    }
    return cursor;
  };
  const getNextBlackMidi = (midiNote) => {
    let cursor = midiNote + 1;
    while (!isBlackKey(cursor)) {
      cursor += 1;
    }
    return cursor;
  };

  map.set(PIANO_SHORTCUTS.whiteCenter, centerWhiteMidi);
  map.set(PIANO_SHORTCUTS.blackCenter, centerBlackMidi);

  let whiteLeftMidi = centerWhiteMidi;
  [...PIANO_SHORTCUTS.whiteLeft].forEach((shortcut) => {
    whiteLeftMidi = getPreviousWhiteMidi(whiteLeftMidi);
    map.set(shortcut, whiteLeftMidi);
  });

  let whiteRightMidi = centerWhiteMidi;
  [...PIANO_SHORTCUTS.whiteRight].forEach((shortcut) => {
    whiteRightMidi = getNextWhiteMidi(whiteRightMidi);
    map.set(shortcut, whiteRightMidi);
  });

  let blackLeftMidi = centerBlackMidi;
  [...PIANO_SHORTCUTS.blackLeft].forEach((shortcut) => {
    blackLeftMidi = getPreviousBlackMidi(blackLeftMidi);
    map.set(shortcut, blackLeftMidi);
  });

  let blackRightMidi = centerBlackMidi;
  [...PIANO_SHORTCUTS.blackRight].forEach((shortcut) => {
    blackRightMidi = getNextBlackMidi(blackRightMidi);
    map.set(shortcut, blackRightMidi);
  });

  return map;
}

function toPitchClass(midiNote) {
  return ((midiNote % 12) + 12) % 12;
}

function tuningRatio12Tet(midiNote) {
  return 2 ** ((midiNote - 69) / 12);
}

function tuningRatioJustIntonation(midiNote) {
  const ratiosByPitchClass = [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8];
  const distanceFromC4 = midiNote - REFERENCE_C4_MIDI;
  const octaveShift = Math.floor(distanceFromC4 / 12);
  const pitchRatio = ratiosByPitchClass[toPitchClass(midiNote)];
  return pitchRatio * (2 ** octaveShift);
}

function tuningRatioPythagorean(midiNote) {
  const ratiosByPitchClass = [1, 256 / 243, 9 / 8, 32 / 27, 81 / 64, 4 / 3, 729 / 512, 3 / 2, 128 / 81, 27 / 16, 16 / 9, 243 / 128];
  const distanceFromC4 = midiNote - REFERENCE_C4_MIDI;
  const octaveShift = Math.floor(distanceFromC4 / 12);
  const pitchRatio = ratiosByPitchClass[toPitchClass(midiNote)];
  return pitchRatio * (2 ** octaveShift);
}

function ratioToFrequency(ratio, baseFrequency = 440) {
  return baseFrequency * ratio;
}

function builtinFrequencyForMidi(midiNote) {
  if (activeInstrument === 'builtin-just') {
    return ratioToFrequency(tuningRatioJustIntonation(midiNote), REFERENCE_C4_FREQUENCY);
  }
  if (activeInstrument === 'builtin-pythagorean') {
    return ratioToFrequency(tuningRatioPythagorean(midiNote), REFERENCE_C4_FREQUENCY);
  }
  return ratioToFrequency(tuningRatio12Tet(midiNote));
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
  pianoMasterGain.gain.value = 0.25;
  pianoDynamicsCompressor = pianoAudioContext.createDynamicsCompressor();
  pianoDynamicsCompressor.threshold.value = -18;
  pianoDynamicsCompressor.knee.value = 24;
  pianoDynamicsCompressor.ratio.value = 12;
  pianoDynamicsCompressor.attack.value = 0.003;
  pianoDynamicsCompressor.release.value = 0.25;
  pianoMasterGain.connect(pianoDynamicsCompressor);
  pianoDynamicsCompressor.connect(pianoAudioContext.destination);
  return pianoAudioContext;
}

function ensureToneAvailable() {
  return Boolean(window.Tone);
}

async function ensureToneStarted() {
  if (!ensureToneAvailable()) return;
  await window.Tone.start();
}

function isDownloadedSamplerInstrument(config) {
  return config?.kind === 'sampler' || config?.kind === 'berklee-sampler' || config?.kind === 'tonejs-instruments';
}

function minifyStepBySampleCount(sampleCount) {
  if (sampleCount >= 49) return 6;
  if (sampleCount >= 33) return 4;
  if (sampleCount >= 17) return 2;
  return 1;
}

function minifySamplerEntries(entries) {
  if (!pianoQuickLoadEnabled) {
    return entries;
  }
  const step = minifyStepBySampleCount(entries.length);
  if (step <= 1) {
    return entries;
  }
  return entries.filter((_, index) => index % step === 0);
}

function toToneSamplerNote(fileName) {
  const baseName = fileName.replace(/\.[^.]+$/u, '');
  return baseName.replace(/^([A-G])s(-?\d+)$/u, '$1#$2');
}

function buildToneSamplerUrlsFromFileNames(fileNames) {
  const urlEntries = fileNames
    .filter((name) => /\.mp3$/iu.test(name))
    .map((name) => [toToneSamplerNote(name), name]);
  const reducedEntries = minifySamplerEntries(urlEntries);
  const urls = {};
  reducedEntries.forEach(([noteName, fileName]) => {
    urls[noteName] = fileName;
  });
  return urls;
}

async function getTonejsInstrumentSampleFiles(instrumentName) {
  if (tonejsInstrumentSampleFiles.has(instrumentName)) {
    return tonejsInstrumentSampleFiles.get(instrumentName);
  }
  const response = await fetch(`${TONEJS_INSTRUMENTS_CONTENTS_API}/${instrumentName}`);
  if (!response.ok) {
    throw new Error(`tonejs-instruments 音色清單讀取失敗：${instrumentName}`);
  }
  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error(`tonejs-instruments 音色清單格式錯誤：${instrumentName}`);
  }
  const fileNames = payload
    .filter((item) => item && item.type === 'file' && typeof item.name === 'string' && /\.mp3$/iu.test(item.name))
    .map((item) => item.name);
  if (fileNames.length === 0) {
    throw new Error(`tonejs-instruments 沒有可用的樣本檔：${instrumentName}`);
  }
  tonejsInstrumentSampleFiles.set(instrumentName, fileNames);
  return fileNames;
}

function createTonePianoSampler() {
  const urls = buildToneSamplerUrlsFromFileNames([
    'C1.mp3',
    'A1.mp3',
    'C2.mp3',
    'A2.mp3',
    'C3.mp3',
    'A3.mp3',
    'C4.mp3',
    'A4.mp3',
    'C5.mp3',
    'A5.mp3',
    'C6.mp3',
    'A6.mp3',
    'C7.mp3',
    'A7.mp3',
    'C8.mp3',
  ]);
  return new window.Tone.Sampler({
    urls,
    baseUrl: 'https://tonejs.github.io/audio/salamander/',
  }).toDestination();
}

function createBerkleeSampler(sampleUrl) {
  return new window.Tone.Sampler({
    urls: {
      C4: sampleUrl,
    },
  }).toDestination();
}

function routeToDestination(node) {
  if (!node) return node;
  if (typeof node.toDestination === 'function') {
    return node.toDestination();
  }
  if (typeof node.toMaster === 'function') {
    return node.toMaster();
  }
  return node;
}

function createTonePolySynth(synthType, synthOptions = {}) {
  const SynthClass = window.Tone?.[synthType];
  if (typeof SynthClass !== 'function') {
    throw new Error(`Tone.js 無法建立 ${synthType}`);
  }
  return routeToDestination(new window.Tone.PolySynth(SynthClass, synthOptions));
}

async function createTonejsInstrumentSampler(instrumentName) {
  const manifest = TONEJS_INSTRUMENTS[instrumentName];
  if (!manifest) {
    throw new Error(`tonejs-instruments 不支援音色：${instrumentName}`);
  }
  const files = await getTonejsInstrumentSampleFiles(instrumentName);
  const urls = buildToneSamplerUrlsFromFileNames(files);
  const node = new window.Tone.Sampler({
    urls,
    baseUrl: `${TONEJS_INSTRUMENTS_BASE_URL}${instrumentName}/`,
  });
  if (typeof node.triggerAttack !== 'function') {
    throw new Error(`tonejs-instruments 音色 ${instrumentName} 載入失敗`);
  }
  return routeToDestination(node);
}

async function getInstrumentNode(instrument) {
  const config = INSTRUMENT_LIBRARY[instrument];
  if (!config || config.kind === 'builtin') {
    return null;
  }
  if (!ensureToneAvailable()) {
    throw new Error('Tone.js 載入失敗');
  }
  const nodeCacheKey = isDownloadedSamplerInstrument(config)
    ? `${instrument}::${pianoQuickLoadEnabled ? 'quick' : 'full'}`
    : instrument;
  if (instrumentNodes.has(nodeCacheKey)) {
    return instrumentNodes.get(nodeCacheKey);
  }
  let node = null;
  if (config.kind === 'sampler') {
    node = createTonePianoSampler();
  } else if (config.kind === 'tone-poly') {
    node = createTonePolySynth(config.synthType, config.synthOptions);
  } else if (config.kind === 'tonejs-instruments') {
    node = await createTonejsInstrumentSampler(config.instrumentName);
  } else if (config.kind === 'berklee-sampler') {
    node = createBerkleeSampler(config.sampleUrl);
  }
  await window.Tone.loaded();
  if (node) {
    instrumentNodes.set(nodeCacheKey, node);
  }
  return node;
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
  oscillator.frequency.value = builtinFrequencyForMidi(midiNote);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.45 * DEFAULT_VELOCITY, context.currentTime + 0.015);
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

async function noteOn(midiNote) {
  const config = INSTRUMENT_LIBRARY[activeInstrument];
  const instrumentAtStart = activeInstrument;
  if (config && config.kind !== 'builtin') {
    try {
      await ensureToneStarted();
      const node = await getInstrumentNode(activeInstrument);
      const tokens = heldNoteTokens.get(midiNote);
      if (!tokens || tokens.size === 0 || activeInstrument !== instrumentAtStart) {
        return;
      }
      const noteName = window.Tone?.Frequency(midiNote, 'midi').toNote();
      if (node && noteName && typeof node.triggerAttack === 'function') {
        node.triggerAttack(noteName);
        activeNotes.set(`tone-${midiNote}`, {
          node,
          noteName,
          kind: config.kind,
        });
        return;
      }
    } catch (error) {
      // Fallback to built-in synth
    }
  }
  const tokens = heldNoteTokens.get(midiNote);
  if (!tokens || tokens.size === 0 || activeInstrument !== instrumentAtStart) {
    return;
  }
  noteOnSynth(midiNote);
}

function noteOff(midiNote) {
  const activeToneNote = activeNotes.get(`tone-${midiNote}`);
  if (activeToneNote) {
    const { node, noteName } = activeToneNote;
    if (node && typeof node.triggerRelease === 'function') {
      node.triggerRelease(noteName);
      activeNotes.delete(`tone-${midiNote}`);
      return;
    }
  }
  noteOffSynth(midiNote);
}

function stopAllPlayingNotes() {
  heldNoteTokens.clear();
  const toneEntries = [];
  const synthMidiNotes = [];
  activeNotes.forEach((value, key) => {
    if (key.startsWith('tone-')) {
      toneEntries.push(value);
      return;
    }
    if (key.startsWith('synth-')) {
      const midi = Number.parseInt(key.replace('synth-', ''), 10);
      if (Number.isFinite(midi)) {
        synthMidiNotes.push(midi);
      }
    }
  });

  toneEntries.forEach((entry) => {
    if (entry?.node && typeof entry.node.triggerRelease === 'function') {
      entry.node.triggerRelease(entry.noteName);
    }
  });
  synthMidiNotes.forEach((midi) => noteOffSynth(midi));
  activeNotes.clear();
}

function disposeNodeIfPossible(node) {
  if (node && typeof node.dispose === 'function') {
    node.dispose();
  }
}

function clearDownloadedSamplerCache() {
  Array.from(instrumentNodes.keys()).forEach((cacheKey) => {
    if (!cacheKey.includes('::')) {
      return;
    }
    const node = instrumentNodes.get(cacheKey);
    disposeNodeIfPossible(node);
    instrumentNodes.delete(cacheKey);
  });
}

function updateActiveInstrument(instrument) {
  stopAllPlayingNotes();
  activeInstrument = instrument;
  const status = document.getElementById('piano-status');
  const config = INSTRUMENT_LIBRARY[instrument];
  if (!config) {
    status.textContent = '找不到指定音色，已使用內建合成音源（12 平均律）。';
    activeInstrument = 'builtin-12tet';
    return;
  }
  if (config.kind === 'builtin') {
    status.textContent = `使用${config.label}。`;
    return;
  }
  const loadModeText = isDownloadedSamplerInstrument(config)
    ? (pianoQuickLoadEnabled ? '（快速載入）' : '（完整載入）')
    : '';
  if (!ensureToneAvailable()) {
    status.textContent = `Tone.js 載入失敗，改用內建合成音源（12 平均律）。`;
    activeInstrument = 'builtin-12tet';
    return;
  }
  getInstrumentNode(instrument)
    .then(() => {
      if (activeInstrument === instrument) {
        status.textContent = `已載入 ${config.label}${loadModeText}。`;
      }
    })
    .catch(() => {
      if (activeInstrument === instrument) {
        status.textContent = `載入 ${config.label} 失敗，改用內建合成音源（12 平均律）。`;
        activeInstrument = 'builtin-12tet';
      }
    });
  status.textContent = `正在載入 ${config.label}${loadModeText}...`;
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

const heldNoteTokens = new Map();

function holdNote(midiNote, token) {
  const tokens = heldNoteTokens.get(midiNote) || new Set();
  const wasEmpty = tokens.size === 0;
  tokens.add(token);
  heldNoteTokens.set(midiNote, tokens);
  if (wasEmpty) {
    playKey(midiNote);
  }
}

function releaseHeldNote(midiNote, token) {
  const tokens = heldNoteTokens.get(midiNote);
  if (!tokens) return;
  tokens.delete(token);
  if (tokens.size === 0) {
    heldNoteTokens.delete(midiNote);
    stopKey(midiNote);
    return;
  }
  heldNoteTokens.set(midiNote, tokens);
}

function resolveShortcutFromKeyboardEvent(event) {
  if (midiByShortcut.has(event.key)) {
    return event.key;
  }
  const numpadMap = {
    Numpad0: '0',
    Numpad1: '1',
    Numpad2: '2',
    Numpad3: '3',
    Numpad4: '4',
    Numpad5: '5',
    Numpad6: '6',
    Numpad7: '7',
    Numpad8: '8',
    Numpad9: '9',
    NumpadDecimal: '.',
    NumpadAdd: '+',
    NumpadSubtract: '-',
    NumpadMultiply: '*',
    NumpadDivide: '/',
  };
  const mapped = numpadMap[event.code];
  if (mapped && midiByShortcut.has(mapped)) {
    return mapped;
  }
  return null;
}

function isPianoTabActive() {
  return activeTabId === 'tab-piano';
}

function shiftShortcutOctave(direction) {
  const { startMidi, endMidi } = getCurrentLayoutBounds();
  const nextShift = shortcutOctaveShift + direction;
  const nextCenterC = 60 + (nextShift * 12);
  if (nextCenterC < startMidi || nextCenterC > endMidi) {
    return false;
  }
  shortcutOctaveShift = nextShift;
  pressedByKeyboardCode.clear();
  stopAllPlayingNotes();
  refreshShortcutMap();
  renderPianoKeyboard();
  return true;
}

function renderPianoKeyboard() {
  const keyboard = document.getElementById('piano-keyboard');
  if (!keyboard) return;

  keyboard.innerHTML = '';
  keyElementsByMidi.clear();
  const whiteMidiNotes = [];
  const layout = getCurrentLayout();
  const { startMidi, endMidi } = getCurrentLayoutBounds();
  keyboard.setAttribute('aria-label', `${activeKeyboardSize} 鍵鋼琴鍵盤（${layout.label}）`);

  for (let midi = startMidi; midi <= endMidi; midi += 1) {
    if (!isBlackKey(midi)) {
      whiteMidiNotes.push(midi);
      const key = document.createElement('button');
      key.type = 'button';
      key.className = 'piano-key white-key';
      key.dataset.midi = String(midi);
      key.style.left = `calc((100% / var(--white-key-count)) * ${whiteMidiNotes.length - 1})`;
      const shortcut = findShortcutByMidi(midi);
      key.innerHTML = `<span class="key-label bottom">${shortcut}</span>`;
      keyboard.appendChild(key);
      keyElementsByMidi.set(midi, key);
    }
  }

  keyboard.style.setProperty('--white-key-count', String(whiteMidiNotes.length));

  for (let index = 0; index < whiteMidiNotes.length; index += 1) {
    const whiteMidi = whiteMidiNotes[index];
    const blackMidi = whiteMidi + 1;
    if (!isBlackKey(blackMidi) || blackMidi > endMidi) {
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
    blackKey.style.left = `calc((100% / var(--white-key-count)) * ${index + (1 - BLACK_KEY_RATIO / 2)})`;
    keyboard.appendChild(blackKey);
    keyElementsByMidi.set(blackMidi, blackKey);
  }
}

function bindPianoInput() {
  const keyboard = document.getElementById('piano-keyboard');
  const instrumentSelect = document.getElementById('instrument-select');
  const keyboardSizeSelect = document.getElementById('keyboard-size-select');
  const quickLoadToggle = document.getElementById('piano-quick-load');
  const pointerToken = 'pointer';

  const stopPointerNote = () => {
    if (pointerActiveMidi !== null) {
      releaseHeldNote(pointerActiveMidi, pointerToken);
      pointerActiveMidi = null;
    }
  };

  const playFromTarget = (target) => {
    const key = target?.closest('.piano-key');
    if (!key) return;
    const midiNote = Number.parseInt(key.dataset.midi ?? '', 10);
    if (!Number.isFinite(midiNote)) return;
    if (pointerActiveMidi === midiNote) return;
    stopPointerNote();
    pointerActiveMidi = midiNote;
    holdNote(midiNote, pointerToken);
  };

  keyboard.addEventListener('pointerdown', (event) => {
    pointerDown = true;
    const key = event.target.closest('.piano-key');
    if (!key) return;
    playFromTarget(key);
  });

  keyboard.addEventListener('pointermove', (event) => {
    if (!pointerDown) return;
    const targetAtPoint = document.elementFromPoint(event.clientX, event.clientY);
    if (!(targetAtPoint instanceof HTMLElement)) return;
    playFromTarget(targetAtPoint);
  });

  const releasePointer = () => {
    pointerDown = false;
    stopPointerNote();
  };

  keyboard.addEventListener('pointerup', releasePointer);
  keyboard.addEventListener('pointercancel', releasePointer);
  keyboard.addEventListener('pointerleave', () => {
    if (pointerDown) {
      stopPointerNote();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.code === 'ShiftLeft') {
      if (!isPianoTabActive() || event.repeat) return;
      event.preventDefault();
      shiftShortcutOctave(-1);
      return;
    }
    if (event.code === 'ShiftRight') {
      if (!isPianoTabActive() || event.repeat) return;
      event.preventDefault();
      shiftShortcutOctave(1);
      return;
    }
    if (!isPianoTabActive()) {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      return;
    }
    const shortcut = resolveShortcutFromKeyboardEvent(event);
    if (!shortcut) return;
    const midiNote = midiByShortcut.get(shortcut);
    if (!midiNote) return;
    if (event.repeat) return;
    event.preventDefault();
    if (pressedByKeyboardCode.has(event.code)) return;
    pressedByKeyboardCode.set(event.code, midiNote);
    holdNote(midiNote, `kbd:${event.code}`);
  });

  document.addEventListener('keyup', (event) => {
    if (!isPianoTabActive()) {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      return;
    }
    const midiNote = pressedByKeyboardCode.get(event.code);
    if (!midiNote) return;
    pressedByKeyboardCode.delete(event.code);
    releaseHeldNote(midiNote, `kbd:${event.code}`);
  });

  instrumentSelect.addEventListener('change', () => {
    updateActiveInstrument(instrumentSelect.value);
  });

  keyboardSizeSelect.addEventListener('change', () => {
    const nextSize = Number.parseInt(keyboardSizeSelect.value, 10);
    if (!PIANO_LAYOUTS[nextSize]) {
      return;
    }
    activeKeyboardSize = nextSize;
    shortcutOctaveShift = 0;
    pressedByKeyboardCode.clear();
    stopAllPlayingNotes();
    refreshShortcutMap();
    renderPianoKeyboard();
  });

  quickLoadToggle?.addEventListener('change', () => {
    pianoQuickLoadEnabled = Boolean(quickLoadToggle.checked);
    clearDownloadedSamplerCache();
    const currentConfig = INSTRUMENT_LIBRARY[activeInstrument];
    if (currentConfig && isDownloadedSamplerInstrument(currentConfig)) {
      updateActiveInstrument(activeInstrument);
    }
  });
}

function refreshShortcutMap() {
  const { startMidi, endMidi } = getCurrentLayoutBounds();
  const generatedMap = createShortcutMap();
  midiByShortcut.clear();
  generatedMap.forEach((midi, shortcut) => {
    if (midi >= startMidi && midi <= endMidi) {
      midiByShortcut.set(shortcut, midi);
    }
  });
}

function initPiano() {
  const quickLoadToggle = document.getElementById('piano-quick-load');
  pianoQuickLoadEnabled = quickLoadToggle ? quickLoadToggle.checked : true;
  refreshShortcutMap();
  renderPianoKeyboard();
  bindPianoInput();
  updateActiveInstrument(activeInstrument);
}

function createDefaultRule() {
  return {
    search: '',
    replace: '',
    caseSensitive: false,
    wholeWord: false,
    useEscape: false,
    useRegex: false,
    dotMatchesNewline: false,
  };
}

function decodeEscapes(rawText) {
  return rawText
    .replace(/\\\\/g, '\u0000')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\u0000/g, '\\');
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildRuleRegex(rule) {
  const searchSource = rule.useEscape ? decodeEscapes(rule.search) : rule.search;
  if (!searchSource) return null;
  const flags = `g${rule.caseSensitive ? '' : 'i'}${rule.useRegex && rule.dotMatchesNewline ? 's' : ''}`;
  let source = rule.useRegex ? searchSource : escapeRegex(searchSource);
  if (!rule.useRegex && rule.wholeWord) {
    source = `\\b${source}\\b`;
  }
  try {
    return new RegExp(source, flags);
  } catch (_error) {
    return null;
  }
}

function applyRuleToText(text, rule) {
  const regex = buildRuleRegex(rule);
  if (!regex) return text;
  const replacement = rule.useEscape ? decodeEscapes(rule.replace) : rule.replace;
  return text.replace(regex, replacement);
}

function collectRuleMatches(text, rule) {
  const regex = buildRuleRegex(rule);
  if (!regex) return [];
  const matches = [];
  for (const match of text.matchAll(regex)) {
    if (typeof match.index !== 'number') continue;
    matches.push({ start: match.index, end: match.index + match[0].length });
  }
  return matches;
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function readReplacerText(editor) {
  if (editor.dataset.previewSource !== undefined) {
    return editor.dataset.previewSource;
  }
  return editor.innerText.replace(/\r/g, '');
}

function writeReplacerText(editor, text) {
  delete editor.dataset.previewSource;
  editor.textContent = text;
}

function normalizeHighlightRanges(matches, textLength) {
  const sorted = matches
    .filter((item) => item.end > item.start)
    .map((item) => ({
      start: Math.max(0, Math.min(textLength, item.start)),
      end: Math.max(0, Math.min(textLength, item.end)),
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (sorted.length === 0) return [];
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
      continue;
    }
    merged.push(current);
  }
  return merged;
}

function showReplacerHighlights(editor, sourceText, matches) {
  const ranges = normalizeHighlightRanges(matches, sourceText.length);
  if (ranges.length === 0) {
    writeReplacerText(editor, sourceText);
    return;
  }

  let cursor = 0;
  const htmlParts = [];
  ranges.forEach(({ start, end }) => {
    if (start > cursor) {
      htmlParts.push(escapeHtml(sourceText.slice(cursor, start)));
    }
    htmlParts.push(`<mark>${escapeHtml(sourceText.slice(start, end))}</mark>`);
    cursor = end;
  });
  if (cursor < sourceText.length) {
    htmlParts.push(escapeHtml(sourceText.slice(cursor)));
  }

  editor.dataset.previewSource = sourceText;
  editor.innerHTML = htmlParts.join('');
}

function getEditingButton() {
  if (editingButtonIndex === null) {
    return replacerDraft;
  }
  return replacerButtons[editingButtonIndex];
}

function syncRuleOptionAvailability(container) {
  const regexToggle = container.querySelector('[data-option="useRegex"]');
  const wholeWord = container.querySelector('[data-option="wholeWord"]');
  const useEscape = container.querySelector('[data-option="useEscape"]');
  const dotMatches = container.querySelector('[data-option="dotMatchesNewline"]');
  if (!(regexToggle instanceof HTMLInputElement) || !(wholeWord instanceof HTMLInputElement) || !(useEscape instanceof HTMLInputElement) || !(dotMatches instanceof HTMLInputElement)) {
    return;
  }
  const regexEnabled = regexToggle.checked;
  wholeWord.disabled = regexEnabled;
  useEscape.disabled = regexEnabled;
  dotMatches.disabled = !regexEnabled;
  if (regexEnabled) {
    wholeWord.checked = false;
    useEscape.checked = false;
  } else {
    dotMatches.checked = false;
  }
}

function renderReplacerButtons() {
  const wrap = document.getElementById('replacer-buttons');
  const target = document.getElementById('edit-target');
  const deleteButton = document.getElementById('delete-button');
  wrap.innerHTML = '';
  target.innerHTML = '<option value="new">*</option>';

  replacerButtons.forEach((buttonConfig, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = String(index + 1);
    target.appendChild(option);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `replacer-action ${editingButtonIndex === index ? 'editing' : ''}`;
    button.textContent = buttonConfig.name || `按鈕 ${index + 1}`;
    button.addEventListener('click', () => runReplacementButton(index));
    wrap.appendChild(button);
  });

  target.value = editingButtonIndex === null ? 'new' : String(editingButtonIndex);
  deleteButton.disabled = editingButtonIndex === null;
  if (deleteButton.disabled && activeDeleteButtonConfirm) {
    activeDeleteButtonConfirm.remove();
    activeDeleteButtonConfirm = null;
  }
}

function renderRulesEditor() {
  const rulesWrap = document.getElementById('rules-container');
  const nameInput = document.getElementById('edit-button-name');
  const editing = getEditingButton();

  nameInput.value = editing.name ?? '';
  rulesWrap.innerHTML = '';
  activeRemoveConfirmHost = null;

  editing.rules.forEach((rule, ruleIndex) => {
    const item = document.createElement('div');
    item.className = 'rule-item';
    item.innerHTML = `
      <div class="rule-remove-wrap">
        <button type="button" class="remove-rule">X</button>
      </div>
      <div class="rule-fields">
        <input type="text" data-field="search" placeholder="搜尋內容" value="${rule.search.replace(/"/g, '&quot;')}">
        <input type="text" data-field="replace" placeholder="取代為" value="${rule.replace.replace(/"/g, '&quot;')}">
        <div class="rule-options">
          <label><input type="checkbox" data-option="caseSensitive" ${rule.caseSensitive ? 'checked' : ''}>區分大小寫</label>
          <label><input type="checkbox" data-option="wholeWord" ${rule.wholeWord ? 'checked' : ''}>僅符合整個單字</label>
          <label><input type="checkbox" data-option="useEscape" ${rule.useEscape ? 'checked' : ''}>使用跳脫字元</label>
          <label><input type="checkbox" data-option="useRegex" ${rule.useRegex ? 'checked' : ''}>規則表達式</label>
          <label><input type="checkbox" data-option="dotMatchesNewline" ${rule.dotMatchesNewline ? 'checked' : ''}>. 包含換行</label>
        </div>
      </div>
    `;

    const removeButton = item.querySelector('.remove-rule');
    const removeWrap = item.querySelector('.rule-remove-wrap');
    removeButton?.addEventListener('click', () => {
      if (!removeWrap) return;
      if (removeWrap.querySelector('.remove-rule-confirm')) {
        removeWrap.querySelector('.remove-rule-confirm')?.remove();
        activeRemoveConfirmHost = null;
        return;
      }
      if (activeRemoveConfirmHost && activeRemoveConfirmHost !== removeWrap) {
        activeRemoveConfirmHost.querySelector('.remove-rule-confirm')?.remove();
      }
      const confirm = document.createElement('button');
      confirm.type = 'button';
      confirm.className = 'remove-rule-confirm';
      confirm.textContent = 'X';
      confirm.addEventListener('click', () => {
        editing.rules.splice(ruleIndex, 1);
        activeRemoveConfirmHost = null;
        renderRulesEditor();
      });
      removeWrap.appendChild(confirm);
      activeRemoveConfirmHost = removeWrap;
    });

    item.querySelectorAll('[data-field]').forEach((input) => {
      input.addEventListener('input', (event) => {
        const el = event.target;
        if (!(el instanceof HTMLInputElement)) return;
        editing.rules[ruleIndex][el.dataset.field] = el.value;
      });
    });

    item.querySelectorAll('[data-option]').forEach((input) => {
      input.addEventListener('change', (event) => {
        const el = event.target;
        if (!(el instanceof HTMLInputElement)) return;
        editing.rules[ruleIndex][el.dataset.option] = el.checked;
        syncRuleOptionAvailability(item);
      });
    });

    syncRuleOptionAvailability(item);
    rulesWrap.appendChild(item);
  });
}

function resetReplacerEditor() {
  editingButtonIndex = null;
  replacerDraft = { name: '', rules: [] };
  document.getElementById('edit-target').value = 'new';
  renderReplacerButtons();
  renderRulesEditor();
}

function saveEditingButton() {
  const name = document.getElementById('edit-button-name').value.trim();
  const editing = getEditingButton();
  const next = {
    name: name || '未命名按鈕',
    rules: editing.rules.map((rule) => ({ ...rule })),
  };

  replacerButtons.push(next);
  editingButtonIndex = null;
  replacerDraft = { name: '', rules: [] };
  renderReplacerButtons();
  renderRulesEditor();
}

function removeEditingButton() {
  if (editingButtonIndex === null) return;
  replacerButtons.splice(editingButtonIndex, 1);
  editingButtonIndex = null;
  replacerDraft = { name: '', rules: [] };
  renderReplacerButtons();
  renderRulesEditor();
}

function runReplacementButton(buttonIndex) {
  const textEditor = document.getElementById('replacer-text');
  const previewMode = document.getElementById('replacer-preview-toggle').checked;
  const buttonConfig = replacerButtons[buttonIndex];
  if (!buttonConfig || !(textEditor instanceof HTMLDivElement)) return;
  const sourceText = readReplacerText(textEditor);

  if (previewMode) {
    const allMatches = buttonConfig.rules.flatMap((rule) => collectRuleMatches(sourceText, rule));
    showReplacerHighlights(textEditor, sourceText, allMatches);
    textEditor.focus();
    return;
  }

  let nextText = sourceText;
  buttonConfig.rules.forEach((rule) => {
    nextText = applyRuleToText(nextText, rule);
  });
  writeReplacerText(textEditor, nextText);
}

function exportReplacerProfile() {
  const profileInput = document.getElementById('replacer-profile-input');
  profileInput.value = JSON.stringify({ version: 1, buttons: replacerButtons });
}

function importReplacerProfile() {
  const profileInput = document.getElementById('replacer-profile-input');
  if (!profileInput.value.trim()) return;
  try {
    const parsed = JSON.parse(profileInput.value);
    const importedButtons = Array.isArray(parsed.buttons) ? parsed.buttons : [];
    replacerButtons.length = 0;
    importedButtons.forEach((button) => {
      if (!button || !Array.isArray(button.rules)) return;
      replacerButtons.push({
        name: String(button.name ?? '未命名按鈕'),
        rules: button.rules.map((rule) => ({ ...createDefaultRule(), ...rule })),
      });
    });
    resetReplacerEditor();
  } catch (_error) {
    profileInput.focus();
  }
}


function getPasswordSettings() {
  return {
    length: Number.parseInt(document.getElementById('password-length').value, 10),
    lowercase: document.getElementById('password-lowercase').checked,
    uppercase: document.getElementById('password-uppercase').checked,
    digits: document.getElementById('password-digits').checked,
    commonSymbols: document.getElementById('password-common-symbols').checked,
    rareSymbols: document.getElementById('password-rare-symbols').checked,
    excludeAmbiguous: document.getElementById('password-exclude-ambiguous').checked,
  };
}

function buildPasswordCharset(settings) {
  const selectedSets = [];
  if (settings.lowercase) selectedSets.push(PASSWORD_CHARSETS.lowercase);
  if (settings.uppercase) selectedSets.push(PASSWORD_CHARSETS.uppercase);
  if (settings.digits) selectedSets.push(PASSWORD_CHARSETS.digits);
  if (settings.commonSymbols) selectedSets.push(PASSWORD_CHARSETS.commonSymbols);
  if (settings.rareSymbols) selectedSets.push(PASSWORD_CHARSETS.rareSymbols);

  let charset = selectedSets.join('');
  if (settings.excludeAmbiguous) {
    charset = [...charset].filter((char) => !AMBIGUOUS_CHARS.has(char)).join('');
  }
  return charset;
}

function cryptoRandomInt(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 65536) {
    throw new Error('隨機範圍無效。');
  }

  const maxUint = 65536;
  const cutoff = maxUint - (maxUint % maxExclusive);
  const buf = new Uint16Array(1);

  while (true) {
    window.crypto.getRandomValues(buf);
    const value = buf[0];
    if (value < cutoff) {
      return value % maxExclusive;
    }
  }
}

function generatePassword(length, charset) {
  const chars = [...charset];
  const generated = [];
  for (let i = 0; i < length; i += 1) {
    generated.push(chars[cryptoRandomInt(chars.length)]);
  }
  return generated.join('');
}

function updatePasswordStatus(message) {
  document.getElementById('password-status').textContent = message;
}

function handleGeneratePassword() {
  const output = document.getElementById('password-output');
  if (!window.crypto?.getRandomValues) {
    updatePasswordStatus('此瀏覽器不支援加密等級隨機來源。');
    output.value = '';
    return;
  }

  const settings = getPasswordSettings();
  const length = Number.isFinite(settings.length) ? settings.length : NaN;
  const charset = buildPasswordCharset(settings);

  if (!Number.isInteger(length) || length < 4 || length > 256) {
    updatePasswordStatus('請輸入 4 到 256 之間的密碼長度。');
    output.value = '';
    return;
  }

  if (!charset) {
    updatePasswordStatus('請至少啟用一種字元集。');
    output.value = '';
    return;
  }

  output.value = generatePassword(length, charset);
  updatePasswordStatus(`已生成 ${length} 碼密碼（使用加密等級隨機來源）。`);
}

async function handleCopyPassword() {
  const output = document.getElementById('password-output');
  if (!output.value) {
    updatePasswordStatus('目前尚無可複製的密碼。');
    return;
  }

  try {
    await navigator.clipboard.writeText(output.value);
    updatePasswordStatus('密碼已複製到剪貼簿。');
  } catch (_error) {
    updatePasswordStatus('無法自動複製，請手動選取後複製。');
  }
}

function bindPasswordManager() {
  document.getElementById('password-generate').addEventListener('click', handleGeneratePassword);
  document.getElementById('password-copy').addEventListener('click', handleCopyPassword);
}

function parseInvoiceHeaderSpec(rawLine) {
  const [, spec] = rawLine.split('=');
  if (!spec) return null;
  const columns = spec.split('|').map((part) => part.trim()).filter(Boolean);
  if (columns.length === 0) return null;
  const type = columns[0];
  return { type, columns };
}

function parseInvoiceCsv(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headerSpec = {};
  const detailSpec = {};
  const invoices = [];
  const invoicesByNumber = new Map();

  lines.forEach((line) => {
    if (line.startsWith('表頭=')) {
      const spec = parseInvoiceHeaderSpec(line);
      if (spec) spec.columns.forEach((name, index) => { headerSpec[index] = name; });
      return;
    }
    if (line.startsWith('明細=')) {
      const spec = parseInvoiceHeaderSpec(line);
      if (spec) spec.columns.forEach((name, index) => { detailSpec[index] = name; });
      return;
    }

    const cells = line.split('|');
    const kind = cells[0];
    if (kind === 'M') {
      const data = {};
      cells.forEach((cell, index) => {
        const key = headerSpec[index] || `M${index}`;
        data[key] = cell;
      });
      const invoiceNo = data.發票號碼;
      if (!invoiceNo) return;

      const invoice = { header: data, details: [] };
      invoices.push(invoice);
      invoicesByNumber.set(invoiceNo, invoice);
      return;
    }

    if (kind === 'D') {
      const data = {};
      cells.forEach((cell, index) => {
        const key = detailSpec[index] || `D${index}`;
        data[key] = cell;
      });
      const invoiceNo = data.發票號碼;
      const invoice = invoiceNo ? invoicesByNumber.get(invoiceNo) : null;
      if (!invoice) return;
      invoice.details.push(data);
    }
  });

  return { invoices, headerSpec, detailSpec };
}

function parseFormatTemplate(template) {
  const parts = [];
  const regex = /\[([^\]]+)\]/g;
  let lastIndex = 0;
  let match = regex.exec(template);

  while (match) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: decodeEscapedText(template.slice(lastIndex, match.index)) });
    }
    parts.push({ type: 'token', value: match[1].trim() });
    lastIndex = regex.lastIndex;
    match = regex.exec(template);
  }

  if (lastIndex < template.length) {
    parts.push({ type: 'text', value: decodeEscapedText(template.slice(lastIndex)) });
  }

  return parts;
}

function decodeEscapedText(text) {
  return String(text).replace(/\\([\\'"nrtbfv])/g, (_all, token) => {
    const escapeMap = {
      '\\': '\\',
      '\'': '\'',
      '"': '"',
      n: '\n',
      r: '\r',
      t: '\t',
      b: '\b',
      f: '\f',
      v: '\v',
    };
    return escapeMap[token] ?? token;
  });
}

function parseTokenOptions(tokenBody) {
  const tokenMatch = tokenBody.match(/^([^,]+)(?:,\s*'([^']*)')?(?:,\s*(\d+))?$/);
  if (!tokenMatch) return null;
  const field = tokenMatch[1].trim();
  const joiner = tokenMatch[2] === undefined ? undefined : decodeEscapedText(tokenMatch[2]);
  const padDigits = tokenMatch[3] ? Number.parseInt(tokenMatch[3], 10) : null;
  return { field, joiner, padDigits };
}

function parseInvoiceDateParts(rawDate) {
  const dateText = String(rawDate ?? '').trim();
  if (!dateText) return null;

  if (/^\d{8}$/.test(dateText)) {
    return {
      year: Number.parseInt(dateText.slice(0, 4), 10),
      month: Number.parseInt(dateText.slice(4, 6), 10),
      day: Number.parseInt(dateText.slice(6, 8), 10),
    };
  }

  const segments = dateText.match(/\d+/g);
  if (!segments || segments.length < 3) return null;

  const parsedSegments = segments.slice(0, 3).map((value) => ({
    num: Number.parseInt(value, 10),
    len: value.length,
  }));

  let yearIndex = parsedSegments.findIndex((segment) => segment.len === 4 || segment.num > 31);
  if (yearIndex < 0) {
    yearIndex = 2;
  }

  const yearSegment = parsedSegments[yearIndex];
  const year = yearSegment.len === 2
    ? (yearSegment.num >= 70 ? 1900 + yearSegment.num : 2000 + yearSegment.num)
    : yearSegment.num;

  const monthDayCandidates = parsedSegments
    .map((segment, index) => ({ ...segment, index }))
    .filter((segment) => segment.index !== yearIndex);

  if (monthDayCandidates.length !== 2) return null;

  let month;
  let day;
  const [firstCandidate, secondCandidate] = monthDayCandidates;

  if (firstCandidate.num > 12 && secondCandidate.num <= 12) {
    day = firstCandidate.num;
    month = secondCandidate.num;
  } else if (secondCandidate.num > 12 && firstCandidate.num <= 12) {
    month = firstCandidate.num;
    day = secondCandidate.num;
  } else if (yearIndex === 2) {
    day = firstCandidate.num;
    month = secondCandidate.num;
  } else {
    month = firstCandidate.num;
    day = secondCandidate.num;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1) return null;

  return { year, month, day };
}

function applyInvoiceDatePattern(parts, pattern) {
  const formatText = String(pattern ?? '').trim();
  if (!formatText) return '';

  return formatText.replace(/y+|m+|d+/gi, (token) => {
    const lowerToken = token.toLowerCase();
    const count = lowerToken.length;

    if (lowerToken[0] === 'y') {
      if (count >= 4) return String(parts.year).padStart(4, '0');
      if (count === 2) return String(parts.year % 100).padStart(2, '0');
      return String(parts.year);
    }

    if (lowerToken[0] === 'm') {
      return count >= 2 ? String(parts.month).padStart(2, '0') : String(parts.month);
    }

    return count >= 2 ? String(parts.day).padStart(2, '0') : String(parts.day);
  });
}

function formatInvoiceDate(rawDate, dateFormat) {
  const formatToken = String(dateFormat ?? '').trim().toLowerCase();
  if (!formatToken) {
    return String(rawDate ?? '').trim();
  }

  const parts = parseInvoiceDateParts(rawDate);
  if (!parts) return String(rawDate ?? '').trim();

  return applyInvoiceDatePattern(parts, dateFormat);
}

function joinSubtotals(values, joiner) {
  if (joiner !== '+') {
    return values.join(joiner);
  }

  return values.reduce((output, value) => {
    if (!output) return value;
    return value.startsWith('-') ? `${output}${value}` : `${output}+${value}`;
  }, '');
}

function resolveInvoiceField(invoice, field, options, detailFields) {
  const headerValue = invoice.header[field];
  if (field === '發票日期') {
    return formatInvoiceDate(headerValue, options.joiner);
  }

  if (headerValue !== undefined) {
    return String(headerValue);
  }

  const values = detailFields.has(field)
    ? invoice.details.map((detail) => String(detail[field] ?? '')).filter((value) => value !== '')
    : [];
  if (values.length === 0) return '';

  const joiner = options.joiner ?? ' ';
  if (field === '小計') {
    return joinSubtotals(values, joiner);
  }
  return values.join(joiner);
}

function summarizeInvoices(csvText, formatText) {
  const { invoices, detailSpec } = parseInvoiceCsv(csvText);
  const templateParts = parseFormatTemplate(formatText);
  const detailFields = new Set(Object.values(detailSpec));

  return invoices.map((invoice) => templateParts.map((part) => {
    if (part.type === 'text') return part.value;
    const options = parseTokenOptions(part.value);
    if (!options) return '';
    return resolveInvoiceField(invoice, options.field, options, detailFields);
  }).join('')).join('\n');
}

function setInvoiceSummaryStatus(message) {
  document.getElementById('invoice-summary-status').textContent = message;
}

function handleInvoiceSummary() {
  const csvText = document.getElementById('invoice-csv-input').value;
  const formatText = document.getElementById('invoice-format-input').value.trim();
  const output = document.getElementById('invoice-summary-output');

  if (!csvText.trim()) {
    output.value = '';
    setInvoiceSummaryStatus('請先輸入財政部電子發票 CSV 內容。');
    return;
  }
  if (!formatText) {
    output.value = '';
    setInvoiceSummaryStatus('請先指定摘要格式。');
    return;
  }

  const result = summarizeInvoices(csvText, formatText);
  output.value = result;
  setInvoiceSummaryStatus(result ? '摘要完成。' : '找不到可輸出的發票資料。');
}

async function copyInvoiceSummary() {
  const output = document.getElementById('invoice-summary-output');
  if (!output.value) {
    setInvoiceSummaryStatus('目前沒有可複製的摘要內容。');
    return;
  }

  try {
    await navigator.clipboard.writeText(output.value);
    setInvoiceSummaryStatus('摘要已複製到剪貼簿。');
  } catch (error) {
    output.select();
    output.setSelectionRange(0, output.value.length);
    const copied = document.execCommand('copy');
    setInvoiceSummaryStatus(copied ? '摘要已複製到剪貼簿。' : '複製失敗，請手動複製。');
  }
}

function bindTextReplacer() {
  const textEditor = document.getElementById('replacer-text');
  const copyPlainButton = document.getElementById('replacer-copy-plain');
  const previewToggle = document.getElementById('replacer-preview-toggle');
  const editTarget = document.getElementById('edit-target');
  const deleteButton = document.getElementById('delete-button');
  const addRule = document.getElementById('add-rule');
  const saveButton = document.getElementById('save-button');
  const importButton = document.getElementById('replacer-import');
  const exportButton = document.getElementById('replacer-export');
  const editName = document.getElementById('edit-button-name');
  if (!(textEditor instanceof HTMLDivElement) || !(previewToggle instanceof HTMLInputElement) || !(copyPlainButton instanceof HTMLButtonElement)) return;

  const updateCopyPlainState = () => {
    copyPlainButton.disabled = readReplacerText(textEditor).trim().length === 0;
  };

  const syncCopyPlainViewportPosition = () => {
    const editorRect = textEditor.getBoundingClientRect();
    const shouldFix = editorRect.top < 0 && editorRect.bottom > 0;
    copyPlainButton.classList.toggle('is-fixed', shouldFix);
    if (!shouldFix) {
      copyPlainButton.style.left = '';
      return;
    }

    const horizontalInset = 12;
    const buttonLeft = Math.max(8, editorRect.right - copyPlainButton.offsetWidth - horizontalInset);
    copyPlainButton.style.left = `${Math.round(buttonLeft)}px`;
  };

  textEditor.addEventListener('input', updateCopyPlainState);
  const textObserver = new MutationObserver(updateCopyPlainState);
  textObserver.observe(textEditor, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['data-preview-source'],
  });
  window.addEventListener('scroll', syncCopyPlainViewportPosition, { passive: true });
  window.addEventListener('resize', syncCopyPlainViewportPosition);

  copyPlainButton.addEventListener('click', async () => {
    const plainText = readReplacerText(textEditor);
    if (!plainText.trim()) {
      updateCopyPlainState();
      return;
    }

    try {
      await navigator.clipboard.writeText(plainText);
    } catch (_error) {
      const fallback = document.createElement('textarea');
      fallback.value = plainText;
      fallback.setAttribute('readonly', 'true');
      fallback.style.position = 'fixed';
      fallback.style.opacity = '0';
      fallback.style.pointerEvents = 'none';
      document.body.appendChild(fallback);
      fallback.focus();
      fallback.select();
      document.execCommand('copy');
      fallback.remove();
    }
  });

  previewToggle.addEventListener('change', () => {
    const isPreview = previewToggle.checked;
    textEditor.setAttribute('contenteditable', isPreview ? 'false' : 'true');
    textEditor.classList.toggle('is-previewing', isPreview);
    if (!isPreview) {
      writeReplacerText(textEditor, readReplacerText(textEditor));
    }
    updateCopyPlainState();
  });

  editTarget.addEventListener('change', () => {
    const value = editTarget.value;
    editingButtonIndex = value === 'new' ? null : Number.parseInt(value, 10);
    activeDeleteButtonConfirm?.remove();
    activeDeleteButtonConfirm = null;
    renderReplacerButtons();
    renderRulesEditor();
  });

  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (activeRemoveConfirmHost && !activeRemoveConfirmHost.contains(target)) {
      activeRemoveConfirmHost.querySelector('.remove-rule-confirm')?.remove();
      activeRemoveConfirmHost = null;
    }

    if (activeDeleteButtonConfirm && !activeDeleteButtonConfirm.contains(target) && target !== deleteButton) {
      activeDeleteButtonConfirm.remove();
      activeDeleteButtonConfirm = null;
    }
  });

  editName.addEventListener('input', () => {
    const current = getEditingButton();
    current.name = editName.value;
    renderReplacerButtons();
  });

  addRule.addEventListener('click', () => {
    const editing = getEditingButton();
    editing.rules.push(createDefaultRule());
    renderRulesEditor();
  });

  deleteButton.addEventListener('click', () => {
    if (editingButtonIndex === null) return;
    if (activeDeleteButtonConfirm) {
      activeDeleteButtonConfirm.remove();
      activeDeleteButtonConfirm = null;
      return;
    }
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'remove-current-button-confirm';
    confirm.textContent = 'X';
    confirm.addEventListener('click', () => {
      removeEditingButton();
      activeDeleteButtonConfirm = null;
    });
    deleteButton.insertAdjacentElement('afterend', confirm);
    activeDeleteButtonConfirm = confirm;
  });

  saveButton.addEventListener('click', saveEditingButton);
  importButton.addEventListener('click', importReplacerProfile);
  exportButton.addEventListener('click', exportReplacerProfile);

  renderReplacerButtons();
  renderRulesEditor();
  updateCopyPlainState();
  syncCopyPlainViewportPosition();
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
  bindTextReplacer();
  bindPasswordManager();
  document.getElementById('invoice-summarize').addEventListener('click', handleInvoiceSummary);
  document.getElementById('copy-invoice-summary').addEventListener('click', copyInvoiceSummary);

  document.addEventListener('visibilitychange', () => {
    updateDocumentTitle(getCurrentElapsed());
  });
}

window.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  activateTab('tab-stopwatch');
  resetStopwatch();
});
