import { describe, expect, it } from "vitest";
import { categorizeRow, type CategorizeRowInput } from "@/lib/import/categorize";
import type { ImportCategory } from "@/lib/import/types";

const categories: ImportCategory[] = [
  { id: 1, name: "אוכל", kind: "expense", key: "groceries" },
  { id: 2, name: "מסעדות", kind: "expense", key: "restaurants" },
  { id: 3, name: "עמלות בנק", kind: "expense", key: "bank_fees" },
  { id: 4, name: "משכורת", kind: "income", key: "salary" },
  { id: 5, name: "החזרים", kind: "income", key: "refunds" },
  { id: 6, name: "קטגוריה שלי", kind: "expense", key: null },
  { id: 7, name: "ביטוח", kind: "expense", key: "insurance" },
  { id: 8, name: "משלוחי אוכל", kind: "expense", key: "food_delivery" },
];

const input = (overrides: Partial<CategorizeRowInput> = {}): CategorizeRowInput => ({
  description: "שופרסל דיל",
  kind: "expense",
  refund: false,
  ...overrides,
});

describe("categorizeRow", () => {
  it("lets the user's choice win over everything", () => {
    const decision = categorizeRow(
      input({ categoryId: 6, ruleCategoryId: 2, memory: { categoryId: 1, kind: "expense" } }),
      { categories },
    );
    expect(decision).toMatchObject({ categoryId: 6, source: "user", confidence: 1 });
  });

  it("follows user > rule > memory > dictionary", () => {
    expect(
      categorizeRow(input({ ruleCategoryId: 2, memory: { categoryId: 1, kind: "expense" } }), {
        categories,
      }),
    ).toMatchObject({ categoryId: 2, source: "rule" });
    expect(
      categorizeRow(input({ memory: { categoryId: 2, kind: "expense" } }), { categories }),
    ).toMatchObject({ categoryId: 2, source: "memory" });
    expect(categorizeRow(input(), { categories })).toMatchObject({
      categoryId: 1,
      source: "dictionary",
    });
  });

  it("keeps working after a category rename because the key is stable", () => {
    expect(categorizeRow(input({ description: "שופרסל" }), { categories }).categoryId).toBe(1);
  });

  it("falls back to a pattern when the dictionary has no key for the leaf", () => {
    expect(categorizeRow(input({ description: "הראל ביטוח" }), { categories })).toMatchObject({
      categoryId: 7,
      source: "pattern",
    });
  });

  it("never guesses a category for a generic description", () => {
    for (const description of ["העברה", "משיכת מזומן", "תשלום", "חיוב"]) {
      expect(categorizeRow(input({ description }), { categories })).toMatchObject({
        categoryId: null,
        source: "none",
      });
    }
  });

  it("lets a specific brand beat a generic word", () => {
    expect(categorizeRow(input({ description: "העברה וולט" }), { categories })).toMatchObject({
      categoryId: 8,
      source: "dictionary",
    });
    expect(categorizeRow(input({ description: "וולט" }), { categories })).toMatchObject({
      source: "dictionary",
    });
  });

  it("never gives a transfer a category", () => {
    expect(categorizeRow(input({ kind: "transfer" }), { categories })).toMatchObject({
      categoryId: null,
      source: "none",
    });
  });

  it("does not give a refund an income category", () => {
    expect(
      categorizeRow(
        input({
          refund: true,
          kind: "expense",
          description: "חנות לא ידועה",
          memory: { categoryId: 5, kind: "income" },
        }),
        {
          categories,
        },
      ),
    ).toMatchObject({ categoryId: null });
  });

  it("uses a category name from the file when it exists and matches the kind", () => {
    expect(
      categorizeRow(input({ description: "unknown", requestedCategoryName: "מסעדות" }), {
        categories,
      }),
    ).toMatchObject({ categoryId: 2, source: "file" });
    expect(
      categorizeRow(input({ description: "unknown", requestedCategoryName: "לא קיים" }), {
        categories,
      }).reasons.map((r) => r.code),
    ).toContain("categoryUnknown");
  });

  it("rejects a category of the wrong kind", () => {
    expect(categorizeRow(input({ categoryId: 4 }), { categories })).toMatchObject({
      categoryId: null,
      reasons: [{ code: "categoryKindMismatch", detail: "משכורת" }],
    });
  });

  it("keeps a remembered parent out of the suggestion lookups", () => {
    const parent: ImportCategory = {
      id: 9,
      name: "הוצאות",
      kind: "expense",
      key: "groceries",
    };
    const leafOnly = categories.filter((category) => category.key !== "groceries");
    const suggested = categorizeRow(input({ description: "שופרסל" }), {
      categories: leafOnly,
      memoryCategories: [...leafOnly, parent],
    });
    expect(suggested.categoryId).not.toBe(parent.id);
    const remembered = categorizeRow(
      input({ description: "unknown merchant", memory: { categoryId: 9, kind: "expense" } }),
      { categories: leafOnly, memoryCategories: [...leafOnly, parent] },
    );
    expect(remembered).toMatchObject({ categoryId: 9, source: "memory" });
  });

  it("gives income descriptions income categories", () => {
    expect(
      categorizeRow(input({ kind: "income", description: "משכורת" }), { categories }),
    ).toMatchObject({ categoryId: 4, source: "dictionary" });
  });
});
