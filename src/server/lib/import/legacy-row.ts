import { classifyKind } from "@/lib/import/classify";
import type { NormalizedRow } from "@/lib/import/types";

export interface LegacyRowInput {
  date: string;
  description: string;
  amount: number;
}

/** Maps the legacy one-card-row shape onto the normalized row used by the v2 save path. */
export function legacyRow(
  row: LegacyRowInput,
  rowIndex: number,
  accountId: number,
  accountKind: "bank" | "card" | "other",
  source: "bank" | "card",
): NormalizedRow {
  const rawSigned = row.amount;
  const amount = Math.abs(row.amount);
  const classified = classifyKind({
    description: row.description,
    rawSigned,
    amount,
    explicitKind: "auto",
    accountKind: source === "card" ? "card" : accountKind,
    signConvention: source === "card" ? "cardNegative" : "bankSigned",
    hasCardCoverage: false,
    hasTransferPair: false,
  });
  const signedAmount =
    classified.kind === "expense"
      ? classified.refund
        ? amount
        : -amount
      : classified.kind === "income"
        ? amount
        : rawSigned;
  return {
    rowIndex,
    date: row.date,
    processedDate: row.date,
    description: row.description,
    amount,
    kind: classified.kind,
    signedAmount,
    refund: classified.refund,
    accountId,
    categoryId: null,
    categorySource: "none",
    tags: [],
    owner: null,
    businessSharePct: 0,
    memo: null,
    originalAmount: amount,
    originalCurrency: "ILS",
    installmentNumber: null,
    installmentTotal: null,
    identifier: null,
    balance: null,
    kindSource: classified.kindSource,
    confidence: classified.confidence,
    reasons: classified.reasons,
  };
}
