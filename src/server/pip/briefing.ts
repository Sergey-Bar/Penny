import "server-only";

import type { PipBriefing, PipBriefingItem, PipLocale } from "@/lib/pip";
import { getNeedsAttentionCounts } from "@/server/db/queries/home";
import {
  budgetFact,
  cashFact,
  feesFact,
  insuranceFact,
  insightsFact,
  pensionFact,
  plannedFact,
  recurringFact,
  syncFact,
} from "./facts";

function evidence(key: string, label: string, asOf: string) {
  return [{ id: `briefing:${key}:${asOf.slice(0, 10)}`, kind: "briefing", label, asOf }];
}

export function buildBriefing(input: {
  workspaceId: number;
  locale: PipLocale;
  today: string;
}): PipBriefing {
  const { workspaceId, locale, today } = input;
  const items: PipBriefingItem[] = [];
  const he = locale === "he";
  const cash = cashFact(workspaceId, locale);
  if (cash.safeToSpend && cash.safeToSpend.amount < 0)
    items.push({
      key: "cash_negative",
      tone: "act",
      title: he ? "הכסף הפנוי שלילי" : "Available cash is negative",
      body: he
        ? `עד ${cash.until} צפויה חריגה של ${cash.safeToSpend.formatted}. שווה לבדוק אילו חיובים אפשר לדחות.`
        : `By ${cash.until} there is a ${cash.safeToSpend.formatted} shortfall. Check which charges can be deferred.`,
      evidence: evidence("cash", cash.safeToSpend.formatted, cash.asOf),
      action: { href: "/planned", label: he ? "לבדוק חיובים" : "Review charges" },
    });
  else if (cash.safeToSpend && cash.billsDue.amount > cash.safeToSpend.amount)
    items.push({
      key: "bills_over_safe",
      tone: "act",
      title: he ? "חיובי כרטיס לפני המשכורת" : "Card bills before payday",
      body: he
        ? `${cash.billsDue.formatted} בחיובים מול ${cash.safeToSpend.formatted} פנויים עד ${cash.until}.`
        : `${cash.billsDue.formatted} in bills against ${cash.safeToSpend.formatted} available until ${cash.until}.`,
      evidence: evidence("bills", cash.billsDue.formatted, cash.asOf),
      action: { href: "/", label: he ? "לתזרים" : "Open cash flow" },
    });
  const budget = budgetFact(workspaceId, locale);
  if (budget.planned.amount > 0) {
    const ratio = budget.spent.amount / budget.planned.amount;
    const pace = budget.elapsedPercent / 100;
    if (ratio > 1)
      items.push({
        key: "budget_over",
        tone: "act",
        title: he ? "התקציב נחרוג" : "Budget exceeded",
        body: he
          ? `הוצאות ${budget.spent.formatted} מול תקציב ${budget.planned.formatted}.`
          : `${budget.spent.formatted} spent against a ${budget.planned.formatted} budget.`,
        evidence: evidence("budget", budget.spent.formatted, budget.asOf),
        action: { href: "/budget", label: he ? "לפתוח תקציב" : "Open budget" },
      });
    else if (pace > 0.15 && ratio > pace + 0.15)
      items.push({
        key: "budget_pace",
        tone: "watch",
        title: he ? "קצב ההוצאות מהיר" : "Spending pace is high",
        body: he
          ? `${Math.round(ratio * 100)}% מהתקציב נוצל ו-${budget.elapsedPercent}% מהחודש עבר.`
          : `${Math.round(ratio * 100)}% of the budget is used and ${budget.elapsedPercent}% of the month has passed.`,
        evidence: evidence("pace", budget.spent.formatted, budget.asOf),
        action: { href: "/budget", label: he ? "לבדוק קצב" : "Check pace" },
      });
  }
  const recurring = recurringFact(workspaceId, locale);
  const changed = recurring.items.filter((item) => item.priceChange);
  if (changed.length)
    items.push({
      key: "price_change",
      tone: "watch",
      title: he ? "מחיר של תשלום קבוע עלה" : "A recurring charge increased",
      body: he
        ? `${changed[0].merchant} עלה ל-${changed[0].monthly.formatted} בחודש.`
        : `${changed[0].merchant} increased to ${changed[0].monthly.formatted} a month.`,
      evidence: evidence("recurring", changed[0].merchant, recurring.asOf),
      action: { href: "/recurring", label: he ? "לבדוק מנויים" : "Review subscriptions" },
    });
  const fees = feesFact(workspaceId, locale);
  if (fees.yearlyFundFee.amount > 0 && fees.fundFees.some((fund) => (fund.feePercent ?? 0) > 0.5))
    items.push({
      key: "fund_fees",
      tone: "watch",
      title: he ? "דמי ניהול בחסכון" : "Savings management fees",
      body: he
        ? `העלות השנתית המשוערת של דמי הניהול היא ${fees.yearlyFundFee.formatted}.`
        : `Estimated annual management fees are ${fees.yearlyFundFee.formatted}.`,
      evidence: evidence("fees", fees.yearlyFundFee.formatted, fees.asOf),
      action: { href: "/investments", label: he ? "לבדוק דמי ניהול" : "Review fees" },
    });
  const insights = insightsFact(workspaceId, locale);
  if (insights.anomalies.length)
    items.push({
      key: "anomaly",
      tone: "watch",
      title: he ? "הוצאה חריגה" : "Unusual spending",
      body: insights.anomalies[0].detail,
      evidence: evidence("anomaly", insights.anomalies[0].detail, insights.asOf),
      action: { href: "/insights", label: he ? "לפתוח תובנות" : "Open insights" },
    });
  const sync = syncFact(workspaceId);
  const syncIssue = sync.credentials.find((c) => c.status === "error" || c.status === "stale");
  if (syncIssue)
    items.push({
      key: "sync",
      tone: "watch",
      title: he ? "הסנכרון דורש תשומת לב" : "Sync needs attention",
      body: he
        ? `החיבור ל-${syncIssue.provider} ${syncIssue.status === "error" ? "נכשל" : "לא עודכן"}.`
        : `The ${syncIssue.provider} connection ${syncIssue.status === "error" ? "failed" : "is stale"}.`,
      evidence: evidence("sync", syncIssue.provider, sync.asOf),
      action: { href: "/settings/bank", label: he ? "לבדוק חיבורים" : "Review connections" },
    });
  const attention = getNeedsAttentionCounts(workspaceId);
  if (attention.uncategorized > 0)
    items.push({
      key: "uncategorized",
      tone: "watch",
      title: he ? "תנועות ללא קטגוריה" : "Uncategorized transactions",
      body: he
        ? `${attention.uncategorized} תנועות ממתינות לסיווג, ולכן התמונה החודשית חלקית.`
        : `${attention.uncategorized} transactions await a category, so the monthly picture is partial.`,
      evidence: evidence(
        "uncategorized",
        String(attention.uncategorized),
        new Date().toISOString(),
      ),
      action: { href: "/transactions?needsReview=1", label: he ? "לסווג" : "Categorize" },
    });
  const pension = pensionFact(workspaceId, locale);
  if (pension.confidence === "low")
    items.push({
      key: "pension_missing",
      tone: "watch",
      title: he ? "חסרים נתוני פנסיה" : "Pension data is missing",
      body: he
        ? "לא נמצאו מוצרי פנסיה או חיסכון, ולכן אי אפשר לבדוק את התמונה הפנסיונית."
        : "No pension or savings products were found, so the retirement picture cannot be checked.",
      evidence: evidence("pension", pension.confidence, pension.asOf),
      action: { href: "/investments", label: he ? "להוסיף פנסיה" : "Add pension" },
    });
  const insurance = insuranceFact(workspaceId, locale);
  if (insurance.duplicateKinds.length || insurance.missingKinds.length)
    items.push({
      key: "insurance",
      tone: "watch",
      title: he ? "כיסוי ביטוחי לבדיקה" : "Insurance cover to review",
      body: he
        ? insurance.duplicateKinds.length
          ? `נמצאו ${insurance.duplicateKinds.length} סוגי כיסוי כפולים.`
          : `לא נמצא כיסוי ל: ${insurance.missingKinds.slice(0, 3).join(", ")}.`
        : insurance.duplicateKinds.length
          ? `${insurance.duplicateKinds.length} duplicate cover types were found.`
          : `No cover was found for: ${insurance.missingKinds.slice(0, 3).join(", ")}.`,
      evidence: evidence("insurance", insurance.monthlyPremium.formatted, insurance.asOf),
      action: { href: "/insurance", label: he ? "לבדוק ביטוח" : "Review insurance" },
    });
  const planned = plannedFact(workspaceId, locale);
  if (planned.overdue > 0)
    items.push({
      key: "planned_overdue",
      tone: "watch",
      title: he ? "הוצאה מתוכננת באיחור" : "A planned item is overdue",
      body: he
        ? `${planned.overdue} הוצאות מתוכננות עברו את התאריך.`
        : `${planned.overdue} planned items are past their date.`,
      evidence: evidence("planned", String(planned.overdue), planned.asOf),
      action: { href: "/planned", label: he ? "לפתוח מתוכננות" : "Open planned" },
    });
  if (items.length === 0)
    items.push({
      key: "steady",
      tone: "good",
      title: he ? "התמונה יציבה" : "The picture is steady",
      body: he
        ? "לא נמצאו חריגות או חיובים דחופים. אפשר להמשיך כרגיל."
        : "No anomalies or urgent charges were found. Continue as usual.",
      evidence: evidence("steady", "ok", new Date().toISOString()),
      action: { href: "/", label: he ? "לבית" : "Open home" },
    });
  const rank = { act: 0, watch: 1, good: 2 } as const;
  return {
    asOf: today,
    generatedAt: new Date().toISOString(),
    items: items.sort((a, b) => rank[a.tone] - rank[b.tone]).slice(0, 3),
  };
}

export function briefingText(briefing: PipBriefing, locale: PipLocale): string {
  const he = locale === "he";
  const head = he ? "התדריך היומי של Pip" : "Pip's daily briefing";
  return [head, ...briefing.items.map((item) => `• ${item.title}: ${item.body}`)].join("\n");
}
