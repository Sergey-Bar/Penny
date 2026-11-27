import "server-only";

import { getDb } from "@/server/db";
import type { Account, AccountBalanceRow } from "@/lib/types";

const ACCOUNT_COLUMNS =
  "id, workspace_id as workspaceId, provider, kind, number, label, currency, is_manual as isManual, archived, created_at as createdAt, updated_at as updatedAt";

const ACCOUNT_COLUMNS_A =
  "a.id, a.workspace_id as workspaceId, a.provider, a.kind, a.number, a.label, a.currency, a.is_manual as isManual, a.archived, a.created_at as createdAt, a.updated_at as updatedAt";

const CARD_PROVIDERS = new Set(["isracard", "cal", "max", "amex", "beyahadBishvilha", "behatsdaa"]);
const MANUAL_PROVIDERS = new Set(["cash", "manual"]);

export function accountKindForProvider(provider: string): "bank" | "card" | "other" {
  if (CARD_PROVIDERS.has(provider)) return "card";
  if (MANUAL_PROVIDERS.has(provider) || provider === "file") return "other";
  return "bank";
}

export function normalizeAccountAlias(value: string): string {
  return value
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[\s"'׳״:*()]+/g, " ")
    .trim()
    .toLowerCase();
}

export function slugifyAccount(value: string): string {
  const slug = normalizeAccountAlias(value)
    .replace(/[^a-z0-9\u05d0-\u05ea]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "account";
}

export function listAccounts(
  workspaceId: number,
  options: { includeArchived?: boolean } = {},
): Account[] {
  const where = options.includeArchived ? "" : " AND archived = 0";
  return getDb()
    .prepare(
      `SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE workspace_id = ?${where} ORDER BY kind, label`,
    )
    .all(workspaceId) as Account[];
}

export function getAccount(workspaceId: number, id: number): Account | null {
  return (
    (getDb()
      .prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE workspace_id = ? AND id = ?`)
      .get(workspaceId, id) as Account | undefined) ?? null
  );
}

export function getAccountByNumber(
  workspaceId: number,
  provider: string,
  number: string,
): Account | null {
  return (
    (getDb()
      .prepare(
        `SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE workspace_id = ? AND provider = ? AND number = ?`,
      )
      .get(workspaceId, provider, number) as Account | undefined) ?? null
  );
}

export function getAccountByAlias(workspaceId: number, alias: string): Account | null {
  const normalized = normalizeAccountAlias(alias);
  if (!normalized) return null;
  return (
    (getDb()
      .prepare(
        `SELECT ${ACCOUNT_COLUMNS_A} FROM accounts a
         JOIN account_aliases al ON al.account_id = a.id AND al.workspace_id = a.workspace_id
         WHERE a.workspace_id = ? AND al.normalized_alias = ?`,
      )
      .get(workspaceId, normalized) as Account | undefined) ?? null
  );
}

export function getAccountByLabel(workspaceId: number, label: string): Account | null {
  const clean = label.trim();
  if (!clean) return null;
  return (
    (getDb()
      .prepare(
        `SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE workspace_id = ? AND label = ? COLLATE NOCASE LIMIT 1`,
      )
      .get(workspaceId, clean) as Account | undefined) ?? null
  );
}

export interface CreateAccountInput {
  provider?: string;
  kind?: "bank" | "card" | "other";
  number?: string;
  label: string;
  currency?: string;
  aliases?: string[];
  isManual?: boolean;
}

export function createAccount(workspaceId: number, input: CreateAccountInput): Account {
  const provider = (input.provider ?? "file").trim() || "file";
  const kind = input.kind ?? accountKindForProvider(provider);
  const label = input.label.trim() || input.number || "חשבון";
  const number = (input.number ?? "").trim() || slugifyAccount(label);
  const currency = (input.currency ?? "ILS").trim().toUpperCase() || "ILS";
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO accounts (workspace_id, provider, kind, number, label, currency, is_manual)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(workspaceId, provider, kind, number, label, currency, input.isManual ? 1 : 0);
  const account =
    getAccountByNumber(workspaceId, provider, number) ??
    (getDb()
      .prepare(
        `SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE workspace_id = ? AND number = ? ORDER BY id LIMIT 1`,
      )
      .get(workspaceId, number) as Account | undefined);
  if (!account) throw new Error("failed to create account");
  addAliases(workspaceId, account.id, [
    ...(input.aliases ?? []),
    label,
    number,
    `${label} (${number})`,
    `${provider} (${number})`,
  ]);
  return getAccount(workspaceId, account.id) ?? account;
}

export function addAliases(workspaceId: number, accountId: number, aliases: string[]): void {
  const stmt = getDb().prepare(
    `INSERT OR IGNORE INTO account_aliases (workspace_id, account_id, alias, normalized_alias)
     VALUES (?, ?, ?, ?)`,
  );
  for (const alias of aliases) {
    const clean = alias.trim();
    const normalized = normalizeAccountAlias(clean);
    if (clean && normalized) stmt.run(workspaceId, accountId, clean, normalized);
  }
}

export interface ResolveAccountInput {
  id?: number | null;
  provider?: string | null;
  kind?: "bank" | "card" | "other" | null;
  number?: string | null;
  label?: string | null;
  currency?: string | null;
  create?: boolean;
}

export interface ResolvedAccount {
  account: Account;
  created: boolean;
  /** More than one plausible match; the UI must ask before merging or saving. */
  ambiguous: boolean;
  candidates: Account[];
}

const similarity = (a: string, b: string): number => {
  const na = normalizeAccountAlias(a);
  const nb = normalizeAccountAlias(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  let shared = 0;
  for (const token of ta) if (tb.has(token)) shared++;
  return shared / (ta.size + tb.size - shared);
};

/**
 * Account resolution in the plan's order: explicit id, provider+number, number/alias, label,
 * then a fuzzy suggestion. A fuzzy match is flagged ambiguous instead of merged silently.
 */
export function resolveAccount(
  workspaceId: number,
  input: ResolveAccountInput,
): ResolvedAccount | null {
  if (input.id != null) {
    const account = getAccount(workspaceId, input.id);
    return account ? { account, created: false, ambiguous: false, candidates: [account] } : null;
  }
  const provider = (input.provider ?? "").trim();
  const number = (input.number ?? "").trim();
  if (provider && number) {
    const exact = getAccountByNumber(workspaceId, provider, number);
    if (exact) return { account: exact, created: false, ambiguous: false, candidates: [exact] };
  }
  if (number) {
    const byNumber = getDb()
      .prepare(
        `SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE workspace_id = ? AND number = ?
         ORDER BY CASE WHEN provider = ? THEN 0 WHEN kind != 'other' THEN 1 ELSE 2 END LIMIT 1`,
      )
      .get(workspaceId, number, provider) as Account | undefined;
    if (byNumber)
      return { account: byNumber, created: false, ambiguous: false, candidates: [byNumber] };
    const byAlias = getAccountByAlias(workspaceId, number);
    if (byAlias)
      return { account: byAlias, created: false, ambiguous: false, candidates: [byAlias] };
  }
  const label = (input.label ?? "").trim();
  if (label) {
    const byAlias = getAccountByAlias(workspaceId, label);
    if (byAlias)
      return { account: byAlias, created: false, ambiguous: false, candidates: [byAlias] };
    const byLabel = getAccountByLabel(workspaceId, label);
    if (byLabel)
      return { account: byLabel, created: false, ambiguous: false, candidates: [byLabel] };
  }
  const reference = label || number;
  if (reference) {
    const candidates = listAccounts(workspaceId)
      .map((account) => ({
        account,
        score: Math.max(
          similarity(reference, account.label),
          similarity(reference, account.number),
        ),
      }))
      .filter((c) => c.score >= 0.85)
      .sort((a, b) => b.score - a.score)
      .map((c) => c.account);
    if (candidates.length === 1)
      return { account: candidates[0], created: false, ambiguous: true, candidates };
    if (candidates.length > 1)
      return { account: candidates[0], created: false, ambiguous: true, candidates };
  }
  if (input.create === false) return null;
  const account = createAccount(workspaceId, {
    provider: provider || "file",
    kind: input.kind ?? accountKindForProvider(provider || "file"),
    number: number || undefined,
    label: label || number || "חשבון חדש",
    currency: input.currency ?? "ILS",
  });
  return { account, created: true, ambiguous: false, candidates: [account] };
}

export interface MergeResult {
  ok: boolean;
  reason?: "not-found" | "same-account" | "kind-mismatch";
  moved?: number;
}

/** Merges one account into another only when the caller explicitly asks; aliases are kept. */
export function mergeAccounts(
  workspaceId: number,
  sourceId: number,
  targetId: number,
): MergeResult {
  if (sourceId === targetId) return { ok: false, reason: "same-account" };
  const source = getAccount(workspaceId, sourceId);
  const target = getAccount(workspaceId, targetId);
  if (!source || !target) return { ok: false, reason: "not-found" };
  if (source.currency !== target.currency) return { ok: false, reason: "kind-mismatch" };
  const db = getDb();
  return db.transaction(() => {
    const moved = db
      .prepare("UPDATE transactions SET account_id = ? WHERE workspace_id = ? AND account_id = ?")
      .run(targetId, workspaceId, sourceId).changes;
    db.prepare(
      `UPDATE OR IGNORE account_aliases SET account_id = ? WHERE workspace_id = ? AND account_id = ?`,
    ).run(targetId, workspaceId, sourceId);
    db.prepare(
      "UPDATE account_balances SET account_id = ? WHERE workspace_id = ? AND account_id = ?",
    ).run(targetId, workspaceId, sourceId);
    db.prepare("DELETE FROM account_aliases WHERE workspace_id = ? AND account_id = ?").run(
      workspaceId,
      sourceId,
    );
    db.prepare("DELETE FROM accounts WHERE workspace_id = ? AND id = ?").run(workspaceId, sourceId);
    addAliases(workspaceId, targetId, [
      source.label,
      source.number,
      `${source.provider} (${source.number})`,
    ]);
    return { ok: true, moved };
  })();
}

export type BalanceSource = "sync" | "file" | "manual" | "calculated";

export interface UpsertBalanceInput {
  workspaceId: number;
  accountId: number | null;
  provider: string;
  accountNumber: string;
  balance: number;
  source: BalanceSource;
  asOf: string;
}

/** One balance per account. A manual balance newer than a sync is not overwritten by the sync. */
export function upsertAccountBalance(input: UpsertBalanceInput): void {
  getDb()
    .prepare(
      `INSERT INTO account_balances
         (workspace_id, provider, account_number, balance, account_id, source, as_of, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(workspace_id, provider, account_number) DO UPDATE SET
         balance = CASE
           WHEN account_balances.source = 'manual' AND excluded.source = 'sync'
             AND account_balances.as_of IS NOT NULL AND account_balances.as_of >= excluded.as_of
             THEN account_balances.balance
           ELSE excluded.balance END,
         account_id = excluded.account_id,
         source = CASE
           WHEN account_balances.source = 'manual' AND excluded.source = 'sync'
             AND account_balances.as_of IS NOT NULL AND account_balances.as_of >= excluded.as_of
             THEN account_balances.source
           ELSE excluded.source END,
         as_of = CASE
           WHEN account_balances.source = 'manual' AND excluded.source = 'sync'
             AND account_balances.as_of IS NOT NULL AND account_balances.as_of >= excluded.as_of
             THEN account_balances.as_of
           ELSE excluded.as_of END,
         updated_at = datetime('now')`,
    )
    .run(
      input.workspaceId,
      input.provider,
      input.accountNumber,
      input.balance,
      input.accountId,
      input.source,
      input.asOf,
    );
}

export function getAccountBalance(
  workspaceId: number,
  accountId: number,
): AccountBalanceRow | null {
  return (
    (getDb()
      .prepare(
        `SELECT account_id as accountId, provider, account_number as accountNumber, balance,
                source, as_of as asOf, updated_at as updatedAt
         FROM account_balances WHERE workspace_id = ? AND account_id = ?
         ORDER BY COALESCE(as_of, updated_at) DESC LIMIT 1`,
      )
      .get(workspaceId, accountId) as AccountBalanceRow | undefined) ?? null
  );
}

/** Set once, when a balance row is adopted by a card/bank sync. */
export function markAccountSynced(workspaceId: number, accountId: number): void {
  getDb()
    .prepare(
      "UPDATE accounts SET is_manual = 0, updated_at = datetime('now') WHERE workspace_id = ? AND id = ?",
    )
    .run(workspaceId, accountId);
}
