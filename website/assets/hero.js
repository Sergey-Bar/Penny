// The hero stage. The resting picture (a poster of the coin in front of a real screen) is plain markup and needs none
// of this. Here we only decide whether to play the reveal, load the scene when the browser is idle, and keep it in
// step with the theme. Anything that goes wrong ends in the same place: the static picture.
const stage = document.querySelector("[data-stage]");
const root = document.documentElement;
const settle = () => root.classList.remove("reveal-pending");

if (stage) {
  settle(); // nothing waits for the scene any more
  const canvas = stage.querySelector(".stage-canvas");
  const replay = stage.querySelector(".stage-replay");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const off = /[?&]no3d\b/.test(location.search); // lets anyone check the fallback
  const theme = () => root.dataset.theme || "light";
  const placement = () => {
    const cs = getComputedStyle(stage);
    return { x: +cs.getPropertyValue("--coin-x"), y: +cs.getPropertyValue("--coin-y"), r: +cs.getPropertyValue("--coin-r") };
  };
  let coin = null;

  async function start() {
    if (off || coin) return settle();
    try {
      const { createCoin } = await import("./coin.js");
      coin = createCoin(canvas, {
        theme: theme(),
        reduced: reduced.matches,
        placement,
        onProgress: (p) => stage.style.setProperty("--p", p.toFixed(4)),
        onLost: () => { stage.classList.remove("is-live"); stage.style.setProperty("--p", 1); coin = null; },
      });
      if (!coin) return settle(); // no WebGL: the poster stays
      stage.classList.add("is-live");
      if (reduced.matches) coin.rest();
      else {
        // The page opens on the resting picture, so the product is on screen at once. The reveal plays on request.
        coin.rest();
        replay.hidden = false;
      }
      settle();
    } catch {
      settle();
    }
  }
  // Never hold the stage back for long: if the scene has not started in 2.5 s, show the static picture.
  setTimeout(settle, 2500);
  if (reduced.matches || off) settle();
  // After first paint and when the main thread is free; the headline and download button never wait for this.
  const idle = window.requestIdleCallback ? (f) => requestIdleCallback(f, { timeout: 1200 }) : (f) => setTimeout(f, 200);
  if (document.readyState === "complete") idle(start);
  else addEventListener("load", () => idle(start), { once: true });

  document.addEventListener("penny:theme", (e) => coin?.setTheme(e.detail)); // progress and camera are untouched
  replay.addEventListener("click", () => coin?.play());
  // Arrow keys on the replay button turn the coin; it springs back.
  replay.addEventListener("keydown", (e) => {
    const d = { ArrowLeft: -0.09, ArrowRight: 0.09 }[e.key];
    if (d && coin && !coin.playing) { coin.nudge(d); e.preventDefault(); }
  });
  // Drag (mouse or finger) turns the coin. touch-action: pan-y on the canvas keeps vertical scrolling free.
  let last = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (!coin || coin.playing) return;
    last = e.clientX;
    canvas.setPointerCapture(e.pointerId);
    coin.drag(true);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (last === null || !coin) return;
    coin.drag(true, (e.clientX - last) * 0.012);
    last = e.clientX;
  });
  const release = () => { if (last !== null) { last = null; coin?.drag(false); } };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
}
