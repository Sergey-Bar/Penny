import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

const holder = vi.hoisted(() => ({ db: null as unknown as Database.Database }));
vi.mock("@/server/db", () => ({ getDb: () => holder.db }));
const scrape = vi.hoisted(() => vi.fn());
vi.mock("israeli-pension-scrapers", () => ({ scrapePension: scrape }));

import { runMigrations } from "@/server/db/migrate";
import { SYNC_ERRORS } from "@/lib/sync-errors";
import { replacePensionAssets } from "@/server/pension/sync";
import type { ScrapedAccount } from "@/server/pension/parsers";

const account = (accountNumber: string, balance: number, extra: Partial<ScrapedAccount> = {}) => ({
  accountNumber,
  label: `מוצר ${accountNumber}`,
  balance,
  currency: "ILS",
  transactions: [],
  ...extra,
});

describe("replacePensionAssets", () => {
  beforeEach(() => {
    holder.db = new Database(":memory:");
    runMigrations(holder.db);
    holder.db.pragma("foreign_keys = ON");
    holder.db
      .prepare(
        `INSERT INTO pension_connections (id, workspace_id, fund_id, credentials_encrypted, iv, auth_tag, last_error)
         VALUES (7, 1, 'excellence', x'00', x'00', x'00', 'old error')`,
      )
      .run();
  });
  afterEach(() => holder.db.close());

  const assets = () =>
    holder.db
      .prepare(
        `SELECT note, manual_value AS value, currency, symbol, cost_basis AS cost FROM assets ORDER BY note`,
      )
      .all() as { note: string; value: number; currency: string; symbol: string | null }[];

  it("upserts the scraped products and drops the ones the provider no longer shows", () => {
    replacePensionAssets(holder.db, 1, 7, [account("a", 100), account("b", 200)]);
    replacePensionAssets(holder.db, 1, 7, [account("a", 150, { currency: "USD", costBasis: 90 })]);
    expect(assets()).toEqual([
      { note: "pension:excellence:a", value: 150, currency: "USD", symbol: null, cost: 90 },
    ]);
    const conn = holder.db
      .prepare(`SELECT last_error, last_sync_at FROM pension_connections WHERE id = 7`)
      .get() as { last_error: string | null; last_sync_at: string | null };
    expect(conn.last_error).toBeNull();
    expect(conn.last_sync_at).not.toBeNull();
  });

  it("zeroes a dropped product that has value history instead of deleting the history", () => {
    replacePensionAssets(holder.db, 1, 7, [account("a", 100), account("b", 200)]);
    const b = holder.db
      .prepare(`SELECT id FROM assets WHERE note = 'pension:excellence:b'`)
      .get() as { id: number };
    holder.db
      .prepare(
        `INSERT INTO asset_snapshots (asset_id, date, value_ils) VALUES (?, '2026-01-01', 200)`,
      )
      .run(b.id);
    replacePensionAssets(holder.db, 1, 7, [account("a", 100)]);
    expect(assets().map((a) => [a.note, a.value])).toEqual([
      ["pension:excellence:a", 100],
      ["pension:excellence:b", 0],
    ]);
    expect(holder.db.prepare(`SELECT COUNT(*) AS n FROM asset_snapshots`).get()).toEqual({ n: 1 });
  });

  it("leaves other connections' and hand-made assets alone", () => {
    holder.db
      .prepare(
        `INSERT INTO assets (workspace_id, name, type, manual_value, note) VALUES
         (1, 'other', 'pension', 5, 'pension:70:x'), (1, 'mine', 'cash', 6, NULL)`,
      )
      .run();
    replacePensionAssets(holder.db, 1, 7, [account("a", 1)]);
    expect(assets().map((a) => a.note)).toEqual([null, "pension:70:x", "pension:excellence:a"]);
  });

  it("updates existing assets without duplicating when a fund is disconnected and reconnected", async () => {
    const { deletePensionConnection, savePensionConnection } =
      await import("@/server/pension/sync");
    replacePensionAssets(holder.db, 1, 7, [account("a", 100)]);
    deletePensionConnection(1, 7);
    const { id: newId } = savePensionConnection(1, "excellence", { username: "u", password: "p" });
    expect(newId).not.toBe(7);
    replacePensionAssets(holder.db, 1, newId, [account("a", 250)]);
    expect(assets().map((a) => [a.note, a.value])).toEqual([["pension:excellence:a", 250]]);
  });

  it("migrates legacy connection-id asset keys in-place without duplicating", () => {
    holder.db
      .prepare(
        `INSERT INTO assets (workspace_id, name, type, manual_value, note) VALUES
         (1, 'legacy', 'pension', 80, 'pension:7:a')`,
      )
      .run();
    replacePensionAssets(holder.db, 1, 7, [account("a", 120)]);
    expect(assets().map((a) => [a.note, a.value])).toEqual([["pension:excellence:a", 120]]);
  });

  it("keeps a listed product that came without a balance", () => {
    replacePensionAssets(holder.db, 1, 7, [account("a", 100)]);
    replacePensionAssets(holder.db, 1, 7, [{ ...account("a", 0), balance: undefined }]);
    expect(assets().map((a) => a.value)).toEqual([100]);
  });

  it("keeps the last good assets and records a redacted error when a scrape fails", async () => {
    const { savePensionConnection, startPensionSync, listPensionConnections } =
      await import("@/server/pension/sync");
    const { id } = savePensionConnection(1, "meitav", { id: "012345678", phone: "0501234567" });
    replacePensionAssets(holder.db, 1, id, [account("a", 100)]);
    const sync = async (outcome: object) => {
      scrape.mockResolvedValueOnce(outcome);
      expect(startPensionSync(1, id)).toBe(true);
      await vi.waitFor(() =>
        expect(listPensionConnections(1).find((c) => c.id === id)?.state).toBe("error"),
      );
      return holder.db
        .prepare(`SELECT last_error FROM pension_connections WHERE id = ?`)
        .get(id) as {
        last_error: string;
      };
    };

    const failed = await sync({
      success: false,
      accounts: [],
      errorMessage: "login failed for 012345678",
    });
    expect(failed.last_error).not.toContain("012345678");
    expect(assets().map((a) => a.value)).toEqual([100]);

    // "Success" with nothing in it is a failure too, not a reason to drop every product.
    const empty = await sync({ success: true, accounts: [] });
    expect(empty.last_error).toBe(SYNC_ERRORS.pensionNoData);
    expect(assets().map((a) => a.value)).toEqual([100]);
  });

  it("stores itemized holdings only, so the portfolio is not counted twice", () => {
    replacePensionAssets(holder.db, 1, 7, [
      account("1159250", 50000, { assetType: "stock" }),
      account("available-cash", 500, { assetType: "cash" }),
    ]);
    const total = holder.db.prepare(`SELECT SUM(manual_value) AS s FROM assets`).get() as {
      s: number;
    };
    expect(total.s).toBe(50500);
    expect(assets().some((a) => /portfolio|total/.test(a.note))).toBe(false);
  });
});
