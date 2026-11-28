import { handle } from "@/server/lib/api-error";
import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { getPendingFile } from "@/server/db/queries/imports";
import { parseImportBytes, type ParseOptions } from "@/server/lib/import/parse";
import {
  assertBodySize,
  requireImportEditor,
  readBody,
  readBoundedFormData,
} from "@/server/lib/import/request";
import { parsePending } from "@/server/lib/import/pending";
import type { ImportMapping, SignConvention } from "@/lib/import/types";
import { ApiError } from "@/server/lib/api-error";

type ParseBody = ParseOptions & {
  pendingId?: number;
  accountId?: number | null;
  sheetName?: string | null;
  headerRow?: number | null;
  mapping?: Partial<ImportMapping> | null;
  signConvention?: SignConvention | null;
  offset?: number;
  limit?: number;
};

/**
 * POST /api/import/parse
 * - JSON: { pendingId, sheetName, headerRow, mapping, ... } parses a folder file on the server.
 * - multipart/form-data: file + options, for browsers without DecompressionStream.
 * Uploads normally parse in a Worker with the same module; this is the fallback.
 */
export const POST = handle("import/parse", async (request: Request) => {
  const workspaceId = getWorkspaceIdFromRequest(request);
  requireImportEditor(request, workspaceId);
  assertBodySize(request);
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await readBoundedFormData(request);
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError("file is required", 400, "noRows");
    const options = parseOptions(form.get("options"));
    const bytes = new Uint8Array(await file.arrayBuffer());
    return NextResponse.json(
      await parseImportBytes(workspaceId, { bytes, name: file.name }, options),
    );
  }
  const body = await readBody<ParseBody>(request);
  if (body.pendingId != null) {
    const pending = getPendingFile(workspaceId, body.pendingId);
    if (!pending) throw new ApiError("Pending file not found", 404, "notFound");
    return NextResponse.json(await parsePending(workspaceId, body.pendingId, body));
  }
  throw new ApiError("pendingId or a file is required", 400, "noRows");
});

function parseOptions(raw: FormDataEntryValue | null): ParseOptions {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    return JSON.parse(raw) as ParseOptions;
  } catch {
    return {};
  }
}

export type { ParseOptions };
