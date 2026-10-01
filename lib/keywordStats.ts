/**
 * Document-frequency statistics over active listings with a fetched JD,
 * kept incrementally in the single-document keywordStats table. Pure logic
 * here; Convex wrappers in convex/keywordStats.ts.
 */

export interface KeywordStats {
  /** Number of active listings with a fetched JD. */
  totalWithJd: number;
  /** keyword id → number of those listings containing it. */
  df: Record<string, number>;
}

export function emptyKeywordStats(): KeywordStats {
  return { totalWithJd: 0, df: {} };
}

/** What one listing currently adds to the stats (nothing unless it is an
 * active listing with a fetched JD). */
export interface StatsContribution {
  contributes: boolean;
  keywordIds: string[];
}

/**
 * Mutates stats in place for one listing's transition (JD import, re-fetch,
 * deactivation, reactivation). Returns whether anything changed.
 */
export function applyTransition(
  stats: KeywordStats,
  before: StatsContribution,
  after: StatsContribution,
): boolean {
  if (!before.contributes && !after.contributes) return false;
  let changed = false;
  if (before.contributes) {
    stats.totalWithJd = Math.max(0, stats.totalWithJd - 1);
    for (const id of before.keywordIds) {
      const next = (stats.df[id] ?? 0) - 1;
      if (next > 0) stats.df[id] = next;
      else delete stats.df[id];
    }
    changed = true;
  }
  if (after.contributes) {
    stats.totalWithJd += 1;
    for (const id of after.keywordIds) {
      stats.df[id] = (stats.df[id] ?? 0) + 1;
    }
    changed = true;
  }
  return changed;
}

/**
 * Smoothed inverse document frequency: log((N+1)/(df+1)) + 1, optionally
 * clamped so one ultra-rare keyword can't dominate a score.
 */
export function idf(df: number, total: number, max = Infinity): number {
  const bounded = Math.min(Math.max(df, 0), Math.max(total, 0));
  return Math.min(Math.log((total + 1) / (bounded + 1)) + 1, max);
}
