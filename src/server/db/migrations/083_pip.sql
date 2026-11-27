CREATE TABLE pip_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'he' CHECK (locale IN ('he', 'en')),
  autonomy_level INTEGER NOT NULL DEFAULT 0 CHECK (autonomy_level BETWEEN 0 AND 4),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_message_at TEXT
);
CREATE INDEX idx_pip_threads_workspace_updated
  ON pip_threads(workspace_id, status, last_message_at DESC, id DESC);
CREATE INDEX idx_pip_threads_profile ON pip_threads(workspace_id, profile_id);

CREATE TABLE pip_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES pip_threads(id) ON DELETE CASCADE,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'complete' CHECK (status IN ('complete', 'failed', 'blocked')),
  request_id TEXT,
  provider TEXT,
  model TEXT,
  prompt_tokens INTEGER NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens INTEGER NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  cost_micros INTEGER NOT NULL DEFAULT 0 CHECK (cost_micros >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT
);
CREATE INDEX idx_pip_messages_thread_created ON pip_messages(thread_id, created_at, id);
CREATE INDEX idx_pip_messages_workspace_created ON pip_messages(workspace_id, created_at);
CREATE INDEX idx_pip_messages_expiry ON pip_messages(expires_at);

CREATE TABLE pip_tool_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES pip_threads(id) ON DELETE CASCADE,
  message_id INTEGER REFERENCES pip_messages(id) ON DELETE SET NULL,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  risk_tier TEXT NOT NULL CHECK (risk_tier IN ('read', 'memory', 'local-write', 'destructive', 'external')),
  arguments_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT,
  evidence_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error', 'blocked')),
  duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pip_tool_calls_thread_created ON pip_tool_calls(thread_id, created_at);
CREATE INDEX idx_pip_tool_calls_workspace_created ON pip_tool_calls(workspace_id, created_at);
CREATE INDEX idx_pip_tool_calls_evidence ON pip_tool_calls(evidence_id);

CREATE TABLE pip_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('goal', 'preference', 'constraint', 'decision', 'life-event')),
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'pip', 'import')),
  confidence REAL NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_pip_memory_key
  ON pip_memory(workspace_id, COALESCE(profile_id, 0), kind, key);
CREATE INDEX idx_pip_memory_workspace ON pip_memory(workspace_id, kind);
CREATE INDEX idx_pip_memory_expiry ON pip_memory(expires_at);

CREATE TABLE pip_consents (
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  granted INTEGER NOT NULL DEFAULT 0 CHECK (granted IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, provider)
);

CREATE TABLE pip_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  thread_id INTEGER NOT NULL REFERENCES pip_threads(id) ON DELETE CASCADE,
  message_id INTEGER NOT NULL REFERENCES pip_messages(id) ON DELETE CASCADE,
  helpful INTEGER NOT NULL CHECK (helpful IN (0, 1)),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pip_feedback_message ON pip_feedback(message_id);
CREATE INDEX idx_pip_feedback_workspace_created ON pip_feedback(workspace_id, created_at);

CREATE TABLE pip_briefings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  as_of TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'he' CHECK (locale IN ('he', 'en')),
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'failed', 'feedback')),
  channel TEXT NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'telegram', 'email', 'push')),
  delivered_at TEXT,
  feedback TEXT CHECK (feedback IN ('helpful', 'not_helpful', 'acted', 'dismissed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_pip_briefings_unique
  ON pip_briefings(workspace_id, as_of, channel, locale);
CREATE INDEX idx_pip_briefings_workspace_created
  ON pip_briefings(workspace_id, created_at DESC);

CREATE TABLE pip_agent_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  thread_id INTEGER REFERENCES pip_threads(id) ON DELETE SET NULL,
  request_id TEXT,
  provider TEXT,
  model TEXT,
  status TEXT NOT NULL CHECK (status IN ('ok', 'fallback', 'failed', 'blocked')),
  steps INTEGER NOT NULL DEFAULT 0 CHECK (steps >= 0),
  tool_call_count INTEGER NOT NULL DEFAULT 0 CHECK (tool_call_count >= 0),
  prompt_tokens INTEGER NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens INTEGER NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  cost_micros INTEGER NOT NULL DEFAULT 0 CHECK (cost_micros >= 0),
  latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pip_agent_runs_workspace_created
  ON pip_agent_runs(workspace_id, created_at DESC);

CREATE TABLE pip_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  thread_id INTEGER REFERENCES pip_threads(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  risk_tier TEXT NOT NULL CHECK (risk_tier IN ('local-write', 'destructive', 'external')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  resolved_by TEXT
);
CREATE INDEX idx_pip_approvals_workspace_status ON pip_approvals(workspace_id, status, created_at);

CREATE TABLE pip_eval_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  suite TEXT NOT NULL,
  total INTEGER NOT NULL CHECK (total >= 0),
  passed INTEGER NOT NULL CHECK (passed >= 0),
  failed INTEGER NOT NULL CHECK (failed >= 0),
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pip_eval_runs_created ON pip_eval_runs(created_at DESC);
