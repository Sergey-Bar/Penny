-- Allow multiple connections per investment house (e.g. family/kids accounts) with custom labels.
CREATE TABLE pension_connections_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  fund_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  credentials_encrypted BLOB NOT NULL,
  iv BLOB NOT NULL,
  auth_tag BLOB NOT NULL,
  session_encrypted BLOB,
  session_iv BLOB,
  session_auth_tag BLOB,
  last_sync_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO pension_connections_new (
  id, workspace_id, fund_id, label,
  credentials_encrypted, iv, auth_tag,
  session_encrypted, session_iv, session_auth_tag,
  last_sync_at, last_error, created_at
)
SELECT
  id, workspace_id, fund_id, '',
  credentials_encrypted, iv, auth_tag,
  session_encrypted, session_iv, session_auth_tag,
  last_sync_at, last_error, created_at
FROM pension_connections;

DROP TABLE pension_connections;
ALTER TABLE pension_connections_new RENAME TO pension_connections;
CREATE INDEX idx_pension_connections_ws ON pension_connections(workspace_id, fund_id);
