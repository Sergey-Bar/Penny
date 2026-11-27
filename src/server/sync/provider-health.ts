import "server-only";

import { getDb } from "@/server/db";

export type ProviderErrorCode =
  "auth" | "two_factor" | "network" | "rate_limit" | "site_changed" | "timeout" | "unknown";

const COOLDOWN_MS = 24 * 60 * 60_000;

export function classifyProviderError(message: string): ProviderErrorCode {
  const text = message.toLowerCase();
  if (/timeout|timed out|deadline/.test(text)) return "timeout";
  if (/rate.?limit|too many requests|429|try again later|busy/.test(text)) return "rate_limit";
  if (/site.?changed|unexpected|selector|layout|updated the site|not found/.test(text))
    return "site_changed";
  if (/two.?factor|otp|verification code|2fa|sms|code/.test(text)) return "two_factor";
  if (/password|credentials|login|unauthori[sz]ed|forbidden|401|403|auth/.test(text)) return "auth";
  if (/network|econn|enotfound|socket|dns|fetch failed|connection/.test(text)) return "network";
  return "unknown";
}

function providerCooldownUntil(workspaceId: number, credentialId: number): string | null {
  const row = getDb()
    .prepare(
      `SELECT cooldown_until FROM provider_health WHERE workspace_id = ? AND credential_id = ?`,
    )
    .get(workspaceId, credentialId) as { cooldown_until: string | null } | undefined;
  return row?.cooldown_until ?? null;
}

export function isProviderCoolingDown(workspaceId: number, credentialId: number): boolean {
  const until = providerCooldownUntil(workspaceId, credentialId);
  if (!until) return false;
  return until > new Date().toISOString().slice(0, 19).replace("T", " ");
}

export function recordProviderFailure(
  workspaceId: number,
  credentialId: number,
  code: ProviderErrorCode,
): void {
  const cooldown = ["auth", "two_factor", "site_changed"].includes(code);
  const until = cooldown
    ? new Date(Date.now() + COOLDOWN_MS).toISOString().slice(0, 19).replace("T", " ")
    : null;
  getDb()
    .prepare(
      `INSERT INTO provider_health
         (workspace_id, credential_id, consecutive_failures, cooldown_until, last_error_code, updated_at)
       VALUES (?, ?, 1, ?, ?, datetime('now'))
       ON CONFLICT(workspace_id, credential_id) DO UPDATE SET
         consecutive_failures = provider_health.consecutive_failures + 1,
         cooldown_until = COALESCE(excluded.cooldown_until, provider_health.cooldown_until),
         last_error_code = excluded.last_error_code,
         updated_at = datetime('now')`,
    )
    .run(workspaceId, credentialId, until, code);
}

export function recordProviderSuccess(workspaceId: number, credentialId: number): void {
  getDb()
    .prepare(
      `INSERT INTO provider_health
         (workspace_id, credential_id, consecutive_failures, cooldown_until, last_error_code, updated_at)
       VALUES (?, ?, 0, NULL, NULL, datetime('now'))
       ON CONFLICT(workspace_id, credential_id) DO UPDATE SET
         consecutive_failures = 0,
         cooldown_until = NULL,
         last_error_code = NULL,
         updated_at = datetime('now')`,
    )
    .run(workspaceId, credentialId);
}

export interface ProviderHealthRow {
  workspaceId: number;
  credentialId: number;
  consecutiveFailures: number;
  cooldownUntil: string | null;
  lastErrorCode: string | null;
}

export function providerHealth(workspaceId: number): ProviderHealthRow[] {
  return getDb()
    .prepare(
      `SELECT workspace_id AS workspaceId, credential_id AS credentialId,
              consecutive_failures AS consecutiveFailures, cooldown_until AS cooldownUntil,
              last_error_code AS lastErrorCode
       FROM provider_health WHERE workspace_id = ? ORDER BY credential_id`,
    )
    .all(workspaceId) as ProviderHealthRow[];
}
