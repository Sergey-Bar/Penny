import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";

const MIGRATIONS = path.join(process.cwd(), "src/server/db/migrations");
const tempDirs: string[] = [];
const databases: Database.Database[] = [];

function dbThrough082(): Database.Database {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "penny-pip-migration-"));
  tempDirs.push(dir);
  const db = new Database(path.join(dir, "probe.db"));
  databases.push(db);
  db.pragma("foreign_keys = ON");
  const files = fs
    .readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql") && file < "083")
    .sort();
  for (const file of files) db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  return db;
}

afterAll(() => {
  for (const db of databases) {
    try {
      db.close();
    } catch {
      // Already closed by the test.
    }
  }
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

describe("migration 083 (Pip)", () => {
  it("adds the Pip tables and keeps workspace and thread cascades", () => {
    const db = dbThrough082();
    db.exec(fs.readFileSync(path.join(MIGRATIONS, "083_pip.sql"), "utf8"));

    for (const table of [
      "pip_threads",
      "pip_messages",
      "pip_tool_calls",
      "pip_memory",
      "pip_consents",
      "pip_feedback",
      "pip_briefings",
      "pip_agent_runs",
      "pip_approvals",
      "pip_eval_runs",
    ]) {
      expect(
        db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table),
        table,
      ).toBeTruthy();
    }

    const profileId =
      (
        db.prepare("SELECT id FROM profiles WHERE workspace_id = 1 ORDER BY id LIMIT 1").get() as
          { id: number } | undefined
      )?.id ?? null;
    const threadId = Number(
      db
        .prepare(
          "INSERT INTO pip_threads (workspace_id, profile_id, title, locale) VALUES (1, ?, 'Test', 'en')",
        )
        .run(profileId).lastInsertRowid,
    );
    const messageId = Number(
      db
        .prepare(
          "INSERT INTO pip_messages (thread_id, workspace_id, role, content, evidence_json, provider, model) VALUES (?, 1, 'assistant', 'answer', '[]', 'ollama', 'llama3.2')",
        )
        .run(threadId).lastInsertRowid,
    );
    db.prepare(
      "INSERT INTO pip_tool_calls (thread_id, message_id, workspace_id, tool_name, risk_tier, arguments_json, status) VALUES (?, ?, 1, 'cash.toPayday', 'read', '{}', 'ok')",
    ).run(threadId, messageId);
    db.prepare(
      "INSERT INTO pip_memory (workspace_id, profile_id, kind, key, value_json) VALUES (1, ?, 'goal', 'emergency_fund', '{\"months\":6}')",
    ).run(profileId);
    db.prepare(
      "INSERT INTO pip_consents (workspace_id, provider, scopes_json, granted) VALUES (1, 'claude', '[\"minimized_facts\"]', 1)",
    ).run();
    db.prepare(
      "INSERT INTO pip_briefings (workspace_id, as_of, locale, payload_json) VALUES (1, '2026-11-27', 'he', '{\"items\":[]}')",
    ).run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO pip_briefings (workspace_id, as_of, locale, payload_json) VALUES (1, '2026-11-27', 'he', '{\"items\":[]}')",
        )
        .run(),
    ).toThrow();
    db.prepare(
      "INSERT INTO pip_feedback (workspace_id, thread_id, message_id, helpful) VALUES (1, ?, ?, 1)",
    ).run(threadId, messageId);
    db.prepare(
      "INSERT INTO pip_agent_runs (workspace_id, thread_id, status, steps, tool_call_count) VALUES (1, ?, 'fallback', 2, 2)",
    ).run(threadId);
    db.prepare(
      "INSERT INTO pip_approvals (workspace_id, thread_id, action, risk_tier, status) VALUES (1, ?, 'transfer', 'external', 'pending')",
    ).run(threadId);
    db.prepare(
      "INSERT INTO pip_eval_runs (workspace_id, suite, total, passed, failed) VALUES (1, 'pip-planner-v1', 35, 35, 0)",
    ).run();

    expect(db.pragma("foreign_key_check")).toEqual([]);
    expect(
      (
        db.prepare("SELECT COUNT(*) AS n FROM pip_messages WHERE thread_id = ?").get(threadId) as {
          n: number;
        }
      ).n,
    ).toBe(1);

    db.prepare("DELETE FROM pip_threads WHERE id = ?").run(threadId);
    expect(
      (
        db.prepare("SELECT COUNT(*) AS n FROM pip_messages WHERE thread_id = ?").get(threadId) as {
          n: number;
        }
      ).n,
    ).toBe(0);
    expect(
      (
        db
          .prepare("SELECT COUNT(*) AS n FROM pip_tool_calls WHERE thread_id = ?")
          .get(threadId) as {
          n: number;
        }
      ).n,
    ).toBe(0);
    expect(
      (
        db.prepare("SELECT COUNT(*) AS n FROM pip_feedback WHERE thread_id = ?").get(threadId) as {
          n: number;
        }
      ).n,
    ).toBe(0);

    db.prepare("DELETE FROM workspaces WHERE id = 1").run();
    expect((db.prepare("SELECT COUNT(*) AS n FROM pip_briefings").get() as { n: number }).n).toBe(
      0,
    );
    expect(db.pragma("foreign_key_check")).toEqual([]);
    db.close();
  }, 180_000);
});
