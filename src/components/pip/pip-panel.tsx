"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  BookOpen,
  Eye,
  History,
  Lightbulb,
  Loader2,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchJSON } from "@/lib/api";
import { getActiveProfileIdSync, getActiveWorkspaceIdSync } from "@/lib/workspace-store";
import type {
  PipConsent,
  PipEvidence,
  PipMessage,
  PipStreamEvent,
  PipThread,
  PipToolCallView,
} from "@/lib/pip";
import { cn } from "@/lib/utils";

interface PipStatus {
  enabled: boolean;
  mode: "off" | "on";
  killSwitch: boolean;
  provider: string | null;
  model: string | null;
  consent: PipConsent[];
  scopes: string[];
}

interface BriefingItem {
  key: string;
  tone: "act" | "watch" | "good";
  title: string;
  body: string;
  action?: { href: string; label: string };
}

interface Briefing {
  asOf: string;
  items: BriefingItem[];
}

interface WhatSees {
  tools: {
    name: string;
    description: string;
    riskTier: string;
    arguments: Record<string, unknown>;
  }[];
  provider: string | null;
  willSendFacts: boolean;
  sendsRawRows: boolean;
}

interface MemoryItem {
  id: number;
  kind: string;
  key: string;
  value: unknown;
  updatedAt: string;
}

interface UiMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  evidence: PipEvidence[];
  toolCalls: PipToolCallView[];
  fallback?: boolean;
}

interface StreamState {
  content: string;
  evidence: PipEvidence[];
  toolCalls: PipToolCallView[];
  tools: string[];
}

function headersFor(): Headers {
  const headers = new Headers({ "Content-Type": "application/json" });
  const workspaceId = getActiveWorkspaceIdSync();
  if (workspaceId != null) headers.set("x-workspace-id", String(workspaceId));
  const profileId = getActiveProfileIdSync();
  if (profileId != null) headers.set("x-profile-id", String(profileId));
  headers.set("idempotency-key", crypto.randomUUID());
  return headers;
}

function toneClass(tone: BriefingItem["tone"]): string {
  if (tone === "act") return "border-destructive/40 bg-destructive/5";
  if (tone === "watch") return "border-status-heads-up/40 bg-status-heads-up/10";
  return "border-border bg-muted/40";
}

export function PipPanel({ onClose, page = false }: { onClose?: () => void; page?: boolean }) {
  const t = useTranslations("pip");
  const locale = useLocale() === "en" ? "en" : "he";
  const [status, setStatus] = useState<PipStatus | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [briefingFeedback, setBriefingFeedback] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [stream, setStream] = useState<StreamState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [whatSees, setWhatSees] = useState<WhatSees | null>(null);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [feedback, setFeedback] = useState<Record<number, boolean>>({});
  const [threads, setThreads] = useState<PipThread[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchJSON<PipStatus>("/api/pip/status")
      .then((value) => {
        if (!cancelled) setStatus(value);
      })
      .catch(() => {
        if (!cancelled)
          setStatus({
            enabled: false,
            mode: "off",
            killSwitch: false,
            provider: null,
            model: null,
            consent: [],
            scopes: [],
          });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!status?.enabled) return;
    let cancelled = false;
    fetchJSON<Briefing>(`/api/pip/briefing?locale=${locale}`)
      .then((value) => {
        if (!cancelled) setBriefing(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status?.enabled, locale]);

  useEffect(() => {
    if (!status?.enabled) return;
    let cancelled = false;
    fetchJSON<{ memory: MemoryItem[] }>("/api/pip/memory")
      .then((value) => {
        if (!cancelled) setMemories(value.memory);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status?.enabled]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [status?.enabled]);

  const providerConsent = status?.provider
    ? status.consent.find((entry) => entry.provider === status.provider)
    : undefined;
  const needsConsent = !!status?.provider && status.provider !== "ollama" && !providerConsent;

  async function setProviderConsent(granted: boolean) {
    if (!status?.provider) return;
    try {
      const result = await fetchJSON<{ consent: PipConsent[] }>("/api/pip/consent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: status.provider,
          scopes: status.scopes,
          granted,
        }),
      });
      setStatus({ ...status, consent: result.consent });
    } catch {
      setError(t("requestFailed"));
    }
  }

  function newThread() {
    setThreadId(null);
    setMessages([]);
    setStream(null);
    setError(null);
    setWhatSees(null);
    setHistoryOpen(false);
    inputRef.current?.focus();
  }

  async function loadThread(id: number) {
    try {
      const result = await fetchJSON<{ thread: PipThread; messages: PipMessage[] }>(
        `/api/pip/threads/${id}`,
      );
      setThreadId(result.thread.id);
      setMessages(
        result.messages
          .filter((message) => message.role === "user" || message.role === "assistant")
          .map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            evidence: message.evidence,
            toolCalls: message.toolCalls,
          })),
      );
      setHistoryOpen(false);
      setError(null);
    } catch {
      setError(t("requestFailed"));
    }
  }

  async function openHistory() {
    try {
      const result = await fetchJSON<{ threads: PipThread[] }>("/api/pip/threads");
      setThreads(result.threads);
      setHistoryOpen(true);
    } catch {
      setError(t("requestFailed"));
    }
  }

  async function removeThread(id: number) {
    try {
      await fetchJSON(`/api/pip/threads/${id}`, { method: "DELETE" });
      setThreads((current) => current.filter((thread) => thread.id !== id));
      if (threadId === id) newThread();
    } catch {
      setError(t("requestFailed"));
    }
  }

  async function markFeedback(messageId: number, helpful: boolean) {
    if (!threadId) return;
    try {
      await fetchJSON(`/api/pip/threads/${threadId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, helpful }),
      });
      setFeedback((current) => ({ ...current, [messageId]: helpful }));
    } catch {
      setError(t("requestFailed"));
    }
  }

  async function rateBriefing(feedback: "helpful" | "not_helpful") {
    if (!briefing) return;
    try {
      await fetchJSON("/api/pip/briefing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asOf: briefing.asOf, locale, feedback }),
      });
      setBriefingFeedback(feedback);
    } catch {
      setError(t("requestFailed"));
    }
  }

  async function rememberMessage(message: UiMessage) {
    try {
      const saved = await fetchJSON<MemoryItem>("/api/pip/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "decision",
          key: `answer-${message.id}`,
          value: {
            text: message.content.slice(0, 500),
            evidence: message.evidence.map((item) => item.id).slice(0, 6),
          },
        }),
      });
      setMemories((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    } catch {
      setError(t("requestFailed"));
    }
  }

  async function forgetMemory(id: number) {
    try {
      await fetchJSON("/api/pip/memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setMemories((current) => current.filter((item) => item.id !== id));
    } catch {
      setError(t("requestFailed"));
    }
  }

  async function readStream(response: Response) {
    if (!response.body) throw new Error("missing stream");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.split("\n").find((row) => row.startsWith("data: "));
        if (!line) continue;
        const event = JSON.parse(line.slice(6)) as PipStreamEvent;
        if (event.type === "meta") {
          setThreadId(event.threadId);
        } else if (event.type === "tool") {
          setStream((current) =>
            current
              ? { ...current, tools: [...current.tools, event.tool] }
              : { content: "", evidence: [], toolCalls: [], tools: [event.tool] },
          );
        } else if (event.type === "token") {
          setStream((current) =>
            current
              ? { ...current, content: current.content + event.text }
              : { content: event.text, evidence: [], toolCalls: [], tools: [] },
          );
        } else if (event.type === "evidence") {
          setStream((current) => (current ? { ...current, evidence: event.evidence } : null));
        } else if (event.type === "done") {
          setThreadId(event.reply.threadId);
          setMessages((current) => [
            ...current,
            {
              id: event.reply.messageId,
              role: "assistant",
              content: event.reply.content,
              evidence: event.reply.evidence,
              toolCalls: event.reply.toolCalls,
              fallback: event.reply.fallback,
            },
          ]);
          setStream(null);
        } else if (event.type === "error") {
          setError(event.message);
          setStream(null);
        }
      }
    }
  }

  async function send(question: string) {
    const trimmed = question.trim();
    if (!trimmed || stream) return;
    setInput("");
    setError(null);
    setWhatSees(null);
    setMessages((current) => [
      ...current,
      { id: -Date.now(), role: "user", content: trimmed, evidence: [], toolCalls: [] },
    ]);
    setStream({ content: "", evidence: [], toolCalls: [], tools: [] });
    void fetchJSON<WhatSees>("/api/pip/what-sees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: trimmed, locale }),
    })
      .then(setWhatSees)
      .catch(() => undefined);
    try {
      const response = await fetch("/api/pip/chat", {
        method: "POST",
        headers: headersFor(),
        body: JSON.stringify({ threadId: threadId ?? undefined, message: trimmed, locale }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error === "pip_disabled" ? t("disabled") : t("error"));
        setStream(null);
        return;
      }
      await readStream(response);
    } catch {
      setError(t("error"));
      setStream(null);
    }
  }

  if (!status) {
    return (
      <div className={cn(page ? "mx-auto w-full max-w-3xl" : "w-full", "p-5")} role="status">
        <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }
  if (!status.enabled) {
    return (
      <p className={cn(page ? "mx-auto max-w-2xl" : "", "p-5 text-footnote text-muted-foreground")}>
        {t("disabled")}
      </p>
    );
  }

  const container = page
    ? "mx-auto flex w-full max-w-3xl flex-col gap-4"
    : "flex h-full min-h-0 flex-col";

  return (
    <div className={container}>
      <div className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{t("title")}</h2>
          <p className="truncate text-caption text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={newThread} aria-label={t("newThread")}>
          <Plus className="size-4" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void openHistory()}
          aria-label={t("history")}
        >
          <History className="size-4" aria-hidden />
        </Button>
        {onClose && (
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("close")}>
            <X className="size-4" aria-hidden />
          </Button>
        )}
      </div>

      {needsConsent && (
        <div className="rounded-xl border border-border bg-muted/40 p-3 text-caption">
          <p className="font-medium">{t("consentTitle")}</p>
          <p className="mt-1 text-muted-foreground">
            {t("consentBody", { provider: status.provider ?? "" })}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" onClick={() => void setProviderConsent(true)}>
              {t("allow")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void setProviderConsent(false)}>
              {t("deny")}
            </Button>
          </div>
        </div>
      )}

      {historyOpen && (
        <div className="rounded-xl border border-border bg-card p-2">
          {threads.length === 0 ? (
            <p className="p-2 text-caption text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="max-h-48 overflow-y-auto">
              {threads.map((thread) => (
                <li key={thread.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void loadThread(thread.id)}
                    className="min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-start text-caption hover:bg-accent"
                  >
                    {thread.title}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void removeThread(thread.id)}
                    aria-label={t("deleteThread")}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {briefing && briefing.items.length > 0 && messages.length === 0 && !stream && (
        <section className="rounded-xl border border-border bg-card p-3">
          <h3 className="flex items-center gap-1.5 text-caption font-medium">
            <Lightbulb className="size-3.5" aria-hidden />
            {t("briefing")}
          </h3>
          <ul className="mt-2 space-y-2">
            {briefing.items.map((item) => (
              <li
                key={item.key}
                className={cn("rounded-lg border p-2 text-caption", toneClass(item.tone))}
              >
                <p className="font-medium">{item.title}</p>
                <p className="mt-0.5 text-muted-foreground">{item.body}</p>
                {item.action && (
                  <a
                    className="mt-1 inline-block font-medium text-primary hover:underline"
                    href={item.action.href}
                  >
                    {item.action.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void rateBriefing("helpful")}
              aria-label={t("helpful")}
              aria-pressed={briefingFeedback === "helpful"}
            >
              <ThumbsUp
                className={cn("size-3.5", briefingFeedback === "helpful" && "text-primary")}
                aria-hidden
              />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void rateBriefing("not_helpful")}
              aria-label={t("notHelpful")}
              aria-pressed={briefingFeedback === "not_helpful"}
            >
              <ThumbsDown
                className={cn("size-3.5", briefingFeedback === "not_helpful" && "text-destructive")}
                aria-hidden
              />
            </Button>
          </div>
        </section>
      )}

      <div
        className={cn(page ? "min-h-[18rem]" : "min-h-0 flex-1", "space-y-3 overflow-y-auto pe-1")}
        aria-live="polite"
      >
        {messages.length === 0 && !stream && (
          <div className="rounded-xl border border-dashed border-border p-4 text-caption text-muted-foreground">
            <p>{t("empty")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(t.raw("suggestions") as string[]).map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-start hover:bg-accent"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message) => (
          <article
            key={message.id}
            className={cn(
              "max-w-[92%] rounded-2xl px-3 py-2 text-caption",
              message.role === "user"
                ? "ms-auto bg-primary text-primary-foreground"
                : "bg-muted text-foreground",
            )}
          >
            <p className="whitespace-pre-wrap">{message.content}</p>
            {message.role === "assistant" && message.evidence.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-caption font-medium text-primary">
                  {t("evidence")}
                </summary>
                <ul className="mt-1 space-y-1">
                  {message.evidence.map((item) => (
                    <li key={item.id} className="rounded-lg border border-border bg-card/60 p-2">
                      <span className="font-medium">{item.kind}</span>
                      <span className="text-muted-foreground"> · {item.label}</span>
                      {item.sourceIds && item.sourceIds.length > 0 && (
                        <p className="mt-0.5 break-all text-caption text-muted-foreground">
                          {t("sources")}: {item.sourceIds.join(", ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {message.role === "assistant" && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {message.fallback && (
                  <span className="rounded-full bg-background/70 px-2 py-0.5 text-caption text-muted-foreground">
                    {t("fallback")}
                  </span>
                )}
                {message.id > 0 && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void markFeedback(message.id, true)}
                      aria-label={t("helpful")}
                      aria-pressed={feedback[message.id] === true}
                    >
                      <ThumbsUp
                        className={cn("size-3.5", feedback[message.id] === true && "text-primary")}
                        aria-hidden
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void markFeedback(message.id, false)}
                      aria-label={t("notHelpful")}
                      aria-pressed={feedback[message.id] === false}
                    >
                      <ThumbsDown
                        className={cn(
                          "size-3.5",
                          feedback[message.id] === false && "text-destructive",
                        )}
                        aria-hidden
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void rememberMessage(message)}
                      aria-label={t("remember")}
                      title={t("remember")}
                    >
                      <BookOpen className="size-3.5" aria-hidden />
                    </Button>
                  </>
                )}
              </div>
            )}
          </article>
        ))}
        {stream && (
          <article
            className="max-w-[92%] rounded-2xl bg-muted px-3 py-2 text-caption"
            role="status"
          >
            {stream.content ? (
              <p className="whitespace-pre-wrap">{stream.content}</p>
            ) : (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                {t("thinking")}
              </p>
            )}
            {stream.tools.length > 0 && (
              <p className="mt-1 text-caption text-muted-foreground">{stream.tools.join(" · ")}</p>
            )}
          </article>
        )}
        {error && (
          <p
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-caption text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>

      {whatSees && (
        <details className="rounded-xl border border-border bg-card p-2 text-caption">
          <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
            <Eye className="size-3.5" aria-hidden />
            {t("whatSees")}
          </summary>
          <ul className="mt-1 space-y-1">
            {whatSees.tools.map((tool) => (
              <li key={tool.name}>
                <span className="font-medium">{tool.name}</span>
                <span className="text-muted-foreground"> · {tool.riskTier}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
            <ShieldCheck className="size-3.5" aria-hidden />
            {whatSees.provider ? (whatSees.willSendFacts ? t("ai") : t("privacy")) : t("privacy")}
          </p>
        </details>
      )}

      {memories.length > 0 && (
        <details className="rounded-xl border border-border bg-card p-2 text-caption">
          <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
            <BookOpen className="size-3.5" aria-hidden />
            {t("memory")} ({memories.length})
          </summary>
          <ul className="mt-1 space-y-1">
            {memories.map((item) => (
              <li key={item.id} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{item.key}</span>
                  <span className="text-muted-foreground"> · {item.kind}</span>
                  <p className="truncate text-muted-foreground">
                    {String(JSON.stringify(item.value) ?? "").slice(0, 120)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void forgetMemory(item.id)}
                  aria-label={t("forget")}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
        className="flex items-end gap-2 rounded-2xl border border-border bg-popover p-2"
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(input);
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
          className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-caption outline-none placeholder:text-muted-foreground"
        />
        <Button
          type="submit"
          size="icon-sm"
          disabled={!input.trim() || !!stream}
          aria-label={t("send")}
        >
          <Send className="size-4" aria-hidden />
        </Button>
      </form>
      <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
        <BookOpen className="size-3.5" aria-hidden />
        {t("disclaimer")}
      </p>
    </div>
  );
}
