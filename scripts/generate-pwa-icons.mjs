// Renders the PWA icons in public/icons from the Penny wordmark in public/logo.svg.
// Run: node scripts/generate-pwa-icons.mjs
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const BG = "#15141a"; // the action colour (light)
const logo = "public/logo.svg";
await mkdir("public/icons", { recursive: true });

// padding is the share of the canvas left around the logo; maskable needs ≥ 20% safe zone.
async function icon(size, padding, out) {
  const inner = Math.round(size * (1 - padding * 2));
  const fg = await sharp(logo)
    .resize({
      height: inner,
      width: inner,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: fg, gravity: "center" }])
    .png()
    .toFile(`public/icons/${out}`);
}

await icon(192, 0.18, "icon-192.png");
await icon(512, 0.18, "icon-512.png");
await icon(512, 0.26, "icon-maskable-512.png");
await icon(180, 0.18, "apple-touch-icon.png");
console.log("icons written to public/icons");
