import { describe, expect, it } from "vitest";
import { memoBaseline } from "@/lib/review-memo";

describe("memoBaseline", () => {
  it("uses the latest queued write while one is pending", () => {
    expect(memoBaseline("second", "original")).toBe("second");
  });

  it("falls back to the saved memo and then to an empty string", () => {
    expect(memoBaseline(undefined, "original")).toBe("original");
    expect(memoBaseline(undefined, null)).toBe("");
    expect(memoBaseline(undefined, undefined)).toBe("");
  });
});
