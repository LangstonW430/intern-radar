import { detectAts, type AtsType } from "./atsDetect";
import { contentHash } from "./diff";
import {
  detectRemoteType,
  normalizeCategory,
  normalizeDegrees,
  normalizeSponsorship,
} from "./normalize";
import type { SimplifyListing } from "./schemas/simplify";

/** ATS types the Actions-side JD fetcher handles (or will, behind probe gates). */
const JD_SUPPORTED: ReadonlySet<AtsType> = new Set([
  "greenhouse",
  "greenhouse_embedded",
  "lever",
  "ashby",
  "workday",
  "icims",
  "oracle",
]);

export interface ListingSourceFields {
  sourceId: string;
  company: string;
  title: string;
  category: string;
  categoryRaw: string;
  locations: string[];
  remoteType: string;
  sponsorship: string;
  degrees: string[];
  url: string;
  atsType: AtsType;
  atsRef: { account?: string; jobId?: string };
  datePosted: number;
  dateUpdated: number;
  active: boolean;
  raw: unknown;
  contentHash: string;
}

/** Maps a parsed Simplify record onto the source-derived listing fields. */
export function toListingSourceFields(
  listing: SimplifyListing,
): ListingSourceFields {
  const { atsType, atsRef } = detectAts(listing.url);
  return {
    sourceId: listing.id,
    company: listing.company_name,
    title: listing.title,
    category: normalizeCategory(listing.category),
    categoryRaw: listing.category,
    locations: listing.locations,
    remoteType: detectRemoteType(listing.locations),
    sponsorship: normalizeSponsorship(listing.sponsorship),
    degrees: normalizeDegrees(listing.degrees),
    url: listing.url,
    atsType,
    atsRef,
    datePosted: listing.date_posted * 1000, // feed is unix seconds; we store ms
    dateUpdated: listing.date_updated * 1000,
    active: listing.active,
    raw: listing,
    contentHash: contentHash(listing),
  };
}

export function isJdSupported(atsType: string): boolean {
  return JD_SUPPORTED.has(atsType as AtsType);
}
