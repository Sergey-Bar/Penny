import { decodeStatementText, parseCsv, sniffFileKind } from "@/lib/csv";
import { IMPORT_LIMITS, IMPORT_WARN_ROWS, type ImportReason } from "@/lib/import/types";
import { readXlsxWorkbook } from "@/lib/xlsx";

type SourceFormat = "csv" | "xlsx" | "html" | "text";

interface ReadSheet {
  name: string;
  hidden: boolean;
  rows: string[][];
}

export interface ReadResult {
  format: SourceFormat;
  sheets: ReadSheet[];
  /** Mac Excel 1904 workbook, for date serials. */
  date1904: boolean;
  encoding: "utf8" | "utf16" | "win1255" | "ascii";
  warnings: ImportReason[];
}

export class ImportReadError extends Error {
  constructor(
    readonly code:
      | "tooLarge"
      | "unsupportedFormat"
      | "xlsBinary"
      | "pdfNeedsAI"
      | "zipBomb"
      | "xmlInvalid"
      | "noRows",
    message: string = code,
  ) {
    super(message);
    this.name = "ImportReadError";
  }
}

/** Real tables only. HTML from a bank is flat; rowspan and colspan are expanded like Excel. */
export function parseHtmlTableAdvanced(html: string): string[][] {
  const text = (s: string) =>
    s
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&(nbsp|amp|lt|gt|quot|#\d+|#x[0-9a-f]+);/gi, (_, e: string) => {
        const key = e.toLowerCase();
        if (key[0] === "#")
          return String.fromCodePoint(
            key[1] === "x" ? Number.parseInt(key.slice(2), 16) : Number(key.slice(1)),
          );
        return ({ nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"' } as Record<string, string>)[
          key
        ];
      })
      .replace(/\s+/g, " ")
      .trim();

  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((m) => m[1]);
  if (tables.length === 0) return [];
  const biggest = tables.sort((a, b) => b.length - a.length)[0];
  const rows: string[][] = [];
  const pending = new Map<number, { value: string; left: number }>();
  for (const tr of biggest.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row: string[] = [];
    let column = 0;
    const put = (value: string) => {
      // A cell carried down by an earlier rowspan occupies its column first.
      while (pending.has(column)) {
        const carry = pending.get(column)!;
        row[column] = carry.value;
        carry.left -= 1;
        if (carry.left <= 0) pending.delete(column);
        column++;
      }
      row[column] = value;
      column++;
    };
    for (const cell of tr[1].matchAll(/<t([dh])\b([^>]*)>([\s\S]*?)<\/t\1>/gi)) {
      const attrs = cell[2];
      const value = text(cell[3]);
      const colspan = Math.max(1, Number(/\bcolspan\s*=\s*"?(\d+)/i.exec(attrs)?.[1] ?? 1));
      const rowspan = Math.max(1, Number(/\browspan\s*=\s*"?(\d+)/i.exec(attrs)?.[1] ?? 1));
      for (let k = 0; k < colspan; k++) {
        put(k === 0 ? value : "");
        if (rowspan > 1)
          pending.set(column - 1, { value: k === 0 ? value : "", left: rowspan - 1 });
      }
    }
    // Trailing carry-over cells.
    while (pending.has(column)) {
      const carry = pending.get(column)!;
      row[column] = carry.value;
      carry.left -= 1;
      if (carry.left <= 0) pending.delete(column);
      column++;
    }
    if (row.some((c) => c)) rows.push(row);
  }
  return rows;
}

function detectEncoding(bytes: Uint8Array): ReadResult["encoding"] {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf16";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf16";
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  let high = 0;
  for (let i = 1; i < sample.length; i += 2) if (sample[i] === 0 || sample[i] < 0x09) high++;
  if (sample.length > 1 && high / Math.max(1, Math.floor(sample.length / 2)) > 0.6) return "utf16";
  const utf8 = new TextDecoder("utf-8").decode(sample);
  if (utf8.includes("\uFFFD")) return "win1255";
  return "utf8";
}

/** Strip Excel's "sep=;" hint line before parsing; it is not a data row. */
function stripSeparatorHint(text: string): string {
  const lines = text.split(/\r?\n/);
  const first = lines.findIndex((line) => line.trim() !== "");
  if (first >= 0 && /^sep=.$/i.test(lines[first].trim())) lines.splice(first, 1);
  return lines.join("\n");
}

function rowCount(sheets: ReadSheet[]): number {
  return sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
}

/**
 * File bytes -> sheets of text rows. The browser runs this in a Worker; the server runs the same
 * function for pending folder files. No network, no AI, and a clear error code for formats that
 * need a conversion step (BIFF .xls, scanned PDF).
 */
export async function readImportSource(input: {
  bytes: Uint8Array;
  name: string;
}): Promise<ReadResult> {
  const bytes = input.bytes;
  if (bytes.length === 0) throw new ImportReadError("noRows", "empty file");
  if (bytes.length > IMPORT_LIMITS.maxFileBytes) throw new ImportReadError("tooLarge");

  const kind = sniffFileKind(bytes);
  if (kind === "xlsx") {
    try {
      const workbook = await readXlsxWorkbook(bytes);
      const sheets = workbook.sheets.map((sheet) => ({
        name: sheet.name,
        hidden: sheet.hidden,
        rows: sheet.rows,
      }));
      return {
        format: "xlsx",
        sheets,
        date1904: workbook.date1904,
        encoding: "utf8",
        warnings: rowCount(sheets) > IMPORT_WARN_ROWS ? [{ code: "tooManyRows" }] : [],
      };
    } catch (error) {
      if (error instanceof Error && error.message === "zipBomb")
        throw new ImportReadError("zipBomb");
      throw new ImportReadError("xmlInvalid", "invalid workbook");
    }
  }
  if (kind === "pdf") throw new ImportReadError("pdfNeedsAI");

  const encoding = detectEncoding(bytes);
  const raw = decodeStatementText(bytes);
  const text = stripSeparatorHint(raw);
  const warnings: ImportReason[] = [];
  if (encoding === "win1255" || encoding === "utf16") warnings.push({ code: "encodingFallback" });

  if (/<table/i.test(text)) {
    const rows = parseHtmlTableAdvanced(text);
    if (rows.length === 0) throw new ImportReadError("noRows");
    const sheets = [{ name: input.name, hidden: false, rows }];
    return { format: "html", sheets, date1904: false, encoding, warnings };
  }

  if (kind === "xls" || /\.xls$/i.test(input.name)) throw new ImportReadError("xlsBinary");

  const rows = parseCsv(text);
  if (rows.length === 0) throw new ImportReadError("noRows");
  const sheets = [{ name: input.name, hidden: false, rows }];
  return { format: "csv", sheets, date1904: false, encoding, warnings };
}

/** Choose a sheet (or all visible sheets) from a read result. */
export function selectSheets(
  result: ReadResult,
  sheetName?: string | null,
): { name: string; rows: string[][] }[] {
  if (sheetName) {
    const match = result.sheets.find((s) => s.name === sheetName);
    return match ? [{ name: match.name, rows: match.rows }] : [];
  }
  const visible = result.sheets.filter((s) => !s.hidden);
  return (visible.length > 0 ? visible : result.sheets).map((s) => ({
    name: s.name,
    rows: s.rows,
  }));
}
