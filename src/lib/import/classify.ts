import {
  isBenefitsLike,
  isCardBill,
  isLoanDeposit,
  isPensionLike,
  isRefundLike,
  isSalaryLike,
  isTaxRefund,
  isTransferLike,
} from "@/lib/import/patterns";
import type {
  ImportKind,
  ImportKindChoice,
  ImportReason,
  KindSource,
  SignConvention,
} from "@/lib/import/types";

export interface ClassifyInput {
  description: string;
  /** Signed after the file's sign convention: negative = money left the account. */
  rawSigned: number;
  /** Absolute amount. */
  amount: number;
  explicitKind: ImportKindChoice;
  /** Set when debit/credit columns exist and only one of them has a value on this row. */
  debitCreditKind?: "expense" | "income" | null;
  accountKind: "bank" | "card" | "other";
  signConvention: SignConvention;
  /** A card account whose charges explain a bank card bill in this period. */
  hasCardCoverage: boolean;
  /** A matching row on the other side of an internal transfer. */
  hasTransferPair: boolean;
  /** A kind a matching rule assigned. */
  ruleKind?: ImportKind | null;
  /** The file's amounts are all positive and it has no type or debit/credit column. */
  allPositive?: boolean;
}

export interface ClassifyResult {
  kind: ImportKind;
  refund: boolean;
  kindSource: KindSource;
  confidence: number;
  needsReview: boolean;
  transferSuggested: boolean;
  reasons: ImportReason[];
}

const result = (
  partial: Partial<ClassifyResult> & Pick<ClassifyResult, "kind" | "kindSource">,
): ClassifyResult => ({
  refund: false,
  confidence: 0.9,
  needsReview: false,
  transferSuggested: false,
  reasons: [],
  ...partial,
  kind: partial.kind,
  kindSource: partial.kindSource,
});

/**
 * Direction of one row, in the priority order of the plan: user, rule, type column,
 * debit/credit columns, sign and account kind, then banking patterns, then a default that asks
 * for review when the file gives no evidence. A refund stays an expense with a positive amount.
 */
export function classifyKind(input: ClassifyInput): ClassifyResult {
  const {
    description,
    rawSigned,
    explicitKind,
    debitCreditKind,
    accountKind,
    hasCardCoverage,
    hasTransferPair,
    ruleKind,
    allPositive,
  } = input;

  if (explicitKind === "refund") {
    return result({
      kind: "expense",
      refund: true,
      kindSource: "user",
      confidence: 1,
      reasons: [{ code: "refundSuggested", detail: "user" }],
    });
  }
  if (explicitKind === "expense" || explicitKind === "income" || explicitKind === "transfer") {
    return result({ kind: explicitKind, kindSource: "user", confidence: 1 });
  }
  if (ruleKind) return result({ kind: ruleKind, kindSource: "rule", confidence: 0.97 });
  if (debitCreditKind) {
    // A card credit column is a refund, not income: the card is still spending, just reversed.
    if (accountKind === "card" && debitCreditKind === "income") {
      return result({
        kind: "expense",
        refund: true,
        kindSource: "column",
        confidence: 0.95,
        reasons: [{ code: "debitCredit" }],
      });
    }
    return result({
      kind: debitCreditKind,
      kindSource: "column",
      confidence: 0.95,
      reasons: [{ code: "debitCredit" }],
    });
  }

  const positive = rawSigned > 0;
  const negative = rawSigned < 0;

  if (accountKind === "card") {
    const refundWord = isRefundLike(description);
    if (input.signConvention === "cardPositive") {
      // Charges are positive; a negative row (or a positive row the description calls a refund)
      // is money coming back and must stay an expense with a positive signed amount.
      if (negative || (positive && refundWord)) {
        return result({
          kind: "expense",
          refund: true,
          kindSource: "sign",
          confidence: 0.9,
          reasons: [{ code: "refundSuggested" }],
        });
      }
      return result({ kind: "expense", kindSource: "sign", confidence: 0.97 });
    }
    if (input.signConvention === "cardNegative") {
      // Charges are negative. A positive row is a credit/refund; a negative refund-worded row in a
      // mixed statement is also a refund rather than a charge.
      if (positive || (negative && refundWord)) {
        return result({
          kind: "expense",
          refund: true,
          kindSource: "sign",
          confidence: 0.9,
          reasons: [{ code: "refundSuggested" }],
        });
      }
      return result({ kind: "expense", kindSource: "sign", confidence: 0.95 });
    }
    if (negative || (positive && refundWord)) {
      return result({
        kind: "expense",
        refund: true,
        kindSource: "pattern",
        confidence: 0.85,
        reasons: [{ code: "refundSuggested" }],
      });
    }
    return result({ kind: "expense", kindSource: "sign", confidence: positive ? 0.9 : 0.8 });
  }

  // Bank (and any other account): a positive amount can still be a refund or a transfer.
  if (positive) {
    if (isTaxRefund(description)) {
      return result({ kind: "income", kindSource: "pattern", confidence: 0.95 });
    }
    if (isSalaryLike(description) || isBenefitsLike(description) || isPensionLike(description)) {
      return result({ kind: "income", kindSource: "pattern", confidence: 0.95 });
    }
    if (isLoanDeposit(description)) {
      return result({
        kind: "transfer",
        kindSource: "pattern",
        confidence: 0.9,
        reasons: [{ code: "loanTransfer" }],
      });
    }
    if (isCardBill(description)) {
      if (hasCardCoverage) {
        return result({
          kind: "transfer",
          kindSource: "pattern",
          confidence: 0.9,
          reasons: [{ code: "cardBillTransfer" }],
        });
      }
      return result({
        kind: "expense",
        kindSource: "pattern",
        confidence: 0.55,
        needsReview: true,
        transferSuggested: true,
        reasons: [{ code: "cardBillSuggested" }],
      });
    }
    if (isRefundLike(description)) {
      return result({
        kind: "expense",
        refund: true,
        kindSource: "pattern",
        confidence: 0.85,
        reasons: [{ code: "refundSuggested" }],
      });
    }
    if (isTransferLike(description)) {
      if (hasTransferPair) {
        return result({
          kind: "transfer",
          kindSource: "pattern",
          confidence: 0.9,
          reasons: [{ code: "transferSuggested" }],
        });
      }
      return result({
        kind: "expense",
        refund: true,
        kindSource: "pattern",
        confidence: 0.5,
        needsReview: true,
        transferSuggested: true,
        reasons: [{ code: "transferSuggested" }],
      });
    }
    if (allPositive && input.signConvention === "unknown") {
      return result({
        kind: "expense",
        kindSource: "default",
        confidence: 0.35,
        needsReview: true,
        reasons: [{ code: "signAmbiguous" }],
      });
    }
    return result({ kind: "income", kindSource: "sign", confidence: 0.8 });
  }

  if (negative) {
    if (isCardBill(description)) {
      if (hasCardCoverage) {
        return result({
          kind: "transfer",
          kindSource: "pattern",
          confidence: 0.9,
          reasons: [{ code: "cardBillTransfer" }],
        });
      }
      return result({
        kind: "expense",
        kindSource: "pattern",
        confidence: 0.6,
        needsReview: true,
        transferSuggested: true,
        reasons: [{ code: "cardBillSuggested" }],
      });
    }
    if (isTransferLike(description)) {
      if (hasTransferPair) {
        return result({
          kind: "transfer",
          kindSource: "pattern",
          confidence: 0.9,
          reasons: [{ code: "transferSuggested" }],
        });
      }
      return result({
        kind: "expense",
        kindSource: "pattern",
        confidence: 0.55,
        needsReview: true,
        transferSuggested: true,
        reasons: [{ code: "transferSuggested" }],
      });
    }
    return result({ kind: "expense", kindSource: "sign", confidence: 0.95 });
  }

  return result({
    kind: "expense",
    kindSource: "default",
    confidence: 0,
    needsReview: true,
    reasons: [{ code: "signAmbiguous" }],
  });
}
