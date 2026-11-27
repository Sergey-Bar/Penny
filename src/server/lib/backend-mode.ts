import "server-only";

import {
  getGlobalSetting,
  getWorkspaceSetting,
  setWorkspaceSetting,
} from "@/server/db/queries/settings";
import { parseBackendMode, type BackendMode } from "@/lib/backend-v2";
import { getDb } from "@/server/db";

const SETTING = "backend_v2";

/**
 * Effective mode for one workspace. `PENNY_BACKEND_V2` is the machine-wide override; otherwise
 * the workspace setting decides, then the global setting, then off.
 */
export function getBackendMode(workspaceId?: number | null): BackendMode {
  const env = parseBackendMode(process.env.PENNY_BACKEND_V2);
  if (env) return env;
  if (workspaceId != null) {
    const workspace = parseBackendMode(getWorkspaceSetting(workspaceId, SETTING));
    if (workspace) return workspace;
  }
  return parseBackendMode(getGlobalSetting(SETTING)) ?? "off";
}

export function setWorkspaceBackendMode(workspaceId: number, mode: BackendMode): void {
  setWorkspaceSetting(workspaceId, SETTING, mode);
}

/** True when any workspace or the global setting asked for the durable backend. */
export function isBackendActive(): boolean {
  if (parseBackendMode(process.env.PENNY_BACKEND_V2)) return process.env.PENNY_BACKEND_V2 !== "off";
  const global = parseBackendMode(getGlobalSetting(SETTING));
  if (global === "shadow" || global === "on") return true;
  const row = getDb()
    .prepare(
      `SELECT 1 AS enabled FROM workspace_settings
       WHERE key = ? AND value IN ('shadow', 'on') LIMIT 1`,
    )
    .get(SETTING) as { enabled: number } | undefined;
  return row !== undefined;
}
