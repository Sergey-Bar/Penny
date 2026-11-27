import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import {
  isSyncRunning,
  SyncBusyError,
  tryAcquireCredentialSync,
  tryAcquireSync,
} from "@/server/sync/lock";
import { sqlTime, sqlTimeAfter } from "@/server/jobs/locks";

beforeEach(() => {
  getDb()
    .prepare("DELETE FROM runtime_locks WHERE name = 'sync' OR name LIKE 'sync:credential:%'")
    .run();
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

  it("allows different credentials to sync in parallel while blocking duplicates and full syncs", () => {
    const r1 = tryAcquireCredentialSync(1);
    const r2 = tryAcquireCredentialSync(2);
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(tryAcquireCredentialSync(1)).toBeNull();
    expect(tryAcquireSync("manual")).toBeNull();
    expect(isSyncRunning()).toBe(true);
    r1?.();
    expect(isSyncRunning()).toBe(true);
    r2?.();
    expect(isSyncRunning()).toBe(false);
    const full = tryAcquireSync("manual");
    expect(full).not.toBeNull();
    expect(tryAcquireCredentialSync(3)).toBeNull();
    full?.();
  });

  it("heartbeats and releases a credential lease once", () => {
    const lease = tryAcquireCredentialSync(7, "manual", 60)!;
    expect(lease.heartbeat()).toBe(true);
    const row = getDb()
      .prepare("SELECT expires_at FROM runtime_locks WHERE name = 'sync:credential:7'")
      .get() as { expires_at: string };
    expect(row.expires_at >= sqlTimeAfter(30)).toBe(true);
    lease();
    lease();
    expect(isSyncRunning()).toBe(false);
  });
});
