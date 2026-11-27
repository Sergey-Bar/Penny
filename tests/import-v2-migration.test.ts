import { describe, expect, it, beforeAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

let getDb: typeof import("@/server/db/index").getDb;
let applyImportV2: typeof import("@/server/db/migrate").applyImportV2;

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-import-mig-"));
  getDb = (await import("@/server/db/index")).getDb;
  ({ applyImportV2 } = await import("@/server/db/migrate"));
});

describe("import v2 migration", () => {
  it("backfills category keys for the seeded workspace", () => {
    const db = getDb();
    const rows = db
      .prepare(
        "SELECT name, key FROM categories WHERE workspace_id = 1 AND name IN ('Groceries','Salary','Arnona')",
      )
      .all() as { name: string; key: string | null }[];
    expect(rows).toEqual(
      expect.arrayContaining([
        { name: "Groceries", key: "groceries" },
        { name: "Salary", key: "salary" },
        { name: "Arnona", key: "arnona" },
      ]),
    );
  });

  it("links a legacy file row to an account and a batch, idempotently", () => {
    const db = getDb();
    const runId = Number(
      db
        .prepare(
          `INSERT INTO sync_runs (workspace_id, provider, started_at, completed_at, status, scrape_from_date, file_name)
           VALUES (1, 'file', datetime('now'), datetime('now'), 'completed', '1970-01-01', 'legacy.csv')`,
        )
        .run().lastInsertRowid,
    );
    db.prepare(
      `INSERT INTO transactions
         (workspace_id, account_number, date, processed_date, original_amount, original_currency,
          charged_amount, charged_currency, description, type, status, provider, sync_run_id, dedup_hash, dedup_sequence, kind)
       VALUES (1, 'LEGACY-1', '2024-01-01', '2024-01-01', -50, 'ILS', -50, 'ILS', 'שופרסל', 'normal', 'completed', 'file', ?, 'legacyhash', 0, 'expense')`,
    ).run(runId);

    applyImportV2(db);
    applyImportV2(db);

    const txn = db
      .prepare(
        `SELECT account_id AS accountId, origin, kind_source AS kindSource, memo_source AS memoSource,
                import_batch_id AS batchId
         FROM transactions WHERE dedup_hash = 'legacyhash'`,
      )
      .get() as {
      accountId: number | null;
      origin: string;
      kindSource: string;
      memoSource: string;
      batchId: number | null;
    };
    expect(txn.accountId).not.toBeNull();
    expect(txn.origin).toBe("file");
    expect(txn.kindSource).toBe("default");
    expect(txn.memoSource).toBe("file");
    expect(txn.batchId).not.toBeNull();
    const batches = db
      .prepare("SELECT COUNT(*) AS n FROM import_batches WHERE sync_run_id = ?")
      .get(runId) as { n: number };
    expect(batches.n).toBe(1);
    const rows = db
      .prepare("SELECT COUNT(*) AS n FROM import_batch_rows WHERE batch_id = ?")
      .get(txn.batchId) as { n: number };
    expect(rows.n).toBe(1);
  });

  it("backfills account_id on a balance", () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO account_balances (workspace_id, provider, account_number, balance)
       VALUES (1, 'leumi', 'LEGACY-1', 1000)`,
    ).run();
    applyImportV2(db);
    const row = db
      .prepare(
        "SELECT account_id AS accountId, source, as_of AS asOf FROM account_balances WHERE account_number = 'LEGACY-1'",
      )
      .get() as { accountId: number | null; source: string; asOf: string | null };
    expect(row.accountId).not.toBeNull();
    expect(row.source).toBe("sync");
    expect(row.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

it("backfills a bank provider and a legacy sheet batch", () => {
  const db = getDb();
  const runId = Number(
    db
      .prepare(
        `INSERT INTO sync_runs (workspace_id, provider, started_at, completed_at, status, scrape_from_date)
           VALUES (1, 'leumi', datetime('now'), datetime('now'), 'completed', '1970-01-01')`,
      )
      .run().lastInsertRowid,
  );
  const txnId = Number(
    db
      .prepare(
        `INSERT INTO transactions
             (workspace_id, account_number, date, processed_date, original_amount, original_currency,
              charged_amount, charged_currency, description, type, status, provider, sync_run_id, dedup_hash,
              dedup_sequence, kind)
           VALUES (1, 'BANK-9', '2024-01-02', '2024-01-02', -25, 'ILS', -25, 'ILS', '?????', 'normal',
                   'completed', 'leumi', ?, 'sheethash', 0, 'expense')`,
      )
      .run(runId).lastInsertRowid,
  );
  const sheetId = Number(
    db.prepare("INSERT INTO sheet_imports (workspace_id, added, skipped) VALUES (1, 1, 0)").run()
      .lastInsertRowid,
  );
  db.prepare(
    "INSERT OR IGNORE INTO sheet_import_rows (sheet_import_id, transaction_id) VALUES (?, ?)",
  ).run(sheetId, txnId);
  applyImportV2(db);
  applyImportV2(db);

  const account = db
    .prepare("SELECT id, kind FROM accounts WHERE workspace_id = 1 AND number = 'BANK-9'")
    .get() as { id: number; kind: string } | undefined;
  expect(account?.kind).toBe("bank");
  const txn = db
    .prepare(
      "SELECT account_id AS accountId, import_batch_id AS batchId FROM transactions WHERE id = ?",
    )
    .get(txnId) as { accountId: number | null; batchId: number | null };
  expect(txn.accountId).toBe(account?.id);
  const batch = db
    .prepare(
      "SELECT id, status, added, origin FROM import_batches WHERE workspace_id = 1 AND legacy_sheet_import_id = ?",
    )
    .get(sheetId) as { id: number; status: string; added: number; origin: string } | undefined;
  expect(batch).toMatchObject({ status: "saved", added: 1, origin: "sheet" });
  expect(txn.batchId).toBe(batch?.id);
  const rows = db
    .prepare("SELECT COUNT(*) AS n FROM import_batch_rows WHERE batch_id = ?")
    .get(batch?.id) as { n: number };
  expect(rows.n).toBe(1);
  const count = db
    .prepare(
      "SELECT COUNT(*) AS n FROM import_batches WHERE workspace_id = 1 AND legacy_sheet_import_id = ?",
    )
    .get(sheetId) as { n: number };
  expect(count.n).toBe(1);
});
