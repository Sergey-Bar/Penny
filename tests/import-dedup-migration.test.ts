import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const migration = (name: string) =>
  fs.readFileSync(path.join(process.cwd(), "src", "server", "db", "migrations", name), "utf8");

describe("088 import dedup identity upgrade", () => {
  it("backfills legacy hashes and marks existing batches complete", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER NOT NULL,
        dedup_hash TEXT NOT NULL,
        dedup_sequence INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE import_batches (id INTEGER PRIMARY KEY AUTOINCREMENT);
      INSERT INTO transactions (workspace_id, dedup_hash, dedup_sequence) VALUES (1, 'old-hash', 0);
      INSERT INTO import_batches DEFAULT VALUES;
    `);

    db.exec(migration("088_import_dedup_account_identity.sql"));

    const txn = db
      .prepare("SELECT dedup_hash, dedup_hash_legacy AS legacy FROM transactions")
      .get() as { dedup_hash: string; legacy: string };
    expect(txn).toEqual({ dedup_hash: "old-hash", legacy: "old-hash" });
    const batch = db.prepare("SELECT post_commit_status AS status FROM import_batches").get() as {
      status: string;
    };
    expect(batch.status).toBe("completed");
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pending_file_cleanup'",
        )
        .get(),
    ).toBeTruthy();
    db.close();
  });
});
