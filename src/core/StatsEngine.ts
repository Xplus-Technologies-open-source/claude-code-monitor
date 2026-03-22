/**
 * StatsEngine — Computes real-time session statistics.
 * Derives all metrics incrementally from SessionStore events.
 */

import type {
  FileChangeEvent,
  SessionStats,
  LanguageStat,
  TimelineEntry,
  FileHeatEntry,
  CostModel,
} from '../types.js';
import { SessionStore } from './SessionStore.js';
import { calculateCost } from '../utils/tokenEstimator.js';

export class StatsEngine {
  private languageStats = new Map<string, LanguageStat>();
  private fileHeat = new Map<string, FileHeatEntry>();
  private timeline: TimelineEntry[] = [];
  private linesPerMinuteHistory: number[] = [];
  private peakLinesPerMinute = 0;
  private costModel: CostModel = 'sonnet';

  constructor(private readonly store: SessionStore) {}

  /**
   * Set the cost model for token estimation.
   */
  setCostModel(model: CostModel): void {
    this.costModel = model;
  }

  /**
   * Process a new event and update all statistics.
   */
  processEvent(event: FileChangeEvent): void {
    this.updateLanguageStats(event);
    this.updateFileHeat(event);
    this.updateTimeline(event);
    this.updateLinesPerMinute();
  }

  /**
   * Get the full stats snapshot for the webview.
   */
  getStats(): SessionStats {
    const counts = this.store.getCountsByType();
    const events = this.store.getEvents();
    const charTotals = this.store.getCharTotals();
    const costInfo = calculateCost(charTotals.added, charTotals.removed, this.costModel);

    const totalLinesAdded = events.reduce((s, e) => s + (e.diff?.linesAdded ?? 0), 0);
    const totalLinesRemoved = events.reduce((s, e) => s + (e.diff?.linesRemoved ?? 0), 0);

    const currentLpm = this.calculateCurrentLinesPerMinute();

    return {
      totalChanges: events.length,
      filesCreated: counts.created,
      filesModified: counts.modified,
      filesDeleted: counts.deleted,
      totalLinesAdded,
      totalLinesRemoved,
      estimatedTokens: costInfo.estimatedInputTokens + costInfo.estimatedOutputTokens,
      estimatedCostUsd: costInfo.totalCostUsd,
      sessionStartTime: this.store.getStartTime(),
      sessionDurationMs: this.store.getDurationMs(),
      linesPerMinute: currentLpm,
      peakLinesPerMinute: this.peakLinesPerMinute,
      languageBreakdown: this.serializeLanguageStats(),
      changeTimeline: this.getRecentTimeline(30),
      fileHeatmap: this.serializeFileHeat(),
    };
  }

  /**
   * Reset all computed statistics.
   */
  reset(): void {
    this.languageStats.clear();
    this.fileHeat.clear();
    this.timeline = [];
    this.linesPerMinuteHistory = [];
    this.peakLinesPerMinute = 0;
  }

  // ─── Private Methods ──────────────────────────────────────────────

  private updateLanguageStats(event: FileChangeEvent): void {
    const key = event.language;
    const existing = this.languageStats.get(key);

    if (existing) {
      existing.linesAdded += event.diff?.linesAdded ?? 0;
      existing.linesRemoved += event.diff?.linesRemoved ?? 0;
      existing.changeCount++;
    } else {
      this.languageStats.set(key, {
        language: event.language,
        color: event.languageColor,
        linesAdded: event.diff?.linesAdded ?? 0,
        linesRemoved: event.diff?.linesRemoved ?? 0,
        changeCount: 1,
      });
    }
  }

  private updateFileHeat(event: FileChangeEvent): void {
    const key = event.relativePath;
    const existing = this.fileHeat.get(key);

    if (existing) {
      existing.changeCount++;
      existing.totalLinesAdded += event.diff?.linesAdded ?? 0;
      existing.totalLinesRemoved += event.diff?.linesRemoved ?? 0;
      existing.lastTouched = event.timestamp;
    } else {
      this.fileHeat.set(key, {
        relativePath: event.relativePath,
        language: event.language,
        languageColor: event.languageColor,
        changeCount: 1,
        totalLinesAdded: event.diff?.linesAdded ?? 0,
        totalLinesRemoved: event.diff?.linesRemoved ?? 0,
        firstTouched: event.timestamp,
        lastTouched: event.timestamp,
      });
    }
  }

  private updateTimeline(event: FileChangeEvent): void {
    // Bucket by minute
    const minuteTs = Math.floor(event.timestamp / 60000) * 60000;
    const lastEntry = this.timeline[this.timeline.length - 1];

    // Get running cost from store
    const charTotals = this.store.getCharTotals();
    const costInfo = calculateCost(charTotals.added, charTotals.removed, this.costModel);

    if (lastEntry && lastEntry.minuteTimestamp === minuteTs) {
      lastEntry.changeCount++;
      lastEntry.linesAdded += event.diff?.linesAdded ?? 0;
      lastEntry.linesRemoved += event.diff?.linesRemoved ?? 0;
      lastEntry.cumulativeCostUsd = costInfo.totalCostUsd;
    } else {
      this.timeline.push({
        minuteTimestamp: minuteTs,
        changeCount: 1,
        linesAdded: event.diff?.linesAdded ?? 0,
        linesRemoved: event.diff?.linesRemoved ?? 0,
        cumulativeCostUsd: costInfo.totalCostUsd,
      });
    }
  }

  private updateLinesPerMinute(): void {
    const lpm = this.calculateCurrentLinesPerMinute();
    this.linesPerMinuteHistory.push(lpm);

    if (lpm > this.peakLinesPerMinute) {
      this.peakLinesPerMinute = lpm;
    }
  }

  /**
   * Calculate lines/minute as a rolling average over the last 5 minutes.
   */
  private calculateCurrentLinesPerMinute(): number {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    const events = this.store.getEvents();

    let recentLines = 0;
    let recentCount = 0;

    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (event.timestamp < fiveMinutesAgo) break;
      recentLines += (event.diff?.linesAdded ?? 0) + (event.diff?.linesRemoved ?? 0);
      recentCount++;
    }

    if (recentCount === 0) return 0;

    // Time span of recent events
    const oldestRecent = events.find(e => e.timestamp >= fiveMinutesAgo);
    if (!oldestRecent) return 0;

    const spanMs = now - oldestRecent.timestamp;
    const spanMinutes = Math.max(spanMs / 60000, 1 / 60); // At least 1 second

    return Math.round(recentLines / spanMinutes);
  }

  /**
   * Get the most recent N minutes of timeline data.
   */
  private getRecentTimeline(minutes: number): TimelineEntry[] {
    const cutoff = Date.now() - minutes * 60000;
    return this.timeline.filter(e => e.minuteTimestamp >= cutoff);
  }

  private serializeLanguageStats(): Record<string, LanguageStat> {
    const result: Record<string, LanguageStat> = {};
    for (const [key, stat] of this.languageStats) {
      result[key] = { ...stat };
    }
    return result;
  }

  private serializeFileHeat(): Record<string, FileHeatEntry> {
    const result: Record<string, FileHeatEntry> = {};
    for (const [key, entry] of this.fileHeat) {
      result[key] = { ...entry };
    }
    return result;
  }
}
