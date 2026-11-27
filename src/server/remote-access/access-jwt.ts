import "server-only";

import {
  createPublicKey,
  verify as verifySignature,
  type JsonWebKey as NodeJsonWebKey,
  type KeyObject,
} from "node:crypto";
import { fetchExternal } from "@/server/lib/fetch-external";
import { logError } from "@/server/lib/log";

export interface Jwk {
  kid?: string;
  kty?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

interface CacheEntry {
  keys: Map<string, KeyObject>;
  fetchedAt: number;
  teamDomain: string;
}

const CACHE_MS = 60 * 60_000;

declare global {
  var __pennyAccessJwks: CacheEntry | undefined;
}

const cache = (): CacheEntry | undefined => globalThis.__pennyAccessJwks;

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function base64UrlJson<T>(value: string): T | null {
  try {
    return JSON.parse(base64UrlDecode(value).toString("utf8")) as T;
  } catch {
    return null;
  }
}

export async function initAccessJwks(teamDomain: string, force = false): Promise<boolean> {
  const current = cache();
  if (
    !force &&
    current &&
    current.teamDomain === teamDomain &&
    Date.now() - current.fetchedAt < CACHE_MS
  )
    return current.keys.size > 0;
  try {
    const response = await fetchExternal(`https://${teamDomain}/cdn-cgi/access/certs`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as { keys?: Jwk[] };
    const keys = new Map<string, KeyObject>();
    for (const jwk of payload.keys ?? []) {
      if (jwk.kty !== "RSA" || !jwk.kid || !jwk.n || !jwk.e) continue;
      try {
        keys.set(jwk.kid, createPublicKey({ key: jwk as NodeJsonWebKey, format: "jwk" }));
      } catch {
        continue;
      }
    }
    globalThis.__pennyAccessJwks = { keys, fetchedAt: Date.now(), teamDomain };
    return keys.size > 0;
  } catch (error) {
    logError("remote-access/jwks", error, { teamDomain });
    return false;
  }
}

export interface AccessJwtResult {
  ok: boolean;
  reason?: string;
  payload?: { sub?: string; email?: string; aud?: string | string[]; exp?: number };
}

export function verifyAccessJwtSync(
  token: string,
  options: { teamDomain: string; aud: string; now?: number },
): AccessJwtResult {
  const current = cache();
  if (!current || current.teamDomain !== options.teamDomain || current.keys.size === 0)
    return { ok: false, reason: "jwks_unavailable" };
  const nowMs = options.now ?? Date.now();
  if (nowMs - current.fetchedAt > CACHE_MS * 2) return { ok: false, reason: "jwks_stale" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = base64UrlJson<{ alg?: string; kid?: string }>(headerB64);
  if (!header || header.alg !== "RS256" || !header.kid) return { ok: false, reason: "bad_header" };
  const key = current.keys.get(header.kid);
  if (!key) return { ok: false, reason: "unknown_kid" };
  const signingInput = Buffer.from(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(signatureB64);
  let valid = false;
  try {
    valid = verifySignature("RSA-SHA256", signingInput, key, signature);
  } catch {
    return { ok: false, reason: "bad_signature" };
  }
  if (!valid) return { ok: false, reason: "bad_signature" };
  const payload = base64UrlJson<{
    aud?: string | string[];
    iss?: string;
    exp?: number;
    nbf?: number;
    iat?: number;
    sub?: string;
    email?: string;
  }>(payloadB64);
  if (!payload) return { ok: false, reason: "bad_payload" };
  const now = Math.floor(nowMs / 1000);
  if (typeof payload.exp !== "number" || payload.exp + 60 < now)
    return { ok: false, reason: "expired" };
  if (typeof payload.nbf === "number" && payload.nbf - 60 > now)
    return { ok: false, reason: "not_yet_valid" };
  const expectedIssuer = `https://${options.teamDomain}`;
  if (payload.iss !== expectedIssuer) return { ok: false, reason: "bad_issuer" };
  const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (!audiences.includes(options.aud)) return { ok: false, reason: "bad_audience" };
  return { ok: true, payload };
}

export function setAccessJwksForTests(
  teamDomain: string,
  keys: Jwk[],
  fetchedAt = Date.now(),
): void {
  const mapped = new Map<string, KeyObject>();
  for (const jwk of keys) {
    if (!jwk.kid || !jwk.n || !jwk.e) continue;
    mapped.set(jwk.kid, createPublicKey({ key: jwk as NodeJsonWebKey, format: "jwk" }));
  }
  globalThis.__pennyAccessJwks = { keys: mapped, fetchedAt, teamDomain };
}

export function clearAccessJwksCache(): void {
  globalThis.__pennyAccessJwks = undefined;
}
