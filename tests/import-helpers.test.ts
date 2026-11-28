import { describe, expect, it } from "vitest";
import {
  bodyTooLarge,
  chunkRows,
  isFatal,
  rowsTooMany,
  validateNormalizedRow,
} from "@/lib/import/validate";
import { debitCreditFor, parseKindValue, tableToDrafts } from "@/lib/import/draft";
import {
  genericPatterns,
  isGeneric,
  isGenericTransfer,
  normalizeGenericText,
} from "@/lib/import/generic";
import { applyExtracted } from "@/lib/import/extract";
import { guessImportMapping } from "@/lib/import/detect";
import { normalizeImportRow } from "@/lib/import/normalize";
import {
  feeCategoryKey,
  insuranceCategoryKey,
  isCardBill,
  isLoanDeposit,
  isLoanRepayment,
  isSalaryLike,
  isTransferLike,
  patternCategoryKey,
  subscriptionCategoryKey,
  utilityCategoryKey,
} from "@/lib/import/patterns";
import { isImportKind, type NormalizedRow } from "@/lib/import/types";

const row = (overrides: Partial<NormalizedRow> = {}): NormalizedRow => ({
  rowIndex: 1,
  date: "2024-03-05",
  processedDate: "2024-03-05",
  description: "שופרסל",
  amount: 50,
  kind: "expense",
  signedAmount: -50,
  refund: false,
  accountId: 1,
  categoryId: null,
  categorySource: "none",
  tags: [],
  owner: null,
  businessSharePct: 0,
  memo: null,
  originalAmount: 50,
  originalCurrency: "ILS",
  installmentNumber: null,
  installmentTotal: null,
  identifier: null,
  balance: null,
  kindSource: "sign",
  confidence: 0.9,
  reasons: [],
  ...overrides,
});

describe("validation", () => {
  it("accepts a valid row and rejects every field it owns", () => {
    expect(validateNormalizedRow(row(), { accountExists: () => true })).toEqual([]);

    const problems = validateNormalizedRow(
      row({
        date: "bad",
        description: "",
        amount: 0,
        categoryId: 99,
        owner: "ghost",
        businessSharePct: 120,
        memo: "x".repeat(600),
        tags: ["ok", "x".repeat(40)],
      }),
      { memberIds: ["a"], accountExists: () => false, categoryKind: () => null },
    ).map((reason) => reason.code);
    expect(new Set(problems)).toEqual(
      new Set([
        "dateInvalid",
        "descriptionMissing",
        "amountZero",
        "accountMissing",
        "categoryUnknown",
        "ownerInvalid",
        "businessRange",
        "memoTooLong",
        "tagsInvalid",
      ]),
    );
  });

  it("checks category kind and transfer rows", () => {
    expect(
      validateNormalizedRow(row({ categoryId: 1, kind: "income" }), {
        categoryKind: () => "expense",
      }).map((r) => r.code),
    ).toContain("categoryKindMismatch");
    expect(
      validateNormalizedRow(row({ categoryId: 1, kind: "transfer" }), {
        categoryKind: () => "expense",
      }).map((r) => r.code),
    ).toContain("categoryKindMismatch");
    expect(
      validateNormalizedRow(row({ categoryId: 1 }), { categoryKind: () => "expense" }).map(
        (r) => r.code,
      ),
    ).not.toContain("categoryKindMismatch");
    expect(
      validateNormalizedRow(row({ kind: "weird" as NormalizedRow["kind"] })).map((r) => r.code),
    ).toContain("kindAmbiguous");
    expect(validateNormalizedRow(row({ tags: ["a", "b"] })).length).toBe(0);
    expect(validateNormalizedRow(row({ memo: null })).length).toBe(0);
    expect(isFatal([{ code: "duplicate" }])).toBe(false);
    expect(isFatal([{ code: "amountZero" }])).toBe(true);
  });

  it("guards sizes and chunks rows", () => {
    expect(bodyTooLarge(10, 5)).toBe(true);
    expect(bodyTooLarge(5, 5)).toBe(false);
    expect(rowsTooMany(6, 5)).toBe(true);
    expect(chunkRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkRows([], 2)).toEqual([]);
  });
});

describe("drafts", () => {
  const mapping = guessImportMapping([
    "תאריך",
    "תיאור",
    "סכום",
    "חשבון",
    "קטגוריה",
    "סוג",
    "מס' תשלומים",
    "תשלום נוכחי",
    "אסמכתא",
    "מטבע",
    "סכום עסקה",
  ]);

  it("builds a complete draft and reads the type column", () => {
    const { drafts } = tableToDrafts(
      [
        [
          "01/02/2024",
          "שופרסל",
          "-84.90",
          "לאומי 123",
          "Groceries",
          "הוצאה",
          "6",
          "2",
          "A1",
          "USD",
          "25",
        ],
      ],
      mapping,
    );
    expect(drafts[0]).toMatchObject({
      kind: "expense",
      accountRaw: "לאומי 123",
      categoryRaw: "Groceries",
      installmentTotal: 6,
      installmentNumber: 2,
      identifier: "A1",
      originalCurrency: "USD",
      originalAmount: "25",
    });
    expect(parseKindValue("income")).toBe("income");
    expect(parseKindValue("זיכוי")).toBe("refund");
    expect(parseKindValue("")).toBeNull();
    expect(parseKindValue("nonsense")).toBeNull();
    expect(debitCreditFor([["", "1"]], 1, { ...mapping, debit: 0, credit: 1 })).toEqual({
      debit: "",
      credit: "1",
    });
    expect(debitCreditFor([], 1, mapping)).toEqual({});
  });

  it("normalizes a mapped amount before considering debit or credit columns", () => {
    const table = [["01/02/2024", "Purchase", "-12", "90", ""]];
    const both = { ...mapping, debit: 3, credit: 4 };
    const context = {
      accountId: 1,
      accountKind: "bank",
      accountCurrency: "ILS",
      dateOrder: "dmy",
      signConvention: "bankSigned",
    } as const;
    const normalized = (m: typeof mapping) =>
      normalizeImportRow(tableToDrafts(table, m).drafts[0], context).row;
    expect(normalized(both)).toMatchObject({ signedAmount: -12 });
    expect(normalized({ ...both, amount: null })).toMatchObject({ signedAmount: -90 });
  });

  it("skips summary and empty rows and enforces the row cap", () => {
    const { drafts, skipped } = tableToDrafts(
      [
        ["01/02/2024", "א", "-1", "", "", "", "", "", "", "", ""],
        ['סה"כ', "", "", "", "", "", "", "", "", "", ""],
        ["", "", "", "", "", "", "", "", "", "", ""],
        ["02/02/2024", "ב", "-2", "", "", "", "", "", "", "", ""],
      ],
      mapping,
      { maxRows: 1 },
    );
    expect(drafts).toHaveLength(1);
    expect(skipped).toBeGreaterThanOrEqual(2);
  });
});

describe("generic descriptions", () => {
  it("normalizes and recognises generic text, respecting specific brands", () => {
    expect(normalizeGenericText("  העברה   לחשבון  ")).toBe("העברה לחשבון");
    expect(isGeneric("העברה")).toBe(true);
    expect(isGeneric("העברה וולט")).toBe(false);
    expect(isGeneric("העברה לספק מיוחד", ["ספק מיוחד"])).toBe(true);
    expect(isGeneric("")).toBe(true);
    expect(genericPatterns(["ספק"])).toContain("ספק");
    expect(isGenericTransfer("העברה בין חשבונות")).toBe(true);
    expect(isGenericTransfer("שופרסל")).toBe(false);
  });
});

describe("patterns", () => {
  it("classifies banking descriptions", () => {
    expect(isCardBill("חיוב כרטיס ויזה")).toBe(true);
    expect(isCardBill("שופרסל")).toBe(false);
    expect(isLoanDeposit("הלוואה מהבנק")).toBe(true);
    expect(isLoanDeposit("החזר הלוואה")).toBe(false);
    expect(isLoanRepayment("החזר הלוואה")).toBe(true);
    expect(isSalaryLike("משכורת")).toBe(true);
    expect(isTransferLike("העברה לחשבון")).toBe(true);
    expect(insuranceCategoryKey("הראל ביטוח רכב")).toBe("car_insurance");
    expect(insuranceCategoryKey("הראל ביטוח חיים")).toBe("life_insurance");
    expect(insuranceCategoryKey("הראל ביטוח בריאות")).toBe("health_insurance");
    expect(insuranceCategoryKey("הראל ביטוח דירה")).toBe("insurance");
    expect(insuranceCategoryKey("שופרסל")).toBeNull();
    expect(feeCategoryKey("עמלת ניהול חשבון")).toBe("bank_fees");
    expect(feeCategoryKey("ריבית חובה")).toBe("interest");
    expect(feeCategoryKey("שופרסל")).toBeNull();
    expect(utilityCategoryKey("חברת החשמל")).toBe("electricity");
    expect(utilityCategoryKey("ועד בית")).toBe("building_committee");
    expect(utilityCategoryKey("שופרסל")).toBeNull();
    expect(subscriptionCategoryKey("NETFLIX")).toBe("streaming");
    expect(subscriptionCategoryKey("iCloud")).toBe("subscriptions");
    expect(subscriptionCategoryKey("שופרסל")).toBeNull();
    expect(patternCategoryKey("משכורת", "income")).toBe("salary");
    expect(patternCategoryKey("החזר מס", "income")).toBe("tax_refunds");
    expect(patternCategoryKey("פנסיה", "income")).toBe("pension");
    expect(patternCategoryKey("עמלת ניהול", "expense")).toBe("bank_fees");
    expect(patternCategoryKey("שופרסל", "expense")).toBeNull();
  });
});

describe("extract", () => {
  it("applies named groups and ignores a missing match", () => {
    const target: { date?: string; amount?: string; description?: string; memo?: string } = {};
    applyExtracted(target, { date: "2024-03-05", amount: "10", description: "x", memo: "m" });
    expect(target).toEqual({ date: "2024-03-05", amount: "10", description: "x", memo: "m" });
    applyExtracted(target, null);
    expect(target.amount).toBe("10");
  });
});

describe("types", () => {
  it("checks kinds at runtime", () => {
    expect(isImportKind("expense")).toBe(true);
    expect(isImportKind("transfer")).toBe(true);
    expect(isImportKind("refund")).toBe(false);
  });
});
