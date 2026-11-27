-- History of pension / investment-house sync runs (banks already have sync_runs).
CREATE TABLE pension_sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connection_id INTEGER NOT NULL,
  fund_id TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  accounts_count INTEGER,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX idx_pension_sync_logs_ws ON pension_sync_logs(workspace_id, id DESC);
