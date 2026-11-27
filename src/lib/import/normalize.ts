import { parseAmount } from "@/lib/csv";
import { utcDay } from "@/lib/dates";
import { roundCents } from "@/lib/money";
import { classifyKind } from "@/lib/import/classify";
import { parseImportDate } from "@/lib/file-import";
import type {
  DateOrder,
  ImportDraftRow,
  ImportKind,
  ImportReason,
  NormalizedRow,
  SignConvention,
} from "@/lib/import/types";

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  ינואר: 1,
  פברואר: 2,
  מרץ: 3,
  מרס: 3,
  אפריל: 4,
  מאי: 5,
  יוני: 6,
  יולי: 7,
  אוגוסט: 8,
  ספטמבר: 9,
  אוקטובר: 10,
  נובמבר: 11,
  דצמבר: 12,
};

const RELATIVE: Record<string, number> = {
  today: 0,
  היום: 0,
  yesterday: -1,
  אתמול: -1,
  tomorrow: 1,
  מחר: 1,
};

const isoOf = (y: number, m: number, d: number): string | null => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
    ? utcDay(dt)
    : null;
};

export interface RobustDateOptions {
  order?: DateOrder;
  today?: string;
  /** Excel's 1904 date system (Mac). */
  serial1904?: boolean;
}

/**
 * One date parser for statements and pasted sheets: ISO, day/month/year in either order,
 * dd-MMM-yy (English or Hebrew month), a serial number (1900 or 1904 epoch), a time suffix, and
 * today/yesterday. Returns YYYY-MM-DD or null.
 */
export function parseImportDateRobust(
  raw: string | null | undefined,
  options: RobustDateOptions = {},
): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const order = options.order ?? "dmy";
  const today = options.today ?? utcDay(new Date());

  const relative = RELATIVE[text.toLowerCase()];
  if (relative !== undefined) {
    return utcDay(new Date(Date.parse(`${today}T00:00:00Z`) + relative * 86_400_000));
  }

  // Excel serial: 1900 system counts from 1899-12-30, 1904 from 1904-01-01.
  const serialPattern = options.serial1904 ? /^\d+(?:\.\d+)?$/ : /^\d{5}(?:\.\d+)?$/;
  if (serialPattern.test(text)) {
    const n = Math.floor(Number(text));
    if (n < 0 || n > 80_000) return null;
    const base = options.serial1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    const day = utcDay(new Date(base + n * 86_400_000));
    return day >= "1900-01-01" && day <= "2100-12-31" ? day : null;
  }

  // Strip a time suffix ("12/03/2024 14:35" and "2024-03-12T14:35:00Z").
  const datePart = text.replace(
    /[T\s]+\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/,
    "",
  );

  const iso = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})\b/.exec(datePart);
  if (iso) return isoOf(+iso[1], +iso[2], +iso[3]);

  const named = /^(\d{1,2})[./\s-]+([A-Za-z\u05d0-\u05ea]{3,})[./\s-]+(\d{2}|\d{4})\b/.exec(
    datePart,
  );
  if (named) {
    const month = MONTHS[named[2].toLowerCase()];
    if (month) {
      const year = named[3].length === 2 ? 2000 + +named[3] : +named[3];
      return isoOf(year, month, +named[1]);
    }
  }

  const numeric = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})\b/.exec(datePart);
  if (numeric) {
    const year = numeric[3].length === 2 ? 2000 + +numeric[3] : +numeric[3];
    const a = +numeric[1];
    const b = +numeric[2];
    const dmy = isoOf(year, b, a);
    const mdy = isoOf(year, a, b);
    if (order === "mdy") return mdy ?? dmy;
    if (order === "ymd") return dmy;
    return dmy ?? mdy;
  }

  const short = /^(\d{1,2})[./-](\d{1,2})$/.exec(datePart);
  if (short) {
    const day = order === "mdy" ? +short[2] : +short[1];
    const month = order === "mdy" ? +short[1] : +short[2];
    const year = Number(today.slice(0, 4));
    const thisYear = isoOf(year, month, day);
    if (
      thisYear &&
      thisYear <= utcDay(new Date(Date.parse(`${today}T00:00:00Z`) + 14 * 86_400_000))
    )
      return thisYear;
    return isoOf(year - 1, month, day);
  }

  // Last resort: the shared statement parser (covers unusual separators).
  return parseImportDate(text, order === "mdy" ? "mdy" : "dmy");
}

export interface NormalizeContext {
  dateOrder: DateOrder;
  signConvention: SignConvention;
  accountKind: "bank" | "card" | "other";
  accountId: number;
  accountCurrency: string;
  today?: string;
  serial1904?: boolean;
  hasCardCoverage?: boolean;
  hasTransferPair?: boolean;
  ruleKind?: ImportKind | null;
  allPositive?: boolean;
}

export interface NormalizeExtras {
  debit?: string | null;
  credit?: string | null;
}

export interface NormalizeResult {
  row: NormalizedRow | null;
  reasons: ImportReason[];
}

const cleanText = (value: string, max: number): string =>
  value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

function signedFor(kind: ImportKind, amount: number, refund: boolean, rawSigned: number): number {
  if (kind === "expense") return refund ? amount : -amount;
  if (kind === "income") return amount;
  return rawSigned < 0 ? -amount : amount;
}

/**
 * Draft row -> normalised row, or reasons that block it. The sign convention is applied here so
 * every later stage sees one shape: an absolute amount, a kind, and a signed amount for balances.
 */
export function normalizeImportRow(
  draft: ImportDraftRow,
  context: NormalizeContext,
  extras: NormalizeExtras = {},
): NormalizeResult {
  const reasons: ImportReason[] = [];
  const date = parseImportDateRobust(draft.date, {
    order: context.dateOrder,
    today: context.today,
    serial1904: context.serial1904,
  });
  if (!draft.date.trim()) reasons.push({ code: "dateMissing", field: "date" });
  else if (!date) reasons.push({ code: "dateInvalid", field: "date" });
  else if (date < "1990-01-01" || date > "2100-12-31")
    reasons.push({ code: "dateInvalid", field: "date" });

  let description = cleanText(draft.description, 200);
  if (!description) {
    description = cleanText(draft.identifier ?? "", 200);
    if (!description) description = "ללא תיאור";
    reasons.push({ code: "descriptionMissing", field: "description" });
  }

  const debit = extras.debit == null || extras.debit === "" ? null : parseAmount(extras.debit);
  const credit = extras.credit == null || extras.credit === "" ? null : parseAmount(extras.credit);
  const hasDebitCredit = extras.debit !== undefined || extras.credit !== undefined;
  let debitCreditKind: "expense" | "income" | null = null;
  if (hasDebitCredit) {
    if (debit != null && credit != null) {
      reasons.push({ code: "debitCredit", detail: "both" });
      debitCreditKind = credit - Math.abs(debit) >= 0 ? "income" : "expense";
    } else if (debit != null) debitCreditKind = "expense";
    else if (credit != null) debitCreditKind = "income";
  }

  let rawSigned: number | null = null;
  if (hasDebitCredit) {
    const d = debit == null ? null : Math.abs(debit);
    const c = credit == null ? null : Math.abs(credit);
    if (d != null || c != null) rawSigned = (c ?? 0) - (d ?? 0);
  } else {
    const parsed = parseAmount(draft.amount);
    if (parsed != null) {
      const explicit = draft.kind;
      if (explicit === "expense") rawSigned = -Math.abs(parsed);
      else if (explicit === "income") rawSigned = Math.abs(parsed);
      else if (explicit === "transfer") rawSigned = parsed;
      else if (context.signConvention === "cardPositive") rawSigned = Math.abs(parsed);
      else if (context.signConvention === "cardNegative") rawSigned = parsed;
      else if (context.signConvention === "explicit") rawSigned = parsed;
      else rawSigned = parsed;
    }
  }

  if (!draft.amount.trim() && !hasDebitCredit) {
    reasons.push({ code: "amountMissing", field: "amount" });
  } else if (rawSigned == null) {
    reasons.push({ code: "amountInvalid", field: "amount" });
  } else if (rawSigned === 0) {
    reasons.push({ code: "amountZero", field: "amount" });
  }

  const amount = rawSigned == null ? 0 : roundCents(Math.abs(rawSigned));
  if (amount > 100_000_000) reasons.push({ code: "amountRange", field: "amount" });

  const explicit = draft.kind;
  const classified = classifyKind({
    description,
    rawSigned: rawSigned ?? 0,
    amount,
    explicitKind: explicit,
    debitCreditKind,
    accountKind: context.accountKind,
    signConvention: context.signConvention,
    hasCardCoverage: context.hasCardCoverage === true,
    hasTransferPair: context.hasTransferPair === true,
    ruleKind: context.ruleKind ?? null,
    allPositive: context.allPositive,
  });

  const processedDate =
    parseImportDateRobust(draft.processedDate ?? "", {
      order: context.dateOrder,
      today: context.today,
      serial1904: context.serial1904,
    }) ??
    date ??
    "";

  const originalAmountRaw = draft.originalAmount ? parseAmount(draft.originalAmount) : null;
  const currency = (draft.originalCurrency ?? "").trim().toUpperCase();
  const originalAmount = originalAmountRaw == null ? null : roundCents(Math.abs(originalAmountRaw));
  const originalCurrency =
    originalAmount == null ? context.accountCurrency : currency || context.accountCurrency;
  if (originalAmount != null && !currency) reasons.push({ code: "currencyMissing" });

  const installmentNumber = parseCount(draft.installmentNumber);
  const installmentTotal = parseCount(draft.installmentTotal);
  if (installmentTotal != null && installmentTotal > 1)
    reasons.push({ code: "installments", detail: String(installmentTotal) });

  const balance = draft.balance == null ? null : parseAmount(draft.balance);

  const fatal = reasons.some((r) =>
    [
      "dateMissing",
      "dateInvalid",
      "amountMissing",
      "amountInvalid",
      "amountZero",
      "amountRange",
    ].includes(r.code),
  );
  if (fatal || !date) return { row: null, reasons };

  const allReasons: ImportReason[] = [...reasons, ...classified.reasons];
  if (allReasons.some((r) => r.code === "signAmbiguous"))
    allReasons.push({ code: "kindAmbiguous" });

  return {
    row: {
      rowIndex: draft.rowIndex,
      date,
      processedDate: processedDate || date,
      description,
      amount,
      kind: classified.kind,
      signedAmount: roundCents(
        signedFor(classified.kind, amount, classified.refund, rawSigned ?? 0),
      ),
      refund: classified.refund,
      accountId: draft.accountId ?? context.accountId,
      categoryId: draft.categoryId,
      categorySource: draft.categoryId != null ? "user" : "none",
      tags: draft.tags,
      owner: draft.owner,
      businessSharePct: draft.businessSharePct,
      memo: draft.memo ? cleanText(draft.memo, 500) : null,
      originalAmount: originalAmount ?? amount,
      originalCurrency,
      installmentNumber,
      installmentTotal,
      identifier: draft.identifier ? cleanText(draft.identifier, 100) : null,
      balance: balance == null ? null : roundCents(balance),
      kindSource: classified.kindSource,
      confidence: classified.confidence,
      reasons: allReasons,
    },
    reasons: allReasons,
  };
}

function parseCount(value: number | null): number | null {
  if (value == null) return null;
  const n = Math.trunc(value);
  return Number.isFinite(n) && n > 0 && n < 1000 ? n : null;
}
