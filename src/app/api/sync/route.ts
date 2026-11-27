import { logError } from "@/server/lib/log";
import { handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { redact } from "@/server/lib/redact";
import { runAllWorkspaces, syncWorkspace, type WorkspaceSummary } from "@/server/sync/orchestrator";
import { getWorkspaceIdFromRequest, hasWorkspaceHeader } from "@/server/lib/workspace-context";
import { cancelOtpRequest } from "@/server/sync/otp-bridge";
import { markSyncEnd, markSyncStart } from "@/server/sync/activity";
import { tryAcquireSync } from "@/server/sync/lock";
import { DEMO_BLOCKED_MESSAGE, isDemoMode } from "@/server/demo/mode";
import { getBackendMode } from "@/server/lib/backend-mode";
import { executeLeasedJob } from "@/server/jobs/worker";
import type { JobRow } from "@/server/jobs/types";

function postProcessCategorized(job: JobRow | null): number {
  if (!job) return 0;
  try {
    const state = JSON.parse(job.state_json) as { counts?: Record<string, number> };
    const value = state.counts?.["local-categorization"];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function sseEvent(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const POST = handle("sync", async (request: Request) => {
  // The demo's credentials are placeholders, so a real scrape would only produce a login error.
  if (isDemoMode()) {
    return new Response(sseEvent("error", { message: DEMO_BLOCKED_MESSAGE }), {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }

  // One sync at a time: two scrapes of the same bank at once can trip account lockout or send 2FA twice.
  const releaseSync = tryAcquireSync("manual");
  if (!releaseSync) {
    return NextResponse.json(
      { error: "sync-running", message: "A sync is already running. Wait for it to finish." },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    credentialId?: number;
  };
  const filterCredentialId =
    body.credentialId != null && Number.isFinite(body.credentialId) ? body.credentialId : undefined;

  // When the request includes X-Workspace-ID we sync only that workspace
  // (the in-app "Sync now" button). When it's absent we treat it as a
  // multi-workspace trigger from the desktop shell and sync every workspace.
  const headerPresent = hasWorkspaceHeader(request);

  const encoder = new TextEncoder();
  const pendingSyncRunIds = new Set<number>();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        // Track sync-run IDs that opened an OTP bridge so we can cancel any
        // outstanding waits if the SSE stream is aborted (user closes the tab,
        // hits cancel, etc.). cancelOtpRequest is a no-op for already-resolved
        // IDs, so over-cancelling is safe.
        if (event === "provider-2fa-needed") {
          const id = Number(data.syncRunId);
          if (Number.isFinite(id) && id > 0) pendingSyncRunIds.add(id);
        }
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      };

      request.signal.addEventListener("abort", () => {
        for (const id of pendingSyncRunIds) {
          cancelOtpRequest(id, "Sync stream closed by client.");
        }
      });

      const headerPathTracking = headerPresent;
      if (headerPathTracking) markSyncStart("manual");
      const syncHeartbeat = setInterval(() => releaseSync.heartbeat(), 30_000);
      syncHeartbeat.unref?.();
      try {
        const summaries: WorkspaceSummary[] = [];
        if (headerPresent) {
          const workspaceId = getWorkspaceIdFromRequest(request);
          const mode = getBackendMode(workspaceId);
          summaries.push(
            await syncWorkspace(workspaceId, filterCredentialId, send, true, {
              mode: mode === "on" ? "manual" : mode === "shadow" ? "shadow" : "inline",
            }),
          );
        } else {
          summaries.push(
            ...(await runAllWorkspaces(filterCredentialId, send, "manual", {
              lockHeld: true,
              mode: "auto",
            })),
          );
        }

        // In durable mode the post-process job is executed inline, under the manual lease, and its
        // step events go to the same SSE stream. If the browser dies, the worker resumes it.
        for (const summary of summaries) {
          for (const ref of summary.postProcessJobs) {
            const job = await executeLeasedJob(
              ref.jobId,
              `manual:${ref.syncRunId}`,
              (event, data) => send(event, data),
            );
            if (job?.status === "succeeded") summary.categorized += postProcessCategorized(job);
            if (!job || job.status === "dead") {
              send("error", {
                message: "Post-processing did not finish",
                code: "post-process-failed",
              });
            }
          }
        }

        const totalAdded = summaries.reduce((s, w) => s + w.added, 0);
        const totalUpdated = summaries.reduce((s, w) => s + w.updated, 0);
        const totalCategorized = summaries.reduce((s, w) => s + w.categorized, 0);
        const firstWarning = summaries.find((w) => w.aiWarning)?.aiWarning ?? null;

        if (headerPresent && summaries.length === 1) {
          // Back-compat shape for the in-app sync UI which expects flat fields.
          const only = summaries[0];
          send("complete", {
            providers: only.providers,
            added: only.added,
            updated: only.updated,
            categorized: only.categorized,
            aiWarning: only.aiWarning,
            workspaceId: only.workspaceId,
            workspaceName: only.workspaceName,
          });
        } else {
          send("complete", {
            workspaces: summaries,
            added: totalAdded,
            updated: totalUpdated,
            categorized: totalCategorized,
            aiWarning: firstWarning,
          });
        }
      } catch (error) {
        logError("sync", error);
        const message =
          error instanceof Error ? redact(error.message) : "An unexpected error occurred";
        send("error", { message });
      } finally {
        clearInterval(syncHeartbeat);
        if (headerPathTracking) markSyncEnd();
        releaseSync();
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
