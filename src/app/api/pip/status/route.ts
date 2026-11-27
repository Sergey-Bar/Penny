import { handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { getPipMode, isPipEnabled, isPipKillSwitch, pipProviderName } from "@/server/lib/pip-mode";
import { getGlobalSetting } from "@/server/db/queries/settings";
import { listConsent } from "@/server/pip/repository";

export const dynamic = "force-dynamic";

export const GET = handle("pip/status", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const provider = pipProviderName();
  return NextResponse.json({
    enabled: isPipEnabled(workspaceId),
    mode: getPipMode(workspaceId),
    killSwitch: isPipKillSwitch(),
    provider,
    model:
      provider === "ollama"
        ? (getGlobalSetting("ai_ollama_model") ?? "llama3.1")
        : provider === "claude"
          ? "claude-haiku-4-5-20251001"
          : provider,
    consent: listConsent(workspaceId),
    scopes: ["minimized_facts", "tool_results", "conversation_summary"],
  });
});
