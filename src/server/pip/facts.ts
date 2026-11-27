import "server-only";

import { getDb } from "@/server/db";
import { getPlan, listGoals, listPolicies } from "@/server/db/queries/plan";
import { listAssets, listAccountBalances } from "@/server/db/queries/assets";
import { getAllCategories } from "@/server/db/queries/categories";
import { listRules } from "@/server/db/queries/rules";
import { getAllBudgets } from "@/server/db/queries/budgets";
import { cashBetween } from "@/server/finance/facts";
import { loadInsights } from "@/server/insights/data";
import { isActive } from "@/server/insights/recurring";
import { computeCashAhead } from "@/server/insights/cash-ahead";
import { buildAccountsForecast } from "@/server/insights/accounts-forecast";
import { plannedPayload } from "@/server/db/queries/planned";
import { getBankHealth } from "@/server/db/queries/home";
import { latestSyncStartMs } from "@/server/db/queries/sync-runs";
import { budgetMonthRange } from "@/lib/finance-period";
import { israelToday } from "@/server/lib/date-utils";
import { roundCents } from "@/lib/money";
import type { PipLocale, PipMoney } from "@/lib/pip";

export interface PipFactPeriod {
  from: string;
  to: string;
  label: string;
}

export function money(amount: number, locale: PipLocale): PipMoney {
  const value = roundCents(amount);
  return {
    amount: value,
    minor: Math.round(value * 100),
    currency: "ILS",
    formatted: new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-US", {
      style: "currency",
      currency: "ILS",
      maximumFractionDigits: 0,
    }).format(value),
  };
}

export function percent(value: number, digits = 0): string {
  return `${(Math.round(value * 10 ** digits) / 10 ** digits).toFixed(digits)}%`;
}

function safeErrorMessage(value: string | null): string | null {
  if (!value) return null;
  return value
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\d{4,}/g, "••••")
    .slice(0, 160);
}

export function currentBudgetPeriod(workspaceId: number, today = israelToday()): PipFactPeriod {
  const startDay = getPlan(workspaceId).monthStartDay;
  const range = budgetMonthRange(startDay, today);
  return { from: range.from, to: range.to, label: range.key };
}

export function previousBudgetPeriod(workspaceId: number, today = israelToday()): PipFactPeriod {
  const startDay = getPlan(workspaceId).monthStartDay;
  const range = budgetMonthRange(startDay, today, -1);
  return { from: range.from, to: range.to, label: range.key };
}

export interface AccountsFact {
  asOf: string;
  banks: {
    provider: string;
    account: string;
    balance: PipMoney;
    drift: number | null;
    updatedAt: string;
  }[];
  totalBank: PipMoney;
  cards: { provider: string; account: string; transactions: number }[];
  transactionAccounts: { account: string; kind: "bank" | "card"; transactionCount: number }[];
}

export function accountsFact(workspaceId: number, locale: PipLocale): AccountsFact {
  const balances = listAccountBalances(workspaceId);
  const rows = getDb()
    .prepare(
      `SELECT provider, account_number AS account,
              COUNT(*) AS transactionCount,
              SUM(CASE WHEN installment_total IS NOT NULL AND installment_total > 1 THEN 1 ELSE 0 END) AS installments
       FROM transactions
       WHERE workspace_id = ? AND is_excluded = 0
       GROUP BY provider, account_number
       ORDER BY provider, account_number`,
    )
    .all(workspaceId) as {
    provider: string;
    account: string;
    transactionCount: number;
    installments: number;
  }[];
  const cardHints = new Set(["isracard", "cal", "max", "amex"]);
  return {
    asOf: new Date().toISOString(),
    banks: balances.map((b) => ({
      provider: b.provider,
      account: `••${b.accountNumber.slice(-4)}`,
      balance: money(b.balance, locale),
      drift: b.drift,
      updatedAt: b.updatedAt,
    })),
    totalBank: money(
      balances.reduce((sum, b) => sum + b.balance, 0),
      locale,
    ),
    cards: rows
      .filter((r) => cardHints.has(r.provider))
      .map((r) => ({
        provider: r.provider,
        account: `••${r.account.slice(-4)}`,
        transactions: r.transactionCount,
      })),
    transactionAccounts: rows.map((r) => ({
      account: `••${r.account.slice(-4)}`,
      kind: cardHints.has(r.provider) ? "card" : "bank",
      transactionCount: r.transactionCount,
    })),
  };
}

interface SpendingRow {
  name: string;
  amount: PipMoney;
  share: number;
}

interface MerchantRow {
  merchant: string;
  amount: PipMoney;
  count: number;
}

export interface SpendingFact {
  asOf: string;
  period: PipFactPeriod;
  scope: string | null;
  income: PipMoney;
  spent: PipMoney;
  net: PipMoney;
  transactionCount: number;
  categories: SpendingRow[];
  merchants: MerchantRow[];
}

export function spendingFact(
  workspaceId: number,
  locale: PipLocale,
  from: string,
  to: string,
  label: string,
  category?: string,
  merchant?: string,
): SpendingFact {
  const filter = category ? " AND (c.name LIKE ? OR p.name LIKE ?)" : "";
  const merchantFilter = merchant ? " AND lower(t.description) LIKE ?" : "";
  const filterParams = category ? [`%${category}%`, `%${category}%`] : [];
  const merchantParams = merchant ? [`%${merchant.toLowerCase()}%`] : [];
  const catRows = getDb()
    .prepare(
      `SELECT COALESCE(p.name, c.name, 'Uncategorized') AS category_name, SUM(t.spend) AS amount
       FROM v_spend_rows t
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN categories p ON p.id = c.parent_id
       WHERE t.workspace_id = ? AND t.date >= ? AND t.date <= ?${filter}${merchantFilter}
       GROUP BY category_name ORDER BY amount DESC LIMIT 12`,
    )
    .all(workspaceId, from, to, ...filterParams, ...merchantParams) as {
    category_name: string;
    amount: number;
  }[];
  const merchantRows = getDb()
    .prepare(
      `SELECT COALESCE(NULLIF(t.merchant_key, ''), t.description) AS merchant,
              SUM(-t.charged_amount) AS amount, COUNT(*) AS count
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN categories p ON p.id = c.parent_id
       WHERE t.workspace_id = ? AND t.status = 'completed' AND t.is_excluded = 0
         AND t.kind = 'expense' AND t.date >= ? AND t.date <= ?${filter}${merchantFilter}
       GROUP BY merchant ORDER BY amount DESC LIMIT 10`,
    )
    .all(workspaceId, from, to, ...filterParams, ...merchantParams) as {
    merchant: string;
    amount: number;
    count: number;
  }[];
  const totals = cashBetween(workspaceId, from, to);
  const count = (
    getDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
         LEFT JOIN categories p ON p.id = c.parent_id
         WHERE t.workspace_id = ? AND t.status = 'completed' AND t.is_excluded = 0
           AND t.date >= ? AND t.date <= ?${filter}${merchantFilter}`,
      )
      .get(workspaceId, from, to, ...filterParams, ...merchantParams) as { n: number }
  ).n;
  const scope = category ?? merchant ?? null;
  const total = scope
    ? catRows.reduce((sum, row) => sum + row.amount, 0)
    : Math.max(0, totals.spend);
  return {
    asOf: new Date().toISOString(),
    period: { from, to, label },
    scope,
    income: money(scope ? 0 : totals.income, locale),
    spent: money(total, locale),
    net: money((scope ? 0 : totals.income) - total, locale),
    transactionCount: count,
    categories: catRows.map((r) => ({
      name: r.category_name,
      amount: money(r.amount, locale),
      share: total > 0 ? r.amount / total : 0,
    })),
    merchants: merchantRows.map((r) => ({
      merchant: r.merchant,
      amount: money(r.amount, locale),
      count: r.count,
    })),
  };
}

export interface IncomeFact {
  asOf: string;
  monthly: { month: string; amount: PipMoney }[];
  averageMonthly: PipMoney;
  monthsWithIncome: number;
  stability: number;
  largestSourceShare: number;
  sources: { name: string; amount: PipMoney; share: number; count: number }[];
  confidence: "high" | "medium" | "low";
}

export function incomeFact(workspaceId: number, locale: PipLocale): IncomeFact {
  const rows = getDb()
    .prepare(
      `SELECT substr(date, 1, 7) AS month, SUM(cash_amount) AS amount
       FROM v_cash_rows WHERE workspace_id = ? AND flow_type = 'income'
         AND date >= date('now', '-12 months') GROUP BY month ORDER BY month`,
    )
    .all(workspaceId) as { month: string; amount: number }[];
  const sourceRows = getDb()
    .prepare(
      `SELECT COALESCE(NULLIF(t.merchant_key, ''), c.name, t.description) AS source_name,
              SUM(t.charged_amount) AS amount, COUNT(*) AS count
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.workspace_id = ? AND t.status = 'completed' AND t.is_excluded = 0
         AND t.kind = 'income' AND t.date >= date('now', '-12 months')
       GROUP BY source_name ORDER BY amount DESC LIMIT 10`,
    )
    .all(workspaceId) as { source_name: string; amount: number; count: number }[];
  const amounts = rows.map((r) => r.amount).filter((n) => n > 0);
  const avg = amounts.length ? amounts.reduce((s, n) => s + n, 0) / amounts.length : 0;
  const variance = amounts.length
    ? amounts.reduce((s, n) => s + (n - avg) ** 2, 0) / amounts.length
    : 0;
  const cv = avg > 0 ? Math.sqrt(variance) / avg : 1;
  const total = sourceRows.reduce((s, r) => s + r.amount, 0);
  return {
    asOf: new Date().toISOString(),
    monthly: rows.map((r) => ({ month: r.month, amount: money(r.amount, locale) })),
    averageMonthly: money(avg, locale),
    monthsWithIncome: amounts.length,
    stability: Math.max(0, Math.min(1, 1 - cv)),
    largestSourceShare: total > 0 ? Math.max(...sourceRows.map((r) => r.amount / total)) : 0,
    sources: sourceRows.map((r) => ({
      name: r.source_name,
      amount: money(r.amount, locale),
      share: total > 0 ? r.amount / total : 0,
      count: r.count,
    })),
    confidence: amounts.length >= 6 ? "high" : amounts.length >= 3 ? "medium" : "low",
  };
}

interface BudgetLineFact {
  categoryId: number;
  name: string;
  budget: PipMoney;
  spent: PipMoney;
  remaining: PipMoney;
  usedRatio: number;
}

export interface BudgetFact {
  asOf: string;
  period: PipFactPeriod;
  elapsedPercent: number;
  planned: PipMoney;
  spent: PipMoney;
  remaining: PipMoney;
  lines: BudgetLineFact[];
}

export function budgetFact(workspaceId: number, locale: PipLocale): BudgetFact {
  const period = currentBudgetPeriod(workspaceId);
  const budgets = getAllBudgets(workspaceId);
  const spend = getDb()
    .prepare(
      `SELECT COALESCE(c.parent_id, c.id) AS categoryId, SUM(t.spend) AS amount
       FROM v_spend_rows t JOIN categories c ON c.id = t.category_id
       WHERE t.workspace_id = ? AND t.date >= ? AND t.date <= ?
       GROUP BY categoryId`,
    )
    .all(workspaceId, period.from, period.to) as { categoryId: number; amount: number }[];
  const spentBy = new Map(spend.map((r) => [r.categoryId, r.amount]));
  const categories = new Map(getAllCategories(workspaceId, "expense").map((c) => [c.id, c.name]));
  const planned = budgets.reduce((s, b) => s + b.monthlyAmount, 0);
  const spent = [...spentBy.values()].reduce((s, n) => s + n, 0);
  const total = budgetMonthElapsed(period);
  return {
    asOf: new Date().toISOString(),
    period,
    elapsedPercent: total,
    planned: money(planned, locale),
    spent: money(spent, locale),
    remaining: money(planned - spent, locale),
    lines: budgets
      .map((b) => {
        const used = spentBy.get(b.categoryId) ?? 0;
        return {
          categoryId: b.categoryId,
          name: categories.get(b.categoryId) ?? `#${b.categoryId}`,
          budget: money(b.monthlyAmount, locale),
          spent: money(used, locale),
          remaining: money(b.monthlyAmount - used, locale),
          usedRatio: b.monthlyAmount > 0 ? used / b.monthlyAmount : 0,
        };
      })
      .sort((a, b) => b.usedRatio - a.usedRatio)
      .slice(0, 12),
  };
}

function budgetMonthElapsed(period: PipFactPeriod): number {
  const today = israelToday();
  if (today <= period.from) return 0;
  if (today >= period.to) return 100;
  const from = Date.parse(`${period.from}T12:00:00Z`);
  const to = Date.parse(`${period.to}T12:00:00Z`);
  const now = Date.parse(`${today}T12:00:00Z`);
  return Math.max(0, Math.min(100, Math.round(((now - from) / (to - from)) * 100)));
}

export interface CashFact {
  asOf: string;
  today: string;
  safeToSpend: PipMoney | null;
  bank: PipMoney | null;
  billsDue: PipMoney;
  bankDebitsDue: PipMoney;
  reservedCash: PipMoney;
  salaryExpected: PipMoney;
  until: string;
  daysLeft: number;
  accounts: { provider: string; account: string; balance: PipMoney }[];
}

export function cashFact(workspaceId: number, locale: PipLocale): CashFact {
  const today = israelToday();
  const cash = computeCashAhead(workspaceId, today);
  return {
    asOf: new Date().toISOString(),
    today,
    safeToSpend: cash.safeToSpend == null ? null : money(cash.safeToSpend, locale),
    bank: cash.bank == null ? null : money(cash.bank, locale),
    billsDue: money(cash.billsDue, locale),
    bankDebitsDue: money(cash.bankDebitsDue ?? 0, locale),
    reservedCash: money(cash.reservedCash ?? 0, locale),
    salaryExpected: money(cash.salaryExpected, locale),
    until: cash.until,
    daysLeft: cash.daysLeft,
    accounts: (cash.accounts ?? []).map((a) => ({
      provider: a.provider,
      account: `••${a.accountNumber.slice(-4)}`,
      balance: money(a.balance, locale),
    })),
  };
}

export interface ForecastFact {
  asOf: string;
  low: { date: string; amount: PipMoney } | null;
  firstNegative: string | null;
  nextPayday: string | null;
  days: { date: string; amount: PipMoney }[];
}

export function forecastFact(workspaceId: number, locale: PipLocale): ForecastFact {
  const result = buildAccountsForecast(workspaceId, israelToday());
  if (!result) {
    return {
      asOf: new Date().toISOString(),
      low: null,
      firstNegative: null,
      nextPayday: null,
      days: [],
    };
  }
  const low = result.total.lowest;
  const paydays = result.events
    .filter((e) => e.kind === "income")
    .map((e) => e.date)
    .sort((a, b) => a.localeCompare(b));
  return {
    asOf: new Date().toISOString(),
    low: { date: low.date, amount: money(low.amount, locale) },
    firstNegative: result.total.points.find((p) => p.expected < 0)?.date ?? null,
    nextPayday: paydays.find((d) => d > low.date) ?? null,
    days: result.total.points
      .filter((_, i) => i % 7 === 0)
      .slice(0, 14)
      .map((p) => ({ date: p.date, amount: money(p.expected, locale) })),
  };
}

export interface GoalsFact {
  asOf: string;
  goals: {
    id: number;
    name: string;
    target: PipMoney;
    saved: PipMoney;
    targetDate: string;
    progress: number;
  }[];
  totalTarget: PipMoney;
  totalSaved: PipMoney;
}

export function goalsFact(workspaceId: number, locale: PipLocale): GoalsFact {
  const goals = listGoals(workspaceId);
  return {
    asOf: new Date().toISOString(),
    goals: goals.map((g) => ({
      id: g.id,
      name: g.name,
      target: money(g.targetAmount, locale),
      saved: money(g.savedAmount, locale),
      targetDate: g.targetDate,
      progress: g.targetAmount > 0 ? g.savedAmount / g.targetAmount : 0,
    })),
    totalTarget: money(
      goals.reduce((s, g) => s + g.targetAmount, 0),
      locale,
    ),
    totalSaved: money(
      goals.reduce((s, g) => s + g.savedAmount, 0),
      locale,
    ),
  };
}

export interface RecurringFact {
  asOf: string;
  monthlyTotal: PipMoney;
  yearlyTotal: PipMoney;
  items: {
    merchant: string;
    cadence: string;
    monthly: PipMoney;
    lastDate: string;
    priceChange: { from: PipMoney; to: PipMoney; date: string } | null;
  }[];
}

export function recurringFact(workspaceId: number, locale: PipLocale): RecurringFact {
  const today = israelToday();
  const series = loadInsights(workspaceId, today)
    .series.filter((s) => s.status === "suggested" && isActive(s, today))
    .map((s) => {
      const monthly =
        s.cadence === "weekly"
          ? Math.abs(s.expectedAmount) * 4.33
          : s.cadence === "yearly"
            ? Math.abs(s.expectedAmount) / 12
            : Math.abs(s.expectedAmount);
      return { s, monthly };
    })
    .sort((a, b) => b.monthly - a.monthly);
  const total = series.reduce((s, x) => s + x.monthly, 0);
  return {
    asOf: new Date().toISOString(),
    monthlyTotal: money(total, locale),
    yearlyTotal: money(total * 12, locale),
    items: series.slice(0, 12).map(({ s, monthly }) => ({
      merchant: s.merchant,
      cadence: s.cadence,
      monthly: money(monthly, locale),
      lastDate: s.lastDate,
      priceChange: s.priceChange
        ? {
            from: money(Math.abs(s.priceChange.from), locale),
            to: money(Math.abs(s.priceChange.to), locale),
            date: s.priceChange.date,
          }
        : null,
    })),
  };
}

export interface FeesFact {
  asOf: string;
  last12Months: PipMoney;
  monthlyAverage: PipMoney;
  feeTransactions: { name: string; amount: PipMoney; count: number }[];
  fundFees: {
    name: string;
    value: PipMoney;
    yearlyFee: PipMoney;
    feePercent: number | null;
  }[];
  yearlyFundFee: PipMoney;
}

export function feesFact(workspaceId: number, locale: PipLocale): FeesFact {
  const rows = getDb()
    .prepare(
      `SELECT COALESCE(c.name, 'Uncategorized') AS category_name, SUM(t.spend) AS amount, COUNT(*) AS count
       FROM v_spend_rows t LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN categories p ON p.id = c.parent_id
       WHERE t.workspace_id = ? AND t.date >= date('now', '-12 months')
         AND (c.name IN ('Fees & Taxes', 'Bank Fees', 'Interest', 'Income Tax')
              OR p.name IN ('Fees & Taxes', 'Money Movement'))
       GROUP BY category_name ORDER BY amount DESC LIMIT 10`,
    )
    .all(workspaceId) as { category_name: string; amount: number; count: number }[];
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const fundFees = listAssets(workspaceId)
    .filter((a) => ["pension", "provident", "study_fund", "fund"].includes(a.type))
    .map((a) => {
      const value = a.manualValue ?? a.costBasis ?? 0;
      const fee = a.feeBalance ?? a.feeDeposit ?? 0;
      return {
        name: a.name,
        value: money(value, locale),
        yearlyFee: money((value * fee) / 100, locale),
        feePercent: a.feeBalance ?? a.feeDeposit ?? null,
      };
    });
  return {
    asOf: new Date().toISOString(),
    last12Months: money(total, locale),
    monthlyAverage: money(total / 12, locale),
    feeTransactions: rows.map((r) => ({
      name: r.category_name,
      amount: money(r.amount, locale),
      count: r.count,
    })),
    fundFees,
    yearlyFundFee: money(
      fundFees.reduce((s, f) => s + (f.feePercent ?? 0) * (Number(f.value.amount) / 100), 0),
      locale,
    ),
  };
}

export interface NetWorthFact {
  asOf: string;
  assets: PipMoney;
  liabilities: PipMoney;
  netWorth: PipMoney;
  liquid: PipMoney;
  illiquidShare: number;
  byType: { type: string; amount: PipMoney; count: number }[];
  currency: string;
}

export function netWorthFact(workspaceId: number, locale: PipLocale): NetWorthFact {
  const assets = listAssets(workspaceId);
  const valueOf = (a: (typeof assets)[number]) => a.manualValue ?? a.costBasis ?? 0;
  const owned = assets.filter((a) => !a.isLiability);
  const debts = assets.filter((a) => a.isLiability);
  const totalAssets = owned.reduce((s, a) => s + valueOf(a), 0);
  const totalDebts = debts.reduce((s, a) => s + valueOf(a), 0);
  const liquid = owned.filter((a) => a.liquid).reduce((s, a) => s + valueOf(a), 0);
  const byType = new Map<string, { amount: number; count: number }>();
  for (const a of owned) {
    const row = byType.get(a.type) ?? { amount: 0, count: 0 };
    row.amount += valueOf(a);
    row.count += 1;
    byType.set(a.type, row);
  }
  return {
    asOf: new Date().toISOString(),
    assets: money(totalAssets, locale),
    liabilities: money(totalDebts, locale),
    netWorth: money(totalAssets - totalDebts, locale),
    liquid: money(liquid, locale),
    illiquidShare: totalAssets > 0 ? (totalAssets - liquid) / totalAssets : 0,
    byType: [...byType]
      .map(([type, row]) => ({ type, amount: money(row.amount, locale), count: row.count }))
      .sort((a, b) => b.amount.amount - a.amount.amount),
    currency: "ILS",
  };
}

export interface PensionFact {
  asOf: string;
  value: PipMoney;
  monthlyDeposits: PipMoney;
  products: {
    name: string;
    type: string;
    value: PipMoney;
    feePercent: number | null;
    monthlyDeposit: PipMoney;
  }[];
  averageBalanceFee: number | null;
  confidence: "high" | "medium" | "low";
}

export function pensionFact(workspaceId: number, locale: PipLocale): PensionFact {
  const products = listAssets(workspaceId).filter((a) =>
    ["pension", "provident", "study_fund", "fund"].includes(a.type),
  );
  const value = products.reduce((s, a) => s + (a.manualValue ?? a.costBasis ?? 0), 0);
  const deposits = products.reduce((s, a) => s + (a.monthlyDeposit ?? 0), 0);
  const withFee = products.filter((a) => a.feeBalance != null);
  const averageFee = withFee.length
    ? withFee.reduce((s, a) => s + (a.feeBalance ?? 0), 0) / withFee.length
    : null;
  return {
    asOf: new Date().toISOString(),
    value: money(value, locale),
    monthlyDeposits: money(deposits, locale),
    products: products.map((a) => ({
      name: a.name,
      type: a.type,
      value: money(a.manualValue ?? a.costBasis ?? 0, locale),
      feePercent: a.feeBalance ?? a.feeDeposit ?? null,
      monthlyDeposit: money(a.monthlyDeposit ?? 0, locale),
    })),
    averageBalanceFee: averageFee,
    confidence: products.length >= 3 ? "high" : products.length >= 1 ? "medium" : "low",
  };
}

export interface InsuranceFact {
  asOf: string;
  monthlyPremium: PipMoney;
  yearlyPremium: PipMoney;
  policies: {
    name: string;
    kind: string;
    provider: string | null;
    monthly: PipMoney;
    renewalMonth: string | null;
  }[];
  duplicateKinds: { kind: string; count: number }[];
  missingKinds: string[];
  confidence: "high" | "medium" | "low";
}

export function insuranceFact(workspaceId: number, locale: PipLocale): InsuranceFact {
  const policies = listPolicies(workspaceId);
  const byKind = new Map<string, number>();
  for (const p of policies) byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + 1);
  const monthly = policies.reduce((s, p) => s + p.monthlyPremium, 0);
  const expected = ["health", "life", "disability", "home", "car"];
  return {
    asOf: new Date().toISOString(),
    monthlyPremium: money(monthly, locale),
    yearlyPremium: money(monthly * 12, locale),
    policies: policies.map((p) => ({
      name: p.name,
      kind: p.kind,
      provider: p.provider,
      monthly: money(p.monthlyPremium, locale),
      renewalMonth: p.renewalMonth ?? null,
    })),
    duplicateKinds: [...byKind]
      .filter(([, count]) => count > 1)
      .map(([kind, count]) => ({ kind, count })),
    missingKinds: expected.filter((k) => !byKind.has(k)),
    confidence: policies.length ? "high" : "low",
  };
}

export interface PlannedFact {
  asOf: string;
  plannedCount: number;
  upcoming: PipMoney;
  overdue: number;
  items: {
    id: number;
    description: string;
    amount: PipMoney;
    date: string;
    status: string;
    overdue: boolean;
  }[];
}

export function plannedFact(workspaceId: number, locale: PipLocale): PlannedFact {
  const payload = plannedPayload(workspaceId, israelToday());
  return {
    asOf: new Date().toISOString(),
    plannedCount: payload.totals.planned,
    upcoming: money(payload.totals.upcoming, locale),
    overdue: payload.totals.overdue,
    items: payload.items
      .filter((i) => i.status === "planned")
      .slice(0, 12)
      .map((i) => ({
        id: i.id,
        description: i.description,
        amount: money(i.amount, locale),
        date: i.date,
        status: i.status,
        overdue: i.overdue,
      })),
  };
}

export interface InsightsFact {
  asOf: string;
  monthTotal: PipMoney;
  topCategories: { name: string; amount: PipMoney }[];
  anomalies: { type: string; detail: string; amount: PipMoney | null }[];
  installments: { merchant: string; amount: PipMoney; date: string }[];
  subscriptionCount: number;
}

export function insightsFact(workspaceId: number, locale: PipLocale): InsightsFact {
  const insights = loadInsights(workspaceId, israelToday());
  return {
    asOf: new Date().toISOString(),
    monthTotal: money(insights.monthTotal, locale),
    topCategories: insights.topCategories.map((c) => ({
      name: c.name,
      amount: money(c.total, locale),
    })),
    anomalies: insights.anomalies.slice(0, 5).map((a) => ({
      type: a.type,
      detail: a.detail,
      amount: a.amount == null ? null : money(Math.abs(a.amount), locale),
    })),
    installments: insights.installments.slice(0, 6).map((p) => ({
      merchant: p.merchant,
      amount: money(p.amount, locale),
      date: p.date,
    })),
    subscriptionCount: insights.series.filter(
      (s) => s.status === "suggested" && isActive(s, israelToday()),
    ).length,
  };
}

export interface SyncFact {
  asOf: string;
  lastAttemptMs: number | null;
  credentials: {
    provider: string;
    status: string;
    lastSyncAt: string | null;
    errorMessage: string | null;
  }[];
}

export function syncFact(workspaceId: number): SyncFact {
  return {
    asOf: new Date().toISOString(),
    lastAttemptMs: latestSyncStartMs(),
    credentials: getBankHealth(workspaceId).map((b) => ({
      provider: b.provider,
      status: b.status,
      lastSyncAt: b.lastSyncAt,
      errorMessage: safeErrorMessage(b.errorMessage),
    })),
  };
}

export interface CategoriesFact {
  asOf: string;
  categories: { id: number; name: string; kind: string; parentId: number | null }[];
}

export function categoriesFact(workspaceId: number): CategoriesFact {
  return {
    asOf: new Date().toISOString(),
    categories: getAllCategories(workspaceId).map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      parentId: c.parentId,
    })),
  };
}

export interface RulesFact {
  asOf: string;
  rules: {
    id: number;
    field: string;
    op: string;
    value: string;
    categoryId: number | null;
    kind: string | null;
  }[];
}

export function rulesFact(workspaceId: number): RulesFact {
  return {
    asOf: new Date().toISOString(),
    rules: listRules(workspaceId).map((r) => ({
      id: r.id,
      field: r.field,
      op: r.op,
      value: r.value,
      categoryId: r.categoryId ?? null,
      kind: r.kind ?? null,
    })),
  };
}

export interface TransactionSearchFact {
  asOf: string;
  total: number;
  transactions: {
    id: number;
    date: string;
    description: string;
    amount: PipMoney;
    kind: string;
    category: string | null;
    account: string;
  }[];
}

export function transactionSearchFact(
  workspaceId: number,
  locale: PipLocale,
  input: {
    from?: string;
    to?: string;
    query?: string;
    category?: string;
    kind?: "expense" | "income" | "transfer";
    limit?: number;
  },
): TransactionSearchFact {
  const where = ["t.workspace_id = ?", "t.status = 'completed'", "t.is_excluded = 0"];
  const params: (string | number)[] = [workspaceId];
  if (input.from) {
    where.push("t.date >= ?");
    params.push(input.from);
  }
  if (input.to) {
    where.push("t.date <= ?");
    params.push(`${input.to}T23:59:59`);
  }
  if (input.query) {
    where.push("(lower(t.description) LIKE ? OR lower(COALESCE(t.merchant_key, '')) LIKE ?)");
    params.push(`%${input.query.toLowerCase()}%`, `%${input.query.toLowerCase()}%`);
  }
  if (input.category) {
    where.push("(c.name LIKE ? OR p.name LIKE ?)");
    params.push(`%${input.category}%`, `%${input.category}%`);
  }
  if (input.kind) {
    where.push("t.kind = ?");
    params.push(input.kind);
  }
  const limit = Math.min(50, Math.max(1, input.limit ?? 15));
  const base = `FROM transactions t LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN categories p ON p.id = c.parent_id WHERE ${where.join(" AND ")}`;
  const rows = getDb()
    .prepare(
      `SELECT t.id, t.date, t.description, t.charged_amount AS amount, t.kind,
              COALESCE(c.name, p.name, 'Uncategorized') AS category, t.account_number AS account
       ${base} ORDER BY t.date DESC, t.id DESC LIMIT ?`,
    )
    .all(...params, limit) as {
    id: number;
    date: string;
    description: string;
    amount: number;
    kind: string;
    category: string;
    account: string;
  }[];
  const total = (
    getDb()
      .prepare(`SELECT COUNT(*) AS n ${base}`)
      .get(...params) as { n: number }
  ).n;
  return {
    asOf: new Date().toISOString(),
    total,
    transactions: rows.map((r) => ({
      id: r.id,
      date: r.date.slice(0, 10),
      description: r.description,
      amount: money(Math.abs(r.amount), locale),
      kind: r.kind,
      category: r.category,
      account: `••${r.account.slice(-4)}`,
    })),
  };
}
