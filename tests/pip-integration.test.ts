import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db";
import { runPipAgent } from "@/server/pip/agent";
import { buildBriefing } from "@/server/pip/briefing";
import { availableToolNames, runTool } from "@/server/pip/tools";
import { israelToday } from "@/server/lib/date-utils";
import {
  addFeedback,
  addMemory,
  createThread,
  deleteMemory,
  exportPipData,
  latestBriefing,
  latestFeedback,
  listMessages,
  readMemory,
  saveBriefing,
  setBriefingFeedback,
  wipePipData,
} from "@/server/pip/repository";

afterAll(() => closeDb());

describe("Pip integration", () => {
  it("answers an affordability question from real tools and stores the run", async () => {
    const thread = createThread({ workspaceId: 1, profileId: null, locale: "en", title: "Afford" });
    const events: string[] = [];
    const reply = await runPipAgent({
      workspaceId: 1,
      profileId: null,
      locale: "en",
      threadId: thread.id,
      question: "Can I afford 4000 now?",
      requestId: "test-request-1",
      history: [],
      onEvent: (event) => events.push(event.type),
    });
    expect(reply.content.length).toBeGreaterThan(20);
    expect(reply.fallback).toBe(true);
    expect(reply.evidence.map((item) => item.kind)).toEqual(
      expect.arrayContaining(["cash.toPayday", "budgets.status", "planned.list"]),
    );
    expect(events).toContain("tool");
    expect(events).toContain("done");
    const messages = listMessages(1, thread.id);
    expect(messages.map((message) => message.role)).toEqual(["assistant"]);
    expect(messages[0].toolCalls.length).toBeGreaterThan(0);
  });

  it("runs every read tool against a real database", async () => {
    const context = {
      workspaceId: 1,
      profileId: null,
      locale: "he" as const,
      today: israelToday(),
    };
    const inputs: Record<string, unknown> = {
      "knowledge.search": { query: "קרן חירום" },
      "calculator.run": { name: "emergency_fund", monthlyExpenses: 10_000, months: 6 },
      "transactions.search": { limit: 5 },
      "memory.read": {},
    };
    for (const name of availableToolNames()) {
      if (name === "memory.write" || name === "memory.delete") continue;
      await expect(runTool(name, context, inputs[name] ?? {}), name).resolves.toMatchObject({
        tool: name,
      });
    }
  });

  it("runs spending and income facts without SQL ambiguity", async () => {
    const thread = createThread({ workspaceId: 1, profileId: null, locale: "en", title: "Facts" });
    const spending = await runPipAgent({
      workspaceId: 1,
      profileId: null,
      locale: "en",
      threadId: thread.id,
      question: "Why did my spending rise?",
      requestId: "test-request-3",
      history: [],
    });
    expect(spending.evidence.map((item) => item.kind)).toContain("spending.summary");
    const income = await runPipAgent({
      workspaceId: 1,
      profileId: null,
      locale: "en",
      threadId: thread.id,
      question: "Is my income stable?",
      requestId: "test-request-4",
      history: [],
    });
    expect(income.evidence.map((item) => item.kind)).toContain("income.summary");
  });

  it("writes, reads and deletes explicit memory", () => {
    const saved = addMemory({
      workspaceId: 1,
      profileId: null,
      kind: "goal",
      key: "emergency_fund",
      value: { months: 6 },
      source: "user",
      confidence: 1,
      expiresAt: null,
    });
    expect(readMemory(1, null, "goal").some((item) => item.id === saved.id)).toBe(true);
    expect(deleteMemory(1, null, saved.id)).toBe(true);
    expect(readMemory(1, null, "goal").some((item) => item.id === saved.id)).toBe(false);
  });

  it("records feedback, builds a briefing and exports or wipes its own data", () => {
    const thread = createThread({ workspaceId: 1, profileId: null, locale: "he", title: "Brief" });
    const reply = listMessages(1, thread.id);
    expect(reply).toEqual([]);
    const briefing = buildBriefing({ workspaceId: 1, locale: "he", today: "2026-11-27" });
    expect(briefing.items.length).toBeGreaterThan(0);
    saveBriefing({ workspaceId: 1, asOf: briefing.asOf, locale: "he", briefing });
    expect(latestBriefing(1, "he")?.items[0]?.key).toBe(briefing.items[0].key);
    setBriefingFeedback({
      workspaceId: 1,
      asOf: briefing.asOf,
      locale: "he",
      feedback: "helpful",
    });
    expect(
      (
        getDb()
          .prepare(
            "SELECT feedback FROM pip_briefings WHERE workspace_id = 1 AND as_of = ? AND locale = 'he'",
          )
          .get(briefing.asOf) as { feedback: string } | undefined
      )?.feedback,
    ).toBe("helpful");
    const exported = exportPipData(1);
    expect(exported.threads.length).toBeGreaterThan(0);
    wipePipData(1);
    expect(exportPipData(1).threads).toEqual([]);
  });

  it("stores feedback against a real assistant message", async () => {
    const thread = createThread({
      workspaceId: 1,
      profileId: null,
      locale: "en",
      title: "Feedback",
    });
    const reply = await runPipAgent({
      workspaceId: 1,
      profileId: null,
      locale: "en",
      threadId: thread.id,
      question: "What is my net worth?",
      requestId: "test-request-2",
      history: [],
    });
    addFeedback({
      workspaceId: 1,
      threadId: thread.id,
      messageId: reply.messageId,
      helpful: true,
    });
    expect(latestFeedback(1, reply.messageId)).toBe(true);
  });
});
