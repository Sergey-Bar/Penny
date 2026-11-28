/**
 * Shared contracts of the import workbench. These types cross the client/server line: the pure
 * engine here produces drafts and normalised rows, the browser edits drafts, and the server
 * re-validates and re-classifies exactly the same shapes before writing anything.
 */

export type ImportKind = "expense" | "income" | "transfer";
export type ImportKindChoice = "auto" | ImportKind | "refund";

export type ImportReasonCode =
  | "headerNotFound"
  | "noRows"
  | "unsupportedFormat"
  | "xlsBinary"
  | "pdfNeedsAI"
  | "tooLarge"
  | "tooManyRows"
  | "zipBomb"
  | "xmlInvalid"
  | "encodingFallback"
  | "dateMissing"
  | "dateInvalid"
  | "dateAmbiguous"
  | "descriptionMissing"
  | "descriptionTooLong"
  | "amountMissing"
  | "amountInvalid"
  | "amountZero"
  | "amountRange"
  | "kindAmbiguous"
  | "signAmbiguous"
  | "accountMissing"
  | "accountAmbiguous"
  | "categoryUnknown"
  | "categoryKindMismatch"
  | "ownerInvalid"
  | "businessRange"
  | "memoTooLong"
  | "tagsInvalid"
  | "pendingRow"
  | "duplicate"
  | "possibleDuplicate"
  | "repeated"
  | "alreadyImported"
  | "adopted"
  | "cardBillTransfer"
  | "cardBillSuggested"
  | "loanTransfer"
  | "refundSuggested"
  | "transferSuggested"
  | "cashWithdrawalSuggested"
  | "ruleApplied"
  | "merchantMemoryApplied"
  | "dictionaryApplied"
  | "fileCategoryApplied"
  | "aiSuggested"
  | "signResolved"
  | "debitCredit"
  | "typeColumn"
  | "installments"
  | "currencyMissing"
  | "balanceDrift";

export interface ImportReason {
  code: ImportReasonCode;
  field?: string;
  detail?: string;
}

/** One editable grid row. Every value is text until `normalize` runs. */
export interface ImportDraftRow {
  rowIndex: number;
  include: boolean;
  date: string;
  processedDate: string | null;
  description: string;
  amount: string;
  kind: ImportKindChoice;
  accountId: number | null;
  accountRaw: string;
  categoryId: number | null;
  categoryName: string | null;
  categoryRaw: string | null;
  tags: string[];
  owner: string | null;
  businessSharePct: number;
  memo: string | null;
  originalAmount: string | null;
  originalCurrency: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  identifier: string | null;
  balance: string | null;
  /** Raw debit/credit cells when the file has those columns, so direction survives normalization. */
  debit?: string | null;
  credit?: string | null;
  sourceRef: string;
}

export type CategorySource =
  "user" | "rule" | "memory" | "file" | "dictionary" | "pattern" | "ai" | "none";

export type KindSource = "user" | "rule" | "column" | "sign" | "pattern" | "default" | "ai";

export interface NormalizedRow {
  rowIndex: number;
  date: string;
  processedDate: string;
  description: string;
  amount: number;
  kind: ImportKind;
  signedAmount: number;
  refund: boolean;
  accountId: number;
  categoryId: number | null;
  categorySource: CategorySource;
  tags: string[];
  owner: string | null;
  businessSharePct: number;
  memo: string | null;
  originalAmount: number | null;
  originalCurrency: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  identifier: string | null;
  balance: number | null;
  kindSource: KindSource;
  confidence: number;
  reasons: ImportReason[];
}

type RowStatus = "valid" | "duplicate" | "possibleDuplicate" | "skipped" | "error";

export interface PreviewRow {
  rowIndex: number;
  status: RowStatus;
  code: ImportReasonCode | null;
  kind: ImportKind | null;
  kindSource: KindSource | null;
  categoryId: number | null;
  categorySource: CategorySource | null;
  confidence: number;
  reasons: ImportReason[];
}

export interface ImportSummary {
  ready: number;
  duplicates: number;
  possibleDuplicates: number;
  errors: number;
  skipped: number;
  needsReview: number;
  autoCategorized: number;
  expenses: number;
  income: number;
  transfers: number;
  net: number;
  byAccount: { accountId: number; count: number; net: number }[];
}

export interface ImportMapping {
  date: number | null;
  processedDate: number | null;
  description: number | null;
  amount: number | null;
  debit: number | null;
  credit: number | null;
  kind: number | null;
  memo: number | null;
  balance: number | null;
  originalAmount: number | null;
  originalCurrency: number | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  identifier: number | null;
  accountRaw: number | null;
  categoryRaw: number | null;
  status: number | null;
}

export type MappingField = keyof ImportMapping;

export type DateOrder = "dmy" | "mdy" | "ymd";

export type SignConvention =
  "bankSigned" | "cardPositive" | "cardNegative" | "explicit" | "unknown";

export interface ImportCategory {
  id: number;
  name: string;
  kind: "expense" | "income";
  key?: string | null;
}

export interface CategoryDecision {
  categoryId: number | null;
  source: CategorySource;
  confidence: number;
  alternatives: { categoryId: number; name: string }[];
  reasons: ImportReason[];
}

export interface ImportLimits {
  maxFileBytes: number;
  maxRows: number;
  maxAmount: number;
  maxDescription: number;
  maxMemo: number;
  maxTag: number;
  maxTags: number;
}

export const IMPORT_LIMITS: ImportLimits = {
  maxFileBytes: 25 * 1024 * 1024,
  maxRows: 5000,
  maxAmount: 100_000_000,
  maxDescription: 200,
  maxMemo: 500,
  maxTag: 30,
  maxTags: 20,
};

/** Warn (but keep going) above this many rows in one file. */
export const IMPORT_WARN_ROWS = 1000;

export function isImportKind(value: unknown): value is ImportKind {
  return value === "expense" || value === "income" || value === "transfer";
}

export type ImportOrigin = "upload" | "paste" | "folder" | "text" | "document" | "sheet";

interface BatchRowOutcome {
  rowIndex: number;
  status: "added" | "duplicate" | "skipped" | "error" | "adopted";
  code?: string;
  detail?: string;
  transactionId?: number;
}

export interface SaveImportResult {
  importId: number;
  batchId: number;
  groupId: string | null;
  added: number;
  duplicates: number;
  skipped: number;
  errors: number;
  adopted: number;
  rows: BatchRowOutcome[];
}
