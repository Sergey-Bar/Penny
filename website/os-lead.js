// Downloads follow the visitor's system: the hero leads with it, every [data-dl] button downloads it, and the install
// steps open on it. Without JS, Windows stays primary and [data-dl] goes to the install steps.
// iPads report as Mac, so touch rules them out; phones get no download at all.
const he = document.documentElement.lang.startsWith("he");
const ua = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
const mac = /mac/i.test(ua);
const os = /android|iphone|ipad/i.test(navigator.userAgent) || (mac && navigator.maxTouchPoints > 1) ? null
  : mac ? "mac" : /linux|x11|cros|chrome os/i.test(ua) ? "linux" : /win/i.test(ua) ? "win" : null;
const TAB = { win: "i-0", mac: "i-1", linux: "i-2" };
const LABEL = he
  ? { win: "הורדה ל-Windows", mac: "הורדה ל-Mac", linux: "התקנה ב-Linux" }
  : { win: "Download for Windows", mac: "Download for Mac", linux: "Install on Linux" };
const openTab = (k) => document.getElementById(TAB[k])?.click();

const lead = os && document.querySelector(`.hero .cta [data-os="${os}"]`);
if (lead) {
  for (const b of document.querySelectorAll(".hero .cta [data-os]")) b.classList.replace("btn-primary", "btn-ghost");
  lead.classList.replace("btn-ghost", "btn-primary");
  lead.parentElement.prepend(lead);
}

if (os) {
  for (const a of document.querySelectorAll("[data-dl]")) {
    a.textContent = LABEL[os];
    if (a.dataset[os]) a.href = a.dataset[os]; // Linux has no file: it keeps the link to the install steps
  }
  openTab(os);
}
// Intel Macs: Chromium can tell them apart; Safari and Firefox can't, so they keep the Apple silicon file.
if (os === "mac")
  navigator.userAgentData?.getHighEntropyValues?.(["architecture"])
    .then((v) => {
      if (v.architecture === "x86") for (const a of document.querySelectorAll("[data-dl][data-mac-intel]")) a.href = a.dataset.macIntel;
    })
    .catch(() => {});

// Starting a download also brings up that system's install steps, so the next thing to do is on screen.
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href$=".exe"], a[href$=".dmg"]');
  const steps = document.getElementById("install");
  if (!a || !steps) return;
  openTab(a.href.endsWith(".exe") ? "win" : "mac");
  if (!steps.contains(a)) setTimeout(() => steps.scrollIntoView(), 400);
});
