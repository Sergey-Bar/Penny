// The map: Penny as a board in the spirit of a property board game. Every part of the app is a lot on the ring,
// with a colour strip along its outer edge and something built on it; Penny itself stands in the middle.
// Islands come from the chips in the page (id, grid cell, icon, colour, short label), so the chips and cards
// work on their own without this script. Plain SVG in a true 30° isometric projection, no library.
const hub = document.querySelector("[data-hub]");

if (hub) {
  const rtl = document.documentElement.dir === "rtl";
  const he = document.documentElement.lang.startsWith("he");
  const chips = [...hub.querySelectorAll("[data-island]")];
  const scene = hub.querySelector(".hub-scene");

  const C = Math.cos(Math.PI / 6),
    S = 0.5;
  const G = 165; // grid cell
  const ISO = `matrix(${C} ${S} ${-C} ${S} 0 0)`;
  const r1 = (n) => Math.round(n * 10) / 10;
  const P = (x, y, z = 0) => [r1((x - y) * C), r1((x + y) * S - z)];
  const pts = (a) => a.map((p) => P(...p).join(",")).join(" ");
  const poly = (cls, a) => `<polygon class="${cls}" points="${pts(a)}"/>`;
  const at = (x, y, z = 0) => `translate(${P(x, y, z).join(" ")})`;
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

  // Shaded solids. Light comes from the upper left: top lightest, the +y face (lower left) mid, the +x face darkest.
  const box = (x, y, z, w, d, h, c) =>
    `<g class="m" style="--c:var(${c})">` +
    poly("fl", [
      [x, y + d, z],
      [x + w, y + d, z],
      [x + w, y + d, z + h],
      [x, y + d, z + h],
    ]) +
    poly("fr", [
      [x + w, y, z],
      [x + w, y + d, z],
      [x + w, y + d, z + h],
      [x + w, y, z + h],
    ]) +
    poly("ft", [
      [x, y, z + h],
      [x + w, y, z + h],
      [x + w, y + d, z + h],
      [x, y + d, z + h],
    ]) +
    "</g>";
  const cyl = (x, y, z, r, h, c) => {
    const [cx, cy] = P(x, y, z),
      rx = r1(r * C * Math.SQRT2),
      ry = r1(r * S * Math.SQRT2),
      ty = r1(cy - h);
    return (
      `<g class="m" style="--c:var(${c})"><path class="fl" d="M${cx - rx} ${cy}A${rx} ${ry} 0 0 0 ${cx + rx} ${cy}V${ty}A${rx} ${ry} 0 0 0 ${cx - rx} ${ty}Z"/>` +
      `<ellipse class="ft" cx="${cx}" cy="${ty}" rx="${rx}" ry="${ry}"/></g>`
    );
  };
  const coins = (x, y, n, c) =>
    Array.from({ length: n }, (_, i) => cyl(x, y, i * 6, 13, 5, c)).join("");
  // A face inset on the +y side of a box, for screens, doors and pages.
  const inset = (x, y, z, w, h, cls, m = 4) =>
    poly(cls, [
      [x + m, y, z + m],
      [x + w - m, y, z + m],
      [x + w - m, y, z + h - m],
      [x + m, y, z + h - m],
    ]);
  const byDepth = (parts) =>
    parts
      .sort((a, b) => a[0] - b[0])
      .map((p) => p[1])
      .join("");

  // Rounded slab: stacked plane rects make the sides, a split gradient shades left and right faces.
  const slab = (h, depth, cls, r = 16) => {
    let s = "";
    for (let d = depth; d > 0; d -= 2)
      s += `<rect class="${cls}-side" x="${-h}" y="${-h}" width="${2 * h}" height="${2 * h}" rx="${r}" transform="translate(0 ${d}) ${ISO}"/>`;
    return (
      s +
      `<rect class="${cls}-top" x="${-h}" y="${-h}" width="${2 * h}" height="${2 * h}" rx="${r}" transform="${ISO}"/>`
    );
  };
  // Hebrew mirrors the whole scene: M swaps plane x and y, FRAME maps a local drawing the mirrored way.
  const M = (x, y) => (rtl ? [y, x] : [x, y]);
  const FRAME = rtl ? `matrix(${-C} ${S} ${C} ${S} 0 0)` : ISO;
  // Text lying on a surface. `along` is where reading starts, `row` the baseline offset. English runs down
  // the right-hand axis; Hebrew runs down the left-hand axis from the right, so it reads like the mirror image.
  const RISO = `matrix(${C} ${-S} ${C} ${S} 0 0)`;
  const planeText = (along, row, z, cls, text) =>
    rtl
      ? `<g transform="${at(row, along, z)} ${RISO}"><text class="${cls}" direction="rtl" text-anchor="start">${esc(text)}</text></g>`
      : `<g transform="${at(along, row, z)} ${ISO}"><text class="${cls}" text-anchor="start">${esc(text)}</text></g>`;

  const ICONS = {
    bank: () =>
      box(-34, -26, 0, 68, 52, 6, "--k-stone") +
      box(-28, -22, 6, 56, 10, 26, "--k-stone") +
      [-28, -13, 4, 19].map((x) => box(x, 10, 6, 7, 7, 26, "--k-paper")).join("") +
      box(-38, -30, 32, 76, 60, 6, "--k-blue") +
      box(-30, -22, 38, 60, 44, 6, "--k-blue") +
      box(-20, -12, 44, 40, 24, 6, "--k-blue"),
    folder: () =>
      box(-34, -24, 0, 68, 48, 24, "--k-orange") +
      box(-24, -4, 24, 46, 3, 26, "--k-paper") +
      box(-18, 4, 24, 46, 3, 20, "--k-paper") +
      box(-34, -24, 24, 26, 10, 5, "--k-orange"),
    list: () =>
      box(-36, -30, 0, 72, 60, 6, "--k-paper") +
      box(-30, -24, 6, 60, 12, 4, "--k-purple") +
      box(-30, -6, 6, 44, 12, 4, "--k-green") +
      box(-30, 12, 6, 52, 12, 4, "--k-blue"),
    chip: () =>
      box(-28, -28, 0, 56, 56, 10, "--k-purple") +
      [-20, -6, 8]
        .map(
          (v) => box(28, v + 2, 1, 8, 6, 3, "--k-stone") + box(v + 2, 28, 1, 6, 8, 3, "--k-stone"),
        )
        .join("") +
      box(-16, -16, 10, 32, 32, 6, "--k-paper") +
      box(-6, -6, 16, 12, 12, 10, "--k-green"),
    chat: () =>
      box(-14, -34, 10, 46, 30, 22, "--k-paper") +
      box(-34, -14, 0, 60, 40, 30, "--k-blue") +
      box(-30, 26, 0, 10, 10, 10, "--k-blue") +
      [-20, -4, 12].map((x) => cyl(x, 6, 30, 4, 2, "--k-paper")).join(""),
    jars: () =>
      byDepth([
        [-22, cyl(-24, 2, 0, 13, 22, "--k-green")],
        [-2, cyl(2, -4, 0, 13, 38, "--k-purple")],
        [14, cyl(-2, 26, 0, 13, 14, "--k-orange")],
        [32, cyl(22, 18, 0, 13, 30, "--k-blue")],
      ]),
    calendar: () => {
      const tiles = [];
      const hts = [6, 12, 4, 18, 8, 26],
        col = ["--k-purple", "--k-green", "--k-blue", "--k-orange", "--k-purple", "--k-pink"];
      for (let i = 0; i < 6; i++) {
        const x = -28 + (i % 3) * 20,
          y = -22 + Math.floor(i / 3) * 24;
        tiles.push([x + y, box(x, y, 8, 16, 18, hts[i], col[i])]);
      }
      return box(-34, -28, 0, 68, 56, 8, "--k-paper") + byDepth(tiles);
    },
    table: () =>
      [
        [-28, -20],
        [22, -20],
        [-28, 14],
        [22, 14],
      ]
        .map(([x, y]) => box(x, y, 0, 5, 5, 18, "--k-stone"))
        .join("") +
      box(-32, -24, 18, 64, 44, 4, "--k-orange") +
      byDepth([
        [-14, coins(-12, -6, 3, "--k-gold")],
        [10, coins(6, 4, 5, "--k-gold")],
        [22, coins(16, 10, 2, "--k-gold")],
      ]),
    coins: () =>
      byDepth([
        [-6, coins(-20, 14, 4, "--k-gold")],
        [0, coins(14, -14, 7, "--k-gold")],
        [38, coins(18, 20, 3, "--k-gold")],
      ]),
    bars: () =>
      box(-36, -10, 0, 16, 16, 18, "--k-purple") +
      box(-12, -10, 0, 16, 16, 32, "--k-purple") +
      box(12, -10, 0, 16, 16, 50, "--k-purple") +
      cyl(-8, 22, 0, 9, 8, "--k-gold") +
      cyl(-8, 22, 8, 9, 8, "--k-gold"),
    peak: () =>
      box(-34, -30, 0, 68, 60, 10, "--k-green") +
      box(-24, -20, 10, 48, 40, 10, "--k-green") +
      box(-14, -10, 20, 28, 20, 10, "--k-green") +
      box(-2, -2, 30, 4, 4, 34, "--k-stone") +
      box(2, -2, 50, 22, 2, 14, "--k-pink"),
    safe: () =>
      box(-28, -28, 0, 56, 56, 48, "--k-stone") +
      inset(-28, 28, 0, 56, 48, "door", 7) +
      (() => {
        const [cx, cy] = P(0, 28, 24);
        return `<ellipse class="dial" cx="${cx}" cy="${cy}" rx="7" ry="7"/>`;
      })(),
    calc: () => {
      let keys = [];
      for (let i = 0; i < 9; i++) {
        const x = -22 + (i % 3) * 16,
          y = -6 + Math.floor(i / 3) * 14;
        keys.push([x + y, box(x, y, 10, 11, 9, 3, i === 8 ? "--k-orange" : "--k-paper")]);
      }
      return (
        box(-30, -34, 0, 60, 74, 10, "--k-blue") +
        box(-22, -28, 10, 44, 16, 3, "--k-screen") +
        byDepth(keys)
      );
    },
    house: () => {
      const [x0, x1, y0, y1, zw, zr] = [-30, 30, -24, 24, 28, 50];
      return (
        box(x0, y0, 0, 60, 48, zw, "--k-paper") +
        inset(x0 + 22, y1, 0, 16, 22, "door", 0) +
        `<g class="m" style="--c:var(--k-paper)">${poly("fr", [
          [x1, y0, zw],
          [x1, y1, zw],
          [x1, 0, zr],
        ])}</g>` +
        `<g class="m" style="--c:var(--k-pink)">${poly("ft", [
          [x0 - 4, y0 - 4, zw - 2],
          [x1 + 4, y0 - 4, zw - 2],
          [x1 + 4, 0, zr],
          [x0 - 4, 0, zr],
        ])}${poly("fl", [
          [x0 - 4, y1 + 4, zw - 2],
          [x1 + 4, y1 + 4, zw - 2],
          [x1 + 4, 0, zr],
          [x0 - 4, 0, zr],
        ])}</g>`
      );
    },
    lock: () => {
      const a = P(-11, 11, 36),
        b = P(11, -11, 36);
      return (
        `<path class="shackle" d="M${a[0]} ${a[1]}v-16a${r1((b[0] - a[0]) / 2)} ${r1((b[0] - a[0]) / 2)} 0 0 1 ${r1(b[0] - a[0])} 0v16"/>` +
        box(-24, -16, 0, 48, 32, 36, "--k-green") +
        (() => {
          const [cx, cy] = P(0, 16, 20);
          return `<circle class="keyhole" cx="${cx}" cy="${cy}" r="4"/><path class="keyhole" d="M${cx - 1.6} ${cy}h3.2l1 9h-5.2z"/>`;
        })()
      );
    },
    desk: () =>
      box(-14, -12, 0, 28, 24, 4, "--k-stone") +
      box(-3, -3, 4, 6, 6, 14, "--k-stone") +
      box(-40, -3, 18, 80, 7, 48, "--k-stone") +
      inset(-40, 4, 18, 80, 48, "screen") +
      box(22, 18, 0, 20, 16, 11, "--k-blue") +
      box(22, 18, 11, 20, 16, 11, "--k-blue") +
      box(-36, 20, 0, 14, 4, 28, "--k-purple") +
      inset(-36, 24, 0, 14, 28, "screen", 2),
    doc: () =>
      box(-26, -3, 0, 52, 6, 66, "--k-paper") +
      [14, 24, 34, 44]
        .map((z) =>
          poly("line", [
            [-18, 3, z],
            [18, 3, z],
            [18, 3, z + 2],
            [-18, 3, z + 2],
          ]),
        )
        .join(""),
    phone: () => box(-17, -3, 0, 34, 7, 64, "--k-stone") + inset(-17, 4, 0, 34, 64, "screen", 3),
  };

  const H = 62,
    DEPTH = 14; // island half-size and thickness
  const money = new Intl.NumberFormat(he ? "he-IL" : "en-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  });

  const islands = chips.map((chip) => {
    let [gx, gy] = chip.dataset.cell.split(",").map(Number);
    if (rtl) [gx, gy] = [gy, gx]; // mirror across the vertical axis
    const [sx, sy] = P(gx * G, gy * G);
    return {
      id: chip.dataset.island,
      gx,
      gy,
      sx,
      sy,
      soon: chip.classList.contains("soon"),
      icon: chip.dataset.icon,
      short: chip.dataset.short,
      c: chip.dataset.c,
      chip,
    };
  });

  const mat = (x, y, z = 0) => at(...M(x, y), z); // a point given in English-layout plane coordinates
  const mbox = (x, y, z, w, d, h, c) => (rtl ? box(y, x, z, d, w, h, c) : box(x, y, z, w, d, h, c));

  // The strip along a lot's outer edge, in the lot's own colour: what makes a ring of squares read as a board.
  const strip = (it) => {
    const w = 13,
      m = 7;
    const r =
      it.gy >= 2
        ? [-H + m, H - m - w, 2 * (H - m), w]
        : it.gx >= 2
          ? [H - m - w, -H + m, w, 2 * (H - m)]
          : it.gy <= -2
            ? [-H + m, -H + m, 2 * (H - m), w]
            : [-H + m, -H + m, w, 2 * (H - m)];
    return `<rect class="strip" style="fill:var(${it.c})" x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" rx="5" transform="${ISO}"/>`;
  };
  const islandSvg = (it) => {
    const label = planeText(-H + 14, H - 16, 0, "lbl", it.short);
    return (
      `<g class="isl${it.soon ? " soon" : ""}" data-id="${it.id}" transform="translate(${it.sx} ${it.sy})">` +
      `<ellipse class="shadow" cx="0" cy="${DEPTH + 26}" rx="120" ry="54"/>` +
      `<g class="lift">${slab(H, it.soon ? 0 : DEPTH, it.soon ? "soon" : "isl")}${it.soon ? "" : strip(it)}` +
      `<g transform="${at(-4, -12)}">${(ICONS[it.icon] || (() => ""))()}</g>${label}` +
      (it.soon
        ? `<g transform="${mat(H - 6, -H + 6)}"><rect class="badge-bg" x="${he ? -23 : -26}" y="-30" width="${he ? 46 : 52}" height="22" rx="11"/><text class="badge-t" y="-15" text-anchor="middle">${he ? "בקרוב" : "SOON"}</text></g>`
        : "") +
      `</g></g>`
    );
  };

  // The hub: a large slab with four tiles of a sample month, and the Penny mark.
  const T = he
    ? { worth: "שווי נקי", left: "נשאר החודש", budget: "מהתקציב נוצל" }
    : { worth: "Net worth", left: "Left this month", budget: "Of budget used" };
  const tile = (cx, cy) => `<g transform="${mat(cx, cy, 6)}">${slab(64, 6, "tile", 14)}</g>`;
  const spark = [10, 14, 12, 20, 24, 22, 30, 36, 34, 42];
  const sparkPts = spark.map((v, i) => [-50 + i * 11, 40 - v]);
  const hubSvg =
    `<g class="hub-core">` +
    slab(150, 24, "hub", 26) +
    tile(-74, -74) +
    tile(74, -74) +
    tile(-74, 74) +
    tile(74, 74) +
    // Net worth: label, value, sparkline lying on the tile.
    planeText(74 - 50, -74 - 44, 6, "t-lbl", T.worth) +
    planeText(74 - 50, -74 - 20, 6, "t-val", money.format(486000)) +
    `<g transform="${mat(74, -74 + 2, 6)} ${FRAME}"><path class="t-area" d="M${sparkPts.map((p) => p.join(" ")).join("L")}L${sparkPts.at(-1)[0]} 44L-50 44Z"/><polyline class="t-line" points="${sparkPts.map((p) => p.join(",")).join(" ")}"/></g>` +
    // Left this month: label, value and a little bar row.
    planeText(-74 - 50, 74 - 44, 6, "t-lbl", T.left) +
    planeText(-74 - 50, 74 - 20, 6, "t-val", money.format(5700)) +
    `<g transform="${at(0, 0, 6)}">${byDepth([6, 10, 8, 13, 11, 16].map((h, i) => [i, mbox(-74 - 46 + i * 16, 74 + 28, 0, 10, 10, h, i === 5 ? "--k-green" : "--k-purple")]))}</g>` +
    // Budget: label, value and a ring.
    planeText(74 - 50, 74 - 44, 6, "t-lbl", T.budget) +
    planeText(74 - 50, 74 - 20, 6, "t-val", "72%") +
    `<g transform="${mat(74 + 28, 74 + 24, 6)} ${ISO}"><circle class="ring-bg" r="18"/><circle class="ring" r="18" stroke-dasharray="${r1(0.72 * 2 * Math.PI * 18)} 200" transform="rotate(-90)"/></g>` +
    // The Penny mark, floating a little.
    `<g class="mark-float"><g transform="${at(-74, -74, 32)}">${slab(30, 26, "mark", 10)}<g transform="${ISO}"><rect class="eye" x="-11" y="-8" width="7" height="16" rx="3.5"/><rect class="eye" x="4" y="-8" width="7" height="16" rx="3.5"/></g></g></g>` +
    `</g>`;

  const back = islands.filter((it) => it.gx + it.gy < 0);
  const front = islands.filter((it) => it.gx + it.gy >= 0);
  const order = (a) => a.sort((p, q) => p.gx + p.gy - (q.gx + q.gy));

  const links = islands
    .map((it) => {
      const d = `M${it.sx} ${it.sy}L0 0`;
      const [mx, my] = [r1(it.sx * 0.55), r1(it.sy * 0.55)];
      return `<path class="link${it.soon ? " soon" : ""}" d="${d}"/><circle class="node" cx="${mx}" cy="${my}" r="3.5"/>`;
    })
    .join("");

  // The board itself: one plate under the whole ring.
  const E = 2 * G + H + 26,
    PLATE = 18;
  const plate =
    poly("board-l", [
      [-E, E, -DEPTH - 8],
      [E, E, -DEPTH - 8],
      [E, E, -DEPTH - 8 - PLATE],
      [-E, E, -DEPTH - 8 - PLATE],
    ]) +
    poly("board-r", [
      [E, -E, -DEPTH - 8],
      [E, E, -DEPTH - 8],
      [E, E, -DEPTH - 8 - PLATE],
      [E, -E, -DEPTH - 8 - PLATE],
    ]) +
    poly("board-t", [
      [-E, -E, -DEPTH - 8],
      [E, -E, -DEPTH - 8],
      [E, E, -DEPTH - 8],
      [-E, E, -DEPTH - 8],
    ]);

  scene.innerHTML =
    `<svg viewBox="-760 -480 1520 960" role="presentation" focusable="false">` +
    `<defs>` +
    `<pattern id="hub-grid" width="50" height="50" patternUnits="userSpaceOnUse" patternTransform="${ISO}"><path d="M50 0H0V50" class="grid"/></pattern>` +
    `<radialGradient id="hub-fade"><stop offset="0.35" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
    `<mask id="hub-mask"><rect x="-760" y="-480" width="1520" height="960" fill="url(#hub-fade)"/></mask>` +
    `<radialGradient id="hub-glow"><stop offset="0" class="glow-in"/><stop offset="1" class="glow-out"/></radialGradient>` +
    `<radialGradient id="isl-shadow"><stop offset="0" class="sh-in"/><stop offset="1" class="sh-out"/></radialGradient>` +
    `<linearGradient id="side-isl" x1="0" y1="1" x2="1" y2="0"><stop offset=".5" class="s-l"/><stop offset=".5" class="s-r"/></linearGradient>` +
    `<linearGradient id="side-hub" x1="0" y1="1" x2="1" y2="0"><stop offset=".5" class="s-l"/><stop offset=".5" class="s-r"/></linearGradient>` +
    `<linearGradient id="side-mark" x1="0" y1="1" x2="1" y2="0"><stop offset=".5" class="m-l"/><stop offset=".5" class="m-r"/></linearGradient>` +
    `</defs>` +
    `<rect x="-760" y="-480" width="1520" height="960" fill="url(#hub-grid)" mask="url(#hub-mask)"/>` +
    `<ellipse class="glow" cx="0" cy="40" rx="460" ry="250" fill="url(#hub-glow)"/>` +
    plate +
    `<g class="links">${links}</g>` +
    order(back)
      .map((it) => islandSvg(it))
      .join("") +
    hubSvg +
    order(front)
      .map((it) => islandSvg(it))
      .join("") +
    `</svg>`;

  // Selection: chips are the keyboard path (roving focus, arrow keys); islands answer to the pointer.
  const groups = new Map([...scene.querySelectorAll(".isl")].map((g) => [g.dataset.id, g]));
  const select = (id, focus) => {
    for (const c of chips) {
      const on = c.dataset.island === id;
      c.setAttribute("aria-pressed", on);
      c.tabIndex = on ? 0 : -1;
      document.getElementById(c.getAttribute("aria-controls")).hidden = !on;
      if (on && focus) c.focus();
    }
    for (const [gid, g] of groups) g.classList.toggle("on", gid === id);
  };
  chips.forEach((c, i) => {
    c.addEventListener("click", () => select(c.dataset.island));
    c.addEventListener("keydown", (e) => {
      const flip = rtl ? -1 : 1;
      const step = { ArrowRight: flip, ArrowLeft: -flip, ArrowDown: 1, ArrowUp: -1 }[e.key];
      let to = null;
      if (e.key === "Home") to = chips[0];
      else if (e.key === "End") to = chips.at(-1);
      else if (step) to = chips[(i + step + chips.length) % chips.length];
      if (!to) return;
      e.preventDefault();
      select(to.dataset.island, true);
    });
    c.addEventListener("pointerenter", () => groups.get(c.dataset.island)?.classList.add("hover"));
    c.addEventListener("pointerleave", () =>
      groups.get(c.dataset.island)?.classList.remove("hover"),
    );
  });
  for (const [id, g] of groups) g.addEventListener("click", () => select(id));
  select(
    chips.find((c) => c.getAttribute("aria-pressed") === "true")?.dataset.island ??
      chips[0].dataset.island,
  );
  hub.classList.add("ready");
}
