import { describe, expect, it } from "vitest";
import { precisionAtK, rankAuc, type ScoredLabel } from "./evalMetrics";

const row = (score: number, y: 0 | 1): ScoredLabel => ({ score, y });

describe("precisionAtK", () => {
  it("counts good labels in the top k by score", () => {
    const rows = [
      row(0.9, 1),
      row(0.8, 1),
      row(0.7, 0),
      row(0.6, 1),
      row(0.5, 0),
    ];
    expect(precisionAtK(rows, 3)).toBeCloseTo(2 / 3, 10);
  });

  it("uses all rows when fewer than k, null when empty", () => {
    expect(precisionAtK([row(0.9, 1), row(0.1, 0)], 10)).toBe(0.5);
    expect(precisionAtK([], 10)).toBeNull();
  });
});

describe("rankAuc", () => {
  it("is 1 for a perfect ranking and 0 for a reversed one", () => {
    const perfect = [row(0.9, 1), row(0.8, 1), row(0.2, 0), row(0.1, 0)];
    expect(rankAuc(perfect)).toBe(1);
    const reversed = [row(0.9, 0), row(0.8, 0), row(0.2, 1), row(0.1, 1)];
    expect(rankAuc(reversed)).toBe(0);
  });

  it("matches the pairwise definition on a mixed fixture", () => {
    // pairs (pos > neg): (0.8 vs 0.3), (0.8 vs 0.5)=yes, (0.4 vs 0.3)=yes,
    // (0.4 vs 0.5)=no → 3/4
    const rows = [row(0.8, 1), row(0.5, 0), row(0.4, 1), row(0.3, 0)];
    expect(rankAuc(rows)).toBeCloseTo(0.75, 10);
  });

  it("gives ties half credit", () => {
    const rows = [row(0.5, 1), row(0.5, 0)];
    expect(rankAuc(rows)).toBe(0.5);
  });

  it("is null without both classes", () => {
    expect(rankAuc([row(0.9, 1)])).toBeNull();
    expect(rankAuc([row(0.9, 0), row(0.1, 0)])).toBeNull();
  });
});
