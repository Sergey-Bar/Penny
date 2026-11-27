export type RemoteAccessMode = "off" | "quick" | "named";

export interface RemoteAccessStatus {
  mode: RemoteAccessMode;
  host: string | null;
  lockEnabled: boolean;
  accessConfigured: boolean;
  teamDomain: string | null;
  aud: string | null;
  source: "env" | "file" | "default";
  updatedAt: string | null;
}

export interface RemoteAccessConfig {
  version: 1;
  mode: RemoteAccessMode;
  host: string | null;
  teamDomain: string | null;
  aud: string | null;
  updatedAt: string;
}

export function parseRemoteAccessMode(value: unknown): RemoteAccessMode | null {
  return value === "off" || value === "quick" || value === "named" ? value : null;
}

export function normalizeRemoteHost(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  const withoutScheme = trimmed.replace(/^https?:\/\//, "");
  if (!withoutScheme || withoutScheme.includes("*") || withoutScheme.includes(" ")) return null;
  const host = withoutScheme.split("/")[0].split(":")[0].replace(/\.$/, "");
  if (!host || host.length > 253) return null;
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  return host;
}

export function normalizeTeamDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  if (!/^[a-z0-9.-]+$/.test(trimmed) || !trimmed.includes(".")) return null;
  return trimmed;
}

export function normalizeAudience(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128 || !/^[A-Za-z0-9._-]+$/.test(trimmed)) return null;
  return trimmed;
}
