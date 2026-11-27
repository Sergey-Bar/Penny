#!/usr/bin/env node
/**
 * Local backend benchmark: builds a disposable database with N transactions and times the
 * report and queue queries the app uses. Prints p50/p95; fails only above a deliberately
 * generous ceiling so a slow CI box does not produce noise.
 *
 *   node scripts/bench-backend.mjs [--rows 100000] [--runs 20]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const ROOT = path.resolve(import.meta.dirname, "..");
const MIGRATIONS = path.join(ROOT, "src/server/db/migrations");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? Number(args[index + 1]) : fallback;
};
const ROWS = Math.max(1000, option("rows", 100_000));
const RUNS = Math.max(3, option("runs", 20));
const CEILING_MS = option("ceiling", 2000);

const work = fs.mkdtempSync(path.join(os.tmpdir(), "penny-bench-"));
const dbFile = path.join(work, "bench.db");
const db = new Database(dbFile);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("foreign_keys = ON");
const migrationFiles = fs
  .readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith(".sql"))
  .sort();
for (const file of migrationFiles) db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);
const recordMigration = db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)");
for (const file of migrationFiles) recordMigration.run(file);

const workspace = db.prepare("SELECT id FROM workspaces ORDER BY id LIMIT 1").get().id;
const category = db
  .prepare("SELECT id FROM categories WHERE workspace_id = ? LIMIT 1")
  .get(workspace).id;
const account = Number(
  db
    .prepare(
      "INSERT INTO accounts (workspace_id, provider, number, label, kind) VALUES (?, 'leumi', '123', 'Bench', 'bank')",
    )
    .run(workspace).lastInsertRowid,
);
const run = db
  .prepare(
    "INSERT INTO sync_runs (workspace_id, provider, started_at, status, scrape_from_date) VALUES (?, 'leumi', datetime('now'), 'completed', '2026-01-01')",
  )
  .run(workspace).lastInsertRowid;

const insert = db.prepare(
  `INSERT INTO transactions
     (workspace_id, account_number, account_id, date, processed_date, original_amount, original_currency,
      charged_amount, charged_currency, description, type, status, provider, sync_run_id, dedup_hash,
      kind, flow_type, category_id, merchant_key)
   VALUES (?, '123', ?, ?, ?, ?, 'ILS', ?, 'ILS', ?, 'normal', 'completed', 'leumi', ?, ?, ?, ?, ?, ?)`,
);
const start = Date.now();
db.transaction(() => {
  for (let index = 0; index < ROWS; index++) {
    const day = String((index % 28) + 1).padStart(2, "0");
    const month = String((index % 12) + 1).padStart(2, "0");
    const date = `2025-${month}-${day}`;
    const amount = -((index % 500) + 1);
    insert.run(
      workspace,
      account,
      date,
      date,
      amount,
      amount,
      `Bench merchant ${index % 500}`,
      run,
      `bench-${index}`,
      "expense",
      "expense",
      category,
      `merchant-${index % 500}`,
    );
  }
})();
db.exec("ANALYZE");
const insertMs = Date.now() - start;

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

function bench(name, sql, params) {
  const stmt = db.prepare(sql);
  const times = [];
  for (let index = 0; index < RUNS; index++) {
    const at = process.hrtime.bigint();
    stmt.all(...params);
    times.push(Number(process.hrtime.bigint() - at) / 1e6);
  }
  return {
    name,
    p50Ms: Number(percentile(times, 0.5).toFixed(2)),
    p95Ms: Number(percentile(times, 0.95).toFixed(2)),
  };
}

const metrics = [];
try {
  metrics.push(
    bench(
      "transactions_by_date",
      `SELECT id FROM transactions WHERE workspace_id = ? AND date BETWEEN ? AND ?
       AND is_excluded = 0 ORDER BY date DESC, id DESC LIMIT 100`,
      [workspace, "2025-01-01", "2025-12-31"],
    ),
    bench(
      "transactions_by_merchant",
      `SELECT id FROM transactions WHERE workspace_id = ? AND merchant_key = ? LIMIT 50`,
      [workspace, "merchant-42"],
    ),
    bench(
      "transactions_by_category",
      `SELECT SUM(charged_amount) AS total FROM transactions
       WHERE workspace_id = ? AND category_id = ? AND date BETWEEN ? AND ? AND is_excluded = 0`,
      [workspace, category, "2025-01-01", "2025-12-31"],
    ),
    bench(
      "monthly_summary",
      `SELECT strftime('%Y-%m', date) AS month, SUM(-personal_amount) AS amount
       FROM transactions WHERE workspace_id = ? AND status = 'completed' AND kind = 'expense'
       GROUP BY month ORDER BY month DESC LIMIT 12`,
      [workspace],
    ),
    bench(
      "flow_totals",
      `SELECT flow_type, SUM(charged_amount) AS total FROM transactions
       WHERE workspace_id = ? AND status = 'completed' AND is_excluded = 0
       GROUP BY flow_type`,
      [workspace],
    ),
    bench(
      "category_transactions_view",
      `SELECT category_id, SUM(charged_amount) AS total FROM category_transactions
       WHERE workspace_id = ? AND date BETWEEN ? AND ? GROUP BY category_id`,
      [workspace, "2025-01-01", "2025-12-31"],
    ),
    bench(
      "idempotency_lookup",
      `SELECT request_hash FROM idempotency_keys WHERE workspace_id = ? AND key = ?`,
      [workspace, "missing"],
    ),
  );

  const plan = db
    .prepare(
      `EXPLAIN QUERY PLAN SELECT id FROM transactions WHERE workspace_id = ? AND date BETWEEN ? AND ?
       AND is_excluded = 0 ORDER BY date DESC, id DESC LIMIT 100`,
    )
    .all(workspace, "2025-01-01", "2025-12-31")
    .map((row) => row.detail)
    .join(" | ");

  const worst = Math.max(...metrics.map((metric) => metric.p95Ms));
  const report = {
    ok: worst <= CEILING_MS,
    rows: ROWS,
    runs: RUNS,
    insertMs,
    worstP95Ms: worst,
    ceilingMs: CEILING_MS,
    plan,
    metrics,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} finally {
  db.close();
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 3 });
}
