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
    const updates: { id: number; categoryId: number }[] = [];
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
      updates.push({ id: t.id, categoryId: decision.categoryId });
      if (decision.source === "memory") learned.push(normalizeMerchant(t.description));
    }
    if (updates.length === 0) continue;
    batchUpdateCategories(workspaceId, updates);
    if (learned.length) incrementMerchantHits(workspaceId, learned);
    done += updates.length;
  }
  return done;
}
