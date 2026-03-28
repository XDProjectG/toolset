import { convertMidiBufferToAbc } from './midi-to-abc.js';

const BASE_TITLE = '音樂工具箱';

let stopwatchRunning = false;
let stopwatchStartAt = 0;
let elapsedBeforeRun = 0;
let animationFrameId = null;
let activeLap = null;
const laps = [];

let timerIdSeed = 1;
const timers = [];
let timerIntervalId = null;

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
  document.title = `[${formatElapsed(elapsed)}] - ${BASE_TITLE}`;
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
  startTicker();
}

function stopStopwatch() {
  if (!stopwatchRunning) {
    return;
  }

  elapsedBeforeRun = getCurrentElapsed();
  stopwatchRunning = false;
  stopTicker();
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
  if (h > 24) overflowFields.push('h');
  if (m > 60) overflowFields.push('m');
  if (s > 60) overflowFields.push('s');
  return overflowFields;
}

function formatTimerSetting(timer) {
  return timer.anchor
    ? `錨定 ${formatElapsed(timer.targetMs)}`
    : `設定 ${timer.source.h}時 ${timer.source.m}分 ${timer.source.s}秒`;
}

function formatRemaining(timer, nowElapsed) {
  const remainMs = timer.anchor ? Math.max(0, timer.targetMs - nowElapsed) : Math.max(0, timer.endAt - Date.now());
  if (timer.overflowUnit === 's') {
    return `${Math.ceil(remainMs / 1000)} 秒`;
  }
  if (timer.overflowUnit === 'm') {
    return `${Math.ceil(remainMs / 60000)} 分`;
  }
  if (timer.overflowUnit === 'h') {
    return `${Math.ceil(remainMs / 3600000)} 時`;
  }
  return formatElapsed(remainMs);
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

function markTimerComplete(timer) {
  if (timer.done) {
    return;
  }
  timer.done = true;
  playDoneMelody();
  renderTimers();
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
  document.getElementById('timers-list').innerHTML = '';
  ensureTimerSectionVisible();
  document.getElementById('timer-setting-status').textContent = '';
}

function addTimer() {
  const status = document.getElementById('timer-setting-status');
  const anchor = document.getElementById('timer-anchor').checked;
  const source = readDurationInput();

  if (!source.hasAny) {
    status.textContent = '未填入時分秒，已取消本次計時設定。';
    return;
  }

  const overflowFields = getOverflowInfo(source);
  if (overflowFields.length > 1) {
    status.textContent = '僅允許一個欄位溢出，已取消本次計時設定。';
    return;
  }

  const totalMs = (source.h * 3600 + source.m * 60 + source.s) * 1000;
  if (totalMs <= 0) {
    status.textContent = '請輸入大於 0 的計時數值。';
    return;
  }

  if (anchor) {
    if (overflowFields.length > 0) {
      status.textContent = '錨定模式不允許欄位溢出，已取消本次計時設定。';
      return;
    }
    const currentElapsed = getCurrentElapsed();
    if (currentElapsed >= totalMs) {
      status.textContent = '主碼錶已超過錨定時間，已取消本次計時設定。';
      return;
    }
  }

  timers.unshift({
    id: timerIdSeed += 1,
    source,
    anchor,
    overflowUnit: overflowFields[0] ?? null,
    targetMs: anchor ? totalMs : null,
    endAt: anchor ? null : Date.now() + totalMs,
    done: false,
  });

  status.textContent = anchor ? '已新增錨定計時器。' : '已新增獨立倒數計時器。';
  renderTimers();
  ensureTimerTicker();
}

function bindTimerSettings() {
  const toggle = document.getElementById('timer-setting-toggle');
  const panel = document.getElementById('timer-setting-panel');
  const addButton = document.getElementById('timer-add');

  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
  });

  addButton.addEventListener('click', addTimer);

  document.querySelectorAll('[data-preset-minutes]').forEach((button) => {
    button.addEventListener('click', () => {
      document.getElementById('timer-hour').value = '';
      document.getElementById('timer-minute').value = button.dataset.presetMinutes ?? '';
      document.getElementById('timer-second').value = '';
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
}

window.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  activateTab('tab-stopwatch');
  resetStopwatch();
});
