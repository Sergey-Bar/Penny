import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { OLLAMA_URL_ERROR } from "@/lib/url-guard";

let route: typeof import("@/app/api/setup/ai/route");
let settings: typeof import("@/server/db/queries/settings");

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-setup-ai-"));
  route = await import("@/app/api/setup/ai/route");
  settings = await import("@/server/db/queries/settings");
  settings.setGlobalSetting("ai_provider", "none");
});

const post = (body: unknown) =>
  route.POST(
    new Request("http://127.0.0.1/api/setup/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/setup/ai", () => {
  it("rejects an unknown provider and leaves settings untouched", async () => {
    settings.setGlobalSetting("ai_provider", "none");
    const response = await post({ provider: "not-a-provider" });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid provider" });
    expect(settings.getGlobalSetting("ai_provider")).toBe("none");
  });

  it("rejects an empty API key before writing the provider", async () => {
    settings.setGlobalSetting("ai_provider", "none");
    const response = await post({ provider: "openai", apiKey: "" });
    expect(response.status).toBe(400);
    expect(settings.getGlobalSetting("ai_provider")).toBe("none");
    expect(settings.getGlobalSetting("ai_openai_key_encrypted")).toBeNull();
  });

  it("rejects extra fields instead of applying a partial config", async () => {
    settings.setGlobalSetting("ai_provider", "none");
    const response = await post({ provider: "ollama", unexpected: true });
    expect(response.status).toBe(400);
    expect(settings.getGlobalSetting("ai_provider")).toBe("none");
  });

  it("stores a valid Ollama URL in origin form", async () => {
    const response = await post({
      provider: "ollama",
      ollamaUrl: "http://localhost:11434/api/tags",
      ollamaModel: "llama3.2:3b",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(settings.getGlobalSetting("ai_provider")).toBe("ollama");
    expect(settings.getGlobalSetting("ai_ollama_url")).toBe("http://localhost:11434");
    expect(settings.getGlobalSetting("ai_ollama_model")).toBe("llama3.2:3b");
  });

  it("rejects an invalid Ollama URL without writing anything", async () => {
    settings.setGlobalSetting("ai_provider", "none");
    const previousUrl = settings.getGlobalSetting("ai_ollama_url");
    const response = await post({ provider: "ollama", ollamaUrl: "ftp://example.com" });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: OLLAMA_URL_ERROR });
    expect(settings.getGlobalSetting("ai_provider")).toBe("none");
    expect(settings.getGlobalSetting("ai_ollama_url")).toBe(previousUrl);
  });

  it("stores an encrypted key for a valid cloud provider", async () => {
    const response = await post({ provider: "openai", apiKey: "sk-test-key" });
    expect(response.status).toBe(200);
    expect(settings.getGlobalSetting("ai_provider")).toBe("openai");
    expect(settings.getGlobalSetting("ai_openai_key_encrypted")).toBeTruthy();
    expect(settings.getGlobalSetting("ai_openai_key_iv")).toBeTruthy();
    expect(settings.getGlobalSetting("ai_openai_key_auth_tag")).toBeTruthy();
  });
});
