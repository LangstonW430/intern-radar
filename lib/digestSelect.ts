/**
 * Digest selection: top unsent matches above the user's threshold plus a few
 * random below-threshold survivors flagged as exploration wildcards.
 */

export interface DigestCandidate {
  matchId: string;
  score: number;
}

export interface DigestSelection<T extends DigestCandidate> {
  top: T[];
  wildcards: T[];
}

export function selectDigestItems<T extends DigestCandidate>(
  unsent: T[],
  options: {
    threshold: number;
    wildcards: number;
    maxTop?: number;
    random: () => number;
  },
): DigestSelection<T> {
  const sorted = [...unsent].sort((a, b) => b.score - a.score);
  const top = sorted
    .filter((c) => c.score >= options.threshold)
    .slice(0, options.maxTop ?? 10);

  const pool = sorted.filter((c) => c.score < options.threshold);
  const wildcards: T[] = [];
  for (let i = 0; i < options.wildcards && pool.length > 0; i++) {
    const idx = Math.floor(options.random() * pool.length);
    wildcards.push(pool.splice(idx, 1)[0]);
  }
  return { top, wildcards };
}

/** Whether this frequency's send window is open right now (UTC). */
export function shouldSendDigest(
  frequency: "instant" | "daily" | "weekly",
  lastDigestAt: number | undefined,
  now: number,
): boolean {
  const date = new Date(now);
  const sinceLast = lastDigestAt === undefined ? Infinity : now - lastDigestAt;
  switch (frequency) {
    case "instant":
      return true; // presence of candidates decides
    case "daily":
      return date.getUTCHours() === 13 && sinceLast >= 20 * 3600_000;
    case "weekly":
      return (
        date.getUTCDay() === 1 &&
        date.getUTCHours() === 13 &&
        sinceLast >= 6 * 86_400_000
      );
  }
}
