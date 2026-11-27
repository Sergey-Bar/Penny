import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { SEEDED_CATEGORY_KEYS } from "@/lib/category-keys";
import {
  scoreCategories,
  precisionRecall,
  falsePositiveRate,
} from "@/server/intelligence/evaluate";
import { detectRecurring } from "@/server/insights/recurring";
import { findAnomalies } from "@/server/insights/anomalies";
import { getDb } from "@/server/db";
import { reconcileFlows } from "@/server/finance/pairing";
import type { ImportCategory } from "@/lib/import/types";

const INCOME = new Set([
  "Salary",
  "Freelance & Side Income",
  "Investment Income",
  "Refunds & Reimbursements",
  "Benefits & Allowances",
  "Tax Refunds",
  "Gifts Received",
]);

function categories(): ImportCategory[] {
  const seen = new Set<string>();
  const out: ImportCategory[] = [];
  for (const [name, key] of Object.entries(SEEDED_CATEGORY_KEYS)) {
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: out.length + 1,
      name,
      key,
      kind: INCOME.has(name) ? "income" : "expense",
    });
  }
  return out;
}

describe("deterministic intelligence gates", () => {
  it("category top-1 and dictionary-covered accuracy", () => {
    const rows = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "tests/fixtures/intelligence/rows.json"), "utf8"),
    ) as { description: string; kind: "expense" | "income"; expected: string }[];
    expect(rows.length).toBeGreaterThanOrEqual(500);
    const score = scoreCategories(rows, categories());
    expect(score.accuracy).toBeGreaterThanOrEqual(0.85);
    expect(score.dictionaryAccuracy).toBeGreaterThanOrEqual(0.95);
  });

  it("recurring precision and recall", () => {
    const txns: {
      merchant: string;
      account: string;
      currency: string;
      amount: number;
      date: string;
    }[] = [];
    for (let series = 0; series < 10; series++) {
      for (let month = 0; month < 12; month++) {
        const monthText = String(month + 1).padStart(2, "0");
        txns.push({
          merchant: `sub-${series}`,
          account: "123",
          currency: "ILS",
          amount: -(29 + series),
          date: `2026-${monthText}-15`,
        });
      }
    }
    for (let noise = 0; noise < 30; noise++) {
      txns.push({
        merchant: `shop-${noise}`,
        account: "123",
        currency: "ILS",
        amount: -(noise + 5),
        date: `2026-${String((noise % 12) + 1).padStart(2, "0")}-${String((noise % 27) + 1).padStart(2, "0")}`,
      });
    }
    const expected = new Set(Array.from({ length: 10 }, (_, i) => `sub-${i}`));
    const actual = new Set(detectRecurring(txns).map((series) => series.merchant));
    const score = precisionRecall(expected, actual);
    expect(score.precision).toBeGreaterThanOrEqual(0.9);
    expect(score.recall).toBeGreaterThanOrEqual(0.8);
  });

  it("anomaly false-positive rate", () => {
    const txns: { merchant: string; category: string; amount: number; date: string }[] = [];
    const normal = new Set<string>();
    for (let month = 0; month < 3; month++) {
      for (let day = 0; day < 8; day++)
        txns.push({
          merchant: "grocery",
          category: "Groceries",
          amount: -60,
          date: `2026-0${month + 3}-${String(day * 3 + 1).padStart(2, "0")}`,
        });
    }
    for (let day = 0; day < 8; day++)
      txns.push({
        merchant: "grocery",
        category: "Groceries",
        amount: -60,
        date: `2026-06-${String(day * 2 + 1).padStart(2, "0")}`,
      });
    txns.push({
      merchant: "new-shop",
      category: "Shopping",
      amount: -900,
      date: "2026-06-18",
    });
    for (const txn of txns) normal.add(txn.merchant);
    normal.delete("new-shop");
    const flagged = findAnomalies(txns, "2026-06-20").map((anomaly) =>
      anomaly.merchant ? anomaly.merchant : `category:${anomaly.category}`,
    );
    expect(flagged).toContain("new-shop");
    expect(falsePositiveRate(normal, new Set(flagged))).toBeLessThanOrEqual(0.05);
  });
});

describe("pairing precision and recall", () => {
  beforeEach(() => {
    const db = getDb();
    db.prepare("DELETE FROM flow_matches").run();
    db.prepare("DELETE FROM transactions").run();
    db.prepare("DELETE FROM sync_runs").run();
  });

  it("links one-to-one transfers precisely", () => {
    const db = getDb();
    const run = Number(
      db
        .prepare(
          "INSERT INTO sync_runs (workspace_id, provider, started_at, status, scrape_from_date) VALUES (1, 'leumi', datetime('now'), 'completed', '2026-01-01')",
        )
        .run().lastInsertRowid,
    );
    const insert = db.prepare(
      `INSERT INTO transactions
         (workspace_id, account_number, date, processed_date, original_amount, original_currency,
          charged_amount, charged_currency, description, type, status, provider, sync_run_id,
          dedup_hash, kind, flow_type)
       VALUES (1, ?, ?, ?, ?, 'ILS', ?, 'ILS', ?, 'normal', 'completed', 'leumi', ?, ?, ?, ?)`,
    );
    const expected = new Set<string>();
    for (let index = 0; index < 20; index++) {
      const amount = 100 + index;
      const out = Number(
        insert.run(
          "111",
          "2026-06-01",
          "2026-06-01",
          -amount,
          -amount,
          "העברה לחשבון אחר",
          run,
          `out-${index}`,
          "expense",
          "expense",
        ).lastInsertRowid,
      );
      const incoming = Number(
        insert.run(
          "222",
          "2026-06-02",
          "2026-06-02",
          amount,
          amount,
          "העברה מחשבון אחר",
          run,
          `in-${index}`,
          "income",
          "income",
        ).lastInsertRowid,
      );
      expected.add(`${Math.min(out, incoming)}:${Math.max(out, incoming)}`);
    }
    const result = reconcileFlows(1);
    const matches = db
      .prepare(
        "SELECT primary_txn_id AS a, other_txn_id AS b FROM flow_matches WHERE kind = 'transfer'",
      )
      .all() as { a: number; b: number }[];
    const actual = new Set(
      matches.map((row) => `${Math.min(row.a, row.b)}:${Math.max(row.a, row.b)}`),
    );
    const score = precisionRecall(expected, actual);
    expect(result.transfersPaired).toBe(20);
    expect(score.precision).toBeGreaterThanOrEqual(0.98);
    expect(score.recall).toBeGreaterThanOrEqual(0.98);
  });
});
