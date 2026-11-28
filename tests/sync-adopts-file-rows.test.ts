import { describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";

const holder = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ getDb: () => holder.db }));
vi.mock("../src/server/db/index", () => ({ getDb: () => holder.db }));

import { insertTransactions, storedForImport } from "@/server/db/queries/transactions";

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
    const rows = db
      .prepare("SELECT provider, description, category_id FROM transactions ORDER BY date")
      .all();
    expect(rows).toEqual([
      { provider: "max", description: "סופר-פארם", category_id: cat },
      { provider: "max", description: "סופר-פארם", category_id: null },
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
