/**
 * Download the logo of each well-known merchant once and store it in the repo, so the app can show real logos in
 * transaction lists without ever asking a third party at runtime (which would reveal where the user shops).
 *
 * Source: each merchant's site icon, through Google's 128px favicon service, or the site's own touch icon. Every image is decoded and re-encoded by
 * sharp into an opaque 96x96 PNG that fills its circle, so nothing downloaded is stored as-is. A merchant whose icon cannot be fetched keeps its
 * coloured initial.
 *
 * A site whose icon neither source serves can be given by hand: put its logo at scripts/merchant-logo-sources/<domain>.png
 * and it is used instead of the network. A logo already in public/merchants is kept when nothing better is found.
 *
 * Output: public/merchants/<domain>.png and src/lib/merchant-logos.generated.ts
 * Usage:  node scripts/fetch-merchant-icons.mjs            (every merchant)
 *         node scripts/fetch-merchant-icons.mjs a.co.il …  (only these; the rest stay as they are)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "merchants");
const localDir = path.join(root, "scripts", "merchant-logo-sources");
const manifest = path.join(root, "src", "lib", "merchant-logos.generated.ts");
const MAX_BYTES = 512 * 1024;

// The domains are the fourth field of each BRANDS row in src/lib/merchant-mark.ts.
const source = await fs.readFile(path.join(root, "src", "lib", "merchant-mark.ts"), "utf8");
const table = source.slice(source.indexOf("export const BRANDS"), source.indexOf("const PALETTE"));
const domains = [
  ...new Set([...table.matchAll(/"([a-z0-9-]+(?:\.[a-z0-9-]+)+)"\],/g)].map((m) => m[1])),
].sort((a, b) => a.localeCompare(b));

await fs.mkdir(outDir, { recursive: true });
// Sites whose icon is not their logo (a blank tile, a generic "online" badge): the coloured initial is more honest.
const NOT_A_LOGO = new Set(["gett.com", "freshmarket.co.il"]);
for (const domain of NOT_A_LOGO) await fs.rm(path.join(outDir, `${domain}.png`), { force: true });
const only = new Set(process.argv.slice(2));
for (const domain of domains) {
  if (NOT_A_LOGO.has(domain) || (only.size && !only.has(domain))) continue;
  try {
    // A logo supplied by hand wins; then Google's favicon service; then the site's own touch icon.
    let buf = await fs.readFile(path.join(localDir, `${domain}.png`)).catch(() => null);
    for (const url of buf
      ? []
      : [
          `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
          `https://www.${domain}/apple-touch-icon.png`,
          `https://${domain}/apple-touch-icon.png`,
          `https://www.${domain}/apple-touch-icon-precomposed.png`,
        ]) {
      const res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(12000),
      }).catch(() => null);
      if (!res?.ok) continue;
      const got = Buffer.from(await res.arrayBuffer());
      if (!got.length || got.length > MAX_BYTES) continue;
      const width = await sharp(got)
        .metadata()
        .then((m) => m.width ?? 0)
        .catch(() => 0);
      if (width >= 32) {
        buf = got;
        break;
      }
    }
    if (!buf) throw new Error("no usable icon");
    // Every stored logo is a full, opaque 96px square, so the app can show it edge to edge in a circle with no
    // white gap. The ground is the icon's own corner colour (white for a transparent icon). A mark that sits small
    // inside its own border is cropped to the mark and given an even margin of that ground.
    const flat = await sharp(buf)
      .flatten({ background: "#ffffff" })
      .resize(128, 128, { fit: "contain", background: "#ffffff" })
      .png()
      .toBuffer();
    const { data } = await sharp(flat).raw().toBuffer({ resolveWithObject: true });
    const ground = { r: data[0], g: data[1], b: data[2] };
    let mark = flat;
    let trimmedTo = 128;
    try {
      const t = await sharp(flat)
        .trim({ background: ground, threshold: 18 })
        .toBuffer({ resolveWithObject: true });
      mark = t.data;
      trimmedTo = Math.max(t.info.width, t.info.height);
    } catch {
      // one flat colour: nothing to crop
    }
    const png =
      trimmedTo >= 118
        ? await sharp(flat).resize(96, 96).png().toBuffer() // already full-bleed
        : await sharp(mark)
            .resize(68, 68, { fit: "contain", background: ground })
            .extend({ top: 14, bottom: 14, left: 14, right: 14, background: ground })
            .png()
            .toBuffer();
    await fs.writeFile(path.join(outDir, `${domain}.png`), png);
    console.log(`ok    ${domain}`);
  } catch (err) {
    console.log(`skip  ${domain} (${err.message})`);
  }
}
// The manifest lists what is on disk, so a logo kept from an earlier run still counts.
const onDisk = new Set((await fs.readdir(outDir)).map((f) => f.replace(/\.png$/, "")));
const done = domains.filter((d) => onDisk.has(d));
await fs.writeFile(
  manifest,
  `// Generated by scripts/fetch-merchant-icons.mjs. Domains with a logo in public/merchants.\nexport const LOCAL_MERCHANT_LOGOS: ReadonlySet<string> = new Set([\n${done.map((d) => `  "${d}",\n`).join("")}]);\n`,
);
console.log(`${done.length} of ${domains.length} logos written to public/merchants`);
