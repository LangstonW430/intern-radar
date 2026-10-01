import { describe, expect, it } from "vitest";
import {
  buildStructuralFeatures,
  structuralWeights,
  type ScoringListing,
  type ScoringProfile,
} from "./features";
import { lookupCity } from "./geo/data";
import { parseNoJdPenalty } from "./score";
import type { Preference } from "./schemas/profileSeed";
import { SCORING_CONFIG } from "./scoringConfig";

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
    { type: "roleCategory", value: ["swe"], strength: "strong" },
  ] as Preference[],
};

const context = {
  likedCompanies: new Set<string>(),
  now: Date.now(),
  lookup: lookupCity,
};

describe("buildStructuralFeatures", () => {
  it("location proximity decays with distance and is 1 at the preferred city", () => {
    const home = buildStructuralFeatures(baseListing, baseProfile, context);
    expect(home.loc_proximity).toBeCloseTo(1, 1);
    const far = buildStructuralFeatures(
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
    const noRemote = buildStructuralFeatures(remoteListing, baseProfile, context);
    expect(noRemote.loc_proximity).toBe(0); // workMode pref excludes remote
    const remoteOk = buildStructuralFeatures(
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
    const f = buildStructuralFeatures(baseListing, baseProfile, context);
    expect(f.work_mode_match).toBe(1);
    expect(f.role_category_match).toBe(1);
    expect(f.sponsorship_match).toBe(0.5); // no sponsorship pref set

    const mismatched = buildStructuralFeatures(
      { ...baseListing, remoteType: "remote", category: "quant" },
      baseProfile,
      context,
    );
    expect(mismatched.work_mode_match).toBe(0);
    expect(mismatched.role_category_match).toBe(0);

    const unknowns = buildStructuralFeatures(
      { ...baseListing, remoteType: "unknown", category: "other" },
      baseProfile,
      context,
    );
    expect(unknowns.work_mode_match).toBe(0.5);
    expect(unknowns.role_category_match).toBe(0.5);
  });

  it("company affinity and recency", () => {
    const liked = buildStructuralFeatures(baseListing, baseProfile, {
      ...context,
      likedCompanies: new Set(["acme"]),
    });
    expect(liked.company_affinity).toBe(1);

    const old = buildStructuralFeatures(
      { ...baseListing, datePosted: context.now - 28 * 86_400_000 },
      baseProfile,
      context,
    );
    expect(old.recency).toBeCloseTo(Math.exp(-2), 5);
  });

  it("produces exactly the enabled structural features", () => {
    const f = buildStructuralFeatures(baseListing, baseProfile, context);
    const enabled = SCORING_CONFIG.structural
      .filter((s) => s.enabled !== false)
      .map((s) => s.name);
    expect(Object.keys(f).sort()).toEqual([...enabled].sort());
    // embed_sim_resume is off by default and must not appear.
    expect(f.embed_sim_resume).toBeUndefined();
  });

  it("computes embed_sim_resume only when the config flag enables it", () => {
    const enabledConfig = {
      ...SCORING_CONFIG,
      structural: SCORING_CONFIG.structural.map((s) =>
        s.name === "embed_sim_resume" ? { ...s, enabled: true } : s,
      ),
    };
    const withVectors = {
      ...baseListing,
      embedding: [1, 0, 0],
    };
    const profile = { ...baseProfile, resumeEmbedding: [1, 0, 0] };
    const f = buildStructuralFeatures(
      withVectors,
      profile,
      context,
      enabledConfig,
    );
    expect(f.embed_sim_resume).toBe(1);

    const noJd = buildStructuralFeatures(
      { ...withVectors, jdStatus: "pending" },
      profile,
      context,
      enabledConfig,
    );
    expect(noJd.embed_sim_resume).toBe(SCORING_CONFIG.noJdNeutral);
  });
});

describe("extraction-based features", () => {
  const extract = {
    version: 1,
    requirements: ["Experience with Python and React"],
    preferred: ["AWS a plus"],
    responsibilities: [],
    skills: ["Python", "React", "AWS"],
    requiredSkills: ["Python", "React"],
    preferredSkills: ["AWS"],
    facts: { degrees: ["bachelors"], minGpa: null, gradYears: [], pay: null, duration: null },
  };
  const withExtract = { ...baseListing, jdExtract: extract };
  const skilledProfile = { ...baseProfile, skills: ["python", "Go"] };

  it("computes required/preferred coverage against user skills", () => {
    const f = buildStructuralFeatures(withExtract, skilledProfile, context);
    expect(f.required_skill_coverage).toBe(0.5); // python yes, react no
    expect(f.preferred_skill_coverage).toBe(0); // no AWS
  });

  it("is neutral without a JD, extract, or detected section", () => {
    const noJd = buildStructuralFeatures(
      { ...withExtract, jdStatus: "pending" },
      skilledProfile,
      context,
    );
    expect(noJd.required_skill_coverage).toBe(0.5);
    expect(noJd.degree_fit).toBe(0.5);

    const noSections = buildStructuralFeatures(
      {
        ...baseListing,
        jdExtract: { ...extract, requiredSkills: [], preferredSkills: [], facts: { ...extract.facts, degrees: [] } },
      },
      skilledProfile,
      context,
    );
    expect(noSections.required_skill_coverage).toBe(0.5);
    expect(noSections.degree_fit).toBe(0.5);

    const noExtract = buildStructuralFeatures(
      { ...baseListing, jdExtract: null },
      skilledProfile,
      context,
    );
    expect(noExtract.required_skill_coverage).toBe(0.5);
  });

  it("degree_fit is 1 on match, 0 on stated mismatch", () => {
    const fit = buildStructuralFeatures(withExtract, skilledProfile, context);
    expect(fit.degree_fit).toBe(1); // bachelors profile, bachelors mentioned
    const misfit = buildStructuralFeatures(
      {
        ...withExtract,
        jdExtract: { ...extract, facts: { ...extract.facts, degrees: ["phd"] } },
      },
      skilledProfile,
      context,
    );
    expect(misfit.degree_fit).toBe(0);
  });
});

describe("structuralWeights", () => {
  it("derives strength-based and fixed weights from the config", () => {
    const weights = structuralWeights(baseProfile.preferences);
    expect(weights.loc_proximity).toBe(SCORING_CONFIG.strengthWeights.soft);
    expect(weights.role_category_match).toBe(
      SCORING_CONFIG.strengthWeights.strong,
    );
    expect(weights.sponsorship_match).toBe(0); // no preference set
    expect(weights.recency).toBe(0.5);
    expect(weights.required_skill_coverage).toBe(1.0);
    expect(weights.embed_sim_resume).toBeUndefined(); // disabled by default
  });

  it("hard and ignore preferences contribute zero weight", () => {
    const weights = structuralWeights([
      { type: "workMode", value: ["onsite"], strength: "hard" },
      { type: "roleCategory", value: ["swe"], strength: "ignore" },
    ] as Preference[]);
    expect(weights.work_mode_match).toBe(0);
    expect(weights.role_category_match).toBe(0);
  });
});

describe("parseNoJdPenalty", () => {
  it("defaults to 0.6 on missing or invalid values", () => {
    expect(parseNoJdPenalty(undefined)).toBe(0.6);
    expect(parseNoJdPenalty("nope")).toBe(0.6);
    expect(parseNoJdPenalty("0")).toBe(0.6);
    expect(parseNoJdPenalty("1.5")).toBe(0.6);
    expect(parseNoJdPenalty("0.4")).toBe(0.4);
  });
});
