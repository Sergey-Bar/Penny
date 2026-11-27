import { handle, readValidatedJson } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  disableRemoteAccess,
  RemoteAccessError,
  remoteAccessStatus,
  setRemoteAccess,
} from "@/server/remote-access/config";

export const dynamic = "force-dynamic";

const schema = z.object({
  mode: z.enum(["off", "quick", "named"]),
  host: z.string().trim().max(253).optional(),
  teamDomain: z.string().trim().max(253).optional(),
  aud: z.string().trim().max(128).optional(),
});

export const GET = handle("remote-access", async () => {
  return NextResponse.json(remoteAccessStatus());
});

export const PUT = handle("remote-access", async (request: Request) => {
  const body = await readValidatedJson(request, schema);
  try {
    return NextResponse.json(setRemoteAccess(body));
  } catch (error) {
    if (error instanceof RemoteAccessError)
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    throw error;
  }
});

export const DELETE = handle("remote-access", async () => {
  return NextResponse.json(disableRemoteAccess());
});
