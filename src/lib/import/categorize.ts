import { categoryNameForKey } from "@/lib/category-keys";
import { dictionaryCategoryKey } from "@/lib/merchant-dictionary";
import { patternCategoryKey } from "@/lib/import/patterns";
import { isGeneric } from "@/lib/import/generic";
import type {
  CategoryDecision,
  CategorySource,
  ImportCategory,
  ImportKind,
  ImportReason,
} from "@/lib/import/types";

export interface CategorizeRowInput {
  description: string;
  kind: ImportKind;
  refund: boolean;
  /** Chosen in the grid before saving. */
  categoryId?: number | null;
  /** A category name from the file's own category column. */
  requestedCategoryName?: string | null;
  ruleCategoryId?: number | null;
  memory?: { categoryId: number; kind: "expense" | "income" } | null;
  fileCategory?: { id: number; kind: "expense" | "income" } | null;
  aiCategoryId?: number | null;
  /** The server's generic patterns (built-in + household). */
  userGenericPatterns?: readonly string[];
}

export interface CategorizeContext {
  categories: readonly ImportCategory[];
}

const EXPENSE_SOURCES: Record<Exclude<CategorySource, "none">, number> = {
  user: 1,
  rule: 0.97,
  memory: 0.9,
  file: 0.85,
  dictionary: 0.8,
  pattern: 0.7,
  ai: 0.6,
};

function byKey(
  key: string | null,
  categories: readonly ImportCategory[],
  kind: "expense" | "income",
): ImportCategory | null {
  if (!key) return null;
  const keyed = categories.find((c) => c.key === key && c.kind === kind);
  if (keyed) return keyed;
  const name = categoryNameForKey(key);
  if (!name) return null;
  return (
    categories.find((c) => c.name.toLowerCase() === name.toLowerCase() && c.kind === kind) ?? null
  );
}

function decision(
  category: ImportCategory | null,
  source: CategorySource,
  reasons: ImportReason[],
  alternatives: ImportCategory[] = [],
): CategoryDecision {
  return {
    categoryId: category?.id ?? null,
    source: category ? source : "none",
    confidence: category ? EXPENSE_SOURCES[source as Exclude<CategorySource, "none">] : 0,
    alternatives: alternatives.map((c) => ({ categoryId: c.id, name: c.name })),
    reasons,
  };
}

/**
 * Deterministic category: user > rule > file category > memory > dictionary key > pattern > AI.
 * A generic description never gets a guessed category; a refund only gets an expense category;
 * a transfer never gets one. Renames keep working through the key.
 */
export function categorizeRow(
  input: CategorizeRowInput,
  context: CategorizeContext,
): CategoryDecision {
  const reasons: ImportReason[] = [];
  if (input.kind === "transfer") return decision(null, "none", reasons);
  const kind: "expense" | "income" = input.kind === "income" ? "income" : "expense";

  const wantedKind = (candidate: ImportCategory): boolean =>
    candidate.kind === kind && !(input.refund && candidate.kind === "income");

  const direct =
    input.categoryId == null
      ? null
      : (context.categories.find((c) => c.id === input.categoryId) ?? null);
  if (direct) {
    if (!wantedKind(direct)) {
      return decision(null, "none", [{ code: "categoryKindMismatch", detail: direct.name }]);
    }
    return decision(direct, "user", reasons);
  }

  const rule =
    input.ruleCategoryId == null
      ? null
      : (context.categories.find((c) => c.id === input.ruleCategoryId) ?? null);
  if (rule) {
    if (!wantedKind(rule))
      return decision(null, "none", [{ code: "categoryKindMismatch", detail: rule.name }]);
    return decision(rule, "rule", [{ code: "ruleApplied" }]);
  }

  if (input.requestedCategoryName) {
    const wantedName = input.requestedCategoryName.trim().toLowerCase();
    const named =
      context.categories.find((c) => c.name.toLowerCase() === wantedName && c.kind === kind) ??
      context.categories.find((c) => c.name.toLowerCase() === wantedName);
    if (named && wantedKind(named)) return decision(named, "file", reasons);
    if (named && !wantedKind(named)) {
      reasons.push({ code: "categoryKindMismatch", detail: named.name });
    } else {
      reasons.push({ code: "categoryUnknown", detail: input.requestedCategoryName });
    }
  }

  const generic = isGeneric(input.description, input.userGenericPatterns ?? []);
  const file = input.fileCategory;
  if (file) {
    const same = context.categories.find((c) => c.id === file.id);
    if (same && wantedKind(same)) return decision(same, "file", [{ code: "fileCategoryApplied" }]);
    reasons.push({ code: "categoryKindMismatch" });
  }

  if (generic) {
    // A generic description is left for review; it may still carry a user/rule category above.
    return decision(null, "none", reasons);
  }

  const memory = input.memory;
  if (memory) {
    const same = context.categories.find((c) => c.id === memory.categoryId);
    if (same && wantedKind(same)) {
      return decision(same, "memory", [{ code: "merchantMemoryApplied" }]);
    }
  }

  const dictKey = dictionaryCategoryKey(input.description, kind);
  const dict = byKey(dictKey, context.categories, kind);
  if (dict && wantedKind(dict)) {
    return decision(dict, "dictionary", [
      { code: "dictionaryApplied", detail: dictKey ?? undefined },
    ]);
  }

  const patternKey = patternCategoryKey(input.description, kind);
  const pattern = byKey(patternKey, context.categories, kind);
  if (pattern && wantedKind(pattern)) {
    const alternatives = dict ? [dict] : [];
    return decision(pattern, "pattern", reasons, alternatives);
  }

  if (input.aiCategoryId != null) {
    const ai = context.categories.find((c) => c.id === input.aiCategoryId);
    if (ai && wantedKind(ai)) return decision(ai, "ai", [{ code: "aiSuggested" }]);
  }

  const suggestions = [dict, pattern].filter(
    (c): c is ImportCategory => c != null && wantedKind(c),
  );
  return decision(null, "none", reasons, suggestions);
}
