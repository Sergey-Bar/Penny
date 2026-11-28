import { ApiError, handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { findBatchBySha, getBatchByClientToken } from "@/server/db/queries/imports";
import { saveImport } from "@/server/lib/import/save";
import { deleteParse } from "@/server/lib/import/parse-store";
import { finishPending } from "@/server/lib/import/pending";
import {
  assertBodySize,
  coerceNormalizedRows,
  requireImportEditor,
  readBody,
} from "@/server/lib/import/request";
import type { ImportOrigin } from "@/lib/import/types";
import { withIdempotency } from "@/server/lib/http/idempotency";
import { writeAudit } from "@/server/audit/audit";

interface SaveBody {
  accountId?: number;
  rows?: unknown;
  origin?: ImportOrigin;
  fileName?: string | null;
  fileSha256?: string | null;
  fileSize?: number | null;
  sourceFormat?: string | null;
  groupId?: string | null;
  chunkIndex?: number | null;
  clientToken?: string | null;
  mapping?: unknown;
  header?: unknown;
  profileFingerprint?: string | null;
  force?: boolean;
  includePossible?: boolean;
  balance?: { value: number; asOf: string } | null;
  parseId?: string | null;
  pendingId?: number | null;
}

const ORIGINS = new Set<ImportOrigin>(["upload", "paste", "folder", "text", "document", "sheet"]);

/** POST /api/import/save — validates and re-classifies, then writes one batch. */
export const POST = handle("import/save", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  requireImportEditor(request, workspaceId);
  return withIdempotency(request, workspaceId, async () => {
    assertBodySize(request);
    const body = await readBody<SaveBody>(request);
    if (typeof body.accountId !== "number" || !Number.isInteger(body.accountId))
      throw new ApiError("account is required", 400, "accountMissing");
    const origin: ImportOrigin = body.origin && ORIGINS.has(body.origin) ? body.origin : "upload";
    const tokenBatch =
      body.clientToken != null ? getBatchByClientToken(workspaceId, body.clientToken) : null;
    if (body.fileSha256 && body.force !== true && !tokenBatch) {
      const existing = findBatchBySha(workspaceId, body.fileSha256, body.accountId);
      if (existing)
        return NextResponse.json(
          {
            error: "This file was already imported",
            code: "alreadyImported",
            batchId: existing.id,
          },
          { status: 409 },
        );
    }
    const rows = coerceNormalizedRows(body.rows, { accountId: body.accountId });
    const result = saveImport({
      workspaceId,
      accountId: body.accountId,
      origin,
      rows,
      fileName: body.fileName ?? null,
      fileSha256: body.fileSha256 ?? null,
      fileSize: body.fileSize ?? null,
      sourceFormat: body.sourceFormat ?? null,
      groupId: body.groupId ?? null,
      chunkIndex: body.chunkIndex ?? null,
      clientToken: body.clientToken ?? null,
      mappingJson: body.mapping == null ? null : JSON.stringify(body.mapping),
      headerJson: body.header == null ? null : JSON.stringify(body.header),
      profileFingerprint: body.profileFingerprint ?? null,
      balance: body.balance ?? null,
      force: body.force === true,
      includePossible: body.includePossible === true,
    });
    if (body.pendingId != null) finishPending(workspaceId, body.pendingId);
    if (body.parseId) deleteParse(body.parseId);
    writeAudit({
      workspaceId,
      actor: "local",
      action: "import.commit",
      entityType: "import_batches",
      entityId: result.batchId,
      after: {
        added: result.added,
        duplicates: result.duplicates,
        skipped: result.skipped,
        origin,
        fileName: body.fileName ?? null,
      },
    });
    return NextResponse.json(result);
  });
});
