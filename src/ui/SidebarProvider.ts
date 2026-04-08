/**
 * SidebarProvider — Webview view provider for the Activity Bar sidebar.
 * Shows a mini dashboard with quick actions. Click to open the full panel.
 */

import * as vscode from 'vscode';
import type { SessionStats } from '../types.js';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'claude-monitor.sidebarView';
  private view?: vscode.WebviewView;
  private latestStats: SessionStats | null = null;
  private badgeCount = 0;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtml();

    // Handle messages from sidebar webview
    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.type === 'open-panel') {
        vscode.commands.executeCommand('claude-code-monitor.open');
      } else if (msg.type === 'open-external') {
        vscode.commands.executeCommand('claude-code-monitor.openExternal');
      } else if (msg.type === 'pause-toggle') {
        vscode.commands.executeCommand('claude-code-monitor.pause');
      } else if (msg.type === 'clear') {
        vscode.commands.executeCommand('claude-code-monitor.clear');
      }
    });

    // Send initial stats if available
    if (this.latestStats) {
      this.updateStats(this.latestStats);
    }
  }

  /**
   * Update the sidebar with fresh stats.
   */
  updateStats(stats: SessionStats): void {
    this.latestStats = stats;
    if (this.view) {
      this.view.webview.postMessage({ type: 'stats-update', payload: stats });
      // Update badge with total changes count
      if (stats.totalChanges !== this.badgeCount) {
        this.badgeCount = stats.totalChanges;
        this.view.badge = stats.totalChanges > 0
          ? { tooltip: `${stats.totalChanges} changes`, value: stats.totalChanges }
          : undefined;
      }
    }
  }

  /**
   * Notify sidebar of a new file event.
   */
  notifyEvent(eventType: string, fileName: string): void {
    if (this.view) {
      this.view.webview.postMessage({
        type: 'new-event',
        payload: { eventType, fileName },
      });
    }
  }

  private getHtml(): string {
    const nonce = this.getNonce();
    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    style-src 'unsafe-inline';
    script-src 'nonce-${nonce}';
  ">
  <style>
    body {
      padding: 12px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-sideBar-background);
    }
    h3 {
      margin: 0 0 12px 0;
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-sideBarTitle-foreground, var(--vscode-editor-foreground));
    }
    .stats-mini {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 16px;
    }
    .mini-stat {
      background: var(--vscode-editorWidget-background, rgba(255,255,255,0.04));
      border: 1px solid var(--vscode-editorWidget-border, rgba(255,255,255,0.08));
      border-radius: 6px;
      padding: 10px;
      text-align: center;
    }
    .mini-stat-value {
      font-size: 20px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: var(--vscode-editor-foreground);
    }
    .mini-stat-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: var(--vscode-descriptionForeground, #888);
      margin-top: 2px;
    }
    .mini-stat-value.green { color: #2ea043; }
    .mini-stat-value.red { color: #f85149; }
    .mini-stat-value.blue { color: #58a6ff; }
    .recent-event {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 8px;
      margin-bottom: 3px;
      border-radius: 4px;
      font-size: 11px;
      background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.03));
      overflow: hidden;
      animation: slideIn 300ms ease-out;
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .event-icon { width: 16px; text-align: center; flex-shrink: 0; }
    .event-icon.created { color: #2ea043; }
    .event-icon.modified { color: #d29922; }
    .event-icon.deleted { color: #f85149; }
    .event-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--vscode-editor-fontFamily, monospace);
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 16px;
    }
    .btn {
      display: block;
      width: 100%;
      padding: 8px;
      border: none;
      border-radius: 4px;
      font-family: inherit;
      font-size: 12px;
      cursor: pointer;
      text-align: center;
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground, #333);
      color: var(--vscode-button-secondaryForeground, #fff);
    }
    .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground, #444); }
    #recent-list { margin-bottom: 8px; max-height: 200px; overflow-y: auto; }
    .section-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground, #888);
      margin: 12px 0 6px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .status-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 12px;
      font-size: 11px;
    }
    .status-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #2ea043;
      box-shadow: 0 0 4px #2ea043;
    }
    .status-dot.paused { background: #d29922; box-shadow: 0 0 4px #d29922; }
  </style>
</head>
<body>
  <div class="status-bar">
    <span id="status-dot" class="status-dot"></span>
    <span id="status-text">Monitoring active</span>
  </div>

  <div class="stats-mini">
    <div class="mini-stat">
      <div class="mini-stat-value blue" id="s-changes">0</div>
      <div class="mini-stat-label">Changes</div>
    </div>
    <div class="mini-stat">
      <div class="mini-stat-value green" id="s-added">0</div>
      <div class="mini-stat-label">Lines +</div>
    </div>
    <div class="mini-stat">
      <div class="mini-stat-value red" id="s-removed">0</div>
      <div class="mini-stat-label">Lines -</div>
    </div>
    <div class="mini-stat">
      <div class="mini-stat-value" id="s-speed">0</div>
      <div class="mini-stat-label">Lines/min</div>
    </div>
  </div>

  <div class="section-title">Recent Changes</div>
  <div id="recent-list"></div>

  <div class="actions">
    <button class="btn btn-primary" id="btn-open">Open Full Dashboard</button>
    <button class="btn btn-secondary" id="btn-pause">Pause / Resume</button>
    <button class="btn btn-secondary" id="btn-external">Open in Browser (2nd Monitor)</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const MAX_RECENT = 15;
    const recentList = document.getElementById('recent-list');

    document.getElementById('btn-open').addEventListener('click', () => {
      vscode.postMessage({ type: 'open-panel' });
    });
    document.getElementById('btn-pause').addEventListener('click', () => {
      vscode.postMessage({ type: 'pause-toggle' });
    });
    document.getElementById('btn-external').addEventListener('click', () => {
      vscode.postMessage({ type: 'open-external' });
    });

    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'stats-update') {
        const s = msg.payload;
        document.getElementById('s-changes').textContent = String(s.totalChanges);
        document.getElementById('s-added').textContent = String(s.totalLinesAdded);
        document.getElementById('s-removed').textContent = String(s.totalLinesRemoved);
        document.getElementById('s-speed').textContent = String(s.linesPerMinute);
      }
      if (msg.type === 'new-event') {
        const { eventType, fileName } = msg.payload;
        const icons = { created: '+', modified: '~', deleted: '-' };
        const el = document.createElement('div');
        el.className = 'recent-event';
        const iconSpan = document.createElement('span');
        const safeType = ['created', 'modified', 'deleted'].includes(eventType) ? eventType : '';
        iconSpan.className = 'event-icon' + (safeType ? ' ' + safeType : '');
        iconSpan.textContent = icons[eventType] || '?';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'event-name';
        nameSpan.title = fileName;
        nameSpan.textContent = fileName;
        el.appendChild(iconSpan);
        el.appendChild(nameSpan);
        recentList.prepend(el);
        while (recentList.children.length > MAX_RECENT) {
          recentList.removeChild(recentList.lastChild);
        }
      }
    });
  </script>
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
