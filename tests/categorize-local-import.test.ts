import { describe, expect, it, beforeAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

let getDb: typeof import("@/server/db/index").getDb;
let categorizeLocally: typeof import("@/server/sync/categorize-local").categorizeLocally;
let normalizeMerchant: typeof import("@/server/lib/merchant-memory").normalizeMerchant;
let runId = 1;

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-categorize-local-"));
  getDb = (await import("@/server/db/index")).getDb;
  ({ categorizeLocally } = await import("@/server/sync/categorize-local"));
  ({ normalizeMerchant } = await import("@/server/lib/merchant-memory"));
  const db = getDb();
  const existing = db.prepare("SELECT id FROM sync_runs LIMIT 1").get() as
    { id: number } | undefined;
  runId =
    existing?.id ??
    Number(
      db
        .prepare(
          `INSERT INTO sync_runs (workspace_id, provider, started_at, completed_at, status, scrape_from_date)
           VALUES (1, 'leumi', datetime('now'), datetime('now'), 'completed', '1970-01-01')`,
        )
        .run().lastInsertRowid,
    );
});

function addTransaction(description: string): number {
  const db = getDb();
  return Number(
    db
      .prepare(
        `INSERT INTO transactions
           (workspace_id, account_number, date, processed_date, original_amount, original_currency,
            charged_amount, charged_currency, description, type, status, provider, sync_run_id, dedup_hash,
            dedup_sequence, kind, category_id)
         VALUES (1, 'LOCAL-1', '2024-02-01', '2024-02-01', -10, 'ILS', -10, 'ILS', ?, 'normal',
                 'completed', 'leumi', ?, ?, 0, 'expense', NULL)`,
      )
      .run(description, runId, `hash-${description}`).lastInsertRowid,
  );
}

describe("categorizeLocally", () => {
  it("uses merchant memory, then the dictionary, and leaves unknown rows alone", () => {
    const db = getDb();
    const groceries = db
      .prepare(
        "SELECT id FROM categories WHERE workspace_id = 1 AND kind = 'expense' AND name = 'Groceries'",
      )
      .get() as { id: number };
    const restaurants = db
      .prepare(
        "SELECT id FROM categories WHERE workspace_id = 1 AND kind = 'expense' AND name = 'Restaurants'",
      )
      .get() as { id: number };
    db.prepare(
      `INSERT INTO merchant_categories (workspace_id, merchant_key, category_id, kind, source)
       VALUES (1, ?, ?, 'expense', 'user')`,
    ).run(normalizeMerchant("מרקאט"), restaurants.id);
    // A remembered row whose remembered kind does not match the row kind must be ignored.
    db.prepare(
      `INSERT INTO merchant_categories (workspace_id, merchant_key, category_id, kind, source)
       VALUES (1, ?, ?, 'income', 'user')`,
    ).run(normalizeMerchant("חנות עם זיכרון"), groceries.id);

    const memoryRow = addTransaction("מרקאט");
    const dictionaryRow = addTransaction("שופרסל דיל");
    const unknownRow = addTransaction("חנות עם זיכרון");
    const unchanged = addTransaction("ספק לא מוכר בעליל");

    const done = categorizeLocally(1);
    expect(done).toBeGreaterThanOrEqual(2);
    const rows = db
      .prepare("SELECT id, category_id AS categoryId FROM transactions WHERE id IN (?, ?, ?, ?)")
      .all(memoryRow, dictionaryRow, unknownRow, unchanged) as {
      id: number;
      categoryId: number | null;
    }[];
    const byId = new Map(rows.map((row) => [row.id, row.categoryId]));
    expect(byId.get(memoryRow)).toBe(restaurants.id);
    expect(byId.get(dictionaryRow)).toBe(groceries.id);
    expect(byId.get(unknownRow)).toBeNull();
    expect(byId.get(unchanged)).toBeNull();
    const hits = db
      .prepare("SELECT hit_count AS hits FROM merchant_categories WHERE merchant_key = ?")
      .get(normalizeMerchant("מרקאט")) as { hits: number };
    expect(hits.hits).toBe(1);
  });

  it("is a no-op when nothing is uncategorized", () => {
    expect(categorizeLocally(1)).toBe(0);
  });
});
