import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import { isSyncRunning, SyncBusyError, tryAcquireSync } from "@/server/sync/lock";
import { sqlTime, sqlTimeAfter } from "@/server/jobs/locks";

beforeEach(() => {
  getDb().prepare("DELETE FROM runtime_locks WHERE name = 'sync'").run();
});

describe("sync lock", () => {
  it("lets one run hold the lock and refuses the second", () => {
    const release = tryAcquireSync("manual");
    expect(release).not.toBeNull();
    expect(isSyncRunning()).toBe(true);
    expect(tryAcquireSync("scheduled")).toBeNull();
    release?.();
    expect(isSyncRunning()).toBe(false);
    expect(tryAcquireSync("scheduled")).not.toBeNull();
  });

  it("releases only once, and never releases a newer lock", () => {
    const first = tryAcquireSync("manual");
    first?.();
    first?.();
    const second = tryAcquireSync("manual");
    first?.();
    expect(isSyncRunning()).toBe(true);
    second?.();
    expect(isSyncRunning()).toBe(false);
  });

  it("takes over an expired lock", () => {
    getDb()
      .prepare(
        `INSERT INTO runtime_locks (name, owner, acquired_at, heartbeat_at, expires_at)
         VALUES ('sync', 'dead-process', ?, ?, ?)`,
      )
      .run(
        sqlTime(Date.now() - 10 * 60_000),
        sqlTime(Date.now() - 10 * 60_000),
        sqlTime(Date.now() - 5 * 60_000),
      );
    expect(isSyncRunning()).toBe(false);
    expect(tryAcquireSync("manual")).not.toBeNull();
  });

  it("reports a live lease and heartbeats it", () => {
    const lease = tryAcquireSync("manual", 60)!;
    expect(lease.heartbeat()).toBe(true);
    const row = getDb()
      .prepare("SELECT expires_at FROM runtime_locks WHERE name = 'sync'")
      .get() as { expires_at: string };
    expect(row.expires_at >= sqlTimeAfter(30)).toBe(true);
  });

  it("carries a recognisable name for callers that cannot import the class", () => {
    expect(new SyncBusyError().name).toBe("SyncBusyError");
  });
});
