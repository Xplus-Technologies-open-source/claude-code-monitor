/**
 * DiffEngine — Computes line-by-line diffs using Myers algorithm.
 * Uses the `diff` npm package for reliable structured patches.
 */

import { structuredPatch } from 'diff';
import type { DiffResult, DiffHunk, DiffLine } from '../types.js';
import { estimateTokens } from '../utils/tokenEstimator.js';

export class DiffEngine {
  /**
   * Compute a diff between before and after content.
   *
   * - before=null → file created (all lines are additions)
   * - after=null  → file deleted (all lines are removals)
   * - both set    → standard diff
   */
  computeDiff(
    filePath: string,
    before: string | null,
    after: string | null
  ): DiffResult {
    if (before === null && after !== null) {
      return this.buildCreatedDiff(after);
    }

    if (before !== null && after === null) {
      return this.buildDeletedDiff(before);
    }

    if (before !== null && after !== null) {
      return this.buildModifiedDiff(filePath, before, after);
    }

    // Both null — shouldn't happen, return empty diff
    return {
      before: null,
      after: null,
      hunks: [],
      linesAdded: 0,
      linesRemoved: 0,
      estimatedTokens: 0,
    };
  }

  /**
   * File was created — all lines are additions.
   */
  private buildCreatedDiff(content: string): DiffResult {
    const lines = content.split('\n');
    const diffLines: DiffLine[] = lines.map((line, i) => ({
      type: 'added' as const,
      content: line,
      oldLineNumber: null,
      newLineNumber: i + 1,
    }));

    return {
      before: null,
      after: content,
      hunks: [{
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: lines.length,
        lines: diffLines,
      }],
      linesAdded: lines.length,
      linesRemoved: 0,
      estimatedTokens: estimateTokens(content),
    };
  }

  /**
   * File was deleted — all lines are removals.
   */
  private buildDeletedDiff(content: string): DiffResult {
    const lines = content.split('\n');
    const diffLines: DiffLine[] = lines.map((line, i) => ({
      type: 'removed' as const,
      content: line,
      oldLineNumber: i + 1,
      newLineNumber: null,
    }));

    return {
      before: content,
      after: null,
      hunks: [{
        oldStart: 1,
        oldLines: lines.length,
        newStart: 0,
        newLines: 0,
        lines: diffLines,
      }],
      linesAdded: 0,
      linesRemoved: lines.length,
      estimatedTokens: estimateTokens(content),
    };
  }

  /**
   * File was modified — compute structured patch.
   */
  private buildModifiedDiff(
    filePath: string,
    before: string,
    after: string
  ): DiffResult {
    const patch = structuredPatch(
      filePath,
      filePath,
      before,
      after,
      '',
      '',
      { context: 3 }
    );

    let totalAdded = 0;
    let totalRemoved = 0;
    let totalAddedChars = 0;
    let totalRemovedChars = 0;

    const hunks: DiffHunk[] = patch.hunks.map(hunk => {
      const diffLines: DiffLine[] = [];
      let oldLine = hunk.oldStart;
      let newLine = hunk.newStart;

      for (const rawLine of hunk.lines) {
        const prefix = rawLine[0];
        const content = rawLine.slice(1);

        if (prefix === '+') {
          diffLines.push({
            type: 'added',
            content,
            oldLineNumber: null,
            newLineNumber: newLine,
          });
          newLine++;
          totalAdded++;
          totalAddedChars += content.length;
        } else if (prefix === '-') {
          diffLines.push({
            type: 'removed',
            content,
            oldLineNumber: oldLine,
            newLineNumber: null,
          });
          oldLine++;
          totalRemoved++;
          totalRemovedChars += content.length;
        } else {
          // Context line (space prefix or no prefix)
          diffLines.push({
            type: 'context',
            content,
            oldLineNumber: oldLine,
            newLineNumber: newLine,
          });
          oldLine++;
          newLine++;
        }
      }

      return {
        oldStart: hunk.oldStart,
        oldLines: hunk.oldLines,
        newStart: hunk.newStart,
        newLines: hunk.newLines,
        lines: diffLines,
      };
    });

    return {
      before,
      after,
      hunks,
      linesAdded: totalAdded,
      linesRemoved: totalRemoved,
      estimatedTokens: estimateTokens(' '.repeat(totalAddedChars + totalRemovedChars)),
    };
  }
}
