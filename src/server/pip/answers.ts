import "server-only";

import type { PipLocale, PipToolResult } from "@/lib/pip";

interface SpendingData {
  period?: { label?: string };
  scope?: string | null;
  spent?: { formatted?: string; amount?: number };
  income?: { formatted?: string; amount?: number };
  categories?: { name: string; amount: { formatted: string } }[];
  merchants?: { merchant: string; amount: { formatted: string } }[];
  previous?: SpendingData | null;
}

interface CashData {
  safeToSpend?: { formatted: string } | null;
  bank?: { formatted: string } | null;
  billsDue?: { formatted: string };
  salaryExpected?: { amount?: number; formatted: string };
  until?: string;
  daysLeft?: number;
}

interface RecurringData {
  items?: { merchant: string; monthly: { formatted: string }; priceChange?: unknown }[];
  monthlyTotal?: { formatted: string };
}

interface BudgetData {
  planned?: { formatted: string };
  spent?: { formatted: string };
  remaining?: { formatted: string };
  elapsedPercent?: number;
  lines?: { name: string; usedRatio: number; remaining: { formatted: string } }[];
}

interface KnowledgeData {
  entries?: { title: string; body: string; source: string; citation: string }[];
}

interface CalculatorData {
  name?: string;
  outputs?: Record<string, { value: number; formatted: string }>;
  assumptions?: string[];
}

function spendingAnswer(data: SpendingData, locale: PipLocale): string[] {
  if (!data.spent) return [];
  const sentences: string[] = [];
  const period = data.period?.label ?? "";
  sentences.push(
    data.scope
      ? locale === "he"
        ? `על ${data.scope} בתקופה ${period} יצאו ${data.spent.formatted}.`
        : `On ${data.scope} in ${period}, spending was ${data.spent.formatted}.`
      : locale === "he"
        ? `בתקופה ${period} יצאו ${data.spent.formatted} ונכנסו ${data.income?.formatted ?? ""}.`
        : `In ${period}, spending was ${data.spent.formatted} and income was ${data.income?.formatted ?? ""}.`,
  );
  const previous = data.previous?.spent?.amount;
  const current = data.spent.amount;
  if (previous != null && current != null && previous > 0) {
    const delta = current - previous;
    const pct = Math.round((Math.abs(delta) / previous) * 100);
    if (Math.abs(delta) > 0.5)
      sentences.push(
        locale === "he"
          ? `זה ${delta > 0 ? "גבוה" : "נמוך"} ב-${pct}% מהתקופה הקודמת.`
          : `That is ${pct}% ${delta > 0 ? "higher" : "lower"} than the previous period.`,
      );
  }
  const top = data.categories?.slice(0, 3) ?? [];
  if (top.length)
    sentences.push(
      locale === "he"
        ? `הקטגוריות הגדולות: ${top.map((c) => `${c.name} (${c.amount.formatted})`).join(", ")}.`
        : `Largest categories: ${top.map((c) => `${c.name} (${c.amount.formatted})`).join(", ")}.`,
    );
  const merchants = data.merchants?.slice(0, 3) ?? [];
  if (merchants.length)
    sentences.push(
      locale === "he"
        ? `הבתי עסק הבולטים: ${merchants.map((m) => `${m.merchant} (${m.amount.formatted})`).join(", ")}.`
        : `Top merchants: ${merchants.map((m) => `${m.merchant} (${m.amount.formatted})`).join(", ")}.`,
    );
  return sentences;
}

function cashAnswer(data: CashData, locale: PipLocale): string[] {
  if (data.safeToSpend == null)
    return [
      locale === "he"
        ? "אין עדיין יתרת בנק מסונכרנת, ולכן אי אפשר לחשב כמה פנוי עד המשכורת."
        : "There is no synced bank balance yet, so I cannot calculate what is available until payday.",
    ];
  return [
    locale === "he"
      ? `פנויים ${data.safeToSpend.formatted} עד ${data.until} (${data.daysLeft} ימים), אחרי ${data.billsDue?.formatted ?? "0"} חיובי כרטיס ופעולות מתוכננות.`
      : `${data.safeToSpend.formatted} is available until ${data.until} (${data.daysLeft} days), after ${data.billsDue?.formatted ?? "0"} in card bills and known debits.`,
    ...(data.salaryExpected && (data.salaryExpected.amount ?? 0) > 0
      ? [
          locale === "he"
            ? `משכורת צפויה: ${data.salaryExpected.formatted}; היא עדיין לא נכללת בכסף הפנוי.`
            : `Expected salary: ${data.salaryExpected.formatted}; it is not included in available cash yet.`,
        ]
      : []),
  ];
}

function recurringAnswer(data: RecurringData, locale: PipLocale): string[] {
  const items = data.items ?? [];
  if (!items.length)
    return [
      locale === "he"
        ? "לא נמצאו תשלומים קבועים פעילים."
        : "No active recurring charges were found.",
    ];
  const top = items.slice(0, 4);
  return [
    locale === "he"
      ? `${items.length} תשלומים קבועים, ${data.monthlyTotal?.formatted ?? ""} בחודש. הבולטים: ${top.map((i) => `${i.merchant} (${i.monthly.formatted})`).join(", ")}.`
      : `${items.length} recurring charges, ${data.monthlyTotal?.formatted ?? ""} a month. Largest: ${top.map((i) => `${i.merchant} (${i.monthly.formatted})`).join(", ")}.`,
    ...(items.some((i) => i.priceChange)
      ? [
          locale === "he"
            ? "לפחות אחד מהתשלומים עלה במחיר לאחרונה; אפשר לבדוק אותו מול החלופה הזולה יותר."
            : "At least one charge increased in price recently; it is worth comparing with a cheaper alternative.",
        ]
      : []),
  ];
}

function budgetAnswer(data: BudgetData, locale: PipLocale): string[] {
  if (!data.planned || !data.spent || !data.remaining) return [];
  const over = (data.lines ?? []).filter((l) => l.usedRatio > 1).slice(0, 3);
  return [
    locale === "he"
      ? `התקציב ${data.planned.formatted}, הוצאות ${data.spent.formatted}, נותר ${data.remaining.formatted}. ${data.elapsedPercent ?? 0}% מהחודש עבר.`
      : `Budget ${data.planned.formatted}, spent ${data.spent.formatted}, remaining ${data.remaining.formatted}. ${data.elapsedPercent ?? 0}% of the month has passed.`,
    ...(over.length
      ? [
          locale === "he"
            ? `חריגה ב: ${over.map((l) => l.name).join(", ")}.`
            : `Over budget in: ${over.map((l) => l.name).join(", ")}.`,
        ]
      : []),
  ];
}

function knowledgeAnswer(data: KnowledgeData, locale: PipLocale): string[] {
  const entries = data.entries ?? [];
  if (!entries.length)
    return [
      locale === "he"
        ? "לא נמצא מקור מתאים בידע המצורף."
        : "No matching source was found in the seeded knowledge.",
    ];
  const first = entries[0];
  return [
    `${first.title}: ${first.body}`,
    ...entries.slice(1, 2).map((e) => `${e.title}: ${e.body}`),
    locale === "he"
      ? `מקור: ${first.source} (${first.citation}).`
      : `Source: ${first.source} (${first.citation}).`,
  ];
}

function calculatorAnswer(data: CalculatorData, locale: PipLocale): string[] {
  const outputs = Object.entries(data.outputs ?? {});
  if (!outputs.length) return [];
  const body = outputs.map(([key, value]) => `${key}: ${value.formatted}`).join(", ");
  return [
    locale === "he"
      ? `תוצאת המחשבון (${data.name}): ${body}.`
      : `Calculator result (${data.name}): ${body}.`,
    ...(data.assumptions?.length
      ? [
          locale === "he"
            ? `הנחות: ${data.assumptions.join("; ")}.`
            : `Assumptions: ${data.assumptions.join("; ")}.`,
        ]
      : []),
  ];
}

function genericAnswer(results: PipToolResult[], locale: PipLocale): string[] {
  const summaries = results
    .map((r) => r.summary)
    .filter(Boolean)
    .slice(0, 3);
  if (!summaries.length)
    return [
      locale === "he"
        ? "לא הצלחתי לקרוא את הנתונים הדרושים. אפשר לנסות שאלה ממוקדת יותר."
        : "I could not read the data needed for that. Try a more specific question.",
    ];
  return summaries;
}

export function buildDeterministicAnswer(input: {
  locale: PipLocale;
  results: PipToolResult[];
}): string {
  const { locale, results } = input;
  const by = new Map(results.map((r) => [r.tool, r]));
  const sentences: string[] = [];
  const knowledge = by.get("knowledge.search");
  if (knowledge) sentences.push(...knowledgeAnswer(knowledge.data as KnowledgeData, locale));
  const calculator = by.get("calculator.run");
  if (calculator) sentences.push(...calculatorAnswer(calculator.data as CalculatorData, locale));
  const cash = by.get("cash.toPayday");
  if (cash) sentences.push(...cashAnswer(cash.data as CashData, locale));
  const spending = by.get("spending.summary");
  if (spending) sentences.push(...spendingAnswer(spending.data as SpendingData, locale));
  const budget = by.get("budgets.status");
  if (budget) sentences.push(...budgetAnswer(budget.data as BudgetData, locale));
  const recurring = by.get("recurring.list");
  if (recurring) sentences.push(...recurringAnswer(recurring.data as RecurringData, locale));
  if (sentences.length === 0) sentences.push(...genericAnswer(results, locale));
  const unique = [...new Set(sentences)];
  const joined = unique.join(" ");
  return joined.length > 900 ? `${joined.slice(0, 897)}…` : joined;
}
