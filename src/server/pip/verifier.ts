import "server-only";

import type { PipToolResult } from "@/lib/pip";

const AMOUNT_RE =
  /(?:₪|ש["״]?ח|ils|nis|shekels?)?\s*([-+]?\d[\d,.]*)\s*(?:₪|ש["״]?ח|ils|nis|shekels?|%)?/gi;

function collectNumbers(value: unknown, out: Set<number>, depth = 0): void {
  if (depth > 8 || value == null) return;
  if (typeof value === "number" && Number.isFinite(value)) {
    out.add(Math.round(value * 100) / 100);
    return;
  }
  if (typeof value === "string") {
    const matches = value.match(/\d[\d,.]*/g);
    if (matches)
      for (const raw of matches) {
        const n = Number(raw.replace(/,/g, ""));
        if (Number.isFinite(n)) out.add(Math.round(n * 100) / 100);
      }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 200)) collectNumbers(item, out, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/json|content|raw/i.test(key)) continue;
      collectNumbers(item, out, depth + 1);
    }
  }
}

export function allowedNumbersFrom(results: PipToolResult[]): Set<number> {
  const out = new Set<number>();
  for (const result of results) {
    collectNumbers(result.data, out);
    collectNumbers(result.summary, out);
  }
  for (const n of [...out]) {
    out.add(Math.round(n * 100 * 100) / 100);
    out.add(Math.round((n / 100) * 100) / 100);
  }
  return out;
}

function closeEnough(n: number, allowed: Set<number>): boolean {
  if (allowed.has(n)) return true;
  for (const candidate of allowed) {
    if (Math.abs(n) <= 0.01 && Math.abs(candidate) <= 0.01) return true;
    if (Math.abs(candidate) > 0 && Math.abs(n - candidate) / Math.abs(candidate) <= 0.005)
      return true;
    if (Math.abs(n) >= 1900 && Math.abs(n) <= 2100 && Number.isInteger(n)) return true;
  }
  return false;
}

export interface Verification {
  ok: boolean;
  unsupported: number[];
}

export function verifyNumbers(text: string, results: PipToolResult[]): Verification {
  const allowed = allowedNumbersFrom(results);
  const unsupported: number[] = [];
  for (const match of text.matchAll(AMOUNT_RE)) {
    const raw = match[1]?.replace(/,/g, "");
    if (!raw) continue;
    if (/^\d{4}-\d{2}(-\d{2})?$/.test(match[0].trim())) continue;
    if (/^\d{1,2}:\d{2}$/.test(match[0].trim())) continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    if (n >= 1900 && n <= 2100 && Number.isInteger(n)) continue;
    if (Math.abs(n) >= 1 && Math.abs(n) <= 31 && Number.isInteger(n) && !match[0].includes("%"))
      continue;
    if (!closeEnough(Math.round(n * 100) / 100, allowed)) unsupported.push(n);
  }
  return { ok: unsupported.length === 0, unsupported: unsupported.slice(0, 10) };
}
