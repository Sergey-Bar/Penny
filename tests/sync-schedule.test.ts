import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";
import {
  RETRY_DELAYS_MS,
  dueRun,
  lastSlotMs,
  msUntilNextSlot,
  withDeadline,
} from "@/lib/sync-schedule";

const MIN = 60_000;
const HOUR = 60 * MIN;
// 23 November 2026 is winter time in Israel: UTC+2.
const at = (israelHHMM: string, day = 23) => {
  const [h, m] = israelHHMM.split(":").map(Number);
  return new Date(Date.UTC(2026, 10, day, h - 2, m));
};

describe("daily slot", () => {
  it("finds the next and the last 06:00 in Israel time", () => {
    expect(msUntilNextSlot("06:00", at("05:00"))).toBe(HOUR);
    expect(msUntilNextSlot("06:00", at("06:00"))).toBe(24 * HOUR);
    expect(lastSlotMs("06:00", at("09:30"))).toBe(at("06:00").getTime());
    expect(lastSlotMs("06:00", at("05:00"))).toBe(at("06:00", 22).getTime());
  });
});

describe("when the automatic sync runs", () => {
  const idle = { retryPending: false, retries: 0 };

  it("runs once per slot", () => {
    const ranToday = { ...idle, lastAttemptMs: at("06:00").getTime() };
    expect(dueRun("06:00", ranToday, at("06:01"))).toBeNull();
    expect(dueRun("06:00", ranToday, at("23:00"))).toBeNull();
    expect(dueRun("06:00", ranToday, at("06:00", 24))).toBe("full");
  });

  it("catches up once after the computer was off for days", () => {
    const lastWeek = { ...idle, lastAttemptMs: at("06:00", 16).getTime() };
    expect(dueRun("06:00", lastWeek, at("14:00"))).toBe("full");
    // That run happened at 14:00; nothing more until tomorrow's slot.
    const caughtUp = { ...idle, lastAttemptMs: at("14:00").getTime() };
    expect(dueRun("06:00", caughtUp, at("14:01"))).toBeNull();
    expect(dueRun("06:00", caughtUp, at("05:59", 24))).toBeNull();
    expect(dueRun("06:00", caughtUp, at("06:00", 24))).toBe("full");
  });

  it("runs on a first start, when there has never been an attempt", () => {
    expect(dueRun("06:00", { ...idle, lastAttemptMs: null }, at("12:00"))).toBe("full");
  });

  it("retries transient failures after 15 minutes, 1 hour and 4 hours, then waits for the next slot", () => {
    const failed = (retries: number, lastAttemptMs: number) => ({
      lastAttemptMs,
      retryPending: true,
      retries,
    });
    const t0 = at("06:00").getTime();
    expect(dueRun("06:00", failed(0, t0), new Date(t0 + 14 * MIN))).toBeNull();
    expect(dueRun("06:00", failed(0, t0), new Date(t0 + RETRY_DELAYS_MS[0]))).toBe("retry");
    expect(dueRun("06:00", failed(1, t0), new Date(t0 + 59 * MIN))).toBeNull();
    expect(dueRun("06:00", failed(1, t0), new Date(t0 + RETRY_DELAYS_MS[1]))).toBe("retry");
    expect(dueRun("06:00", failed(2, t0), new Date(t0 + RETRY_DELAYS_MS[2]))).toBe("retry");
    expect(dueRun("06:00", failed(3, t0), new Date(t0 + 12 * HOUR))).toBeNull();
  });

  it("runs once on the night clocks go back", () => {
    // 25 October 2026: 02:00 summer time becomes 01:00 winter time.
    const ranYesterday = { ...idle, lastAttemptMs: Date.UTC(2026, 9, 24, 3, 0) }; // 06:00 IDT
    expect(dueRun("06:00", ranYesterday, new Date(Date.UTC(2026, 9, 24, 23, 30)))).toBeNull(); // 01:30 IST
    expect(dueRun("06:00", ranYesterday, new Date(Date.UTC(2026, 9, 25, 4, 0)))).toBe("full"); // 06:00 IST
  });

  it("does not retry when nothing failed transiently", () => {
    const ok = { lastAttemptMs: at("06:00").getTime(), retryPending: false, retries: 0 };
    expect(dueRun("06:00", ok, at("12:00"))).toBeNull();
  });
});

describe("withDeadline", () => {
  it("returns the work when it finishes in time and the fallback when it hangs", async () => {
    expect(await withDeadline(Promise.resolve("done"), 50, () => "late")).toBe("done");
    expect(await withDeadline(new Promise<string>(() => {}), 10, () => "late")).toBe("late");
    await expect(withDeadline(Promise.reject(new Error("boom")), 50, () => "late")).rejects.toThrow(
      "boom",
    );
  });
});

const runs = vi.hoisted(() => ({
  calls: [] as number[],
}));
vi.mock("@/server/sync/orchestrator", () => ({
  syncWorkspace: async (workspaceId: number) => {
    runs.calls.push(workspaceId);
    return {
      workspaceId,
      workspaceName: "Default",
      providers: [],
      added: 0,
      updated: 0,
      categorized: 0,
      aiWarning: null,
      postProcessJobs: [],
    };
  },
}));

describe("scheduler", () => {
  let scheduler: typeof import("@/server/sync/scheduler");
  let settings: typeof import("@/server/db/queries/settings");
  let db: typeof import("@/server/db");

  beforeAll(async () => {
    process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-sched-"));
    db = await import("@/server/db");
    settings = await import("@/server/db/queries/settings");
    scheduler = await import("@/server/sync/scheduler");
  });
  beforeEach(() => {
    runs.calls.length = 0;
    for (const key of ["auto_sync_last_attempt", "auto_sync_retry_ids", "auto_sync_retries"])
      db.getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
    db.getDb().prepare("DELETE FROM jobs").run();
  });

  it("after an upgrade, waits for the usual time instead of syncing right away", async () => {
    await scheduler.runSchedulerTick();
    expect(runs.calls).toEqual([]);
    expect(settings.getGlobalSetting("auto_sync_last_attempt")).not.toBeNull();
  });

  it("runs everything when due, then not again in the same slot", async () => {
    settings.setGlobalSetting("auto_sync_last_attempt", String(Date.now() - 3 * 24 * HOUR));
    await scheduler.runSchedulerTick();
    await scheduler.runSchedulerTick();
    const ws = (db.getDb().prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: number }).id;
    expect(runs.calls).toEqual([ws]);
  });

  it("durable mode enqueues jobs instead of running inline", async () => {
    settings.setGlobalSetting("auto_sync_last_attempt", String(Date.now() - 3 * 24 * HOUR));
    const ws = (db.getDb().prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: number }).id;
    settings.setWorkspaceSetting(ws, "backend_v2", "on");
    db.getDb()
      .prepare(
        `INSERT INTO bank_credentials
           (workspace_id, provider, label, credentials_encrypted, iv, auth_tag)
         VALUES (?, 'leumi', 'Leumi', X'00', X'00', X'00')`,
      )
      .run(ws);
    await scheduler.runSchedulerTick();
    expect(runs.calls).toEqual([]);
    const job = db.getDb().prepare("SELECT type FROM jobs").get() as { type: string };
    expect(job.type).toBe("sync.run");
    settings.setWorkspaceSetting(ws, "backend_v2", "off");
    db.getDb().prepare("DELETE FROM bank_credentials").run();
  });

  it("does nothing when automatic sync is off", async () => {
    settings.setGlobalSetting("auto_sync_enabled", "false");
    await scheduler.runSchedulerTick();
    expect(runs.calls).toEqual([]);
    expect(scheduler.getNextRunAt()).toBeNull();
    settings.setGlobalSetting("auto_sync_enabled", "true");
    expect(scheduler.getNextRunAt()).not.toBeNull();
  });

  it("never syncs in demo mode", async () => {
    process.env.PENNY_DEMO = "1";
    try {
      await scheduler.runSchedulerTick();
      expect(runs.calls).toEqual([]);
    } finally {
      delete process.env.PENNY_DEMO;
    }
  });

  it("closes runs that a crash left as running", async () => {
    const { failInterruptedSyncRuns } = await import("@/server/db/queries/sync-runs");
    const ws = (db.getDb().prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: number }).id;
    db.getDb()
      .prepare(
        "INSERT INTO sync_runs (workspace_id, provider, started_at, status, scrape_from_date) VALUES (?, 'leumi', datetime('now'), 'running', '2026-11-01')",
      )
      .run(ws);
    expect(failInterruptedSyncRuns()).toBe(1);
    expect(failInterruptedSyncRuns()).toBe(0);
    const row = db
      .getDb()
      .prepare("SELECT status, completed_at FROM sync_runs ORDER BY id DESC LIMIT 1")
      .get() as { status: string; completed_at: string | null };
    expect(row.status).toBe("failed");
    expect(row.completed_at).not.toBeNull();
  });
});
