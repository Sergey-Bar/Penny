import "server-only";

import type { JobHandler } from "./types";

const handlers = new Map<string, JobHandler>();

export function registerJobHandler(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
}

export function getJobHandler(type: string): JobHandler | null {
  return handlers.get(type) ?? null;
}
