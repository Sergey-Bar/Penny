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

function hasCardCoverage(workspaceId: number, id: number, date: string, amount: number): boolean {
  const tolerance = Math.max(0.05, Math.abs(amount) * 0.005);
  return (
    getDb()
      .prepare(
        `SELECT 1 FROM transactions t JOIN accounts a ON a.id = t.account_id
         WHERE t.workspace_id = @workspaceId AND t.id != @id AND a.kind = 'card'
           AND abs(julianday(substr(t.date, 1, 10)) - julianday(substr(@date, 1, 10))) <= 45
           AND (
             t.linked_txn_id = @id OR t.transfer_pair_id = @id
             OR abs(abs(t.charged_amount) - @amount) <= @tolerance
           )
         UNION ALL
         SELECT 1 FROM transactions t JOIN accounts a ON a.id = t.account_id
         JOIN transactions bill ON bill.id = @id
         WHERE t.workspace_id = @workspaceId AND t.id != @id AND a.kind = 'card'
           AND t.status = 'completed' AND t.charged_amount < 0 AND t.is_excluded = 0
           AND COALESCE(t.charged_currency, t.original_currency)
             = COALESCE(bill.charged_currency, bill.original_currency)
           AND substr(t.date, 1, 10) BETWEEN date(@date, '-45 days') AND date(@date)
         GROUP BY t.account_id
         HAVING COUNT(*) > 1 AND abs(-sum(t.charged_amount) - @amount) <= @tolerance
         LIMIT 1`,
      )
      .get({ workspaceId, id, date, amount: Math.abs(amount), tolerance }) !== undefined
  );
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
           AND (? IS NULL OR account_id IS NULL OR account_id != ?)
           AND (? IS NOT NULL OR account_number != ?)
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
        hasCardCoverage:
          isCardBill(row.description) &&
          hasCardCoverage(workspaceId, row.id, row.date, row.charged_amount),
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
