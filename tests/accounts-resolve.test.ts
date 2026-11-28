import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type * as Accounts from "@/server/db/queries/accounts";

let accounts: typeof Accounts;
let getDb: typeof import("@/server/db/index").getDb;

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-accounts-"));
  accounts = await import("@/server/db/queries/accounts");
  getDb = (await import("@/server/db/index")).getDb;
});

function create(provider: string, number: string, currency = "ILS") {
  return accounts.createAccountResult(1, {
    provider,
    kind: "bank",
    number,
    label: `${provider} ${number} ${currency}`,
    currency,
  }).account;
}

describe("account resolution", () => {
  it("uses provider+number exactly before any cross-provider hint", () => {
    create("leumi", "9001");
    const hapoalim = create("hapoalim", "9001");
    expect(
      accounts.resolveAccount(1, { provider: "hapoalim", number: "9001", kind: "bank" })?.account
        .id,
    ).toBe(hapoalim.id);
  });

  it("creates a provider account instead of borrowing another provider's number", () => {
    create("leumi", "9002");
    const resolved = accounts.resolveAccount(1, {
      provider: "hapoalim",
      number: "9002",
      kind: "bank",
      create: true,
    });
    expect(resolved?.created).toBe(true);
    expect(resolved?.account.provider).toBe("hapoalim");
    expect(accounts.getAccountByNumber(1, "leumi", "9002")?.id).not.toBe(resolved?.account.id);
  });

  it("flags a same-number match as ambiguous without a provider", () => {
    create("leumi", "9003");
    create("mizrahi", "9003");
    const resolved = accounts.resolveAccount(1, { provider: "file", number: "9003" });
    expect(resolved?.ambiguous).toBe(true);
    expect(resolved?.candidates.length).toBeGreaterThan(1);
  });

  it("keeps currencies apart when resolving by number", () => {
    create("leumi", "9004", "ILS");
    const usd = create("leumi", "9004", "USD");
    const resolved = accounts.resolveAccount(1, {
      provider: "file",
      number: "9004",
      currency: "USD",
    });
    expect(resolved?.account.id).toBe(usd.id);
    expect(resolved?.ambiguous).toBe(false);
  });

  it("flags an exact provider and number in two currencies as ambiguous", () => {
    create("mizrahi", "9006", "ILS");
    create("mizrahi", "9006", "USD");
    const resolved = accounts.resolveAccount(1, { provider: "mizrahi", number: "9006" });
    expect(resolved?.ambiguous).toBe(true);
    expect(resolved?.candidates).toHaveLength(2);
    const explicit = accounts.resolveAccount(1, {
      provider: "mizrahi",
      number: "9006",
      currency: "USD",
    });
    expect(explicit?.ambiguous).toBe(false);
    expect(explicit?.account.currency).toBe("USD");
  });

  it("resolves a bank account by label within the same provider", () => {
    const account = accounts.createAccountResult(1, {
      provider: "hapoalim",
      kind: "bank",
      number: "123",
      label: "Household",
      currency: "ILS",
    }).account;
    expect(
      accounts.resolveAccount(1, { provider: "hapoalim", label: "Household", create: true })
        ?.account.id,
    ).toBe(account.id);
    expect(
      accounts.resolveAccount(1, { provider: "hapoalim", label: "Household", create: false })
        ?.account.id,
    ).toBe(account.id);
    expect(
      accounts.resolveAccount(1, { provider: "leumi", label: "Household", create: false }),
    ).toBeNull();
  });
});

describe("linked account balances", () => {
  it("stores a separate balance for each account identity", () => {
    const ils = create("discount", "7001", "ILS");
    const usd = create("discount", "7001", "USD");
    accounts.upsertAccountBalance({
      workspaceId: 1,
      accountId: ils.id,
      provider: ils.provider,
      accountNumber: ils.number,
      balance: 100,
      source: "manual",
      asOf: "2026-11-27",
    });
    accounts.upsertAccountBalance({
      workspaceId: 1,
      accountId: usd.id,
      provider: usd.provider,
      accountNumber: usd.number,
      balance: 25,
      source: "manual",
      asOf: "2026-11-27",
    });
    expect(accounts.getAccountBalance(1, ils.id)?.balance).toBe(100);
    expect(accounts.getAccountBalance(1, usd.id)?.balance).toBe(25);
  });

  it("removes the unlinked balance once a linked balance is written", async () => {
    const { saveAccountBalances } = await import("@/server/db/queries/assets");
    const account = create("discount", "7200", "ILS");
    const db = getDb();
    db.prepare(
      "INSERT INTO account_balances (workspace_id, provider, account_number, balance, updated_at) VALUES (1, 'discount', '7200', 50, datetime('now'))",
    ).run();
    saveAccountBalances(1, "discount", [{ accountNumber: "7200", balance: 75 }], "2026-01-01");
    const rows = db
      .prepare(
        `SELECT account_id AS accountId, balance FROM account_balances
         WHERE workspace_id = 1 AND provider = 'discount' AND account_number = '7200'`,
      )
      .all();
    expect(rows).toEqual([{ accountId: account.id, balance: 75 }]);
  });
});

describe("account merge balances", () => {
  it("merges when both accounts have a linked balance", () => {
    const source = create("leumi", "7100", "ILS");
    const target = create("leumi", "7101", "ILS");
    for (const [account, balance] of [
      [source, 100],
      [target, 25],
    ] as const) {
      accounts.upsertAccountBalance({
        workspaceId: 1,
        accountId: account.id,
        provider: account.provider,
        accountNumber: account.number,
        balance,
        source: "manual",
        asOf: "2026-11-27",
      });
    }
    expect(accounts.mergeAccounts(1, source.id, target.id)).toMatchObject({ ok: true });
    expect(accounts.getAccountBalance(1, target.id)?.balance).toBe(25);
    expect(accounts.getAccountBalance(1, source.id)).toBeNull();
  });
});
