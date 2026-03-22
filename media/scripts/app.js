/**
 * app.js — Main Webview orchestrator.
 * Handles tab routing, module registration, message dispatch, and session timer.
 */

// @ts-check
/* global acquireVsCodeApi */

/** @type {ReturnType<typeof acquireVsCodeApi>} */
const vscode = acquireVsCodeApi();

/** @type {Object<string, {init: Function, handleMessage?: Function, destroy?: Function}>} */
const modules = {};

/** @type {Array<Object>} */
let allEvents = [];

/** @type {Object|null} */
let currentSettings = null;

/** @type {Object|null} */
let currentStats = null;

// ─── Module Registration ──────────────────────────────────────────

function registerModule(name, module) {
  modules[name] = module;
  if (module.init) module.init();
}

// ─── Message Handling ─────────────────────────────────────────────

window.addEventListener('message', (event) => {
  const msg = event.data;

  switch (msg.type) {
    case 'file-event':
      allEvents.push(msg.payload);
      break;

    case 'all-events':
      allEvents = msg.payload || [];
      break;

    case 'stats-update':
      currentStats = msg.payload;
      updateSessionTimer(msg.payload.sessionDurationMs);
      break;

    case 'session-cleared':
      allEvents = [];
      currentStats = null;
      break;

    case 'settings-update':
      currentSettings = msg.payload;
      break;

    case 'monitor-paused': {
      const dot = document.getElementById('status-dot');
      const text = document.getElementById('status-text');
      if (dot && text) {
        dot.className = msg.paused ? 'status-dot paused' : 'status-dot active';
        text.textContent = msg.paused ? 'Monitoring paused' : 'Monitoring active';
      }
      break;
    }
  }

  // Dispatch to all modules
  for (const mod of Object.values(modules)) {
    if (mod.handleMessage) {
      mod.handleMessage(msg);
    }
  }
});

// ─── Tab Switching ────────────────────────────────────────────────

const tabButtons = document.querySelectorAll('[data-tab]');
const tabPanels = document.querySelectorAll('.tab-panel');

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const tabId = btn.getAttribute('data-tab');
    switchTab(tabId);
  });
});

function switchTab(tabId) {
  tabButtons.forEach((b) => b.classList.remove('active'));
  tabPanels.forEach((p) => p.classList.remove('active'));

  const activeBtn = document.querySelector(`[data-tab="${tabId}"]`);
  const activePanel = document.getElementById(`tab-${tabId}`);

  if (activeBtn) activeBtn.classList.add('active');
  if (activePanel) activePanel.classList.add('active');
}

// ─── Session Timer ────────────────────────────────────────────────

const timerEl = document.getElementById('session-timer');
let sessionStartTime = Date.now();

function updateSessionTimer(durationMs) {
  if (!timerEl) return;
  const totalSec = Math.floor(durationMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  timerEl.textContent =
    String(h).padStart(2, '0') + ':' +
    String(m).padStart(2, '0') + ':' +
    String(s).padStart(2, '0');
}

// Local timer fallback (updates every second)
setInterval(() => {
  if (currentStats) {
    updateSessionTimer(Date.now() - currentStats.sessionStartTime);
  }
}, 1000);

// ─── Utility Functions (shared across modules) ───────────────────

function formatTime(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function sendMessage(msg) {
  vscode.postMessage(msg);
}

// ─── Request initial data ─────────────────────────────────────────

sendMessage({ type: 'request-all-events' });
sendMessage({ type: 'request-settings' });
