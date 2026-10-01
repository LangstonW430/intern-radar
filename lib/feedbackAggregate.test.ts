import { describe, expect, it } from "vitest";
import {
  aggregateTrainingRows,
  type FeedbackEvent,
  type LabelInput,
} from "./feedbackAggregate";
import { SCORING_CONFIG } from "./scoringConfig";

const WEIGHTS = { applied: 2.0, default: 1.0 };

function event(
  kind: FeedbackEvent["kind"],
  createdAt: number,
  listingId = "l1",
): FeedbackEvent {
  return { userId: "u1", listingId, kind, createdAt };
}

function only(rows: ReturnType<typeof aggregateTrainingRows>) {
  expect(rows).toHaveLength(1);
  return rows[0];
}

describe("aggregateTrainingRows", () => {
  it("applied only → y=1, weight 2", () => {
    const row = only(aggregateTrainingRows([], [event("applied", 1)], WEIGHTS));
    expect(row).toMatchObject({ y: 1, weight: 2, split: "train", source: "feedback" });
  });

  it("applied + good_suggestion → y=1, weight 2", () => {
    const row = only(
      aggregateTrainingRows(
        [],
        [event("applied", 1), event("good_suggestion", 2)],
        WEIGHTS,
      ),
    );
    expect(row).toMatchObject({ y: 1, weight: 2, decidedBy: "good_suggestion" });
  });

  it("applied + bad_suggestion → y=0, weight 2", () => {
    const row = only(
      aggregateTrainingRows(
        [],
        [event("applied", 1), event("bad_suggestion", 2)],
        WEIGHTS,
      ),
    );
    expect(row).toMatchObject({ y: 0, weight: 2, decidedBy: "bad_suggestion" });
  });

  it("thumbs_up then thumbs_down → latest wins (y=0)", () => {
    const row = only(
      aggregateTrainingRows(
        [],
        [event("thumbs_up", 1), event("thumbs_down", 2)],
        WEIGHTS,
      ),
    );
    expect(row).toMatchObject({ y: 0, weight: 1, decidedBy: "thumbs_down" });

    const reversed = only(
      aggregateTrainingRows(
        [],
        [event("thumbs_down", 1), event("thumbs_up", 2)],
        WEIGHTS,
      ),
    );
    expect(reversed).toMatchObject({ y: 1, decidedBy: "thumbs_up" });
  });

  it("a suggestion answer overrides thumbs regardless of order", () => {
    const row = only(
      aggregateTrainingRows(
        [],
        [event("bad_suggestion", 1), event("thumbs_up", 2)],
        WEIGHTS,
      ),
    );
    expect(row).toMatchObject({ y: 0, decidedBy: "bad_suggestion" });
  });

  it("eval-split pairs exclude their feedback entirely", () => {
    const labels: LabelInput[] = [
      { userId: "u1", listingId: "l1", label: "good", split: "eval" },
    ];
    const rows = aggregateTrainingRows(
      labels,
      [event("thumbs_down", 1), event("applied", 2)],
      WEIGHTS,
    );
    const row = only(rows);
    expect(row).toMatchObject({ split: "eval", source: "label", y: 1, weight: 1 });
  });

  it("feedback replaces a train-split label for the same pair", () => {
    const labels: LabelInput[] = [
      { userId: "u1", listingId: "l1", label: "good", split: "train" },
      { userId: "u1", listingId: "l2", label: "bad", split: "train" },
    ];
    const rows = aggregateTrainingRows(labels, [event("thumbs_down", 1)], WEIGHTS);
    expect(rows).toHaveLength(2);
    const l1 = rows.find((r) => r.listingId === "l1")!;
    const l2 = rows.find((r) => r.listingId === "l2")!;
    expect(l1).toMatchObject({ source: "feedback", y: 0 });
    expect(l2).toMatchObject({ source: "label", y: 0 });
  });

  it("shared/features.json carries the tunable weights", () => {
    expect(SCORING_CONFIG.feedbackWeights.applied).toBe(2.0);
    expect(SCORING_CONFIG.feedbackWeights.default).toBe(1.0);
  });
});
