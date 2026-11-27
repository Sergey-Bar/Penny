import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import { completeSyncRun, createSyncRun } from "@/server/db/queries/sync-runs";
import { setWorkspaceSetting } from "@/server/db/queries/settings";
import { saveSyncTransactions } from "@/server/db/queries/transactions";
import { registerAllJobHandlers } from "@/server/jobs/handlers";
import { runLaneOnce } from "@/server/jobs/worker";

function reset() {
  const db = getDb();
  db.prepare("DELETE FROM transaction_allocations").run();
  db.prepare("DELETE FROM flow_matches").run();
  db.prepare("DELETE FROM transactions").run();
  db.prepare("DELETE FROM bank_credentials").run();
  db.prepare("DELETE FROM sync_runs").run();
  db.prepare("DELETE FROM jobs").run();
  db.prepare("DELETE FROM job_attempts").run();
  db.prepare("DELETE FROM runtime_locks").run();
  db.prepare("DELETE FROM workspace_settings WHERE key = 'backend_v2'").run();
}

function credential(): number {
  return Number(
    getDb()
      .prepare(
        `INSERT INTO bank_credentials (workspace_id, provider, label, credentials_encrypted, iv, auth_tag)
         VALUES (1, 'leumi', 'Leumi', X'00', X'00', X'00')`,
      )
      .run().lastInsertRowid,
  );
}

const row = {
  accountNumber: "123",
  date: "2026-01-01",
  processedDate: "2026-01-01",
  originalAmount: -10,
  originalCurrency: "ILS",
  chargedAmount: -10,
  description: "Spotify",
  type: "normal" as const,
  status: "completed" as const,
};

beforeEach(reset);

describe("durable sync post-processing", () => {
  it("enqueues post_process atomically with the save and the worker completes it", async () => {
    const cred = credential();
    const syncRunId = createSyncRun(1, "leumi", cred, "2026-01-01");
    const saved = saveSyncTransactions(1, [row], "leumi", cred, syncRunId, ["123"], {
      enabled: true,
      shadow: false,
    });
    setWorkspaceSetting(1, "backend_v2", "on");
    completeSyncRun(syncRunId, saved.added, saved.updated, "pending");
    expect(saved.added).toBe(1);
    setWorkspaceSetting(1, "backend_v2", "shadow");
    completeSyncRun(syncRunId, saved.added, saved.updated, "pending");
    expect(saved.postProcessJobId).toBeGreaterThan(0);
    const run = getDb()
      .prepare("SELECT post_processing_status AS status FROM sync_runs WHERE id = ?")
      .get(syncRunId) as { status: string };
    expect(run.status).toBe("pending");

    registerAllJobHandlers();
    await runLaneOnce("critical");

    const after = getDb()
      .prepare("SELECT post_processing_status AS status FROM sync_runs WHERE id = ?")
      .get(syncRunId) as { status: string };
    expect(after.status).toBe("completed");
    const job = getDb()
      .prepare("SELECT status FROM jobs WHERE id = ?")
      .get(saved.postProcessJobId) as {
      status: string;
    };
    expect(job.status).toBe("succeeded");
  });

  it("records shadow predictions without applying child jobs", async () => {
    const cred = credential();
    const syncRunId = createSyncRun(1, "leumi", cred, "2026-01-01");
    const saved = saveSyncTransactions(1, [row], "leumi", cred, syncRunId, ["123"], {
      enabled: true,
      shadow: true,
    });
    setWorkspaceSetting(1, "backend_v2", "shadow");
    completeSyncRun(syncRunId, saved.added, saved.updated, "pending");
    expect(saved.postProcessJobId).toBeGreaterThan(0);
    registerAllJobHandlers();
    await runLaneOnce("critical");
    const job = getDb()
      .prepare("SELECT shadow, status FROM jobs WHERE id = ?")
      .get(saved.postProcessJobId) as { shadow: number; status: string };
    expect(job).toEqual({ shadow: 1, status: "succeeded" });
    const audit = getDb()
      .prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'sync.post_process.shadow'")
      .get() as { n: number };
    expect(audit.n).toBe(1);
  });
});
