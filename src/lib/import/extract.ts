/** "Extract from one cell": a safe, named-group regex turns "12/03/24 קפה 18.50" into fields. */

/** Rejects patterns that could backtrack catastrophically; no eval, ever. */
export function isSafeRegex(pattern: string): boolean {
  if (pattern.length === 0 || pattern.length > 200) return false;
  try {
    new RegExp(pattern);
  } catch {
    return false;
  }
  const open: number[] = [];
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") i++;
    else if (inClass) {
      if (c === "]") inClass = false;
    } else if (c === "[") inClass = true;
    else if (c === "(") open.push(i);
    else if (c === ")") {
      const from = open.pop() ?? 0;
      if (/[+*{]/.test(pattern[i + 1] ?? "") && /[+*{|]/.test(pattern.slice(from + 1, i)))
        return false;
    }
  }
  return true;
}

function compileExtractPattern(pattern: string): RegExp | null {
  if (!isSafeRegex(pattern)) return null;
  try {
    return new RegExp(pattern, "u");
  } catch {
    return null;
  }
}

/** Named groups of a match, or null when it did not match. */
export function extractFromCell(
  cell: string,
  pattern: string | RegExp,
): Record<string, string> | null {
  const re = typeof pattern === "string" ? compileExtractPattern(pattern) : pattern;
  if (!re) return null;
  re.lastIndex = 0;
  const match = re.exec(cell);
  if (!match) return null;
  const groups = match.groups;
  if (!groups) return null;
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(groups)) {
    if (value !== undefined) out[name] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** The named groups a pattern exposes, for the "extract from description" editor. */
export function namedGroups(pattern: string): string[] {
  if (!isSafeRegex(pattern)) return [];
  return [...pattern.matchAll(/\(\?<([A-Za-z][A-Za-z0-9]*)>/g)].map((m) => m[1]);
}

export interface ExtractMapping {
  date?: string;
  amount?: string;
  description?: string;
  memo?: string;
}

/**
 * Applies one extracted match to a row's cells. Only the fields the pattern names are replaced;
 * an empty capture leaves the original value.
 */
export function applyExtracted(
  target: Partial<Record<keyof ExtractMapping, string>>,
  groups: Record<string, string> | null,
): void {
  if (!groups) return;
  if (groups.date) target.date = groups.date;
  if (groups.amount) target.amount = groups.amount;
  if (groups.description) target.description = groups.description;
  if (groups.memo) target.memo = groups.memo;
}
