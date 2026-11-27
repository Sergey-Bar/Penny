// The app serves localhost by default. Rejecting any other Host header defeats DNS rebinding,
// where a hostile site's name is pointed at 127.0.0.1 so the browser treats this app as same-origin.
// Self-hosters who reach the app by another name (home server, LAN IP) list it in PENNY_ALLOWED_HOSTS.
import { pennyEnv } from "./legacy-names";
const ALLOWED = new Set(["127.0.0.1", "localhost", "[::1]", "penny.localhost"]);

const fromEnv = (pennyEnv("ALLOWED_HOSTS") ?? "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean)
  .map((h) => (h.includes(":") && !h.startsWith("[") ? `[${h}]` : h));

export function allowedHostsFromEnv(): string[] {
  return [...fromEnv];
}

/** Private LAN names only (10/8, 172.16/12, 192.168/16, fe80::/10, *.local). Never public addresses. */
export function isPrivateLanName(name: string): boolean {
  const v4 = name.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (v4.slice(1).some((o) => Number(o) > 255)) return false;
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (name.startsWith("[")) return /^\[fe[89ab][0-9a-f]:/i.test(name);
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.local$/i.test(name);
}

/** `lan`: phone access is on (and the app lock is set), so private LAN names are accepted too. */
export function isAllowedHost(
  host: string | null,
  extra: string[] = fromEnv,
  lan = false,
): boolean {
  if (!host) return false;
  // The public demo on Vercel (always demo mode, made-up data) answers on whatever name Vercel gives it.
  if (process.env.VERCEL) return true;
  const name = (
    host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0]
  ).toLowerCase();
  const listed = extra.map((h) => {
    const lower = h.toLowerCase();
    return lower.includes(":") && !lower.startsWith("[") ? `[${lower}]` : lower;
  });
  return ALLOWED.has(name) || listed.includes(name) || (lan && isPrivateLanName(name));
}
