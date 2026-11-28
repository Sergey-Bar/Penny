import "server-only";

import { getDb } from "../index";
import { israelDay } from "@/server/lib/date-utils";
import { israelToday } from "@/lib/dates";
import { balanceDrift } from "@/lib/balance-drift";
import { LIABILITY_TYPES, type AssetInput, type AssetType } from "@/lib/types";

export interface AssetRow extends AssetInput {
  id: number;
  isLiability: boolean;
}

const COLUMNS = `id, name, type, currency, symbol, quantity, manual_value as manualValue,
  cost_basis as costBasis, liquid, is_liability as isLiability, note, fee_deposit as feeDeposit,
  fee_balance as feeBalance, monthly_deposit as monthlyDeposit, interest_rate as interestRate, monthly_payment as monthlyPayment,
  fund_id as fundId, fund_source as fundSource, city, street, rooms, size_m2 as sizeM2,
  purchase_price as purchasePrice, purchase_month as purchaseMonth, cost_fx as costFx`;

const isLiabilityType = (t: AssetType) => (LIABILITY_TYPES as readonly string[]).includes(t);

const homeValues = (a: AssetInput) => [
  a.city ?? null,
  a.street ?? null,
  a.rooms ?? null,
  a.sizeM2 ?? null,
  a.purchasePrice ?? null,
  a.purchaseMonth ?? null,
  a.costFx ?? null,
];

export function listAssets(workspaceId: number): AssetRow[] {
  const rows = getDb()
    .prepare(`SELECT ${COLUMNS} FROM assets WHERE workspace_id = ? ORDER BY is_liability, name`)
    .all(workspaceId) as (Omit<AssetRow, "liquid" | "isLiability"> & {
    liquid: number;
    isLiability: number;
  })[];
  return rows.map((r) => ({ ...r, liquid: r.liquid === 1, isLiability: r.isLiability === 1 }));
}

export function createAssets(workspaceId: number, inputs: AssetInput[]): number {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO assets (workspace_id, name, type, currency, symbol, quantity, manual_value, cost_basis, liquid, is_liability, note,
       fee_deposit, fee_balance, monthly_deposit, interest_rate, monthly_payment, fund_id, fund_source,
       city, street, rooms, size_m2, purchase_price, purchase_month, cost_fx)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  db.transaction(() => {
    for (const a of inputs) {
      stmt.run(
        workspaceId,
        a.name,
        a.type,
        a.currency,
        a.symbol,
        a.quantity,
        a.manualValue,
        a.costBasis,
        a.liquid ? 1 : 0,
        isLiabilityType(a.type) ? 1 : 0,
        a.note,
        a.feeDeposit,
        a.feeBalance,
        a.monthlyDeposit,
        a.interestRate,
        a.monthlyPayment,
        a.fundId ?? null,
        a.fundSource ?? null,
        ...homeValues(a),
      );
    }
  })();
  return inputs.length;
}

export function updateAsset(workspaceId: number, id: number, a: AssetInput): boolean {
  return (
    getDb()
      .prepare(
        `UPDATE assets SET name = ?, type = ?, currency = ?, symbol = ?, quantity = ?, manual_value = ?,
           cost_basis = ?, liquid = ?, is_liability = ?, note = ?, fee_deposit = ?, fee_balance = ?,
           monthly_deposit = ?, interest_rate = ?, monthly_payment = ?, fund_id = ?, fund_source = ?,
           city = ?, street = ?, rooms = ?, size_m2 = ?, purchase_price = ?, purchase_month = ?, cost_fx = ?
         WHERE workspace_id = ? AND id = ?`,
      )
      .run(
        a.name,
        a.type,
        a.currency,
        a.symbol,
        a.quantity,
        a.manualValue,
        a.costBasis,
        a.liquid ? 1 : 0,
        isLiabilityType(a.type) ? 1 : 0,
        a.note,
        a.feeDeposit,
        a.feeBalance,
        a.monthlyDeposit,
        a.interestRate,
        a.monthlyPayment,
        a.fundId ?? null,
        a.fundSource ?? null,
        ...homeValues(a),
        workspaceId,
        id,
      ).changes > 0
  );
}

export function deleteAsset(workspaceId: number, id: number): boolean {
  return (
    getDb().prepare("DELETE FROM assets WHERE workspace_id = ? AND id = ?").run(workspaceId, id)
      .changes > 0
  );
}

export function saveSnapshots(date: string, values: { assetId: number; valueIls: number }[]) {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO asset_snapshots (asset_id, date, value_ils) VALUES (?, ?, ?) ON CONFLICT(asset_id, date) DO UPDATE SET value_ils = excluded.value_ils",
  );
  db.transaction(() => values.forEach((v) => stmt.run(v.assetId, date, v.valueIls)))();
}

export function saveManualNetWorth(workspaceId: number, date: string, netWorth: number) {
  getDb()
    .prepare(
      "INSERT INTO net_worth_manual (workspace_id, date, net_worth) VALUES (?, ?, ?) ON CONFLICT(workspace_id, date) DO UPDATE SET net_worth = excluded.net_worth",
    )
    .run(workspaceId, date, netWorth);
}

export function deleteManualNetWorth(workspaceId: number, date: string): boolean {
  return (
    getDb()
      .prepare("DELETE FROM net_worth_manual WHERE workspace_id = ? AND date = ?")
      .run(workspaceId, date).changes > 0
  );
}

export function saveDailyNetWorth(workspaceId: number, date: string, netWorth: number) {
  getDb()
    .prepare(
      "INSERT INTO net_worth_daily (workspace_id, date, net_worth) VALUES (?, ?, ?) ON CONFLICT(workspace_id, date) DO UPDATE SET net_worth = excluded.net_worth",
    )
    .run(workspaceId, date, netWorth);
}

/** Hand-entered months before tracking, then daily totals (older per-asset snapshots fill days before those began). */
export function netWorthHistory(
  workspaceId: number,
): { date: string; netWorth: number; manual?: boolean }[] {
  const daily = getDb()
    .prepare(
      "SELECT date, net_worth as netWorth FROM net_worth_daily WHERE workspace_id = ? ORDER BY date",
    )
    .all(workspaceId) as { date: string; netWorth: number }[];
  const firstDaily = daily[0]?.date ?? "9999";
  const tracked = [...trackedHistory(workspaceId).filter((h) => h.date < firstDaily), ...daily];
  const first = tracked[0]?.date ?? "9999";
  const manual = (
    getDb()
      .prepare(
        "SELECT date, net_worth as netWorth FROM net_worth_manual WHERE workspace_id = ? AND date < ? ORDER BY date",
      )
      .all(workspaceId, first) as { date: string; netWorth: number }[]
  ).map((m) => ({ ...m, manual: true }));
  return [...manual, ...tracked];
}

function trackedHistory(workspaceId: number): { date: string; netWorth: number }[] {
  const rows = getDb()
    .prepare(
      `SELECT s.date, s.asset_id as assetId, s.value_ils as value, a.is_liability as isLiability
       FROM asset_snapshots s JOIN assets a ON a.id = s.asset_id
       WHERE a.workspace_id = ? ORDER BY s.date`,
    )
    .all(workspaceId) as { date: string; assetId: number; value: number; isLiability: number }[];
  const latest = new Map<number, number>();
  const out: { date: string; netWorth: number }[] = [];
  for (const r of rows) {
    latest.set(r.assetId, r.isLiability ? -r.value : r.value);
    const total = [...latest.values()].reduce((s, v) => s + v, 0);
    if (out.at(-1)?.date === r.date) out[out.length - 1].netWorth = total;
    else out.push({ date: r.date, netWorth: total });
  }
  return out;
}

export function saveAccountBalances(
  workspaceId: number,
  provider: string,
  accounts: {
    accountNumber: string;
    balance?: number;
    transactions?: { date: string; chargedAmount: number; status: string }[];
  }[],
  /** First day the scrape fetched (YYYY-MM-DD); without it the balance isn't checked. */
  windowStart = "9999-12-31",
) {
  const db = getDb();
  const accountStmt = db.prepare(
    "SELECT id FROM accounts WHERE workspace_id = ? AND provider = ? AND number = ? ORDER BY id LIMIT 2",
  );
  const prevLinked = db.prepare(
    "SELECT balance, drift, updated_at as updatedAt FROM account_balances WHERE workspace_id = ? AND account_id = ?",
  );
  const prevLegacy = db.prepare(
    "SELECT balance, drift, updated_at as updatedAt FROM account_balances WHERE workspace_id = ? AND provider = ? AND account_number = ? AND account_id IS NULL",
  );
  const upsertLinked = db.prepare(
    `INSERT INTO account_balances (workspace_id, provider, account_number, account_id, balance, drift, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(workspace_id, account_id) WHERE account_id IS NOT NULL DO UPDATE SET
       provider = excluded.provider, account_number = excluded.account_number,
       balance = excluded.balance, drift = excluded.drift, updated_at = excluded.updated_at`,
  );
  const upsertLegacy = db.prepare(
    `INSERT INTO account_balances (workspace_id, provider, account_number, balance, drift, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(workspace_id, provider, account_number) WHERE account_id IS NULL DO UPDATE SET
       balance = excluded.balance, drift = excluded.drift, updated_at = excluded.updated_at`,
  );
  const today = israelDay(new Date().toISOString());
  db.transaction(() => {
    for (const a of accounts) {
      if (a.balance == null) continue;
      const matches = accountStmt.all(workspaceId, provider, a.accountNumber) as { id: number }[];
      const accountId = matches.length === 1 ? matches[0].id : null;
      const prev = (
        accountId == null
          ? prevLegacy.get(workspaceId, provider, a.accountNumber)
          : prevLinked.get(workspaceId, accountId)
      ) as { balance: number; drift: number | null; updatedAt: string } | undefined;
      const prevDay = prev ? israelDay(`${prev.updatedAt.replace(" ", "T")}Z`) : "";
      const checked = balanceDrift(
        prev ? { balance: prev.balance, day: prevDay } : null,
        a.balance,
        (a.transactions ?? []).map((t) => ({
          day: israelDay(t.date),
          amount: t.chargedAmount,
          status: t.status,
        })),
        today,
        windowStart,
      );
      // A second sync the same day can't re-check (no clean day boundary), so it keeps the day's finding.
      const drift = checked ?? (prevDay === today ? (prev?.drift ?? null) : null);
      if (accountId == null) {
        upsertLegacy.run(workspaceId, provider, a.accountNumber, a.balance, drift);
      } else {
        upsertLinked.run(workspaceId, provider, a.accountNumber, accountId, a.balance, drift);
      }
    }
  })();
}

export function listAccountBalances(workspaceId: number) {
  return getDb()
    .prepare(
      `SELECT rowid as id, provider, account_number as accountNumber, balance, drift, updated_at as updatedAt
       FROM account_balances WHERE workspace_id = ? ORDER BY provider, account_number`,
    )
    .all(workspaceId) as {
    id: number;
    provider: string;
    accountNumber: string;
    balance: number;
    drift: number | null;
    updatedAt: string;
  }[];
}

/** Per-asset snapshots, oldest first. */
export function assetSnapshots(
  workspaceId: number,
): Map<number, { date: string; valueIls: number }[]> {
  const rows = getDb()
    .prepare(
      `SELECT s.asset_id as assetId, s.date, s.value_ils as valueIls FROM asset_snapshots s JOIN assets a ON a.id = s.asset_id
       WHERE a.workspace_id = ? ORDER BY s.date`,
    )
    .all(workspaceId) as { assetId: number; date: string; valueIls: number }[];
  const out = new Map<number, { date: string; valueIls: number }[]>();
  for (const r of rows) {
    const list = out.get(r.assetId);
    if (list) list.push({ date: r.date, valueIls: r.valueIls });
    else out.set(r.assetId, [{ date: r.date, valueIls: r.valueIls }]);
  }
  return out;
}

export interface AssetSnapshotPoint {
  date: string;
  valueIls: number;
  costBasisIls: number | null;
  valueNative: number | null;
  currency: string | null;
}

export interface ProviderSnapshotPoint {
  date: string;
  valueIls: number;
  costBasisIls: number | null;
}

function providerFromAsset(note: string | null, detailsRaw: string | null): string | null {
  if (note && note.startsWith("pension:")) {
    const parts = note.split(":");
    if (parts[1] && !/^\d+$/.test(parts[1])) return parts[1];
  }
  if (note && note.startsWith("bank-securities:")) {
    const parts = note.split(":");
    if (parts[1]) return parts[1];
  }
  if (detailsRaw) {
    try {
      const parsed = JSON.parse(detailsRaw) as { provider?: unknown };
      if (typeof parsed.provider === "string" && parsed.provider.trim()) {
        return parsed.provider.trim();
      }
    } catch {
      // Ignore malformed details JSON.
    }
  }
  return null;
}

/** Per-asset and per-provider snapshot time series for charts. */
export function getAssetHistoryPayload(workspaceId: number): {
  byAsset: Record<number, AssetSnapshotPoint[]>;
  byProvider: Record<string, ProviderSnapshotPoint[]>;
} {
  const rows = getDb()
    .prepare(
      `SELECT s.asset_id as assetId, s.date, s.value_ils as valueIls,
              s.cost_basis_ils as costBasisIls, s.value_native as valueNative, s.currency,
              a.note, a.details, a.is_liability as isLiability
       FROM asset_snapshots s
       JOIN assets a ON a.id = s.asset_id
       WHERE a.workspace_id = ?
       ORDER BY s.date`,
    )
    .all(workspaceId) as {
    assetId: number;
    date: string;
    valueIls: number;
    costBasisIls: number | null;
    valueNative: number | null;
    currency: string | null;
    note: string | null;
    details: string | null;
    isLiability: number;
  }[];

  const byAsset: Record<number, AssetSnapshotPoint[]> = {};
  const providerRows = new Map<string, typeof rows>();

  for (const r of rows) {
    if (!byAsset[r.assetId]) byAsset[r.assetId] = [];
    byAsset[r.assetId].push({
      date: r.date,
      valueIls: r.valueIls,
      costBasisIls: r.costBasisIls,
      valueNative: r.valueNative,
      currency: r.currency,
    });
    const provider = providerFromAsset(r.note, r.details);
    if (provider && !r.isLiability) {
      const list = providerRows.get(provider);
      if (list) list.push(r);
      else providerRows.set(provider, [r]);
    }
  }

  const byProvider: Record<string, ProviderSnapshotPoint[]> = {};
  for (const [provider, pRows] of providerRows) {
    const latestValue = new Map<number, number>();
    const latestCost = new Map<number, number | null>();
    const series: ProviderSnapshotPoint[] = [];
    for (const r of pRows) {
      latestValue.set(r.assetId, r.valueIls);
      latestCost.set(r.assetId, r.costBasisIls);
      const valueIls = [...latestValue.values()].reduce((sum, v) => sum + v, 0);
      const costEntries = [...latestCost.values()].filter((c): c is number => c != null);
      const costBasisIls =
        costEntries.length > 0 ? costEntries.reduce((sum, c) => sum + c, 0) : null;
      const last = series.at(-1);
      if (last && last.date === r.date) {
        last.valueIls = valueIls;
        last.costBasisIls = costBasisIls;
      } else {
        series.push({ date: r.date, valueIls, costBasisIls });
      }
    }
    byProvider[provider] = series;
  }

  return { byAsset, byProvider };
}

export interface BankSecurityInput {
  accountNumber: string;
  equityNumber: string;
  name: string;
  type: "stock" | "fund" | "bond";
  currency: string;
  symbol: string | null;
  quantity: number | null;
  value: number;
  valueIls: number | null;
  costBasis: number | null;
  details?: Record<string, unknown>;
}

export interface BankSecurityScope {
  /** The bank credential that produced this scrape; encoded in the asset key for stale reconciliation. */
  credentialId?: number | null;
  /** Accounts covered by the completed scrape, including accounts with no holdings. */
  accountNumbers?: readonly string[];
}

/**
 * Upserts securities holdings synced from a bank's capital-market portal (e.g. Hapoalim myTrade)
 * and records today's snapshot for each holding. Stale holdings in the same credential/account
 * scope are zeroed if they have history or deleted otherwise; other credentials are untouched.
 */
export function saveBankSecurities(
  workspaceId: number,
  provider: string,
  securities: BankSecurityInput[],
  scope: BankSecurityScope = {},
): void {
  const db = getDb();
  const today = israelToday();
  const prefix = `bank-securities:${provider}:`;
  const credentialId =
    scope.credentialId != null && Number.isInteger(scope.credentialId) ? scope.credentialId : null;
  const hasAccountScope = Array.isArray(scope.accountNumbers);
  const accountsInScope = new Set(
    (scope.accountNumbers ?? []).map((n) => n.trim()).filter(Boolean),
  );
  const noteFor = (s: BankSecurityInput) =>
    credentialId == null
      ? `${prefix}${s.accountNumber}:${s.equityNumber}`
      : `${prefix}${credentialId}:${s.accountNumber}:${s.equityNumber}`;
  const find = db.prepare(`SELECT id FROM assets WHERE workspace_id = ? AND note = ?`);
  const update = db.prepare(
    `UPDATE assets SET name = ?, type = ?, currency = ?, symbol = ?, quantity = ?,
       manual_value = ?, cost_basis = ?, liquid = 1, is_liability = 0, note = ?, details = ?
     WHERE id = ?`,
  );
  const insert = db.prepare(
    `INSERT INTO assets (workspace_id, name, type, currency, symbol, quantity, manual_value, cost_basis, liquid, is_liability, note, details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
  );
  const upsertSnapshot = db.prepare(
    `INSERT INTO asset_snapshots (asset_id, date, value_ils, cost_basis_ils, value_native, currency)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(asset_id, date) DO UPDATE SET
       value_ils = excluded.value_ils,
       cost_basis_ils = excluded.cost_basis_ils,
       value_native = excluded.value_native,
       currency = excluded.currency`,
  );
  const zeroSnapshot = db.prepare(
    `INSERT INTO asset_snapshots (asset_id, date, value_ils, cost_basis_ils, value_native)
     VALUES (?, ?, 0, 0, 0)
     ON CONFLICT(asset_id, date) DO UPDATE SET
       value_ils = 0, cost_basis_ils = 0, value_native = 0`,
  );
  const stale = db.prepare(
    `SELECT id, note, EXISTS (SELECT 1 FROM asset_snapshots s WHERE s.asset_id = assets.id) AS hasHistory
     FROM assets WHERE workspace_id = ? AND substr(note, 1, ?) = ?`,
  );
  const zero = db.prepare(`UPDATE assets SET manual_value = 0 WHERE id = ?`);
  const remove = db.prepare(`DELETE FROM assets WHERE id = ?`);

  db.transaction(() => {
    const keep = new Set<string>();
    for (const s of securities) {
      const note = noteFor(s);
      keep.add(note);
      const detailsJson = s.details
        ? JSON.stringify({
            ...s.details,
            provider,
            ...(credentialId == null ? {} : { credentialId }),
          })
        : credentialId == null
          ? null
          : JSON.stringify({ provider, credentialId });
      // Adopt a holding written before credential ownership was encoded, so one-time rows do
      // not duplicate and become owned by the credential that just synced them.
      let existing = find.get(workspaceId, note) as { id: number } | undefined;
      const legacyNote = `${prefix}${s.accountNumber}:${s.equityNumber}`;
      if (!existing && legacyNote !== note) {
        existing = find.get(workspaceId, legacyNote) as { id: number } | undefined;
      }
      let assetId: number;
      if (existing) {
        update.run(
          s.name,
          s.type,
          s.currency,
          s.symbol,
          s.quantity,
          s.value,
          s.costBasis,
          note,
          detailsJson,
          existing.id,
        );
        assetId = existing.id;
      } else {
        const res = insert.run(
          workspaceId,
          s.name,
          s.type,
          s.currency,
          s.symbol,
          s.quantity,
          s.value,
          s.costBasis,
          note,
          detailsJson,
        );
        assetId = Number(res.lastInsertRowid);
      }
      const valueIls = s.valueIls ?? (s.currency === "ILS" ? s.value : null);
      if (valueIls != null) {
        const costBasisIls = s.currency === "ILS" ? s.costBasis : null;
        upsertSnapshot.run(assetId, today, valueIls, costBasisIls, s.value, s.currency);
      }
    }

    const existingRows = stale.all(workspaceId, prefix.length, prefix) as {
      id: number;
      note: string;
      hasHistory: number;
    }[];
    for (const row of existingRows) {
      if (keep.has(row.note)) continue;
      if (!rowOwnedByScope(row.note, prefix, credentialId, accountsInScope, hasAccountScope))
        continue;
      if (row.hasHistory) {
        zero.run(row.id);
        zeroSnapshot.run(row.id, today);
      } else {
        remove.run(row.id);
      }
    }
  })();
}

/**
 * A row belongs to the syncing credential when its key carries that credential id, or when it is
 * a legacy key (provider:account:equity) for an account the completed scrape covered.
 */
function rowOwnedByScope(
  note: string,
  prefix: string,
  credentialId: number | null,
  accountsInScope: ReadonlySet<string>,
  hasAccountScope: boolean,
): boolean {
  if (credentialId == null && !hasAccountScope) {
    // Caller did not identify a scope: retain the previous provider-wide behavior.
    return true;
  }
  const rest = note.slice(prefix.length).split(":");
  if (rest.length >= 3 && credentialId != null && rest[0] === String(credentialId)) {
    return !hasAccountScope || accountsInScope.has(rest[1]);
  }
  return rest.length === 2 && accountsInScope.has(rest[0]);
}
