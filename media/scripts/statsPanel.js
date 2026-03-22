/**
 * statsPanel.js — Live statistics dashboard with animated counters and Canvas charts.
 */

// @ts-check

(function () {
  // Counter elements
  const els = {
    linesAdded: document.getElementById('stat-lines-added'),
    linesRemoved: document.getElementById('stat-lines-removed'),
    filesCreated: document.getElementById('stat-files-created'),
    filesModified: document.getElementById('stat-files-modified'),
    filesDeleted: document.getElementById('stat-files-deleted'),
    duration: document.getElementById('stat-duration'),
    speed: document.getElementById('stat-speed'),
    peakSpeed: document.getElementById('stat-peak-speed'),
    tokens: document.getElementById('stat-tokens'),
    cost: document.getElementById('stat-cost'),
    model: document.getElementById('stat-model'),
  };

  // Canvas
  const activityCanvas = document.getElementById('activity-chart');
  const languageCanvas = document.getElementById('language-chart');
  const legendContainer = document.getElementById('language-legend');

  // Animation state
  const animatedValues = {
    linesAdded: 0,
    linesRemoved: 0,
    filesCreated: 0,
    filesModified: 0,
    filesDeleted: 0,
  };

  registerModule('statsPanel', {
    init() {},

    handleMessage(msg) {
      if (msg.type === 'stats-update') {
        updateStats(msg.payload);
      }
      if (msg.type === 'session-cleared') {
        resetStats();
      }
    },
  });

  function updateStats(stats) {
    // Animate counters
    animateCounter('linesAdded', stats.totalLinesAdded);
    animateCounter('linesRemoved', stats.totalLinesRemoved);
    animateCounter('filesCreated', stats.filesCreated);
    animateCounter('filesModified', stats.filesModified);
    animateCounter('filesDeleted', stats.filesDeleted);

    // Duration
    if (els.duration) {
      els.duration.textContent = formatDuration(stats.sessionDurationMs);
    }

    // Speed
    if (els.speed) {
      els.speed.textContent = String(stats.linesPerMinute);
    }
    if (els.peakSpeed) {
      els.peakSpeed.textContent = String(stats.peakLinesPerMinute);
    }

    // Tokens & cost
    if (els.tokens) {
      els.tokens.textContent = formatNumber(stats.estimatedTokens) + ' tokens';
    }
    if (els.cost) {
      els.cost.textContent = formatCost(stats.estimatedCostUsd);
    }

    // Model name
    if (els.model) {
      const modelMap = { sonnet: 'Sonnet 4', opus: 'Opus 4', haiku: 'Haiku 3.5' };
      if (currentSettings) {
        els.model.textContent = modelMap[currentSettings.tokenCostModel] || 'Sonnet 4';
      }
    }

    // Charts
    drawActivityChart(stats.changeTimeline);
    drawLanguageChart(stats.languageBreakdown);
  }

  function resetStats() {
    for (const key of Object.keys(animatedValues)) {
      animatedValues[key] = 0;
    }
    for (const el of Object.values(els)) {
      if (el && el.id !== 'stat-model') {
        el.textContent = '0';
      }
    }
    if (activityCanvas) {
      const ctx = activityCanvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, activityCanvas.width, activityCanvas.height);
    }
    if (languageCanvas) {
      const ctx = languageCanvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, languageCanvas.width, languageCanvas.height);
    }
    if (legendContainer) legendContainer.innerHTML = '';
  }

  // ─── Animated Counter ──────────────────────────────────────────

  function animateCounter(key, targetValue) {
    const el = els[key];
    if (!el) return;

    const startValue = animatedValues[key];
    if (startValue === targetValue) return;

    const duration = 500;
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      const current = Math.round(startValue + (targetValue - startValue) * eased);

      el.textContent = formatNumber(current);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        animatedValues[key] = targetValue;
        el.classList.remove('animating');
      }
    }

    el.classList.add('animating');
    requestAnimationFrame(step);
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // ─── Activity Bar Chart ─────────────────────────────────────────

  function drawActivityChart(timeline) {
    if (!activityCanvas) return;
    const ctx = activityCanvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = activityCanvas.getBoundingClientRect();
    activityCanvas.width = rect.width * dpr;
    activityCanvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const padding = { top: 10, right: 10, bottom: 30, left: 40 };
    const chartW = W - padding.left - padding.right;
    const chartH = H - padding.top - padding.bottom;

    ctx.clearRect(0, 0, W, H);

    if (!timeline || timeline.length === 0) {
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--vscode-descriptionForeground') || '#888';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No activity data yet', W / 2, H / 2);
      return;
    }

    // Fill 30-minute range
    const now = Math.floor(Date.now() / 60000) * 60000;
    const buckets = [];
    for (let i = 29; i >= 0; i--) {
      const ts = now - i * 60000;
      const entry = timeline.find(t => t.minuteTimestamp === ts);
      buckets.push({
        minute: i,
        count: entry ? entry.changeCount : 0,
        linesAdded: entry ? entry.linesAdded : 0,
        linesRemoved: entry ? entry.linesRemoved : 0,
      });
    }

    const maxVal = Math.max(1, ...buckets.map(b => b.linesAdded + b.linesRemoved));
    const barW = (chartW / 30) - 2;

    // Grid lines
    const fg = getComputedStyle(document.body).getPropertyValue('--vscode-descriptionForeground') || '#888';
    ctx.strokeStyle = fg + '33';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(W - padding.right, y);
      ctx.stroke();
    }

    // Y-axis labels
    ctx.fillStyle = fg;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = Math.round(maxVal * (4 - i) / 4);
      const y = padding.top + (chartH / 4) * i + 3;
      ctx.fillText(String(val), padding.left - 6, y);
    }

    // Bars
    for (let i = 0; i < 30; i++) {
      const b = buckets[i];
      const total = b.linesAdded + b.linesRemoved;
      const barH = (total / maxVal) * chartH;
      const x = padding.left + i * (chartW / 30) + 1;
      const y = padding.top + chartH - barH;

      // Added (green) stacked on removed (red)
      if (b.linesAdded > 0) {
        const addedH = (b.linesAdded / maxVal) * chartH;
        ctx.fillStyle = '#2ea04399';
        ctx.beginPath();
        roundedRect(ctx, x, padding.top + chartH - addedH, barW, addedH, 2);
        ctx.fill();
      }

      if (b.linesRemoved > 0) {
        const removedH = (b.linesRemoved / maxVal) * chartH;
        ctx.fillStyle = '#f8514999';
        ctx.beginPath();
        roundedRect(ctx, x, padding.top + chartH - (b.linesAdded / maxVal) * chartH - removedH, barW, removedH, 2);
        ctx.fill();
      }

      // X-axis label every 5 minutes
      if (i % 5 === 0) {
        ctx.fillStyle = fg;
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`-${29 - i}m`, x + barW / 2, H - 8);
      }
    }
  }

  // ─── Language Donut Chart ───────────────────────────────────────

  function drawLanguageChart(breakdown) {
    if (!languageCanvas || !legendContainer) return;
    const ctx = languageCanvas.getContext('2d');
    if (!ctx) return;

    const entries = Object.values(breakdown || {});
    if (entries.length === 0) {
      const dpr = window.devicePixelRatio || 1;
      languageCanvas.width = 300 * dpr;
      languageCanvas.height = 300 * dpr;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--vscode-descriptionForeground') || '#888';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No language data yet', 150, 150);
      legendContainer.innerHTML = '';
      return;
    }

    // Sort by total lines
    entries.sort((a, b) => (b.linesAdded + b.linesRemoved) - (a.linesAdded + a.linesRemoved));

    const total = entries.reduce((s, e) => s + e.linesAdded + e.linesRemoved, 0);

    const dpr = window.devicePixelRatio || 1;
    const size = 300;
    languageCanvas.width = size * dpr;
    languageCanvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const outerR = 120;
    const innerR = 70;

    let startAngle = -Math.PI / 2;

    for (const entry of entries) {
      const value = entry.linesAdded + entry.linesRemoved;
      const sliceAngle = (value / total) * Math.PI * 2;

      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
      ctx.arc(cx, cy, innerR, startAngle + sliceAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = entry.color || '#888';
      ctx.fill();

      startAngle += sliceAngle;
    }

    // Center text
    const fg = getComputedStyle(document.body).getPropertyValue('--vscode-editor-foreground') || '#fff';
    ctx.fillStyle = fg;
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatNumber(total), cx, cy - 8);
    ctx.font = '11px sans-serif';
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--vscode-descriptionForeground') || '#888';
    ctx.fillText('total lines', cx, cy + 12);

    // Legend
    legendContainer.innerHTML = '';
    for (const entry of entries) {
      const value = entry.linesAdded + entry.linesRemoved;
      const pct = ((value / total) * 100).toFixed(1);

      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `
        <span class="legend-dot" style="background:${entry.color || '#888'}"></span>
        <span class="legend-label">${escapeHtml(entry.language)}</span>
        <span class="legend-count">${pct}%</span>
      `;
      legendContainer.appendChild(item);
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────

  function formatDuration(ms) {
    const s = Math.floor(ms / 1000) % 60;
    const m = Math.floor(ms / 60000) % 60;
    const h = Math.floor(ms / 3600000);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
  }

  function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  function formatCost(usd) {
    if (usd < 0.01) return '$' + usd.toFixed(4);
    return '$' + usd.toFixed(2);
  }

  /** Cross-browser rounded rectangle (fallback for missing CanvasRenderingContext2D.roundRect) */
  function roundedRect(ctx, x, y, w, h, r) {
    if (w < 0 || h < 0) return;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
})();
