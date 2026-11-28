import "server-only";

import crypto from "crypto";
import fs from "fs/promises";
import { ApiError } from "@/server/lib/api-error";
import { getAccount } from "@/server/db/queries/accounts";
import {
  detectBalance,
  detectImportDateOrder,
  detectSignConvention,
  findImportHeaderRow,
  guessImportMapping,
  mappingComplete,
} from "@/lib/import/detect";
import { parseAmount } from "@/lib/csv";
import { tableToDrafts } from "@/lib/import/draft";
import { detectPreset, presetMapping } from "@/lib/import/presets";
import {
  readImportSource,
  selectSheets,
  ImportReadError,
  type ReadResult,
} from "@/lib/import/read";
import type { DateOrder, ImportDraftRow, ImportMapping, SignConvention } from "@/lib/import/types";
import { IMPORT_LIMITS, IMPORT_WARN_ROWS } from "@/lib/import/types";
import { putParse, getParse, type StoredParse } from "@/server/lib/import/parse-store";

export interface ParseOptions {
  sheetName?: string | null;
  headerRow?: number | null;
  mapping?: Partial<ImportMapping> | null;
  signConvention?: SignConvention | null;
  dateOrder?: DateOrder | null;
  accountId?: number | null;
  offset?: number;
  limit?: number;
}

export interface ParseResult {
  parseId: string;
  format: string;
  file: { name: string; sha256: string; size: number };
  sheetName: string;
  sheets: { name: string; hidden: boolean }[];
  header: { row: number; cells: string[] };
  mapping: ImportMapping;
  signConvention: SignConvention;
  dateOrder: DateOrder;
  account: { id: number; label: string; kind: "bank" | "card" | "other"; provider: string } | null;
  accountHint: { provider: string; kind: "bank" | "card"; label: string } | null;
  balance: { value: number; asOf: string; rowIndex: number } | null;
  rows: { total: number; offset: number; limit: number; page: ImportDraftRow[] };
  warnings: { code: string; detail?: string }[];
}

const mergeMapping = (
  base: ImportMapping,
  override?: Partial<ImportMapping> | null,
): ImportMapping => {
  if (!override) return base;
  const out = { ...base };
  for (const key of Object.keys(out) as (keyof ImportMapping)[]) {
    if (override[key] !== undefined) out[key] = override[key] ?? null;
  }
  return out;
};

function readError(error: unknown): never {
  if (error instanceof ImportReadError) {
    const status = error.code === "tooLarge" ? 413 : error.code === "noRows" ? 400 : 415;
    throw new ApiError(error.message, status, error.code);
  }
  throw error;
}

/** The same parse for an upload and for a pending folder file. */
export async function parseImportBytes(
  workspaceId: number,
  input: { bytes: Uint8Array; name: string },
  options: ParseOptions = {},
): Promise<ParseResult> {
  if (input.bytes.length > IMPORT_LIMITS.maxFileBytes)
    throw new ApiError("File is too large", 413, "tooLarge");
  let read: ReadResult;
  try {
    read = await readImportSource(input);
  } catch (error) {
    readError(error);
  }
  const sheetsMeta = read.sheets.map((sheet) => ({ name: sheet.name, hidden: sheet.hidden }));
  const selected = selectSheets(read, options.sheetName ?? null);
  if (selected.length === 0) throw new ApiError("Sheet not found", 400, "unsupportedFormat");
  const sheet = selected[0];
  const table = sheet.rows;
  const warnings: { code: string; detail?: string }[] = [...read.warnings];

  const detectedHeader = findImportHeaderRow(table);
  const headerRow =
    options.headerRow != null ? options.headerRow : detectedHeader >= 0 ? detectedHeader : 0;
  if (detectedHeader < 0 && options.headerRow == null) warnings.push({ code: "headerNotFound" });
  const header = table[headerRow] ?? [];
  const preset = detectPreset(header, input.name);
  const base = preset ? presetMapping(preset.preset, header) : guessImportMapping(header);
  const mapping = mergeMapping(base, options.mapping);
  if (!mappingComplete(mapping)) warnings.push({ code: "headerNotFound", detail: "mapping" });

  const body = table.slice(headerRow + 1);
  const dateCells = mapping.date == null ? [] : body.map((row) => row[mapping.date!] ?? "");
  const dateOrder: DateOrder = options.dateOrder ?? detectImportDateOrder(dateCells);
  const amounts =
    mapping.amount == null
      ? []
      : body.map((row) => parseAmount(row[mapping.amount!])).filter((n): n is number => n != null);
  const signRows =
    mapping.amount == null
      ? []
      : body
          .map((row) => ({
            amount: parseAmount(row[mapping.amount!] ?? ""),
            description: mapping.description == null ? "" : (row[mapping.description] ?? ""),
          }))
          .filter((row): row is { amount: number; description: string } => row.amount != null);
  const kindValues =
    mapping.kind == null
      ? []
      : body.map((row) => (row[mapping.kind!] ?? "").trim()).filter(Boolean);
  const account = options.accountId == null ? null : getAccount(workspaceId, options.accountId);
  if (options.accountId != null && !account)
    throw new ApiError("account is required", 400, "accountMissing");
  const accountKind = account?.kind ?? preset?.preset.kind ?? "bank";
  const headerOnlyBankPreset =
    preset != null &&
    preset.preset.kind === "bank" &&
    !preset.preset.fileHints.some((re) => re.test(input.name)) &&
    mapping.kind == null &&
    mapping.debit == null &&
    mapping.credit == null &&
    amounts.length > 0 &&
    amounts.every((amount) => amount > 0);
  const signPreset = headerOnlyBankPreset ? null : preset;
  const signConvention: SignConvention =
    options.signConvention ??
    (signPreset && accountKind !== "other"
      ? signPreset.preset.signConvention
      : detectSignConvention({ amounts, mapping, accountKind, kindValues, rows: signRows }));

  const { drafts, pending, skipped } = tableToDrafts(body, mapping, {
    sheetName: sheet.name,
    defaultAccountId: account?.id ?? null,
    skipSectionHeaders: true,
    rowOffset: headerRow + 1,
  });
  if (pending > 0) warnings.push({ code: "pendingRow", detail: String(pending) });
  if (skipped > 0) warnings.push({ code: "noRows", detail: String(skipped) });
  if (drafts.length > IMPORT_WARN_ROWS) warnings.push({ code: "tooManyRows" });

  const balance = detectBalance(body, mapping, dateOrder === "ymd" ? "dmy" : dateOrder);
  const accountHint = preset
    ? { provider: preset.preset.provider, kind: preset.preset.kind, label: preset.preset.label.en }
    : null;

  const sha256 = crypto.createHash("sha256").update(input.bytes).digest("hex");
  const stored: Omit<StoredParse, "createdAt"> = {
    workspaceId,
    fileName: input.name,
    fileSha256: sha256,
    fileSize: input.bytes.length,
    format: read.format,
    sheetName: sheet.name,
    sheets: sheetsMeta,
    headerRow,
    header,
    mapping,
    signConvention,
    dateOrder,
    accountHint,
    balance,
    date1904: read.date1904,
    drafts,
    warnings,
  };
  const parseId = putParse(stored);
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.min(1000, Math.max(1, options.limit ?? 200));
  return {
    parseId,
    format: read.format,
    file: { name: input.name, sha256, size: input.bytes.length },
    sheetName: sheet.name,
    sheets: sheetsMeta,
    header: { row: headerRow, cells: header },
    mapping,
    signConvention,
    dateOrder,
    account: account
      ? { id: account.id, label: account.label, kind: account.kind, provider: account.provider }
      : null,
    accountHint,
    balance,
    rows: { total: drafts.length, offset, limit, page: drafts.slice(offset, offset + limit) },
    warnings,
  };
}

/** A pending folder file is read only from its recorded path, which lives under the import folder. */
export async function parseImportFile(
  workspaceId: number,
  file: { path: string; fileName: string; size: number },
  options: ParseOptions = {},
): Promise<ParseResult> {
  const max = IMPORT_LIMITS.maxFileBytes;
  if (file.size > max) throw new ApiError("File is too large", 413, "tooLarge");
  const handle = await fs.open(file.path, "r");
  try {
    // The recorded size can be stale or spoofed; read at most one byte over the cap and check
    // the actual file instead of buffering whatever is on disk.
    const stat = await handle.stat();
    if (stat.size > max) throw new ApiError("File is too large", 413, "tooLarge");
    const bytes = Buffer.alloc(Math.min(stat.size, max + 1));
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > max) throw new ApiError("File is too large", 413, "tooLarge");
    return parseImportBytes(
      workspaceId,
      { bytes: bytes.subarray(0, bytesRead), name: file.fileName },
      options,
    );
  } finally {
    await handle.close();
  }
}

export interface ParsePage {
  rows: { total: number; offset: number; limit: number; page: ImportDraftRow[] };
}

export function getParsePage(
  parseId: string,
  workspaceId: number,
  offset = 0,
  limit = 200,
): ParsePage {
  const stored = getParse(parseId, workspaceId);
  if (!stored) throw new ApiError("Parse expired; parse the file again", 410, "parseExpired");
  const safeOffset = Math.max(0, offset);
  const safeLimit = Math.min(1000, Math.max(1, limit));
  return {
    rows: {
      total: stored.drafts.length,
      offset: safeOffset,
      limit: safeLimit,
      page: stored.drafts.slice(safeOffset, safeOffset + safeLimit),
    },
  };
}
