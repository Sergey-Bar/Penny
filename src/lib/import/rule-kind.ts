import { roundCents } from "@/lib/money";
import type { ImportKind } from "@/lib/import/types";

/** Signed amount after a categorization rule overrides the row kind; the single source of truth. */
export function ruleKindSigned(
  row: { amount: number; refund: boolean; signedAmount: number },
  kind: ImportKind,
): number {
  if (kind === "expense") return roundCents(row.refund ? row.amount : -row.amount);
  if (kind === "income") return roundCents(row.amount);
  return roundCents(row.signedAmount);
}
