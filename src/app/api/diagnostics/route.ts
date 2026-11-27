import { readErrorLog } from "@/server/lib/log";
import { handle } from "@/server/lib/api-error";
import { israelToday } from "@/server/lib/date-utils";
import { NextResponse } from "next/server";
import fs from "node:fs";
import os from "node:os";
import pkg from "../../../../package.json";
import { getDb } from "@/server/db";
import { dbPath } from "@/server/lib/data-dir";
import { getGlobalSetting } from "@/server/db/queries/settings";
import { isLockEnabled } from "@/server/lib/app-lock";
import { isLanEnabled } from "@/server/lib/lan-access";
import { isDemoMode } from "@/server/demo/mode";
import { redact, redactKnownSecrets } from "@/server/lib/redact";
import { decrypt } from "@/server/lib/encryption";
import { getBackendMode } from "@/server/lib/backend-mode";
import { workerStatus } from "@/server/jobs/worker";
import { queueStats } from "@/server/jobs/queue";
import { hourlyBackupStatus } from "@/server/lib/hourly-backup";
import { getAutoBackupConfig } from "@/server/lib/auto-backup";
import { getNextRunAt } from "@/server/sync/scheduler";
import { getPipMode, isPipKillSwitch } from "@/server/lib/pip-mode";

export const dynamic = "force-dynamic";

/**
 * A support file the person downloads and chooses to send when something breaks. Only how the app is set up and
 * how syncs went: counts and states, never amounts, descriptions, account numbers, names or secrets. Sync errors
 * pass through the same redaction as the logs.
 */
export const GET = handle("diagnostics", async () => {
  const db = getDb();
  const one = <T>(sql: string, ...p: unknown[]) => db.prepare(sql).get(...p) as T;
  const all = <T>(sql: string, ...p: unknown[]) => db.prepare(sql).all(...p) as T[];
  const migrations = all<{ name: string }>("SELECT name FROM _migrations ORDER BY name").map(
    (m) => m.name,
  );
  // Sync errors come from the bank's page or the scraper, so one can echo the password we
  // sent without naming it. Scrub every stored credential value before the file leaves.
  const secrets = all<{ credentials_encrypted: Buffer; iv: Buffer; auth_tag: Buffer }>(
    "SELECT credentials_encrypted, iv, auth_tag FROM bank_credentials",
  ).flatMap((row) => {
    try {
      const values = JSON.parse(
        decrypt({ encrypted: row.credentials_encrypted, iv: row.iv, authTag: row.auth_tag }),
      ) as Record<string, unknown>;
      return Object.values(values).filter((v): v is string => typeof v === "string");
    } catch {
      return []; // an unreadable row is reported as a broken connection elsewhere
    }
  });
  const report = {
    generatedAt: new Date().toISOString(),
    app: {
      version: pkg.version,
      install: process.env.PENNY_INSTALL ?? "source",
      demo: isDemoMode(),
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      node: process.version,
      electron: process.versions.electron ?? null,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    database: {
      sizeMb: Math.round((fs.statSync(dbPath()).size / 1024 / 1024) * 10) / 10,
      integrity: db.pragma("quick_check", { simple: true }),
      migrations: migrations.length,
      lastMigration: migrations.at(-1) ?? null,
    },
    features: {
      aiProvider: getGlobalSetting("ai_provider") ?? "none",
      telegram: !!getGlobalSetting("telegram_token") || !!process.env.TELEGRAM_BOT_TOKEN,
      appLock: isLockEnabled(),
      phoneAccess: isLanEnabled(),
      backendV2: getBackendMode(),
      pipV2: getPipMode(),
      pipKillSwitch: isPipKillSwitch(),
    },
    operations: {
      worker: workerStatus(),
      queue: queueStats(),
      scheduler: { nextRunAt: getNextRunAt() },
      pip: {
        threads: one<{ n: number }>("SELECT COUNT(*) n FROM pip_threads").n,
        runs7d: one<{ n: number }>(
          "SELECT COUNT(*) n FROM pip_agent_runs WHERE created_at >= datetime('now', '-7 days')",
        ).n,
        fallbacks7d: one<{ n: number }>(
          "SELECT COUNT(*) n FROM pip_agent_runs WHERE status = 'fallback' AND created_at >= datetime('now', '-7 days')",
        ).n,
      },
      backups: {
        local: (() => {
          const status = hourlyBackupStatus();
          return { status: status.status, ageSeconds: status.ageSeconds, count: status.count };
        })(),
        portable: (() => {
          const config = getAutoBackupConfig();
          return {
            enabled: config.enabled,
            frequency: config.frequency,
            status: config.status,
          };
        })(),
      },
    },
    data: {
      workspaces: one<{ n: number }>("SELECT COUNT(*) n FROM workspaces").n,
      transactions: one<{ n: number }>("SELECT COUNT(*) n FROM transactions").n,
      pending: one<{ n: number }>("SELECT COUNT(*) n FROM transactions WHERE status = 'pending'").n,
      uncategorized: one<{ n: number }>(
        "SELECT COUNT(*) n FROM transactions WHERE category_id IS NULL AND kind IN ('expense','income') AND is_excluded = 0",
      ).n,
      oldest:
        one<{ d: string | null }>("SELECT MIN(date) d FROM transactions").d?.slice(0, 7) ?? null,
      newest:
        one<{ d: string | null }>("SELECT MAX(date) d FROM transactions").d?.slice(0, 7) ?? null,
      balanceGaps: one<{ n: number }>(
        "SELECT COUNT(*) n FROM account_balances WHERE ABS(COALESCE(drift, 0)) >= 1",
      ).n,
    },
    connections: all<{ provider: string; n: number }>(
      "SELECT provider, COUNT(*) n FROM bank_credentials GROUP BY provider ORDER BY provider",
    ),
    recentSyncs: all<{
      provider: string;
      status: string;
      startedAt: string;
      completedAt: string | null;
      added: number | null;
      error: string | null;
    }>(
      `SELECT provider, status, started_at as startedAt, completed_at as completedAt, transactions_added as added, error_message as error
       FROM sync_runs ORDER BY id DESC LIMIT 30`,
    ).map((r) => ({
      ...r,
      error: r.error ? redactKnownSecrets(redact(r.error), secrets) : null,
    })),
  };
  // When and where things failed, never what the message said: this file is made to be shared.
  const recentErrors = readErrorLog(50).map(({ at, scope, code }) => ({ at, scope, code }));
  const stamp = israelToday();
  return new NextResponse(JSON.stringify({ ...report, recentErrors }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="penny-diagnostics-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
