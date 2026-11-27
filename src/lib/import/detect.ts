import { parseAmount } from "@/lib/csv";
import { parseImportDate, type DateOrder } from "@/lib/file-import";
import type {
  DateOrder as ImportDateOrder,
  ImportMapping,
  MappingField,
  SignConvention,
} from "@/lib/import/types";

/**
 * Header detection and column mapping. The same table drives the importer's mapping panel and
 * the unattended folder import, so a format that works in one works in the other.
 */

const KEYWORDS: Record<MappingField, string[]> = {
  date: [
    "תאריך עסקה",
    "תאריך רכישה",
    "תאריך תנועה",
    "תאריך פעולה",
    "תאריך",
    "transaction date",
    "date",
  ],
  processedDate: [
    "תאריך חיוב",
    "תאריך ערך",
    "תאריך פירעון",
    "value date",
    "posting date",
    "charge date",
    "processed date",
  ],
  description: [
    "שם בית העסק",
    "שם בית עסק",
    "בית עסק",
    "שם העסק",
    "תיאור התנועה",
    "תאור התנועה",
    "תיאור הפעולה",
    "פרטי התנועה",
    "תיאור",
    "תאור",
    "פרטים",
    "merchant name",
    "description",
    "merchant",
    "payee",
    "details",
  ],
  amount: [
    "סכום חיוב",
    "סכום החיוב",
    "סכום התנועה",
    "סכום",
    "charge amount",
    "transaction amount",
    "amount",
    "sum",
  ],
  debit: ["חובה", "בחובה", "חיוב", "debit", "withdrawal", "out"],
  credit: ["זכות", "בזכות", "credit", "deposit", "in"],
  kind: ["סוג תנועה", "סוג עסקה", "סוג", "הוצאה/הכנסה", "type", "kind", "direction"],
  memo: ["פירוט נוסף", "הערה", "הערות", "תיאור מורחב", "memo", "note", "notes", "remarks"],
  balance: ["יתרה", "יתרת חשבון", "balance", "running balance"],
  originalAmount: ["סכום עסקה", "סכום מקורי", "סכום במטבע מקור", "original amount"],
  originalCurrency: ["מטבע", "מטבע עסקה", "מטבע מקור", "currency", "original currency"],
  installmentNumber: ["תשלום נוכחי", "מספר תשלום", "תשלום מספר", "installment number"],
  installmentTotal: ["מס' תשלומים", "מספר תשלומים", 'סה"כ תשלומים', "installments"],
  identifier: ["אסמכתא", "מספר אסמכתא", "אסמיכה", "reference", "reference number", "identifier"],
  accountRaw: ["חשבון", "מספר חשבון", "כרטיס", "אמצעי תשלום", "account", "card", "wallet"],
  categoryRaw: ["קטגוריה", "סיווג", "category"],
  status: ["סטטוס", "מצב", "status"],
};

const HEADER_WORDS: readonly string[] = [...new Set(Object.values(KEYWORDS).flat())];

const norm = (value: string) =>
  value
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[\s"'׳״:*()₪%]+/g, " ")
    .trim()
    .toLowerCase();

function headerHits(row: string[]): number {
  return row.filter((cell) => {
    const n = norm(cell);
    return (
      n.length > 0 &&
      HEADER_WORDS.some((word) => n === norm(word) || (n.length <= 40 && n.includes(norm(word))))
    );
  }).length;
}

/** Index of the first row with at least two known column names in the first `maxRows`, or -1. */
export function findImportHeaderRow(table: string[][], maxRows = 100): number {
  return table.slice(0, maxRows).findIndex((row) => headerHits(row) >= 2);
}

/** Score used by the mapping panel to explain why a row was picked as the header. */
export function headerScore(row: string[]): number {
  return headerHits(row);
}

function pick(
  header: string[],
  words: string[],
  used: Set<number>,
  exclude: RegExp[] = [],
): number | null {
  const cols = header.map(norm);
  for (const word of words) {
    const key = norm(word);
    const exact = cols.findIndex((c, i) => !used.has(i) && c === key);
    if (exact >= 0) {
      used.add(exact);
      return exact;
    }
  }
  for (const word of words) {
    const key = norm(word);
    const loose = cols.findIndex(
      (c, i) => !used.has(i) && c.includes(key) && !exclude.some((re) => re.test(c)),
    );
    if (loose >= 0) {
      used.add(loose);
      return loose;
    }
  }
  return null;
}

const MAPPING_FIELDS: readonly MappingField[] = [
  "processedDate",
  "date",
  "amount",
  "originalAmount",
  "originalCurrency",
  "debit",
  "credit",
  "description",
  "kind",
  "memo",
  "balance",
  "installmentNumber",
  "installmentTotal",
  "identifier",
  "accountRaw",
  "categoryRaw",
  "status",
];

function emptyMapping(): ImportMapping {
  return {
    date: null,
    processedDate: null,
    description: null,
    amount: null,
    debit: null,
    credit: null,
    kind: null,
    memo: null,
    balance: null,
    originalAmount: null,
    originalCurrency: null,
    installmentNumber: null,
    installmentTotal: null,
    identifier: null,
    accountRaw: null,
    categoryRaw: null,
    status: null,
  };
}

/** Column mapping from a header row. Unmatched fields stay null for the mapping panel. */
export function guessImportMapping(header: string[]): ImportMapping {
  const map = emptyMapping();
  const used = new Set<number>();
  for (const field of MAPPING_FIELDS) {
    const exclude =
      field === "amount"
        ? [/יתרה/, /balance/, /מטבע/]
        : field === "debit" || field === "credit"
          ? [/סכום/, /amount/, /יתרה/, /balance/]
          : [];
    const index = pick(header, KEYWORDS[field], used, exclude);
    if (index != null) map[field] = index;
  }
  // Card exports may carry both "סכום עסקה" (original) and "סכום חיוב" (charged). When only the
  // former exists it is the amount to store, not a duplicate of the charged column.
  if (map.originalAmount != null && map.amount == null) {
    map.amount = map.originalAmount;
    map.originalAmount = null;
  }
  // A single "חיוב" column is an amount, not a debit flag, unless there is also a "זכות".
  if (map.debit != null && map.credit == null && map.amount == null && map.description != null) {
    map.amount = map.debit;
    map.debit = null;
  }
  return map;
}

/** Whether the minimum for a preview exists: date and description and one amount source. */
export function mappingComplete(map: ImportMapping): boolean {
  return (
    map.date != null &&
    map.description != null &&
    (map.amount != null || map.debit != null || map.credit != null)
  );
}

/** Dates in the file: a value above 12 in the first slot proves day-first, in the second month-first. */
export function detectImportDateOrder(values: readonly string[]): ImportDateOrder {
  let dmy = 0;
  let mdy = 0;
  let iso = 0;
  for (const value of values) {
    const text = value.trim();
    if (/^\d{4}-\d{1,2}-\d{1,2}/.test(text)) {
      iso++;
      continue;
    }
    const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})\b/.exec(text);
    if (!m) continue;
    const first = Number(m[1]);
    const second = Number(m[2]);
    if (first === second) continue;
    if (first > 12) dmy++;
    else if (second > 12) mdy++;
  }
  if (mdy > dmy) return "mdy";
  if (iso > 0 && dmy === 0 && mdy === 0) return "ymd";
  return "dmy";
}

export interface SignDetectionInput {
  amounts: readonly number[];
  mapping: ImportMapping;
  accountKind: "bank" | "card" | "other";
  /** Kind values seen in a mapped type column. */
  kindValues?: readonly string[];
}

/**
 * How the file expresses direction. A card lists charges as positive; a bank lists them as
 * negative. A file with a type column or debit/credit columns is explicit and wins.
 */
export function detectSignConvention(input: SignDetectionInput): SignConvention {
  const { amounts, mapping, accountKind, kindValues } = input;
  if (mapping.kind != null && (kindValues?.length ?? 0) > 0) return "explicit";
  if (mapping.debit != null || mapping.credit != null) return "explicit";
  const hasNegative = amounts.some((n) => n < 0);
  if (accountKind === "card") return hasNegative ? "cardNegative" : "cardPositive";
  if (hasNegative) return "bankSigned";
  return "unknown";
}

/** True when a row is a pending card charge the bank has not posted yet. */
export function isPendingRow(cells: readonly string[]): boolean {
  return cells.some((cell) => /^\s*(pending|ממתין|ממתינה|טרם\s*חויב|לא\s*חויב)\s*$/i.test(cell));
}

export interface DetectedBalance {
  value: number;
  asOf: string;
  rowIndex: number;
}

/**
 * Balance column -> the row with the latest date; the last row wins a tie. Returns null when the
 * column is missing or has no parsable value.
 */
export function detectBalance(
  body: readonly string[][],
  mapping: ImportMapping,
  order: DateOrder = "dmy",
): DetectedBalance | null {
  if (mapping.balance == null) return null;
  let best: DetectedBalance | null = null;
  body.forEach((row, index) => {
    const balance = parseAmount(row[mapping.balance!]);
    if (balance == null) return;
    const date = mapping.date == null ? null : parseImportDate(row[mapping.date], order);
    if (!date) return;
    if (!best || date >= best.asOf) {
      best = { value: balance, asOf: date, rowIndex: index };
    }
  });
  return best;
}

export type { DateOrder };
