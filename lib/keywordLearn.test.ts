import { describe, expect, it } from "vitest";
import type { FeedbackEvent } from "./feedbackAggregate";
import {
  applyFeedbackStep,
  replayWeights,
  replayWithPinnedWeight,
  type ReplayListingInput,
} from "./keywordLearn";
import { keywordIdf } from "./keywordScore";
import type { KeywordStats } from "./keywordStats";
import type { KeywordWeightMap } from "./keywordWeights";
import { SCORING_CONFIG } from "./scoringConfig";

const stats: KeywordStats = {
  totalWithJd: 99,
  df: { python: 49, "machine-learning": 9 },
};
const { learningRate: LR, decay: DECAY, rareCap: CAP } =
  SCORING_CONFIG.learning;

describe("applyFeedbackStep", () => {
  it("moves present keywords toward positive feedback and creates entries", () => {
    const next = applyFeedbackStep({}, { python: 1.5 }, 1, 1, 0.5, stats);
    expect(next["python"].weight).toBeGreaterThan(0);
    expect(next["python"].source).toBe("learned");
    expect(next["python"].initial).toBe(0);
    expect(next["python"].sightings).toBe(1);
  });

  it("moves weights down on negative feedback", () => {
    const weights: KeywordWeightMap = {
      python: { weight: 1.0, initial: 1.0, source: "user", sightings: 10 },
    };
    const next = applyFeedbackStep(weights, { python: 1.0 }, 0, 1, 0.8, stats);
    expect(next["python"].weight).toBeLessThan(1.0);
    expect(next["python"].source).toBe("user"); // user anchors keep their source
    expect(next["python"].sightings).toBe(11);
    // input map is untouched
    expect(weights["python"].weight).toBe(1.0);
  });

  it("uses the lr·sw·(y−p)·idf·pos step when under the cap", () => {
    const sightings = 100; // cap = CAP/100, tiny — so use a well-seen keyword
    const weights: KeywordWeightMap = {
      python: { weight: 0, initial: 0, source: "learned", sightings },
    };
    const p = 0.5;
    const raw = LR * 1 * (1 - p) * keywordIdf("python", stats) * 1.0;
    const capped = Math.min(raw, CAP / sightings);
    const expected = (0 + capped) * (1 - LR * DECAY);
    const next = applyFeedbackStep(weights, { python: 1.0 }, 1, 1, p, stats);
    expect(next["python"].weight).toBeCloseTo(expected, 10);
  });

  it("caps the step for rarely seen keywords", () => {
    // sightings 0 → cap CAP; the raw step (lr·2·0.9·idf·1.5) is far larger.
    const next = applyFeedbackStep(
      {},
      { "machine-learning": 1.5 },
      1,
      2,
      0.1,
      stats,
    );
    const expected = CAP * (1 - LR * DECAY);
    expect(next["machine-learning"].weight).toBeCloseTo(expected, 10);
  });

  it("decays toward the anchor", () => {
    const weights: KeywordWeightMap = {
      python: { weight: 2.0, initial: 1.0, source: "user", sightings: 1000 },
    };
    // p == y’s probability mass → tiny gradient; decay dominates.
    const next = applyFeedbackStep(weights, { python: 1.0 }, 1, 1, 0.999, stats);
    expect(next["python"].weight).toBeLessThan(2.0);
    expect(next["python"].weight).toBeGreaterThan(1.0);
  });

  it("clamps to the configured bounds", () => {
    const [, hi] = SCORING_CONFIG.weightClamp;
    const weights: KeywordWeightMap = {
      python: { weight: hi, initial: hi, source: "user", sightings: 0 },
    };
    const next = applyFeedbackStep(weights, { python: 1.5 }, 1, 2, 0.01, stats);
    expect(next["python"].weight).toBeLessThanOrEqual(hi);
  });

  it("leaves absent keywords untouched", () => {
    const weights: KeywordWeightMap = {
      rust: { weight: 1.0, initial: 1.0, source: "user", sightings: 2 },
    };
    const next = applyFeedbackStep(weights, { python: 1.0 }, 1, 1, 0.5, stats);
    expect(next["rust"]).toEqual(weights["rust"]);
  });
});

describe("replayWeights", () => {
  const anchors: KeywordWeightMap = {
    python: { weight: 1.7, initial: 1.0, source: "user", sightings: 9 },
    stray: { weight: -0.4, initial: 0, source: "learned", sightings: 3 },
  };
  const listings = new Map<string, ReplayListingInput>([
    [
      "listing-a",
      {
        structural: { recency: 1 },
        listingKeywords: { python: 1.5 },
        customHits: {},
        hasJd: true,
      },
    ],
    [
      "listing-b",
      {
        structural: { recency: 0.5 },
        listingKeywords: { python: 1.0, "machine-learning": 1.2 },
        customHits: { "custom:basket-weaving": 1.0 },
        hasJd: true,
      },
    ],
  ]);
  const events: FeedbackEvent[] = [
    { userId: "u", listingId: "listing-a", kind: "thumbs_up", createdAt: 1 },
    { userId: "u", listingId: "listing-b", kind: "thumbs_down", createdAt: 2 },
    { userId: "u", listingId: "listing-a", kind: "applied", createdAt: 3 },
  ];
  const input = {
    anchors,
    events,
    listings,
    structuralWeights: { recency: 0.5 },
    stats,
  };

  it("is deterministic", () => {
    expect(replayWeights(input)).toEqual(replayWeights(input));
  });

  it("is order-insensitive in its event input", () => {
    const shuffled = { ...input, events: [...events].reverse() };
    expect(replayWeights(shuffled)).toEqual(replayWeights(input));
  });

  it("restarts from anchors: learned-only entries vanish unless re-learned", () => {
    const noEvents = replayWeights({ ...input, events: [] });
    expect(noEvents["python"]).toEqual({
      weight: 1.0,
      initial: 1.0,
      source: "user",
      sightings: 0,
    });
    expect(noEvents["stray"]).toBeUndefined();
  });

  it("learns in the right directions from the history", () => {
    const result = replayWeights(input);
    // The applied event on listing-a (y=1, sample weight 2) raises python
    // relative to the same history without it.
    const withoutApplied = replayWeights({
      ...input,
      events: events.slice(0, 2),
    });
    expect(result["python"].weight).toBeGreaterThan(
      withoutApplied["python"].weight,
    );
    expect(result["python"].sightings).toBe(3);
    // listing-b's thumbs_down pushes its unique keywords negative.
    expect(result["machine-learning"].weight).toBeLessThan(0);
    expect(result["custom:basket-weaving"].weight).toBeLessThan(0);
  });

  it("skips events on unknown listings", () => {
    const withGhost = {
      ...input,
      events: [
        ...events,
        { userId: "u", listingId: "ghost", kind: "thumbs_up" as const, createdAt: 4 },
      ],
    };
    expect(replayWeights(withGhost)).toEqual(replayWeights(input));
  });
});

describe("replayWithPinnedWeight", () => {
  const listings = new Map<string, ReplayListingInput>([
    [
      "listing-a",
      {
        structural: {},
        listingKeywords: { python: 1.5 },
        customHits: {},
        hasJd: true,
      },
    ],
  ]);
  const events: FeedbackEvent[] = [
    { userId: "u", listingId: "listing-a", kind: "thumbs_up", createdAt: 1 },
    { userId: "u", listingId: "listing-a", kind: "applied", createdAt: 2 },
  ];
  const input = {
    anchors: {
      python: { weight: -1.5, initial: -1.5, source: "user", sightings: 0 },
    } as KeywordWeightMap,
    events,
    listings,
    structuralWeights: {},
    stats,
  };

  it("keeps the entered weight where a plain replay would drift", () => {
    expect(replayWeights(input)["python"].weight).not.toBeCloseTo(-1.5, 3);
    const pinned = replayWithPinnedWeight(input, "python", -1.5);
    expect(pinned["python"].weight).toBe(-1.5);
    expect(pinned["python"].source).toBe("user");
    expect(pinned["python"].sightings).toBe(2);
  });

  it("solves the anchor so replaying from it lands on the entered weight", () => {
    const pinned = replayWithPinnedWeight(input, "python", -1.5);
    expect(pinned["python"].initial).toBeLessThan(-1.5); // feedback was positive
    const again = replayWeights({ ...input, anchors: pinned });
    expect(again["python"].weight).toBeCloseTo(-1.5, 6);
  });

  it("uses the entered weight as the anchor when no feedback touches it", () => {
    const pinned = replayWithPinnedWeight(input, "rust", 0.8);
    expect(pinned["rust"]).toMatchObject({ weight: 0.8, initial: 0.8 });
  });
});
