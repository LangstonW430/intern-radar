"use client";

import { useAction, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import InterestsEditor, { type InterestItem } from "@/components/InterestsEditor";
import SkillsEditor from "@/components/SkillsEditor";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  mergeSkillSuggestions,
  suggestInterestsFromResume,
} from "@/lib/profileSkills";

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

const STEPS = ["Resume", "Skills", "Interests", "Preferences", "Digest"] as const;

function StrengthSelect({
  value,
  onChange,
  label,
}: {
  value: Strength;
  onChange: (s: Strength) => void;
  label: string;
}) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value as Strength)}
      aria-label={`${label} strength`}
      className="h-8"
    >
      {STRENGTHS.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </Select>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={`inline-flex size-5 items-center justify-center rounded-full font-mono ${
              i < current
                ? "bg-accent/12 text-accent"
                : i === current
                  ? "bg-accent text-accent-contrast"
                  : "bg-ink/6 text-muted"
            }`}
          >
            {i + 1}
          </span>
          <span
            className={i === current ? "font-medium text-ink" : "text-muted"}
            aria-current={i === current ? "step" : undefined}
          >
            {label}
          </span>
          {i < STEPS.length - 1 && (
            <span aria-hidden className="ml-1.5 hidden text-hairline sm:inline">
              —
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const generateUploadUrl = useMutation(api.onboarding.generateResumeUploadUrl);
  const processResume = useAction(api.resume.processResume);
  const complete = useMutation(api.onboarding.complete);

  const [step, setStep] = useState(0);
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

  function next() {
    setError(null);
    // Graduation month lives on the Preferences step — gate leaving it.
    if (step === 3 && !gradDate) {
      setError("Please set your expected graduation month.");
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function handleSubmit() {
    setError(null);
    if (!gradDate) {
      setError("Please set your expected graduation month (Preferences step).");
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
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Set up your profile
        </h1>
        <p className="mt-1 text-sm text-muted">
          This powers your matches. Everything here can be changed later in
          settings.
        </p>
      </div>

      <Stepper current={step} />

      <Card className="flex flex-col gap-3 p-4 sm:p-5">
        {step === 0 && (
          <>
            <h2 className="font-medium">Resume</h2>
            <p className="text-sm text-muted">
              Used only to match you against job descriptions and suggest
              skills and interests. The PDF is parsed to text and then deleted
              — see the{" "}
              <a href="/privacy" className="text-accent underline">
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
              className="text-sm text-muted file:mr-3 file:rounded-md file:border file:border-hairline file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
            />
            {resumeStatus && <p className="text-sm text-pos">{resumeStatus}</p>}
            {!resumeText && (
              <p className="text-xs text-muted">
                You can skip this, but matches will be much weaker without it.
              </p>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="font-medium">Skills review</h2>
            <p className="text-sm text-muted">
              Matched against each job&apos;s requirement sections. Prefilled
              from your resume; edit freely.
            </p>
            <SkillsEditor
              skills={skills}
              onChange={setSkills}
              suggestions={skillSuggestions}
            />
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="font-medium">Interests</h2>
            <p className="text-sm text-muted">
              <span className="font-medium text-ink">
                Interests set your starting ranking
              </span>{" "}
              — want/avoid keywords seed your keyword weights, and your
              feedback tunes them from there. The dashed teal chips come from
              your resume.
            </p>
            <InterestsEditor
              interests={interests}
              onChange={setInterests}
              suggestions={[
                ...(resumeText
                  ? suggestInterestsFromResume(resumeText, interests as never)
                  : []),
                ...skillSuggestions,
              ]}
            />
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="font-medium">Preferences</h2>
            <div className="flex flex-wrap gap-3 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Expected graduation</span>
                <Input
                  type="month"
                  value={gradDate}
                  onChange={(e) => setGradDate(e.target.value)}
                  className="w-40"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Class year</span>
                <Select
                  value={classYear}
                  onChange={(e) => setClassYear(e.target.value)}
                >
                  {["freshman", "sophomore", "junior", "senior", "masters", "phd"].map(
                    (y) => (
                      <option key={y}>{y}</option>
                    ),
                  )}
                </Select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Degree level</span>
                <Select
                  value={degreeLevel}
                  onChange={(e) => setDegreeLevel(e.target.value)}
                >
                  {["bachelors", "masters", "phd"].map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </Select>
              </label>
            </div>
            <p className="text-xs text-muted">
              hard = filter out mismatches · strong/soft = how much it counts
              toward the score · ignore = off
            </p>
            <div className="rounded-md border border-hairline p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Location</span>
                <StrengthSelect
                  label="Location"
                  value={locationStrength}
                  onChange={setLocationStrength}
                />
              </div>
              <Input
                placeholder="City, ST (comma-separate several)"
                value={places}
                onChange={(e) => setPlaces(e.target.value)}
                className="mt-2 w-full"
              />
              <label className="mt-2 flex items-center justify-between text-sm">
                <span>
                  Radius:{" "}
                  <span className="font-mono tabular-nums">{radius}</span> miles
                </span>
                <input
                  type="range"
                  min={10}
                  max={250}
                  step={10}
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  className="w-40 accent-accent"
                />
              </label>
            </div>
            <div className="rounded-md border border-hairline p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Work mode</span>
                <StrengthSelect
                  label="Work mode"
                  value={workModeStrength}
                  onChange={setWorkModeStrength}
                />
              </div>
              <div className="mt-2 flex gap-4 text-sm">
                {WORK_MODES.map((m) => (
                  <label key={m} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={workModes.includes(m)}
                      onChange={() => toggle(workModes, setWorkModes, m)}
                      className="accent-accent"
                    />
                    {m}
                  </label>
                ))}
              </div>
            </div>
            <div className="rounded-md border border-hairline p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Role categories</span>
                <StrengthSelect
                  label="Role categories"
                  value={roleStrength}
                  onChange={setRoleStrength}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                {ROLE_CATEGORIES.map(([value, label]) => (
                  <label key={value} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={roles.includes(value)}
                      onChange={() => toggle(roles, setRoles, value)}
                      className="accent-accent"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div className="rounded-md border border-hairline p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Visa sponsorship</span>
                <StrengthSelect
                  label="Visa sponsorship"
                  value={sponsorshipStrength}
                  onChange={setSponsorshipStrength}
                />
              </div>
              <Select
                value={sponsorship}
                onChange={(e) => setSponsorship(e.target.value)}
                className="mt-2"
              >
                <option value="no_sponsorship_needed">
                  I don&apos;t need sponsorship
                </option>
                <option value="needs_sponsorship">I need sponsorship</option>
              </Select>
            </div>
            <div className="rounded-md border border-hairline p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  Filter out class-year mismatches
                </span>
                <StrengthSelect
                  label="Class-year filter"
                  value={classYearStrength}
                  onChange={setClassYearStrength}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="font-medium">
                  Filter out degree-level mismatches
                </span>
                <StrengthSelect
                  label="Degree-level filter"
                  value={degreeStrength}
                  onChange={setDegreeStrength}
                />
              </div>
            </div>
            <div className="rounded-md border border-hairline p-3">
              <span className="text-sm font-medium">
                Excluded companies (always filtered)
              </span>
              <Input
                placeholder="Company names, comma-separated"
                value={excludeCompanies}
                onChange={(e) => setExcludeCompanies(e.target.value)}
                className="mt-2 w-full"
              />
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="font-medium">Email digest</h2>
            <label className="flex items-center justify-between text-sm">
              Frequency
              <Select
                value={frequency}
                onChange={(e) =>
                  setFrequency(e.target.value as typeof frequency)
                }
              >
                <option value="instant">instant</option>
                <option value="daily">daily</option>
                <option value="weekly">weekly</option>
              </Select>
            </label>
            <label className="flex items-center justify-between text-sm">
              <span>
                Score threshold{" "}
                <span className="font-mono text-xs tabular-nums text-muted">
                  {threshold.toFixed(2)}
                </span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-44 accent-accent"
              />
            </label>
            <label className="flex items-center justify-between text-sm">
              Wildcards per digest
              <Input
                type="number"
                min={0}
                max={10}
                value={wildcards}
                onChange={(e) => setWildcards(Number(e.target.value))}
                className="w-20 text-right"
              />
            </label>
          </>
        )}
      </Card>

      <div className="flex items-center gap-2">
        {step > 0 && (
          <Button onClick={() => setStep((s) => s - 1)} disabled={busy}>
            Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button variant="primary" onClick={next}>
            Continue
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => void handleSubmit()}
            disabled={busy}
          >
            {busy ? "Saving…" : "Finish setup"}
          </Button>
        )}
        {error && <p className="text-sm text-neg">{error}</p>}
      </div>
    </main>
  );
}
