import "server-only";

import {
  getGlobalSetting,
  getWorkspaceSetting,
  setGlobalSetting,
  setWorkspaceSetting,
} from "@/server/db/queries/settings";
import { parsePipMode, type PipMode } from "@/lib/pip";

const SETTING = "pip_v2";
const KILL_SETTING = "pip_kill_switch";

export function getPipMode(workspaceId?: number | null): PipMode {
  const env = parsePipMode(process.env.PENNY_PIP_V2);
  if (env) return env;
  if (workspaceId != null) {
    const workspace = parsePipMode(getWorkspaceSetting(workspaceId, SETTING));
    if (workspace) return workspace;
  }
  return parsePipMode(getGlobalSetting(SETTING)) ?? "off";
}

export function isPipKillSwitch(): boolean {
  if (process.env.PENNY_PIP_KILL === "1" || process.env.PENNY_PIP_KILL === "true") return true;
  return getGlobalSetting(KILL_SETTING) === "on";
}

export function isPipEnabled(workspaceId?: number | null): boolean {
  return getPipMode(workspaceId) === "on" && !isPipKillSwitch();
}

export function setWorkspacePipMode(workspaceId: number, mode: PipMode): void {
  setWorkspaceSetting(workspaceId, SETTING, mode);
}

export function setPipKillSwitch(on: boolean): void {
  setGlobalSetting(KILL_SETTING, on ? "on" : "off");
}

export function pipProviderName(): string | null {
  const provider = getGlobalSetting("ai_provider");
  return provider && provider !== "none" ? provider : null;
}
