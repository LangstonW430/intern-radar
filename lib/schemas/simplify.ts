import { z } from "zod";

/**
 * A raw record from the Simplify listings JSON. Unknown enum-ish strings are
 * preserved as-is here; normalization to our enums happens in lib/normalize.
 */
export const simplifyListingSchema = z.object({
  id: z.uuid(),
  source: z.string(),
  company_name: z.string().min(1),
  title: z.string().min(1),
  category: z.string(),
  active: z.boolean(),
  is_visible: z.boolean(),
  terms: z.array(z.string()),
  date_posted: z.number(),
  date_updated: z.number(),
  url: z.url(),
  locations: z.array(z.string()),
  company_url: z.string(),
  sponsorship: z.string(),
  degrees: z.array(z.string()),
});
export type SimplifyListing = z.infer<typeof simplifyListingSchema>;

export interface ParseResult {
  listings: SimplifyListing[];
  malformedCount: number;
  firstErrors: string[];
}

/** Parse the whole feed; malformed records are skipped and counted, never fatal. */
export function parseListingsFeed(raw: unknown): ParseResult {
  if (!Array.isArray(raw)) {
    throw new Error("listings feed is not an array");
  }
  const listings: SimplifyListing[] = [];
  let malformedCount = 0;
  const firstErrors: string[] = [];
  for (const record of raw) {
    const parsed = simplifyListingSchema.safeParse(record);
    if (parsed.success) {
      listings.push(parsed.data);
    } else {
      malformedCount++;
      if (firstErrors.length < 3) {
        const id =
          typeof record === "object" && record !== null && "id" in record
            ? String((record as { id: unknown }).id)
            : "<no id>";
        firstErrors.push(`${id}: ${parsed.error.issues[0]?.message}`);
      }
    }
  }
  return { listings, malformedCount, firstErrors };
}

/** The Phase 1 scope filter: Summer 2027, visible. (Active flips are tracked, not dropped.) */
export function inScope(listing: SimplifyListing, term = "Summer 2027"): boolean {
  return listing.terms.includes(term) && listing.is_visible;
}
