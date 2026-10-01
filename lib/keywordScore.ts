import { keywordInText } from "./jdExtract";
import { idf, type KeywordStats } from "./keywordStats";
import type { KeywordWeightMap } from "./keywordWeights";
import { sigmoid } from "./score";
import { SCORING_CONFIG, type ScoringConfig } from "./scoringConfig";
import { CUSTOM_KEYWORD_PREFIX, isCustomKeywordId } from "./vocabulary";

/**
 * The score of one (listing, user) pair:
 *
 *   logit    = bias + Σ_k weight_k·idf_k·position_k + Σ_s weight_s·value_s
 *   rawScore = sigmoid(logit)
 *   score    = hasJd ? rawScore : rawScore × NO_JD_PENALTY
 *
 * Fully explainable: the breakdown's contributions sum exactly to the logit.
 */

export interface KeywordContribution {
  id: string;
  weight: number;
  idf: number;
  position: number;
  contribution: number;
}

export interface StructuralContribution {
  name: string;
  value: number;
  weight: number;
  contribution: number;
}

export interface ScoreBreakdown {
  bias: number;
  keywords: KeywordContribution[];
  /** Sum of keyword contributions trimmed out of `keywords` for storage. */
  keywordOther: number;
  structural: StructuralContribution[];
}

export interface ScoreResult {
  logit: number;
  rawScore: number;
  score: number;
  breakdown: ScoreBreakdown;
}

/**
 * Freshness multiplier: 1.0 while the posting is within the grace window,
 * then halving every halfLifeDays, floored. Applied after the sigmoid like
 * NO_JD_PENALTY, so a stale posting can never show a near-100 score.
 */
export function agePenalty(
  ageDays: number,
  config: ScoringConfig = SCORING_CONFIG,
): number {
  const { graceDays, halfLifeDays, floor } = config.agePenalty;
  if (!Number.isFinite(ageDays) || ageDays <= graceDays) return 1;
  return Math.max(floor, 2 ** (-(ageDays - graceDays) / halfLifeDays));
}

/** IDF for a weight-map key: corpus stats for vocabulary keywords, a fixed
 * default for custom ones (they're never counted in the stats). */
export function keywordIdf(
  id: string,
  stats: KeywordStats,
  config: ScoringConfig = SCORING_CONFIG,
): number {
  if (isCustomKeywordId(id)) return config.defaultIdf;
  return idf(stats.df[id] ?? 0, stats.totalWithJd, config.idfMax);
}

/**
 * Position-weighted presence of the user's custom (out-of-vocabulary)
 * keywords, matched live against the listing text — listing.keywords only
 * carries vocabulary ids.
 */
export function customKeywordHits(
  weights: KeywordWeightMap,
  title: string,
  jdText: string | null | undefined,
  config: ScoringConfig = SCORING_CONFIG,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of Object.keys(weights)) {
    if (!isCustomKeywordId(id)) continue;
    const text = id.slice(CUSTOM_KEYWORD_PREFIX.length).replace(/-/g, " ");
    if (keywordInText(text, title)) {
      out[id] = config.positionWeights.title;
    } else if (jdText && keywordInText(text, jdText)) {
      out[id] = config.positionWeights.body;
    }
  }
  return out;
}

export interface ScoreListingInput {
  structural: Record<string, number>;
  structuralWeights: Record<string, number>;
  /** Vocabulary keyword id → position weight (listing.keywords). */
  listingKeywords: Record<string, number>;
  /** Custom keyword id → position weight (customKeywordHits). */
  customHits: Record<string, number>;
  keywordWeights: KeywordWeightMap;
  stats: KeywordStats;
  config?: ScoringConfig;
  hasJd: boolean;
  noJdPenalty: number;
  /** Days since the listing was posted; 0 (no penalty) when omitted —
   * learning and eval use the pre-penalty probability. */
  ageDays?: number;
}

export function scoreListing(input: ScoreListingInput): ScoreResult {
  const config = input.config ?? SCORING_CONFIG;
  let logit = config.bias;

  const keywords: KeywordContribution[] = [];
  const present = { ...input.listingKeywords, ...input.customHits };
  for (const [id, position] of Object.entries(present)) {
    const entry = input.keywordWeights[id];
    if (!entry || entry.weight === 0) continue;
    const kidf = keywordIdf(id, input.stats, config);
    const contribution = entry.weight * kidf * position;
    logit += contribution;
    keywords.push({ id, weight: entry.weight, idf: kidf, position, contribution });
  }
  keywords.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  const structural: StructuralContribution[] = [];
  for (const [name, value] of Object.entries(input.structural)) {
    const weight = input.structuralWeights[name] ?? 0;
    const contribution = weight * value;
    logit += contribution;
    structural.push({ name, value, weight, contribution });
  }

  const rawScore = sigmoid(logit);
  const score =
    (input.hasJd ? rawScore : rawScore * input.noJdPenalty) *
    agePenalty(input.ageDays ?? 0, config);
  return {
    logit,
    rawScore,
    score,
    breakdown: { bias: config.bias, keywords, keywordOther: 0, structural },
  };
}

/**
 * Compact form for storage: the top positive and negative keyword
 * contributions, with everything trimmed summed into keywordOther so the
 * breakdown still sums exactly to the logit.
 */
export function trimBreakdown(
  breakdown: ScoreBreakdown,
  maxPerSign = 5,
): ScoreBreakdown {
  const positive = breakdown.keywords.filter((k) => k.contribution > 0);
  const negative = breakdown.keywords.filter((k) => k.contribution < 0);
  const kept = [...positive.slice(0, maxPerSign), ...negative.slice(0, maxPerSign)];
  const keptSet = new Set(kept.map((k) => k.id));
  const keywordOther =
    breakdown.keywordOther +
    breakdown.keywords
      .filter((k) => !keptSet.has(k.id))
      .reduce((sum, k) => sum + k.contribution, 0);
  return { ...breakdown, keywords: kept, keywordOther };
}

/** The logit a breakdown adds up to — used by tests and the detail view. */
export function breakdownLogit(breakdown: ScoreBreakdown): number {
  return (
    breakdown.bias +
    breakdown.keywordOther +
    breakdown.keywords.reduce((sum, k) => sum + k.contribution, 0) +
    breakdown.structural.reduce((sum, s) => sum + s.contribution, 0)
  );
}
