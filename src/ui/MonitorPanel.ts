/**
 * MonitorPanel — Singleton Webview panel manager.
 * Handles HTML generation, CSP, message bridging, and lifecycle.
 */

import * as vscode from 'vscode';
import type { ExtensionMessage, WebviewMessage } from '../types.js';

export class MonitorPanel implements vscode.Disposable {
  public static currentPanel: MonitorPanel | undefined;
  private static readonly viewType = 'claudeCodeMonitor';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly disposables: vscode.Disposable[] = [];

  private _onMessage = new vscode.EventEmitter<WebviewMessage>();
  public readonly onMessage = this._onMessage.event;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    // Set webview HTML content
    this.panel.webview.html = this.getHtmlContent();

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => {
        this._onMessage.fire(message);
      },
      null,
      this.disposables
    );

    // Handle panel disposal
    this.panel.onDidDispose(
      () => {
        MonitorPanel.currentPanel = undefined;
        this.dispose();
      },
      null,
      this.disposables
    );
  }

  /**
   * Create or reveal the monitor panel.
   */
  static createOrShow(extensionUri: vscode.Uri): MonitorPanel {
    // If panel already exists, reveal it
    if (MonitorPanel.currentPanel) {
      MonitorPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
      return MonitorPanel.currentPanel;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      MonitorPanel.viewType,
      'Claude Code Monitor',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media'),
        ],
      }
    );

    MonitorPanel.currentPanel = new MonitorPanel(panel, extensionUri);
    return MonitorPanel.currentPanel;
  }

  /**
   * Send a message to the webview.
   * With retainContextWhenHidden, the webview stays alive even when not visible,
   * so we always send messages.
   */
  postMessage(message: ExtensionMessage): void {
    this.panel.webview.postMessage(message);
  }

  /**
   * Check if panel is currently visible.
   */
  isVisible(): boolean {
    return this.panel.visible;
  }

  dispose(): void {
    MonitorPanel.currentPanel = undefined;

    // Dispose panel first (triggers onDidDispose, but currentPanel is already undefined)
    this.panel.dispose();

    // Then clean up internal disposables
    this._onMessage.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) d.dispose();
    }
  }

  // ─── Private: HTML Generation ─────────────────────────────────────

  private getHtmlContent(): string {
    const webview = this.panel.webview;
    const nonce = this.getNonce();

    // Resolve media URIs
    const stylesUri = (file: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'styles', file));
    const scriptsUri = (file: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'scripts', file));

    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    style-src ${webview.cspSource} 'unsafe-inline';
    script-src 'nonce-${nonce}';
    font-src ${webview.cspSource};
    img-src ${webview.cspSource} data:;
  ">
  <link rel="stylesheet" href="${stylesUri('main.css')}">
  <link rel="stylesheet" href="${stylesUri('diffviewer.css')}">
  <link rel="stylesheet" href="${stylesUri('stats.css')}">
  <link rel="stylesheet" href="${stylesUri('heatmap.css')}">
  <link rel="stylesheet" href="${stylesUri('filetree.css')}">
  <title>Claude Code Monitor</title>
</head>
<body>
  <div id="app">
    <!-- Tab Navigation -->
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

    <!-- Status Indicator -->
    <div id="monitor-status">
      <span id="status-dot" class="status-dot active"></span>
      <span id="status-text">Monitoring active</span>
      <span id="session-timer">00:00:00</span>
    </div>

    <!-- Tab Panels -->
    <main id="tab-content">

      <!-- ═══ LIVE FEED ═══ -->
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

      <!-- ═══ DIFF VIEWER ═══ -->
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

      <!-- ═══ STATS ═══ -->
      <section id="tab-stats" class="tab-panel">
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon">&#9998;</div>
            <div class="stat-value" id="stat-lines-added">0</div>
            <div class="stat-label">Lines written</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">&#128465;</div>
            <div class="stat-value" id="stat-lines-removed">0</div>
            <div class="stat-label">Lines removed</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">&#128196;</div>
            <div class="stat-value" id="stat-files-created">0</div>
            <div class="stat-label">Files created</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">&#9999;</div>
            <div class="stat-value" id="stat-files-modified">0</div>
            <div class="stat-label">Files modified</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">&#128465;</div>
            <div class="stat-value" id="stat-files-deleted">0</div>
            <div class="stat-label">Files deleted</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">&#9201;</div>
            <div class="stat-value" id="stat-duration">00:00</div>
            <div class="stat-label">Session duration</div>
          </div>
          <div class="stat-card stat-card-wide">
            <div class="stat-icon">&#9889;</div>
            <div class="stat-value" id="stat-speed">0</div>
            <div class="stat-label">Lines/min (current) &nbsp;|&nbsp; Peak: <span id="stat-peak-speed">0</span></div>
          </div>
          <div class="stat-card stat-card-wide">
            <div class="stat-icon">&#128176;</div>
            <div class="stat-value" id="stat-tokens">0 tokens</div>
            <div class="stat-label">
              Estimated cost: <span id="stat-cost">$0.0000</span>
              (<span id="stat-model">Sonnet 4</span>)
            </div>
            <div class="stat-disclaimer">Estimate only, based on code volume</div>
          </div>
        </div>

        <div class="stats-charts">
          <div class="chart-container">
            <h3 class="chart-title">Activity (last 30 min)</h3>
            <canvas id="activity-chart" width="600" height="200"></canvas>
          </div>
          <div class="chart-container">
            <h3 class="chart-title">Languages</h3>
            <canvas id="language-chart" width="300" height="300"></canvas>
            <div id="language-legend" class="language-legend"></div>
          </div>
        </div>
      </section>

      <!-- ═══ HEATMAP ═══ -->
      <section id="tab-heatmap" class="tab-panel">
        <div class="heatmap-toolbar">
          <select id="heatmap-sort" class="select-field">
            <option value="changes">Sort by changes</option>
            <option value="recent">Sort by most recent</option>
            <option value="name">Sort by name</option>
          </select>
        </div>
        <div id="heatmap-container" class="heatmap-container"></div>
        <div id="heatmap-empty" class="empty-state">
          <div class="empty-icon">&#9632;</div>
          <h3>No file activity yet</h3>
          <p>File heat data will appear here as changes are detected.</p>
        </div>
      </section>

      <!-- ═══ REPLAY ═══ -->
      <section id="tab-replay" class="tab-panel">
        <div class="replay-controls">
          <button id="replay-play" class="btn btn-primary">&#9654; Play</button>
          <button id="replay-pause" class="btn" disabled>&#10074;&#10074; Pause</button>
          <button id="replay-stop" class="btn" disabled>&#9632; Stop</button>
          <div class="replay-speed">
            <label>Speed:</label>
            <select id="replay-speed-select" class="select-field">
              <option value="0.5">0.5x</option>
              <option value="1" selected>1x</option>
              <option value="2">2x</option>
              <option value="5">5x</option>
            </select>
          </div>
          <span id="replay-counter" class="replay-counter"></span>
        </div>
        <div id="replay-progress-container" class="replay-progress-container">
          <input type="range" id="replay-progress" class="replay-progress" min="0" max="100" value="0">
          <div id="replay-time" class="replay-time"></div>
        </div>
        <div id="replay-diff" class="diff-content"></div>
        <div id="replay-empty" class="empty-state">
          <div class="empty-icon">&#9654;</div>
          <h3>Session Replay</h3>
          <p>Press Play to replay all file changes in chronological order.</p>
        </div>
      </section>

      <!-- ═══ FILE TREE ═══ -->
      <section id="tab-tree" class="tab-panel">
        <div id="file-tree" class="file-tree"></div>
        <div id="tree-empty" class="empty-state">
          <div class="empty-icon">&#128193;</div>
          <h3>No files touched yet</h3>
          <p>An animated file tree will build as Claude Code creates and modifies files.</p>
        </div>
      </section>

      <!-- ═══ SETTINGS ═══ -->
      <section id="tab-settings" class="tab-panel">
        <div class="settings-container">
          <h2 class="settings-title">Settings</h2>

          <div class="settings-group">
            <h3 class="settings-group-title">Monitoring</h3>
            <div class="setting-row">
              <label class="setting-label">Active monitoring</label>
              <label class="toggle">
                <input type="checkbox" id="setting-enabled" checked>
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div class="setting-row">
              <label class="setting-label">Show VS Code notifications</label>
              <label class="toggle">
                <input type="checkbox" id="setting-notifications">
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div class="setting-row">
              <label class="setting-label">Max history items</label>
              <input type="number" id="setting-max-history" class="input-field input-number" value="1000" min="100" max="50000" step="100">
            </div>
            <div class="setting-row">
              <label class="setting-label">Ignore paths (comma-separated)</label>
              <input type="text" id="setting-ignored-paths" class="input-field" placeholder="build, coverage, .cache">
            </div>
          </div>

          <div class="settings-group">
            <h3 class="settings-group-title">Sounds</h3>
            <div class="setting-row">
              <label class="setting-label">Enable sounds</label>
              <label class="toggle">
                <input type="checkbox" id="setting-sound-enabled">
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div class="setting-row">
              <label class="setting-label">Volume</label>
              <div class="slider-container">
                <input type="range" id="setting-sound-volume" class="slider" min="0" max="100" value="30">
                <span id="setting-volume-display" class="slider-value">30%</span>
              </div>
            </div>
          </div>

          <div class="settings-group">
            <h3 class="settings-group-title">Token Estimation</h3>
            <div class="setting-row">
              <label class="setting-label">Cost model</label>
              <select id="setting-cost-model" class="select-field">
                <option value="sonnet">Claude Sonnet 4.6 ($3/$15 per M tokens)</option>
                <option value="opus">Claude Opus 4.6 ($5/$25 per M tokens)</option>
                <option value="haiku">Claude Haiku 4.5 ($0.25/$1.25 per M tokens)</option>
              </select>
            </div>
          </div>

          <div class="settings-group">
            <h3 class="settings-group-title">Export</h3>
            <div class="setting-row">
              <button id="export-json" class="btn">Export session (JSON)</button>
              <button id="export-markdown" class="btn">Export report (Markdown)</button>
              <button id="export-clipboard" class="btn">Copy summary</button>
            </div>
          </div>

          <div class="settings-group">
            <h3 class="settings-group-title">Session</h3>
            <div class="setting-row">
              <button id="btn-clear-history" class="btn btn-danger">Clear session history</button>
              <button id="btn-reset-stats" class="btn btn-danger">Reset statistics</button>
            </div>
          </div>

          <div class="settings-about">
            <h3 class="settings-group-title">About</h3>
            <p>Claude Code Monitor v0.1.0</p>
            <p class="text-muted">Real-time file monitoring for Claude Code CLI sessions.</p>
          </div>
        </div>
      </section>

    </main>
  </div>

  <script nonce="${nonce}" src="${scriptsUri('app.js')}"></script>
  <script nonce="${nonce}" src="${scriptsUri('liveFeed.js')}"></script>
  <script nonce="${nonce}" src="${scriptsUri('diffViewer.js')}"></script>
  <script nonce="${nonce}" src="${scriptsUri('statsPanel.js')}"></script>
  <script nonce="${nonce}" src="${scriptsUri('heatmap.js')}"></script>
  <script nonce="${nonce}" src="${scriptsUri('replay.js')}"></script>
  <script nonce="${nonce}" src="${scriptsUri('fileTree.js')}"></script>
  <script nonce="${nonce}" src="${scriptsUri('soundEngine.js')}"></script>
  <script nonce="${nonce}" src="${scriptsUri('settingsPanel.js')}"></script>
</body>
</html>`;
  }

  private getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
      nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
  }
}
