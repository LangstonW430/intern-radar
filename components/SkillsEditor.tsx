"use client";

import { useState } from "react";
import Button from "./ui/Button";
import { Input } from "./ui/Field";

export default function SkillsEditor({
  skills,
  onChange,
  suggestions = [],
}: {
  skills: string[];
  onChange: (skills: string[]) => void;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState("");

  const have = new Set(skills.map((s) => s.toLowerCase()));
  const offered = suggestions.filter((s) => !have.has(s.toLowerCase()));

  function add(skill: string) {
    const trimmed = skill.trim();
    if (!trimmed || have.has(trimmed.toLowerCase())) return;
    onChange([...skills, trimmed]);
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-1.5">
        {skills.map((skill) => (
          <span
            key={skill}
            className="inline-flex h-6 items-center gap-1 rounded-full bg-ink/6 px-2.5 text-xs text-ink"
          >
            {skill}
            <button
              aria-label={`Remove ${skill}`}
              onClick={() => onChange(skills.filter((s) => s !== skill))}
              className="text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              ×
            </button>
          </span>
        ))}
        {skills.length === 0 && (
          <span className="text-sm text-muted">No skills yet.</span>
        )}
      </div>
      {offered.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted">From your resume:</span>
          {offered.map((s) => (
            <button
              key={s}
              onClick={() => add(s)}
              className="h-6 rounded-full border border-dashed border-hairline px-2.5 text-muted transition-colors hover:border-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
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
          add(draft);
          setDraft("");
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a skill"
          className="w-48"
        />
        <Button type="submit">Add</Button>
      </form>
    </div>
  );
}
