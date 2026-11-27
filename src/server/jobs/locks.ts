import "server-only";

import { getDb } from "@/server/db";

export interface RuntimeLock {
  name: string;
  owner: string;
  acquired_at: string;
  heartbeat_at: string;
  expires_at: string;
  meta_json: string | null;
}

export function sqlTime(ms = Date.now()): string {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

export function sqlTimeAfter(seconds: number, from = Date.now()): string {
  return sqlTime(from + seconds * 1000);
}

/**
 * Acquires a named lease in runtime_locks. An expired lease is taken over; a live one is left
 * alone. Returns true only when this owner now holds it.
 */
export function acquireLock(
  name: string,
  owner: string,
  ttlSeconds: number,
  meta?: Record<string, unknown>,
): boolean {
  const db = getDb();
  return db
    .transaction(() => {
      const now = sqlTime();
      const expires = sqlTimeAfter(ttlSeconds);
      const metaJson = meta ? JSON.stringify(meta) : null;
      const inserted = db
        .prepare(
          `INSERT INTO runtime_locks (name, owner, acquired_at, heartbeat_at, expires_at, meta_json)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           owner = excluded.owner,
           acquired_at = excluded.acquired_at,
           heartbeat_at = excluded.heartbeat_at,
           expires_at = excluded.expires_at,
           meta_json = excluded.meta_json
         WHERE runtime_locks.expires_at < ? OR runtime_locks.owner = excluded.owner`,
        )
        .run(name, owner, now, now, expires, metaJson, now);
      if (inserted.changes === 0) return false;
      const row = db.prepare("SELECT owner FROM runtime_locks WHERE name = ?").get(name) as
        { owner: string } | undefined;
      return row?.owner === owner;
    })
    .immediate();
}

export function heartbeatLock(name: string, owner: string, ttlSeconds: number): boolean {
  const now = sqlTime();
  return (
    getDb()
      .prepare(
        `UPDATE runtime_locks
         SET heartbeat_at = ?, expires_at = ?
         WHERE name = ? AND owner = ?`,
      )
      .run(now, sqlTimeAfter(ttlSeconds), name, owner).changes > 0
  );
}

export function releaseLock(name: string, owner: string): void {
  getDb().prepare("DELETE FROM runtime_locks WHERE name = ? AND owner = ?").run(name, owner);
}

export function getLock(name: string): RuntimeLock | null {
  return (
    (getDb().prepare("SELECT * FROM runtime_locks WHERE name = ?").get(name) as
      RuntimeLock | undefined) ?? null
  );
}

export function isLockHeld(name: string): boolean {
  const lock = getLock(name);
  if (!lock) return false;
  return lock.expires_at > sqlTime();
}

export function pruneExpiredLocks(): number {
  return getDb().prepare("DELETE FROM runtime_locks WHERE expires_at < ?").run(sqlTime()).changes;
}
