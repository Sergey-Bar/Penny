import { handle, ApiError, readValidatedJson } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { isPipEnabled } from "@/server/lib/pip-mode";
import { currentRequestId } from "@/server/lib/request-context";
import { logError } from "@/server/lib/log";
import { createThread, addMessage, getThread, listMessages } from "@/server/pip/repository";
import { profileFromRequest } from "@/server/db/queries/profiles";
import { runPipAgent } from "@/server/pip/agent";
import type { PipLocale, PipStreamEvent } from "@/lib/pip";

export const dynamic = "force-dynamic";

const schema = z.object({
  threadId: z.number().int().positive().optional(),
  message: z.string().trim().min(1).max(2000),
  locale: z.enum(["he", "en"]).optional(),
});

function localeOf(value: "he" | "en" | undefined): PipLocale {
  return value ?? "he";
}

export const POST = handle("pip/chat", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  if (!isPipEnabled(workspaceId)) throw new ApiError("Pip is disabled", 409, "pip_disabled");
  const body = await readValidatedJson(request, schema);
  const locale = localeOf(body.locale);
  const profile = profileFromRequest(request, workspaceId);
  const existing = body.threadId ? getThread(workspaceId, body.threadId) : null;
  if (body.threadId && !existing) throw new ApiError("Thread not found", 404, "thread_not_found");
  const thread =
    existing ??
    createThread({
      workspaceId,
      profileId: profile?.id ?? null,
      locale,
      title: body.message.slice(0, 80),
    });
  const history = listMessages(workspaceId, thread.id, 20)
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({ role: message.role, content: message.content }));
  addMessage({
    workspaceId,
    threadId: thread.id,
    role: "user",
    content: body.message,
    requestId: currentRequestId() ?? null,
  });
  const requestId = currentRequestId() ?? crypto.randomUUID();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: PipStreamEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      send({ type: "meta", threadId: thread.id, requestId, fallback: false });
      try {
        await runPipAgent({
          workspaceId,
          profileId: profile?.id ?? null,
          locale,
          threadId: thread.id,
          question: body.message,
          requestId,
          history,
          signal: request.signal,
          onEvent: send,
        });
      } catch (error) {
        logError("pip/chat", error, { workspaceId, threadId: thread.id });
        send({
          type: "error",
          code: "pip_failed",
          message:
            locale === "he"
              ? "לא הצלחתי לענות על השאלה הזאת. אפשר לנסות שוב או לשאול שאלה ממוקדת יותר."
              : "I could not answer that question. Try again or ask a narrower question.",
        });
      } finally {
        closed = true;
        controller.close();
      }
    },
    cancel() {},
  });
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
