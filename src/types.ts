/**
 * Core type definitions for Claude Code Monitor.
 * All shared interfaces, message protocols, and enums.
 */

// ─── File Change Events ───────────────────────────────────────────

export type ChangeType = 'created' | 'modified' | 'deleted';

export interface FileChangeEvent {
  id: string;
  type: ChangeType;
  filePath: string;
  relativePath: string;
  timestamp: number;
  language: string;
  languageColor: string;
  diff: DiffResult | null;
}

// ─── Diff Data ────────────────────────────────────────────────────

export interface DiffResult {
  before: string | null;
  after: string | null;
  hunks: DiffHunk[];
  linesAdded: number;
  linesRemoved: number;
  estimatedTokens: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'added' | 'removed' | 'context';
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

// ─── Session Statistics ───────────────────────────────────────────

export interface SessionStats {
  totalChanges: number;
  filesCreated: number;
  filesModified: number;
  filesDeleted: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  estimatedTokens: number;
  estimatedCostUsd: number;
  sessionStartTime: number;
  sessionDurationMs: number;
  linesPerMinute: number;
  peakLinesPerMinute: number;
  languageBreakdown: Record<string, LanguageStat>;
  changeTimeline: TimelineEntry[];
  fileHeatmap: Record<string, FileHeatEntry>;
}

export interface LanguageStat {
  language: string;
  color: string;
  linesAdded: number;
  linesRemoved: number;
  changeCount: number;
}

export interface TimelineEntry {
  minuteTimestamp: number;
  changeCount: number;
  linesAdded: number;
  linesRemoved: number;
  cumulativeCostUsd: number;
}

export interface FileHeatEntry {
  relativePath: string;
  language: string;
  languageColor: string;
  changeCount: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  firstTouched: number;
  lastTouched: number;
}

// ─── Token Cost Estimation ────────────────────────────────────────

export type CostModel = 'sonnet' | 'opus' | 'haiku';

export interface TokenCostInfo {
  model: CostModel;
  modelName: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
}

// ─── Extension Settings ───────────────────────────────────────────

export interface MonitorSettings {
  enabled: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  ignoredPaths: string[];
  showNotifications: boolean;
  maxHistoryItems: number;
  tokenCostModel: CostModel;
}

// ─── Extension → Webview Messages ─────────────────────────────────

export type ExtensionMessage =
  | { type: 'file-event'; payload: FileChangeEvent }
  | { type: 'stats-update'; payload: SessionStats }
  | { type: 'session-cleared' }
  | { type: 'monitor-paused'; paused: boolean }
  | { type: 'diff-response'; payload: { id: string; diff: DiffResult } }
  | { type: 'settings-update'; payload: MonitorSettings }
  | { type: 'all-events'; payload: FileChangeEvent[] }
  | { type: 'export-ready'; payload: { format: string; content: string; filename: string } };

// ─── Webview → Extension Messages ─────────────────────────────────

export type WebviewMessage =
  | { type: 'request-diff'; id: string }
  | { type: 'open-file'; filePath: string; line?: number }
  | { type: 'export-log'; format: 'json' | 'markdown' | 'clipboard' }
  | { type: 'clear-session' }
  | { type: 'pause-toggle' }
  | { type: 'update-setting'; key: string; value: string | number | boolean | string[] }
  | { type: 'request-all-events' }
  | { type: 'request-settings' }
  | { type: 'start-replay' };
