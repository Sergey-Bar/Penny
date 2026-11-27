import { handle, ApiError, readValidatedJson } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/server/db";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { isPipEnabled } from "@/server/lib/pip-mode";
import { addFeedback, latestFeedback } from "@/server/pip/repository";

export const dynamic = "force-dynamic";

const schema = z.object({
  messageId: z.number().int().positive(),
  helpful: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

function threadIdOf(raw: string): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new ApiError("Thread not found", 404, "thread_not_found");
  return id;
}

function assertMessage(workspaceId: number, threadId: number, messageId: number): void {
  const row = getDb()
    .prepare("SELECT 1 FROM pip_messages WHERE workspace_id = ? AND thread_id = ? AND id = ?")
    .get(workspaceId, threadId, messageId);
  if (!row) throw new ApiError("Message not found", 404, "message_not_found");
}

export const GET = handle(
  "pip/threads/[id]/feedback",
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const workspaceId = getWorkspaceIdFromRequest(request);
    if (!isPipEnabled(workspaceId)) throw new ApiError("Pip is disabled", 409, "pip_disabled");
    const threadId = threadIdOf((await context.params).id);
    const messageId = Number(new URL(request.url).searchParams.get("messageId"));
    if (!Number.isSafeInteger(messageId) || messageId <= 0)
      throw new ApiError("messageId is required", 400, "bad_request");
    assertMessage(workspaceId, threadId, messageId);
    return NextResponse.json({ helpful: latestFeedback(workspaceId, messageId) });
  },
);

export const POST = handle(
  "pip/threads/[id]/feedback",
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const workspaceId = getWorkspaceIdFromRequest(request);
    if (!isPipEnabled(workspaceId)) throw new ApiError("Pip is disabled", 409, "pip_disabled");
    const threadId = threadIdOf((await context.params).id);
    const body = await readValidatedJson(request, schema);
    assertMessage(workspaceId, threadId, body.messageId);
    addFeedback({
      workspaceId,
      threadId,
      messageId: body.messageId,
      helpful: body.helpful,
      reason: body.reason ?? null,
    });
    return NextResponse.json({ ok: true });
  },
);
