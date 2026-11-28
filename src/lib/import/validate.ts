import { utcDay } from "@/lib/dates";
import { IMPORT_LIMITS, type ImportReason, type NormalizedRow } from "@/lib/import/types";

export interface ValidateContext {
  memberIds?: readonly string[];
  categoryKind?: (categoryId: number) => "expense" | "income" | null;
  accountExists?: (accountId: number) => boolean;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Reasons that stop a row from being saved; everything else is a visible warning. */
const FATAL_REASONS: readonly string[] = [
  "dateMissing",
  "dateInvalid",
  "descriptionMissing",
  "descriptionTooLong",
  "amountMissing",
  "amountInvalid",
  "amountZero",
  "amountRange",
  "accountMissing",
  "categoryKindMismatch",
  "ownerInvalid",
  "businessRange",
  "memoTooLong",
  "tagsInvalid",
];

export function isFatal(reasons: readonly ImportReason[]): boolean {
  return reasons.some((reason) => FATAL_REASONS.includes(reason.code));
}

/** Validation shared by the preview and save routes; the client calls it too for inline errors. */
export function validateNormalizedRow(
  row: NormalizedRow,
  context: ValidateContext = {},
): ImportReason[] {
  const reasons: ImportReason[] = [];
  const parsedDate = Date.parse(`${row.date}T00:00:00Z`);
  if (
    !ISO_DAY.test(row.date) ||
    Number.isNaN(parsedDate) ||
    utcDay(new Date(parsedDate)) !== row.date
  )
    reasons.push({ code: "dateInvalid", field: "date" });
  if (row.date < "1990-01-01" || row.date > "2100-12-31")
    reasons.push({ code: "dateInvalid", field: "date" });
  if (!row.description.trim()) reasons.push({ code: "descriptionMissing", field: "description" });
  if (row.description.length > IMPORT_LIMITS.maxDescription)
    reasons.push({ code: "descriptionTooLong", field: "description" });
  if (!Number.isFinite(row.amount) || row.amount <= 0)
    reasons.push({ code: "amountZero", field: "amount" });
  if (row.amount > IMPORT_LIMITS.maxAmount) reasons.push({ code: "amountRange", field: "amount" });
  if (!Number.isFinite(row.signedAmount) || Math.abs(row.signedAmount) > IMPORT_LIMITS.maxAmount)
    reasons.push({ code: "amountRange", field: "amount" });
  if (row.kind !== "transfer") {
    const expectedPositive = row.kind === "income" || row.refund;
    if (expectedPositive ? row.signedAmount <= 0 : row.signedAmount >= 0)
      reasons.push({ code: "amountInvalid", field: "amount" });
  }
  if (row.kind !== "expense" && row.kind !== "income" && row.kind !== "transfer")
    reasons.push({ code: "kindAmbiguous", field: "kind" });
  if (!Number.isInteger(row.accountId) || row.accountId <= 0)
    reasons.push({ code: "accountMissing", field: "account" });
  else if (context.accountExists && !context.accountExists(row.accountId))
    reasons.push({ code: "accountMissing", field: "account" });

  if (row.categoryId != null) {
    const kind = context.categoryKind?.(row.categoryId) ?? null;
    if (kind === null) reasons.push({ code: "categoryUnknown", field: "category" });
    else if (kind !== "expense" && kind !== "income")
      reasons.push({ code: "categoryKindMismatch", field: "category" });
    else if (row.kind === "transfer")
      reasons.push({ code: "categoryKindMismatch", field: "category" });
    else if (kind !== row.kind) reasons.push({ code: "categoryKindMismatch", field: "category" });
  }

  if (row.owner != null && context.memberIds && !context.memberIds.includes(row.owner))
    reasons.push({ code: "ownerInvalid", field: "owner" });
  if (
    !Number.isInteger(row.businessSharePct) ||
    row.businessSharePct < 0 ||
    row.businessSharePct > 100
  )
    reasons.push({ code: "businessRange", field: "business" });
  if (row.memo != null && row.memo.length > IMPORT_LIMITS.maxMemo)
    reasons.push({ code: "memoTooLong", field: "memo" });
  if (row.tags.length > IMPORT_LIMITS.maxTags) reasons.push({ code: "tagsInvalid", field: "tags" });
  if (row.tags.some((tag) => !tag.trim() || tag.length > IMPORT_LIMITS.maxTag))
    reasons.push({ code: "tagsInvalid", field: "tags" });
  return reasons;
}

/** 413-style guard for both parse and save. */
export function bodyTooLarge(bytes: number, limit = IMPORT_LIMITS.maxFileBytes): boolean {
  return bytes > limit;
}

export function rowsTooMany(count: number, limit = IMPORT_LIMITS.maxRows): boolean {
  return count > limit;
}

/** Splits a file larger than the row cap into sequential chunks that share a group id. */
export function chunkRows<T>(rows: readonly T[], size = IMPORT_LIMITS.maxRows): T[][] {
  if (rows.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
  return chunks;
}
