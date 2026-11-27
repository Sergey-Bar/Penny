import { expect, test, type Page } from "@playwright/test";

// When the home screen's main request fails, the person must see that it failed: not a blank page
// and not skeletons that never resolve. The failure is forced in the browser (page.route), so the
// server and its data are untouched and this can run in any order.

// The empty test install would otherwise start at first-run onboarding.
test.beforeAll(async ({ playwright }) => {
  const base = `http://127.0.0.1:${process.env.PENNY_E2E_PORT ?? 3100}`; // playwright.config.ts PORT; the API wants a same-origin header
  const api = await playwright.request.newContext({
    baseURL: base,
    extraHTTPHeaders: { origin: base },
  });
  await api.put("/api/setup/onboarding", { data: { step: "complete" } });
  await api.dispose();
});

const HOME_API = /\/api\/home(\?|$)/;
const FAILED = "המקטע לא נטען. נסו לרענן את העמוד."; // home.couldntLoad

async function expectVisibleFailure(page: Page) {
  // Home opens on Focus by default; this is about the detailed dashboard's tiles, so choose it first.
  const base = `http://127.0.0.1:${process.env.PENNY_E2E_PORT ?? 3100}`;
  await page.context().addCookies([{ name: "home_view", value: "detailed", url: base }]);
  await page.goto("/");
  // The page itself still renders: header and navigation are there.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // The query retries a server fault twice before giving up, so allow for its back-off.
  await expect(page.getByText(FAILED).first()).toBeVisible({ timeout: 30_000 });
  // Nothing is left pulsing: every tile either loaded or says it failed.
  await expect(page.locator("[data-slot='skeleton']")).toHaveCount(0);
}

test.describe("home screen when its data request fails", () => {
  test("a 500 shows an error state, and a reload recovers", async ({ page }) => {
    let calls = 0;
    await page.route(HOME_API, (route) => {
      calls++;
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unable to complete the request" }),
      });
    });
    await expectVisibleFailure(page);
    expect(calls).toBeGreaterThan(0);

    await page.unroute(HOME_API);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(FAILED)).toHaveCount(0);
  });

  test("a dropped connection shows an error state", async ({ page }) => {
    await page.route(HOME_API, (route) => route.abort("connectionfailed"));
    await expectVisibleFailure(page);
  });
});
