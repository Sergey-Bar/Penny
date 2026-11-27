export type PipMode = "off" | "on";

export function parsePipMode(value: unknown): PipMode | null {
  return value === "off" || value === "on" ? value : null;
}

export type PipLocale = "he" | "en";
export type PipRiskTier = "read" | "memory" | "local-write" | "destructive" | "external";
export type PipRole = "user" | "assistant";

export interface PipMoney {
  amount: number;
  minor: number;
  currency: "ILS";
  formatted: string;
}

export interface PipEvidence {
  id: string;
  kind: string;
  label: string;
  value?: string;
  sourceIds?: string[];
  asOf?: string;
}

export interface PipToolResult<T = unknown> {
  tool: string;
  riskTier: PipRiskTier;
  asOf: string;
  evidence: PipEvidence;
  summary: string;
  data: T;
}

export interface PipToolCallView {
  id: number;
  tool: string;
  riskTier: PipRiskTier;
  status: "ok" | "error" | "blocked";
  evidenceId: string | null;
  durationMs: number;
  arguments: Record<string, unknown>;
}

export interface PipMessage {
  id: number;
  threadId: number;
  role: PipRole;
  content: string;
  evidence: PipEvidence[];
  toolCalls: PipToolCallView[];
  createdAt: string;
}

export interface PipThread {
  id: number;
  title: string;
  locale: PipLocale;
  autonomyLevel: number;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

export interface PipConsent {
  provider: string;
  scopes: string[];
  granted: boolean;
  updatedAt: string;
}

export interface PipBriefingItem {
  key: string;
  tone: "act" | "watch" | "good";
  title: string;
  body: string;
  evidence: PipEvidence[];
  action?: { href: string; label: string };
}

export interface PipBriefing {
  asOf: string;
  generatedAt: string;
  items: PipBriefingItem[];
}

export interface PipReply {
  threadId: number;
  messageId: number;
  content: string;
  evidence: PipEvidence[];
  toolCalls: PipToolCallView[];
  provider: string | null;
  model: string | null;
  fallback: boolean;
  usage: { promptTokens: number; completionTokens: number; costMicros: number };
}

export type PipStreamEvent =
  | { type: "meta"; threadId: number; requestId: string; fallback: boolean }
  | { type: "tool"; tool: string; summary: string; evidence: PipEvidence }
  | { type: "evidence"; evidence: PipEvidence[] }
  | { type: "token"; text: string }
  | { type: "done"; reply: PipReply }
  | { type: "error"; code: string; message: string };

export const PIP_PROVIDER_SCOPES = [
  "minimized_facts",
  "tool_results",
  "conversation_summary",
] as const;

export const PIP_READ_TOOLS = [
  "accounts.list",
  "transactions.search",
  "spending.summary",
  "income.summary",
  "budgets.status",
  "cash.toPayday",
  "forecast.balance",
  "goals.list",
  "recurring.list",
  "fees.summary",
  "netWorth.summary",
  "pension.summary",
  "insurance.summary",
  "planned.list",
  "insights.summary",
  "sync.status",
  "categories.list",
  "rules.list",
  "knowledge.search",
  "calculator.run",
  "memory.read",
] as const;

export const PIP_WRITE_TOOLS = ["memory.write", "memory.delete"] as const;
