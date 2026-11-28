import type { DateOrder, ImportMapping, SignConvention } from "@/lib/import/types";

export type ImportFormat = "csv" | "xlsx" | "html" | "text" | "paste";

/**
 * A saved mapping. Version 2 is workspace-scoped and per sheet; version 1 lived in a browser
 * preference and only knew the five statement columns. Migration is lossless: the old
 * `positiveIsExpense` becomes a sign convention, everything else keeps its column.
 */
export interface ImportProfileV2 {
  version: 2;
  accountId: number | null;
  presetId: string | null;
  format: ImportFormat;
  sheetName: string | null;
  /** Per-sheet mappings when one workbook has different layouts. */
  sheetMappings: Record<string, ImportMapping> | null;
  headerRow: number;
  headerFingerprint: string;
  signConvention: SignConvention;
  dateOrder: DateOrder;
  skipPatterns: string[];
  sectionMap: Record<string, number> | null;
  mapping: ImportMapping;
  extractPattern: string | null;
}

export interface ImportProfileV1 {
  map: {
    date?: number | null;
    description?: number | null;
    amount?: number | null;
    debit?: number | null;
    credit?: number | null;
  };
  dateOrder?: "dmy" | "mdy";
  positiveIsExpense?: boolean;
}

const emptyMapping = (): ImportMapping => ({
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
});

export function emptyImportMapping(): ImportMapping {
  return emptyMapping();
}

/** v1 preference -> v2 profile. A positive-is-expense file was a card statement. */
export function migrateProfileV1(
  old: ImportProfileV1,
  options: {
    format?: ImportFormat;
    sheetName?: string | null;
    headerRow?: number;
    headerFingerprint?: string;
  } = {},
): ImportProfileV2 {
  const mapping = emptyMapping();
  mapping.date = old.map.date ?? null;
  mapping.description = old.map.description ?? null;
  mapping.amount = old.map.amount ?? null;
  mapping.debit = old.map.debit ?? null;
  mapping.credit = old.map.credit ?? null;
  const signConvention: SignConvention =
    old.map.debit != null || old.map.credit != null
      ? "explicit"
      : old.positiveIsExpense === true
        ? "cardPositive"
        : "bankSigned";
  return {
    version: 2,
    accountId: null,
    presetId: null,
    format: options.format ?? "csv",
    sheetName: options.sheetName ?? null,
    sheetMappings: null,
    headerRow: options.headerRow ?? 0,
    headerFingerprint: options.headerFingerprint ?? "",
    signConvention,
    dateOrder: old.dateOrder ?? "dmy",
    skipPatterns: [],
    sectionMap: null,
    mapping,
    extractPattern: null,
  };
}

/** A v2 profile key: a layout is recognised by format, sheet and header, not by file name. */
export function importProfileKey(profile: {
  format: ImportFormat;
  sheetName?: string | null;
  headerFingerprint: string;
}): string {
  return `${profile.format}|${profile.sheetName ?? ""}|${profile.headerFingerprint}`;
}

/** Runtime check for a stored profile (the DB column is JSON text). */
function isImportProfileV2(value: unknown): value is ImportProfileV2 {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<ImportProfileV2>;
  const formats: readonly string[] = ["csv", "xlsx", "html", "text", "paste"];
  const signs: readonly string[] = [
    "bankSigned",
    "cardPositive",
    "cardNegative",
    "explicit",
    "unknown",
  ];
  const orders: readonly string[] = ["dmy", "mdy", "ymd"];
  const validIndex = (v: unknown) =>
    v === null || (typeof v === "number" && Number.isInteger(v) && v >= 0);
  const validMapping =
    p.mapping != null &&
    typeof p.mapping === "object" &&
    Object.values(p.mapping as unknown as Record<string, unknown>).every(validIndex);
  return (
    p.version === 2 &&
    typeof p.headerFingerprint === "string" &&
    p.headerFingerprint.length <= 1_000 &&
    formats.includes(p.format as string) &&
    signs.includes(p.signConvention as string) &&
    orders.includes(p.dateOrder as string) &&
    typeof p.headerRow === "number" &&
    Number.isInteger(p.headerRow) &&
    p.headerRow >= 0 &&
    validMapping &&
    (p.accountId === null || (typeof p.accountId === "number" && p.accountId > 0)) &&
    (p.presetId === null || typeof p.presetId === "string") &&
    (p.sheetName === null || typeof p.sheetName === "string") &&
    (p.sheetMappings === null ||
      (typeof p.sheetMappings === "object" && !Array.isArray(p.sheetMappings))) &&
    (p.sectionMap === null || (typeof p.sectionMap === "object" && !Array.isArray(p.sectionMap))) &&
    Array.isArray(p.skipPatterns) &&
    p.skipPatterns.every((pattern) => typeof pattern === "string") &&
    (p.extractPattern === null || typeof p.extractPattern === "string")
  );
}

export function parseImportProfile(raw: string | null | undefined): ImportProfileV2 | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isImportProfileV2(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
