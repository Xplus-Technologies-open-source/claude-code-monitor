/**
 * SessionStore — Stores all file change events for the current session.
 * Provides querying, export, and history management.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { FileChangeEvent, DiffResult } from '../types.js';

export class SessionStore {
  private events: FileChangeEvent[] = [];
  private maxItems: number;
  private readonly startTime: number;
  private gitBranch: string = '';
  private workspacePath: string = '';

  // Running character counters for token estimation
  private totalCharsAdded = 0;
  private totalCharsRemoved = 0;

  constructor(maxItems: number = 1000) {
    this.maxItems = maxItems;
    this.startTime = Date.now();
  }

  /**
   * Set workspace path for git branch detection.
   */
  setWorkspacePath(wsPath: string): void {
    this.workspacePath = wsPath;
    this.refreshGitBranch();
  }

  /**
   * Get current git branch name.
   */
  getGitBranch(): string {
    this.refreshGitBranch();
    return this.gitBranch;
  }

  private refreshGitBranch(): void {
    if (!this.workspacePath) return;
    try {
      this.gitBranch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: this.workspacePath,
        timeout: 3000,
        encoding: 'utf-8',
      }).trim();
    } catch {
      this.gitBranch = '';
    }
  }

  /**
   * Add a new file change event.
   */
  addEvent(event: FileChangeEvent): void {
    this.events.push(event);

    // Track characters for token estimation
    if (event.diff) {
      for (const hunk of event.diff.hunks) {
        for (const line of hunk.lines) {
          if (line.type === 'added') {
            this.totalCharsAdded += line.content.length;
          } else if (line.type === 'removed') {
            this.totalCharsRemoved += line.content.length;
          }
        }
      }
    }

    // Enforce max history
    if (this.events.length > this.maxItems) {
      const removed = this.events.splice(0, this.events.length - this.maxItems);
      // Recalculate char counts after eviction
      this.recalculateCharCounts(removed);
    }
  }

  /**
   * Get all events.
   */
  getEvents(): ReadonlyArray<FileChangeEvent> {
    return this.events;
  }

  /**
   * Get events for a specific file.
   */
  getEventsByFile(relativePath: string): FileChangeEvent[] {
    return this.events.filter(e => e.relativePath === relativePath);
  }

  /**
   * Get a specific event by ID.
   */
  getEventById(id: string): FileChangeEvent | undefined {
    return this.events.find(e => e.id === id);
  }

  /**
   * Get session start time.
   */
  getStartTime(): number {
    return this.startTime;
  }

  /**
   * Get session duration in milliseconds.
   */
  getDurationMs(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get running character totals for token estimation.
   */
  getCharTotals(): { added: number; removed: number } {
    return { added: this.totalCharsAdded, removed: this.totalCharsRemoved };
  }

  /**
   * Get count of events by type.
   */
  getCountsByType(): { created: number; modified: number; deleted: number } {
    let created = 0;
    let modified = 0;
    let deleted = 0;

    for (const event of this.events) {
      switch (event.type) {
        case 'created': created++; break;
        case 'modified': modified++; break;
        case 'deleted': deleted++; break;
      }
    }

    return { created, modified, deleted };
  }

  /**
   * Update max history items.
   */
  setMaxItems(max: number): void {
    this.maxItems = max;
    if (this.events.length > max) {
      this.events.splice(0, this.events.length - max);
      // Full recalc needed
      this.fullRecalculateCharCounts();
    }
  }

  /**
   * Clear all events and reset counters.
   */
  clear(): void {
    this.events = [];
    this.totalCharsAdded = 0;
    this.totalCharsRemoved = 0;
  }

  /**
   * Export session as JSON string.
   */
  exportJSON(): string {
    const data = {
      sessionStart: new Date(this.startTime).toISOString(),
      sessionDurationMs: this.getDurationMs(),
      totalEvents: this.events.length,
      counts: this.getCountsByType(),
      events: this.events.map(e => ({
        id: e.id,
        type: e.type,
        relativePath: e.relativePath,
        timestamp: new Date(e.timestamp).toISOString(),
        language: e.language,
        linesAdded: e.diff?.linesAdded ?? 0,
        linesRemoved: e.diff?.linesRemoved ?? 0,
        diff: e.diff ? this.serializeDiff(e.diff) : null,
      })),
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Export session as Markdown report.
   */
  exportMarkdown(): string {
    const counts = this.getCountsByType();
    const duration = this.formatDuration(this.getDurationMs());
    const totalAdded = this.events.reduce((sum, e) => sum + (e.diff?.linesAdded ?? 0), 0);
    const totalRemoved = this.events.reduce((sum, e) => sum + (e.diff?.linesRemoved ?? 0), 0);

    let md = `# Claude Code Monitor - Session Report\n\n`;
    md += `**Date:** ${new Date(this.startTime).toLocaleDateString()}\n`;
    md += `**Duration:** ${duration}\n`;
    if (this.gitBranch) md += `**Branch:** ${this.gitBranch}\n`;
    md += `**Total Changes:** ${this.events.length}\n\n`;

    md += `## Summary\n\n`;
    md += `| Metric | Count |\n`;
    md += `|--------|-------|\n`;
    md += `| Files Created | ${counts.created} |\n`;
    md += `| Files Modified | ${counts.modified} |\n`;
    md += `| Files Deleted | ${counts.deleted} |\n`;
    md += `| Lines Added | +${totalAdded} |\n`;
    md += `| Lines Removed | -${totalRemoved} |\n`;
    md += `| Net Lines | ${totalAdded - totalRemoved > 0 ? '+' : ''}${totalAdded - totalRemoved} |\n\n`;

    md += `## File Changes\n\n`;

    // Group by file
    const fileGroups = new Map<string, FileChangeEvent[]>();
    for (const event of this.events) {
      const existing = fileGroups.get(event.relativePath) ?? [];
      existing.push(event);
      fileGroups.set(event.relativePath, existing);
    }

    for (const [filePath, events] of fileGroups) {
      const fileAdded = events.reduce((s, e) => s + (e.diff?.linesAdded ?? 0), 0);
      const fileRemoved = events.reduce((s, e) => s + (e.diff?.linesRemoved ?? 0), 0);
      md += `### \`${filePath}\`\n`;
      md += `- Changes: ${events.length} | +${fileAdded} / -${fileRemoved}\n`;

      for (const event of events) {
        const time = new Date(event.timestamp).toLocaleTimeString('en-US', { hour12: false });
        const icon = event.type === 'created' ? '+' : event.type === 'deleted' ? '-' : '~';
        md += `  - \`${time}\` [${icon}] +${event.diff?.linesAdded ?? 0} / -${event.diff?.linesRemoved ?? 0}\n`;
      }
      md += `\n`;
    }

    md += `## Timeline\n\n`;
    for (const event of this.events) {
      const time = new Date(event.timestamp).toLocaleTimeString('en-US', { hour12: false });
      const icon = event.type === 'created' ? 'NEW' : event.type === 'deleted' ? 'DEL' : 'MOD';
      md += `- \`${time}\` **[${icon}]** \`${event.relativePath}\` (+${event.diff?.linesAdded ?? 0} / -${event.diff?.linesRemoved ?? 0})\n`;
    }

    return md;
  }

  /**
   * Generate clipboard summary text.
   */
  exportClipboardSummary(): string {
    const counts = this.getCountsByType();
    const duration = this.formatDuration(this.getDurationMs());
    const totalAdded = this.events.reduce((sum, e) => sum + (e.diff?.linesAdded ?? 0), 0);
    const totalRemoved = this.events.reduce((sum, e) => sum + (e.diff?.linesRemoved ?? 0), 0);
    const uniqueFiles = new Set(this.events.map(e => e.relativePath)).size;

    return `Claude Code Session: ${duration} | ${this.events.length} changes | ${uniqueFiles} files | +${totalAdded} / -${totalRemoved} lines | ${counts.created} created, ${counts.modified} modified, ${counts.deleted} deleted`;
  }

  // ─── Private Helpers ──────────────────────────────────────────────

  private serializeDiff(diff: DiffResult): object {
    return {
      linesAdded: diff.linesAdded,
      linesRemoved: diff.linesRemoved,
      estimatedTokens: diff.estimatedTokens,
      hunks: diff.hunks.map(h => ({
        oldStart: h.oldStart,
        oldLines: h.oldLines,
        newStart: h.newStart,
        newLines: h.newLines,
        lines: h.lines.map(l => ({
          type: l.type,
          content: l.content,
        })),
      })),
    };
  }

  private recalculateCharCounts(removedEvents: FileChangeEvent[]): void {
    for (const event of removedEvents) {
      if (!event.diff) continue;
      for (const hunk of event.diff.hunks) {
        for (const line of hunk.lines) {
          if (line.type === 'added') {
            this.totalCharsAdded -= line.content.length;
          } else if (line.type === 'removed') {
            this.totalCharsRemoved -= line.content.length;
          }
        }
      }
    }
    // Clamp to zero
    if (this.totalCharsAdded < 0) this.totalCharsAdded = 0;
    if (this.totalCharsRemoved < 0) this.totalCharsRemoved = 0;
  }

  private fullRecalculateCharCounts(): void {
    this.totalCharsAdded = 0;
    this.totalCharsRemoved = 0;
    for (const event of this.events) {
      if (!event.diff) continue;
      for (const hunk of event.diff.hunks) {
        for (const line of hunk.lines) {
          if (line.type === 'added') {
            this.totalCharsAdded += line.content.length;
          } else if (line.type === 'removed') {
            this.totalCharsRemoved += line.content.length;
          }
        }
      }
    }
  }

  private formatDuration(ms: number): string {
    const s = Math.floor(ms / 1000) % 60;
    const m = Math.floor(ms / 60000) % 60;
    const h = Math.floor(ms / 3600000);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  // ─── Persistence ──────────────────────────────────────────────────

  /**
   * Save current session to disk for recovery.
   */
  saveToDisk(storagePath: string): void {
    try {
      const dir = path.dirname(storagePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const data = {
        version: 1,
        startTime: this.startTime,
        savedAt: Date.now(),
        totalCharsAdded: this.totalCharsAdded,
        totalCharsRemoved: this.totalCharsRemoved,
        events: this.events,
      };
      fs.writeFileSync(storagePath, JSON.stringify(data), 'utf-8');
    } catch {
      // Silently fail — persistence is best-effort
    }
  }

  /**
   * Load a previously saved session from disk.
   * Returns true if a session was restored.
   */
  loadFromDisk(storagePath: string): boolean {
    try {
      if (!fs.existsSync(storagePath)) return false;

      const raw = fs.readFileSync(storagePath, 'utf-8');
      const data = JSON.parse(raw);

      if (!data.events || !Array.isArray(data.events)) return false;

      this.events = data.events;
      this.totalCharsAdded = data.totalCharsAdded ?? 0;
      this.totalCharsRemoved = data.totalCharsRemoved ?? 0;

      return this.events.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * List all saved sessions in a directory.
   */
  static listSavedSessions(dir: string): Array<{ file: string; date: string; events: number; duration: string }> {
    try {
      if (!fs.existsSync(dir)) return [];
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f.startsWith('session-'));
      const sessions: Array<{ file: string; date: string; events: number; duration: string }> = [];

      for (const file of files.slice(-50)) { // last 50
        try {
          const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
          const data = JSON.parse(raw);
          const durationMs = (data.savedAt || Date.now()) - (data.startTime || Date.now());
          const m = Math.floor(durationMs / 60000);
          const h = Math.floor(m / 60);
          sessions.push({
            file,
            date: new Date(data.startTime || 0).toLocaleDateString(),
            events: data.events?.length ?? 0,
            duration: h > 0 ? `${h}h ${m % 60}m` : `${m}m`,
          });
        } catch { /* skip corrupt files */ }
      }

      return sessions.reverse();
    } catch {
      return [];
    }
  }

  /**
   * Export session as CSV.
   */
  exportCSV(): string {
    const header = 'timestamp,type,file,language,lines_added,lines_removed,tokens_estimated\n';
    const rows = this.events.map(e => {
      const ts = new Date(e.timestamp).toISOString();
      const added = e.diff?.linesAdded ?? 0;
      const removed = e.diff?.linesRemoved ?? 0;
      const tokens = e.diff?.estimatedTokens ?? 0;
      const filePath = e.relativePath.replace(/,/g, ';');
      return `${ts},${e.type},${filePath},${e.language},${added},${removed},${tokens}`;
    }).join('\n');
    return header + rows;
  }
}
