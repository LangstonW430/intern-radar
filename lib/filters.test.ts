import { describe, expect, it } from "vitest";
import { applyHardFilters, type FilterableListing } from "./filters";
import { lookupCity } from "./geo/data";
import type { Preference, Strength } from "./schemas/profileSeed";
import {
  classYearFit,
  extractClassYearMentions,
  sponsorshipConflictInText,
} from "./textSignals";

const baseListing: FilterableListing = {
  company: "Acme",
  title: "Software Engineer Intern",
  jdText: "Build things with a great team.",
  category: "swe",
  remoteType: "onsite",
  sponsorship: "unknown",
  degrees: ["bachelors"],
  locations: ["Rochester, NY"],
  geo: [{ lat: 43.155, lon: -77.616, name: "Rochester, NY" }],
};

const baseProfile = {
  classYear: "sophomore",
  degreeLevel: "bachelors",
  gradDate: "2029-05",
  preferences: [] as Preference[],
};

function run(listing: Partial<FilterableListing>, preferences: Preference[]) {
  return applyHardFilters(
    { ...baseListing, ...listing },
    { ...baseProfile, preferences },
    lookupCity,
  );
}

const NON_HARD: Strength[] = ["strong", "soft", "ignore"];

describe("excludeCompanies", () => {
  it("hard drops a listed company, case-insensitively", () => {
    expect(
      run({}, [{ type: "excludeCompanies", value: ["acme"], strength: "hard" }]),
    ).toEqual({ pass: false, droppedBy: "excludeCompanies" });
  });

  it.each(NON_HARD)("%s never drops", (strength) => {
    expect(
      run({}, [{ type: "excludeCompanies", value: ["acme"], strength }]).pass,
    ).toBe(true);
  });
});

describe("degreeLevel", () => {
  const pref = (strength: Strength): Preference => ({
    type: "degreeLevel",
    value: "exclude_mismatched",
    strength,
  });

  it("hard drops when the degrees field excludes the profile level", () => {
    expect(run({ degrees: ["masters", "phd"] }, [pref("hard")])).toEqual({
      pass: false,
      droppedBy: "degreeLevel",
    });
  });

  it("passes when degrees are unstated", () => {
    expect(run({ degrees: [] }, [pref("hard")]).pass).toBe(true);
  });

  it("passes when the profile level is listed", () => {
    expect(run({ degrees: ["bachelors", "masters"] }, [pref("hard")]).pass).toBe(
      true,
    );
  });

  it.each(NON_HARD)("%s never drops", (strength) => {
    expect(run({ degrees: ["phd"] }, [pref(strength)]).pass).toBe(true);
  });
});

describe("classYear", () => {
  const pref = (strength: Strength): Preference => ({
    type: "classYear",
    value: "exclude_mismatched",
    strength,
  });

  it("hard drops on an explicit conflicting class year in the JD", () => {
    expect(
      run({ jdText: "This program is for rising seniors." }, [pref("hard")]),
    ).toEqual({ pass: false, droppedBy: "classYear" });
  });

  it("hard drops on a conflicting graduation window", () => {
    expect(
      run({ jdText: "Must be graduating between December 2026 and June 2027." }, [
        pref("hard"),
      ]).pass,
    ).toBe(false);
  });

  it("passes when the profile year fits", () => {
    expect(
      run({ jdText: "Open to current sophomores and juniors." }, [pref("hard")])
        .pass,
    ).toBe(true);
    expect(run({ jdText: "Class of 2029 students." }, [pref("hard")]).pass).toBe(
      true,
    );
  });

  it("passes when nothing is stated — including seniority words in titles", () => {
    expect(
      run({ title: "Senior Software Engineering Intern", jdText: "" }, [
        pref("hard"),
      ]).pass,
    ).toBe(true);
  });

  it.each(NON_HARD)("%s never drops", (strength) => {
    expect(
      run({ jdText: "Rising seniors only." }, [pref(strength)]).pass,
    ).toBe(true);
  });
});

describe("sponsorship", () => {
  const pref = (strength: Strength): Preference => ({
    type: "sponsorship",
    value: "needs_sponsorship",
    strength,
  });

  it("hard drops on explicit structured conflict", () => {
    expect(run({ sponsorship: "no_sponsorship" }, [pref("hard")])).toEqual({
      pass: false,
      droppedBy: "sponsorship",
    });
    expect(
      run({ sponsorship: "us_citizenship_required" }, [pref("hard")]).pass,
    ).toBe(false);
  });

  it("hard drops on explicit JD text conflict", () => {
    expect(
      run({ jdText: "We are unable to sponsor visas for this role." }, [
        pref("hard"),
      ]).pass,
    ).toBe(false);
    expect(
      run({ jdText: "U.S. citizenship is required for this position." }, [
        pref("hard"),
      ]).pass,
    ).toBe(false);
  });

  it("passes on unknown", () => {
    expect(run({ sponsorship: "unknown" }, [pref("hard")]).pass).toBe(true);
  });

  it("no_sponsorship_needed conflicts with nothing", () => {
    expect(
      run({ sponsorship: "no_sponsorship" }, [
        { type: "sponsorship", value: "no_sponsorship_needed", strength: "hard" },
      ]).pass,
    ).toBe(true);
  });

  it.each(NON_HARD)("%s never drops", (strength) => {
    expect(run({ sponsorship: "no_sponsorship" }, [pref(strength)]).pass).toBe(
      true,
    );
  });
});

describe("workMode", () => {
  const pref = (strength: Strength): Preference => ({
    type: "workMode",
    value: ["remote", "hybrid"],
    strength,
  });

  it("hard drops a known non-matching mode", () => {
    expect(run({ remoteType: "onsite" }, [pref("hard")])).toEqual({
      pass: false,
      droppedBy: "workMode",
    });
  });

  it("passes unknown mode", () => {
    expect(run({ remoteType: "unknown" }, [pref("hard")]).pass).toBe(true);
  });

  it.each(NON_HARD)("%s never drops", (strength) => {
    expect(run({ remoteType: "onsite" }, [pref(strength)]).pass).toBe(true);
  });
});

describe("roleCategory", () => {
  const pref = (strength: Strength): Preference => ({
    type: "roleCategory",
    value: ["ai_ml_data"],
    strength,
  });

  it("hard drops a known non-matching category", () => {
    expect(run({ category: "quant" }, [pref("hard")])).toEqual({
      pass: false,
      droppedBy: "roleCategory",
    });
  });

  it("passes unmapped categories rather than guessing", () => {
    expect(run({ category: "other" }, [pref("hard")]).pass).toBe(true);
  });

  it.each(NON_HARD)("%s never drops", (strength) => {
    expect(run({ category: "quant" }, [pref(strength)]).pass).toBe(true);
  });
});

describe("location", () => {
  const pref = (strength: Strength, radius = 50): Preference => ({
    type: "location",
    value: { places: ["Rochester, NY"], radiusMiles: radius },
    strength,
  });
  const sanJose = { lat: 37.336, lon: -121.891, name: "San Jose, CA" };

  it("hard drops an onsite listing outside the radius", () => {
    expect(run({ geo: [sanJose] }, [pref("hard")])).toEqual({
      pass: false,
      droppedBy: "location",
    });
  });

  it("passes inside the radius (Buffalo at ~60mi with 100mi radius)", () => {
    const buffalo = { lat: 42.886, lon: -78.878, name: "Buffalo, NY" };
    expect(run({ geo: [buffalo] }, [pref("hard", 100)]).pass).toBe(true);
    expect(run({ geo: [buffalo] }, [pref("hard", 20)]).pass).toBe(false);
  });

  it("passes remote/hybrid and ungeocoded listings", () => {
    expect(
      run({ geo: [sanJose], remoteType: "remote" }, [pref("hard")]).pass,
    ).toBe(true);
    expect(run({ geo: [] }, [pref("hard")]).pass).toBe(true);
  });

  it.each(NON_HARD)("%s never drops", (strength) => {
    expect(run({ geo: [sanJose] }, [pref(strength)]).pass).toBe(true);
  });
});

describe("hard interests", () => {
  function runWithInterests(
    listing: Partial<FilterableListing>,
    interests: { keyword: string; tag: "want" | "avoid"; strength: "hard" | "strong" | "soft" | "ignore" }[],
  ) {
    return applyHardFilters(
      { ...baseListing, ...listing },
      { ...baseProfile, preferences: [], interests: interests as never },
      lookupCity,
    );
  }

  it("hard want drops listings that never mention the keyword", () => {
    expect(
      runWithInterests({ jdText: "We do databases." }, [
        { keyword: "robotics", tag: "want", strength: "hard" },
      ]),
    ).toEqual({ pass: false, droppedBy: "interestWant:robotics" });
  });

  it("hard want passes on a title mention even without a JD", () => {
    expect(
      runWithInterests({ title: "Robotics Intern", jdText: null }, [
        { keyword: "robotics", tag: "want", strength: "hard" },
      ]).pass,
    ).toBe(true);
  });

  it("hard avoid drops on any mention", () => {
    expect(
      runWithInterests({ jdText: "Expect occasional on-call crypto work." }, [
        { keyword: "crypto", tag: "avoid", strength: "hard" },
      ]),
    ).toEqual({ pass: false, droppedBy: "interestAvoid:crypto" });
  });

  it("non-hard interests never drop", () => {
    for (const strength of ["strong", "soft", "ignore"] as const) {
      expect(
        runWithInterests({ jdText: "crypto everywhere" }, [
          { keyword: "crypto", tag: "avoid", strength },
          { keyword: "unmentioned", tag: "want", strength },
        ]).pass,
      ).toBe(true);
    }
  });
});

describe("first matching rule wins and is reported", () => {
  it("reports the first conflicting rule in preference order", () => {
    const result = run({ degrees: ["phd"], sponsorship: "no_sponsorship" }, [
      { type: "sponsorship", value: "needs_sponsorship", strength: "hard" },
      { type: "degreeLevel", value: "exclude_mismatched", strength: "hard" },
    ]);
    expect(result.droppedBy).toBe("sponsorship");
  });
});

describe("textSignals unit behavior", () => {
  it("extracts class words only in student contexts", () => {
    const m = extractClassYearMentions(
      "Senior Software Engineer mentors; open to rising juniors. Class of 2028.",
    );
    expect(m.classYears).toEqual(new Set(["junior"]));
    expect(m.gradYears).toEqual(new Set([2028]));
  });

  it("classYearFit unstated on empty text", () => {
    expect(classYearFit(baseProfile, "")).toBe("unstated");
  });

  it("sponsorship conflict phrasing variants", () => {
    for (const text of [
      "must be authorized to work without sponsorship",
      "we will not sponsor visas",
      "no visa sponsorship available",
      "sponsorship is not available for this role",
      "US citizens only",
    ]) {
      expect(sponsorshipConflictInText(text), text).toBe(true);
    }
    expect(sponsorshipConflictInText("We offer visa sponsorship.")).toBe(false);
  });
});
