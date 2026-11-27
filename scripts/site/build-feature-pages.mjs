// Builds website/feature-<slug>.html and website/en/feature-<slug>.html from scripts/site/feature-pages.mjs.
// The top bar, footer, icons and card texts are taken from features.html, so that page stays the one place they are
// edited by hand. Also points the menus, the footer and the cards at every page that exists. Safe to run again.
//   npm run site:features
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pages from "./feature-pages.mjs";

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../website");
const ORIGIN = "https://sergey-bar.github.io/Penny/";
const DEMO = "https://penny-finance-demo.vercel.app";
const LANGS = {
  he: {
    dir: "",
    up: "",
    crumb: "פיצ'רים",
    crumbs: "מיקום באתר",
    tryIt: "לנסות בדפדפן",
    tryScreen: "לפתוח את המסך הזה בדפדפן",
    know: "טוב לדעת",
    faq: "שאלות ותשובות",
    related: "פיצ'רים קשורים",
    more: "לדף המלא",
    arrow: "←",
  },
  en: {
    dir: "en/",
    up: "../",
    crumb: "Features",
    crumbs: "Breadcrumb",
    tryIt: "Try it in your browser",
    tryScreen: "Open this screen in your browser",
    know: "Good to know",
    faq: "Questions and answers",
    related: "Related features",
    more: "Full page",
    arrow: "→",
  },
};

const read = (f) => fs.readFileSync(path.join(SITE, f), "utf8");
// Keep each file's own line endings, so a rebuild doesn't rewrite every line.
const write = (f, text) => {
  const full = path.join(SITE, f);
  const crlf = fs.existsSync(full) ? fs.readFileSync(full, "utf8").includes("\r\n") : true;
  fs.writeFileSync(full, crlf ? text.replace(/\r?\n/g, "\r\n") : text.replace(/\r\n/g, "\n"));
};
const lf = (s) => s.replace(/\r\n/g, "\n");
const grab = (text, re, what) => {
  const m = text.match(re);
  if (!m) throw new Error(`build-feature-pages: ${what} not found`);
  return m;
};
// Text only: tags go, then any stray angle bracket, so nothing tag-like can survive.
const plain = (html) =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/&amp;/g, "&")
    .replace(/‏/g, "");
// JSON that sits inside a <script> element must not be able to close it.
const jsonLd = (data) => JSON.stringify(data).replace(/</g, "\u003c");
const fileOf = (p) => `feature-${p.slug}.html`;
const bySlugId = Object.fromEntries(pages.map((p) => [p.id, p]));

for (const [lang, t] of Object.entries(LANGS)) {
  // ---- point menus, footers and cards at the pages that exist ----
  for (const name of ["index.html", "features.html", "install.html"]) {
    let h = lf(read(t.dir + name));
    for (const p of pages) {
      h = h.replaceAll(`href="features.html#f-${p.id}"`, `href="${fileOf(p)}"`);
      if (name !== "features.html") continue;
      h = h.replace(
        new RegExp(`(<nav class="feat-index"[\\s\\S]*?)href="#f-${p.id}"`),
        `$1href="${fileOf(p)}"`,
      );
      const card = grab(
        h,
        new RegExp(`<article class="feat[^"]*" id="f-${p.id}">.*</article>`),
        `card f-${p.id}`,
      )[0];
      if (!card.includes("feat-more"))
        h = h.replace(
          card,
          card.replace(
            "</article>",
            `<a class="feat-more" href="${fileOf(p)}">${t.more} <span aria-hidden="true">${t.arrow}</span></a></article>`,
          ),
        );
    }
    write(t.dir + name, h);
  }

  // ---- pieces borrowed from the hand-written pages ----
  const feat = lf(read(t.dir + "features.html"));
  const home = lf(read(t.dir + "index.html"));
  const head = feat.slice(0, feat.indexOf("</head>"));
  const chrome = grab(feat, /<a class="skip"[\s\S]*?<\/header>\n/, "top bar")[0];
  const footer = grab(feat, /<footer>[\s\S]*?<\/footer>\n/, "footer")[0];
  const closing = grab(feat, /  <section class="closing">[\s\S]*?<\/section>\n/, "closing band")[0];
  const dlBtn = grab(
    chrome,
    /<a class="btn btn-primary cta-btn"[^>]*data-dl[^>]*>[^<]*<\/a>/,
    "download button",
  )[0].replace(" cta-btn", "");
  const cards = Object.fromEntries(
    [
      ...feat.matchAll(
        /<article class="feat[^"]*" id="f-([a-z]+)"><div class="glyph" aria-hidden="true">(<svg.*?<\/svg>)<\/div><h3>(.*?)(?:<span class="badge.*?<\/span>)?<\/h3><p>(.*?)<\/p>/g,
      ),
    ].map((m) => [m[1], { icon: m[2], title: m[3], blurb: m[4] }]),
  );
  const EMBED = {
    banks: () => grab(home, /<ul class="chips"[\s\S]*?<\/ul>/, "bank chips")[0],
    houses: () => grab(feat, /<ul class="houses"[\s\S]*?<\/ul>/, "pension houses")[0],
    chat: () => grab(home, /<figure class="chat"[\s\S]*?<\/figure>/, "telegram chat")[0],
    ledger: () => grab(home, /<ul class="ledger">[\s\S]*?<\/ul>/, "privacy ledger")[0],
  };
  const INLINE = new Set(["banks", "houses"]); // these sit under the text; the others stand beside it

  for (const p of pages) {
    const c = p[lang];
    const card = cards[p.id];
    if (!card) throw new Error(`build-feature-pages: no card f-${p.id} in ${t.dir}features.html`);
    const file = fileOf(p);

    const pageHead = head
      .replace(/<title>.*<\/title>/, `<title>${plain(card.title)} · Penny</title>`)
      .replace(/(<meta name="description" content=")[^"]*/, `$1${c.desc}`)
      .replace(/(<meta property="og:title" content=")[^"]*/, `$1${plain(card.title)} · Penny`)
      .replace(/(<meta property="og:description" content=")[^"]*/, `$1${c.desc}`)
      .replace(/Penny\/((?:en\/)?)features\.html"/g, `Penny/$1${file}"`);
    const faqLd = jsonLd({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: lang,
      url: ORIGIN + t.dir + file,
      mainEntity: c.faq.map(([q, a]) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: plain(a) },
      })),
    });

    let flip = false;
    const sections = c.sections
      .map((s, i) => {
        const inline = s.embed && INLINE.has(s.embed) ? "\n        " + EMBED[s.embed]() : "";
        const beside = s.embed && !INLINE.has(s.embed) ? EMBED[s.embed]() : "";
        const shot = s.shot
          ? `<a class="shot" href="${t.up}${path.posix.dirname(s.shot)}/${lang}/${path.posix.basename(s.shot)}.webp"><img src="${t.up}${path.posix.dirname(s.shot)}/${lang}/${path.posix.basename(s.shot)}.webp" width="1440" height="900" alt="${s.alt}" loading="lazy" decoding="async"></a>`
          : "";
        const visual = beside || shot;
        const copy =
          `<div class="copy">\n        <span class="num" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>\n        <h2>${s.h}</h2>\n        <p>${s.p}</p>` +
          (s.list
            ? `\n        <ul class="ticks">${s.list.map((x) => `<li>${x}</li>`).join("")}</ul>`
            : "") +
          inline +
          `\n      </div>`;
        const cls = visual ? `wrap spread${(flip = !flip) ? "" : " flip"}` : "wrap narrow";
        return `  <section class="step${i % 2 ? "" : " tint"}">\n    <div class="${cls}">\n      ${copy}${visual ? "\n      " + visual : ""}\n    </div>\n  </section>\n`;
      })
      .join("\n");

    const related = p.related
      .map((id) => {
        const r = cards[id];
        if (!r) throw new Error(`build-feature-pages: ${p.slug} relates to unknown card ${id}`);
        const href = bySlugId[id] ? fileOf(bySlugId[id]) : `features.html#f-${id}`;
        return `        <a class="feat" href="${href}"><div class="glyph" aria-hidden="true">${r.icon}</div><h3>${r.title}</h3><p>${r.blurb}</p></a>\n`;
      })
      .join("");

    const page =
      pageHead +
      `<script type="application/ld+json">${faqLd}</script>\n</head>\n<body>\n` +
      chrome.replace(/features\.html" hreflang/g, `${file}" hreflang`) +
      "\n" +
      `<!-- Generated by scripts/site/build-feature-pages.mjs from scripts/site/feature-pages.mjs. Edit those, not this file. -->\n` +
      `<main id="main">\n  <div class="page-head">\n    <div class="wrap">\n      <nav class="crumbs" aria-label="${t.crumbs}"><a href="features.html">${t.crumb}</a><span aria-hidden="true">/</span><span aria-current="page">${card.title}</span></nav>\n` +
      `      <h1>${c.h1}</h1>\n      <p class="lead">${c.intro}</p>\n      <div class="cta">${dlBtn}<a class="btn btn-ghost" href="${DEMO}${p.demo ?? ""}">${p.demo ? t.tryScreen : t.tryIt}</a></div>\n    </div>\n  </div>\n\n` +
      sections +
      "\n" +
      `  <section id="know">\n    <div class="wrap narrow">\n      <h2>${t.know}</h2>\n      <ul class="ticks">${c.know.map((x) => `<li>${x}</li>`).join("")}</ul>\n    </div>\n  </section>\n\n` +
      `  <section id="faq" class="tint">\n    <div class="wrap narrow">\n      <h2>${t.faq}</h2>\n      <div class="faq">\n` +
      c.faq
        .map(([q, a]) => `        <details><summary>${q}</summary><p>${a}</p></details>\n`)
        .join("") +
      `      </div>\n    </div>\n  </section>\n\n` +
      `  <section id="related">\n    <div class="wrap">\n      <div class="head">\n        <h2>${t.related}</h2>\n      </div>\n      <div class="feat-grid">\n${related}      </div>\n    </div>\n  </section>\n\n` +
      closing.replace('class="closing"', 'class="closing tint"') +
      "</main>\n\n" +
      footer +
      "\n" +
      `<script type="module" src="${t.up}theme.js"></script>\n<script type="module" src="${t.up}site.js"></script>\n<script type="module" src="${t.up}os-lead.js"></script>\n</body>\n</html>\n`;
    write(t.dir + file, page);
  }
}

// ---- sitemap ----
let map = lf(read("sitemap.xml"));
for (const p of pages)
  for (const dir of ["", "en/"]) {
    const loc = `${ORIGIN}${dir}${fileOf(p)}`;
    if (map.includes(`<loc>${loc}</loc>`)) continue;
    const entry = `  <url>\n    <loc>${loc}</loc>\n    <xhtml:link rel="alternate" hreflang="he" href="${ORIGIN}${fileOf(p)}"/>\n    <xhtml:link rel="alternate" hreflang="en" href="${ORIGIN}en/${fileOf(p)}"/>\n  </url>\n`;
    map = map.replace("</urlset>", entry + "</urlset>");
  }
write("sitemap.xml", map);
console.log(`Built ${pages.length} feature pages in 2 languages.`);
