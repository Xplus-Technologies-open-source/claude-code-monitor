/**
 * liveFeed.js — Real-time file change feed.
 * Displays all changes with icons, timestamps, line counts, and language badges.
 */

// @ts-check

(function () {
  const MAX_DOM_ITEMS = 500;
  let autoScroll = true;
  let searchFilter = '';
  let typeFilter = 'all';
  let langFilter = 'all';
  const knownLanguages = new Set();

  const feedList = document.getElementById('feed-list');
  const feedEmpty = document.getElementById('feed-empty');
  const searchInput = document.getElementById('feed-search');
  const typeSelect = document.getElementById('feed-type-filter');
  const langSelect = document.getElementById('feed-lang-filter');
  const autoScrollBtn = document.getElementById('feed-autoscroll');
  const clearBtn = document.getElementById('feed-clear');

  registerModule('liveFeed', {
    init() {
      // Auto-scroll toggle
      if (autoScrollBtn) {
        autoScrollBtn.addEventListener('click', () => {
          autoScroll = !autoScroll;
          autoScrollBtn.classList.toggle('active', autoScroll);
        });
      }

      // Clear button
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          sendMessage({ type: 'clear-session' });
        });
      }

      // Search filter
      if (searchInput) {
        searchInput.addEventListener('input', () => {
          searchFilter = searchInput.value.toLowerCase();
          applyFilters();
        });
      }

      // Type filter
      if (typeSelect) {
        typeSelect.addEventListener('change', () => {
          typeFilter = typeSelect.value;
          applyFilters();
        });
      }

      // Language filter
      if (langSelect) {
        langSelect.addEventListener('change', () => {
          langFilter = langSelect.value;
          applyFilters();
        });
      }
    },

    handleMessage(msg) {
      switch (msg.type) {
        case 'file-event':
          addFeedItem(msg.payload);
          break;

        case 'all-events':
          clearFeed();
          if (msg.payload && msg.payload.length > 0) {
            for (const event of msg.payload) {
              addFeedItem(event, false);
            }
          }
          break;

        case 'session-cleared':
          clearFeed();
          break;
      }
    },
  });

  function addFeedItem(event, animate = true) {
    if (!feedList) return;

    // Track language for filter dropdown
    if (event.language && !knownLanguages.has(event.language)) {
      knownLanguages.add(event.language);
      updateLanguageFilter();
    }

    // Hide empty state
    if (feedEmpty) feedEmpty.classList.add('hidden');

    // Create item
    const li = document.createElement('li');
    li.className = 'feed-item' + (animate ? ' recent' : '');
    li.dataset.id = event.id;
    li.dataset.type = event.type;
    li.dataset.language = event.language || '';
    li.dataset.path = (event.relativePath || '').toLowerCase();

    // Event icon
    const iconMap = { created: '+', modified: '~', deleted: '-' };
    const iconEl = document.createElement('span');
    iconEl.className = `feed-event-icon ${event.type}`;
    iconEl.textContent = iconMap[event.type] || '?';

    // Pulse indicator (recent)
    const pulseEl = document.createElement('span');
    if (animate) {
      pulseEl.className = 'feed-pulse';
      setTimeout(() => {
        pulseEl.remove();
        li.classList.remove('recent');
      }, 3000);
    }

    // File path
    const pathEl = document.createElement('span');
    pathEl.className = 'feed-file-path';
    pathEl.textContent = event.relativePath || event.filePath;
    pathEl.title = event.filePath;

    // Language badge
    const langEl = document.createElement('span');
    langEl.className = 'feed-lang-badge';
    langEl.textContent = event.language || '?';
    langEl.style.background = (event.languageColor || '#888') + '22';
    langEl.style.color = event.languageColor || '#888';

    // Line counts
    const linesEl = document.createElement('span');
    linesEl.className = 'feed-lines';
    const added = event.diff ? event.diff.linesAdded : 0;
    const removed = event.diff ? event.diff.linesRemoved : 0;
    linesEl.innerHTML =
      `<span class="feed-lines-added">+${added}</span>` +
      `<span class="feed-lines-removed">-${removed}</span>`;

    // Timestamp
    const timeEl = document.createElement('span');
    timeEl.className = 'feed-timestamp';
    timeEl.textContent = formatTime(event.timestamp);

    // Assemble
    li.appendChild(iconEl);
    if (animate) li.appendChild(pulseEl);
    li.appendChild(pathEl);
    li.appendChild(langEl);
    li.appendChild(linesEl);
    li.appendChild(timeEl);

    // Click handler — navigate to diff viewer
    li.addEventListener('click', () => {
      sendMessage({ type: 'request-diff', id: event.id });
      switchTab('diff');
    });

    // Apply current filters
    if (!matchesFilters(li)) {
      li.style.display = 'none';
    }

    // Prepend (newest first)
    feedList.prepend(li);

    // Cap DOM items
    while (feedList.children.length > MAX_DOM_ITEMS) {
      feedList.removeChild(feedList.lastChild);
    }

    // Auto-scroll
    if (autoScroll && animate) {
      feedList.scrollTop = 0;
    }
  }

  function clearFeed() {
    if (feedList) feedList.innerHTML = '';
    if (feedEmpty) feedEmpty.classList.remove('hidden');
    knownLanguages.clear();
    updateLanguageFilter();
  }

  function matchesFilters(li) {
    const path = li.dataset.path || '';
    const type = li.dataset.type || '';
    const language = li.dataset.language || '';

    if (searchFilter && !path.includes(searchFilter)) return false;
    if (typeFilter !== 'all' && type !== typeFilter) return false;
    if (langFilter !== 'all' && language !== langFilter) return false;

    return true;
  }

  function applyFilters() {
    if (!feedList) return;
    const items = feedList.querySelectorAll('.feed-item');
    let visibleCount = 0;

    items.forEach((item) => {
      const matches = matchesFilters(item);
      item.style.display = matches ? '' : 'none';
      if (matches) visibleCount++;
    });

    if (feedEmpty) {
      feedEmpty.classList.toggle('hidden', visibleCount > 0 || feedList.children.length === 0);
    }
  }

  function updateLanguageFilter() {
    if (!langSelect) return;
    const current = langSelect.value;
    langSelect.innerHTML = '<option value="all">All languages</option>';

    const sorted = [...knownLanguages].sort();
    for (const lang of sorted) {
      const opt = document.createElement('option');
      opt.value = lang;
      opt.textContent = lang;
      langSelect.appendChild(opt);
    }

    langSelect.value = current;
  }
})();
