/**
 * ExternalServer — Lightweight HTTP + SSE server.
 * Serves the monitor UI on a local port and streams events via Server-Sent Events.
 * Opens in the default browser so it can be placed on another monitor.
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { ExtensionMessage } from '../types.js';

interface SseClient {
  res: http.ServerResponse;
}

export class ExternalServer {
  private httpServer: http.Server | null = null;
  private clients: Set<SseClient> = new Set();
  private port = 0;
  private mediaPath: string;
  private onClientConnected: (() => void) | null = null;

  constructor(extensionUri: vscode.Uri) {
    this.mediaPath = path.join(extensionUri.fsPath, 'media');
  }

  /**
   * Register a callback for when a new SSE client connects.
   * Used to send initial data (events, stats, settings) to new clients.
   */
  onNewClient(callback: () => void): void {
    this.onClientConnected = callback;
  }

  /**
   * Start the server and open in the default browser.
   */
  async start(): Promise<number> {
    if (this.httpServer) {
      // Already running — just open browser
      await this.openBrowser();
      return this.port;
    }

    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer((req, res) => {
        this.handleHttp(req, res);
      });

      // Listen on random available port
      this.httpServer.listen(0, '127.0.0.1', async () => {
        const addr = this.httpServer!.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
        }

        await this.openBrowser();
        resolve(this.port);
      });

      this.httpServer.on('error', reject);
    });
  }

  /**
   * Send a message to all connected browser clients via SSE.
   */
  broadcast(message: ExtensionMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      try {
        client.res.write(`data: ${data}\n\n`);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  /**
   * Stop the server.
   */
  stop(): void {
    for (const client of this.clients) {
      try { client.res.end(); } catch { /* ignore */ }
    }
    this.clients.clear();
    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = null;
    }
    this.port = 0;
  }

  isRunning(): boolean {
    return this.httpServer !== null;
  }

  getPort(): number {
    return this.port;
  }

  // ─── HTTP Handler ──────────────────────────────────────────────────

  private handleHttp(req: http.IncomingMessage, res: http.ServerResponse): void {
    let urlPath = req.url || '/';
    if (urlPath === '/') urlPath = '/index.html';

    // SSE endpoint
    if (urlPath === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(':ok\n\n');

      const client: SseClient = { res };
      this.clients.add(client);

      // Notify extension to send initial data
      if (this.onClientConnected) {
        setTimeout(() => this.onClientConnected?.(), 100);
      }

      req.on('close', () => {
        this.clients.delete(client);
      });
      return;
    }

    // Serve the external HTML page
    if (urlPath === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(this.getExternalHtml());
      return;
    }

    // Serve media files (CSS, JS)
    const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = path.join(this.mediaPath, safePath);

    // Security: only serve from media directory
    if (!filePath.startsWith(this.mediaPath)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    // Determine content type
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
    };

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
      res.end(data);
    });
  }

  private async openBrowser(): Promise<void> {
    const url = `http://127.0.0.1:${this.port}`;
    // Use xdg-open on Linux, open on Mac, start on Windows
    const { exec } = await import('child_process');
    const platform = process.platform;
    const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${cmd} "${url}"`, (err) => {
      if (err) {
        // Fallback to VS Code's openExternal
        vscode.env.openExternal(vscode.Uri.parse(url));
      }
    });
  }

  // ─── External HTML Page ────────────────────────────────────────────

  private getExternalHtml(): string {
    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Code Monitor</title>
  <link rel="stylesheet" href="/styles/main.css">
  <link rel="stylesheet" href="/styles/diffviewer.css">
  <link rel="stylesheet" href="/styles/stats.css">
  <link rel="stylesheet" href="/styles/heatmap.css">
  <link rel="stylesheet" href="/styles/filetree.css">
  <style>
    :root {
      --vscode-editor-background: #1e1e1e;
      --vscode-editor-foreground: #d4d4d4;
      --vscode-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --vscode-font-size: 13px;
      --vscode-editor-fontFamily: 'Cascadia Code', 'Fira Code', 'Consolas', 'Courier New', monospace;
      --vscode-editor-fontSize: 13px;
      --vscode-tab-inactiveForeground: #888;
      --vscode-tab-activeForeground: #fff;
      --vscode-tab-activeBackground: #1e1e1e;
      --vscode-tab-hoverBackground: rgba(255,255,255,0.05);
      --vscode-editorGroupHeader-tabsBackground: #252526;
      --vscode-editorGroupHeader-tabsBorder: #333;
      --vscode-panel-border: #333;
      --vscode-focusBorder: #007fd4;
      --vscode-statusBar-background: #252526;
      --vscode-statusBar-foreground: #d4d4d4;
      --vscode-descriptionForeground: #888;
      --vscode-editorWidget-background: #252526;
      --vscode-editorWidget-border: #333;
      --vscode-list-hoverBackground: rgba(255,255,255,0.04);
      --vscode-list-activeSelectionBackground: rgba(255,255,255,0.08);
      --vscode-input-background: #3c3c3c;
      --vscode-input-foreground: #d4d4d4;
      --vscode-input-border: #555;
      --vscode-input-placeholderForeground: #666;
      --vscode-dropdown-background: #3c3c3c;
      --vscode-dropdown-foreground: #d4d4d4;
      --vscode-dropdown-border: #555;
      --vscode-button-background: #0078d4;
      --vscode-button-foreground: #fff;
      --vscode-button-hoverBackground: #026ec1;
      --vscode-button-secondaryBackground: #3a3d41;
      --vscode-button-secondaryForeground: #fff;
      --vscode-button-secondaryHoverBackground: #45494e;
      --vscode-editorLineNumber-foreground: #555;
      --vscode-scrollbarSlider-background: rgba(121,121,121,0.4);
      --vscode-scrollbarSlider-hoverBackground: rgba(121,121,121,0.7);
      --vscode-sideBarTitle-foreground: #bbb;
      --vscode-sideBar-background: #252526;
      --vscode-tree-indentGuidesStroke: rgba(255,255,255,0.1);
      --vscode-symbolIcon-folderForeground: #dcb67a;
      --vscode-symbolIcon-fileForeground: #c5c5c5;
      --vscode-editorInfo-foreground: #3794ff;
    }

    body.light-theme {
      --vscode-editor-background: #ffffff;
      --vscode-editor-foreground: #333333;
      --vscode-tab-inactiveForeground: #666;
      --vscode-tab-activeForeground: #333;
      --vscode-tab-activeBackground: #fff;
      --vscode-tab-hoverBackground: rgba(0,0,0,0.04);
      --vscode-editorGroupHeader-tabsBackground: #f3f3f3;
      --vscode-editorGroupHeader-tabsBorder: #ddd;
      --vscode-panel-border: #ddd;
      --vscode-statusBar-background: #f3f3f3;
      --vscode-statusBar-foreground: #333;
      --vscode-descriptionForeground: #666;
      --vscode-editorWidget-background: #f3f3f3;
      --vscode-editorWidget-border: #ddd;
      --vscode-list-hoverBackground: rgba(0,0,0,0.04);
      --vscode-list-activeSelectionBackground: rgba(0,0,0,0.08);
      --vscode-input-background: #fff;
      --vscode-input-foreground: #333;
      --vscode-input-border: #ccc;
      --vscode-input-placeholderForeground: #999;
      --vscode-dropdown-background: #fff;
      --vscode-dropdown-foreground: #333;
      --vscode-dropdown-border: #ccc;
      --vscode-button-secondaryBackground: #e8e8e8;
      --vscode-button-secondaryForeground: #333;
      --vscode-button-secondaryHoverBackground: #ddd;
      --vscode-editorLineNumber-foreground: #999;
      --vscode-scrollbarSlider-background: rgba(0,0,0,0.2);
      --vscode-scrollbarSlider-hoverBackground: rgba(0,0,0,0.4);
      --vscode-sideBarTitle-foreground: #444;
      --vscode-sideBar-background: #f3f3f3;
      --vscode-tree-indentGuidesStroke: rgba(0,0,0,0.1);
      --vscode-symbolIcon-folderForeground: #c69026;
      --vscode-symbolIcon-fileForeground: #555;
    }

    #connection-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      padding: 6px 16px;
      text-align: center;
      font-size: 12px;
      font-weight: 600;
      z-index: 9999;
      transition: all 300ms ease;
    }
    #connection-banner.connected {
      background: rgba(46, 160, 67, 0.15);
      color: #2ea043;
    }
    #connection-banner.disconnected {
      background: rgba(248, 81, 73, 0.15);
      color: #f85149;
    }
    #connection-banner.hidden {
      transform: translateY(-100%);
      opacity: 0;
    }
    body { padding-top: 0; }
    #app { margin-top: 0; }
  </style>
</head>
<body>
  <div id="connection-banner" class="disconnected">Connecting to VS Code...</div>

  <button id="theme-toggle" onclick="document.body.classList.toggle('light-theme'); localStorage.setItem('ccm-theme', document.body.classList.contains('light-theme') ? 'light' : 'dark')" style="position:fixed;top:8px;right:12px;z-index:100;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;">Toggle Theme</button>
  <script>if(localStorage.getItem('ccm-theme')==='light')document.body.classList.add('light-theme');</script>

  <div id="app">
    <nav id="tab-bar">
      <button class="tab-btn active" data-tab="feed">
        <span class="tab-icon">&#9998;</span> Live Feed
      </button>
      <button class="tab-btn" data-tab="diff">
        <span class="tab-icon">&#8644;</span> Diff Viewer
      </button>
      <button class="tab-btn" data-tab="stats">
        <span class="tab-icon">&#9733;</span> Stats
      </button>
      <button class="tab-btn" data-tab="heatmap">
        <span class="tab-icon">&#9632;</span> Heatmap
      </button>
      <button class="tab-btn" data-tab="replay">
        <span class="tab-icon">&#9654;</span> Replay
      </button>
      <button class="tab-btn" data-tab="tree">
        <span class="tab-icon">&#128193;</span> File Tree
      </button>
      <button class="tab-btn" data-tab="settings">
        <span class="tab-icon">&#9881;</span> Settings
      </button>
    </nav>

    <div id="monitor-status">
      <span id="status-dot" class="status-dot active"></span>
      <span id="status-text">Monitoring active</span>
      <span id="session-timer">00:00:00</span>
    </div>

    <main id="tab-content">
      <section id="tab-feed" class="tab-panel active">
        <div class="feed-toolbar">
          <div class="feed-filters">
            <input type="text" id="feed-search" class="input-field" placeholder="Filter by filename...">
            <select id="feed-type-filter" class="select-field">
              <option value="all">All types</option>
              <option value="created">Created</option>
              <option value="modified">Modified</option>
              <option value="deleted">Deleted</option>
            </select>
            <select id="feed-lang-filter" class="select-field">
              <option value="all">All languages</option>
            </select>
          </div>
          <div class="feed-actions">
            <button id="feed-autoscroll" class="btn btn-sm active" title="Auto-scroll">Auto-scroll</button>
            <button id="feed-clear" class="btn btn-sm btn-danger" title="Clear feed">Clear</button>
          </div>
        </div>
        <ul id="feed-list" class="feed-list"></ul>
        <div id="feed-empty" class="empty-state">
          <div class="empty-icon">&#128065;</div>
          <h3>Waiting for changes...</h3>
          <p>File changes will appear here in real time as Claude Code works on your project.</p>
        </div>
      </section>

      <section id="tab-diff" class="tab-panel">
        <div id="diff-toolbar" class="diff-toolbar">
          <div class="diff-nav">
            <button id="diff-prev" class="btn btn-sm" disabled>&#8592; Previous</button>
            <span id="diff-counter" class="diff-counter"></span>
            <button id="diff-next" class="btn btn-sm" disabled>Next &#8594;</button>
          </div>
          <div class="diff-actions">
            <button id="diff-open-file" class="btn btn-sm">Open file</button>
            <button id="diff-copy-diff" class="btn btn-sm">Copy diff</button>
            <button id="diff-copy-new" class="btn btn-sm">Copy new code</button>
          </div>
        </div>
        <div id="diff-header" class="diff-header"></div>
        <div id="diff-content" class="diff-content"></div>
        <div id="diff-empty" class="empty-state">
          <div class="empty-icon">&#8644;</div>
          <h3>No diff selected</h3>
          <p>Click on a change in the Live Feed to view its diff here.</p>
        </div>
      </section>

      <section id="tab-stats" class="tab-panel">
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-icon">&#9998;</div><div class="stat-value" id="stat-lines-added">0</div><div class="stat-label">Lines written</div></div>
          <div class="stat-card"><div class="stat-icon">&#128465;</div><div class="stat-value" id="stat-lines-removed">0</div><div class="stat-label">Lines removed</div></div>
          <div class="stat-card"><div class="stat-icon">&#128196;</div><div class="stat-value" id="stat-files-created">0</div><div class="stat-label">Files created</div></div>
          <div class="stat-card"><div class="stat-icon">&#9999;</div><div class="stat-value" id="stat-files-modified">0</div><div class="stat-label">Files modified</div></div>
          <div class="stat-card"><div class="stat-icon">&#128465;</div><div class="stat-value" id="stat-files-deleted">0</div><div class="stat-label">Files deleted</div></div>
          <div class="stat-card"><div class="stat-icon">&#9201;</div><div class="stat-value" id="stat-duration">00:00</div><div class="stat-label">Session duration</div></div>
          <div class="stat-card stat-card-wide"><div class="stat-icon">&#9889;</div><div class="stat-value" id="stat-speed">0</div><div class="stat-label">Lines/min (current) &nbsp;|&nbsp; Peak: <span id="stat-peak-speed">0</span></div></div>
          <div class="stat-card stat-card-wide"><div class="stat-icon">&#128176;</div><div class="stat-value" id="stat-tokens">0 tokens</div><div class="stat-label">Estimated cost: <span id="stat-cost">$0.0000</span> (<span id="stat-model">Sonnet 4</span>)</div><div class="stat-disclaimer">Estimate only, based on code volume</div></div>
        </div>
        <div class="stats-charts">
          <div class="chart-container"><h3 class="chart-title">Activity (last 30 min)</h3><canvas id="activity-chart" width="600" height="200"></canvas></div>
          <div class="chart-container"><h3 class="chart-title">Languages</h3><canvas id="language-chart" width="300" height="300"></canvas><div id="language-legend" class="language-legend"></div></div>
        </div>
      </section>

      <section id="tab-heatmap" class="tab-panel">
        <div class="heatmap-toolbar"><select id="heatmap-sort" class="select-field"><option value="changes">Sort by changes</option><option value="recent">Sort by most recent</option><option value="name">Sort by name</option></select></div>
        <div id="heatmap-container" class="heatmap-container"></div>
        <div id="heatmap-empty" class="empty-state"><div class="empty-icon">&#9632;</div><h3>No file activity yet</h3><p>File heat data will appear here as changes are detected.</p></div>
      </section>

      <section id="tab-replay" class="tab-panel">
        <div class="replay-controls">
          <button id="replay-play" class="btn btn-primary">&#9654; Play</button>
          <button id="replay-pause" class="btn" disabled>&#10074;&#10074; Pause</button>
          <button id="replay-stop" class="btn" disabled>&#9632; Stop</button>
          <div class="replay-speed"><label>Speed:</label><select id="replay-speed-select" class="select-field"><option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="2">2x</option><option value="5">5x</option></select></div>
          <span id="replay-counter" class="replay-counter"></span>
        </div>
        <div id="replay-progress-container" class="replay-progress-container"><input type="range" id="replay-progress" class="replay-progress" min="0" max="100" value="0"><div id="replay-time" class="replay-time"></div></div>
        <div id="replay-diff" class="diff-content"></div>
        <div id="replay-empty" class="empty-state"><div class="empty-icon">&#9654;</div><h3>Session Replay</h3><p>Press Play to replay all file changes in chronological order.</p></div>
      </section>

      <section id="tab-tree" class="tab-panel">
        <div id="file-tree" class="file-tree"></div>
        <div id="tree-empty" class="empty-state"><div class="empty-icon">&#128193;</div><h3>No files touched yet</h3><p>An animated file tree will build as Claude Code creates and modifies files.</p></div>
      </section>

      <section id="tab-settings" class="tab-panel">
        <div class="settings-container">
          <h2 class="settings-title">Settings</h2>
          <div class="settings-group">
            <h3 class="settings-group-title">Export</h3>
            <div class="setting-row">
              <button id="export-json" class="btn">Export session (JSON)</button>
              <button id="export-markdown" class="btn">Export report (Markdown)</button>
              <button id="export-clipboard" class="btn">Copy summary</button>
            </div>
          </div>
          <div class="settings-about">
            <h3 class="settings-group-title">About</h3>
            <p>Claude Code Monitor v0.1.0 — External Window</p>
            <p class="text-muted">Connected to VS Code via SSE</p>
          </div>
        </div>
      </section>
    </main>
  </div>

  <!-- Override acquireVsCodeApi BEFORE app.js loads -->
  <script>
    // In browser mode, acquireVsCodeApi returns a no-op shim.
    // The modules (app.js etc.) call acquireVsCodeApi() which must exist
    // and return an object with postMessage.
    window.acquireVsCodeApi = function() {
      return {
        postMessage: function(msg) {
          console.log('[Claude Monitor] postMessage (no-op in browser):', msg.type || msg);
        }
      };
    };
  </script>

  <script src="/scripts/app.js"></script>
  <script src="/scripts/liveFeed.js"></script>
  <script src="/scripts/diffViewer.js"></script>
  <script src="/scripts/statsPanel.js"></script>
  <script src="/scripts/heatmap.js"></script>
  <script src="/scripts/replay.js"></script>
  <script src="/scripts/fileTree.js"></script>
  <script src="/scripts/soundEngine.js"></script>
  <script src="/scripts/settingsPanel.js"></script>

  <!-- SSE connection to VS Code (replaces WebSocket) -->
  <script>
    (function() {
      var banner = document.getElementById('connection-banner');
      var evtSource = null;
      var reconnectAttempts = 0;

      function connect() {
        console.log('[Claude Monitor] SSE connecting...');
        evtSource = new EventSource('/events');

        evtSource.onopen = function() {
          console.log('[Claude Monitor] SSE connected!');
          reconnectAttempts = 0;
          banner.className = 'connected';
          banner.textContent = 'Connected to VS Code';
          setTimeout(function() { banner.classList.add('hidden'); }, 2000);
        };

        evtSource.onmessage = function(event) {
          try {
            var msg = JSON.parse(event.data);
            // Dispatch to all modules via the same message event they expect
            window.dispatchEvent(new MessageEvent('message', { data: msg }));
          } catch(e) {
            console.error('[Claude Monitor] Bad SSE message:', e);
          }
        };

        evtSource.onerror = function() {
          console.log('[Claude Monitor] SSE error/closed, attempt #' + reconnectAttempts);
          evtSource.close();
          banner.className = 'disconnected';
          banner.textContent = 'Disconnected — reconnecting... (attempt ' + (reconnectAttempts + 1) + ')';
          banner.classList.remove('hidden');

          reconnectAttempts++;
          if (reconnectAttempts < 30) {
            var delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
            setTimeout(connect, delay);
          } else {
            banner.textContent = 'Connection lost — run the command again from VS Code';
          }
        };
      }

      connect();
    })();
  </script>
</body>
</html>`;
  }
}
