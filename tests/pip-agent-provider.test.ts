import { afterAll, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/server/db";
import { setGlobalSetting } from "@/server/db/queries/settings";
import { createThread } from "@/server/pip/repository";

const { completeAI } = vi.hoisted(() => ({ completeAI: vi.fn() }));

vi.mock("@/server/ai/ask", () => ({ completeAI }));

import { runPipAgent } from "@/server/pip/agent";

afterAll(() => {
  setGlobalSetting("ai_provider", "none");
  closeDb();
});

describe("Pip provider gate", () => {
  it("rejects an answer with an invented amount and falls back", async () => {
    setGlobalSetting("ai_provider", "ollama");
    completeAI.mockResolvedValueOnce("You spent ₪9,999 on everything.");
    const thread = createThread({
      workspaceId: 1,
      profileId: null,
      locale: "en",
      title: "Provider",
    });
    const reply = await runPipAgent({
      workspaceId: 1,
      profileId: null,
      locale: "en",
      threadId: thread.id,
      question: "Why did my spending rise?",
      requestId: "provider-bad",
      history: [],
    });
    expect(reply.fallback).toBe(true);
    expect(reply.content).not.toContain("9,999");
    expect(reply.provider).toBeNull();
  });

  it("uses a verified provider answer and records the provider", async () => {
    setGlobalSetting("ai_provider", "ollama");
    completeAI.mockResolvedValueOnce("Your spending is ₪0 for the period.");
    const thread = createThread({
      workspaceId: 1,
      profileId: null,
      locale: "en",
      title: "Provider ok",
    });
    const reply = await runPipAgent({
      workspaceId: 1,
      profileId: null,
      locale: "en",
      threadId: thread.id,
      question: "Why did my spending rise?",
      requestId: "provider-ok",
      history: [],
    });
    expect(reply.fallback).toBe(false);
    expect(reply.provider).toBe("ollama");
    expect(reply.content).toContain("₪0");
  });
});
