import "server-only";

import { randomUUID } from "node:crypto";
import { acquireLock, heartbeatLock, isLockHeld, releaseLock } from "@/server/jobs/locks";

export type SyncLockKind = "manual" | "scheduled";

export interface SyncLease {
  (): void;
  owner: string;
  heartbeat: () => boolean;
}

const LOCK_NAME = "sync";
const TTL_SECONDS = 300;

export class SyncBusyError extends Error {
  constructor() {
    super("A sync is already running.");
    this.name = "SyncBusyError";
  }
}

export function isSyncRunning(): boolean {
  return isLockHeld(LOCK_NAME);
}

/** Returns a leased handle, or null when another process/route already holds the sync mutex. */
export function tryAcquireSync(kind: SyncLockKind, ttlSeconds = TTL_SECONDS): SyncLease | null {
  const owner = `sync:${kind}:${process.pid}:${randomUUID()}`;
  if (!acquireLock(LOCK_NAME, owner, ttlSeconds, { kind, pid: process.pid })) return null;
  let released = false;
  const lease = (() => {
    if (released) return;
    released = true;
    releaseLock(LOCK_NAME, owner);
  }) as SyncLease;
  lease.owner = owner;
  lease.heartbeat = () => heartbeatLock(LOCK_NAME, owner, ttlSeconds);
  return lease;
}
