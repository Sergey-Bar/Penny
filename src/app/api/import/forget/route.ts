import { ApiError, handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { normalizeMerchant } from "@/server/lib/merchant-memory";
import { forgetMerchant } from "@/server/lib/import/forget";
import { requireImportEditor, readBody } from "@/server/lib/import/request";
import { z } from "zod";

const forgetSchema = z
  .object({
    merchant: z.string().min(1).max(200),
    transactionIds: z.array(z.number().int().positive()).max(500).optional(),
  })
  .strict();

/**
 * POST /api/import/forget { merchant, transactionIds? }
 * Corrects a wrong memory: the merchant's learned category is deleted, and automatic categories
 * on the given rows are cleared (a human category is never removed).
 */
export const POST = handle("import/forget", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  requireImportEditor(request, workspaceId);
  const raw = await readBody<{ merchant?: string; transactionIds?: number[] }>(request);
  const parsed = forgetSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError("merchant is required", 400, "bad_json");
  const merchant = normalizeMerchant(parsed.data.merchant);
  if (!merchant) throw new ApiError("merchant is required", 400, "bad_json");
  return NextResponse.json(forgetMerchant(workspaceId, merchant, parsed.data.transactionIds ?? []));
});
