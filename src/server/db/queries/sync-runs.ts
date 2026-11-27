import "server-only";

import { getDb } from "../index";
import type { SyncRun } from "@/lib/types";

export function createSyncRun(
  workspaceId: number,
  provider: string,
  credentialId: number,
  scrapeFromDate: string,
): number {
  const result = getDb()
    .prepare(
      `INSERT INTO sync_runs (workspace_id, provider, credential_id, started_at, status, scrape_from_date)
       VALUES (?, ?, ?, datetime('now'), 'running', ?)`,
    )
    .run(workspaceId, provider, credentialId, scrapeFromDate);
  return Number(result.lastInsertRowid);
}

export function completeSyncRun(
  id: number,
  added: number,
  updated: number,
  postProcessing: "pending" | "completed" = "completed",
): void {
  getDb()
    .prepare(
      `UPDATE sync_runs
       SET status = 'completed', completed_at = datetime('now'),
           transactions_added = ?, transactions_updated = ?,
           post_processing_status = ?
       WHERE id = ?`,
    )
    .run(added, updated, postProcessing, id);
}

export function markSyncPostProcessing(
  id: number,
  status: "pending" | "running" | "completed" | "failed",
  errorCode?: string | null,
): void {
  getDb()
    .prepare(
      `UPDATE sync_runs
       SET post_processing_status = ?, post_processing_error_code = ?
       WHERE id = ?`,
    )
    .run(status, errorCode ?? null, id);
}

export function failSyncRun(id: number, errorMessage: string): void {
  getDb()
    .prepare(
      `UPDATE sync_runs
       SET status = 'failed', completed_at = datetime('now'), error_message = ?
       WHERE id = ?`,
    )
    .run(errorMessage, id);
}

/**
 * Closes runs that a crash or shutdown left as "running". Call only at startup, when no sync of
 * this process can be in flight. Returns how many were closed.
 */
export function failInterruptedSyncRuns(): number {
  return getDb()
    .prepare(
      `UPDATE sync_runs
       SET status = 'failed', completed_at = datetime('now'),
           error_message = 'The app stopped during this sync. It will run again at the next sync.'
       WHERE status = 'running'`,
    )
    .run().changes;
}

/** When the newest sync of any kind started (stored as UTC "YYYY-MM-DD HH:MM:SS"), or null. */
export function latestSyncStartMs(): number | null {
  const row = getDb().prepare("SELECT MAX(started_at) AS at FROM sync_runs").get() as {
    at: string | null;
  };
  const ms = row.at ? Date.parse(`${row.at.replace(" ", "T")}Z`) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

interface ProviderStats {
  provider: string;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  transactionCount: number;
}

export function getCredentialStats(
  workspaceId: number,
  credentialId: number,
  provider: string,
): ProviderStats {
  const db = getDb();
  const lastRun = db
    .prepare(
      `SELECT completed_at, status FROM sync_runs
       WHERE workspace_id = ? AND credential_id = ? AND status = 'completed'
       ORDER BY started_at DESC, id DESC LIMIT 1`,
    )
    .get(workspaceId, credentialId) as { completed_at: string; status: string } | undefined;
  const txnCount = db
    .prepare(
      `SELECT COUNT(*) as count FROM transactions
       WHERE workspace_id = ? AND credential_id = ?`,
    )
    .get(workspaceId, credentialId) as { count: number };
  return {
    provider,
    lastSyncAt: lastRun?.completed_at ?? null,
    lastSyncStatus: lastRun?.status ?? null,
    transactionCount: txnCount.count,
  };
}

export function getLastSyncRun(workspaceId: number, provider?: string): SyncRun | null {
  const db = getDb();
  const row = provider
    ? db
        .prepare(
          `SELECT * FROM sync_runs WHERE workspace_id = ? AND provider = ? ORDER BY started_at DESC, id DESC LIMIT 1`,
        )
        .get(workspaceId, provider)
    : db
        .prepare(
          `SELECT * FROM sync_runs WHERE workspace_id = ? ORDER BY started_at DESC, id DESC LIMIT 1`,
        )
        .get(workspaceId);

  if (!row) return null;

  return mapSyncRun(row as SyncRunRow);
}

interface SyncRunRow {
  id: number;
  provider: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  error_message: string | null;
  transactions_added: number;
  transactions_updated: number;
  scrape_from_date: string;
  created_at: string;
}

function mapSyncRun(row: SyncRunRow): SyncRun {
  return {
    id: row.id,
    provider: row.provider,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status as SyncRun["status"],
    errorMessage: row.error_message,
    transactionsAdded: row.transactions_added,
    transactionsUpdated: row.transactions_updated,
    scrapeFromDate: row.scrape_from_date,
    createdAt: row.created_at,
  };
}
