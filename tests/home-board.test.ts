import { describe, expect, it } from "vitest";
import { HOME_HIDDEN_BY_DEFAULT, HOME_TILES, hiddenHomeTiles } from "@/lib/home-board";

describe("hiddenHomeTiles", () => {
  it("starts a household that has never customized with the short Home", () => {
    for (const saved of [null, undefined, {}, { hidden: "all" }])
      expect(hiddenHomeTiles(saved)).toEqual([...HOME_HIDDEN_BY_DEFAULT]);
  });

  it("keeps a saved choice exactly, including showing everything", () => {
    expect(hiddenHomeTiles({ hidden: [] })).toEqual([]);
    expect(hiddenHomeTiles({ hidden: ["balance", "fire"] })).toEqual(["balance", "fire"]);
  });

  it("drops ids that no longer exist", () => {
    expect(hiddenHomeTiles({ hidden: ["fire", "retired-tile", 7] })).toEqual(["fire"]);
  });

  it("never hides the daily tiles by default", () => {
    for (const id of ["balance", "map", "budget", "latest", "cashFlow"] as const)
      expect(HOME_HIDDEN_BY_DEFAULT).not.toContain(id);
    for (const id of HOME_HIDDEN_BY_DEFAULT) expect(HOME_TILES).toContain(id);
  });
});
