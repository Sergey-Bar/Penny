import { ApiError, handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { getAppSettings } from "@/server/db/queries/settings";
import { getAllCategories } from "@/server/db/queries/categories";
import { createAIProvider } from "@/server/ai/factory";
import { categorizeImportRows } from "@/server/lib/import/categorize";
import { requireImportEditor, readBody } from "@/server/lib/import/request";
import type { CategoryKind } from "@/lib/types";
import type { ImportKind } from "@/lib/import/types";

interface SuggestRow {
  rowIndex: number;
  accountId: number;
  description: string;
  kind: ImportKind;
  refund?: boolean;
  signedAmount?: number;
  categoryId?: number | null;
}

/**
 * POST /api/import/suggest { mode: "memory"|"ai", rows }
 * Memory suggestions are deterministic and free; AI runs only when the user clicks, and never writes.
 */
export const POST = handle("import/suggest", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  requireImportEditor(request, workspaceId);
  const body = await readBody<{ mode?: "memory" | "ai"; rows?: SuggestRow[] }>(request);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) throw new ApiError("rows are required", 400, "bad_json");
  if (rows.length > 500) throw new ApiError("at most 500 rows", 413, "tooManyRows");

  if ((body.mode ?? "memory") === "memory") {
    const decisions = categorizeImportRows(
      workspaceId,
      rows.map((row) => ({
        rowIndex: row.rowIndex,
        accountId: row.accountId,
        description: row.description,
        kind: row.kind,
        refund: row.refund === true,
        signedAmount: row.signedAmount ?? (row.kind === "expense" ? -1 : 1),
        categoryId: row.categoryId ?? null,
      })),
    );
    return NextResponse.json({
      mode: "memory",
      rows: [...decisions.values()].map((decision) => ({
        rowIndex: decision.rowIndex,
        categoryId: decision.categoryId,
        source: decision.source,
        confidence: decision.confidence,
        alternatives: decision.alternatives,
      })),
    });
  }

  const settings = getAppSettings(workspaceId);
  const provider = createAIProvider();
  if (!provider || settings.aiProvider === "none")
    throw new ApiError("AI is not configured", 400, "aiNotConfigured");

  const categories = getAllCategories(workspaceId, undefined, { leavesOnly: true });
  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const results: { rowIndex: number; categoryId: number | null; categoryName: string }[] = [];
  const errors: string[] = [];
  for (const kind of ["expense", "income"] as const) {
    const mine = rows.filter((row) => row.kind === kind);
    if (mine.length === 0) continue;
    const categoryInput = categories
      .filter((c) => c.kind === (kind as CategoryKind))
      .map((c) => ({ name: c.name, description: c.description, parentName: null }));
    if (categoryInput.length === 0) continue;
    for (let i = 0; i < mine.length; i += 50) {
      const batch = mine.slice(i, i + 50);
      try {
        const mappings = await provider.categorize(
          batch.map((row) => ({
            description: row.description,
            amount: row.signedAmount ?? (kind === "expense" ? -1 : 1),
            currency: "ILS",
            memo: null,
          })),
          categoryInput,
          { allowProposals: false },
        );
        for (const mapping of mappings) {
          const row = batch[mapping.index];
          if (!row) continue;
          results.push({
            rowIndex: row.rowIndex,
            categoryId: byName.get(mapping.categoryName.toLowerCase())?.id ?? null,
            categoryName: mapping.categoryName,
          });
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "AI failed");
      }
    }
  }
  if (results.length === 0 && errors.length > 0)
    throw new ApiError("AI is not available", 503, "aiUnavailable");
  return NextResponse.json({ mode: "ai", rows: results, errors });
});
