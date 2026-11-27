import { describe, expect, it } from "vitest";
import { allowedNumbersFrom, verifyNumbers } from "@/server/pip/verifier";
import type { PipToolResult } from "@/lib/pip";

const result: PipToolResult = {
  tool: "spending.summary",
  riskTier: "read",
  asOf: "2026-11-27T00:00:00.000Z",
  summary: "In 2026-11, spending was ₪1,235 and income was ₪12,000",
  evidence: { id: "ev:test", kind: "spending.summary", label: "spending" },
  data: {
    period: { label: "2026-11" },
    spent: { amount: 1234.56, minor: 123456, currency: "ILS", formatted: "₪1,235" },
    income: { amount: 12_000, minor: 1_200_000, currency: "ILS", formatted: "₪12,000" },
    categories: [{ name: "Food", amount: { amount: 800, formatted: "₪800" } }],
    share: 0.35,
  },
};

describe("Pip numeric verifier", () => {
  it("accepts numbers that come from tool results, including formatted money", () => {
    expect(allowedNumbersFrom([result]).has(1235)).toBe(true);
    expect(allowedNumbersFrom([result]).has(35)).toBe(true);
    expect(verifyNumbers("You spent ₪1,235 and earned ₪12,000.", [result]).ok).toBe(true);
    expect(verifyNumbers("Food was ₪800, about 35% of spending.", [result]).ok).toBe(true);
  });

  it("accepts a small rounding difference but rejects an invented amount", () => {
    expect(verifyNumbers("Spending was about ₪1,234.56.", [result]).ok).toBe(true);
    expect(verifyNumbers("You spent ₪9,999.", [result]).ok).toBe(false);
    expect(verifyNumbers("You spent ₪9,999.", [result]).unsupported).toContain(9999);
  });

  it("does not treat a year or a date as an unsupported number", () => {
    expect(verifyNumbers("In 2026, on 2026-11-27, you spent ₪1,235.", [result]).ok).toBe(true);
  });

  it("rejects an invented percentage", () => {
    expect(verifyNumbers("You spent ₪1,235, up 84%.", [result]).ok).toBe(false);
  });
});
