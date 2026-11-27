import "server-only";
import { logError } from "@/server/lib/log";
import { pennyEnv } from "@/lib/legacy-names";

import { CompanyTypes, createScraper } from "israeli-bank-scrapers";
import {
  CompanyTypes as ForkCompanyTypes,
  createScraper as createForkScraper,
} from "@sergienko4/israeli-bank-scrapers";
import type { ScrapeResult, ScrapedSecurity } from "./types";
import { toScrapeResult, type RawScrapeResult } from "./result";
import { scrapeHapoalimSecurities } from "./hapoalim-securities";
import { usesScraperFork } from "./select";
import { preparePage } from "./user-agent";
import { SYNC_ERRORS } from "@/lib/sync-errors";
import { redact } from "@/server/lib/redact";
import type { BankProvider } from "@/lib/types";
import { getWorkspaceSetting } from "../db/queries/settings";

const PROVIDER_MAP: Record<string, CompanyTypes> = {
  isracard: CompanyTypes.isracard,
  cal: CompanyTypes.visaCal,
  max: CompanyTypes.max,
  amex: CompanyTypes.amex,
  hapoalim: CompanyTypes.hapoalim,
  leumi: CompanyTypes.leumi,
  mizrahi: CompanyTypes.mizrahi,
  discount: CompanyTypes.discount,
  mercantile: CompanyTypes.mercantile,
  beinleumi: CompanyTypes.beinleumi,
  otsarHahayal: CompanyTypes.otsarHahayal,
  union: CompanyTypes.union,
  pagi: CompanyTypes.pagi,
  yahav: CompanyTypes.yahav,
  massad: CompanyTypes.massad,
  beyahadBishvilha: CompanyTypes.beyahadBishvilha,
  behatsdaa: CompanyTypes.behatsdaa,
  oneZero: CompanyTypes.oneZero,
};

function sanitizeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "An unknown error occurred during scraping";
  }
  return redact(error.message);
}

/**
 * Detect transient errors we should retry, or surface with friendlier copy.
 */
function classifyError(error: unknown): {
  retryable: boolean;
  friendly: string | null;
} {
  if (!(error instanceof Error)) {
    return { retryable: false, friendly: null };
  }
  const msg = error.message;

  // Bot-protection block from the bank. The Isracard variant returns
  // "result: Block Automation" out of the ValidateIdData endpoint, so this
  // must match BEFORE the ValidateIdData credential check below.
  if (/Block Automation|Cloudflare|captcha|recaptcha/i.test(msg)) {
    return { retryable: false, friendly: SYNC_ERRORS.botBlocked };
  }

  // Isracard ValidateIdData returns an empty body when the ID/card-suffix
  // combination doesn't match a real card. This is almost always a credential
  // typo (most commonly entering the full ID into the "Last 6 Digits" field).
  if (/reqName=ValidateIdData/.test(msg)) {
    return { retryable: false, friendly: SYNC_ERRORS.isracardIdMismatch };
  }

  // Empty JSON response from bank - usually transient (rate limit, bot block, flaky endpoint).
  if (/Unexpected end of JSON input/.test(msg) || /fetchPostWithinPage parse error/.test(msg)) {
    return { retryable: true, friendly: SYNC_ERRORS.emptyResponse };
  }

  if (/net::ERR_/i.test(msg) || /ECONNRESET|ECONNREFUSED|ETIMEDOUT/i.test(msg)) {
    return { retryable: true, friendly: SYNC_ERRORS.network };
  }

  if (/Navigation timeout|TimeoutError/i.test(msg)) {
    return { retryable: true, friendly: SYNC_ERRORS.slowSite };
  }

  return { retryable: false, friendly: null };
}

// Failures the scraper reports as a result (not a thrown error) that usually clear on a second attempt.
// Not TIMEOUT: it also covers login and 2FA waits, and retrying means a second login, maybe a second SMS.
const RETRYABLE_ERROR_TYPES = new Set(["NETWORK_ERROR"]);

// A Linux host without a display (Docker) cannot show the browser, so don't suggest it there.
const unexpected =
  process.platform === "linux" && !process.env.DISPLAY
    ? SYNC_ERRORS.unexpectedHeadless
    : SYNC_ERRORS.unexpected;

const FRIENDLY_ERRORS: Record<string, string> = {
  WAF_BLOCKED: SYNC_ERRORS.botBlocked,
  NETWORK_ERROR: SYNC_ERRORS.network,
  INVALID_PASSWORD: SYNC_ERRORS.invalidPassword,
  CHANGE_PASSWORD: SYNC_ERRORS.changePassword,
  ACCOUNT_BLOCKED: SYNC_ERRORS.accountBlocked,
  TIMEOUT: SYNC_ERRORS.timeout,
  TWO_FACTOR_RETRIEVER_MISSING: SYNC_ERRORS.twoFactor,
  GENERIC: unexpected,
  GENERAL_ERROR: unexpected,
};

async function runScrape(
  provider: BankProvider,
  credentials: Record<string, string>,
  startDate: Date,
  showBrowser: boolean,
): Promise<ScrapeResult> {
  const companyId = PROVIDER_MAP[provider];
  if (!companyId) {
    return {
      success: false,
      accounts: [],
      errorMessage: `Unsupported provider: ${provider}`,
    };
  }

  const chromiumArgs = [
    "--disable-blink-features=AutomationControlled",
    "--disable-features=IsolateOrigins,site-per-process",
  ];
  // Chromium's renderer sandbox is on by default on macOS, Windows, and
  // most Linux installs. Self-hosters running as root or in unprivileged
  // Docker need to opt out (the sandbox fails to start there).
  if (pennyEnv("DISABLE_CHROMIUM_SANDBOX") === "1") {
    chromiumArgs.push("--no-sandbox");
  }
  // Egress allowlist (docker-compose.egress.yml): the browser reaches the internet only through the proxy.
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  if (proxy) chromiumArgs.push(`--proxy-server=${proxy}`);

  const forkCompany = !usesScraperFork(provider)
    ? null
    : provider === "isracard"
      ? ForkCompanyTypes.Isracard
      : ForkCompanyTypes.Max;

  if (forkCompany && showBrowser) {
    // Say it out loud: the fork has no browser, so a user waiting for the 2FA window would
    // otherwise see nothing happen and assume the sync is stuck.
    console.warn(`[scraper] ${provider} uses the browserless fork - no browser window will open`);
  }

  // The fork is browserless and drives the bank APIs directly, so it has no browser
  // or installments options; it takes a whole-run deadline instead of a page timeout.
  let securities: ScrapedSecurity[] | undefined;
  let result;
  if (forkCompany) {
    result = await createForkScraper({
      companyId: forkCompany,
      startDate,
      deadlineMs: 60000,
    }).scrape(credentials as never);
  } else {
    const scraper = createScraper({
      companyId,
      startDate,
      combineInstallments: false,
      showBrowser,
      // Verbose logs include URLs and posted payloads (incl. credentials), so never enable them.
      verbose: false,
      timeout: 60000,
      args: chromiumArgs,
      preparePage,
    });
    if (provider === "hapoalim") {
      const s = scraper as unknown as {
        page?: Parameters<typeof scrapeHapoalimSecurities>[0];
        fetchData: () => Promise<RawScrapeResult>;
      };
      const origFetchData = s.fetchData.bind(s);
      s.fetchData = async () => {
        const res = await origFetchData();
        if (res.success && s.page) {
          securities = await scrapeHapoalimSecurities(s.page);
        }
        return res;
      };
    }
    result = await scraper.scrape(credentials as never);
  }

  if (!result.success) {
    const errorType = result.errorType ?? "GENERIC";
    const friendly = FRIENDLY_ERRORS[errorType];
    const detail = result.errorMessage ? sanitizeError(new Error(result.errorMessage)) : errorType;
    logError("scraper", new Error(`failed (${errorType}): ${detail}`), { provider });
    return {
      success: false,
      accounts: [],
      errorMessage: friendly ? `${friendly} (${detail})` : `Scraping failed: ${detail}`,
      retryable: RETRYABLE_ERROR_TYPES.has(errorType),
    };
  }

  const mapped = toScrapeResult(result);
  if (securities) mapped.securities = securities;
  const txnCount = mapped.accounts.reduce((sum, a) => sum + a.transactions.length, 0);
  console.log(
    `[scraper] ${mapped.success ? "success" : "rejected"}: ${mapped.accounts.length} account(s), ${txnCount} transaction(s)`,
  );
  return mapped;
}

interface ScrapeBankOptions {
  /**
   * When true, force showBrowser regardless of the workspace setting. Used for
   * the per-bank manual-2FA flag so the user can solve a 2FA challenge in the
   * popup for just that one provider.
   */
  manualTwoFactor?: boolean;
}

export async function scrapeBank(
  workspaceId: number,
  provider: BankProvider,
  credentials: Record<string, string>,
  startDate: Date,
  options: ScrapeBankOptions = {},
): Promise<ScrapeResult> {
  const workspaceShowBrowser = getWorkspaceSetting(workspaceId, "scraper_show_browser") === "true";
  const showBrowser = options.manualTwoFactor === true || workspaceShowBrowser;
  const MAX_ATTEMPTS = 2;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(
        `[scraper] starting scrape for ${provider} from ${startDate.toISOString()} (attempt ${attempt}/${MAX_ATTEMPTS}, showBrowser=${showBrowser})`,
      );
      const result = await runScrape(provider, credentials, startDate, showBrowser);
      if (result.success || !result.retryable || attempt === MAX_ATTEMPTS) return result;
      const backoffMs = 2000 * attempt;
      console.log(`[scraper] retryable failure, waiting ${backoffMs}ms`);
      await new Promise((r) => setTimeout(r, backoffMs));
    } catch (error) {
      lastError = error;
      logError("scraper", new Error(sanitizeError(error)), { provider, attempt });
      const { retryable } = classifyError(error);
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      const backoffMs = 2000 * attempt;
      console.log(`[scraper] retryable error, waiting ${backoffMs}ms`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  const { friendly, retryable } = classifyError(lastError);
  const detail = sanitizeError(lastError);
  return {
    success: false,
    accounts: [],
    errorMessage: friendly ? `${friendly} (${detail})` : detail,
    // Still transient after the attempts above: the scheduler tries this connection again later today.
    retryable,
  };
}
