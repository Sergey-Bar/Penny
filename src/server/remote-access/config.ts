import "server-only";

import fs from "node:fs";
import path from "node:path";
import { dataDir } from "@/server/lib/data-dir";
import { writeOwnerOnly } from "@/server/lib/encryption";
import { isLockEnabled } from "@/server/lib/app-lock";
import { logError } from "@/server/lib/log";
import {
  normalizeAudience,
  normalizeRemoteHost,
  normalizeTeamDomain,
  parseRemoteAccessMode,
  type RemoteAccessConfig,
  type RemoteAccessMode,
  type RemoteAccessStatus,
} from "@/lib/remote-access";

const FILE = "remote-access.json";

export class RemoteAccessError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "RemoteAccessError";
  }
}

function remoteAccessPath(): string {
  return path.join(dataDir(), FILE);
}

function readFileConfig(): RemoteAccessConfig | null {
  try {
    const raw = fs.readFileSync(remoteAccessPath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const row = parsed as Record<string, unknown>;
    const mode = parseRemoteAccessMode(row.mode);
    if (!mode) return null;
    return {
      version: 1,
      mode,
      host: normalizeRemoteHost(row.host),
      teamDomain: normalizeTeamDomain(row.teamDomain),
      aud: normalizeAudience(row.aud),
      updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function getRemoteAccess(): {
  mode: RemoteAccessMode;
  host: string | null;
  teamDomain: string | null;
  aud: string | null;
  source: "env" | "file" | "default";
  updatedAt: string | null;
} {
  const envMode = parseRemoteAccessMode(process.env.PENNY_REMOTE_ACCESS);
  const file = readFileConfig();
  if (envMode) {
    return {
      mode: envMode,
      host: normalizeRemoteHost(process.env.PENNY_REMOTE_HOST) ?? file?.host ?? null,
      teamDomain:
        normalizeTeamDomain(process.env.PENNY_CF_ACCESS_TEAM_DOMAIN) ?? file?.teamDomain ?? null,
      aud: normalizeAudience(process.env.PENNY_CF_ACCESS_AUD) ?? file?.aud ?? null,
      source: "env",
      updatedAt: file?.updatedAt ?? null,
    };
  }
  if (file) return { ...file, source: "file" };
  return {
    mode: "off",
    host: null,
    teamDomain: null,
    aud: null,
    source: "default",
    updatedAt: null,
  };
}

export function remoteAccessStatus(): RemoteAccessStatus {
  const config = getRemoteAccess();
  return {
    mode: config.mode,
    host: config.host,
    lockEnabled: isLockEnabled(),
    accessConfigured: !!(config.teamDomain && config.aud),
    teamDomain: config.teamDomain,
    aud: config.aud,
    source: config.source,
    updatedAt: config.updatedAt,
  };
}

function isLocalHostname(host: string): boolean {
  return (
    host === "localhost" ||
    host.endsWith(".local") ||
    /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
  );
}

function assertConfigured(input: {
  mode: RemoteAccessMode;
  host: string | null;
  teamDomain: string | null;
  aud: string | null;
}): void {
  if (input.mode === "off") return;
  if (!isLockEnabled())
    throw new RemoteAccessError("Turn on the app lock before remote access", "lock_required", 409);
  if (!input.host)
    throw new RemoteAccessError("A remote hostname is required", "host_required", 400);
  if (isLocalHostname(input.host))
    throw new RemoteAccessError("Use a public hostname, not a local address", "local_host", 400);
  if (input.mode === "named") {
    if (!input.teamDomain)
      throw new RemoteAccessError(
        "A Cloudflare Access team domain is required",
        "access_required",
        400,
      );
    if (!input.aud)
      throw new RemoteAccessError(
        "A Cloudflare Access audience is required",
        "access_required",
        400,
      );
  }
}

export function setRemoteAccess(input: {
  mode: unknown;
  host?: unknown;
  teamDomain?: unknown;
  aud?: unknown;
}): RemoteAccessStatus {
  const mode = parseRemoteAccessMode(input.mode);
  if (!mode) throw new RemoteAccessError("Invalid remote access mode", "bad_mode", 400);
  if (mode === "off") {
    fs.rmSync(remoteAccessPath(), { force: true });
    return remoteAccessStatus();
  }
  const config = {
    mode,
    host: normalizeRemoteHost(input.host),
    teamDomain: normalizeTeamDomain(input.teamDomain),
    aud: normalizeAudience(input.aud),
  };
  assertConfigured(config);
  const payload: RemoteAccessConfig = {
    version: 1,
    ...config,
    updatedAt: new Date().toISOString(),
  };
  writeOwnerOnly(remoteAccessPath(), JSON.stringify(payload, null, 2));
  return remoteAccessStatus();
}

export function disableRemoteAccess(): RemoteAccessStatus {
  try {
    fs.rmSync(remoteAccessPath(), { force: true });
  } catch (error) {
    logError("remote-access/disable", error);
  }
  return remoteAccessStatus();
}

export function isRemoteHost(host: string | null, configuredHost: string | null): boolean {
  if (!host || !configuredHost) return false;
  const raw = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  return raw.toLowerCase() === configuredHost.toLowerCase();
}
