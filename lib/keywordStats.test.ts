import { describe, expect, it } from "vitest";
import {
  applyTransition,
  emptyKeywordStats,
  idf,
} from "./keywordStats";

describe("idf", () => {
  it("is log((N+1)/(df+1)) + 1", () => {
    expect(idf(0, 99)).toBeCloseTo(Math.log(100) + 1, 10);
    expect(idf(49, 99)).toBeCloseTo(Math.log(2) + 1, 10);
    expect(idf(99, 99)).toBeCloseTo(1, 10);
  });

  it("is 1 for an empty corpus and never negative", () => {
    expect(idf(0, 0)).toBe(1);
    expect(idf(500, 100)).toBe(1); // df clamped to total
  });

  it("respects the max clamp", () => {
    expect(idf(0, 100_000, 4)).toBe(4);
    expect(idf(50_000, 100_000, 4)).toBeCloseTo(
      Math.log(100_001 / 50_001) + 1,
      10,
    );
  });
});

describe("applyTransition", () => {
  it("adds a document incrementally", () => {
    const stats = emptyKeywordStats();
    const changed = applyTransition(
      stats,
      { contributes: false, keywordIds: [] },
      { contributes: true, keywordIds: ["python", "aws"] },
    );
    expect(changed).toBe(true);
    expect(stats.totalWithJd).toBe(1);
    expect(stats.df).toEqual({ python: 1, aws: 1 });
  });

  it("removes a document and drops zero counts", () => {
    const stats = { totalWithJd: 2, df: { python: 2, aws: 1 } };
    applyTransition(
      stats,
      { contributes: true, keywordIds: ["python", "aws"] },
      { contributes: false, keywordIds: [] },
    );
    expect(stats.totalWithJd).toBe(1);
    expect(stats.df).toEqual({ python: 1 });
  });

  it("keeps the total steady on a re-fetch with changed keywords", () => {
    const stats = { totalWithJd: 1, df: { python: 1 } };
    applyTransition(
      stats,
      { contributes: true, keywordIds: ["python"] },
      { contributes: true, keywordIds: ["rust"] },
    );
    expect(stats.totalWithJd).toBe(1);
    expect(stats.df).toEqual({ rust: 1 });
  });

  it("is a no-op when the listing never contributed", () => {
    const stats = emptyKeywordStats();
    const changed = applyTransition(
      stats,
      { contributes: false, keywordIds: ["python"] },
      { contributes: false, keywordIds: ["rust"] },
    );
    expect(changed).toBe(false);
    expect(stats).toEqual(emptyKeywordStats());
  });

  it("never drives counts below zero", () => {
    const stats = emptyKeywordStats();
    applyTransition(
      stats,
      { contributes: true, keywordIds: ["python"] },
      { contributes: false, keywordIds: [] },
    );
    expect(stats.totalWithJd).toBe(0);
    expect(stats.df).toEqual({});
  });
});
