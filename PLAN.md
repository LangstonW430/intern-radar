# intern-radar — Phase 1 Plan

Status: **approved 2026-09-30** with owner changes folded in (JD fetching moved to the Actions job with expanded source coverage; no-JD penalty; strict incremental exports). Building.

> **Pivot (owner, 2026-10-01): per-user keyword-weight model.** The trained
> logistic regression (global model + per-user L2-toward-global, nightly
> Python training, `models`/`userWeights` tables, Rocchio preference vector)
> is replaced by a per-user keyword → weight map learned **online inside
> Convex**. A listing's score is `sigmoid(bias + Σ weight·idf·position`
> `+ Σ strengthWeight·structural)` × NO_JD_PENALTY; every score stores a
> breakdown that sums to the logit. Feedback applies one capped, decayed,
> clamped logistic step per event the moment it lands; `keywordLearn:replay`
> deterministically rebuilds a user's map from history. Vocabulary in
> `shared/vocabulary.json` (mined with `scripts/vocab-candidates.ts`),
> constants in `shared/scoring.json` (replaces `shared/features.json`),
> per-keyword document frequencies in the `keywordStats` table. Labels are
> now **eval-only** (`scripts/eval.ts` prints precision@10 + AUC, replayed
> vs initial-only weights). Embeddings remain only for the optional
> `embed_sim_resume` feature, off by default; the Actions job still fetches
> JDs and embeds but no longer trains. Anything below that describes
> training, model promotion, prior weights, `embed_sim_pref`, or the
> `models`/`userWeights` tables is **superseded**; CLAUDE.md has the
> current architecture.

> **Scope change (owner, 2026-09-30): open sign-up from day one.** No allowlist —
> anyone can create an account; `ADMIN_EMAILS` gates `/admin` surfaces only.
> Added to Phase 1: onboarding (resume upload → unpdf extraction → PDF deleted →
> preference questions → digest settings; `profile.seed.json` becomes dev-only),
> account + data deletion, Cloudflare Turnstile plus per-email/per-IP/global
> rate limits on sign-in emails (Resend's 100/day cap is shared with digests),
> unsubscribe links (signed token, no sign-in needed) + email-settings link in
> every digest, and a `/privacy` page. Bootstrap labels stay the owner's only —
> they train the global model; other users personalize via their own feedback.
> Build-order steps 14–16 below.

---

## Part A — Step 0 findings (verified 2026-09-30)

### A1. Source repo and structured JSON

- Repo: `SimplifyJobs/Summer2027-Internships`, default branch **`dev`** (not `main`).
- Structured JSON: **`.github/scripts/listings.json`** (~12.8 MB), raw URL:
  `https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json`
- It contains **17,021 records spanning every season** (Summer 2026, Fall 2026, Summer 2027, …, plus `"N/A"`). We filter to `terms` containing `"Summer 2027"`: **3,260 records, 2,105 active+visible** today. `"N/A"`-term records are excluded (decision D5).
- Fields per listing (exactly these 15 keys on every record):

  | Field | Type / values |
  |---|---|
  | `id` | UUID string — **stable unique ID** (17,021/17,021 unique) |
  | `company_name`, `title`, `url`, `company_url` | strings |
  | `source` | `"Simplify"` (98.8%) or a contributor's GitHub handle |
  | `category` | `AI/ML/Data`, `Software`, `Hardware`, `Product`, `Quant` + rare legacy aliases (`Software Engineering`, `Data Science, AI & Machine Learning`, etc.) |
  | `active` | boolean |
  | `is_visible` | boolean (among Summer 2027 actives, all are visible) |
  | `terms` | string array, e.g. `["Summer 2027"]` — listings can span multiple terms |
  | `date_posted`, `date_updated` | Unix **seconds** |
  | `locations` | string array, freeform: `"NYC"`, `"SF"`, `"Chicago, IL"`, `"Remote in USA"`, `"London, UK"`, `"Toronto, ON, Canada"` (1,587 distinct values incl. typos like `"Remote in USa"`) |
  | `sponsorship` | `"Other"` (**99.4%**), `"Does Not Offer Sponsorship"`, `"U.S. Citizenship is Required"`, `"Offers Sponsorship"` |
  | `degrees` | array: `Bachelor's`, `Master's`, `PhD`, `MBA`, `Associate's`, … (sometimes empty) |

- **There is no class-year field.** Only `degrees` and `terms`. See decision D1.

### A2. ATS distribution (Summer 2027, active+visible, n=2,105)

| ATS | Count | Share | JD fetch path (Phase 1) |
|---|---|---|---|
| Workday | 810 | 38.5% | internal CXS JSON endpoint (probe first) |
| Greenhouse | 332 | 15.8% | boards API — 216 direct + 116 embedded `?gh_jid=` (token resolved from page HTML) |
| other/unknown | 308 | 14.6% | unsupported |
| iCIMS | 249 | 11.8% | plain HTTP, Playwright fallback (probe first) |
| Oracle Cloud | 202 | 9.6% | candidate-experience JSON endpoint (probe first) |
| Ashby | 78 | 3.7% | posting API |
| SmartRecruiters | 37 | 1.8% | unsupported (Phase 1) |
| SuccessFactors | 35 | 1.7% | unsupported (Phase 1) |
| Lever | 25 | 1.2% | postings API |
| Rippling / Workable / Jobvite | 29 | 1.4% | unsupported (Phase 1) |

→ Verified endpoints (GH/Lever/Ashby) cover 20.7% incl. embedded Greenhouse; adding Workday + Oracle + iCIMS lifts potential coverage to **~82%**, subject to per-source probes (B8): test ~20 real listings per source before building; **if a source succeeds on <50%, stop and report instead of building it.**

Public endpoints, verified against live Summer 2027 listings:

- **Greenhouse** `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs/{job_id}` → `content` (HTML-**escaped** — must entity-decode then strip tags), `title`, `location.name`, `education`, `departments`, `offices`, `updated_at`. Board token + job id parse straight out of `job-boards.greenhouse.io/{token}/jobs/{id}` URLs. Embedded boards (`?gh_jid={id}` on company pages): fetch the page once, extract the board token from the static Greenhouse embed script, then use the same API.
- **Lever** `GET https://api.lever.co/v0/postings/{company}/{posting_id}` → `descriptionPlain`, `lists[]` (`{text, content}` HTML), `additionalPlain`, `text` (title), `categories{commitment, location, allLocations, team}`, `workplaceType`, `country`. Parses from `jobs.lever.co/{company}/{uuid}`.
- **Ashby** `GET https://api.ashbyhq.com/posting-api/job-board/{org}` → **all** of that org's jobs in one call: `id`, `title`, `descriptionHtml`, `descriptionPlain`, `location`, `secondaryLocations`, `isRemote`, `isListed`, `workplaceType`, `employmentType`. Org + job id parse from `jobs.ashbyhq.com/{org}/{uuid}`; batch per-org, then match by id.
- **Workday** (to probe): career pages call `GET https://{tenant}.wd{n}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/job/{externalPath}` returning `jobPostingInfo.jobDescription` (HTML). Tenant/site/path parse from the listing URL. No headless browser.
- **Oracle ORC** (to probe): candidate-experience REST under `https://{host}/hcmRestApi/scaas/recruiting/publicCandidateExperience/...` returning requisition details incl. description. Requisition id/site parse from the listing URL.
- **iCIMS** (to probe): `https://careers-*.icims.com/jobs/{id}/...` pages often render the JD server-side; plain HTTP first, Playwright fallback only where needed.

### A3. Free-tier check vs CLAUDE.md

| Service | Limits (2026) | Verdict |
|---|---|---|
| Convex free (Starter) | 1M function calls/mo, 0.5 GB DB storage, **1 GB database I/O (bandwidth)/mo**, 1 GB egress/mo, 1 GB file storage, 20 GB-hr action compute, crons + vector search included | **OK** — see bandwidth budget in A5. |
| Vercel Hobby | 1M function invocations/mo, 100 GB transfer, 60 s function timeout, cron ≤ 1/day, non-commercial personal use only | **OK** — all crons live in Convex. |
| Resend free | 3,000/mo **and 100/day**, up to 3 domains, requires verified domain | **OK** for single user. |
| GitHub Actions | Free **unlimited** minutes on public repos; 10 GB cache/repo; scheduled workflows auto-disabled after 60 days without repo activity | **OK.** bge-small (~130 MB) + uv + Playwright browser (~300 MB) fit in 10 GB cache. Keepalive step required. |

### A4. Decisions (owner-approved 2026-09-30)

- **D1 — class year.** No structured field. The default-`hard` class-year filter only drops a listing when its **title or JD text** explicitly names a conflicting class year ("juniors only", "Class of 2028", "penultimate year"); unstated passes. `class_year_signal` feature (when not hard): 1 explicit fit / 0.5 unstated / 0 explicit mismatch. Degree-level filtering uses the structured `degrees` array (empty = pass).
- **D2 — role categories.** Profile enum mirrors the source: `ai_ml_data | swe | hardware | product | quant`; legacy source aliases normalized in.
- **D3 — sponsorship.** A `hard` sponsorship preference only drops **explicit** conflicts — from the structured field (`Does Not Offer Sponsorship` / `U.S. Citizenship is Required` when sponsorship is needed) **or from JD text** ("does not offer sponsorship", "US citizenship required", etc.). Unknown passes. Feature: 1 explicit match / 0.5 unknown / 0 explicit conflict.
- **D4 — embedded Greenhouse.** In scope for Phase 1 (page fetch → board token → boards API).
- **D5 — term filter.** `terms ∋ "Summer 2027"` exactly; `["N/A"]` excluded.
- **D6 — JD fetching lives in the GitHub Actions job**, not Convex (owner Change 1). Sources and rules in B8. The old "never scrape Workday" rule is removed.
- **D7 — no-JD handling** (owner Change 2): JD-dependent features go neutral without a JD; final score is multiplied by `NO_JD_PENALTY` (config, default **0.6**) **after** the model — never a learned weight; UI + digest show "Couldn't read job description".
- **D8 — bandwidth** (owner Change 3): exports strictly incremental, imports batched ≤ 100 records/call; budget below.

### A5. Convex database-bandwidth budget (cap: 1 GB/month)

Design choices that keep reads cheap: the hourly ingest checks the repo head SHA via the GitHub API (no DB reads beyond the ~1 KB `ingestState` doc) and only diffs when the JSON actually changed; diffs read a **compact ingest index** (sourceId → content hash, ~200 KB across a few docs) instead of the full listing set; ML exports are incremental (only listings missing JD/embedding + feedback/labels since last run).

| Component | Backfill month | Steady state |
|---|---|---|
| Ingest: SHA checks (720/mo × ~2 KB state r/w) | 1.5 MB | 1.5 MB |
| Ingest: diffs (~240 changed downloads/mo × ~200 KB index read) | 48 MB | 48 MB |
| Ingest: listing writes (3.3k initial / ~45 new+updated per day) | 10 MB | 4 MB |
| JD writeback (~1.7k × 5 KB backfill / ~15/day steady) | 17 MB | 5 MB |
| Embedding writeback (3.3k × ~3 KB, some twice after JD arrives / ~15 day) | 17 MB | 3 MB |
| ML export reads (incremental) | 10 MB | 5 MB |
| Scoring + re-scores (reads listing+profile, writes match ~1.5 KB; ~4 full re-scores/mo) | 80 MB | 45 MB |
| Digest queries + web app (single user) | 15 MB | 15 MB |
| Label bootstrap (one-time) | 3 MB | — |
| **Total** | **≈ 200 MB (20%)** | **≈ 125 MB (12%)** |

Both are well under the 50% flag threshold. Egress (1 GB/mo cap): the backfill ML export is ~2–10 MB total, nightly incrementals are KBs — negligible.

---

## Part B — the plan

### B1. Folder layout

```
intern-radar/
├─ app/                      # Next.js App Router (thin UI only)
│  ├─ signin/                # Convex Auth email sign-in
│  ├─ matches/               # ranked matches + feedback actions
│  ├─ settings/              # preferences/strengths, threshold, frequency, wildcards
│  └─ f/[token]/             # email feedback link landing (HMAC token redemption)
├─ components/
├─ emails/                   # React Email digest template
├─ convex/
│  ├─ schema.ts
│  ├─ auth.config.ts / auth.ts
│  ├─ crons.ts               # hourly ingest, per-frequency digests
│  ├─ http.ts                # /ml/export, /ml/import/*, /feedback/redeem
│  ├─ ingest.ts  scoring.ts  digest.ts
│  ├─ profile.ts  feedbackFns.ts  labels.ts  models.ts
│  └─ lib/                   # convex-side helpers (env, clients)
├─ lib/                      # PURE logic — all unit-tested, no Convex imports
│  ├─ schemas/               # zod: simplify.ts, mlPayloads.ts
│  ├─ atsDetect.ts           # url → {ats, ids} parser (shared contract w/ Python via fixtures)
│  ├─ normalize.ts           # category/sponsorship/degrees/location-string normalization
│  ├─ geo/                   # lookup loader + haversine + alias table
│  ├─ diff.ts  filters.ts  features.ts  score.ts  digestSelect.ts
│  ├─ textSignals.ts         # class-year + sponsorship-conflict extraction from title/JD text
│  └─ feedbackToken.ts       # HMAC sign/verify, expiry
├─ shared/features.json      # single source of truth for the feature vector (B5)
├─ scripts/
│  ├─ build-geonames.ts      # GeoNames cities dump → data/geonames/lookup.json
│  ├─ export-label-draft.ts  # step 10 CSV (includes hadJd column)
│  └─ import-labels.ts       # reviewed CSV → Convex, fixed 50-label eval split
├─ data/
│  ├─ geonames/              # committed compact lookup (CC-BY, attributed in README)
│  └─ labels/                # GITIGNORED
├─ ml/                       # Python 3.12, uv
│  ├─ pyproject.toml
│  ├─ src/intern_radar_ml/
│  │  ├─ client.py           # Convex export/import HTTP client (shared secret, batches ≤100)
│  │  ├─ jd/                 # JD fetchers (owner Change 1)
│  │  │  ├─ base.py          # rate limiter (1 req/2 s/host), UA, backoff, HTML→text cleaner
│  │  │  ├─ greenhouse.py    # direct + embedded gh_jid token resolution
│  │  │  ├─ lever.py  ashby.py
│  │  │  ├─ workday.py       # CXS JSON
│  │  │  ├─ oracle.py        # candidate-experience JSON
│  │  │  └─ icims.py         # plain HTTP + Playwright fallback
│  │  ├─ embed.py            # bge-small via sentence-transformers
│  │  ├─ features.py         # loads shared/features.json, asserts names/order
│  │  ├─ train.py            # global LR + per-user L2-toward-global
│  │  └─ evaluate.py         # precision@10 on eval split
│  └─ tests/
├─ .github/workflows/ml.yml  # nightly cron + repository_dispatch + keepalive
├─ .githooks/commit-msg
├─ private/                  # GITIGNORED (resume.pdf)
└─ profile.seed.json         # GITIGNORED (example stays committed)
```

### B2. Convex schema (tables → key fields → indexes)

- `listings` — `sourceId` (Simplify UUID), `company`, `title`, `category` (normalized, D2), `categoryRaw`, `locations[]`, `geo[] {lat, lon, name}`, `remoteType` (`onsite|remote|hybrid|unknown`), `sponsorship` (normalized enum), `degrees[]`, `url`, `atsType` (`greenhouse|greenhouse_embedded|lever|ashby|workday|icims|oracle|other`), `atsRef` (parsed board/company/job ids), **`jdStatus` (`pending|fetched|failed|unsupported`), `jdSource?`, `jdText?`, `jdFetchedAt?`, `jdError?`, `jdAttempts`**, `datePosted`, `dateUpdated`, `active`, `raw` (original record), `contentHash` (for cheap diffing), `ingestedAt`, `embedding?` (384-dim), `embeddingVersion?` (hash of embedded text)
  - indexes: `by_sourceId`, `by_active`, `by_jdStatus`, `by_needsEmbedding`; vectorIndex `by_embedding` (dim 384)
- `ingestIndex` — compact docs: `{ chunk, entries: [{sourceId, contentHash}] }` so hourly diffs never read full listings (A5)
- `profiles` — `userId`, `email`, `gradDate`, `classYear`, `degreeLevel`, `preferences[] {type, value, strength}`, `resumeText?`, `resumeEmbedding?`, `preferenceVector?`, `threshold`, `frequency` (`instant|daily|weekly`), `wildcards`, `lastDigestAt?` — index `by_userId`
- `matches` — `userId`, `listingId`, `droppedBy?`, `features` (snapshot at scoring time), `rawScore` (model output), `score` (after NO_JD_PENALTY), `modelVersion`, `exploration`, `sentAt?`, `createdAt` — indexes `by_user_listing`, `by_user_score`, `by_user_unsent`
- `feedback` — `userId`, `listingId`, `kind` (`applied|thumbs_up|thumbs_down|good_suggestion|bad_suggestion`), `source` (`web|email`), `createdAt` — indexes `by_user_listing`, `by_user`, `by_createdAt` (incremental export)
- `labels` — `userId`, `listingId`, `label` (`good|bad`), `reason`, `reviewed`, `split` (`train|eval`), `hadJd` — indexes `by_user`, `by_split`
- `models` — `version`, `globalWeights[]`, `featureNames[]`, `metrics {precisionAt10, nTrain, nEval, …}`, `promoted`, `createdAt`; `userWeights` — `userId`, `modelVersion`, `weights[]`
- `ingestState` — singleton: `lastCommitSha`, `lastRunAt`, `lastError?`, `lastNewCount`; also `mlSyncState`: `lastExportAt` cursors per kind
- Convex Auth tables

### B3. zod schemas (all external data crosses one of these)

- `SimplifyListing` — the 15 fields in A1; unknown `category`/`sponsorship` values fall back to catch-all + raw preserved; records failing parse are skipped and counted.
- `ProfileSeed` — mirrors `profile.seed.example.json` (roleCategory enum per D2).
- ML import payloads — JD batch (`[{listingId, jdStatus, jdSource?, jdText?, jdError?}]`), embeddings batch, model push (weights length must equal `featureNames` length must equal `shared/features.json`). Batches capped at 100 records.
- ATS response shapes live in Python (pydantic-light dataclasses + tests with recorded fixtures) since fetching moved to the Actions job; Convex only ever receives cleaned text through the JD batch schema.

### B4. Feature vector (initial, order = vector order)

| # | Name | Computation | Prior weight |
|---|---|---|---|
| 0 | `bias` | constant 1 | fitted; prior ≈ −1 |
| 1 | `embed_sim_resume` | cosine(listing embedding, resume embedding); **neutral (0.5·expected-sim) when no JD** — a title-only embedding must not push either way (D7); 0 if resume missing | 2.0 |
| 2 | `embed_sim_pref` | cosine(listing embedding, preference vector — Rocchio: resume embedding +liked/applied −disliked, α=1, β=0.5, γ=0.3, re-normalized); **neutral when no JD** | 1.5 |
| 3 | `loc_proximity` | max over preferred places of `exp(−haversine_miles / max(radius, 50))`; 1.0 if listing remote & remote acceptable; 0 if no geo | by strength |
| 4 | `work_mode_match` | 1 if listing remoteType ∈ preferred modes, 0.5 if unknown, else 0 | by strength |
| 5 | `role_category_match` | 1 if normalized category ∈ preferred categories else 0 | by strength |
| 6 | `sponsorship_match` | 1 explicit match / 0.5 unknown / 0 explicit conflict (structured field or JD text, D3) | by strength |
| 7 | `class_year_signal` | 1 explicit fit / 0.5 unstated / 0 explicit mismatch (title + JD text; only scored when strength ≠ hard) | by strength |
| 8 | `company_affinity` | 1 if user has applied/thumbs-upped this company before, 0 otherwise | 0.5 |
| 9 | `recency` | `exp(−days_since_posted / 14)` | 0.5 |
| 10 | `has_jd` | 1 if full JD text stored | 0.25 |

"Neutral" for the embedding features = the feature's population mean over JD-bearing listings (computed at training time, stored with the model; 0.5 × typical similarity as the pre-model fallback) so the model can't learn to reward JD-less listings through these slots.

Strength→prior: `strong` = 1.0, `soft` = 0.4, `ignore` = 0 (feature emitted but zero-weighted so vector shape never changes). `hard` prefs never reach scoring. Training clamps strength-feature weights to bounds from `shared/features.json` so feedback tunes but can't invert a stated preference.

**Score** = `rawScore = sigmoid(w · x)`; **final `score = rawScore × NO_JD_PENALTY` when `jdStatus ≠ fetched`** (config env `NO_JD_PENALTY`, default 0.6, applied post-model, never learned — D7). Both stored on the match with the feature snapshot.

### B5. Shared feature definition — `shared/features.json`

```json
{ "version": 1,
  "embeddingModel": "BAAI/bge-small-en-v1.5", "embeddingDim": 384,
  "features": [
    { "name": "bias", "prior": -1.0, "bounds": [-6, 6] },
    { "name": "embed_sim_resume", "prior": 2.0, "bounds": [0, 6], "neutralWithoutJd": true },
    { "name": "loc_proximity", "priorByStrength": {"strong": 1.0, "soft": 0.4}, "bounds": [0, 3] }
  ]
}
```
(abridged — one entry per B4 row). TS imports it (zod-validated at startup); `lib/features.ts` builds vectors in array order. Python `ml/features.py` loads the same file and **fails the run** if names/order/dim disagree with what Convex exports. Model pushes include `featureNames`; Convex re-verifies before accepting. One file, no drift.

### B6. Convex ⇄ Actions endpoints (all `Authorization: Bearer ML_SHARED_SECRET`, on Convex `http.ts`)

**Strictly incremental — never full-table exports (D8).**

- `GET /ml/export?kind=jd_pending` — listings with `jdStatus = pending` and `jdAttempts < cap`: id, url, atsType, atsRef. Paginated (cursor), ≤ 200/page.
- `GET /ml/export?kind=embed_pending` — listings where `embeddingVersion` ≠ hash(current text): id, title, company, category, jdText. Paginated.
- `GET /ml/export?kind=training&since={ts}` — labels/feedback created since cursor + match feature snapshots for them + resumeText if changed + current promoted model metrics. Cursor persisted in `mlSyncState`.
- `POST /ml/import/jd` — `{ items: [{listingId, jdStatus, jdSource?, jdText?, jdError?}] }`, ≤ 100/call. Cleaned text only — raw HTML never crosses the wire.
- `POST /ml/import/embeddings` — `{ items: [{listingId, embedding, embeddingVersion}], resumes: [{userId, embedding}] }`, ≤ 100/call.
- `POST /ml/import/model` — `{ version, featureNames, globalWeights, userWeights, metrics }`; Convex promotes only if `metrics.precisionAt10 >=` current promoted version's.
- `POST /feedback/redeem` — HMAC-signed email-link token (`FEEDBACK_SIGNING_SECRET`, 14-day expiry, single-use per (token, kind)).

Trigger path: profile/resume change in Convex → action calls GitHub `repository_dispatch` (`GITHUB_DISPATCH_TOKEN`) → same workflow as nightly.

### B7. Pipeline flow (Convex)

1. **Ingest (hourly cron):** GitHub commits API for head SHA of `dev` → if unchanged vs `ingestState.lastCommitSha`, stop (no 12.8 MB download). Else fetch raw JSON, zod-parse per record (skip+count malformed), filter `terms ∋ "Summer 2027"` and `is_visible`, diff against `ingestIndex` content hashes (insert new with `jdStatus: pending|unsupported` by ATS; update changed; a changed record resets `jdStatus` to `pending` so the JD is re-fetched — the only re-fetch trigger), batched mutations.
2. **Geocode + normalize (post-ingest, in Convex):** offline lookup, remoteType from location strings.
3. **JD + embeddings: arrive asynchronously from the Actions job** (B8) via the import endpoints. Import mutations re-score affected matches.
4. **Score (per new/updated listing × user):** hard filters (`{pass, droppedBy}`) → features → sigmoid → NO_JD_PENALTY when applicable → store match + snapshot. Re-score on model promotion, preference change, or JD/embedding arrival.
5. **Digest (cron per frequency):** unsent matches above threshold since `lastDigestAt`, top-N + `wildcards` random below-threshold survivors (`exploration: true`), React Email via Resend; JD-less listings carry the "Couldn't read job description" label; mark `sentAt`.

### B8. ML job (nightly + dispatch) — now owns JD fetching

1. Pull `jd_pending` export. **Fetch JDs**, source priority: Greenhouse (incl. embedded) / Lever / Ashby → Workday CXS → Oracle ORC → iCIMS (HTTP, Playwright fallback). Rules (owner Change 1): per-host rate limit ~1 req/2 s, honest User-Agent, exponential backoff on errors/429; fetch each JD once (re-fetch only when the listing record changed; retry cap via `jdAttempts`); clean to text (entity-decode, tag-strip, whitespace-normalize) — never store/ship raw HTML; every outcome reported as `jdStatus` + `jdSource`/`jdError`; **fail soft** — one bad host never breaks the run. Push back in ≤100-record batches.
   - **Probe gate:** before building each of Workday / Oracle / iCIMS, run the prototype against ~20 real listings and report the success rate; **<50% → stop and tell the owner** instead of building it.
2. Pull `embed_pending`. Embed with bge-small (HF cache in Actions cache); JD text if present else `title + company + category`; `embeddingVersion` = hash of embedded text so JD arrival triggers exactly one re-embed. Push back in batches.
3. Pull `training` increment. Train global LR (scikit-learn, class-balanced) on labels + feedback (applied/thumbs_up/good → 1, thumbs_down/bad → 0; exploration rows flagged), then per-user LR with L2 toward global (λ scaled by label count), clamp to bounds.
4. Evaluate precision@10 on the eval split; push model; Convex decides promotion.
5. Keepalive step (re-enables the workflow via GitHub API).

Caches: uv env, HF model (~130 MB), Playwright chromium (~300 MB) — all in Actions cache (10 GB cap, fine).

### B9. Build order (each step: typecheck + lint + tests green → conventional commit)

| # | Step | Commit(s) |
|---|---|---|
| 1 | Scaffold: pnpm + Next.js (App Router, strict TS, Tailwind) + Convex + Vitest; `ml/` uv + pytest; `.env.example`; README | `chore: scaffold app, convex, and ml workspaces` |
| 2 | Convex Auth email sign-in + `ALLOWED_EMAILS` gate | `feat: allowlisted email auth` |
| 3 | Profile schema, seed-loader mutation, unpdf resume extraction | `feat: profile seed and resume ingestion` |
| 4 | Ingest: GitHub client, zod, SHA short-circuit, `ingestIndex` hash diff, hourly cron, fixture tests from real JSON | `feat: hourly simplify ingest` |
| 5 | **ML skeleton first** (re-sequenced): export/import endpoints + shared-secret auth, Python client, bge-small embed job, `ml.yml` (cron + dispatch + keepalive + caches) | `feat: ml export/import endpoints and embedding job` |
| 6 | **JD fetcher, one commit per source:** 6a GH (direct+embedded)/Lever/Ashby → 6b Workday → 6c Oracle → 6d iCIMS. Probe gate before 6b/6c/6d | `feat: jd fetch — greenhouse/lever/ashby`, `… — workday`, `… — oracle`, `… — icims` |
| 7 | GeoNames preprocess + committed lookup + location normalizer + tests + README attribution | `feat: offline geocoding` |
| 8 | Hard filters (JD-text-aware class-year & sponsorship conflicts), one test per preference type × strength | `feat: hard filters` |
| 9 | Scoring: `shared/features.json`, features (neutral-without-JD), priors, sigmoid, NO_JD_PENALTY, snapshot, Rocchio | `feat: prior-weight scoring` |
| 10 | **STOP — labels.** Confirm `profile.seed.json` filled → export ~200 varied listings to `data/labels/draft.csv` (with `hadJd` column) → labels drafted from JD text where available, strictly from profile → **owner reviews/edits** → import with fixed 50-eval split | `feat: label import tooling` |
| 11 | Training + eval + versioned push + promotion gate | `feat: personalized training with precision@10 gate` |
| 12 | Matches page (score, plain-language top features, no-JD label, Applied→good-suggestion prompt, 👍/👎) + settings page | `feat: matches and settings ui` |
| 13 | Digest: React Email (no-JD label), Resend, HMAC links, per-frequency crons, wildcards | `feat: email digests` |
| 14 | **Open sign-up + abuse protection:** drop `ALLOWED_EMAILS` (add `ADMIN_EMAILS`), Turnstile-gated `/auth/request-code` with per-email (5/h), per-IP (20/h), and global-daily sign-in-email limits, single-use send permits enforced inside the OTP provider | `feat: open sign-up with turnstile and rate limits` |
| 15 | **Onboarding:** resume upload (Convex storage) → unpdf extraction → PDF deleted → preference + digest questions; matches page routes profile-less users to `/onboarding` | `feat: onboarding flow` |
| 16 | **Account lifecycle:** subscribed flag + signed-token unsubscribe route + digest footer links, delete-my-account (profile/matches/feedback/labels/userWeights/auth rows), `/privacy` | `feat: unsubscribe, account deletion, privacy page` |

Done-when (from PROMPT.md): full pipeline end-to-end, real digest received with working feedback from email + web, precision@10 reported for model v1 vs prior-weights baseline, all pure logic tested, CLAUDE.md Commands section verified.
