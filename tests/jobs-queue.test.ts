import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import {
  cancelJob,
  claimNextJob,
  enqueueJob,
  failJob,
  getJob,
  heartbeatJob,
  queueStats,
  retryDeadJob,
} from "@/server/jobs/queue";
import { acquireLock, releaseLock } from "@/server/jobs/locks";

beforeEach(() => {
  const db = getDb();
  db.prepare("DELETE FROM job_attempts").run();
  db.prepare("DELETE FROM jobs").run();
  db.prepare("DELETE FROM runtime_locks").run();
});

describe("job queue", () => {
  it("is idempotent by (workspace, type, key)", () => {
    const first = enqueueJob({
      workspaceId: 1,
      type: "sync.post_process",
      idempotencyKey: "k1",
      payload: { syncRunId: 1 },
    });
    const second = enqueueJob({
      workspaceId: 1,
      type: "sync.post_process",
      idempotencyKey: "k1",
      payload: { syncRunId: 1 },
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
    expect(queueStats().byStatus.queued).toBe(1);
  });

  it("claims by priority inside a lane and leaves the other lane alone", () => {
    enqueueJob({ workspaceId: 1, type: "sync.run", idempotencyKey: "sync", priority: 30 });
    enqueueJob({
      workspaceId: 1,
      type: "sync.post_process",
      idempotencyKey: "post",
      priority: 20,
    });
    enqueueJob({ workspaceId: 1, type: "backup.check", idempotencyKey: "backup" });
    const first = claimNextJob("critical", "owner-a");
    expect(first?.type).toBe("sync.post_process");
    const second = claimNextJob("critical", "owner-a");
    expect(second?.type).toBe("sync.run");
    expect(claimNextJob("critical", "owner-a")).toBeNull();
    expect(claimNextJob("maintenance", "owner-a")?.type).toBe("backup.check");
  });

  it("heartbeats, backs off and dead-letters at the attempt cap", () => {
    const { id } = enqueueJob({
      workspaceId: 1,
      type: "sync.run",
      idempotencyKey: "retry",
      maxAttempts: 2,
    });
    const first = claimNextJob("critical", "owner")!;
    expect(first.id).toBe(id);
    expect(heartbeatJob(id, "owner", 150)).toBe(true);
    expect(
      failJob({
        id,
        owner: "owner",
        errorCode: "network",
        error: "boom",
        retryDelaysMs: [0],
        maxAttempts: 2,
      }),
    ).toBe("queued");
    const queued = getJob(id)!;
    expect(queued.attempts).toBe(1);
    expect(queued.last_error_code).toBe("network");

    const second = claimNextJob("critical", "owner");
    expect(second?.id).toBe(id);
    expect(
      failJob({
        id,
        owner: "owner",
        errorCode: "network",
        error: "boom",
        retryDelaysMs: [0],
        maxAttempts: 2,
      }),
    ).toBe("dead");
    expect(getJob(id)?.status).toBe("dead");
    expect(retryDeadJob(id)).toBe(true);
    expect(getJob(id)?.status).toBe("queued");
  });

  it("can cancel a queued job and never claims it", () => {
    const { id } = enqueueJob({ workspaceId: 1, type: "sync.run", idempotencyKey: "cancel" });
    expect(cancelJob(id)).toBe(true);
    expect(claimNextJob("critical", "owner")).toBeNull();
    expect(cancelJob(id)).toBe(false);
  });

  it("creates a job already leased to a manual owner", () => {
    const { id } = enqueueJob({
      workspaceId: 1,
      type: "sync.post_process",
      idempotencyKey: "manual",
      leaseOwner: "manual:7",
    });
    expect(getJob(id)?.status).toBe("leased");
    expect(claimNextJob("critical", "worker")).toBeNull();
  });
});

describe("runtime locks", () => {
  it("lets one owner hold a lock and takes over after expiry", () => {
    expect(acquireLock("worker", "a", 60)).toBe(true);
    expect(acquireLock("worker", "b", 60)).toBe(false);
    releaseLock("worker", "a");
    expect(acquireLock("worker", "b", 60)).toBe(true);
  });
});
