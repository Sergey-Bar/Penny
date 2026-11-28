import "server-only";

import { getDb } from "@/server/db";
import { classifyKind } from "@/lib/import/classify";
import { isCardBill } from "@/lib/import/patterns";
import type { ImportKind, SignConvention } from "@/lib/import/types";
import { reconcileFlows } from "@/server/finance/pairing";

interface ReclassifyRow {
  id: number;
  account_id: number | null;
  account_number: string;
  date: string;
  description: string;
  charged_amount: number;
  kind: ImportKind;
  kind_source: string;
  category_origin: string;
  category_id: number | null;
}

const SAFE_SOURCES = new Set(["default", "sign", "pattern", "sync"]);

function hasCardCoverage(
  workspaceId: number,
  id: number,
  description: string,
  date: string,
  amount: number,
): boolean {
  // Only a card bill can be explained by card purchases; other rows never use coverage.
  if (!isCardBill(description)) return false;
  const tolerance = Math.max(0.05, Math.abs(amount) * 0.005);
  const db = getDb();
  const single = db
    .prepare(
      `SELECT 1 FROM transactions t JOIN accounts a ON a.id = t.account_id
       WHERE t.workspace_id = ? AND t.id != ? AND a.kind = 'card'
         AND abs(julianday(substr(t.date, 1, 10)) - julianday(substr(?, 1, 10))) <= 45
         AND (
           t.linked_txn_id = ? OR t.transfer_pair_id = ?
           OR abs(abs(t.charged_amount) - ?) <= ?
         )
       LIMIT 1`,
    )
    .get(workspaceId, id, date, id, id, Math.abs(amount), tolerance);
  if (single !== undefined) return true;
  // A bill can be covered by several completed purchases in the same period (400 + 600 = 1000).
  // Look for a contiguous run on one card account whose sum matches within tolerance.
  const charges = db
    .prepare(
      `SELECT t.account_id AS accountId, abs(t.charged_amount) AS amount
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       JOIN transactions bill ON bill.id = ?
       WHERE t.workspace_id = ? AND t.id != ? AND a.kind = 'card'
         AND t.status = 'completed' AND t.charged_amount < 0 AND t.is_excluded = 0
         AND COALESCE(t.charged_currency, t.original_currency)
           = COALESCE(bill.charged_currency, bill.original_currency)
         AND abs(julianday(substr(t.date, 1, 10)) - julianday(substr(?, 1, 10))) <= 45
       ORDER BY t.account_id, t.date, t.id`,
    )
    .all(id, workspaceId, id, date) as { accountId: number; amount: number }[];
  const target = Math.abs(amount);
  let accountId: number | null = null;
  let left = 0;
  let sum = 0;
  for (let right = 0; right < charges.length; right++) {
    if (charges[right].accountId !== accountId) {
      accountId = charges[right].accountId;
      left = right;
      sum = 0;
    }
    sum += charges[right].amount;
    while (sum > target + tolerance && left <= right) {
      sum -= charges[left].amount;
      left++;
    }
    if (Math.abs(sum - target) <= tolerance) return true;
  }
  return false;
}

function hasTransferPair(
  workspaceId: number,
  id: number,
  accountId: number | null,
  accountNumber: string,
  date: string,
  amount: number,
): boolean {
  return (
    getDb()
      .prepare(
        `SELECT 1 FROM transactions
         WHERE workspace_id = ? AND id != ? AND charged_amount = ?
           AND (
             (? IS NOT NULL AND account_id IS NOT NULL AND account_id != ?)
             OR ((? IS NULL OR account_id IS NULL) AND account_number != ?)
           )
           AND abs(julianday(substr(date, 1, 10)) - julianday(substr(?, 1, 10))) <= 2
         LIMIT 1`,
      )
      .get(workspaceId, id, -amount, accountId, accountId, accountId, accountNumber, date) !==
    undefined
  );
}

/**
 * Re-runs the deterministic classifier on rows whose kind was never confirmed by a human, rule,
 * column or AI. Idempotent: a transfer that already has a pair stays one, and a confirmed row is
 * never touched.
 */
function reclassifyTransactions(
  workspaceId: number,
  scope: { batchId?: number; accountId?: number } = {},
): { checked: number; changed: number } {
  const db = getDb();
  const where: string[] = ["workspace_id = ?"];
  const params: (string | number)[] = [workspaceId];
  if (scope.batchId != null) {
    where.push("import_batch_id = ?");
    params.push(scope.batchId);
  }
  if (scope.accountId != null) {
    where.push("account_id = ?");
    params.push(scope.accountId);
  }
  const rows = db
    .prepare(
      `SELECT id, account_id, account_number, date, description, charged_amount, kind, kind_source,
              category_origin, category_id
       FROM transactions WHERE ${where.join(" AND ")}`,
    )
    .all(...params) as ReclassifyRow[];

  const accountKindStmt = db.prepare("SELECT kind FROM accounts WHERE workspace_id = ? AND id = ?");
  const update = db.prepare(
    `UPDATE transactions SET kind = ?, kind_source = ?, needs_review = ?,
       category_id = CASE WHEN ? THEN NULL ELSE category_id END,
       category_source = CASE WHEN ? THEN NULL ELSE category_source END,
       category_origin = CASE WHEN ? THEN 'none' ELSE category_origin END,
       updated_at = datetime('now')
     WHERE workspace_id = ? AND id = ?`,
  );

  let checked = 0;
  let changed = 0;
  db.transaction(() => {
    for (const row of rows) {
      if (!SAFE_SOURCES.has(row.kind_source)) continue;
      // A row the household categorized itself is a human decision even if its kind came from sign.
      if (row.category_origin === "user") continue;
      checked++;
      const accountKind =
        row.account_id == null
          ? "bank"
          : ((
              accountKindStmt.get(workspaceId, row.account_id) as
                { kind: "bank" | "card" | "other" } | undefined
            )?.kind ?? "bank");
      // Stored card rows are already normalized: charges are negative and refunds positive.
      const signConvention: SignConvention = accountKind === "card" ? "cardNegative" : "bankSigned";
      const result = classifyKind({
        description: row.description,
        rawSigned: row.charged_amount,
        amount: Math.abs(row.charged_amount),
        explicitKind: "auto",
        accountKind,
        signConvention,
        hasCardCoverage: hasCardCoverage(
          workspaceId,
          row.id,
          row.description,
          row.date,
          row.charged_amount,
        ),
        hasTransferPair: hasTransferPair(
          workspaceId,
          row.id,
          row.account_id,
          row.account_number,
          row.date,
          row.charged_amount,
        ),
        allPositive: false,
      });
      const changedKind = result.kind !== row.kind;
      const clearCategory =
        result.kind === "transfer" && row.category_id != null && row.category_origin !== "user";
      if (!changedKind && !clearCategory && result.needsReview === false) continue;
      update.run(
        result.kind,
        result.kindSource === "user" ? "pattern" : result.kindSource,
        result.needsReview ? 1 : 0,
        clearCategory ? 1 : 0,
        clearCategory ? 1 : 0,
        clearCategory ? 1 : 0,
        workspaceId,
        row.id,
      );
      if (changedKind || clearCategory) changed++;
    }
  })();

  // Pairing writes flow_type and the transfer links; it must run after the kinds settle.
  reconcileFlows(workspaceId);
  return { checked, changed };
}

export function reclassifyBatch(workspaceId: number, batchId: number) {
  return reclassifyTransactions(workspaceId, { batchId });
}

/** The workspace enablement job: re-check every row whose kind was never confirmed. */
export function reclassifyWorkspace(workspaceId: number) {
  return reclassifyTransactions(workspaceId);
}
