"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import MatchDetailView, {
  type MatchDetailData,
} from "@/components/MatchDetailView";
import MatchFilterBar from "@/components/MatchFilterBar";
import MatchRow from "@/components/MatchRow";
import ThemeToggle from "@/components/ThemeToggle";
import EmptyState from "@/components/ui/EmptyState";
import {
  DEFAULT_MATCH_FILTERS,
  type MatchFilterState,
  type MatchRowData,
} from "@/lib/matchFilters";

const NOW = 1_760_000_000_000;

const ROWS: MatchRowData[] = [
  {
    matchId: "m1",
    listingId: "l1",
    company: "Ramp",
    title: "Software Engineer Internship – Backend",
    url: "#",
    locations: ["New York, NY"],
    score: 0.87,
    jdStatus: "fetched",
    category: "swe",
    remoteType: "hybrid",
    datePosted: NOW - 2 * 86_400_000,
    exploration: false,
    topFactors: ["Mentions LLMs", "You have the required skills", "Recently posted"],
    myFeedback: [],
  },
  {
    matchId: "m2",
    listingId: "l2",
    company: "Figma",
    title: "Machine Learning Intern, Applied Research",
    url: "#",
    locations: ["San Francisco, CA", "New York, NY"],
    score: 0.81,
    jdStatus: "fetched",
    category: "ai_ml_data",
    remoteType: "onsite",
    datePosted: NOW - 5 * 86_400_000,
    exploration: false,
    topFactors: ["Mentions Machine Learning", "Role category fits"],
    myFeedback: ["thumbs_up"],
  },
  {
    matchId: "m3",
    listingId: "l3",
    company: "Tandem Health",
    title: "Data Science Intern",
    url: "#",
    locations: ["Remote in USA"],
    score: 0.64,
    jdStatus: "pending",
    category: "ai_ml_data",
    remoteType: "remote",
    datePosted: NOW - 86_400_000,
    exploration: true,
    topFactors: [],
    myFeedback: [],
  },
  {
    matchId: "m4",
    listingId: "l4",
    company: "Carrier",
    title: "Firmware Engineering Intern",
    url: "#",
    locations: ["Syracuse, NY"],
    score: 0.41,
    jdStatus: "unsupported",
    category: "hardware",
    remoteType: "onsite",
    datePosted: NOW - 12 * 86_400_000,
    exploration: false,
    topFactors: ["Near your preferred location"],
    myFeedback: ["applied", "good_suggestion"],
  },
];

const DETAIL: MatchDetailData = {
  url: "#",
  hasJd: true,
  jdStatus: "fetched",
  agePenalty: null,
  matchedSkills: ["Python", "TypeScript", "PostgreSQL"],
  missingRequired: ["Go"],
  preferredSkills: [
    { name: "Kubernetes", have: false },
    { name: "React", have: true },
  ],
  interestHits: [
    { keyword: "machine learning", tag: "want", hit: true },
    { keyword: "blockchain", tag: "avoid", hit: true },
  ],
  requirements: [
    "Currently pursuing a BS/MS in Computer Science or a related field",
    "Experience with Python and a typed language",
    "Comfort working across the stack",
  ],
  preferred: ["Experience with LLM-powered products"],
  responsibilities: [
    "Ship features end to end with your mentor",
    "Design and run experiments on ranking quality",
  ],
  facts: {
    degrees: ["bachelors", "masters"],
    minGpa: 3.0,
    gradYears: [2028, 2029],
    pay: "$45.00 per hour",
    duration: "12-week",
  },
  whyScore: "Scored 87 mainly on: mentions llms; you have the required skills",
  breakdown: {
    bias: -1,
    keywordOther: 0.38,
    keywords: [
      { name: "LLMs", weight: 1.2, idf: 2.1, position: 1.5, contribution: 3.78 },
      { name: "Python", weight: 0.8, idf: 1.7, position: 1.2, contribution: 1.63 },
      { name: "Kafka", weight: 0.4, idf: 2.4, position: 1.0, contribution: 0.96 },
      { name: "Blockchain", weight: -1.5, idf: 2.6, position: 1.0, contribution: -3.9 },
    ],
    structural: [
      { label: "You have the required skills", value: 0.75, weight: 1, contribution: 0.75 },
      { label: "Near your preferred location", value: 0.9, weight: 0.4, contribution: 0.36 },
      { label: "Recently posted", value: 0.85, weight: 0.5, contribution: 0.43 },
      { label: "Work mode fits", value: 1, weight: 0.4, contribution: 0.4 },
    ],
  },
};

function PreviewContent() {
  const params = useSearchParams();
  const theme = params.get("theme");
  const [filters, setFilters] = useState<MatchFilterState>(
    DEFAULT_MATCH_FILTERS,
  );

  useEffect(() => {
    if (theme === "dark" || theme === "light") {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-hairline bg-canvas">
        <div className="mx-auto flex h-12 max-w-4xl items-center justify-between gap-3 px-4 sm:px-6">
          <nav className="flex items-center gap-4 sm:gap-5">
            <span className="text-sm font-semibold tracking-tight">
              intern-radar
            </span>
            <span className="text-sm font-medium">Matches</span>
            <span className="text-sm text-muted">Settings</span>
          </nav>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <span className="px-2 py-1 text-sm text-muted">Sign out</span>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Matches</h1>
          <p className="text-xs text-muted">4 of your top 300</p>
        </div>
        <MatchFilterBar filters={filters} onChange={setFilters} />
        <ul className="mt-2 flex flex-col divide-y divide-hairline">
          {ROWS.map((row, i) => (
            <MatchRow
              key={row.matchId}
              row={row}
              feedback={row.myFeedback}
              now={NOW}
              expanded={i === 0}
              suggestionPrompt={false}
              onToggleDetails={() => {}}
              onFeedback={() => {}}
            >
              <MatchDetailView detail={DETAIL} />
            </MatchRow>
          ))}
        </ul>
        <div className="border-t border-hairline">
          <EmptyState
            title="Nothing matches these filters"
            hint="Loosen the score threshold or clear the search to see more."
          />
        </div>
      </main>
    </div>
  );
}

export default function PreviewClient() {
  return (
    <Suspense>
      <PreviewContent />
    </Suspense>
  );
}
