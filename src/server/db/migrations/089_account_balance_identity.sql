-- Account-balance identity (089): the 025 primary key (workspace, provider, account number)
-- cannot hold two currencies of the same provider account, and a linked balance belongs to an
-- account row, not to a provider string. Rebuild with two partial unique indexes:
--   * one row per linked account id,
--   * one legacy row per provider+number while account_id is not yet known.
--
-- One-way migration: the previous image's balance upserts target the old full unique key and
-- cannot write against these partial indexes. Rolling back the image requires restoring the
-- pre-migration database backup (the updater keeps one).
CREATE TABLE account_balances_new (
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  account_number TEXT NOT NULL,
  balance REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  drift REAL,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'sync',
  as_of TEXT
);

INSERT INTO account_balances_new
  (workspace_id, provider, account_number, balance, updated_at, drift, account_id, source, as_of)
SELECT b.workspace_id, b.provider, b.account_number, b.balance, b.updated_at, b.drift,
       b.account_id, COALESCE(b.source, 'sync'), b.as_of
FROM account_balances b
WHERE b.account_id IS NULL
   OR b.rowid = (
        SELECT b2.rowid FROM account_balances b2
        WHERE b2.workspace_id = b.workspace_id AND b2.account_id = b.account_id
        ORDER BY COALESCE(b2.as_of, b2.updated_at) DESC, b2.rowid DESC
        LIMIT 1
      );

DROP TABLE account_balances;
ALTER TABLE account_balances_new RENAME TO account_balances;

CREATE UNIQUE INDEX idx_account_balances_account
  ON account_balances(workspace_id, account_id) WHERE account_id IS NOT NULL;
CREATE UNIQUE INDEX idx_account_balances_legacy
  ON account_balances(workspace_id, provider, account_number) WHERE account_id IS NULL;
CREATE INDEX idx_account_balances_workspace ON account_balances(workspace_id);
