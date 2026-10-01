"use client";

import { useState } from "react";

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
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {skills.map((skill) => (
          <span
            key={skill}
            className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-sm"
          >
            {skill}
            <button
              aria-label={`Remove ${skill}`}
              onClick={() => onChange(skills.filter((s) => s !== skill))}
              className="text-neutral-400 hover:text-neutral-700"
            >
              ×
            </button>
          </span>
        ))}
        {skills.length === 0 && (
          <span className="text-sm text-neutral-400">No skills yet.</span>
        )}
      </div>
      {offered.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-neutral-500">From your resume:</span>
          {offered.map((s) => (
            <button
              key={s}
              onClick={() => add(s)}
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
          add(draft);
          setDraft("");
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a skill"
          className="w-48 rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <button type="submit" className="rounded border border-neutral-300 px-2 py-1 text-sm">
          Add
        </button>
      </form>
    </div>
  );
}
