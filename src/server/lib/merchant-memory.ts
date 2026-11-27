import "server-only";

import { getDb } from "../db/index";
import type { CategoryKind } from "@/lib/types";
import {
  normalizeMerchantV1,
  normalizeMerchantV2,
  normalizeMerchant as normalizeMerchantKey,
} from "@/lib/merchant-normalize";

/** Writes use the V2 key; `normalizeMerchantV1` stays for dual-read of learned rows. */
export const normalizeMerchant = normalizeMerchantKey;

export interface MerchantMapping {
  merchantKey: string;
  categoryId: number;
  kind: CategoryKind;
  source: "user" | "approved-ai";
}

/**
 * Looks up merchant memory by V2 and then V1. The V1 query keeps rows learned before the rollout
 * working until the migration has backfilled them.
 */
export function lookupMerchantCategoriesBulk(
  workspaceId: number,
  descriptions: string[],
): Map<string, MerchantMapping> {
  if (descriptions.length === 0) return new Map();
  const keys = new Set<string>();
  const candidates = new Map<string, { v2: string; v1: string }>();
  for (const d of descriptions) {
    const v2 = normalizeMerchantV2(d);
    const v1 = normalizeMerchantV1(d);
    const key = v2 || v1;
    if (!key) continue;
    keys.add(key);
    keys.add(v1);
    candidates.set(d, { v2: key, v1 });
  }
  if (keys.size === 0) return new Map();
  const placeholders = Array.from(keys)
    .map(() => "?")
    .join(",");
  const rows = getDb()
    .prepare(
      `SELECT merchant_key as merchantKey,
              category_id as categoryId,
              kind,
              source
       FROM merchant_categories
       WHERE workspace_id = ? AND merchant_key IN (${placeholders})`,
    )
    .all(workspaceId, ...Array.from(keys)) as MerchantMapping[];
  const lookupByKey = new Map<string, MerchantMapping>();
  for (const r of rows) lookupByKey.set(r.merchantKey, r);
  const result = new Map<string, MerchantMapping>();
  for (const [description, { v2, v1 }] of candidates) {
    const m = lookupByKey.get(v2) ?? lookupByKey.get(v1);
    if (m) result.set(description, m);
  }
  return result;
}

export function recordMerchantCategory(
  workspaceId: number,
  description: string,
  categoryId: number,
  kind: CategoryKind,
  source: "user" | "approved-ai",
): void {
  const key = normalizeMerchant(description);
  if (!key) return;
  getDb()
    .prepare(
      `INSERT INTO merchant_categories
         (workspace_id, merchant_key, category_id, kind, source, hit_count)
       VALUES (?, ?, ?, ?, ?, 0)
       ON CONFLICT(workspace_id, merchant_key) DO UPDATE SET
         category_id = excluded.category_id,
         kind = excluded.kind,
         source = CASE
           WHEN merchant_categories.source = 'user' AND excluded.source = 'approved-ai'
             THEN 'user'
           ELSE excluded.source
         END,
         updated_at = datetime('now')`,
    )
    .run(workspaceId, key, categoryId, kind, source);
}

export function incrementMerchantHits(workspaceId: number, merchantKeys: string[]): void {
  if (merchantKeys.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(
    "UPDATE merchant_categories SET hit_count = hit_count + 1 WHERE workspace_id = ? AND merchant_key = ?",
  );
  db.transaction(() => {
    for (const k of merchantKeys) stmt.run(workspaceId, k);
  })();
}
