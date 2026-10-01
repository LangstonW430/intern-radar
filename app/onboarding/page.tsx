"use client";

import { useAction, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import InterestsEditor, { type InterestItem } from "@/components/InterestsEditor";
import SkillsEditor from "@/components/SkillsEditor";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { mergeSkillSuggestions } from "@/lib/profileSkills";

const STRENGTHS = ["hard", "strong", "soft", "ignore"] as const;
type Strength = (typeof STRENGTHS)[number];

const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
const ROLE_CATEGORIES = [
  ["ai_ml_data", "AI / ML / Data"],
  ["swe", "Software Engineering"],
  ["hardware", "Hardware"],
  ["product", "Product"],
  ["quant", "Quant"],
] as const;

function StrengthSelect({
  value,
  onChange,
}: {
  value: Strength;
  onChange: (s: Strength) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Strength)}
      className="rounded border border-neutral-300 px-2 py-1 text-sm"
    >
      {STRENGTHS.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const generateUploadUrl = useMutation(api.onboarding.generateResumeUploadUrl);
  const processResume = useAction(api.resume.processResume);
  const complete = useMutation(api.onboarding.complete);

  const [resumeText, setResumeText] = useState<string | null>(null);
  const [resumeStatus, setResumeStatus] = useState<string | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [skillSuggestions, setSkillSuggestions] = useState<string[]>([]);
  const [interests, setInterests] = useState<InterestItem[]>([]);

  const [gradDate, setGradDate] = useState("");
  const [classYear, setClassYear] = useState("sophomore");
  const [degreeLevel, setDegreeLevel] = useState("bachelors");

  const [places, setPlaces] = useState("");
  const [radius, setRadius] = useState(50);
  const [locationStrength, setLocationStrength] = useState<Strength>("soft");
  const [workModes, setWorkModes] = useState<string[]>([...WORK_MODES]);
  const [workModeStrength, setWorkModeStrength] = useState<Strength>("soft");
  const [roles, setRoles] = useState<string[]>(["ai_ml_data", "swe"]);
  const [roleStrength, setRoleStrength] = useState<Strength>("soft");
  const [sponsorship, setSponsorship] = useState("no_sponsorship_needed");
  const [sponsorshipStrength, setSponsorshipStrength] =
    useState<Strength>("soft");
  // Defaults per CLAUDE.md: class-year / degree-level mismatches and
  // excluded companies are hard.
  const [classYearStrength, setClassYearStrength] = useState<Strength>("hard");
  const [degreeStrength, setDegreeStrength] = useState<Strength>("hard");
  const [excludeCompanies, setExcludeCompanies] = useState("");

  const [frequency, setFrequency] = useState<"instant" | "daily" | "weekly">(
    "daily",
  );
  const [threshold, setThreshold] = useState(0.6);
  const [wildcards, setWildcards] = useState(2);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleResumeUpload(file: File) {
    setResumeStatus("Uploading…");
    setError(null);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/pdf" },
        body: file,
      });
      if (!res.ok) throw new Error(`upload failed (${res.status})`);
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      setResumeStatus("Reading your resume…");
      const result = await processResume({ storageId });
      setResumeText(result.resumeText);
      // Prefill = merge, never replace: anything already added stays.
      setSkills((current) =>
        mergeSkillSuggestions(current, result.detectedSkills),
      );
      setSkillSuggestions(result.detectedSkills);
      setResumeStatus(
        `Got it — ${result.resumeText.length} characters extracted, ${result.detectedSkills.length} skills detected. The PDF itself has been deleted.`,
      );
    } catch (err) {
      setResumeStatus(null);
      setError(`Couldn't read that PDF: ${String(err)}`);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!gradDate) {
      setError("Please set your expected graduation month.");
      return;
    }
    setBusy(true);
    try {
      await complete({
        gradDate,
        classYear,
        degreeLevel,
        preferences: [
          {
            type: "location",
            value: {
              places: places
                .split(",")
                .map((p) => p.trim())
                .filter(Boolean),
              radiusMiles: radius,
            },
            strength: locationStrength,
          },
          { type: "workMode", value: workModes, strength: workModeStrength },
          { type: "roleCategory", value: roles, strength: roleStrength },
          { type: "sponsorship", value: sponsorship, strength: sponsorshipStrength },
          {
            type: "classYear",
            value: "exclude_mismatched",
            strength: classYearStrength,
          },
          {
            type: "degreeLevel",
            value: "exclude_mismatched",
            strength: degreeStrength,
          },
          {
            type: "excludeCompanies",
            value: excludeCompanies
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean),
            strength: "hard",
          },
        ] as never,
        skills,
        interests: interests as never,
        threshold,
        frequency,
        wildcards,
        resumeText: resumeText ?? undefined,
      });
      router.push("/matches");
    } catch (err) {
      setError(`Couldn't save your profile: ${String(err)}`);
      setBusy(false);
    }
  }

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Set up your profile</h1>
        <p className="text-sm text-neutral-500">
          This powers your matches. Everything here can be changed later in
          settings.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">1. Resume</h2>
        <p className="text-sm text-neutral-500">
          Used only to match you against job descriptions. The PDF is parsed to
          text and then deleted — see the{" "}
          <a href="/privacy" className="underline">
            privacy page
          </a>
          .
        </p>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleResumeUpload(file);
          }}
          className="text-sm"
        />
        {resumeStatus && (
          <p className="text-sm text-emerald-700">{resumeStatus}</p>
        )}
        {!resumeText && (
          <p className="text-xs text-neutral-400">
            You can skip this, but matches will be much weaker without it.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">2. About you</h2>
        <label className="flex items-center justify-between text-sm">
          Expected graduation
          <input
            type="month"
            value={gradDate}
            onChange={(e) => setGradDate(e.target.value)}
            className="rounded border border-neutral-300 px-2 py-1"
          />
        </label>
        <label className="flex items-center justify-between text-sm">
          Class year (this application season)
          <select
            value={classYear}
            onChange={(e) => setClassYear(e.target.value)}
            className="rounded border border-neutral-300 px-2 py-1"
          >
            {["freshman", "sophomore", "junior", "senior", "masters", "phd"].map(
              (y) => (
                <option key={y}>{y}</option>
              ),
            )}
          </select>
        </label>
        <label className="flex items-center justify-between text-sm">
          Degree level
          <select
            value={degreeLevel}
            onChange={(e) => setDegreeLevel(e.target.value)}
            className="rounded border border-neutral-300 px-2 py-1"
          >
            {["bachelors", "masters", "phd"].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">3. Preferences</h2>
        <p className="text-xs text-neutral-500">
          hard = filter out mismatches · strong/soft = starting weight the
          model tunes from your feedback · ignore = off
        </p>
        <div className="rounded border border-neutral-200 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Location</span>
            <StrengthSelect value={locationStrength} onChange={setLocationStrength} />
          </div>
          <input
            placeholder="City, ST (comma-separate several)"
            value={places}
            onChange={(e) => setPlaces(e.target.value)}
            className="mt-2 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          />
          <label className="mt-2 flex items-center justify-between text-sm">
            Radius: {radius} miles
            <input
              type="range"
              min={10}
              max={250}
              step={10}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="w-40"
            />
          </label>
        </div>
        <div className="rounded border border-neutral-200 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Work mode</span>
            <StrengthSelect value={workModeStrength} onChange={setWorkModeStrength} />
          </div>
          <div className="mt-2 flex gap-4 text-sm">
            {WORK_MODES.map((m) => (
              <label key={m} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={workModes.includes(m)}
                  onChange={() => toggle(workModes, setWorkModes, m)}
                />
                {m}
              </label>
            ))}
          </div>
        </div>
        <div className="rounded border border-neutral-200 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Role categories</span>
            <StrengthSelect value={roleStrength} onChange={setRoleStrength} />
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            {ROLE_CATEGORIES.map(([value, label]) => (
              <label key={value} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={roles.includes(value)}
                  onChange={() => toggle(roles, setRoles, value)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div className="rounded border border-neutral-200 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Visa sponsorship</span>
            <StrengthSelect
              value={sponsorshipStrength}
              onChange={setSponsorshipStrength}
            />
          </div>
          <select
            value={sponsorship}
            onChange={(e) => setSponsorship(e.target.value)}
            className="mt-2 rounded border border-neutral-300 px-2 py-1 text-sm"
          >
            <option value="no_sponsorship_needed">
              I don&apos;t need sponsorship
            </option>
            <option value="needs_sponsorship">I need sponsorship</option>
          </select>
        </div>
        <div className="rounded border border-neutral-200 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Filter out class-year mismatches</span>
            <StrengthSelect value={classYearStrength} onChange={setClassYearStrength} />
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="font-medium">Filter out degree-level mismatches</span>
            <StrengthSelect value={degreeStrength} onChange={setDegreeStrength} />
          </div>
        </div>
        <div className="rounded border border-neutral-200 p-3">
          <span className="text-sm font-medium">Excluded companies (always filtered)</span>
          <input
            placeholder="Company names, comma-separated"
            value={excludeCompanies}
            onChange={(e) => setExcludeCompanies(e.target.value)}
            className="mt-2 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">4. Skills</h2>
        <p className="text-xs text-neutral-500">
          Matched against each job&apos;s requirement sections. Prefilled from
          your resume; edit freely.
        </p>
        <SkillsEditor
          skills={skills}
          onChange={setSkills}
          suggestions={skillSuggestions}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">5. Interests (optional)</h2>
        <InterestsEditor
          interests={interests}
          onChange={setInterests}
          suggestions={skillSuggestions}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">6. Email digest</h2>
        <label className="flex items-center justify-between text-sm">
          Frequency
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as typeof frequency)}
            className="rounded border border-neutral-300 px-2 py-1"
          >
            <option value="instant">instant</option>
            <option value="daily">daily</option>
            <option value="weekly">weekly</option>
          </select>
        </label>
        <label className="flex items-center justify-between text-sm">
          Score threshold ({threshold.toFixed(2)})
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-48"
          />
        </label>
        <label className="flex items-center justify-between text-sm">
          Wildcards per digest
          <input
            type="number"
            min={0}
            max={10}
            value={wildcards}
            onChange={(e) => setWildcards(Number(e.target.value))}
            className="w-20 rounded border border-neutral-300 px-2 py-1"
          />
        </label>
      </section>

      <button
        onClick={() => void handleSubmit()}
        disabled={busy}
        className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {busy ? "Saving…" : "Finish setup"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </main>
  );
}
