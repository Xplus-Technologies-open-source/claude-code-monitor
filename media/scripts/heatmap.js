/**
 * heatmap.js — File heatmap visualization.
 * Shows which files receive the most attention with heat-colored bars.
 */

// @ts-check

(function () {
  const container = document.getElementById('heatmap-container');
  const emptyState = document.getElementById('heatmap-empty');
  const sortSelect = document.getElementById('heatmap-sort');

  let heatmapData = {};
  let currentSort = 'changes';

  registerModule('heatmap', {
    init() {
      if (sortSelect) {
        sortSelect.addEventListener('change', () => {
          currentSort = sortSelect.value;
          renderHeatmap();
        });
      }
    },

    handleMessage(msg) {
      if (msg.type === 'stats-update' && msg.payload.fileHeatmap) {
        heatmapData = msg.payload.fileHeatmap;
        renderHeatmap();
      }
      if (msg.type === 'session-cleared') {
        heatmapData = {};
        renderHeatmap();
      }
    },
  });

  function renderHeatmap() {
    if (!container) return;

    const entries = Object.values(heatmapData);
    if (entries.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    // Sort
    const sorted = [...entries];
    switch (currentSort) {
      case 'changes':
        sorted.sort((a, b) => b.changeCount - a.changeCount);
        break;
      case 'recent':
        sorted.sort((a, b) => b.lastTouched - a.lastTouched);
        break;
      case 'name':
        sorted.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
        break;
    }

    const maxChanges = Math.max(1, ...sorted.map(e => e.changeCount));

    let html = '';

    // Header
    html += `<div class="heatmap-header">
      <span>File</span>
      <span style="text-align:center">Changes</span>
      <span style="text-align:center">Lines</span>
      <span>Heat</span>
      <span>Activity</span>
      <span style="text-align:right">Time</span>
    </div>`;

    for (const entry of sorted) {
      const heatLevel = getHeatLevel(entry.changeCount);
      const heatClass = `heat-${heatLevel}`;
      const barWidth = Math.max(4, (entry.changeCount / maxChanges) * 100);
      const firstTime = formatTimeShort(entry.firstTouched);
      const lastTime = formatTimeShort(entry.lastTouched);

      // Mini chart - distribute changes over time buckets
      const miniChart = buildMiniChart(entry);

      html += `
        <div class="heatmap-row" data-path="${escapeHtml(entry.relativePath)}" onclick="heatmapClick('${escapeHtml(entry.relativePath)}')">
          <div class="heatmap-file">
            <span class="heatmap-heat-badge ${heatClass}"></span>
            <span class="heatmap-file-name" title="${escapeHtml(entry.relativePath)}">${escapeHtml(entry.relativePath)}</span>
            <span class="heatmap-file-lang" style="background:${entry.languageColor || '#888'}22;color:${entry.languageColor || '#888'}">${escapeHtml(entry.language)}</span>
          </div>
          <div class="heatmap-changes">${entry.changeCount}</div>
          <div class="heatmap-lines">
            <span class="heatmap-lines-plus">+${entry.totalLinesAdded}</span>
            <span class="heatmap-lines-minus">-${entry.totalLinesRemoved}</span>
          </div>
          <div class="heatmap-bar-container">
            <div class="heatmap-bar ${heatClass}" style="width:${barWidth}%"></div>
          </div>
          <div class="heatmap-minichart">${miniChart}</div>
          <div class="heatmap-times">${firstTime} — ${lastTime}</div>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  function getHeatLevel(changes) {
    if (changes >= 10) return 4;
    if (changes >= 6) return 3;
    if (changes >= 3) return 2;
    return 1;
  }

  function buildMiniChart(entry) {
    // Simple: distribute changes evenly into 10 buckets based on time range
    const buckets = 10;
    const bars = new Array(buckets).fill(0);

    // For now, use a simple representation based on change count
    const perBucket = Math.max(1, Math.ceil(entry.changeCount / buckets));
    let remaining = entry.changeCount;
    for (let i = buckets - 1; i >= 0 && remaining > 0; i--) {
      const val = Math.min(remaining, perBucket);
      bars[i] = val;
      remaining -= val;
    }

    const maxBar = Math.max(1, ...bars);
    let html = '';
    for (const val of bars) {
      const h = Math.max(2, (val / maxBar) * 24);
      const heatClass = val > 0 ? `heat-${getHeatLevel(entry.changeCount)}` : '';
      html += `<div class="heatmap-minibar ${heatClass}" style="height:${h}px"></div>`;
    }
    return html;
  }

  function formatTimeShort(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  }

  // Global click handler for heatmap rows
  window.heatmapClick = function (relativePath) {
    // Find events for this file and navigate to diff
    const events = allEvents.filter(e => e.relativePath === relativePath);
    if (events.length > 0) {
      sendMessage({ type: 'request-diff', id: events[events.length - 1].id });
      switchTab('diff');
    }
  };
})();
