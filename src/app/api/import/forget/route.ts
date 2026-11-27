import { ApiError, handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { getDb } from "@/server/db";
import { normalizeMerchant } from "@/server/lib/merchant-memory";
import { requireImportEditor, readBody } from "@/server/lib/import/request";

/**
 * POST /api/import/forget { merchant, transactionIds? }
 * Corrects a wrong memory: the merchant's learned category is deleted, and automatic categories
 * on the given rows are cleared (a human category is never removed).
 */
export const POST = handle("import/forget", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  requireImportEditor(request, workspaceId);
  const body = await readBody<{ merchant?: string; transactionIds?: number[] }>(request);
  const merchant = normalizeMerchant(body.merchant ?? "");
  if (!merchant) throw new ApiError("merchant is required", 400, "bad_json");
  const db = getDb();
  return db.transaction(() => {
    const forgotten = db
      .prepare("DELETE FROM merchant_categories WHERE workspace_id = ? AND merchant_key = ?")
      .run(workspaceId, merchant).changes;
    const ids = (body.transactionIds ?? []).filter((id) => Number.isInteger(id) && id > 0);
    let cleared = 0;
    if (ids.length > 0) {
      const placeholders = ids.map(() => "?").join(",");
      cleared = db
        .prepare(
          `UPDATE transactions SET category_id = NULL, category_source = NULL, category_origin = 'none',
             needs_review = 1, updated_at = datetime('now')
           WHERE workspace_id = ? AND id IN (${placeholders})
             AND category_origin IN ('memory','dictionary','pattern','rule','none')`,
        )
        .run(workspaceId, ...ids).changes;
    }
    return NextResponse.json({ forgotten, cleared });
  })();
});
