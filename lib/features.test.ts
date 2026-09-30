import { describe, expect, it } from "vitest";
import {
  buildFeatures,
  FEATURE_NAMES,
  FEATURES_FILE,
  priorWeights,
  toVector,
  type ScoringListing,
  type ScoringProfile,
} from "./features";
import { lookupCity } from "./geo/data";
import { computePreferenceVector } from "./rocchio";
import { parseNoJdPenalty, scoreFeatures, sigmoid } from "./score";
import type { Preference } from "./schemas/profileSeed";

const NEUTRAL = FEATURES_FILE.noJdNeutral;

// A unit vector along one axis keeps dot products easy to reason about.
function unit(dim: number, axis: number): number[] {
  const v = new Array<number>(dim).fill(0);
  v[axis] = 1;
  return v;
}
const DIM = 8; // buildFeatures never checks dim; small vectors keep tests readable

const baseListing: ScoringListing = {
  company: "Acme",
  title: "SWE Intern",
  jdText: "A meaningful description.",
  category: "swe",
  remoteType: "onsite",
  sponsorship: "unknown",
  degrees: ["bachelors"],
  locations: ["Rochester, NY"],
  geo: [{ lat: 43.155, lon: -77.616, name: "Rochester, NY" }],
  embedding: unit(DIM, 0),
  jdStatus: "fetched",
  datePosted: Date.now(),
};

const baseProfile: ScoringProfile = {
  classYear: "sophomore",
  degreeLevel: "bachelors",
  gradDate: "2029-05",
  preferences: [
    {
      type: "location",
      value: { places: ["Rochester, NY"], radiusMiles: 50 },
      strength: "soft",
    },
    { type: "workMode", value: ["onsite", "hybrid"], strength: "soft" },
    { type: "roleCategory", value: ["swe"], strength: "soft" },
  ] as Preference[],
  resumeEmbedding: unit(DIM, 0),
  preferenceVector: unit(DIM, 0),
};

const context = {
  likedCompanies: new Set<string>(),
  now: Date.now(),
  lookup: lookupCity,
};

describe("buildFeatures", () => {
  it("computes cosine via dot for JD-bearing listings", () => {
    const f = buildFeatures(baseListing, baseProfile, context);
    expect(f.embed_sim_resume).toBe(1);
    expect(f.embed_sim_pref).toBe(1);
    expect(f.has_jd).toBe(1);
  });

  it("pins embedding features to neutral without a JD", () => {
    const f = buildFeatures(
      { ...baseListing, jdStatus: "pending" },
      baseProfile,
      context,
    );
    expect(f.embed_sim_resume).toBe(NEUTRAL);
    expect(f.embed_sim_pref).toBe(NEUTRAL);
    expect(f.has_jd).toBe(0);
  });

  it("location proximity decays with distance and is 1 at the preferred city", () => {
    const home = buildFeatures(baseListing, baseProfile, context);
    expect(home.loc_proximity).toBeCloseTo(1, 1);
    const far = buildFeatures(
      {
        ...baseListing,
        geo: [{ lat: 37.33, lon: -121.89, name: "San Jose, CA" }],
      },
      baseProfile,
      context,
    );
    expect(far.loc_proximity).toBeLessThan(0.01);
  });

  it("remote listing gets proximity 1 only when remote is acceptable", () => {
    const remoteListing = { ...baseListing, remoteType: "remote" };
    const noRemote = buildFeatures(remoteListing, baseProfile, context);
    expect(noRemote.loc_proximity).toBe(0); // workMode pref excludes remote
    const remoteOk = buildFeatures(
      remoteListing,
      {
        ...baseProfile,
        preferences: [
          { type: "workMode", value: ["remote"], strength: "soft" },
        ] as Preference[],
      },
      context,
    );
    expect(remoteOk.loc_proximity).toBe(1);
  });

  it("match features use 1 / 0.5 / 0 encoding", () => {
    const f = buildFeatures(baseListing, baseProfile, context);
    expect(f.work_mode_match).toBe(1);
    expect(f.role_category_match).toBe(1);
    expect(f.sponsorship_match).toBe(0.5); // no sponsorship pref set

    const mismatched = buildFeatures(
      { ...baseListing, remoteType: "remote", category: "quant" },
      baseProfile,
      context,
    );
    expect(mismatched.work_mode_match).toBe(0);
    expect(mismatched.role_category_match).toBe(0);

    const unknowns = buildFeatures(
      { ...baseListing, remoteType: "unknown", category: "other" },
      baseProfile,
      context,
    );
    expect(unknowns.work_mode_match).toBe(0.5);
    expect(unknowns.role_category_match).toBe(0.5);
  });

  it("company affinity and recency", () => {
    const liked = buildFeatures(baseListing, baseProfile, {
      ...context,
      likedCompanies: new Set(["acme"]),
    });
    expect(liked.company_affinity).toBe(1);

    const old = buildFeatures(
      { ...baseListing, datePosted: context.now - 28 * 86_400_000 },
      baseProfile,
      context,
    );
    expect(old.recency).toBeCloseTo(Math.exp(-2), 5);
  });

  it("produces every feature in shared order", () => {
    const f = buildFeatures(baseListing, baseProfile, context);
    expect(Object.keys(f).sort()).toEqual([...FEATURE_NAMES].sort());
    expect(toVector(f)).toHaveLength(FEATURE_NAMES.length);
  });
});

describe("priorWeights", () => {
  it("derives strength-based weights and fixed priors", () => {
    const weights = priorWeights(baseProfile.preferences);
    const byName = Object.fromEntries(
      FEATURE_NAMES.map((name, i) => [name, weights[i]]),
    );
    expect(byName.bias).toBe(-1);
    expect(byName.embed_sim_resume).toBe(2);
    expect(byName.loc_proximity).toBe(0.4); // soft
    expect(byName.sponsorship_match).toBe(0); // no pref set
    expect(byName.class_year_signal).toBe(0);
  });

  it("hard and ignore strengths contribute zero weight", () => {
    const weights = priorWeights([
      { type: "roleCategory", value: ["swe"], strength: "hard" },
      { type: "workMode", value: ["remote"], strength: "ignore" },
    ] as Preference[]);
    const byName = Object.fromEntries(
      FEATURE_NAMES.map((name, i) => [name, weights[i]]),
    );
    expect(byName.role_category_match).toBe(0);
    expect(byName.work_mode_match).toBe(0);
  });
});

describe("scoreFeatures", () => {
  const features = buildFeatures(baseListing, baseProfile, context);
  const weights = priorWeights(baseProfile.preferences);

  it("applies sigmoid to the dot product", () => {
    const { rawScore, score } = scoreFeatures(features, weights, {
      hasJd: true,
      noJdPenalty: 0.6,
    });
    expect(rawScore).toBeGreaterThan(0);
    expect(rawScore).toBeLessThan(1);
    expect(score).toBe(rawScore);
  });

  it("multiplies by NO_JD_PENALTY only without a JD", () => {
    const { rawScore, score } = scoreFeatures(features, weights, {
      hasJd: false,
      noJdPenalty: 0.6,
    });
    expect(score).toBeCloseTo(rawScore * 0.6, 10);
  });

  it("rejects a weight vector of the wrong length", () => {
    expect(() =>
      scoreFeatures(features, [1, 2, 3], { hasJd: true, noJdPenalty: 0.6 }),
    ).toThrow();
  });
});

describe("parseNoJdPenalty", () => {
  it("defaults to 0.6 on missing or invalid input", () => {
    expect(parseNoJdPenalty(undefined)).toBe(0.6);
    expect(parseNoJdPenalty("nope")).toBe(0.6);
    expect(parseNoJdPenalty("1.5")).toBe(0.6);
    expect(parseNoJdPenalty("0.4")).toBe(0.4);
  });
});

describe("sigmoid", () => {
  it("is 0.5 at zero and monotonic", () => {
    expect(sigmoid(0)).toBe(0.5);
    expect(sigmoid(2)).toBeGreaterThan(sigmoid(1));
  });
});

describe("computePreferenceVector", () => {
  const resume = unit(4, 0);

  it("returns the resume direction with no feedback", () => {
    const v = computePreferenceVector(resume, [], []);
    expect(v[0]).toBeCloseTo(1, 5);
  });

  it("moves toward liked and away from disliked, staying unit-length", () => {
    const liked = [unit(4, 1)];
    const disliked = [unit(4, 2)];
    const v = computePreferenceVector(resume, liked, disliked);
    expect(v[1]).toBeGreaterThan(0);
    expect(v[2]).toBeLessThan(0);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 6);
  });
});
