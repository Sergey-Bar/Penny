import "server-only";

import { categorizeRow } from "@/lib/import/categorize";
import type { CategoryDecision, ImportCategory, ImportKind } from "@/lib/import/types";
import { getAllCategories } from "@/server/db/queries/categories";
import { listRules } from "@/server/db/queries/rules";
import { getAccount } from "@/server/db/queries/accounts";
import { applyRules } from "@/server/rules/engine";
import { listGenericPatterns } from "@/server/lib/generic-descriptions";
import { lookupMerchantCategoriesBulk } from "@/server/lib/merchant-memory";
import type { CategorySource } from "@/lib/import/types";

export interface CategorizeCandidate {
  rowIndex: number;
  accountId: number;
  description: string;
  kind: ImportKind;
  refund: boolean;
  signedAmount: number;
  categoryId?: number | null;
  requestedCategoryName?: string | null;
  aiCategoryId?: number | null;
}

export interface ServerCategorizeResult {
  rowIndex: number;
  categoryId: number | null;
  source: CategorySource;
  confidence: number;
  alternatives: { categoryId: number; name: string }[];
}

export interface RuleMatch {
  categoryId: number | null;
  kind: ImportKind | null;
}

/**
 * Loads everything the deterministic categoriser needs (categories with keys, merchant memory,
 * rules, generic patterns) and runs the pure engine. No AI, no network.
 */
export function categorizeImportRows(
  workspaceId: number,
  candidates: readonly CategorizeCandidate[],
  options: {
    aiCategories?: Map<number, number>;
    /** Rule results already computed by the caller (same array order); avoids a second pass. */
    ruleMatches?: Map<number, RuleMatch>;
  } = {},
): Map<number, ServerCategorizeResult> {
  const out = new Map<number, ServerCategorizeResult>();
  if (candidates.length === 0) return out;
  const categories: ImportCategory[] = getAllCategories(workspaceId, undefined, {
    leavesOnly: true,
  }).map((category) => ({
    id: category.id,
    name: category.name,
    kind: category.kind,
    key: category.key,
  }));
  const memory = lookupMerchantCategoriesBulk(
    workspaceId,
    candidates.map((c) => c.description),
  );
  // Memory may point at a parent category a person chose; resolve it against the full tree
  // instead of dropping the merchant memory because the categorizer only offers leaves.
  const allCategories = getAllCategories(workspaceId);
  const known = new Set(categories.map((category) => category.id));
  for (const remembered of memory.values()) {
    if (known.has(remembered.categoryId)) continue;
    const parent = allCategories.find((category) => category.id === remembered.categoryId);
    if (!parent || parent.kind !== remembered.kind) continue;
    categories.push({
      id: parent.id,
      name: parent.name,
      kind: parent.kind,
      key: parent.key,
    });
    known.add(parent.id);
  }
  const rules = options.ruleMatches ? [] : listRules(workspaceId);
  const userGenericPatterns = listGenericPatterns(workspaceId);
  const accountNumbers = new Map<number, string>();
  for (const accountId of new Set(candidates.map((c) => c.accountId))) {
    accountNumbers.set(accountId, getAccount(workspaceId, accountId)?.number ?? "");
  }
  candidates.forEach((candidate, index) => {
    const rule =
      options.ruleMatches != null
        ? (options.ruleMatches.get(index) ?? null)
        : applyRules(
            {
              description: candidate.description,
              chargedAmount: candidate.signedAmount,
              accountNumber: accountNumbers.get(candidate.accountId) ?? "",
            },
            rules,
          );
    const decision: CategoryDecision = categorizeRow(
      {
        description: candidate.description,
        kind: candidate.kind,
        refund: candidate.refund,
        categoryId: candidate.categoryId ?? null,
        requestedCategoryName: candidate.requestedCategoryName ?? null,
        ruleCategoryId: rule?.categoryId ?? null,
        memory: memory.get(candidate.description) ?? null,
        aiCategoryId:
          options.aiCategories?.get(candidate.rowIndex) ?? candidate.aiCategoryId ?? null,
        userGenericPatterns,
      },
      { categories },
    );
    out.set(candidate.rowIndex, {
      rowIndex: candidate.rowIndex,
      categoryId: decision.categoryId,
      source: decision.source,
      confidence: decision.confidence,
      alternatives: decision.alternatives,
    });
  });
  return out;
}

/** Rule results per row, so the server can honour a rule's kind during re-classification. */
export function importRuleMatches(
  workspaceId: number,
  rows: readonly { description: string; signedAmount: number; accountId: number }[],
): Map<number, RuleMatch> {
  const out = new Map<number, RuleMatch>();
  const rules = listRules(workspaceId);
  if (rules.length === 0) return out;
  const accountNumbers = new Map<number, string>();
  for (const accountId of new Set(rows.map((r) => r.accountId))) {
    accountNumbers.set(accountId, getAccount(workspaceId, accountId)?.number ?? "");
  }
  rows.forEach((row, index) => {
    const rule = applyRules(
      {
        description: row.description,
        chargedAmount: row.signedAmount,
        accountNumber: accountNumbers.get(row.accountId) ?? "",
      },
      rules,
    );
    if (rule) out.set(index, { categoryId: rule.categoryId ?? null, kind: rule.kind ?? null });
  });
  return out;
}
