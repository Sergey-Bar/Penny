import { handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import {
  deletePensionConnection,
  getPensionCredentials,
  listPensionConnections,
  savePensionConnection,
  startPensionSync,
} from "@/server/pension/sync";
import { deliverOtp } from "@/server/sync/otp-bridge";
import { otpKey } from "@/server/pension/sync";
import { isPensionFund, LOGIN_FIELDS } from "@/lib/pension";
import { demoBlockedResponse } from "@/server/demo/guard";

export const dynamic = "force-dynamic";

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

export const GET = handle("pension", async (request: Request) => {
  const ws = getWorkspaceIdFromRequest(request);
  const credId = new URL(request.url).searchParams.get("credentialsId");
  if (credId != null) {
    const id = Number(credId);
    if (!Number.isInteger(id) || id <= 0) return bad("invalid connection id");
    const item = getPensionCredentials(ws, id);
    if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ connection: item });
  }
  return NextResponse.json({
    connections: listPensionConnections(ws),
  });
});

/**
 * Body: { fundId, ...the fund's LOGIN_FIELDS (id, phone, username, password) } connects (and starts the first sync);
 * { sync: connectionId } re-syncs; { otp: connectionId, code } hands over the SMS code.
 */
export const POST = handle("pension", async (request: Request) => {
  // Sign-in and sync are off in the demo; the connections there are already seeded.
  const blocked = demoBlockedResponse();
  if (blocked) return blocked;

  const ws = getWorkspaceIdFromRequest(request);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return bad("invalid JSON");

  if (body.otp != null) {
    const id = Number(body.otp);
    const code = String(body.code ?? "").trim();
    if (!Number.isInteger(id) || id <= 0 || !/^\d{4,8}$/.test(code))
      return bad("needs a connection id and a 4-8 digit code");
    const r = deliverOtp(otpKey(id), ws, code);
    return r.ok ? NextResponse.json({ success: true }) : bad(r.reason ?? "no pending code request");
  }

  if (body.sync != null) {
    const id = Number(body.sync);
    if (!Number.isInteger(id) || id <= 0) return bad("invalid connection id");
    return NextResponse.json({ started: startPensionSync(ws, id) });
  }

  const fundId = String(body.fundId ?? "");
  if (!isPensionFund(fundId)) return bad("unsupported fund");
  const fields = LOGIN_FIELDS[fundId];
  const id = String(body.id ?? "").replace(/\D/g, "");
  const phone = String(body.phone ?? "").replace(/\D/g, "");
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  if (fields.includes("id") && !/^\d{5,9}$/.test(id)) return bad("ID number must be 5-9 digits");
  if (fields.includes("phone") && !/^0\d{8,9}$/.test(phone))
    return bad("phone must be an Israeli number like 0501234567");
  if (fields.includes("username") && !username) return bad("username is required");
  if (fields.includes("password") && !password) return bad("password is required");
  const connectionIdParam = body.connectionId != null ? Number(body.connectionId) : undefined;
  const label = typeof body.label === "string" ? body.label.trim() : "";
  // Only what this fund asks for is stored.
  const given = { id: id.padStart(9, "0"), phone, username, password };
  const { id: connectionId } = savePensionConnection(
    ws,
    fundId,
    Object.fromEntries(fields.map((f) => [f, given[f]])),
    { id: connectionIdParam, label },
  );
  startPensionSync(ws, connectionId);
  return NextResponse.json({ id: connectionId });
});

export const DELETE = handle("pension", async (request: Request) => {
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return bad("invalid connection id");
  const deleteAssets = url.searchParams.get("deleteAssets") === "1";
  deletePensionConnection(getWorkspaceIdFromRequest(request), id, { deleteAssets });
  return NextResponse.json({ success: true });
});
