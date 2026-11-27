import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/server/db";

function plan(sql: string, ...params: unknown[]): string {
  return (
    getDb()
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all(...params) as { detail: string }[]
  )
    .map((row) => row.detail)
    .join("\n");
}

beforeAll(() => {
  getDb().exec("ANALYZE");
});

describe("report query plans", () => {
  it("uses the date/excluded index for the transactions list", () => {
    const detail = plan(
      `SELECT id FROM transactions
       WHERE workspace_id = ? AND date BETWEEN ? AND ? AND is_excluded = 0
       ORDER BY date DESC, id DESC LIMIT 100`,
      1,
      "2026-01-01",
      "2026-12-31",
    );
    expect(detail).toMatch(
      /USING (COVERING )?INDEX idx_transactions_(ws_date_excluded|workspace_date)/,
    );
    expect(detail).not.toMatch(/SCAN transactions/);
  });

  it("uses the merchant and category composite indexes", () => {
    expect(
      plan(
        "SELECT id FROM transactions WHERE workspace_id = ? AND merchant_key = ? LIMIT 50",
        1,
        "spotify",
      ),
    ).toMatch(/idx_transactions_ws_merchant/);
    expect(
      plan(
        `SELECT SUM(charged_amount) FROM transactions
         WHERE workspace_id = ? AND category_id = ? AND date BETWEEN ? AND ?`,
        1,
        1,
        "2026-01-01",
        "2026-12-31",
      ),
    ).toMatch(/idx_transactions_ws_category_date/);
  });

  it("claims jobs through the lane/status index", () => {
    expect(
      plan(
        `SELECT id FROM jobs
         WHERE lane = ? AND status = 'queued' AND run_after <= datetime('now')
         ORDER BY priority, run_after, id LIMIT 1`,
        "critical",
      ),
    ).toMatch(/idx_jobs_claim/);
  });
});
