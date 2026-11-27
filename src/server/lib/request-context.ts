import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export interface RequestContext {
  requestId: string;
  workspaceId?: number;
  route: string;
  actor: string;
  startedAt: number;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

export function requestIdFrom(request: Request): string {
  const supplied = request.headers.get("x-request-id");
  if (supplied && REQUEST_ID_RE.test(supplied)) return supplied;
  return randomUUID();
}
