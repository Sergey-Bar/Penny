import { handle, ApiError, readValidatedJson } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { isPipEnabled } from "@/server/lib/pip-mode";
import { profileFromRequest } from "@/server/db/queries/profiles";
import { addMemory, deleteMemory, readMemory } from "@/server/pip/repository";

export const dynamic = "force-dynamic";

const MEMORY_KINDS = ["goal", "preference", "constraint", "decision", "life-event"] as const;

const createSchema = z.object({
  kind: z.enum(MEMORY_KINDS),
  key: z.string().trim().min(1).max(80),
  value: z.unknown(),
  confidence: z.number().min(0).max(1).default(1),
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/)
    .nullable()
    .optional(),
});

const deleteSchema = z.object({ id: z.number().int().positive() });

export const GET = handle("pip/memory", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  if (!isPipEnabled(workspaceId)) throw new ApiError("Pip is disabled", 409, "pip_disabled");
  const profile = profileFromRequest(request, workspaceId);
  const rawKind = new URL(request.url).searchParams.get("kind");
  const kind = (MEMORY_KINDS as readonly string[]).includes(rawKind ?? "") ? rawKind! : undefined;
  return NextResponse.json({ memory: readMemory(workspaceId, profile?.id ?? null, kind) });
});

export const POST = handle("pip/memory", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  if (!isPipEnabled(workspaceId)) throw new ApiError("Pip is disabled", 409, "pip_disabled");
  const body = await readValidatedJson(request, createSchema);
  if ((JSON.stringify(body.value ?? null) ?? "").length > 16_000)
    throw new ApiError("Memory value is too large", 400, "bad_request");
  const profile = profileFromRequest(request, workspaceId);
  return NextResponse.json(
    addMemory({
      workspaceId,
      profileId: profile?.id ?? null,
      kind: body.kind,
      key: body.key,
      value: body.value,
      source: "user",
      confidence: body.confidence,
      expiresAt: body.expiresAt ?? null,
    }),
    { status: 201 },
  );
});

export const DELETE = handle("pip/memory", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  if (!isPipEnabled(workspaceId)) throw new ApiError("Pip is disabled", 409, "pip_disabled");
  const body = await readValidatedJson(request, deleteSchema);
  const profile = profileFromRequest(request, workspaceId);
  const deleted = deleteMemory(workspaceId, profile?.id ?? null, body.id);
  if (!deleted) throw new ApiError("Memory not found", 404, "not_found");
  return NextResponse.json({ ok: true });
});
