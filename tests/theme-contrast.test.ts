import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The app's colour tokens live in CSS. This reads the light and dark blocks and checks the pairs that carry text or
// mark a control against WCAG AA: 4.5:1 for text, 3:1 for the edges and marks of controls.
const css = fs.readFileSync(
  path.join(__dirname, "..", "src", "components", "dashboard", "studio.css"),
  "utf8",
);

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector + " {");
  if (start < 0) throw new Error(`no block for ${selector}`);
  const body = css.slice(start, css.indexOf("\n}", start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const light = block(":is(html.app-studio, .budget-studio)");
const dark = {
  ...light,
  ...block(':is(html.app-studio, .budget-studio)[data-studio-theme="midnight"]'),
};

type RGBA = [number, number, number, number];
function parse(value: string): RGBA {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = /^rgb\((\d+) (\d+) (\d+)(?: \/ (\d+)%)?\)$/.exec(value);
  if (rgb) return [+rgb[1], +rgb[2], +rgb[3], rgb[4] ? +rgb[4] / 100 : 1];
  throw new Error(`cannot parse colour "${value}"`);
}
const over = (top: RGBA, under: RGBA): RGBA => [
  top[0] * top[3] + under[0] * (1 - top[3]),
  top[1] * top[3] + under[1] * (1 - top[3]),
  top[2] * top[3] + under[2] * (1 - top[3]),
  1,
];
function luminance([r, g, b]: RGBA) {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a: RGBA, b: RGBA) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe.each([
  ["light", light],
  ["dark", dark],
] as const)("%s theme", (_name, t) => {
  const canvas = parse(t["--canvas"]);
  // A pane is a tint over the page. The light behind it is strongest in its own hue, so the worst case for text is
  // the pane over the brightest field colour (light theme) or the plain canvas (dark theme): both are checked.
  const paneOnCanvas = over(parse(t["--pane"]), canvas);
  const paneOnField = over(
    parse(t["--pane"]),
    over([...parse(t["--field-1"]).slice(0, 3), 0.6] as RGBA, canvas),
  );
  const surfaces: [string, RGBA][] = [
    ["canvas", canvas],
    ["surface", parse(t["--surface"])],
    ["raised surface", parse(t["--surface-raised"])],
    ["pane", paneOnCanvas],
    ["pane over the light", paneOnField],
  ];

  it.each(surfaces)("body, strong and secondary text read on the %s", (_s, bg) => {
    expect(contrast(parse(t["--text"]), bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(parse(t["--text-strong"]), bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(parse(t["--text-secondary"]), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("the label on a filled button reads in every state", () => {
    for (const fill of ["--brand", "--brand-hover", "--brand-press"])
      expect(contrast(parse(t["--on-brand"]), parse(t[fill]))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(surfaces)("links and status colours read as text on the %s", (_s, bg) => {
    for (const token of ["--accent-color", "--success", "--warning", "--error"])
      expect(contrast(parse(t[token]), bg), token).toBeGreaterThanOrEqual(4.5);
  });

  it("control edges and the focus ring stand out from the page", () => {
    for (const bg of [canvas, paneOnCanvas]) {
      expect(contrast(parse(t["--border-interactive"]), bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(parse(t["--focus"]), bg)).toBeGreaterThanOrEqual(3);
    }
  });
});
