/**
 * diffViewer.js — Side-by-side diff viewer with syntax highlighting.
 * Renders before/after comparison with line numbers and navigation.
 */

// @ts-check

(function () {
  let currentDiffId = null;
  let diffHistory = [];
  let currentIndex = -1;

  const diffHeader = document.getElementById('diff-header');
  const diffContent = document.getElementById('diff-content');
  const diffEmpty = document.getElementById('diff-empty');
  const diffPrev = document.getElementById('diff-prev');
  const diffNext = document.getElementById('diff-next');
  const diffCounter = document.getElementById('diff-counter');
  const diffOpenFile = document.getElementById('diff-open-file');
  const diffCopyDiff = document.getElementById('diff-copy-diff');
  const diffCopyNew = document.getElementById('diff-copy-new');

  registerModule('diffViewer', {
    init() {
      if (diffPrev) diffPrev.addEventListener('click', () => navigateDiff(-1));
      if (diffNext) diffNext.addEventListener('click', () => navigateDiff(1));

      if (diffOpenFile) {
        diffOpenFile.addEventListener('click', () => {
          const event = getCurrentEvent();
          if (event) sendMessage({ type: 'open-file', filePath: event.filePath });
        });
      }

      if (diffCopyDiff) {
        diffCopyDiff.addEventListener('click', () => copyCurrentDiff());
      }

      if (diffCopyNew) {
        diffCopyNew.addEventListener('click', () => copyNewCode());
      }

      // Keyboard navigation
      document.addEventListener('keydown', (e) => {
        const activeTab = document.querySelector('.tab-panel.active');
        if (!activeTab || activeTab.id !== 'tab-diff') return;
        if (e.key === 'ArrowLeft' || e.key === 'k') navigateDiff(-1);
        if (e.key === 'ArrowRight' || e.key === 'j') navigateDiff(1);
      });
    },

    handleMessage(msg) {
      if (msg.type === 'file-event') {
        // Add to diff history
        diffHistory.push(msg.payload);
      }

      if (msg.type === 'all-events') {
        diffHistory = msg.payload || [];
      }

      if (msg.type === 'diff-response') {
        const event = diffHistory.find(e => e.id === msg.payload.id);
        if (event) {
          event.diff = msg.payload.diff;
          currentIndex = diffHistory.indexOf(event);
          renderDiff(event);
        }
      }

      if (msg.type === 'session-cleared') {
        diffHistory = [];
        currentIndex = -1;
        clearDiff();
      }
    },
  });

  // Called externally when clicking a feed item
  window.showDiffForEvent = function (eventId) {
    const idx = diffHistory.findIndex(e => e.id === eventId);
    if (idx >= 0) {
      currentIndex = idx;
      renderDiff(diffHistory[idx]);
    }
  };

  function getCurrentEvent() {
    if (currentIndex >= 0 && currentIndex < diffHistory.length) {
      return diffHistory[currentIndex];
    }
    return null;
  }

  function navigateDiff(direction) {
    const newIndex = currentIndex + direction;
    if (newIndex < 0 || newIndex >= diffHistory.length) return;
    currentIndex = newIndex;
    renderDiff(diffHistory[currentIndex]);
  }

  function updateNavigation() {
    if (diffPrev) diffPrev.disabled = currentIndex <= 0;
    if (diffNext) diffNext.disabled = currentIndex >= diffHistory.length - 1;
    if (diffCounter && currentIndex >= 0) {
      diffCounter.textContent = `${currentIndex + 1} of ${diffHistory.length}`;
    }
  }

  function renderDiff(event) {
    if (!diffContent || !diffHeader) return;
    if (!event || !event.diff) {
      // Request diff data from extension
      if (event) sendMessage({ type: 'request-diff', id: event.id });
      return;
    }

    if (diffEmpty) diffEmpty.classList.add('hidden');

    const diff = event.diff;

    // Header
    const typeIcon = event.type === 'created' ? '+' : event.type === 'deleted' ? '-' : '~';
    diffHeader.innerHTML = `
      <span class="diff-header-file">[${typeIcon}] ${escapeHtml(event.relativePath)}</span>
      <span class="diff-header-stats">
        <span class="diff-header-added">+${diff.linesAdded}</span>
        <span class="diff-header-removed">-${diff.linesRemoved}</span>
        <span class="diff-header-time">${formatTime(event.timestamp)}</span>
      </span>
    `;

    // Content
    if (event.type === 'created' && diff.after !== null) {
      renderFullFile(diff.after, 'created');
    } else if (event.type === 'deleted' && diff.before !== null) {
      renderFullFile(diff.before, 'deleted');
    } else {
      renderSideBySide(diff);
    }

    updateNavigation();
  }

  function renderFullFile(content, type) {
    if (!diffContent) return;
    const lines = content.split('\n');
    let html = `<div class="diff-full-file ${type}">`;

    for (let i = 0; i < lines.length; i++) {
      const lineClass = type === 'created' ? 'added' : 'removed';
      html += `<div class="diff-line ${lineClass}">`;
      html += `<span class="diff-line-number">${i + 1}</span>`;
      html += `<span class="diff-line-content">${highlightSyntax(escapeHtml(lines[i]))}</span>`;
      html += `</div>`;
    }

    html += `</div>`;
    diffContent.innerHTML = html;
  }

  function renderSideBySide(diff) {
    if (!diffContent) return;

    if (!diff.hunks || diff.hunks.length === 0) {
      diffContent.innerHTML = '<div class="empty-state"><p>No changes detected in content</p></div>';
      return;
    }

    let html = '';

    for (const hunk of diff.hunks) {
      html += `<div class="diff-hunk">`;
      html += `<div class="diff-hunk-header">@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@</div>`;
      html += `<div class="diff-sides">`;

      // Left side (old/before)
      html += `<div class="diff-side">`;
      html += `<div class="diff-side-header">Before</div>`;
      for (const line of hunk.lines) {
        if (line.type === 'removed' || line.type === 'context') {
          const cls = line.type === 'removed' ? 'removed' : 'context';
          const num = line.oldLineNumber !== null ? line.oldLineNumber : '';
          html += `<div class="diff-line ${cls}">`;
          html += `<span class="diff-line-number">${num}</span>`;
          html += `<span class="diff-line-content">${highlightSyntax(escapeHtml(line.content))}</span>`;
          html += `</div>`;
        } else if (line.type === 'added') {
          // Empty placeholder line on old side
          html += `<div class="diff-line"><span class="diff-line-number"></span><span class="diff-line-content"></span></div>`;
        }
      }
      html += `</div>`;

      // Right side (new/after)
      html += `<div class="diff-side">`;
      html += `<div class="diff-side-header">After</div>`;
      for (const line of hunk.lines) {
        if (line.type === 'added' || line.type === 'context') {
          const cls = line.type === 'added' ? 'added' : 'context';
          const num = line.newLineNumber !== null ? line.newLineNumber : '';
          html += `<div class="diff-line ${cls}">`;
          html += `<span class="diff-line-number">${num}</span>`;
          html += `<span class="diff-line-content">${highlightSyntax(escapeHtml(line.content))}</span>`;
          html += `</div>`;
        } else if (line.type === 'removed') {
          html += `<div class="diff-line"><span class="diff-line-number"></span><span class="diff-line-content"></span></div>`;
        }
      }
      html += `</div>`;

      html += `</div></div>`; // close diff-sides and diff-hunk
    }

    diffContent.innerHTML = html;
  }

  function clearDiff() {
    if (diffHeader) diffHeader.innerHTML = '';
    if (diffContent) diffContent.innerHTML = '';
    if (diffEmpty) diffEmpty.classList.remove('hidden');
    if (diffCounter) diffCounter.textContent = '';
  }

  function copyCurrentDiff() {
    const event = getCurrentEvent();
    if (!event || !event.diff) return;

    let text = `--- ${event.relativePath}\n+++ ${event.relativePath}\n`;
    for (const hunk of event.diff.hunks) {
      text += `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;
      for (const line of hunk.lines) {
        const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
        text += prefix + line.content + '\n';
      }
    }

    navigator.clipboard.writeText(text);
  }

  function copyNewCode() {
    const event = getCurrentEvent();
    if (!event || !event.diff) return;

    if (event.diff.after !== null) {
      navigator.clipboard.writeText(event.diff.after);
    } else {
      // Extract only added lines
      let lines = [];
      for (const hunk of event.diff.hunks) {
        for (const line of hunk.lines) {
          if (line.type === 'added') lines.push(line.content);
        }
      }
      navigator.clipboard.writeText(lines.join('\n'));
    }
  }

  // ─── Basic Syntax Highlighting ──────────────────────────────────

  const KEYWORDS = /\b(const|let|var|function|class|if|else|for|while|do|switch|case|break|continue|return|import|export|from|default|async|await|try|catch|throw|new|typeof|instanceof|in|of|void|delete|this|super|extends|implements|interface|type|enum|namespace|module|declare|abstract|public|private|protected|static|readonly|override|def|self|None|True|False|lambda|yield|with|as|pass|raise|except|finally|elif|print)\b/g;
  const STRINGS = /(["'`])(?:(?!\1|\\).|\\.)*?\1/g;
  const COMMENTS = /(\/\/.*$|\/\*[\s\S]*?\*\/|#(?!!).*$)/gm;
  const NUMBERS = /\b(\d+\.?\d*(?:e[+-]?\d+)?|0x[0-9a-f]+|0b[01]+|0o[0-7]+)\b/gi;

  function highlightSyntax(html) {
    // Apply in order: comments first (highest priority), then strings, keywords, numbers
    html = html.replace(COMMENTS, '<span class="syntax-comment">$&</span>');
    html = html.replace(STRINGS, '<span class="syntax-string">$&</span>');
    html = html.replace(KEYWORDS, '<span class="syntax-keyword">$&</span>');
    html = html.replace(NUMBERS, '<span class="syntax-number">$&</span>');
    return html;
  }
})();
