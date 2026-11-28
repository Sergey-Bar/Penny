import { describe, expect, it, beforeAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

let getDb: typeof import("@/server/db/index").getDb;
let resolveAccount: typeof import("@/server/db/queries/accounts").resolveAccount;
let previewImport: typeof import("@/server/lib/import/preview").previewImport;
let saveImport: typeof import("@/server/lib/import/save").saveImport;
let deleteImportBatch: typeof import("@/server/db/queries/imports").deleteImportBatch;
let getImportBatch: typeof import("@/server/db/queries/imports").getImportBatch;
let normalizeImportRow: typeof import("@/lib/import/normalize").normalizeImportRow;

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-import-v2-"));
  getDb = (await import("@/server/db/index")).getDb;
  ({ resolveAccount } = await import("@/server/db/queries/accounts"));
  ({ previewImport } = await import("@/server/lib/import/preview"));
  ({ saveImport } = await import("@/server/lib/import/save"));
  ({ deleteImportBatch, getImportBatch } = await import("@/server/db/queries/imports"));
  ({ normalizeImportRow } = await import("@/lib/import/normalize"));
});

const draft = (
  date: string,
  description: string,
  amount: string,
  extra: Record<string, unknown> = {},
) => ({
  rowIndex: Math.floor(Math.random() * 10_000),
  include: true,
  date,
  processedDate: null,
  description,
  amount,
  kind: "auto" as const,
  accountId: 1,
  accountRaw: "",
  categoryId: null,
  categoryName: null,
  categoryRaw: null,
  tags: [] as string[],
  owner: null,
  businessSharePct: 0,
  memo: null,
  originalAmount: null,
  originalCurrency: null,
  installmentNumber: null,
  installmentTotal: null,
  identifier: null,
  balance: null,
  sourceRef: "test",
  ...extra,
});

function rowsFor(accountId: number) {
  const ctx = {
    dateOrder: "dmy" as const,
    signConvention: "bankSigned" as const,
    accountKind: "bank" as const,
    accountId,
    accountCurrency: "ILS",
    today: "2026-11-26",
  };
  const rows = [
    normalizeImportRow(draft("01/02/2024", "שופרסל דיל", "-84.90"), ctx).row!,
    normalizeImportRow(draft("02/02/2024", "משכורת", "9000", { kind: "auto" as const }), {
      ...ctx,
      accountKind: "other" as const,
    }).row!,
    normalizeImportRow(draft("03/02/2024", "העברה", "-50"), ctx).row!,
  ];
  return rows.map((row, index) => ({ ...row, rowIndex: index + 1, accountId }));
}

describe("saveImport", () => {
  it("saves, categorizes, dedupes and undoes without orphans", () => {
    const account = resolveAccount(1, {
      provider: "leumi",
      kind: "bank",
      number: "1234",
      label: "Leumi 1234",
      create: true,
    })!.account;
    const rows = rowsFor(account.id);
    const preview = previewImport(1, account.id, rows);
    expect(preview.summary.ready).toBe(3);
    expect(preview.summary.autoCategorized).toBeGreaterThan(0);

    const saved = saveImport({ workspaceId: 1, accountId: account.id, origin: "upload", rows });
    expect(saved.added).toBe(3);
    expect(saved.batchId).toBeGreaterThan(0);

    const stored = getDb()
      .prepare(
        `SELECT description, kind, category_id AS categoryId, category_origin AS categoryOrigin,
                account_id AS accountId, origin, import_batch_id AS batchId, memo_source AS memoSource
         FROM transactions WHERE import_batch_id = ? ORDER BY date`,
      )
      .all(saved.batchId) as {
      description: string;
      kind: string;
      categoryId: number | null;
      categoryOrigin: string;
      accountId: number;
      origin: string;
      batchId: number;
      memoSource: string;
    }[];
    expect(stored).toHaveLength(3);
    expect(stored[0]).toMatchObject({ kind: "expense", accountId: account.id, origin: "file" });
    expect(stored[0].categoryId).not.toBeNull();
    expect(stored[1].kind).toBe("income");
    // A generic transfer is not guessed into a category.
    expect(stored[2].categoryId).toBeNull();
    expect(stored[2].kind).toBe("expense");

    const again = saveImport({ workspaceId: 1, accountId: account.id, origin: "upload", rows });
    expect(again.added).toBe(0);
    expect(again.duplicates).toBe(3);

    const undone = deleteImportBatch(1, saved.batchId);
    expect(undone.removed).toBe(3);
    expect(getImportBatch(1, saved.batchId)?.status).toBe("undone");
    const left = getDb()
      .prepare("SELECT COUNT(*) AS n FROM transactions WHERE import_batch_id = ?")
      .get(saved.batchId) as { n: number };
    expect(left.n).toBe(0);
    const fk = getDb().pragma("foreign_key_check") as unknown[];
    expect(fk).toEqual([]);
  });

  it("keeps an adopted row when the batch is undone", () => {
    const account = resolveAccount(1, {
      provider: "hapoalim",
      kind: "bank",
      number: "777",
      label: "Hapoalim 777",
      create: true,
    })!.account;
    const rows = rowsFor(account.id).slice(0, 1);
    const saved = saveImport({ workspaceId: 1, accountId: account.id, origin: "upload", rows });
    const txn = getDb()
      .prepare("SELECT id FROM transactions WHERE import_batch_id = ?")
      .get(saved.batchId) as { id: number };
    getDb()
      .prepare("UPDATE transactions SET origin = 'sync', adopted_at = datetime('now') WHERE id = ?")
      .run(txn.id);
    const undone = deleteImportBatch(1, saved.batchId);
    expect(undone.removed).toBe(0);
    expect(undone.keptAdopted).toBe(1);
    expect(
      getDb().prepare("SELECT COUNT(*) AS n FROM transactions WHERE id = ?").get(txn.id),
    ).toEqual({ n: 1 });
    const row = getDb()
      .prepare("SELECT import_batch_id AS b FROM transactions WHERE id = ?")
      .get(txn.id) as {
      b: number | null;
    };
    expect(row.b).toBeNull();
  });

  it("treats the same client token as the same save", () => {
    const account = resolveAccount(1, {
      provider: "discount",
      kind: "bank",
      number: "555",
      label: "Discount 555",
      create: true,
    })!.account;
    const rows = rowsFor(account.id).slice(0, 2);
    const first = saveImport({
      workspaceId: 1,
      accountId: account.id,
      origin: "upload",
      rows,
      clientToken: "token-1",
    });
    const second = saveImport({
      workspaceId: 1,
      accountId: account.id,
      origin: "upload",
      rows,
      clientToken: "token-1",
    });
    expect(second.batchId).toBe(first.batchId);
    expect(second.added).toBe(first.added);
    expect(
      getDb()
        .prepare("SELECT COUNT(*) AS n FROM transactions WHERE account_id = ?")
        .get(account.id),
    ).toEqual({
      n: first.added,
    });
  });

  it("rejects a row with a category of the wrong kind as an error, not a guess", () => {
    const account = resolveAccount(1, {
      provider: "mizrahi",
      kind: "bank",
      number: "999",
      label: "Mizrahi 999",
      create: true,
    })!.account;
    const income = getDb()
      .prepare("SELECT id FROM categories WHERE workspace_id = 1 AND kind = 'income' LIMIT 1")
      .get() as { id: number };
    const row = rowsFor(account.id)[0];
    row.categoryId = income.id;
    row.categorySource = "user";
    const saved = saveImport({
      workspaceId: 1,
      accountId: account.id,
      origin: "upload",
      rows: [row],
    });
    expect(saved.errors).toBe(1);
    expect(saved.added).toBe(0);
  });
});

// Type-only import guard used by older TS settings.
it("keeps equal rows on two providers with the same account number", () => {
  const leumi = resolveAccount(1, {
    provider: "leumi",
    kind: "bank",
    number: "9999",
    label: "Leumi 9999",
    create: true,
  })!.account;
  const hapoalim = resolveAccount(1, {
    provider: "hapoalim",
    kind: "bank",
    number: "9999",
    label: "Hapoalim 9999",
    create: true,
  })!.account;
  const rowFor = (accountId: number) => {
    const normalized = normalizeImportRow(draft("04/02/2024", "Same row", "-30"), {
      dateOrder: "dmy",
      signConvention: "bankSigned",
      accountKind: "bank",
      accountId,
      accountCurrency: "ILS",
      today: "2026-11-26",
    }).row!;
    return [{ ...normalized, rowIndex: 1, accountId }];
  };

  const first = saveImport({
    workspaceId: 1,
    accountId: leumi.id,
    origin: "upload",
    rows: rowFor(leumi.id),
  });
  const second = saveImport({
    workspaceId: 1,
    accountId: hapoalim.id,
    origin: "upload",
    rows: rowFor(hapoalim.id),
  });

  expect(first.added).toBe(1);
  expect(second.added).toBe(1);
  const hashes = getDb()
    .prepare(
      "SELECT dedup_hash AS hash, dedup_hash_legacy AS legacy FROM transactions WHERE account_id IN (?, ?)",
    )
    .all(leumi.id, hapoalim.id) as { hash: string; legacy: string }[];
  expect(hashes).toHaveLength(2);
  expect(hashes[0].hash).not.toBe(hashes[1].hash);
  expect(hashes[0].legacy).toBe(hashes[1].legacy);
});
describe("saveImport replay and atomicity", () => {
  it("resolves a client token before the file hash and reruns failed post-commit work", () => {
    const account = resolveAccount(1, {
      provider: "leumi",
      kind: "bank",
      number: "token-account",
      label: "Token account",
      create: true,
    })!.account;
    const rows = rowsFor(account.id);
    const first = saveImport({
      workspaceId: 1,
      accountId: account.id,
      origin: "upload",
      rows,
      clientToken: "token-before-hash",
      fileSha256: "sha-token-before-hash",
    });
    expect(first.added).toBe(3);

    getDb()
      .prepare("UPDATE import_batches SET post_commit_status = 'failed' WHERE id = ?")
      .run(first.batchId);
    const replay = saveImport({
      workspaceId: 1,
      accountId: account.id,
      origin: "upload",
      rows,
      clientToken: "token-before-hash",
      fileSha256: "sha-token-before-hash",
    });
    expect(replay.batchId).toBe(first.batchId);
    expect(getImportBatch(1, first.batchId)?.postCommitStatus).toBe("completed");
    expect(
      getDb()
        .prepare("SELECT COUNT(*) AS n FROM transactions WHERE import_batch_id = ?")
        .get(first.batchId),
    ).toEqual({ n: 3 });
  });

  it("rolls back the batch marker when a row write fails", () => {
    const account = resolveAccount(1, {
      provider: "leumi",
      kind: "bank",
      number: "rollback-account",
      label: "Rollback account",
      create: true,
    })!.account;
    const rows = rowsFor(account.id);
    rows[0].description = "__force_insert_failure__";
    getDb().exec(
      `CREATE TRIGGER IF NOT EXISTS force_import_failure BEFORE INSERT ON transactions
       WHEN NEW.description = '__force_insert_failure__'
       BEGIN SELECT RAISE(ABORT, 'forced failure'); END;`,
    );
    try {
      expect(() =>
        saveImport({
          workspaceId: 1,
          accountId: account.id,
          origin: "upload",
          rows,
          clientToken: "atomic-failure-token",
        }),
      ).toThrow();
    } finally {
      getDb().exec("DROP TRIGGER IF EXISTS force_import_failure");
    }
    expect(
      getDb()
        .prepare("SELECT COUNT(*) AS n FROM import_batches WHERE client_token = ?")
        .get("atomic-failure-token"),
    ).toEqual({ n: 0 });
  });
});
