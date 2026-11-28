import { describe, expect, it } from "vitest";
import {
  findPossibleRepeats,
  findRepeated,
  matchStored,
  scoreMatch,
  type DedupeRow,
  type StoredCandidate,
} from "@/lib/import/dedupe";

const row = (overrides: Partial<DedupeRow> = {}): DedupeRow => ({
  accountId: 1,
  date: "2024-03-05",
  description: "שופרסל דיל תל אביב",
  signedAmount: -84.9,
  ...overrides,
});

const stored = (id: number, overrides: Partial<StoredCandidate> = {}): StoredCandidate => ({
  id,
  ...row(),
  ...overrides,
});

describe("scoreMatch", () => {
  it("scores an identical identifier highest", () => {
    expect(
      scoreMatch(row({ identifier: "A1" }), stored(1, { identifier: "A1" })),
    ).toBeGreaterThanOrEqual(100);
  });

  it("penalises a very different description on the same amount and day", () => {
    expect(scoreMatch(row(), stored(1, { description: "קפה" }))).toBeLessThan(30);
  });

  it("adds points for a shared token set", () => {
    expect(
      scoreMatch(row(), stored(1, { description: "שופרסל דיל תל אביב סניף" })),
    ).toBeGreaterThanOrEqual(30);
  });
});

describe("matchStored", () => {
  it("marks the same charge as a duplicate and keeps a real second coffee", () => {
    const rows = [
      row({ description: "קפה", signedAmount: -12 }),
      row({ description: "קפה", signedAmount: -12 }),
    ];
    const pool = [stored(10, { description: "קפה", signedAmount: -12 })];
    const result = matchStored(rows, pool);
    expect(result.filter((r) => r.status === "duplicate")).toHaveLength(1);
  });

  it("does not match the same amount on a different day", () => {
    const result = matchStored([row()], [stored(10, { date: "2024-03-08" })]);
    expect(result[0].status).toBe("new");
  });

  it("treats a near match as a possible duplicate, not a silent one", () => {
    const result = matchStored(
      [row({ description: "שופרסל דיל" })],
      [stored(10, { description: "שופרסל דיל תל" })],
    );
    expect(result[0].status).toBe("possibleDuplicate");
  });

  it("matches a different description when the identifier is the same", () => {
    const result = matchStored(
      [row({ description: "חיוב חדש", identifier: "X9" })],
      [stored(10, { description: "חיוב ישן", identifier: "X9" })],
    );
    expect(result[0].status).toBe("duplicate");
  });

  it("never reuses one stored row for two file rows", () => {
    const rows = [row(), row()];
    const result = matchStored(rows, [stored(10)]);
    expect(result.filter((r) => r.matchedId === 10)).toHaveLength(1);
  });

  it("ignores another account", () => {
    const result = matchStored([row()], [stored(10, { accountId: 2 })]);
    expect(result[0].status).toBe("new");
  });

  it("does not match an expense against an income of the same size", () => {
    const result = matchStored([row()], [stored(10, { signedAmount: 84.9 })]);
    expect(result[0].status).toBe("new");
  });
});

describe("in-file repeats", () => {
  it("flags a repeated row without dropping it", () => {
    expect(findRepeated([row(), row(), row({ description: "אחר" })])).toEqual([false, true, false]);
  });

  it("finds a possible repeat for a review chip", () => {
    expect(findPossibleRepeats([row(), row({ description: "שופרסל דיל תל אביב סניף" })])).toEqual([
      false,
      true,
    ]);
  });
});

describe("dedupe edge branches", () => {
  it("adds a day-adjacent and installment bonus", () => {
    expect(
      scoreMatch(
        row({ date: "2024-03-05", installmentNumber: 1, installmentTotal: 3 }),
        stored(1, { date: "2024-03-06", installmentNumber: 1, installmentTotal: 3 }),
      ),
    ).toBeGreaterThanOrEqual(40);
  });

  it("rejects a same-day same-amount row with an unrelated description", () => {
    const result = matchStored([row()], [stored(10, { description: "supermarket" })]);
    expect(result[0].status).toBe("new");
  });

  it("finds possible repeats only within the same account, amount and date window", () => {
    expect(findPossibleRepeats([row(), row({ accountId: 2 })])).toEqual([false, false]);
    expect(findPossibleRepeats([row(), row({ signedAmount: -1 })])).toEqual([false, false]);
    expect(findPossibleRepeats([row(), row({ date: "2024-03-09" })])).toEqual([false, false]);
    expect(findPossibleRepeats([row(), row({ description: "unrelated" })])).toEqual([false, false]);
  });

  it("does not treat stop-word-only descriptions as similar", () => {
    expect(
      scoreMatch(row({ description: "the and" }), stored(1, { description: "של את" })),
    ).toBeLessThan(30);
  });
});
