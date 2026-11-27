// Language: Auto, Hebrew or English. Runs in <head>, before paint. A saved pick wins; on Auto, a visitor whose
// browser isn't set to this page's language is sent to the same page in the other one. site.js wires the control.
(function () {
  var here = document.documentElement.lang, pick = null;
  try { pick = localStorage.getItem("penny.site.lang"); } catch (_e) { /* storage blocked: fall through to Auto */ }
  if (pick !== "he" && pick !== "en") {
    if (/bot|crawl|spider|lighthouse|preview/i.test(navigator.userAgent)) return; // crawlers index each language as served
    pick = (navigator.languages || [navigator.language || ""]).some(function (l) { return /^(he|iw)\b/i.test(l); }) ? "he" : "en";
  }
  if (pick === here) return;
  // Hebrew pages sit at the root and English ones under en/, with the same file names.
  location.replace((here === "he" ? "en/" : "../") + location.pathname.split("/").pop() + location.search + location.hash);
})();
