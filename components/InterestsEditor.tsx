"use client";

import { useState } from "react";

export interface InterestItem {
  keyword: string;
  tag: "want" | "avoid";
  strength: "hard" | "strong" | "soft" | "ignore";
}

const STRENGTHS = ["hard", "strong", "soft", "ignore"] as const;

export default function InterestsEditor({
  interests,
  onChange,
  suggestions = [],
}: {
  interests: InterestItem[];
  onChange: (interests: InterestItem[]) => void;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState("");
  const [draftTag, setDraftTag] = useState<"want" | "avoid">("want");

  const have = new Set(interests.map((i) => i.keyword.toLowerCase()));
  const offered = suggestions.filter((s) => !have.has(s.toLowerCase()));

  function add(keyword: string, tag: "want" | "avoid") {
    const trimmed = keyword.trim();
    if (!trimmed || have.has(trimmed.toLowerCase())) return;
    onChange([...interests, { keyword: trimmed, tag, strength: "soft" }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-neutral-500">
        Keywords matched against titles and job descriptions. &quot;hard
        want&quot; requires a mention; &quot;hard avoid&quot; filters the
        listing out.
      </p>
      <ul className="flex flex-col gap-1">
        {interests.map((interest, i) => (
          <li key={interest.keyword} className="flex items-center gap-2 text-sm">
            <span className="min-w-28 flex-1">{interest.keyword}</span>
            <select
              value={interest.tag}
              onChange={(e) => {
                const next = [...interests];
                next[i] = { ...interest, tag: e.target.value as "want" | "avoid" };
                onChange(next);
              }}
              className="rounded border border-neutral-300 px-1 py-0.5"
            >
              <option value="want">want</option>
              <option value="avoid">avoid</option>
            </select>
            <select
              value={interest.strength}
              onChange={(e) => {
                const next = [...interests];
                next[i] = {
                  ...interest,
                  strength: e.target.value as InterestItem["strength"],
                };
                onChange(next);
              }}
              className="rounded border border-neutral-300 px-1 py-0.5"
            >
              {STRENGTHS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              aria-label={`Remove ${interest.keyword}`}
              onClick={() => onChange(interests.filter((_, j) => j !== i))}
              className="text-neutral-400 hover:text-neutral-700"
            >
              ×
            </button>
          </li>
        ))}
        {interests.length === 0 && (
          <li className="text-sm text-neutral-400">No interests yet — optional.</li>
        )}
      </ul>
      {offered.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-neutral-500">Ideas from your resume:</span>
          {offered.slice(0, 5).map((s) => (
            <button
              key={s}
              onClick={() => add(s, "want")}
              className="rounded-full border border-dashed border-neutral-300 px-2 py-0.5 text-neutral-600 hover:border-neutral-500"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add(draft, draftTag);
          setDraft("");
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a keyword"
          className="w-48 rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <select
          value={draftTag}
          onChange={(e) => setDraftTag(e.target.value as "want" | "avoid")}
          className="rounded border border-neutral-300 px-1 py-0.5 text-sm"
        >
          <option value="want">want</option>
          <option value="avoid">avoid</option>
        </select>
        <button type="submit" className="rounded border border-neutral-300 px-2 py-1 text-sm">
          Add
        </button>
      </form>
    </div>
  );
}
