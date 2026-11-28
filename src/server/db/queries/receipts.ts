import "server-only";

import fs from "node:fs";
import path from "node:path";
import { getDb } from "../index";
import { dataDir } from "../../lib/data-dir";
import { FILE_MIME, MAX_INSURANCE_FILE, safeFileName } from "./insurance";

export interface Receipt {
  id: number;
  transactionId: number;
  fileName: string;
  originalName: string;
  mime: string;
  size: number;
  uploadedAt: string;
}

export const RECEIPT_MIME = Object.keys(FILE_MIME);
export const MAX_RECEIPT_FILE = MAX_INSURANCE_FILE;

const COLUMNS =
  "id, transaction_id as transactionId, file_name as fileName, original_name as originalName, mime, size, uploaded_at as uploadedAt";
const folderOf = (workspaceId: number, transactionId: number) =>
  path.join(dataDir(), "receipts", String(workspaceId), String(transactionId));

export function listReceipts(workspaceId: number, transactionId: number): Receipt[] {
  return getDb()
    .prepare(
      `SELECT ${COLUMNS} FROM transaction_receipts WHERE workspace_id = ? AND transaction_id = ? ORDER BY id`,
    )
    .all(workspaceId, transactionId) as Receipt[];
}

export function addReceipt(
  workspaceId: number,
  transactionId: number,
  file: { name: string; mime: string; data: Buffer },
): Receipt | null {
  const db = getDb();
  if (
    !db
      .prepare("SELECT 1 FROM transactions WHERE workspace_id = ? AND id = ?")
      .get(workspaceId, transactionId)
  )
    return null;
  const ext = FILE_MIME[file.mime];
  if (!ext || !file.data.length || file.data.length > MAX_RECEIPT_FILE) return null;
  const id = Number(
    db
      .prepare(
        "INSERT INTO transaction_receipts (workspace_id, transaction_id, file_name, original_name, mime, size) VALUES (?, ?, '', ?, ?, ?)",
      )
      .run(workspaceId, transactionId, file.name.slice(0, 200), file.mime, file.data.length)
      .lastInsertRowid,
  );
  const fileName = `${id}-${safeFileName(file.name)}.${ext}`;
  const folder = folderOf(workspaceId, transactionId);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, fileName), file.data);
  db.prepare("UPDATE transaction_receipts SET file_name = ? WHERE id = ?").run(fileName, id);
  return getReceipt(workspaceId, id);
}

export function getReceipt(workspaceId: number, id: number): Receipt | null {
  return (
    (getDb()
      .prepare(`SELECT ${COLUMNS} FROM transaction_receipts WHERE workspace_id = ? AND id = ?`)
      .get(workspaceId, id) as Receipt | undefined) ?? null
  );
}

/** The file on disk, or null. The path is built from stored values only and must stay inside the folder. */
export function receiptFile(workspaceId: number, r: Receipt): string | null {
  const file = receiptPath(workspaceId, r);
  return file && fs.existsSync(file) ? file : null;
}

/** The file's expected path even if it is already missing, for post-commit cleanup. */
export function receiptPath(workspaceId: number, r: Receipt): string | null {
  const folder = path.resolve(folderOf(workspaceId, r.transactionId));
  const file = path.resolve(folder, r.fileName);
  if (!file.startsWith(folder + path.sep)) return null;
  return file;
}

/** Delete the record only; the caller queues the file for cleanup after its transaction commits. */
export function deleteReceiptRecord(workspaceId: number, id: number): Receipt | null {
  const r = getReceipt(workspaceId, id);
  if (!r) return null;
  getDb()
    .prepare("DELETE FROM transaction_receipts WHERE workspace_id = ? AND id = ?")
    .run(workspaceId, id);
  return r;
}

export function queueFileCleanup(filePath: string): void {
  getDb().prepare("INSERT OR IGNORE INTO pending_file_cleanup (path) VALUES (?)").run(filePath);
}

/** Retry queued unlinks. A failure keeps the row for the next sweep instead of losing the path. */
export function processFileCleanup(limit = 200): number {
  const db = getDb();
  const receiptsRoot = path.resolve(dataDir(), "receipts");
  const rows = db
    // Fair retry order: paths that failed often go to the back, so a stuck entry cannot starve
    // newer ones out of every sweep.
    .prepare("SELECT id, path FROM pending_file_cleanup ORDER BY attempts, id LIMIT ?")
    .all(limit) as { id: number; path: string }[];
  if (rows.length === 0) return 0;
  let removed = 0;
  for (const row of rows) {
    const target = path.resolve(row.path);
    // A restored or crafted database must not be able to unlink arbitrary host files through the
    // cleanup queue. Only paths under data/receipts are removable.
    if (!target.startsWith(receiptsRoot + path.sep)) {
      db.prepare("DELETE FROM pending_file_cleanup WHERE id = ?").run(row.id);
      continue;
    }
    try {
      fs.rmSync(target, { force: true });
      db.prepare("DELETE FROM pending_file_cleanup WHERE id = ?").run(row.id);
      removed++;
    } catch (error) {
      db.prepare(
        "UPDATE pending_file_cleanup SET attempts = attempts + 1, last_error = ? WHERE id = ?",
      ).run(error instanceof Error ? error.message.slice(0, 300) : "unlink failed", row.id);
    }
  }
  return removed;
}

export function deleteReceipt(workspaceId: number, id: number): boolean {
  const db = getDb();
  const deleted = db.transaction(() => {
    const r = deleteReceiptRecord(workspaceId, id);
    if (!r) return false;
    const file = receiptPath(workspaceId, r);
    if (file) queueFileCleanup(file);
    return true;
  })();
  if (deleted) processFileCleanup();
  return deleted;
}
