import type { Interest } from "./schemas/profileSeed";
import type { ScoringConfig } from "./scoringConfig";
import { keywordIdForInterest } from "./vocabulary";

/**
 * The per-user keyword → weight map stored on the profile. `initial` is the
 * weight's anchor (from interests or a direct edit); learning moves `weight`
 * and decays it back toward `initial`. Pure logic here; Convex mutations in
 * convex/profile.ts and convex/keywordLearn.ts.
 */

export interface KeywordWeight {
  weight: number;
  initial: number;
  source: "user" | "learned";
  sightings: number;
}

export type KeywordWeightMap = Record<string, KeywordWeight>;

export function clampWeight(value: number, config: ScoringConfig): number {
  const [lo, hi] = config.weightClamp;
  return Math.min(hi, Math.max(lo, value));
}

function interestInitialWeight(
  interest: Interest,
  config: ScoringConfig,
): number | null {
  if (interest.strength !== "strong" && interest.strength !== "soft") {
    return null; // hard stays a filter, ignore contributes nothing
  }
  return config.initialWeights[interest.tag][interest.strength];
}

/** keyword id → initial weight implied by the interests alone. When two
 * interests collide on one canonical id, the larger magnitude wins. */
export function initialsFromInterests(
  interests: Interest[],
  config: ScoringConfig,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const interest of interests) {
    const weight = interestInitialWeight(interest, config);
    if (weight === null) continue;
    const id = keywordIdForInterest(interest.keyword);
    if (!(id in out) || Math.abs(weight) > Math.abs(out[id])) {
      out[id] = weight;
    }
  }
  return out;
}

/** Fresh map for a new profile (onboarding, migration). */
export function initialKeywordWeights(
  interests: Interest[],
  config: ScoringConfig,
): KeywordWeightMap {
  const map: KeywordWeightMap = {};
  for (const [id, weight] of Object.entries(
    initialsFromInterests(interests, config),
  )) {
    map[id] = { weight, initial: weight, source: "user", sightings: 0 };
  }
  return map;
}

/**
 * Re-derives interest initials after an interests edit. Only keywords whose
 * interest-implied initial actually changed are rewritten, so learned
 * weights and direct edits on untouched keywords survive a settings save.
 */
export function applyInterestChange(
  existing: KeywordWeightMap,
  oldInterests: Interest[],
  newInterests: Interest[],
  config: ScoringConfig,
): KeywordWeightMap {
  const prev = initialsFromInterests(oldInterests, config);
  const next = initialsFromInterests(newInterests, config);
  const out: KeywordWeightMap = { ...existing };
  for (const [id, weight] of Object.entries(next)) {
    if (out[id] && prev[id] === weight) continue;
    out[id] = {
      weight,
      initial: weight,
      source: "user",
      sightings: out[id]?.sightings ?? 0,
    };
  }
  for (const [id, weight] of Object.entries(prev)) {
    if (id in next) continue;
    const entry = out[id];
    // Only entries still resting on the removed interest are affected; a
    // direct edit (different initial) is the user's, not the interest's.
    if (!entry || entry.initial !== weight) continue;
    if (entry.weight === entry.initial) {
      delete out[id];
    } else {
      out[id] = { ...entry, initial: 0, source: "learned" };
    }
  }
  return out;
}

/** Direct settings edit: the new weight becomes the user's anchor. */
export function setUserWeight(
  map: KeywordWeightMap,
  id: string,
  weight: number,
  config: ScoringConfig,
): KeywordWeightMap {
  const clamped = clampWeight(weight, config);
  return {
    ...map,
    [id]: {
      weight: clamped,
      initial: clamped,
      source: "user",
      sightings: map[id]?.sightings ?? 0,
    },
  };
}

export function removeKeywordWeight(
  map: KeywordWeightMap,
  id: string,
): KeywordWeightMap {
  const out = { ...map };
  delete out[id];
  return out;
}

/** "Reset learned weights": every entry returns to its anchor; entries that
 * exist only through learning disappear. */
export function resetLearnedWeights(map: KeywordWeightMap): KeywordWeightMap {
  const out: KeywordWeightMap = {};
  for (const [id, entry] of Object.entries(map)) {
    if (entry.initial === 0 && entry.source === "learned") continue;
    out[id] = { ...entry, weight: entry.initial, sightings: 0 };
  }
  return out;
}
