/**
 * Claude Code Monitor — Extension entry point.
 * Wires FileWatcher → SessionStore → StatsEngine → MonitorPanel/StatusBar.
 */

import * as vscode from 'vscode';
import { FileWatcher } from './core/FileWatcher.js';
import { SessionStore } from './core/SessionStore.js';
import { StatsEngine } from './core/StatsEngine.js';
import { MonitorPanel } from './ui/MonitorPanel.js';
import { StatusBarItem } from './ui/StatusBarItem.js';
import { SidebarProvider } from './ui/SidebarProvider.js';
import { ExternalServer } from './server/ExternalServer.js';
import type { MonitorSettings, CostModel, WebviewMessage } from './types.js';

import * as path from 'path';

let fileWatcher: FileWatcher | undefined;
let sessionStore: SessionStore | undefined;
let statsEngine: StatsEngine | undefined;
let statusBarItem: StatusBarItem | undefined;
let sidebarProvider: SidebarProvider | undefined;
let externalServer: ExternalServer | undefined;
let statsUpdateInterval: ReturnType<typeof setInterval> | undefined;
let autoSaveInterval: ReturnType<typeof setInterval> | undefined;
let sessionStoragePath: string = '';

export function activate(context: vscode.ExtensionContext): void {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return; // No workspace — nothing to monitor
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const config = vscode.workspace.getConfiguration('claude-monitor');

  // ─── Initialize core components ───────────────────────────────────
  const maxHistory = config.get<number>('maxHistoryItems', 1000);
  sessionStore = new SessionStore(maxHistory);

  // Persistence: auto-save path in extension storage
  const sessionsDir = path.join(context.globalStorageUri.fsPath, 'sessions');
  sessionStoragePath = path.join(sessionsDir, 'current-session.json');

  // Try to restore previous session
  if (sessionStore.loadFromDisk(sessionStoragePath)) {
    vscode.window.showInformationMessage(
      `Claude Live Monitor: Restored previous session (${sessionStore.getEvents().length} changes)`
    );
  }

  // Git branch tracking
  sessionStore.setWorkspacePath(workspaceRoot);

  // Auto-save every 30 seconds
  autoSaveInterval = setInterval(() => {
    if (sessionStore && sessionStore.getEvents().length > 0) {
      sessionStore.saveToDisk(sessionStoragePath);
    }
  }, 30_000);

  statsEngine = new StatsEngine(sessionStore);
  statusBarItem = new StatusBarItem();
  fileWatcher = new FileWatcher(workspaceRoot);

  // Set initial cost model
  const costModel = config.get<CostModel>('tokenCostModel', 'sonnet');
  statsEngine.setCostModel(costModel);

  // ─── Wire file events ─────────────────────────────────────────────
  const fileEventDisposable = fileWatcher.onFileChange(event => {
    if (!sessionStore || !statsEngine) return;

    sessionStore.addEvent(event);
    statsEngine.processEvent(event);

    // Update status bar
    if (statusBarItem) {
      statusBarItem.update(statsEngine.getStats());
      statusBarItem.flash();
    }

    // Send to webview if open
    if (MonitorPanel.currentPanel) {
      MonitorPanel.currentPanel.postMessage({
        type: 'file-event',
        payload: event,
      });
    }

    // Update sidebar
    if (sidebarProvider) {
      sidebarProvider.notifyEvent(event.type, event.relativePath);
    }

    // Broadcast to external browser window
    if (externalServer?.isRunning()) {
      externalServer.broadcast({ type: 'file-event', payload: event });
    }

    // Show notification if configured
    if (config.get<boolean>('showNotifications', false)) {
      const icon = event.type === 'created' ? '+' : event.type === 'deleted' ? '-' : '~';
      vscode.window.showInformationMessage(
        `[${icon}] ${event.relativePath} (+${event.diff?.linesAdded ?? 0} / -${event.diff?.linesRemoved ?? 0})`
      );
    }
  });

  context.subscriptions.push(fileEventDisposable);

  // ─── Periodic stats update to webview ─────────────────────────────
  statsUpdateInterval = setInterval(() => {
    if (MonitorPanel.currentPanel && statsEngine) {
      MonitorPanel.currentPanel.postMessage({
        type: 'stats-update',
        payload: statsEngine.getStats(),
      });
    }
    if (statusBarItem && statsEngine) {
      statusBarItem.update(statsEngine.getStats());
    }
    if (sidebarProvider && statsEngine) {
      sidebarProvider.updateStats(statsEngine.getStats());
    }
    if (externalServer?.isRunning() && statsEngine) {
      externalServer.broadcast({ type: 'stats-update', payload: statsEngine.getStats() });
    }
  }, 10000); // Every 10 seconds

  // ─── Register sidebar view ──────────────────────────────────────────
  sidebarProvider = new SidebarProvider(context.extensionUri);
  const sidebarRegistration = vscode.window.registerWebviewViewProvider(
    SidebarProvider.viewType,
    sidebarProvider
  );
  context.subscriptions.push(sidebarRegistration);

  // ─── Register commands ────────────────────────────────────────────

  // Open panel
  let panelMessageDisposable: vscode.Disposable | undefined;
  const openCmd = vscode.commands.registerCommand('claude-code-monitor.open', () => {
    const isNew = !MonitorPanel.currentPanel;
    const panel = MonitorPanel.createOrShow(context.extensionUri);

    // Only register the message listener for a NEW panel
    if (isNew) {
      // Dispose previous listener if any
      panelMessageDisposable?.dispose();
      panelMessageDisposable = panel.onMessage((msg: WebviewMessage) => {
        handleWebviewMessage(msg, context);
      });
      context.subscriptions.push(panelMessageDisposable);
    }

    // Send initial data
    if (sessionStore && statsEngine) {
      panel.postMessage({
        type: 'all-events',
        payload: [...sessionStore.getEvents()],
      });
      panel.postMessage({
        type: 'stats-update',
        payload: statsEngine.getStats(),
      });
      panel.postMessage({
        type: 'settings-update',
        payload: getCurrentSettings(),
      });
    }
  });

  // Pause/resume
  const pauseCmd = vscode.commands.registerCommand('claude-code-monitor.pause', () => {
    if (!fileWatcher) return;
    const paused = !fileWatcher.isPaused();
    fileWatcher.setPaused(paused);

    if (statusBarItem) {
      statusBarItem.setPaused(paused);
      if (!paused && statsEngine) {
        statusBarItem.update(statsEngine.getStats());
      }
    }

    if (MonitorPanel.currentPanel) {
      MonitorPanel.currentPanel.postMessage({
        type: 'monitor-paused',
        paused,
      });
    }

    vscode.window.showInformationMessage(
      paused ? 'Claude Live Monitor: Paused' : 'Claude Live Monitor: Resumed'
    );
  });

  // Clear session
  const clearCmd = vscode.commands.registerCommand('claude-code-monitor.clear', () => {
    if (sessionStore) sessionStore.clear();
    if (statsEngine) statsEngine.reset();
    if (fileWatcher) fileWatcher.clearCache();

    if (statusBarItem && statsEngine) {
      statusBarItem.update(statsEngine.getStats());
    }

    if (MonitorPanel.currentPanel) {
      MonitorPanel.currentPanel.postMessage({ type: 'session-cleared' });
    }
  });

  // Replay
  const replayCmd = vscode.commands.registerCommand('claude-code-monitor.replay', () => {
    const panel = MonitorPanel.createOrShow(context.extensionUri);
    // The webview handles replay internally
    if (sessionStore) {
      panel.postMessage({
        type: 'all-events',
        payload: [...sessionStore.getEvents()],
      });
    }
    panel.postMessage({ type: 'settings-update', payload: getCurrentSettings() });
  });

  // Export log
  const exportCmd = vscode.commands.registerCommand('claude-code-monitor.exportLog', async () => {
    if (!sessionStore) return;
    const choice = await vscode.window.showQuickPick(
      ['JSON', 'Markdown', 'CSV', 'Copy to clipboard'],
      { placeHolder: 'Export format' }
    );
    if (!choice) return;

    if (choice === 'Copy to clipboard') {
      const summary = sessionStore.exportClipboardSummary();
      await vscode.env.clipboard.writeText(summary);
      vscode.window.showInformationMessage('Session summary copied to clipboard');
    } else {
      const formatMap: Record<string, { ext: string; content: string; filter: Record<string, string[]> }> = {
        'JSON': { ext: 'json', content: sessionStore.exportJSON(), filter: { 'JSON': ['json'] } },
        'Markdown': { ext: 'md', content: sessionStore.exportMarkdown(), filter: { 'Markdown': ['md'] } },
        'CSV': { ext: 'csv', content: sessionStore.exportCSV(), filter: { 'CSV': ['csv'] } },
      };
      const fmt = formatMap[choice];
      const format = fmt.ext;
      const content = fmt.content;
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`claude-session.${format}`),
        filters: fmt.filter,
      });
      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
        vscode.window.showInformationMessage(`Session exported to ${uri.fsPath}`);
      }
    }
  });

  // Toggle sound
  const soundCmd = vscode.commands.registerCommand('claude-code-monitor.toggleSound', async () => {
    const current = config.get<boolean>('soundEnabled', false);
    await vscode.workspace.getConfiguration('claude-monitor').update('soundEnabled', !current, true);
    vscode.window.showInformationMessage(
      `Claude Live Monitor: Sounds ${!current ? 'enabled' : 'disabled'}`
    );
  });

  // Open in external browser window
  const openExternalCmd = vscode.commands.registerCommand('claude-code-monitor.openExternal', async () => {
    if (!externalServer) {
      externalServer = new ExternalServer(context.extensionUri);
    }
    // Register callback to send initial data to each new browser client
    externalServer.onNewClient(() => {
      if (sessionStore && statsEngine && externalServer?.isRunning()) {
        externalServer.broadcast({
          type: 'all-events',
          payload: [...sessionStore.getEvents()],
        });
        externalServer.broadcast({
          type: 'stats-update',
          payload: statsEngine.getStats(),
        });
        externalServer.broadcast({
          type: 'settings-update',
          payload: getCurrentSettings(),
        });
      }
    });

    try {
      const port = await externalServer.start();
      vscode.window.showInformationMessage(`Claude Live Monitor: External window opened on port ${port}`);
    } catch (_err) {
      vscode.window.showErrorMessage(`Claude Live Monitor: Failed to start external server`);
    }
  });

  context.subscriptions.push(openCmd, pauseCmd, clearCmd, replayCmd, exportCmd, soundCmd, openExternalCmd);
  context.subscriptions.push(statusBarItem);

  // ─── Listen for settings changes ──────────────────────────────────
  const configListener = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('claude-monitor')) {
      const newConfig = vscode.workspace.getConfiguration('claude-monitor');

      if (sessionStore) {
        sessionStore.setMaxItems(newConfig.get<number>('maxHistoryItems', 1000));
      }
      if (statsEngine) {
        statsEngine.setCostModel(newConfig.get<CostModel>('tokenCostModel', 'sonnet'));
      }

      if (MonitorPanel.currentPanel) {
        MonitorPanel.currentPanel.postMessage({
          type: 'settings-update',
          payload: getCurrentSettings(),
        });
      }
    }
  });
  context.subscriptions.push(configListener);

  // ─── Start watching ───────────────────────────────────────────────
  if (config.get<boolean>('enabled', true)) {
    fileWatcher.start();
  }
}

export function deactivate(): void {
  // Save session before shutting down
  if (sessionStore && sessionStore.getEvents().length > 0 && sessionStoragePath) {
    sessionStore.saveToDisk(sessionStoragePath);
    // Archive the session with timestamp
    const dir = path.dirname(sessionStoragePath);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const archivePath = path.join(dir, `session-${ts}.json`);
    sessionStore.saveToDisk(archivePath);

    // Send webhook notification if configured
    const webhookUrl = vscode.workspace.getConfiguration('claude-monitor').get<string>('webhookUrl', '');
    if (webhookUrl) {
      try {
        const summary = sessionStore.exportClipboardSummary();
        const branch = sessionStore.getGitBranch();
        const payload = JSON.stringify({
          text: `${summary}${branch ? ` | Branch: ${branch}` : ''}`,
          username: 'Claude Code Monitor',
        });
        const url = new URL(webhookUrl);
        const http = url.protocol === 'https:' ? require('https') : require('http');
        const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        req.write(payload);
        req.end();
      } catch { /* best effort */ }
    }
  }
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
  }
  if (statsUpdateInterval) {
    clearInterval(statsUpdateInterval);
  }
  if (externalServer) {
    externalServer.stop();
  }
  if (fileWatcher) {
    fileWatcher.dispose();
  }
}

// ─── Private Helpers ──────────────────────────────────────────────────

function getCurrentSettings(): MonitorSettings {
  const config = vscode.workspace.getConfiguration('claude-monitor');
  return {
    enabled: config.get<boolean>('enabled', true),
    soundEnabled: config.get<boolean>('soundEnabled', false),
    soundVolume: config.get<number>('soundVolume', 30),
    ignoredPaths: config.get<string[]>('ignoredPaths', []),
    showNotifications: config.get<boolean>('showNotifications', false),
    maxHistoryItems: config.get<number>('maxHistoryItems', 1000),
    tokenCostModel: config.get<CostModel>('tokenCostModel', 'sonnet'),
  };
}

async function handleWebviewMessage(
  msg: WebviewMessage,
  _context: vscode.ExtensionContext
): Promise<void> {
  switch (msg.type) {
    case 'open-file': {
      const uri = vscode.Uri.file(msg.filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
      if (msg.line && msg.line > 0) {
        const pos = new vscode.Position(msg.line - 1, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos));
      }
      break;
    }

    case 'export-log': {
      if (!sessionStore) break;
      if (msg.format === 'clipboard') {
        const summary = sessionStore.exportClipboardSummary();
        await vscode.env.clipboard.writeText(summary);
        vscode.window.showInformationMessage('Session summary copied to clipboard');
      } else {
        const extMap: Record<string, string> = { json: 'json', markdown: 'md', csv: 'csv' };
        const ext = extMap[msg.format] ?? 'json';
        const contentMap: Record<string, string> = {
          json: sessionStore.exportJSON(),
          markdown: sessionStore.exportMarkdown(),
          csv: sessionStore.exportCSV(),
        };
        const content = contentMap[msg.format] ?? sessionStore.exportJSON();
        const filterMap: Record<string, Record<string, string[]>> = {
          json: { 'JSON': ['json'] }, md: { 'Markdown': ['md'] }, csv: { 'CSV': ['csv'] },
        };
        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(`claude-session.${ext}`),
          filters: filterMap[ext] ?? { 'JSON': ['json'] },
        });
        if (uri) {
          await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
          vscode.window.showInformationMessage(`Session exported to ${uri.fsPath}`);
        }
      }
      break;
    }

    case 'clear-session': {
      if (sessionStore) sessionStore.clear();
      if (statsEngine) statsEngine.reset();
      if (fileWatcher) fileWatcher.clearCache();
      if (statusBarItem && statsEngine) statusBarItem.update(statsEngine.getStats());
      if (MonitorPanel.currentPanel) {
        MonitorPanel.currentPanel.postMessage({ type: 'session-cleared' });
      }
      break;
    }

    case 'pause-toggle': {
      await vscode.commands.executeCommand('claude-code-monitor.pause');
      break;
    }

    case 'update-setting': {
      const config = vscode.workspace.getConfiguration('claude-monitor');
      await config.update(msg.key, msg.value, true);
      break;
    }

    case 'request-all-events': {
      if (sessionStore && MonitorPanel.currentPanel) {
        MonitorPanel.currentPanel.postMessage({
          type: 'all-events',
          payload: [...sessionStore.getEvents()],
        });
      }
      break;
    }

    case 'request-settings': {
      if (MonitorPanel.currentPanel) {
        MonitorPanel.currentPanel.postMessage({
          type: 'settings-update',
          payload: getCurrentSettings(),
        });
      }
      break;
    }

    case 'request-diff': {
      if (sessionStore && MonitorPanel.currentPanel) {
        const event = sessionStore.getEventById(msg.id);
        if (event?.diff) {
          MonitorPanel.currentPanel.postMessage({
            type: 'diff-response',
            payload: { id: msg.id, diff: event.diff },
          });
        }
      }
      break;
    }

    case 'start-replay': {
      if (sessionStore && MonitorPanel.currentPanel) {
        MonitorPanel.currentPanel.postMessage({
          type: 'all-events',
          payload: [...sessionStore.getEvents()],
        });
      }
      break;
    }
  }
}
