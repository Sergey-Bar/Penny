// Theme: System, Light or Dark. The inline script in <head> has already applied the saved choice before first paint;
// this wires the control, follows the OS while System is chosen, and tells the rest of the page when the result changes.
const KEY = "penny.site.theme";
const root = document.documentElement;
const dark = matchMedia("(prefers-color-scheme: dark)");
const read = () => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system"; // storage blocked: the choice just doesn't outlive the page
  }
};
let choice = read();

function apply() {
  const resolved = choice === "system" ? (dark.matches ? "dark" : "light") : choice;
  const changed = root.dataset.theme !== resolved;
  // Only the attribute changes: no reload and no re-render, so scroll position, open menus, focus and typed text stay put.
  root.dataset.theme = resolved;
  for (const b of document.querySelectorAll("[data-theme-control] [data-set]")) b.setAttribute("aria-pressed", String(b.dataset.set === choice));
  if (changed) document.dispatchEvent(new CustomEvent("penny:theme", { detail: resolved }));
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-theme-control] [data-set]");
  if (!b) return;
  choice = b.dataset.set;
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // storage blocked: applies for this page only
  }
  apply();
});
dark.addEventListener("change", apply); // System follows the OS live
addEventListener("storage", (e) => {
  if (e.key === KEY || e.key === null) { choice = read(); apply(); } // another tab changed it
});
addEventListener("pageshow", (e) => {
  if (e.persisted) { choice = read(); apply(); } // back/forward cache
});
apply();
