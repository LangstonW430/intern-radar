import type { KeywordWeightMap } from "./keywordWeights";

/** Pure math behind /admin: feedback quality by cohort, weight drift. */

const POSITIVE_KINDS = new Set(["applied", "thumbs_up", "good_suggestion"]);
const NEGATIVE_KINDS = new Set(["thumbs_down", "bad_suggestion"]);

export interface RateEvent {
  kind: string;
  /** Was the match surfaced as an exploration wildcard? */
  exploration: boolean;
}

export interface GroupRate {
  positive: number;
  negative: number;
  /** positive / (positive + negative), null with no signal. */
  rate: number | null;
}

function groupRate(events: RateEvent[]): GroupRate {
  const positive = events.filter((e) => POSITIVE_KINDS.has(e.kind)).length;
  const negative = events.filter((e) => NEGATIVE_KINDS.has(e.kind)).length;
  const total = positive + negative;
  return { positive, negative, rate: total === 0 ? null : positive / total };
}

/** Positive-feedback rate for top-ranked matches vs exploration wildcards. */
export function feedbackRates(events: RateEvent[]): {
  top: GroupRate;
  exploration: GroupRate;
} {
  return {
    top: groupRate(events.filter((e) => !e.exploration)),
    exploration: groupRate(events.filter((e) => e.exploration)),
  };
}

export interface WeightDriftEntry {
  id: string;
  weight: number;
  initial: number;
  drift: number; // |weight - initial|
}

/** The keywords whose learned weights moved furthest from their anchors,
 * across all profiles (per keyword, the largest mover wins). */
export function topWeightDrift(
  maps: KeywordWeightMap[],
  n = 10,
): WeightDriftEntry[] {
  const best = new Map<string, WeightDriftEntry>();
  for (const map of maps) {
    for (const [id, entry] of Object.entries(map)) {
      const drift = Math.abs(entry.weight - entry.initial);
      if (drift === 0) continue;
      const existing = best.get(id);
      if (!existing || drift > existing.drift) {
        best.set(id, {
          id,
          weight: entry.weight,
          initial: entry.initial,
          drift,
        });
      }
    }
  }
  return [...best.values()].sort((a, b) => b.drift - a.drift).slice(0, n);
}
