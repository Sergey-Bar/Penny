import "server-only";

import type Database from "better-sqlite3";
import { normalizeMerchantV1, normalizeMerchantV2 } from "@/lib/merchant-normalize";
import { roundCents } from "@/lib/money";

/** Columns whose values are money and must be boundary-exact (two decimals). */
const MONEY_COLUMNS: { table: string; columns: string[]; id: string[] }[] = [
  { table: "transactions", columns: ["original_amount", "charged_amount"], id: ["id"] },
  {
    table: "account_balances",
    columns: ["balance", "drift"],
    id: ["workspace_id", "provider", "account_number"],
  },
  { table: "budgets", columns: ["monthly_amount"], id: ["id"] },
  { table: "budget_lines", columns: ["base_amount", "carry_in", "moves"], id: ["id"] },
  {
    table: "assets",
    columns: [
      "manual_value",
      "cost_basis",
      "fee_deposit",
      "fee_balance",
      "monthly_deposit",
      "monthly_payment",
      "purchase_price",
      "cost_fx",
    ],
    id: ["id"],
  },
  { table: "goals", columns: ["target_amount", "saved_amount"], id: ["id"] },
  { table: "goal_links", columns: ["contribution"], id: ["transaction_id", "goal_id"] },
  {
    table: "insurance_policies",
    columns: ["monthly_premium", "coverage", "deductible"],
    id: ["id"],
  },
  { table: "planned_items", columns: ["amount"], id: ["id"] },
  { table: "periodic_expenses", columns: ["amount", "saved_so_far"], id: ["id"] },
  { table: "manual_recurring", columns: ["amount"], id: ["id"] },
  { table: "commitments", columns: ["amount", "previous_amount"], id: ["id"] },
  { table: "expense_shares", columns: ["amount"], id: ["id"] },
  { table: "savings_done", columns: ["yearly"], id: ["workspace_id", "key"] },
  { table: "settle_entries", columns: ["amount"], id: ["id"] },
  { table: "import_batches", columns: ["balance_value"], id: ["id"] },
];

interface ColumnInfo {
  name: string;
}

function tableColumns(db: Database.Database, table: string): Set<string> {
  try {
    return new Set((db.pragma(`table_info(${table})`) as ColumnInfo[]).map((c) => c.name));
  } catch {
    return new Set();
  }
}

function tableHasColumn(db: Database.Database, table: string, column: string): boolean {
  return tableColumns(db, table).has(column);
}

interface CanonicalizeReport {
  rewritten: number;
}

/**
 * Rewrites only rounding-level drift (< half an agora) and records every row it touched.
 * Larger differences are left alone for integrity.check to surface as a suggestion.
 */
function canonicalizeMoney(db: Database.Database): CanonicalizeReport {
  let rewritten = 0;
  const audit = db.prepare(
    `INSERT INTO audit_log
       (workspace_id, actor, action, entity_type, entity_id, before_json, after_json, amount_cents)
     VALUES (?, 'migration', 'migration.canonicalize', ?, ?, ?, ?, ?)`,
  );
  const hasWorkspace = (table: string) => tableColumns(db, table).has("workspace_id");

  db.transaction(() => {
    for (const spec of MONEY_COLUMNS) {
      if (!tableHasColumn(db, spec.table, spec.columns[0])) continue;
      const columns = spec.columns.filter((c) => tableHasColumn(db, spec.table, c));
      if (columns.length === 0) continue;
      const select = db.prepare(`SELECT ${[...spec.id, ...columns].join(", ")} FROM ${spec.table}`);
      const update = db.prepare(
        `UPDATE ${spec.table} SET ${columns.map((c) => `${c} = ?`).join(", ")} WHERE ${spec.id.map((c) => `${c} = ?`).join(" AND ")}`,
      );
      const rows = select.all() as Record<string, unknown>[];
      for (const row of rows) {
        const fixes: { column: string; before: number; after: number }[] = [];
        for (const column of columns) {
          const value = row[column];
          if (typeof value !== "number" || !Number.isFinite(value)) continue;
          const canonical = roundCents(value);
          if (canonical === value) continue;
          // Half an agora (or more) is a real difference, not float noise: leave it for integrity.
          // Compare in minor units so 10.005 stays 10.005 instead of rounding up through float noise.
          const scaled = value * 100;
          if (Math.abs(scaled - Math.round(scaled)) >= 0.5 - 1e-9) continue;
          fixes.push({ column, before: value, after: canonical });
        }
        if (fixes.length === 0) continue;
        const idValues = spec.id.map((c) => row[c]);
        update.run(...fixes.map((f) => f.after), ...idValues);
        const entityId = idValues.map((v) => String(v)).join(":");
        const workspaceId = hasWorkspace(spec.table) ? Number(row.workspace_id) : null;
        const last = fixes[fixes.length - 1];
        audit.run(
          Number.isFinite(workspaceId) ? workspaceId : null,
          spec.table,
          entityId,
          JSON.stringify(fixes.map((f) => ({ column: f.column, value: f.before }))),
          JSON.stringify(fixes.map((f) => ({ column: f.column, value: f.after }))),
          Math.round(last.after * 100),
        );
        rewritten += fixes.length;
      }
    }
  })();
  return { rewritten };
}

function keyFor(value: string): string {
  return normalizeMerchantV2(value) || normalizeMerchantV1(value);
}

/**
 * Backfills `transactions.merchant_key` and folds learned keys into V2. Collisions keep the row
 * with the highest hit count (then the newest), and every merge is audited.
 */
function backfillMerchantKeys(db: Database.Database): { transactions: number; merged: number } {
  if (!tableHasColumn(db, "transactions", "merchant_key")) return { transactions: 0, merged: 0 };

  let transactions = 0;
  const updateTxn = db.prepare(
    "UPDATE transactions SET merchant_key = ?, merchant_key_version = 2 WHERE id = ?",
  );
  db.transaction(() => {
    const rows = db.prepare("SELECT id, description FROM transactions").all() as {
      id: number;
      description: string;
    }[];
    for (const row of rows) {
      updateTxn.run(keyFor(row.description), row.id);
      transactions++;
    }
    if (tableHasColumn(db, "transactions", "merchant_key_version"))
      db.prepare("UPDATE transactions SET merchant_key_version = 2").run();
  })();

  let merged = 0;
  const audit = db.prepare(
    `INSERT INTO audit_log
       (workspace_id, actor, action, entity_type, entity_id, before_json, after_json)
     VALUES (?, 'migration', 'merchant_keys.merge', 'merchant_categories', ?, ?, ?)`,
  );

  db.transaction(() => {
    const workspaces = db
      .prepare("SELECT DISTINCT workspace_id AS id FROM merchant_categories")
      .all() as { id: number }[];
    for (const workspace of workspaces) {
      const rows = db
        .prepare(
          `SELECT id, merchant_key, category_id, kind, source, hit_count, updated_at
           FROM merchant_categories WHERE workspace_id = ?`,
        )
        .all(workspace.id) as {
        id: number;
        merchant_key: string;
        category_id: number;
        kind: string;
        source: string;
        hit_count: number;
        updated_at: string;
      }[];
      const groups = new Map<string, typeof rows>();
      for (const row of rows) {
        const key = keyFor(row.merchant_key);
        if (!key) continue;
        const group = groups.get(key) ?? [];
        group.push(row);
        groups.set(key, group);
      }
      for (const [key, group] of groups) {
        const winner = [...group].sort(
          (a, b) =>
            b.hit_count - a.hit_count || b.updated_at.localeCompare(a.updated_at) || b.id - a.id,
        )[0];
        if (!winner) continue;
        const removed = group.filter((r) => r.id !== winner.id).map((r) => r.id);
        for (const id of removed)
          db.prepare("DELETE FROM merchant_categories WHERE id = ? AND workspace_id = ?").run(
            id,
            workspace.id,
          );
        db.prepare(
          `UPDATE merchant_categories SET merchant_key = ?, updated_at = datetime('now')
           WHERE id = ? AND workspace_id = ?`,
        ).run(key, winner.id, workspace.id);
        if (removed.length > 0) {
          merged += removed.length;
          audit.run(
            workspace.id,
            String(winner.id),
            JSON.stringify({ key: winner.merchant_key, removedIds: removed }),
            JSON.stringify({ key, merged: removed.length }),
          );
        }
      }
    }

    if (tableHasColumn(db, "category_corrections", "merchant_key")) {
      const corrections = db.prepare("SELECT id, merchant_key FROM category_corrections").all() as {
        id: number;
        merchant_key: string;
      }[];
      const update = db.prepare("UPDATE category_corrections SET merchant_key = ? WHERE id = ?");
      for (const row of corrections) update.run(keyFor(row.merchant_key), row.id);
    }

    if (tableHasColumn(db, "excluded_merchants", "merchant_key")) {
      const rows = db
        .prepare(
          "SELECT id, workspace_id, provider, merchant_key, created_at FROM excluded_merchants ORDER BY created_at DESC, id DESC",
        )
        .all() as {
        id: number;
        workspace_id: number;
        provider: string;
        merchant_key: string;
        created_at: string;
      }[];
      const seen = new Set<string>();
      for (const row of rows) {
        const key = keyFor(row.merchant_key);
        const identity = `${row.workspace_id}:${row.provider}:${key}`;
        if (seen.has(identity)) {
          db.prepare("DELETE FROM excluded_merchants WHERE id = ?").run(row.id);
        } else {
          seen.add(identity);
          db.prepare("UPDATE excluded_merchants SET merchant_key = ? WHERE id = ?").run(
            key,
            row.id,
          );
        }
      }
    }
  })();

  return { transactions, merged };
}

/** Marks historical sync runs as fully post-processed (the inline path already ran). */
function backfillSyncPostProcessing(db: Database.Database): void {
  if (!tableHasColumn(db, "sync_runs", "post_processing_status")) return;
  db.exec(`
    UPDATE sync_runs
    SET post_processing_status = CASE
      WHEN status = 'completed' THEN 'completed'
      WHEN status = 'failed' THEN 'failed'
      ELSE NULL
    END
    WHERE post_processing_status IS NULL
  `);
}

export function applyBackendV2(db: Database.Database): void {
  canonicalizeMoney(db);
  backfillMerchantKeys(db);
  backfillSyncPostProcessing(db);
}
