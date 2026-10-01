import type { FilterableListing, FilterableProfile } from "./filters";
import { haversineMiles } from "./geo/distance";
import { geocodeLocations, type CityLookup } from "./geo/parse";
import type { JdExtract } from "./jdExtract";
import type { Preference, Strength } from "./schemas/profileSeed";
import {
  SCORING_CONFIG,
  embedFeatureEnabled,
  type ScoringConfig,
} from "./scoringConfig";
import { classYearFit } from "./textSignals";

/**
 * Structural features: the non-keyword terms of the score. Each has a fixed
 * per-user weight — from the matching preference's strength, or a constant
 * in shared/scoring.json — never learned. Keyword terms live in
 * lib/keywordScore.ts.
 */

export interface ScoringListing extends FilterableListing {
  embedding?: number[] | null;
  jdStatus: string;
  datePosted: number; // ms
  jdExtract?: JdExtract | null;
}

export interface ScoringProfile extends FilterableProfile {
  resumeEmbedding?: number[] | null;
  skills?: string[] | null;
}

export interface ScoringContext {
  /** Companies the user has applied to or thumbs-upped. */
  likedCompanies: Set<string>;
  now: number;
  lookup: CityLookup;
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function strengthOf(preferences: Preference[], type: string): Strength | null {
  const pref = preferences.find((p) => p.type === type);
  return pref ? pref.strength : null;
}

const DEFAULT_LOC_DECAY_MILES = 50;

export function buildStructuralFeatures(
  listing: ScoringListing,
  profile: ScoringProfile,
  context: ScoringContext,
  config: ScoringConfig = SCORING_CONFIG,
): Record<string, number> {
  const hasJd = listing.jdStatus === "fetched";

  // Location proximity: closest preferred place, exponential decay.
  const locPref = profile.preferences.find((p) => p.type === "location");
  let locProximity = 0;
  const workModePref = profile.preferences.find((p) => p.type === "workMode");
  const remoteAcceptable =
    !workModePref ||
    workModePref.strength === "ignore" ||
    workModePref.value.includes("remote");
  if (listing.remoteType === "remote") {
    locProximity = remoteAcceptable ? 1 : 0;
  } else if (locPref && locPref.strength !== "ignore" && listing.geo.length > 0) {
    const preferred = geocodeLocations(locPref.value.places, context.lookup);
    if (preferred.length > 0) {
      const decay = Math.max(
        locPref.value.radiusMiles ?? DEFAULT_LOC_DECAY_MILES,
        DEFAULT_LOC_DECAY_MILES,
      );
      const best = Math.min(
        ...listing.geo.flatMap((g) =>
          preferred.map((p) => haversineMiles(g, p)),
        ),
      );
      locProximity = Math.exp(-best / decay);
    }
  }

  const workModeMatch =
    listing.remoteType === "unknown"
      ? 0.5
      : workModePref && workModePref.value.includes(listing.remoteType as never)
        ? 1
        : workModePref
          ? 0
          : 0.5;

  const rolePref = profile.preferences.find((p) => p.type === "roleCategory");
  const roleCategoryMatch =
    listing.category === "other"
      ? 0.5
      : rolePref && rolePref.value.includes(listing.category as never)
        ? 1
        : rolePref
          ? 0
          : 0.5;

  const sponsorshipPref = profile.preferences.find(
    (p) => p.type === "sponsorship",
  );
  let sponsorshipMatch = 0.5;
  if (sponsorshipPref?.value === "needs_sponsorship") {
    if (listing.sponsorship === "offers") sponsorshipMatch = 1;
    else if (
      listing.sponsorship === "no_sponsorship" ||
      listing.sponsorship === "us_citizenship_required"
    )
      sponsorshipMatch = 0;
  } else if (sponsorshipPref) {
    sponsorshipMatch = 1; // no sponsorship needed — nothing conflicts
  }

  const fit = classYearFit(profile, `${listing.title}\n${listing.jdText ?? ""}`);
  const classYearSignal = fit === "fit" ? 1 : fit === "mismatch" ? 0 : 0.5;

  const companyAffinity = context.likedCompanies.has(
    listing.company.trim().toLowerCase(),
  )
    ? 1
    : 0;

  const days = Math.max(0, (context.now - listing.datePosted) / 86_400_000);
  const recency = Math.exp(-days / 14);

  // Extraction-based features: 0.5 means "no information" — no JD, no
  // detected section, or nothing configured on the profile.
  const MID = 0.5;
  const extract = hasJd ? (listing.jdExtract ?? null) : null;
  const userSkills = new Set(
    (profile.skills ?? []).map((s) => s.trim().toLowerCase()),
  );

  const coverage = (sectionSkills: string[] | undefined): number => {
    if (!extract || !sectionSkills || sectionSkills.length === 0) return MID;
    const hits = sectionSkills.filter((s) =>
      userSkills.has(s.trim().toLowerCase()),
    ).length;
    return hits / sectionSkills.length;
  };
  const requiredSkillCoverage = coverage(extract?.requiredSkills);
  const preferredSkillCoverage = coverage(extract?.preferredSkills);

  let degreeFit = MID;
  if (extract && extract.facts.degrees.length > 0) {
    degreeFit = extract.facts.degrees.includes(profile.degreeLevel) ? 1 : 0;
  }

  const features: Record<string, number> = {
    loc_proximity: locProximity,
    work_mode_match: workModeMatch,
    role_category_match: roleCategoryMatch,
    sponsorship_match: sponsorshipMatch,
    class_year_signal: classYearSignal,
    company_affinity: companyAffinity,
    recency,
    required_skill_coverage: requiredSkillCoverage,
    preferred_skill_coverage: preferredSkillCoverage,
    degree_fit: degreeFit,
  };

  // Optional: resume↔listing embedding similarity, off by default. Vectors
  // are L2-normalized so cosine = dot; a title-only embedding is pinned to
  // neutral so it can't push the score either way.
  if (embedFeatureEnabled(config)) {
    features.embed_sim_resume =
      hasJd && listing.embedding
        ? profile.resumeEmbedding
          ? dot(listing.embedding, profile.resumeEmbedding)
          : 0
        : config.noJdNeutral;
  }

  return features;
}

/** The fixed per-user weight of every enabled structural feature. */
export function structuralWeights(
  preferences: Preference[],
  config: ScoringConfig = SCORING_CONFIG,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of config.structural) {
    if (f.enabled === false) continue;
    if (f.strengthPref) {
      const strength = strengthOf(preferences, f.strengthPref);
      out[f.name] = strength ? config.strengthWeights[strength] : 0;
    } else {
      out[f.name] = f.weight ?? 0;
    }
  }
  return out;
}
