import { handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { createReconcile, ReconcileError } from "@/server/finance/reconcile";
import { israelToday } from "@/server/lib/date-utils";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { withIdempotency } from "@/server/lib/http/idempotency";
import { writeAudit } from "@/server/audit/audit";

const days = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 365 ? n : 14;
};
const ids = (v: unknown) =>
  Array.isArray(v) && v.every((x) => Number.isSafeInteger(x) && x > 0) ? (v as number[]) : null;

/** Likely duplicate pairs and pending rows older than ?days= (default 14). */
export const GET = handle("transactions/reconcile", async (request: Request) => {
  const r = createReconcile(getDb(), getWorkspaceIdFromRequest(request));
  const n = days(new URL(request.url).searchParams.get("days"));
  return NextResponse.json({ pairs: r.pairs(), stale: r.stale(n, israelToday()), days: n });
});

/** { action: "merge", keepId, dropId } | { action: "dismiss", ids: [a, b] } | { action: "remove", ids } | { action: "undo", token } */
export const POST = handle("transactions/reconcile", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return withIdempotency(request, workspaceId, async () => {
    const r = createReconcile(getDb(), workspaceId);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    try {
      const list = ids(body?.ids);
      switch (body?.action) {
        case "merge":
          if (!Number.isSafeInteger(body.keepId) || !Number.isSafeInteger(body.dropId)) break;
          {
            const result = r.merge(body.keepId as number, body.dropId as number);
            writeAudit({
              workspaceId,
              actor: "local",
              action: "reconcile.merge",
              entityType: "transactions",
              entityId: `${body.keepId}:${body.dropId}`,
              after: body,
            });
            return NextResponse.json(result);
          }
        case "dismiss":
          if (list?.length !== 2) break;
          return NextResponse.json(r.dismiss(list[0], list[1]));
        case "remove":
          if (!list) break;
          {
            const result = r.remove([...new Set(list)]);
            writeAudit({
              workspaceId,
              actor: "local",
              action: "reconcile.remove",
              entityType: "transactions",
              entityId: list.join(","),
              before: { ids: list },
            });
            return NextResponse.json(result);
          }
        case "undo":
          if (typeof body.token !== "string") break;
          return NextResponse.json(r.undo(body.token));
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    } catch (e) {
      if (e instanceof ReconcileError)
        return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }
  });
});
