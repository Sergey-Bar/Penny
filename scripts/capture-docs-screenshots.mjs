// scripts/capture-docs-screenshots.mjs
//
// Boot Next.js against a tmp data dir seeded with fake data,
// capture docs screenshots into public/screenshots/ (the PWA manifest uses dashboard-light.png).
//
// Usage:
//   npm run docs:screenshots
//
// Requires a built Next app (run `npm run build` first) OR uses dev mode.

import { spawn } from "node:child_process";
import { systemBin } from "./lib/system-bin.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import puppeteer from "puppeteer";
import { banks, transactions, budgets } from "./docs-seed/fake-data.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
// Run the repo's own next binary through node: no PATH lookup, no shell quoting.
const NEXT_BIN = path.join(REPO_ROOT, "node_modules", "next", "dist", "bin", "next");
const OUT_DIR = path.join(REPO_ROOT, "public/screenshots");

const VIEWPORT = { width: 1600, height: 1100, deviceScaleFactor: 2 };
const PORT = 4399; // separate from prod 41234 and dev 3000

const SCREENS = [
  { name: "home-light.png", path: "/", theme: "light" },
  { name: "dashboard-light.png", path: "/budget", theme: "light" },
  { name: "dashboard-dark.png", path: "/", theme: "dark" },
  { name: "transactions-light.png", path: "/transactions", theme: "light" },
  { name: "settings-bank-light.png", path: "/settings/bank", theme: "light" },
  { name: "settings-ai-light.png", path: "/settings/ai", theme: "light" },
  { name: "settings-categories-light.png", path: "/settings/categories", theme: "light" },
  {
    name: "setup-bank-light.png",
    path: "/setup",
    theme: "light",
  },
];

function seedDb(dbDir) {
  fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, "penny.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  // Apply every migration the same way src/server/db/migrate.ts does, so the app sees an up-to-date DB.
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  );
  const dir = path.join(REPO_ROOT, "src/server/db/migrations");
  for (const f of fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b))) {
    db.exec(fs.readFileSync(path.join(dir, f), "utf-8"));
    db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(f);
  }

  const insertBank = db.prepare(
    `INSERT INTO bank_credentials (workspace_id, provider, credentials_encrypted, iv, auth_tag) VALUES (1, ?, ?, ?, ?)`,
  );
  for (const b of banks)
    insertBank.run(b.provider, Buffer.from("demo"), Buffer.from("demo"), Buffer.from("demo"));

  const run = db
    .prepare(
      `INSERT INTO sync_runs (workspace_id, provider, started_at, completed_at, status, scrape_from_date)
     VALUES (1, 'demo', datetime('now'), datetime('now'), 'completed', date('now','-90 day'))`,
    )
    .run();
  const insertTx = db.prepare(
    `INSERT INTO transactions
      (workspace_id, account_number, date, processed_date, original_amount, original_currency,
       charged_amount, charged_currency, description, type, status, category_id, provider, sync_run_id, dedup_hash, kind)
     VALUES (1, '****1234', @date, @date, @amount, 'ILS', @amount, 'ILS', @desc, 'normal', 'completed', @cat, @provider, @run, @hash, @kind)`,
  );
  transactions.forEach((t, i) =>
    insertTx.run({
      date: t.date,
      amount: t.amount,
      desc: t.merchant,
      cat: t.cat,
      provider: t.provider,
      run: run.lastInsertRowid,
      hash: `demo-${i}`,
      kind: t.amount > 0 ? "income" : "expense",
    }),
  );

  const insertBudget = db.prepare(
    `INSERT INTO budgets (workspace_id, category_id, monthly_amount, is_auto) VALUES (1, ?, ?, 0)`,
  );
  for (const b of budgets) insertBudget.run(b.category_id, b.monthly_target);

  db.close();
  return dbPath;
}

function startServer(dataDir) {
  const env = { ...process.env, PENNY_DATA_DIR: dataDir, PORT: String(PORT) };
  const child = spawn(process.execPath, [NEXT_BIN, "dev", "-H", "127.0.0.1", "-p", String(PORT)], {
    cwd: REPO_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return child;
}

function stopServer(server) {
  if (process.platform === "win32") {
    spawn(systemBin("taskkill"), ["/PID", String(server.pid), "/T", "/F"]);
  } else {
    server.kill("SIGTERM");
  }
}

async function waitForServer() {
  const url = `http://127.0.0.1:${PORT}/api/health`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    const html = document.documentElement;
    html.classList.remove("light", "dark");
    html.classList.add(t);
    try {
      localStorage.setItem("theme", t);
    } catch {}
  }, theme);
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "penny-docs-"));
  console.log(`Tmp data dir: ${tmpDir}`);

  console.log("Seeding fake data...");
  seedDb(tmpDir);
  console.log("  ✓ seeded");

  console.log("Starting Next.js (this can take 10-20s)...");
  const server = startServer(tmpDir);
  server.stdout.on("data", (d) => process.stdout.write(`  [next] ${d}`));
  server.stderr.on("data", (d) => process.stderr.write(`  [next!] ${d}`));

  const ready = await waitForServer();
  if (!ready) {
    stopServer(server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error("Next.js did not become ready in 60s");
  }
  console.log("  ✓ Next.js is ready");

  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: process.env.CHROME_PATH,
    defaultViewport: VIEWPORT,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 120000 });

    for (const screen of SCREENS) {
      const dest = path.join(OUT_DIR, screen.name);
      console.log(`Capturing ${screen.name} ← ${screen.path} (${screen.theme})`);
      await setTheme(page, screen.theme);
      await page.goto(`http://127.0.0.1:${PORT}${screen.path}`, {
        waitUntil: "load",
        timeout: 120000,
      });
      await setTheme(page, screen.theme);
      await new Promise((r) => setTimeout(r, 4000));
      await page.screenshot({ path: dest, fullPage: false });
      console.log("  ✓ saved");
    }
  } finally {
    await browser.close();
    stopServer(server);
    await new Promise((r) => setTimeout(r, 1000));
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log("Cleaned up tmp dir");
  }
})().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
