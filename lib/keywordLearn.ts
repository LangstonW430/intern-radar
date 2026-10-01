import {
  aggregateTrainingRows,
  type FeedbackEvent,
} from "./feedbackAggregate";
import { keywordIdf, scoreListing } from "./keywordScore";
import type { KeywordStats } from "./keywordStats";
import { clampWeight, type KeywordWeightMap } from "./keywordWeights";
import { SCORING_CONFIG, type ScoringConfig } from "./scoringConfig";

/**
 * Online learning: each feedback event applies one logistic-regression step
 * to the user's keyword weights, for the keywords present in that listing:
 *
 *   Δw_k = lr · sampleWeight · (y − p) · idf_k · position_k
 *
 * capped for rarely-seen keywords, then decayed toward the anchor and
 * clamped. p is the model's current probability (rawScore, pre-penalty).
 * Replay re-derives the whole map from the feedback history — the same
 * steps in the same order — so it is deterministic given current stats.
 */

/** One learning step. Returns a new map; never mutates the input. */
export function applyFeedbackStep(
  weights: KeywordWeightMap,
  presentKeywords: Record<string, number>,
  y: 0 | 1,
  sampleWeight: number,
  p: number,
  stats: KeywordStats,
  config: ScoringConfig = SCORING_CONFIG,
): KeywordWeightMap {
  const { learningRate: lr, decay, rareCap } = config.learning;
  const out = { ...weights };
  for (const [id, position] of Object.entries(presentKeywords)) {
    const existing = out[id] ?? {
      weight: 0,
      initial: 0,
      source: "learned" as const,
      sightings: 0,
    };
    const kidf = keywordIdf(id, stats, config);
    const cap = rareCap / Math.max(1, existing.sightings);
    const delta = Math.max(
      -cap,
      Math.min(cap, lr * sampleWeight * (y - p) * kidf * position),
    );
    let weight = existing.weight + delta;
    weight -= lr * decay * (weight - existing.initial);
    out[id] = {
      weight: clampWeight(weight, config),
      initial: existing.initial,
      source: existing.source,
      sightings: existing.sightings + 1,
    };
  }
  return out;
}

export interface ReplayListingInput {
  structural: Record<string, number>;
  /** Vocabulary ids → position weights (listing.keywords). */
  listingKeywords: Record<string, number>;
  /** Custom ids → position weights (customKeywordHits). */
  customHits: Record<string, number>;
  hasJd: boolean;
}

export interface ReplayInput {
  /** The anchor map — every entry restarts at weight = initial. */
  anchors: KeywordWeightMap;
  /** The user's full feedback history. */
  events: FeedbackEvent[];
  /** listingId → scoring inputs; events on unknown listings are skipped. */
  listings: Map<string, ReplayListingInput>;
  structuralWeights: Record<string, number>;
  stats: KeywordStats;
  config?: ScoringConfig;
}

/** Deterministic total order for replay. */
function sortEvents(events: FeedbackEvent[]): FeedbackEvent[] {
  return [...events].sort(
    (a, b) =>
      a.createdAt - b.createdAt ||
      a.listingId.localeCompare(b.listingId) ||
      a.kind.localeCompare(b.kind),
  );
}

/**
 * Resets to anchors and re-applies the full feedback history in order: at
 * each event, the (user, listing) pair's aggregate so far decides y and the
 * sample weight — exactly what the online step saw when that event landed.
 */
export function replayWeights(input: ReplayInput): KeywordWeightMap {
  const config = input.config ?? SCORING_CONFIG;

  let weights: KeywordWeightMap = {};
  for (const [id, entry] of Object.entries(input.anchors)) {
    if (entry.initial === 0 && entry.source !== "user") continue;
    weights[id] = { ...entry, weight: entry.initial, sightings: 0 };
  }

  const sorted = sortEvents(input.events);
  const seenByListing = new Map<string, FeedbackEvent[]>();
  for (const event of sorted) {
    const seen = seenByListing.get(event.listingId) ?? [];
    seen.push(event);
    seenByListing.set(event.listingId, seen);

    const listing = input.listings.get(event.listingId);
    if (!listing) continue;
    const [row] = aggregateTrainingRows([], seen, config.feedbackWeights);
    if (!row) continue;

    const { rawScore } = scoreListing({
      structural: listing.structural,
      structuralWeights: input.structuralWeights,
      listingKeywords: listing.listingKeywords,
      customHits: listing.customHits,
      keywordWeights: weights,
      stats: input.stats,
      config,
      hasJd: listing.hasJd,
      noJdPenalty: 1, // p is the pre-penalty probability
    });
    weights = applyFeedbackStep(
      weights,
      { ...listing.listingKeywords, ...listing.customHits },
      row.y,
      row.weight,
      rawScore,
      input.stats,
      config,
    );
  }
  return weights;
}
