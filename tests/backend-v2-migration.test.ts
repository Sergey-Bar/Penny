import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";
import { applyBackendV2 } from "@/server/db/backend-v2-backfill";

const MIGRATIONS = path.join(process.cwd(), "src/server/db/migrations");
const tempDirs: string[] = [];
const databases: Database.Database[] = [];

function legacyDb(): Database.Database {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "penny-v2-migration-"));
  tempDirs.push(dir);
  const db = new Database(path.join(dir, "probe.db"));
  databases.push(db);
  db.pragma("foreign_keys = ON");
  const files = fs
    .readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql") && file < "082")
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

describe("migration 082", () => {
  it("adds the durable tables, canonicalizes drift and backfills merchant keys", () => {
    const db = legacyDb();
    const categoryId = Number(
      db
        .prepare(
          "INSERT INTO categories (workspace_id, name, color, kind) VALUES (1, 'V2 Food', '#fff', 'expense')",
        )
        .run().lastInsertRowid,
    );
    const syncRunId = Number(
      db
        .prepare(
          "INSERT INTO sync_runs (workspace_id, provider, started_at, status, scrape_from_date) VALUES (1, 'leumi', datetime('now'), 'completed', '2026-01-01')",
        )
        .run().lastInsertRowid,
    );
    const insertTxn = db.prepare(
      `INSERT INTO transactions
         (workspace_id, account_number, date, processed_date, original_amount, original_currency,
          charged_amount, charged_currency, description, type, status, provider, sync_run_id, dedup_hash)
       VALUES (1, '123', '2026-01-01', '2026-01-01', ?, 'ILS', ?, 'ILS', ?, 'normal', 'completed', 'leumi', ?, ?)`,
    );
    insertTxn.run(10.000000000000002, 10.000000000000002, "PAYPAL *SPOTIFY", syncRunId, "a");
    insertTxn.run(10.004, 10.004, "spotify", syncRunId, "b");
    insertTxn.run(10.005, 10.005, "Other", syncRunId, "c");

    db.prepare(
      `INSERT INTO merchant_categories
         (workspace_id, merchant_key, category_id, kind, source, hit_count)
       VALUES (1, 'paypal *spotify', ?, 'expense', 'user', 5),
              (1, 'spotify', ?, 'expense', 'user', 1)`,
    ).run(categoryId, categoryId);

    db.exec(fs.readFileSync(path.join(MIGRATIONS, "082_backend_jobs.sql"), "utf8"));
    applyBackendV2(db);

    for (const table of [
      "jobs",
      "job_attempts",
      "runtime_locks",
      "provider_health",
      "metrics_daily",
      "audit_log",
      "insight_snapshots",
      "idempotency_keys",
    ]) {
      expect(
        db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table),
        table,
      ).toBeTruthy();
    }

    const rows = db
      .prepare("SELECT merchant_key, original_amount, charged_amount FROM transactions ORDER BY id")
      .all() as { merchant_key: string; original_amount: number; charged_amount: number }[];
    // Rounding drift is rewritten; exactly half an agora is a real difference and stays.
    expect(rows[0].original_amount).toBe(10);
    expect(rows[0].charged_amount).toBe(10);
    expect(rows[1].charged_amount).toBe(10);
    expect(rows[2].charged_amount).toBe(10.005);
    expect(rows[0].merchant_key).toBe("spotify");
    expect(rows[1].merchant_key).toBe("spotify");

    const merchant = db
      .prepare("SELECT merchant_key, hit_count FROM merchant_categories WHERE workspace_id = 1")
      .all() as { merchant_key: string; hit_count: number }[];
    expect(merchant).toEqual([{ merchant_key: "spotify", hit_count: 5 }]);
    const audit = db
      .prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'merchant_keys.merge'")
      .get() as { n: number };
    expect(audit.n).toBe(1);
    expect(db.pragma("foreign_key_check")).toEqual([]);
    db.close();
  });
});
