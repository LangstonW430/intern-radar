import { z } from "zod";
import featuresJson from "../shared/features.json";
import type { FilterableListing, FilterableProfile } from "./filters";
import { haversineMiles } from "./geo/distance";
import { geocodeLocations, type CityLookup } from "./geo/parse";
import { keywordInText, type JdExtract } from "./jdExtract";
import type { Interest, Preference, Strength } from "./schemas/profileSeed";
import { classYearFit } from "./textSignals";

/**
 * The feature vector. shared/features.json is the single source of truth for
 * names, order, priors, and bounds — the Python trainer loads the same file
 * and refuses to run if they disagree.
 */

const featureDefSchema = z.object({
  name: z.string(),
  prior: z.number().optional(),
  strengthPref: z.string().optional(),
  bounds: z.tuple([z.number(), z.number()]),
  neutralWithoutJd: z.boolean().optional(),
});
const featuresFileSchema = z.object({
  version: z.number(),
  embeddingModel: z.string(),
  embeddingDim: z.number(),
  strengthPriors: z.record(z.string(), z.number()),
  noJdNeutral: z.number(),
  feedbackWeights: z.object({
    applied: z.number().positive(),
    default: z.number().positive(),
  }),
  features: z.array(featureDefSchema),
});

export const FEATURES_FILE = featuresFileSchema.parse(featuresJson);
export const FEATURE_NAMES = FEATURES_FILE.features.map((f) => f.name);
export const EMBEDDING_DIM = FEATURES_FILE.embeddingDim;

export interface ScoringListing extends FilterableListing {
  embedding?: number[] | null;
  jdStatus: string;
  datePosted: number; // ms
  jdExtract?: JdExtract | null;
}

export interface ScoringProfile extends FilterableProfile {
  resumeEmbedding?: number[] | null;
  preferenceVector?: number[] | null;
  skills?: string[] | null;
  interests?: Interest[] | null;
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

export function buildFeatures(
  listing: ScoringListing,
  profile: ScoringProfile,
  context: ScoringContext,
): Record<string, number> {
  const hasJd = listing.jdStatus === "fetched" ? 1 : 0;
  const neutral = FEATURES_FILE.noJdNeutral;

  // Embedding similarities: vectors are L2-normalized, so cosine = dot.
  // Without a JD the embedding only reflects the title — decision D7 says
  // pin these to neutral so it can't push the score either way.
  let simResume = neutral;
  let simPref = neutral;
  if (hasJd && listing.embedding) {
    simResume = profile.resumeEmbedding
      ? dot(listing.embedding, profile.resumeEmbedding)
      : 0;
    simPref = profile.preferenceVector
      ? dot(listing.embedding, profile.preferenceVector)
      : simResume;
  }

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

  const interestText = `${listing.title}\n${listing.jdText ?? ""}`;
  const strengthWeight = (s: Strength) => (s === "strong" ? 1.0 : 0.5);
  const softInterests = (tag: "want" | "avoid") =>
    (profile.interests ?? []).filter(
      (i) => i.tag === tag && (i.strength === "strong" || i.strength === "soft"),
    );
  const interestScore = (tag: "want" | "avoid"): number => {
    const items = softInterests(tag);
    if (items.length === 0) return MID; // nothing configured — no information
    if (!hasJd) return MID; // title alone is too thin to score against
    let total = 0;
    let hit = 0;
    for (const item of items) {
      const w = strengthWeight(item.strength as Strength);
      total += w;
      if (keywordInText(item.keyword, interestText)) hit += w;
    }
    return total > 0 ? hit / total : MID;
  };
  const interestMatch = interestScore("want");
  const avoidMatch = interestScore("avoid");

  let degreeFit = MID;
  if (extract && extract.facts.degrees.length > 0) {
    degreeFit = extract.facts.degrees.includes(profile.degreeLevel) ? 1 : 0;
  }

  return {
    bias: 1,
    embed_sim_resume: simResume,
    embed_sim_pref: simPref,
    loc_proximity: locProximity,
    work_mode_match: workModeMatch,
    role_category_match: roleCategoryMatch,
    sponsorship_match: sponsorshipMatch,
    class_year_signal: classYearSignal,
    company_affinity: companyAffinity,
    recency,
    has_jd: hasJd,
    required_skill_coverage: requiredSkillCoverage,
    preferred_skill_coverage: preferredSkillCoverage,
    interest_match: interestMatch,
    avoid_match: avoidMatch,
    degree_fit: degreeFit,
  };
}

/** Prior weights derived from strengths — used until a model is promoted. */
export function priorWeights(preferences: Preference[]): number[] {
  return FEATURES_FILE.features.map((f) => {
    if (f.strengthPref) {
      const strength = strengthOf(preferences, f.strengthPref);
      return strength ? (FEATURES_FILE.strengthPriors[strength] ?? 0) : 0;
    }
    return f.prior ?? 0;
  });
}

export function toVector(features: Record<string, number>): number[] {
  return FEATURE_NAMES.map((name) => features[name] ?? 0);
}
