import { ApiError, handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import {
  createAccountResult,
  getAccountBalance,
  listAccounts,
  mergeAccounts,
  resolveAccount,
} from "@/server/db/queries/accounts";
import { requireImportEditor, readBody } from "@/server/lib/import/request";
import { z } from "zod";

const accountBodySchema = z
  .object({
    action: z.enum(["create", "resolve", "merge"]).optional(),
    provider: z.string().max(60).optional(),
    kind: z.enum(["bank", "card", "other"]).optional(),
    number: z.string().max(100).optional(),
    label: z.string().max(200).optional(),
    currency: z.string().max(12).optional(),
    aliases: z.array(z.string().max(200)).max(20).optional(),
    accountId: z.number().int().positive().optional(),
    sourceId: z.number().int().positive().optional(),
    targetId: z.number().int().positive().optional(),
    create: z.boolean().optional(),
  })
  .strict();

/** GET /api/import/accounts — the workspace's accounts and their latest balance. */
export const GET = handle("import/accounts", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json({
    accounts: listAccounts(workspaceId).map((account) => ({
      ...account,
      balance: getAccountBalance(workspaceId, account.id),
    })),
  });
});

interface AccountBody {
  action?: "create" | "resolve" | "merge";
  provider?: string;
  kind?: "bank" | "card" | "other";
  number?: string;
  label?: string;
  currency?: string;
  aliases?: string[];
  accountId?: number;
  sourceId?: number;
  targetId?: number;
  create?: boolean;
}

/** POST /api/import/accounts — create (or resolve) before preview, and merge only on request. */
export const POST = handle("import/accounts", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  requireImportEditor(request, workspaceId);
  const raw = await readBody<AccountBody>(request);
  const parsed = accountBodySchema.safeParse(raw);
  if (!parsed.success) throw new ApiError("Invalid account request", 400, "bad_json");
  const body = parsed.data;
  if (body.action === "merge") {
    if (typeof body.sourceId !== "number" || typeof body.targetId !== "number")
      throw new ApiError("sourceId and targetId are required", 400, "bad_json");
    return NextResponse.json(mergeAccounts(workspaceId, body.sourceId, body.targetId));
  }
  if (body.action === "resolve") {
    const resolved = resolveAccount(workspaceId, {
      provider: body.provider ?? null,
      kind: body.kind ?? null,
      number: body.number ?? null,
      label: body.label ?? null,
      currency: body.currency ?? null,
      create: body.create === true,
    });
    if (!resolved) throw new ApiError("Account not found", 404, "notFound");
    return NextResponse.json(resolved);
  }
  if (!body.label && !body.number)
    throw new ApiError("label or number is required", 400, "bad_json");
  const created = createAccountResult(workspaceId, {
    provider: body.provider,
    kind: body.kind,
    number: body.number,
    label: body.label ?? body.number ?? "",
    currency: body.currency,
    aliases: body.aliases,
  });
  return NextResponse.json(created);
});
