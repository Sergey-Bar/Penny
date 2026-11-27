import "server-only";

import { getWorkspaceSetting, setWorkspaceSetting } from "@/server/db/queries/settings";

/** `import_v2` per workspace, with an env override for CI/demo (`PENNY_IMPORT_V2=1`). */
export function importV2Enabled(workspaceId: number): boolean {
  if (process.env.PENNY_IMPORT_V2 === "1") return true;
  return getWorkspaceSetting(workspaceId, "import_v2") === "true";
}

export function setImportV2(workspaceId: number, enabled: boolean): void {
  setWorkspaceSetting(workspaceId, "import_v2", enabled ? "true" : "false");
}
