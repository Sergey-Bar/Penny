import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { addDays } from "@/lib/balance-forecast";
import type { PipEvidence, PipLocale, PipRiskTier, PipToolResult } from "@/lib/pip";
import {
  accountsFact,
  budgetFact,
  cashFact,
  categoriesFact,
  currentBudgetPeriod,
  feesFact,
  forecastFact,
  goalsFact,
  incomeFact,
  insightsFact,
  insuranceFact,
  netWorthFact,
  pensionFact,
  plannedFact,
  recurringFact,
  rulesFact,
  spendingFact,
  syncFact,
  transactionSearchFact,
} from "./facts";
import { calculatorInputSchema, runCalculator, type CalculatorOutput } from "./calculators";
import { KNOWLEDGE_VERSION, knowledgeCitation, searchKnowledge } from "./knowledge";
import { addMemory, deleteMemory, readMemory } from "./repository";

export interface PipToolContext {
  workspaceId: number;
  profileId: number | null;
  locale: PipLocale;
  today: string;
}

interface PipToolDefinition<I = unknown, O = unknown> {
  name: string;
  description: string;
  riskTier: PipRiskTier;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  run: (
    context: PipToolContext,
    input: I,
  ) => Promise<{ data: O; summary: string; sourceIds?: string[] }>;
}

const anyOutput = z.object({ asOf: z.string() }).passthrough();

function evidenceId(tool: string, data: unknown): string {
  return `ev:${tool}:${createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 16)}`;
}

function evidenceOf(
  tool: string,
  data: unknown,
  summary: string,
  sourceIds?: string[],
): PipEvidence {
  const record = data && typeof data === "object" ? (data as { asOf?: string }) : {};
  return {
    id: evidenceId(tool, data),
    kind: tool,
    label: summary,
    asOf: record.asOf,
    sourceIds,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PIP_TOOLS: PipToolDefinition<any, any>[] = [
  {
    name: "accounts.list",
    description: "Bank balances, card accounts and transaction accounts for the workspace.",
    riskTier: "read",
    input: z.object({}),
    output: anyOutput,
    async run(context) {
      const data = accountsFact(context.workspaceId, context.locale);
      const summary =
        context.locale === "he"
          ? `יתרת בנק ${data.totalBank.formatted}`
          : `Bank balance ${data.totalBank.formatted}`;
      return { data, summary };
    },
  },
  {
    name: "transactions.search",
    description: "Search completed transactions by period, merchant text, category or kind.",
    riskTier: "read",
    input: z.object({
      from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      to: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      query: z.string().trim().min(1).max(120).optional(),
      category: z.string().trim().min(1).max(80).optional(),
      kind: z.enum(["expense", "income", "transfer"]).optional(),
      limit: z.number().int().min(1).max(50).default(15),
    }),
    output: anyOutput,
    async run(context, input) {
      const data = transactionSearchFact(context.workspaceId, context.locale, input);
      const summary =
        context.locale === "he"
          ? `${data.total} תנועות מתאימות, מוצגות ${data.transactions.length}`
          : `${data.total} matching transactions, showing ${data.transactions.length}`;
      return { data, summary };
    },
  },
  {
    name: "spending.summary",
    description: "Spending and income totals with category and merchant breakdown for a period.",
    riskTier: "read",
    input: z.object({
      from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      to: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      days: z.number().int().min(1).max(730).optional(),
      category: z.string().trim().min(1).max(80).optional(),
      merchant: z.string().trim().min(1).max(80).optional(),
      compareToPrevious: z.boolean().default(false),
    }),
    output: anyOutput,
    async run(context, input) {
      const base = currentBudgetPeriod(context.workspaceId, context.today);
      const to = input.to ?? base.to;
      const from = input.from ?? (input.days ? addDays(to, -input.days + 1) : base.from);
      const label = from === base.from && to === base.to ? base.label : `${from}..${to}`;
      const data = spendingFact(
        context.workspaceId,
        context.locale,
        from,
        to,
        label,
        input.category,
        input.merchant,
      );
      const previous = input.compareToPrevious
        ? spendingFact(
            context.workspaceId,
            context.locale,
            addDays(
              from,
              -1 -
                Math.max(
                  1,
                  Math.round(
                    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000,
                  ),
                ),
            ),
            addDays(from, -1),
            "previous",
            input.category,
            input.merchant,
          )
        : null;
      const summary = data.scope
        ? context.locale === "he"
          ? `על ${data.scope} בתקופה ${label} יצאו ${data.spent.formatted}`
          : `On ${data.scope} in ${label}, spending was ${data.spent.formatted}`
        : context.locale === "he"
          ? `בתקופה ${label} יצאו ${data.spent.formatted} ונכנסו ${data.income.formatted}`
          : `In ${label}, spending was ${data.spent.formatted} and income was ${data.income.formatted}`;
      return { data: { ...data, previous }, summary };
    },
  },
  {
    name: "income.summary",
    description: "Income streams, monthly history, stability and concentration.",
    riskTier: "read",
    input: z.object({}),
    output: anyOutput,
    async run(context) {
      const data = incomeFact(context.workspaceId, context.locale);
      const summary =
        context.locale === "he"
          ? `הכנסה חודשית ממוצעת ${data.averageMonthly.formatted}, יציבות ${Math.round(data.stability * 100)}%`
          : `Average monthly income ${data.averageMonthly.formatted}, stability ${Math.round(data.stability * 100)}%`;
      return { data, summary };
    },
  },
  {
    name: "budgets.status",
    description:
      "Budget lines, spending, remaining amount and pace for the current household month.",
    riskTier: "read",
    input: z.object({}),
    output: anyOutput,
    async run(context) {
      const data = budgetFact(context.workspaceId, context.locale);
      const summary =
        context.locale === "he"
          ? `תקציב ${data.planned.formatted}, הוצאות ${data.spent.formatted}, נותר ${data.remaining.formatted}`
          : `Budget ${data.planned.formatted}, spent ${data.spent.formatted}, remaining ${data.remaining.formatted}`;
      return { data, summary };
    },
  },
  {
    name: "cash.toPayday",
    description: "Cash available until payday after card bills and bank debits.",
    riskTier: "read",
    input: z.object({}),
    output: anyOutput,
    async run(context) {
      const data = cashFact(context.workspaceId, context.locale);
      const summary =
        data.safeToSpend == null
          ? context.locale === "he"
            ? "אין יתרת בנק מסונכרנת"
            : "No synced bank balance"
          : context.locale === "he"
            ? `${data.safeToSpend.formatted} פנויים עד ${data.until}, עוד ${data.daysLeft} ימים`
            : `${data.safeToSpend.formatted} available until ${data.until}, ${data.daysLeft} days away`;
      return { data, summary };
    },
  },
  {
    name: "forecast.balance",
    description: "Balance forecast low point, first negative day and next payday.",
    riskTier: "read",
    input: z.object({}),
    output: anyOutput,
    async run(context) {
      const data = forecastFact(context.workspaceId, context.locale);
      const summary =
        data.low == null
          ? context.locale === "he"
            ? "אין מספיק נתונים לתחזית"
            : "Not enough data for a forecast"
          : context.locale === "he"
            ? `הנקודה הנמוכה ${data.low.amount.formatted} ב-${data.low.date}`
            : `Low point ${data.low.amount.formatted} on ${data.low.date}`;
      return { data, summary };
    },
  },
  {
    name: "goals.list",
    description: "Goals, saved amount, target date and progress.",
    riskTier: "read",
    input: z.object({}),
    output: anyOutput,
    async run(context) {
      const data = goalsFact(context.workspaceId, context.locale);
      const summary =
        context.locale === "he"
          ? `${data.goals.length} יעדים, ${data.totalSaved.formatted} מתוך ${data.totalTarget.formatted}`
          : `${data.goals.length} goals, ${data.totalSaved.formatted} of ${data.totalTarget.formatted}`;
      return { data, summary };
    },
  },
  {
    name: "recurring.list",
    description: "Active recurring charges and subscriptions with price changes.",
    riskTier: "read",
    input: z.object({}),
    output: anyOutput,
    async run(context) {
      const data = recurringFact(context.workspaceId, context.locale);
      const summary =
        context.locale === "he"
          ? `${data.items.length} תשלומים קבועים, ${data.monthlyTotal.formatted} בחודש`
          : `${data.items.length} recurring charges, ${data.monthlyTotal.formatted} a month`;
      return { data, summary };
    },
  },
  {
    name: "fees.summary",
    description: "Bank, card, tax and fund fees with a yearly estimate.",
    riskTier: "read",
    input: z.object({}),
    output: anyOutput,
    async run(context) {
      const data = feesFact(context.workspaceId, context.locale);
      const summary =
        context.locale === "he"
          ? `עמלות ב-12 החודשים האחרונים ${data.last12Months.formatted}`
          : `Fees in the last 12 months ${data.last12Months.formatted}`;
      return { data, summary };
    },
  },
  {
    name: "netWorth.summary",
    description: "Assets, liabilities, net worth, liquidity and composition.",
    riskTier: "read",
    input: z.object({}),
    output: anyOutput,
    async run(context) {
      const data = netWorthFact(context.workspaceId, context.locale);
      const summary =
        context.locale === "he"
          ? `שווי נקי ${data.netWorth.formatted}, נזילות ${Math.round((1 - data.illiquidShare) * 100)}%`
          : `Net worth ${data.netWorth.formatted}, liquidity ${Math.round((1 - data.illiquidShare) * 100)}%`;
      return { data, summary };
    },
  },
  {
    name: "pension.summary",
    description: "Pension, provident and study-fund products, value, deposits and fees.",
    riskTier: "read",
    input: z.object({}),
    output: anyOutput,
    async run(context) {
      const data = pensionFact(context.workspaceId, context.locale);
      const summary =
        context.locale === "he"
          ? `חסכון פנסיוני ${data.value.formatted}, הפקדות ${data.monthlyDeposits.formatted} בחודש`
          : `Pension savings ${data.value.formatted}, deposits ${data.monthlyDeposits.formatted} a month`;
      return { data, summary };
    },
  },
  {
    name: "insurance.summary",
    description: "Insurance policies, premiums, duplicates, renewals and missing cover.",
    riskTier: "read",
    input: z.object({}),
    output: anyOutput,
    async run(context) {
      const data = insuranceFact(context.workspaceId, context.locale);
      const summary =
        context.locale === "he"
          ? `${data.policies.length} פוליסות, ${data.monthlyPremium.formatted} בחודש`
          : `${data.policies.length} policies, ${data.monthlyPremium.formatted} a month`;
      return { data, summary };
    },
  },
  {
    name: "planned.list",
    description: "Known upcoming purchases and commitments.",
    riskTier: "read",
    input: z.object({}),
    output: anyOutput,
    async run(context) {
      const data = plannedFact(context.workspaceId, context.locale);
      const summary =
        context.locale === "he"
          ? `${data.plannedCount} הוצאות מתוכננות, ${data.upcoming.formatted} קרובות`
          : `${data.plannedCount} planned items, ${data.upcoming.formatted} upcoming`;
      return { data, summary };
    },
  },
  {
    name: "insights.summary",
    description: "Monthly spend, anomalies, installments and top categories.",
    riskTier: "read",
    input: z.object({}),
    output: anyOutput,
    async run(context) {
      const data = insightsFact(context.workspaceId, context.locale);
      const summary =
        context.locale === "he"
          ? `החודש יצאו ${data.monthTotal.formatted}, ${data.anomalies.length} חריגות`
          : `${data.monthTotal.formatted} spent this month, ${data.anomalies.length} anomalies`;
      return { data, summary };
    },
  },
  {
    name: "sync.status",
    description: "Last sync time, credential health and errors.",
    riskTier: "read",
    input: z.object({}),
    output: anyOutput,
    async run(context) {
      const data = syncFact(context.workspaceId);
      const summary =
        context.locale === "he"
          ? `${data.credentials.length} חיבורים, ${data.credentials.filter((c) => c.status === "error").length} שגיאות`
          : `${data.credentials.length} connections, ${data.credentials.filter((c) => c.status === "error").length} errors`;
      return { data, summary };
    },
  },
  {
    name: "categories.list",
    description: "Categories in the workspace.",
    riskTier: "read",
    input: z.object({}),
    output: anyOutput,
    async run(context) {
      const data = categoriesFact(context.workspaceId);
      return {
        data,
        summary:
          context.locale === "he"
            ? `${data.categories.length} קטגוריות`
            : `${data.categories.length} categories`,
      };
    },
  },
  {
    name: "rules.list",
    description: "Automation rules in the workspace.",
    riskTier: "read",
    input: z.object({}),
    output: anyOutput,
    async run(context) {
      const data = rulesFact(context.workspaceId);
      return {
        data,
        summary:
          context.locale === "he" ? `${data.rules.length} כללים` : `${data.rules.length} rules`,
      };
    },
  },
  {
    name: "knowledge.search",
    description: "Search the versioned Penny knowledge seed and return cited entries.",
    riskTier: "read",
    input: z.object({
      query: z.string().trim().min(1).max(160),
      limit: z.number().int().min(1).max(8).default(4),
    }),
    output: z.object({
      asOf: z.string(),
      version: z.number(),
      entries: z.array(z.record(z.string(), z.unknown())),
      citations: z.array(z.string()),
    }),
    async run(context, input) {
      const entries = searchKnowledge(input.query, context.locale, input.limit);
      const citations = entries.map(knowledgeCitation);
      const data = {
        asOf: new Date().toISOString(),
        version: KNOWLEDGE_VERSION,
        entries: entries.map((e) => ({
          id: e.id,
          topic: e.topic,
          audience: e.audience,
          title: e.title[context.locale],
          body: e.body[context.locale],
          source: e.source,
          reviewedAt: e.reviewedAt,
          taxYear: e.taxYear,
          href: e.href,
          citation: knowledgeCitation(e),
        })),
        citations,
      };
      const summary =
        context.locale === "he"
          ? `${entries.length} מקורות ידע נמצאו`
          : `${entries.length} knowledge sources found`;
      return { data, summary, sourceIds: citations };
    },
  },
  {
    name: "calculator.run",
    description:
      "Run a deterministic calculator: gross_net, emergency_fund, compound, loan_payoff, mortgage_payment, retirement_gap or savings_goal.",
    riskTier: "read",
    input: calculatorInputSchema,
    output: z.object({ asOf: z.string() }).passthrough(),
    async run(context, input) {
      const output: CalculatorOutput = runCalculator(input, context.locale);
      const data = { asOf: new Date().toISOString(), ...output };
      const summary =
        context.locale === "he" ? `הופעל מחשבון ${input.name}` : `Calculator ${input.name} was run`;
      return { data, summary, sourceIds: [`calculator:${input.name}@v1`] };
    },
  },
  {
    name: "memory.read",
    description: "Read explicit Pip memory: goals, preferences, constraints and decisions.",
    riskTier: "memory",
    input: z.object({
      kind: z.enum(["goal", "preference", "constraint", "decision", "life-event"]).optional(),
    }),
    output: z.object({
      asOf: z.string(),
      memories: z.array(z.record(z.string(), z.unknown())),
    }),
    async run(context, input) {
      const memories = readMemory(context.workspaceId, context.profileId, input.kind);
      const data = { asOf: new Date().toISOString(), memories };
      return {
        data,
        summary:
          context.locale === "he" ? `${memories.length} זיכרונות` : `${memories.length} memories`,
      };
    },
  },
  {
    name: "memory.write",
    description: "Save one explicit memory item that the user asked Pip to remember.",
    riskTier: "memory",
    input: z.object({
      kind: z.enum(["goal", "preference", "constraint", "decision", "life-event"]),
      key: z.string().trim().min(1).max(80),
      value: z.unknown(),
      confidence: z.number().min(0).max(1).default(1),
      expiresAt: z.string().datetime().nullable().optional(),
    }),
    output: z.object({ asOf: z.string(), memory: z.record(z.string(), z.unknown()) }),
    async run(context, input) {
      const memory = addMemory({
        workspaceId: context.workspaceId,
        profileId: context.profileId,
        kind: input.kind,
        key: input.key,
        value: input.value,
        source: "user",
        confidence: input.confidence,
        expiresAt: input.expiresAt ?? null,
      });
      const data = { asOf: new Date().toISOString(), memory };
      return {
        data,
        summary: context.locale === "he" ? "נשמר בזיכרון" : "Saved to memory",
      };
    },
  },
  {
    name: "memory.delete",
    description: "Delete one explicit memory item.",
    riskTier: "memory",
    input: z.object({ id: z.number().int().positive() }),
    output: z.object({ asOf: z.string(), deleted: z.boolean() }),
    async run(context, input) {
      const deleted = deleteMemory(context.workspaceId, context.profileId, input.id);
      return {
        data: { asOf: new Date().toISOString(), deleted },
        summary: context.locale === "he" ? "הזיכרון נמחק" : "Memory deleted",
      };
    },
  },
];

export const PIP_TOOL_MAP = new Map(PIP_TOOLS.map((tool) => [tool.name, tool]));

export async function runTool(
  name: string,
  context: PipToolContext,
  input: unknown,
): Promise<PipToolResult> {
  const tool = PIP_TOOL_MAP.get(name);
  if (!tool) throw Object.assign(new Error(`Unknown tools: ${name}`), { code: "unknown_tool" });
  const parsed = tool.input.safeParse(input);
  if (!parsed.success) {
    throw Object.assign(new Error("Invalid tool arguments"), {
      code: "bad_tool_arguments",
      details: parsed.error.issues.map((issue) => issue.message),
    });
  }
  const result = await tool.run(context, parsed.data);
  const output = tool.output.safeParse(result.data);
  if (!output.success) {
    throw Object.assign(new Error("Tool output failed its schema"), {
      code: "bad_tool_output",
    });
  }
  const evidence = evidenceOf(name, result.data, result.summary, result.sourceIds);
  return {
    tool: name,
    riskTier: tool.riskTier,
    asOf: (result.data as { asOf?: string }).asOf ?? new Date().toISOString(),
    evidence,
    summary: result.summary,
    data: result.data,
  };
}

export function availableToolNames(): string[] {
  return PIP_TOOLS.map((tool) => tool.name);
}
