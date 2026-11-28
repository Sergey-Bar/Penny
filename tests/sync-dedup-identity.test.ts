import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

let insertTransactions: typeof import("@/server/db/queries/transactions").insertTransactions;
let createLegacySyncRun: typeof import("@/server/db/queries/imports").createLegacySyncRun;

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-sync-identity-"));
  insertTransactions = (await import("@/server/db/queries/transactions")).insertTransactions;
  createLegacySyncRun = (await import("@/server/db/queries/imports")).createLegacySyncRun;
});

const txn = {
  accountNumber: "5555",
  date: "2026-11-20T22:00:00.000Z",
  processedDate: "2026-11-20T22:00:00.000Z",
  originalAmount: -50,
  originalCurrency: "ILS",
  chargedAmount: -50,
  description: "Same merchant",
  type: "normal" as const,
  status: "completed" as const,
};

describe("sync dedup account identity", () => {
  it("stores the same row on two providers that share an account number", () => {
    const first = insertTransactions(
      1,
      [txn],
      "leumi",
      null as unknown as number,
      createLegacySyncRun(1, null),
    );
    const second = insertTransactions(
      1,
      [txn],
      "hapoalim",
      null as unknown as number,
      createLegacySyncRun(1, null),
    );
    expect(first).toMatchObject({ added: 1 });
    expect(second).toMatchObject({ added: 1 });
  });

  it("updates rather than duplicates when the provider syncs again", () => {
    const syncRunId = createLegacySyncRun(1, null);
    const again = insertTransactions(1, [txn], "leumi", null as unknown as number, syncRunId);
    expect(again.added).toBe(0);
    expect(again.updated).toBe(1);
  });
});
