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

/** An empty portfolio is `Balance: []`; a null/missing account payload is not usable evidence. */
function isUsableView(payload: MyTradeViewResponse | null | undefined): boolean {
  return Array.isArray(payload?.View?.Account?.AccountPosition?.Balance);
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

export interface HapoalimSecuritiesCapture {
  securities: ScrapedSecurity[];
  /** Accounts whose view was requested and validated, including accounts with no holdings. */
  accountNumbers: string[];
}

/**
 * Fetches securities holdings from Bank Hapoalim's `/myTrade/` SPA using the already-authenticated
 * Puppeteer page. Listens to the SPA's own API responses so all session/xsrf tokens are handled
 * natively by Hapoalim's frontend.
 *
 * Reconciliation is only safe after a complete capture: account discovery must have succeeded,
 * every discovered account must have a parsed view, and the fallback fetch must finish inside the
 * capture deadline. Incomplete captures return `undefined`, never an empty list. An empty list is
 * reserved for a confirmed empty portfolio.
 */
export async function scrapeHapoalimSecurities(
  page: Page,
  options: { captureDeadlineMs?: number } = {},
): Promise<HapoalimSecuritiesCapture | undefined> {
  const capturedViews = new Map<string, MyTradeViewResponse>();
  let accountKeys: string[] = [];
  let capturedHeaders: Record<string, string> = {};
  let sawAccountsResponse = false;
  let sawValidView = false;
  let firstViewAt: number | null = null;

  const handleResponse = async (res: HTTPResponse) => {
    const url = res.url();
    if (!url.includes("/ServerServices/mytrade/api/v2/json2/")) return;
    if (!res.ok()) {
      console.warn(`[scraper] hapoalim myTrade response ${res.status()} for ${url}`);
      return;
    }

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
        accountKeys = [
          ...new Set(
            (json?.UserAccounts?.UserAccount ?? [])
              .map((a) => a["-key"]?.trim())
              .filter((k): k is string => Boolean(k)),
          ),
        ];
        sawAccountsResponse = true;
      } else if (url.includes("/account/view?")) {
        const parsedUrl = new URL(url);
        const acct = parsedUrl.searchParams.get("account")?.trim();
        if (acct) {
          const json = (await res.json()) as MyTradeViewResponse;
          if (isUsableView(json)) {
            capturedViews.set(acct, json);
            sawValidView = true;
            if (firstViewAt == null) firstViewAt = Date.now();
          }
        }
      }
    } catch {
      // Ignore non-JSON or aborted response bodies; the missing account keeps the capture incomplete.
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

    const captureStartedAt = Date.now();
    const deadline = captureStartedAt + (options.captureDeadlineMs ?? 12000);
    // Let the SPA fetch the accounts it plans to show, then use the fallback for the rest.
    // The grace period scales down with a short capture deadline so tests stay fast.
    const graceMs = Math.min(1500, Math.max(25, Math.floor((deadline - captureStartedAt) / 4)));
    while (Date.now() < deadline) {
      if (sawAccountsResponse && accountKeys.length === 0) break;
      if (
        sawAccountsResponse &&
        accountKeys.length > 0 &&
        accountKeys.every((key) => capturedViews.has(key))
      ) {
        break;
      }
      if (sawAccountsResponse && firstViewAt != null && Date.now() - firstViewAt >= graceMs) break;
      // Account discovery succeeded but the SPA never asked for a view: try the fallback.
      if (sawAccountsResponse && firstViewAt == null && Date.now() - captureStartedAt >= graceMs) {
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    // If there are additional securities accounts not yet viewed by the SPA, fetch them with the
    // real session headers captured from the SPA's own requests. The fallback shares the capture
    // deadline: a stalled request or body read must not hold checking-account data hostage.
    const missingKeys = accountKeys.filter((k) => !capturedViews.has(k));
    if (missingKeys.length > 0) {
      if (Object.keys(capturedHeaders).length === 0) return undefined;
      const remaining = deadline - Date.now();
      if (remaining <= 0) return undefined;
      const evaluated = page.evaluate(
        async ({ keys, headers, fields, timeoutMs }) => {
          const results: Array<{ key: string; data: unknown }> = [];
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          try {
            for (const key of keys) {
              if (controller.signal.aborted) break;
              const url = `/ServerServices/mytrade/api/v2/json2/account/view?account=${encodeURIComponent(key)}&fields=${fields}`;
              try {
                const res = await fetch(url, {
                  method: "POST",
                  credentials: "include",
                  signal: controller.signal,
                  headers: {
                    accept: "application/json, text/plain, */*",
                    "content-type": "application/json; charset=utf-8",
                    ...headers,
                  },
                });
                if (res.ok) results.push({ key, data: await res.json() });
              } catch {
                // Aborted or failed: the missing key keeps the capture incomplete.
              }
            }
          } finally {
            clearTimeout(timer);
          }
          return results;
        },
        { keys: missingKeys, headers: capturedHeaders, fields: VIEW_FIELDS, timeoutMs: remaining },
      );
      const extra = await Promise.race([
        evaluated,
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), remaining)),
      ]);
      if (!extra) return undefined;
      for (const item of extra) {
        if (!isUsableView(item.data as MyTradeViewResponse)) continue;
        capturedViews.set(item.key, item.data as MyTradeViewResponse);
        sawValidView = true;
      }
    }

    if (!sawAccountsResponse) {
      console.warn("[scraper] hapoalim myTrade: account discovery did not complete");
      return undefined;
    }
    if (accountKeys.length === 0 && capturedViews.size > 0) {
      console.warn("[scraper] hapoalim myTrade: views exist outside account discovery");
      return undefined;
    }
    if (!accountKeys.every((key) => capturedViews.has(key))) {
      console.warn("[scraper] hapoalim myTrade: capture incomplete");
      return undefined;
    }
    if (!sawValidView && accountKeys.length > 0) {
      console.warn("[scraper] hapoalim myTrade: no valid account view");
      return undefined;
    }

    const parsed = accountKeys.flatMap((acct) =>
      parseHapoalimMyTradeView(acct, capturedViews.get(acct)),
    );
    console.log(
      `[scraper] hapoalim myTrade: ${parsed.length} holding(s) across ${accountKeys.length} account(s)`,
    );
    return { securities: parsed, accountNumbers: accountKeys };
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
