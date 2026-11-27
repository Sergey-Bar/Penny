-- Import v2: one account registry, one batch history, per-row outcomes, pending folder files.
-- The legacy sync_runs/sheet_imports stay in place (transactions.sync_run_id is NOT NULL), and
-- every new batch also creates a matching sync_run so old code keeps working.

CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('bank','card','other')),
  number TEXT NOT NULL,
  label TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ILS',
  is_manual INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, provider, number, currency)
);
CREATE INDEX idx_accounts_workspace ON accounts(workspace_id, kind);
CREATE INDEX idx_accounts_number ON accounts(workspace_id, number);

CREATE TABLE account_aliases (
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  PRIMARY KEY(workspace_id, normalized_alias)
);

CREATE TABLE import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  sync_run_id INTEGER REFERENCES sync_runs(id) ON DELETE SET NULL,
  legacy_sheet_import_id INTEGER,
  group_id TEXT,
  chunk_index INTEGER,
  origin TEXT NOT NULL CHECK(origin IN ('upload','paste','folder','text','document','sheet')),
  file_name TEXT,
  file_sha256 TEXT,
  file_size INTEGER,
  source_format TEXT,
  profile_fingerprint TEXT,
  mapping_json TEXT,
  header_json TEXT,
  status TEXT NOT NULL CHECK(status IN ('saved','partial','undone','failed')),
  added INTEGER NOT NULL DEFAULT 0,
  duplicates INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  balance_as_of TEXT,
  balance_value REAL,
  client_token TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_import_batches_ws_created ON import_batches(workspace_id, created_at DESC);
CREATE INDEX idx_import_batches_group ON import_batches(workspace_id, group_id);
CREATE UNIQUE INDEX idx_import_batches_group_chunk ON import_batches(workspace_id, group_id, chunk_index) WHERE group_id IS NOT NULL;
CREATE UNIQUE INDEX idx_import_batches_client_token ON import_batches(workspace_id, client_token) WHERE client_token IS NOT NULL;
CREATE INDEX idx_import_batches_sha ON import_batches(workspace_id, file_sha256);

CREATE TABLE import_batch_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  row_index INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('added','duplicate','skipped','error','adopted')),
  reason_code TEXT,
  reason_detail TEXT,
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(batch_id, row_index)
);
CREATE INDEX idx_import_batch_rows_txn ON import_batch_rows(transaction_id);

CREATE TABLE import_pending (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_sha256 TEXT,
  size INTEGER NOT NULL,
  mtime_ms INTEGER NOT NULL,
  detected_format TEXT,
  reason_code TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending','imported','ignored','failed')) DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, path)
);
CREATE INDEX idx_import_pending_ws_status ON import_pending(workspace_id, status);

CREATE TABLE import_profiles (
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  profile_key TEXT NOT NULL,
  profile_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(workspace_id, profile_key)
);

ALTER TABLE transactions ADD COLUMN account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN origin TEXT NOT NULL DEFAULT 'sync';
ALTER TABLE transactions ADD COLUMN import_batch_id INTEGER REFERENCES import_batches(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN import_row_index INTEGER;
ALTER TABLE transactions ADD COLUMN kind_source TEXT NOT NULL DEFAULT 'sync';
ALTER TABLE transactions ADD COLUMN memo_source TEXT NOT NULL DEFAULT 'bank';
ALTER TABLE transactions ADD COLUMN category_origin TEXT NOT NULL DEFAULT 'none';
ALTER TABLE transactions ADD COLUMN adopted_at TEXT;

ALTER TABLE categories ADD COLUMN key TEXT;
CREATE UNIQUE INDEX idx_categories_key ON categories(workspace_id, key) WHERE key IS NOT NULL;

ALTER TABLE account_balances ADD COLUMN account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE account_balances ADD COLUMN source TEXT NOT NULL DEFAULT 'sync';
ALTER TABLE account_balances ADD COLUMN as_of TEXT;

CREATE INDEX idx_transactions_import_batch ON transactions(workspace_id, import_batch_id);
CREATE INDEX idx_transactions_account_date ON transactions(workspace_id, account_id, date);
CREATE INDEX idx_transactions_origin ON transactions(workspace_id, origin);
