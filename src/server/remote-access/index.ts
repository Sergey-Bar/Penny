import "server-only";

import { isLockEnabled } from "@/server/lib/app-lock";
import { logError } from "@/server/lib/log";
import { getRemoteAccess, isRemoteHost } from "./config";
import { initAccessJwks, verifyAccessJwtSync } from "./access-jwt";

const REFRESH_MS = 30 * 60_000;

export async function initRemoteAccess(): Promise<void> {
  const config = getRemoteAccess();
  if (config.mode !== "named" || !config.teamDomain) return;
  await initAccessJwks(config.teamDomain);
  setInterval(() => {
    const current = getRemoteAccess();
    if (current.mode === "named" && current.teamDomain)
      void initAccessJwks(current.teamDomain, true).catch((error) =>
        logError("remote-access/refresh", error),
      );
  }, REFRESH_MS).unref();
}

export interface RemoteRequestCheck {
  ok: boolean;
  status?: number;
  code?: string;
  message?: string;
}

export function remoteAccessCheck(input: {
  host: string | null;
  jwt: string | null;
  now?: number;
}): RemoteRequestCheck {
  const config = getRemoteAccess();
  if (config.mode === "off") return { ok: true };
  if (!isRemoteHost(input.host, config.host)) return { ok: true };
  if (!isLockEnabled())
    return {
      ok: false,
      status: 403,
      code: "remote_lock_required",
      message: "Remote access requires the app lock",
    };
  if (config.mode === "quick") {
    if (process.env.PENNY_REMOTE_QUICK_ACK !== "1")
      return {
        ok: false,
        status: 403,
        code: "remote_quick_not_acknowledged",
        message: "Quick tunnels require PENNY_REMOTE_QUICK_ACK=1",
      };
    return { ok: true };
  }
  if (!config.teamDomain || !config.aud)
    return {
      ok: false,
      status: 503,
      code: "remote_access_unconfigured",
      message: "Cloudflare Access is not configured",
    };
  if (!input.jwt)
    return {
      ok: false,
      status: 403,
      code: "remote_access_token_missing",
      message: "Cloudflare Access token is missing",
    };
  const result = verifyAccessJwtSync(input.jwt, {
    teamDomain: config.teamDomain,
    aud: config.aud,
    now: input.now,
  });
  if (!result.ok)
    return {
      ok: false,
      status: 403,
      code: `remote_access_${result.reason ?? "invalid"}`,
      message: "Cloudflare Access token is invalid",
    };
  return { ok: true };
}
