/**
 * Client-side filtering/sorting/search over the match rows the server
 * returns (the top-scored window). Pure and tested; the page is a thin
 * consumer.
 */

export interface MatchRowData {
  matchId: string;
  listingId: string;
  company: string;
  title: string;
  url: string;
  locations: string[];
  score: number;
  jdStatus: "pending" | "fetched" | "failed" | "unsupported";
  category: string;
  remoteType: string;
  datePosted: number;
  exploration: boolean;
  topFactors: string[];
  myFeedback: string[];
}

export interface MatchFilterState {
  minScore: number; // 0..1
  category: string; // role category or "all"
  workMode: string; // remoteType or "all"
  jdOnly: boolean;
  hideActioned: boolean;
  search: string;
  sort: "score" | "newest";
}

export const DEFAULT_MATCH_FILTERS: MatchFilterState = {
  minScore: 0,
  category: "all",
  workMode: "all",
  jdOnly: false,
  hideActioned: false,
  search: "",
  sort: "score",
};

export function isActioned(row: Pick<MatchRowData, "myFeedback">): boolean {
  return row.myFeedback.length > 0;
}

export function applyMatchFilters<T extends MatchRowData>(
  rows: T[],
  filters: MatchFilterState,
): T[] {
  const needle = filters.search.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (row.score < filters.minScore) return false;
    if (filters.category !== "all" && row.category !== filters.category) {
      return false;
    }
    if (filters.workMode !== "all" && row.remoteType !== filters.workMode) {
      return false;
    }
    if (filters.jdOnly && row.jdStatus !== "fetched") return false;
    if (filters.hideActioned && isActioned(row)) return false;
    if (
      needle &&
      !row.company.toLowerCase().includes(needle) &&
      !row.title.toLowerCase().includes(needle)
    ) {
      return false;
    }
    return true;
  });
  return filtered.sort((a, b) =>
    filters.sort === "newest"
      ? b.datePosted - a.datePosted || b.score - a.score
      : b.score - a.score || b.datePosted - a.datePosted,
  );
}
