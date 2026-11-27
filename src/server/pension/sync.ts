import "server-only";

import type Database from "better-sqlite3";
import { getDb } from "@/server/db";
import { getWorkspaceSetting, setWorkspaceSetting } from "@/server/db/queries/settings";
import { encrypt, decrypt } from "@/server/lib/encryption";
import { redact, redactError, redactKnownSecrets } from "@/server/lib/redact";
import { registerOtpRequest } from "@/server/sync/otp-bridge";
import { withDeadline } from "@/lib/sync-schedule";
import { SYNC_ERRORS } from "@/lib/sync-errors";
import { assetKey, savingsType, type PensionCredentials, type PensionFund } from "@/lib/pension";
import type { ScrapeArgs } from "./custom-scrapers";
import type { ScrapedAccount, ScrapeOutcome } from "./parsers";

interface Row {
  id: number;
  fund_id: PensionFund;
  credentials_encrypted: Buffer;
  iv: Buffer;
  auth_tag: Buffer;
  session_encrypted: Buffer | null;
  session_iv: Buffer | null;
  session_auth_tag: Buffer | null;
}

export type PensionState = {
  state: "idle" | "running" | "otp" | "done" | "error";
  message?: string;
};

// shortcut: in-memory status, like the OTP bridge; fine for this single-process local app.
const status = new Map<number, PensionState>();
const pensionStatus = (id: number): PensionState => status.get(id) ?? { state: "idle" };

/** OTP bridge keys are sync-run ids; pension syncs use the negative connection id so they never collide. */
export const otpKey = (connectionId: number) => -connectionId;

/** Same budget as a bank sync in the orchestrator. */
const DEADLINE_MS = 10 * 60_000;

type Scrape = (args: ScrapeArgs) => Promise<ScrapeOutcome>;
// israeli-pension-scrapers 0.1.0 takes only id/phone and returns plain accounts (no rich fields).
const library: Scrape = async (args) =>
  (await import("israeli-pension-scrapers")).scrapePension(args);
const custom =
  (fund: "altshuler" | "phoenix" | "excellence"): Scrape =>
  async (args) =>
    (await import("./custom-scrapers")).scrapeCustom(fund, args);

/** Which scraper reads each fund. */
const SCRAPERS: Record<PensionFund, Scrape> = {
  meitav: library,
  harel: library,
  migdal: library,
  clal: library,
  menora: library,
  altshuler: custom("altshuler"),
  phoenix: custom("phoenix"),
  excellence: custom("excellence"),
};

export function savePensionConnection(
  workspaceId: number,
  fundId: PensionFund,
  credentials: PensionCredentials,
) {
  const e = encrypt(JSON.stringify(credentials));
  return getDb()
    .prepare(
      `INSERT INTO pension_connections (workspace_id, fund_id, credentials_encrypted, iv, auth_tag) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(workspace_id, fund_id) DO UPDATE SET credentials_encrypted = excluded.credentials_encrypted, iv = excluded.iv, auth_tag = excluded.auth_tag,
         session_encrypted = NULL, session_iv = NULL, session_auth_tag = NULL
       RETURNING id`,
    )
    .get(workspaceId, fundId, e.encrypted, e.iv, e.authTag) as { id: number };
}

export function listPensionConnections(workspaceId: number) {
  return (
    getDb()
      .prepare(
        `SELECT id, fund_id as fundId, last_sync_at as lastSyncAt, last_error as lastError FROM pension_connections WHERE workspace_id = ?`,
      )
      .all(workspaceId) as {
      id: number;
      fundId: PensionFund;
      lastSyncAt: string | null;
      lastError: string | null;
    }[]
  ).map((c) => ({ ...c, ...pensionStatus(c.id) }));
}

export function deletePensionConnection(workspaceId: number, id: number) {
  getDb()
    .prepare(`DELETE FROM pension_connections WHERE id = ? AND workspace_id = ?`)
    .run(id, workspaceId);
  status.delete(id);
}

/** Starts a sync in the background; progress and the OTP prompt are read through pensionStatus(). */
export function startPensionSync(workspaceId: number, id: number): boolean {
  const row = getDb()
    .prepare(`SELECT * FROM pension_connections WHERE id = ? AND workspace_id = ?`)
    .get(id, workspaceId) as Row | undefined;
  const now = status.get(id)?.state;
  if (!row || now === "running" || now === "otp") return false;
  status.set(id, { state: "running" });
  const logRow = getDb()
    .prepare(
      `INSERT INTO pension_sync_logs (workspace_id, connection_id, fund_id, status) VALUES (?, ?, ?, 'running') RETURNING id`,
    )
    .get(workspaceId, id, row.fund_id) as { id: number };
  void run(workspaceId, row, logRow.id).catch((err) => fail(id, redactError(err), [], logRow.id));
  return true;
}

/** Records a failed sync. The assets keep their last good values. */
function fail(id: number, message: string, secrets: string[] = [], logId?: number) {
  const safe = redactKnownSecrets(redact(message), secrets);
  console.error(`[pension] connection ${id} failed: ${safe}`);
  status.set(id, { state: "error", message: safe });
  const db = getDb();
  db.prepare(`UPDATE pension_connections SET last_error = ? WHERE id = ?`).run(safe, id);
  if (logId) {
    db.prepare(
      `UPDATE pension_sync_logs SET status = 'error', message = ?, completed_at = datetime('now') WHERE id = ?`,
    ).run(safe, logId);
  }
}

export interface SyncLogEntry {
  id: string;
  kind: "bank" | "investment";
  provider: string;
  status: string;
  message: string | null;
  count: number | null;
  startedAt: string;
  completedAt: string | null;
}

/** Recent bank and investment-house sync runs for this workspace, newest first. */
export function listAllSyncLogs(workspaceId: number, limit = 60): SyncLogEntry[] {
  const db = getDb();
  const clearedAt = getWorkspaceSetting(workspaceId, "logs_cleared_at");
  const bankRows = db
    .prepare(
      `SELECT provider, status, error_message as message, transactions_added as count, started_at as startedAt, completed_at as completedAt
       FROM sync_runs WHERE workspace_id = ? AND (? IS NULL OR started_at > ?) ORDER BY id DESC LIMIT ?`,
    )
    .all(workspaceId, clearedAt, clearedAt, limit) as Omit<SyncLogEntry, "id" | "kind">[];
  const pensionRows = db
    .prepare(
      `SELECT id, fund_id as provider, status, message, accounts_count as count, started_at as startedAt, completed_at as completedAt
       FROM pension_sync_logs WHERE workspace_id = ? AND (? IS NULL OR started_at > ?) ORDER BY id DESC LIMIT ?`,
    )
    .all(workspaceId, clearedAt, clearedAt, limit) as (Omit<SyncLogEntry, "id" | "kind"> & {
    id: number;
  })[];

  const combined: SyncLogEntry[] = [
    ...bankRows.map((r, idx) => ({
      ...r,
      id: `bank-${idx}-${r.startedAt}`,
      kind: "bank" as const,
    })),
    ...pensionRows.map((r) => ({
      id: `inv-${r.id}`,
      kind: "investment" as const,
      provider: r.provider,
      status: r.status,
      message: r.message,
      count: r.count,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
    })),
  ];
  return combined.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
}

/** Clears all recorded sync/activity logs for this workspace without breaking transaction foreign keys. */
export function clearAllSyncLogs(workspaceId: number): number {
  const db = getDb();
  const nowSql = new Date().toISOString().replace("T", " ").slice(0, 19);
  let removed = 0;
  db.transaction(() => {
    removed += db
      .prepare(`DELETE FROM pension_sync_logs WHERE workspace_id = ?`)
      .run(workspaceId).changes;
    removed += db
      .prepare(
        `DELETE FROM sync_runs
         WHERE workspace_id = ?
           AND id NOT IN (SELECT DISTINCT sync_run_id FROM transactions WHERE workspace_id = ?)`,
      )
      .run(workspaceId, workspaceId).changes;
  })();
  setWorkspaceSetting(workspaceId, "logs_cleared_at", nowSql);
  return removed;
}

async function run(workspaceId: number, row: Row, logId: number) {
  const db = getDb();
  const credentials = JSON.parse(
    decrypt({ encrypted: row.credentials_encrypted, iv: row.iv, authTag: row.auth_tag }),
  ) as PensionCredentials;
  const secrets = Object.values(credentials).filter((v): v is string => Boolean(v));
  // Cookies stay encrypted in our DB instead of the library's default plain JSON file.
  const session = {
    async load() {
      const r = db
        .prepare(
          `SELECT session_encrypted, session_iv, session_auth_tag FROM pension_connections WHERE id = ?`,
        )
        .get(row.id) as Pick<Row, "session_encrypted" | "session_iv" | "session_auth_tag">;
      if (!r.session_encrypted || !r.session_iv || !r.session_auth_tag) return null;
      return JSON.parse(
        decrypt({ encrypted: r.session_encrypted, iv: r.session_iv, authTag: r.session_auth_tag }),
      ) as unknown[];
    },
    async save(_connectionId: string, cookies: unknown[]) {
      const e = encrypt(JSON.stringify(cookies));
      db.prepare(
        `UPDATE pension_connections SET session_encrypted = ?, session_iv = ?, session_auth_tag = ? WHERE id = ?`,
      ).run(e.encrypted, e.iv, e.authTag, row.id);
    },
  };
  let outcome: ScrapeOutcome;
  try {
    outcome = await withDeadline(
      SCRAPERS[row.fund_id]({
        fundId: row.fund_id,
        credentials,
        connectionId: String(row.id),
        session,
        onProgress: (message: string) => {
          status.set(row.id, { state: "running", message });
          db.prepare(
            `UPDATE pension_sync_logs SET status = 'running', message = ? WHERE id = ?`,
          ).run(message, logId);
        },
        onOtpNeeded: () => {
          status.set(row.id, { state: "otp" });
          db.prepare(`UPDATE pension_sync_logs SET status = 'otp', message = ? WHERE id = ?`).run(
            "otp",
            logId,
          );
          return registerOtpRequest(otpKey(row.id), workspaceId, row.fund_id)
            .wait()
            .finally(() => status.set(row.id, { state: "running" }));
        },
      }),
      DEADLINE_MS,
      () => ({ success: false, accounts: [], errorMessage: SYNC_ERRORS.timeout }),
    );
  } catch (err) {
    return fail(row.id, `${SYNC_ERRORS.pensionUnexpected} (${redactError(err)})`, secrets, logId);
  }
  if (!outcome.success)
    return fail(row.id, outcome.errorMessage ?? outcome.errorType ?? "Sync failed", secrets, logId);
  // A "successful" scrape with nothing in it would wipe every product; treat it as a failure.
  if (!outcome.accounts.some((a) => a.balance != null))
    return fail(row.id, SYNC_ERRORS.pensionNoData, secrets, logId);

  replacePensionAssets(db, workspaceId, row.id, outcome.accounts);
  db.prepare(
    `UPDATE pension_sync_logs SET status = 'done', message = NULL, accounts_count = ?, completed_at = datetime('now') WHERE id = ?`,
  ).run(outcome.accounts.length, logId);
  status.set(row.id, { state: "done", message: String(outcome.accounts.length) });
}

/**
 * Makes this connection's assets match one complete scrape, in one transaction: each product is
 * upserted by the key in its note, and products the provider no longer shows are dropped. A dropped
 * asset with value history is zeroed instead, so its snapshots (which cascade on delete) survive.
 * Call it only with a successful scrape; a failed one must leave the assets alone.
 */
export function replacePensionAssets(
  db: Database.Database,
  workspaceId: number,
  connectionId: number,
  accounts: ScrapedAccount[],
) {
  const find = db.prepare(`SELECT id FROM assets WHERE workspace_id = ? AND note = ?`);
  // COALESCE keeps what the user typed when a scraper does not provide a field.
  const update = db.prepare(
    `UPDATE assets SET manual_value = ?, name = ?, currency = ?,
       quantity = COALESCE(?, quantity),
       cost_basis = COALESCE(?, cost_basis),
       fee_deposit = COALESCE(?, fee_deposit),
       fee_balance = COALESCE(?, fee_balance),
       monthly_deposit = COALESCE(?, monthly_deposit),
       details = COALESCE(?, details)
     WHERE id = ?`,
  );
  const insert = db.prepare(
    `INSERT INTO assets (workspace_id, name, type, currency, manual_value, quantity, cost_basis, liquid, is_liability, note, fee_deposit, fee_balance, monthly_deposit, details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
  );
  const prefix = assetKey(connectionId, "");
  const stale = db.prepare(
    `SELECT id, note, EXISTS (SELECT 1 FROM asset_snapshots s WHERE s.asset_id = assets.id) AS hasHistory
     FROM assets WHERE workspace_id = ? AND substr(note, 1, ?) = ?`,
  );
  const zero = db.prepare(`UPDATE assets SET manual_value = 0 WHERE id = ?`);
  const remove = db.prepare(`DELETE FROM assets WHERE id = ?`);

  db.transaction(() => {
    const keep = new Set<string>();
    for (const a of accounts) {
      const key = assetKey(connectionId, a.accountNumber);
      keep.add(key);
      // The library may list a product without a balance: keep it, leave its value as it was.
      if (a.balance == null) continue;
      const name = a.label ?? a.accountNumber;
      const currency = a.currency || "ILS";
      const details = a.details ? JSON.stringify(a.details) : null;
      const existing = find.get(workspaceId, key) as { id: number } | undefined;
      if (existing) {
        update.run(
          a.balance,
          name,
          currency,
          a.quantity ?? null,
          a.costBasis ?? null,
          a.feeDeposit ?? null,
          a.feeBalance ?? null,
          a.monthlyDeposit ?? null,
          details,
          existing.id,
        );
      } else {
        insert.run(
          workspaceId,
          name,
          a.assetType ?? savingsType(name),
          currency,
          a.balance,
          a.quantity ?? null,
          a.costBasis ?? null,
          a.liquid ? 1 : 0,
          key,
          a.feeDeposit ?? null,
          a.feeBalance ?? null,
          a.monthlyDeposit ?? null,
          details,
        );
      }
    }
    const old = stale.all(workspaceId, prefix.length, prefix) as {
      id: number;
      note: string;
      hasHistory: number;
    }[];
    for (const o of old) {
      if (keep.has(o.note)) continue;
      if (o.hasHistory) zero.run(o.id);
      else remove.run(o.id);
    }
    db.prepare(
      `UPDATE pension_connections SET last_sync_at = datetime('now'), last_error = NULL WHERE id = ?`,
    ).run(connectionId);
  })();
}
