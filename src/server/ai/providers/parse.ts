import type { CategoryMapping } from "../types";

/** Model confidence is a 1–7 integer; anything else is dropped rather than stored. */
export function parseConfidence(raw: unknown): number | undefined {
  if (typeof raw !== "number" && typeof raw !== "string") return undefined;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return undefined;
  const clamped = Math.round(n);
  if (clamped < 1 || clamped > 7) return undefined;
  return clamped;
}

/**
 * Parses a provider reply into category mappings.
 *
 * The JSON array is sliced with the first `[` and last `]` (linear time) instead of a
 * backtracking regex, and any parse failure returns an empty result: a malformed model
 * answer must never throw into the categorization pipeline.
 */
export function parseCategoryResponse(
  text: string,
  validCategories: readonly string[],
  allowProposals: boolean,
): CategoryMapping[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end < start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const validSet = new Set(validCategories.map((category) => category.toLowerCase()));
  const results: CategoryMapping[] = [];
  for (const item of parsed) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as Record<string, unknown>).index !== "number" ||
      typeof (item as Record<string, unknown>).categoryName !== "string"
    ) {
      continue;
    }
    const typed = item as {
      index: number;
      categoryName: string;
      confidence?: unknown;
    };
    const name = typed.categoryName.trim();
    if (!name) continue;
    const isExisting = validSet.has(name.toLowerCase());
    if (!isExisting && !allowProposals) continue;
    results.push({
      index: typed.index,
      categoryName: name,
      isNew: !isExisting,
      confidence: parseConfidence(typed.confidence),
    });
  }
  return results;
}
