import { describe, expect, it } from "vitest";
import { parseHapoalimMyTradeView } from "@/server/scrapers/hapoalim-securities";

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
