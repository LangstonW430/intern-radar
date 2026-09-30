import { describe, expect, it } from "vitest";
import { parseCsv, seededShuffle, toCsv } from "./csv";

describe("csv round trip", () => {
  it("quotes commas, quotes, and newlines", () => {
    const rows = [
      { a: "plain", b: 'has "quotes"', c: "has, comma" },
      { a: "line\nbreak", b: "", c: "x" },
    ];
    const csv = toCsv(rows, ["a", "b", "c"]);
    expect(parseCsv(csv)).toEqual(rows);
  });

  it("parses hand-edited files with missing trailing fields", () => {
    const parsed = parseCsv("a,b,c\r\n1,2\r\n");
    expect(parsed).toEqual([{ a: "1", b: "2", c: "" }]);
  });
});

describe("seededShuffle", () => {
  it("is deterministic for a given seed and doesn't mutate input", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const once = seededShuffle(input);
    const twice = seededShuffle(input);
    expect(once).toEqual(twice);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...once].sort()).toEqual([...input].sort());
  });

  it("differs across seeds", () => {
    expect(seededShuffle([1, 2, 3, 4, 5, 6], 1)).not.toEqual(
      seededShuffle([1, 2, 3, 4, 5, 6], 2),
    );
  });
});
