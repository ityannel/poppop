/* 映画館の場内（3D）。席に座った目線で、前の席・幕・映写機の光・非常口の灯りを描く。
 * スクリーンは「窓」として扱う：視点を少し動かしても、スクリーン（HTML の #screen）はずれず、場内だけが奥行きで動く。
 * 2 枚の canvas を使う。奥（客席・幕・光）はスクリーンの下、手前（前の人の頭・投げたポップコーン）はスクリーンの上。
 * three.js（MIT）は lp/vendor/。WebGL が使えない端末では何もしない（CSS の暗い背景のまま）。
 */
import * as THREE from "./vendor/three.module.min.js";

const root = document.documentElement;
const screenEl = document.getElementById("screen");
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (screenEl && root.classList.contains("is-theater")) start();

function start() {
  let back;
  let front;
  try {
    back = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    front = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return;
  }
  for (const [renderer, cls] of [[back, "theater-room"], [front, "theater-room theater-front"]]) {
    renderer.domElement.className = cls;
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
  }
  back.setClearColor(0x050404, 1);
  front.setClearColor(0x000000, 0);
  document.body.prepend(back.domElement);
  screenEl.after(front.domElement);
  root.classList.add("has-room");

  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 90);
  const backScene = new THREE.Scene();
  const frontScene = new THREE.Scene();
  backScene.fog = new THREE.FogExp2(0x050404, 0.022);

  const FOV = 52;
  const D = 13;
  const tanH = Math.tan((FOV / 2) * Math.PI / 180);
  const SEAT_W = 0.58;
  const ROW = 1.1;
  const EYE_FLOOR = 1.15;

  /* ---------- 絵の具 ---------- */
  const velvet = new THREE.MeshPhysicalMaterial({ color: 0x5a1317, roughness: 0.9, sheen: 1, sheenColor: 0xff7d6b, sheenRoughness: 0.42 });
  const curtainMat = new THREE.MeshPhysicalMaterial({ color: 0x5e0d14, roughness: 0.85, sheen: 1, sheenColor: 0xff5a4c, sheenRoughness: 0.5, side: THREE.DoubleSide });
  const armMat = new THREE.MeshStandardMaterial({ color: 0x15100f, roughness: 0.55, metalness: 0.2 });
  const carpet = new THREE.MeshStandardMaterial({ color: 0x140d0c, roughness: 1 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x241b18, roughness: 1, map: panelTexture() });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x080606, roughness: 1 });
  const screenMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const stepMat = new THREE.MeshBasicMaterial({ color: 0xffb35a, toneMapped: false });
  const sconceMat = new THREE.MeshBasicMaterial({ color: 0xffc98a, toneMapped: false });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x0b0807, roughness: 0.7 });

  function panelTexture() {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 8;
    const g = c.getContext("2d");
    g.fillStyle = "#8a7b72";
    g.fillRect(0, 0, 128, 8);
    g.fillStyle = "#4a3e38";
    g.fillRect(0, 0, 5, 8);
    g.fillStyle = "#a39389";
    g.fillRect(5, 0, 2, 8);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function exitTexture() {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 96;
    const g = c.getContext("2d");
    g.fillStyle = "#13c35a";
    g.fillRect(0, 0, 256, 96);
    g.fillStyle = "#f4fff6";
    g.fillRect(8, 8, 80, 80);
    g.fillStyle = "#13c35a";
    g.beginPath();
    g.arc(56, 24, 8, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 9;
    g.lineCap = "round";
    g.strokeStyle = "#13c35a";
    g.beginPath();
    g.moveTo(52, 36); g.lineTo(42, 58); g.lineTo(26, 70);
    g.moveTo(42, 58); g.lineTo(58, 66); g.lineTo(56, 82);
    g.moveTo(50, 42); g.lineTo(66, 50); g.lineTo(74, 44);
    g.moveTo(50, 42); g.lineTo(34, 46);
    g.stroke();
    g.fillStyle = "#f4fff6";
    g.font = "700 50px Arial, Helvetica, sans-serif";
    g.textBaseline = "middle";
    g.fillText("EXIT", 104, 50);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function dotTexture() {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,255,255,.45)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  const dotTex = dotTexture();

  /* ---------- 光 ---------- */
  const hemi = new THREE.HemisphereLight(0xffe2c4, 0x140c0a, 1);
  const screenLight = new THREE.PointLight(0xfff1dc, 60, 0, 1.25);
  const sconceL = new THREE.PointLight(0xffb978, 0, 0, 1.6);
  const sconceR = new THREE.PointLight(0xffb978, 0, 0, 1.6);
  const exitLight = new THREE.PointLight(0x2bff7a, 2, 6, 1.8);
  backScene.add(hemi, screenLight, sconceL, sconceR, exitLight);
  const frontHemi = new THREE.HemisphereLight(0xffe2c4, 0x140c0a, 1);
  const frontScreenLight = new THREE.PointLight(0xfff1dc, 60, 0, 1.25);
  frontScene.add(frontHemi, frontScreenLight);

  /* ---------- 場内を組み立てる（スクリーンの大きさに合わせて、作り直す） ---------- */
  let room = null;
  let heads = [];
  let curtains = null;
  let beam = null;
  let dust = null;
  let dims = null;
  const pops = [];

  function floorY(k) { return -EYE_FLOOR - dims.rake * k; }

  function build(layout) {
    if (room) {
      room.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      backScene.remove(room);
    }
    heads.forEach((h) => frontScene.remove(h.mesh));
    heads = [];

    const W = layout.viewW;
    const H = layout.viewH;
    const aspect = W / H;
    const viewH = 2 * D * tanH;
    const viewW = viewH * aspect;
    const sw = (layout.width / W) * viewW;
    const sh = (layout.height / H) * viewH;
    const cx = ((layout.left + layout.width / 2) / W - 0.5) * viewW;
    const cy = (0.5 - (layout.top + layout.height / 2) / H) * viewH;
    const ndcBottom = 1 - (2 * (layout.top + layout.height)) / H;
    const rake = ROW * tanH * (Math.abs(ndcBottom) + 0.06);
    dims = { viewW, viewH, sw, sh, cx, cy, rake, aspect };

    room = new THREE.Group();
    backScene.add(room);

    const halfRoom = sw / 2 + Math.max(1.4, sw * 0.08);
    const rows = Math.max(4, Math.floor((D - 3.2) / ROW));
    const frontFloor = floorY(rows + 1.6);
    const ceiling = cy + sh / 2 + 2.2;
    dims.halfRoom = halfRoom;
    dims.rows = rows;
    dims.frontFloor = frontFloor;
    dims.ceiling = ceiling;

    /* スクリーン（HTML がこの上に重なる。幕が閉じている間と、ふちの光に見える） */
    const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(sw * 1.004, sh * 1.006), screenMat);
    screenMesh.position.set(cx, cy, -D);
    room.add(screenMesh);

    /* 正面の壁と、スクリーンのまわりの黒いふち */
    const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(halfRoom * 2 + 2, ceiling - frontFloor + 4), darkMat);
    frontWall.position.set(cx, (ceiling + frontFloor) / 2, -D - 0.05);
    room.add(frontWall);

    /* 横の壁と天井 */
    const wallLen = D + 6;
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(wallLen, ceiling - frontFloor + 6), wallMat);
      wall.material.map.repeat.set(wallLen / 1.3, 1);
      wall.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      wall.position.set(cx + side * halfRoom, (ceiling + frontFloor) / 2 - 2, -D / 2 + 1);
      room.add(wall);
      for (let i = 0; i < 3; i += 1) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.18), sconceMat);
        lamp.position.set(cx + side * (halfRoom - 0.04), floorY(2 + i * 3) + 2.2, -2.2 - i * 3.3);
        room.add(lamp);
      }
    }
    sconceL.position.set(cx - halfRoom + 0.6, floorY(4) + 2.4, -5.5);
    sconceR.position.set(cx + halfRoom - 0.6, floorY(4) + 2.4, -5.5);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(halfRoom * 2, wallLen), darkMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, ceiling, -D / 2 + 1);
    room.add(ceil);

    /* 段になった床と、通路の足もとの灯り */
    const aisle = 1.05;
    const seatHalf = halfRoom - aisle;
    for (let k = -1; k <= rows + 2; k += 1) {
      const top = floorY(Math.min(k, rows + 1.6));
      const step = new THREE.Mesh(new THREE.BoxGeometry(halfRoom * 2, 8, ROW), carpet);
      step.position.set(cx, top - 4, -ROW * k);
      room.add(step);
      if (k >= 1 && k <= rows + 1) {
        for (const side of [-1, 1]) {
          const glow = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.03), stepMat);
          glow.position.set(cx + side * (seatHalf + aisle * 0.5), top + 0.04, -ROW * k + ROW / 2 + 0.01);
          room.add(glow);
        }
      }
    }

    /* 客席：前の列ほど低い（前の人でスクリーンが隠れない段差） */
    const cols = Math.max(2, Math.floor((seatHalf * 2) / SEAT_W));
    const startX = cx - ((cols - 1) * SEAT_W) / 2;
    const backGeo = new THREE.CapsuleGeometry(0.24, 0.4, 6, 16);
    backGeo.scale(1, 1, 0.36);
    const armGeo = new THREE.BoxGeometry(0.07, 0.07, 0.5);
    const seatCount = rows * cols;
    const seats = new THREE.InstancedMesh(backGeo, velvet, seatCount);
    const arms = new THREE.InstancedMesh(armGeo, armMat, rows * (cols + 1));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    let si = 0;
    let ai = 0;
    const seatTops = [];
    for (let k = 1; k <= rows; k += 1) {
      const f = floorY(k);
      const z = -ROW * k + 0.25;
      seatTops[k] = f + 0.98;
      for (let c = 0; c < cols; c += 1) {
        e.set(-0.12 + (Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.04, 0);
        q.setFromEuler(e);
        p.set(startX + c * SEAT_W, f + 0.55, z);
        seats.setMatrixAt(si++, m.compose(p, q, s));
      }
      for (let c = 0; c <= cols; c += 1) {
        p.set(startX + (c - 0.5) * SEAT_W, f + 0.64, z - 0.24);
        q.identity();
        arms.setMatrixAt(ai++, m.compose(p, q, s));
      }
    }
    seats.instanceMatrix.needsUpdate = true;
    arms.instanceMatrix.needsUpdate = true;
    room.add(seats, arms);
    dims.seatTops = seatTops;
    dims.startX = startX;
    dims.cols = cols;

    /* 幕：閉じた状態から、左右に寄せて開く */
    const cw = sw / 2 + 0.9;
    const ch = ceiling - frontFloor;
    const curtainGeo = new THREE.PlaneGeometry(cw, ch, 90, 1);
    const pos = curtainGeo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      pos.setZ(i, Math.sin((x / cw) * Math.PI * 2 * Math.max(8, cw * 1.3)) * 0.14);
    }
    curtainGeo.computeVertexNormals();
    const left = new THREE.Mesh(curtainGeo, curtainMat);
    const right = new THREE.Mesh(curtainGeo, curtainMat);
    const cz = -D + 0.45;
    left.position.set(0, (ceiling + frontFloor) / 2, cz);
    right.position.set(0, (ceiling + frontFloor) / 2, cz);
    room.add(left, right);
    const valanceGeo = new THREE.PlaneGeometry(halfRoom * 2 + 1, 1.1, 120, 1);
    const vpos = valanceGeo.attributes.position;
    for (let i = 0; i < vpos.count; i += 1) vpos.setZ(i, Math.sin(vpos.getX(i) * 7) * 0.08);
    valanceGeo.computeVertexNormals();
    const valance = new THREE.Mesh(valanceGeo, curtainMat);
    valance.position.set(cx, cy + sh / 2 + 0.62, cz + 0.12);
    room.add(valance);
    curtains = { left, right, cw, cx, sw };

    /* 非常口 */
    const exit = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.34), new THREE.MeshBasicMaterial({ map: exitTexture(), toneMapped: false }));
    exit.position.set(cx - sw / 2 - 0.62, frontFloor + 2.35, -D + 0.3);
    room.add(exit);
    exitLight.position.set(exit.position.x + 0.2, exit.position.y - 0.2, exit.position.z + 0.6);

    /* 映写機の光（うしろの小窓から、スクリーンへ） */
    const apex = new THREE.Vector3(cx, ceiling - 0.5, 7);
    const corners = [
      new THREE.Vector3(cx - sw / 2, cy - sh / 2, -D + 0.02),
      new THREE.Vector3(cx + sw / 2, cy - sh / 2, -D + 0.02),
      new THREE.Vector3(cx + sw / 2, cy + sh / 2, -D + 0.02),
      new THREE.Vector3(cx - sw / 2, cy + sh / 2, -D + 0.02),
    ];
    const verts = [];
    const ts = [];
    for (let i = 0; i < 4; i += 1) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      verts.push(apex.x, apex.y, apex.z, a.x, a.y, a.z, b.x, b.y, b.z);
      ts.push(0, 1, 1);
    }
    const beamGeo = new THREE.BufferGeometry();
    beamGeo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    beamGeo.setAttribute("t", new THREE.Float32BufferAttribute(ts, 1));
    beam = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({
      uniforms: { uI: { value: 0 } },
      vertexShader: "attribute float t; varying float vT; void main(){ vT=t; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
      fragmentShader: "uniform float uI; varying float vT; void main(){ float a = uI * (0.05 * smoothstep(0.0, 0.25, vT) * (1.15 - vT)); gl_FragColor = vec4(vec3(1.0,0.95,0.86)*a, a); }",
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }));
    room.add(beam);

    /* 光の中の、ほこり */
    const N = layout.viewW < 720 ? 160 : 320;
    const dp = new Float32Array(N * 3);
    const seeds = new Float32Array(N);
    for (let i = 0; i < N; i += 1) {
      const t = 0.12 + Math.random() * 0.8;
      const u = Math.random();
      const v = Math.random();
      const target = new THREE.Vector3(cx + (u - 0.5) * sw, cy + (v - 0.5) * sh, -D);
      const point = apex.clone().lerp(target, t);
      dp.set([point.x, point.y, point.z], i * 3);
      seeds[i] = Math.random() * 100;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dp, 3));
    dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.05, map: dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff2dc, opacity: 0 }));
    dust.userData = { base: dp.slice(), seeds };
    room.add(dust);

    screenLight.position.set(cx, cy - sh * 0.1, -D + 1.6);
    frontScreenLight.position.copy(screenLight.position);

    /* 前の人の頭（スクリーンの下のはしに、少しだけかかる） */
    const spots = layout.viewW < 720
      ? [[2, 0.12], [3, 0.86]]
      : [[2, 0.16], [3, 0.8], [5, 0.34], [4, 0.62]];
    const headGeo = new THREE.SphereGeometry(0.105, 24, 16);
    const bunGeo = new THREE.SphereGeometry(0.055, 16, 12);
    const bodyGeo = new THREE.CapsuleGeometry(0.1, 0.24, 6, 16);
    const neckGeo = new THREE.CylinderGeometry(0.045, 0.06, 0.09, 12);
    spots.forEach(([k, fx], n) => {
      if (k > rows) return;
      const c = Math.round(fx * (cols - 1));
      const base = new THREE.Vector3(startX + c * SEAT_W, seatTops[k] + 0.15, -ROW * k + 0.2);
      const person = new THREE.Group();
      const head = new THREE.Group();
      const skull = new THREE.Mesh(headGeo, headMat);
      skull.scale.set(0.9, 1.1, 1);
      head.add(skull);
      const style = n % 3;
      if (style === 1) {
        const bun = new THREE.Mesh(bunGeo, headMat);
        bun.position.set(0, 0.1, 0.06);
        head.add(bun);
      } else if (style === 2) {
        skull.scale.set(1.06, 1.08, 1.06);
      }
      const neck = new THREE.Mesh(neckGeo, headMat);
      neck.position.y = -0.12;
      const shoulders = new THREE.Mesh(bodyGeo, headMat);
      shoulders.rotation.z = Math.PI / 2;
      shoulders.scale.set(0.8, 1.05, 0.55);
      shoulders.position.y = -0.2;
      person.add(neck);
      person.add(head, shoulders);
      person.position.copy(base);
      frontScene.add(person);
      heads.push({ mesh: person, head, base, hitAt: -10, turn: Math.random() < 0.5 ? -1 : 1 });
    });

    setCurtains(curtainOpen);
  }

  /* ---------- 窓としての投影：視点が動いても、スクリーンの面は同じ場所に映る ---------- */
  const eye = new THREE.Vector3();
  function project() {
    const n = camera.near;
    const dist = D + eye.z;
    const l = (-dims.viewW / 2 - eye.x) * n / dist;
    const r = (dims.viewW / 2 - eye.x) * n / dist;
    const b = (-dims.viewH / 2 - eye.y) * n / dist;
    const t = (dims.viewH / 2 - eye.y) * n / dist;
    camera.position.copy(eye);
    camera.rotation.set(0, 0, 0);
    camera.updateMatrixWorld();
    camera.projectionMatrix.makePerspective(l, r, t, b, n, camera.far);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  /* ---------- 幕 ---------- */
  let curtainOpen = 0;
  function setCurtains(o) {
    if (!curtains) return;
    const { left, right, cw, cx, sw } = curtains;
    const k = o * o * (3 - 2 * o);
    const scale = 1 - 0.74 * k;
    const edge = 0.04 + (sw / 2 + 0.1) * k;
    left.scale.x = scale;
    right.scale.x = scale;
    left.position.x = cx - edge - (cw * scale) / 2;
    right.position.x = cx + edge + (cw * scale) / 2;
  }

  /* ---------- 投げたポップコーン ---------- */
  const popTextures = [];
  const loader = new THREE.TextureLoader();
  function popTexture() {
    if (!popTextures.length) {
      for (let i = 1; i <= 15; i += 1) {
        const t = loader.load(new URL(`./img/pop/pop-${String(i).padStart(2, "0")}.webp`, import.meta.url).href);
        t.colorSpace = THREE.SRGBColorSpace;
        popTextures.push(t);
      }
    }
    return popTextures[Math.floor(Math.random() * popTextures.length)];
  }
  const GRAVITY = new THREE.Vector3(0, -9.8, 0);
  function throwFrom(px, py) {
    if (!dims) return;
    const ndc = new THREE.Vector3((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1, 0.5);
    ndc.unproject(camera);
    const dir = ndc.sub(camera.position).normalize();
    const startAt = camera.position.clone().add(dir.multiplyScalar(0.9));
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i += 1) {
      const k = 2 + Math.floor(Math.random() * Math.min(5, dims.rows - 2));
      const c = Math.random() * (dims.cols - 1);
      const target = new THREE.Vector3(dims.startX + c * SEAT_W, dims.seatTops[k] + 0.25, -ROW * k);
      if (heads.length && Math.random() < 0.35) {
        const h = heads[Math.floor(Math.random() * heads.length)];
        target.copy(h.base).add(new THREE.Vector3(0, 0.06, 0));
      }
      const T = 0.7 + Math.random() * 0.35;
      const vel = target.clone().sub(startAt).sub(GRAVITY.clone().multiplyScalar(0.5 * T * T)).divideScalar(T);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: popTexture(), transparent: true, depthWrite: false }));
      const size = 0.075 + Math.random() * 0.04;
      sprite.scale.set(size, size, size);
      sprite.position.copy(startAt);
      frontScene.add(sprite);
      pops.push({ sprite, vel, born: clock + i * 0.05, spin: (Math.random() - 0.5) * 14, landed: false });
    }
  }

  /* ---------- 時間の流れ ---------- */
  let clock = 0;
  let house = 1;
  let houseTarget = 1;
  let light = 0.18;
  let lightTarget = 0.18;
  let curtainTarget = 0;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const fine = window.matchMedia("(pointer: fine)").matches;

  function step(dt) {
    clock += dt;
    const ease = 1 - Math.exp(-dt * 1.6);
    house += (houseTarget - house) * ease;
    light += (lightTarget - light) * (1 - Math.exp(-dt * 3));
    curtainOpen += (curtainTarget - curtainOpen) * (1 - Math.exp(-dt * 1.4));
    if (Math.abs(curtainTarget - curtainOpen) < 0.002) curtainOpen = curtainTarget;
    setCurtains(curtainOpen);

    const flicker = reduced ? 1 : 0.94 + 0.06 * Math.sin(clock * 37.7) * Math.sin(clock * 11.3 + 1.7);
    const glow = light * flicker;
    screenMat.color.setScalar(0.18 + 0.82 * glow);
    screenLight.intensity = 14 + 110 * glow;
    frontScreenLight.intensity = screenLight.intensity;
    hemi.intensity = 0.05 + 1.25 * house;
    frontHemi.intensity = 0.04 + 0.5 * house;
    sconceL.intensity = 22 * house;
    sconceR.intensity = 22 * house;
    sconceMat.color.setRGB(1, 0.79, 0.54).multiplyScalar(0.25 + 0.95 * house);
    if (beam) beam.material.uniforms.uI.value = glow * (1 - house * 0.8);
    if (dust) {
      dust.material.opacity = 0.55 * glow * (1 - house * 0.7);
      if (!reduced) {
        const arr = dust.geometry.attributes.position.array;
        const { base, seeds } = dust.userData;
        for (let i = 0; i < seeds.length; i += 1) {
          const sd = seeds[i];
          arr[i * 3] = base[i * 3] + Math.sin(clock * 0.21 + sd) * 0.18;
          arr[i * 3 + 1] = base[i * 3 + 1] + Math.sin(clock * 0.17 + sd * 1.7) * 0.22;
          arr[i * 3 + 2] = base[i * 3 + 2] + Math.cos(clock * 0.13 + sd) * 0.18;
        }
        dust.geometry.attributes.position.needsUpdate = true;
      }
    }

    /* 視点：マウスで少し身を乗り出す。指の端末は、ゆっくり呼吸するように */
    if (!reduced) {
      if (!fine) {
        pointer.tx = Math.sin(clock * 0.23) * 0.35;
        pointer.ty = Math.sin(clock * 0.31) * 0.25;
      }
      pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 2.4));
      pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-dt * 2.4));
      eye.set(pointer.x * 0.42, -pointer.y * 0.16 + Math.sin(clock * 0.9) * 0.008, 0);
    }
    project();

    /* 前の人：たまに少し動く。ポップコーンが当たると、ふり返る */
    for (const h of heads) {
      const since = clock - h.hitAt;
      const idle = reduced ? 0 : Math.sin(clock * 0.5 + h.base.x) * 0.012;
      if (since < 1.4) {
        const k = Math.sin(Math.min(1, since / 1.4) * Math.PI);
        h.mesh.position.set(h.base.x, h.base.y + 0.03 * k + idle, h.base.z);
        h.head.rotation.y = h.turn * 1.1 * k;
        h.head.rotation.z = -h.turn * 0.12 * k;
      } else {
        h.mesh.position.set(h.base.x + idle * 0.5, h.base.y + idle, h.base.z);
        h.head.rotation.set(0, 0, Math.sin(clock * 0.37 + h.base.x * 3) * 0.04);
      }
    }

    for (let i = pops.length - 1; i >= 0; i -= 1) {
      const pc = pops[i];
      const age = clock - pc.born;
      if (age < 0) continue;
      const s = pc.sprite;
      if (!pc.landed) {
        pc.vel.addScaledVector(GRAVITY, dt);
        s.position.addScaledVector(pc.vel, dt);
        s.material.rotation += pc.spin * dt;
        for (const h of heads) {
          if (clock - h.hitAt > 1.4 && s.position.distanceTo(h.mesh.position) < 0.2) {
            h.hitAt = clock;
            pc.vel.multiplyScalar(-0.25);
            pc.vel.y = 1.4;
          }
        }
        const k = Math.max(1, Math.min(dims.rows, Math.round(-s.position.z / ROW)));
        const floorHere = dims.seatTops[k] - 0.05;
        if (pc.vel.y < 0 && s.position.y < floorHere && s.position.z < -0.6) {
          pc.vel.y *= -0.28;
          pc.vel.x *= 0.4;
          pc.vel.z *= 0.4;
          if (Math.abs(pc.vel.y) < 0.6) pc.landed = true;
          pc.bounces = (pc.bounces || 0) + 1;
          if (pc.bounces > 2) pc.landed = true;
        }
      }
      s.material.opacity = age > 2 ? Math.max(0, 1 - (age - 2) / 0.6) : 1;
      if (age > 2.6) {
        frontScene.remove(s);
        s.material.dispose();
        pops.splice(i, 1);
      }
    }
  }

  /* ---------- 大きさ ---------- */
  let layout = null;
  function resize(next) {
    layout = next || layout || { ...window.theaterRect, viewW: window.innerWidth, viewH: window.innerHeight };
    const W = layout.viewW;
    const H = layout.viewH;
    const ratio = Math.min(window.devicePixelRatio || 1, W < 720 ? 1.5 : 1.75);
    for (const r of [back, front]) {
      r.setPixelRatio(ratio);
      r.setSize(W, H, false);
    }
    build(layout);
    project();
    render();
  }
  let resizeTimer = 0;
  document.addEventListener("theater:layout", (event) => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => resize(event.detail), layout ? 120 : 0);
  });

  function render() {
    back.render(backScene, camera);
    front.render(frontScene, camera);
  }

  /* ---------- 上映の合図 ---------- */
  function show(instant) {
    houseTarget = 0.06;
    lightTarget = 1;
    curtainTarget = 1;
    if (instant || reduced) {
      house = houseTarget;
      light = lightTarget;
      curtainOpen = 1;
    }
    kick();
  }
  document.addEventListener("theater:show", (event) => show(event.detail && event.detail.instant));
  if (root.classList.contains("is-showing")) show(true);
  document.addEventListener("theater:cut", () => {
    light = 0.35;
    kick();
  });
  document.addEventListener("theater:throw", (event) => {
    throwFrom(event.detail.x, event.detail.y);
    kick();
  });
  window.addEventListener("pointermove", (event) => {
    if (!fine) return;
    pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (event.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  /* ---------- 描画のループ ---------- */
  let running = false;
  let last = 0;
  let idleUntil = 0;
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    step(dt);
    render();
    if (reduced && now > idleUntil && !pops.length) {
      running = false;
      return;
    }
    requestAnimationFrame(frame);
  }
  function kick() {
    idleUntil = performance.now() + 2500;
    if (running || document.hidden) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) running = false;
    else kick();
  });

  resize();
  if (!reduced) kick();
  else render();
}
