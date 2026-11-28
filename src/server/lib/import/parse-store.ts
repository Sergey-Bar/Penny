import "server-only";

import { randomBytes } from "crypto";
import type { ImportDraftRow, ImportMapping, SignConvention } from "@/lib/import/types";

export interface StoredParse {
  workspaceId: number;
  createdAt: number;
  fileName: string;
  fileSha256: string | null;
  fileSize: number;
  format: string;
  sheetName: string;
  sheets: { name: string; hidden: boolean }[];
  headerRow: number;
  header: string[];
  mapping: ImportMapping;
  signConvention: SignConvention;
  dateOrder: "dmy" | "mdy" | "ymd";
  accountHint: { provider: string; kind: "bank" | "card"; label: string } | null;
  balance: { value: number; asOf: string; rowIndex: number } | null;
  date1904: boolean;
  drafts: ImportDraftRow[];
  warnings: { code: string }[];
}

const TTL_MS = 30 * 60 * 1000;
const store = new Map<string, StoredParse>();

/** Drop every expired parse, not only the id a request happened to visit. */
function sweepExpired(): void {
  const now = Date.now();
  for (const [id, parse] of store) {
    if (now - parse.createdAt > TTL_MS) store.delete(id);
  }
}

/** A random, workspace-scoped parse token; memory-only and gone on restart (the file stays pending). */
export function putParse(parse: Omit<StoredParse, "createdAt">): string {
  sweepExpired();
  const id = `p_${randomBytes(12).toString("hex")}`;
  store.set(id, { ...parse, createdAt: Date.now() });
  return id;
}

export function getParse(id: string, workspaceId: number): StoredParse | null {
  sweepExpired();
  const found = store.get(id);
  if (!found) return null;
  if (found.workspaceId !== workspaceId) return null;
  return found;
}

export function deleteParse(id: string): void {
  store.delete(id);
}
