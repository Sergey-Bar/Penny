import { handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { getAppSettings } from "@/server/db/queries/settings";
import { withIdempotency } from "@/server/lib/http/idempotency";
import { writeAudit } from "@/server/audit/audit";
import { z } from "zod";
import { moneySchema, readValidatedJson } from "@/server/lib/http/schemas";
import { EditError } from "@/server/db/queries/transaction-edits";
import {
  createManualTransaction,
  deleteManualTransaction,
  updateTransactionFields,
} from "@/server/db/queries/manual-transactions";

const manualBodySchema = z.object({ amount: moneySchema.optional() }).passthrough();
const memberIds = (ws: number) => getAppSettings(ws).household.members.map((m) => m.id);
const idParam = (request: Request) => {
  const raw = new URL(request.url).searchParams.get("id") ?? "";
  const id = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(id) || id <= 0)
    throw new EditError("id is required");
  return id;
};
function run(fn: () => unknown) {
  try {
    return NextResponse.json(fn());
  } catch (error) {
    if (error instanceof EditError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

/** Adds a manual expense or income. */
export const POST = handle("transactions/manual", async (request: Request) => {
  const ws = getWorkspaceIdFromRequest(request);
  return withIdempotency(request, ws, async () => {
    const body = await readValidatedJson(request, manualBodySchema);
    return run(() => {
      const id = createManualTransaction(getDb(), ws, body, memberIds(ws));
      writeAudit({
        workspaceId: ws,
        actor: "local",
        action: "transaction.create",
        entityType: "transactions",
        entityId: id,
        after: body,
      });
      return { id };
    });
  });
});

/** Edits ?id=: all fields of a manual row; display fields only for a bank row. */
export const PATCH = handle("transactions/manual", async (request: Request) => {
  const ws = getWorkspaceIdFromRequest(request);
  return withIdempotency(request, ws, async () => {
    const body = await readValidatedJson(request, manualBodySchema);
    return run(() => {
      const id = idParam(request);
      updateTransactionFields(getDb(), ws, id, body, memberIds(ws));
      writeAudit({
        workspaceId: ws,
        actor: "local",
        action: "transaction.update",
        entityType: "transactions",
        entityId: id,
        after: body,
      });
      return { success: true };
    });
  });
});

/** Deletes manual ?id=; returns the row so the client can offer undo (re-POST it). */
export const DELETE = handle("transactions/manual", async (request: Request) => {
  const ws = getWorkspaceIdFromRequest(request);
  return withIdempotency(request, ws, async () =>
    run(() => {
      const deleted = deleteManualTransaction(getDb(), ws, idParam(request));
      writeAudit({
        workspaceId: ws,
        actor: "local",
        action: "transaction.delete",
        entityType: "transactions",
        entityId: idParam(request),
        before: deleted,
      });
      return { deleted };
    }),
  );
});
