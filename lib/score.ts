import { FEATURE_NAMES, toVector } from "./features";

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export interface ScoreResult {
  rawScore: number;
  score: number;
}

/**
 * rawScore = sigmoid(w · x); score applies the fixed NO_JD_PENALTY
 * multiplier when the listing has no JD (decision D7 — config, never a
 * learned weight).
 */
export function scoreFeatures(
  features: Record<string, number>,
  weights: number[],
  options: { hasJd: boolean; noJdPenalty: number },
): ScoreResult {
  if (weights.length !== FEATURE_NAMES.length) {
    throw new Error(
      `expected ${FEATURE_NAMES.length} weights, got ${weights.length}`,
    );
  }
  const rawScore = sigmoid(dotProduct(toVector(features), weights));
  const score = options.hasJd ? rawScore : rawScore * options.noJdPenalty;
  return { rawScore, score };
}

export function parseNoJdPenalty(raw: string | undefined): number {
  const value = Number(raw);
  if (!raw || Number.isNaN(value) || value <= 0 || value > 1) return 0.6;
  return value;
}
