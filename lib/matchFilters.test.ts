import { describe, expect, it } from "vitest";
import {
  applyMatchFilters,
  DEFAULT_MATCH_FILTERS,
  isActioned,
  type MatchRowData,
} from "./matchFilters";

function row(overrides: Partial<MatchRowData>): MatchRowData {
  return {
    matchId: "m",
    listingId: "l",
    company: "Acme",
    title: "SWE Intern",
    url: "https://example.com",
    locations: ["Rochester, NY"],
    score: 0.5,
    jdStatus: "fetched",
    category: "swe",
    remoteType: "onsite",
    datePosted: 1000,
    exploration: false,
    topFactors: [],
    myFeedback: [],
    ...overrides,
  };
}

describe("applyMatchFilters", () => {
  const rows = [
    row({ matchId: "a", score: 0.9, datePosted: 1, company: "Stripe" }),
    row({
      matchId: "b",
      score: 0.6,
      datePosted: 3,
      category: "ai_ml_data",
      remoteType: "remote",
      jdStatus: "pending",
    }),
    row({
      matchId: "c",
      score: 0.3,
      datePosted: 2,
      title: "Quant Intern",
      myFeedback: ["thumbs_down"],
    }),
  ];

  it("defaults pass everything through, sorted by score", () => {
    const out = applyMatchFilters(rows, DEFAULT_MATCH_FILTERS);
    expect(out.map((r) => r.matchId)).toEqual(["a", "b", "c"]);
  });

  it("filters by minimum score", () => {
    const out = applyMatchFilters(rows, {
      ...DEFAULT_MATCH_FILTERS,
      minScore: 0.5,
    });
    expect(out.map((r) => r.matchId)).toEqual(["a", "b"]);
  });

  it("filters by category and work mode", () => {
    expect(
      applyMatchFilters(rows, {
        ...DEFAULT_MATCH_FILTERS,
        category: "ai_ml_data",
      }).map((r) => r.matchId),
    ).toEqual(["b"]);
    expect(
      applyMatchFilters(rows, {
        ...DEFAULT_MATCH_FILTERS,
        workMode: "remote",
      }).map((r) => r.matchId),
    ).toEqual(["b"]);
  });

  it("jdOnly keeps only fetched JDs", () => {
    const out = applyMatchFilters(rows, {
      ...DEFAULT_MATCH_FILTERS,
      jdOnly: true,
    });
    expect(out.map((r) => r.matchId)).toEqual(["a", "c"]);
  });

  it("hideActioned drops rows with any feedback", () => {
    const out = applyMatchFilters(rows, {
      ...DEFAULT_MATCH_FILTERS,
      hideActioned: true,
    });
    expect(out.map((r) => r.matchId)).toEqual(["a", "b"]);
    expect(isActioned(rows[2])).toBe(true);
  });

  it("searches company and title case-insensitively", () => {
    expect(
      applyMatchFilters(rows, {
        ...DEFAULT_MATCH_FILTERS,
        search: "stripe",
      }).map((r) => r.matchId),
    ).toEqual(["a"]);
    expect(
      applyMatchFilters(rows, {
        ...DEFAULT_MATCH_FILTERS,
        search: "QUANT",
      }).map((r) => r.matchId),
    ).toEqual(["c"]);
  });

  it("sorts by newest with score as tiebreak", () => {
    const out = applyMatchFilters(rows, {
      ...DEFAULT_MATCH_FILTERS,
      sort: "newest",
    });
    expect(out.map((r) => r.matchId)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the input array", () => {
    const copy = [...rows];
    applyMatchFilters(rows, { ...DEFAULT_MATCH_FILTERS, sort: "newest" });
    expect(rows.map((r) => r.matchId)).toEqual(copy.map((r) => r.matchId));
  });
});
