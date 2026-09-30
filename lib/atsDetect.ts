/**
 * Classifies a listing URL into an ATS type plus the identifiers the JD
 * fetcher needs. The Python job re-parses details it needs; this is the
 * single TS source of truth for the type taxonomy (kept in sync via the
 * shared fixtures in lib/__fixtures__).
 */

export type AtsType =
  | "greenhouse"
  | "greenhouse_embedded"
  | "lever"
  | "ashby"
  | "workday"
  | "icims"
  | "oracle"
  | "other";

export interface AtsRef {
  /** Greenhouse: board token. Lever: company slug. Ashby: org slug. Workday: tenant. */
  account?: string;
  /** The per-job identifier where the URL exposes one. */
  jobId?: string;
}

export interface AtsDetection {
  atsType: AtsType;
  atsRef: AtsRef;
}

export function detectAts(rawUrl: string): AtsDetection {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { atsType: "other", atsRef: {} };
  }
  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  // Direct Greenhouse board: {job-boards|boards}.greenhouse.io/{token}/jobs/{id}
  if (host === "job-boards.greenhouse.io" || host === "boards.greenhouse.io") {
    const m = path.match(/^\/([^/]+)\/jobs\/(\d+)/);
    if (m) return { atsType: "greenhouse", atsRef: { account: m[1], jobId: m[2] } };
    return { atsType: "greenhouse", atsRef: {} };
  }
  // Embedded Greenhouse: company page with ?gh_jid=, or a grnh.se short link.
  // Both need one page fetch/redirect to resolve the board token.
  const ghJid = url.searchParams.get("gh_jid");
  if (ghJid) {
    return { atsType: "greenhouse_embedded", atsRef: { jobId: ghJid } };
  }
  if (host === "grnh.se") {
    return { atsType: "greenhouse_embedded", atsRef: {} };
  }

  if (host === "jobs.lever.co") {
    const m = path.match(/^\/([^/]+)\/([0-9a-f-]{36})/i);
    if (m) return { atsType: "lever", atsRef: { account: m[1], jobId: m[2] } };
    return { atsType: "lever", atsRef: {} };
  }

  if (host === "jobs.ashbyhq.com") {
    const m = path.match(/^\/([^/]+)\/([0-9a-f-]{36})/i);
    if (m) return { atsType: "ashby", atsRef: { account: m[1], jobId: m[2] } };
    return { atsType: "ashby", atsRef: {} };
  }

  const workday = host.match(/^([^.]+)\.wd\d+\.myworkdayjobs\.com$/);
  if (workday) {
    return { atsType: "workday", atsRef: { account: workday[1] } };
  }

  if (host.endsWith(".icims.com")) {
    const m = path.match(/\/jobs\/(\d+)\//);
    return {
      atsType: "icims",
      atsRef: m ? { jobId: m[1] } : {},
    };
  }

  if (host.endsWith(".oraclecloud.com")) {
    // Requisition id is the trailing number of the CandidateExperience path
    // or a `job/{id}` segment.
    const m = path.match(/\/job\/(\d+)/) ?? rawUrl.match(/requisitionId=(\d+)/);
    return { atsType: "oracle", atsRef: m ? { jobId: m[1] } : {} };
  }

  return { atsType: "other", atsRef: {} };
}
