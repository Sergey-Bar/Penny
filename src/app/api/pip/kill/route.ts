import { handle, readValidatedJson } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOpsAdmin } from "@/server/lib/ops-auth";
import { isPipKillSwitch, setPipKillSwitch } from "@/server/lib/pip-mode";

export const dynamic = "force-dynamic";

const schema = z.object({ on: z.boolean() });

export const GET = handle("pip/kill", async (request: Request) => {
  requireOpsAdmin(request);
  return NextResponse.json({ killSwitch: isPipKillSwitch() });
});

export const POST = handle("pip/kill", async (request: Request) => {
  requireOpsAdmin(request);
  const body = await readValidatedJson(request, schema);
  setPipKillSwitch(body.on);
  return NextResponse.json({ killSwitch: isPipKillSwitch() });
});
