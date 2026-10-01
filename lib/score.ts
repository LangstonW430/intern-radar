export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

const DEFAULT_NO_JD_PENALTY = 0.6;

/** NO_JD_PENALTY env parsing: a fixed post-model multiplier, never learned. */
export function parseNoJdPenalty(raw: string | undefined): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    return DEFAULT_NO_JD_PENALTY;
  }
  return value;
}
