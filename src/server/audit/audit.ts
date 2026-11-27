import "server-only";

import { getDb } from "@/server/db";
import { currentRequestId } from "@/server/lib/request-context";

const MAX_JSON = 4096;

function redactValue(key: string, value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (/pass(word)?|secret|token|auth|key|cookie|credential|account.?number/i.test(key))
    return "[redacted]";
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (Array.isArray(value))
    return value.slice(0, 50).map((item) => redactValue(key, item, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [
        childKey,
        redactValue(childKey, child, depth + 1),
      ]),
    );
  return value;
}

function encode(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    const json = JSON.stringify(redactValue("", value));
    return json.length > MAX_JSON ? `${json.slice(0, MAX_JSON)}…` : json;
  } catch {
    return null;
  }
}

export interface AuditInput {
  workspaceId?: number | null;
  actor: string;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  before?: unknown;
  after?: unknown;
  amountCents?: number | null;
}

/** Append-only audit row. A failure is swallowed: the operation itself already succeeded. */
export function writeAudit(input: AuditInput): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO audit_log
           (workspace_id, actor, action, entity_type, entity_id, request_id, before_json, after_json, amount_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.workspaceId ?? null,
        input.actor.slice(0, 80),
        input.action.slice(0, 120),
        input.entityType.slice(0, 80),
        input.entityId == null ? null : String(input.entityId).slice(0, 120),
        currentRequestId() ?? null,
        encode(input.before),
        encode(input.after),
        Number.isSafeInteger(input.amountCents) ? input.amountCents : null,
      );
  } catch {
    // Auditing must never fail the change it records.
  }
}
