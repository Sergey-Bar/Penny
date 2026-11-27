import "server-only";

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/lib/api-error";
import { currentRequestId } from "@/server/lib/request-context";

const STALE_IN_PROGRESS_MS = 5 * 60_000;
const MAX_KEY_LENGTH = 200;

interface IdempotencyRow {
  key: string;
  method: string;
  path: string;
  request_hash: string;
  status: "in_progress" | "completed";
  response_status: number | null;
  response_json: string | null;
  created_at: string;
}

function requestHash(request: Request, rawBody: string): string {
  const url = new URL(request.url);
  return createHash("sha256")
    .update(`${request.method}\n${url.pathname}\n${rawBody}`)
    .digest("hex");
}

function staleInProgress(createdAt: string): boolean {
  const at = Date.parse(`${createdAt.replace(" ", "T")}Z`);
  return Number.isFinite(at) && Date.now() - at > STALE_IN_PROGRESS_MS;
}

function auditAbandoned(workspaceId: number, row: IdempotencyRow): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO audit_log
           (workspace_id, actor, action, entity_type, entity_id, request_id, before_json)
         VALUES (?, 'system', 'idempotency.abandoned', 'idempotency_keys', ?, ?, ?)`,
      )
      .run(
        workspaceId,
        row.key,
        currentRequestId() ?? null,
        JSON.stringify({ method: row.method, path: row.path, createdAt: row.created_at }),
      );
  } catch {
    // An audit failure must not block the retry it describes.
  }
}

/**
 * Wraps a mutating handler with an optional `Idempotency-Key`. The first party client always sends
 * one; when the header is absent the handler runs unchanged. The body is read from a clone, so
 * the handler can still consume the original request.
 */
export async function withIdempotency(
  request: Request,
  workspaceId: number | null | undefined,
  run: () => Promise<Response>,
): Promise<Response> {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key) return run();
  if (!workspaceId || !Number.isSafeInteger(workspaceId))
    throw new ApiError("A workspace is required", 400, "workspace_missing");
  if (key.length > MAX_KEY_LENGTH)
    throw new ApiError("Idempotency-Key is too long", 400, "bad_idempotency_key");

  let rawBody = "";
  try {
    rawBody = await request.clone().text();
  } catch {
    // A bodyless request hashes as empty, which is still a stable identity.
  }
  const hash = requestHash(request, rawBody);
  const path = new URL(request.url).pathname;
  const db = getDb();

  const existing = db
    .prepare("SELECT * FROM idempotency_keys WHERE workspace_id = ? AND key = ?")
    .get(workspaceId, key) as IdempotencyRow | undefined;

  if (existing?.status === "completed") {
    if (existing.request_hash !== hash)
      throw new ApiError(
        "The Idempotency-Key was already used with another request",
        409,
        "idempotency_conflict",
      );
    return new NextResponse(existing.response_json ?? "{}", {
      status: existing.response_status ?? 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Idempotent-Replay": "true",
      },
    });
  }

  if (existing?.status === "in_progress") {
    if (!staleInProgress(existing.created_at))
      throw new ApiError(
        "A request with this Idempotency-Key is still running",
        409,
        "idempotency_in_progress",
      );
    auditAbandoned(workspaceId, existing);
    db.prepare("DELETE FROM idempotency_keys WHERE workspace_id = ? AND key = ?").run(
      workspaceId,
      key,
    );
  }

  db.prepare(
    `INSERT INTO idempotency_keys (workspace_id, key, method, path, request_hash, status)
     VALUES (?, ?, ?, ?, ?, 'in_progress')
     ON CONFLICT(workspace_id, key) DO UPDATE SET
       method = excluded.method,
       path = excluded.path,
       request_hash = excluded.request_hash,
       status = 'in_progress',
       response_status = NULL,
       response_json = NULL,
       created_at = datetime('now'),
       completed_at = NULL`,
  ).run(workspaceId, key, request.method, path, hash);

  let response: Response;
  try {
    response = await run();
  } catch (error) {
    db.prepare("DELETE FROM idempotency_keys WHERE workspace_id = ? AND key = ?").run(
      workspaceId,
      key,
    );
    throw error;
  }

  const contentType = response.headers.get("content-type") ?? "";
  // Streams and downloads cannot be replayed from a stored string.
  if (contentType.includes("text/event-stream") || !response.body) {
    db.prepare("DELETE FROM idempotency_keys WHERE workspace_id = ? AND key = ?").run(
      workspaceId,
      key,
    );
    return response;
  }

  const text = await response.clone().text();
  if (response.status >= 500) {
    db.prepare("DELETE FROM idempotency_keys WHERE workspace_id = ? AND key = ?").run(
      workspaceId,
      key,
    );
    return response;
  }

  db.prepare(
    `UPDATE idempotency_keys
     SET status = 'completed', response_status = ?, response_json = ?, completed_at = datetime('now')
     WHERE workspace_id = ? AND key = ?`,
  ).run(response.status, text, workspaceId, key);
  return response;
}

/** Hourly maintenance: drop completed keys older than a day and abandoned in-progress rows. */
export function pruneIdempotencyKeys(): number {
  return getDb()
    .prepare(
      `DELETE FROM idempotency_keys
       WHERE completed_at IS NOT NULL AND completed_at < datetime('now', '-1 day')`,
    )
    .run().changes;
}
