#!/usr/bin/env node
// Captures the pictures the website's hero needs (website/assets/hero):
//   coin-{light,dark}.webp       the resting coin, drawn by the real scene (website/assets/coin.js), used as the
//                                 static fallback when WebGL is unavailable or motion is reduced
//   {he,en}-{light,dark}.webp    the home screen of the demo household, in each theme (+ a 720px-wide copy)
// 1. npm run demo     2. serve website/ (e.g. `npx serve website -l 8090`)
// 3. node scripts/capture-site-hero.mjs [coin|screens]   (ports: PENNY_DEMO_PORT, PENNY_SITE_PORT)
// Never point it at your own data: it screenshots whatever the server shows.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Both servers are local by design; only the ports can be changed, so this never fetches an address typed on the command line.
const port = (value, fallback) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : fallback;
};
const APP = `http://127.0.0.1:${port(process.env.PENNY_DEMO_PORT, 3000)}`;
const SITE = `http://127.0.0.1:${port(process.env.PENNY_SITE_PORT, 8090)}`;
const OUT = path.join(ROOT, "website", "assets", "hero");
const only = process.argv[2]; // "coin" or "screens" to do just one half
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

if (only !== "screens") {
  // The poster is a 640px square with the coin's centre in the middle and its radius a quarter of the side;
  // .stage-poster in styles.css is sized on the same assumption.
  const page = await browser.newPage({
    viewport: { width: 640, height: 640 },
    deviceScaleFactor: 1,
  });
  await page.goto(`${SITE}/privacy.html`);
  for (const theme of ["light", "dark"]) {
    // The scene is loaded by the page from the site being captured, so its address is passed in.
    await page.evaluate(
      async ([theme, scene]) => {
        const canvas = document.createElement("canvas");
        canvas.style.cssText = "position:fixed;inset:0;width:640px;height:640px";
        document.body.replaceChildren(canvas);
        document.documentElement.style.background = document.body.style.background = "transparent";
        const { createCoin } = await import(scene);
        const coin = createCoin(canvas, {
          theme,
          reduced: true,
          placement: () => ({ x: 0.5, y: 0.5, r: 0.25 }),
        });
        if (!coin) throw new Error("WebGL is not available in this browser");
        coin.seek(1);
      },
      [theme, `${SITE}/assets/coin.js`],
    );
    await page.waitForTimeout(300);
    const png = await page.screenshot({ omitBackground: true });
    await sharp(png)
      .webp({ quality: 88, alphaQuality: 90 })
      .toFile(path.join(OUT, `coin-${theme}.webp`));
    process.stdout.write(`coin ${theme}\n`);
  }
  await page.close();
}

if (only !== "coin") {
  if (!(await fetch(`${APP}/api/health`).catch(() => null))?.ok) {
    console.error(`No app at ${APP}. Start the demo first: npm run demo`);
    process.exit(1);
  }
  for (const lang of ["he", "en"])
    for (const theme of ["light", "dark"]) {
      const ctx = await browser.newContext({
        viewport: { width: 960, height: 640 },
        deviceScaleFactor: 1.5,
        colorScheme: theme,
        locale: lang === "he" ? "he-IL" : "en-US",
        reducedMotion: "reduce",
      });
      // home_view: the pictures show the detailed dashboard, which is no longer what Home opens on.
      await ctx.addCookies([
        { name: "NEXT_LOCALE", value: lang, url: APP },
        { name: "home_view", value: "detailed", url: APP },
      ]);
      const page = await ctx.newPage();
      page.on("dialog", (d) => void d.accept());
      await page.goto(`${APP}/profiles`);
      await page
        .getByRole("button", { name: /Dana|דנה/ })
        .first()
        .click();
      await page.waitForURL((u) => !u.pathname.startsWith("/profiles"));
      await page.goto(`${APP}/`, { waitUntil: "networkidle" });
      await page
        .getByRole("button", { name: /להסתיר לצמיתות|Dismiss permanently/ })
        .first()
        .click({ timeout: 3000 })
        .catch(() => {});
      await page.goto(`${APP}/`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      await page.keyboard.press("Escape").catch(() => {});
      const png = await page.screenshot();
      await sharp(png)
        .webp({ quality: 82 })
        .toFile(path.join(OUT, `${lang}-${theme}.webp`));
      await sharp(png)
        .resize({ width: 720 })
        .webp({ quality: 82 })
        .toFile(path.join(OUT, `${lang}-${theme}-720.webp`));
      process.stdout.write(`${lang} ${theme}\n`);
      await ctx.close();
    }
}
await browser.close();
console.log(`Done: ${OUT}`);
