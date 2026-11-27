import "server-only";

import { getDb } from "@/server/db";
import { israelToday } from "@/server/lib/date-utils";
import { logError } from "@/server/lib/log";

export interface MetricLabels {
  [key: string]: string | number | boolean;
}

/** Bounded label values keep metric cardinality low (route, status, lane, type). */
function normalizeValue(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value).slice(0, 80);
}

function normalizeLabels(labels: MetricLabels = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(labels).sort()) {
    const value = labels[key];
    if (value === undefined) continue;
    out[key.slice(0, 40)] = normalizeValue(value);
  }
  return out;
}

/**
 * Records one metric sample in the daily rollup table. Metrics are best-effort: a busy or
 * read-only database must never fail the operation the metric describes.
 */
export function recordMetric(name: string, labels: MetricLabels = {}, count = 1, sum = 0): void {
  try {
    // Never reopen a database the app just closed (wipe/restore): a metric must not
    // resurrect files or run migrations behind the operation's back.
    if (!globalThis._db) return;
    const day = israelToday();
    const labelsJson = JSON.stringify(normalizeLabels(labels));
    getDb()
      .prepare(
        `INSERT INTO metrics_daily (day, name, labels_json, count, sum)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(day, name, labels_json) DO UPDATE SET
           count = metrics_daily.count + excluded.count,
           sum = metrics_daily.sum + excluded.sum`,
      )
      .run(day, name, labelsJson, Math.max(0, Math.trunc(count)), Number.isFinite(sum) ? sum : 0);
  } catch (error) {
    logError("metrics", error, { name });
  }
}

export function recordJobMetric(type: string, status: string, durationMs?: number): void {
  recordMetric("jobs_total", { type, status });
  if (durationMs != null) recordMetric("job_duration_ms", { type }, 1, durationMs);
}

export function recordHttpMetric(
  method: string,
  route: string,
  status: number,
  durationMs: number,
): void {
  recordMetric("http_requests_total", { method, route, status });
  recordMetric("http_request_duration_ms", { method, route }, 1, durationMs);
}

export function recordSyncMetric(status: string, durationMs?: number): void {
  recordMetric("sync_runs_total", { status });
  if (durationMs != null) recordMetric("sync_duration_ms", {}, 1, durationMs);
}

export function recordIntegrityViolations(kind: string, count: number): void {
  if (count <= 0) return;
  recordMetric("integrity_violations_total", { kind }, count);
}

export function recordDbBusy(): void {
  recordMetric("db_busy_total");
}
