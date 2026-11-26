/* 紹介サイトのミニゲーム。ぜんぶ、PopCorn の学びになる。
 * - rhythm : リズムに合わせて、プログラムを 1 つずつ打つ
 * - quiz   : 出力を当てる
 * - bugs   : エラーを読んで、直す
 * - puzzle : 読む順に、カードを並べる
 * 問題は lp/games-data.js にあり、出力とエラーは、本物の PopCorn で確かめている（tests/test_landing_page_games.py）。
 */
(() => {
  "use strict";

  const DATA = window.POPCORN_GAMES;
  const EN = document.documentElement.lang === "en";
  const L = (ja, en) => (EN ? en : ja);
  const tx = (v) => (v && typeof v === "object" ? (EN ? v.en : v.ja) : v);
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const KEY = "popcorn.lp.games";
  const SLOW_KEY = "popcorn.lp.games.slow";

  let api = null;
  let root = null;
  let bodyEl = null;
  let nameEl = null;
  let backEl = null;
  let actions = {};
  let cleanup = () => {};
  let lastFocus = null;
  let inerts = [];
  let inviteEl = null;
  let invited = false;

  const esc = (t) => api.esc(t);
  const readBest = () => { try { return JSON.parse(api.store.get(KEY) || "{}") || {}; } catch { return {}; } };
  function setBest(id, stars) {
    const best = readBest();
    if ((best[id] || 0) < stars) {
      best[id] = stars;
      api.store.set(KEY, JSON.stringify(best));
    }
  }
  const starText = (n) => "★".repeat(n) + "☆".repeat(3 - n);
  const starsFor = (ok, total) => (ok === total ? 3 : ok / total >= 0.66 ? 2 : ok / total >= 0.34 ? 1 : 0);
  const shuffle = (list) => {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const code = (source) => `<pre class="gm-code"><code>${api.highlight(source)}</code></pre>`;

  function meta() {
    return [
      { id: "rhythm", icon: "🥁", color: "c-yellow", title: L("ポップ・リズム", "Pop Rhythm"), sub: L("リズムにのって、プログラムを打つ", "Hit the beat, type a program") },
      { id: "quiz", icon: "🧠", color: "c-sky", title: L("ポップ・クイズ", "Pop Quiz"), sub: L("出力を、当てよう", "Guess the output") },
      { id: "bugs", icon: "🐛", color: "c-pink", title: L("バグ探し", "Bug Hunt"), sub: L("エラーを読んで、直そう", "Read the error, fix it") },
      { id: "puzzle", icon: "🧩", color: "c-mint", title: L("ならべかえ", "Card Order"), sub: L("読む順に、並べよう", "Put the cards in order") },
    ];
  }

  function show(html, cls, acts, title) {
    cleanup();
    cleanup = () => {};
    actions = acts || {};
    bodyEl.className = `gm-body ${cls || ""}`;
    bodyEl.innerHTML = html;
    nameEl.textContent = title || L("ミニゲーム", "Mini games");
    backEl.hidden = cls === "is-menu";
    bodyEl.scrollTop = 0;
    const first = $("[data-autofocus]", bodyEl) || $("button, a", bodyEl);
    if (first) first.focus({ preventScroll: true });
  }

  function open(start) {
    if (root || document.querySelector(".gate")) return;
    closeInvite();
    lastFocus = document.activeElement;
    root = document.createElement("div");
    root.className = "gm";
    root.dataset.nopop = "";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "gmTitle");
    root.innerHTML = `
      <div class="gm-card">
        <div class="gm-bar">
          <button class="gm-back" type="button" data-act="menu" aria-label="${esc(L("ゲームの一覧へ", "Back to the games"))}" hidden>‹</button>
          <span class="window-dots" aria-hidden="true"><i></i><i></i><i></i></span>
          <span class="gm-name" id="gmTitle"></span>
          <button class="gm-close" type="button" data-act="close" aria-label="${esc(L("閉じる", "Close"))}">×</button>
        </div>
        <div class="gm-body"></div>
      </div>`;
    document.body.appendChild(root);
    bodyEl = $(".gm-body", root);
    nameEl = $("#gmTitle", root);
    backEl = $(".gm-back", root);
    api.smoothHeight(bodyEl);
    inerts = Array.from(document.body.children).filter((el) => el !== root && !/^(SCRIPT|STYLE|LINK)$/.test(el.tagName) && !el.inert);
    inerts.forEach((el) => { el.inert = true; });
    document.documentElement.classList.add("gm-lock");
    root.addEventListener("click", (event) => {
      const el = event.target.closest("[data-act]");
      if (!el || el.disabled) return;
      const act = el.dataset.act;
      if (act === "close") close();
      else if (act === "menu") menu();
      else if (actions[act]) actions[act](el, event);
    });
    document.addEventListener("keydown", onEsc);
    requestAnimationFrame(() => root.classList.add("is-open"));
    api.track("pc_lp_games");
    (start || menu)();
  }

  function onEsc(event) {
    if (event.key === "Escape") close();
  }

  function close() {
    if (!root) return;
    cleanup();
    cleanup = () => {};
    document.removeEventListener("keydown", onEsc);
    inerts.forEach((el) => { el.inert = false; });
    inerts = [];
    document.documentElement.classList.remove("gm-lock");
    const el = root;
    root = null;
    el.classList.remove("is-open");
    setTimeout(() => el.remove(), 220);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  function menu() {
    const best = readBest();
    const tiles = meta().map((g) => `
      <button class="gm-tile ${g.color}" type="button" data-act="${g.id}">
        <span class="gm-ico" aria-hidden="true">${g.icon}</span>
        <b>${esc(g.title)}</b>
        <small>${esc(g.sub)}</small>
        <span class="gm-stars" aria-label="${esc(L("ベスト", "Best"))}: ${best[g.id] || 0} / 3">${starText(best[g.id] || 0)}</span>
      </button>`).join("");
    show(`
      <p class="gm-lead">${esc(L("PopCorn を、あそびながら覚えよう。ぜんぶ、本物のプログラムで出来ています。", "Learn PopCorn by playing. Every game uses real programs."))}</p>
      <div class="gm-grid">${tiles}</div>`, "is-menu",
    { rhythm: rhythmSelect, quiz: quizStart, bugs: bugsStart, puzzle: puzzleStart });
  }

  function result({ id, title, stars, headline, lines, again, source, next }) {
    if (stars) setBest(id, stars);
    show(`
      <div class="gm-result">
        <p class="gm-big" data-autofocus tabindex="-1">${esc(headline)}</p>
        <p class="gm-stars gm-stars-big" aria-label="${stars} / 3">${starText(stars)}</p>
        ${lines || ""}
        <div class="gm-actions">
          <button class="btn btn-yellow" type="button" data-act="again">${esc(L("もう一回", "Play again"))}</button>
          ${next ? `<button class="btn btn-pink" type="button" data-act="next">${esc(L("つぎの曲へ", "Next song"))}</button>` : ""}
          <button class="btn btn-paper" type="button" data-act="menu">${esc(L("ゲームの一覧", "All games"))}</button>
          ${source ? `<a class="btn btn-blue" href="${esc(api.playgroundUrl(source))}">${esc(L("Playground で、動かしてみる", "Run it in the Playground"))}</a>` : ""}
        </div>
      </div>`, "", { again, next }, title);
  }

  const term = (output, ok = true) => `<div class="gm-term${ok ? "" : " is-bad"}"><span class="gm-prompt" aria-hidden="true">${ok ? "▶" : "✕"}</span><pre>${esc(output)}</pre></div>`;
  const progress = (i, n) => `<p class="gm-prog"><span>${i + 1} / ${n}</span>${Array.from({ length: n }, (_, k) => `<i class="${k < i ? "on" : k === i ? "now" : ""}"></i>`).join("")}</p>`;

  /* ---------- リズム ---------- */
  function rhythmSelect() {
    const best = readBest();
    const lanes = DATA.rhythm.lanes;
    const slow = api.store.get(SLOW_KEY) === "1" || (api.store.get(SLOW_KEY) === null && api.reduced);
    show(`
      <p class="gm-lead">${esc(L("落ちてくる札を、線にぴったりで押そう。押した順に、プログラムができあがる。", "Press the lane when a card reaches the line. The program builds up in the order you play."))}</p>
      <ul class="rh-guide">${lanes.map((l) => `<li class="k-${l.kind}"><b>${esc(tx(l.label))}</b><span>${esc(tx(l.hint))}</span><kbd>${l.key}</kbd></li>`).join("")}</ul>
      <div class="gm-songs">${DATA.rhythm.songs.map((s, i) => `
        <button class="gm-song" type="button" data-act="song${i}" ${i === 0 ? "data-autofocus" : ""}>
          <b>${i + 1}. ${esc(tx(s.title))}</b>
          <span class="gm-song-code">${esc(s.code.replace(/\n/g, " "))}</span>
          <span class="gm-stars">${starText(best[`rhythm:${s.id}`] || 0)}</span>
        </button>`).join("")}</div>
      <label class="gm-switch"><input type="checkbox" id="rhSlow" ${slow ? "checked" : ""}><span>${esc(L("ゆっくりモード", "Slow mode"))}</span></label>`, "",
    Object.fromEntries(DATA.rhythm.songs.map((s, i) => [`song${i}`, () => {
      const on = $("#rhSlow", bodyEl).checked;
      api.store.set(SLOW_KEY, on ? "1" : "0");
      rhythmPlay(i, on);
    }])), L("ポップ・リズム", "Pop Rhythm"));
  }

  function rhythmPlay(index, slow) {
    const lanes = DATA.rhythm.lanes;
    const song = DATA.rhythm.songs[index];
    const BEAT = slow ? 920 : 640;
    const FALL = slow ? 2400 : 1800;
    const GOOD = 220;
    const PERFECT = 90;
    const laneOf = (kind) => lanes.findIndex((l) => l.kind === kind);
    const strip = song.chunks.map(([text, kind], i) => `${kind === "dot" ? "" : i ? " " : ""}<span class="rh-tok" data-i="${i}">${esc(text)}</span>`).join("");
    show(`
      <div class="rh">
        <div class="rh-head"><b>${esc(tx(song.title))}</b><span class="rh-beat" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div>
        <div class="rh-field">
          ${lanes.map((l) => `<div class="rh-lane k-${l.kind}"></div>`).join("")}
          <div class="rh-line" aria-hidden="true"></div>
          <p class="rh-judge" aria-live="polite"></p>
        </div>
        <div class="rh-keys">${lanes.map((l, i) => `<button class="rh-key k-${l.kind}" type="button" data-lane="${i}"><b>${esc(tx(l.label))}</b><kbd>${l.key}</kbd></button>`).join("")}</div>
        <pre class="gm-code rh-code" aria-label="${esc(L("できあがるプログラム", "The program being built"))}"><code>${strip}</code></pre>
      </div>`, "is-rhythm", {}, tx(song.title));

    const field = $(".rh-field", bodyEl);
    const laneEls = $$(".rh-lane", bodyEl);
    const judgeEl = $(".rh-judge", bodyEl);
    const beatDots = $$(".rh-beat i", bodyEl);
    const toks = $$(".rh-tok", bodyEl);
    let H = field.getBoundingClientRect().height;
    const hitY = () => H * 0.8;
    const start = performance.now();
    const notes = song.chunks.map(([text, kind], i) => {
      const lane = laneOf(kind);
      const el = document.createElement("div");
      el.className = `rh-note k-${kind}`;
      el.textContent = text;
      el.style.visibility = "hidden";
      laneEls[lane].appendChild(el);
      return { el, lane, at: start + FALL + 700 + i * BEAT, done: false, result: "" };
    });
    const last = notes[notes.length - 1].at;
    let raf = 0;
    let ended = false;
    let beat = -1;
    const tally = { perfect: 0, good: 0, miss: 0 };

    const say = (text, cls) => {
      judgeEl.textContent = text;
      judgeEl.className = `rh-judge ${cls}`;
      void judgeEl.offsetWidth;
      judgeEl.classList.add("go");
    };
    function settle(note, result, i) {
      note.done = true;
      note.result = result;
      tally[result] += 1;
      note.el.classList.add(result === "miss" ? "is-miss" : "is-hit");
      toks[i].classList.add(result === "miss" ? "is-miss" : "is-hit");
      if (result === "miss") toks[i].innerHTML = "／";
      else toks[i].innerHTML = api.highlight(song.chunks[i][0]);
      say(result === "perfect" ? L("ぴったり！", "Perfect!") : result === "good" ? L("いいね", "Good") : L("ぬけた…", "Missed…"), result);
      if (result !== "miss") {
        const pop = document.createElement("span");
        pop.className = "rh-pop";
        pop.innerHTML = api.popImg();
        pop.style.top = `${hitY()}px`;
        laneEls[note.lane].appendChild(pop);
        setTimeout(() => pop.remove(), 700);
        api.playSound(result === "perfect" ? 1 : 0.7);
      }
      setTimeout(() => note.el.remove(), 360);
    }
    function press(lane) {
      if (ended) return;
      const now = performance.now();
      const key = $$(".rh-key", bodyEl)[lane];
      key.classList.remove("down");
      void key.offsetWidth;
      key.classList.add("down");
      let best = -1;
      let bestD = Infinity;
      notes.forEach((n, i) => {
        const d = Math.abs(n.at - now);
        if (!n.done && n.lane === lane && d <= GOOD && d < bestD) { best = i; bestD = d; }
      });
      if (best < 0) return;
      settle(notes[best], bestD <= PERFECT ? "perfect" : "good", best);
    }
    function frame() {
      const now = performance.now();
      const y = hitY();
      notes.forEach((n, i) => {
        if (n.done) return;
        if (now > n.at + GOOD) { settle(n, "miss", i); return; }
        const p = 1 - (n.at - now) / FALL;
        if (p < 0) return;
        n.el.style.visibility = "visible";
        n.el.style.transform = `translateY(${(y * p - 22).toFixed(1)}px)`;
      });
      const b = Math.floor((now - (start + FALL + 700)) / BEAT);
      if (b !== beat && b >= 0) {
        beat = b;
        beatDots.forEach((d, k) => d.classList.toggle("on", k === b % 4));
      }
      if (now > last + GOOD + 500) { finish(); return; }
      raf = requestAnimationFrame(frame);
    }
    function finish() {
      ended = true;
      const all = tally.miss === 0;
      const stars = all ? (tally.perfect / notes.length >= 0.8 ? 3 : tally.perfect / notes.length >= 0.5 ? 2 : 1) : 0;
      const shown = song.chunks.map(([text], i) => (notes[i].result === "miss" ? "／" : text)).join(" ").replace(" .", ".");
      const lines = all
        ? `<div class="gm-run">${code(song.code)}${term(song.output)}</div><p class="gm-learn">${esc(tx(song.learn))}</p>`
        : `<div class="gm-run">${code(shown)}</div><p class="gm-learn">${esc(L(`ぬけた札が ${tally.miss} 枚。つながらないと、プログラムは動きません。もう一回、やってみよう。`, `${tally.miss} card(s) missed. A program with gaps will not run. Try once more.`))}</p>`;
      setBest(`rhythm:${song.id}`, stars);
      result({
        id: "rhythm", title: tx(song.title), stars,
        headline: all ? L("できた！ 動いたよ", "You did it! It runs") : L("おしい！", "Almost!"),
        lines, source: all ? song.code : "",
        again: () => rhythmPlay(index, slow),
        next: all && index + 1 < DATA.rhythm.songs.length ? () => rhythmPlay(index + 1, slow) : null,
      });
      api.track("pc_lp_game_rhythm", `${song.id}:${stars}`);
    }
    const onKey = (event) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const lane = lanes.findIndex((l) => `Key${l.key}` === event.code) >= 0 ? lanes.findIndex((l) => `Key${l.key}` === event.code) : "1234".indexOf(event.key);
      if (lane < 0) return;
      event.preventDefault();
      press(lane);
    };
    const onDown = (event) => {
      const key = event.target.closest(".rh-key");
      if (!key) return;
      event.preventDefault();
      press(Number(key.dataset.lane));
    };
    const onHide = () => { if (document.hidden) rhythmSelect(); };
    const onSize = () => { H = field.getBoundingClientRect().height; };
    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("resize", onSize);
    bodyEl.addEventListener("pointerdown", onDown);
    cleanup = () => {
      ended = true;
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("resize", onSize);
      bodyEl.removeEventListener("pointerdown", onDown);
    };
    raf = requestAnimationFrame(frame);
  }

  /* ---------- クイズ ---------- */
  function quizStart() {
    const items = shuffle(DATA.quiz);
    let i = 0;
    let ok = 0;
    const ask = () => {
      const q = items[i];
      const order = shuffle(q.choices.map((c, k) => k));
      const acts = {};
      order.forEach((k, pos) => {
        acts[`c${pos}`] = (el) => {
          if (bodyEl.dataset.locked) return;
          bodyEl.dataset.locked = "1";
          const right = k === q.answer;
          if (right) ok += 1;
          $$(".gm-choice", bodyEl).forEach((b, p) => {
            b.disabled = true;
            if (order[p] === q.answer) b.classList.add("is-right");
          });
          if (!right) el.classList.add("is-wrong");
          api.playSound(right ? 1 : 0.4);
          const box = $(".gm-explain", bodyEl);
          box.classList.add("show");
          box.innerHTML = `<b>${right ? esc(L("せいかい！", "Correct!")) : esc(L("ざんねん", "Not quite"))}</b> ${esc(tx(q.explain))}`;
          const next = $("[data-act=next]", bodyEl);
          next.style.visibility = "visible";
          next.focus({ preventScroll: true });
        };
      });
      acts.next = () => {
        i += 1;
        if (i < items.length) ask();
        else result({
          id: "quiz", title: L("ポップ・クイズ", "Pop Quiz"), stars: starsFor(ok, items.length),
          headline: L(`${items.length} 問中 ${ok} 問、せいかい`, `${ok} of ${items.length} correct`),
          lines: `<p class="gm-learn">${esc(ok === items.length ? L("ぜんぶ読めました。もう PopCorn が読めますね。", "You read them all. You can already read PopCorn.") : L("まちがえた所は、コードを左から順に読みなおそう。", "Read the code again from left to right."))}</p>`,
          again: quizStart,
        });
      };
      show(`
        ${progress(i, items.length)}
        <p class="gm-ask">${esc(tx(q.ask))}</p>
        ${code(q.code)}
        <div class="gm-choices">${order.map((k, pos) => `<button class="gm-choice" type="button" data-act="c${pos}">${esc(tx(q.choices[k]))}</button>`).join("")}</div>
        <p class="gm-explain" aria-live="polite"></p>
        <div class="gm-actions"><button class="btn btn-yellow" type="button" data-act="next" style="visibility:hidden">${esc(i + 1 < items.length ? L("つぎへ", "Next") : L("けっかを見る", "See the result"))}</button></div>`,
      "", acts, L("ポップ・クイズ", "Pop Quiz"));
      delete bodyEl.dataset.locked;
    };
    ask();
  }

  /* ---------- バグ探し ---------- */
  function bugsStart() {
    const items = DATA.bugs;
    let i = 0;
    let first = 0;
    const ask = () => {
      const b = items[i];
      const order = shuffle(b.choices.map((c, k) => k));
      let missed = false;
      const acts = {};
      order.forEach((k, pos) => {
        acts[`c${pos}`] = (el) => {
          if (k !== b.answer) {
            missed = true;
            el.classList.add("is-wrong");
            el.disabled = true;
            const box = $(".gm-explain", bodyEl);
            box.classList.add("show");
            box.innerHTML = `<b>${esc(L("ちがうみたい", "Not that one"))}</b> ${esc(tx(b.hint))}`;
            return;
          }
          if (!missed) first += 1;
          api.playSound(1);
          $$(".gm-choice", bodyEl).forEach((c) => { c.disabled = true; });
          el.classList.add("is-right");
          $(".gm-fixed", bodyEl).innerHTML = `<p class="gm-label">${esc(L("直したら、動いた！", "Fixed. It runs!"))}</p>${code(b.fixed)}${term(b.output)}`;
          $(".gm-fixed", bodyEl).classList.add("show");
          const next = $("[data-act=next]", bodyEl);
          next.style.visibility = "visible";
          next.focus({ preventScroll: true });
        };
      });
      acts.next = () => {
        i += 1;
        if (i < items.length) ask();
        else result({
          id: "bugs", title: L("バグ探し", "Bug Hunt"), stars: starsFor(first, items.length),
          headline: L(`${items.length} 件中 ${first} 件、1回で直せた`, `Fixed ${first} of ${items.length} on the first try`),
          lines: `<p class="gm-learn">${esc(L("エラーは、場所と理由を教えてくれます。まず、読んでみよう。", "An error tells you where and why. Read it first."))}</p>`,
          again: bugsStart,
        });
      };
      show(`
        ${progress(i, items.length)}
        <p class="gm-ask">${esc(L("このプログラムは、エラーになります。", "This program has an error."))}</p>
        ${code(b.code)}
        ${term(api.localize(b.error), false)}
        <p class="gm-ask">${esc(L("どう直す？", "How do you fix it?"))}</p>
        <div class="gm-choices">${order.map((k, pos) => `<button class="gm-choice" type="button" data-act="c${pos}">${esc(tx(b.choices[k]))}</button>`).join("")}</div>
        <p class="gm-explain" aria-live="polite"></p>
        <div class="gm-fixed"></div>
        <div class="gm-actions"><button class="btn btn-yellow" type="button" data-act="next" style="visibility:hidden">${esc(i + 1 < items.length ? L("つぎへ", "Next") : L("けっかを見る", "See the result"))}</button></div>`,
      "", acts, L("バグ探し", "Bug Hunt"));
    };
    ask();
  }

  /* ---------- ならべかえ ---------- */
  function puzzleStart() {
    const items = DATA.puzzles;
    let i = 0;
    let first = 0;
    const ask = () => {
      const p = items[i];
      let order = shuffle(p.chips.map((c, k) => k));
      if (order.every((k, pos) => k === pos)) order = order.reverse();
      const placed = [];
      let missed = false;
      let done = false;
      const sep = p.join;
      const draw = () => {
        $(".pz-slots", bodyEl).innerHTML = placed.length
          ? placed.map((k, pos) => `<button class="pz-chip placed" type="button" data-act="out${pos}">${esc(p.chips[k])}</button>`).join("")
          : `<span class="pz-empty">${esc(L("ここに、カードを置く", "Put the cards here"))}</span>`;
        $(".pz-pool", bodyEl).innerHTML = order.filter((k) => !placed.includes(k)).map((k) => `<button class="pz-chip" type="button" data-act="in${k}">${esc(p.chips[k])}</button>`).join("");
        $("[data-act=check]", bodyEl).disabled = !placed.length;
      };
      const acts = {
        check: () => {
          if (done) return;
          const text = placed.map((k) => p.chips[k]).join(sep);
          const slots = $(".pz-slots", bodyEl);
          if (!p.accept.includes(text)) {
            missed = true;
            slots.classList.remove("shake");
            void slots.offsetWidth;
            slots.classList.add("shake");
            const box = $(".gm-explain", bodyEl);
            box.classList.add("show");
            box.innerHTML = `<b>${esc(L("ちがうみたい", "Not yet"))}</b> ${esc(L("左から右へ、上から下へ、読む順に並べよう。", "Read left to right, top to bottom."))} ${p.hint ? esc(tx(p.hint)) : ""}`;
            return;
          }
          done = true;
          if (!missed) first += 1;
          api.playSound(1);
          $$(".pz-chip", bodyEl).forEach((c) => { c.disabled = true; });
          $("[data-act=check]", bodyEl).disabled = true;
          $(".gm-fixed", bodyEl).innerHTML = `<p class="gm-label">${esc(L("動いた！", "It runs!"))}</p>${code(text)}${term(p.output)}`;
          $(".gm-fixed", bodyEl).classList.add("show");
          const next = $("[data-act=next]", bodyEl);
          next.style.visibility = "visible";
          next.focus({ preventScroll: true });
        },
        reset: () => { if (!done) { placed.length = 0; draw(); } },
        next: () => {
          i += 1;
          if (i < items.length) ask();
          else result({
            id: "puzzle", title: L("ならべかえ", "Card Order"), stars: starsFor(first, items.length),
            headline: L(`${items.length} 問中 ${first} 問、1回で出来た`, `${first} of ${items.length} on the first try`),
            lines: `<p class="gm-learn">${esc(L("PopCorn は、左から右、上から下へ読みます。順番が変わると、答えも変わります。", "PopCorn reads left to right, top to bottom. Change the order and the answer changes."))}</p>`,
            again: puzzleStart,
          });
        },
      };
      p.chips.forEach((c, k) => {
        acts[`in${k}`] = () => { if (!done) { placed.push(k); draw(); } };
      });
      for (let pos = 0; pos < p.chips.length; pos += 1) {
        acts[`out${pos}`] = () => { if (!done) { placed.splice(pos, 1); draw(); } };
      }
      show(`
        ${progress(i, items.length)}
        <p class="gm-ask">${esc(L("この出力になるように、カードを並べよう", "Order the cards to print this"))}</p>
        ${term(p.output)}
        <div class="pz-slots${sep === "\n" ? " col" : ""}" aria-live="polite"></div>
        <div class="pz-pool${sep === "\n" ? " col" : ""}"></div>
        <p class="gm-explain" aria-live="polite"></p>
        <div class="gm-fixed"></div>
        <div class="gm-actions">
          <button class="btn btn-yellow" type="button" data-act="check">${esc(L("できた！", "Done!"))}</button>
          <button class="btn btn-paper" type="button" data-act="reset">${esc(L("もどす", "Reset"))}</button>
          <button class="btn btn-pink" type="button" data-act="next" style="visibility:hidden">${esc(i + 1 < items.length ? L("つぎへ", "Next") : L("けっかを見る", "See the result"))}</button>
        </div>`, "", acts, L("ならべかえ", "Card Order"));
      draw();
    };
    ask();
  }

  /* ---------- 10 ポップのお知らせ ---------- */
  function closeInvite() {
    if (!inviteEl) return;
    const el = inviteEl;
    inviteEl = null;
    el.classList.remove("is-open");
    setTimeout(() => el.remove(), 260);
  }

  function invite() {
    if (invited || root || inviteEl) return;
    invited = true;
    setTimeout(() => {
      if (root || document.querySelector(".gate")) return;
      inviteEl = document.createElement("div");
      inviteEl.className = "gm-invite";
      inviteEl.dataset.nopop = "";
      inviteEl.setAttribute("role", "dialog");
      inviteEl.setAttribute("aria-label", L("ミニゲームのお誘い", "Mini game invitation"));
      inviteEl.innerHTML = `
        <span class="gm-invite-ico" aria-hidden="true">🥁</span>
        <p><b>${esc(L("10 ポップ！", "10 pops!"))}</b><br>${esc(L("リズムゲームで、PopCorn を覚えよう。", "Learn PopCorn with a rhythm game."))}</p>
        <div class="gm-invite-btns">
          <button class="btn btn-small btn-yellow" type="button" data-go>${esc(L("やってみる", "Play"))}</button>
          <button class="btn btn-small btn-paper" type="button" data-later>${esc(L("あとで", "Later"))}</button>
        </div>`;
      document.body.appendChild(inviteEl);
      requestAnimationFrame(() => inviteEl && inviteEl.classList.add("is-open"));
      $("[data-go]", inviteEl).addEventListener("click", () => { closeInvite(); open(rhythmSelect); });
      $("[data-later]", inviteEl).addEventListener("click", closeInvite);
      const el = inviteEl;
      setTimeout(() => { if (inviteEl === el) closeInvite(); }, 16000);
    }, 1400);
  }

  window.PopGames = {
    init(options) {
      api = options;
      document.addEventListener("click", (event) => {
        const el = event.target.closest("[data-open-games]");
        if (!el) return;
        event.preventDefault();
        open();
      });
    },
    open,
    invite,
  };
})();
