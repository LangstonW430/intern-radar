import { describe, expect, it } from "vitest";
import { feedbackRates, topWeightDrift } from "./adminStats";

describe("feedbackRates", () => {
  it("splits by exploration and computes positive/(positive+negative)", () => {
    const { top, exploration } = feedbackRates([
      { kind: "thumbs_up", exploration: false },
      { kind: "applied", exploration: false },
      { kind: "thumbs_down", exploration: false },
      { kind: "good_suggestion", exploration: false },
      { kind: "thumbs_down", exploration: true },
      { kind: "thumbs_up", exploration: true },
    ]);
    expect(top).toEqual({ positive: 3, negative: 1, rate: 0.75 });
    expect(exploration).toEqual({ positive: 1, negative: 1, rate: 0.5 });
  });

  it("is null with no signal, and ignores unknown kinds", () => {
    const { top, exploration } = feedbackRates([
      { kind: "weird", exploration: false },
    ]);
    expect(top.rate).toBeNull();
    expect(exploration).toEqual({ positive: 0, negative: 0, rate: null });
  });
});

describe("topWeightDrift", () => {
  const entry = (weight: number, initial: number) => ({
    weight,
    initial,
    source: "learned" as const,
    sightings: 1,
  });

  it("ranks by |weight - initial| across profiles, largest mover per keyword", () => {
    const out = topWeightDrift(
      [
        { python: entry(2.0, 1.0), kafka: entry(0.2, 0) },
        { python: entry(-0.5, 1.0), rust: entry(0, 0) },
      ],
      2,
    );
    expect(out.map((e) => e.id)).toEqual(["python", "kafka"]);
    expect(out[0]).toEqual({ id: "python", weight: -0.5, initial: 1.0, drift: 1.5 });
  });

  it("excludes undrifted keywords and respects n", () => {
    const out = topWeightDrift([{ a: entry(1, 1), b: entry(2, 0), c: entry(1.5, 0) }], 1);
    expect(out).toEqual([{ id: "b", weight: 2, initial: 0, drift: 2 }]);
  });
});
