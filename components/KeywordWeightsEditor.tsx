"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { KeywordWeightMap } from "@/lib/keywordWeights";
import { keywordDisplayName } from "@/lib/vocabulary";
import Button from "./ui/Button";
import { Input } from "./ui/Field";

/**
 * Every keyword with a non-zero weight, editable in place. Unlike the rest
 * of the settings form, these actions apply immediately: an edit makes the
 * value the keyword's anchor (initial = weight, source = user).
 */
export default function KeywordWeightsEditor({
  weights,
}: {
  weights: KeywordWeightMap;
}) {
  const update = useMutation(api.profile.updateKeywordWeight);
  const remove = useMutation(api.profile.removeKeywordWeight);
  const reset = useMutation(api.profile.resetLearnedWeights);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);

  const entries = Object.entries(weights)
    .filter(([, w]) => w.weight !== 0)
    .sort((a, b) => Math.abs(b[1].weight) - Math.abs(a[1].weight));

  async function saveWeight(id: string) {
    const draft = drafts[id];
    if (draft === undefined) return;
    const value = Number(draft);
    if (!Number.isFinite(value) || value === weights[id]?.weight) {
      setDrafts(({ [id]: _, ...rest }) => rest);
      return;
    }
    setStatus(null);
    try {
      await update({ keywordId: id, weight: value });
      setDrafts(({ [id]: _, ...rest }) => rest);
    } catch (err) {
      setStatus(`Update failed: ${String(err)}`);
    }
  }

  async function handleReset() {
    if (
      !window.confirm(
        "Reset every learned weight back to its starting value? Keywords learned purely from feedback will disappear.",
      )
    ) {
      return;
    }
    setStatus(null);
    try {
      await reset({});
    } catch (err) {
      setStatus(`Reset failed: ${String(err)}`);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-xs text-muted">
        What each keyword adds to a listing&apos;s score (times its rarity).
        Edits apply immediately and become the keyword&apos;s anchor; feedback
        keeps tuning from there.
      </p>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">
          No keyword weights yet — add interests, or give feedback on matches.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {entries.map(([id, w]) => (
            <li key={id} className="flex items-center gap-2 text-sm">
              <span className="min-w-28 flex-1 truncate">
                {keywordDisplayName(id)}
              </span>
              <Input
                type="number"
                step={0.1}
                value={drafts[id] ?? String(w.weight.toFixed(2))}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [id]: e.target.value }))
                }
                onBlur={() => void saveWeight(id)}
                aria-label={`Weight for ${keywordDisplayName(id)}`}
                className="h-8 w-20 text-right font-mono tabular-nums"
              />
              <span className="w-30 text-xs text-muted">
                starts at{" "}
                <span className="font-mono tabular-nums">
                  {w.initial.toFixed(2)}
                </span>{" "}
                · {w.source}
              </span>
              <span className="w-14 font-mono text-xs tabular-nums text-muted">
                {w.sightings}×
              </span>
              <button
                aria-label={`Remove ${keywordDisplayName(id)}`}
                onClick={() => void remove({ keywordId: id })}
                className="rounded px-1 text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <Button onClick={() => void handleReset()}>Reset learned weights</Button>
      </div>
      {status && <p className="text-sm text-neg">{status}</p>}
    </div>
  );
}
