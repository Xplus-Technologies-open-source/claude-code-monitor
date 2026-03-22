/**
 * settingsPanel.js — Settings panel controller.
 * Syncs UI toggles/inputs with VS Code extension configuration.
 * Also handles export buttons and session management.
 */

// @ts-check

(function () {
  // Setting elements
  const settingEnabled = document.getElementById('setting-enabled');
  const settingNotifications = document.getElementById('setting-notifications');
  const settingMaxHistory = document.getElementById('setting-max-history');
  const settingIgnoredPaths = document.getElementById('setting-ignored-paths');
  const settingSoundEnabled = document.getElementById('setting-sound-enabled');
  const settingSoundVolume = document.getElementById('setting-sound-volume');
  const settingVolumeDisplay = document.getElementById('setting-volume-display');
  const settingCostModel = document.getElementById('setting-cost-model');

  // Export buttons
  const exportJson = document.getElementById('export-json');
  const exportMarkdown = document.getElementById('export-markdown');
  const exportClipboard = document.getElementById('export-clipboard');

  // Session buttons
  const btnClearHistory = document.getElementById('btn-clear-history');
  const btnResetStats = document.getElementById('btn-reset-stats');

  registerModule('settingsPanel', {
    init() {
      // ─── Toggle: Monitoring enabled ──────────────────────────────
      if (settingEnabled) {
        settingEnabled.addEventListener('change', () => {
          sendMessage({
            type: 'update-setting',
            key: 'enabled',
            value: settingEnabled.checked,
          });
          if (!settingEnabled.checked) {
            sendMessage({ type: 'pause-toggle' });
          }
        });
      }

      // ─── Toggle: Notifications ───────────────────────────────────
      if (settingNotifications) {
        settingNotifications.addEventListener('change', () => {
          sendMessage({
            type: 'update-setting',
            key: 'showNotifications',
            value: settingNotifications.checked,
          });
        });
      }

      // ─── Input: Max history ──────────────────────────────────────
      if (settingMaxHistory) {
        settingMaxHistory.addEventListener('change', () => {
          const val = parseInt(settingMaxHistory.value, 10);
          if (val >= 100 && val <= 50000) {
            sendMessage({
              type: 'update-setting',
              key: 'maxHistoryItems',
              value: val,
            });
          }
        });
      }

      // ─── Input: Ignored paths ────────────────────────────────────
      if (settingIgnoredPaths) {
        let ignoreTimeout = null;
        settingIgnoredPaths.addEventListener('input', () => {
          if (ignoreTimeout) clearTimeout(ignoreTimeout);
          ignoreTimeout = setTimeout(() => {
            const paths = settingIgnoredPaths.value
              .split(',')
              .map(p => p.trim())
              .filter(p => p.length > 0);
            sendMessage({
              type: 'update-setting',
              key: 'ignoredPaths',
              value: paths,
            });
          }, 500);
        });
      }

      // ─── Toggle: Sound enabled ───────────────────────────────────
      if (settingSoundEnabled) {
        settingSoundEnabled.addEventListener('change', () => {
          sendMessage({
            type: 'update-setting',
            key: 'soundEnabled',
            value: settingSoundEnabled.checked,
          });
        });
      }

      // ─── Slider: Sound volume ────────────────────────────────────
      if (settingSoundVolume) {
        settingSoundVolume.addEventListener('input', () => {
          const val = parseInt(settingSoundVolume.value, 10);
          if (settingVolumeDisplay) {
            settingVolumeDisplay.textContent = val + '%';
          }
        });
        settingSoundVolume.addEventListener('change', () => {
          const val = parseInt(settingSoundVolume.value, 10);
          sendMessage({
            type: 'update-setting',
            key: 'soundVolume',
            value: val,
          });
        });
      }

      // ─── Select: Cost model ──────────────────────────────────────
      if (settingCostModel) {
        settingCostModel.addEventListener('change', () => {
          sendMessage({
            type: 'update-setting',
            key: 'tokenCostModel',
            value: settingCostModel.value,
          });
        });
      }

      // ─── Export buttons ──────────────────────────────────────────
      if (exportJson) {
        exportJson.addEventListener('click', () => {
          sendMessage({ type: 'export-log', format: 'json' });
        });
      }

      if (exportMarkdown) {
        exportMarkdown.addEventListener('click', () => {
          sendMessage({ type: 'export-log', format: 'markdown' });
        });
      }

      if (exportClipboard) {
        exportClipboard.addEventListener('click', () => {
          sendMessage({ type: 'export-log', format: 'clipboard' });
          // Visual feedback
          const original = exportClipboard.textContent;
          exportClipboard.textContent = 'Copied!';
          exportClipboard.disabled = true;
          setTimeout(() => {
            exportClipboard.textContent = original;
            exportClipboard.disabled = false;
          }, 1500);
        });
      }

      // ─── Session management ──────────────────────────────────────
      if (btnClearHistory) {
        btnClearHistory.addEventListener('click', () => {
          sendMessage({ type: 'clear-session' });
          // Visual feedback
          btnClearHistory.textContent = 'Cleared!';
          setTimeout(() => {
            btnClearHistory.textContent = 'Clear session history';
          }, 1500);
        });
      }

      if (btnResetStats) {
        btnResetStats.addEventListener('click', () => {
          sendMessage({ type: 'clear-session' });
          btnResetStats.textContent = 'Reset!';
          setTimeout(() => {
            btnResetStats.textContent = 'Reset statistics';
          }, 1500);
        });
      }
    },

    handleMessage(msg) {
      if (msg.type === 'settings-update') {
        applySettings(msg.payload);
      }
    },
  });

  /**
   * Apply settings from extension to UI controls.
   */
  function applySettings(settings) {
    if (settingEnabled) settingEnabled.checked = settings.enabled;
    if (settingNotifications) settingNotifications.checked = settings.showNotifications;
    if (settingMaxHistory) settingMaxHistory.value = String(settings.maxHistoryItems);
    if (settingSoundEnabled) settingSoundEnabled.checked = settings.soundEnabled;

    if (settingSoundVolume) {
      settingSoundVolume.value = String(settings.soundVolume);
      if (settingVolumeDisplay) {
        settingVolumeDisplay.textContent = settings.soundVolume + '%';
      }
    }

    if (settingCostModel) settingCostModel.value = settings.tokenCostModel;

    if (settingIgnoredPaths) {
      settingIgnoredPaths.value = (settings.ignoredPaths || []).join(', ');
    }
  }
})();
