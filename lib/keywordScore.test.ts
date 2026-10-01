import { describe, expect, it } from "vitest";
import {
  agePenalty,
  breakdownLogit,
  customKeywordHits,
  keywordIdf,
  scoreListing,
  trimBreakdown,
} from "./keywordScore";
import { idf, type KeywordStats } from "./keywordStats";
import type { KeywordWeightMap } from "./keywordWeights";
import { sigmoid } from "./score";
import { SCORING_CONFIG } from "./scoringConfig";

const stats: KeywordStats = {
  totalWithJd: 99,
  df: { python: 49, "machine-learning": 9 },
};

const entry = (weight: number) => ({
  weight,
  initial: weight,
  source: "user" as const,
  sightings: 0,
});

describe("keywordIdf", () => {
  it("uses corpus stats for vocabulary keywords, clamped", () => {
    expect(keywordIdf("python", stats, SCORING_CONFIG)).toBe(
      idf(49, 99, SCORING_CONFIG.idfMax),
    );
    expect(keywordIdf("never-seen", stats, SCORING_CONFIG)).toBe(
      Math.min(Math.log(100) + 1, SCORING_CONFIG.idfMax),
    );
  });

  it("gives custom keywords the fixed default", () => {
    expect(keywordIdf("custom:basket-weaving", stats, SCORING_CONFIG)).toBe(
      SCORING_CONFIG.defaultIdf,
    );
  });
});

describe("scoreListing", () => {
  const weights: KeywordWeightMap = {
    python: entry(1.0),
    "machine-learning": entry(0.5),
    blockchain: entry(-1.5),
    unused: entry(2.0),
  };
  const input = {
    structural: { recency: 0.8, work_mode_match: 1 },
    structuralWeights: { recency: 0.5, work_mode_match: 0.4 },
    listingKeywords: { python: 1.5, "machine-learning": 1.0 },
    customHits: {},
    keywordWeights: weights,
    stats,
    hasJd: true,
    noJdPenalty: 0.6,
  };

  it("breakdown contributions sum exactly to the logit", () => {
    const result = scoreListing(input);
    expect(breakdownLogit(result.breakdown)).toBeCloseTo(result.logit, 12);
    expect(result.rawScore).toBeCloseTo(sigmoid(result.logit), 12);
  });

  it("computes keyword terms as weight × idf × position", () => {
    const result = scoreListing(input);
    const python = result.breakdown.keywords.find((k) => k.id === "python")!;
    expect(python.contribution).toBeCloseTo(
      1.0 * idf(49, 99, SCORING_CONFIG.idfMax) * 1.5,
      12,
    );
    // keywords the listing doesn't contain contribute nothing
    expect(
      result.breakdown.keywords.find((k) => k.id === "unused"),
    ).toBeUndefined();
  });

  it("weights structural terms by their fixed weights", () => {
    const result = scoreListing(input);
    const recency = result.breakdown.structural.find(
      (s) => s.name === "recency",
    )!;
    expect(recency.contribution).toBeCloseTo(0.4, 12);
  });

  it("applies the no-JD penalty after the sigmoid", () => {
    const withJd = scoreListing(input);
    const withoutJd = scoreListing({ ...input, hasJd: false });
    expect(withJd.score).toBe(withJd.rawScore);
    expect(withoutJd.score).toBeCloseTo(withoutJd.rawScore * 0.6, 12);
  });

  it("applies the age penalty multiplicatively, stacking with no-JD", () => {
    const fresh = scoreListing({ ...input, ageDays: 3 });
    expect(fresh.score).toBe(fresh.rawScore);
    const stale = scoreListing({ ...input, ageDays: 30 });
    expect(stale.score).toBeCloseTo(stale.rawScore * agePenalty(30), 12);
    expect(stale.rawScore).toBe(fresh.rawScore); // penalty is post-model
    const staleNoJd = scoreListing({ ...input, ageDays: 30, hasJd: false });
    expect(staleNoJd.score).toBeCloseTo(
      staleNoJd.rawScore * 0.6 * agePenalty(30),
      12,
    );
  });

  it("negative keyword weights pull the score down", () => {
    const withAvoid = scoreListing({
      ...input,
      listingKeywords: { ...input.listingKeywords, blockchain: 1.0 },
    });
    const without = scoreListing(input);
    expect(withAvoid.score).toBeLessThan(without.score);
    const avoid = withAvoid.breakdown.keywords.find(
      (k) => k.id === "blockchain",
    )!;
    expect(avoid.contribution).toBeLessThan(0);
  });
});

describe("agePenalty", () => {
  const { graceDays, halfLifeDays, floor } = SCORING_CONFIG.agePenalty;

  it("is 1 through the grace window", () => {
    expect(agePenalty(0)).toBe(1);
    expect(agePenalty(graceDays)).toBe(1);
  });

  it("halves every halfLifeDays past the grace window, monotonically", () => {
    expect(agePenalty(graceDays + halfLifeDays)).toBeCloseTo(0.5, 12);
    expect(agePenalty(graceDays + 2 * halfLifeDays)).toBeCloseTo(0.25, 12);
    expect(agePenalty(10)).toBeGreaterThan(agePenalty(20));
    expect(agePenalty(20)).toBeGreaterThan(agePenalty(40));
  });

  it("never drops below the floor", () => {
    expect(agePenalty(10_000)).toBe(floor);
  });
});

describe("customKeywordHits", () => {
  const weights: KeywordWeightMap = {
    "custom:basket-weaving": entry(1.0),
    "custom:cheese-making": entry(0.5),
    python: entry(1.0),
  };

  it("matches custom keywords live with position weights", () => {
    const hits = customKeywordHits(
      weights,
      "Basket Weaving Intern",
      "We also do cheese making here.",
      SCORING_CONFIG,
    );
    expect(hits["custom:basket-weaving"]).toBe(
      SCORING_CONFIG.positionWeights.title,
    );
    expect(hits["custom:cheese-making"]).toBe(
      SCORING_CONFIG.positionWeights.body,
    );
    // vocabulary keywords are not matched here
    expect(hits["python"]).toBeUndefined();
  });

  it("ignores the JD when there is none", () => {
    const hits = customKeywordHits(
      weights,
      "SWE Intern",
      null,
      SCORING_CONFIG,
    );
    expect(hits).toEqual({});
  });
});

describe("trimBreakdown", () => {
  it("keeps top contributions per sign and preserves the logit sum", () => {
    const keywords = Array.from({ length: 8 }, (_, i) => ({
      id: `kw-${i}`,
      weight: 1,
      idf: 1,
      position: 1,
      contribution: i + 1,
    })).concat([
      { id: "neg", weight: -1, idf: 1, position: 1, contribution: -2 },
    ]);
    const breakdown = {
      bias: -1,
      keywords: [...keywords].sort(
        (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution),
      ),
      keywordOther: 0,
      structural: [{ name: "recency", value: 1, weight: 0.5, contribution: 0.5 }],
    };
    const before = breakdownLogit(breakdown);
    const trimmed = trimBreakdown(breakdown, 3);
    expect(trimmed.keywords).toHaveLength(4); // 3 positive + 1 negative
    expect(trimmed.keywords.map((k) => k.id)).toContain("neg");
    expect(breakdownLogit(trimmed)).toBeCloseTo(before, 12);
    expect(trimmed.keywordOther).toBeCloseTo(1 + 2 + 3 + 4 + 5, 12);
  });
});
