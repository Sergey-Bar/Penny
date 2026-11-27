import { describe, expect, it } from "vitest";
import { buildDeterministicAnswer } from "@/server/pip/answers";
import { briefingText } from "@/server/pip/briefing";
import type { PipBriefing, PipToolResult } from "@/lib/pip";

const spending: PipToolResult = {
  tool: "spending.summary",
  riskTier: "read",
  asOf: "2026-11-27T00:00:00.000Z",
  summary: "In 2026-11, spending was ₪1,235 and income was ₪12,000",
  evidence: { id: "ev:spending", kind: "spending.summary", label: "spending" },
  data: {
    period: { label: "2026-11" },
    spent: { amount: 1234.56, formatted: "₪1,235" },
    income: { amount: 12_000, formatted: "₪12,000" },
    categories: [{ name: "Food", amount: { formatted: "₪800" } }],
    merchants: [{ merchant: "Wolt", amount: { formatted: "₪300" } }],
    previous: { spent: { amount: 1000, formatted: "₪1,000" } },
  },
};

describe("Pip deterministic answers", () => {
  it("uses only the tool facts and compares to the previous period", () => {
    const answer = buildDeterministicAnswer({ locale: "en", results: [spending] });
    expect(answer).toContain("₪1,235");
    expect(answer).toContain("23%");
    expect(answer).toContain("Food");
    expect(answer).toContain("Wolt");
  });

  it("answers in Hebrew without inventing a provider", () => {
    const answer = buildDeterministicAnswer({ locale: "he", results: [spending] });
    expect(answer).toContain("₪1,235");
    expect(answer).toContain("הקטגוריות הגדולות");
  });

  it("names the scope when the question was about one category", () => {
    const scoped = {
      ...spending,
      data: {
        ...(spending.data as Record<string, unknown>),
        scope: "Groceries",
        income: { amount: 0, formatted: "₪0" },
      },
    } as PipToolResult;
    const answer = buildDeterministicAnswer({ locale: "en", results: [scoped] });
    expect(answer).toContain("On Groceries");
    expect(answer).not.toContain("income was");
  });

  it("falls back to a clear message when no tool succeeded", () => {
    const answer = buildDeterministicAnswer({ locale: "en", results: [] });
    expect(answer).toContain("more specific");
  });
});

describe("Pip briefing text", () => {
  it("turns the top three items into a short message", () => {
    const briefing: PipBriefing = {
      asOf: "2026-11-27",
      generatedAt: "2026-11-27T08:00:00.000Z",
      items: [
        {
          key: "cash",
          tone: "act",
          title: "Available cash is negative",
          body: "By 2026-11-30 there is a ₪300 shortfall.",
          evidence: [],
        },
        {
          key: "budget",
          tone: "watch",
          title: "Spending pace is high",
          body: "80% of the budget is used.",
          evidence: [],
        },
      ],
    };
    const text = briefingText(briefing, "en");
    expect(text).toContain("Pip's daily briefing");
    expect(text).toContain("Available cash is negative");
    expect(text).toContain("Spending pace is high");
  });
});
