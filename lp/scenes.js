/* 映画館：ページはスクロールしない。席に座ったまま、スクリーンの中で場面が切り替わる。
 * 場面は #main の section と、最後のフッター（クレジット）。
 * ホイール・スワイプ・矢印キー・下の ‹ › で進む。場面の中が長いときは、まず中をスクロールして、端に来たら次の場面へ。
 * 3D の場内（lp/theater.js）は、ここが出すイベント（theater:layout / theater:scene / theater:show / theater:throw）を聞く。
 * WebGL が使えなくても、場面の切り替えだけで動く。
 */
(() => {
  const screen = document.getElementById("screen");
  if (!screen) return;
  const root = document.documentElement;
  const EN = root.lang === "en";
  const L = (ja, en) => (EN ? en : ja);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const here = document.currentScript ? document.currentScript.src : location.href;
  const asset = (path) => new URL(path, here).href;

  const scenes = Array.from(screen.querySelectorAll("#main > section, #screen > footer"));
  if (!scenes.length) return;
  root.classList.add("is-theater");

  const emit = (name, detail = {}) => document.dispatchEvent(new CustomEvent(name, { detail }));

  /* ---------- スクリーンの位置と大きさ（3D の場内も、これに合わせる） ---------- */
  const rect = { left: 0, top: 0, width: 0, height: 0 };
  function layout() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const narrow = W < 720;
    const top = narrow ? 58 : Math.min(98, Math.max(66, H * 0.09));
    const bottom = narrow ? Math.max(118, H * 0.17) : Math.max(150, H * 0.21);
    const side = narrow ? 8 : Math.max(24, W * 0.05);
    const height = Math.max(240, H - top - bottom);
    const width = Math.min(W - side * 2, narrow ? Infinity : height * 2.1);
    Object.assign(rect, { left: (W - width) / 2, top, width, height });
    root.style.setProperty("--scr-l", `${rect.left}px`);
    root.style.setProperty("--scr-t", `${rect.top}px`);
    root.style.setProperty("--scr-w", `${rect.width}px`);
    root.style.setProperty("--scr-h", `${rect.height}px`);
    root.style.setProperty("--band", `${H - top - height}px`);
    emit("theater:layout", { ...rect, viewW: W, viewH: H });
  }
  window.theaterRect = rect;

  /* ---------- 場面の名前（下のコマ送りの読み上げ用） ---------- */
  function sceneName(el, i) {
    if (el.matches("footer")) return L("クレジット", "Credits");
    if (el.id === "top") return "PopCorn";
    const eyebrow = el.querySelector(".eyebrow");
    if (eyebrow) {
      const clone = eyebrow.cloneNode(true);
      clone.querySelectorAll(".hows, span:first-child").forEach((n) => n.remove());
      const text = clone.textContent.replace(/\s+/g, " ").trim();
      if (text) return text;
    }
    const h = el.querySelector("h2");
    return h ? h.textContent.replace(/\s+/g, " ").trim() : `${i + 1}`;
  }

  scenes.forEach((el, i) => {
    el.classList.add("scene");
    el.dataset.scene = String(i);
  });

  /* ---------- 場内の操作：コマ送り、手元のポップコーン、はじめの合図 ---------- */
  const ui = document.createElement("div");
  ui.className = "theater-ui";
  ui.innerHTML = `
    <nav class="reel" aria-label="${L("場面", "Scenes")}">
      <button class="reel-step reel-prev" type="button" aria-label="${L("前の場面", "Previous scene")}" data-nopop><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
      <ol class="reel-frames">${scenes.map((el, i) => `<li><button type="button" data-go="${i}" aria-label="${i + 1}. ${sceneName(el, i)}" data-nopop></button></li>`).join("")}</ol>
      <button class="reel-step reel-next" type="button" aria-label="${L("次の場面", "Next scene")}" data-nopop><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>
    </nav>
    <button class="bucket" type="button" aria-label="${L("ポップコーンを投げる", "Throw popcorn")}">
      <img src="${asset("img/skeuo/bucket.webp")}" alt="" draggable="false" decoding="async">
    </button>
    <div class="leader" aria-hidden="true"><div class="leader-ring"><i class="leader-sweep"></i><b class="leader-num">3</b></div></div>
    <p class="scene-hint" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="16" rx="5"/><path d="M12 7v3"/></svg><i></i></p>
  `;
  document.body.append(ui);
  screen.insertAdjacentHTML("beforeend", '<div class="film" aria-hidden="true"><i class="film-grain"></i><i class="film-cue"></i><i class="film-more"></i></div>');
  const frames = Array.from(ui.querySelectorAll("[data-go]"));
  const prevBtn = ui.querySelector(".reel-prev");
  const nextBtn = ui.querySelector(".reel-next");
  const bucket = ui.querySelector(".bucket");
  const leader = ui.querySelector(".leader");
  const leaderNum = ui.querySelector(".leader-num");
  const hint = ui.querySelector(".scene-hint");
  screen.append(leader);

  /* ---------- 場面の切り替え ---------- */
  let current = -1;
  let busy = false;
  const indexOfHash = (hash) => {
    if (!hash || hash.length < 2) return -1;
    let target = null;
    try { target = document.querySelector(hash); } catch { return -1; }
    if (!target) return -1;
    return scenes.findIndex((el) => el === target || el.contains(target));
  };

  function setCurrent(i) {
    current = i;
    scenes.forEach((el, k) => {
      const on = k === i;
      el.classList.toggle("is-current", on);
      el.inert = !on;
      if (on) el.removeAttribute("aria-hidden");
      else el.setAttribute("aria-hidden", "true");
    });
    frames.forEach((b, k) => {
      if (k === i) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
    });
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === scenes.length - 1;
    root.dataset.scene = scenes[i].id || "credits";
    scenes[i].scrollTop = 0;
    fit(scenes[i]);
    requestAnimationFrame(markMore);
    emit("theater:scene", { index: i, id: scenes[i].id || "credits", count: scenes.length });
  }

  function go(i, { instant = false, focus = false } = {}) {
    i = Math.max(0, Math.min(scenes.length - 1, i));
    if (i === current || busy) return;
    const dir = i > current ? 1 : -1;
    if (instant || reduced || current < 0) {
      setCurrent(i);
      if (focus) focusScene();
      return;
    }
    busy = true;
    screen.dataset.dir = dir > 0 ? "next" : "prev";
    screen.classList.add("is-cutting");
    emit("theater:cut", { from: current, to: i });
    setTimeout(() => {
      setCurrent(i);
      screen.classList.remove("is-cutting");
      screen.classList.add("is-arriving");
      setTimeout(() => {
        screen.classList.remove("is-arriving");
        busy = false;
      }, 420);
      if (focus) focusScene();
    }, 260);
    if (!hint.hidden) hint.classList.add("is-gone");
  }

  function focusScene() {
    const el = scenes[current];
    const target = el.querySelector("h1, h2") || el;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }

  prevBtn.addEventListener("click", () => go(current - 1));
  nextBtn.addEventListener("click", () => go(current + 1));
  frames.forEach((b) => b.addEventListener("click", () => go(Number(b.dataset.go))));

  /* ページ内リンク（#rules など）は、その場面へ */
  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const i = indexOfHash(link.getAttribute("href"));
    if (i < 0) return;
    event.preventDefault();
    if (link.classList.contains("skip")) {
      go(i, { instant: true, focus: true });
      focusScene();
      return;
    }
    go(i, { focus: event.detail === 0 });
  });

  /* ---------- ホイール：中をスクロールしきってから、次の場面 ---------- */
  const canScroll = (el, dir) => (dir > 0
    ? el.scrollTop + el.clientHeight < el.scrollHeight - 4
    : el.scrollTop > 4);
  /* 少しだけはみ出す場面は、縮めてスクリーンに収める（大きくはみ出す場面は、中をスクロール） */
  function fit(scene) {
    scene.style.removeProperty("zoom");
    const need = scene.scrollHeight;
    const have = scene.clientHeight;
    if (need <= have + 4) return;
    const z = have / need;
    if (z >= 0.8) scene.style.setProperty("zoom", z.toFixed(3));
  }
  function markMore() {
    const scene = scenes[current];
    screen.classList.toggle("has-more", !!scene && canScroll(scene, 1));
  }
  scenes.forEach((el) => el.addEventListener("scroll", markMore, { passive: true }));
  window.addEventListener("resize", () => requestAnimationFrame(() => {
    if (scenes[current]) fit(scenes[current]);
    markMore();
  }));
  function scrollerFor(target, dir) {
    for (let el = target; el && el !== document.body; el = el.parentElement) {
      if (el === screen) break;
      if (el.scrollHeight > el.clientHeight + 2) {
        const style = getComputedStyle(el).overflowY;
        if ((style === "auto" || style === "scroll") && canScroll(el, dir)) return el;
      }
      if (el.classList.contains("scene")) break;
    }
    return null;
  }

  let wheelSum = 0;
  let wheelLocked = false;
  let wheelTimer = 0;
  window.addEventListener("wheel", (event) => {
    if (root.classList.contains("gate-open") || root.classList.contains("gm-lock")) return;
    if (event.ctrlKey) return;
    const dir = Math.sign(event.deltaY);
    if (!dir) return;
    const release = () => {
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => { wheelLocked = false; wheelSum = 0; }, 180);
    };
    if (event.target.closest && event.target.closest(".scene") && scrollerFor(event.target, dir)) {
      wheelSum = 0;
      wheelLocked = true;
      release();
      return;
    }
    event.preventDefault();
    release();
    if (wheelLocked || busy) return;
    wheelSum += event.deltaMode === 1 ? event.deltaY * 30 : event.deltaY;
    if (Math.abs(wheelSum) > 70) {
      wheelLocked = true;
      wheelSum = 0;
      go(current + dir);
    }
  }, { passive: false });

  /* ---------- スワイプ（スマホ） ---------- */
  let touch = null;
  window.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) { touch = null; return; }
    const t = event.touches[0];
    const scene = scenes[current];
    touch = {
      x: t.clientX,
      y: t.clientY,
      atTop: !scrollerFor(event.target, -1) || scene.scrollTop <= 2,
      atBottom: !scrollerFor(event.target, 1),
      at: performance.now(),
    };
  }, { passive: true });
  window.addEventListener("touchend", (event) => {
    if (!touch || busy) return;
    const t = event.changedTouches[0];
    const dy = t.clientY - touch.y;
    const dx = t.clientX - touch.x;
    const quick = performance.now() - touch.at < 700;
    if (Math.abs(dy) > 56 && Math.abs(dy) > Math.abs(dx) * 1.3 && quick) {
      if (dy < 0 && touch.atBottom) go(current + 1);
      else if (dy > 0 && touch.atTop) go(current - 1);
    }
    touch = null;
  }, { passive: true });

  /* ---------- キー ---------- */
  window.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (root.classList.contains("gate-open") || root.classList.contains("gm-lock")) return;
    const el = document.activeElement;
    if (el && el.closest("input, textarea, select, [contenteditable], [role=slider], [role=tablist], .gm-modal")) return;
    const scene = scenes[current];
    const keys = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1, ArrowRight: 1, ArrowLeft: -1 };
    if (event.key === " " && (!el || el === document.body || el === scene || el.matches("h1, h2"))) {
      keys[" "] = event.shiftKey ? -1 : 1;
    }
    let dir = keys[event.key];
    if (event.key === "Home") { event.preventDefault(); go(0); return; }
    if (event.key === "End") { event.preventDefault(); go(scenes.length - 1); return; }
    if (!dir) return;
    if (/Left|Right/.test(event.key) && el && el.closest("[role=radiogroup], [role=group], [role=listbox]")) return;
    if (!/Left|Right/.test(event.key) && canScroll(scene, dir)) return;
    event.preventDefault();
    go(current + dir);
  });

  /* ---------- 手元のバケツ ---------- */
  bucket.addEventListener("click", (event) => {
    const r = bucket.getBoundingClientRect();
    bucket.classList.remove("is-shaking");
    void bucket.offsetWidth;
    bucket.classList.add("is-shaking");
    emit("theater:throw", { x: r.left + r.width * 0.45, y: r.top + r.height * 0.2, pointerX: event.clientX, pointerY: event.clientY });
  });

  /* ---------- 上映のはじまり：音の確認 → 場内が暗くなる → 幕が開く → 3, 2, 1 ---------- */
  let shown = false;
  async function startShow() {
    if (shown) return;
    shown = true;
    const start = indexOfHash(location.hash);
    if (start > 0 || reduced) {
      setCurrent(Math.max(0, start));
      root.classList.add("is-showing");
      emit("theater:show", { instant: true });
      return;
    }
    root.classList.add("is-dimming");
    emit("theater:show", { instant: false });
    await wait(1300);
    root.classList.add("is-leader");
    for (const n of [3, 2, 1]) {
      if (skipped) break;
      leaderNum.textContent = String(n);
      leader.classList.remove("tick");
      void leader.offsetWidth;
      leader.classList.add("tick");
      await wait(620);
    }
    root.classList.remove("is-leader");
    setCurrent(0);
    root.classList.add("is-showing");
    hint.hidden = false;
  }
  let skipped = false;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, skipped ? 0 : ms));
  const skip = () => {
    if (!shown || root.classList.contains("is-showing")) return;
    skipped = true;
  };
  window.addEventListener("pointerdown", skip);
  window.addEventListener("keydown", skip);
  hint.hidden = true;

  layout();
  window.addEventListener("resize", layout);
  scenes.forEach((el) => { el.inert = true; el.setAttribute("aria-hidden", "true"); });
  if (root.classList.contains("gate-open")) document.addEventListener("popcorn:gate", startShow, { once: true });
  else requestAnimationFrame(startShow);

  window.PopTheater = { go: (i) => go(i), get current() { return current; }, scenes, rect };
})();
