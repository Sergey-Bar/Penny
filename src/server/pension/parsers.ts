import type { PensionAccount, PensionScrapeOutcome } from "israeli-pension-scrapers";
import { parseAmount } from "@/lib/csv";
import { SYNC_ERRORS } from "@/lib/sync-errors";

/** A scraped product. The custom scrapers fill the optional fields; israeli-pension-scrapers does not. */
export interface ScrapedAccount extends PensionAccount {
  assetType?: "pension" | "study_fund" | "provident" | "stock" | "cash";
  quantity?: number | null;
  /** Total cost in `currency`, never a per-unit price. */
  costBasis?: number | null;
  liquid?: boolean;
  feeDeposit?: number | null;
  feeBalance?: number | null;
  monthlyDeposit?: number | null;
  details?: Record<string, unknown>;
}

export interface ScrapeOutcome extends Omit<PensionScrapeOutcome, "accounts"> {
  accounts: ScrapedAccount[];
}

export const failed = (errorMessage: string): ScrapeOutcome => ({
  success: false,
  accounts: [],
  errorMessage,
});

export function parseHarelCards(cards: { name: string; amount: string }[]): ScrapeOutcome {
  const accounts: ScrapedAccount[] = [];
  for (const c of cards) {
    const parsed = parseMoney(c.amount);
    if (!parsed || parsed.amount <= 0) continue;
    const name = c.name.trim() || "הראל";
    accounts.push({
      accountNumber: name,
      label: `הראל - ${name}`,
      balance: parsed.amount,
      currency: parsed.currency,
      transactions: [],
    });
  }
  return accounts.length > 0 ? { success: true, accounts } : failed(SYNC_ERRORS.pensionNoData);
}

/** `₪ 1,234.50`, `-$500`, `(500 ₪)` -> amount and currency, or null when there is no number. */
export function parseMoney(text: string): { amount: number; currency: string } | null {
  const amount = parseAmount(text);
  if (amount == null) return null;
  const currency = /\$|USD/i.test(text) ? "USD" : /€|EUR/i.test(text) ? "EUR" : "ILS";
  return { amount, currency };
}

/** Account number when the card shows one, else the card's position; repeats get the position too. */
function uniqueKeys<T>(items: T[], key: (item: T, i: number) => string): string[] {
  const seen = new Set<string>();
  return items.map((item, i) => {
    let k = key(item, i);
    if (seen.has(k)) k = `${k}-${i + 1}`;
    seen.add(k);
    return k;
  });
}

export interface AltshulerCard {
  accNum: string;
  trackName: string;
  amount: string;
}

/** One asset per product card; any card without a readable amount fails the whole scrape. */
export function parseAltshulerCards(cards: AltshulerCard[]): ScrapeOutcome {
  if (cards.length === 0) return failed(SYNC_ERRORS.pensionNoData);
  const money = cards.map((c) => parseMoney(c.amount));
  if (money.some((m) => m == null)) return failed(SYNC_ERRORS.pensionIncomplete);
  const keys = uniqueKeys(cards, (c, i) => c.accNum || `card${i + 1}`);
  return {
    success: true,
    accounts: cards.map((c, i) => ({
      accountNumber: keys[i],
      label: c.trackName ? `אלטשולר שחם (${c.trackName})` : "אלטשולר שחם",
      balance: money[i]!.amount,
      currency: money[i]!.currency,
      transactions: [],
    })),
  };
}

export interface PhoenixCard {
  name: string;
  accountNumber: string;
  text: string;
}

const percent = (text: string, label: string) => {
  const m = new RegExp(`${label}\\s*([\\d.]+)\\s*%`).exec(text);
  const n = m ? Number.parseFloat(m[1]) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** A product card from Phoenix's "פירוט מוצרים" tab, or null when it has no savings amount. */
function parsePhoenixCard(card: PhoenixCard): Omit<ScrapedAccount, "accountNumber"> | null {
  const text = card.text.replace(/\s+/g, " ").trim();
  const balanceText = /סכום חיסכון\s*([-−(]?\s*[₪$€]?\s*[\d,]+(?:\.\d+)?\)?)/.exec(text)?.[1];
  const balance = balanceText ? parseMoney(balanceText) : null;
  if (!balance) return null;

  const deposit = /הפקדה אחרונה\s*([^\s].{0,40})/.exec(text)?.[1] ?? "";
  const depositDate = /(\d{2}\.\d{2}\.\d{4})/.exec(deposit)?.[1] ?? null;
  const depositAmount = /[₪$€]?\s*[\d,]+(?:\.\d+)?/.exec(
    depositDate ? deposit.slice(0, deposit.indexOf(depositDate)) : deposit,
  )?.[0];
  const monthlyDeposit = depositAmount ? parseAmount(depositAmount) : null;
  const liquidityDate = /מועד נזילות\s*(\d{2}\.\d{2}\.\d{4})/.exec(text)?.[1] ?? null;
  const status =
    /מעמד\s*(שכיר|עצמאי|לא פעיל|פעיל|\S+)/
      .exec(text)?.[1]
      ?.replace(/פירוט.*$/, "")
      .trim() || null;

  return {
    label: card.name ? `הפניקס - ${card.name}` : "הפניקס",
    balance: balance.amount,
    currency: balance.currency,
    transactions: [],
    feeDeposit: percent(text, "ד\\.נ הפקדה"),
    feeBalance: percent(text, "ד\\.נ חיסכון"),
    monthlyDeposit: monthlyDeposit != null && monthlyDeposit > 0 ? monthlyDeposit : null,
    details: {
      provider: "הפניקס",
      ...(monthlyDeposit != null
        ? { lastDeposit: { amount: monthlyDeposit, date: depositDate } }
        : {}),
      ...(liquidityDate ? { liquidityDate } : {}),
      ...(status ? { status } : {}),
    },
  };
}

/** One asset per product card; any card that cannot be read fails the whole scrape. */
export function parsePhoenixCards(cards: PhoenixCard[]): ScrapeOutcome {
  if (cards.length === 0) return failed(SYNC_ERRORS.pensionNoData);
  const parsed = cards.map(parsePhoenixCard);
  if (parsed.some((p) => p == null)) return failed(SYNC_ERRORS.pensionIncomplete);
  const keys = uniqueKeys(cards, (c, i) => c.accountNumber.trim() || `card${i + 1}`);
  return {
    success: true,
    accounts: parsed.map((p, i) => ({ ...p!, accountNumber: keys[i] })),
  };
}

/** "יתרה לפעילות" (cash available to trade) from Excellence Trade's top bar. */
export function parseExcellenceCash(pageText: string): number | null {
  const m = /יתרה לפעילות\s*([-−]?\s*[₪]?\s*[\d,]+(?:\.\d+)?)/.exec(pageText.replace(/\s+/g, " "));
  return m ? parseAmount(m[1]) : null;
}

const NAME = /שם\s*נייר|שם\s*הנייר|שם\s*ני"ע|תיאור|security|name/i;
const ILS_COLUMN = /ש["״]ח|₪|ILS/i;
const TOTAL_ROW = /^(סה["״]?כ|total)/i;
const CASH_ROW = /מזומן|יתרה\s*(כספית|לפעילות)|cash/i;

/**
 * Excellence Trade's "export to Excel" -> one asset per holding, plus the cash balance when the
 * export has no cash row of its own. Total rows are skipped; any holding without a readable value
 * fails the whole scrape. Holdings carry no `symbol`, so nothing reprices them live.
 */
export function parseExcellenceRows(rows: string[][], cash: number | null): ScrapeOutcome {
  const h = rows.findIndex(
    (r) => r.some((c) => NAME.test(c)) && r.some((c) => /שווי|value/i.test(c)),
  );
  if (h < 0) return failed(SYNC_ERRORS.pensionExportFailed);
  const header = rows[h];
  const col = (re: RegExp, not?: RegExp) =>
    header.findIndex((c) => re.test(c) && !(not && not.test(c)));
  const iName = col(NAME);
  const iSymbol = col(/סימול|טיקר|מספר\s*נייר|מס['׳]?\s*נייר|מספר\s*ני"ע|symbol|ticker|isin/i);
  const iQty = col(/כמות|יחידות|quantity|qty|shares|units/i);
  // An ILS value column wins: its amounts are shekels whatever the security's own currency.
  const iValueIls = col(/שווי.*(ש["״]ח|₪)/, /עלות/);
  const iValue = iValueIls >= 0 ? iValueIls : col(/שווי|market\s*value|value/i, /עלות/);
  const valueIsIls = iValueIls >= 0;
  // Total cost only: per-unit price columns (שער/מחיר) are not a cost basis.
  const iCost = col(/עלות|cost/i, /שער|מחיר|ממוצע|ליחידה|price|per\s*unit/i);
  const iCurrency = col(/^\s*(מטבע|currency)\s*$/i);

  const body = rows
    .slice(h + 1)
    .filter((r) => (r[iName] ?? "").trim() && !TOTAL_ROW.test(r[iName].trim()));
  const money = body.map((r) => parseMoney(r[iValue] ?? ""));
  if (money.some((m) => m == null)) return failed(SYNC_ERRORS.pensionIncomplete);
  const keys = uniqueKeys(body, (r) => (r[iSymbol] ?? "").trim() || r[iName].trim());

  const accounts: ScrapedAccount[] = body.map((r, i) => {
    const rowCurrency = (r[iCurrency] ?? "").toUpperCase().trim();
    const currency = valueIsIls
      ? "ILS"
      : /^[A-Z]{3}$/.test(rowCurrency)
        ? rowCurrency
        : money[i]!.currency;
    const costCurrency = ILS_COLUMN.test(header[iCost] ?? "") ? "ILS" : rowCurrency || currency;
    const cost = iCost >= 0 ? parseAmount(r[iCost]) : null;
    const quantity = iQty >= 0 ? parseAmount(r[iQty]) : null;
    const details: Record<string, unknown> = { provider: "אקסלנס טרייד" };
    header.forEach((name, c) => {
      if (name && r[c]) details[name] = r[c];
    });
    return {
      accountNumber: keys[i],
      label: `אקסלנס - ${r[iName].trim()}`,
      balance: money[i]!.amount,
      currency,
      transactions: [],
      assetType: "stock",
      quantity,
      costBasis: cost != null && cost > 0 && costCurrency === currency ? cost : null,
      liquid: true,
      details,
    };
  });

  if (cash != null && !body.some((r) => CASH_ROW.test(r[iName]))) {
    accounts.push({
      accountNumber: "available-cash",
      label: "אקסלנס טרייד - יתרה לפעילות",
      balance: cash,
      currency: "ILS",
      transactions: [],
      assetType: "cash",
      liquid: true,
    });
  }
  if (accounts.length === 0) return failed(SYNC_ERRORS.pensionNoData);
  return { success: true, accounts };
}
