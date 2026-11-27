import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  provider: null as null | {
    categorize: (
      rows: { description: string }[],
      categories: { name: string }[],
    ) => Promise<{ index: number; categoryName: string; confidence: number | null }[]>;
  },
  ollama: { ok: true, error: undefined as string | undefined } as {
    ok: boolean;
    error?: string;
  },
}));
vi.mock("@/server/ai/factory", () => ({ createAIProvider: () => fake.provider }));
vi.mock("@/server/ai/ollama-manager", () => ({
  ensureOllamaRunning: async () => fake.ollama,
}));

import { getDb } from "@/server/db";
import { setGlobalSetting } from "@/server/db/queries/settings";
import { categorizeWithAI } from "@/server/sync/ai-categorize";

function reset() {
  const db = getDb();
  db.prepare("DELETE FROM transaction_allocations").run();
  db.prepare("DELETE FROM transactions").run();
  db.prepare("DELETE FROM sync_runs").run();
  db.prepare("DELETE FROM bank_credentials").run();
  const credential = Number(
    db
      .prepare(
        `INSERT INTO bank_credentials (workspace_id, provider, label, credentials_encrypted, iv, auth_tag)
         VALUES (1, 'leumi', 'Leumi', X'00', X'00', X'00')`,
      )
      .run().lastInsertRowid,
  );
  const run = Number(
    db
      .prepare(
        `INSERT INTO sync_runs (workspace_id, provider, credential_id, started_at, status, scrape_from_date)
         VALUES (1, 'leumi', ?, datetime('now'), 'completed', '2026-01-01')`,
      )
      .run(credential).lastInsertRowid,
  );
  db.prepare(
    `INSERT INTO transactions
       (workspace_id, account_number, date, processed_date, original_amount, original_currency,
        charged_amount, charged_currency, description, type, status, provider, sync_run_id, dedup_hash, kind)
     VALUES (1, '123', '2026-01-01', '2026-01-01', -50, 'ILS', -50, 'ILS', 'Mystery Shop',
       'normal', 'completed', 'leumi', ?, 'ai-1', 'expense')`,
  ).run(run);
  fake.provider = null;
  fake.ollama = { ok: true };
}

beforeEach(reset);

describe("AI categorization lane", () => {
  it("does nothing when no provider is configured", async () => {
    setGlobalSetting("ai_provider", "none");
    expect(await categorizeWithAI(1)).toEqual({ categorized: 0, warning: null });
  });

  it("applies confident mappings with origin, confidence and reasons", async () => {
    setGlobalSetting("ai_provider", "claude");
    fake.provider = {
      categorize: async (rows) =>
        rows.map((_, index) => ({ index, categoryName: "Groceries", confidence: 9 })),
    };
    const result = await categorizeWithAI(1);
    expect(result.categorized).toBe(1);
    const row = getDb()
      .prepare(
        "SELECT category_id, category_origin AS origin, category_confidence AS confidence, category_reasons_json AS reasons FROM transactions",
      )
      .get() as {
      category_id: number;
      origin: string;
      confidence: number;
      reasons: string;
    };
    expect(row.category_id).toBeGreaterThan(0);
    expect(row.origin).toBe("ai");
    expect(row.confidence).toBe(9);
    expect(JSON.parse(row.reasons)).toEqual([{ code: "aiSuggested" }]);
  });

  it("flags low-confidence suggestions for review", async () => {
    setGlobalSetting("ai_provider", "claude");
    fake.provider = {
      categorize: async (rows) =>
        rows.map((_, index) => ({ index, categoryName: "Groceries", confidence: 2 })),
    };
    await categorizeWithAI(1);
    const row = getDb().prepare("SELECT needs_review AS needsReview FROM transactions").get() as {
      needsReview: number;
    };
    expect(row.needsReview).toBe(1);
  });

  it("returns an Ollama warning instead of throwing", async () => {
    setGlobalSetting("ai_provider", "ollama");
    fake.provider = { categorize: async () => [] };
    fake.ollama = { ok: false, error: "offline" };
    expect(await categorizeWithAI(1)).toEqual({ categorized: 0, warning: "offline" });
  });

  it("captures a provider failure as a warning", async () => {
    setGlobalSetting("ai_provider", "claude");
    fake.provider = {
      categorize: async () => {
        throw new Error("model exploded");
      },
    };
    const result = await categorizeWithAI(1);
    expect(result.categorized).toBe(0);
    expect(result.warning).toContain("model exploded");
  });
});
