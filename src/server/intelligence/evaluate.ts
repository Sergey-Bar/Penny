import "server-only";

import { categorizeRow } from "@/lib/import/categorize";
import { dictionaryCategoryKey } from "@/lib/merchant-dictionary";
import type { ImportCategory } from "@/lib/import/types";

export interface LabeledCategoryRow {
  description: string;
  kind: "expense" | "income";
  expected: string;
}

export interface CategoryScore {
  total: number;
  correct: number;
  accuracy: number;
  dictionaryTotal: number;
  dictionaryCorrect: number;
  dictionaryAccuracy: number;
  perSource: Record<string, { total: number; correct: number; accuracy: number }>;
}

export function scoreCategories(
  rows: readonly LabeledCategoryRow[],
  categories: readonly ImportCategory[],
): CategoryScore {
  let correct = 0;
  let dictionaryTotal = 0;
  let dictionaryCorrect = 0;
  const perSource = new Map<string, { total: number; correct: number }>();

  for (const row of rows) {
    const decision = categorizeRow(
      { description: row.description, kind: row.kind, refund: false },
      { categories },
    );
    const category = categories.find((candidate) => candidate.id === decision.categoryId);
    const hit = category?.name === row.expected || category?.key === row.expected;
    if (hit) correct++;
    const source = perSource.get(decision.source) ?? { total: 0, correct: 0 };
    source.total++;
    if (hit) source.correct++;
    perSource.set(decision.source, source);

    if (dictionaryCategoryKey(row.description, row.kind) != null) {
      dictionaryTotal++;
      if (hit) dictionaryCorrect++;
    }
  }

  return {
    total: rows.length,
    correct,
    accuracy: rows.length === 0 ? 0 : correct / rows.length,
    dictionaryTotal,
    dictionaryCorrect,
    dictionaryAccuracy: dictionaryTotal === 0 ? 0 : dictionaryCorrect / dictionaryTotal,
    perSource: Object.fromEntries(
      [...perSource].map(([source, value]) => [
        source,
        { ...value, accuracy: value.total === 0 ? 0 : value.correct / value.total },
      ]),
    ),
  };
}

export function precisionRecall(
  expected: ReadonlySet<string>,
  actual: ReadonlySet<string>,
): { precision: number; recall: number } {
  let truePositive = 0;
  for (const key of actual) if (expected.has(key)) truePositive++;
  return {
    precision: actual.size === 0 ? 1 : truePositive / actual.size,
    recall: expected.size === 0 ? 1 : truePositive / expected.size,
  };
}

export function falsePositiveRate(
  normal: ReadonlySet<string>,
  actual: ReadonlySet<string>,
): number {
  const falsePositives = [...normal].filter((key) => actual.has(key)).length;
  return normal.size === 0 ? 0 : falsePositives / normal.size;
}
