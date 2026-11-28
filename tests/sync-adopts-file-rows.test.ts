import { describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";

const holder = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ getDb: () => holder.db }));
vi.mock("../src/server/db/index", () => ({ getDb: () => holder.db }));

import {
  insertFileImport,
  insertTransactions,
  storedForImport,
} from "@/server/db/queries/transactions";

import { createAccountResult, resolveAccount } from "@/server/db/queries/accounts";
import { saveAccountBalances } from "@/server/db/queries/assets";
import { storedImportCandidates } from "@/server/db/queries/imports";
import { computeDedupHash } from "@/server/lib/dedup";

function fixture() {
  const db = new Database(":memory:");
  for (const f of readdirSync("src/server/db/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(`src/server/db/migrations/${f}`, "utf8"));
  db.pragma("foreign_keys = OFF"); // no bank_credentials row needed for credential 1
  holder.db = db;
  const ws = (db.prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: number }).id;
  const run = Number(
    db
      .prepare(
        "INSERT INTO sync_runs (workspace_id,provider,status,scrape_from_date,started_at) VALUES (?,'file','completed','1970-01-01','1970-01-01')",
      )
      .run(ws).lastInsertRowid,
  );
  const cat = (
    db.prepare("SELECT id FROM categories WHERE workspace_id=? LIMIT 1").get(ws) as { id: number }
  ).id;
  db.prepare(
    "INSERT INTO transactions (workspace_id,account_number,date,processed_date,original_amount,original_currency,charged_amount,description,type,status,provider,sync_run_id,dedup_hash,kind,category_id) VALUES (?,'1234','2026-11-02','2026-11-02',-80,'ILS',-80,'SUPER PHARM','normal','completed','file',?,'f1','expense',?)",
  ).run(ws, run, cat);
  return { db, ws, run, cat };
}

const synced = (date: string, amount: number) => ({
  accountNumber: "1234",
  date,
  processedDate: date,
  originalAmount: amount,
  originalCurrency: "ILS",
  chargedAmount: amount,
  description: "סופר-פארם",
  type: "normal",
  status: "completed",
});

describe("sync and imported files", () => {
  it("a synced row takes over the matching file row and keeps its category", () => {
    const { db, ws, run, cat } = fixture();
    const { account: fileAccount } = createAccountResult(ws, {
      provider: "file",
      number: "1234",
      label: "File",
    });
    db.prepare("UPDATE transactions SET account_id = ?").run(fileAccount.id);
    const r = insertTransactions(
      ws,
      [
        synced("2026-11-01T22:00:00.000Z", -80) as never,
        synced("2026-11-05T00:00:00.000Z", -80) as never,
      ],
      "max",
      1,
      run,
    );
    expect(r).toEqual({ added: 1, updated: 1 });
    const resolved = resolveAccount(ws, { provider: "max", number: "1234" })!;
    expect(db.prepare("SELECT DISTINCT account_id FROM transactions").pluck().all()).toEqual([
      resolved.account.id,
    ]);
    const rows = db
      .prepare("SELECT provider, description, category_id FROM transactions ORDER BY date")
      .all();
    expect(rows).toEqual([
      { provider: "max", description: "סופר-פארם", category_id: cat },
      { provider: "max", description: "סופר-פארם", category_id: null },
    ]);
  });

  it("does not adopt a file row linked to a different bank account", () => {
    const { db, ws, run } = fixture();
    const max = createAccountResult(ws, {
      provider: "max",
      kind: "bank",
      number: "1234",
      label: "Max 1234",
      currency: "ILS",
    }).account;
    const leumi = createAccountResult(ws, {
      provider: "leumi",
      kind: "bank",
      number: "1234",
      label: "Leumi 1234",
      currency: "ILS",
    }).account;
    expect(max.id).not.toBe(leumi.id);
    db.prepare("UPDATE transactions SET account_id = ? WHERE dedup_hash = 'f1'").run(leumi.id);

    const result = insertTransactions(
      ws,
      [synced("2026-11-01T22:00:00.000Z", -80) as never],
      "max",
      1,
      run,
    );

    expect(result).toEqual({ added: 1, updated: 0 });
    expect(
      db
        .prepare(
          "SELECT provider, account_id AS accountId FROM transactions WHERE dedup_hash = 'f1'",
        )
        .get(),
    ).toEqual({ provider: "file", accountId: leumi.id });
  });

  it("reuses either hash owned by the resolved account and leaves unrelated legacy rows out", () => {
    const { db, ws, run } = fixture();
    const date = "2026-12-03";
    const txn = { ...synced(date, -100), type: "normal", status: "completed" } as const;
    expect(insertTransactions(ws, [txn], "max", 1, run)).toMatchObject({ added: 1 });
    const row = { date, description: txn.description, amount: -100, seq: 1 };
    expect(insertFileImport(ws, "1234", [row], "card").added).toBe(0);

    const { account } = resolveAccount(ws, { provider: "max", number: "1234" })!;
    const legacyHash = db.prepare("SELECT dedup_hash FROM transactions WHERE date = ?").pluck();
    const identityHash = legacyHash.get(date);
    const { account: other } = createAccountResult(ws, {
      provider: "file",
      number: "1234",
      label: "Separate file account",
    });
    expect(insertFileImport(ws, "1234", [row], "bank").added).toBe(1);
    expect(storedImportCandidates(ws, other.id, "1234", date, date)).toHaveLength(1);

    db.prepare("DELETE FROM transactions WHERE account_id = ?").run(other.id);
    db.prepare("DELETE FROM accounts WHERE id = ?").run(other.id);
    db.prepare(
      "UPDATE transactions SET account_id = NULL, dedup_hash = ? WHERE dedup_hash = ?",
    ).run(
      computeDedupHash({
        accountNumber: "1234",
        date,
        description: txn.description,
        originalAmount: -100,
        originalCurrency: "ILS",
      }),
      identityHash,
    );
    expect(storedImportCandidates(ws, account.id, "1234", date, date)).toHaveLength(1);
    expect(insertFileImport(ws, "1234", [row], "card").added).toBe(0);
    db.prepare("UPDATE transactions SET provider = 'visaCal' WHERE date = ?").run(date);
    expect(storedImportCandidates(ws, account.id, "1234", date, date)).toHaveLength(0);
    expect(insertFileImport(ws, "1234", [row], "card").added).toBe(1);
  });

  it("adopts an exact identity hash from a file without creating another transaction", () => {
    const { db, ws, run } = fixture();
    createAccountResult(ws, { provider: "max", number: "1234", label: "Card" });
    const date = "2026-12-03";
    const txn = { ...synced(date, -100), type: "normal", status: "completed" } as const;
    expect(
      insertFileImport(
        ws,
        "1234",
        [{ date, description: txn.description, amount: -100, seq: 1 }],
        "card",
      ).added,
    ).toBe(1);
    expect(insertTransactions(ws, [txn], "max", 1, run)).toEqual({ added: 0, updated: 1 });
    expect(db.prepare("SELECT provider FROM transactions WHERE date = ?").all(date)).toEqual([
      { provider: "max" },
    ]);
  });

  it("reports currency ambiguity and does not match unlinked rows without a unique owner", () => {
    const { ws } = fixture();
    const base = { provider: "file", number: "1234", label: "Statement" };
    const { account: ils } = createAccountResult(ws, { ...base, currency: "ILS" });
    const { account: usd } = createAccountResult(ws, { ...base, currency: "USD" });
    expect(resolveAccount(ws, base)).toMatchObject({ ambiguous: true, candidates: [ils, usd] });
    expect(resolveAccount(ws, { ...base, currency: " usd " })).toMatchObject({
      ambiguous: false,
      account: usd,
    });
    expect(storedImportCandidates(ws, ils.id, "1234", "2026-11-02", "2026-11-02")).toEqual([]);
  });

  it("replaces a manual unlinked balance with the uniquely linked bank balance", () => {
    const { db, ws } = fixture();
    db.prepare(
      "INSERT INTO account_balances (workspace_id, provider, account_number, balance, source) VALUES (?, 'hapoalim', '1234', 50, 'manual'), (?, 'leumi', '1234', 75, 'manual')",
    ).run(ws, ws);
    const { account } = createAccountResult(ws, {
      provider: "hapoalim",
      number: "1234",
      label: "Bank",
    });
    saveAccountBalances(ws, "hapoalim", [{ accountNumber: "1234", balance: 100 }]);
    expect(
      db
        .prepare("SELECT provider, account_id, balance FROM account_balances ORDER BY provider")
        .all(),
    ).toEqual([
      { provider: "hapoalim", account_id: account.id, balance: 100 },
      { provider: "leumi", account_id: null, balance: 75 },
    ]);
  });

  it("lists stored rows a day around the range for file dedupe", () => {
    const { ws } = fixture();
    expect(storedForImport(ws, "1234", "2026-11-03", "2026-11-10")).toEqual([
      { date: "2026-11-02", amount: -80 },
    ]);
    expect(storedForImport(ws, "1234", "2026-11-04", "2026-11-10")).toEqual([]);
  });
});
it("keeps a person's memo when a sync adopts the file row", () => {
  const { db, ws, run } = fixture();
  db.prepare(
    "UPDATE transactions SET memo = 'keep me', memo_source = 'user' WHERE dedup_hash = 'f1'",
  ).run();
  insertTransactions(ws, [synced("2026-11-01T22:00:00.000Z", -80) as never], "max", 1, run);
  expect(
    db
      .prepare("SELECT memo, memo_source AS source FROM transactions WHERE adopted_at IS NOT NULL")
      .get(),
  ).toEqual({ memo: "keep me", source: "user" });
});
