import type { CityLookup } from "./geo/parse";
import { geocodeLocations, parseLocation } from "./geo/parse";
import { haversineMiles } from "./geo/distance";
import { keywordInText } from "./jdExtract";
import type { Interest, Preference } from "./schemas/profileSeed";
import { classYearFit, sponsorshipConflictInText } from "./textSignals";

/**
 * Hard filters (decision D1/D3 semantics): a `hard` preference drops a
 * listing only on an explicit conflict; unknown/unstated always passes.
 * Returns which rule dropped the listing so the match records it.
 */

export interface FilterableListing {
  company: string;
  title: string;
  jdText?: string | null;
  category: string; // normalized
  remoteType: string;
  sponsorship: string; // normalized
  degrees: string[]; // normalized
  locations: string[];
  geo: { lat: number; lon: number; name: string }[];
}

export interface FilterableProfile {
  classYear: string;
  degreeLevel: string;
  gradDate: string; // YYYY-MM
  preferences: Preference[];
  interests?: Interest[] | null;
}

export interface FilterResult {
  pass: boolean;
  droppedBy: string | null;
}

const DEFAULT_RADIUS_MILES = 50;

export function applyHardFilters(
  listing: FilterableListing,
  profile: FilterableProfile,
  lookup: CityLookup,
): FilterResult {
  const hard = profile.preferences.filter((p) => p.strength === "hard");
  const text = `${listing.title}\n${listing.jdText ?? ""}`;

  for (const pref of hard) {
    switch (pref.type) {
      case "excludeCompanies": {
        const excluded = pref.value.map((c) => c.trim().toLowerCase());
        if (excluded.includes(listing.company.trim().toLowerCase())) {
          return { pass: false, droppedBy: "excludeCompanies" };
        }
        break;
      }
      case "degreeLevel": {
        // Structured degrees field only; empty list means unstated → pass.
        if (
          listing.degrees.length > 0 &&
          !listing.degrees.includes(profile.degreeLevel)
        ) {
          return { pass: false, droppedBy: "degreeLevel" };
        }
        break;
      }
      case "classYear": {
        if (classYearFit(profile, text) === "mismatch") {
          return { pass: false, droppedBy: "classYear" };
        }
        break;
      }
      case "sponsorship": {
        if (pref.value === "needs_sponsorship") {
          const structuredConflict =
            listing.sponsorship === "no_sponsorship" ||
            listing.sponsorship === "us_citizenship_required";
          if (structuredConflict || sponsorshipConflictInText(text)) {
            return { pass: false, droppedBy: "sponsorship" };
          }
        }
        break;
      }
      case "workMode": {
        if (
          listing.remoteType !== "unknown" &&
          !pref.value.includes(listing.remoteType as never)
        ) {
          return { pass: false, droppedBy: "workMode" };
        }
        break;
      }
      case "roleCategory": {
        // "other" means the source category didn't map — pass, don't guess.
        if (
          listing.category !== "other" &&
          !pref.value.includes(listing.category as never)
        ) {
          return { pass: false, droppedBy: "roleCategory" };
        }
        break;
      }
      case "location": {
        // Remote/hybrid listings and ungeocoded listings pass; only an
        // onsite listing provably outside the radius drops.
        if (listing.remoteType === "remote" || listing.remoteType === "hybrid") {
          break;
        }
        if (listing.geo.length === 0) break;
        const preferred = geocodeLocations(pref.value.places, lookup);
        if (preferred.length === 0) break;
        const radius = pref.value.radiusMiles ?? DEFAULT_RADIUS_MILES;
        const withinRadius = listing.geo.some((point) =>
          preferred.some((p) => haversineMiles(point, p) <= radius),
        );
        if (!withinRadius) {
          return { pass: false, droppedBy: "location" };
        }
        break;
      }
    }
  }

  // Hard interests: a hard "want" requires a mention in title or JD; a hard
  // "avoid" drops on any mention. Matched on whatever text exists — a
  // no-JD listing is checked against its title alone.
  for (const interest of profile.interests ?? []) {
    if (interest.strength !== "hard") continue;
    const mentioned = keywordInText(interest.keyword, text);
    if (interest.tag === "want" && !mentioned) {
      return { pass: false, droppedBy: `interestWant:${interest.keyword}` };
    }
    if (interest.tag === "avoid" && mentioned) {
      return { pass: false, droppedBy: `interestAvoid:${interest.keyword}` };
    }
  }
  return { pass: true, droppedBy: null };
}

export { parseLocation };
