/**
 * FileWatcher — Core file system monitoring with snapshot caching.
 *
 * Strategy:
 * 1. On activation: cache content of all open TextDocuments (lazy approach)
 * 2. On file change: snapshot cache = BEFORE, read disk = AFTER, compute diff
 * 3. On file create: no BEFORE, read content as AFTER
 * 4. On file delete: cache = BEFORE, no AFTER
 *
 * Features:
 * - Per-file debounce (150ms) to avoid spam
 * - Binary file detection (extension + content check)
 * - Max file size enforcement (5MB)
 * - Configurable ignore patterns
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { DiffEngine } from './DiffEngine.js';
import type { FileChangeEvent } from '../types.js';
import {
  isBinaryExtension,
  isBinaryContent,
  getLanguageInfo,
  generateId,
  MAX_FILE_SIZE_BYTES,
} from '../utils/fileUtils.js';

export class FileWatcher implements vscode.Disposable {
  private readonly snapshotCache = new Map<string, string>();
  private readonly diffEngine = new DiffEngine();
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly processingFiles = new Set<string>();
  private readonly disposables: vscode.Disposable[] = [];

  private readonly _onFileChange = new vscode.EventEmitter<FileChangeEvent>();
  public readonly onFileChange = this._onFileChange.event;

  private paused = false;
  private ignorePatterns: string[] = [];
  private debounceMs = 150;

  private readonly workspaceRoots: string[];

  constructor(private readonly workspaceRoot: string) {
    // Support multi-root workspaces
    this.workspaceRoots = vscode.workspace.workspaceFolders
      ? vscode.workspace.workspaceFolders.map(f => f.uri.fsPath)
      : [workspaceRoot];
    this.loadSettings();
  }

  /**
   * Get the relative path for a file, resolving against the correct workspace root.
   */
  private getRelativePath(filePath: string): string {
    for (const root of this.workspaceRoots) {
      const rel = path.relative(root, filePath);
      if (!rel.startsWith('..')) return rel;
    }
    return path.relative(this.workspaceRoot, filePath);
  }

  /**
   * Start watching the workspace.
   */
  async start(): Promise<void> {
    // Cache all currently open text documents
    for (const doc of vscode.workspace.textDocuments) {
      if (doc.uri.scheme === 'file' && !this.shouldIgnore(doc.uri.fsPath)) {
        this.snapshotCache.set(doc.uri.fsPath, doc.getText());
      }
    }

    // Background: cache workspace files lazily
    this.startBackgroundCaching();

    // Watch for all file changes in workspace
    const watcher = vscode.workspace.createFileSystemWatcher('**/*');

    watcher.onDidChange(uri => this.handleChange(uri));
    watcher.onDidCreate(uri => this.handleCreate(uri));
    watcher.onDidDelete(uri => this.handleDelete(uri));

    this.disposables.push(watcher);

    // Also listen to text document saves (more reliable on some OS)
    const saveListener = vscode.workspace.onDidSaveTextDocument(doc => {
      if (doc.uri.scheme === 'file') {
        this.handleChange(doc.uri);
      }
    });
    this.disposables.push(saveListener);

    // Track newly opened documents for cache
    const openListener = vscode.workspace.onDidOpenTextDocument(doc => {
      if (doc.uri.scheme === 'file' && !this.shouldIgnore(doc.uri.fsPath)) {
        if (!this.snapshotCache.has(doc.uri.fsPath)) {
          this.snapshotCache.set(doc.uri.fsPath, doc.getText());
        }
      }
    });
    this.disposables.push(openListener);

    // Listen for settings changes
    const configListener = vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('claude-monitor')) {
        this.loadSettings();
      }
    });
    this.disposables.push(configListener);
  }

  /**
   * Pause/resume monitoring.
   */
  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Clear the snapshot cache.
   */
  clearCache(): void {
    this.snapshotCache.clear();
  }

  /**
   * Get cache size info for diagnostics.
   */
  getCacheInfo(): { fileCount: number; estimatedSizeBytes: number } {
    let totalSize = 0;
    for (const content of this.snapshotCache.values()) {
      totalSize += content.length * 2; // UTF-16 chars = 2 bytes each
    }
    return { fileCount: this.snapshotCache.size, estimatedSizeBytes: totalSize };
  }

  dispose(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this._onFileChange.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  // ─── Private Methods ─────────────────────────────────────────────

  private loadSettings(): void {
    const config = vscode.workspace.getConfiguration('claude-monitor');
    this.ignorePatterns = config.get<string[]>('ignoredPaths', []);
    this.debounceMs = 150;
  }

  private shouldIgnore(filePath: string): boolean {
    const relative = this.getRelativePath(filePath);

    // Always ignore these
    if (relative.startsWith('.git' + path.sep) || relative === '.git') return true;
    if (relative.includes('node_modules')) return true;
    if (relative.startsWith('dist' + path.sep)) return true;
    if (relative.startsWith('.next' + path.sep)) return true;
    if (relative.startsWith('__pycache__' + path.sep)) return true;

    // User-configured patterns (simple substring match)
    for (const pattern of this.ignorePatterns) {
      if (relative.includes(pattern)) return true;
    }

    // Binary files
    if (isBinaryExtension(filePath)) return true;

    return false;
  }

  private handleChange(uri: vscode.Uri): void {
    if (this.paused) return;
    const filePath = uri.fsPath;
    if (this.shouldIgnore(filePath)) return;

    this.debounce(filePath, () => this.processChange(filePath));
  }

  private handleCreate(uri: vscode.Uri): void {
    if (this.paused) return;
    const filePath = uri.fsPath;
    if (this.shouldIgnore(filePath)) return;

    this.debounce(filePath, () => this.processCreate(filePath));
  }

  private handleDelete(uri: vscode.Uri): void {
    if (this.paused) return;
    const filePath = uri.fsPath;
    if (this.shouldIgnore(filePath)) return;

    // No debounce for deletes — they're instant and don't repeat
    this.processDelete(filePath);
  }

  private debounce(filePath: string, callback: () => void): void {
    const existing = this.debounceTimers.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      callback();
    }, this.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  private async processChange(filePath: string): Promise<void> {
    if (this.processingFiles.has(filePath)) return;
    this.processingFiles.add(filePath);

    try {
      const uri = vscode.Uri.file(filePath);

      // Check file size
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > MAX_FILE_SIZE_BYTES) return;

      // Read current content from disk
      const rawBytes = await vscode.workspace.fs.readFile(uri);
      const buffer = Buffer.from(rawBytes);

      // Check for binary content
      if (isBinaryContent(buffer)) return;

      const afterContent = buffer.toString('utf-8');
      const beforeContent = this.snapshotCache.get(filePath) ?? null;

      // If content hasn't actually changed, skip
      if (beforeContent === afterContent) return;

      const langInfo = getLanguageInfo(filePath);
      const relative = this.getRelativePath(filePath);
      const diff = this.diffEngine.computeDiff(relative, beforeContent, afterContent);

      // Update cache
      this.snapshotCache.set(filePath, afterContent);

      const event: FileChangeEvent = {
        id: generateId(),
        type: 'modified',
        filePath,
        relativePath: relative,
        timestamp: Date.now(),
        language: langInfo.name,
        languageColor: langInfo.color,
        diff,
      };

      this._onFileChange.fire(event);
    } catch {
      // File may have been deleted between detection and read — ignore
    } finally {
      this.processingFiles.delete(filePath);
    }
  }

  private async processCreate(filePath: string): Promise<void> {
    if (this.processingFiles.has(filePath)) return;
    this.processingFiles.add(filePath);

    try {
      const uri = vscode.Uri.file(filePath);
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > MAX_FILE_SIZE_BYTES) return;

      const rawBytes = await vscode.workspace.fs.readFile(uri);
      const buffer = Buffer.from(rawBytes);
      if (isBinaryContent(buffer)) return;

      const content = buffer.toString('utf-8');
      const langInfo = getLanguageInfo(filePath);
      const relative = this.getRelativePath(filePath);
      const diff = this.diffEngine.computeDiff(relative, null, content);

      // Cache the new file
      this.snapshotCache.set(filePath, content);

      const event: FileChangeEvent = {
        id: generateId(),
        type: 'created',
        filePath,
        relativePath: relative,
        timestamp: Date.now(),
        language: langInfo.name,
        languageColor: langInfo.color,
        diff,
      };

      this._onFileChange.fire(event);
    } catch {
      // File may have disappeared — ignore
    } finally {
      this.processingFiles.delete(filePath);
    }
  }

  private processDelete(filePath: string): void {
    const beforeContent = this.snapshotCache.get(filePath) ?? null;
    const langInfo = getLanguageInfo(filePath);
    const relative = this.getRelativePath(filePath);

    const diff = beforeContent
      ? this.diffEngine.computeDiff(relative, beforeContent, null)
      : {
          before: null,
          after: null,
          hunks: [],
          linesAdded: 0,
          linesRemoved: 0,
          estimatedTokens: 0,
        };

    // Remove from cache
    this.snapshotCache.delete(filePath);

    const event: FileChangeEvent = {
      id: generateId(),
      type: 'deleted',
      filePath,
      relativePath: relative,
      timestamp: Date.now(),
      language: langInfo.name,
      languageColor: langInfo.color,
      diff,
    };

    this._onFileChange.fire(event);
  }

  /**
   * Background caching: slowly read workspace files to fill the snapshot cache.
   * Processes files in batches to avoid blocking.
   */
  private async startBackgroundCaching(): Promise<void> {
    try {
      const excludePattern = '{**/node_modules/**,**/.git/**,**/dist/**,**/.next/**,**/__pycache__/**}';
      const files = await vscode.workspace.findFiles('**/*', excludePattern, 5000);

      const BATCH_SIZE = 50;
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);

        await Promise.allSettled(
          batch.map(async (uri) => {
            const filePath = uri.fsPath;
            if (this.snapshotCache.has(filePath)) return;
            if (this.shouldIgnore(filePath)) return;

            try {
              const stat = await vscode.workspace.fs.stat(uri);
              if (stat.size > MAX_FILE_SIZE_BYTES) return;

              const rawBytes = await vscode.workspace.fs.readFile(uri);
              const buffer = Buffer.from(rawBytes);
              if (isBinaryContent(buffer)) return;

              this.snapshotCache.set(filePath, buffer.toString('utf-8'));
            } catch {
              // Skip unreadable files
            }
          })
        );

        // Yield between batches
        await new Promise<void>(resolve => setTimeout(resolve, 10));
      }
    } catch {
      // findFiles can fail if workspace is not fully loaded — acceptable
    }
  }
}
