import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ScrapeResult } from "@/server/scrapers/types";
import type { AIProvider } from "@/server/ai/types";

/**
 * The sync orchestrator with every bank mocked at the scraper boundary (as tests/fake-bank.test.ts does),
 * over a real database in a temp folder: what happens to a connection that cannot be read, a locked key,
 * a bank that throws, hangs, or asks for a one-time code.
 */

type Scrape = (...args: unknown[]) => Promise<ScrapeResult>;
const fake = vi.hoisted(() => ({
  scrapeBank: null as null | Scrape,
  oneZeroFirst: null as null | Scrape,
  oneZeroToken: null as null | Scrape,
  openBanking: null as null | Scrape,
  calls: [] as { fn: string; args: unknown[] }[],
  ai: null as null | AIProvider | "throw",
  ollama: { ok: true } as { ok: boolean; error?: string },
  bot: { feedback: 0, alerts: [] as unknown[], fail: false },
}));
const call =
  (fn: string, impl: Scrape | null) =>
  async (...args: unknown[]) => {
    fake.calls.push({ fn, args });
    if (!impl) throw new Error(`no fake for ${fn}`);
    return impl(...args);
  };

vi.mock("@/server/scrapers", () => ({
  scrapeBank: (...a: unknown[]) => call("scrapeBank", fake.scrapeBank)(...a),
}));
vi.mock("@/server/scrapers/one-zero", () => ({
  scrapeOneZeroFirstTime: (...a: unknown[]) => call("oneZeroFirst", fake.oneZeroFirst)(...a),
  scrapeOneZeroWithToken: (...a: unknown[]) => call("oneZeroToken", fake.oneZeroToken)(...a),
}));
vi.mock("@/server/open-banking/client", () => ({
  connectOpenBanking: (...a: unknown[]) => call("openBanking", fake.openBanking)(...a),
}));
vi.mock("@/server/ai/factory", () => ({
  createAIProvider: () => {
    if (fake.ai === "throw") throw new Error("Unsupported state or unable to authenticate data");
    return fake.ai;
  },
}));
vi.mock("@/server/ai/ollama-manager", () => ({
  ensureOllamaRunning: async () => fake.ollama,
}));
vi.mock("@/server/bot/index", () => ({
  sendSpendFeedback: async () => {
    if (fake.bot.fail) throw new Error("telegram down");
    fake.bot.feedback++;
  },
  sendSyncAlerts: async (providers: unknown[]) => {
    fake.bot.alerts.push(providers);
  },
}));

type Orchestrator = typeof import("@/server/sync/orchestrator");
let orch: Orchestrator;
let creds: typeof import("@/server/db/queries/bank-credentials");
let settings: typeof import("@/server/db/queries/settings");
let otp: typeof import("@/server/sync/otp-bridge");
let enc: typeof import("@/server/lib/encryption");
let db: import("better-sqlite3").Database;
let ws: number;

beforeAll(async () => {
  process.env.PENNY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "penny-orch-"));
  globalThis.__pennyDataKey = undefined;
  db = (await import("@/server/db")).getDb();
  ws = (db.prepare("SELECT id FROM workspaces ORDER BY id LIMIT 1").get() as { id: number }).id;
  creds = await import("@/server/db/queries/bank-credentials");
  settings = await import("@/server/db/queries/settings");
  otp = await import("@/server/sync/otp-bridge");
  enc = await import("@/server/lib/encryption");
  orch = await import("@/server/sync/orchestrator");
});

beforeEach(() => {
  db.prepare("DELETE FROM bank_credentials").run();
  fake.scrapeBank = fake.oneZeroFirst = fake.oneZeroToken = fake.openBanking = null;
  fake.calls.length = 0;
  fake.ai = null;
  fake.ollama = { ok: true };
  fake.bot = { feedback: 0, alerts: [], fail: false };
  settings.setGlobalSetting("ai_provider", "none");
});
afterEach(() => {
  vi.useRealTimers();
});

const events = () => {
  const list: { event: string; data: Record<string, unknown> }[] = [];
  const send = (event: string, data: Record<string, unknown>) => list.push({ event, data });
  return { list, send, of: (e: string) => list.filter((x) => x.event === e).map((x) => x.data) };
};
const day = (d: string) => new Date(`${d}T00:00:00+02:00`).toISOString();
const txn = (description: string, amount: number, id: string) => ({
  type: "normal" as const,
  identifier: id,
  date: day("2026-11-10"),
  processedDate: day("2026-11-10"),
  originalAmount: amount,
  originalCurrency: "ILS",
  chargedAmount: amount,
  description,
  status: "completed" as const,
});
// Each default scrape brings a transaction never seen before, so every test counts its own row as added.
let seq = 0;
const ok = (
  txns = [txn(`XYZZY PLUGH SHOP ${++seq}`, -42 - seq, `t${seq}`)],
  balance?: number,
): ScrapeResult => ({
  success: true,
  accounts: [{ accountNumber: "123-456", balance, transactions: txns }],
});
const runRow = (id: number) =>
  db.prepare("SELECT status, error_message FROM sync_runs WHERE id = ?").get(id) as {
    status: string;
    error_message: string | null;
  };
const sync = (filter?: number, ev = events()) => orch.syncWorkspace(ws, filter, ev.send);

describe("syncWorkspace", () => {
  it("with nothing connected, announces an empty plan and returns zeros", async () => {
    const ev = events();
    const s = await sync(undefined, ev);
    expect(ev.of("plan")).toEqual([
      { workspaceId: ws, workspaceName: expect.any(String), providers: [], total: 0 },
    ]);
    expect(s).toMatchObject({ providers: [], added: 0, updated: 0, categorized: 0 });
    expect(s.aiWarning).toBeNull();
  });

  it("saves a bank's transactions and balance, and closes the run as completed", async () => {
    const id = creds.saveBankCredentials(ws, "leumi", { username: "u", password: "p" });
    fake.scrapeBank = async () => ok(undefined, 9_000);
    const ev = events();
    const s = await sync(undefined, ev);
    expect(s.providers).toHaveLength(1);
    const [r] = s.providers;
    expect(r).toMatchObject({ provider: "leumi", credentialId: id, ok: true, added: 1 });
    expect(runRow(r.syncRunId!).status).toBe("completed");
    expect(s.added).toBe(1);
    expect(ev.of("provider-done")[0]).toMatchObject({ ok: true, added: 1 });
    const bal = db
      .prepare("SELECT balance FROM account_balances WHERE workspace_id = ? AND provider = 'leumi'")
      .get(ws) as { balance: number } | undefined;
    expect(bal?.balance).toBe(9_000);
    // The bank got the decrypted login, the workspace, and no manual 2FA.
    expect(fake.calls[0].args.slice(0, 3)).toEqual([ws, "leumi", { username: "u", password: "p" }]);
    expect(fake.calls[0].args[4]).toEqual({ manualTwoFactor: false });
  });

  it("saves securities returned by a bank scrape", async () => {
    creds.saveBankCredentials(ws, "hapoalim", { username: "u", password: "p" });
    fake.scrapeBank = async () => ({
      success: true,
      accounts: [{ accountNumber: "123-456", transactions: [] }],
      securities: [
        {
          accountNumber: "123-456",
          equityNumber: "5123456",
          name: "Example Fund",
          type: "fund",
          currency: "ILS",
          symbol: "5123456",
          quantity: 10,
          value: 1_000,
          valueIls: 1_000,
          costBasis: 900,
        },
      ],
    });
    const s = await sync();
    expect(s.providers[0]).toMatchObject({ ok: true });
    const asset = db
      .prepare(
        "SELECT name, manual_value FROM assets WHERE workspace_id = ? AND note LIKE 'bank-securities:hapoalim:%'",
      )
      .get(ws) as { name: string; manual_value: number } | undefined;
    expect(asset).toMatchObject({ name: "Example Fund", manual_value: 1_000 });
  });

  it("a connection whose saved login cannot be decrypted fails alone; the next one still syncs", async () => {
    const bad = creds.saveBankCredentials(ws, "isracard", {
      id: "1",
      card6Digits: "1",
      password: "p",
    });
    const good = creds.saveBankCredentials(ws, "leumi", { username: "u", password: "p" });
    db.prepare("UPDATE bank_credentials SET auth_tag = zeroblob(16) WHERE id = ?").run(bad);
    fake.scrapeBank = async () => ok();
    const ev = events();
    const s = await sync(undefined, ev);
    const byId = new Map(s.providers.map((p) => [p.credentialId, p]));
    expect(byId.get(bad)).toMatchObject({ ok: false, errorMessage: "No credentials" });
    expect(byId.get(good)).toMatchObject({ ok: true });
    expect(ev.of("provider-done").find((d) => d.credentialId === bad)?.errorMessage).toMatch(
      /^No credentials configured for /,
    );
    // No run was opened for the unreadable one.
    expect(byId.get(bad)?.syncRunId).toBeUndefined();
  });

  it("with the app lock on, says the app is locked instead of trying the bank", async () => {
    creds.saveBankCredentials(ws, "leumi", { username: "u", password: "p" });
    fake.scrapeBank = async () => ok();
    fs.writeFileSync(enc.lockFilePath(), "{}");
    const key = globalThis.__pennyDataKey;
    globalThis.__pennyDataKey = undefined;
    try {
      const ev = events();
      const s = await sync(undefined, ev);
      expect(s.providers[0]).toMatchObject({ ok: false, errorMessage: enc.APP_LOCKED_MESSAGE });
      expect(ev.of("provider-done")[0].errorMessage).toBe(enc.APP_LOCKED_MESSAGE);
      expect(fake.calls).toEqual([]);
    } finally {
      fs.rmSync(enc.lockFilePath());
      globalThis.__pennyDataKey = key;
    }
  });

  it("a bank that throws closes its run as failed with the secret-free message", async () => {
    creds.saveBankCredentials(ws, "leumi", { username: "u", password: "hunter2" });
    fake.scrapeBank = async () => {
      throw new Error('login failed {"password":"hunter2"}');
    };
    const s = await sync();
    const [r] = s.providers;
    expect(r.ok).toBe(false);
    expect(r.errorMessage).toMatch(/^Error: login failed/);
    expect(r.errorMessage).not.toContain("hunter2");
    expect(runRow(r.syncRunId!)).toEqual({ status: "failed", error_message: r.errorMessage });
  });

  it("passes a failed scrape's message and retryable flag through, with a default message", async () => {
    creds.saveBankCredentials(ws, "leumi", { username: "u", password: "p" });
    fake.scrapeBank = async () => ({
      success: false,
      accounts: [],
      errorMessage: "site down",
      retryable: true,
    });
    let [r] = (await sync()).providers;
    expect(r).toMatchObject({ ok: false, errorMessage: "site down", retryable: true });
    expect(runRow(r.syncRunId!).error_message).toBe("site down");

    fake.scrapeBank = async () => ({ success: false, accounts: [] });
    [r] = (await sync()).providers;
    expect(r).toMatchObject({ ok: false, errorMessage: "Scraping failed" });
    expect(r.retryable).toBeUndefined();
  });

  it("a bank that rejects with something other than an Error keeps its reason and closes its run", async () => {
    creds.saveBankCredentials(ws, "leumi", { username: "u", password: "p" });
    fake.scrapeBank = async () => {
      throw "browser crashed"; // scrapers can reject with anything
    };
    const [r] = (await sync()).providers;
    // The deadline wrapper turns the bare value into an Error, so the reason is not lost.
    expect(r).toMatchObject({ ok: false, errorMessage: "Error: browser crashed" });
    expect(runRow(r.syncRunId!).status).toBe("failed");
  });

  it("a connection whose run cannot even be recorded fails alone, with the reason on screen", async () => {
    const runs = await import("@/server/db/queries/sync-runs");
    creds.saveBankCredentials(ws, "leumi", { username: "u", password: "p" });
    const spy = vi.spyOn(runs, "createSyncRun").mockImplementation(() => {
      throw new Error("database is locked");
    });
    try {
      const ev = events();
      const s = await sync(undefined, ev);
      expect(s.providers[0]).toMatchObject({
        ok: false,
        errorMessage: "Error: database is locked",
      });
      expect(ev.of("provider-done")[0]).toMatchObject({
        ok: false,
        errorMessage: "Error: database is locked",
      });
      expect(fake.calls).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  it("syncs only the asked connection when given an id", async () => {
    creds.saveBankCredentials(ws, "leumi", { username: "u", password: "p" });
    const only = creds.saveBankCredentials(ws, "max", { username: "u", password: "p" });
    fake.scrapeBank = async () => ok();
    const s = await sync(only);
    expect(s.providers.map((p) => p.credentialId)).toEqual([only]);
    expect(fake.calls.map((c) => c.args[1])).toEqual(["max"]);
  });

  it("tells the screen when a bank needs its code typed in the browser", async () => {
    const id = creds.saveBankCredentials(
      ws,
      "leumi",
      { username: "u", password: "p" },
      { requiresManualTwoFactor: true },
    );
    fake.scrapeBank = async () => ok();
    const ev = events();
    await sync(id, ev);
    expect(ev.of("provider-2fa-manual")).toHaveLength(1);
    expect(fake.calls[0].args[4]).toEqual({ manualTwoFactor: true });
  });

  it("an unattended run skips banks that need a person at the screen, without failing them", async () => {
    creds.saveBankCredentials(
      ws,
      "leumi",
      { username: "u", password: "p" },
      { requiresManualTwoFactor: true },
    );
    creds.saveBankCredentials(ws, "oneZero", { email: "e", password: "p", phoneNumber: "050" });
    const ev = events();
    const s = await orch.syncWorkspace(ws, undefined, ev.send, false);
    expect(s.providers).toEqual([]);
    expect(fake.calls).toEqual([]);
    expect(ev.of("provider-done")).toEqual([]);
  });

  it("open banking goes to the API client with the saved token and the start date", async () => {
    creds.saveBankCredentials(ws, "openBanking", {
      baseUrl: "https://ob.test",
      token: "t",
      consentId: "c",
    });
    fake.openBanking = async () => ok();
    const s = await sync();
    expect(s.providers[0]).toMatchObject({ provider: "openBanking", ok: true, added: 1 });
    expect(fake.calls[0].fn).toBe("openBanking");
    expect(fake.calls[0].args[0]).toEqual({
      baseUrl: "https://ob.test",
      token: "t",
      consentId: "c",
    });
    expect(fake.calls[0].args[1]).toBeInstanceOf(Date);
  });
});

describe("One Zero", () => {
  it("with a saved token, logs in without a code", async () => {
    creds.saveBankCredentials(ws, "oneZero", {
      email: "e",
      password: "p",
      otpLongTermToken: "tok",
    });
    fake.oneZeroToken = async () => ok();
    const ev = events();
    const s = await orch.syncWorkspace(ws, undefined, ev.send, false); // a scheduled run can use the token
    expect(s.providers[0]).toMatchObject({ ok: true, added: 1 });
    expect(fake.calls[0].fn).toBe("oneZeroToken");
    expect(fake.calls[0].args[0]).toMatchObject({
      email: "e",
      password: "p",
      otpLongTermToken: "tok",
    });
    expect(ev.of("provider-2fa-needed")).toEqual([]);
  });

  it("refuses to start without email and password, or without a phone for the code", async () => {
    creds.saveBankCredentials(ws, "oneZero", { email: "e", password: "", phoneNumber: "050" });
    let [r] = (await sync()).providers;
    expect(r).toMatchObject({
      ok: false,
      errorMessage: "Email and password are required for One Zero.",
    });

    db.prepare("DELETE FROM bank_credentials").run();
    creds.saveBankCredentials(ws, "oneZero", { email: "e", password: "p" });
    [r] = (await sync()).providers;
    expect(r).toMatchObject({
      ok: false,
      errorMessage: "Phone number is required to receive the One Zero 2FA code.",
    });
    expect(fake.calls).toEqual([]);
  });

  it("first time: asks the screen for the code, passes it to the bank, and keeps the long-term token", async () => {
    const id = creds.saveBankCredentials(ws, "oneZero", {
      email: "e",
      password: "p",
      phoneNumber: "050",
    });
    fake.oneZeroFirst = async (...args) => {
      const opts = args[0] as {
        awaitOtp: () => Promise<string>;
        onOtpSubmitted: () => void;
        phoneNumber: string;
      };
      expect(opts.phoneNumber).toBe("050");
      const code = await opts.awaitOtp();
      opts.onOtpSubmitted();
      expect(code).toBe("246810");
      return { ...ok(), otpLongTermToken: "long-term" } as ScrapeResult;
    };
    const ev = events();
    // The browser answers the moment it is asked, as the OTP dialog would.
    const send = (event: string, data: Record<string, unknown>) => {
      ev.send(event, data);
      if (event === "provider-2fa-needed")
        queueMicrotask(() =>
          expect(otp.deliverOtp(data.syncRunId as number, ws, "246810")).toEqual({ ok: true }),
        );
    };
    const s = await orch.syncWorkspace(ws, undefined, send);
    expect(s.providers[0]).toMatchObject({ ok: true, added: 1 });
    const needed = ev.of("provider-2fa-needed");
    expect(needed).toEqual([
      {
        workspaceId: ws,
        workspaceName: expect.any(String),
        provider: "oneZero",
        syncRunId: s.providers[0].syncRunId,
      },
    ]);
    expect(ev.of("provider-2fa-submitted")).toHaveLength(1);
    expect(creds.getBankCredentials(ws, id)?.otpLongTermToken).toBe("long-term");
    expect(otp.hasPendingOtp(s.providers[0].syncRunId!)).toBe(false);
  });

  it("a scrape that ends while the code is still awaited cancels the request", async () => {
    creds.saveBankCredentials(ws, "oneZero", { email: "e", password: "p", phoneNumber: "050" });
    let waiting: Promise<string> | null = null;
    fake.oneZeroFirst = async (...args) => {
      waiting = (args[0] as { awaitOtp: () => Promise<string> }).awaitOtp();
      waiting.catch(() => undefined);
      return { success: false, accounts: [], errorMessage: "trigger failed" };
    };
    const [r] = (await sync()).providers;
    expect(r).toMatchObject({ ok: false, errorMessage: "trigger failed" });
    await expect(waiting!).rejects.toThrow("Scrape completed");
    expect(otp.hasPendingOtp(r.syncRunId!)).toBe(false);
  });
});

describe("deadline and abandoned scrapes", () => {
  it("gives up on a hung bank after ten minutes, and won't log in again while it still hangs", async () => {
    const id = creds.saveBankCredentials(ws, "leumi", { username: "u", password: "p" });
    let finish!: (r: ScrapeResult) => void;
    fake.scrapeBank = () => new Promise<ScrapeResult>((resolve) => (finish = resolve));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const first = sync();
    await vi.advanceTimersByTimeAsync(10 * 60_000 - 1);
    let settled = false;
    void first.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const [r] = (await first).providers;
    expect(r).toMatchObject({ ok: false, retryable: true });
    expect(r.errorMessage).toMatch(/timed out/);
    expect(runRow(r.syncRunId!).status).toBe("failed");

    // Still hanging: a second login could lock the account, so it is not attempted.
    const runsBefore = (db.prepare("SELECT COUNT(*) AS n FROM sync_runs").get() as { n: number }).n;
    const [again] = (await sync()).providers;
    expect(again).toMatchObject({ credentialId: id, ok: false, retryable: true });
    expect(again.syncRunId).toBeUndefined();
    expect(fake.calls).toHaveLength(1);
    expect((db.prepare("SELECT COUNT(*) AS n FROM sync_runs").get() as { n: number }).n).toBe(
      runsBefore,
    );

    // Once the old scrape settles, the connection syncs again.
    finish(ok());
    await vi.advanceTimersByTimeAsync(0);
    fake.scrapeBank = async () => ok();
    const [third] = (await sync()).providers;
    expect(third.ok).toBe(true);
  });
});

describe("categorizing after a sync", () => {
  const firstExpenseCategory = () =>
    (
      db
        .prepare(
          "SELECT name FROM categories WHERE workspace_id = ? AND kind = 'expense' ORDER BY id LIMIT 1",
        )
        .get(ws) as { name: string }
    ).name;

  it("without AI, warns when something was left uncategorized", async () => {
    creds.saveBankCredentials(ws, "leumi", { username: "u", password: "p" });
    fake.scrapeBank = async () => ok([txn("QWERTY UNKNOWN 1", -10, "nai-1")]);
    const s = await sync();
    expect(s.aiWarning).toBe(
      "AI provider not connected — new transactions weren't auto-categorized.",
    );
  });

  it("a provider that cannot be built (an undecryptable API key) only skips categorizing", async () => {
    creds.saveBankCredentials(ws, "leumi", { username: "u", password: "p" });
    fake.scrapeBank = async () => ok([txn("QWERTY UNKNOWN 2", -10, "nai-2")]);
    fake.ai = "throw";
    const s = await sync();
    expect(s.providers[0].ok).toBe(true);
    expect(s.aiWarning).toMatch(/AI provider not connected/);
  });

  it("applies the AI's categories and flags low-confidence ones for review", async () => {
    creds.saveBankCredentials(ws, "leumi", { username: "u", password: "p" });
    fake.scrapeBank = async () =>
      ok([
        txn("ZZTOP ALPHA", -10, "ai-1"),
        txn("ZZTOP BETA", -20, "ai-2"),
        txn("ZZTOP GAMMA", -30, "ai-3"),
      ]);
    const name = firstExpenseCategory();
    const seen: unknown[] = [];
    fake.ai = {
      categorize: async (batch) => {
        seen.push(...batch);
        const idx = (d: string) => batch.findIndex((t) => t.description === d);
        return [
          { index: idx("ZZTOP ALPHA"), categoryName: name, confidence: 7 },
          { index: idx("ZZTOP BETA"), categoryName: name, confidence: 3 },
          { index: idx("ZZTOP GAMMA"), categoryName: "no such category" },
          { index: 999, categoryName: name },
        ];
      },
    };
    const s = await sync();
    expect(s.aiWarning).toBeNull();
    expect(s.categorized).toBeGreaterThanOrEqual(2);
    const rows = db
      .prepare(
        "SELECT description, category_id, needs_review FROM transactions WHERE description LIKE 'ZZTOP%' ORDER BY description",
      )
      .all() as { description: string; category_id: number | null; needs_review: number }[];
    expect(rows.map((r) => [r.description, r.category_id != null, r.needs_review])).toEqual([
      ["ZZTOP ALPHA", true, 0],
      ["ZZTOP BETA", true, 1],
      ["ZZTOP GAMMA", false, expect.any(Number)],
    ]);
    expect(seen).toContainEqual(
      expect.objectContaining({ description: "ZZTOP ALPHA", amount: -10, currency: "ILS" }),
    );
  });

  it("an AI error becomes one friendly warning, and the sync still succeeds", async () => {
    creds.saveBankCredentials(ws, "leumi", { username: "u", password: "p" });
    fake.scrapeBank = async () => ok([txn("ZZTOP DELTA", -10, "ai-4")]);
    fake.ai = {
      categorize: async () => {
        throw new Error("401 invalid x-api-key");
      },
    };
    const s = await sync();
    expect(s.providers[0].ok).toBe(true);
    expect(s.aiWarning).toBe("Claude API request was rejected. Check your API key in settings.");
  });

  it("with Ollama chosen but not running, warns and does not call it", async () => {
    creds.saveBankCredentials(ws, "leumi", { username: "u", password: "p" });
    fake.scrapeBank = async () => ok([txn("ZZTOP EPSILON", -10, "ai-5")]);
    settings.setGlobalSetting("ai_provider", "ollama");
    const categorize = vi.fn();
    fake.ai = { categorize };
    fake.ollama = { ok: false, error: "Ollama did not start" };
    const ev = events();
    const s = await sync(undefined, ev);
    expect(s.aiWarning).toBe("Ollama did not start");
    expect(categorize).not.toHaveBeenCalled();
    expect(ev.of("stage").map((d) => d.stage)).toEqual(["ollama-start"]);

    fake.ollama = { ok: false };
    expect((await sync()).aiWarning).toBe("Ollama is not reachable");
  });

  it("with Ollama running, goes on to categorize", async () => {
    creds.saveBankCredentials(ws, "leumi", { username: "u", password: "p" });
    fake.scrapeBank = async () => ok([txn("ZZTOP ZETA", -10, "ai-6")]);
    settings.setGlobalSetting("ai_provider", "ollama");
    const categorize = vi.fn(async () => []);
    fake.ai = { categorize };
    const ev = events();
    const s = await sync(undefined, ev);
    expect(s.aiWarning).toBeNull();
    expect(categorize).toHaveBeenCalled();
    expect(ev.of("stage").map((d) => d.stage)).toEqual(["ollama-start", "categorizing"]);
  });
});

describe("runAllWorkspaces", () => {
  it("refuses to start while another sync holds the lock, unless the caller holds it", async () => {
    const { tryAcquireSync, SyncBusyError } = await import("@/server/sync/lock");
    const release = tryAcquireSync("manual")!;
    try {
      await expect(orch.runAllWorkspaces()).rejects.toBeInstanceOf(SyncBusyError);
      await expect(
        orch.runAllWorkspaces(undefined, undefined, "manual", { lockHeld: true }),
      ).resolves.toBeInstanceOf(Array);
    } finally {
      release();
    }
  });

  it("releases the lock afterwards, and only a scheduled run sends failure alerts", async () => {
    creds.saveBankCredentials(ws, "leumi", { username: "u", password: "p" });
    fake.scrapeBank = async () => ({ success: false, accounts: [], errorMessage: "down" });
    const { isSyncRunning } = await import("@/server/sync/lock");

    await orch.runAllWorkspaces(undefined, undefined, "manual");
    expect(isSyncRunning()).toBe(false);
    await vi.waitFor(() => expect(fake.bot.feedback).toBe(1));
    expect(fake.bot.alerts).toEqual([]);

    const summaries = await orch.runAllWorkspaces(undefined, undefined, "scheduled");
    await vi.waitFor(() => expect(fake.bot.alerts).toHaveLength(1));
    expect(fake.bot.alerts[0]).toEqual(summaries.flatMap((w) => w.providers));
    expect(isSyncRunning()).toBe(false);
  });

  it("a Telegram failure after the sync is logged, never thrown", async () => {
    fake.bot.fail = true;
    const log = await import("@/server/lib/log");
    const logged = vi.spyOn(log, "logError").mockImplementation(() => undefined);
    try {
      await expect(orch.runAllWorkspaces()).resolves.toBeInstanceOf(Array);
      await vi.waitFor(() =>
        expect(logged).toHaveBeenCalledWith("bot/spend-feedback", expect.any(Error)),
      );
    } finally {
      logged.mockRestore();
    }
  });

  it("releases the lock even when a workspace sync throws", async () => {
    const { isSyncRunning } = await import("@/server/sync/lock");
    const spy = vi.spyOn(settings, "getAppSettings").mockImplementation(() => {
      throw new Error("settings unreadable");
    });
    creds.saveBankCredentials(ws, "leumi", { username: "u", password: "p" });
    try {
      await expect(orch.runAllWorkspaces()).rejects.toThrow("settings unreadable");
      expect(isSyncRunning()).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("friendlyAIError", () => {
  it("turns provider errors into something a person can act on", () => {
    expect(orch.friendlyAIError(new Error("model 'x' not found"), "llama3")).toBe(
      'Ollama model "llama3" is not installed. Run: ollama pull llama3',
    );
    expect(orch.friendlyAIError(new Error("connect ECONNREFUSED 127.0.0.1:11434"), "m")).toMatch(
      /Ollama is not reachable/,
    );
    expect(orch.friendlyAIError(new Error("TypeError: fetch failed"), "m")).toMatch(
      /not reachable/,
    );
    expect(orch.friendlyAIError(new Error("403 Forbidden"), "m")).toMatch(
      /Claude API request was rejected/,
    );
    expect(orch.friendlyAIError("weird", "m")).toBe("AI categorization failed: weird");
  });
});
