import "server-only";

import { randomUUID } from "crypto";
import { ApiError } from "@/server/lib/api-error";
import { getDb } from "@/server/db";
import { getAllCategories } from "@/server/db/queries/categories";
import { getAccount, upsertAccountBalance } from "@/server/db/queries/accounts";
import {
  createImportBatch,
  createLegacySyncRun,
  finalizeBatch,
  findBatchBySha,
  getBatchByClientToken,
  getImportBatch,
  insertBatchRow,
  storedImportCandidates,
} from "@/server/db/queries/imports";
import { getAppSettings } from "@/server/db/queries/settings";
import { computeDedupHash } from "@/server/lib/dedup";
import { incrementMerchantHits, recordMerchantCategory } from "@/server/lib/merchant-memory";
import { normalizeMerchant } from "@/lib/merchant-normalize";
import { categorizeLocally } from "@/server/sync/categorize-local";
import { reconcileFlows } from "@/server/finance/pairing";
import { matchStored, type DedupeRow, type StoredCandidate } from "@/lib/import/dedupe";
import { isFatal, validateNormalizedRow } from "@/lib/import/validate";
import type { ImportKind, ImportOrigin, NormalizedRow, SaveImportResult } from "@/lib/import/types";
import { categorizeImportRows, importRuleMatches } from "@/server/lib/import/categorize";
import { getBackendMode } from "@/server/lib/backend-mode";
import { enqueueJob } from "@/server/jobs/queue";

export interface SaveImportInput {
  workspaceId: number;
  accountId: number;
  origin: ImportOrigin;
  rows: readonly NormalizedRow[];
  fileName?: string | null;
  fileSha256?: string | null;
  fileSize?: number | null;
  sourceFormat?: string | null;
  groupId?: string | null;
  chunkIndex?: number | null;
  clientToken?: string | null;
  mappingJson?: string | null;
  headerJson?: string | null;
  profileFingerprint?: string | null;
  balance?: { value: number; asOf: string } | null;
  /** A file hash that was already imported is rejected unless forced. */
  force?: boolean;
  /** The route already returned 409 with the existing batch. */
  allowAlreadyImported?: boolean;
  /** Possible duplicates are skipped unless the user explicitly asked to include them. */
  includePossible?: boolean;
}

const REVIEW_CODES = new Set([
  "signAmbiguous",
  "kindAmbiguous",
  "cardBillSuggested",
  "transferSuggested",
  "refundSuggested",
  "possibleDuplicate",
]);

const round = (n: number) => Math.round(n * 100) / 100;

const ruleKindSigned = (row: NormalizedRow, kind: ImportKind): number => {
  if (kind === "expense") return row.refund ? row.amount : -row.amount;
  if (kind === "income") return row.amount;
  return row.signedAmount;
};

/**
 * Writes one batch: a legacy sync_run for compatibility, the batch and its rows, the
 * transactions, tags/owner/business share, the balance, and the merchant memory learned from
 * the decisions. Every row ends as added, duplicate, skipped or error with a reason.
 */
export function saveImport(input: SaveImportInput): SaveImportResult {
  const account = getAccount(input.workspaceId, input.accountId);
  if (!account) throw new ApiError("account is required", 400, "accountMissing");

  if (input.fileSha256 && input.force !== true && input.allowAlreadyImported !== true) {
    const existing = findBatchBySha(input.workspaceId, input.fileSha256, input.accountId);
    if (existing) throw new ApiError("This file was already imported", 409, "alreadyImported");
  }

  if (input.clientToken) {
    const existing = getBatchByClientToken(input.workspaceId, input.clientToken);
    if (existing && existing.status !== "undone")
      return resultFromBatch(existing.id, existing.groupId, existing);
  }

  const members = getAppSettings(input.workspaceId).household.members.map((m) => m.id);
  const rows = [...input.rows];
  const ruleMatches = importRuleMatches(
    input.workspaceId,
    rows.map((row) => ({
      description: row.description,
      signedAmount: row.signedAmount,
      accountId: input.accountId,
    })),
  );
  rows.forEach((row, index) => {
    const rule = ruleMatches.get(index);
    if (!rule?.kind) return;
    if (row.kindSource === "user") return;
    row.kind = rule.kind;
    row.kindSource = "rule";
    row.signedAmount = round(ruleKindSigned(row, rule.kind));
  });

  const categoryKinds = new Map(
    (getAllCategories(input.workspaceId) as { id: number; kind: "expense" | "income" }[]).map(
      (c) => [c.id, c.kind],
    ),
  );
  const validation = rows.map((row) =>
    validateNormalizedRow(row, {
      memberIds: members,
      categoryKind: (id) => categoryKinds.get(id) ?? null,
      accountExists: (id) => getAccount(input.workspaceId, id) != null,
    }),
  );

  const dedupeRows: DedupeRow[] = rows.map((row) => ({
    accountId: account.id,
    date: row.date,
    description: row.description,
    signedAmount: row.signedAmount,
    identifier: row.identifier,
    installmentNumber: row.installmentNumber,
    installmentTotal: row.installmentTotal,
  }));
  const dates = rows.map((r) => r.date).sort((a, b) => a.localeCompare(b));
  const stored: StoredCandidate[] = dates.length
    ? (storedImportCandidates(
        input.workspaceId,
        account.id,
        account.number,
        dates[0],
        dates[dates.length - 1],
      ) as StoredCandidate[])
    : [];
  const matches = matchStored(dedupeRows, stored);
  const decisions = categorizeImportRows(
    input.workspaceId,
    rows.map((row, index) => ({
      rowIndex: index,
      accountId: account.id,
      description: row.description,
      kind: row.kind,
      refund: row.refund,
      signedAmount: row.signedAmount,
      categoryId: row.categoryId,
    })),
  );

  const syncRunId = createLegacySyncRun(input.workspaceId, input.fileName ?? null);
  const groupId = input.groupId ?? `g_${randomUUID()}`;
  const batchId = createImportBatch({
    workspaceId: input.workspaceId,
    accountId: account.id,
    syncRunId,
    origin: input.origin,
    fileName: input.fileName,
    fileSha256: input.fileSha256,
    fileSize: input.fileSize,
    sourceFormat: input.sourceFormat,
    profileFingerprint: input.profileFingerprint,
    mappingJson: input.mappingJson,
    headerJson: input.headerJson,
    groupId,
    chunkIndex: input.chunkIndex ?? 0,
    clientToken: input.clientToken,
  });

  const provider =
    account.provider === "cash" || account.provider === "manual" || account.isManual
      ? "cash"
      : "file";
  const origin = provider === "cash" ? "manual" : "file";
  const db = getDb();
  const hashCounts = new Map<string, number>();
  const outcomes: SaveImportResult["rows"] = [];
  const counts = { added: 0, duplicates: 0, skipped: 0, errors: 0, adopted: 0 };
  const learned: {
    description: string;
    categoryId: number;
    kind: "expense" | "income";
    source: string;
  }[] = [];

  const insert = db.prepare(
    `INSERT INTO transactions (
       workspace_id, account_number, account_id, date, processed_date, original_amount, original_currency,
       charged_amount, charged_currency, description, memo, type, status, identifier, installment_number,
       installment_total, category_id, category_source, provider, sync_run_id, dedup_hash, dedup_sequence,
       kind, needs_review, business_share_pct, owner, origin, import_batch_id, import_row_index,
       kind_source, memo_source, category_origin, merchant_key
     ) VALUES (
       @workspaceId, @accountNumber, @accountId, @date, @processedDate, @originalAmount, @originalCurrency,
       @chargedAmount, @chargedCurrency, @description, @memo, @type, 'completed', @identifier, @installmentNumber,
       @installmentTotal, @categoryId, @categorySource, @provider, @syncRunId, @dedupHash, @dedupSequence,
       @kind, @needsReview, @businessSharePct, @owner, @origin, @importBatchId, @importRowIndex,
       @kindSource, @memoSource, @categoryOrigin, @merchantKey
     )
     ON CONFLICT(workspace_id, dedup_hash, dedup_sequence) DO NOTHING`,
  );
  const insertTag = db.prepare(
    "INSERT OR IGNORE INTO transaction_tags (workspace_id, transaction_id, tag) VALUES (?, ?, ?)",
  );

  db.transaction(() => {
    rows.forEach((row, index) => {
      const reasons = validation[index];
      if (isFatal(reasons)) {
        counts.errors++;
        outcomes.push({
          rowIndex: row.rowIndex,
          status: "error",
          code: reasons.find((r) => isFatal([r]))?.code ?? "error",
          detail: reasons.map((r) => r.code).join(","),
        });
        insertBatchRow({
          batchId,
          transactionId: null,
          rowIndex: row.rowIndex,
          status: "error",
          reasonCode: reasons.find((r) => isFatal([r]))?.code ?? null,
          reasonDetail: reasons.map((r) => r.code).join(","),
        });
        return;
      }
      const match = matches[index];
      if (match.status === "possibleDuplicate" && input.includePossible !== true) {
        counts.skipped++;
        outcomes.push({ rowIndex: row.rowIndex, status: "skipped", code: "possibleDuplicate" });
        insertBatchRow({
          batchId,
          transactionId: null,
          rowIndex: row.rowIndex,
          status: "skipped",
          reasonCode: "possibleDuplicate",
        });
        return;
      }
      if (match.status === "duplicate") {
        counts.duplicates++;
        outcomes.push({ rowIndex: row.rowIndex, status: "duplicate", code: "duplicate" });
        insertBatchRow({
          batchId,
          transactionId: null,
          rowIndex: row.rowIndex,
          status: "duplicate",
          reasonCode: "duplicate",
          reasonDetail: match.matchedId ? `matched ${match.matchedId}` : null,
        });
        return;
      }

      const decision = decisions.get(index);
      const categoryId = row.kind === "transfer" ? null : (decision?.categoryId ?? null);
      const categorySource =
        categoryId == null
          ? null
          : decision?.source === "ai"
            ? "ai"
            : decision?.source === "user"
              ? "user"
              : null;
      const review =
        row.kind !== "transfer" &&
        (categoryId == null ||
          row.confidence < 0.7 ||
          row.reasons.some((r) => REVIEW_CODES.has(r.code)) ||
          match.status === "possibleDuplicate");
      const hash = computeDedupHash({
        accountNumber: account.number,
        date: row.date,
        originalAmount: row.originalAmount ?? row.signedAmount,
        originalCurrency: row.originalCurrency ?? account.currency,
        description: row.description,
        identifier: row.identifier,
        installmentNumber: row.installmentNumber,
        installmentTotal: row.installmentTotal,
      });
      const sequence = hashCounts.get(hash) ?? 0;
      hashCounts.set(hash, sequence + 1);
      const memoSource = row.memo ? "user" : origin === "file" ? "file" : "user";
      const inserted = insert.run({
        workspaceId: input.workspaceId,
        accountNumber: account.number,
        accountId: account.id,
        date: row.date,
        processedDate: row.processedDate || row.date,
        originalAmount: row.originalAmount ?? row.signedAmount,
        originalCurrency: row.originalCurrency ?? account.currency,
        chargedAmount: row.signedAmount,
        chargedCurrency: account.currency,
        description: row.description,
        memo: row.memo,
        type: row.installmentTotal != null && row.installmentTotal > 1 ? "installments" : "normal",
        identifier: row.identifier,
        installmentNumber: row.installmentNumber,
        installmentTotal: row.installmentTotal,
        categoryId,
        categorySource,
        provider,
        syncRunId,
        dedupHash: hash,
        dedupSequence: sequence,
        kind: row.kind,
        needsReview: review ? 1 : 0,
        businessSharePct: row.businessSharePct,
        owner: row.owner,
        origin,
        importBatchId: batchId,
        importRowIndex: row.rowIndex,
        kindSource: row.kindSource,
        memoSource,
        categoryOrigin: categoryId == null ? "none" : (decision?.source ?? "none"),
        merchantKey: normalizeMerchant(row.description),
      });
      if (inserted.changes === 0) {
        counts.duplicates++;
        outcomes.push({ rowIndex: row.rowIndex, status: "duplicate", code: "duplicate" });
        insertBatchRow({
          batchId,
          transactionId: null,
          rowIndex: row.rowIndex,
          status: "duplicate",
          reasonCode: "duplicate",
        });
        return;
      }
      const transactionId = Number(inserted.lastInsertRowid);
      for (const tag of row.tags) insertTag.run(input.workspaceId, transactionId, tag);
      counts.added++;
      outcomes.push({ rowIndex: row.rowIndex, status: "added", transactionId });
      insertBatchRow({
        batchId,
        transactionId,
        rowIndex: row.rowIndex,
        status: "added",
        reasonCode: review ? "possibleDuplicate" : null,
      });
      if (
        categoryId != null &&
        decision &&
        decision.source !== "ai" &&
        decision.source !== "none"
      ) {
        learned.push({
          description: row.description,
          categoryId,
          kind: row.kind === "income" ? "income" : "expense",
          source: decision.source,
        });
      }
    });

    finalizeBatch(batchId, {
      added: counts.added,
      duplicates: counts.duplicates,
      skipped: counts.skipped,
      errors: counts.errors,
    });

    if (input.balance) {
      upsertAccountBalance({
        workspaceId: input.workspaceId,
        accountId: account.id,
        provider: account.provider,
        accountNumber: account.number,
        balance: input.balance.value,
        source: "file",
        asOf: input.balance.asOf,
      });
    }
  })();

  for (const item of learned) {
    recordMerchantCategory(input.workspaceId, item.description, item.categoryId, item.kind, "user");
    const key = normalizeMerchant(item.description);
    if (key && item.source === "memory") incrementMerchantHits(input.workspaceId, [key]);
  }

  const mode = getBackendMode(input.workspaceId);
  if (mode === "on" && counts.added + counts.adopted > 0) {
    enqueueJob({
      workspaceId: input.workspaceId,
      type: "import.finalize",
      payload: { workspaceId: input.workspaceId, batchId },
      idempotencyKey: `import.finalize:${batchId}`,
    });
  } else {
    if (learned.length > 0) categorizeLocally(input.workspaceId);
    reconcileFlows(input.workspaceId);
    if (mode === "shadow" && counts.added + counts.adopted > 0) {
      enqueueJob({
        workspaceId: input.workspaceId,
        type: "import.finalize",
        payload: { workspaceId: input.workspaceId, batchId },
        idempotencyKey: `import.finalize:${batchId}`,
        shadow: true,
      });
    }
  }

  const batch = getImportBatch(input.workspaceId, batchId);
  return resultFromBatch(batchId, groupId, batch, outcomes, counts);
}

function resultFromBatch(
  batchId: number,
  groupId: string | null,
  batch: { added: number; duplicates: number; skipped: number; errors: number } | null,
  rows: SaveImportResult["rows"] = [],
  counts = { added: 0, duplicates: 0, skipped: 0, errors: 0, adopted: 0 },
): SaveImportResult {
  return {
    importId: batchId,
    batchId,
    groupId,
    added: batch?.added ?? counts.added,
    duplicates: batch?.duplicates ?? counts.duplicates,
    skipped: batch?.skipped ?? counts.skipped,
    errors: batch?.errors ?? counts.errors,
    adopted: counts.adopted,
    rows,
  };
}
