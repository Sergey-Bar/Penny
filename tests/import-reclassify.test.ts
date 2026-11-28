import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let getDb: typeof import("@/server/db/index").getDb;
let createAccountResult: typeof import("@/server/db/queries/accounts").createAccountResult;
let createImportBatch: typeof import("@/server/db/queries/imports").createImportBatch;
let reclassifyBatch: typeof import("@/server/lib/import/reclassify").reclassifyBatch;

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-import-reclassify-"));
  getDb = (await import("@/server/db/index")).getDb;
  ({ createAccountResult } = await import("@/server/db/queries/accounts"));
  ({ createImportBatch } = await import("@/server/db/queries/imports"));
  ({ reclassifyBatch } = await import("@/server/lib/import/reclassify"));
});

function insertTxn(input: {
  accountId: number;
  accountNumber: string;
  date: string;
  description: string;
  chargedAmount: number;
  batchId: number;
  syncRunId: number;
  hash: string;
  kind?: string;
}): number {
  return Number(
    getDb()
      .prepare(
        `INSERT INTO transactions
           (workspace_id, account_number, account_id, date, processed_date, original_amount,
            original_currency, charged_amount, description, type, status, provider, sync_run_id,
            dedup_hash, kind, kind_source, category_origin, import_batch_id)
         VALUES (1, ?, ?, ?, ?, ?, 'ILS', ?, ?, 'normal', 'completed', 'file', ?, ?,
                 ?, 'default', 'none', ?)`,
      )
      .run(
        input.accountNumber,
        input.accountId,
        input.date,
        input.date,
        input.chargedAmount,
        input.chargedAmount,
        input.description,
        input.syncRunId,
        input.hash,
        input.kind ?? "expense",
        input.batchId,
      ).lastInsertRowid,
  );
}

function fixture() {
  const db = getDb();
  const syncRunId = Number(
    db
      .prepare(
        "INSERT INTO sync_runs (workspace_id, provider, status, scrape_from_date, started_at) VALUES (1, 'file', 'completed', '1970-01-01', '2026-01-01')",
      )
      .run().lastInsertRowid,
  );
  const bank = createAccountResult(1, {
    provider: "file",
    kind: "bank",
    number: "1111",
    label: "Bank 1111",
    currency: "ILS",
  }).account;
  const card = createAccountResult(1, {
    provider: "file",
    kind: "card",
    number: "2222",
    label: "Card 2222",
    currency: "ILS",
  }).account;
  const batchId = createImportBatch({
    workspaceId: 1,
    accountId: bank.id,
    syncRunId,
    origin: "upload",
  });
  return { syncRunId, bank, card, batchId };
}

describe("reclassifyTransactions", () => {
  it("keeps a card bill as a transfer when several charges cover it", () => {
    const { syncRunId, bank, card, batchId } = fixture();
    insertTxn({
      accountId: bank.id,
      accountNumber: bank.number,
      date: "2026-05-10",
      description: "חיוב כרטיס",
      chargedAmount: -1000,
      batchId,
      syncRunId,
      hash: "bill-1",
    });
    for (const [index, charge] of [400, 600].entries()) {
      insertTxn({
        accountId: card.id,
        accountNumber: card.number,
        date: `2026-05-0${index + 1}`,
        description: `Purchase ${index + 1}`,
        chargedAmount: -charge,
        batchId,
        syncRunId,
        hash: `charge-${index + 1}`,
      });
    }

    reclassifyBatch(1, batchId);

    const bill = getDb()
      .prepare("SELECT kind FROM transactions WHERE dedup_hash = 'bill-1'")
      .get() as { kind: string };
    expect(bill.kind).toBe("transfer");
    const charges = getDb()
      .prepare("SELECT kind FROM transactions WHERE dedup_hash IN ('charge-1', 'charge-2')")
      .all() as { kind: string }[];
    expect(charges.map((row) => row.kind)).toEqual(["expense", "expense"]);
  });

  it("does not pair a row with an opposite row on the same account number", () => {
    const { syncRunId, bank, batchId } = fixture();
    insertTxn({
      accountId: bank.id,
      accountNumber: bank.number,
      date: "2026-06-01",
      description: "העברה בנקאית",
      chargedAmount: -100,
      batchId,
      syncRunId,
      hash: "transfer-current",
    });
    insertTxn({
      accountId: bank.id,
      accountNumber: bank.number,
      date: "2026-06-02",
      description: "העברה בנקאית",
      chargedAmount: 100,
      batchId,
      syncRunId,
      hash: "transfer-opposite",
    });
    // The opposite row is unlinked but carries the same account number.
    getDb()
      .prepare("UPDATE transactions SET account_id = NULL WHERE dedup_hash = 'transfer-opposite'")
      .run();

    reclassifyBatch(1, batchId);

    const current = getDb()
      .prepare("SELECT kind FROM transactions WHERE dedup_hash = 'transfer-current'")
      .get() as { kind: string };
    expect(current.kind).toBe("expense");
  });
});
