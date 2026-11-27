-- Durable backend for the local-first MVP: jobs, locks, audit, metrics, insight snapshots and
-- boundary-exact money support. Additive only; data repairs live in applyBackendV2().

-- Jobs -----------------------------------------------------------------------
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  lane TEXT NOT NULL CHECK (lane IN ('critical', 'maintenance')),
  idempotency_key TEXT,
  payload_version INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT NOT NULL DEFAULT '{}',
  state_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'leased', 'succeeded', 'dead', 'cancelled')),
  priority INTEGER NOT NULL DEFAULT 100,
  run_after TEXT NOT NULL DEFAULT (datetime('now')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  lease_owner TEXT,
  lease_expires_at TEXT,
  heartbeat_at TEXT,
  shadow INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE UNIQUE INDEX idx_jobs_ws_idempotency
  ON jobs(workspace_id, type, idempotency_key)
  WHERE workspace_id IS NOT NULL AND idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX idx_jobs_global_idempotency
  ON jobs(type, idempotency_key)
  WHERE workspace_id IS NULL AND idempotency_key IS NOT NULL;
CREATE INDEX idx_jobs_claim ON jobs(lane, status, run_after, priority, id);
CREATE INDEX idx_jobs_lease ON jobs(lease_expires_at);
CREATE INDEX idx_jobs_workspace_status ON jobs(workspace_id, status);

CREATE TABLE job_attempts (
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  error_code TEXT,
  duration_ms INTEGER,
  PRIMARY KEY (job_id, attempt)
);

-- One row per process-wide mutex (worker, sync, ...). A lease is valid until expires_at.
CREATE TABLE runtime_locks (
  name TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  meta_json TEXT
);

CREATE TABLE provider_health (
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  credential_id INTEGER NOT NULL REFERENCES bank_credentials(id) ON DELETE CASCADE,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  cooldown_until TEXT,
  last_error_code TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, credential_id)
);

CREATE TABLE metrics_daily (
  day TEXT NOT NULL,
  name TEXT NOT NULL,
  labels_json TEXT NOT NULL DEFAULT '{}',
  count INTEGER NOT NULL DEFAULT 0,
  sum REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (day, name, labels_json)
);
CREATE INDEX idx_metrics_day_name ON metrics_daily(day, name);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  actor TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  request_id TEXT,
  before_json TEXT,
  after_json TEXT,
  amount_cents INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_workspace_created ON audit_log(workspace_id, created_at);

CREATE TABLE insight_snapshots (
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  as_of TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, kind, as_of)
);

CREATE TABLE idempotency_keys (
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
  response_status INTEGER,
  response_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  PRIMARY KEY (workspace_id, key)
);

-- Sync post-processing is tracked separately from the scrape/save, which completes first.
ALTER TABLE sync_runs ADD COLUMN post_processing_status TEXT
  CHECK (post_processing_status IN ('pending', 'running', 'completed', 'failed'));
ALTER TABLE sync_runs ADD COLUMN post_processing_error_code TEXT;

-- Stable merchant key so exclusions and memory join a normalized key, not a raw description.
ALTER TABLE transactions ADD COLUMN merchant_key TEXT;
ALTER TABLE transactions ADD COLUMN merchant_key_version INTEGER NOT NULL DEFAULT 2;

-- Explainable category decisions: the source keeps living in category_origin; these add how sure
-- the engine was and why, without changing the existing category_source contract.
ALTER TABLE transactions ADD COLUMN category_confidence REAL;
ALTER TABLE transactions ADD COLUMN category_reasons_json TEXT;

-- Query indexes for the report/ops paths.
CREATE INDEX idx_transactions_ws_date_excluded ON transactions(workspace_id, date, is_excluded);
CREATE INDEX idx_transactions_ws_account_date ON transactions(workspace_id, account_id, date);
CREATE INDEX idx_transactions_ws_category_date ON transactions(workspace_id, category_id, date);
CREATE INDEX idx_transactions_ws_flow_date ON transactions(workspace_id, flow_type, date);
CREATE INDEX idx_transactions_ws_merchant ON transactions(workspace_id, merchant_key);
