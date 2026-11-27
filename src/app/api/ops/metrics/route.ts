import "server-only";

import { NextResponse } from "next/server";
import { handle } from "@/server/lib/api-error";
import { requireOpsAdmin } from "@/server/lib/ops-auth";
import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";

export const GET = handle("ops/metrics", async (request: Request) => {
  requireOpsAdmin(request);
  const url = new URL(request.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 7));
  const rows = getDb()
    .prepare(
      `SELECT day, name, labels_json AS labelsJson, count, sum
       FROM metrics_daily
       WHERE day >= date('now', ?)
       ORDER BY day DESC, name`,
    )
    .all(`-${days} days`) as {
    day: string;
    name: string;
    labelsJson: string;
    count: number;
    sum: number;
  }[];
  return NextResponse.json({
    days,
    metrics: rows.map((row) => ({
      day: row.day,
      name: row.name,
      labels: (() => {
        try {
          return JSON.parse(row.labelsJson) as Record<string, string>;
        } catch {
          return {};
        }
      })(),
      count: row.count,
      sum: row.sum,
    })),
  });
});
