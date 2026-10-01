import Chip from "./ui/Chip";

export interface MatchDetailData {
  url: string;
  hasJd: boolean;
  jdStatus: string;
  matchedSkills: string[];
  missingRequired: string[];
  preferredSkills: { name: string; have: boolean }[];
  interestHits: { keyword: string; tag: string; hit: boolean }[];
  requirements: string[];
  preferred: string[];
  responsibilities: string[];
  facts: {
    degrees: string[];
    minGpa: number | null;
    gradYears: number[];
    pay: string | null;
    duration: string | null;
  } | null;
  whyScore: string | null;
  breakdown: {
    bias: number;
    keywordOther: number;
    keywords: {
      name: string;
      weight: number;
      idf: number;
      position: number;
      contribution: number;
    }[];
    structural: {
      label: string;
      value: number;
      weight: number;
      contribution: number;
    }[];
  } | null;
}

function signed(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;
}

function BulletSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
        {title}
      </p>
      <ul className="flex list-disc flex-col gap-0.5 pl-4 text-sm text-ink/90">
        {items.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
    </div>
  );
}

/** Presentational detail panel — fixture-friendly for the dev preview. */
export default function MatchDetailView({ detail }: { detail: MatchDetailData }) {
  const facts = detail.facts;
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
    <div className="mt-3 flex flex-col gap-4 rounded-lg border border-hairline bg-surface p-4 text-sm">
      {detail.whyScore && <p className="font-medium">{detail.whyScore}</p>}

      {detail.breakdown && (
        <div className="flex flex-col gap-2">
          {detail.breakdown.keywords.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {detail.breakdown.keywords.map((k) => (
                <Chip key={k.name} tone={k.contribution >= 0 ? "pos" : "neg"}>
                  {k.name}
                  <span className="font-mono tabular-nums">
                    {signed(k.contribution)}
                  </span>
                </Chip>
              ))}
              {detail.breakdown.keywordOther !== 0 && (
                <Chip tone="neutral">
                  other keywords
                  <span className="font-mono tabular-nums">
                    {signed(detail.breakdown.keywordOther)}
                  </span>
                </Chip>
              )}
            </div>
          )}
          <ul className="max-w-xs text-xs text-muted">
            {detail.breakdown.structural
              .filter((s) => s.contribution !== 0)
              .sort((a, b) => b.contribution - a.contribution)
              .map((s) => (
                <li key={s.label} className="flex justify-between gap-4 py-px">
                  <span>{s.label}</span>
                  <span className="font-mono tabular-nums">
                    {signed(s.contribution)}
                  </span>
                </li>
              ))}
            <li className="flex justify-between gap-4 py-px">
              <span>Baseline</span>
              <span className="font-mono tabular-nums">
                {signed(detail.breakdown.bias)}
              </span>
            </li>
          </ul>
        </div>
      )}

      {!detail.hasJd ? (
        <p className="text-muted">
          {detail.jdStatus === "pending"
            ? "Fetching job description… the extraction brief appears once it's in."
            : "Couldn't read the job description for this listing, so nothing could be extracted — judge it from the posting itself."}
        </p>
      ) : (
        <>
          {(detail.matchedSkills.length > 0 ||
            detail.missingRequired.length > 0 ||
            detail.preferredSkills.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {detail.matchedSkills.map((s) => (
                <Chip key={`m-${s}`} tone="pos">
                  ✓ {s}
                </Chip>
              ))}
              {detail.missingRequired.map((s) => (
                <Chip key={`r-${s}`} tone="neg">
                  required: {s}
                </Chip>
              ))}
              {detail.preferredSkills
                .filter((p) => !p.have)
                .map((p) => (
                  <Chip key={`p-${p.name}`} tone="neutral">
                    preferred: {p.name}
                  </Chip>
                ))}
            </div>
          )}

          {detail.interestHits.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {detail.interestHits.map((i) => (
                <Chip key={i.keyword} tone={i.tag === "want" ? "pos" : "neg"}>
                  {i.tag === "want" ? "mentions" : "avoid hit"}: {i.keyword}
                </Chip>
              ))}
            </div>
          )}

          <BulletSection title="Requirements" items={detail.requirements} />
          <BulletSection title="Preferred" items={detail.preferred} />
          <BulletSection
            title="Top responsibilities"
            items={detail.responsibilities}
          />
          {factBits.length > 0 && (
            <p className="text-muted">{factBits.join(" · ")}</p>
          )}
        </>
      )}

      <p className="flex items-center justify-between gap-3 text-xs text-muted">
        <span>Extracted automatically — check the posting for the full picture.</span>
        <a
          href={detail.url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Open posting ↗
        </a>
      </p>
    </div>
  );
}
