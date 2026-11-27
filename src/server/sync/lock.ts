import "server-only";

import { randomUUID } from "node:crypto";
import { getDb } from "@/server/db";
import { acquireLock, heartbeatLock, isLockHeld, releaseLock } from "@/server/jobs/locks";

export type SyncLockKind = "manual" | "scheduled";

export interface SyncLease {
  (): void;
  owner: string;
  heartbeat: () => boolean;
}

const LOCK_NAME = "sync";
const CREDENTIAL_PREFIX = "sync:credential:";
const TTL_SECONDS = 300;

export class SyncBusyError extends Error {
  constructor() {
    super("A sync is already running.");
    this.name = "SyncBusyError";
  }
}

function credentialLockName(credentialId: number): string {
  return `${CREDENTIAL_PREFIX}${credentialId}`;
}

function hasLiveCredentialLock(): boolean {
  return !!getDb()
    .prepare(
      `SELECT 1 FROM runtime_locks
       WHERE name LIKE 'sync:credential:%' AND expires_at > datetime('now') LIMIT 1`,
    )
    .get();
}

export function isSyncRunning(): boolean {
  return isLockHeld(LOCK_NAME) || hasLiveCredentialLock();
}

/** Returns a leased handle, or null when another process/route already holds the sync mutex. */
export function tryAcquireSync(kind: SyncLockKind, ttlSeconds = TTL_SECONDS): SyncLease | null {
  if (isSyncRunning()) return null;
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

/**
 * Acquires a lock for one bank/card credential so different providers can sync in parallel
 * while preventing duplicate concurrent scrapes of the same credential.
 */
export function tryAcquireCredentialSync(
  credentialId: number,
  kind: SyncLockKind = "manual",
  ttlSeconds = TTL_SECONDS,
): SyncLease | null {
  if (isLockHeld(LOCK_NAME)) return null;
  const name = credentialLockName(credentialId);
  const owner = `${name}:${kind}:${process.pid}:${randomUUID()}`;
  if (!acquireLock(name, owner, ttlSeconds, { kind, credentialId, pid: process.pid })) return null;
  let released = false;
  const lease = (() => {
    if (released) return;
    released = true;
    releaseLock(name, owner);
  }) as SyncLease;
  lease.owner = owner;
  lease.heartbeat = () => heartbeatLock(name, owner, ttlSeconds);
  return lease;
}
