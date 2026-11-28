import "server-only";

import { categorizeRow } from "@/lib/import/categorize";
import { getAllCategories } from "@/server/db/queries/categories";
import {
  batchUpdateCategories,
  getTransactionsForCategorization,
  getUncategorizedIdsByKind,
} from "@/server/db/queries/transactions";
import {
  incrementMerchantHits,
  lookupMerchantCategoriesBulk,
  normalizeMerchant,
} from "@/server/lib/merchant-memory";

/**
 * Categorizes without AI, on every sync: first what this household already taught (a merchant it
 * categorized before), then the built-in dictionary of Israeli merchants. Both go through the
 * same pure engine as the importer, so a renamed category keeps working through its stable key.
 * AI, when connected, only sees what is left.
 */
export function categorizeLocally(workspaceId: number): number {
  let done = 0;
  for (const kind of ["expense", "income"] as const) {
    const ids = getUncategorizedIdsByKind(workspaceId, kind);
    if (ids.length === 0) continue;
    const categories = getAllCategories(workspaceId, kind, { leavesOnly: true }).map(
      (category) => ({
        id: category.id,
        name: category.name,
        kind: category.kind,
        key: category.key,
      }),
    );
    const txns = getTransactionsForCategorization(workspaceId, ids);
    const memory = lookupMerchantCategoriesBulk(
      workspaceId,
      txns.map((t) => t.description),
    );
    // A remembered parent category is still a human decision: include it so it is not lost just
    // because this pass only offers leaf categories for new suggestions.
    const allCategories = getAllCategories(workspaceId);
    const known = new Set(categories.map((category) => category.id));
    for (const remembered of memory.values()) {
      if (known.has(remembered.categoryId)) continue;
      const parent = allCategories.find((category) => category.id === remembered.categoryId);
      if (!parent || parent.kind !== kind) continue;
      categories.push({ id: parent.id, name: parent.name, kind: parent.kind, key: parent.key });
      known.add(parent.id);
    }
    const updates: {
      id: number;
      categoryId: number;
      origin: string;
      confidence: number;
      reasons: unknown;
    }[] = [];
    const learned: string[] = [];
    for (const t of txns) {
      const remembered = memory.get(t.description);
      const decision = categorizeRow(
        {
          description: t.description,
          kind,
          refund: false,
          memory: remembered && remembered.kind === kind ? remembered : null,
        },
        { categories },
      );
      if (decision.categoryId == null) continue;
      // Every deterministic source categorizeRow applies here is at or above the 0.7 threshold;
      // AI decisions are never applied in this local pass.
      updates.push({
        id: t.id,
        categoryId: decision.categoryId,
        origin: decision.source,
        confidence: decision.confidence,
        reasons: decision.reasons,
      });
      if (decision.source === "memory") learned.push(normalizeMerchant(t.description));
    }
    if (updates.length === 0) continue;
    batchUpdateCategories(workspaceId, updates);
    if (learned.length) incrementMerchantHits(workspaceId, learned);
    done += updates.length;
  }
  return done;
}
