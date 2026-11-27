import { handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getGlobalSetting, setGlobalSetting } from "@/server/db/queries/settings";
import { encrypt } from "@/server/lib/encryption";
import { normalizeOllamaUrl, OLLAMA_URL_ERROR } from "@/lib/url-guard";
import { CLI_AGENTS } from "@/server/ai/cli-agent";
import type { AppSettings } from "@/lib/types";
import { demoBlockedResponse } from "@/server/demo/guard";

export const POST = handle("setup/ai", async (request: Request) => {
  // No AI provider in the demo: the first call would otherwise reach a model host.
  const blocked = demoBlockedResponse();
  if (blocked) return blocked;

  const body = ((await request.json().catch(() => null)) ?? {}) as {
    provider: AppSettings["aiProvider"];
    apiKey?: string;
    ollamaUrl?: string;
    ollamaModel?: string;
  };

  if (!["claude", "openai", "ollama", "none", ...Object.keys(CLI_AGENTS)].includes(body.provider)) {
    return NextResponse.json({ error: "invalid provider" }, { status: 400 });
  }
  if (body.provider === "ollama" && body.ollamaUrl && !normalizeOllamaUrl(body.ollamaUrl)) {
    return NextResponse.json({ error: OLLAMA_URL_ERROR }, { status: 400 });
  }

  setGlobalSetting("ai_provider", body.provider);
  if (body.provider === "claude" && body.apiKey) {
    const { encrypted, iv, authTag } = encrypt(body.apiKey);
    setGlobalSetting("ai_api_key_encrypted", encrypted.toString("hex"));
    setGlobalSetting("ai_api_key_iv", iv.toString("hex"));
    setGlobalSetting("ai_api_key_auth_tag", authTag.toString("hex"));
  }
  if (body.provider === "openai" && body.apiKey) {
    const { encrypted, iv, authTag } = encrypt(body.apiKey);
    setGlobalSetting("ai_openai_key_encrypted", encrypted.toString("hex"));
    setGlobalSetting("ai_openai_key_iv", iv.toString("hex"));
    setGlobalSetting("ai_openai_key_auth_tag", authTag.toString("hex"));
  }

  if (body.provider === "ollama") {
    if (body.ollamaUrl) setGlobalSetting("ai_ollama_url", normalizeOllamaUrl(body.ollamaUrl)!);
    if (body.ollamaModel) setGlobalSetting("ai_ollama_model", body.ollamaModel);
  }

  return NextResponse.json({ success: true });
});

/** Whether API keys are stored (never the keys themselves). */
export const GET = handle("setup/ai", async () => {
  return NextResponse.json({
    hasClaudeKey: !!getGlobalSetting("ai_api_key_encrypted"),
    hasOpenAIKey: !!getGlobalSetting("ai_openai_key_encrypted"),
  });
});
