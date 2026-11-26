import "server-only";

import { ApiError, readJson } from "@/server/lib/api-error";
import { accessEnabled, currentUser, membership } from "@/server/lib/user-access";
import { IMPORT_LIMITS, type NormalizedRow } from "@/lib/import/types";

const MAX_BODY_BYTES = 16 * 1024 * 1024;

/** Reject a body over the cap before parsing it; 413 with a code the client can word. */
export function assertBodySize(request: Request, limit = MAX_BODY_BYTES): void {
  const header = request.headers.get("content-length");
  if (header && Number(header) > limit)
    throw new ApiError("Request body is too large", 413, "tooLarge");
}

/** Editors may import; viewers may only read. No-op when access control is disabled. */
export function requireImportEditor(request: Request, workspaceId: number): void {
  if (!accessEnabled()) return;
  const user = currentUser(request);
  const role = user ? membership(user, workspaceId) : null;
  if (role !== "editor") throw new ApiError("Forbidden", 403, "forbidden");
}

const KINDS = new Set(["expense", "income", "transfer"]);

/**
 * Runtime validation of the client's normalised rows before preview/save. The browser is a
 * suggestion; the server never trusts a kind, amount or category it cannot parse.
 */
export function coerceNormalizedRows(raw: unknown): NormalizedRow[] {
  if (!Array.isArray(raw)) throw new ApiError("rows are required", 400, "bad_json");
  if (raw.length === 0) throw new ApiError("rows are required", 400, "bad_json");
  if (raw.length > IMPORT_LIMITS.maxRows)
    throw new ApiError(`at most ${IMPORT_LIMITS.maxRows} rows`, 413, "tooManyRows");
  return raw.map((item, index) => {
    if (!item || typeof item !== "object") throw new ApiError("invalid row", 400, "bad_json");
    const r = item as Record<string, unknown>;
    if (typeof r.date !== "string" || typeof r.description !== "string")
      throw new ApiError("invalid row", 400, "bad_json");
    if (typeof r.amount !== "number" || !Number.isFinite(r.amount))
      throw new ApiError("invalid amount", 400, "bad_json");
    if (!KINDS.has(String(r.kind))) throw new ApiError("invalid kind", 400, "bad_json");
    if (typeof r.accountId !== "number" || !Number.isInteger(r.accountId))
      throw new ApiError("account is required", 400, "accountMissing");
    const kind = r.kind as NormalizedRow["kind"];
    return {
      rowIndex: typeof r.rowIndex === "number" ? r.rowIndex : index + 1,
      date: r.date,
      processedDate: typeof r.processedDate === "string" ? r.processedDate : r.date,
      description: r.description,
      amount: Math.abs(r.amount),
      kind,
      signedAmount:
        typeof r.signedAmount === "number"
          ? r.signedAmount
          : kind === "expense"
            ? -Math.abs(r.amount)
            : Math.abs(r.amount),
      refund: r.refund === true,
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
  const value = await readJson<unknown>(request);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiError("Invalid JSON body", 400, "bad_json");
  return value as T;
}
