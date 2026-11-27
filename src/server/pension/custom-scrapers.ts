import "server-only";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Browser, CookieData, ElementHandle, Page } from "puppeteer";
import puppeteerVanilla from "puppeteer";
import { addExtra } from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { ScrapePensionArgs } from "israeli-pension-scrapers";
import type { PensionCredentials } from "@/lib/pension";
import { readStatementTable } from "@/lib/file-import";
import { SYNC_ERRORS } from "@/lib/sync-errors";
import { redactError } from "@/server/lib/redact";
import {
  failed,
  parseAltshulerCards,
  parseExcellenceCash,
  parseExcellenceRows,
  parseHarelCards,
  parsePhoenixCards,
  type AltshulerCard,
  type PhoenixCard,
  type ScrapeOutcome,
} from "./parsers";

/**
 * The library's arguments, with the user name and password the custom scrapers also take.
 * The custom scrapers report progress as step keys (login, otp, balances, export) the settings page translates.
 */
export interface ScrapeArgs extends Omit<ScrapePensionArgs, "credentials"> {
  credentials: PensionCredentials;
}

// puppeteer-extra's bundled types lag the installed puppeteer; the cast keeps the call site clean.
const puppeteer = addExtra(puppeteerVanilla as unknown as Parameters<typeof addExtra>[0]);
puppeteer.use(StealthPlugin());

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isContextDestroyedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Execution context was destroyed") ||
    msg.includes("Cannot find context with specified id") ||
    msg.includes("Target closed")
  );
}

/** Resolves true when `wait` settles in time, false on its timeout. */
const reached = (wait: Promise<unknown>) =>
  wait.then(
    () => true,
    () => false,
  );

async function findFirstVisible(
  page: Page,
  selectors: string[],
  timeoutMs = 15000,
): Promise<ElementHandle<Element> | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      for (const sel of selectors) {
        for (const h of await page.$$(sel)) {
          const visible = await h
            .evaluate((el) => {
              const style = window.getComputedStyle(el);
              const rect = el.getBoundingClientRect();
              return (
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                rect.width > 0 &&
                rect.height > 0
              );
            })
            .catch(() => false);
          if (visible) return h;
        }
      }
    } catch (err) {
      if (!isContextDestroyedError(err)) throw err;
    }
    await delay(250);
  }
  return null;
}

async function fillInput(page: Page, handle: ElementHandle<Element>, value: string) {
  await handle.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  await handle.type(value, { delay: 20 });
  await handle
    .evaluate((el) => {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    })
    .catch(() => {});
}

/** Clicks the visible, unobscured button whose text has one of `labels`, preferring one near `anchor`. */
async function clickButtonByText(
  page: Page,
  labels: string[],
  excludeLabels: string[] = [],
  anchor?: ElementHandle<Element> | null,
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const handles = await page.$$('button, [role="button"], input[type="submit"]');
      const candidates: { handle: ElementHandle<Element>; inAnchorScope: boolean }[] = [];
      for (const handle of handles) {
        const info = await handle
          .evaluate(
            (el, wanted, excluded, anchorEl) => {
              const style = window.getComputedStyle(el);
              const rect = el.getBoundingClientRect();
              if (
                style.display === "none" ||
                style.visibility === "hidden" ||
                rect.width === 0 ||
                rect.height === 0 ||
                (el as HTMLButtonElement).disabled
              )
                return null;
              const text = (el.textContent || (el as HTMLInputElement).value || "").trim();
              if (excluded.some((ex) => text.includes(ex))) return null;
              if (!wanted.some((w) => text.includes(w))) return null;
              const topEl = document.elementFromPoint(
                rect.left + rect.width / 2,
                rect.top + rect.height / 2,
              );
              if (topEl && topEl !== el && !el.contains(topEl)) return null;
              let inScope = false;
              if (anchorEl) {
                const scope =
                  anchorEl.closest(
                    'app-pinfo-portal-mfa, [role="dialog"], dialog, form, .modal, [class*="modal"]',
                  ) || anchorEl.parentElement?.parentElement?.parentElement;
                inScope = Boolean(scope && scope.contains(el));
              }
              return { inScope };
            },
            labels,
            excludeLabels,
            anchor ?? null,
          )
          .catch(() => null);
        if (info) candidates.push({ handle, inAnchorScope: info.inScope });
      }
      const target = candidates.find((c) => c.inAnchorScope)?.handle ?? candidates[0]?.handle;
      if (!target) return false;
      await target.click();
      return true;
    } catch (err) {
      if (!isContextDestroyedError(err) || attempt === 2) throw err;
      await delay(500);
    }
  }
  return false;
}

interface OtpStep {
  selectors: string[];
  confirm: string[];
  exclude?: string[];
  /** True when the site always asks for a code after the first step. */
  required: boolean;
}

/** Waits for the code input (one box or 4+ digit boxes), asks the user, fills and submits. False if it never showed. */
async function enterOtp(page: Page, args: ScrapeArgs, otp: OtpStep): Promise<boolean> {
  const deadline = Date.now() + 30000;
  let singleInput: ElementHandle<Element> | null = null;
  let digitBoxes: ElementHandle<Element>[] = [];
  while (Date.now() < deadline && !singleInput && digitBoxes.length === 0) {
    try {
      const visible: ElementHandle<Element>[] = [];
      for (const box of await page.$$('input[maxlength="1"]')) {
        const vis = await box
          .evaluate((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          })
          .catch(() => false);
        if (vis) visible.push(box);
      }
      if (visible.length >= 4) digitBoxes = visible;
      else singleInput = await findFirstVisible(page, otp.selectors, 400);
    } catch (err) {
      if (!isContextDestroyedError(err)) throw err;
    }
    if (!singleInput && digitBoxes.length === 0) await delay(300);
  }
  if (!singleInput && digitBoxes.length === 0) return false;
  if (!args.onOtpNeeded) throw new Error("SMS verification code is required.");

  args.onProgress?.("otp");
  const code = (await args.onOtpNeeded()).trim();
  if (digitBoxes.length > 0) {
    for (let i = 0; i < Math.min(digitBoxes.length, code.length); i++)
      await fillInput(page, digitBoxes[i], code[i]);
  } else if (singleInput) {
    await fillInput(page, singleInput, code);
  }
  await delay(300);
  const anchor = digitBoxes[0] ?? singleInput;
  if (!(await clickButtonByText(page, otp.confirm, otp.exclude, anchor))) {
    const submit = await findFirstVisible(page, ['button[type="submit"]'], 1500);
    if (submit) await submit.click();
    else await page.keyboard.press("Enter").catch(() => {});
  }
  return true;
}

interface SignIn {
  url: string;
  beforeLogin?: (page: Page) => Promise<void>;
  /** The first field doubles as the "is the login form showing" check. */
  fields: { selectors: string[]; value: string }[];
  submitLabels: string[];
  otp?: OtpStep;
  /** Runs in the page: true once the signed-in screen shows. */
  signedIn: () => boolean;
}

/** Shared sign-in: fill the form (unless a saved session skips it), the SMS step, then wait for the signed-in screen. */
async function signIn(page: Page, args: ScrapeArgs, s: SignIn): Promise<boolean> {
  args.onProgress?.("login");
  await page.goto(s.url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await delay(2000);
  if (s.beforeLogin) await s.beforeLogin(page);
  const first = await findFirstVisible(page, s.fields[0].selectors, 8000);
  if (first) {
    for (const [i, field] of s.fields.entries()) {
      const input = i === 0 ? first : await findFirstVisible(page, field.selectors, 5000);
      if (!input || !field.value) return false;
      await fillInput(page, input, field.value);
    }
    if (!(await clickButtonByText(page, s.submitLabels))) {
      const submit = await findFirstVisible(page, ['button[type="submit"]'], 3000);
      if (!submit) return false;
      await submit.click();
    }
    if (s.otp && !(await enterOtp(page, args, s.otp)) && s.otp.required) return false;
  }
  return reached(page.waitForFunction(s.signedIn, { timeout: 45000 }));
}

const OTP_LABELS = ["המשך", "אישור", "כניסה"];

async function scrapeAltshuler(page: Page, args: ScrapeArgs): Promise<ScrapeOutcome> {
  const ok = await signIn(page, args, {
    url: "https://online.as-invest.co.il/",
    fields: [
      {
        selectors: [
          'input[placeholder*="ת.ז"]',
          'input[aria-label*="ת.ז"]',
          'input[name="idNumber"]',
        ],
        value: args.credentials.id ?? "",
      },
      {
        selectors: ['input[placeholder*="טלפון"]', 'input[aria-label*="טלפון"]'],
        value: args.credentials.phone ?? "",
      },
    ],
    submitLabels: ["שלחו לי סיסמה", "שלח קוד", "כניסה"],
    otp: {
      selectors: [
        'input[placeholder*="קוד"]',
        'input[placeholder*="סיסמ"]',
        'input[name*="otp"]',
        'input[autocomplete="one-time-code"]',
      ],
      confirm: OTP_LABELS,
      exclude: ["דלג"],
      required: true,
    },
    signedIn: () =>
      !window.location.pathname.includes("/login") &&
      Boolean(document.querySelector(".cases-box, app-case-box")),
  });
  if (!ok) return failed(SYNC_ERRORS.pensionLoginFailed);

  args.onProgress?.("balances");
  await page.waitForNetworkIdle({ idleTime: 800, timeout: 15000 }).catch(() => {});
  const cards = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".cases-box, app-case-box"), (card) => ({
      accNum: card.querySelector(".account-number")?.textContent?.replace(/\D/g, "") || "",
      trackName:
        card
          .querySelector(".tracks")
          ?.textContent?.replace(/^שם המסלול:\s*/, "")
          .trim() || "",
      amount: card.querySelector(".amount")?.textContent?.trim() || "",
    })),
  );
  return parseAltshulerCards(cards satisfies AltshulerCard[]);
}

async function scrapePhoenix(page: Page, args: ScrapeArgs): Promise<ScrapeOutcome> {
  const ok = await signIn(page, args, {
    url: "https://my.fnx.co.il/",
    fields: [
      { selectors: ['input[placeholder*="ת.ז"]'], value: args.credentials.id ?? "" },
      { selectors: ['input[placeholder*="טלפון"]'], value: args.credentials.phone ?? "" },
    ],
    submitLabels: ["שלחו לי קוד כניסה", "שלח קוד", "כניסה"],
    otp: {
      selectors: [
        'input[name*="otp"]',
        'input[name*="sms"]',
        'input[placeholder*="קוד"]',
        'input[autocomplete="one-time-code"]',
      ],
      confirm: OTP_LABELS,
      required: true,
    },
    signedIn: () =>
      !window.location.hostname.includes("auth.") &&
      (Boolean(document.querySelector("app-saving-item")) ||
        Boolean(document.body?.innerText?.includes('סה"כ השקעות וחסכונות'))),
  });
  if (!ok) return failed(SYNC_ERRORS.pensionLoginFailed);

  args.onProgress?.("balances");
  const savingsLink = await findFirstVisible(page, ['a[href="/savings"]'], 5000);
  if (savingsLink) await savingsLink.click();
  else await page.goto("https://my.fnx.co.il/savings", { waitUntil: "domcontentloaded" });
  const onSavings = await reached(
    page.waitForFunction(() => document.body?.innerText?.includes("פירוט מוצרים"), {
      timeout: 20000,
    }),
  );
  if (!onSavings) return failed(SYNC_ERRORS.pensionNoData);
  await page.waitForNetworkIdle({ idleTime: 800, timeout: 10000 }).catch(() => {});

  // A product card is the innermost element holding both "מספר חשבון" and "סכום חיסכון".
  const cards = await page.evaluate(() => {
    const holds = (el: Element) => {
      const t = el.textContent || "";
      return t.includes("מספר חשבון") && t.includes("סכום חיסכון");
    };
    const root = document.querySelector("main") ?? document.body;
    const all = Array.from(root.querySelectorAll("div, section, article"));
    const matches = all.filter(holds);
    return matches
      .filter((el) => !matches.some((o) => o !== el && el.contains(o)))
      .map((el) => {
        const text = (el.textContent || "").trim();
        let name = "";
        for (let cur: Element | null = el, d = 0; d < 3 && cur && !name; d++) {
          for (let prev = cur.previousElementSibling; prev && !name;) {
            const t = prev.textContent?.trim() || "";
            if (t && t.length < 60 && !t.includes("פירוט מוצרים")) name = t;
            prev = prev.previousElementSibling;
          }
          cur = cur.parentElement;
        }
        return {
          name,
          accountNumber: /מספר חשבון\s*([0-9\-()\s]+)/.exec(text)?.[1]?.trim() || "",
          text,
        };
      });
  });
  return parsePhoenixCards(cards satisfies PhoenixCard[]);
}

async function scrapeExcellence(page: Page, args: ScrapeArgs): Promise<ScrapeOutcome> {
  const ok = await signIn(page, args, {
    url: "https://extradepro.xnes.co.il/app",
    fields: [
      {
        selectors: ["#login-input", 'input[name="login"]'],
        value: args.credentials.username ?? "",
      },
      {
        selectors: ["#password-input", 'input[name="password"]'],
        value: args.credentials.password ?? "",
      },
    ],
    submitLabels: ["כניסה"],
    otp: {
      selectors: [
        'input[name*="otp"]',
        'input[name*="code"]',
        'input[placeholder*="קוד"]',
        'input[autocomplete="one-time-code"]',
      ],
      confirm: OTP_LABELS,
      required: false,
    },
    signedIn: () =>
      !window.location.pathname.includes("/login") &&
      Boolean(
        document.body?.innerText?.includes("שווי תיק") ||
        document.body?.innerText?.includes("יתרה לפעילות"),
      ),
  });
  if (!ok) return failed(SYNC_ERRORS.pensionLoginFailed);

  await page.waitForNetworkIdle({ idleTime: 800, timeout: 10000 }).catch(() => {});
  const cash = parseExcellenceCash(await page.evaluate(() => document.body?.innerText || ""));
  // Welcome and tips pop-ups cover the menu.
  for (let i = 0; i < 3; i++) {
    if (!(await clickButtonByText(page, ["פעם אחרת", "בואו נתחיל", "הבנתי", "דלג"]))) break;
    await delay(600);
  }

  args.onProgress?.("export");
  // The export lands in a private temp folder that is removed right after it is read.
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), "penny-xnes-"));
  try {
    const cdp = await page.browser().target().createCDPSession();
    await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });

    const clickText = async (wanted: string, exact: boolean) => {
      for (const h of await page.$$("button, a, li, [role='button'], [role='menuitem']")) {
        const match = await h
          .evaluate(
            (el, w, ex) => {
              const rect = el.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0 || el.closest(".cdk-visually-hidden"))
                return false;
              const t = (el.textContent || "").trim();
              return ex ? t === w : t.includes(w) && t.length < 30;
            },
            wanted,
            exact,
          )
          .catch(() => false);
        if (match) {
          await h.click();
          return true;
        }
      }
      return false;
    };

    if (!(await clickText("יצוא לאקסל", false))) {
      const menu = await findFirstVisible(
        page,
        ["#menu-button", 'button[aria-label="תפריט"]'],
        4000,
      );
      if (menu) {
        await menu.click();
        await delay(700);
        await clickText("יצוא לאקסל", false);
      }
    }
    await delay(800);
    if (!(await clickText("יצוא", true))) return failed(SYNC_ERRORS.pensionExportFailed);

    let file: string | null = null;
    for (const end = Date.now() + 20000; Date.now() < end && !file; await delay(350)) {
      const done = fs.readdirSync(downloadDir).filter((f) => !/\.(crdownload|tmp)$/.test(f));
      if (done.length > 0) file = path.join(downloadDir, done[0]);
    }
    if (!file) return failed(SYNC_ERRORS.pensionExportFailed);
    await delay(400);
    const rows = await readStatementTable(new Uint8Array(fs.readFileSync(file)), file).catch(
      () => null,
    );
    if (!rows) return failed(SYNC_ERRORS.pensionExportFailed);
    return parseExcellenceRows(rows, cash);
  } finally {
    fs.rmSync(downloadDir, { recursive: true, force: true });
  }
}

async function scrapeHarel(page: Page, args: ScrapeArgs): Promise<ScrapeOutcome> {
  const ok = await signIn(page, args, {
    url: "https://www.harel-group.co.il/Pages/login-Page/Login.aspx",
    beforeLogin: async (p) => {
      await clickButtonByText(p, ["כניסה לאזור האישי"]);
      await delay(1500);
    },
    fields: [
      {
        selectors: ["#idUser", 'input[placeholder*="ת.ז"]', 'input[placeholder*="זהות"]'],
        value: args.credentials.id ?? "",
      },
      { selectors: ["#phone", 'input[placeholder*="טלפון"]'], value: args.credentials.phone ?? "" },
    ],
    submitLabels: ["המשך", "כניסה", "שלח"],
    otp: {
      selectors: [
        'input[name*="otp"]',
        'input[id*="code"]',
        'input[name*="sms"]',
        'input[placeholder*="קוד"]',
        'input[autocomplete="one-time-code"]',
      ],
      confirm: OTP_LABELS,
      required: true,
    },
    signedIn: () =>
      window.location.href.includes("client-view") ||
      window.location.href.includes("my-harel") ||
      Boolean(document.querySelector("#client-view")),
  });
  if (!ok) return failed(SYNC_ERRORS.pensionLoginFailed);

  args.onProgress?.("balances");
  if (!page.url().includes("client-view")) {
    await page
      .goto("https://www.harel-group.co.il/personal-info/my-harel/Pages/client-view.aspx", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      })
      .catch(() => {});
  }

  const deadline = Date.now() + 25000;
  let cards: { name: string; amount: string }[] = [];
  while (Date.now() < deadline) {
    const targetFrame =
      page.frames().find((f) => f.url().includes("apps.client-view/client-view")) ??
      page.mainFrame();
    cards = await targetFrame
      .evaluate(() => {
        const candidates: { el: Element; name: string; amount: string }[] = [];
        const els = Array.from(document.querySelectorAll("a, button, div, li"));
        for (const el of els) {
          const text = (el.textContent || "").replace(/\s+/g, " ").trim();
          if (!text.includes("₪") || text.length > 80) continue;
          if (el.querySelectorAll("div, a, button").length > 6) continue;
          const m = text.match(/^(.+?)\s*(₪\s*[\d,]+(?:\.\d+)?)$/);
          if (!m) continue;
          const name = m[1].trim();
          const amount = m[2].trim();
          if (!name) continue;
          candidates.push({ el, name, amount });
        }
        const out: { name: string; amount: string }[] = [];
        const seen = new Set<string>();
        for (const item of candidates) {
          // Drop wrapper containers that enclose another matched card element.
          const isWrapper = candidates.some(
            (other) => other.el !== item.el && item.el.contains(other.el),
          );
          if (isWrapper || seen.has(item.name)) continue;
          seen.add(item.name);
          out.push({ name: item.name, amount: item.amount });
        }
        return out;
      })
      .catch(() => []);
    if (cards.length > 0) break;
    await delay(500);
  }

  return parseHarelCards(cards);
}

const SCRAPERS = {
  altshuler: scrapeAltshuler,
  phoenix: scrapePhoenix,
  excellence: scrapeExcellence,
  harel: scrapeHarel,
};
export type CustomFund = keyof typeof SCRAPERS;

/** Runs one of our own Puppeteer scrapers. The browser is always closed; nothing is written to disk but the temp export. */
export async function scrapeCustom(fund: CustomFund, args: ScrapeArgs): Promise<ScrapeOutcome> {
  const headless = args.headless ?? process.env.PENSION_SCRAPERS_HEADFUL !== "1";
  const noSandbox =
    process.env.DISABLE_CHROMIUM_SANDBOX === "1" || process.env.PENSION_SCRAPERS_NO_SANDBOX === "1";
  const browser = (await puppeteer.launch({
    headless,
    defaultViewport: headless ? { width: 1280, height: 900 } : null,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--lang=he-IL",
      ...(noSandbox ? ["--no-sandbox", "--disable-setuid-sandbox"] : []),
      ...(headless ? [] : ["--window-size=1280,960"]),
    ],
  })) as unknown as Browser;
  try {
    const saved = await args.session?.load(args.connectionId ?? "").catch(() => null);
    if (saved?.length) await browser.setCookie(...(saved as CookieData[])).catch(() => {});
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setExtraHTTPHeaders({ "Accept-Language": "he-IL,he;q=0.9,en;q=0.8" });
    const outcome = await SCRAPERS[fund](page, args);
    if (outcome.success)
      await args.session?.save(args.connectionId ?? "", await browser.cookies()).catch(() => {});
    return outcome;
  } catch (err) {
    return failed(`${SYNC_ERRORS.pensionUnexpected} (${redactError(err)})`);
  } finally {
    await browser.close().catch(() => {});
  }
}
