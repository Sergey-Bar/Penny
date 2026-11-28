import "server-only";

import { getAccount } from "@/server/db/queries/accounts";
import { getAllCategories } from "@/server/db/queries/categories";
import { storedImportCandidates } from "@/server/db/queries/imports";
import {
  findRepeated,
  matchStored,
  type DedupeRow,
  type StoredCandidate,
} from "@/lib/import/dedupe";
import { isFatal, validateNormalizedRow } from "@/lib/import/validate";
import { ruleKindSigned } from "@/lib/import/rule-kind";
import type { ImportReason, ImportSummary, NormalizedRow, PreviewRow } from "@/lib/import/types";
import { categorizeImportRows, importRuleMatches } from "@/server/lib/import/categorize";

export interface PreviewResult {
  rows: PreviewRow[];
  summary: ImportSummary;
}

const AUTO_REVIEW_CONFIDENCE = 0.7;
const REVIEW_CODES = new Set([
  "signAmbiguous",
  "kindAmbiguous",
  "cardBillSuggested",
  "transferSuggested",
  "refundSuggested",
]);

function needsReview(row: NormalizedRow, categoryId: number | null): boolean {
  if (row.reasons.some((r) => REVIEW_CODES.has(r.code))) return true;
  if (row.kind !== "transfer" && categoryId == null) return true;
  return row.confidence < AUTO_REVIEW_CONFIDENCE;
}

const round = (n: number) => Math.round(n * 100) / 100;

function emptySummary(): ImportSummary {
  return {
    ready: 0,
    duplicates: 0,
    possibleDuplicates: 0,
    errors: 0,
    skipped: 0,
    needsReview: 0,
    autoCategorized: 0,
    expenses: 0,
    income: 0,
    transfers: 0,
    net: 0,
    byAccount: [],
  };
}

/** Dry run: validates, dedupes and categorizes every row without writing anything. */
export function previewImport(
  workspaceId: number,
  accountId: number | null,
  rows: readonly NormalizedRow[],
  options: { members?: readonly string[] } = {},
): PreviewResult {
  const account = accountId == null ? null : getAccount(workspaceId, accountId);
  if (!account) {
    const summary = emptySummary();
    summary.errors = rows.length;
    return {
      rows: rows.map((row) => ({
        rowIndex: row.rowIndex,
        status: "error",
        code: "accountMissing",
        kind: row.kind,
        kindSource: row.kindSource,
        categoryId: null,
        categorySource: null,
        confidence: 0,
        reasons: [{ code: "accountMissing", field: "account" }],
      })),
      summary,
    };
  }

  // Preview must apply the same rule-kind overrides as save, otherwise a saved row can have a
  // different kind (and therefore category) than the grid promised.
  const effectiveRows = rows.map((row) => ({ ...row }));
  const ruleMatches = importRuleMatches(
    workspaceId,
    effectiveRows.map((row) => ({
      description: row.description,
      signedAmount: row.signedAmount,
      accountId: account.id,
    })),
  );
  effectiveRows.forEach((row, index) => {
    const rule = ruleMatches.get(index);
    if (!rule?.kind || row.kindSource === "user") return;
    row.kind = rule.kind;
    row.kindSource = "rule";
    row.signedAmount = ruleKindSigned(row, rule.kind);
  });
  const rowsToUse = effectiveRows;

  const allCategories = getAllCategories(workspaceId);
  const categories = new Map(allCategories.map((c) => [c.id, c.kind] as const));
  const validation = rowsToUse.map((row) =>
    validateNormalizedRow(row, {
      memberIds: options.members,
      categoryKind: (id) => categories.get(id) ?? null,
      accountExists: (id) => getAccount(workspaceId, id) != null,
    }),
  );

  const dedupeRows: DedupeRow[] = rowsToUse.map((row) => ({
    accountId: account.id,
    date: row.date,
    description: row.description,
    signedAmount: row.signedAmount,
    identifier: row.identifier,
    installmentNumber: row.installmentNumber,
    installmentTotal: row.installmentTotal,
  }));
  const repeated = findRepeated(dedupeRows);
  const dates = rowsToUse.map((r) => r.date).sort((a, b) => a.localeCompare(b));
  const stored: StoredCandidate[] = dates.length
    ? (storedImportCandidates(
        workspaceId,
        account.id,
        account.number,
        dates[0],
        dates[dates.length - 1],
      ) as StoredCandidate[])
    : [];
  const matches = matchStored(dedupeRows, stored);

  const decisions = categorizeImportRows(
    workspaceId,
    rowsToUse.map((row, index) => ({
      rowIndex: index,
      accountId: account.id,
      description: row.description,
      kind: row.kind,
      refund: row.refund,
      signedAmount: row.signedAmount,
      categoryId: row.categoryId,
    })),
    { ruleMatches },
  );

  const previewRows: PreviewRow[] = rowsToUse.map((row, index) => {
    const reasons = validation[index];
    const extra: ImportReason[] = [...reasons];
    if (repeated[index]) extra.push({ code: "repeated" });
    const match = matches[index];
    if (match.status !== "new") extra.push({ code: match.status });
    const fatal = isFatal(reasons);
    let status: PreviewRow["status"] = "valid";
    if (fatal) status = "error";
    else if (match.status === "duplicate") status = "duplicate";
    else if (match.status === "possibleDuplicate") status = "possibleDuplicate";
    const decision = decisions.get(index);
    const categoryId = fatal || row.kind === "transfer" ? null : (decision?.categoryId ?? null);
    const fatalCode = fatal ? (reasons.find((r) => isFatal([r]))?.code ?? null) : null;
    return {
      rowIndex: row.rowIndex,
      status,
      code: fatalCode ?? (match.status !== "new" ? match.status : null),
      kind: row.kind,
      kindSource: row.kindSource,
      categoryId,
      categorySource: categoryId != null ? (decision?.source ?? "none") : "none",
      confidence: decision?.confidence ?? row.confidence,
      reasons: extra,
    };
  });

  const included = previewRows
    .map((row, index) => ({ row, source: rowsToUse[index] }))
    .filter(({ row }) => row.status === "valid" || row.status === "possibleDuplicate");

  let expenses = 0;
  let income = 0;
  let transfers = 0;
  const byAccount = new Map<number, { count: number; net: number }>();
  for (const { row, source } of included) {
    if (row.status !== "valid") continue;
    if (row.kind === "expense") expenses += source.refund ? -source.amount : source.amount;
    else if (row.kind === "income") income += source.amount;
    else transfers += source.amount;
    const entry = byAccount.get(account.id) ?? { count: 0, net: 0 };
    entry.count += 1;
    entry.net += source.signedAmount;
    byAccount.set(account.id, entry);
  }

  return {
    rows: previewRows,
    summary: {
      ready: included.filter(({ row }) => row.status === "valid").length,
      duplicates: previewRows.filter((r) => r.status === "duplicate").length,
      possibleDuplicates: previewRows.filter((r) => r.status === "possibleDuplicate").length,
      errors: previewRows.filter((r) => r.status === "error").length,
      skipped: 0,
      needsReview: included.filter(
        ({ row, source }) => row.status === "valid" && needsReview(source, row.categoryId),
      ).length,
      autoCategorized: included.filter(({ row }) => row.categoryId != null).length,
      expenses: round(expenses),
      income: round(income),
      transfers: round(transfers),
      net: round(income - expenses),
      byAccount: [...byAccount.entries()].map(([id, v]) => ({
        accountId: id,
        count: v.count,
        net: round(v.net),
      })),
    },
  };
}
