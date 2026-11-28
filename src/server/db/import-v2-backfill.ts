import "server-only";

import type Database from "better-sqlite3";
import { categoryKeyForName } from "@/lib/category-keys";

/**
 * Backfill for import v2 (081). Idempotent: it only fills missing values, so a retried or
 * interrupted run converges to the same rows. Existing sync_runs/sheet_imports are never moved.
 */
export function applyImportV2(db: Database.Database): void {
  seedCategoryKeys(db);
  seedAccounts(db);
  linkTransactionsToAccounts(db);
  seedBatchesFromLegacy(db);
  backfillTransactionOrigins(db);
  linkBalances(db);
}

const CARD_PROVIDERS = new Set(["isracard", "cal", "max", "amex", "beyahadBishvilha", "behatsdaa"]);
const MANUAL_PROVIDERS = new Set(["cash", "manual"]);

function accountKindFor(provider: string): "bank" | "card" | "other" {
  if (CARD_PROVIDERS.has(provider)) return "card";
  if (MANUAL_PROVIDERS.has(provider) || provider === "file") return "other";
  return "bank";
}

const normalizeAlias = (value: string) =>
  value
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[\s"'׳״:*()]+/g, " ")
    .trim()
    .toLowerCase();

function seedCategoryKeys(db: Database.Database): void {
  const workspaceIds = db.prepare("SELECT DISTINCT workspace_id AS id FROM categories").all() as {
    id: number;
  }[];
  for (const row of workspaceIds) seedCategoryKeysForWorkspace(db, row.id);
}

/** Used for a brand-new workspace too, so its dictionary/pattern categories resolve by key. */
export function seedCategoryKeysForWorkspace(db: Database.Database, workspaceId: number): void {
  const rows = db
    .prepare("SELECT id, workspace_id, name, key FROM categories WHERE workspace_id = ?")
    .all(workspaceId) as {
    id: number;
    workspace_id: number;
    name: string;
    key: string | null;
  }[];
  const taken = new Map<number, Set<string>>();
  for (const row of rows) {
    if (!row.key) continue;
    const set = taken.get(row.workspace_id) ?? new Set<string>();
    set.add(row.key);
    taken.set(row.workspace_id, set);
  }
  const update = db.prepare("UPDATE categories SET key = ? WHERE id = ?");
  for (const row of rows) {
    if (row.key) continue;
    const key = categoryKeyForName(row.name);
    if (!key) continue;
    const set = taken.get(row.workspace_id) ?? new Set<string>();
    if (set.has(key)) continue;
    update.run(key, row.id);
    set.add(key);
    taken.set(row.workspace_id, set);
  }
}

interface AccountRow {
  workspace_id: number;
  provider: string;
  account_number: string;
  label: string | null;
}

function insertAccount(
  db: Database.Database,
  workspaceId: number,
  provider: string,
  number: string,
  label: string,
): number {
  const kind = accountKindFor(provider);
  db.prepare(
    `INSERT OR IGNORE INTO accounts (workspace_id, provider, kind, number, label, currency, is_manual)
     VALUES (?, ?, ?, ?, ?, 'ILS', ?)`,
  ).run(workspaceId, provider, kind, number, label, MANUAL_PROVIDERS.has(provider) ? 1 : 0);
  const row = db
    .prepare(
      "SELECT id FROM accounts WHERE workspace_id = ? AND provider = ? AND number = ? AND currency = 'ILS'",
    )
    .get(workspaceId, provider, number) as { id: number } | undefined;
  if (!row) throw new Error("[db] failed to seed an account");
  addAliases(db, workspaceId, row.id, [
    label,
    number,
    `${label} (${number})`,
    `${provider} (${number})`,
    provider,
  ]);
  return row.id;
}

function addAliases(
  db: Database.Database,
  workspaceId: number,
  accountId: number,
  aliases: string[],
): void {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO account_aliases (workspace_id, account_id, alias, normalized_alias)
     VALUES (?, ?, ?, ?)`,
  );
  for (const alias of aliases) {
    const clean = alias.trim();
    const normalized = normalizeAlias(clean);
    if (clean && normalized) stmt.run(workspaceId, accountId, clean, normalized);
  }
}

function accountByNumber(
  db: Database.Database,
  workspaceId: number,
  number: string,
  provider: string,
): number | null {
  const row = db
    .prepare(
      `SELECT id FROM accounts WHERE workspace_id = ? AND number = ?
       ORDER BY CASE WHEN provider = ? THEN 0 WHEN kind != 'other' THEN 1 ELSE 2 END LIMIT 1`,
    )
    .get(workspaceId, number, provider) as { id: number } | undefined;
  return row?.id ?? null;
}

function seedAccounts(db: Database.Database): void {
  const rows = db
    .prepare(
      `SELECT t.workspace_id, t.provider, t.account_number, MAX(bc.label) AS label
       FROM transactions t
       LEFT JOIN bank_credentials bc ON bc.id = t.credential_id
       WHERE t.account_id IS NULL
       GROUP BY t.workspace_id, t.provider, t.account_number`,
    )
    .all() as AccountRow[];
  for (const row of rows) {
    if (row.provider === "file") continue;
    insertAccount(
      db,
      row.workspace_id,
      row.provider,
      row.account_number,
      row.label || row.account_number,
    );
  }
}

function linkTransactionsToAccounts(db: Database.Database): void {
  const rows = db
    .prepare(
      `SELECT DISTINCT workspace_id, provider, account_number FROM transactions WHERE account_id IS NULL`,
    )
    .all() as { workspace_id: number; provider: string; account_number: string }[];
  for (const row of rows) {
    let id = accountByNumber(db, row.workspace_id, row.account_number, row.provider);
    if (id == null) {
      id = insertAccount(
        db,
        row.workspace_id,
        row.provider === "file" ? "file" : row.provider,
        row.account_number,
        row.account_number,
      );
    }
    db.prepare(
      "UPDATE transactions SET account_id = ? WHERE workspace_id = ? AND provider = ? AND account_number = ? AND account_id IS NULL",
    ).run(id, row.workspace_id, row.provider, row.account_number);
  }
}

function seedBatchesFromLegacy(db: Database.Database): void {
  const runs = db
    .prepare(
      `SELECT r.id, r.workspace_id, r.file_name, r.created_at,
              (SELECT a.account_id FROM transactions a WHERE a.sync_run_id = r.id AND a.workspace_id = r.workspace_id LIMIT 1) AS account_id,
              (SELECT COUNT(*) FROM transactions t WHERE t.sync_run_id = r.id AND t.workspace_id = r.workspace_id) AS n
       FROM sync_runs r WHERE r.provider = 'file'`,
    )
    .all() as {
    id: number;
    workspace_id: number;
    file_name: string | null;
    created_at: string;
    account_id: number | null;
    n: number;
  }[];
  const insertBatch = db.prepare(
    `INSERT INTO import_batches
       (workspace_id, account_id, sync_run_id, origin, file_name, status, added, created_at, updated_at)
     VALUES (?, ?, ?, 'upload', ?, 'saved', ?, ?, ?)`,
  );
  const findBatch = db.prepare(
    "SELECT id FROM import_batches WHERE workspace_id = ? AND sync_run_id = ?",
  );
  const txns = db.prepare(
    "SELECT id FROM transactions WHERE workspace_id = ? AND sync_run_id = ? ORDER BY id",
  );
  const insertRow = db.prepare(
    `INSERT OR IGNORE INTO import_batch_rows (batch_id, transaction_id, row_index, status)
     VALUES (?, ?, ?, 'added')`,
  );
  const link = db.prepare(
    "UPDATE transactions SET import_batch_id = ?, import_row_index = ? WHERE id = ?",
  );
  for (const run of runs) {
    const existing = findBatch.get(run.workspace_id, run.id) as { id: number } | undefined;
    const batchId =
      existing?.id ??
      Number(
        insertBatch.run(
          run.workspace_id,
          run.account_id,
          run.id,
          run.file_name,
          run.n,
          run.created_at,
          run.created_at,
        ).lastInsertRowid,
      );
    const ids = txns.all(run.workspace_id, run.id) as { id: number }[];
    ids.forEach((row, index) => {
      insertRow.run(batchId, row.id, index + 1);
      link.run(batchId, index + 1, row.id);
    });
  }

  const sheets = db
    .prepare("SELECT id, workspace_id, added, skipped, created_at FROM sheet_imports")
    .all() as {
    id: number;
    workspace_id: number;
    added: number;
    skipped: number;
    created_at: string;
  }[];
  const findSheetBatch = db.prepare(
    "SELECT id FROM import_batches WHERE workspace_id = ? AND legacy_sheet_import_id = ?",
  );
  const insertSheetBatch = db.prepare(
    `INSERT INTO import_batches
       (workspace_id, legacy_sheet_import_id, origin, status, added, skipped, created_at, updated_at)
     VALUES (?, ?, 'sheet', 'saved', ?, ?, ?, ?)`,
  );
  const sheetTxns = db.prepare(
    `SELECT r.transaction_id AS id FROM sheet_import_rows r
     JOIN sheet_imports s ON s.id = r.sheet_import_id
     WHERE r.sheet_import_id = ?`,
  );
  for (const sheet of sheets) {
    const existing = findSheetBatch.get(sheet.workspace_id, sheet.id) as { id: number } | undefined;
    const batchId =
      existing?.id ??
      Number(
        insertSheetBatch.run(
          sheet.workspace_id,
          sheet.id,
          sheet.added,
          sheet.skipped,
          sheet.created_at,
          sheet.created_at,
        ).lastInsertRowid,
      );
    const ids = sheetTxns.all(sheet.id) as { id: number }[];
    ids.forEach((row, index) => {
      insertRow.run(batchId, row.id, index + 1);
      link.run(batchId, index + 1, row.id);
    });
  }
}

function backfillTransactionOrigins(db: Database.Database): void {
  db.prepare(
    "UPDATE transactions SET origin = 'file' WHERE provider = 'file' AND origin = 'sync'",
  ).run();
  db.prepare(
    "UPDATE transactions SET origin = 'manual' WHERE provider IN ('cash','manual') AND origin = 'sync'",
  ).run();
  db.prepare(
    "UPDATE transactions SET kind_source = 'default' WHERE provider = 'file' AND kind_source = 'sync'",
  ).run();
  db.prepare(
    "UPDATE transactions SET kind_source = 'user' WHERE provider IN ('cash','manual') AND kind_source = 'sync'",
  ).run();
  db.prepare(
    "UPDATE transactions SET memo_source = 'file' WHERE provider = 'file' AND memo_source = 'bank'",
  ).run();
  db.prepare(
    "UPDATE transactions SET memo_source = 'user' WHERE provider IN ('cash','manual') AND memo_source = 'bank'",
  ).run();
  db.prepare(
    `UPDATE transactions SET category_origin = CASE category_source WHEN 'user' THEN 'user' WHEN 'ai' THEN 'ai' ELSE 'none' END
     WHERE category_origin = 'none' AND category_source IS NOT NULL`,
  ).run();
}

function linkBalances(db: Database.Database): void {
  db.prepare(
    "UPDATE account_balances SET source = 'sync' WHERE source IS NULL OR source = ''",
  ).run();
  db.prepare(
    `UPDATE account_balances SET account_id = (
       SELECT a.id FROM accounts a
       WHERE a.workspace_id = account_balances.workspace_id AND a.number = account_balances.account_number
       ORDER BY CASE WHEN a.provider = account_balances.provider THEN 0 WHEN a.kind != 'other' THEN 1 ELSE 2 END
       LIMIT 1)
     WHERE account_id IS NULL`,
  ).run();
  db.prepare(
    "UPDATE account_balances SET as_of = substr(updated_at, 1, 10) WHERE as_of IS NULL",
  ).run();
}
