/* =========================================================================
   LIGHTS OUT — lamp.js
   Makes the bulb follow the mouse (or a finger dragging it) and points every
   line's shadow away from it. JS only feeds three numbers per line
   (--dx, --dy, --i); style.css turns them into the shadow stack.
   Without this file the page falls back to the CSS scroll-driven version.
   ========================================================================= */
(() => {
  "use strict";

  /* ===== 1. Setup ===== */
  const root  = document.documentElement;
  const bulb  = document.querySelector(".bulb");
  const cord  = document.querySelector(".cord");
  const pool  = document.querySelector(".pool");
  const lines = [...document.querySelectorAll(".line")].map(el => ({ el, key: -1 }));
  const byEl  = new Map(lines.map(L => [L.el, L]));

  const ANGLES = 16;                    // shadow directions to snap to
  const LEVELS = 5;                     // brightness levels above 0 (6 total)
  const EASE   = matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 0.2;
  const GLASS  = 22 / 34;               // glass center as a fraction of bulb height (pixel-art grid)

  let bw = 0, bh = 0, cordH = 0, reach = 1;   // bulb size, cord length, light reach in px
  let homeX = 0, homeY = 0, atHome = true;    // resting spot
  let x = 0, y = 0, tx = 0, ty = 0;           // current + target glass-center position (viewport px)
  let dragging = false, queued = false;
  const visible = new Set();


  /* ===== 2. Measure (only on load, resize, font load — never while moving) ===== */
  function measure() {
    const r = bulb.getBoundingClientRect();     // translate doesn't change width/height
    bw = r.width;
    bh = r.height;
    cordH = cord.offsetHeight || innerHeight;   // offsetHeight ignores the scaleY transform
    reach = 0.7 * Math.max(innerWidth, innerHeight);

    // home mirrors style.css: --bulb-x is 16px on small screens, 6vw otherwise
    const gap = innerWidth <= 600 ? 16 : innerWidth * 0.06;
    homeX = innerWidth - gap - bw / 2;
    homeY = innerHeight / 2;
    if (atHome) { tx = homeX; ty = homeY; }

    // each line's text box in page coordinates
    const sx = scrollX, sy = scrollY;
    for (const L of lines) {
      const b = L.el.getBoundingClientRect();
      L.x0 = b.left + sx;  L.x1 = b.right + sx;
      L.y0 = b.top + sy;   L.y1 = b.bottom + sy;
      L.cx = (L.x0 + L.x1) / 2;
      L.cy = (L.y0 + L.y1) / 2;
      L.key = -1;                               // force a re-light
    }
  }


  /* ===== 3. Track which lines are near the screen ===== */
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      const L = byEl.get(e.target);
      e.isIntersecting ? visible.add(L) : visible.delete(L);
    }
    kick();
  }, { rootMargin: "25% 0px" });
  lines.forEach(L => io.observe(L.el));


  /* ===== 4. Input ===== */
  function aim(px, py, home = false) {
    tx = px; ty = py; atHome = home;
    kick();
  }

  // mouse: bulb follows the cursor, goes home when the cursor leaves the window
  addEventListener("pointermove", e => {
    if (e.pointerType === "mouse") aim(e.clientX, e.clientY);
  }, { passive: true });
  document.addEventListener("mouseout", e => {
    if (!e.relatedTarget) aim(homeX, homeY, true);
  });

  // touch / pen: drag the bulb itself (touch-action: none on .bulb in CSS)
  bulb.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse") return;
    dragging = true;
    bulb.setPointerCapture(e.pointerId);
    root.classList.add("dragging");
  });
  bulb.addEventListener("pointermove", e => {
    if (dragging) aim(e.clientX, e.clientY);
  });
  const drop = () => { dragging = false; root.classList.remove("dragging"); };
  bulb.addEventListener("pointerup", drop);
  bulb.addEventListener("pointercancel", drop);

  // scrolling moves lines relative to the bulb; resizing changes everything
  addEventListener("scroll", kick, { passive: true });
  addEventListener("resize", () => { measure(); kick(); });
  document.fonts.ready.then(() => { measure(); kick(); });


  /* ===== 5. Render loop (runs only while something changes) ===== */
  function kick() {
    if (!queued) { queued = true; requestAnimationFrame(frame); }
  }

  function frame() {
    queued = false;

    // ease toward the target for a dangling, laggy feel
    x += (tx - x) * EASE;
    y += (ty - y) * EASE;
    const settled = Math.abs(tx - x) < 0.5 && Math.abs(ty - y) < 0.5;
    if (settled) { x = tx; y = ty; }

    // move bulb, cord and light pool with transforms only (no layout, no repaint)
    const top = y - bh * GLASS;
    bulb.style.transform = `translate(${x - bw / 2}px, ${top}px)`;
    cord.style.transform = `translateX(${x - 1.5}px) scaleY(${Math.max(top, 0) / cordH})`;
    pool.style.transform = `translate(${x}px, ${y}px)`;

    // re-light visible lines; write CSS vars only when the snapped value changes
    const sx = scrollX, sy = scrollY;
    const bx = x + sx, by = y + sy;               // bulb in page coordinates
    for (const L of visible) {
      // direction: bulb → line center, snapped to one of ANGLES directions
      const a = Math.round(Math.atan2(L.cy - by, L.cx - bx) / (2 * Math.PI) * ANGLES);
      // brightness: distance from bulb to nearest point of the line box
      const ddx = Math.max(L.x0 - bx, 0, bx - L.x1);
      const ddy = Math.max(L.y0 - by, 0, by - L.y1);
      const lvl = Math.max(0, Math.round((1 - Math.hypot(ddx, ddy) / reach) * LEVELS));

      const key = lvl ? (a + ANGLES) * 10 + lvl : 0;   // all unlit lines look the same
      if (key === L.key) continue;
      L.key = key;

      const ang = a * 2 * Math.PI / ANGLES;
      const s = L.el.style;
      s.setProperty("--dx", Math.cos(ang).toFixed(3));
      s.setProperty("--dy", Math.sin(ang).toFixed(3));
      s.setProperty("--i", (lvl / LEVELS).toFixed(2));
    }

    if (!settled) kick();
  }


  /* ===== 6. Start: hand off from CSS to JS ===== */
  root.classList.add("js");   // turns off the scroll animation, frees the bulb
  measure();
  x = tx; y = ty;             // start at home, no easing in
  frame();
})();
