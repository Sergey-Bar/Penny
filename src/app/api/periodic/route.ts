import { handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import {
  deletePeriodic,
  dismissSuggestion,
  listPeriodic,
  periodicSuggestions,
  upsertPeriodic,
} from "@/server/db/queries/periodic";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { israelToday } from "@/server/lib/date-utils";
import type { PeriodicPayload } from "@/lib/periodic";
import { assertCanonicalAmount } from "@/lib/money-contract";

export const dynamic = "force-dynamic";

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
const text = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const amount = (v: unknown): number | null => {
  if (v === "" || v == null) return null;
  try {
    const n = assertCanonicalAmount(v);
    return n >= 0 ? n : null;
  } catch {
    return null;
  }
};

export const GET = handle("periodic", async (request: Request) => {
  const ws = getWorkspaceIdFromRequest(request);
  const payload: PeriodicPayload = {
    items: listPeriodic(ws),
    suggestions: periodicSuggestions(ws, israelToday()),
  };
  return NextResponse.json(payload);
});

function parseItem(item: Record<string, unknown>) {
  const name = text(item.name, 60);
  const amt = amount(item.amount);
  const everyMonths = Number(item.everyMonths);
  const nextDue =
    typeof item.nextDue === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(item.nextDue)
      ? item.nextDue
      : null;
  if (
    !name ||
    !amt ||
    !Number.isInteger(everyMonths) ||
    everyMonths < 1 ||
    everyMonths > 24 ||
    !nextDue
  )
    return null;
  return {
    name,
    amount: amt,
    everyMonths,
    nextDue,
    savedSoFar: amount(item.savedSoFar) ?? 0,
    autoKey: text(item.autoKey, 120),
  };
}

const INVALID = "needs a name, an amount, every 1-24 months and a due month (YYYY-MM)";

/** Body: { item } creates; { dismiss: autoKey } hides a suggestion for good. */
export const POST = handle("periodic", async (request: Request) => {
  const ws = getWorkspaceIdFromRequest(request);
  const body = await request.json().catch(() => null);
  const dismiss = text(body?.dismiss, 120);
  if (dismiss) {
    dismissSuggestion(ws, dismiss);
    return NextResponse.json({ success: true });
  }
  const item = parseItem((body?.item ?? {}) as Record<string, unknown>);
  if (!item) return bad(INVALID);
  upsertPeriodic(ws, item);
  return NextResponse.json({ success: true });
});

/** Body: { item } with item.id. */
export const PUT = handle("periodic", async (request: Request) => {
  const ws = getWorkspaceIdFromRequest(request);
  const body = await request.json().catch(() => null);
  const raw = (body?.item ?? {}) as Record<string, unknown>;
  const id = Number(raw.id);
  if (!Number.isInteger(id) || id < 1) return bad("invalid id");
  const item = parseItem(raw);
  if (!item) return bad(INVALID);
  return upsertPeriodic(ws, { ...item, id })
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: "not found" }, { status: 404 });
});

/** ?id=… */
export const DELETE = handle("periodic", async (request: Request) => {
  const ws = getWorkspaceIdFromRequest(request);
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return bad("invalid id");
  return deletePeriodic(ws, id)
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: "not found" }, { status: 404 });
});
