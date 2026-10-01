"use client";

import type { ReactNode } from "react";
import Chip from "./ui/Chip";
import Button from "./ui/Button";
import type { MatchRowData } from "@/lib/matchFilters";

export type FeedbackKind =
  | "applied"
  | "thumbs_up"
  | "thumbs_down"
  | "good_suggestion"
  | "bad_suggestion";

const WORK_MODE_LABELS: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

export function formatAge(datePosted: number, now: number): string {
  const days = Math.max(0, Math.floor((now - datePosted) / 86_400_000));
  if (days === 0) return "today";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function ThumbIcon({ down = false }: { down?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={down ? "rotate-180" : ""}
    >
      <path
        d="M5 7.5v6M5 13.5H3.5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1H5l2.6-4.47a1.4 1.4 0 0 1 2.6.71V5.5h2.33a1.5 1.5 0 0 1 1.47 1.8l-1 4.8a1.5 1.5 0 0 1-1.47 1.4H5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function MatchRow({
  row,
  feedback,
  now,
  expanded,
  suggestionPrompt,
  onToggleDetails,
  onFeedback,
  children,
}: {
  row: MatchRowData;
  /** Merged (server + optimistic) feedback kinds for this listing. */
  feedback: string[];
  now: number;
  expanded: boolean;
  suggestionPrompt: boolean;
  onToggleDetails: () => void;
  onFeedback: (kind: FeedbackKind) => void;
  children?: ReactNode;
}) {
  const applied = feedback.includes("applied");
  const up = feedback.includes("thumbs_up");
  const down = feedback.includes("thumbs_down");
  const workMode = WORK_MODE_LABELS[row.remoteType];

  return (
    <li className="py-4">
      <div className="flex items-baseline justify-between gap-3">
        <a
          href={row.url}
          target="_blank"
          rel="noreferrer"
          className="truncate font-medium hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {row.title}
        </a>
        <span
          className="shrink-0 font-mono text-sm tabular-nums text-muted"
          title="Match score"
        >
          {(row.score * 100).toFixed(0)}
        </span>
      </div>
      <p className="mt-0.5 truncate text-xs text-muted">
        {row.company}
        {row.locations.length > 0 && <> · {row.locations.join(" · ")}</>}
        {workMode && <> · {workMode}</>}
        <> · {formatAge(row.datePosted, now)}</>
      </p>

      {(row.topFactors.length > 0 ||
        row.jdStatus !== "fetched" ||
        row.exploration) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {row.topFactors.slice(0, 3).map((f) => (
            <Chip key={f} tone="pos">
              {f}
            </Chip>
          ))}
          {row.jdStatus === "pending" && (
            <Chip tone="neutral">Fetching job description…</Chip>
          )}
          {(row.jdStatus === "failed" || row.jdStatus === "unsupported") && (
            <Chip tone="warn">Couldn&apos;t read job description</Chip>
          )}
          {row.exploration && <Chip tone="accent">Wildcard</Chip>}
        </div>
      )}

      <div className="mt-2.5 flex h-8 items-center gap-1.5">
        {suggestionPrompt ? (
          <>
            <span className="text-sm text-muted">Was this a good suggestion?</span>
            <Button onClick={() => onFeedback("good_suggestion")}>Yes</Button>
            <Button onClick={() => onFeedback("bad_suggestion")}>No</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onToggleDetails} aria-expanded={expanded}>
              {expanded ? "Hide details" : "Details"}
            </Button>
            <Button
              onClick={() => onFeedback("applied")}
              disabled={applied}
              className={`w-24 ${applied ? "border-transparent bg-accent/12 text-accent disabled:opacity-100" : ""}`}
            >
              {applied ? "Applied ✓" : "Applied"}
            </Button>
            <Button
              onClick={() => onFeedback("thumbs_up")}
              aria-label="Thumbs up"
              aria-pressed={up}
              className={`w-9 px-0 ${up ? "border-transparent bg-pos-tint text-pos" : "text-muted"}`}
            >
              <ThumbIcon />
            </Button>
            <Button
              onClick={() => onFeedback("thumbs_down")}
              aria-label="Thumbs down"
              aria-pressed={down}
              className={`w-9 px-0 ${down ? "border-transparent bg-neg-tint text-neg" : "text-muted"}`}
            >
              <ThumbIcon down />
            </Button>
          </>
        )}
      </div>

      {expanded && children}
    </li>
  );
}
