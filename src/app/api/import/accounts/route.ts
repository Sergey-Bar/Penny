import { ApiError, handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import {
  createAccount,
  getAccountBalance,
  listAccounts,
  mergeAccounts,
  resolveAccount,
} from "@/server/db/queries/accounts";
import { requireImportEditor, readBody } from "@/server/lib/import/request";

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
  const body = await readBody<AccountBody>(request);
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
  return NextResponse.json({
    account: createAccount(workspaceId, {
      provider: body.provider,
      kind: body.kind,
      number: body.number,
      label: body.label ?? body.number ?? "",
      currency: body.currency,
      aliases: body.aliases,
    }),
    created: true,
  });
});
