import "server-only";

import { NextResponse } from "next/server";
import { handle, ApiError } from "@/server/lib/api-error";
import { requireOpsAdmin } from "@/server/lib/ops-auth";
import { getDb } from "@/server/db";
import { getJob, retryDeadJob } from "@/server/jobs/queue";
import { currentRequestId } from "@/server/lib/request-context";

export const POST = handle(
  "ops/jobs/[id]/retry",
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    requireOpsAdmin(request);
    const { id } = await params;
    const jobId = Number(id);
    if (!Number.isSafeInteger(jobId) || jobId <= 0) throw new ApiError("invalid id", 400);
    const job = getJob(jobId);
    if (!job) throw new ApiError("not found", 404);
    if (!retryDeadJob(jobId)) throw new ApiError("Only a dead job can be retried", 409);
    getDb()
      .prepare(
        `INSERT INTO audit_log
           (workspace_id, actor, action, entity_type, entity_id, request_id, before_json)
         VALUES (?, 'admin', 'job.retry', 'jobs', ?, ?, ?)`,
      )
      .run(
        job.workspace_id,
        String(jobId),
        currentRequestId() ?? null,
        JSON.stringify({
          type: job.type,
          attempts: job.attempts,
          lastErrorCode: job.last_error_code,
        }),
      );
    return NextResponse.json({ success: true, id: jobId, status: "queued" });
  },
);
