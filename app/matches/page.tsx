"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import Header from "@/components/Header";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type FeedbackKind =
  | "applied"
  | "thumbs_up"
  | "thumbs_down"
  | "good_suggestion"
  | "bad_suggestion";

export default function MatchesPage() {
  const matches = useQuery(api.matchesApi.list, {});
  const record = useMutation(api.feedbackFns.record);
  const [suggestionPromptFor, setSuggestionPromptFor] =
    useState<Id<"listings"> | null>(null);

  async function give(listingId: Id<"listings">, kind: FeedbackKind) {
    await record({ listingId, kind });
    if (kind === "applied") {
      setSuggestionPromptFor(listingId);
    }
    if (kind === "good_suggestion" || kind === "bad_suggestion") {
      setSuggestionPromptFor(null);
    }
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="mb-4 text-xl font-semibold">Your matches</h1>
        {matches === undefined && (
          <p className="text-neutral-500">Loading…</p>
        )}
        {matches !== undefined && matches.length === 0 && (
          <p className="text-neutral-500">
            No matches yet — they appear once listings are ingested and scored.
          </p>
        )}
        <ul className="flex flex-col gap-4">
          {matches?.map((m) => {
            const applied = m.myFeedback.includes("applied");
            const up = m.myFeedback.includes("thumbs_up");
            const down = m.myFeedback.includes("thumbs_down");
            return (
              <li
                key={m.matchId}
                className="rounded-lg border border-neutral-200 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium hover:underline"
                    >
                      {m.title}
                    </a>
                    <p className="text-sm text-neutral-600">
                      {m.company} · {m.locations.join(" · ")}
                    </p>
                  </div>
                  <span className="rounded bg-neutral-100 px-2 py-1 text-sm tabular-nums">
                    {(m.score * 100).toFixed(0)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {m.topFactors.map((f) => (
                    <span
                      key={f}
                      className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700"
                    >
                      {f}
                    </span>
                  ))}
                  {!m.hasJd && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                      Couldn&apos;t read job description
                    </span>
                  )}
                  {m.exploration && (
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">
                      Wildcard
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <button
                    onClick={() => void give(m.listingId, "applied")}
                    disabled={applied}
                    className="rounded border border-neutral-300 px-2 py-1 disabled:bg-neutral-900 disabled:text-white"
                  >
                    {applied ? "Applied ✓" : "Applied"}
                  </button>
                  <button
                    onClick={() => void give(m.listingId, "thumbs_up")}
                    className={`rounded border px-2 py-1 ${up ? "border-emerald-600 bg-emerald-50" : "border-neutral-300"}`}
                    aria-label="Thumbs up"
                  >
                    👍
                  </button>
                  <button
                    onClick={() => void give(m.listingId, "thumbs_down")}
                    className={`rounded border px-2 py-1 ${down ? "border-red-600 bg-red-50" : "border-neutral-300"}`}
                    aria-label="Thumbs down"
                  >
                    👎
                  </button>
                  {suggestionPromptFor === m.listingId && (
                    <span className="ml-2 flex items-center gap-2">
                      Was this a good suggestion?
                      <button
                        onClick={() => void give(m.listingId, "good_suggestion")}
                        className="rounded border border-neutral-300 px-2 py-1"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => void give(m.listingId, "bad_suggestion")}
                        className="rounded border border-neutral-300 px-2 py-1"
                      >
                        No
                      </button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
