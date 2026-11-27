import { handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { editTransactions, EditError } from "@/server/db/queries/transaction-edits";
import { withIdempotency } from "@/server/lib/http/idempotency";
import { writeAudit } from "@/server/audit/audit";
export const POST = handle("transactions/edit", async (request: Request) => {
  const ws = getWorkspaceIdFromRequest(request);
  return withIdempotency(request, ws, async () => {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body))
      return NextResponse.json({ error: "Invalid edit" }, { status: 400 });
    try {
      const result = editTransactions(getDb(), ws, body);
      writeAudit({
        workspaceId: ws,
        actor: "local",
        action: "transaction.edit",
        entityType: "transactions",
        after: body,
      });
      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof EditError)
        return NextResponse.json({ error: error.message }, { status: error.status });
      throw error;
    }
  });
});
