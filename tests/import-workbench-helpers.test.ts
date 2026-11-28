import { describe, expect, it } from "vitest";
import { detectBalance, guessImportMapping } from "@/lib/import/detect";
import {
  clearDefaultAccountStamp,
  statementBalanceAccount,
  tableToDrafts,
} from "@/lib/import/draft";

describe("import workbench account hints", () => {
  it("clears a server-stamped default but keeps a per-row choice when the selector changes", () => {
    const table = [
      ["01/02/2024", "Shop", "-10"],
      ["02/02/2024", "Refund", "5"],
    ];
    const mapping = guessImportMapping(["date", "description", "amount"]);
    const { drafts } = tableToDrafts(table, mapping, { defaultAccountId: 7 });
    drafts[1].accountId = 8;
    const cleared = clearDefaultAccountStamp(drafts, 7);
    expect(cleared.map((row) => row.accountId)).toEqual([null, 8]);
    // The selector changed to 9: the defaulted row follows it, the explicit row does not.
    expect(cleared.map((row) => row.accountId ?? 9)).toEqual([9, 8]);
  });

  it("finds the statement balance account from the balance row's sheet index", () => {
    const table = [
      ["date", "description", "amount", "balance"],
      ["01/02/2024", "Shop", "-10", "120"],
      ["02/02/2024", "Refund", "5", "125"],
    ];
    const mapping = guessImportMapping(table[0]);
    expect(mapping).toMatchObject({ date: 0, description: 1, amount: 2, balance: 3 });
    const headerRow = 0;
    const body = table.slice(headerRow + 1);
    const balance = detectBalance(body, mapping, "dmy");
    expect(balance).toMatchObject({ value: 125, rowIndex: 1 });

    const { drafts } = tableToDrafts(body, mapping, { rowOffset: headerRow + 1 });
    expect(drafts.map((row) => row.rowIndex)).toEqual([2, 3]);
    const normalized = drafts.map((row, index) => ({
      rowIndex: row.rowIndex,
      accountId: index === 0 ? 8 : 7,
    }));
    // The latest balance sits on the second row, owned by account 7, not the first group.
    expect(statementBalanceAccount(balance, headerRow, normalized, 9)).toBe(7);
  });

  it("does not attach a balance when no row carries it", () => {
    expect(statementBalanceAccount(null, 0, [], 9)).toBeNull();
  });
});
