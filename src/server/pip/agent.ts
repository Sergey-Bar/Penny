import "server-only";

import { completeAI } from "@/server/ai/ask";
import { getGlobalSetting } from "@/server/db/queries/settings";
import { logError, logEvent } from "@/server/lib/log";
import { israelToday } from "@/server/lib/date-utils";
import { recordMetric } from "@/server/observability/metrics";
import { hasConsent } from "./repository";
import { pipProviderName } from "@/server/lib/pip-mode";
import { categoriesFact, type CategoriesFact } from "./facts";
import { planTools } from "./planner";
import { runTool } from "./tools";
import { buildDeterministicAnswer } from "./answers";
import { verifyNumbers } from "./verifier";
import { addAgentRun, addMessage, addToolCall, attachToolCalls } from "./repository";
import type { PipEvidence, PipLocale, PipReply, PipStreamEvent, PipToolResult } from "@/lib/pip";

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface PipAgentInput {
  workspaceId: number;
  profileId: number | null;
  locale: PipLocale;
  threadId: number;
  question: string;
  requestId: string;
  history: HistoryMessage[];
  signal?: AbortSignal;
  onEvent?: (event: PipStreamEvent) => void;
}

function modelName(provider: string | null): string | null {
  if (provider === "ollama") return getGlobalSetting("ai_ollama_model") ?? "llama3.1";
  if (provider === "claude") return "claude-haiku-4-5-20251001";
  return provider;
}

function usageOf(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function minimize(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return value.length > 240 ? `${value.slice(0, 240)}â€¦` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 8).map(minimize);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(
          ([key]) =>
            !/^(id|address|account|sourceIds|arguments|description|errorMessage)$/i.test(key),
        )
        .map(([key, item]) => [key, minimize(item)]),
    );
  }
  return null;
}

function providerFacts(results: PipToolResult[]): string {
  return JSON.stringify(
    results.map((result) => ({
      tool: result.tool,
      summary: result.summary,
      facts: minimize(result.data),
    })),
  ).slice(0, 12_000);
}

function canUseProvider(workspaceId: number): boolean {
  const provider = pipProviderName();
  if (!provider) return false;
  if (provider === "ollama") return true;
  return hasConsent(workspaceId, provider);
}

function providerAnswer(input: PipAgentInput, results: PipToolResult[]): Promise<string | null> {
  const provider = pipProviderName();
  if (!provider) return Promise.resolve(null);
  const system =
    input.locale === "he"
      ? "××ª×” Pip, ×”×¢×•×–×¨ ×”×¤×™× × ×¡×™ ×©×œ ×”×ž×©×§ ×‘×™×ª. ×”×©×ª×ž×© ×¨×§ ×‘×¢×•×‘×“×•×ª ×©×¡×•×¤×§×•. ××œ ×ª×ž×¦×™× ×ž×¡×¤×¨×™×, ×ª×©×•××•×ª, ×ž×¡×™× ××• ×”×ž×œ×¦×•×ª. ×¢× ×” ×‘×¢×‘×¨×™×ª, ×‘×©×ª×™×™× ×¢×“ ×©×œ×•×© ×ž×©×¤×˜×™× ×§×¦×¨×™× ×•×¨×’×•×¢×™×. ×× ×”×¢×•×‘×“×•×ª ×œ× ×ž×¡×¤×™×§×•×ª, ××ž×•×¨ ×–××ª ×‘×¤×©×˜×•×ª. ××œ ×ª×™×ª×Ÿ ×™×™×¢×•×¥ ×”×©×§×¢×•×ª, ×ž×¡ ××• ×‘×™×˜×•×—."
      : "You are Pip, the household finance assistant. Use only the supplied facts. Never invent numbers, returns, tax rules or recommendations. Answer in English, in two or three short, calm sentences. If the facts are insufficient, say so plainly. Do not give investment, tax or insurance advice.";
  const user = `${input.locale === "he" ? "×©××œ×”" : "Question"}: ${input.question}\n${input.locale === "he" ? "×¢×•×‘×“×•×ª" : "Facts"}: ${providerFacts(results)}`;
  return completeAI(system, user, 500).catch((error) => {
    logError("pip/provider", error, { provider });
    return null;
  });
}

function emitText(input: PipAgentInput, text: string): void {
  const chunks = text.match(/.{1,80}(?:\s|$)/gu) ?? [text];
  for (const chunk of chunks) input.onEvent?.({ type: "token", text: chunk });
}

export async function runPipAgent(input: PipAgentInput): Promise<PipReply> {
  const started = Date.now();
  const provider = pipProviderName();
  const model = modelName(provider);
  const categoryNames = (categoriesFact(input.workspaceId) as CategoriesFact).categories.map(
    (category) => category.name,
  );
  const plans = planTools({
    workspaceId: input.workspaceId,
    question: input.question,
    locale: input.locale,
    today: israelToday(),
    history: input.history,
    categoryNames,
  });
  const results: PipToolResult[] = [];
  const toolCallIds: number[] = [];
  const toolViews: PipReply["toolCalls"] = [];
  for (const plan of plans) {
    if (input.signal?.aborted) break;
    const toolStarted = Date.now();
    try {
      const result = await runTool(
        plan.name,
        {
          workspaceId: input.workspaceId,
          profileId: input.profileId,
          locale: input.locale,
          today: israelToday(),
        },
        plan.args,
      );
      results.push(result);
      const id = addToolCall({
        workspaceId: input.workspaceId,
        threadId: input.threadId,
        tool: result.tool,
        riskTier: result.riskTier,
        arguments: plan.args,
        result: result.data,
        evidenceId: result.evidence.id,
        status: "ok",
        durationMs: Date.now() - toolStarted,
      });
      toolCallIds.push(id);
      toolViews.push({
        id,
        tool: result.tool,
        riskTier: result.riskTier,
        status: "ok",
        evidenceId: result.evidence.id,
        durationMs: Date.now() - toolStarted,
        arguments: plan.args,
      });
      input.onEvent?.({
        type: "tool",
        tool: result.tool,
        summary: result.summary,
        evidence: result.evidence,
      });
      recordMetric("pip_tool_calls_total", { tool: result.tool, status: "ok" });
    } catch (error) {
      const code =
        (error as { code?: unknown } | null)?.code &&
        typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : "tool_error";
      const id = addToolCall({
        workspaceId: input.workspaceId,
        threadId: input.threadId,
        tool: plan.name,
        riskTier: "read",
        arguments: plan.args,
        status: "error",
        durationMs: Date.now() - toolStarted,
        errorCode: code,
      });
      toolCallIds.push(id);
      toolViews.push({
        id,
        tool: plan.name,
        riskTier: "read",
        status: "error",
        evidenceId: null,
        durationMs: Date.now() - toolStarted,
        arguments: plan.args,
      });
      recordMetric("pip_tool_calls_total", { tool: plan.name, status: "error" });
      logEvent("pip.tool_failed", { tool: plan.name, code });
    }
  }
  const deterministic = buildDeterministicAnswer({ locale: input.locale, results });
  let answer = deterministic;
  let usedProvider = false;
  if (canUseProvider(input.workspaceId) && results.length > 0 && !input.signal?.aborted) {
    const candidate = await providerAnswer(input, results);
    if (candidate) {
      const verification = verifyNumbers(candidate, results);
      if (verification.ok) {
        answer = candidate;
        usedProvider = true;
      } else {
        logEvent("pip.verifier_rejected", {
          provider: provider ?? "unknown",
          unsupported: verification.unsupported.join(","),
        });
      }
    }
  }
  const evidence: PipEvidence[] = results.map((result) => result.evidence);
  const message = addMessage({
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    role: "assistant",
    content: answer,
    evidence,
    status: "complete",
    requestId: input.requestId,
    provider: usedProvider ? provider : null,
    model: usedProvider ? model : null,
    promptTokens: usedProvider ? usageOf(input.question + providerFacts(results)) : 0,
    completionTokens: usedProvider ? usageOf(answer) : 0,
    costMicros: 0,
  });
  attachToolCalls(message.id, toolCallIds);
  const finalViews = toolViews.map((view) => ({ ...view }));
  addAgentRun({
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    requestId: input.requestId,
    provider: usedProvider ? provider : null,
    model: usedProvider ? model : null,
    status: usedProvider ? "ok" : results.length ? "fallback" : "failed",
    steps: plans.length,
    toolCallCount: results.length,
    promptTokens: usedProvider ? usageOf(input.question + providerFacts(results)) : 0,
    completionTokens: usedProvider ? usageOf(answer) : 0,
    costMicros: 0,
    latencyMs: Date.now() - started,
    errorCode: results.length ? null : "no_tools_succeeded",
  });
  recordMetric("pip_agent_runs_total", {
    status: usedProvider ? "ok" : results.length ? "fallback" : "failed",
    provider: provider ?? "none",
  });
  recordMetric("pip_agent_latency_ms", { provider: provider ?? "none" }, 1, Date.now() - started);
  input.onEvent?.({ type: "evidence", evidence });
  emitText(input, answer);
  const reply: PipReply = {
    threadId: input.threadId,
    messageId: message.id,
    content: answer,
    evidence,
    toolCalls: finalViews,
    provider: usedProvider ? provider : null,
    model: usedProvider ? model : null,
    fallback: !usedProvider,
    usage: {
      promptTokens: usedProvider ? usageOf(input.question + providerFacts(results)) : 0,
      completionTokens: usedProvider ? usageOf(answer) : 0,
      costMicros: 0,
    },
  };
  input.onEvent?.({ type: "done", reply });
  return reply;
}
