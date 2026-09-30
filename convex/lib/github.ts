/**
 * The one GitHub client module: SHA checks and raw-file downloads for ingest.
 */

const LISTINGS_PATH = ".github/scripts/listings.json";
const API_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 120_000; // the listings file is ~13 MB

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  headers: Record<string, string> = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "intern-radar (personal project)", ...headers },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`GET ${url} failed with status ${res.status}`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function apiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** SHA of the latest commit touching the listings file on the default branch. */
export async function getLatestListingsSha(repo: string): Promise<string> {
  const url = `https://api.github.com/repos/${repo}/commits?path=${encodeURIComponent(
    LISTINGS_PATH,
  )}&per_page=1`;
  const res = await fetchWithTimeout(url, API_TIMEOUT_MS, apiHeaders());
  const commits = (await res.json()) as Array<{ sha: string }>;
  if (!Array.isArray(commits) || commits.length === 0 || !commits[0].sha) {
    throw new Error(`No commits found for ${LISTINGS_PATH} in ${repo}`);
  }
  return commits[0].sha;
}

/** Downloads the listings JSON pinned to a commit SHA (immutable). */
export async function fetchListingsJson(
  repo: string,
  sha: string,
): Promise<unknown> {
  const url = `https://raw.githubusercontent.com/${repo}/${sha}/${LISTINGS_PATH}`;
  const res = await fetchWithTimeout(url, DOWNLOAD_TIMEOUT_MS);
  return await res.json();
}
