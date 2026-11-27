import "server-only";

import { getDb } from "@/server/db";
import { recordIntegrityViolations } from "@/server/observability/metrics";
import { writeAudit } from "@/server/audit/audit";

export interface IntegrityReport {
  ok: boolean;
  workspaceId: number | null;
  checkedAt: string;
  foreignKeyViolations: number;
  duplicateGroups: number;
  splitSumMismatches: number;
  categoryKindMismatches: number;
  accountMismatches: number;
  orphanImportRows: number;
  orphanJobs: number;
  stalePending: number;
  balanceDrift: number;
  flowTotals: Record<string, number>;
  flowTotalsMatch: boolean;
  transactionTotal: number;
  viewTotal: number;
  viewDifference: number;
}

export interface IntegrityRepairResult {
  accountIds: number;
  categoryClears: number;
  stalePending: number;
  orphanJobs: number;
  orphanAttempts: number;
}

const STALE_PENDING_DAYS = 14;

function count(sql: string, ...params: unknown[]): number {
  const row = getDb()
    .prepare(sql)
    .get(...params) as { n: number } | undefined;
  return row?.n ?? 0;
}

function workspaceClause(workspaceId: number | null, column = "workspace_id"): [string, unknown[]] {
  return workspaceId == null ? ["1=1", []] : [`${column} = ?`, [workspaceId]];
}

export function checkIntegrity(workspaceId: number | null = null): IntegrityReport {
  const db = getDb();
  const [where, params] = workspaceClause(workspaceId);

  const foreignKeyViolations = (db.pragma("foreign_key_check") as unknown[]).length;
  const duplicateGroups = count(
    `SELECT COUNT(*) AS n FROM (
       SELECT dedup_hash FROM transactions WHERE ${where}
       GROUP BY dedup_hash HAVING COUNT(*) > 1
     )`,
    ...params,
  );
  const splitSumMismatches = count(
    `SELECT COUNT(*) AS n FROM (
       SELECT t.id, ROUND(t.charged_amount * 100) AS cents, COALESCE(SUM(a.amount_cents), 0) AS allocated
       FROM transactions t
       JOIN transaction_allocations a ON a.transaction_id = t.id
       WHERE ${workspaceId == null ? "1=1" : "t.workspace_id = ?"}
       GROUP BY t.id
       HAVING ABS(allocated - cents) > 1
     )`,
    ...params,
  );
  const categoryKindMismatches = count(
    `SELECT COUNT(*) AS n
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.${where} AND t.category_id IS NOT NULL AND t.kind IN ('expense','income') AND c.kind != t.kind`,
    ...params,
  );
  const accountMismatches = count(
    `SELECT COUNT(*) AS n
     FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.${where} AND (a.workspace_id != t.workspace_id OR a.number != t.account_number)`,
    ...params,
  );
  const orphanImportRows = count(
    `SELECT COUNT(*) AS n FROM import_batch_rows r
     LEFT JOIN transactions t ON t.id = r.transaction_id
     WHERE r.transaction_id IS NOT NULL AND t.id IS NULL`,
  );
  const orphanJobs = count(
    `SELECT COUNT(*) AS n FROM jobs j
     LEFT JOIN workspaces w ON w.id = j.workspace_id
     WHERE j.workspace_id IS NOT NULL AND w.id IS NULL`,
  );
  const stalePending = count(
    `SELECT COUNT(*) AS n FROM transactions
     WHERE ${where} AND status = 'pending' AND date < date('now', ?)`,
    ...(workspaceId == null
      ? [`-${STALE_PENDING_DAYS} days`]
      : [workspaceId, `-${STALE_PENDING_DAYS} days`]),
  );
  const balanceDrift = count(
    `SELECT COUNT(*) AS n FROM account_balances
     WHERE ${workspaceId == null ? "1=1" : "workspace_id = ?"} AND ABS(COALESCE(drift, 0)) >= 1`,
    ...params,
  );
  const flowRows = db
    .prepare(
      `SELECT flow_type AS flowType, ROUND(SUM(charged_amount), 2) AS total
       FROM transactions WHERE ${where} AND status = 'completed' AND is_excluded = 0
       GROUP BY flow_type`,
    )
    .all(...params) as { flowType: string; total: number }[];
  const flowTotals: Record<string, number> = {};
  for (const row of flowRows) flowTotals[row.flowType] = row.total;
  const transactionTotal =
    (
      db
        .prepare(
          `SELECT ROUND(COALESCE(SUM(charged_amount), 0), 2) AS total
         FROM transactions WHERE ${where} AND status = 'completed' AND is_excluded = 0`,
        )
        .get(...params) as { total: number }
    ).total ?? 0;
  // The view expands split rows; its total must still equal the direct transaction total.
  const viewTotal =
    (
      db
        .prepare(
          `SELECT ROUND(COALESCE(SUM(charged_amount), 0), 2) AS total
         FROM category_transactions WHERE ${where} AND status = 'completed' AND is_excluded = 0`,
        )
        .get(...params) as { total: number }
    ).total ?? 0;
  const flowSum = Object.values(flowTotals).reduce((sum, value) => sum + value, 0);

  const report: IntegrityReport = {
    ok:
      foreignKeyViolations === 0 &&
      splitSumMismatches === 0 &&
      categoryKindMismatches === 0 &&
      accountMismatches === 0 &&
      Math.abs(viewTotal - transactionTotal) < 0.01,
    workspaceId,
    checkedAt: new Date().toISOString(),
    foreignKeyViolations,
    duplicateGroups,
    splitSumMismatches,
    categoryKindMismatches,
    accountMismatches,
    orphanImportRows,
    orphanJobs,
    stalePending,
    balanceDrift,
    flowTotals,
    flowTotalsMatch: Math.abs(flowSum - transactionTotal) < 0.01,
    transactionTotal,
    viewTotal,
    viewDifference: Math.round((viewTotal - transactionTotal) * 100) / 100,
  };

  recordIntegrityViolations("foreign_key", foreignKeyViolations);
  recordIntegrityViolations("duplicate_groups", duplicateGroups);
  recordIntegrityViolations("split_sums", splitSumMismatches);
  recordIntegrityViolations("category_kind", categoryKindMismatches);
  recordIntegrityViolations("account", accountMismatches);
  recordIntegrityViolations("orphan_import", orphanImportRows);
  recordIntegrityViolations("balance_drift", Math.round(balanceDrift));
  return report;
}

/**
 * Only safe, unambiguous fixes: a missing account id, an auto category of the wrong kind, stale
 * pending rows flagged for review, and orphaned job rows. Duplicates and merges are suggestions.
 */
export function repairIntegrity(workspaceId: number | null = null): IntegrityRepairResult {
  const db = getDb();
  const ws = workspaceId == null ? null : workspaceId;
  const result = db.transaction(() => {
    const accountIds = db
      .prepare(
        `UPDATE transactions
         SET account_id = (
           SELECT a.id FROM accounts a
           WHERE a.workspace_id = transactions.workspace_id
             AND a.number = transactions.account_number
           LIMIT 1
         ), updated_at = datetime('now')
         WHERE account_id IS NULL
           ${ws == null ? "" : "AND workspace_id = ?"}
           AND EXISTS (
             SELECT 1 FROM accounts a
             WHERE a.workspace_id = transactions.workspace_id
               AND a.number = transactions.account_number
           )
           AND (SELECT COUNT(*) FROM accounts a
                WHERE a.workspace_id = transactions.workspace_id
                  AND a.number = transactions.account_number) = 1`,
      )
      .run(...(ws == null ? [] : [ws])).changes;

    const categoryClears = db
      .prepare(
        `UPDATE transactions
         SET category_id = NULL, category_source = NULL, category_origin = 'none',
             needs_review = 1, updated_at = datetime('now')
         WHERE category_id IS NOT NULL
           ${ws == null ? "" : "AND workspace_id = ?"}
           AND category_origin != 'user'
           AND EXISTS (
             SELECT 1 FROM categories c
             WHERE c.id = transactions.category_id AND c.kind != transactions.kind
               AND transactions.kind IN ('expense','income')
           )`,
      )
      .run(...(ws == null ? [] : [ws])).changes;

    const stalePending = db
      .prepare(
        `UPDATE transactions SET needs_review = 1, updated_at = datetime('now')
         WHERE status = 'pending' AND needs_review = 0 AND date < date('now', ?)
           ${ws == null ? "" : "AND workspace_id = ?"}`,
      )
      .run(`-${STALE_PENDING_DAYS} days`, ...(ws == null ? [] : [ws])).changes;

    const orphanJobs = db
      .prepare(
        `DELETE FROM jobs
         WHERE workspace_id IS NOT NULL
           AND workspace_id NOT IN (SELECT id FROM workspaces)`,
      )
      .run().changes;
    const orphanAttempts = db
      .prepare("DELETE FROM job_attempts WHERE job_id NOT IN (SELECT id FROM jobs)")
      .run().changes;

    return { accountIds, categoryClears, stalePending, orphanJobs, orphanAttempts };
  })();
  writeAudit({
    workspaceId: ws,
    actor: "system",
    action: "integrity.repair",
    entityType: "workspace",
    entityId: ws,
    after: result,
  });
  return result;
}
