import "server-only";

import fs from "fs/promises";
import path from "path";
import { ApiError } from "@/server/lib/api-error";
import { getFolderImportConfig } from "@/server/lib/folder-import";
import { getPendingFile, setPendingStatus } from "@/server/db/queries/imports";
import { parseImportFile, type ParseOptions, type ParseResult } from "@/server/lib/import/parse";

/** Only a path under the configured import folder may be read; nothing else is exposed. */
function assertInsideImportDir(filePath: string): void {
  const root = path.resolve(getFolderImportConfig().dir);
  const resolved = path.resolve(filePath);
  const relative = path.relative(root, resolved);
  const first = relative.split(path.sep)[0];
  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    ["ignored", "imported", "failed"].includes(first)
  )
    throw new ApiError("File is outside the import folder", 400, "badPath");
}

export async function parsePending(
  workspaceId: number,
  pendingId: number,
  options: ParseOptions = {},
): Promise<ParseResult> {
  const pending = getPendingFile(workspaceId, pendingId);
  if (!pending) throw new ApiError("Pending file not found", 404, "notFound");
  assertInsideImportDir(pending.path);
  return parseImportFile(
    workspaceId,
    { path: pending.path, fileName: pending.fileName, size: pending.size },
    options,
  );
}

export async function ignorePending(workspaceId: number, pendingId: number): Promise<void> {
  const pending = getPendingFile(workspaceId, pendingId);
  if (!pending) throw new ApiError("Pending file not found", 404, "notFound");
  assertInsideImportDir(pending.path);
  const root = path.resolve(getFolderImportConfig().dir);
  const targetDir = path.join(root, "ignored");
  await fs.mkdir(targetDir, { recursive: true });
  const ext = path.extname(pending.fileName);
  const stem = pending.fileName.slice(0, pending.fileName.length - ext.length);
  let target = path.join(targetDir, pending.fileName);
  for (let i = 1; i < 1000; i++) {
    try {
      await fs.access(target);
      target = path.join(targetDir, `${stem} (${i})${ext}`);
    } catch {
      break;
    }
  }
  try {
    await fs.rename(pending.path, target);
  } catch (error) {
    throw new ApiError(
      error instanceof Error
        ? `Could not move the file: ${error.message.slice(0, 200)}`
        : "Could not move the file",
      500,
      "moveFailed",
    );
  }
  setPendingStatus(workspaceId, pendingId, "ignored");
}

export function retryPending(workspaceId: number, pendingId: number): void {
  setPendingStatus(workspaceId, pendingId, "pending");
}

export function finishPending(workspaceId: number, pendingId: number): void {
  setPendingStatus(workspaceId, pendingId, "imported");
}
