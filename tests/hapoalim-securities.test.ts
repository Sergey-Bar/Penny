import { describe, expect, it } from "vitest";
import type { HTTPResponse, Page } from "puppeteer";
import {
  parseHapoalimMyTradeView,
  scrapeHapoalimSecurities,
} from "@/server/scrapers/hapoalim-securities";
import { saveBankSecurities } from "@/server/db/queries/assets";
import { getDb } from "@/server/db";
import { israelToday } from "@/lib/dates";

describe("parseHapoalimMyTradeView", () => {
  it("parses money market funds and equities with cost basis derived from AveragePriceProfitLoss", () => {
    const rows = parseHapoalimMyTradeView("752-414771", {
      View: {
        Account: {
          AccountPosition: {
            Balance: [
              {
                EquityNumber: "5139258",
                OnlineNV: 3461,
                OnlineVL: 3755.53,
                OnlineNisVL: 3755.53,
                AveragePriceProfitLoss: 133.5946,
                BaseRateChangePercentage: 0.02,
                CurrencyCode: "ILS",
              },
              {
                EquityNumber: "662577",
                OnlineNV: 4,
                OnlineVL: 279.28,
                OnlineNisVL: 279.28,
                AveragePriceProfitLoss: 4.9,
                BaseRateChangePercentage: -1.24,
                CurrencyCode: "ILS",
              },
            ],
          },
        },
        Meta: {
          Security: [
            {
              "-Key": "5139258",
              HebName: "ילין לפידות כספית ניהול נזילות",
              ItemType: "Fund",
              IsEtf: false,
              CurrencyCode: "ILS",
              Exchange: "TASE",
            },
            {
              "-Key": "662577",
              HebName: "פועלים",
              Symbol: "POLI",
              ItemType: "Equity",
              IsEtf: null,
              CurrencyCode: "ILS",
              Exchange: "TASE",
            },
          ],
        },
      },
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      accountNumber: "752-414771",
      equityNumber: "5139258",
      name: "ילין לפידות כספית ניהול נזילות",
      type: "fund",
      currency: "ILS",
      symbol: null,
      quantity: 3461,
      value: 3755.53,
      valueIls: 3755.53,
    });
    expect(rows[0].costBasis).toBeCloseTo(3621.9354, 3);

    expect(rows[1]).toMatchObject({
      equityNumber: "662577",
      name: "פועלים",
      type: "stock",
      quantity: 4,
      value: 279.28,
    });
    expect(rows[1].costBasis).toBeCloseTo(274.38, 2);
  });
});

type Handler = (response: HTTPResponse) => void;

function fakeResponse(url: string, body: unknown): HTTPResponse {
  return {
    url: () => url,
    ok: () => true,
    request: () => ({ headers: () => ({ session: "session-token" }) }),
    json: async () => body,
  } as unknown as HTTPResponse;
}

class FakePage {
  private handlers = new Set<Handler>();
  constructor(
    private responses: HTTPResponse[],
    private evaluateImpl: () => Promise<unknown> = () => Promise.reject(new Error("unexpected")),
  ) {}

  on(event: string, handler: Handler): void {
    if (event === "response") this.handlers.add(handler);
  }

  off(event: string, handler: Handler): void {
    if (event === "response") this.handlers.delete(handler);
  }

  async goto(): Promise<void> {
    for (const response of this.responses) {
      for (const handler of this.handlers) handler(response);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  evaluate(): Promise<unknown> {
    return this.evaluateImpl();
  }
}

const accountsResponse = (keys: string[]) =>
  fakeResponse("https://login.bankhapoalim.co.il/ServerServices/mytrade/api/v2/json2/accounts", {
    UserAccounts: { UserAccount: keys.map((key) => ({ "-key": key })) },
  });

const emptyViewResponse = (account: string, withHeader = false) =>
  fakeResponse(
    `https://login.bankhapoalim.co.il/ServerServices/mytrade/api/v2/json2/account/view?account=${account}`,
    withHeader
      ? { View: { Account: { AccountPosition: { Balance: [] } }, Meta: { Security: [] } } }
      : { View: { Account: null } },
  );

describe("scrapeHapoalimSecurities completeness", () => {
  it("returns an empty list only for a confirmed empty portfolio", async () => {
    const page = new FakePage([accountsResponse(["111"]), emptyViewResponse("111", true)]);
    const result = await scrapeHapoalimSecurities(page as unknown as Page, {
      captureDeadlineMs: 150,
    });
    expect(result).toEqual({ securities: [], accountNumbers: ["111"] });
  });

  it("returns undefined when a discovered account has no validated view", async () => {
    const page = new FakePage(
      [accountsResponse(["111", "222"]), emptyViewResponse("111", true)],
      () => new Promise(() => undefined),
    );
    const result = await scrapeHapoalimSecurities(page as unknown as Page, {
      captureDeadlineMs: 150,
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined when account discovery never completes", async () => {
    const page = new FakePage([emptyViewResponse("111", true)]);
    const result = await scrapeHapoalimSecurities(page as unknown as Page, {
      captureDeadlineMs: 80,
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined when a view body is not valid JSON", async () => {
    const badView = {
      url: () =>
        "https://login.bankhapoalim.co.il/ServerServices/mytrade/api/v2/json2/account/view?account=111",
      ok: () => true,
      request: () => ({ headers: () => ({ session: "session-token" }) }),
      json: async () => {
        throw new Error("invalid json");
      },
    } as unknown as HTTPResponse;
    const page = new FakePage([accountsResponse(["111"]), badView]);
    const result = await scrapeHapoalimSecurities(page as unknown as Page, {
      captureDeadlineMs: 120,
    });
    expect(result).toBeUndefined();
  });
});

const holding = (accountNumber: string, equityNumber: string, value: number) => ({
  accountNumber,
  equityNumber,
  name: `Holding ${equityNumber}`,
  type: "stock" as const,
  currency: "ILS",
  symbol: null,
  quantity: 1,
  value,
  valueIls: value,
  costBasis: value / 2,
});

function clearAssets(workspaceId: number): void {
  const db = getDb();
  db.prepare(
    "DELETE FROM asset_snapshots WHERE asset_id IN (SELECT id FROM assets WHERE workspace_id = ?)",
  ).run(workspaceId);
  db.prepare("DELETE FROM assets WHERE workspace_id = ?").run(workspaceId);
}

function assetRow(workspaceId: number, note: string) {
  return getDb()
    .prepare(
      "SELECT id, manual_value as manualValue, details FROM assets WHERE workspace_id = ? AND note = ?",
    )
    .get(workspaceId, note) as
    { id: number; manualValue: number; details: string | null } | undefined;
}

describe("saveBankSecurities stale reconciliation", () => {
  it("zeroes today's snapshot for a stale holding with history", () => {
    const workspaceId = 1;
    clearAssets(workspaceId);
    const note = "bank-securities:hapoalim:7:111:A";
    saveBankSecurities(workspaceId, "hapoalim", [holding("111", "A", 100)], {
      credentialId: 7,
      accountNumbers: ["111"],
    });
    const before = assetRow(workspaceId, note);
    expect(before?.manualValue).toBe(100);

    saveBankSecurities(workspaceId, "hapoalim", [], {
      credentialId: 7,
      accountNumbers: ["111"],
    });

    expect(assetRow(workspaceId, note)?.manualValue).toBe(0);
    const snapshot = getDb()
      .prepare("SELECT value_ils as valueIls FROM asset_snapshots WHERE asset_id = ? AND date = ?")
      .get(before!.id, israelToday()) as { valueIls: number } | undefined;
    expect(snapshot?.valueIls).toBe(0);
  });

  it("leaves another credential's and another account's holdings untouched", () => {
    const workspaceId = 1;
    clearAssets(workspaceId);
    const first = "bank-securities:hapoalim:7:111:A";
    const otherCredential = "bank-securities:hapoalim:8:222:B";
    const otherAccount = "bank-securities:hapoalim:7:333:C";
    saveBankSecurities(workspaceId, "hapoalim", [holding("111", "A", 100)], {
      credentialId: 7,
      accountNumbers: ["111"],
    });
    saveBankSecurities(workspaceId, "hapoalim", [holding("222", "B", 200)], {
      credentialId: 8,
      accountNumbers: ["222"],
    });
    saveBankSecurities(workspaceId, "hapoalim", [holding("333", "C", 300)], {
      credentialId: 7,
      accountNumbers: ["333"],
    });

    saveBankSecurities(workspaceId, "hapoalim", [], {
      credentialId: 7,
      accountNumbers: ["111"],
    });

    expect(assetRow(workspaceId, first)?.manualValue).toBe(0);
    expect(assetRow(workspaceId, otherCredential)?.manualValue).toBe(200);
    expect(assetRow(workspaceId, otherAccount)?.manualValue).toBe(300);
  });

  it("adopts a legacy key instead of creating a duplicate", () => {
    const workspaceId = 1;
    clearAssets(workspaceId);
    saveBankSecurities(workspaceId, "hapoalim", [holding("111", "A", 100)]);
    expect(assetRow(workspaceId, "bank-securities:hapoalim:111:A")?.manualValue).toBe(100);

    saveBankSecurities(workspaceId, "hapoalim", [holding("111", "A", 120)], {
      credentialId: 7,
      accountNumbers: ["111"],
    });

    const rows = getDb()
      .prepare("SELECT note FROM assets WHERE workspace_id = ? ORDER BY id")
      .all(workspaceId) as { note: string }[];
    expect(rows).toEqual([{ note: "bank-securities:hapoalim:7:111:A" }]);
    expect(assetRow(workspaceId, "bank-securities:hapoalim:7:111:A")?.manualValue).toBe(120);
  });
});

describe("scrapeHapoalimSecurities fallback completeness", () => {
  it("accepts valid views fetched by the fallback", async () => {
    const page = new FakePage([accountsResponse(["111"])], () =>
      Promise.resolve([
        {
          key: "111",
          data: { View: { Account: { AccountPosition: { Balance: [] } }, Meta: { Security: [] } } },
        },
      ]),
    );
    const result = await scrapeHapoalimSecurities(page as unknown as Page, {
      captureDeadlineMs: 500,
    });
    expect(result).toEqual({ securities: [], accountNumbers: ["111"] });
  });

  it("rejects a null account view instead of treating it as an empty portfolio", async () => {
    const page = new FakePage([accountsResponse(["111"]), emptyViewResponse("111", false)], () =>
      Promise.resolve([]),
    );
    const result = await scrapeHapoalimSecurities(page as unknown as Page, {
      captureDeadlineMs: 120,
    });
    expect(result).toBeUndefined();
  });
});
