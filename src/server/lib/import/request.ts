import "server-only";

import { ApiError } from "@/server/lib/api-error";
import { accessEnabled, currentUser, membership } from "@/server/lib/user-access";
import { IMPORT_LIMITS, type NormalizedRow } from "@/lib/import/types";

const MAX_BODY_BYTES = 16 * 1024 * 1024;

/** Reject a body over the cap before reading it; 413 with a code the client can word. */
export function assertBodySize(request: Request, limit = MAX_BODY_BYTES): void {
  const header = request.headers.get("content-length");
  if (header && Number(header) > limit)
    throw new ApiError("Request body is too large", 413, "tooLarge");
}

/**
 * Reads the body while counting actual bytes. A chunked request without Content-Length is
 * bounded too, and reading stops as soon as the cap is crossed instead of buffering it all.
 */
export async function readBoundedBytes(
  request: Request,
  limit = MAX_BODY_BYTES,
): Promise<Uint8Array> {
  assertBodySize(request, limit);
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        throw new ApiError("Request body is too large", 413, "tooLarge");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** JSON body read under the byte cap; a null/array body is user input, not a server bug. */
export async function readBoundedJson<T>(request: Request, limit = MAX_BODY_BYTES): Promise<T> {
  const bytes = await readBoundedBytes(request, limit);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    throw new ApiError("Invalid JSON", 400, "bad_json");
  }
}

/** multipart/form-data parsed from bounded bytes, so formData() never buffers an unbounded body. */
export async function readBoundedFormData(
  request: Request,
  limit = MAX_BODY_BYTES,
): Promise<FormData> {
  const bytes = await readBoundedBytes(request, limit);
  const bounded = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: bytes.buffer as ArrayBuffer,
  });
  try {
    return await bounded.formData();
  } catch {
    throw new ApiError("Invalid form data", 400, "bad_json");
  }
}

/** Editors may import; viewers may only read. No-op when access control is disabled. */
export function requireImportEditor(request: Request, workspaceId: number): void {
  if (!accessEnabled()) return;
  const user = currentUser(request);
  const role = user ? membership(user, workspaceId) : null;
  if (role !== "editor") throw new ApiError("Forbidden", 403, "forbidden");
}

const KINDS = new Set(["expense", "income", "transfer"]);

export interface RowCoercionOptions {
  /** The account selected for this save/preview; every row must agree with it. */
  accountId?: number;
}

/**
 * Runtime validation of the client's normalised rows before preview/save. The browser is a
 * suggestion; the server never trusts a kind, amount, account or sign it cannot verify.
 */
export function coerceNormalizedRows(
  raw: unknown,
  options: RowCoercionOptions = {},
): NormalizedRow[] {
  if (!Array.isArray(raw)) throw new ApiError("rows are required", 400, "bad_json");
  if (raw.length === 0) throw new ApiError("rows are required", 400, "bad_json");
  if (raw.length > IMPORT_LIMITS.maxRows)
    throw new ApiError(`at most ${IMPORT_LIMITS.maxRows} rows`, 413, "tooManyRows");

  const seenRowIndexes = new Set<number>();
  return raw.map((item, index) => {
    if (!item || typeof item !== "object") throw new ApiError("invalid row", 400, "bad_json");
    const r = item as Record<string, unknown>;
    if (typeof r.date !== "string" || typeof r.description !== "string")
      throw new ApiError("invalid row", 400, "bad_json");
    if (typeof r.amount !== "number" || !Number.isFinite(r.amount))
      throw new ApiError("invalid amount", 400, "bad_json");
    if (typeof r.kind !== "string" || !KINDS.has(r.kind))
      throw new ApiError("invalid kind", 400, "bad_json");
    if (typeof r.accountId !== "number" || !Number.isInteger(r.accountId) || r.accountId <= 0)
      throw new ApiError("account is required", 400, "accountMissing");
    if (options.accountId != null && r.accountId !== options.accountId)
      throw new ApiError(
        "row account differs from the destination account",
        400,
        "accountMismatch",
      );

    const rowIndex =
      typeof r.rowIndex === "number" && Number.isInteger(r.rowIndex) ? r.rowIndex : index + 1;
    if (seenRowIndexes.has(rowIndex))
      throw new ApiError("duplicate rowIndex", 400, "duplicateRowIndex");
    seenRowIndexes.add(rowIndex);

    const kind = r.kind as NormalizedRow["kind"];
    const refund = r.refund === true;
    const signedAmount =
      typeof r.signedAmount === "number"
        ? r.signedAmount
        : kind === "expense"
          ? refund
            ? Math.abs(r.amount)
            : -Math.abs(r.amount)
          : Math.abs(r.amount);
    if (!Number.isFinite(signedAmount))
      throw new ApiError("invalid signed amount", 400, "bad_json");
    if (kind !== "transfer") {
      const expectedPositive = kind === "income" || refund;
      if (expectedPositive ? signedAmount <= 0 : signedAmount >= 0)
        throw new ApiError("signed amount conflicts with kind", 400, "bad_json");
    }

    return {
      rowIndex,
      date: r.date,
      processedDate: typeof r.processedDate === "string" ? r.processedDate : r.date,
      description: r.description,
      amount: Math.abs(r.amount),
      kind,
      signedAmount,
      refund,
      accountId: r.accountId,
      categoryId: typeof r.categoryId === "number" ? r.categoryId : null,
      categorySource: (r.categorySource as NormalizedRow["categorySource"]) ?? "none",
      tags: Array.isArray(r.tags)
        ? r.tags.filter((t): t is string => typeof t === "string").slice(0, 20)
        : [],
      owner: typeof r.owner === "string" ? r.owner : null,
      businessSharePct: typeof r.businessSharePct === "number" ? r.businessSharePct : 0,
      memo: typeof r.memo === "string" ? r.memo : null,
      originalAmount: typeof r.originalAmount === "number" ? r.originalAmount : null,
      originalCurrency: typeof r.originalCurrency === "string" ? r.originalCurrency : null,
      installmentNumber: typeof r.installmentNumber === "number" ? r.installmentNumber : null,
      installmentTotal: typeof r.installmentTotal === "number" ? r.installmentTotal : null,
      identifier: typeof r.identifier === "string" ? r.identifier : null,
      balance: typeof r.balance === "number" ? r.balance : null,
      kindSource: (r.kindSource as NormalizedRow["kindSource"]) ?? "default",
      confidence: typeof r.confidence === "number" ? r.confidence : 0,
      reasons: Array.isArray(r.reasons)
        ? r.reasons.filter(
            (reason): reason is NormalizedRow["reasons"][number] =>
              !!reason &&
              typeof reason === "object" &&
              typeof (reason as { code?: unknown }).code === "string",
          )
        : [],
    };
  });
}

/** JSON body as an object, or 400: a null/array body is user input, not a server bug. */
export async function readBody<T extends object>(request: Request): Promise<T> {
  const value = await readBoundedJson<unknown>(request);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiError("Invalid JSON body", 400, "bad_json");
  return value as T;
}
