import { describe, expect, it } from "vitest";
import { normalizeImportRow, parseImportDateRobust } from "@/lib/import/normalize";
import type { ImportDraftRow } from "@/lib/import/types";
import type { NormalizeContext as Context } from "@/lib/import/normalize";

const draft = (overrides: Partial<ImportDraftRow> = {}): ImportDraftRow => ({
  rowIndex: 1,
  include: true,
  date: "01/02/2024",
  processedDate: null,
  description: "שופרסל",
  amount: "-84.90",
  kind: "auto",
  accountId: 1,
  accountRaw: "",
  categoryId: null,
  categoryName: null,
  categoryRaw: null,
  tags: [],
  owner: null,
  businessSharePct: 0,
  memo: null,
  originalAmount: null,
  originalCurrency: null,
  installmentNumber: null,
  installmentTotal: null,
  identifier: null,
  balance: null,
  sourceRef: "test#1",
  ...overrides,
});

const ctx = (overrides: Partial<Context> = {}): Context => ({
  dateOrder: "dmy",
  signConvention: "bankSigned",
  accountKind: "bank",
  accountId: 1,
  accountCurrency: "ILS",
  today: "2026-11-26",
  ...overrides,
});

describe("parseImportDateRobust", () => {
  it.each([
    ["2024-03-05", "2024-03-05"],
    ["05/03/2024", "2024-03-05"],
    ["5.3.24", "2024-03-05"],
    ["05-03-2024 14:22", "2024-03-05"],
    ["05-Mar-2024", "2024-03-05"],
    ["5 מרץ 2024", "2024-03-05"],
    ["45292", "2024-01-01"],
    ["אתמול", "2026-11-25"],
  ])("%s -> %s", (raw, iso) => {
    expect(parseImportDateRobust(raw, { today: "2026-11-26" })).toBe(iso);
  });

  it("supports the 1904 workbook epoch", () => {
    expect(parseImportDateRobust("0", { serial1904: true })).toBe("1904-01-01");
    expect(parseImportDateRobust("1", { serial1904: true })).toBe("1904-01-02");
  });

  it("returns null for junk", () => {
    for (const raw of ["", "not a date", "32/13/2024", "1234"]) {
      expect(parseImportDateRobust(raw, { today: "2026-11-26" })).toBeNull();
    }
  });
});

describe("normalizeImportRow", () => {
  it("turns a bank debit into a negative expense", () => {
    const { row } = normalizeImportRow(draft(), ctx());
    expect(row).toMatchObject({
      date: "2024-02-01",
      amount: 84.9,
      kind: "expense",
      signedAmount: -84.9,
      refund: false,
      kindSource: "sign",
    });
  });

  it("treats a positive card amount as an expense and a refund as positive expense", () => {
    const charge = normalizeImportRow(
      draft({ description: "קפה", amount: "12.50" }),
      ctx({ accountKind: "card", signConvention: "cardPositive" }),
    ).row;
    expect(charge).toMatchObject({ kind: "expense", signedAmount: -12.5, refund: false });

    const refund = normalizeImportRow(
      draft({ description: "זיכוי בית עסק", amount: "20" }),
      ctx({ accountKind: "card", signConvention: "cardPositive" }),
    ).row;
    expect(refund).toMatchObject({ kind: "expense", refund: true, signedAmount: 20 });
  });

  it("prefers debit/credit columns over a signed amount", () => {
    const debit = normalizeImportRow(draft({ amount: "999" }), ctx(), {
      debit: "100",
      credit: "",
    }).row;
    expect(debit).toMatchObject({ kind: "expense", amount: 100, signedAmount: -100 });
    const credit = normalizeImportRow(draft({ amount: "999" }), ctx(), {
      debit: "",
      credit: "250",
    }).row;
    expect(credit).toMatchObject({ kind: "income", amount: 250, signedAmount: 250 });
  });

  it("honours an explicit kind from the user", () => {
    const row = normalizeImportRow(draft({ kind: "income", amount: "300" }), ctx()).row;
    expect(row).toMatchObject({ kind: "income", signedAmount: 300, kindSource: "user" });
  });

  it("keeps FX originals and flags a missing currency", () => {
    const row = normalizeImportRow(
      draft({ description: "AMAZON", amount: "-100", originalAmount: "25" }),
      ctx(),
    ).row;
    expect(row).toMatchObject({ amount: 100, originalAmount: 25, originalCurrency: "ILS" });
    expect(row?.reasons.map((r) => r.code)).toContain("currencyMissing");
  });

  it("records installments and balance", () => {
    const row = normalizeImportRow(
      draft({ installmentNumber: 2, installmentTotal: 6, balance: "1,234.50" }),
      ctx(),
    ).row;
    expect(row).toMatchObject({ installmentNumber: 2, installmentTotal: 6, balance: 1234.5 });
    expect(row?.reasons.map((r) => r.code)).toContain("installments");
  });

  it("falls back to the identifier when the description is empty", () => {
    const row = normalizeImportRow(draft({ description: "  ", identifier: "A-1" }), ctx()).row;
    expect(row?.description).toBe("A-1");
    expect(row?.reasons.map((r) => r.code)).toContain("descriptionMissing");
  });

  it("blocks a row with no date or a zero amount", () => {
    expect(normalizeImportRow(draft({ date: "" }), ctx()).row).toBeNull();
    expect(normalizeImportRow(draft({ date: "bad" }), ctx()).row).toBeNull();
    expect(normalizeImportRow(draft({ amount: "0" }), ctx()).row).toBeNull();
    expect(normalizeImportRow(draft({ amount: "" }), ctx()).row).toBeNull();
  });
});
