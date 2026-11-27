import type { HTTPResponse, Page } from "puppeteer";
import type { ScrapedSecurity } from "./types";

const VIEW_FIELDS = [
  "EngName",
  "EngSymbol",
  "HebName",
  "HebSymbol",
  "Symbol",
  "ExpirationDate",
  "ItemType",
  "StockType",
  "IsEtf",
  "IsForeign",
  "CurrencyCode",
  "Exchange",
  "CreationEquityNum",
  "EquityType",
  "ContractType",
  "AllowedOrderDirection",
  "EquitySubType",
  "BridgeWiseRating",
  "BridgeWiseRecommendation",
  "TradingStage",
].join(",");

interface MyTradeBalanceItem {
  EquityNumber?: string | null;
  OnlineNV?: number | null;
  OnlineVL?: number | null;
  OnlineNisVL?: number | null;
  AveragePriceProfitLoss?: number | null;
  BaseRateChangePercentage?: number | null;
  CurrencyCode?: string | null;
}

interface MyTradeSecurityMeta {
  "-Key"?: string | null;
  EngName?: string | null;
  HebName?: string | null;
  Symbol?: string | null;
  EngSymbol?: string | null;
  ItemType?: string | null;
  IsEtf?: boolean | null;
  IsForeign?: boolean | null;
  CurrencyCode?: string | null;
  Exchange?: string | null;
}

export interface MyTradeViewResponse {
  View?: {
    Account?: {
      AccountPosition?: {
        Balance?: MyTradeBalanceItem[] | null;
      } | null;
    } | null;
    Meta?: {
      Security?: MyTradeSecurityMeta[] | null;
    } | null;
  } | null;
}

function mapSecurityType(meta: MyTradeSecurityMeta | undefined): "stock" | "fund" | "bond" {
  if (meta?.IsEtf === true || meta?.ItemType === "Equity") return "stock";
  if (meta?.ItemType === "Bond") return "bond";
  if (meta?.ItemType === "Fund") return "fund";
  return "stock";
}

/** Parses one Hapoalim myTrade `/account/view` payload into normalized `ScrapedSecurity` rows. */
export function parseHapoalimMyTradeView(
  accountNumber: string,
  payload: MyTradeViewResponse | null | undefined,
): ScrapedSecurity[] {
  const balances = payload?.View?.Account?.AccountPosition?.Balance ?? [];
  const metas = payload?.View?.Meta?.Security ?? [];
  const metaByKey = new Map<string, MyTradeSecurityMeta>();
  for (const m of metas) {
    const key = m["-Key"]?.trim();
    if (key) metaByKey.set(key, m);
  }

  const out: ScrapedSecurity[] = [];
  for (const b of balances) {
    const equityNumber = b.EquityNumber?.trim();
    if (!equityNumber) continue;
    const value = b.OnlineVL;
    if (value == null || !Number.isFinite(value) || value <= 0) continue;

    const meta = metaByKey.get(equityNumber);
    const name = meta?.HebName?.trim() || meta?.EngName?.trim() || equityNumber;
    const currency = (b.CurrencyCode || meta?.CurrencyCode || "ILS").trim().toUpperCase();
    const costBasis =
      b.AveragePriceProfitLoss != null && Number.isFinite(b.AveragePriceProfitLoss)
        ? Math.max(0, value - b.AveragePriceProfitLoss)
        : null;
    const valueIls =
      b.OnlineNisVL != null && Number.isFinite(b.OnlineNisVL)
        ? b.OnlineNisVL
        : currency === "ILS"
          ? value
          : null;

    out.push({
      accountNumber,
      equityNumber,
      name,
      type: mapSecurityType(meta),
      currency,
      // Keep symbol null so valuation uses the bank's live OnlineVL & costBasis directly
      // without Yahoo Finance colliding on TASE short tickers (e.g. POLI).
      symbol: null,
      quantity: b.OnlineNV != null && Number.isFinite(b.OnlineNV) ? b.OnlineNV : null,
      value,
      valueIls,
      costBasis,
      details: {
        source: "hapoalim-mytrade",
        equityNumber,
        ticker: meta?.Symbol ?? meta?.EngSymbol ?? null,
        exchange: meta?.Exchange ?? null,
        dailyPct: b.BaseRateChangePercentage ?? null,
      },
    });
  }
  return out;
}

/**
 * Fetches securities holdings from Bank Hapoalim's `/myTrade/` SPA using the already-authenticated
 * Puppeteer page. Listens to the SPA's own API responses so all session/xsrf tokens are handled
 * natively by Hapoalim's frontend. Returns `undefined` if myTrade is unavailable or fails.
 */
export async function scrapeHapoalimSecurities(page: Page): Promise<ScrapedSecurity[] | undefined> {
  const capturedViews = new Map<string, MyTradeViewResponse>();
  let accountKeys: string[] = [];
  let capturedHeaders: Record<string, string> = {};
  let sawAnyMyTradeResponse = false;

  const handleResponse = async (res: HTTPResponse) => {
    const url = res.url();
    if (!url.includes("/ServerServices/mytrade/api/v2/json2/")) return;
    if (!res.ok()) {
      console.warn(`[scraper] hapoalim myTrade response ${res.status()} for ${url}`);
      return;
    }
    sawAnyMyTradeResponse = true;

    const reqHeaders = res.request().headers();
    if (reqHeaders["session"] || reqHeaders["x-xsrf-token"]) {
      capturedHeaders = {
        ...(reqHeaders["session"] ? { session: reqHeaders["session"] } : {}),
        ...(reqHeaders["csession"] ? { csession: reqHeaders["csession"] } : {}),
        ...(reqHeaders["x-xsrf-token"] ? { "x-xsrf-token": reqHeaders["x-xsrf-token"] } : {}),
      };
    }

    try {
      if (url.endsWith("/accounts")) {
        const json = (await res.json()) as {
          UserAccounts?: { UserAccount?: Array<{ "-key"?: string }> };
        };
        accountKeys = (json?.UserAccounts?.UserAccount ?? [])
          .map((a) => a["-key"]?.trim())
          .filter((k): k is string => Boolean(k));
      } else if (url.includes("/account/view?")) {
        const parsedUrl = new URL(url);
        const acct = parsedUrl.searchParams.get("account")?.trim();
        if (acct) {
          const json = (await res.json()) as MyTradeViewResponse;
          capturedViews.set(acct, json);
        }
      }
    } catch {
      // Ignore non-JSON or aborted response bodies.
    }
  };

  const onResponse = (res: HTTPResponse) => {
    void handleResponse(res);
  };

  page.on("response", onResponse);
  try {
    await page.goto("https://login.bankhapoalim.co.il/myTrade/", {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });

    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      if (
        capturedViews.size > 0 &&
        (accountKeys.length === 0 || capturedViews.size >= accountKeys.length)
      ) {
        break;
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    // If there are additional securities accounts not yet viewed by the SPA, fetch them with the
    // real session headers captured from the SPA's own requests.
    const missingKeys = accountKeys.filter((k) => !capturedViews.has(k));
    if (missingKeys.length > 0 && Object.keys(capturedHeaders).length > 0) {
      const extra = await page.evaluate(
        async ({ keys, headers, fields }) => {
          const results: Array<{ key: string; data: unknown }> = [];
          for (const key of keys) {
            const url = `/ServerServices/mytrade/api/v2/json2/account/view?account=${encodeURIComponent(key)}&fields=${fields}`;
            const res = await fetch(url, {
              method: "POST",
              credentials: "include",
              headers: {
                accept: "application/json, text/plain, */*",
                "content-type": "application/json; charset=utf-8",
                ...headers,
              },
            });
            if (res.ok) results.push({ key, data: await res.json() });
          }
          return results;
        },
        { keys: missingKeys, headers: capturedHeaders, fields: VIEW_FIELDS },
      );
      for (const item of extra) {
        capturedViews.set(item.key, item.data as MyTradeViewResponse);
      }
    }

    if (!sawAnyMyTradeResponse && capturedViews.size === 0) {
      console.warn("[scraper] hapoalim myTrade: no API responses captured");
      return undefined;
    }

    const parsed = [...capturedViews.entries()].flatMap(([acct, data]) =>
      parseHapoalimMyTradeView(acct, data),
    );
    console.log(
      `[scraper] hapoalim myTrade: ${parsed.length} holding(s) across ${capturedViews.size} account(s)`,
    );
    return parsed;
  } catch (err) {
    console.warn(
      "[scraper] hapoalim myTrade failed (non-fatal):",
      err instanceof Error ? err.message : String(err),
    );
    return undefined;
  } finally {
    page.off("response", onResponse);
  }
}
