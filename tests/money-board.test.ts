import { describe, expect, it } from "vitest";
import { boardLots, houseCount } from "@/lib/money-board";

describe("boardLots", () => {
  it("places eight lots on the ring and leaves the centre free", () => {
    const lots = boardLots();
    expect(lots).toHaveLength(8);
    expect(new Set(lots.map((l) => `${l.gx},${l.gy}`)).size).toBe(8);
    expect(lots.some((l) => l.gx === 0 && l.gy === 0)).toBe(false);
    for (const l of lots) expect(Math.max(Math.abs(l.gx), Math.abs(l.gy))).toBe(1);
  });

  it("mirrors the board for right-to-left without changing which lots exist", () => {
    const ltr = boardLots(false);
    const rtl = boardLots(true);
    expect(rtl.map((l) => l.id)).toEqual(ltr.map((l) => l.id));
    for (const [i, l] of ltr.entries()) expect(rtl[i]).toMatchObject({ gx: l.gy, gy: l.gx });
  });
});

describe("houseCount", () => {
  it("builds nothing on an empty or negative lot", () => {
    expect(houseCount(0)).toBe(0);
    expect(houseCount(-500)).toBe(0);
    expect(houseCount(Number.NaN)).toBe(0);
  });

  it("adds a house per order of magnitude, capped at four", () => {
    expect(houseCount(1)).toBe(1);
    expect(houseCount(9_999)).toBe(1);
    expect(houseCount(10_000)).toBe(2);
    expect(houseCount(99_999)).toBe(2);
    expect(houseCount(100_000)).toBe(3);
    expect(houseCount(1_000_000)).toBe(4);
    expect(houseCount(50_000_000)).toBe(4);
  });
});
