(() => {
  "use strict";

  const DATA = window.POPCORN_LP;
  const EN = document.documentElement.lang === "en";
  const L = (ja, en) => (EN ? en : ja);
  const ROOT = new URL("..", (document.currentScript && document.currentScript.src) || location.href).href;
  const rootUrl = (path) => new URL(path, ROOT).href;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /* 中身が変わって高さが変わる箱を、ぱっと変えずに、なめらかに伸び縮みさせる */
  function smoothHeight(el, ms = 320) {
    if (!el || reduced || !window.ResizeObserver || !window.MutationObserver) return;
    let from = el.getBoundingClientRect().height;
    let timer = 0;
    new ResizeObserver(() => { from = el.getBoundingClientRect().height; }).observe(el);
    new MutationObserver(() => {
      const start = from;
      el.style.transition = "none";
      el.style.height = "auto";
      const to = el.getBoundingClientRect().height;
      if (!start || !to || Math.abs(to - start) < 2) {
        el.style.transition = "";
        el.style.height = "";
        return;
      }
      el.style.height = `${start}px`;
      el.getBoundingClientRect();
      el.classList.add("is-growing");
      el.style.transition = `height ${ms}ms cubic-bezier(.2, .8, .2, 1)`;
      el.style.height = `${to}px`;
      clearTimeout(timer);
      timer = setTimeout(() => {
        el.style.transition = "";
        el.style.height = "";
        el.classList.remove("is-growing");
      }, ms + 60);
    }).observe(el, { childList: true, subtree: true, characterData: true });
  }

  const track = (name, v) => {
    try { window.itya?.track(name, v === undefined ? undefined : { v: String(v).slice(0, 60) }); } catch { /* 計測で、動作を止めない */ }
  };

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* 保存できなくても動く */ } },
  };

  function esc(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function localize(raw) {
    return !EN && window.PopCornLocalization ? window.PopCornLocalization.localizeError(raw) : raw;
  }

  function encodeSource(source) {
    const bytes = new TextEncoder().encode(source);
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function playgroundUrl(source) {
    return `${ROOT}playground/#code=${encodeSource(source)}`;
  }

  const TOKEN = /(\/\/[^\n]*)|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|`[^`\n]*`?)|(>[?!]?>)|\b(pop|when|else|as|and|or|not|in)\b|\b(true|false|null)\b|\b([A-Z][A-Za-z0-9_]*)\b|\b([a-z_][A-Za-z0-9_]*)\b|(@)|(\d+(?:\.\d+)?)|(::|==|!=|>=|<=|[+\-*/%<>])|([.():,[\]{}])/g;

  function tokenize(code) {
    const tokens = [];
    let last = 0;
    TOKEN.lastIndex = 0;
    let m;
    while ((m = TOKEN.exec(code))) {
      if (m.index > last) tokens.push({ type: "", text: code.slice(last, m.index) });
      const type = m[1] ? "com" : m[2] ? "str" : m[3] ? "pipe" : m[4] ? "kw" : m[5] ? "const"
        : m[6] ? "fn" : m[7] ? "id" : m[8] ? "at" : m[9] ? "num" : m[10] ? "op" : "punc";
      tokens.push({ type, text: m[0] });
      last = TOKEN.lastIndex;
    }
    if (last < code.length) tokens.push({ type: "", text: code.slice(last) });
    for (let i = 0; i < tokens.length; i += 1) {
      if (tokens[i].type !== "id") continue;
      let p = i - 1;
      while (p >= 0 && !tokens[p].type && !tokens[p].text.includes("\n") && !tokens[p].text.trim()) p -= 1;
      let n = i + 1;
      while (n < tokens.length && !tokens[n].type && !tokens[n].text.trim() && !tokens[n].text.includes("\n")) n += 1;
      if (p >= 0 && tokens[p].type === "pipe" && tokens[n] && tokens[n].text === ".") tokens[i].type = "bind";
    }
    return tokens;
  }

  function highlight(code) {
    return tokenize(code).map((t) => (t.type && t.type !== "id" && t.type !== "punc"
      ? `<span class="t-${t.type}">${esc(t.text)}</span>`
      : esc(t.text))).join("");
  }

  function fmt(value) {
    if (Array.isArray(value)) return `[${value.map(fmt).join(", ")}]`;
    if (typeof value === "string") return JSON.stringify(value);
    return String(value);
  }

  /* ---------- お知らせ：上のバーのポップ数が伸びて、知らせる ---------- */
  const FX = window.PopFX;
  function toast(text, kind = "info", ms = 2400) {
    FX.island(text, { kind, ms });
  }

  /* ---------- pop! (canvas + sound + counter) ---------- */
  const canvas = $("#popLayer");
  const ctx = canvas.getContext("2d");
  const COLORS = ["#ffd23f", "#ff4f8b", "#2563ff", "#2ed3a0", "#12c2e9", "#ff9f1c", "#7c5cff"];
  let particles = [];
  let looping = false;
  let dpr = 1;

  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  function drawPopcorn(size) {
    const lobes = [[-0.32, 0.02, 0.36], [0.22, -0.28, 0.4], [0.36, 0.16, 0.34], [-0.06, 0.38, 0.34], [-0.2, -0.34, 0.3]];
    ctx.lineWidth = Math.max(1.6, size * 0.09);
    ctx.strokeStyle = "#13204a";
    ctx.fillStyle = "#fff5d6";
    for (const [x, y, r] of lobes) {
      ctx.beginPath();
      ctx.arc(x * size, y * size, r * size, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff9f1c";
    ctx.beginPath();
    ctx.arc(0.02 * size, 0.42 * size, size * 0.14, 0, Math.PI);
    ctx.fill();
  }

  function frame() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const now = performance.now();
    particles = particles.filter((p) => now - p.born < p.life);
    for (const p of particles) {
      if (now < p.born) continue;
      const t = (now - p.born) / 1000;
      const x = p.x + p.vx * t;
      const y = p.y + p.vy * t + 0.5 * p.g * t * t;
      const k = (now - p.born) / p.life;
      ctx.setTransform(dpr, 0, 0, dpr, x * dpr, y * dpr);
      ctx.rotate(p.rot + p.vr * t);
      ctx.globalAlpha = k > 0.7 ? Math.max(0, 1 - (k - 0.7) / 0.3) : 1;
      const grow = Math.min(1, (now - p.born) / 120);
      ctx.scale(grow, grow);
      if (p.kind === "pop" && p.img) {
        const w = p.size * 2.2;
        const h = (w * p.img.naturalHeight) / p.img.naturalWidth;
        ctx.drawImage(p.img, -w / 2, -h / 2, w, h);
      } else if (p.kind === "pop") {
        drawPopcorn(p.size);
      } else if (p.kind === "dust") {
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      } else {
        ctx.fillStyle = p.color;
        ctx.strokeStyle = "#13204a";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        if (p.kind === "dot") ctx.arc(0, 0, p.size * 0.32, 0, Math.PI * 2);
        else ctx.rect(-p.size * 0.4, -p.size * 0.16, p.size * 0.8, p.size * 0.32);
        ctx.fill();
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (particles.length) requestAnimationFrame(frame);
    else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      looping = false;
    }
  }

  let audio = null;
  let soundOn = false;

  /* 音量は 0〜8 の 8 段。6 がふつう */
  const VOLUME_STEPS = 8;
  const savedVolume = store.get("popcorn.lp.volume");
  let volume = savedVolume === null ? 6 : Math.max(0, Math.min(VOLUME_STEPS, Math.round(Number(savedVolume)) || 0));
  const level = () => volume / 6;
  let master = null;
  function out() {
    if (!master) {
      master = audio.createGain();
      master.connect(audio.destination);
    }
    master.gain.value = level();
    return master;
  }
  function setVolume(n) {
    volume = Math.max(0, Math.min(VOLUME_STEPS, n));
    store.set("popcorn.lp.volume", String(volume));
    if (master) master.gain.value = level();
    if (bgmEl && !bgmGain && !bgmEl.paused) bgmEl.volume = Math.min(1, BGM_VOLUME * level());
  }
  const soundToggle = $("#soundToggle");
  soundToggle.setAttribute("aria-pressed", String(soundOn));
  soundToggle.addEventListener("click", () => {
    soundOn = !soundOn;
    soundToggle.setAttribute("aria-pressed", String(soundOn));
    if (soundOn) {
      popFetch();
      playSound(1);
      if (BGM) bgmPlay(true);
      else toast(L("ポップの音：オン", "Pop sound: on"), "sound", 1600);
    } else {
      bgmStop();
      toast(BGM ? L("音：オフ", "Sound: off") : L("ポップの音：オフ", "Pop sound: off"), "sound", 1600);
    }
  });

  /* ---------- BGM：🔊 を押したときだけ、フェードで入ってループする ---------- */
  const BGM = DATA.bgm && DATA.bgm.src ? DATA.bgm : null;
  const BGM_VOLUME = 0.32;
  let bgmEl = null;
  let bgmGain = null;
  let bgmTimer = 0;
  let bgmRamp = 0;
  const POP = DATA.popSound && DATA.popSound.src && DATA.popSound.count ? DATA.popSound : null;
  if (BGM || (POP && POP.credit)) {
    const credit = $("#bgmCredit");
    const link = (text, url) => (url ? `<a href="${esc(url)}" rel="noopener">${esc(text)}</a>` : esc(text));
    const parts = [];
    if (BGM) {
      soundToggle.title = L("音（BGM とポップ）", "Sound (music and pops)");
      $(".sr-only", soundToggle).textContent = soundToggle.title;
      parts.push(EN
        ? `Music: “${esc(BGM.title)}” by ${link(BGM.author, BGM.authorUrl)}${BGM.license ? ` (${link(BGM.license, BGM.licenseUrl)})` : ""}`
        : `BGM：「${esc(BGM.title)}」${link(BGM.author, BGM.authorUrl)}${BGM.license ? `（${link(BGM.license, BGM.licenseUrl)}）` : ""}`);
    }
    if (POP && POP.credit) parts.push(`${L("ポップの音：", "Pop sound: ")}${link(POP.credit, POP.creditUrl)}`);
    credit.innerHTML = parts.join("<span class=\"credit-sep\"> ／ </span>");
    credit.hidden = false;
  }

  /* ---------- ポップの音：録音した粒を、はじけるたびにランダムに鳴らす ---------- */
  let popBytes = null;
  let popBuf = null;
  let popDecoding = false;
  let popLast = 0;

  function popFetch() {
    if (!POP || popBytes) return;
    popBytes = fetch(rootUrl(POP.src))
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
  }

  function popDecode() {
    if (!POP || popBuf || popDecoding || !audio) return;
    popDecoding = true;
    popFetch();
    popBytes.then((bytes) => {
      if (!bytes) return;
      try {
        audio.decodeAudioData(bytes, (buf) => { popBuf = buf; }, () => {});
      } catch { /* 読めない形式なら、合成の音のまま */ }
    });
  }

  function popSample(power) {
    const now = audio.currentTime;
    if (now - popLast < 0.028) return;
    popLast = now;
    const i = Math.floor(Math.random() * POP.count);
    const src = audio.createBufferSource();
    const g = audio.createGain();
    src.buffer = popBuf;
    src.playbackRate.value = 0.88 + Math.random() * 0.26 + 0.06 * power;
    g.gain.value = Math.min(1, 0.5 + 0.35 * power);
    src.connect(g).connect(out());
    src.start(now, i * POP.step, POP.step * 0.92);
  }

  if (soundOn) popFetch();

  function bgmSetup() {
    if (bgmEl) return;
    bgmEl = new Audio();
    bgmEl.crossOrigin = "anonymous";
    bgmEl.loop = true;
    bgmEl.preload = "auto";
    bgmEl.src = rootUrl(BGM.src);
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const source = audio.createMediaElementSource(bgmEl);
      bgmGain = audio.createGain();
      bgmGain.gain.value = 0;
      source.connect(bgmGain).connect(out());
    } catch {
      bgmGain = null;
      bgmEl.volume = 0;
    }
  }

  function bgmTo(target, ms) {
    if (!bgmEl) return;
    if (bgmGain) {
      const t = audio.currentTime;
      bgmGain.gain.cancelScheduledValues(t);
      bgmGain.gain.setValueAtTime(bgmGain.gain.value, t);
      bgmGain.gain.linearRampToValueAtTime(target, t + ms / 1000);
      return;
    }
    clearInterval(bgmRamp);
    const from = bgmEl.volume;
    const start = performance.now();
    bgmRamp = setInterval(() => {
      const k = Math.min(1, (performance.now() - start) / ms);
      try { bgmEl.volume = from + (target - from) * k; } catch { /* 音量を変えられない端末もある */ }
      if (k >= 1) clearInterval(bgmRamp);
    }, 40);
  }

  async function bgmPlay(announce = false) {
    if (!BGM || !soundOn || document.hidden) return;
    bgmSetup();
    clearTimeout(bgmTimer);
    try {
      if (audio && audio.state === "suspended") await audio.resume();
      await bgmEl.play();
    } catch {
      return;
    }
    bgmTo(bgmGain ? BGM_VOLUME : Math.min(1, BGM_VOLUME * level()), 1400);
    if (announce) toast(`♪ ${BGM.title}`, "sound", 2400);
  }

  function bgmStop(ms = 600) {
    if (!bgmEl || bgmEl.paused) return;
    bgmTo(0, ms);
    clearTimeout(bgmTimer);
    bgmTimer = setTimeout(() => bgmEl.pause(), ms + 40);
  }

  if (BGM) {
    if (soundOn) {
      const startOnce = () => {
        document.removeEventListener("pointerdown", startOnce, true);
        document.removeEventListener("keydown", startOnce, true);
        bgmPlay(true);
      };
      document.addEventListener("pointerdown", startOnce, true);
      document.addEventListener("keydown", startOnce, true);
    }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) bgmStop(300);
      else if (soundOn && bgmEl) bgmPlay();
    });
  }

  function playSound(power = 1, force = false) {
    if (!soundOn && !force) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      popDecode();
      if (popBuf) {
        popSample(power);
        return;
      }
      const t = audio.currentTime;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      const base = 520 + Math.random() * 380;
      osc.type = "triangle";
      osc.frequency.setValueAtTime(base * (1.1 + 0.3 * power), t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.09);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(gain).connect(out());
      osc.start(t);
      osc.stop(t + 0.14);
      const len = Math.floor(audio.sampleRate * 0.03);
      const buffer = audio.createBuffer(1, len, audio.sampleRate);
      const ch = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const noise = audio.createBufferSource();
      const filter = audio.createBiquadFilter();
      const ng = audio.createGain();
      filter.type = "highpass";
      filter.frequency.value = 1800;
      ng.gain.value = 0.14;
      noise.buffer = buffer;
      noise.connect(filter).connect(ng).connect(out());
      noise.start(t);
    } catch { /* 音が出せなくても、動く */ }
  }

  /* ---------- 開くたびに、音を出すかを聞く（音量だけは覚えておく） ---------- */
  const PIXELS = {
    corn: [
      "........kkkk........",
      ".......kwwwwk.......",
      "....kkkwwhhwwkkk....",
      "...kwwwwwwwwwwwwk...",
      "..kwwhwcwwwycwhwwk..",
      ".kwwwwwcwwwwcwwwcck.",
      ".kwwwwwwcwwcwwwwcck.",
      ".kwwccwwwwwwwwccwwk.",
      "kwwwwwwhwcwwhwcwwwwk",
      "kwwwywwwwccwwwcywwck",
      "kwkwwwwwwwwwwwwwwkck",
      ".kwyyyyyyyyyyyyyywk.",
      "..kkkkkkkkkkkkkkkk..",
      "...krwwrrwwrrwwrk...",
      "...krwwehwwrehwrk...",
      "...krwwerwwrewwrk...",
      "...krwprewwerpwrk...",
      "...krwwrreerrwwrk...",
      "....kwwrrwwrrwwk....",
      "....kwwrrwwrrwwk....",
      "....kwwrrwwrrwwk....",
      ".....kkkkkkkkkk.....",
    ],
    speaker: [
      "kkkkkkkkkkkkkk",
      "kbbbbbbbbbbbbk",
      "knbbbbbbbbbbbk",
      "knbbbkkkkbbbbk",
      "knbbbhsskbbbbk",
      "knbbksssskbbbk",
      "knbbbksskbbbbk",
      "knbbbkkkkbbbbk",
      "knbbbbbbbbbbbk",
      "knbbkkkkkkbbbk",
      "knbkhsssskkbbk",
      "knbksskksskbbk",
      "knbkskkkkskbbk",
      "knbkskkkkskbbk",
      "knbksskksskbbk",
      "knbkksssskkbbk",
      "knbbkkkkkkbbbk",
      "knbbbbbbbbbbbk",
      "knbbbbbbbbbbbk",
      "kkkkkkkkkkkkkk",
    ],
    note: [
      "...kk.",
      "...kkk",
      "...k.k",
      "...k..",
      "...k..",
      ".kkk..",
      "kkkk..",
      ".kk...",
    ],
  };
  const PIXEL_COLORS = { k: "#13204a", w: "#fffaf0", c: "#f3d49a", y: "#ffd23f", r: "#ff4f8b", b: "#2563ff", s: "#d7e5ff", e: "#13204a", h: "#ffffff", p: "#ffb3cd", n: "#1747d6" };

  function pixelArt(rows, className) {
    let rects = "";
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length;) {
        let n = 1;
        while (row[x + n] === row[x]) n += 1;
        if (row[x] !== ".") rects += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${PIXEL_COLORS[row[x]]}"/>`;
        x += n;
      }
    });
    return `<svg class="${className}" viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  }

  openGate();

  function openGate() {
    const title = L("音が出ますが、よろしいですか？", "This site has sound. Is that OK?");
    const hint = L("あとから 🔊 で切り替え", "Switch anytime with 🔊");
    const yesText = L("はい", "Yes");
    const noText = L("いいえ", "No");
    const gate = document.createElement("div");
    gate.className = "gate";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.setAttribute("aria-labelledby", "gateTitle");
    gate.innerHTML = `
      <div class="gate-card">
        <div class="gate-bar" aria-hidden="true"><span class="window-dots"><i></i><i></i><i></i></span><span>sound-check.pop</span></div>
        <div class="gate-stage">
          ${pixelArt(PIXELS.speaker, "gate-speaker")}
          <div class="gate-corn">${pixelArt(PIXELS.corn, "gate-corn-art")}<span class="gate-shadow"></span></div>
          ${pixelArt(PIXELS.speaker, "gate-speaker gate-speaker-r")}
          ${pixelArt(PIXELS.note, "gate-note gate-note-a")}
          ${pixelArt(PIXELS.note, "gate-note gate-note-b")}
        </div>
        <p class="gate-title" id="gateTitle">${esc(title)}</p>
        <div class="gate-volume">
          <span class="gate-volume-label" id="gateVolume">VOLUME</span>
          <div class="gate-blocks" role="slider" tabindex="0" aria-labelledby="gateVolume" aria-valuemin="0" aria-valuemax="${VOLUME_STEPS}">${"<i></i>".repeat(VOLUME_STEPS)}</div>
        </div>
        <div class="gate-actions">
          <button class="gate-btn gate-yes" type="button">${esc(yesText)}</button>
          <button class="gate-btn gate-no" type="button">${esc(noText)}</button>
        </div>
        <p class="gate-hint">${esc(hint)}</p>
      </div>`;

    const blocks = $(".gate-blocks", gate);
    const cells = $$("i", blocks);
    const yes = $(".gate-yes", gate);
    const no = $(".gate-no", gate);
    const stage = $(".gate-stage", gate);
    function paint() {
      cells.forEach((cell, i) => cell.classList.toggle("on", i < volume));
      blocks.setAttribute("aria-valuenow", String(volume));
      blocks.setAttribute("aria-valuetext", `${volume} / ${VOLUME_STEPS}`);
      stage.style.setProperty("--loud", String(volume / VOLUME_STEPS));
    }
    function changeVolume(n) {
      setVolume(n);
      paint();
      playSound(0.7, true);
    }
    paint();
    blocks.addEventListener("click", (event) => {
      const i = cells.indexOf(event.target.closest("i"));
      if (i >= 0) changeVolume(i + 1 === volume ? i : i + 1);
    });
    blocks.addEventListener("keydown", (event) => {
      const next = { ArrowRight: volume + 1, ArrowUp: volume + 1, ArrowLeft: volume - 1, ArrowDown: volume - 1, Home: 0, End: VOLUME_STEPS }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      changeVolume(next);
    });

    const hidden = Array.from(document.body.children).filter((el) => el !== gate && !el.inert);
    hidden.forEach((el) => { el.inert = true; });
    document.documentElement.classList.add("gate-open");
    const before = document.activeElement;
    document.body.append(gate);
    requestAnimationFrame(() => {
      gate.classList.add("is-open");
      yes.focus({ preventScroll: true });
    });

    function finish(on) {
      soundOn = on;
      soundToggle.setAttribute("aria-pressed", String(on));
      track("pc_lp_sound_gate", on ? "yes" : "no");
      if (on) {
        popFetch();
        playSound(1.2);
        if (BGM) bgmPlay(true);
      }
      gate.classList.add("is-leaving");
      hidden.forEach((el) => { el.inert = false; });
      document.documentElement.classList.remove("gate-open");
      if (before && before !== document.body && before.focus) before.focus({ preventScroll: true });
      setTimeout(() => gate.remove(), reduced ? 0 : 420);
    }
    yes.addEventListener("click", () => finish(true));
    no.addEventListener("click", () => finish(false));
    gate.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
        return;
      }
      if (event.key !== "Tab") return;
      const order = [blocks, yes, no];
      const i = order.indexOf(document.activeElement);
      event.preventDefault();
      order[(i + (event.shiftKey ? order.length - 1 : 1)) % order.length].focus();
    });
  }

  const countEl = $("#popCount");
  const countBox = countEl.closest(".pop-count");
  let pops = 0;
  const MILESTONES = new Map([
    [10, L("10 ポップ！", "10 pops!")],
    [50, L("50 ポップ！", "50 pops!")],
    [100, L("100 ポップ！", "100 pops!")],
    [300, L("300 ポップ！", "300 pops!")],
  ]);

  function burst(x, y, power = 1) {
    pops += 1;
    countEl.textContent = String(pops);
    countBox.classList.remove("bump");
    void countBox.offsetWidth;
    countBox.classList.add("bump");
    if (MILESTONES.has(pops)) toast(MILESTONES.get(pops));
    if (pops === 1) track("pc_lp_pop");
    if (pops === 10 && window.PopGames) window.PopGames.invite();
    playSound(power);
    const now = performance.now();
    const count = reduced ? 3 : Math.round(5 + 6 * power);
    for (let i = 0; i < count; i += 1) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
      const speed = (reduced ? 60 : 260 + Math.random() * 320) * (0.6 + power * 0.5);
      const roll = Math.random();
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        g: reduced ? 0 : 1300,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 10,
        born: now,
        life: reduced ? 500 : 900 + Math.random() * 500,
        size: roll < 0.5 ? 16 + Math.random() * 10 : 9 + Math.random() * 6,
        kind: roll < 0.5 ? "pop" : roll < 0.78 ? "dot" : "bar",
        img: roll < 0.5 ? FX.popImage() : null,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
    }
    if (!looping) {
      looping = true;
      requestAnimationFrame(frame);
    }
  }

  function dust(el) {
    if (!el) return Promise.resolve();
    const r = el.getBoundingClientRect();
    const chip = el.querySelector(".st-head code");
    const tint = chip ? getComputedStyle(chip).backgroundColor : "#ffd23f";
    const now = performance.now();
    const n = reduced ? 0 : Math.min(110, Math.round((r.width * r.height) / 240));
    for (let i = 0; i < n; i += 1) {
      const fx = Math.random();
      particles.push({
        x: r.left + fx * r.width,
        y: r.top + Math.random() * r.height,
        vx: 50 + Math.random() * 140,
        vy: -40 - Math.random() * 110,
        g: -60,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 6,
        born: now + fx * 420,
        life: 600 + Math.random() * 500,
        size: 2 + Math.random() * 4,
        kind: "dust",
        color: i % 3 === 0 ? tint : i % 3 === 1 ? "#13204a" : "#ffffff",
      });
    }
    el.classList.add("dusting");
    if (n && !looping) {
      looping = true;
      requestAnimationFrame(frame);
    }
    return wait(reduced ? 0 : 500);
  }

  function burstAt(element, power = 1) {
    const r = element.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, power);
  }

  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (event.target.closest("input, textarea, select, label, [data-nopop], .kernel")) return;
    burst(event.clientX, event.clientY, 0.6);
  });

  /* ---------- nav ---------- */
  const nav = $("#nav");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- 文字がほどける（見出しの札と、メニュー） ---------- */
  const GLYPHS_HALF = ">@.:#%*+=";
  const GLYPHS_FULL = "＞＠：．＃％＊＋＝";
  function scramble(node, ms = 560) {
    if (reduced || node.dataset.scrambling) return;
    const text = node.dataset.text || node.textContent;
    node.dataset.text = text;
    node.dataset.scrambling = "1";
    const chars = Array.from(text);
    const start = performance.now();
    const pick = (c) => {
      const set = c.charCodeAt(0) > 0x2e80 ? GLYPHS_FULL : GLYPHS_HALF;
      return set[Math.floor(Math.random() * set.length)];
    };
    let last = 0;
    const step = (now) => {
      const k = Math.min(1, (now - start) / ms);
      if (now - last > 45 || k >= 1) {
        last = now;
        const fixed = Math.floor(k * chars.length);
        node.textContent = k >= 1 ? text : chars.map((c, i) => (i < fixed || /\s/.test(c) ? c : pick(c))).join("");
      }
      if (k < 1) requestAnimationFrame(step);
      else delete node.dataset.scrambling;
    };
    requestAnimationFrame(step);
  }
  $$(".eyebrow").forEach((eyebrow) => {
    const num = eyebrow.querySelector(":scope > span");
    const label = num && num.nextSibling;
    if (!label || label.nodeType !== 3 || !label.textContent.trim()) return;
    const wrap = document.createElement("i");
    wrap.className = "scramble";
    wrap.textContent = label.textContent.trim();
    label.replaceWith(wrap, " ");
  });
  $$(".nav-links a").forEach((link) => {
    link.addEventListener("pointerenter", () => scramble(link, 380));
    link.addEventListener("focus", () => scramble(link, 380));
  });

  /* ---------- reveal ---------- */
  const revealer = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          entry.target.querySelectorAll(".scramble").forEach((node) => scramble(node));
          revealer.unobserve(entry.target);
        }
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" })
    : null;
  $$(".reveal").forEach((el) => (revealer ? revealer.observe(el) : el.classList.add("in")));

  function whenVisible(element, onEnter, onLeave) {
    if (!("IntersectionObserver" in window)) { onEnter(); return; }
    new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) onEnter();
        else if (onLeave) onLeave();
      }
    }, { threshold: 0.2 }).observe(element);
  }

  /* ---------- hero: kernels and decor ---------- */
  const decor = $("#decor");
  const DECOR = [
    [3, 6, 52, -12, 0.4, 14], [88, 4, 64, 18, 1.2, 22], [94, 44, 44, 8, 2.2, 12],
    [2, 62, 40, 24, 0.8, 18], [72, 88, 50, -20, 1.6, 16], [40, 2, 34, 30, 2.6, 10],
  ];
  decor.innerHTML = DECOR.map(([x, y, s, r, d, depth]) => (
    `<span class="decor-pop" style="left:${x}%;top:${y}%;--s:${s}px;--r:${r}deg;--d:${d}s;--depth:${depth}">${FX.popImg()}</span>`
  )).join("");
  if (!reduced && window.matchMedia("(pointer: fine)").matches) {
    const hero = $(".hero");
    let raf = 0;
    hero.addEventListener("pointermove", (event) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = hero.getBoundingClientRect();
        decor.style.setProperty("--mx", ((event.clientX - r.left) / r.width - 0.5).toFixed(3));
        decor.style.setProperty("--my", ((event.clientY - r.top) / r.height - 0.5).toFixed(3));
      });
    });
  }

  const tray = $("#kernels");
  const KERNELS = 9;
  let popped = 0;
  function seedKernels(fresh = false) {
    popped = 0;
    const order = Array.from({ length: 15 }, (_, i) => i + 1).sort(() => Math.random() - 0.5);
    tray.innerHTML = Array.from({ length: KERNELS }, (_, i) => (
      `<button class="kernel${fresh ? " fresh" : ""}" type="button" style="--d:${(i * 0.37) % 2.2}s" aria-label="${L(`粒 ${i + 1} をポップさせる`, `Pop kernel ${i + 1}`)}"><img class="kernel-photo" src="${rootUrl(`lp/img/kernel/kernel-${String(order[i]).padStart(2, "0")}.webp`)}" alt="" width="46" height="54" draggable="false" decoding="async"></button>`
    )).join("");
  }
  seedKernels();
  tray.addEventListener("click", (event) => {
    const kernel = event.target.closest(".kernel");
    if (!kernel || kernel.classList.contains("popped")) return;
    kernel.classList.remove("fresh");
    kernel.classList.add("popped");
    kernel.setAttribute("aria-label", L("ポップした！", "Popped!"));
    kernel.disabled = true;
    kernel.innerHTML = FX.popImg();
    burstAt(kernel, 1.1);
    popped += 1;
    if (popped === KERNELS) {
      toast(L("ぜんぶポップ！ 🎉", "All popped! 🎉"));
      track("pc_lp_all_popped");
      setTimeout(() => {
        const r = tray.getBoundingClientRect();
        for (let i = 0; i < 4; i += 1) setTimeout(() => burst(r.left + r.width * (0.2 + 0.2 * i), r.top + 10, 1.4), i * 110);
      }, 150);
      setTimeout(() => seedKernels(true), 2600);
    }
  });

  /* ---------- hero: pipeline ---------- */
  const heroLines = $("#heroLines");
  const heroCode = DATA.hero.code.split("\n");
  heroLines.innerHTML = heroCode.map((line, i) => (
    `<li class="hero-line"><span class="rider" aria-hidden="true">${FX.popImg()}</span><code>${highlight(line)}</code><span class="val">${esc(DATA.hero.values[i])}</span></li>`
  )).join("");
  const heroItems = $$(".hero-line", heroLines);
  heroLines.insertAdjacentHTML("afterend", `<p class="hero-readout" id="heroReadout" aria-hidden="true"><span>${L("はじめの値", "Start")}</span><b></b></p>`);
  const heroReadout = $("#heroReadout");
  function showReadout(i) {
    heroReadout.classList.toggle("last", i === heroItems.length - 1);
    heroReadout.classList.toggle("bump", false);
    void heroReadout.offsetWidth;
    heroReadout.classList.toggle("bump", true);
    $("span", heroReadout).textContent = i === 0 ? L("はじめの値", "Start") : L(`${i + 1} 行目を通ったあと`, `After line ${i + 1}`);
    if (i === heroItems.length - 1) FX.flap($("b", heroReadout), DATA.hero.values[i]);
    else $("b", heroReadout).textContent = DATA.hero.values[i];
  }
  let heroRun = 0;
  let heroVisible = false;
  async function playHero() {
    const run = ++heroRun;
    heroItems.forEach((li) => li.classList.remove("on", "shown"));
    if (reduced) {
      heroItems.forEach((li) => li.classList.add("shown"));
      showReadout(heroItems.length - 1);
      return;
    }
    await wait(400);
    for (let i = 0; i < heroItems.length; i += 1) {
      if (run !== heroRun) return;
      heroItems.forEach((li, j) => li.classList.toggle("on", j === i));
      heroItems[i].classList.add("shown");
      if (i === heroItems.length - 1) FX.flap($(".val", heroItems[i]), DATA.hero.values[i]);
      showReadout(i);
      await wait(i === heroItems.length - 1 ? 300 : 950);
    }
    if (run !== heroRun) return;
    const lastVal = $(".val", heroItems[heroItems.length - 1]);
    burstAt(lastVal.offsetParent ? lastVal : $("b", heroReadout), 0.5);
    await wait(3200);
    if (run === heroRun && heroVisible) playHero();
  }
  whenVisible($(".hero-demo"), () => { if (!heroVisible) { heroVisible = true; playHero(); } }, () => { heroVisible = false; heroRun += 1; });
  $("#heroReplay").addEventListener("click", () => { heroVisible = true; playHero(); });

  /* ---------- ribbon ---------- */
  const WORDS = [">>", "Map", "Filter", "Sort", "Fork", "Check", "Loop", "Try", "Catch", "Use", "Expect", ">?>", ">!>", "pop", "Reduce", "Group", "Update", "Zip", "@"];
  $("#ribbon").innerHTML = [...WORDS, ...WORDS].map((w) => `<span>${esc(w)}</span>`).join("");

  /* ---------- 01 rules ---------- */
  const RULES = EN ? [
    { sym: ">>", title: "Pass the value right", text: "" },
    { sym: ".", title: "End with a period", text: "" },
    { sym: ":", title: "Longer work: colon and indent", text: "" },
  ] : [
    { sym: ">>", title: "値を、右へ渡す", text: "" },
    { sym: ".", title: "文は、ピリオドで終わる", text: "" },
    { sym: ":", title: "長い処理は、: と字下げ", text: "" },
  ];
  $("#ruleGrid").innerHTML = RULES.map((rule, i) => `
    <article class="rule-card reveal">
      <span class="rule-sym" aria-hidden="true">${esc(rule.sym)}</span>
      <h3>${esc(rule.title)}</h3>
      <pre class="code">${highlight(DATA.rules[i].code)}</pre>
      <div class="rule-run">
        <button class="btn btn-small btn-paper" type="button" data-rule="${i}"><svg aria-hidden="true"><use href="#i-play"/></svg>${L("実行", "Run")}</button>
        <output class="rule-out" id="ruleOut${i}"></output>
      </div>
    </article>`).join("");
  $$("#ruleGrid .reveal").forEach((el) => (revealer ? revealer.observe(el) : el.classList.add("in")));
  $("#ruleGrid").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-rule]");
    if (!button) return;
    const i = Number(button.dataset.rule);
    const out = $(`#ruleOut${i}`);
    const text = DATA.rules[i].output;
    out.classList.remove("done");
    out.textContent = "";
    if (!reduced) {
      for (let k = 1; k <= text.length; k += 1) {
        out.textContent = text.slice(0, k);
        await wait(28);
      }
    }
    out.textContent = text;
    out.classList.add("done");
  });

  /* ---------- 02 reading order ---------- */
  const ORDER = {
    nested: [["sum", 4, "fn"], ["(", 0], ["map", 3, "fn"], ["(double, ", 0], ["filter", 2, "fn"], ["(is_even, ", 0], ["nums", 1], [")))", 0]],
    pop: [["nums", 1], [" ", 0], [">>", 0, "pipe"], [" ", 0], ["Filter IsEven", 2, "fn"], [" ", 0], [">>", 0, "pipe"], [" ", 0], ["Map Double", 3, "fn"], [" ", 0], [">>", 0, "pipe"], [" ", 0], ["Sum", 4, "fn"], [".", 0]],
  };
  function renderOrder(box, parts) {
    box.innerHTML = `<svg class="path" aria-hidden="true"><defs><marker id="arrow-${box.id}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#ff4f8b" stroke="none"/></marker></defs><path d=""/></svg>`
      + parts.map(([text, order, kind]) => {
        const inner = kind ? `<span class="t-${kind}">${esc(text)}</span>` : esc(text);
        return order ? `<span class="tok" data-order="${order}">${inner}</span>` : inner;
      }).join("")
      + [1, 2, 3, 4].map((n) => `<span class="order-num" data-num="${n}" aria-hidden="true">${n}</span>`).join("");
  }
  const orderNested = $("#orderNested");
  const orderPop = $("#orderPop");
  renderOrder(orderNested, ORDER.nested);
  renderOrder(orderPop, ORDER.pop);

  function placeOrder(box, upto) {
    const points = [];
    for (let n = 1; n <= 4; n += 1) {
      const tok = $(`.tok[data-order="${n}"]`, box);
      const badge = $(`.order-num[data-num="${n}"]`, box);
      const x = tok.offsetLeft + tok.offsetWidth / 2;
      const y = tok.offsetTop - 18;
      badge.style.left = `${x}px`;
      badge.style.top = `${y - 13}px`;
      badge.classList.toggle("on", n <= upto);
      tok.classList.toggle("lit", n === upto);
      points.push([x, y]);
    }
    const svg = $("svg.path", box);
    svg.setAttribute("width", box.scrollWidth);
    svg.setAttribute("height", box.scrollHeight);
    let d = "";
    for (let n = 1; n < Math.min(upto, 4); n += 1) {
      const [x1, y1] = points[n - 1];
      const [x2, y2] = points[n];
      const dir = Math.sign(x2 - x1) || 1;
      const sx = x1 + dir * 15;
      const ex = x2 - dir * 15;
      const lift = Math.min(26, 8 + Math.abs(ex - sx) * 0.12);
      d += `M${sx} ${y1} Q${(sx + ex) / 2} ${Math.min(y1, y2) - lift} ${ex} ${y2} `;
    }
    const path = $("path:not(marker path)", svg);
    path.setAttribute("d", d.trim());
    path.setAttribute("marker-end", d ? `url(#arrow-${box.id})` : "");
  }
  let orderStep = 0;
  let orderRun = 0;
  const relayoutOrder = () => { placeOrder(orderNested, orderStep); placeOrder(orderPop, orderStep); };
  window.addEventListener("resize", relayoutOrder);
  if (document.fonts?.ready) document.fonts.ready.then(relayoutOrder);
  relayoutOrder();
  $("#orderPlay").addEventListener("click", async (event) => {
    const run = ++orderRun;
    burstAt(event.currentTarget, 0.8);
    track("pc_lp_order");
    $("#orderResult").textContent = "";
    for (let n = 1; n <= 4; n += 1) {
      orderStep = n;
      relayoutOrder();
      await wait(reduced ? 0 : 750);
      if (run !== orderRun) return;
    }
    $("#orderResult").textContent = L(`どちらも ${DATA.order.output}`, `Both give ${DATA.order.output}`);
  });

  /* ---------- 03 lab ---------- */
  const STAGES = new Map(DATA.lab.stages.map((stage) => [stage.id, stage]));
  const GROUPS = [["pick", L("えらぶ", "Pick")], ["change", L("かえる", "Change")], ["order", L("ならべる", "Arrange")], ["fold", L("まとめる", "Combine")]];
  const MAX_STAGES = 6;
  const BALL_COLORS = ["#ffffff", "#fff1b8", "#ffd9e7", "#c9f3e4", "#d7e5ff", "#ffe2c2", "#ecf9b8", "#e6ddff", "#cdf3fb", "#ffe9b0"];
  const lab = { source: DATA.lab.source.slice(), stages: ["even", "double", "sum"] };

  function pyMod(a, b) { return a - b * Math.trunc(a / b); }

  function applyStage(stage, value) {
    if (!Array.isArray(value)) return { error: stage.numError };
    const v = value;
    switch (stage.id) {
      case "even": return { value: v.filter((x) => pyMod(x, 2) === 0), dropped: v.filter((x) => pyMod(x, 2) !== 0) };
      case "big": return { value: v.filter((x) => x > 4), dropped: v.filter((x) => !(x > 4)) };
      case "double": return { value: v.map((x) => x * 2) };
      case "inc": return { value: v.map((x) => x + 1) };
      case "square": return { value: v.map((x) => x * x) };
      case "sort": return { value: v.slice().sort((a, b) => a - b) };
      case "desc": return { value: v.slice().sort((a, b) => b - a) };
      case "reverse": return { value: v.slice().reverse() };
      case "unique": {
        const kept = [];
        const dropped = [];
        for (const x of v) (kept.includes(x) ? dropped : kept).push(x);
        return { value: kept, dropped };
      }
      case "top3": return { value: v.slice(0, 3), dropped: v.slice(3) };
      case "sum": return { value: v.reduce((a, b) => a + b, 0) };
      case "max": return v.length ? { value: Math.max(...v) } : { error: stage.emptyError };
      case "min": return v.length ? { value: Math.min(...v) } : { error: stage.emptyError };
      case "length": return { value: v.length };
      case "average": return v.length ? { value: v.reduce((a, b) => a + b, 0) / v.length } : { error: stage.emptyError };
      default: return { error: "RuntimeError: unknown stage" };
    }
  }

  function labCode() {
    const head = fmt(lab.source);
    const steps = lab.stages.map((id) => STAGES.get(id).code);
    if (steps.length < 2) return `${[head, ...steps, "result."].join(" >> ")}\n\nresult >> Display.`;
    return `${head}\n${steps.map((s) => `    >> ${s}`).join("\n")}\n    >> result.\n\nresult >> Display.`;
  }

  function balls(value, index) {
    if (Array.isArray(value)) {
      if (!value.length) return `<span class="ball-empty" style="--i:${index}">[]${L("（空っぽ）", " (empty)")}</span>`;
      return value.map((x, j) => `<span class="ball" style="--i:${index};--j:${j};--b:${BALL_COLORS[Math.abs(Math.round(x)) % BALL_COLORS.length]}">${esc(fmt(x))}</span>`).join("");
    }
    return `<span class="ball big" style="--i:${index}">${esc(fmt(value))}</span>`;
  }

  function renderPalette() {
    const full = lab.stages.length >= MAX_STAGES;
    $("#labPalette").innerHTML = GROUPS.map(([group, name]) => `
      <div class="pal-group">
        <h4>${name}</h4>
        ${DATA.lab.stages.filter((s) => s.group === group).map((s) => `
          <button class="blk g-${group}" type="button" data-add="${s.id}" ${full ? "disabled" : ""} title="${esc(L(`${s.code} を足す`, `Add ${s.code}`))}"><code>${esc(s.code)}</code>${esc(s.label)}</button>`).join("")}
      </div>`).join("");
  }

  function renderLab(animateFrom = 0) {
    const track = $("#labTrack");
    let value = lab.source;
    let failed = false;
    const items = [];
    items.push(`
      <li class="st st-source" style="--i:0">
        <div class="st-head"><span class="st-name">${L("はじめの値", "Start")}</span><div class="st-tools"><button type="button" id="labShuffle" class="die" title="${L("サイコロをふる", "Roll the die")}" aria-label="${L("サイコロをふって、数を作り直す", "Roll the die for new numbers")}">${FX.dieHtml(Math.min(6, Math.max(1, value.length)))}</button></div></div>
        <div class="st-out">${balls(value, 0)}</div>
      </li>`);
    if (!lab.stages.length) {
      items.push(`<li class="pipe-link" aria-hidden="true"><span>&gt;&gt;</span></li><li class="st-empty">${L("上のブロックをタップして、ここにつなごう", "Tap a block above to connect it here")}</li>`);
    }
    lab.stages.forEach((id, k) => {
      const stage = STAGES.get(id);
      const i = k + 1;
      items.push(`<li class="pipe-link" aria-hidden="true"><span>&gt;&gt;</span></li>`);
      const tools = `<div class="st-tools">
          <button type="button" data-move="${k}" data-dir="-1" aria-label="${L("左へ", "Move left")}" ${k === 0 ? "disabled" : ""}>←</button>
          <button type="button" data-move="${k}" data-dir="1" aria-label="${L("右へ", "Move right")}" ${k === lab.stages.length - 1 ? "disabled" : ""}>→</button>
          <button type="button" class="rm" data-remove="${k}" aria-label="${L("外す", "Remove")}">×</button>
        </div>`;
      if (failed) {
        items.push(`<li class="st g-${stage.group} off" style="--i:${i}" data-index="${k}" draggable="true">
          <div class="st-head"><code>${esc(stage.code)}</code>${tools}</div>
          <span class="st-name">${esc(stage.label)}</span>
          <span class="st-off">${L("エラーで止まったので、ここは動きません", "The error stopped the flow, so this step doesn't run")}</span>
        </li>`);
        return;
      }
      const result = applyStage(stage, value);
      if (result.error) {
        failed = true;
        const hint = Array.isArray(value)
          ? L("空っぽのリストからは、選べません", "There's nothing to pick from an empty list.")
          : L("数になったあとは、リスト用のブロックをつなげません", "Once it's a single number, list blocks can't follow.");
        items.push(`<li class="st g-${stage.group} err" style="--i:${i}" data-index="${k}" draggable="true">
          <div class="st-head"><code>${esc(stage.code)}</code>${tools}</div>
          <p class="st-err">${esc(localize(result.error))}</p>
          <p class="st-hint">${hint}</p>
        </li>`);
        return;
      }
      value = result.value;
      const drop = result.dropped && result.dropped.length
        ? `<div class="st-drop">${stage.id === "unique" ? L("消えた", "Removed") : stage.id === "top3" ? L("入らなかった", "Left out") : L("えらばれなかった", "Not picked")} ${result.dropped.map((x, j) => `<span class="ball" style="--i:${i};--j:${j};--b:${BALL_COLORS[Math.abs(x) % BALL_COLORS.length]}">${esc(fmt(x))}</span>`).join("")}</div>`
        : "";
      items.push(`<li class="st g-${stage.group}" style="--i:${i}" data-index="${k}" draggable="true">
        <div class="st-head"><code>${esc(stage.code)}</code>${tools}</div>
        <span class="st-name">${esc(stage.label)}</span>
        <div class="st-out">${balls(value, i)}</div>
        ${drop}
      </li>`);
    });
    const last = lab.stages.length + 1;
    items.push(`<li class="pipe-link" aria-hidden="true"><span>&gt;&gt;</span></li>`);
    items.push(`<li class="st st-result" style="--i:${last}">
      <div class="st-head"><code>result.</code></div>
      <span class="st-name">${failed ? L("エラーで止まりました", "Stopped by an error") : L("名前を付けて、できあがり", "Named. Done!")}</span>
      <div class="st-out">${failed ? '<span class="ball big">—</span>' : Array.isArray(value) ? balls(value, last) : '<span class="flap" id="labFlap"></span>'}</div>
    </li>`);
    track.innerHTML = items.join("");
    track.querySelectorAll(".st").forEach((el) => {
      const i = Number(el.style.getPropertyValue("--i"));
      if (i < animateFrom) el.style.setProperty("--i", "-50");
      else el.style.setProperty("--i", String(i - animateFrom));
    });
    $$(".ball, .ball-empty", track).forEach((b) => {
      const st = b.closest(".st");
      if (st) b.style.setProperty("--i", st.style.getPropertyValue("--i"));
    });
    track.classList.remove("flow");
    if (!reduced) {
      void track.offsetWidth;
      track.classList.add("flow");
    }
    const flapEl = $("#labFlap");
    if (flapEl) FX.flap(flapEl, fmt(value), { delay: reduced ? 0 : Math.max(0, last - animateFrom) * 420 });
    const code = labCode();
    $("#labCode").innerHTML = highlight(code);
    $("#labOpen").href = playgroundUrl(code);
    renderPalette();
  }

  $("#labPresets").innerHTML = DATA.lab.presets.map((p, i) => `<button class="chip" type="button" data-preset="${i}">${esc(p.label)}</button>`).join("");
  $("#labPresets").addEventListener("click", (event) => {
    const chip = event.target.closest("[data-preset]");
    if (!chip) return;
    lab.stages = DATA.lab.presets[Number(chip.dataset.preset)].stages.slice();
    track("pc_lp_lab_preset", chip.textContent);
    renderLab(0);
    burstAt(chip, 0.7);
  });
  $("#labPalette").addEventListener("click", (event) => {
    const button = event.target.closest("[data-add]");
    if (!button || lab.stages.length >= MAX_STAGES) return;
    lab.stages.push(button.dataset.add);
    track("pc_lp_lab_add", button.dataset.add);
    renderLab(lab.stages.length);
    burstAt(button, 0.6);
    if (lab.stages.length >= MAX_STAGES) toast(L(`ブロックは ${MAX_STAGES} こまでです`, `Up to ${MAX_STAGES} blocks`));
  });
  let labBusy = false;
  $("#labTrack").addEventListener("click", async (event) => {
    const remove = event.target.closest("[data-remove]");
    const move = event.target.closest("[data-move]");
    const shuffle = event.target.closest("#labShuffle");
    if (labBusy && (remove || shuffle)) return;
    if (remove) {
      const k = Number(remove.dataset.remove);
      labBusy = true;
      await dust(remove.closest(".st"));
      labBusy = false;
      lab.stages.splice(k, 1);
      renderLab(k + 1);
    } else if (move) {
      const k = Number(move.dataset.move);
      const to = k + Number(move.dataset.dir);
      if (to < 0 || to >= lab.stages.length) return;
      [lab.stages[k], lab.stages[to]] = [lab.stages[to], lab.stages[k]];
      renderLab(Math.min(k, to) + 1);
    } else if (shuffle) {
      const n = 3 + Math.floor(Math.random() * 4);
      labBusy = true;
      track("pc_lp_lab_dice", n);
      await FX.rollDie(shuffle, n);
      labBusy = false;
      burstAt(shuffle, 0.5);
      lab.source = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 9));
      renderLab(0);
    }
  });
  let dragFrom = -1;
  $("#labTrack").addEventListener("dragstart", (event) => {
    const st = event.target.closest(".st[data-index]");
    if (!st) return;
    dragFrom = Number(st.dataset.index);
    st.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(dragFrom));
  });
  $("#labTrack").addEventListener("dragover", (event) => {
    const st = event.target.closest(".st[data-index]");
    if (!st || dragFrom < 0) return;
    event.preventDefault();
    $$(".drop-target").forEach((el) => el !== st && el.classList.remove("drop-target"));
    st.classList.add("drop-target");
  });
  $("#labTrack").addEventListener("drop", (event) => {
    const st = event.target.closest(".st[data-index]");
    if (!st || dragFrom < 0) return;
    event.preventDefault();
    const to = Number(st.dataset.index);
    const [moved] = lab.stages.splice(dragFrom, 1);
    lab.stages.splice(to, 0, moved);
    const from = Math.min(dragFrom, to);
    dragFrom = -1;
    renderLab(from + 1);
  });
  $("#labTrack").addEventListener("dragend", () => {
    dragFrom = -1;
    $$(".dragging, .drop-target").forEach((el) => el.classList.remove("dragging", "drop-target"));
  });
  $("#labReplay").addEventListener("click", (event) => { renderLab(0); burstAt(event.currentTarget, 0.5); });
  const clearBtn = $("#labClear");
  const HOLD_MS = 750;
  let holdTimer = 0;
  async function clearAll() {
    if (labBusy) return;
    if (!lab.stages.length) { toast(L("外すブロックがありません", "No blocks to remove"), "info", 1600); return; }
    labBusy = true;
    track("pc_lp_lab_clear");
    const cards = $$("#labTrack .st[data-index]");
    await Promise.all(cards.map((card, i) => wait(i * 80).then(() => dust(card))));
    labBusy = false;
    lab.stages = [];
    renderLab(0);
  }
  function holdStop() {
    clearTimeout(holdTimer);
    holdTimer = 0;
    clearBtn.classList.remove("holding");
    clearBtn.style.setProperty("--hold", "0");
  }
  clearBtn.style.setProperty("--hold-ms", `${HOLD_MS}ms`);
  clearBtn.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    clearBtn.classList.add("holding");
    clearBtn.style.setProperty("--hold", "1");
    holdTimer = setTimeout(() => { holdStop(); clearAll(); }, HOLD_MS);
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach((type) => clearBtn.addEventListener(type, () => {
    if (!holdTimer) return;
    holdStop();
    toast(L("長押しすると、ぜんぶ外せます", "Press and hold to remove them all"), "info", 1800);
  }));
  clearBtn.addEventListener("click", (event) => { if (event.detail === 0) clearAll(); });
  clearBtn.addEventListener("contextmenu", (event) => event.preventDefault());
  $("#labOpen").addEventListener("click", () => track("pc_lp_open", "lab"));
  renderLab(0);
  let labSeen = false;
  whenVisible($("#labTrack"), () => { if (!labSeen) { labSeen = true; renderLab(0); } });

  /* ---------- 04 fizzbuzz ---------- */
  const fbLines = DATA.fizzbuzz.code.split("\n");
  $("#fbCode").innerHTML = fbLines.map((line, i) => `<span class="ln" data-ln="${i}">${highlight(line) || " "}</span>`).join("");
  const BRANCHES = [{ k: 15, line: 2, word: "FizzBuzz", cls: "fb" }, { k: 3, line: 3, word: "Fizz", cls: "f" }, { k: 5, line: 4, word: "Buzz", cls: "b" }];
  const ELSE_LINE = 5;
  function fizz(n) {
    const hit = BRANCHES.find((b) => n % b.k === 0);
    return hit ? { word: hit.word, cls: hit.cls } : { word: String(n), cls: "n" };
  }
  const expectedFb = JSON.parse(DATA.fizzbuzz.output);
  $("#fbTiles").innerHTML = Array.from({ length: 30 }, (_, i) => {
    const n = i + 1;
    const r = fizz(n);
    const shown = expectedFb[i];
    const label = typeof shown === "string" ? shown : "";
    return `<button class="tile ${r.cls}" type="button" data-n="${n}" aria-pressed="false" aria-label="${n}${L("：", ": ")}${typeof shown === "string" ? shown : L("そのまま", "the number")}"><span>${n}${label ? `<small>${esc(label)}</small>` : ""}</span></button>`;
  }).join("");
  let fbRun = 0;
  let fbAuto = false;
  async function traceFizz(n, quick = false) {
    const run = ++fbRun;
    $$("#fbTiles .tile").forEach((t) => t.setAttribute("aria-pressed", String(Number(t.dataset.n) === n)));
    $$("#fbCode .ln").forEach((l) => l.classList.remove("hit", "miss"));
    const trace = $("#fbTrace");
    trace.innerHTML = `<div class="q">${L(`n = ${n} のとき、上から調べます`, `n = ${n}: checking from the top`)}</div>`;
    const step = quick || reduced ? 0 : 260;
    for (const b of BRANCHES) {
      await wait(step);
      if (run !== fbRun) return;
      const ok = n % b.k === 0;
      $(`#fbCode .ln[data-ln="${b.line}"]`).classList.add(ok ? "hit" : "miss");
      trace.insertAdjacentHTML("beforeend", `<div>${n} % ${b.k} == 0 → <span class="${ok ? "t" : "f"}">${ok}</span></div>`);
      if (ok) {
        trace.insertAdjacentHTML("beforeend", '<span class="ans">→<span class="flap"></span></span>');
        FX.flap($(".ans .flap", trace), `"${b.word}"`, { quick });
        return;
      }
    }
    await wait(step);
    if (run !== fbRun) return;
    $(`#fbCode .ln[data-ln="${ELSE_LINE}"]`).classList.add("hit");
    trace.insertAdjacentHTML("beforeend", `<div class="q">${L("どれにも合わないので else", "No match, so else")}</div><span class="ans">→<span class="flap"></span></span>`);
    FX.flap($(".ans .flap", trace), String(n), { quick });
  }
  $("#fbTiles").addEventListener("click", (event) => {
    const tile = event.target.closest(".tile");
    if (!tile) return;
    stopFbAuto();
    traceFizz(Number(tile.dataset.n));
    track("pc_lp_fizz");
  });
  function stopFbAuto() {
    fbAuto = false;
    $("#fbPlay").lastChild.textContent = L("1 から順に", "Count from 1");
  }
  $("#fbPlay").addEventListener("click", async () => {
    if (fbAuto) { stopFbAuto(); return; }
    fbAuto = true;
    $("#fbPlay").lastChild.textContent = L("止める", "Stop");
    for (let n = 1; n <= 30 && fbAuto; n += 1) {
      traceFizz(n, true);
      const tile = $(`#fbTiles .tile[data-n="${n}"]`);
      if (fizz(n).cls !== "n") burstAt(tile, 0.35);
      await wait(reduced ? 300 : 520);
    }
    stopFbAuto();
  });
  traceFizz(15, true);

  /* ---------- 05 tools ---------- */
  const tabs = $$("#toolTabs [role=tab]");
  function selectTab(tab, focus = false) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      $(`#${t.getAttribute("aria-controls")}`).hidden = !on;
    });
    if (focus) tab.focus();
    track("pc_lp_tool", tab.id.replace("tab-", ""));
  }
  $("#toolTabs").addEventListener("click", (event) => {
    const tab = event.target.closest("[role=tab]");
    if (tab) selectTab(tab);
  });
  $("#toolTabs").addEventListener("keydown", (event) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let next = -1;
    if (event.key === "ArrowRight") next = (i + 1) % tabs.length;
    if (event.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next >= 0) { event.preventDefault(); selectTab(tabs[next], true); }
  });

  // >?>
  const peek = DATA.peek;
  const peekOn = peek.parts.slice(1).map((_, i) => i === 1);
  function renderPeek() {
    let html = `<span class="seg">${highlight(peek.parts[0])}</span>`;
    peek.parts.slice(1).forEach((part, i) => {
      html += ` <button class="peek-op" type="button" data-op="${i}" aria-pressed="${peekOn[i]}" aria-label="${L(`${i + 1} 番目の >> を ${peekOn[i] ? ">>" : ">?>"} にする`, `Make operator ${i + 1} ${peekOn[i] ? ">>" : ">?>"}`)}">${peekOn[i] ? "&gt;?&gt;" : "&gt;&gt;"}</button> <span class="seg">${highlight(part)}</span>`;
    });
    $("#peekCode").innerHTML = html;
    const lines = peek.lines.filter((_, i) => peekOn[i]);
    $("#peekOut").innerHTML = lines.length
      ? lines.map((l) => `<span class="warn">${esc(l.slice(0, l.indexOf("]") + 1))}</span>${esc(l.slice(l.indexOf("]") + 1))}`).join("\n")
      : `<span class="dim">${L("（&gt;&gt; をタップ）", "(Tap a &gt;&gt;)")}</span>`;
  }
  $("#peekCode").addEventListener("click", (event) => {
    const op = event.target.closest("[data-op]");
    if (!op) return;
    const i = Number(op.dataset.op);
    peekOn[i] = !peekOn[i];
    renderPeek();
    const again = $(`[data-op="${i}"]`, $("#peekCode"));
    again.focus();
    burstAt(again, 0.4);
  });
  renderPeek();

  // >!>
  const fallback = DATA.fallback;
  $("#fallbackCode").innerHTML = highlight(fallback.code);
  $("#fallbackChips").innerHTML = fallback.samples.map((s) => `<button class="chip" type="button" data-sample="${esc(s.input)}"><code>${esc(JSON.stringify(s.input))}</code></button>`).join("");
  const PY_SPACE = "[\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]";
  const PY_STRIP = new RegExp(`^${PY_SPACE}+|${PY_SPACE}+$`, "g");
  const NUM_RE = /^[+-]?(?:\p{Nd}+(?:\.\p{Nd}*)?|\.\p{Nd}+)$/u;
  function toNum(text) {
    if (!NUM_RE.test(text)) return { error: `TypeError: Cannot cast '${text}' (Str) to Num` };
    const value = Number(text.normalize("NFKC"));
    if (Number.isNaN(value)) return { error: `TypeError: Cannot cast '${text}' (Str) to Num` };
    if (!Number.isFinite(value)) return { error: "RuntimeError: Numeric result is NaN or Infinity" };
    return { value: value === 0 ? 0 : value };
  }
  function renderFallback() {
    const text = $("#fallbackInput").value;
    const trimmed = text.replace(PY_STRIP, "");
    const num = toNum(trimmed);
    const age = num.error ? 0 : num.value;
    $$("#fallbackChips .chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.sample === text)));
    $("#fallbackFlow").innerHTML = `
      <span class="ff-step">${esc(JSON.stringify(text))}</span><span class="ff-arrow">&gt;&gt;</span>
      <span class="ff-step">Trim → ${esc(JSON.stringify(trimmed))}</span><span class="ff-arrow">&gt;&gt;</span>
      <span class="ff-step ${num.error ? "bad" : ""}">Num → ${num.error ? "💥" : esc(String(num.value))}</span><span class="ff-arrow">&gt;!&gt;</span>
      <span class="ff-step ${num.error ? "swap" : "skip"}">0</span><span class="ff-arrow">&gt;&gt;</span>
      <span class="ff-step swap">age = ${esc(String(age))}</span>
      <p class="ff-note">${num.error
        ? `<span class="err">${esc(localize(num.error))}</span><br>${L("エラー → <code>0</code> に差し替え", "Error → swapped to <code>0</code>")}`
        : L("エラーなし", "No error")}</p>`;
  }
  $("#fallbackInput").maxLength = 24;
  $("#fallbackInput").addEventListener("input", renderFallback);
  $("#fallbackChips").addEventListener("click", (event) => {
    const chip = event.target.closest("[data-sample]");
    if (!chip) return;
    $("#fallbackInput").value = chip.dataset.sample;
    renderFallback();
  });
  renderFallback();

  // Fork
  const forkNums = [3, 8, 4];
  $("#forkInputs").innerHTML = forkNums.map((n, i) => `
    <span class="num-step"><button type="button" data-fork="${i}" data-d="-1" aria-label="${L(`${i + 1} 番目を 1 へらす`, `Decrease number ${i + 1}`)}">−</button><output id="forkN${i}">${n}</output><button type="button" data-fork="${i}" data-d="1" aria-label="${L(`${i + 1} 番目を 1 ふやす`, `Increase number ${i + 1}`)}">＋</button></span>`).join("");
  function renderFork(changed = false) {
    const total = forkNums.reduce((a, b) => a + b, 0);
    const avg = total / forkNums.length;
    const spread = Math.max(...forkNums) - Math.min(...forkNums);
    $("#forkCode").innerHTML = highlight(`${fmt(forkNums)} >> Fork(Sum, Average, Max - Min) >> (total, avg, spread).`);
    $("#forkTree").innerHTML = [["Sum", "total", total], ["Average", "avg", avg], ["Max - Min", "spread", spread]]
      .map(([code, name, v]) => `<div class="fork-leaf${changed ? " bump" : ""}"><code>${code}</code><b>${esc(fmt(v))}</b><span>${name}</span></div>`).join("");
    $$("#forkTree .fork-leaf").forEach((leaf) => leaf.style.setProperty("--n", String(Math.max(4, $("b", leaf).textContent.length))));
  }
  $("#forkInputs").addEventListener("click", (event) => {
    const b = event.target.closest("[data-fork]");
    if (!b) return;
    const i = Number(b.dataset.fork);
    forkNums[i] = Math.max(0, Math.min(99, forkNums[i] + Number(b.dataset.d)));
    $(`#forkN${i}`).textContent = String(forkNums[i]);
    renderFork(true);
  });
  renderFork();

  // Test
  const tests = DATA.tests;
  function colorTest(text) {
    return esc(text).split("\n").map((line) => {
      if (/✓/.test(line)) return `<span class="ok">${line}</span>`;
      if (/✗|期待した値と/.test(line)) return `<span class="ng">${line}</span>`;
      if (/^結果/.test(line)) return `<span class="${/失敗/.test(line) ? "ng" : "ok"}">${line}</span>`;
      if (/ヒント/.test(line)) return `<span class="warn">${line}</span>`;
      return line;
    }).join("\n");
  }
  let testRun = 0;
  async function renderTest(animate) {
    const run = ++testRun;
    const bug = $("#testBug").checked;
    const code = bug ? tests.bad : tests.good;
    $("#testCode").innerHTML = code.split("\n").map((line, i) => (i === 1 && bug
      ? `<span class="errmark">${highlight(line)}</span>`
      : highlight(line))).join("\n");
    const out = $("#testOut");
    const prompt = `<span class="dim">$ popcorn test ${tests.file}</span>\n`;
    const body = colorTest(bug ? tests.badOutput : tests.goodOutput).split("\n");
    if (!animate || reduced) { out.innerHTML = prompt + body.join("\n"); return; }
    out.innerHTML = prompt;
    for (const line of body) {
      await wait(110);
      if (run !== testRun) return;
      out.innerHTML += `${line}\n`;
    }
  }
  $("#testBug").addEventListener("change", () => renderTest(true));
  renderTest(false);

  // Errors
  const errors = DATA.errors;
  $("#errorChips").innerHTML = [`<button class="chip" type="button" data-err="" aria-pressed="true">${L("正しいコード", "Correct code")}</button>`]
    .concat(errors.cases.map((c) => `<button class="chip" type="button" data-err="${c.id}" aria-pressed="false">${esc(c.label)}</button>`)).join("");
  function renderError(id) {
    const c = errors.cases.find((x) => x.id === id);
    $$("#errorChips .chip").forEach((chip) => chip.setAttribute("aria-pressed", String(chip.dataset.err === (id || ""))));
    const code = c ? c.code : errors.base;
    $("#errorCode").innerHTML = code.split("\n").map((line, i) => {
      if (!c || c.mark[0] !== i) return highlight(line);
      const [, s, e] = c.mark;
      return `${highlight(line.slice(0, s))}<span class="errmark">${esc(line.slice(s, e))}</span>${c.insert ? `<span class="errins">${esc(c.insert)}</span>` : ""}${highlight(line.slice(e))}`;
    }).join("\n");
    $("#errorOut").innerHTML = `<span class="dim">$ popcorn main.pop</span>\n${c ? `<span class="ng">${esc(localize(c.error))}</span>` : esc(errors.output)}`;
  }
  $("#errorChips").addEventListener("click", (event) => {
    const chip = event.target.closest("[data-err]");
    if (chip) renderError(chip.dataset.err);
  });
  renderError("");

  /* ---------- 06 try (real interpreter) ---------- */
  const editor = $("#tryEditor");
  const hl = $("#tryHighlight");
  const consoleEl = $("#tryConsole");
  const status = $("#tryStatus");
  let worker = null;
  let ready = false;
  let running = false;
  let pendingRun = null;
  let currentExample = DATA.examples[0].id;

  function setStatus(state, text) {
    status.dataset.state = state;
    status.textContent = text;
  }
  function syncEditor() {
    hl.innerHTML = `${highlight(editor.value)}\n`;
    $("#tryOpen").href = playgroundUrl(editor.value);
  }
  editor.addEventListener("input", () => { syncEditor(); currentExample = "custom"; });
  editor.addEventListener("scroll", () => {
    const pre = hl.parentElement;
    pre.scrollTop = editor.scrollTop;
    pre.scrollLeft = editor.scrollLeft;
  });
  editor.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      runTry();
      return;
    }
    if (event.key === "Escape") { editor.blur(); return; }
    if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      document.execCommand("insertText", false, "    ") || insertAtCursor("    ");
      return;
    }
    if (event.key === "Enter" && !event.isComposing) {
      const before = editor.value.slice(0, editor.selectionStart);
      const line = before.slice(before.lastIndexOf("\n") + 1);
      const indent = line.match(/^ */)[0] + (/:\s*(\/\/.*)?$/.test(line) ? "    " : "");
      if (indent) {
        event.preventDefault();
        document.execCommand("insertText", false, `\n${indent}`) || insertAtCursor(`\n${indent}`);
      }
    }
  });
  function insertAtCursor(text) {
    const s = editor.selectionStart;
    const e = editor.selectionEnd;
    editor.value = editor.value.slice(0, s) + text + editor.value.slice(e);
    editor.selectionStart = editor.selectionEnd = s + text.length;
    syncEditor();
    return true;
  }
  editor.addEventListener("focus", () => ensureWorker(), { once: true });

  $("#tryExamples").innerHTML = DATA.examples.map((ex) => `
    <button class="ex-btn" type="button" data-ex="${ex.id}" aria-pressed="${ex.id === currentExample}">
      <span class="em" aria-hidden="true">${ex.emoji}</span>${esc(ex.label)}${ex.interactive ? `<small>${L("入力あり", "asks you")}</small>` : ""}
    </button>`).join("");
  function loadExample(id) {
    const ex = DATA.examples.find((e) => e.id === id);
    if (!ex) return;
    currentExample = id;
    editor.value = ex.code;
    editor.scrollTop = 0;
    syncEditor();
    $$("#tryExamples .ex-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ex === id)));
    $("#tryName").textContent = `${id}.pop`;
  }
  $("#tryExamples").addEventListener("click", (event) => {
    const b = event.target.closest("[data-ex]");
    if (!b) return;
    loadExample(b.dataset.ex);
    consoleEl.innerHTML = `<p class="console-hint">${L("「実行」を押す", "Press Run")}</p>`;
  });
  loadExample(currentExample);

  function line(html, cls = "out-line") {
    const el = document.createElement("span");
    el.className = cls;
    el.innerHTML = html;
    consoleEl.appendChild(el);
    consoleEl.scrollTop = consoleEl.scrollHeight;
    return el;
  }

  function ensureWorker() {
    if (worker) return;
    ready = false;
    setStatus("loading", L("準備中…", "Loading…"));
    try {
      worker = new Worker(rootUrl("playground-worker.js"));
    } catch (error) {
      setStatus("error", L("準備できませんでした", "Couldn't load"));
      line(esc(L(`この画面では動きませんでした（${error.message}）`, `Couldn't run it here (${error.message}). Please try the Playground.`)), "out-line out-err");
      worker = null;
      return;
    }
    worker.addEventListener("message", onWorkerMessage);
    worker.addEventListener("error", () => {
      setStatus("error", L("準備できませんでした", "Couldn't load"));
      toast(L("準備できませんでした", "Couldn't load"), "err", 2600);
      finishRun();
      line(L("読み込めませんでした（通信を確かめて、もう一度）", "Couldn't load the runtime. Check your connection and press Run again."), "out-line out-err");
      worker?.terminate();
      worker = null;
    });
  }

  function onWorkerMessage(event) {
    const msg = event.data || {};
    if (msg.type === "ready") {
      ready = true;
      setStatus("ready", L("準備OK", "Ready"));
      if (pendingRun) {
        const src = pendingRun;
        pendingRun = null;
        startRun(src);
      }
    } else if (msg.type === "boot-error") {
      setStatus("error", L("準備できませんでした", "Couldn't load"));
      toast(L("準備できませんでした", "Couldn't load"), "err", 2600);
      finishRun();
      line(esc(L(`読み込めませんでした（${msg.message}）`, `Couldn't load the runtime (${msg.message}). Check your connection and press Run again.`)), "out-line out-err");
      worker?.terminate();
      worker = null;
    } else if (msg.type === "stream") {
      $(".loading-line", consoleEl)?.remove();
      line(esc(msg.text), msg.channel === "stderr" ? "out-line out-err" : "out-line");
    } else if (msg.type === "input") {
      $(".loading-line", consoleEl)?.remove();
      askInput(msg.id, msg.prompt);
    } else if (msg.type === "result") {
      $(".loading-line", consoleEl)?.remove();
      if (!msg.ok && msg.error) line(esc(localize(msg.error)), "out-line out-err");
      const ms = msg.elapsedMs ?? 0;
      line(esc(EN ? `${msg.ok ? "Done" : "Stopped"} (${ms} ms)` : `${msg.ok ? "おわり" : "止まりました"}（${ms} ms）`), "out-line out-meta");
      setStatus(msg.ok ? "done" : "error", msg.ok ? L("できた！", "Done!") : L("エラー", "Error"));
      toast(msg.ok ? L(`できた！ ${ms} ms`, `Done! ${ms} ms`) : L("エラーで止まりました", "Stopped by an error"), msg.ok ? "ok" : "err", 2600);
      if (msg.ok) burstAt($("#tryRun"), 0.6);
      finishRun();
    }
  }

  function askInput(id, prompt) {
    const row = document.createElement("form");
    row.className = "out-input";
    row.innerHTML = `<span>${esc(prompt)}</span><input type="text" aria-label="${esc(prompt || L("入力", "Input"))}" autocomplete="off"><button class="btn btn-small btn-yellow" type="submit">${L("送る", "Send")}</button>`;
    consoleEl.appendChild(row);
    consoleEl.scrollTop = consoleEl.scrollHeight;
    const input = $("input", row);
    input.focus({ preventScroll: true });
    row.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = input.value;
      row.replaceWith(Object.assign(document.createElement("span"), { className: "out-line", textContent: `${prompt}${value}` }));
      worker?.postMessage({ type: "input-result", id, value });
    });
  }

  function finishRun() {
    running = false;
    $("#tryRun").disabled = false;
    $("#tryStop").hidden = true;
  }

  function startRun(source) {
    running = true;
    $("#tryRun").disabled = true;
    $("#tryStop").hidden = false;
    setStatus("running", L("実行中…", "Running…"));
    toast(L("PopCorn を実行中…", "Running PopCorn…"), "run", 0);
    worker.postMessage({ type: "run", source });
  }

  function runTry() {
    if (running) return;
    track("pc_lp_run", currentExample);
    consoleEl.innerHTML = "";
    ensureWorker();
    if (!worker) return;
    $("#tryRun").disabled = true;
    $("#tryStop").hidden = false;
    if (ready) {
      startRun(editor.value);
    } else {
      running = true;
      pendingRun = editor.value;
      const lanes = [[L("Python を起こす", "Waking Python"), "#ffd23f", "1.9s", "0s"], [L("PopCorn を読む", "Reading PopCorn"), "#ff4f8b", "1.4s", ".3s"], [L("ポップの準備", "Heating the pan"), "#2ed3a0", "2.4s", ".15s"]];
      line(`${L("ポップコーンをあたためています…（はじめの 1 回だけ、少し時間がかかります）", "Warming up the popcorn… (only the first run takes a moment)")}<span class="race" aria-hidden="true">${lanes.map(([name, color, dur, delay]) => `<span class="lane"><span>${name}</span><i style="--lc:${color};--ld:${dur};--lw:${delay}"></i></span>`).join("")}</span>`, "out-line out-meta loading-line");
      toast(L("PopCorn を準備中…", "Getting PopCorn ready…"), "run", 0);
    }
  }
  $("#tryRun").addEventListener("click", runTry);
  $("#tryStop").addEventListener("click", () => {
    worker?.terminate();
    worker = null;
    ready = false;
    pendingRun = null;
    finishRun();
    $(".loading-line", consoleEl)?.remove();
    line(L("止めました", "Stopped"), "out-line out-meta");
    toast(L("止めました", "Stopped"), "info", 1600);
    setStatus("idle", L("止めました", "Stopped"));
  });
  $("#tryOpen").addEventListener("click", () => track("pc_lp_open", "try"));

  /* ---------- 07 learn ---------- */
  const robot = $("#robot");
  const bubble = $("#robotBubble");
  const ROBOT_LINES = EN ? [
    "PopCorn reads left to right. That's it!",
    "If you make a mistake, I'll give you a hint.",
    "Learn Map and Filter, and you're a pro!",
    "Errors aren't scary. I'll explain them.",
    "How many kernels have you popped?",
  ] : [
    "PopCorn は、左から右へ読むだけ！",
    "まちがえても、ヒントを出すよ",
    "Map と Filter を覚えたら、もう一人前！",
    "エラーは、こわくないよ",
    "ポップコーン、いくつポップさせた？",
  ];
  let robotLine = 0;
  function say(text) {
    bubble.textContent = text;
    bubble.classList.remove("say");
    void bubble.offsetWidth;
    bubble.classList.add("say");
    robot.classList.remove("happy");
    void robot.offsetWidth;
    robot.classList.add("happy");
  }
  robot.addEventListener("animationend", (event) => { if (event.animationName === "robot-jump") robot.classList.remove("happy"); });
  robot.addEventListener("click", () => {
    say(ROBOT_LINES[robotLine % ROBOT_LINES.length]);
    robotLine += 1;
    burstAt(robot, 0.7);
  });
  $("#lessons").innerHTML = DATA.lessons.map((l, i) => `
    <li><button class="lesson" type="button" data-lesson="${i}" aria-pressed="false"><b>${esc(l.badge)}</b>${esc(l.title)}</button></li>`).join("");
  $("#lessons").addEventListener("click", (event) => {
    const b = event.target.closest("[data-lesson]");
    if (!b) return;
    const l = DATA.lessons[Number(b.dataset.lesson)];
    $$("#lessons .lesson").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    say(EN ? `Lesson ${l.badge}: “${l.title}”. ${l.intro.replace(/`/g, "")}` : `レッスン ${l.badge}「${l.title}」 ${l.intro.replace(/`/g, "")}`);
    track("pc_lp_lesson", l.badge);
  });
  if (!reduced) {
    let raf = 0;
    let robotOn = false;
    whenVisible(robot, () => { robotOn = true; }, () => { robotOn = false; });
    window.addEventListener("pointermove", (event) => {
      if (!robotOn || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = robot.getBoundingClientRect();
        const dx = event.clientX - (r.left + r.width / 2);
        const dy = event.clientY - (r.top + r.height / 2);
        const len = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, len / 220);
        robot.style.setProperty("--ex", `${(dx / len) * 7 * k}px`);
        robot.style.setProperty("--ey", `${(dy / len) * 7 * k}px`);
      });
    }, { passive: true });
  }

  /* ---------- copy ---------- */
  document.addEventListener("click", async (event) => {
    const b = event.target.closest("[data-copy]");
    if (!b) return;
    const text = $(`#${b.dataset.copy}`).textContent;
    try {
      await navigator.clipboard.writeText(text);
      toast(L("コピーしました", "Copied"), "ok", 1800);
    } catch {
      toast(L("コピーできませんでした", "Couldn't copy"), "err");
    }
  });

  /* ---------- finale：札とポップコーンが弾ける ---------- */
  const PIT_WORDS = [">>", "Map", "Filter", "Sum", "Sort", "Fork", "Check", "pop", "@", ">?>", ">!>", "Test", "Loop", "when", "Display", ".", "Reduce", "Expect"];
  const PIT_COLORS = ["#ffd23f", "#ff4f8b", "#2ed3a0", "#ffffff", "#9ec2ff", "#ffb35c"];
  const pitItems = [
    ...PIT_WORDS.map((text, i) => ({ kind: "tag", text, color: PIT_COLORS[i % PIT_COLORS.length] })),
    ...Array.from({ length: 18 }, () => ({ kind: "pop" })),
  ];
  const finale = $("#finale");
  finale.setAttribute("data-nopop", "");
  const pitApi = FX.pit(finale, {
    items: pitItems,
    obstacles: () => [$(".finale-kicker"), $(".finale h2"), $("#finaleBtn"), $("#finaleHint")],
    onPop: (x, y) => burst(x, y, 0.25),
  });
  if (pitApi) {
    $("#finaleHint").hidden = false;
    if (document.fonts?.ready) document.fonts.ready.then(() => pitApi.measure());
  }

  ["#labTrack", "#labCode", ".tool-box"].forEach((selector) => smoothHeight($(selector)));

  if (window.PopGames) {
    window.PopGames.init({
      esc, highlight, localize, playgroundUrl, playSound, track, store, smoothHeight, reduced,
      popImg: () => FX.popImg(),
    });
  }

  $$('a[href$="playground/"]').forEach((a) => a.addEventListener("click", () => track("pc_lp_cta", a.closest("section, header, footer")?.id || "nav")));
})();
