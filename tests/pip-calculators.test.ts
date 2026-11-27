import { describe, expect, it } from "vitest";
import { calculatorInputSchema, runCalculator } from "@/server/pip/calculators";
import { growth, loan, savingsGoal } from "@/lib/calculators";
import { netSalary } from "@/lib/net-salary";
import { fiNumber, yearsToTarget } from "@/lib/fi";

describe("Pip calculators", () => {
  it("gross to net uses the reviewed Israeli tax parameters", () => {
    const result = runCalculator(
      {
        name: "gross_net",
        gross: 20_000,
        sex: "man",
        extraPoints: 0,
        pensionRate: 0.06,
        studyFundRate: 0.025,
      },
      "en",
    );
    const expected = netSalary({
      gross: 20_000,
      sex: "man",
      extraPoints: 0,
      pensionRate: 0.06,
      studyFundRate: 0.025,
    });
    expect(result.outputs.net.value).toBeCloseTo(expected.net, 2);
    expect(result.outputs.incomeTax.value).toBeCloseTo(expected.incomeTax, 2);
    expect(result.taxYear).toBe(2026);
  });

  it("builds an emergency fund target and gap", () => {
    const result = runCalculator(
      { name: "emergency_fund", monthlyExpenses: 12_000, months: 6, currentSaved: 20_000 },
      "he",
    );
    expect(result.outputs.target.value).toBe(72_000);
    expect(result.outputs.gap.value).toBe(52_000);
  });

  it("compound growth matches the shared calculator", () => {
    const result = runCalculator(
      { name: "compound", initial: 10_000, monthly: 2_000, years: 10, annualReturnPct: 6 },
      "en",
    );
    const expected = growth(10_000, 2_000, 10, 0.06);
    expect(result.outputs.balance.value).toBeCloseTo(expected.balance, 2);
    expect(result.outputs.earned.value).toBeCloseTo(expected.earned, 2);
  });

  it("loan payoff reports the base payment and the extra-payment effect", () => {
    const result = runCalculator(
      { name: "loan_payoff", amount: 120_000, annualRatePct: 6, years: 5, extraMonthly: 500 },
      "en",
    );
    const expected = loan({ amount: 120_000, ratePct: 6, years: 5 });
    expect(result.outputs.monthly.value).toBeCloseTo(expected.monthly, 2);
    expect(result.outputs.extraMonthly.value).toBe(500);
    expect(result.outputs.monthsToPayoff.value).toBeGreaterThan(0);
    expect(result.outputs.interestWithExtra.value).toBeLessThan(result.outputs.interest.value);
  });

  it("mortgage payment is a single Spitzer track", () => {
    const result = runCalculator(
      { name: "mortgage_payment", amount: 1_200_000, annualRatePct: 4.5, years: 25 },
      "he",
    );
    const expected = loan({ amount: 1_200_000, ratePct: 4.5, years: 25 });
    expect(result.outputs.monthly.value).toBeCloseTo(expected.monthly, 2);
  });

  it("retirement gap uses the withdrawal rate and target helper", () => {
    const result = runCalculator(
      {
        name: "retirement_gap",
        monthlySpend: 12_000,
        currentSavings: 500_000,
        monthlySaving: 3_000,
        annualReturnPct: 5,
        withdrawalRatePct: 4,
      },
      "en",
    );
    const target = fiNumber(12_000 * 12, 0.04);
    const eta = yearsToTarget(500_000, 3_000, 0.05, target);
    expect(result.outputs.target.value).toBeCloseTo(target, 2);
    expect(result.outputs.gap.value).toBeCloseTo(target - 500_000, 2);
    expect(result.outputs.yearsToTarget.value).toBeCloseTo(eta ?? -1, 1);
  });

  it("savings goal matches the shared helper", () => {
    const result = runCalculator(
      { name: "savings_goal", target: 100_000, saved: 10_000, months: 60, annualReturnPct: 4 },
      "he",
    );
    expect(result.outputs.monthly.value).toBeCloseTo(savingsGoal(100_000, 10_000, 60, 4), 2);
  });

  it("rejects negative or unbounded inputs", () => {
    expect(calculatorInputSchema.safeParse({ name: "gross_net", gross: -1 }).success).toBe(false);
    expect(
      calculatorInputSchema.safeParse({ name: "compound", years: 100, annualReturnPct: 6 }).success,
    ).toBe(false);
    expect(calculatorInputSchema.safeParse({ name: "unknown" }).success).toBe(false);
  });
});
