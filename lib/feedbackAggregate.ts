/**
 * Collapses feedback events into one training row per (userId, listingId)
 * per CLAUDE.md's feedback rules:
 *
 * Target y, first match wins:
 *   1. latest good_suggestion/bad_suggestion answer (1/0)
 *   2. latest thumbs_up/thumbs_down (1/0)
 *   3. applied → 1
 *
 * Weight: feedbackWeights.applied when the user applied to the listing
 * (applied is the strongest signal even when the suggestion answer sets y),
 * else feedbackWeights.default.
 *
 * Labels vs feedback:
 *   - eval-split pairs are eval rows only; their feedback never enters
 *     training (no leakage)
 *   - a feedback row replaces a train-split label row for the same pair
 */

export type FeedbackKind =
  | "applied"
  | "thumbs_up"
  | "thumbs_down"
  | "good_suggestion"
  | "bad_suggestion";

export interface FeedbackEvent {
  userId: string;
  listingId: string;
  kind: FeedbackKind;
  createdAt: number;
}

export interface LabelInput {
  userId: string;
  listingId: string;
  label: "good" | "bad";
  split: "train" | "eval";
}

export interface FeedbackWeights {
  applied: number;
  default: number;
}

export interface AggregatedRow {
  userId: string;
  listingId: string;
  y: 0 | 1;
  weight: number;
  split: "train" | "eval";
  source: "label" | "feedback";
  /** The signal that decided y — for debugging, not training. */
  decidedBy: string;
}

const pairKey = (userId: string, listingId: string) => `${userId}|${listingId}`;

export function aggregateTrainingRows(
  labels: LabelInput[],
  feedback: FeedbackEvent[],
  weights: FeedbackWeights,
): AggregatedRow[] {
  const evalPairs = new Set(
    labels.filter((l) => l.split === "eval").map((l) => pairKey(l.userId, l.listingId)),
  );

  const byPair = new Map<string, FeedbackEvent[]>();
  for (const event of feedback) {
    const key = pairKey(event.userId, event.listingId);
    if (evalPairs.has(key)) continue; // never leak eval listings into training
    const events = byPair.get(key) ?? [];
    events.push(event);
    byPair.set(key, events);
  }

  const rows: AggregatedRow[] = [];

  for (const label of labels) {
    const key = pairKey(label.userId, label.listingId);
    if (label.split === "train" && byPair.has(key)) continue; // feedback wins
    rows.push({
      userId: label.userId,
      listingId: label.listingId,
      y: label.label === "good" ? 1 : 0,
      weight: weights.default,
      split: label.split,
      source: "label",
      decidedBy: `label:${label.label}`,
    });
  }

  for (const events of byPair.values()) {
    const sorted = [...events].sort((a, b) => a.createdAt - b.createdAt);
    const latestOf = (...kinds: FeedbackKind[]) =>
      [...sorted].reverse().find((e) => kinds.includes(e.kind));

    const suggestion = latestOf("good_suggestion", "bad_suggestion");
    const thumbs = latestOf("thumbs_up", "thumbs_down");
    const applied = sorted.some((e) => e.kind === "applied");

    let y: 0 | 1;
    let decidedBy: string;
    if (suggestion) {
      y = suggestion.kind === "good_suggestion" ? 1 : 0;
      decidedBy = suggestion.kind;
    } else if (thumbs) {
      y = thumbs.kind === "thumbs_up" ? 1 : 0;
      decidedBy = thumbs.kind;
    } else if (applied) {
      y = 1;
      decidedBy = "applied";
    } else {
      continue; // unreachable: every kind is covered above
    }

    rows.push({
      userId: sorted[0].userId,
      listingId: sorted[0].listingId,
      y,
      weight: applied ? weights.applied : weights.default,
      split: "train",
      source: "feedback",
      decidedBy,
    });
  }

  return rows;
}
