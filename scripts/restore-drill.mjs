#!/usr/bin/env node
/**
 * Restore drill: builds a snapshot, restores it locally, then exercises the portable-backup
 * format (encrypt -> decrypt -> restore) and verifies quick_check, foreign keys and row counts.
 * The reported time is the effective recovery time objective measured on this machine.
 *
 *   node scripts/restore-drill.mjs [--source path/to/penny.db]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const ROOT = path.resolve(import.meta.dirname, "..");
const MIGRATIONS = path.join(ROOT, "src/server/db/migrations");
const MAGIC = Buffer.from("PENNYBK1");
const LOG_N = 15;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MINUTES_10 = 10 * 60_000;

const arg = process.argv.indexOf("--source");
const sourceArg = arg >= 0 ? process.argv[arg + 1] : undefined;

function applyMigrations(db) {
  db.pragma("foreign_keys = ON");
  const files = fs
    .readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of files) db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  const record = db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)");
  for (const file of files) record.run(file);
}

function buildFixture(dir) {
  const file = path.join(dir, "fixture.db");
  const db = new Database(file);
  applyMigrations(db);
  const workspace = db.prepare("SELECT id FROM workspaces ORDER BY id LIMIT 1").get();
  const run = db
    .prepare(
      "INSERT INTO sync_runs (workspace_id, provider, started_at, status, scrape_from_date) VALUES (?, 'leumi', datetime('now'), 'completed', '2026-01-01')",
    )
    .run(workspace.id).lastInsertRowid;
  const insert = db.prepare(
    `INSERT INTO transactions
       (workspace_id, account_number, date, processed_date, original_amount, original_currency,
        charged_amount, charged_currency, description, type, status, provider, sync_run_id, dedup_hash)
     VALUES (?, '123', ?, ?, ?, 'ILS', ?, 'ILS', 'Drill', 'normal', 'completed', 'leumi', ?, ?)`,
  );
  db.transaction(() => {
    for (let index = 0; index < 1000; index++)
      insert.run(
        workspace.id,
        `2026-03-${String((index % 28) + 1).padStart(2, "0")}`,
        `2026-03-${String((index % 28) + 1).padStart(2, "0")}`,
        -(index + 1),
        -(index + 1),
        run,
        `drill-${index}`,
      );
  })();
  db.close();
  return file;
}

function verify(dbFile) {
  const db = new Database(dbFile, { readonly: true, fileMustExist: true });
  try {
    const check = db.pragma("quick_check", { simple: true });
    if (check !== "ok") throw new Error(`quick_check: ${check}`);
    const foreign = db.pragma("foreign_key_check");
    if (foreign.length > 0) throw new Error(`foreign_key_check: ${foreign.length}`);
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM transactions").get();
    const migrations = db.prepare("SELECT COUNT(*) AS n FROM _migrations").get().n;
    if (migrations === 0) throw new Error("no migrations");
    return { transactions: n, migrations };
  } finally {
    db.close();
  }
}

function encryptPortable(snapshotFile) {
  const database = fs.readFileSync(snapshotFile);
  const key = crypto.randomBytes(32);
  const payload = JSON.stringify({
    format: 1,
    createdAt: new Date().toISOString(),
    appVersion: "restore-drill",
    database: database.toString("base64"),
    encryptionKey: key.toString("base64"),
  });
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const derived = crypto.scryptSync("restore-drill-passphrase", salt, 32, {
    N: 1 << LOG_N,
    r: 8,
    p: 1,
    maxmem: 256 * (1 << LOG_N) * 8,
  });
  const cipher = crypto.createCipheriv("aes-256-gcm", derived, iv);
  const body = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  return Buffer.concat([MAGIC, Buffer.from([LOG_N]), salt, iv, cipher.getAuthTag(), body]);
}

function decryptPortable(file) {
  const raw = fs.readFileSync(file);
  if (!raw.subarray(0, 8).equals(MAGIC)) throw new Error("bad magic");
  const logN = raw[8];
  const salt = raw.subarray(9, 9 + SALT_BYTES);
  const iv = raw.subarray(9 + SALT_BYTES, 9 + SALT_BYTES + IV_BYTES);
  const tag = raw.subarray(9 + SALT_BYTES + IV_BYTES, 9 + SALT_BYTES + IV_BYTES + TAG_BYTES);
  const body = raw.subarray(9 + SALT_BYTES + IV_BYTES + TAG_BYTES);
  const derived = crypto.scryptSync("restore-drill-passphrase", salt, 32, {
    N: 1 << logN,
    r: 8,
    p: 1,
    maxmem: 256 * (1 << logN) * 8,
  });
  const decipher = crypto.createDecipheriv("aes-256-gcm", derived, iv);
  decipher.setAuthTag(tag);
  const payload = JSON.parse(
    Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8"),
  );
  return {
    database: Buffer.from(payload.database, "base64"),
    key: Buffer.from(payload.encryptionKey, "base64"),
  };
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "penny-restore-drill-"));
const started = Date.now();
const stages = {};
try {
  const source = sourceArg ? path.resolve(sourceArg) : buildFixture(work);
  stages.fixtureMs = Date.now() - started;

  let step = Date.now();
  const snapshot = path.join(work, "snapshot.db");
  const live = new Database(source, { readonly: true });
  try {
    live.prepare("VACUUM INTO ?").run(snapshot);
  } finally {
    live.close();
  }
  stages.snapshotMs = Date.now() - step;

  step = Date.now();
  const localDir = path.join(work, "local");
  fs.mkdirSync(localDir, { recursive: true });
  fs.copyFileSync(snapshot, path.join(localDir, "penny.db"));
  const local = verify(path.join(localDir, "penny.db"));
  stages.localRestoreMs = Date.now() - step;

  step = Date.now();
  const portable = path.join(work, "drill.penny");
  fs.writeFileSync(portable, encryptPortable(snapshot));
  const restored = decryptPortable(portable);
  const portableDb = path.join(work, "portable.db");
  fs.writeFileSync(portableDb, restored.database);
  const offsite = verify(portableDb);
  stages.portableRestoreMs = Date.now() - step;

  const totalMs = Date.now() - started;
  const report = {
    ok: local.transactions === offsite.transactions,
    source,
    transactions: local.transactions,
    migrations: local.migrations,
    totalMs,
    rtoSeconds: Math.round(totalMs / 1000),
    under10Minutes: totalMs < MINUTES_10,
    stages,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok || !report.under10Minutes) process.exitCode = 1;
} catch (error) {
  console.error(
    JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
  );
  process.exitCode = 1;
} finally {
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 3 });
}
