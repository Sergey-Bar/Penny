import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let getDb: typeof import("@/server/db/index").getDb;
let forgetMerchant: typeof import("@/server/lib/import/forget").forgetMerchant;
let normalizeMerchant: typeof import("@/lib/merchant-normalize").normalizeMerchant;

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-import-forget-"));
  getDb = (await import("@/server/db/index")).getDb;
  ({ forgetMerchant } = await import("@/server/lib/import/forget"));
  ({ normalizeMerchant } = await import("@/lib/merchant-normalize"));
});

function insertTxn(input: {
  description: string;
  chargedAmount: number;
  syncRunId: number;
  hash: string;
  categoryId: number;
  categorySource: string | null;
  categoryOrigin: string;
}): number {
  return Number(
    getDb()
      .prepare(
        `INSERT INTO transactions
           (workspace_id, account_number, date, processed_date, original_amount, original_currency,
            charged_amount, description, type, status, provider, sync_run_id, dedup_hash, kind,
            category_id, category_source, category_origin)
         VALUES (1, '1234', '2026-05-01', '2026-05-01', ?, 'ILS', ?, ?, 'normal', 'completed',
                 'file', ?, ?, 'expense', ?, ?, ?)`,
      )
      .run(
        input.chargedAmount,
        input.chargedAmount,
        input.description,
        input.syncRunId,
        input.hash,
        input.categoryId,
        input.categorySource,
        input.categoryOrigin,
      ).lastInsertRowid,
  );
}

describe("forgetMerchant category guard", () => {
  it("keeps a hand-picked category and clears automatic and rule categories", () => {
    const db = getDb();
    const syncRunId = Number(
      db
        .prepare(
          "INSERT INTO sync_runs (workspace_id, provider, status, scrape_from_date, started_at) VALUES (1, 'file', 'completed', '1970-01-01', '1970-01-01')",
        )
        .run().lastInsertRowid,
    );
    const categoryId = (
      db.prepare("SELECT id FROM categories WHERE workspace_id = 1 LIMIT 1").get() as {
        id: number;
      }
    ).id;
    const description = "Corner Shop 42";
    const merchant = normalizeMerchant(description);
    db.prepare(
      "INSERT INTO merchant_categories (workspace_id, merchant_key, category_id, kind, source, hit_count) VALUES (1, ?, ?, 'expense', 'user', 2)",
    ).run(merchant, categoryId);

    const manual = insertTxn({
      description,
      chargedAmount: -10,
      syncRunId,
      hash: "f-manual",
      categoryId,
      categorySource: "user",
      categoryOrigin: "ai",
    });
    const automatic = insertTxn({
      description,
      chargedAmount: -20,
      syncRunId,
      hash: "f-auto",
      categoryId,
      categorySource: null,
      categoryOrigin: "ai",
    });
    const rule = insertTxn({
      description,
      chargedAmount: -30,
      syncRunId,
      hash: "f-rule",
      categoryId,
      categorySource: "user",
      categoryOrigin: "rule",
    });

    const result = forgetMerchant(1, merchant, [manual, automatic, rule]);
    expect(result.forgotten).toBe(1);

    const rows = db
      .prepare(
        `SELECT id, category_id AS categoryId, category_source AS categorySource,
                category_origin AS categoryOrigin
         FROM transactions WHERE id IN (?, ?, ?) ORDER BY id`,
      )
      .all(manual, automatic, rule) as {
      id: number;
      categoryId: number | null;
      categorySource: string | null;
      categoryOrigin: string;
    }[];

    expect(rows[0]).toMatchObject({
      id: manual,
      categoryId,
      categorySource: "user",
      categoryOrigin: "user",
    });
    expect(rows[1]).toMatchObject({ id: automatic, categoryId: null, categoryOrigin: "none" });
    expect(rows[2]).toMatchObject({ id: rule, categoryId: null, categoryOrigin: "none" });
  });
});
