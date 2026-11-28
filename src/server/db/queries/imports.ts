import "server-only";

import { getDb } from "@/server/db";
import {
  deleteReceiptRecord,
  listReceipts,
  processFileCleanup,
  queueFileCleanup,
  receiptPath,
} from "@/server/db/queries/receipts";
import { incrementMerchantHits, recordMerchantCategory } from "@/server/lib/merchant-memory";
import { normalizeMerchant } from "@/lib/merchant-normalize";
import type { ImportReasonCode } from "@/lib/import/types";

export type ImportOrigin = "upload" | "paste" | "folder" | "text" | "document" | "sheet";
export type BatchStatus = "saved" | "partial" | "undone" | "failed";

export interface ImportBatch {
  id: number;
  workspaceId: number;
  accountId: number | null;
  syncRunId: number | null;
  legacySheetImportId: number | null;
  groupId: string | null;
  chunkIndex: number | null;
  origin: ImportOrigin;
  fileName: string | null;
  fileSha256: string | null;
  fileSize: number | null;
  sourceFormat: string | null;
  profileFingerprint: string | null;
  mappingJson: string | null;
  headerJson: string | null;
  status: BatchStatus;
  added: number;
  duplicates: number;
  skipped: number;
  errors: number;
  balanceAsOf: string | null;
  balanceValue: number | null;
  clientToken: string | null;
  postCommitStatus: "pending" | "running" | "completed" | "failed";
  postCommitError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportBatchRow {
  id: number;
  batchId: number;
  transactionId: number | null;
  rowIndex: number;
  status: "added" | "duplicate" | "skipped" | "error" | "possibleDuplicate" | "adopted";
  reasonCode: string | null;
  reasonDetail: string | null;
  rawJson: string | null;
  createdAt: string;
}

const BATCH_COLUMNS = `id, workspace_id as workspaceId, account_id as accountId, sync_run_id as syncRunId,
  legacy_sheet_import_id as legacySheetImportId, group_id as groupId, chunk_index as chunkIndex, origin,
  file_name as fileName, file_sha256 as fileSha256, file_size as fileSize, source_format as sourceFormat,
  profile_fingerprint as profileFingerprint, mapping_json as mappingJson, header_json as headerJson,
  status, added, duplicates, skipped, errors, balance_as_of as balanceAsOf, balance_value as balanceValue,
  client_token as clientToken, post_commit_status as postCommitStatus, post_commit_error as postCommitError,
  created_at as createdAt, updated_at as updatedAt`;

/** A matching legacy sync_runs row, so transactions.sync_run_id (NOT NULL) keeps working. */
export function createLegacySyncRun(
  workspaceId: number,
  fileName: string | null,
  provider = "file",
): number {
  return Number(
    getDb()
      .prepare(
        `INSERT INTO sync_runs (workspace_id, provider, started_at, completed_at, status, scrape_from_date, file_name)
         VALUES (?, ?, datetime('now'), datetime('now'), 'completed', '1970-01-01', ?)`,
      )
      .run(workspaceId, provider, fileName).lastInsertRowid,
  );
}

export interface CreateBatchInput {
  workspaceId: number;
  accountId: number | null;
  syncRunId: number | null;
  origin: ImportOrigin;
  fileName?: string | null;
  fileSha256?: string | null;
  fileSize?: number | null;
  sourceFormat?: string | null;
  profileFingerprint?: string | null;
  mappingJson?: string | null;
  headerJson?: string | null;
  groupId?: string | null;
  chunkIndex?: number | null;
  clientToken?: string | null;
  status?: BatchStatus;
  postCommitStatus?: ImportBatch["postCommitStatus"];
}

export function createImportBatch(input: CreateBatchInput): number {
  return Number(
    getDb()
      .prepare(
        `INSERT INTO import_batches
           (workspace_id, account_id, sync_run_id, origin, file_name, file_sha256, file_size, source_format,
            profile_fingerprint, mapping_json, header_json, group_id, chunk_index, client_token, status,
            post_commit_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.workspaceId,
        input.accountId,
        input.syncRunId,
        input.origin,
        input.fileName ?? null,
        input.fileSha256 ?? null,
        input.fileSize ?? null,
        input.sourceFormat ?? null,
        input.profileFingerprint ?? null,
        input.mappingJson ?? null,
        input.headerJson ?? null,
        input.groupId ?? null,
        input.chunkIndex ?? null,
        input.clientToken ?? null,
        input.status ?? "saved",
        input.postCommitStatus ?? "completed",
      ).lastInsertRowid,
  );
}

export function insertBatchRow(input: {
  batchId: number;
  transactionId: number | null;
  rowIndex: number;
  status: ImportBatchRow["status"];
  reasonCode?: ImportReasonCode | string | null;
  reasonDetail?: string | null;
  rawJson?: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO import_batch_rows
         (batch_id, transaction_id, row_index, status, reason_code, reason_detail, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.batchId,
      input.transactionId,
      input.rowIndex,
      input.status,
      input.reasonCode ?? null,
      input.reasonDetail ?? null,
      input.rawJson ?? null,
    );
}

export function finalizeBatch(
  workspaceId: number,
  id: number,
  counts: { added: number; duplicates: number; skipped: number; errors: number },
  status: BatchStatus = counts.errors > 0 && counts.added === 0 ? "failed" : "saved",
): void {
  getDb()
    .prepare(
      `UPDATE import_batches SET added = ?, duplicates = ?, skipped = ?, errors = ?, status = ?, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`,
    )
    .run(counts.added, counts.duplicates, counts.skipped, counts.errors, status, workspaceId, id);
}

export function setBatchPostCommitStatus(
  workspaceId: number,
  id: number,
  status: ImportBatch["postCommitStatus"],
  error: string | null = null,
): void {
  getDb()
    .prepare(
      `UPDATE import_batches SET post_commit_status = ?, post_commit_error = ?, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`,
    )
    .run(status, error, workspaceId, id);
}

/**
 * Relearn the merchant memory a batch represents. Idempotent: the mapping upsert and hit
 * recount can run again after a crash or a client-token replay without double-writing rows.
 */
export function learnMerchantMemoryForBatch(
  workspaceId: number,
  batchId: number,
  options: { incrementHits?: boolean } = {},
): number {
  const rows = getDb()
    .prepare(
      `SELECT description, category_id as categoryId, kind, category_origin as categoryOrigin
       FROM transactions
       WHERE workspace_id = ? AND import_batch_id = ? AND category_id IS NOT NULL
         AND kind IN ('expense','income')
         AND category_origin IN ('user','rule','memory','file','dictionary','pattern')`,
    )
    .all(workspaceId, batchId) as {
    description: string;
    categoryId: number;
    kind: "expense" | "income";
    categoryOrigin: string;
  }[];
  const memoryKeys: string[] = [];
  for (const row of rows) {
    recordMerchantCategory(workspaceId, row.description, row.categoryId, row.kind, "user");
    if (row.categoryOrigin === "memory") {
      const key = normalizeMerchant(row.description);
      if (key) memoryKeys.push(key);
    }
  }
  if (options.incrementHits !== false) incrementMerchantHits(workspaceId, memoryKeys);
  return rows.length;
}

export function getImportBatch(workspaceId: number, id: number): ImportBatch | null {
  return (
    (getDb()
      .prepare(`SELECT ${BATCH_COLUMNS} FROM import_batches WHERE workspace_id = ? AND id = ?`)
      .get(workspaceId, id) as ImportBatch | undefined) ?? null
  );
}

export function getBatchByClientToken(workspaceId: number, token: string): ImportBatch | null {
  return (
    (getDb()
      .prepare(
        `SELECT ${BATCH_COLUMNS} FROM import_batches WHERE workspace_id = ? AND client_token = ?`,
      )
      .get(workspaceId, token) as ImportBatch | undefined) ?? null
  );
}

export function findBatchBySyncRun(workspaceId: number, syncRunId: number): ImportBatch | null {
  return (
    (getDb()
      .prepare(
        `SELECT ${BATCH_COLUMNS} FROM import_batches WHERE workspace_id = ? AND sync_run_id = ?`,
      )
      .get(workspaceId, syncRunId) as ImportBatch | undefined) ?? null
  );
}

export function findBatchBySha(
  workspaceId: number,
  sha: string,
  accountId?: number | null,
): ImportBatch | null {
  const row = (
    accountId == null
      ? getDb()
          .prepare(
            `SELECT ${BATCH_COLUMNS} FROM import_batches
             WHERE workspace_id = ? AND file_sha256 = ? AND status != 'undone'
             ORDER BY id DESC LIMIT 1`,
          )
          .get(workspaceId, sha)
      : getDb()
          .prepare(
            `SELECT ${BATCH_COLUMNS} FROM import_batches
             WHERE workspace_id = ? AND file_sha256 = ? AND account_id = ? AND status != 'undone'
             ORDER BY id DESC LIMIT 1`,
          )
          .get(workspaceId, sha, accountId)
  ) as ImportBatch | undefined;
  return row ?? null;
}

export function listImportBatchRows(workspaceId: number, batchId: number): ImportBatchRow[] {
  return getDb()
    .prepare(
      `SELECT r.id, r.batch_id as batchId, r.transaction_id as transactionId, r.row_index as rowIndex,
              r.status, r.reason_code as reasonCode, r.reason_detail as reasonDetail,
              r.raw_json as rawJson, r.created_at as createdAt
       FROM import_batch_rows r
       JOIN import_batches b ON b.id = r.batch_id AND b.workspace_id = ?
       WHERE r.batch_id = ? ORDER BY r.row_index`,
    )
    .all(workspaceId, batchId) as ImportBatchRow[];
}

export function listImportBatches(
  workspaceId: number,
  limit = 50,
): (ImportBatch & {
  accountLabel: string | null;
  groupCount: number;
})[] {
  return getDb()
    .prepare(
      `SELECT ${BATCH_COLUMNS},
              (SELECT label FROM accounts a WHERE a.id = import_batches.account_id) AS accountLabel,
              (SELECT COUNT(*) FROM import_batches b2 WHERE b2.workspace_id = import_batches.workspace_id
                 AND b2.group_id = import_batches.group_id) AS groupCount
       FROM import_batches WHERE workspace_id = ? ORDER BY id DESC LIMIT ?`,
    )
    .all(workspaceId, limit) as (ImportBatch & {
    accountLabel: string | null;
    groupCount: number;
  })[];
}

export type BatchRef = number | string;

/**
 * Resolve a batch reference. A plain number or `batch-<id>` is a v2 batch ID only.
 * Legacy ids must say so: `sync-<id>` for a sync_run and `sheet-<id>` for a sheet import.
 * The namespace is what stops a legacy sync-run id from resolving to the same-numbered batch.
 */
export function resolveBatchId(workspaceId: number, ref: BatchRef): number | null {
  const db = getDb();
  let kind: "batch" | "sync" | "sheet" = "batch";
  let id: number;
  if (typeof ref === "number") {
    if (!Number.isInteger(ref) || ref <= 0) return null;
    id = ref;
  } else {
    const value = ref.trim();
    const match = /^(batch-|sync-|sheet-)?(\d+)$/.exec(value);
    if (!match) return null;
    if (match[1] === "sync-") kind = "sync";
    else if (match[1] === "sheet-") kind = "sheet";
    id = Number(match[2]);
    if (!Number.isInteger(id) || id <= 0) return null;
  }
  if (kind === "batch") {
    const row = db
      .prepare("SELECT id FROM import_batches WHERE workspace_id = ? AND id = ?")
      .get(workspaceId, id) as { id: number } | undefined;
    return row?.id ?? null;
  }
  if (kind === "sync") {
    const row = db
      .prepare(
        "SELECT id FROM import_batches WHERE workspace_id = ? AND sync_run_id = ? ORDER BY id DESC LIMIT 1",
      )
      .get(workspaceId, id) as { id: number } | undefined;
    return row?.id ?? null;
  }
  const row = db
    .prepare("SELECT id FROM import_batches WHERE workspace_id = ? AND legacy_sheet_import_id = ?")
    .get(workspaceId, id) as { id: number } | undefined;
  return row?.id ?? null;
}

interface DeletableRow {
  id: number;
}

/**
 * Rows this batch may delete: only imported rows (file/manual) that were not adopted by a sync.
 * An adopted row keeps the person's category, notes and tags and only loses the batch link.
 */
function deletableTransactions(workspaceId: number, batchIds: number[]): DeletableRow[] {
  if (batchIds.length === 0) return [];
  const placeholders = batchIds.map(() => "?").join(",");
  return getDb()
    .prepare(
      `SELECT id FROM transactions
       WHERE workspace_id = ? AND import_batch_id IN (${placeholders})
         AND origin IN ('file','manual') AND adopted_at IS NULL`,
    )
    .all(workspaceId, ...batchIds) as DeletableRow[];
}

function cleanDependencies(workspaceId: number, ids: number[]): void {
  if (ids.length === 0) return;
  const db = getDb();
  for (const id of ids) {
    for (const receipt of listReceipts(workspaceId, id)) {
      const deleted = deleteReceiptRecord(workspaceId, receipt.id);
      if (!deleted) continue;
      const file = receiptPath(workspaceId, deleted);
      if (file) queueFileCleanup(file);
    }
  }
  // Large group undos must stay under SQLite's bind-variable limit; every chunk is still
  // inside the caller's transaction, so the undo remains one unit.
  const CHUNK = 5000;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => "?").join(",");
    db.prepare(
      `DELETE FROM expense_shares WHERE workspace_id = ? AND transaction_id IN (${placeholders})`,
    ).run(workspaceId, ...chunk);
    db.prepare(
      `DELETE FROM flow_matches WHERE workspace_id = ? AND (primary_txn_id IN (${placeholders}) OR other_txn_id IN (${placeholders}))`,
    ).run(workspaceId, ...chunk, ...chunk);
    db.prepare(`DELETE FROM sheet_import_rows WHERE transaction_id IN (${placeholders})`).run(
      ...chunk,
    );
  }
}

export interface DeleteBatchResult {
  removed: number;
  keptAdopted: number;
  batches: number[];
  groupId: string | null;
}

/** Undo one batch or one chunk. `group` removes every chunk of a large file together. */
export function deleteImportBatch(
  workspaceId: number,
  batchId: number,
  options: { group?: boolean } = {},
): DeleteBatchResult {
  const db = getDb();
  const result = db.transaction(() => {
    const batch = getImportBatch(workspaceId, batchId);
    if (!batch) return { removed: 0, keptAdopted: 0, batches: [], groupId: null };
    const batches =
      options.group && batch.groupId
        ? (
            db
              .prepare("SELECT id FROM import_batches WHERE workspace_id = ? AND group_id = ?")
              .all(workspaceId, batch.groupId) as { id: number }[]
          ).map((r) => r.id)
        : [batchId];
    const placeholders = batches.map(() => "?").join(",");
    const adopted = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM transactions
           WHERE workspace_id = ? AND import_batch_id IN (${placeholders})
             AND (origin NOT IN ('file','manual') OR adopted_at IS NOT NULL)`,
        )
        .get(workspaceId, ...batches) as { n: number }
    ).n;
    db.prepare(
      `UPDATE transactions SET import_batch_id = NULL, import_row_index = NULL
       WHERE workspace_id = ? AND import_batch_id IN (${placeholders})
         AND (origin NOT IN ('file','manual') OR adopted_at IS NOT NULL)`,
    ).run(workspaceId, ...batches);
    const rows = deletableTransactions(workspaceId, batches);
    const ids = rows.map((r) => r.id);
    cleanDependencies(workspaceId, ids);
    if (ids.length > 0) {
      const tx = ids.map(() => "?").join(",");
      db.prepare(`DELETE FROM transactions WHERE workspace_id = ? AND id IN (${tx})`).run(
        workspaceId,
        ...ids,
      );
    }
    db.prepare(
      `UPDATE import_batches SET status = 'undone', updated_at = datetime('now') WHERE workspace_id = ? AND id IN (${placeholders})`,
    ).run(workspaceId, ...batches);
    return { removed: ids.length, keptAdopted: adopted, batches, groupId: batch.groupId ?? null };
  })();
  processFileCleanup();
  return result;
}

/** Per-row delete from the transactions list. Synced rows are hidden, not deleted. */
export function deleteImportedTransaction(
  workspaceId: number,
  id: number,
): "deleted" | "hidden" | "missing" {
  const db = getDb();
  const row = db
    .prepare("SELECT id, origin, adopted_at FROM transactions WHERE workspace_id = ? AND id = ?")
    .get(workspaceId, id) as { id: number; origin: string; adopted_at: string | null } | undefined;
  if (!row) return "missing";
  if (row.origin !== "file" && row.origin !== "manual") {
    db.prepare(
      "UPDATE transactions SET is_excluded = 1, updated_at = datetime('now') WHERE id = ?",
    ).run(id);
    return "hidden";
  }
  if (row.adopted_at) return "hidden";
  const result = db.transaction(() => {
    cleanDependencies(workspaceId, [id]);
    db.prepare("DELETE FROM transactions WHERE workspace_id = ? AND id = ?").run(workspaceId, id);
    return "deleted" as const;
  })();
  processFileCleanup();
  return result;
}

export type PendingStatus = "pending" | "imported" | "ignored" | "failed";

export interface PendingFile {
  id: number;
  workspaceId: number;
  path: string;
  fileName: string;
  fileSha256: string | null;
  size: number;
  mtimeMs: number;
  detectedFormat: string | null;
  reasonCode: string | null;
  status: PendingStatus;
  createdAt: string;
  updatedAt: string;
}

export function listPendingFiles(
  workspaceId: number,
  status: PendingStatus | "all" = "pending",
): PendingFile[] {
  const db = getDb();
  const rows =
    status === "all"
      ? db
          .prepare(
            `SELECT id, workspace_id as workspaceId, path, file_name as fileName, file_sha256 as fileSha256,
                    size, mtime_ms as mtimeMs, detected_format as detectedFormat, reason_code as reasonCode,
                    status, created_at as createdAt, updated_at as updatedAt
             FROM import_pending WHERE workspace_id = ? ORDER BY id DESC`,
          )
          .all(workspaceId)
      : db
          .prepare(
            `SELECT id, workspace_id as workspaceId, path, file_name as fileName, file_sha256 as fileSha256,
                    size, mtime_ms as mtimeMs, detected_format as detectedFormat, reason_code as reasonCode,
                    status, created_at as createdAt, updated_at as updatedAt
             FROM import_pending WHERE workspace_id = ? AND status = ? ORDER BY id DESC`,
          )
          .all(workspaceId, status);
  return rows as PendingFile[];
}

export function upsertPendingFile(input: {
  workspaceId: number;
  path: string;
  fileName: string;
  fileSha256: string | null;
  size: number;
  mtimeMs: number;
  detectedFormat: string | null;
  reasonCode: string | null;
  status?: PendingStatus;
}): number {
  const db = getDb();
  const existing = db
    .prepare("SELECT id, status FROM import_pending WHERE workspace_id = ? AND path = ?")
    .get(input.workspaceId, input.path) as { id: number; status: PendingStatus } | undefined;
  if (existing) {
    db.prepare(
      `UPDATE import_pending SET file_name = ?, file_sha256 = ?, size = ?, mtime_ms = ?, detected_format = ?,
         reason_code = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      input.fileName,
      input.fileSha256,
      input.size,
      input.mtimeMs,
      input.detectedFormat,
      input.reasonCode,
      existing.id,
    );
    return existing.id;
  }
  return Number(
    db
      .prepare(
        `INSERT INTO import_pending
           (workspace_id, path, file_name, file_sha256, size, mtime_ms, detected_format, reason_code, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.workspaceId,
        input.path,
        input.fileName,
        input.fileSha256,
        input.size,
        input.mtimeMs,
        input.detectedFormat,
        input.reasonCode,
        input.status ?? "pending",
      ).lastInsertRowid,
  );
}

export function setPendingStatus(workspaceId: number, id: number, status: PendingStatus): void {
  getDb()
    .prepare(
      "UPDATE import_pending SET status = ?, updated_at = datetime('now') WHERE workspace_id = ? AND id = ?",
    )
    .run(status, workspaceId, id);
}

export function getPendingFile(workspaceId: number, id: number): PendingFile | null {
  return (
    (getDb()
      .prepare(
        `SELECT id, workspace_id as workspaceId, path, file_name as fileName, file_sha256 as fileSha256,
                size, mtime_ms as mtimeMs, detected_format as detectedFormat, reason_code as reasonCode,
                status, created_at as createdAt, updated_at as updatedAt
         FROM import_pending WHERE workspace_id = ? AND id = ?`,
      )
      .get(workspaceId, id) as PendingFile | undefined) ?? null
  );
}

export function getImportProfileRow(workspaceId: number, key: string): string | null {
  const row = getDb()
    .prepare(
      "SELECT profile_json AS json FROM import_profiles WHERE workspace_id = ? AND profile_key = ?",
    )
    .get(workspaceId, key) as { json: string } | undefined;
  return row?.json ?? null;
}

export function putImportProfileRow(workspaceId: number, key: string, json: string): void {
  getDb()
    .prepare(
      `INSERT INTO import_profiles (workspace_id, profile_key, profile_json)
       VALUES (?, ?, ?)
       ON CONFLICT(workspace_id, profile_key) DO UPDATE SET
         profile_json = excluded.profile_json, updated_at = datetime('now')`,
    )
    .run(workspaceId, key, json);
}

export function listImportProfileRows(workspaceId: number): { key: string; json: string }[] {
  return getDb()
    .prepare(
      "SELECT profile_key AS key, profile_json AS json FROM import_profiles WHERE workspace_id = ? ORDER BY updated_at DESC",
    )
    .all(workspaceId) as { key: string; json: string }[];
}

export interface StoredImportCandidate {
  id: number;
  accountId: number;
  date: string;
  description: string;
  signedAmount: number;
  identifier: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
}

/** Stored rows of one account within a date range, for the duplicate scorer. */
export function storedImportCandidates(
  workspaceId: number,
  accountId: number,
  accountNumber: string,
  from: string,
  to: string,
): StoredImportCandidate[] {
  return getDb()
    .prepare(
      `SELECT id, COALESCE(account_id, ?) AS accountId, substr(date, 1, 10) AS date, description,
              charged_amount AS signedAmount, identifier, installment_number AS installmentNumber,
              installment_total AS installmentTotal
       FROM transactions
       WHERE workspace_id = ?
         AND (account_id = ? OR (account_id IS NULL AND account_number = ?))
         AND substr(date, 1, 10) BETWEEN date(?, '-1 day') AND date(?, '+1 day')`,
    )
    .all(accountId, workspaceId, accountId, accountNumber, from, to) as StoredImportCandidate[];
}

export function findGroupBatch(workspaceId: number, groupId: string): ImportBatch | null {
  return (
    (getDb()
      .prepare(
        `SELECT ${BATCH_COLUMNS} FROM import_batches
         WHERE workspace_id = ? AND group_id = ? ORDER BY chunk_index, id LIMIT 1`,
      )
      .get(workspaceId, groupId) as ImportBatch | undefined) ?? null
  );
}

export function listGroupBatches(workspaceId: number, groupId: string): ImportBatch[] {
  return getDb()
    .prepare(
      `SELECT ${BATCH_COLUMNS} FROM import_batches
       WHERE workspace_id = ? AND group_id = ? ORDER BY chunk_index, id`,
    )
    .all(workspaceId, groupId) as ImportBatch[];
}
