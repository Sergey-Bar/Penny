-- Import dedup identity (088): equal bank rows on two accounts with the same number and
-- currency (different providers) must not collide on the old account-number-only hash.
--
-- New imports hash the account identity into dedup_hash and keep the previous hash in
-- dedup_hash_legacy, so existing rows stay readable and a code rollback can still find them.
-- Existing rows are backfilled with their current hash as the legacy hash.
ALTER TABLE transactions ADD COLUMN dedup_hash_legacy TEXT;
UPDATE transactions SET dedup_hash_legacy = dedup_hash WHERE dedup_hash_legacy IS NULL;
CREATE INDEX idx_transactions_dedup_legacy
  ON transactions(workspace_id, dedup_hash_legacy, dedup_sequence);

-- A replay must not report success while post-commit categorization/merchant/flow work is
-- unfinished. Existing batches completed before this column existed.
ALTER TABLE import_batches ADD COLUMN post_commit_status TEXT NOT NULL DEFAULT 'completed'
  CHECK(post_commit_status IN ('pending', 'running', 'completed', 'failed'));
ALTER TABLE import_batches ADD COLUMN post_commit_error TEXT;

-- Receipt files are removed only after their transaction commits. A failed unlink stays here
-- for a later sweep instead of losing a path inside a rolled-back transaction.
CREATE TABLE pending_file_cleanup (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
