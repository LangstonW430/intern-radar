"use client";

import { useMutation, useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Header from "@/components/Header";
import MatchDetail from "@/components/MatchDetail";
import MatchFilterBar from "@/components/MatchFilterBar";
import MatchRow, { type FeedbackKind } from "@/components/MatchRow";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  applyMatchFilters,
  DEFAULT_MATCH_FILTERS,
  type MatchFilterState,
} from "@/lib/matchFilters";

const PAGE_SIZE = 50;
// Age labels are relative to page load; they don't need to tick live.
const NOW = Date.now();

export default function MatchesPage() {
  return (
    <Suspense>
      <MatchesContent />
    </Suspense>
  );
}

function MatchesContent() {
  const matches = useQuery(api.matchesApi.list, {});
  const profile = useQuery(api.profile.getMine);
  const record = useMutation(api.feedbackFns.record);
  const searchParams = useSearchParams();
  // Email "I applied" links land here with ?prompt=<listingId> so the
  // good-suggestion question still gets asked.
  const [suggestionPromptFor, setSuggestionPromptFor] =
    useState<Id<"listings"> | null>(
      (searchParams.get("prompt") as Id<"listings"> | null) ?? null,
    );
  const [expandedId, setExpandedId] = useState<Id<"listings"> | null>(null);
  const [filters, setFilters] = useState<MatchFilterState>(
    DEFAULT_MATCH_FILTERS,
  );
  // Optimistic overlay: feedback applied locally the instant it's clicked.
  const [localFeedback, setLocalFeedback] = useState<Record<string, string[]>>(
    {},
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const rows = useMemo(() => {
    if (!matches) return [];
    const merged = matches.map((m) => ({
      ...m,
      myFeedback: [
        ...new Set([...m.myFeedback, ...(localFeedback[m.listingId] ?? [])]),
      ],
    }));
    return applyMatchFilters(merged, filters);
  }, [matches, localFeedback, filters]);

  const visible = rows.slice(0, visibleCount);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisibleCount((count) => count + PAGE_SIZE);
      }
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [rows.length]);

  function give(listingId: Id<"listings">, kind: FeedbackKind) {
    setLocalFeedback((prev) => ({
      ...prev,
      [listingId]: [...new Set([...(prev[listingId] ?? []), kind])],
    }));
    if (kind === "applied") setSuggestionPromptFor(listingId);
    if (kind === "good_suggestion" || kind === "bad_suggestion") {
      setSuggestionPromptFor(null);
    }
    record({ listingId, kind }).catch(() => {
      // Roll the optimistic mark back if the write failed.
      setLocalFeedback((prev) => ({
        ...prev,
        [listingId]: (prev[listingId] ?? []).filter((k) => k !== kind),
      }));
    });
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Matches</h1>
          {matches !== undefined && matches.length > 0 && (
            <p className="text-xs text-muted">
              {rows.length} of your top {matches.length}
            </p>
          )}
        </div>

        {profile === null && (
          <div className="mb-5 rounded-lg border border-hairline bg-surface p-4 text-sm">
            Finish setting up your profile to get matches:{" "}
            <a href="/onboarding" className="font-medium text-accent hover:underline">
              complete onboarding
            </a>
            .
          </div>
        )}

        {matches === undefined ? (
          <div className="flex flex-col gap-6 pt-2" aria-busy>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-6 w-5/6" />
              </div>
            ))}
          </div>
        ) : matches.length === 0 ? (
          <EmptyState
            title="No matches yet"
            hint="The radar checks for new listings hourly — matches appear here once listings are ingested and scored against your profile."
          />
        ) : (
          <>
            <MatchFilterBar filters={filters} onChange={setFilters} />
            {rows.length === 0 ? (
              <EmptyState
                title="Nothing matches these filters"
                hint="Loosen the score threshold or clear the search to see more."
              />
            ) : (
              <ul className="mt-2 flex flex-col divide-y divide-hairline">
                {visible.map((m) => (
                  <MatchRow
                    key={m.matchId}
                    row={m}
                    feedback={m.myFeedback}
                    now={NOW}
                    expanded={expandedId === m.listingId}
                    suggestionPrompt={suggestionPromptFor === m.listingId}
                    onToggleDetails={() =>
                      setExpandedId(
                        expandedId === m.listingId
                          ? null
                          : (m.listingId as Id<"listings">),
                      )
                    }
                    onFeedback={(kind) =>
                      give(m.listingId as Id<"listings">, kind)
                    }
                  >
                    <MatchDetail listingId={m.listingId as Id<"listings">} />
                  </MatchRow>
                ))}
              </ul>
            )}
            <div ref={sentinelRef} />
            {rows.length > 0 && (
              <p className="pb-6 pt-4 text-center text-xs text-muted">
                {visible.length < rows.length
                  ? "Loading more…"
                  : `Showing ${rows.length} from your top ${matches.length} matches by score.`}
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
