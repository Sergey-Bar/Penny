import "server-only";

import type { PipLocale } from "@/lib/pip";
import { currentBudgetPeriod, previousBudgetPeriod } from "./facts";
import { addDays } from "@/lib/balance-forecast";

export interface PipToolPlan {
  name: string;
  args: Record<string, unknown>;
}

interface PlanInput {
  workspaceId: number;
  question: string;
  locale: PipLocale;
  today: string;
  history: { role: "user" | "assistant"; content: string }[];
  categoryNames: string[];
}

const HEBREW = /[\u0590-\u05FF]/;

function has(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

function lastUser(history: PlanInput["history"]): string {
  return [...history].reverse().find((m) => m.role === "user")?.content ?? "";
}

function spendingPeriod(
  input: PlanInput,
  question: string,
): { from: string; to: string; label: string } {
  const current = currentBudgetPeriod(input.workspaceId, input.today);
  const previous = previousBudgetPeriod(input.workspaceId, input.today);
  if (has(question, ["last month", "previous month", "חודש שעבר", "החודש שעבר"]))
    return { from: previous.from, to: previous.to, label: previous.label };
  if (has(question, ["last 3 months", "3 months", "three months", "3 חודשים", "שלושה חודשים"]))
    return {
      from: addDays(current.to, -90),
      to: current.to,
      label: input.locale === "he" ? "90 ימים" : "90 days",
    };
  if (has(question, ["last 30 days", "30 days", "30 ימים", "חודש אחרון"]))
    return {
      from: addDays(input.today, -29),
      to: input.today,
      label: input.locale === "he" ? "30 ימים" : "30 days",
    };
  if (has(question, ["this year", "year", "השנה", "שנה"]))
    return {
      from: `${input.today.slice(0, 4)}-01-01`,
      to: input.today,
      label: input.today.slice(0, 4),
    };
  return { from: current.from, to: current.to, label: current.label };
}

function findCategory(question: string, names: string[]): string | undefined {
  const lower = question.toLowerCase();
  return names
    .filter((name) => name.length >= 2)
    .sort((a, b) => b.length - a.length)
    .find((name) => lower.includes(name.toLowerCase()));
}

function extractAmount(text: string): number | null {
  const match = text.match(
    /(?:₪|ש["״]?ח|ils|nis|shekels?)?\s*([\d][\d,.]{0,12})\s*(?:₪|ש["״]?ח|ils|nis|shekels?)?/i,
  );
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function extractPercent(text: string): number | null {
  const match = text.match(/([\d]+(?:\.\d+)?)\s*%/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function extractYears(text: string): number | null {
  const match = text.match(/([\d]+(?:\.\d+)?)\s*(?:years?|שנים|שנה)/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function calculatorPlan(input: PlanInput, question: string): PipToolPlan | null {
  const he = HEBREW.test(question) || input.locale === "he";
  const amount = extractAmount(question);
  const percent = extractPercent(question);
  const years = extractYears(question);
  if (has(question, ["net salary", "gross", "neto", "ברוטו", "נטו", "שכר נטו"])) {
    if (!amount) return null;
    return {
      name: "calculator.run",
      args: { name: "gross_net", gross: amount, sex: "man", extraPoints: 0 },
    };
  }
  if (has(question, ["emergency", "חירום", "כרית ביטחון"])) {
    if (!amount) return null;
    return {
      name: "calculator.run",
      args: { name: "emergency_fund", monthlyExpenses: amount, months: 6 },
    };
  }
  if (has(question, ["mortgage", "משכנתא"])) {
    if (!amount) return null;
    return {
      name: "calculator.run",
      args: {
        name: "mortgage_payment",
        amount,
        annualRatePct: percent ?? 4.5,
        years: years ?? 25,
      },
    };
  }
  if (has(question, ["loan", "הלוואה", "אשראי"])) {
    if (!amount) return null;
    return {
      name: "calculator.run",
      args: {
        name: "loan_payoff",
        amount,
        annualRatePct: percent ?? 6,
        years: years ?? 5,
      },
    };
  }
  if (has(question, ["retire", "retirement", "פרישה", "לפרוש"])) {
    if (!amount && !has(question, ["monthly spend", "הוצאות חודשיות"])) return null;
    return {
      name: "calculator.run",
      args: {
        name: "retirement_gap",
        monthlySpend: amount ?? 12_000,
        currentSavings: 0,
        monthlySaving: 0,
        annualReturnPct: 5,
        withdrawalRatePct: 4,
      },
    };
  }
  if (has(question, ["save", "saving", "חסוך", "חיסכון", "compound", "ריבית דריבית"])) {
    if (has(question, ["target", "goal", "יעד", "מטרה"])) {
      if (!amount) return null;
      return {
        name: "calculator.run",
        args: {
          name: "savings_goal",
          target: amount,
          saved: 0,
          months: Math.max(1, Math.round((years ?? 3) * 12)),
          annualReturnPct: percent ?? 4,
        },
      };
    }
    return {
      name: "calculator.run",
      args: {
        name: "compound",
        initial: amount ?? 0,
        monthly: has(question, ["monthly", "a month", "per month", "בחודש", "לחודש"])
          ? (amount ?? 0)
          : 0,
        years: years ?? 10,
        annualReturnPct: percent ?? 6,
      },
    };
  }
  if (has(question, ["net", "נטו"]) && amount)
    return {
      name: "calculator.run",
      args: { name: "gross_net", gross: amount, sex: "man", extraPoints: 0 },
    };
  return he ? null : null;
}

export function planTools(input: PlanInput): PipToolPlan[] {
  const original = input.question.trim();
  const previous = lastUser(input.history);
  const followUp =
    original.length < 48 &&
    has(original.toLowerCase(), ["and", "what about", "same", "גם", "ומה עם", "אותו", "אחר כך"]);
  const question = `${original} ${followUp ? previous : ""}`.toLowerCase();
  const plans: PipToolPlan[] = [];
  const add = (name: string, args: Record<string, unknown> = {}) => {
    if (plans.length < 6 && !plans.some((p) => p.name === name)) plans.push({ name, args });
  };
  const period = spendingPeriod(input, question);
  const category = findCategory(question, input.categoryNames);
  const merchantMatch = original.match(
    /(?:at|with|merchant|אצל|אצל|ל)([A-Za-z\u0590-\u05FF][\w\u0590-\u05FF .&'-]{2,40})/,
  );
  const merchant = merchantMatch?.[1]?.trim();

  if (has(question, ["afford", "can i buy", "להרשות", "מרשה", "לקנות", "יכול להרשות"])) {
    add("cash.toPayday");
    add("budgets.status");
    add("planned.list");
  }
  if (
    has(question, [
      "why",
      "changed",
      "increase",
      "rise",
      "drop",
      "spike",
      "למה",
      "עלה",
      "גדל",
      "השתנה",
      "קפץ",
    ])
  ) {
    add("spending.summary", {
      from: period.from,
      to: period.to,
      compareToPrevious: true,
      ...(category ? { category } : {}),
      ...(merchant ? { merchant } : {}),
    });
  }
  if (
    has(question, [
      "spend",
      "spent",
      "expense",
      "expenses",
      "biggest",
      "הוצאתי",
      "הוצאה",
      "הוצאות",
      "שילמתי",
      "הכי גדול",
    ])
  ) {
    add("spending.summary", {
      from: period.from,
      to: period.to,
      ...(category ? { category } : {}),
      ...(merchant ? { merchant } : {}),
    });
  }
  if (
    has(question, [
      "payday",
      "before salary",
      "until salary",
      "עד המשכורת",
      "לפני משכורת",
      "עד התשלום",
    ])
  ) {
    add("cash.toPayday");
    add("planned.list");
  }
  if (
    has(question, [
      "subscription",
      "recurring",
      "bill",
      "מנוי",
      "מנויים",
      "הוראת קבע",
      "קבוע",
      "חשבון",
    ])
  ) {
    add("recurring.list");
    add("fees.summary");
  }
  if (has(question, ["fee", "fees", "management", "עמלה", "עמלות", "דמי ניהול"])) {
    add("fees.summary");
    add("recurring.list");
  }
  if (
    has(question, ["overdraft", "debt", "loan", "minus", "מינוס", "חוב", "הלוואה", "לצאת מהמינוס"])
  ) {
    add("cash.toPayday");
    add("budgets.status");
    add("insights.summary");
  }
  if (
    has(question, [
      "pension",
      "provident",
      "study fund",
      "gemel",
      "פנסיה",
      "גמל",
      "קרן השתלמות",
      "השתלמות",
    ])
  ) {
    add("pension.summary");
    add("fees.summary");
  }
  if (has(question, ["retire", "retirement", "פרישה", "לפרוש"])) {
    add("pension.summary");
    add("netWorth.summary");
    add("cash.toPayday");
  }
  if (has(question, ["insurance", "policy", "ביטוח", "פוליסה"])) {
    add("insurance.summary");
  }
  if (
    has(question, [
      "net worth",
      "assets",
      "investments",
      "portfolio",
      "שווי נקי",
      "השווי הנקי",
      "נכסים",
      "השקעות",
      "תיק",
    ])
  ) {
    add("netWorth.summary");
    add("pension.summary");
  }
  if (has(question, ["income", "salary", "earn", "client", "הכנסה", "משכורת", "שכר", "לקוחות"])) {
    add("income.summary");
    add("cash.toPayday");
  }
  if (has(question, ["planned", "due", "upcoming", "bill", "מתוכנ", "צפוי", "לשלם", "חיוב"])) {
    add("planned.list");
  }
  if (has(question, ["sync", "scrape", "connection", "סנכרון", "חיבור", "בנק"])) {
    add("sync.status");
  }
  if (has(question, ["category", "categories", "קטגוריה", "קטגוריות"])) {
    add("categories.list");
  }
  if (has(question, ["rule", "automation", "כלל", "כללים", "אוטומציה"])) {
    add("rules.list");
  }
  if (
    has(question, ["transaction", "charge", "payment", "עסקה", "עסקאות", "תנועה", "חיוב", "תשלום"])
  ) {
    add("transactions.search", {
      from: period.from,
      to: period.to,
      ...(category ? { category } : {}),
      ...(merchant ? { query: merchant } : {}),
    });
  }
  const startsWithKnowledge =
    /^(what is|what's|whats|what are|how does|how do|explain|guide|should i|ממה|מה זה|מהי|מהו|איך|למה כדאי|הסבר|מדריך)/i.test(
      original,
    );
  if (startsWithKnowledge && plans.length === 0) {
    add("knowledge.search", { query: original.slice(0, 160) });
  }
  const calc = calculatorPlan(input, question);
  if (calc) {
    plans.unshift(calc);
    if (plans.length > 6) plans.length = 6;
  }
  if (plans.length === 0) {
    add("accounts.list");
    add("spending.summary", { from: period.from, to: period.to });
    add("budgets.status");
    add("income.summary");
  }
  return plans;
}
