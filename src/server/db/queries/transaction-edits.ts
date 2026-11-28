import "server-only";
import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { normalizeMerchant } from "@/lib/merchant-normalize";

type Row = {
  id: number;
  category_id: number | null;
  category_source: string | null;
  needs_review: number;
  charged_amount: number;
  kind: string;
  status: string;
  description: string;
};
type Allocation = { categoryId: number; amount: number };
type Part = { position: number; category_id: number | null; amount_cents: number };
type Memory = {
  merchant_key: string;
  category_id: number;
  kind: string;
  source: string;
  hit_count: number;
  updated_at: string;
};
type Snapshot = {
  rows: { row: Row; parts: Part[] }[];
  memories: { key: string; value: Memory | null }[];
};
export class EditError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "EditError"; // errorResponse recognises it by name
  }
}

export function editTransactions(
  db: Database.Database,
  ws: number,
  input: {
    ids?: unknown;
    categoryId?: unknown;
    remember?: unknown;
    splits?: unknown;
    undo?: unknown;
  },
) {
  const row = (id: number) =>
    db
      .prepare(
        "SELECT id,category_id,category_source,needs_review,charged_amount,kind,status,description FROM transactions WHERE workspace_id=? AND id=?",
      )
      .get(ws, id) as Row | undefined;
  const parts = (id: number) =>
    db
      .prepare(
        "SELECT position,category_id,amount_cents FROM transaction_allocations WHERE transaction_id=? ORDER BY position",
      )
      .all(id) as Part[];
  const memory = (key: string) =>
    (db
      .prepare(
        "SELECT merchant_key,category_id,kind,source,hit_count,updated_at FROM merchant_categories WHERE workspace_id=? AND merchant_key=?",
      )
      .get(ws, key) as Memory | undefined) ?? null;
  const snapshot = (ids: number[], keys: string[]): Snapshot => ({
    rows: ids.map((id) => {
      const r = row(id);
      if (!r) throw new EditError("Transaction not found", 404);
      return { row: r, parts: parts(id) };
    }),
    memories: keys.map((key) => ({ key, value: memory(key) })),
  });
  const restoreRow = (s: Snapshot["rows"][number]) => {
    db.prepare(
      "UPDATE transactions SET category_id=?,category_source=?,needs_review=?,updated_at=datetime('now') WHERE workspace_id=? AND id=?",
    ).run(s.row.category_id, s.row.category_source, s.row.needs_review, ws, s.row.id);
    db.prepare("DELETE FROM transaction_allocations WHERE transaction_id=?").run(s.row.id);
    for (const p of s.parts)
      db.prepare("INSERT INTO transaction_allocations VALUES (?,?,?,?)").run(
        s.row.id,
        p.position,
        p.category_id,
        p.amount_cents,
      );
  };
  return db.transaction(() => {
    if (typeof input.undo === "string") {
      const history = db
        .prepare(
          "SELECT before_json,after_json FROM transaction_edit_history WHERE token=? AND workspace_id=? AND created_at>=datetime('now','-1 day')",
        )
        .get(input.undo, ws) as { before_json: string; after_json: string } | undefined;
      if (!history) throw new EditError("Undo expired or already used", 409);
      const before = JSON.parse(history.before_json) as Snapshot;
      const after = JSON.parse(history.after_json) as Snapshot;
      const current = snapshot(
        after.rows.map((s) => s.row.id),
        after.memories.map((m) => m.key),
      );
      if (JSON.stringify(current) !== JSON.stringify(after))
        throw new EditError(
          "These transactions changed since the edit. Refresh before editing again.",
          409,
        );
      const referencedCategories = before.rows
        .flatMap((s) => [s.row.category_id, ...s.parts.map((p) => p.category_id)])
        .filter((id) => id !== null);
      if (
        referencedCategories.some(
          (id) => !db.prepare("SELECT 1 FROM categories WHERE workspace_id=? AND id=?").get(ws, id),
        )
      )
        throw new EditError("A category was removed since this edit", 409);
      for (const s of before.rows) restoreRow(s);
      for (const m of before.memories) {
        db.prepare("DELETE FROM merchant_categories WHERE workspace_id=? AND merchant_key=?").run(
          ws,
          m.key,
        );
        if (m.value) {
          const v = m.value;
          db.prepare(
            "INSERT INTO merchant_categories (workspace_id,merchant_key,category_id,kind,source,hit_count,updated_at) VALUES (?,?,?,?,?,?,?)",
          ).run(ws, v.merchant_key, v.category_id, v.kind, v.source, v.hit_count, v.updated_at);
        }
      }
      db.prepare("DELETE FROM transaction_edit_history WHERE token=?").run(input.undo);
      return { success: true, undoToken: null };
    }
    if (
      !Array.isArray(input.ids) ||
      input.ids.length < 1 ||
      input.ids.length > 200 ||
      input.ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
    )
      throw new EditError("Choose 1–200 transactions");
    const ids = [...new Set(input.ids as number[])];
    const rows = ids.map((id) => {
      const r = row(id);
      if (!r) throw new EditError("Transaction not found", 404);
      return r;
    });
    const validateCategory = (id: unknown, kind: string) => {
      if (!Number.isSafeInteger(id)) throw new EditError("Invalid category");
      const c = db
        .prepare(
          "SELECT kind FROM categories WHERE workspace_id=? AND id=? AND id NOT IN (SELECT parent_id FROM categories WHERE parent_id IS NOT NULL)",
        )
        .get(ws, id as number) as { kind: string } | undefined;
      if (!c || c.kind !== kind)
        throw new EditError("Choose a matching category for these transactions");
    };
    let allocations: Allocation[] | null = null;
    if (input.splits !== undefined) {
      if (
        ids.length !== 1 ||
        rows[0].kind !== "expense" ||
        rows[0].charged_amount >= 0 ||
        rows[0].status !== "completed"
      )
        throw new EditError("Only a completed expense can be split");
      if (!Array.isArray(input.splits) || input.splits.length > 10 || input.splits.length === 1)
        throw new EditError("Use 2–10 parts, or remove the split");
      allocations = input.splits as Allocation[];
      for (const a of allocations) {
        if (
          !a ||
          typeof a.amount !== "number" ||
          !Number.isFinite(a.amount) ||
          a.amount <= 0 ||
          Math.abs(a.amount * 100 - Math.round(a.amount * 100)) > 0.00001
        )
          throw new EditError("Amounts must be positive, with at most two decimals");
        validateCategory(a.categoryId, "expense");
      }
      if (
        allocations.length &&
        allocations.reduce((sum, a) => sum + Math.round(a.amount * 100), 0) !==
          Math.round(Math.abs(rows[0].charged_amount) * 100)
      )
        throw new EditError("The parts must equal the original transaction");
    } else {
      for (const r of rows) validateCategory(input.categoryId, r.kind);
    }
    const keys =
      input.remember === true && allocations === null
        ? [...new Set(rows.map((r) => normalizeMerchant(r.description)).filter(Boolean))]
        : [];
    const before = snapshot(ids, keys);
    for (const r of rows) {
      db.prepare("DELETE FROM transaction_allocations WHERE transaction_id=?").run(r.id);
      if (allocations) {
        allocations.forEach((a, i) =>
          db
            .prepare("INSERT INTO transaction_allocations VALUES (?,?,?,?)")
            .run(r.id, i, a.categoryId, Math.round(a.amount * 100)),
        );
        db.prepare(
          "UPDATE transactions SET category_source='user',category_origin='user',needs_review=0,updated_at=datetime('now') WHERE workspace_id=? AND id=?",
        ).run(ws, r.id);
      } else
        db.prepare(
          "UPDATE transactions SET category_id=?,category_source='user',category_origin='user',needs_review=0,updated_at=datetime('now') WHERE workspace_id=? AND id=?",
        ).run(input.categoryId as number, ws, r.id);
      if (keys.length) {
        const key = normalizeMerchant(r.description);
        if (key)
          db.prepare(
            "INSERT INTO merchant_categories (workspace_id,merchant_key,category_id,kind,source,hit_count) VALUES (?,?,?,?,'user',0) ON CONFLICT(workspace_id,merchant_key) DO UPDATE SET category_id=excluded.category_id,kind=excluded.kind,source='user',updated_at=datetime('now')",
          ).run(ws, key, input.categoryId as number, r.kind);
      }
    }
    const token = randomUUID();
    db.prepare(
      "INSERT INTO transaction_edit_history (token,workspace_id,before_json,after_json) VALUES (?,?,?,?)",
    ).run(token, ws, JSON.stringify(before), JSON.stringify(snapshot(ids, keys)));
    db.prepare(
      "DELETE FROM transaction_edit_history WHERE created_at<datetime('now','-1 day')",
    ).run();
    return { success: true, undoToken: token };
  })();
}
