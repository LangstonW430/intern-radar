/** Ranking metrics for the eval-label set (scripts/eval.ts). */

export interface ScoredLabel {
  score: number;
  y: 0 | 1;
}

/** Of the top k by score, the fraction labeled good. Uses all rows when
 * fewer than k exist; null on an empty set. */
export function precisionAtK(rows: ScoredLabel[], k = 10): number | null {
  if (rows.length === 0) return null;
  const top = [...rows].sort((a, b) => b.score - a.score).slice(0, k);
  return top.filter((r) => r.y === 1).length / top.length;
}

/** Rank-based AUC (Mann–Whitney), average ranks on ties. Null when the set
 * has no positives or no negatives. */
export function rankAuc(rows: ScoredLabel[]): number | null {
  const nPos = rows.filter((r) => r.y === 1).length;
  const nNeg = rows.length - nPos;
  if (nPos === 0 || nNeg === 0) return null;

  const sorted = [...rows].sort((a, b) => a.score - b.score);
  const ranks = new Array<number>(sorted.length);
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].score === sorted[i].score) {
      j++;
    }
    const avgRank = (i + j) / 2 + 1; // 1-based average rank across the tie
    for (let t = i; t <= j; t++) ranks[t] = avgRank;
    i = j + 1;
  }

  let posRankSum = 0;
  sorted.forEach((row, i) => {
    if (row.y === 1) posRankSum += ranks[i];
  });
  return (posRankSum - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}
