import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import { createSyncRun, markSyncPostProcessing } from "@/server/db/queries/sync-runs";
import { runPostProcess } from "@/server/sync/post-process";

let credentialId = 0;
function reset() {
  const db = getDb();
  db.prepare("DELETE FROM flow_matches").run();
  db.prepare("DELETE FROM transactions").run();
  db.prepare("DELETE FROM excluded_merchants").run();
  db.prepare("DELETE FROM sync_runs").run();
  db.prepare("DELETE FROM jobs").run();
  db.prepare("DELETE FROM bank_credentials").run();
  credentialId = Number(
    db
      .prepare(
        `INSERT INTO bank_credentials (workspace_id, provider, label, credentials_encrypted, iv, auth_tag)
       VALUES (1, 'leumi', 'Leumi', X'00', X'00', X'00')`,
      )
      .run().lastInsertRowid,
  );
}

function context(syncRunId: number | null, shadow = false, state: Record<string, unknown> = {}) {
  const events: { event: string; data: Record<string, unknown> }[] = [];
  return {
    events,
    ctx: {
      workspaceId: 1,
      syncRunId,
      shadow,
      state,
      saveState: (patch: Record<string, unknown>) => Object.assign(state, patch),
      emit: (event: string, data: Record<string, unknown>) => events.push({ event, data }),
    },
  };
}

beforeEach(reset);

describe("post-process checkpoints", () => {
  it("runs every step once and completes the sync run", () => {
    const runId = createSyncRun(1, "leumi", credentialId, "2026-01-01");
    const { ctx, events } = context(runId);
    const result = runPostProcess(ctx);
    expect(result.stepsDone).toEqual([
      "merchant-rules",
      "rules",
      "flow-pairing",
      "local-categorization",
      "goal-rules",
    ]);
    const run = getDb()
      .prepare("SELECT post_processing_status AS status FROM sync_runs WHERE id = ?")
      .get(runId) as { status: string };
    expect(run.status).toBe("completed");
    expect(events.filter((event) => event.data.done === false)).toHaveLength(5);
  });

  it("skips steps already in state", () => {
    const runId = createSyncRun(1, "leumi", credentialId, "2026-01-01");
    const { ctx, events } = context(runId, false, {
      stepsDone: ["merchant-rules", "rules"],
      counts: { rules: 2 },
    });
    const result = runPostProcess(ctx);
    expect(result.counts.rules).toBe(2);
    expect(events).toHaveLength(6);
  });

  it("marks the run failed when a step throws", () => {
    const runId = createSyncRun(1, "leumi", credentialId, "2026-01-01");
    const db = getDb();
    db.prepare("DROP TABLE IF EXISTS flow_matches").run();
    try {
      const { ctx } = context(runId);
      expect(() => runPostProcess(ctx)).toThrow();
      const run = db
        .prepare("SELECT post_processing_status AS status FROM sync_runs WHERE id = ?")
        .get(runId) as { status: string };
      expect(run.status).toBe("failed");
    } finally {
      // Recreate the table for the next test in this file.
      db.exec(`CREATE TABLE IF NOT EXISTS flow_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        primary_txn_id INTEGER NOT NULL,
        other_txn_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        before_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
    }
  });

  it("records shadow predictions without marking the run", () => {
    const runId = createSyncRun(1, "leumi", credentialId, "2026-01-01");
    markSyncPostProcessing(runId, "pending");
    const { ctx } = context(runId, true);
    runPostProcess(ctx);
    const run = getDb()
      .prepare("SELECT post_processing_status AS status FROM sync_runs WHERE id = ?")
      .get(runId) as { status: string };
    expect(run.status).toBe("pending");
    const audit = getDb()
      .prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'sync.post_process.shadow'")
      .get() as { n: number };
    expect(audit.n).toBe(1);
  });
});

describe("post-process children and edge cases", () => {
  function uncategorizedTransaction() {
    const db = getDb();
    const run = createSyncRun(1, "leumi", credentialId, "2026-01-01");
    db.prepare(
      `INSERT INTO transactions
         (workspace_id, account_number, date, processed_date, original_amount, original_currency,
          charged_amount, charged_currency, description, type, status, provider, sync_run_id, dedup_hash, kind)
       VALUES (1, '123', '2026-01-01', '2026-01-01', -50, 'ILS', -50, 'ILS', 'Mystery Shop',
         'normal', 'completed', 'leumi', ?, 'post-edge', 'expense')`,
    ).run(run);
    return run;
  }

  it("enqueues AI and intelligence children when unresolved rows exist", async () => {
    const { setGlobalSetting } = await import("@/server/db/queries/settings");
    setGlobalSetting("ai_provider", "ollama");
    const runId = uncategorizedTransaction();
    const { ctx } = context(runId);
    runPostProcess(ctx);
    const types = (
      getDb().prepare("SELECT type FROM jobs ORDER BY type").all() as { type: string }[]
    ).map((row) => row.type);
    expect(types).toContain("ai.categorize");
    expect(types).toContain("intelligence.refresh");
    setGlobalSetting("ai_provider", "none");
  });

  it("tolerates a failed shadow audit and a null run id", () => {
    const db = getDb();
    db.prepare("DROP TABLE audit_log").run();
    try {
      const { ctx } = context(null, true);
      expect(() => runPostProcess(ctx)).not.toThrow();
    } finally {
      db.exec(`CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
        actor TEXT NOT NULL DEFAULT 'system',
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        request_id TEXT,
        before_json TEXT,
        after_json TEXT,
        amount_cents INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
    }
  });

  it("runs every step without a sync run", () => {
    const { ctx } = context(null);
    const result = runPostProcess(ctx);
    expect(result.stepsDone).toHaveLength(5);
  });
});
