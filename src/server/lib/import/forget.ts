import "server-only";

import { getDb } from "@/server/db";

/**
 * Correct a merchant memory: delete the learned category and clear automatic categories on the
 * given rows. A category the forget did not clear is marked as the person's choice so a later
 * local categorization pass cannot overwrite it.
 */
export function forgetMerchant(
  workspaceId: number,
  merchant: string,
  transactionIds: readonly number[] = [],
): { forgotten: number; cleared: number } {
  const db = getDb();
  return db.transaction(() => {
    const forgotten = db
      .prepare("DELETE FROM merchant_categories WHERE workspace_id = ? AND merchant_key = ?")
      .run(workspaceId, merchant).changes;
    const ids = transactionIds.filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length === 0) return { forgotten, cleared: 0 };
    const placeholders = ids.map(() => "?").join(",");
    // A hand-picked category wins: it is kept whatever its origin was when it was picked.
    // Rule-applied categories are still cleared when their origin says a rule set them.
    const cleared = db
      .prepare(
        `UPDATE transactions SET category_id = NULL, category_source = NULL, category_origin = 'none',
           needs_review = 1, updated_at = datetime('now')
         WHERE workspace_id = ? AND id IN (${placeholders})
           AND category_origin IN ('memory','dictionary','pattern','rule','ai','none')
           AND (category_source IS NOT 'user' OR category_origin = 'rule')`,
      )
      .run(workspaceId, ...ids).changes;
    db.prepare(
      `UPDATE transactions SET category_source = 'user', category_origin = 'user',
         updated_at = datetime('now')
       WHERE workspace_id = ? AND id IN (${placeholders}) AND category_id IS NOT NULL`,
    ).run(workspaceId, ...ids);
    return { forgotten, cleared };
  })();
}
