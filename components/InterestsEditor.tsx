"use client";

import { useMemo, useState } from "react";
import {
  CATEGORIES,
  keywordIdForInterest,
  VOCABULARY,
  type VocabCategory,
  type VocabEntry,
} from "@/lib/vocabulary";
import Button from "./ui/Button";
import { Input, Select } from "./ui/Field";

export interface InterestItem {
  keyword: string;
  tag: "want" | "avoid";
  strength: "hard" | "strong" | "soft" | "ignore";
}

const STRENGTHS = ["hard", "strong", "soft", "ignore"] as const;

const CATEGORY_LABELS: Record<VocabCategory, string> = {
  skill: "Skills & tools",
  domain: "Domains",
  role_type: "Role types",
  work_style: "Work style",
};

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
  const [query, setQuery] = useState("");

  const have = useMemo(
    () => new Set(interests.map((i) => keywordIdForInterest(i.keyword))),
    [interests],
  );
  const offered = suggestions.filter(
    (s) => !have.has(keywordIdForInterest(s)),
  );

  const search = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!search) return [];
    return VOCABULARY.filter(
      (e) =>
        !have.has(e.id) &&
        (e.name.toLowerCase().includes(search) ||
          e.aliases.some((a) => a.includes(search))),
    ).slice(0, 30);
  }, [search, have]);

  function add(keyword: string, tag: "want" | "avoid") {
    const trimmed = keyword.trim();
    if (!trimmed || have.has(keywordIdForInterest(trimmed))) return;
    onChange([...interests, { keyword: trimmed, tag, strength: "soft" }]);
  }

  const chip = (entry: VocabEntry) => (
    <button
      key={entry.id}
      type="button"
      onClick={() => add(entry.name, draftTag)}
      className="h-6 rounded-full border border-hairline px-2.5 text-xs text-muted transition-colors hover:border-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
    >
      + {entry.name}
    </button>
  );

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-xs text-muted">
        Keywords matched against titles and job descriptions. &quot;hard
        want&quot; requires a mention; &quot;hard avoid&quot; filters the
        listing out; strong and soft set the keyword&apos;s starting weight,
        which your feedback then tunes.
      </p>
      <ul className="flex flex-col gap-1.5">
        {interests.map((interest, i) => (
          <li key={interest.keyword} className="flex items-center gap-2 text-sm">
            <span className="min-w-28 flex-1 truncate">{interest.keyword}</span>
            <Select
              value={interest.tag}
              onChange={(e) => {
                const next = [...interests];
                next[i] = { ...interest, tag: e.target.value as "want" | "avoid" };
                onChange(next);
              }}
              aria-label={`${interest.keyword} direction`}
              className="h-8"
            >
              <option value="want">want</option>
              <option value="avoid">avoid</option>
            </Select>
            <Select
              value={interest.strength}
              onChange={(e) => {
                const next = [...interests];
                next[i] = {
                  ...interest,
                  strength: e.target.value as InterestItem["strength"],
                };
                onChange(next);
              }}
              aria-label={`${interest.keyword} strength`}
              className="h-8"
            >
              {STRENGTHS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            <button
              aria-label={`Remove ${interest.keyword}`}
              onClick={() => onChange(interests.filter((_, j) => j !== i))}
              className="rounded px-1 text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              ×
            </button>
          </li>
        ))}
        {interests.length === 0 && (
          <li className="text-sm text-muted">No interests yet — optional.</li>
        )}
      </ul>
      {offered.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted">Ideas from your resume:</span>
          {offered.slice(0, 8).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s, "want")}
              className="h-6 rounded-full border border-dashed border-accent/50 px-2.5 text-accent transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
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
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a keyword"
          className="w-48"
        />
        <Select
          value={draftTag}
          onChange={(e) => setDraftTag(e.target.value as "want" | "avoid")}
          aria-label="Direction for new keywords"
        >
          <option value="want">want</option>
          <option value="avoid">avoid</option>
        </Select>
        <Button type="submit">Add</Button>
      </form>
      <div className="flex flex-col gap-1">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the vocabulary…"
          aria-label="Search the vocabulary"
          className="w-64"
        />
        {search ? (
          <div className="flex flex-wrap gap-1.5 py-1">
            {searchResults.length > 0 ? (
              searchResults.map(chip)
            ) : (
              <span className="text-sm text-muted">
                No matches — add it as free text above.
              </span>
            )}
          </div>
        ) : (
          CATEGORIES.map((category) => (
            <details key={category} className="text-sm">
              <summary className="cursor-pointer py-1 text-muted transition-colors hover:text-ink">
                {CATEGORY_LABELS[category]}
              </summary>
              <div className="flex flex-wrap gap-1.5 py-1">
                {VOCABULARY.filter(
                  (e) => e.category === category && !have.has(e.id),
                ).map(chip)}
              </div>
            </details>
          ))
        )}
      </div>
    </div>
  );
}
