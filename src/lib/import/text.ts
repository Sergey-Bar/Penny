import { parseAmount } from "@/lib/csv";
import { parseImportDateRobust } from "@/lib/import/normalize";
import { roundCents } from "@/lib/money";

interface TextStatementRow {
  date: string;
  description: string;
  amount: number;
  kind: "expense" | "income";
  confidence: number;
}

export interface ParsedStatementText {
  rows: TextStatementRow[];
  /** 0..1; below ~0.6 the caller should show the text for manual mapping instead. */
  confidence: number;
  looksTabular: boolean;
}

const SKIP_LINE =
  /^(?:סה["׳']?כ|יתרה|balance|total|page|עמוד|תאריך|date|פירוט|מועד|account|חשבון)\b/i;

const DATE_PATTERNS: readonly RegExp[] = [
  /\b\d{4}-\d{1,2}-\d{1,2}\b/,
  /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/,
  /\b\d{1,2}[./\s-][A-Za-z\u05d0-\u05ea]{3,}[./\s-]\d{2,4}\b/,
];

const AMOUNT_PATTERN =
  /(?:\(|-)?(?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d{1,2})?(?:\)|-)?(?:\s*(?:₪|ש"ח|ILS|CR|DR))?/g;

/** The last money-looking token on a line, with its sign and CR/DR marker. */
function findAmounts(
  line: string,
): { raw: string; start: number; end: number; negative: boolean; credit: boolean }[] {
  const out: { raw: string; start: number; end: number; negative: boolean; credit: boolean }[] = [];
  for (const match of line.matchAll(AMOUNT_PATTERN)) {
    const raw = match[0].trim();
    if (!raw || !/\d/.test(raw)) continue;
    if (raw.length > 30) continue;
    const negative = /^\(.*\)$/.test(raw) || (raw.match(/-/g)?.length ?? 0) % 2 === 1;
    out.push({
      raw,
      start: match.index ?? 0,
      end: (match.index ?? 0) + raw.length,
      negative,
      credit: /\bCR\b/i.test(raw),
    });
  }
  return out;
}

const cleanDescription = (value: string): string =>
  value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:|]+|[\s\-–—:|]+$/g, "")
    .trim()
    .slice(0, 200);

/**
 * Deterministic statement text -> rows: a date, a description and one amount per line, in the
 * order the bank printed them. No model. Lines without a date or an amount are ignored, and the
 * confidence lets the caller fall back to manual mapping when the text is prose, not a table.
 */
export function parseStatementText(
  text: string,
  options: { today?: string; dateOrder?: "dmy" | "mdy" } = {},
): ParsedStatementText {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rows: TextStatementRow[] = [];
  for (const line of lines) {
    if (SKIP_LINE.test(line)) continue;
    const dateMatch = DATE_PATTERNS.map((re) => re.exec(line)).find((m) => m != null);
    if (!dateMatch) continue;
    const date = parseImportDateRobust(dateMatch[0], {
      order: options.dateOrder ?? "dmy",
      today: options.today,
    });
    if (!date) continue;
    const rest = `${line.slice(0, dateMatch.index)} ${line.slice(dateMatch.index + dateMatch[0].length)}`;
    const amounts = findAmounts(rest);
    if (amounts.length === 0) continue;
    // The rightmost amount is the movement on most statements; totals and balances were skipped.
    const chosen = amounts[amounts.length - 1];
    const value = parseAmount(chosen.raw);
    if (value == null || !Number.isFinite(value) || value === 0) continue;
    const description =
      cleanDescription(rest.slice(0, chosen.start)) ||
      cleanDescription(rest.replace(chosen.raw, ""));
    if (!description || /^\d+$/.test(description)) continue;
    const positive = !chosen.negative;
    rows.push({
      date,
      description,
      amount: roundCents(Math.abs(value)),
      // A bank credit is income in the text path; a card export is handled by the file importer.
      kind: positive || chosen.credit ? "income" : "expense",
      confidence: description.length >= 3 && amounts.length <= 4 ? 0.85 : 0.6,
    });
  }
  const confidence =
    rows.length === 0 ? 0 : rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length;
  return { rows, confidence, looksTabular: rows.length >= 2 && confidence >= 0.6 };
}
