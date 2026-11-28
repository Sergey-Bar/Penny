import { parseAmount } from "@/lib/csv";
import { headerScore } from "@/lib/import/detect";
import { isPendingRow } from "@/lib/import/detect";
import {
  isImportKind,
  type ImportDraftRow,
  type ImportKind,
  type ImportKindChoice,
  type ImportMapping,
} from "@/lib/import/types";

export interface DraftBuildOptions {
  sheetName?: string;
  /** The account column may name a different account on some rows. */
  defaultAccountId?: number | null;
  /** Skip rows that look like a repeated section header. */
  skipSectionHeaders?: boolean;
  maxRows?: number;
  /** Added to the file row number (header rows above the body). */
  rowOffset?: number;
}

export interface DraftBuildResult {
  drafts: ImportDraftRow[];
  skipped: number;
  pending: number;
  total: number;
}

const KIND_WORDS: Record<string, ImportKind | "refund"> = {
  expense: "expense",
  expenses: "expense",
  spend: "expense",
  debit: "expense",
  out: "expense",
  הוצאה: "expense",
  הוצאות: "expense",
  חיוב: "expense",
  תשלום: "expense",
  income: "income",
  incomes: "income",
  credit: "income",
  deposit: "income",
  in: "income",
  הכנסה: "income",
  הכנסות: "income",
  זכות: "income",
  הפקדה: "income",
  transfer: "transfer",
  העברה: "transfer",
  refund: "refund",
  החזר: "refund",
  זיכוי: "refund",
};

/** A type cell ("הוצאה", "income", "refund") -> a kind choice, or null when unrecognised. */
export function parseKindValue(raw: string | null | undefined): ImportKindChoice | null {
  const key = (raw ?? "").trim().toLowerCase();
  if (!key) return null;
  const hit = KIND_WORDS[key];
  if (hit) return hit;
  if (isImportKind(key)) return key;
  return null;
}

const cell = (row: readonly string[], index: number | null): string =>
  index == null ? "" : (row[index] ?? "").trim();

const SUMMARY_ROW = /^(?:סה["׳']?כ|סיכום|יתרה|balance|total|sum|page|עמוד)\b/i;

/** Table rows (after the header) -> editable drafts. Pending rows are counted, not dropped silently. */
export function tableToDrafts(
  table: readonly string[][],
  mapping: ImportMapping,
  options: DraftBuildOptions = {},
): DraftBuildResult {
  const drafts: ImportDraftRow[] = [];
  let skipped = 0;
  let pending = 0;
  const maxRows = options.maxRows ?? 100_000;
  let started = false;
  table.forEach((row, index) => {
    if (!row.some((c) => c.trim() !== "")) return;
    if (!started) {
      // The caller passes the whole table; skip everything up to the detected header.
      started = true;
    }
    if (options.skipSectionHeaders !== false && headerScore(row) >= 2) {
      skipped++;
      return;
    }
    if (SUMMARY_ROW.test(row.find((c) => c.trim()) ?? "")) {
      skipped++;
      return;
    }
    if (isPendingRow(row)) {
      pending++;
      return;
    }
    const date = cell(row, mapping.date);
    const description = cell(row, mapping.description);
    const debitCell = mapping.debit == null ? null : cell(row, mapping.debit);
    const creditCell = mapping.credit == null ? null : cell(row, mapping.credit);
    const debitN = debitCell == null ? null : parseAmount(debitCell);
    const creditN = creditCell == null ? null : parseAmount(creditCell);
    const amountSource =
      mapping.amount != null
        ? cell(row, mapping.amount)
        : debitN != null && debitN !== 0
          ? debitCell!
          : creditN != null && creditN !== 0
            ? creditCell!
            : (debitCell ?? "") || (creditCell ?? "");
    if (!date && !description && !amountSource) {
      skipped++;
      return;
    }
    const kindValue = parseKindValue(cell(row, mapping.kind)) ?? "auto";
    const draft: ImportDraftRow = {
      rowIndex: index + 1 + (options.rowOffset ?? 0),
      include: true,
      date,
      processedDate: cell(row, mapping.processedDate) || null,
      description,
      amount: amountSource,
      kind: kindValue,
      accountId: options.defaultAccountId ?? null,
      accountRaw: cell(row, mapping.accountRaw),
      categoryId: null,
      categoryName: null,
      categoryRaw: cell(row, mapping.categoryRaw) || null,
      tags: [],
      owner: null,
      businessSharePct: 0,
      memo: cell(row, mapping.memo) || null,
      originalAmount: cell(row, mapping.originalAmount) || null,
      originalCurrency: cell(row, mapping.originalCurrency) || null,
      installmentNumber: numberOrNull(cell(row, mapping.installmentNumber)),
      installmentTotal: numberOrNull(cell(row, mapping.installmentTotal)),
      identifier: cell(row, mapping.identifier) || null,
      balance: cell(row, mapping.balance) || null,
      ...(mapping.amount != null || (mapping.debit == null && mapping.credit == null)
        ? {}
        : { debit: debitCell, credit: creditCell }),
      sourceRef: `${options.sheetName ?? ""}#${index + 1}`,
    };
    if (drafts.length >= maxRows) {
      skipped++;
      return;
    }
    drafts.push(draft);
  });
  return { drafts, skipped, pending, total: drafts.length + skipped + pending };
}

function numberOrNull(raw: string): number | null {
  if (!raw) return null;
  const n = parseAmount(raw);
  if (n == null) return null;
  const int = Math.trunc(n);
  return int > 0 ? int : null;
}

/** The per-row amount inputs for the normalizer when debit/credit columns are mapped. */
export function debitCreditFor(
  table: readonly string[][],
  rowIndex: number,
  mapping: ImportMapping,
): { debit?: string | null; credit?: string | null } {
  if (mapping.debit == null && mapping.credit == null) return {};
  const row = table[rowIndex - 1] ?? [];
  return {
    debit: mapping.debit == null ? undefined : cell(row, mapping.debit),
    credit: mapping.credit == null ? undefined : cell(row, mapping.credit),
  };
}
