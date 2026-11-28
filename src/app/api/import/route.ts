import { handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { deleteFileImport, listFileImports } from "@/server/db/queries/transactions";
import { saveStatementImport } from "@/server/lib/folder-import";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { MAX_IMPORT_ROWS, parseImportDate, type ImportRow } from "@/lib/file-import";
import { roundCents } from "@/lib/money";
import { getAccount, resolveAccount } from "@/server/db/queries/accounts";
import { deleteImportBatch, resolveBatchId } from "@/server/db/queries/imports";
import { importV2Enabled } from "@/server/lib/import/flag";
import { legacyRow } from "@/server/lib/import/legacy-row";
import { previewImport } from "@/server/lib/import/preview";
import { saveImport } from "@/server/lib/import/save";
import { readBody } from "@/server/lib/import/request";
import { getAppSettings } from "@/server/db/queries/settings";

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/**
 * Imports parsed statement rows: { account, rows: [{date, description, amount}], dryRun? }.
 * Rows already stored for that account are skipped. With import_v2 on, the same shape runs
 * through the new resolver/preview/save; otherwise the legacy path is unchanged.
 */
export const POST = handle("import", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = await readBody<{
    account?: unknown;
    rows?: unknown;
    dryRun?: unknown;
    source?: unknown;
    fileName?: unknown;
  }>(request);
  const account = typeof body.account === "string" ? body.account.trim().slice(0, 40) : "";
  if (!account) return bad("account is required");
  if (!Array.isArray(body.rows) || body.rows.length === 0) return bad("rows are required");
  if (body.rows.length > MAX_IMPORT_ROWS) return bad(`at most ${MAX_IMPORT_ROWS} rows`);
  const rows: ImportRow[] = [];
  for (const r of body.rows as Record<string, unknown>[]) {
    const date =
      typeof r?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date)
        ? parseImportDate(r.date)
        : null;
    const amount = r?.amount;
    const description =
      typeof r?.description === "string" ? r.description.trim().slice(0, 200) : "";
    if (!date || date > "2100-01-01" || date < "1990-01-01") return bad("invalid date");
    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount === 0 ||
      Math.abs(amount) > 1e8
    )
      return bad("invalid amount");
    if (!description) return bad("invalid description");
    rows.push({ date, description, amount: roundCents(amount) });
  }
  const source = body.source === "card" ? "card" : "bank";
  const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 120) || null : null;

  if (importV2Enabled(workspaceId)) {
    const resolved = resolveAccount(workspaceId, {
      label: account,
      provider: "file",
      create: body.dryRun !== true,
      kind: source === "card" ? "card" : "bank",
    });
    if (!resolved) return bad("account is required");
    const accountEntity = getAccount(workspaceId, resolved.account.id) ?? resolved.account;
    const normalized = rows.map((row, index) =>
      legacyRow(row, index + 1, accountEntity.id, accountEntity.kind, source),
    );
    const members = getAppSettings(workspaceId).household.members.map((m) => m.id);
    if (body.dryRun === true) {
      const preview = previewImport(workspaceId, accountEntity.id, normalized, { members });
      return NextResponse.json({
        dryRun: true,
        ready: preview.summary.ready,
        duplicates: preview.summary.duplicates,
        added: 0,
        categorized: preview.summary.autoCategorized,
        needsReview: preview.summary.needsReview,
        batchId: null,
        importId: null,
      });
    }
    const preview = previewImport(workspaceId, accountEntity.id, normalized, { members });
    const saved = saveImport({
      workspaceId,
      accountId: accountEntity.id,
      origin: "upload",
      rows: normalized,
      fileName,
      sourceFormat: "text",
    });
    return NextResponse.json({
      dryRun: false,
      ready: preview.summary.ready,
      added: saved.added,
      duplicates: saved.duplicates,
      categorized: preview.summary.autoCategorized,
      needsReview: preview.summary.needsReview,
      batchId: saved.batchId,
      importId: saved.importId,
    });
  }

  return NextResponse.json(
    saveStatementImport(workspaceId, account, rows, body.dryRun === true, source, fileName),
  );
});

/** Import history: past statement imports with their account and row count. */
export const GET = handle("import", async (request: Request) => {
  return NextResponse.json({ imports: listFileImports(getWorkspaceIdFromRequest(request)) });
});

/** Undo one import: ?batch=. Imports always identify their own kind of batch. */
export const DELETE = handle("import", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const raw = new URL(request.url).searchParams.get("batch") ?? "";
  if (importV2Enabled(workspaceId)) {
    const id = resolveBatchId(workspaceId, raw);
    if (id == null) return bad("invalid batch");
    const result = deleteImportBatch(workspaceId, id);
    return NextResponse.json({ ...result, removed: result.removed });
  }
  const batch = Number(raw);
  if (!Number.isInteger(batch) || batch <= 0) return bad("invalid batch");
  return NextResponse.json({ removed: deleteFileImport(workspaceId, batch) });
});
