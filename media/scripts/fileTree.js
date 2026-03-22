/**
 * fileTree.js — Animated file tree visualization.
 * Shows workspace files as a tree that animates when files are created/modified/deleted.
 */

// @ts-check

(function () {
  const treeContainer = document.getElementById('file-tree');
  const treeEmpty = document.getElementById('tree-empty');

  // Tree data: nested objects representing directories and files
  // { name: string, type: 'dir'|'file', children?: TreeNode[], changeCount: number, status?: string }
  const treeRoot = { name: '', type: 'dir', children: [], changeCount: 0 };

  registerModule('fileTree', {
    init() {},

    handleMessage(msg) {
      if (msg.type === 'file-event') {
        updateTree(msg.payload);
        renderTree();
      }
      if (msg.type === 'all-events') {
        // Rebuild tree from all events
        resetTree();
        const events = msg.payload || [];
        for (const event of events) {
          updateTree(event, false);
        }
        renderTree();
      }
      if (msg.type === 'session-cleared') {
        resetTree();
        renderTree();
      }
    },
  });

  function resetTree() {
    treeRoot.children = [];
    treeRoot.changeCount = 0;
  }

  function updateTree(event, animate = true) {
    const parts = event.relativePath.split('/');
    let current = treeRoot;

    // Create/traverse directory nodes
    for (let i = 0; i < parts.length - 1; i++) {
      let child = current.children.find(c => c.name === parts[i] && c.type === 'dir');
      if (!child) {
        child = { name: parts[i], type: 'dir', children: [], changeCount: 0 };
        current.children.push(child);
        sortChildren(current);
      }
      child.changeCount++;
      current = child;
    }

    // File node
    const fileName = parts[parts.length - 1];
    let fileNode = current.children.find(c => c.name === fileName && c.type === 'file');

    if (event.type === 'deleted') {
      if (fileNode) {
        fileNode.status = animate ? 'deleted' : 'deleted-static';
        fileNode.changeCount++;
      }
    } else if (event.type === 'created') {
      if (!fileNode) {
        fileNode = {
          name: fileName,
          type: 'file',
          changeCount: 1,
          language: event.language,
          languageColor: event.languageColor,
          status: animate ? 'created' : undefined,
        };
        current.children.push(fileNode);
        sortChildren(current);
      } else {
        fileNode.changeCount++;
        fileNode.status = animate ? 'created' : undefined;
      }
    } else {
      // Modified
      if (!fileNode) {
        fileNode = {
          name: fileName,
          type: 'file',
          changeCount: 1,
          language: event.language,
          languageColor: event.languageColor,
          status: animate ? 'modified' : undefined,
        };
        current.children.push(fileNode);
        sortChildren(current);
      } else {
        fileNode.changeCount++;
        fileNode.status = animate ? 'modified' : undefined;
      }
    }
  }

  function sortChildren(node) {
    node.children.sort((a, b) => {
      // Directories first
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  function renderTree() {
    if (!treeContainer) return;

    if (treeRoot.children.length === 0) {
      treeContainer.innerHTML = '';
      if (treeEmpty) treeEmpty.classList.remove('hidden');
      return;
    }

    if (treeEmpty) treeEmpty.classList.add('hidden');
    treeContainer.innerHTML = renderNode(treeRoot, true);

    // Clear animation statuses after rendering
    clearAnimationStatus(treeRoot);
  }

  function renderNode(node, isRoot = false) {
    if (isRoot) {
      let html = '<ul class="tree-list">';
      for (const child of node.children) {
        html += renderNode(child);
      }
      html += '</ul>';
      return html;
    }

    const isDir = node.type === 'dir';
    const animClass = node.status ? ` anim-${node.status}` : '';
    const deletedClass = node.status === 'deleted' || node.status === 'deleted-static' ? ' deleted' : '';
    const sizeClass = getSizeClass(node.changeCount);

    let html = `<li class="tree-item">`;
    html += `<div class="tree-item-row${animClass}${deletedClass}">`;

    if (isDir) {
      html += `<span class="tree-arrow expanded">&#9654;</span>`;
      html += `<span class="tree-icon tree-icon-folder">&#128193;</span>`;
      html += `<span class="tree-label">${escapeHtml(node.name)}</span>`;
      if (node.changeCount > 0) {
        html += `<span class="tree-badge tree-badge-count">${node.changeCount}</span>`;
      }
    } else {
      html += `<span class="tree-arrow leaf"></span>`;
      html += `<span class="tree-icon tree-icon-file">&#128196;</span>`;
      html += `<span class="tree-label">${escapeHtml(node.name)}</span>`;
      if (node.changeCount > 0) {
        html += `<span class="tree-size-dot ${sizeClass}"></span>`;
        html += `<span class="tree-badge tree-badge-count">${node.changeCount}</span>`;
      }
    }

    html += `</div>`;

    if (isDir && node.children && node.children.length > 0) {
      html += `<ul class="tree-list">`;
      for (const child of node.children) {
        html += renderNode(child);
      }
      html += `</ul>`;
    }

    html += `</li>`;
    return html;
  }

  function getSizeClass(count) {
    if (count >= 10) return 'size-4';
    if (count >= 6) return 'size-3';
    if (count >= 3) return 'size-2';
    return 'size-1';
  }

  function clearAnimationStatus(node) {
    if (node.status && node.status !== 'deleted' && node.status !== 'deleted-static') {
      setTimeout(() => {
        node.status = undefined;
      }, 1000);
    }
    if (node.children) {
      for (const child of node.children) {
        clearAnimationStatus(child);
      }
    }
  }

  // Expand/collapse click handler (delegated)
  if (treeContainer) {
    treeContainer.addEventListener('click', (e) => {
      const row = e.target.closest('.tree-item-row');
      if (!row) return;

      const arrow = row.querySelector('.tree-arrow');
      if (!arrow || arrow.classList.contains('leaf')) return;

      const subList = row.nextElementSibling;
      if (subList && subList.tagName === 'UL') {
        const isExpanded = arrow.classList.contains('expanded');
        arrow.classList.toggle('expanded', !isExpanded);
        subList.style.display = isExpanded ? 'none' : '';
      }
    });
  }
})();
