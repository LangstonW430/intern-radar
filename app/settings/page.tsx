"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import Header from "@/components/Header";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

const STRENGTHS = ["hard", "strong", "soft", "ignore"] as const;
type Strength = (typeof STRENGTHS)[number];

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

export default function SettingsPage() {
  const profile = useQuery(api.profile.getMine);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="mb-4 text-xl font-semibold">Settings</h1>
        {profile === undefined && <p className="text-neutral-500">Loading…</p>}
        {profile === null && (
          <p className="text-neutral-600">
            No profile yet. Run <code>pnpm seed:profile</code> with your
            <code> profile.seed.json</code> first.
          </p>
        )}
        {profile && <SettingsForm key={profile._id} profile={profile} />}
      </main>
    </div>
  );
}

function SettingsForm({ profile }: { profile: Doc<"profiles"> }) {
  const save = useMutation(api.profile.updateSettings);
  const [preferences, setPreferences] = useState<EditablePreference[]>(
    profile.preferences as EditablePreference[],
  );
  const [threshold, setThreshold] = useState(profile.threshold);
  const [frequency, setFrequency] = useState(profile.frequency);
  const [wildcards, setWildcards] = useState(profile.wildcards);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSave() {
    setStatus(null);
    try {
      await save({
        preferences: preferences as never,
        threshold,
        frequency,
        wildcards,
      });
      setStatus("Saved. Matches are being re-scored.");
    } catch (err) {
      setStatus(`Save failed: ${String(err)}`);
    }
  }

  return (
    <>
      <section className="mb-6">
        <h2 className="mb-2 font-medium">Preference strengths</h2>
        <p className="mb-3 text-sm text-neutral-500">
          hard filters listings out before scoring; strong and soft set the
          starting weight the model tunes from your feedback; ignore turns a
          preference off.
        </p>
        <ul className="flex flex-col gap-2">
          {preferences.map((pref, i) => (
            <li
              key={pref.type}
              className="flex items-center justify-between rounded border border-neutral-200 px-3 py-2"
            >
              <div>
                <span className="text-sm font-medium">
                  {PREF_LABELS[pref.type] ?? pref.type}
                </span>
                <span className="ml-2 text-xs text-neutral-500">
                  {summarizeValue(pref)}
                </span>
              </div>
              <select
                value={pref.strength}
                onChange={(e) => {
                  const next = [...preferences];
                  next[i] = { ...pref, strength: e.target.value as Strength };
                  setPreferences(next);
                }}
                className="rounded border border-neutral-300 px-2 py-1 text-sm"
              >
                {STRENGTHS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-6 flex flex-col gap-3">
        <h2 className="font-medium">Digest</h2>
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
        onClick={() => void handleSave()}
        className="rounded bg-neutral-900 px-4 py-2 text-white"
      >
        Save
      </button>
      {status && <p className="mt-3 text-sm text-neutral-600">{status}</p>}
    </>
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
