"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { KeywordWeightMap } from "@/lib/keywordWeights";
import { keywordDisplayName } from "@/lib/vocabulary";

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
    <div className="flex flex-col gap-2">
      <p className="text-xs text-neutral-500">
        What each keyword adds to a listing&apos;s score (times its rarity).
        Edits apply immediately and become the keyword&apos;s anchor; feedback
        keeps tuning from there.
      </p>
      {entries.length === 0 ? (
        <p className="text-sm text-neutral-400">
          No keyword weights yet — add interests, or give feedback on matches.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {entries.map(([id, w]) => (
            <li key={id} className="flex items-center gap-2 text-sm">
              <span className="min-w-28 flex-1">{keywordDisplayName(id)}</span>
              <input
                type="number"
                step={0.1}
                value={drafts[id] ?? String(w.weight.toFixed(2))}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [id]: e.target.value }))
                }
                onBlur={() => void saveWeight(id)}
                className="w-20 rounded border border-neutral-300 px-1 py-0.5 text-right"
              />
              <span className="w-32 text-xs text-neutral-500">
                initial {w.initial.toFixed(2)} · {w.source}
              </span>
              <span className="w-16 text-xs text-neutral-400">
                seen {w.sightings}×
              </span>
              <button
                aria-label={`Remove ${keywordDisplayName(id)}`}
                onClick={() => void remove({ keywordId: id })}
                className="text-neutral-400 hover:text-neutral-700"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <button
          type="button"
          onClick={() => void handleReset()}
          className="rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-600"
        >
          Reset learned weights
        </button>
      </div>
      {status && <p className="text-sm text-red-600">{status}</p>}
    </div>
  );
}
