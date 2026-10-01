"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function Chip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "green" | "red" | "gray";
}) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
    gray: "bg-neutral-100 text-neutral-600",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${tones[tone]}`}>
      {children}
    </span>
  );
}

function signed(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;
}

export default function MatchDetail({ listingId }: { listingId: Id<"listings"> }) {
  const detail = useQuery(api.matchesApi.detail, { listingId });

  if (detail === undefined) {
    return <p className="mt-3 text-sm text-neutral-400">Loading details…</p>;
  }
  if (detail === null) {
    return <p className="mt-3 text-sm text-neutral-400">No details available.</p>;
  }

  const facts = detail.facts as {
    degrees: string[];
    minGpa: number | null;
    gradYears: number[];
    pay: string | null;
    duration: string | null;
  } | null;
  const factBits = facts
    ? [
        facts.degrees.length > 0 ? `degree: ${facts.degrees.join("/")}` : null,
        facts.minGpa !== null ? `min GPA ${facts.minGpa}` : null,
        facts.gradYears.length > 0
          ? `grad window ${facts.gradYears.join("–")}`
          : null,
        facts.pay,
        facts.duration,
      ].filter(Boolean)
    : [];

  return (
    <div className="mt-3 flex flex-col gap-3 rounded border border-neutral-200 bg-neutral-50 p-3 text-sm">
      {detail.whyScore && <p className="font-medium">{detail.whyScore}</p>}

      {detail.breakdown && (
        <div className="flex flex-col gap-1.5">
          {detail.breakdown.keywords.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {detail.breakdown.keywords.map((k) => (
                <Chip
                  key={k.name}
                  tone={k.contribution >= 0 ? "green" : "red"}
                >
                  {k.name} {signed(k.contribution)}
                </Chip>
              ))}
              {detail.breakdown.keywordOther !== 0 && (
                <Chip tone="gray">
                  other keywords {signed(detail.breakdown.keywordOther)}
                </Chip>
              )}
            </div>
          )}
          <ul className="max-w-xs text-xs text-neutral-500">
            {detail.breakdown.structural
              .filter((s) => s.contribution !== 0)
              .sort((a, b) => b.contribution - a.contribution)
              .map((s) => (
                <li key={s.label} className="flex justify-between gap-4">
                  <span>{s.label}</span>
                  <span>{signed(s.contribution)}</span>
                </li>
              ))}
            <li className="flex justify-between gap-4">
              <span>Baseline</span>
              <span>{signed(detail.breakdown.bias)}</span>
            </li>
          </ul>
        </div>
      )}

      {!detail.hasJd ? (
        <p className="text-neutral-500">
          No job description was available for this listing, so nothing could
          be extracted — judge it from the posting itself.
        </p>
      ) : (
        <>
          {(detail.matchedSkills.length > 0 ||
            detail.missingRequired.length > 0 ||
            detail.preferredSkills.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {detail.matchedSkills.map((s) => (
                <Chip key={`m-${s}`} tone="green">
                  ✓ {s}
                </Chip>
              ))}
              {detail.missingRequired.map((s) => (
                <Chip key={`r-${s}`} tone="red">
                  required: {s}
                </Chip>
              ))}
              {detail.preferredSkills
                .filter((p) => !p.have)
                .map((p) => (
                  <Chip key={`p-${p.name}`} tone="gray">
                    preferred: {p.name}
                  </Chip>
                ))}
            </div>
          )}

          {detail.interestHits.length > 0 && (
            <p>
              Interests:{" "}
              {detail.interestHits.map((i) => (
                <Chip key={i.keyword} tone={i.tag === "want" ? "green" : "red"}>
                  {i.tag === "want" ? "mentions" : "avoid hit"}: {i.keyword}
                </Chip>
              ))}
            </p>
          )}

          {detail.requirements.length > 0 && (
            <div>
              <p className="font-medium">Requirements</p>
              <ul className="list-disc pl-5 text-neutral-600">
                {detail.requirements.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          {detail.preferred.length > 0 && (
            <div>
              <p className="font-medium">Preferred</p>
              <ul className="list-disc pl-5 text-neutral-600">
                {detail.preferred.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          {detail.responsibilities.length > 0 && (
            <div>
              <p className="font-medium">Top responsibilities</p>
              <ul className="list-disc pl-5 text-neutral-600">
                {detail.responsibilities.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          {factBits.length > 0 && (
            <p className="text-neutral-600">{factBits.join(" · ")}</p>
          )}
        </>
      )}

      <p className="flex items-center justify-between text-xs text-neutral-400">
        <span>Extracted automatically — check the posting for the full picture.</span>
        <a
          href={detail.url}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-neutral-600 underline"
        >
          Open posting ↗
        </a>
      </p>
    </div>
  );
}
