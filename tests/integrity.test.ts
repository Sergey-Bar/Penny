import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import { checkIntegrity, repairIntegrity } from "@/server/finance/integrity";

function clear() {
  const db = getDb();
  db.prepare("DELETE FROM transaction_allocations").run();
  db.prepare("DELETE FROM transactions").run();
  db.prepare("DELETE FROM accounts").run();
  db.prepare("DELETE FROM categories").run();
  db.prepare("DELETE FROM sync_runs").run();
}

beforeEach(clear);

function fixtures() {
  const db = getDb();
  const expense = Number(
    db
      .prepare(
        "INSERT INTO categories (workspace_id, name, color, kind) VALUES (1, 'Food', '#fff', 'expense')",
      )
      .run().lastInsertRowid,
  );
  const run = Number(
    db
      .prepare(
        "INSERT INTO sync_runs (workspace_id, provider, started_at, status, scrape_from_date) VALUES (1, 'leumi', datetime('now'), 'completed', '2026-01-01')",
      )
      .run().lastInsertRowid,
  );
  const insert = db.prepare(
    `INSERT INTO transactions
       (workspace_id, account_number, date, processed_date, original_amount, original_currency,
        charged_amount, charged_currency, description, type, status, provider, sync_run_id,
        dedup_hash, dedup_sequence, kind, category_id, category_source, category_origin)
     VALUES (1, '123', '2026-01-01', '2026-01-01', ?, 'ILS', ?, 'ILS', ?, 'normal', 'completed',
       'leumi', ?, ?, ?, ?, ?, ?, ?)`,
  );
  return { db, expense, run, insert };
}

describe("integrity", () => {
  it("reports duplicate hashes, split sums and kind mismatches", () => {
    const { db, expense, run, insert } = fixtures();
    const id = Number(
      insert.run(-10, -10, "Shop", run, "dup", 0, "income", expense, "ai", "memory")
        .lastInsertRowid,
    );
    insert.run(-20, -20, "Shop2", run, "dup", 1, "expense", null, null, "none");
    db.prepare(
      "INSERT INTO transaction_allocations (transaction_id, position, category_id, amount_cents) VALUES (?, 0, ?, 500)",
    ).run(id, expense);

    const report = checkIntegrity(1);
    expect(report.ok).toBe(false);
    expect(report.duplicateGroups).toBe(1);
    expect(report.splitSumMismatches).toBe(1);
    expect(report.categoryKindMismatches).toBe(1);
  });

  it("repairs only safe issues and leaves duplicates as suggestions", () => {
    const { db, expense, run, insert } = fixtures();
    insert.run(-10, -10, "Shop", run, "dup", 0, "income", expense, "ai", "memory");
    const fixed = repairIntegrity(1);
    expect(fixed.categoryClears).toBe(1);
    const row = db.prepare("SELECT category_id, needs_review FROM transactions").get() as {
      category_id: number | null;
      needs_review: number;
    };
    expect(row.category_id).toBeNull();
    expect(row.needs_review).toBe(1);
    expect(checkIntegrity(1).categoryKindMismatches).toBe(0);
  });
});
