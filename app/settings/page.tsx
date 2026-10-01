"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import Header from "@/components/Header";
import RequireProfile from "@/components/RequireProfile";
import InterestsEditor, { type InterestItem } from "@/components/InterestsEditor";
import KeywordWeightsEditor from "@/components/KeywordWeightsEditor";
import SkillsEditor from "@/components/SkillsEditor";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import Skeleton from "@/components/ui/Skeleton";
import { suggestInterestsFromResume } from "@/lib/profileSkills";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

const STRENGTHS = ["hard", "strong", "soft", "ignore"] as const;
type Strength = (typeof STRENGTHS)[number];

const CLASS_YEARS = [
  "freshman",
  "sophomore",
  "junior",
  "senior",
  "masters",
  "phd",
] as const;
const DEGREE_LEVELS = ["bachelors", "masters", "phd"] as const;

const PREF_LABELS: Record<string, string> = {
  location: "Location",
  workMode: "Work mode",
  roleCategory: "Role category",
  sponsorship: "Sponsorship",
  classYear: "Class year",
  degreeLevel: "Degree level",
  excludeCompanies: "Excluded companies",
};

type EditablePreference = {
  type: string;
  value: unknown;
  strength: Strength;
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <div>
        <h2 className="font-medium">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {children}
    </Card>
  );
}

export default function SettingsPage() {
  const profile = useQuery(api.profile.getMine);

  return (
    <RequireProfile>
      <div className="min-h-screen">
        <Header />
        <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
          <h1 className="mb-5 text-2xl font-semibold tracking-tight">
            Settings
          </h1>
          {profile === undefined && (
            <div className="flex flex-col gap-4" aria-busy>
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}
          {profile && <SettingsForm key={profile._id} profile={profile} />}
        </main>
      </div>
    </RequireProfile>
  );
}

function SettingsForm({ profile }: { profile: Doc<"profiles"> }) {
  const save = useMutation(api.profile.updateSettings);
  const deleteAccount = useMutation(api.profile.deleteMyAccount);
  const { signOut } = useAuthActions();
  const router = useRouter();
  const [preferences, setPreferences] = useState<EditablePreference[]>(
    profile.preferences as EditablePreference[],
  );
  const [gradDate, setGradDate] = useState(profile.gradDate);
  const [classYear, setClassYear] = useState(profile.classYear);
  const [degreeLevel, setDegreeLevel] = useState(profile.degreeLevel);
  const [threshold, setThreshold] = useState(profile.threshold);
  const [frequency, setFrequency] = useState(profile.frequency);
  const [wildcards, setWildcards] = useState(profile.wildcards);
  const [subscribed, setSubscribed] = useState(profile.subscribed !== false);
  const [skills, setSkills] = useState<string[]>(profile.skills ?? []);
  const [interests, setInterests] = useState<InterestItem[]>(
    (profile.interests as InterestItem[] | undefined) ?? [],
  );
  const [status, setStatus] = useState<string | null>(null);

  async function handleSave() {
    setStatus(null);
    try {
      await save({
        preferences: preferences as never,
        gradDate,
        classYear,
        degreeLevel,
        threshold,
        frequency,
        wildcards,
        subscribed,
        skills,
        interests: interests as never,
      });
      setStatus("Saved. Matches are being re-scored.");
    } catch (err) {
      setStatus(`Save failed: ${String(err)}`);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      "Delete your account and all data (profile, resume text, matches, feedback)? This cannot be undone.",
    );
    if (!confirmed) return;
    try {
      await deleteAccount();
      await signOut();
      router.push("/");
    } catch (err) {
      setStatus(`Deletion failed: ${String(err)}`);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Profile basics"
        description="Used by the class-year and degree filters."
      >
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Graduation</span>
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
              {CLASS_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Degree level</span>
            <Select
              value={degreeLevel}
              onChange={(e) => setDegreeLevel(e.target.value)}
            >
              {DEGREE_LEVELS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </Section>

      <Section
        title="Preference strengths"
        description="hard filters listings out before scoring; strong and soft set how much the preference counts toward the score; ignore turns a preference off."
      >
        <ul className="flex flex-col gap-1.5">
          {preferences.map((pref, i) => (
            <li
              key={pref.type}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <div className="min-w-0">
                <span className="font-medium">
                  {PREF_LABELS[pref.type] ?? pref.type}
                </span>
                <span className="ml-2 text-xs text-muted">
                  {summarizeValue(pref)}
                </span>
              </div>
              <Select
                value={pref.strength}
                onChange={(e) => {
                  const next = [...preferences];
                  next[i] = { ...pref, strength: e.target.value as Strength };
                  setPreferences(next);
                }}
                aria-label={`${PREF_LABELS[pref.type] ?? pref.type} strength`}
                className="h-8"
              >
                {STRENGTHS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Skills"
        description="Matched against the requirements extracted from job descriptions."
      >
        <SkillsEditor skills={skills} onChange={setSkills} />
      </Section>

      <Section title="Interests">
        <InterestsEditor
          interests={interests}
          onChange={setInterests}
          suggestions={
            profile.resumeText
              ? suggestInterestsFromResume(profile.resumeText, interests as never)
              : []
          }
        />
      </Section>

      <Section title="Keyword weights">
        <KeywordWeightsEditor weights={profile.keywordWeights ?? {}} />
      </Section>

      <Section title="Digest">
        <div className="flex flex-col gap-3 text-sm">
          <label className="flex items-center justify-between gap-3">
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
          <label className="flex items-center justify-between">
            Frequency
            <Select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as typeof frequency)}
            >
              <option value="instant">instant</option>
              <option value="daily">daily</option>
              <option value="weekly">weekly</option>
            </Select>
          </label>
          <label className="flex items-center justify-between">
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
          <label className="flex items-center justify-between">
            Receive digest emails
            <input
              type="checkbox"
              checked={subscribed}
              onChange={(e) => setSubscribed(e.target.checked)}
              className="accent-accent"
            />
          </label>
        </div>
      </Section>

      <ReplaceResume hasResume={Boolean(profile.resumeText)} />

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={() => void handleSave()}>
          Save changes
        </Button>
        {status && <p className="text-sm text-muted">{status}</p>}
      </div>

      <Card className="mt-4 flex flex-col gap-2 border-neg/30 p-4 sm:p-5">
        <h2 className="font-medium text-neg">Danger zone</h2>
        <p className="text-sm text-muted">
          Permanently delete your account, resume text, matches, feedback, and
          keyword weights. See the{" "}
          <a href="/privacy" className="underline">
            privacy page
          </a>{" "}
          for details.
        </p>
        <div>
          <Button variant="destructive" onClick={() => void handleDelete()}>
            Delete my account and data
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ReplaceResume({ hasResume }: { hasResume: boolean }) {
  const generateUploadUrl = useMutation(api.onboarding.generateResumeUploadUrl);
  const processResume = useAction(api.resume.processResume);
  const replaceResume = useMutation(api.profile.replaceResume);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    setStatus("Uploading…");
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error(`upload failed (${res.status})`);
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      setStatus("Reading your resume…");
      const result = await processResume({ storageId });
      await replaceResume({ resumeText: result.resumeText });
      setStatus(
        `Updated — ${result.resumeText.length} characters extracted. The PDF itself has been deleted.`,
      );
    } catch (err) {
      setStatus(`Replace failed: ${String(err)}`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Section
      title="Resume"
      description={
        hasResume
          ? "A resume is on file (text only — the PDF was deleted after parsing)."
          : "No resume on file yet."
      }
    >
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <Button disabled={busy} onClick={() => inputRef.current?.click()}>
          {hasResume ? "Replace resume (PDF)" : "Upload resume (PDF)"}
        </Button>
        {status && <p className="text-sm text-muted">{status}</p>}
      </div>
    </Section>
  );
}

function summarizeValue(pref: EditablePreference): string {
  const v = pref.value;
  if (Array.isArray(v)) return v.join(", ") || "(none)";
  if (v && typeof v === "object" && "places" in v) {
    const loc = v as { places: string[]; radiusMiles?: number };
    return `${loc.places.join(", ")}${loc.radiusMiles ? ` (${loc.radiusMiles} mi)` : ""}`;
  }
  return String(v);
}
