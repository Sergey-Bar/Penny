import "server-only";

import type { AIProvider } from "./types";
import { ClaudeProvider } from "./providers/claude";
import { OpenAIProvider } from "./providers/openai";
import { OllamaProvider } from "./providers/ollama";
import { CliAgentProvider } from "./providers/cli-agent";
import { isCliAgent } from "./cli-agent";
import { getGlobalSetting } from "../db/queries/settings";
import { decrypt, isKeyLocked } from "../lib/encryption";

export function createAIProvider(): AIProvider | null {
  const provider = getGlobalSetting("ai_provider");

  if (provider === "claude") {
    const encryptedKey = getGlobalSetting("ai_api_key_encrypted");
    const iv = getGlobalSetting("ai_api_key_iv");
    const authTag = getGlobalSetting("ai_api_key_auth_tag");

    if (!encryptedKey || !iv || !authTag || isKeyLocked()) return null;

    const apiKey = decrypt({
      encrypted: Buffer.from(encryptedKey, "hex"),
      iv: Buffer.from(iv, "hex"),
      authTag: Buffer.from(authTag, "hex"),
    });

    return new ClaudeProvider(apiKey);
  }

  if (provider === "openai") {
    const encryptedKey = getGlobalSetting("ai_openai_key_encrypted");
    const iv = getGlobalSetting("ai_openai_key_iv");
    const authTag = getGlobalSetting("ai_openai_key_auth_tag");

    if (!encryptedKey || !iv || !authTag || isKeyLocked()) return null;

    const apiKey = decrypt({
      encrypted: Buffer.from(encryptedKey, "hex"),
      iv: Buffer.from(iv, "hex"),
      authTag: Buffer.from(authTag, "hex"),
    });

    return new OpenAIProvider(apiKey);
  }

  if (provider === "ollama") {
    const url = getGlobalSetting("ai_ollama_url") ?? "http://localhost:11434";
    const model = getGlobalSetting("ai_ollama_model") ?? "llama3.1";
    return new OllamaProvider(url, model);
  }

  if (isCliAgent(provider)) return new CliAgentProvider(provider);

  return null;
}
