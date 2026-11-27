import { NextResponse } from "next/server";
import { deleteWorkspace, getWorkspace, updateWorkspace } from "@/server/db/queries/workspaces";
import { parseAvatar } from "@/lib/profile-avatar";
import { parseBackendMode } from "@/lib/backend-v2";
import { parsePipMode } from "@/lib/pip";
import { setWorkspaceBackendMode } from "@/server/lib/backend-mode";
import { setWorkspacePipMode } from "@/server/lib/pip-mode";
import { enqueueWorkspaceEnablement } from "@/server/jobs/schedule";
import { initJobWorker } from "@/server/jobs/worker";

import { errorResponse, handle, readJson } from "@/server/lib/api-error";

export const PATCH = handle(
  "workspaces/[id]",
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return NextResponse.json({ error: "invalid id" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await readJson(request);
    } catch {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }

    const name =
      typeof (body as { name?: unknown })?.name === "string" ? (body as { name: string }).name : "";
    const backendValue = (body as { backendV2?: unknown })?.backendV2;
    const backendMode = backendValue === undefined ? undefined : parseBackendMode(backendValue);
    const pipValue = (body as { pipV2?: unknown })?.pipV2;
    const pipMode = pipValue === undefined ? undefined : parsePipMode(pipValue);

    if (!getWorkspace(numericId)) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    if (backendValue !== undefined) {
      if (!backendMode)
        return NextResponse.json({ error: "backendV2 must be off, shadow or on" }, { status: 400 });
      setWorkspaceBackendMode(numericId, backendMode);
      if (backendMode !== "off") {
        enqueueWorkspaceEnablement(numericId);
        initJobWorker();
      }
    }

    if (pipValue !== undefined) {
      if (!pipMode) return NextResponse.json({ error: "pipV2 must be off or on" }, { status: 400 });
      setWorkspacePipMode(numericId, pipMode);
    }

    if (!name.trim()) {
      if (backendMode || pipMode)
        return NextResponse.json({
          success: true,
          ...(backendMode ? { backendV2: backendMode } : {}),
          ...(pipMode ? { pipV2: pipMode } : {}),
        });
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const avatar = parseAvatar(body);
    if ("error" in avatar) {
      return NextResponse.json({ error: avatar.error }, { status: 400 });
    }

    try {
      const ws = updateWorkspace(numericId, name, avatar);
      return NextResponse.json({
        ...ws,
        ...(backendMode ? { backendV2: backendMode } : {}),
        ...(pipMode ? { pipV2: pipMode } : {}),
      });
    } catch (err) {
      return errorResponse("workspaces", err);
    }
  },
);

export const DELETE = handle(
  "workspaces/[id]",
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return NextResponse.json({ error: "invalid id" }, { status: 400 });
    }

    if (!getWorkspace(numericId)) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    try {
      deleteWorkspace(numericId);
      return NextResponse.json({ success: true });
    } catch (err) {
      return errorResponse("workspaces", err);
    }
  },
);
