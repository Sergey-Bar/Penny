import { describe, expect, it } from "vitest";
import { parseCategoryResponse, parseConfidence } from "@/server/ai/providers/parse";

describe("parseCategoryResponse", () => {
  const categories = ["Food", "Transport"];

  it("reads an array surrounded by prose", () => {
    const text =
      'Here are the categories:\n[{"index":0,"categoryName":"Food","confidence":5}]\nDone.';
    expect(parseCategoryResponse(text, categories, false)).toEqual([
      { index: 0, categoryName: "Food", isNew: false, confidence: 5 },
    ]);
  });

  it("returns an empty list when there are no brackets", () => {
    expect(parseCategoryResponse("no json here", categories, false)).toEqual([]);
  });

  it("returns an empty list for malformed JSON instead of throwing", () => {
    expect(parseCategoryResponse('[{"index":0,', categories, false)).toEqual([]);
    expect(parseCategoryResponse("[] trailing", categories, false)).toEqual([
      // An empty array is still a valid JSON payload.
    ]);
  });

  it("keeps nested brackets inside a valid payload", () => {
    const text = '[{"index":1,"categoryName":"Transport [train]","confidence":4}]';
    expect(parseCategoryResponse(text, ["Transport [train]"], false)).toEqual([
      { index: 1, categoryName: "Transport [train]", isNew: false, confidence: 4 },
    ]);
  });

  it("accepts an existing category and rejects a proposal unless allowed", () => {
    const text = JSON.stringify([
      { index: 0, categoryName: "Food", confidence: 6 },
      { index: 1, categoryName: "New Category", confidence: 3 },
    ]);
    expect(parseCategoryResponse(text, categories, false)).toEqual([
      { index: 0, categoryName: "Food", isNew: false, confidence: 6 },
    ]);
    expect(parseCategoryResponse(text, categories, true)).toEqual([
      { index: 0, categoryName: "Food", isNew: false, confidence: 6 },
      { index: 1, categoryName: "New Category", isNew: true, confidence: 3 },
    ]);
  });

  it("drops an invalid confidence but keeps the mapping", () => {
    const text = JSON.stringify([
      { index: 0, categoryName: "Food", confidence: 9 },
      { index: 1, categoryName: "Transport", confidence: "not a number" },
    ]);
    expect(parseCategoryResponse(text, categories, false)).toEqual([
      { index: 0, categoryName: "Food", isNew: false, confidence: undefined },
      { index: 1, categoryName: "Transport", isNew: false, confidence: undefined },
    ]);
  });

  it("keeps the mapping when confidence is a structured value", () => {
    const text = '[{"index":0,"categoryName":"Food","confidence":{"toString":null}}]';
    expect(parseCategoryResponse(text, categories, false)).toEqual([
      { index: 0, categoryName: "Food", isNew: false, confidence: undefined },
    ]);
  });

  it("handles very long bracket-heavy text in linear time", () => {
    const text = `${"[".repeat(1_000_000)} no closer`;
    const started = performance.now();
    expect(parseCategoryResponse(text, categories, false)).toEqual([]);
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});

describe("parseConfidence", () => {
  it("rounds numeric strings and rejects out-of-range values", () => {
    expect(parseConfidence("5.4")).toBe(5);
    expect(parseConfidence(0)).toBeUndefined();
    expect(parseConfidence(8)).toBeUndefined();
    expect(parseConfidence(Number.NaN)).toBeUndefined();
    expect(parseConfidence(undefined)).toBeUndefined();
  });
});
