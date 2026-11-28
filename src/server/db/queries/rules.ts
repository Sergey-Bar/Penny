import "server-only";

import { getDb } from "../index";
import { applyRules, isSafeRegex, type Rule, type TxnKind } from "@/server/rules/engine";

export type NewRule = Omit<Rule, "id">;

export function listRules(workspaceId: number): Rule[] {
  return getDb()
    .prepare(
      `SELECT id, field, op, value, category_id as categoryId, kind
       FROM rules WHERE workspace_id = ? ORDER BY id`,
    )
    .all(workspaceId)
    .map((r) => {
      const row = r as Rule & { categoryId: number | null; kind: TxnKind | null };
      return { ...row, categoryId: row.categoryId ?? undefined, kind: row.kind ?? undefined };
    });
}

const OPS_BY_FIELD: Record<Rule["field"], Rule["op"][]> = {
  merchant: ["contains", "equals", "regex"],
  account: ["contains", "equals", "regex"],
  amount: ["gt", "lt"],
};

export function validateRule(workspaceId: number, rule: NewRule): void {
  if (!OPS_BY_FIELD[rule.field]?.includes(rule.op)) {
    throw new Error(`The ${rule.op} operator cannot be used on ${rule.field}`);
  }
  if (
    rule.field === "amount" &&
    !(Number.isFinite(Number(rule.value)) && Number(rule.value) >= 0)
  ) {
    throw new Error("Amount must be a non-negative number");
  }
  if (rule.op === "regex" && !isSafeRegex(rule.value)) {
    throw new Error("Unsafe or invalid regex pattern");
  }
  if (
    rule.categoryId != null &&
    !getDb()
      .prepare("SELECT 1 FROM categories WHERE id = ? AND workspace_id = ?")
      .get(rule.categoryId, workspaceId)
  ) {
    throw new Error("Unknown category");
  }
}

export function createRule(workspaceId: number, rule: NewRule): number {
  validateRule(workspaceId, rule);
  return getDb()
    .prepare(
      `INSERT INTO rules (workspace_id, field, op, value, category_id, kind)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(workspaceId, rule.field, rule.op, rule.value, rule.categoryId ?? null, rule.kind ?? null)
    .lastInsertRowid as number;
}

export function deleteRule(workspaceId: number, id: number): void {
  getDb().prepare("DELETE FROM rules WHERE workspace_id = ? AND id = ?").run(workspaceId, id);
}

/** Applies rules to this run's rows the user has not categorized by hand. Returns how many rows changed. */
export function applyRulesToSyncRun(workspaceId: number, syncRunId: number): number {
  const rules = listRules(workspaceId);
  if (rules.length === 0) return 0;

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, description, charged_amount as chargedAmount, account_number as accountNumber
       FROM transactions
       WHERE workspace_id = ? AND sync_run_id = ? AND category_source IS NULL`,
    )
    .all(workspaceId, syncRunId) as {
    id: number;
    description: string;
    chargedAmount: number;
    accountNumber: string;
  }[];

  const update = db.prepare(
    `UPDATE transactions
     SET category_id = COALESCE(?, category_id),
         category_source = CASE WHEN ? IS NULL THEN category_source ELSE 'user' END,
         category_origin = CASE WHEN ? IS NULL THEN category_origin ELSE 'rule' END,
         kind = COALESCE(?, kind),
         updated_at = datetime('now')
     WHERE id = ? AND workspace_id = ?`,
  );

  let changed = 0;
  db.transaction(() => {
    for (const row of rows) {
      const hit = applyRules(row, rules);
      if (!hit) continue;
      update.run(
        hit.categoryId ?? null,
        hit.categoryId ?? null,
        hit.categoryId ?? null,
        hit.kind ?? null,
        row.id,
        workspaceId,
      );
      changed++;
    }
  })();
  return changed;
}

type PastRow = { id: number; description: string; chargedAmount: number; accountNumber: string };

// Skips rows with category_source = 'user': hand-picked categories, and rows an earlier rule already set (rules mark theirs 'user' too, so first rule keeps winning).
function matchPast(workspaceId: number, rule: NewRule): PastRow[] {
  const rows = getDb()
    .prepare(
      `SELECT id, description, charged_amount as chargedAmount, account_number as accountNumber
       FROM transactions
       WHERE workspace_id = ? AND category_source IS NOT 'user'
       ORDER BY date DESC, id DESC`,
    )
    .all(workspaceId) as PastRow[];
  const asRule = [{ ...rule, id: 0 }];
  return rows.filter((row) => applyRules(row, asRule));
}

export function previewRule(
  workspaceId: number,
  rule: NewRule,
): { count: number; sample: string[] } {
  const hits = matchPast(workspaceId, rule);
  return { count: hits.length, sample: [...new Set(hits.map((h) => h.description))].slice(0, 5) };
}

/** Applies one rule to existing transactions it matches (see matchPast for what is skipped). Returns how many rows changed. */
export function applyRuleToPast(workspaceId: number, rule: NewRule): number {
  const hits = matchPast(workspaceId, rule);
  const db = getDb();
  const update = db.prepare(
    `UPDATE transactions
     SET category_id = COALESCE(?, category_id),
         category_source = CASE WHEN ? IS NULL THEN category_source ELSE 'user' END,
         category_origin = CASE WHEN ? IS NULL THEN category_origin ELSE 'rule' END,
         kind = COALESCE(?, kind),
         needs_review = CASE WHEN ? IS NULL THEN needs_review ELSE 0 END,
         updated_at = datetime('now')
     WHERE id = ? AND workspace_id = ?`,
  );
  const cat = rule.categoryId ?? null;
  db.transaction(() => {
    for (const row of hits) update.run(cat, cat, cat, rule.kind ?? null, cat, row.id, workspaceId);
  })();
  return hits.length;
}
