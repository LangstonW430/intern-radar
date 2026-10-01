import { describe, expect, it } from "vitest";
import {
  applyInterestChange,
  initialKeywordWeights,
  resetLearnedWeights,
  setUserWeight,
} from "./keywordWeights";
import type { Interest } from "./schemas/profileSeed";
import { SCORING_CONFIG } from "./scoringConfig";

const want = (keyword: string, strength: Interest["strength"]): Interest => ({
  keyword,
  tag: "want",
  strength,
});
const avoid = (keyword: string, strength: Interest["strength"]): Interest => ({
  keyword,
  tag: "avoid",
  strength,
});

describe("initialKeywordWeights", () => {
  it("maps strength and tag to the configured initials", () => {
    const map = initialKeywordWeights(
      [
        want("machine learning", "strong"),
        want("kubernetes", "soft"),
        avoid("blockchain", "strong"),
        avoid("sales", "soft"),
      ],
      SCORING_CONFIG,
    );
    expect(map["machine-learning"]).toEqual({
      weight: 1.0,
      initial: 1.0,
      source: "user",
      sightings: 0,
    });
    expect(map["kubernetes"].weight).toBe(0.5);
    expect(map["blockchain"].weight).toBe(-1.5);
    expect(map["custom:sales"].weight).toBe(-0.75);
  });

  it("excludes hard and ignore interests", () => {
    const map = initialKeywordWeights(
      [want("python", "hard"), want("rust", "ignore")],
      SCORING_CONFIG,
    );
    expect(map).toEqual({});
  });

  it("canonicalizes aliases so duplicates collapse, larger magnitude wins", () => {
    const map = initialKeywordWeights(
      [want("k8s", "soft"), avoid("kubernetes", "strong")],
      SCORING_CONFIG,
    );
    expect(Object.keys(map)).toEqual(["kubernetes"]);
    expect(map["kubernetes"].weight).toBe(-1.5);
  });
});

describe("applyInterestChange", () => {
  it("leaves learned weights alone when the interest is unchanged", () => {
    const interests = [want("python", "strong")];
    const existing = {
      python: { weight: 2.1, initial: 1.0, source: "learned" as const, sightings: 7 },
    };
    const next = applyInterestChange(
      existing,
      interests,
      interests,
      SCORING_CONFIG,
    );
    expect(next["python"]).toEqual(existing["python"]);
  });

  it("re-anchors a keyword whose interest strength changed", () => {
    const next = applyInterestChange(
      { python: { weight: 2.1, initial: 1.0, source: "learned", sightings: 7 } },
      [want("python", "strong")],
      [want("python", "soft")],
      SCORING_CONFIG,
    );
    expect(next["python"]).toEqual({
      weight: 0.5,
      initial: 0.5,
      source: "user",
      sightings: 7,
    });
  });

  it("drops an un-learned entry when its interest is removed", () => {
    const next = applyInterestChange(
      { python: { weight: 1.0, initial: 1.0, source: "user", sightings: 0 } },
      [want("python", "strong")],
      [],
      SCORING_CONFIG,
    );
    expect(next["python"]).toBeUndefined();
  });

  it("keeps a learned weight when its interest is removed, re-anchored at 0", () => {
    const next = applyInterestChange(
      { python: { weight: 1.8, initial: 1.0, source: "learned", sightings: 5 } },
      [want("python", "strong")],
      [],
      SCORING_CONFIG,
    );
    expect(next["python"]).toEqual({
      weight: 1.8,
      initial: 0,
      source: "learned",
      sightings: 5,
    });
  });

  it("preserves a direct user edit when interests are re-saved unchanged", () => {
    // User set python to 2.5 by hand after adding it as a strong want.
    const edited = {
      python: { weight: 2.5, initial: 2.5, source: "user" as const, sightings: 3 },
    };
    const interests = [want("python", "strong")];
    const next = applyInterestChange(edited, interests, interests, SCORING_CONFIG);
    expect(next["python"]).toEqual(edited["python"]);
  });
});

describe("setUserWeight", () => {
  it("sets weight and anchor, marking the entry user-owned", () => {
    const next = setUserWeight(
      { python: { weight: 1.7, initial: 1.0, source: "learned", sightings: 4 } },
      "python",
      2.0,
      SCORING_CONFIG,
    );
    expect(next["python"]).toEqual({
      weight: 2.0,
      initial: 2.0,
      source: "user",
      sightings: 4,
    });
  });

  it("clamps to the configured bounds", () => {
    const next = setUserWeight({}, "python", 99, SCORING_CONFIG);
    expect(next["python"].weight).toBe(SCORING_CONFIG.weightClamp[1]);
  });
});

describe("resetLearnedWeights", () => {
  it("returns weights to their anchors and drops learned-only entries", () => {
    const next = resetLearnedWeights({
      python: { weight: 2.1, initial: 1.0, source: "learned", sightings: 7 },
      edited: { weight: 2.5, initial: 2.5, source: "user", sightings: 2 },
      stray: { weight: -0.4, initial: 0, source: "learned", sightings: 3 },
    });
    expect(next["python"]).toEqual({
      weight: 1.0,
      initial: 1.0,
      source: "learned",
      sightings: 0,
    });
    expect(next["edited"].weight).toBe(2.5);
    expect(next["edited"].sightings).toBe(0);
    expect(next["stray"]).toBeUndefined();
  });
});
