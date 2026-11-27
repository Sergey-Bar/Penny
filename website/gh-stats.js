// Live GitHub numbers (stars, total installer downloads, latest version) for every [data-gh-stats] box on the page.
// Cached for an hour per visitor (GitHub allows 60 unauthenticated calls an hour); hidden if GitHub can't be reached.
const REPO = "Sergey-Bar/Penny";
const KEY = "penny-gh-stats";
const boxes = document.querySelectorAll("[data-gh-stats]");

async function load() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (cached && Date.now() - cached.at < 3_600_000) return cached;
  } catch {}
  const get = (path) => fetch(`https://api.github.com/repos/${REPO}${path}`, { headers: { Accept: "application/vnd.github+json" } }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
  const [repo, releases] = await Promise.all([get(""), get("/releases?per_page=100")]);
  const stats = {
    at: Date.now(),
    stars: repo.stargazers_count,
    downloads: releases.reduce((s, r) => s + r.assets.filter((a) => !/sha256sums/i.test(a.name)).reduce((t, a) => t + a.download_count, 0), 0),
    version: releases.find((r) => !r.draft && !r.prerelease)?.tag_name ?? null,
  };
  try { sessionStorage.setItem(KEY, JSON.stringify(stats)); } catch {}
  return stats;
}

if (boxes.length) {
  load()
    .then((s) => {
      const fmt = new Intl.NumberFormat(document.documentElement.lang, { notation: s.downloads >= 10_000 ? "compact" : "standard" });
      for (const box of boxes) {
        for (const el of box.querySelectorAll("[data-gh]")) {
          const v = s[el.dataset.gh];
          if (v == null) el.closest("li, .fact")?.remove();
          else el.textContent = typeof v === "number" ? fmt.format(v) : v;
        }
        box.hidden = false;
      }
    })
    .catch(() => {}); // no numbers beats wrong numbers
}

// Contributors: the list in the page is a snapshot; this replaces it with the current one from GitHub, so a new
// contributor shows up without a site change. Bots are left out. Cached like the numbers above; on failure the snapshot stays.
const people = document.querySelector("[data-contributors]");
const PEOPLE_KEY = "penny-gh-people";

async function loadPeople() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(PEOPLE_KEY) || "null");
    if (cached && Date.now() - cached.at < 3_600_000) return cached.list;
  } catch {}
  const r = await fetch(`https://api.github.com/repos/${REPO}/contributors?per_page=100`, { headers: { Accept: "application/vnd.github+json" } });
  if (!r.ok) throw new Error(r.status);
  const list = (await r.json())
    .filter((c) => c.type === "User")
    .map((c) => ({ login: c.login, avatar: c.avatar_url, count: c.contributions }));
  try { sessionStorage.setItem(PEOPLE_KEY, JSON.stringify({ at: Date.now(), list })); } catch {}
  return list;
}

if (people) {
  const he = document.documentElement.lang.startsWith("he");
  loadPeople()
    .then((list) => {
      if (!list.length) return;
      people.replaceChildren(
        ...list.map((c) => {
          const li = document.createElement("li");
          const a = Object.assign(document.createElement("a"), { href: `https://github.com/${encodeURIComponent(c.login)}` });
          const img = Object.assign(document.createElement("img"), { src: `${c.avatar}&s=128`, width: 64, height: 64, alt: "", loading: "lazy", decoding: "async" });
          const name = Object.assign(document.createElement("b"), { textContent: c.login });
          const n = Object.assign(document.createElement("small"), { textContent: `${c.count.toLocaleString(he ? "he" : "en")} ${he ? "תרומות" : "contributions"}` });
          a.append(img, name, n);
          li.append(a);
          return li;
        }),
      );
    })
    .catch(() => {}); // the snapshot in the page stays
}
