/* 最後の青い帯の背景：PopCorn の記号（. : > @）で描いたドットの面。
 * マウスや指のまわりが濃くなり、タップすると波が広がる。横に >> が流れていく。
 * 動きを減らす設定の人には、止まった 1 枚だけを描く。
 */
(() => {
  "use strict";

  const host = document.querySelector("#finale");
  if (!host) return;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext && canvas.getContext("2d");
  if (!ctx) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  canvas.className = "finale-field";
  canvas.setAttribute("aria-hidden", "true");
  host.prepend(canvas);
  host.classList.add("has-field");

  const RAMP = [".", ":", ">", "@"];
  const COLORS = ["rgb(255 255 255 / 26%)", "rgb(255 255 255 / 42%)", "rgb(143 245 208 / 75%)", "rgb(255 210 63 / 80%)"];
  const STREAM = "rgb(255 179 205 / 85%)";
  let W = 0;
  let H = 0;
  let cell = 18;
  let rowH = 20;
  let cols = 0;
  let rows = 0;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, last: -1e9 };
  const rings = [];
  const streams = [];

  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cell = W < 600 ? 14 : 18;
    rowH = Math.round(cell * 1.2);
    cols = Math.ceil(W / cell) + 1;
    rows = Math.ceil(H / rowH) + 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    streams.length = 0;
    const n = Math.max(3, Math.round(rows / 4));
    for (let i = 0; i < n; i += 1) {
      streams.push({ row: Math.floor(Math.random() * rows), x: Math.random() * cols, speed: 5 + Math.random() * 9 });
    }
    if (reduced) draw(0);
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    ctx.font = `${Math.round(cell * 0.86)}px DotGothic16, ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (performance.now() - pointer.last > 2600) {
      pointer.tx = W * (0.5 + 0.4 * Math.sin(t * 0.33));
      pointer.ty = H * (0.5 + 0.34 * Math.sin(t * 0.51 + 1));
    }
    pointer.x += (pointer.tx - pointer.x) * 0.12;
    pointer.y += (pointer.ty - pointer.y) * 0.12;
    const boost = new Map();
    const heads = new Set();
    streams.forEach((s) => {
      if (!reduced) s.x += s.speed / 30;
      if (s.x > cols + 8) {
        s.x = -2;
        s.row = Math.floor(Math.random() * rows);
        s.speed = 5 + Math.random() * 9;
      }
      const head = Math.floor(s.x);
      heads.add(`${head},${s.row}`);
      heads.add(`${head - 1},${s.row}`);
      for (let k = 2; k < 9; k += 1) boost.set(`${head - k},${s.row}`, 0.42 * (1 - k / 9));
    });
    const now = performance.now();
    for (let i = rings.length - 1; i >= 0; i -= 1) if (now - rings[i].t0 > 1400) rings.splice(i, 1);
    const buckets = [[], [], [], []];
    const pink = [];
    const sigma2 = 2 * 95 * 95;
    for (let y = 0; y < rows; y += 1) {
      const cy = y * rowH + rowH / 2;
      for (let x = 0; x < cols; x += 1) {
        const cx = x * cell + cell / 2;
        const key = `${x},${y}`;
        if (heads.has(key)) {
          pink.push(cx, cy);
          continue;
        }
        let v = 0.17 + 0.15 * Math.sin(cx * 0.012 + t * 0.9) * Math.cos(cy * 0.021 - t * 0.7);
        const dx = cx - pointer.x;
        const dy = cy - pointer.y;
        v += 0.6 * Math.exp(-(dx * dx + dy * dy) / sigma2);
        for (const ring of rings) {
          const age = (now - ring.t0) / 1000;
          const d = Math.hypot(cx - ring.x, cy - ring.y) - age * 560;
          v += 0.9 * (1 - age / 1.4) * Math.exp(-(d * d) / 700);
        }
        v += boost.get(key) || 0;
        if (v < 0.13) continue;
        const i = v < 0.3 ? 0 : v < 0.48 ? 1 : v < 0.68 ? 2 : 3;
        buckets[i].push(cx, cy);
      }
    }
    buckets.forEach((list, i) => {
      ctx.fillStyle = COLORS[i];
      for (let j = 0; j < list.length; j += 2) ctx.fillText(RAMP[i], list[j], list[j + 1]);
    });
    ctx.fillStyle = STREAM;
    for (let j = 0; j < pink.length; j += 2) ctx.fillText(">", pink[j], pink[j + 1]);
  }

  host.addEventListener("pointermove", (event) => {
    const r = host.getBoundingClientRect();
    pointer.tx = event.clientX - r.left;
    pointer.ty = event.clientY - r.top;
    pointer.last = performance.now();
  }, { passive: true });
  host.addEventListener("pointerdown", (event) => {
    const r = host.getBoundingClientRect();
    rings.push({ x: event.clientX - r.left, y: event.clientY - r.top, t0: performance.now() });
    if (reduced) draw(0);
  }, { passive: true });

  let running = false;
  let lastFrame = 0;
  const start = performance.now();
  function frame(now) {
    if (!running) return;
    if (now - lastFrame > 32) {
      lastFrame = now;
      draw((now - start) / 1000);
    }
    requestAnimationFrame(frame);
  }
  resize();
  pointer.x = pointer.tx = W / 2;
  pointer.y = pointer.ty = H / 2;
  new ResizeObserver(resize).observe(host);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (reduced) draw(0); });
  if (reduced) return;
  new IntersectionObserver(([entry]) => {
    running = entry.isIntersecting && !document.hidden;
    if (running) requestAnimationFrame(frame);
  }).observe(host);
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden && host.getBoundingClientRect().top < window.innerHeight;
    if (running) requestAnimationFrame(frame);
  });
})();
