import { handle, ApiError } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { isPipEnabled } from "@/server/lib/pip-mode";
import { deleteThread, getThread, listMessages } from "@/server/pip/repository";

export const dynamic = "force-dynamic";

function idOf(raw: string): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new ApiError("Thread not found", 404, "thread_not_found");
  return id;
}

export const GET = handle(
  "pip/threads/[id]",
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const workspaceId = getWorkspaceIdFromRequest(request);
    if (!isPipEnabled(workspaceId)) throw new ApiError("Pip is disabled", 409, "pip_disabled");
    const threadId = idOf((await context.params).id);
    const thread = getThread(workspaceId, threadId);
    if (!thread) throw new ApiError("Thread not found", 404, "thread_not_found");
    return NextResponse.json({ thread, messages: listMessages(workspaceId, threadId) });
  },
);

export const DELETE = handle(
  "pip/threads/[id]",
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const workspaceId = getWorkspaceIdFromRequest(request);
    if (!isPipEnabled(workspaceId)) throw new ApiError("Pip is disabled", 409, "pip_disabled");
    const deleted = deleteThread(workspaceId, idOf((await context.params).id));
    if (!deleted) throw new ApiError("Thread not found", 404, "thread_not_found");
    return NextResponse.json({ ok: true });
  },
);
