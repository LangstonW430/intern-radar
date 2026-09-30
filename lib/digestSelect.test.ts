import { describe, expect, it } from "vitest";
import { selectDigestItems, shouldSendDigest } from "./digestSelect";
import {
  signFeedbackToken,
  verifyFeedbackToken,
  type FeedbackTokenPayload,
} from "./feedbackToken";

function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("selectDigestItems", () => {
  const candidates = [
    { matchId: "a", score: 0.9 },
    { matchId: "b", score: 0.7 },
    { matchId: "c", score: 0.65 },
    { matchId: "d", score: 0.5 },
    { matchId: "e", score: 0.4 },
    { matchId: "f", score: 0.3 },
  ];

  it("takes top above threshold sorted desc, capped", () => {
    const { top } = selectDigestItems(candidates, {
      threshold: 0.6,
      wildcards: 0,
      maxTop: 2,
      random: seq(0),
    });
    expect(top.map((c) => c.matchId)).toEqual(["a", "b"]);
  });

  it("samples wildcards from below-threshold survivors without repeats", () => {
    const { wildcards } = selectDigestItems(candidates, {
      threshold: 0.6,
      wildcards: 2,
      random: seq(0, 0),
    });
    expect(wildcards).toHaveLength(2);
    expect(new Set(wildcards.map((c) => c.matchId)).size).toBe(2);
    for (const w of wildcards) expect(w.score).toBeLessThan(0.6);
  });

  it("handles fewer wildcards than requested", () => {
    const { wildcards } = selectDigestItems([{ matchId: "x", score: 0.1 }], {
      threshold: 0.6,
      wildcards: 5,
      random: seq(0),
    });
    expect(wildcards).toHaveLength(1);
  });
});

describe("shouldSendDigest", () => {
  const mondayAt13 = Date.UTC(2026, 8, 28, 13, 30); // Monday
  const tuesdayAt9 = Date.UTC(2026, 8, 29, 9, 0);

  it("instant is always eligible", () => {
    expect(shouldSendDigest("instant", undefined, tuesdayAt9)).toBe(true);
  });

  it("daily sends only in the 13:00 UTC window with 20h spacing", () => {
    expect(shouldSendDigest("daily", undefined, mondayAt13)).toBe(true);
    expect(shouldSendDigest("daily", undefined, tuesdayAt9)).toBe(false);
    expect(
      shouldSendDigest("daily", mondayAt13 - 3600_000, mondayAt13),
    ).toBe(false);
  });

  it("weekly sends Mondays at 13:00 UTC with 6d spacing", () => {
    expect(shouldSendDigest("weekly", undefined, mondayAt13)).toBe(true);
    expect(
      shouldSendDigest("weekly", mondayAt13 - 86_400_000, mondayAt13),
    ).toBe(false);
    expect(shouldSendDigest("weekly", undefined, tuesdayAt9)).toBe(false);
  });
});

describe("feedback tokens", () => {
  const payload: FeedbackTokenPayload = {
    userId: "u1",
    listingId: "l1",
    kind: "thumbs_up",
    exp: Date.now() + 60_000,
  };

  it("round-trips a valid token", async () => {
    const token = await signFeedbackToken(payload, "secret");
    expect(await verifyFeedbackToken(token, "secret", Date.now())).toEqual(
      payload,
    );
  });

  it("rejects a tampered token", async () => {
    const token = await signFeedbackToken(payload, "secret");
    const [body] = token.split(".");
    const other = await signFeedbackToken(
      { ...payload, kind: "applied" },
      "secret",
    );
    const forged = `${other.split(".")[0]}.${token.split(".")[1]}`;
    expect(await verifyFeedbackToken(forged, "secret", Date.now())).toBeNull();
    expect(
      await verifyFeedbackToken(`${body}.AAAA`, "secret", Date.now()),
    ).toBeNull();
  });

  it("rejects the wrong secret and expired tokens", async () => {
    const token = await signFeedbackToken(payload, "secret");
    expect(await verifyFeedbackToken(token, "other", Date.now())).toBeNull();
    expect(
      await verifyFeedbackToken(token, "secret", payload.exp + 1),
    ).toBeNull();
  });

  it("rejects garbage", async () => {
    expect(await verifyFeedbackToken("nope", "secret", Date.now())).toBeNull();
    expect(await verifyFeedbackToken("a.b", "secret", Date.now())).toBeNull();
  });
});
