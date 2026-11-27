import { describe, expect, it } from "vitest";
import { KNOWLEDGE_VERSION, knowledgeCitation, searchKnowledge } from "@/server/pip/knowledge";
import { availableToolNames, runTool } from "@/server/pip/tools";
import { PIP_READ_TOOLS } from "@/lib/pip";

const context = {
  workspaceId: 1,
  profileId: null,
  locale: "en" as const,
  today: "2026-11-27",
};

describe("Pip knowledge and tools", () => {
  it("searches the seed in English and Hebrew", () => {
    expect(searchKnowledge("emergency fund", "en")[0]?.id).toBe("emergency-fund");
    expect(searchKnowledge("פנסיה דמי ניהול", "he")[0]?.id).toBe("pension-fees");
    expect(searchKnowledge("מילואים", "he")[0]?.id).toBe("reservist-rights");
  });

  it("versions and cites knowledge entries", () => {
    const entry = searchKnowledge("emergency fund", "en")[0];
    expect(knowledgeCitation(entry)).toMatch(
      new RegExp(`^knowledge:emergency-fund@v${KNOWLEDGE_VERSION}@\\d{4}-\\d{2}-\\d{2}$`),
    );
  });

  it("runs read-only knowledge and calculator tools without a database", async () => {
    const knowledge = await runTool("knowledge.search", context, {
      query: "emergency fund",
      limit: 2,
    });
    expect(knowledge.tool).toBe("knowledge.search");
    expect(knowledge.evidence.id).toMatch(/^ev:knowledge\.search:/);
    expect(knowledge.summary).toContain("2 knowledge sources");

    const calculator = await runTool("calculator.run", context, {
      name: "emergency_fund",
      monthlyExpenses: 10_000,
      months: 6,
    });
    expect(calculator.data).toMatchObject({
      name: "emergency_fund",
      outputs: { target: { value: 60_000 } },
    });
  });

  it("rejects unknown tools and invalid arguments", async () => {
    await expect(runTool("unknown.tool", context, {})).rejects.toMatchObject({
      code: "unknown_tool",
    });
    await expect(
      runTool("calculator.run", context, { name: "gross_net", gross: -5 }),
    ).rejects.toMatchObject({ code: "bad_tool_arguments" });
  });

  it("exposes only the Phase 1 read and memory tools", () => {
    const names = availableToolNames();
    expect(names).toContain("cash.toPayday");
    expect(names).toContain("memory.write");
    expect(names).not.toContain("transactions.update");
    for (const name of names) {
      expect([...PIP_READ_TOOLS, "memory.write", "memory.delete"]).toContain(name);
    }
    expect(names).not.toContain("sync.run");
  });
});
