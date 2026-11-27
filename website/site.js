// Page behaviour shared by both languages: the mobile menu, tab sets and copy buttons.
const he = document.documentElement.lang.startsWith("he");

// Mobile menu: a disclosure. Escape or picking a link closes it and returns focus to the button.
const menuBtn = document.querySelector(".menu-btn");
const menu = menuBtn && document.getElementById(menuBtn.getAttribute("aria-controls"));
if (menuBtn && menu) {
  const set = (open, focus) => {
    menuBtn.setAttribute("aria-expanded", open);
    menu.hidden = !open;
    if (!open && focus) menuBtn.focus();
  };
  menuBtn.addEventListener("click", () => set(menuBtn.getAttribute("aria-expanded") !== "true"));
  menu.addEventListener("click", (e) => e.target.closest("a") && set(false));
  document.addEventListener("keydown", (e) => e.key === "Escape" && !menu.hidden && set(false, true));
  matchMedia("(min-width: 1041px)").addEventListener("change", (e) => e.matches && set(false));
}

// Tabs: one panel at a time; arrow keys move between tabs (mirrored in RTL), Home and End jump.
for (const list of document.querySelectorAll('[role="tablist"]')) {
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const vertical = list.getAttribute("aria-orientation") === "vertical";
  const pick = (t, focus) => {
    for (const x of tabs) {
      const on = x === t;
      x.setAttribute("aria-selected", on);
      x.tabIndex = on ? 0 : -1;
      document.getElementById(x.getAttribute("aria-controls")).hidden = !on;
    }
    if (focus) t.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => pick(t));
    t.addEventListener("keydown", (e) => {
      const flip = document.dir === "rtl" ? -1 : 1;
      const dir = { ArrowRight: flip, ArrowLeft: -flip, ...(vertical && { ArrowDown: 1, ArrowUp: -1 }) }[e.key];
      if (e.key === "Home") pick(tabs[0], true);
      else if (e.key === "End") pick(tabs.at(-1), true);
      else if (dir) pick(tabs[(i + dir + tabs.length) % tabs.length], true);
      else return;
      e.preventDefault();
    });
  });
}

// Copy buttons next to install commands.
for (const btn of document.querySelectorAll("[data-copy]")) {
  const label = btn.textContent;
  btn.setAttribute("aria-live", "polite"); // so "Copied" is read out
  btn.addEventListener("click", async () => {
    const text = btn.parentElement.querySelector("pre").textContent.trim();
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = he ? "הועתק" : "Copied";
    } catch {
      btn.textContent = he ? "לא הועתק" : "Copy failed";
    }
    setTimeout(() => (btn.textContent = label), 1800);
  });
}

// Language and theme popover: a <details>, closed by a click outside it or by Escape.
const prefs = document.querySelector("details.prefs");
if (prefs) {
  document.addEventListener("click", (e) => !prefs.contains(e.target) && (prefs.open = false));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !prefs.open) return;
    prefs.open = false;
    prefs.querySelector("summary").focus();
  });
}

// Language: following any link to the other language is a pick, and so is choosing one in the control.
// Auto forgets the pick and reloads, so lang.js in <head> can send the visitor where their browser points.
const LANG = "penny.site.lang";
const saveLang = (v) => {
  try {
    if (v) localStorage.setItem(LANG, v);
    else localStorage.removeItem(LANG);
  } catch {} // storage blocked: the pick lasts for this click only
};
const markLang = (v) => {
  for (const b of document.querySelectorAll("[data-lang-control] [data-lang]"))
    b.dataset.lang === v ? b.setAttribute("aria-current", "true") : b.removeAttribute("aria-current");
};
let savedLang = null;
try { savedLang = localStorage.getItem(LANG); } catch {}
for (const b of document.querySelectorAll('[data-lang="auto"]')) b.hidden = false;
if (savedLang !== "he" && savedLang !== "en") markLang("auto");
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[hreflang], [data-lang]");
  if (!a) return;
  const v = a.dataset.lang || a.hreflang;
  if (v === "auto") { saveLang(null); location.reload(); return; }
  saveLang(v);
  if (a.dataset.lang && v === document.documentElement.lang) { e.preventDefault(); markLang(v); } // already here
});
