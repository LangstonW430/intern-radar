/**
 * Rocchio preference-vector update: the resume embedding nudged toward
 * liked/applied listings and away from disliked ones, re-normalized so
 * cosine similarity stays a dot product.
 */

const ALPHA = 1.0;
const BETA = 0.5;
const GAMMA = 0.3;

function mean(vectors: number[][], dim: number): number[] {
  const out = new Array<number>(dim).fill(0);
  if (vectors.length === 0) return out;
  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) out[i] += vec[i];
  }
  return out.map((x) => x / vectors.length);
}

export function computePreferenceVector(
  resume: number[],
  liked: number[][],
  disliked: number[][],
): number[] {
  const dim = resume.length;
  const likedMean = mean(liked, dim);
  const dislikedMean = mean(disliked, dim);
  const combined = resume.map(
    (r, i) => ALPHA * r + BETA * likedMean[i] - GAMMA * dislikedMean[i],
  );
  const norm = Math.sqrt(combined.reduce((sum, x) => sum + x * x, 0));
  if (norm === 0) return resume;
  return combined.map((x) => x / norm);
}
