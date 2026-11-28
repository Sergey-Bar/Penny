import { handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getGlobalSetting, setGlobalSetting } from "@/server/db/queries/settings";
import { encrypt } from "@/server/lib/encryption";
import { normalizeOllamaUrl, OLLAMA_URL_ERROR } from "@/lib/url-guard";
import { CLI_AGENTS } from "@/server/ai/cli-agent";
import { demoBlockedResponse } from "@/server/demo/guard";
import { z } from "zod";

const AI_PROVIDERS = ["claude", "openai", "ollama", "none", ...Object.keys(CLI_AGENTS)] as const;

const aiConfigSchema = z
  .object({
    provider: z.enum(AI_PROVIDERS),
    apiKey: z.string().min(1, "apiKey must not be empty").optional(),
    ollamaUrl: z.string().min(1, "ollamaUrl must not be empty").optional(),
    ollamaModel: z.string().min(1, "ollamaModel must not be empty").optional(),
  })
  .strict();

export const POST = handle("setup/ai", async (request: Request) => {
  // No AI provider in the demo: the first call would otherwise reach a model host.
  const blocked = demoBlockedResponse();
  if (blocked) return blocked;

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = aiConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const invalidProvider =
      !raw ||
      typeof raw !== "object" ||
      !("provider" in raw) ||
      typeof raw.provider !== "string" ||
      !(AI_PROVIDERS as readonly string[]).includes(raw.provider);
    return NextResponse.json(
      { error: invalidProvider ? "invalid provider" : "invalid request" },
      { status: 400 },
    );
  }
  const body = parsed.data;

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
