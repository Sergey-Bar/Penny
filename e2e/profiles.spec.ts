import { expect, test } from "@playwright/test";

// The empty test install would otherwise start at first-run onboarding.
test.beforeAll(async ({ playwright }) => {
  const base = `http://127.0.0.1:${process.env.PENNY_E2E_PORT ?? 3100}`; // the API wants a same-origin header
  const api = await playwright.request.newContext({
    baseURL: base,
    extraHTTPHeaders: { origin: base },
  });
  await api.put("/api/setup/onboarding", { data: { step: "complete" } });
  await api.dispose();
});

test("with two profiles, a new session starts at who's using, and picking one goes home", async ({
  page,
  browser,
}) => {
  await page.goto("/profiles");
  try {
    await page.getByRole("button", { name: "הוספת פרופיל" }).click();
    await page.getByLabel("שם").fill("נועה");
    await page.getByRole("button", { name: /שמירה/ }).click();
    await expect(page.getByRole("button", { name: "נועה" })).toBeVisible();

    const fresh = await browser.newPage();
    await fresh.goto("/");
    await expect(fresh).toHaveURL(/\/profiles$/);
    await fresh.getByRole("button", { name: "נועה" }).click();
    // Home opens on Focus unless the detailed dashboard was chosen.
    await expect(fresh).toHaveURL(/\/focus$/);
    await fresh.close();
  } finally {
    // Leave one profile behind, or every later session opens on the picker.
    const origin = new URL(page.url()).origin;
    const list = (await (await page.request.get("/api/profiles")).json()) as {
      id: number;
      name: string;
    }[];
    const extra = list.find((p) => p.name === "נועה");
    if (extra) await page.request.delete(`/api/profiles/${extra.id}`, { headers: { origin } });
  }
});
