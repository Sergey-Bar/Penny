import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getDb } from "@/server/db";
import { dataDir } from "@/server/lib/data-dir";
import { logError } from "@/server/lib/log";
import { recordMetric } from "@/server/observability/metrics";

export const HOURLY_KEEP = 24;
const RESERVE_BYTES = 500 * 1024 * 1024;
const NAME_RE = /^penny-hourly-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}\.db$/;

export function hourlyBackupDir(dir = dataDir()): string {
  return path.join(dir, "backups", "hourly");
}

export interface LocalBackupStatus {
  status: "ok" | "skipped_disk" | "error";
  at: string | null;
  file: string | null;
  error: string | null;
  ageSeconds: number | null;
  count: number;
}

function diskFreeBytes(dir: string): number {
  try {
    const stats = fs.statfsSync(dir);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function listSnapshots(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => NAME_RE.test(name))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export function hourlyBackupStatus(dir = dataDir()): LocalBackupStatus {
  const files = listSnapshots(hourlyBackupDir(dir));
  const file = files.at(-1) ?? null;
  if (!file) {
    return {
      status: "error",
      at: null,
      file: null,
      error: "no snapshot",
      ageSeconds: null,
      count: 0,
    };
  }
  const full = path.join(hourlyBackupDir(dir), file);
  let at: number | null = null;
  try {
    at = fs.statSync(full).mtimeMs;
  } catch {
    at = null;
  }
  return {
    status: "ok",
    at: at == null ? null : new Date(at).toISOString(),
    file: full,
    error: null,
    ageSeconds: at == null ? null : Math.max(0, Math.round((Date.now() - at) / 1000)),
    count: files.length,
  };
}

function stamp(ms: number): string {
  return new Date(ms).toISOString().slice(0, 23).replace(/[:.]/g, "-");
}

function verify(file: string): number {
  const probe = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const check = probe.pragma("quick_check", { simple: true });
    if (check !== "ok") throw new Error(`quick_check: ${String(check)}`);
    const { n } = probe.prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number };
    return n;
  } finally {
    probe.close();
  }
}

/**
 * Hourly local snapshot through `VACUUM INTO`, owner-only and outside any write transaction.
 * The disk guard skips only below the reserve; callers record a skipped snapshot.
 */
export function runHourlySnapshot(now = Date.now()): LocalBackupStatus {
  const dir = hourlyBackupDir();
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (diskFreeBytes(dir) < RESERVE_BYTES) {
      recordMetric("backup_age_seconds", { status: "skipped_disk" });
      return {
        status: "skipped_disk",
        at: null,
        file: null,
        error: "disk reserve",
        ageSeconds: null,
        count: listSnapshots(dir).length,
      };
    }
    const file = path.join(dir, `penny-hourly-${stamp(now)}.db`);
    // VACUUM INTO writes a consistent copy; it cannot run inside a transaction.
    getDb().prepare("VACUUM INTO ?").run(file);
    fs.chmodSync(file, 0o600);
    verify(file);

    const files = listSnapshots(dir);
    for (const old of files.slice(0, Math.max(0, files.length - HOURLY_KEEP))) {
      fs.unlinkSync(path.join(dir, old));
    }
    recordMetric("backup_age_seconds", { status: "ok" });
    return {
      status: "ok",
      at: new Date(now).toISOString(),
      file,
      error: null,
      ageSeconds: 0,
      count: Math.min(files.length, HOURLY_KEEP),
    };
  } catch (error) {
    logError("backup/hourly", error);
    recordMetric("backup_age_seconds", { status: "error" });
    return {
      status: "error",
      at: null,
      file: null,
      error: error instanceof Error ? error.message.slice(0, 200) : "failed",
      ageSeconds: null,
      count: listSnapshots(dir).length,
    };
  }
}
