/**
 * StatusBarItem — VS Code status bar integration.
 * Shows live change count and lines/min in the bottom bar.
 */

import * as vscode from 'vscode';
import type { SessionStats } from '../types.js';

export class StatusBarItem implements vscode.Disposable {
  private readonly mainItem: vscode.StatusBarItem;
  private readonly speedItem: vscode.StatusBarItem;
  private flashTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastActivityTime = 0;
  private activityCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Main item: change count + lines
    this.mainItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.mainItem.command = 'claude-code-monitor.open';
    this.mainItem.tooltip = 'Claude Code Monitor — Click to open panel';
    this.mainItem.text = '$(eye) Monitor: 0 changes';
    this.mainItem.show();

    // Speed item: lines/min
    this.speedItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      99
    );
    this.speedItem.command = 'claude-code-monitor.open';
    this.speedItem.tooltip = 'Current coding speed';
    this.speedItem.text = '';
    this.speedItem.show();

    // Check activity color every 5 seconds
    this.activityCheckInterval = setInterval(() => {
      this.updateActivityColor();
    }, 5000);
  }

  /**
   * Update the status bar with fresh stats.
   */
  update(stats: SessionStats): void {
    const totalLines = stats.totalLinesAdded + stats.totalLinesRemoved;
    this.mainItem.text = `$(eye) Monitor: ${stats.totalChanges} changes | +${this.formatNumber(totalLines)} lines`;

    if (stats.linesPerMinute > 0) {
      this.speedItem.text = `$(zap) ${stats.linesPerMinute} lines/min`;
    } else {
      this.speedItem.text = '';
    }

    this.lastActivityTime = Date.now();
    this.updateActivityColor();
  }

  /**
   * Flash the status bar briefly to indicate a new change.
   */
  flash(): void {
    this.lastActivityTime = Date.now();

    // Set active color
    this.mainItem.backgroundColor = new vscode.ThemeColor(
      'statusBarItem.warningBackground'
    );

    // Clear previous flash timeout
    if (this.flashTimeout) {
      clearTimeout(this.flashTimeout);
    }

    // Reset after 300ms
    this.flashTimeout = setTimeout(() => {
      this.updateActivityColor();
      this.flashTimeout = null;
    }, 300);
  }

  /**
   * Show paused state.
   */
  setPaused(paused: boolean): void {
    if (paused) {
      this.mainItem.text = '$(eye-closed) Monitor: Paused';
      this.mainItem.backgroundColor = undefined;
      this.speedItem.text = '';
    }
  }

  dispose(): void {
    if (this.flashTimeout) clearTimeout(this.flashTimeout);
    if (this.activityCheckInterval) clearInterval(this.activityCheckInterval);
    this.mainItem.dispose();
    this.speedItem.dispose();
  }

  // ─── Private ──────────────────────────────────────────────────────

  private updateActivityColor(): void {
    const elapsed = Date.now() - this.lastActivityTime;

    if (elapsed < 5000) {
      // Active: green-ish highlight
      this.mainItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.prominentBackground'
      );
    } else {
      // Idle: no background
      this.mainItem.backgroundColor = undefined;
    }
  }

  private formatNumber(n: number): string {
    if (n >= 1000) {
      return `${(n / 1000).toFixed(1)}k`;
    }
    return String(n);
  }
}
