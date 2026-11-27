import "server-only";

import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import fs from "node:fs";
import { handle } from "@/server/lib/api-error";
import { dbPath } from "@/server/lib/data-dir";
import { isBackendActive } from "@/server/lib/backend-mode";
import { getLock, sqlTime } from "@/server/jobs/locks";
import { isKeyLocked } from "@/server/lib/encryption";

export const dynamic = "force-dynamic";

/**
 * Cheap and secret-free readiness: the database opens, migrations are present, and (only when the
 * durable backend is on) a worker holds a fresh lease. A locked app is a valid running state.
 */
export const GET = handle("health/ready", async () => {
  const locked = isKeyLocked();
  const file = dbPath();
  if (!fs.existsSync(file)) {
    return NextResponse.json(
      { ok: false, code: "db_missing", locked },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  let probe: Database.Database | undefined;
  try {
    // Cheap on purpose: opening and reading the migration table catches a missing/unreadable
    // file without a full quick_check on every probe. Ops status runs the deep check.
    probe = new Database(file, { readonly: true, fileMustExist: true });
    const migrations = probe.prepare("SELECT COUNT(*) AS n FROM _migrations").get() as {
      n: number;
    };
    if (migrations.n === 0)
      return NextResponse.json(
        { ok: false, code: "migrations_pending", locked },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
  } catch (error) {
    const corrupt = /malformed|not a database|corrupt/i.test(String(error));
    return NextResponse.json(
      { ok: false, code: corrupt ? "db_corrupt" : "db_unavailable", locked },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    try {
      probe?.close();
    } catch {
      // Already reported above.
    }
  }

  if (isBackendActive()) {
    const worker = getLock("worker");
    if (!worker || worker.expires_at < sqlTime())
      return NextResponse.json(
        { ok: false, code: "worker_stale", locked },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
  }

  return NextResponse.json(
    { ok: true, code: "ok", locked },
    { headers: { "Cache-Control": "no-store" } },
  );
});
