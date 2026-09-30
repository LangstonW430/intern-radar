import type { SimplifyListing } from "./schemas/simplify";

/**
 * Content hashing + diffing against the compact ingest index, so the hourly
 * cron never has to read full listing documents (see PLAN.md A5).
 */

/** FNV-1a 64-bit over a stable serialization of the fields that matter. */
export function contentHash(listing: SimplifyListing): string {
  // date_updated/date_posted excluded on purpose: the bot bumps timestamps
  // without meaningful changes, and a hash flip triggers writes + JD refetch.
  const material = JSON.stringify([
    listing.company_name,
    listing.title,
    listing.category,
    listing.url,
    listing.locations,
    listing.sponsorship,
    listing.degrees,
    listing.terms,
    listing.active,
    listing.is_visible,
  ]);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < material.length; i++) {
    hash ^= BigInt(material.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

export interface IndexEntry {
  sourceId: string;
  contentHash: string;
}

export interface DiffResult {
  toInsert: SimplifyListing[];
  toUpdate: SimplifyListing[];
  /** sourceIds present in the index but missing from the feed → mark inactive. */
  toDeactivate: string[];
  unchangedCount: number;
}

export function diffListings(
  incoming: SimplifyListing[],
  index: IndexEntry[],
): DiffResult {
  const known = new Map(index.map((e) => [e.sourceId, e.contentHash]));
  const seen = new Set<string>();
  const toInsert: SimplifyListing[] = [];
  const toUpdate: SimplifyListing[] = [];
  let unchangedCount = 0;

  for (const listing of incoming) {
    seen.add(listing.id);
    const existing = known.get(listing.id);
    if (existing === undefined) {
      toInsert.push(listing);
    } else if (existing !== contentHash(listing)) {
      toUpdate.push(listing);
    } else {
      unchangedCount++;
    }
  }

  const toDeactivate = index
    .filter((e) => !seen.has(e.sourceId))
    .map((e) => e.sourceId);

  return { toInsert, toUpdate, toDeactivate, unchangedCount };
}
