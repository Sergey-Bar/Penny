import "server-only";

import { getDb } from "@/server/db";
import type {
  PipBriefing,
  PipConsent,
  PipEvidence,
  PipMessage,
  PipRole,
  PipThread,
  PipToolCallView,
} from "@/lib/pip";
import type { PipLocale } from "@/lib/pip";

interface ThreadRow {
  id: number;
  title: string;
  locale: PipLocale;
  autonomy_level: number;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
}

interface MessageRow {
  id: number;
  thread_id: number;
  role: PipRole;
  content: string;
  evidence_json: string;
  created_at: string;
}

interface ToolRow {
  id: number;
  message_id: number | null;
  tool_name: string;
  risk_tier: PipToolCallView["riskTier"];
  status: PipToolCallView["status"];
  evidence_id: string | null;
  duration_ms: number;
  arguments_json: string;
}

function mapThread(row: ThreadRow): PipThread {
  return {
    id: row.id,
    title: row.title,
    locale: row.locale,
    autonomyLevel: row.autonomy_level,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
  };
}

function parseEvidence(json: string): PipEvidence[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as PipEvidence[]) : [];
  } catch {
    return [];
  }
}

function parseArgs(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function createThread(input: {
  workspaceId: number;
  profileId: number | null;
  locale: PipLocale;
  title?: string;
}): PipThread {
  const title = (input.title ?? (input.locale === "he" ? "שיחה חדשה" : "New conversation")).slice(
    0,
    120,
  );
  const result = getDb()
    .prepare(
      `INSERT INTO pip_threads (workspace_id, profile_id, title, locale, last_message_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
    )
    .run(input.workspaceId, input.profileId, title, input.locale);
  return getThread(input.workspaceId, Number(result.lastInsertRowid))!;
}

export function getThread(workspaceId: number, threadId: number): PipThread | null {
  const row = getDb()
    .prepare(
      `SELECT id, title, locale, autonomy_level, created_at, updated_at, last_message_at
       FROM pip_threads WHERE workspace_id = ? AND id = ? AND status != 'deleted'`,
    )
    .get(workspaceId, threadId) as ThreadRow | undefined;
  return row ? mapThread(row) : null;
}

export function listThreads(workspaceId: number, limit = 30): PipThread[] {
  const rows = getDb()
    .prepare(
      `SELECT id, title, locale, autonomy_level, created_at, updated_at, last_message_at
       FROM pip_threads WHERE workspace_id = ? AND status = 'active'
       ORDER BY COALESCE(last_message_at, updated_at) DESC, id DESC LIMIT ?`,
    )
    .all(workspaceId, Math.min(100, Math.max(1, limit))) as ThreadRow[];
  return rows.map(mapThread);
}

export function deleteThread(workspaceId: number, threadId: number): boolean {
  return (
    getDb()
      .prepare("DELETE FROM pip_threads WHERE workspace_id = ? AND id = ?")
      .run(workspaceId, threadId).changes > 0
  );
}

export function addMessage(input: {
  workspaceId: number;
  threadId: number;
  role: PipRole;
  content: string;
  evidence?: PipEvidence[];
  status?: "complete" | "failed" | "blocked";
  requestId?: string | null;
  provider?: string | null;
  model?: string | null;
  promptTokens?: number;
  completionTokens?: number;
  costMicros?: number;
}): PipMessage {
  const result = getDb()
    .prepare(
      `INSERT INTO pip_messages
        (thread_id, workspace_id, role, content, evidence_json, status, request_id, provider, model,
         prompt_tokens, completion_tokens, cost_micros)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.threadId,
      input.workspaceId,
      input.role,
      input.content.slice(0, 20_000),
      JSON.stringify(input.evidence ?? []),
      input.status ?? "complete",
      input.requestId ?? null,
      input.provider ?? null,
      input.model ?? null,
      Math.max(0, Math.trunc(input.promptTokens ?? 0)),
      Math.max(0, Math.trunc(input.completionTokens ?? 0)),
      Math.max(0, Math.trunc(input.costMicros ?? 0)),
    );
  const id = Number(result.lastInsertRowid);
  getDb()
    .prepare(
      `UPDATE pip_threads SET last_message_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    )
    .run(input.threadId);
  return {
    id,
    threadId: input.threadId,
    role: input.role,
    content: input.content,
    evidence: input.evidence ?? [],
    toolCalls: [],
    createdAt: new Date().toISOString(),
  };
}

export function listMessages(workspaceId: number, threadId: number, limit = 60): PipMessage[] {
  const rows = getDb()
    .prepare(
      `SELECT id, thread_id, role, content, evidence_json, created_at
       FROM (
         SELECT id, thread_id, role, content, evidence_json, created_at
         FROM pip_messages WHERE workspace_id = ? AND thread_id = ?
         ORDER BY created_at DESC, id DESC LIMIT ?
       ) ORDER BY created_at ASC, id ASC`,
    )
    .all(workspaceId, threadId, Math.min(200, Math.max(1, limit))) as MessageRow[];
  const toolRows = getDb()
    .prepare(
      `SELECT id, message_id, tool_name, risk_tier, status, evidence_id, duration_ms, arguments_json
       FROM pip_tool_calls WHERE workspace_id = ? AND thread_id = ? ORDER BY id`,
    )
    .all(workspaceId, threadId) as ToolRow[];
  const byMessage = new Map<number, PipToolCallView[]>();
  for (const row of toolRows) {
    if (row.message_id == null) continue;
    const list = byMessage.get(row.message_id) ?? [];
    list.push({
      id: row.id,
      tool: row.tool_name,
      riskTier: row.risk_tier,
      status: row.status,
      evidenceId: row.evidence_id,
      durationMs: row.duration_ms,
      arguments: parseArgs(row.arguments_json),
    });
    byMessage.set(row.message_id, list);
  }
  return rows.map((row) => ({
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    content: row.content,
    evidence: parseEvidence(row.evidence_json),
    toolCalls: byMessage.get(row.id) ?? [],
    createdAt: row.created_at,
  }));
}

export function addToolCall(input: {
  workspaceId: number;
  threadId: number;
  messageId?: number | null;
  tool: string;
  riskTier: PipToolCallView["riskTier"];
  arguments: unknown;
  result?: unknown;
  evidenceId?: string | null;
  status: "ok" | "error" | "blocked";
  durationMs: number;
  errorCode?: string | null;
}): number {
  const result = getDb()
    .prepare(
      `INSERT INTO pip_tool_calls
        (thread_id, message_id, workspace_id, tool_name, risk_tier, arguments_json, result_json,
         evidence_id, status, duration_ms, error_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.threadId,
      input.messageId ?? null,
      input.workspaceId,
      input.tool.slice(0, 80),
      input.riskTier,
      JSON.stringify(input.arguments ?? {}).slice(0, 16_000),
      input.result === undefined ? null : JSON.stringify(input.result).slice(0, 64_000),
      input.evidenceId ?? null,
      input.status,
      Math.max(0, Math.trunc(input.durationMs)),
      input.errorCode ?? null,
    );
  return Number(result.lastInsertRowid);
}

export function attachToolCalls(messageId: number, ids: number[]): void {
  if (ids.length === 0) return;
  const stmt = getDb().prepare("UPDATE pip_tool_calls SET message_id = ? WHERE id = ?");
  getDb().transaction(() => {
    for (const id of ids) stmt.run(messageId, id);
  })();
}

export function addFeedback(input: {
  workspaceId: number;
  threadId: number;
  messageId: number;
  helpful: boolean;
  reason?: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO pip_feedback (workspace_id, thread_id, message_id, helpful, reason)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      input.workspaceId,
      input.threadId,
      input.messageId,
      input.helpful ? 1 : 0,
      input.reason?.slice(0, 500) ?? null,
    );
}

export function latestFeedback(workspaceId: number, messageId: number): boolean | null {
  const row = getDb()
    .prepare(
      "SELECT helpful FROM pip_feedback WHERE workspace_id = ? AND message_id = ? ORDER BY id DESC LIMIT 1",
    )
    .get(workspaceId, messageId) as { helpful: number } | undefined;
  return row ? row.helpful === 1 : null;
}

function parseScopes(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function listConsent(workspaceId: number): PipConsent[] {
  const rows = getDb()
    .prepare(
      "SELECT provider, scopes_json, granted, updated_at FROM pip_consents WHERE workspace_id = ? ORDER BY provider",
    )
    .all(workspaceId) as {
    provider: string;
    scopes_json: string;
    granted: number;
    updated_at: string;
  }[];
  return rows.map((row) => ({
    provider: row.provider,
    scopes: parseScopes(row.scopes_json),
    granted: row.granted === 1,
    updatedAt: row.updated_at,
  }));
}

export function setConsent(input: {
  workspaceId: number;
  provider: string;
  scopes: string[];
  granted: boolean;
}): void {
  getDb()
    .prepare(
      `INSERT INTO pip_consents (workspace_id, provider, scopes_json, granted, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(workspace_id, provider) DO UPDATE SET
         scopes_json = excluded.scopes_json, granted = excluded.granted, updated_at = datetime('now')`,
    )
    .run(
      input.workspaceId,
      input.provider.slice(0, 60),
      JSON.stringify(input.scopes.slice(0, 20)),
      input.granted ? 1 : 0,
    );
}

export function hasConsent(workspaceId: number, provider: string): boolean {
  const row = getDb()
    .prepare("SELECT granted FROM pip_consents WHERE workspace_id = ? AND provider = ?")
    .get(workspaceId, provider) as { granted: number } | undefined;
  return row?.granted === 1;
}

export interface MemoryRow {
  id: number;
  kind: string;
  key: string;
  value: unknown;
  source: string;
  confidence: number;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function memoryFrom(row: {
  id: number;
  kind: string;
  key: string;
  value_json: string;
  source: string;
  confidence: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}): MemoryRow {
  let value: unknown = null;
  try {
    value = JSON.parse(row.value_json);
  } catch {
    value = null;
  }
  return {
    id: row.id,
    kind: row.kind,
    key: row.key,
    value,
    source: row.source,
    confidence: row.confidence,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function readMemory(
  workspaceId: number,
  profileId: number | null,
  kind?: string,
): MemoryRow[] {
  const rows = getDb()
    .prepare(
      `SELECT id, kind, key, value_json, source, confidence, expires_at, created_at, updated_at
       FROM pip_memory
       WHERE workspace_id = ? AND (profile_id = ? OR profile_id IS NULL)
         AND (expires_at IS NULL OR expires_at > datetime('now'))
         ${kind ? "AND kind = ?" : ""}
       ORDER BY updated_at DESC, id DESC LIMIT 50`,
    )
    .all(...(kind ? [workspaceId, profileId, kind] : [workspaceId, profileId])) as {
    id: number;
    kind: string;
    key: string;
    value_json: string;
    source: string;
    confidence: number;
    expires_at: string | null;
    created_at: string;
    updated_at: string;
  }[];
  return rows.map(memoryFrom);
}

export function addMemory(input: {
  workspaceId: number;
  profileId: number | null;
  kind: string;
  key: string;
  value: unknown;
  source: "user" | "pip" | "import";
  confidence: number;
  expiresAt: string | null;
}): MemoryRow {
  getDb()
    .prepare(
      `INSERT INTO pip_memory
        (workspace_id, profile_id, kind, key, value_json, source, confidence, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT DO UPDATE SET
         value_json = excluded.value_json, source = excluded.source,
         confidence = excluded.confidence, expires_at = excluded.expires_at,
         updated_at = datetime('now')`,
    )
    .run(
      input.workspaceId,
      input.profileId,
      input.kind,
      input.key.slice(0, 80),
      JSON.stringify(input.value),
      input.source,
      input.confidence,
      input.expiresAt,
    );
  const row = getDb()
    .prepare(
      `SELECT id, kind, key, value_json, source, confidence, expires_at, created_at, updated_at
       FROM pip_memory WHERE workspace_id = ? AND COALESCE(profile_id, 0) = COALESCE(?, 0)
         AND kind = ? AND key = ?`,
    )
    .get(input.workspaceId, input.profileId, input.kind, input.key) as {
    id: number;
    kind: string;
    key: string;
    value_json: string;
    source: string;
    confidence: number;
    expires_at: string | null;
    created_at: string;
    updated_at: string;
  };
  return memoryFrom(row);
}

export function deleteMemory(workspaceId: number, profileId: number | null, id: number): boolean {
  return (
    getDb()
      .prepare(
        "DELETE FROM pip_memory WHERE workspace_id = ? AND id = ? AND (profile_id = ? OR profile_id IS NULL)",
      )
      .run(workspaceId, id, profileId).changes > 0
  );
}

export function addAgentRun(input: {
  workspaceId: number;
  threadId: number;
  requestId: string;
  provider: string | null;
  model: string | null;
  status: "ok" | "fallback" | "failed" | "blocked";
  steps: number;
  toolCallCount: number;
  promptTokens: number;
  completionTokens: number;
  costMicros: number;
  latencyMs: number;
  errorCode?: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO pip_agent_runs
        (workspace_id, thread_id, request_id, provider, model, status, steps, tool_call_count,
         prompt_tokens, completion_tokens, cost_micros, latency_ms, error_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.workspaceId,
      input.threadId,
      input.requestId,
      input.provider,
      input.model,
      input.status,
      input.steps,
      input.toolCallCount,
      input.promptTokens,
      input.completionTokens,
      input.costMicros,
      input.latencyMs,
      input.errorCode ?? null,
    );
}

export function hasBriefingDelivery(
  workspaceId: number,
  asOf: string,
  channel: "in_app" | "telegram" | "email" | "push",
): boolean {
  return !!getDb()
    .prepare(
      "SELECT 1 FROM pip_briefings WHERE workspace_id = ? AND as_of = ? AND channel = ? AND delivered_at IS NOT NULL",
    )
    .get(workspaceId, asOf, channel);
}

export function saveBriefing(input: {
  workspaceId: number;
  asOf: string;
  locale: PipLocale;
  briefing: PipBriefing;
  channel?: "in_app" | "telegram" | "email" | "push";
}): void {
  getDb()
    .prepare(
      `INSERT INTO pip_briefings (workspace_id, as_of, locale, payload_json, channel, delivered_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(workspace_id, as_of, channel, locale) DO UPDATE SET
         payload_json = excluded.payload_json, status = 'ready', delivered_at = datetime('now')`,
    )
    .run(
      input.workspaceId,
      input.asOf,
      input.locale,
      JSON.stringify(input.briefing),
      input.channel ?? "in_app",
    );
}

export function latestBriefing(workspaceId: number, locale: PipLocale = "he"): PipBriefing | null {
  const row = getDb()
    .prepare(
      `SELECT payload_json FROM pip_briefings
       WHERE workspace_id = ? AND channel = 'in_app' AND locale = ?
       ORDER BY as_of DESC, id DESC LIMIT 1`,
    )
    .get(workspaceId, locale) as { payload_json: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.payload_json) as PipBriefing;
  } catch {
    return null;
  }
}

export function setBriefingFeedback(input: {
  workspaceId: number;
  asOf: string;
  locale: PipLocale;
  feedback: "helpful" | "not_helpful" | "acted" | "dismissed";
}): void {
  getDb()
    .prepare(
      `UPDATE pip_briefings SET feedback = ?, status = 'feedback'
       WHERE workspace_id = ? AND as_of = ? AND channel = 'in_app' AND locale = ?`,
    )
    .run(input.feedback, input.workspaceId, input.asOf, input.locale);
}

export function saveEvalRun(input: {
  workspaceId: number | null;
  suite: string;
  total: number;
  passed: number;
  failed: number;
  payload: unknown;
}): void {
  getDb()
    .prepare(
      `INSERT INTO pip_eval_runs (workspace_id, suite, total, passed, failed, payload_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.workspaceId,
      input.suite,
      input.total,
      input.passed,
      input.failed,
      JSON.stringify(input.payload).slice(0, 64_000),
    );
}

export function prunePipRetention(
  messageDays = 90,
  memoryDays = 730,
): {
  messages: number;
  memory: number;
  runs: number;
  briefings: number;
  evaluations: number;
} {
  const db = getDb();
  const messages = db
    .prepare(`DELETE FROM pip_messages WHERE created_at < datetime('now', ?)`)
    .run(`-${Math.max(1, messageDays)} days`).changes;
  const memory = db
    .prepare(
      `DELETE FROM pip_memory WHERE (expires_at IS NOT NULL AND expires_at < datetime('now'))
         OR updated_at < datetime('now', ?)`,
    )
    .run(`-${Math.max(30, memoryDays)} days`).changes;
  const runs = db
    .prepare("DELETE FROM pip_agent_runs WHERE created_at < datetime('now', '-180 days')")
    .run().changes;
  const briefings = db
    .prepare("DELETE FROM pip_briefings WHERE created_at < datetime('now', '-365 days')")
    .run().changes;
  const evaluations = db
    .prepare("DELETE FROM pip_eval_runs WHERE created_at < datetime('now', '-365 days')")
    .run().changes;
  return { messages, memory, runs, briefings, evaluations };
}

export function exportPipData(workspaceId: number): {
  threads: PipThread[];
  messages: PipMessage[];
  consents: PipConsent[];
  memory: MemoryRow[];
  briefings: PipBriefing[];
} {
  const threads = listThreads(workspaceId, 100);
  return {
    threads,
    messages: threads.flatMap((thread) => listMessages(workspaceId, thread.id, 200)),
    consents: listConsent(workspaceId),
    memory: readMemory(workspaceId, null),
    briefings: (() => {
      const rows = getDb()
        .prepare(
          "SELECT payload_json FROM pip_briefings WHERE workspace_id = ? ORDER BY as_of DESC LIMIT 30",
        )
        .all(workspaceId) as { payload_json: string }[];
      return rows.flatMap((row) => {
        try {
          return [JSON.parse(row.payload_json) as PipBriefing];
        } catch {
          return [];
        }
      });
    })(),
  };
}

export function wipePipData(workspaceId: number): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM pip_threads WHERE workspace_id = ?").run(workspaceId);
    db.prepare("DELETE FROM pip_memory WHERE workspace_id = ?").run(workspaceId);
    db.prepare("DELETE FROM pip_consents WHERE workspace_id = ?").run(workspaceId);
    db.prepare("DELETE FROM pip_briefings WHERE workspace_id = ?").run(workspaceId);
    db.prepare("DELETE FROM pip_agent_runs WHERE workspace_id = ?").run(workspaceId);
    db.prepare("DELETE FROM pip_approvals WHERE workspace_id = ?").run(workspaceId);
    db.prepare("DELETE FROM pip_eval_runs WHERE workspace_id = ?").run(workspaceId);
  })();
}
