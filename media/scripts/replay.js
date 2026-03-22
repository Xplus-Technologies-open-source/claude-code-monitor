/**
 * replay.js — Session replay engine.
 * Plays back all file changes chronologically with speed control.
 */

// @ts-check

(function () {
  let events = [];
  let currentIndex = 0;
  let isPlaying = false;
  let speed = 1;
  let timer = null;

  const playBtn = document.getElementById('replay-play');
  const pauseBtn = document.getElementById('replay-pause');
  const stopBtn = document.getElementById('replay-stop');
  const speedSelect = document.getElementById('replay-speed-select');
  const counterEl = document.getElementById('replay-counter');
  const progressBar = document.getElementById('replay-progress');
  const timeEl = document.getElementById('replay-time');
  const replayDiff = document.getElementById('replay-diff');
  const replayEmpty = document.getElementById('replay-empty');

  registerModule('replay', {
    init() {
      if (playBtn) playBtn.addEventListener('click', play);
      if (pauseBtn) pauseBtn.addEventListener('click', pause);
      if (stopBtn) stopBtn.addEventListener('click', stop);

      if (speedSelect) {
        speedSelect.addEventListener('change', () => {
          speed = parseFloat(speedSelect.value) || 1;
        });
      }

      if (progressBar) {
        progressBar.addEventListener('input', () => {
          const idx = Math.floor((parseInt(progressBar.value) / 100) * events.length);
          seekTo(Math.min(idx, events.length - 1));
        });
      }
    },

    handleMessage(msg) {
      if (msg.type === 'all-events') {
        events = msg.payload || [];
        updateUI();
      }
      if (msg.type === 'session-cleared') {
        stop();
        events = [];
        updateUI();
      }
    },
  });

  function play() {
    if (events.length === 0) {
      // Request events
      sendMessage({ type: 'start-replay' });
      return;
    }

    if (currentIndex >= events.length) {
      currentIndex = 0;
    }

    isPlaying = true;
    updateButtons();
    if (replayEmpty) replayEmpty.classList.add('hidden');
    scheduleNext();
  }

  function pause() {
    isPlaying = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    updateButtons();
  }

  function stop() {
    isPlaying = false;
    currentIndex = 0;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (replayDiff) replayDiff.innerHTML = '';
    if (replayEmpty) replayEmpty.classList.remove('hidden');
    updateButtons();
    updateProgress();
  }

  function seekTo(index) {
    if (index < 0 || index >= events.length) return;
    currentIndex = index;
    renderEvent(events[currentIndex]);
    updateProgress();
  }

  function scheduleNext() {
    if (!isPlaying || currentIndex >= events.length) {
      if (currentIndex >= events.length) {
        isPlaying = false;
        updateButtons();
      }
      return;
    }

    const current = events[currentIndex];
    renderEvent(current);
    updateProgress();

    currentIndex++;

    if (currentIndex < events.length) {
      const next = events[currentIndex];
      let delay = (next.timestamp - current.timestamp) / speed;
      // Clamp: min 50ms, max 3000ms
      delay = Math.max(50, Math.min(3000, delay));

      timer = setTimeout(() => scheduleNext(), delay);
    } else {
      // Reached end
      isPlaying = false;
      updateButtons();
    }
  }

  function renderEvent(event) {
    if (!replayDiff) return;

    const diff = event.diff;
    if (!diff) {
      replayDiff.innerHTML = `
        <div class="diff-header">
          <span class="diff-header-file">${escapeHtml(event.relativePath)}</span>
          <span class="diff-header-time">${formatTime(event.timestamp)}</span>
        </div>
        <div class="empty-state"><p>No diff data available</p></div>
      `;
      return;
    }

    const typeIcon = event.type === 'created' ? '+' : event.type === 'deleted' ? '-' : '~';

    let html = `
      <div class="diff-header" style="border-radius:6px 6px 0 0;border:1px solid var(--vscode-panel-border,rgba(255,255,255,0.1))">
        <span class="diff-header-file">[${typeIcon}] ${escapeHtml(event.relativePath)}</span>
        <span class="diff-header-stats">
          <span class="diff-header-added">+${diff.linesAdded}</span>
          <span class="diff-header-removed">-${diff.linesRemoved}</span>
          <span class="diff-header-time">${formatTime(event.timestamp)}</span>
        </span>
      </div>
    `;

    // Render hunks (unified view for replay — simpler)
    html += `<div style="border:1px solid var(--vscode-panel-border,rgba(255,255,255,0.1));border-top:none;border-radius:0 0 6px 6px;overflow:auto;max-height:calc(100vh - 300px)">`;

    if (event.type === 'created' && diff.after !== null) {
      const lines = diff.after.split('\n');
      for (let i = 0; i < lines.length; i++) {
        html += `<div class="diff-line added">
          <span class="diff-line-number">${i + 1}</span>
          <span class="diff-line-content">${escapeHtml(lines[i])}</span>
        </div>`;
      }
    } else if (event.type === 'deleted' && diff.before !== null) {
      const lines = diff.before.split('\n');
      for (let i = 0; i < lines.length; i++) {
        html += `<div class="diff-line removed">
          <span class="diff-line-number">${i + 1}</span>
          <span class="diff-line-content">${escapeHtml(lines[i])}</span>
        </div>`;
      }
    } else {
      for (const hunk of (diff.hunks || [])) {
        html += `<div class="diff-hunk-header">@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@</div>`;
        for (const line of hunk.lines) {
          const cls = line.type === 'added' ? 'added' : line.type === 'removed' ? 'removed' : 'context';
          const num = line.newLineNumber || line.oldLineNumber || '';
          html += `<div class="diff-line ${cls}">
            <span class="diff-line-number">${num}</span>
            <span class="diff-line-content">${escapeHtml(line.content)}</span>
          </div>`;
        }
      }
    }

    html += `</div>`;
    replayDiff.innerHTML = html;
  }

  function updateButtons() {
    if (playBtn) playBtn.disabled = isPlaying;
    if (pauseBtn) pauseBtn.disabled = !isPlaying;
    if (stopBtn) stopBtn.disabled = !isPlaying && currentIndex === 0;
  }

  function updateProgress() {
    if (counterEl) {
      if (events.length > 0) {
        counterEl.textContent = `Change ${Math.min(currentIndex + 1, events.length)} of ${events.length}`;
      } else {
        counterEl.textContent = '';
      }
    }

    if (progressBar && events.length > 0) {
      progressBar.value = String(Math.round((currentIndex / events.length) * 100));
    }

    if (timeEl && events.length > 0 && currentIndex < events.length) {
      timeEl.textContent = formatTime(events[Math.min(currentIndex, events.length - 1)].timestamp);
    }
  }

  function updateUI() {
    updateButtons();
    updateProgress();
    if (events.length === 0 && replayEmpty) {
      replayEmpty.classList.remove('hidden');
    }
  }
})();
