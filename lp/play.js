/* 紹介サイトの、さわって楽しい部品。
 * bencho.dev の「操作ごとに並んだ小さな動き」を参考に、PopCorn 用に作ったもの（コードは借りていない）。
 * - flap   : 空港の案内板のように、文字をパタパタ回して出す
 * - island : 上のバーのポップ数が、お知らせの形に伸び縮みする
 * - pit    : 札とポップコーンが下から弾けて、つかんで投げられる
 * - die    : 本当に転がるサイコロ
 */
(() => {
  "use strict";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- ポップコーンの写真（15 粒から、毎回ランダムに選ぶ） ---------- */
  const ROOT = new URL("..", (document.currentScript && document.currentScript.src) || location.href).href;
  const POP_URLS = Array.from({ length: 15 }, (_, i) => `${ROOT}lp/img/pop/pop-${String(i + 1).padStart(2, "0")}.webp`);
  const popImages = [];
  POP_URLS.forEach((url) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => popImages.push(img);
    img.src = url;
  });
  const popUrl = () => POP_URLS[Math.floor(Math.random() * POP_URLS.length)];
  const popImage = () => (popImages.length ? popImages[Math.floor(Math.random() * popImages.length)] : null);
  const popImg = (cls = "") => `<img class="pop-photo${cls ? ` ${cls}` : ""}" src="${popUrl()}" alt="" draggable="false" decoding="async">`;
  const FLAP_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789[]\"=.,+-*#@";
  const randomChar = () => FLAP_CHARS[Math.floor(Math.random() * FLAP_CHARS.length)];

  /* ---------- flap board ---------- */
  function flap(el, text, { delay = 0, quick = false } = {}) {
    const speed = quick ? 34 : 52;
    const chars = Array.from(String(text));
    const before = Array.from(el.dataset.flap || "");
    const token = String(Number(el.dataset.flapToken || 0) + 1);
    el.dataset.flapToken = token;
    el.dataset.flap = String(text);
    el.classList.add("flap");
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", String(text));
    el.innerHTML = chars.map((c) => `<span class="flap-cell${c === " " ? " gap" : ""}" aria-hidden="true"><b></b></span>`).join("");
    const cells = Array.from(el.children);
    if (reduced) {
      cells.forEach((cell, i) => { cell.firstChild.textContent = chars[i]; });
      return Promise.resolve();
    }
    return Promise.all(cells.map((cell, i) => new Promise((resolve) => {
      const target = chars[i];
      const face = cell.firstChild;
      if (target === " ") { resolve(); return; }
      face.textContent = before[i] && before[i] !== " " ? before[i] : randomChar();
      const spins = quick ? 2 + Math.floor(Math.random() * 2) + Math.min(i, 3) : 3 + Math.floor(Math.random() * 3) + Math.min(i, 7);
      let n = 0;
      const tick = () => {
        if (el.dataset.flapToken !== token) { resolve(); return; }
        n += 1;
        const last = n >= spins;
        face.textContent = last ? target : randomChar();
        cell.classList.remove("flip");
        void cell.offsetWidth;
        cell.classList.add("flip");
        if (last) resolve();
        else setTimeout(tick, speed);
      };
      setTimeout(tick, delay + i * (quick ? 14 : 30));
    })));
  }

  /* ---------- dynamic island ---------- */
  let islandEl = null;
  let islandTimer = 0;
  const ICONS = {
    info: '<svg aria-hidden="true"><use href="#i-pop"/></svg>',
    run: '<span class="island-spin" aria-hidden="true"><i></i><i></i><i></i></span>',
    ok: '<span class="island-dot ok" aria-hidden="true">✓</span>',
    err: '<span class="island-dot err" aria-hidden="true">!</span>',
    sound: '<span class="island-dot sound" aria-hidden="true">♪</span>',
  };

  function islandSetup() {
    if (islandEl) return islandEl;
    const anchor = document.querySelector(".pop-count");
    if (!anchor) return null;
    islandEl = document.createElement("div");
    islandEl.className = "island";
    islandEl.setAttribute("role", "status");
    islandEl.setAttribute("aria-live", "polite");
    islandEl.innerHTML = '<span class="island-inner"><span class="island-icon"></span><span class="island-text"></span></span>';
    anchor.parentElement.appendChild(islandEl);
    return islandEl;
  }

  function placeIsland(open) {
    const anchor = document.querySelector(".pop-count");
    const box = anchor.parentElement.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    islandEl.style.right = `${box.right - a.right}px`;
    islandEl.style.top = `${a.top - box.top}px`;
    islandEl.style.height = `${a.height}px`;
    if (!open) { islandEl.style.width = `${a.width}px`; return; }
    const inner = islandEl.querySelector(".island-inner");
    const limit = Math.max(a.width, a.right - 16);
    islandEl.style.width = `${Math.min(limit, inner.scrollWidth + 30)}px`;
  }

  function island(text, { kind = "info", ms = 2400 } = {}) {
    if (!islandSetup()) return;
    clearTimeout(islandTimer);
    const wasOpen = islandEl.classList.contains("open");
    islandEl.querySelector(".island-icon").innerHTML = ICONS[kind] || ICONS.info;
    islandEl.querySelector(".island-text").textContent = text;
    islandEl.dataset.kind = kind;
    if (!wasOpen) {
      placeIsland(false);
      void islandEl.offsetWidth;
      islandEl.classList.add("open");
    }
    placeIsland(true);
    islandEl.classList.remove("nudge");
    void islandEl.offsetWidth;
    islandEl.classList.add("nudge");
    if (ms > 0) islandTimer = setTimeout(closeIsland, ms);
  }

  function closeIsland() {
    if (!islandEl || !islandEl.classList.contains("open")) return;
    clearTimeout(islandTimer);
    placeIsland(false);
    islandEl.classList.remove("open");
  }
  window.addEventListener("resize", () => { if (islandEl?.classList.contains("open")) placeIsland(true); });

  /* ---------- pit: pop up, fall, grab, throw ---------- */
  function pit(stage, { items, obstacles = () => [], onPop = () => {}, max = 30 } = {}) {
    if (reduced) return null;
    const layer = document.createElement("div");
    layer.className = "pit";
    layer.setAttribute("aria-hidden", "true");
    stage.appendChild(layer);

    const G = 1900;
    const bodies = [];
    let W = 0;
    let H = 0;
    let walls = [];
    let running = false;
    let visible = false;
    let last = 0;
    let calm = 0;
    let spawned = 0;

    function measure() {
      const r = stage.getBoundingClientRect();
      W = r.width;
      H = r.height;
      walls = obstacles().map((el) => {
        if (el.nodeType === 1 && el.tagName !== "A" && el.tagName !== "BUTTON") {
          const range = document.createRange();
          range.selectNodeContents(el);
          return Array.from(range.getClientRects());
        }
        return [el.getBoundingClientRect()];
      }).flat().filter((b) => b.width > 2 && b.height > 2).map((b) => ({
        l: b.left - r.left, t: b.top - r.top, r: b.right - r.left, b: b.bottom - r.top,
      }));
    }

    function make(item, x) {
      const el = document.createElement("div");
      el.className = `pit-body ${item.kind === "pop" ? "is-pop" : "is-tag"}`;
      if (item.kind === "pop") {
        el.innerHTML = popImg();
      } else {
        el.textContent = item.text;
        el.style.setProperty("--c", item.color);
      }
      const radius = item.kind === "pop" ? 22 + Math.random() * 8 : Math.max(27, Math.min(44, 15 + item.text.length * 5));
      el.style.width = el.style.height = `${radius * 2}px`;
      layer.appendChild(el);
      const body = {
        el, r: radius,
        x: Math.max(radius, Math.min(W - radius, x)),
        y: H - radius - 2,
        vx: (Math.random() - 0.5) * 420,
        vy: -(H * 1.5 + Math.random() * H * 0.9),
        a: Math.random() * 40 - 20,
        va: (Math.random() - 0.5) * 540,
        held: null,
      };
      bodies.push(body);
      el.addEventListener("pointerdown", (event) => grab(event, body));
      if (bodies.length > max) {
        const old = bodies.shift();
        old.el.classList.add("gone");
        setTimeout(() => old.el.remove(), 400);
      }
      onPop(stage.getBoundingClientRect().left + body.x, stage.getBoundingClientRect().top + body.y);
      wake();
      return body;
    }

    function grab(event, body) {
      event.preventDefault();
      event.stopPropagation();
      body.el.setPointerCapture(event.pointerId);
      const r = stage.getBoundingClientRect();
      body.held = { dx: event.clientX - r.left - body.x, dy: event.clientY - r.top - body.y, px: body.x, py: body.y, t: performance.now() };
      body.el.classList.add("held");
      const move = (e) => {
        const now = performance.now();
        const rr = stage.getBoundingClientRect();
        const nx = Math.max(body.r, Math.min(W - body.r, e.clientX - rr.left - body.held.dx));
        const ny = Math.max(body.r, Math.min(H - body.r, e.clientY - rr.top - body.held.dy));
        const dt = Math.max(8, now - body.held.t) / 1000;
        body.vx = body.vx * 0.4 + ((nx - body.x) / dt) * 0.6;
        body.vy = body.vy * 0.4 + ((ny - body.y) / dt) * 0.6;
        body.va = body.vx * 0.6;
        body.x = nx;
        body.y = ny;
        body.held.t = now;
        wake();
      };
      const up = () => {
        body.el.removeEventListener("pointermove", move);
        body.el.removeEventListener("pointerup", up);
        body.el.removeEventListener("pointercancel", up);
        body.held = null;
        body.el.classList.remove("held");
        const speed = Math.hypot(body.vx, body.vy);
        const cap = 2600;
        if (speed > cap) { body.vx *= cap / speed; body.vy *= cap / speed; }
        wake();
      };
      body.el.addEventListener("pointermove", move);
      body.el.addEventListener("pointerup", up);
      body.el.addEventListener("pointercancel", up);
    }

    function collideWalls(b) {
      const e = 0.42;
      if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx) * e; }
      if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * e; }
      if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy) * e; }
      if (b.y + b.r > H) {
        b.y = H - b.r;
        if (b.vy > 0) b.vy = -b.vy * e;
        if (Math.abs(b.vy) < 40) b.vy = 0;
        b.vx *= 0.94;
        b.va = (b.vx / b.r) * 57.3;
      }
      for (const w of walls) {
        const cx = Math.max(w.l, Math.min(b.x, w.r));
        const cy = Math.max(w.t, Math.min(b.y, w.b));
        let dx = b.x - cx;
        let dy = b.y - cy;
        let d = Math.hypot(dx, dy);
        if (d >= b.r) continue;
        if (d < 0.001) { dx = 0; dy = -1; d = 1; }
        const nx = dx / d;
        const ny = dy / d;
        b.x = cx + nx * b.r;
        b.y = cy + ny * b.r;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= (1 + e) * vn * nx;
          b.vy -= (1 + e) * vn * ny;
          b.vx *= 0.96;
          if (ny < -0.6) b.va = (b.vx / b.r) * 57.3;
        }
      }
    }

    function collideBodies() {
      for (let i = 0; i < bodies.length; i += 1) {
        for (let j = i + 1; j < bodies.length; j += 1) {
          const a = bodies[i];
          const b = bodies[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const min = a.r + b.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min || d2 === 0) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const overlap = min - d;
          const ma = a.held ? 0 : 1 / (a.r * a.r);
          const mb = b.held ? 0 : 1 / (b.r * b.r);
          const sum = ma + mb;
          if (!sum) continue;
          a.x -= nx * overlap * (ma / sum);
          a.y -= ny * overlap * (ma / sum);
          b.x += nx * overlap * (mb / sum);
          b.y += ny * overlap * (mb / sum);
          const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rv < 0) {
            const jimp = (-(1 + 0.3) * rv) / sum;
            a.vx -= jimp * ma * nx;
            a.vy -= jimp * ma * ny;
            b.vx += jimp * mb * nx;
            b.vy += jimp * mb * ny;
            const tangent = (b.vx - a.vx) * -ny + (b.vy - a.vy) * nx;
            a.va += tangent * 0.08;
            b.va -= tangent * 0.08;
          }
        }
      }
    }

    function step(now) {
      if (!running) return;
      const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
      last = now;
      const sub = 3;
      const h = dt / sub;
      for (let s = 0; s < sub; s += 1) {
        for (const b of bodies) {
          if (b.held) continue;
          b.vy += G * h;
          b.x += b.vx * h;
          b.y += b.vy * h;
          b.a += b.va * h;
          b.va *= 0.995;
        }
        collideBodies();
        for (const b of bodies) if (!b.held) collideWalls(b);
      }
      let fastest = 0;
      for (const b of bodies) {
        fastest = Math.max(fastest, Math.abs(b.vx) + Math.abs(b.vy));
        b.el.style.transform = `translate(${b.x - b.r}px, ${b.y - b.r}px) rotate(${b.a}deg)`;
      }
      const busy = bodies.some((b) => b.held);
      calm = !busy && fastest < 24 ? calm + dt : 0;
      if (calm > 1.2 || !visible) {
        running = false;
        return;
      }
      requestAnimationFrame(step);
    }

    function wake() {
      calm = 0;
      if (running || !visible) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(step);
    }

    async function popAll() {
      measure();
      const order = items.slice().sort(() => Math.random() - 0.5);
      const fit = Math.max(8, Math.min(order.length, Math.round(W / 46)));
      for (let i = 0; i < fit; i += 1) {
        if (!visible) { spawned = i; return; }
        make(order[i], W * (0.08 + 0.84 * ((i * 0.618) % 1)));
        await new Promise((resolve) => setTimeout(resolve, 90));
      }
      spawned = fit;
    }

    stage.addEventListener("pointerdown", (event) => {
      if (event.target.closest("a, button, .pit-body")) return;
      if (!spawned) return;
      measure();
      const r = stage.getBoundingClientRect();
      const kind = Math.random() < 0.45 ? { kind: "pop" } : items[Math.floor(Math.random() * items.length)];
      const body = make(kind, event.clientX - r.left);
      body.y = Math.min(H - body.r - 2, event.clientY - r.top);
      body.vy = -(500 + Math.random() * 500);
    });

    window.addEventListener("resize", () => {
      measure();
      for (const b of bodies) {
        b.x = Math.max(b.r, Math.min(W - b.r, b.x));
        b.y = Math.max(b.r, Math.min(H - b.r, b.y));
      }
      wake();
    });

    new IntersectionObserver((entries) => {
      for (const entry of entries) {
        visible = entry.isIntersecting;
        if (visible) {
          measure();
          if (!spawned) popAll();
          wake();
        }
      }
    }, { threshold: 0.35 }).observe(stage);

    return { measure, wake };
  }

  /* ---------- die ---------- */
  const FACE_TURN = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
  const PIPS = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  function dieHtml(face) {
    const faces = [1, 2, 3, 4, 5, 6].map((f) => `<i class="die-face f${f}">${PIPS[f].map((p) => `<b style="grid-area:p${p}"></b>`).join("")}</i>`).join("");
    const [x, y] = FACE_TURN[face];
    return `<span class="die-cube" style="transform:rotateX(${x}deg) rotateY(${y}deg)" data-x="${x}" data-y="${y}">${faces}</span>`;
  }
  function rollDie(button, face) {
    const cube = button.querySelector(".die-cube");
    if (!cube) return Promise.resolve();
    const [fx, fy] = FACE_TURN[face];
    const turnsX = reduced ? 0 : 1 + Math.floor(Math.random() * 2);
    const turnsY = reduced ? 0 : 1 + Math.floor(Math.random() * 2);
    const px = Number(cube.dataset.x);
    const py = Number(cube.dataset.y);
    const x = Math.ceil(px / 360) * 360 + 360 * turnsX + fx;
    const y = Math.ceil(py / 360) * 360 + 360 * turnsY + fy;
    cube.dataset.x = String(x);
    cube.dataset.y = String(y);
    cube.style.transform = `rotateX(${x}deg) rotateY(${y}deg)`;
    button.classList.remove("rolling");
    void button.offsetWidth;
    button.classList.add("rolling");
    return new Promise((resolve) => setTimeout(resolve, reduced ? 0 : 720));
  }

  window.PopFX = { flap, island, closeIsland, pit, dieHtml, rollDie, popUrl, popImage, popImg, reduced };
})();
