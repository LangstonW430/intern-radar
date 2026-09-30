import { describe, expect, it } from "vitest";
import fixtures from "./__fixtures__/simplify-listings.json";
import { contentHash, diffListings, type IndexEntry } from "./diff";
import { parseListingsFeed } from "./schemas/simplify";

const listings = parseListingsFeed(fixtures).listings;

describe("contentHash", () => {
  it("is stable for identical content", () => {
    expect(contentHash(listings[0])).toBe(contentHash({ ...listings[0] }));
  });

  it("ignores timestamp-only churn", () => {
    const bumped = { ...listings[0], date_updated: listings[0].date_updated + 999 };
    expect(contentHash(bumped)).toBe(contentHash(listings[0]));
  });

  it("changes when meaningful fields change", () => {
    expect(contentHash({ ...listings[0], active: !listings[0].active })).not.toBe(
      contentHash(listings[0]),
    );
    expect(
      contentHash({ ...listings[0], url: "https://example.com/moved" }),
    ).not.toBe(contentHash(listings[0]));
  });
});

describe("diffListings", () => {
  const index: IndexEntry[] = listings
    .slice(0, 10)
    .map((l) => ({ sourceId: l.id, contentHash: contentHash(l) }));

  it("classifies new, changed, unchanged, and disappeared", () => {
    const changed = { ...listings[2], title: listings[2].title + " (Updated)" };
    const incoming = [
      ...listings.slice(0, 2), // unchanged
      changed, // changed
      ...listings.slice(10, 12), // new (not in index)
    ];
    const result = diffListings(incoming, index);
    expect(result.unchangedCount).toBe(2);
    expect(result.toUpdate.map((l) => l.id)).toEqual([changed.id]);
    expect(result.toInsert.map((l) => l.id)).toEqual(
      listings.slice(10, 12).map((l) => l.id),
    );
    // ids 3..9 from the index are missing from the feed
    expect(result.toDeactivate).toHaveLength(7);
  });

  it("everything new on an empty index", () => {
    const result = diffListings(listings, []);
    expect(result.toInsert).toHaveLength(listings.length);
    expect(result.toDeactivate).toHaveLength(0);
  });
});
