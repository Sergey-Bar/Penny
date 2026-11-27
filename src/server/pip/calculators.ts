import "server-only";

import { z } from "zod";
import { netSalary } from "@/lib/net-salary";
import { loan, growth, savingsGoal } from "@/lib/calculators";
import { debtPayoff } from "@/lib/plan";
import { fiNumber, yearsToTarget } from "@/lib/fi";
import { IL } from "@/lib/il-defaults";
import { money, percent } from "./facts";
import type { PipLocale } from "@/lib/pip";

const amount = z.number().finite().min(0).max(1_000_000_000);
const years = z.number().finite().min(0).max(60);

export const calculatorInputSchema = z.discriminatedUnion("name", [
  z.object({
    name: z.literal("gross_net"),
    gross: amount.positive(),
    sex: z.enum(["man", "woman"]).default("man"),
    extraPoints: z.number().finite().min(0).max(20).default(0),
    pensionRate: z.number().finite().min(0).max(0.2).default(0.06),
    studyFundRate: z.number().finite().min(0).max(0.1).default(0.025),
  }),
  z.object({
    name: z.literal("emergency_fund"),
    monthlyExpenses: amount.positive(),
    months: z.number().finite().min(1).max(36).default(6),
    currentSaved: amount.default(0),
  }),
  z.object({
    name: z.literal("compound"),
    initial: amount.default(0),
    monthly: amount.default(0),
    years: years.max(60),
    annualReturnPct: z.number().finite().min(-20).max(30).default(6),
  }),
  z.object({
    name: z.literal("loan_payoff"),
    amount: amount.positive(),
    annualRatePct: z.number().finite().min(0).max(50),
    years: years.min(0.25).max(40),
    extraMonthly: amount.default(0),
  }),
  z.object({
    name: z.literal("mortgage_payment"),
    amount: amount.positive(),
    annualRatePct: z.number().finite().min(0).max(30),
    years: years.min(1).max(40),
  }),
  z.object({
    name: z.literal("retirement_gap"),
    monthlySpend: amount.positive(),
    currentSavings: amount.default(0),
    monthlySaving: amount.default(0),
    annualReturnPct: z.number().finite().min(-10).max(20).default(5),
    withdrawalRatePct: z.number().finite().min(1).max(10).default(4),
  }),
  z.object({
    name: z.literal("savings_goal"),
    target: amount.positive(),
    saved: amount.default(0),
    months: z.number().finite().min(1).max(600),
    annualReturnPct: z.number().finite().min(-10).max(20).default(4),
  }),
]);

export type CalculatorInput = z.infer<typeof calculatorInputSchema>;

export interface CalculatorOutput {
  name: CalculatorInput["name"];
  formulaVersion: number;
  taxYear: number | null;
  assumptions: string[];
  inputs: Record<string, number | string>;
  outputs: Record<string, { value: number; formatted: string }>;
  notes: string[];
}

const pct = (value: number) => ({ value, formatted: percent(value, 1) });

export function runCalculator(input: CalculatorInput, locale: PipLocale): CalculatorOutput {
  const cash = (value: number) => {
    const result = money(value, locale);
    return { value: result.amount, formatted: result.formatted };
  };
  switch (input.name) {
    case "gross_net": {
      const result = netSalary(input);
      return {
        name: input.name,
        formulaVersion: 1,
        taxYear: IL.year,
        assumptions: [
          locale === "he" ? "תושב ישראל, שכיר, חודשי" : "Israeli resident, salaried, monthly",
          locale === "he"
            ? "ללא הטבות שווי, נקודות מיוחדות או מס יסף"
            : "No benefits in kind, special credits or surtax",
        ],
        inputs: {
          gross: input.gross,
          sex: input.sex,
          extraPoints: input.extraPoints,
          pensionRate: input.pensionRate,
          studyFundRate: input.studyFundRate,
        },
        outputs: {
          net: cash(result.net),
          incomeTax: cash(result.incomeTax),
          bituach: cash(result.bituach),
          pension: cash(result.pension),
          studyFund: cash(result.studyFund),
          effectiveTaxRate: pct(result.effectiveTaxRate * 100),
        },
        notes: [locale === "he" ? "הערכה בלבד, לא ייעוץ מס" : "Estimate only, not tax advice"],
      };
    }
    case "emergency_fund": {
      const target = input.monthlyExpenses * input.months;
      const gap = Math.max(0, target - input.currentSaved);
      return {
        name: input.name,
        formulaVersion: 1,
        taxYear: null,
        assumptions: [
          locale === "he"
            ? "קרן חירום לפי חודשי הוצאה"
            : "Emergency fund measured in months of expenses",
        ],
        inputs: {
          monthlyExpenses: input.monthlyExpenses,
          months: input.months,
          currentSaved: input.currentSaved,
        },
        outputs: {
          target: cash(target),
          gap: cash(gap),
          fundedRatio: pct(
            input.currentSaved > 0 ? Math.min(1, input.currentSaved / target) * 100 : 0,
          ),
        },
        notes: [],
      };
    }
    case "compound": {
      const result = growth(input.initial, input.monthly, input.years, input.annualReturnPct / 100);
      return {
        name: input.name,
        formulaVersion: 1,
        taxYear: null,
        assumptions: [
          locale === "he"
            ? "תשואה שנתית קבועה, ריבית דריבית חודשית"
            : "Constant annual return, monthly compounding",
          locale === "he" ? "ללא מס, דמי ניהול או עמלות" : "No tax, management fees or commissions",
        ],
        inputs: {
          initial: input.initial,
          monthly: input.monthly,
          years: input.years,
          annualReturnPct: input.annualReturnPct,
        },
        outputs: {
          balance: cash(result.balance),
          deposited: cash(result.deposited),
          earned: cash(result.earned),
        },
        notes: [],
      };
    }
    case "loan_payoff": {
      const base = loan({ amount: input.amount, ratePct: input.annualRatePct, years: input.years });
      const payment = base.monthly + input.extraMonthly;
      const payoff = debtPayoff(input.amount, input.annualRatePct, payment) ?? {
        months: 0,
        interest: 0,
      };
      return {
        name: input.name,
        formulaVersion: 1,
        taxYear: null,
        assumptions: [
          locale === "he"
            ? "הלוואה בריבית קבועה, תשלום חודשי קבוע"
            : "Fixed-rate loan with a fixed monthly payment",
        ],
        inputs: {
          amount: input.amount,
          annualRatePct: input.annualRatePct,
          years: input.years,
          extraMonthly: input.extraMonthly,
        },
        outputs: {
          monthly: cash(base.monthly),
          total: cash(base.total),
          interest: cash(base.interest),
          extraMonthly: cash(input.extraMonthly),
          monthsToPayoff: { value: payoff.months, formatted: `${payoff.months}` },
          interestWithExtra: cash(payoff.interest),
        },
        notes:
          input.extraMonthly > 0
            ? [
                locale === "he"
                  ? "התשלום החודשי כולל את התוספת"
                  : "Monthly payment includes the extra amount",
              ]
            : [],
      };
    }
    case "mortgage_payment": {
      const result = loan({
        amount: input.amount,
        ratePct: input.annualRatePct,
        years: input.years,
      });
      return {
        name: input.name,
        formulaVersion: 1,
        taxYear: null,
        assumptions: [
          locale === "he"
            ? "מסלול בודד, ריבית קבועה, ללא הצמדה"
            : "Single track, fixed rate, no indexation",
        ],
        inputs: {
          amount: input.amount,
          annualRatePct: input.annualRatePct,
          years: input.years,
        },
        outputs: {
          monthly: cash(result.monthly),
          total: cash(result.total),
          interest: cash(result.interest),
        },
        notes: [
          locale === "he"
            ? "הערכה בלבד, לא הצעה או ייעוץ"
            : "Estimate only, not an offer or advice",
        ],
      };
    }
    case "retirement_gap": {
      const target = fiNumber(input.monthlySpend * 12, input.withdrawalRatePct / 100);
      const gap = Math.max(0, target - input.currentSavings);
      const eta = yearsToTarget(
        input.currentSavings,
        input.monthlySaving,
        input.annualReturnPct / 100,
        target,
      );
      return {
        name: input.name,
        formulaVersion: 1,
        taxYear: null,
        assumptions: [
          locale === "he" ? "כלל המשיכה הבטוחה כפי שהוזן" : "Withdrawal rate as entered",
          locale === "he" ? "תשואה ריאלית קבועה" : "Constant real return",
        ],
        inputs: {
          monthlySpend: input.monthlySpend,
          currentSavings: input.currentSavings,
          monthlySaving: input.monthlySaving,
          annualReturnPct: input.annualReturnPct,
          withdrawalRatePct: input.withdrawalRatePct,
        },
        outputs: {
          target: cash(target),
          gap: cash(gap),
          yearsToTarget:
            eta == null
              ? {
                  value: -1,
                  formatted: locale === "he" ? "לא בטווח 100 שנה" : "Not within 100 years",
                }
              : { value: eta, formatted: `${Math.round(eta * 10) / 10}` },
        },
        notes: [
          locale === "he" ? "הערכה בלבד, לא ייעוץ פנסיוני" : "Estimate only, not pension advice",
        ],
      };
    }
    case "savings_goal": {
      const monthly = savingsGoal(input.target, input.saved, input.months, input.annualReturnPct);
      return {
        name: input.name,
        formulaVersion: 1,
        taxYear: null,
        assumptions: [
          locale === "he" ? "הפקדה חודשית קבועה" : "Fixed monthly deposit",
          locale === "he" ? "תשואה שנתית קבועה" : "Constant annual return",
        ],
        inputs: {
          target: input.target,
          saved: input.saved,
          months: input.months,
          annualReturnPct: input.annualReturnPct,
        },
        outputs: { monthly: cash(monthly) },
        notes: [],
      };
    }
  }
}
