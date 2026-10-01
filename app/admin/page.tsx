"use client";

import { useAction } from "convex/react";
import { useEffect, useState, type ReactNode } from "react";
import Header from "@/components/Header";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import { api } from "@/convex/_generated/api";
import type { AdminOverview } from "@/convex/admin";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-2.5 p-4 sm:p-5">
      <h2 className="font-medium">{title}</h2>
      {children}
    </Card>
  );
}

function Num({ children }: { children: ReactNode }) {
  return <span className="font-mono tabular-nums">{children}</span>;
}

function pct(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(0)}%`;
}

export default function AdminPage() {
  const overview = useAction(api.admin.overview);
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    overview({})
      .then(setData)
      .catch((err) =>
        setError(
          String(err).includes("Not authorized")
            ? "Not authorized — this page is admin-only."
            : `Failed to load: ${String(err)}`,
        ),
      );
  }, [overview]);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>

        {error && <p className="text-sm text-neg">{error}</p>}
        {!error && data === null && (
          <div className="flex flex-col gap-4" aria-busy>
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        )}

        {data && (
          <>
            <Section title="Ingest">
              {data.ingest ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted">Last run</dt>
                    <dd>
                      {data.ingest.lastRunAt
                        ? new Date(data.ingest.lastRunAt).toLocaleString()
                        : "never"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">New last run</dt>
                    <dd>
                      <Num>{data.ingest.lastNewCount ?? "—"}</Num>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Commit</dt>
                    <dd className="truncate font-mono text-xs">
                      {data.ingest.lastCommitSha?.slice(0, 10) ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Last error</dt>
                    <dd className={data.ingest.lastError ? "text-neg" : ""}>
                      {data.ingest.lastError ?? "none"}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-muted">No ingest runs recorded yet.</p>
              )}
            </Section>

            <Section title="JD success rate by ATS">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="py-1 pr-3 font-normal">ATS</th>
                      <th className="py-1 pr-3 text-right font-normal">Active</th>
                      <th className="py-1 pr-3 text-right font-normal">Fetched</th>
                      <th className="py-1 pr-3 text-right font-normal">Pending</th>
                      <th className="py-1 pr-3 text-right font-normal">Failed</th>
                      <th className="py-1 pr-3 text-right font-normal">Unsup.</th>
                      <th className="py-1 text-right font-normal">Success</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.jdByAts.map((row) => (
                      <tr key={row.atsType} className="border-t border-hairline">
                        <td className="py-1 pr-3">{row.atsType}</td>
                        <td className="py-1 pr-3 text-right"><Num>{row.active}</Num></td>
                        <td className="py-1 pr-3 text-right"><Num>{row.fetched}</Num></td>
                        <td className="py-1 pr-3 text-right"><Num>{row.pending}</Num></td>
                        <td className="py-1 pr-3 text-right"><Num>{row.failed}</Num></td>
                        <td className="py-1 pr-3 text-right"><Num>{row.unsupported}</Num></td>
                        <td className="py-1 text-right"><Num>{pct(row.successRate)}</Num></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="Keyword stats">
              {data.keywordStats ? (
                <p className="text-sm">
                  <Num>{data.keywordStats.totalWithJd}</Num> active listings with
                  a JD · <Num>{data.keywordStats.distinctKeywords}</Num> distinct
                  keywords · <Num>{data.profiles}</Num>{" "}
                  {data.profiles === 1 ? "profile" : "profiles"}
                </p>
              ) : (
                <p className="text-sm text-muted">
                  No keyword stats yet — run the keyword backfill.
                </p>
              )}
            </Section>

            <Section title="Feedback quality (last 30 days)">
              <p className="text-xs text-muted">
                Positive rate = (applied + 👍 + “good suggestion”) over all
                thumbs/suggestion signals. <Num>{data.feedbackEvents30d}</Num>{" "}
                events in the window.
              </p>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-muted">Top-ranked matches</dt>
                  <dd>
                    <Num>{pct(data.rates.top.rate)}</Num>{" "}
                    <span className="text-xs text-muted">
                      ({data.rates.top.positive}+ / {data.rates.top.negative}−)
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Exploration wildcards</dt>
                  <dd>
                    <Num>{pct(data.rates.exploration.rate)}</Num>{" "}
                    <span className="text-xs text-muted">
                      ({data.rates.exploration.positive}+ /{" "}
                      {data.rates.exploration.negative}−)
                    </span>
                  </dd>
                </div>
              </dl>
            </Section>

            <Section title="Furthest-drifted keyword weights">
              {data.drift.length === 0 ? (
                <p className="text-sm text-muted">No learned movement yet.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {data.drift.map((d) => (
                    <li key={d.id} className="flex justify-between gap-3">
                      <span className="truncate">{d.id}</span>
                      <span className="shrink-0 text-xs text-muted">
                        <Num>{d.initial.toFixed(2)}</Num> →{" "}
                        <Num>{d.weight.toFixed(2)}</Num>{" "}
                        <span className={d.weight >= d.initial ? "text-pos" : "text-neg"}>
                          (Δ <Num>{d.drift.toFixed(2)}</Num>)
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}
      </main>
    </div>
  );
}
