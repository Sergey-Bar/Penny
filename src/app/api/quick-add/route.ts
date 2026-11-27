import { handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { verifyDeviceToken } from "@/server/lib/device-tokens";
import { isKeyLocked } from "@/server/lib/encryption";
import { israelToday } from "@/server/lib/date-utils";
import { getAppSettings } from "@/server/db/queries/settings";
import { EditError } from "@/server/db/queries/transaction-edits";
import { createManualTransaction } from "@/server/db/queries/manual-transactions";
import { categorizeLocally } from "@/server/sync/categorize-local";
import { quickAddInput, underRateLimit } from "@/lib/quick-add";
import { withIdempotency } from "@/server/lib/http/idempotency";

export const dynamic = "force-dynamic";

const hits = new Map<number, number[]>();

/**
 * Quick-add from a phone automation. The proxy lets this one path skip the browser session and
 * same-origin checks, so the device token checked here is the whole authentication.
 */
export const POST = handle("quick-add", async (request: Request) => {
  if (isKeyLocked()) return NextResponse.json({ error: "locked" }, { status: 423 });
  const device = verifyDeviceToken(getDb(), request.headers.get("authorization"));
  if (!device) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!underRateLimit(hits, device.id, Date.now()))
    return NextResponse.json({ error: "too_many" }, { status: 429 });
  const ws = device.workspaceId;
  return withIdempotency(request, ws, async () => {
    const body = await request.json().catch(() => null);
    try {
      const id = createManualTransaction(
        getDb(),
        ws,
        quickAddInput(body, israelToday()),
        getAppSettings(ws).household.members.map((m) => m.id),
      );
      categorizeLocally(ws);
      return NextResponse.json({ ok: true, id });
    } catch (error) {
      if (error instanceof EditError)
        return NextResponse.json({ error: error.message }, { status: error.status });
      throw error;
    }
  });
});
