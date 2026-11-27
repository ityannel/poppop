/* トップの 3D。
 * 透明な管の中を、粒が流れていく。>> の輪をくぐるたびに熱くなって、出口で写真のポップコーンに弾け、下に積もる。
 * マウスでカメラが回り込み、クリックすると近くのポップコーンが跳ねる。
 * three.js（MIT）は lp/vendor/ に置いている。動きを減らす設定の人と、WebGL が使えない端末では、何もしない。
 */
import * as THREE from "./vendor/three.module.min.js";

const hero = document.querySelector(".hero");
const win = hero ? hero.querySelector(".hero-demo .crt") || hero.querySelector(".hero-demo .window") : null;
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (hero && win && !reduced) start();

function start() {
  const INK = 0x13204a;
  const canvas = document.createElement("canvas");
  canvas.className = "hero-3d";
  canvas.setAttribute("aria-hidden", "true");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch {
    return;
  }
  renderer.setClearColor(0x000000, 0);
  hero.append(canvas);
  hero.classList.add("is-3d");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const CAM_Z = 20;
  camera.position.set(0, 0, CAM_Z);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xffe2a8, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(-4, 6, 9);
  scene.add(sun);

  /* ---------- 絵の具：3 段のトゥーンと、インクのふち ---------- */
  const tones = new Uint8Array([110, 190, 255]);
  const gradient = new THREE.DataTexture(tones, 3, 1, THREE.RedFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...extra });
  const inkBack = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });

  function withOutline(geometry, material, width = 1.08) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(geometry, material);
    const line = new THREE.Mesh(geometry, inkBack);
    line.scale.setScalar(width);
    group.add(line, body);
    group.userData.body = body;
    return group;
  }

  /* ---------- 粒（写真）。熱くなると赤みがかる ---------- */
  const KERNEL_COLD = new THREE.Color(0xffffff);
  const KERNEL_HOT = new THREE.Color(0xff8a5c);

  /* ---------- ガラスの管：ふちだけ濃く、中は透ける ---------- */
  const glass = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uInk: { value: new THREE.Color(INK) }, uTint: { value: new THREE.Color(0xcfe6ff) } },
    vertexShader: `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uInk;
      uniform vec3 uTint;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float edge = smoothstep(0.6, 0.68, f);
        float sheen = smoothstep(0.3, 0.5, f) * (1.0 - edge);
        vec3 c = mix(uTint, uInk, edge);
        gl_FragColor = vec4(c, mix(0.1 + sheen * 0.3, 1.0, edge));
        #include <colorspace_fragment>
      }`,
  });
  const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });

  /* ---------- >> の札 ---------- */
  function labelTexture(text, bg, fg) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const g = c.getContext("2d");
    const r = 52;
    g.lineWidth = 10;
    g.strokeStyle = "#13204a";
    g.fillStyle = "#13204a";
    roundRect(g, 14, 18, 232, 104, r);
    g.fill();
    g.fillStyle = bg;
    roundRect(g, 6, 8, 232, 104, r);
    g.fill();
    g.stroke();
    g.fillStyle = fg;
    g.font = "700 58px Silkscreen, DotGothic16, monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 122, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function burstTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    g.translate(128, 128);
    g.beginPath();
    for (let i = 0; i < 24; i += 1) {
      const a = (i / 24) * Math.PI * 2;
      const r = i % 2 ? 62 : 112;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = "#ffd23f";
    g.strokeStyle = "#13204a";
    g.lineWidth = 9;
    g.fill();
    g.stroke();
    g.fillStyle = "#13204a";
    g.font = "700 50px Silkscreen, DotGothic16, monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.rotate(-0.12);
    g.fillText("pop!", 0, 4);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  let popTexture = burstTexture();

  /* ---------- 写真のポップコーン ---------- */
  const loader = new THREE.TextureLoader();
  const popTextures = Array.from({ length: 15 }, (_, i) => {
    const tex = loader.load(new URL(`./img/pop/pop-${String(i + 1).padStart(2, "0")}.webp`, import.meta.url).href);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });

  const KERNEL_ASPECT = [213, 199, 200, 174, 193, 182, 189, 206, 203, 197, 193, 220, 190, 202, 203].map((w) => w / 240);
  const kernelTextures = KERNEL_ASPECT.map((_, i) => {
    const tex = loader.load(new URL(`./img/kernel/kernel-${String(i + 1).padStart(2, "0")}.webp`, import.meta.url).href);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData.keep = true;
    return tex;
  });
  const bucketBackTex = loader.load(new URL("./img/skeuo/bucket.webp", import.meta.url).href);
  const bucketFrontTex = loader.load(new URL("./img/skeuo/bucket-front.webp", import.meta.url).href);
  [bucketBackTex, bucketFrontTex].forEach((tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData.keep = true;
  });
  const BUCKET_ASPECT = 520 / 705;
  let bucket = null;

  /* ---------- 画面の大きさと、管の通り道 ---------- */
  const RINGS = [
    { at: 0.34, atNarrow: 0.2, color: 0xff4f8b, label: ">>", bg: "#ff4f8b", fg: "#ffffff" },
    { at: 0.62, atNarrow: 0.32, color: 0x2ed3a0, label: ">>", bg: "#2ed3a0", fg: "#13204a" },
    { at: 0.9, atNarrow: 0.9, color: 0xffd23f, label: "pop", bg: "#ffd23f", fg: "#13204a" },
  ];
  const pipeGroup = new THREE.Group();
  scene.add(pipeGroup);
  let curve = null;
  let ringObjects = [];
  let W = 1;
  let H = 1;
  let R = 0.36;
  let floorY = -5;
  let wallL = -8;
  let wallR = 8;
  let narrow = false;
  let U = 0.01;
  const px = (n) => n * U;

  function halfAt(z) {
    const hh = (CAM_Z - z) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return [hh * camera.aspect, hh];
  }
  function toWorld(px, py, z) {
    const [hw, hh] = halfAt(z);
    return new THREE.Vector3((px / W - 0.5) * 2 * hw, -(py / H - 0.5) * 2 * hh, z);
  }

  function clearPipe() {
    pipeGroup.children.slice().forEach((child) => {
      pipeGroup.remove(child);
      child.traverse((o) => {
        if (o.geometry && !o.isSprite) o.geometry.dispose();
        if (o.material && o.material.map && o.material.map !== popTexture && !o.material.map.userData.keep) o.material.map.dispose();
      });
    });
    ringObjects = [];
  }

  function buildPipe() {
    clearPipe();
    const hr = hero.getBoundingClientRect();
    const wr = win.getBoundingClientRect();
    const L = wr.left - hr.left;
    const T = wr.top - hr.top;
    const Rt = wr.right - hr.left;
    const B = wr.bottom - hr.top;
    narrow = W < 980;
    R = px(narrow ? 12 : 18);
    const side = Math.min(Rt + (narrow ? 4 : 30), W - (narrow ? 18 : 34));
    const tray = hero.querySelector(".tray");
    const tr = tray ? tray.getBoundingClientRect() : null;
    const trayRight = tr ? tr.right - hr.left : W * 0.6;
    const trayBottom = tr ? tr.bottom - hr.top : H - 40;
    const fy = narrow ? H - 10 : Math.min(H - 4, trayBottom + 6);
    const Hbs = narrow ? THREE.MathUtils.clamp(112 + (W - 400) * 0.14, 112, 160) : THREE.MathUtils.clamp(190 + (W - 1024) * 0.134, 176, 236);
    const bwS = Hbs * BUCKET_ASPECT;
    const bxS = narrow ? W - 6 - bwS / 2 : Math.min(W - 12 - bwS / 2, side + 10);
    const bTopS = fy - Hbs;
    const endY = Math.max(B + 24, bTopS + 0.12 * Hbs);
    let pts;
    if (!narrow) {
      pts = [
        toWorld(Rt - 150, -70, -0.4),
        toWorld(Rt - 40, T - 34, 0.2),
        toWorld(side, T + 60, 0.5),
        toWorld(side + 6, T + (B - T) * 0.62, 0.6),
        toWorld(side - 10, B + 16, 0.5),
        toWorld(bxS, endY, 0.3),
      ];
    } else {
      pts = [
        toWorld(W + 50, T + (B - T) * 0.22, 0),
        toWorld(side, T + (B - T) * 0.48, 0.2),
        toWorld(side, B + 24, 0.3),
        toWorld(bxS, endY, 0.3),
      ];
    }
    curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 220, R, 28, false), glass);
    tube.renderOrder = 2;
    const shineCurve = new THREE.CatmullRomCurve3(curve.getSpacedPoints(60).map((p) => p.clone().add(new THREE.Vector3(-R * 0.42, R * 0.5, R * 0.55))));
    const shine = new THREE.Mesh(new THREE.TubeGeometry(shineCurve, 160, R * 0.09, 8, false), shineMat);
    shine.renderOrder = 3;
    pipeGroup.add(tube, shine);

    const torus = new THREE.TorusGeometry(R * 1.22, R * 0.3, 16, 44);
    RINGS.forEach((ring, i) => {
      const at = narrow ? ring.atNarrow : ring.at;
      const p = curve.getPointAt(at);
      const tangent = curve.getTangentAt(at);
      const obj = withOutline(torus, toon(ring.color), 1.07);
      obj.position.copy(p);
      obj.lookAt(p.clone().add(tangent));
      pipeGroup.add(obj);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(ring.label, ring.bg, ring.fg), depthTest: false }));
      const out = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
      const wide = px(narrow ? 46 : 56);
      const gap = R * 1.2 + wide * 0.52;
      const flat = Math.abs(out.x) > 0.5;
      const right = flat && !narrow && p.x + Math.abs(out.x) * gap + wide * 0.5 < halfAt(p.z + 0.6)[0] - px(6);
      if (flat ? out.x > 0 !== right : out.y > 0) out.negate();
      if (flat && !narrow && !right) {
        const up = tangent.clone().setZ(0).normalize();
        if (up.y < 0) up.negate();
        label.position.copy(p).addScaledVector(up, R * 1.1 + wide * 0.3).add(new THREE.Vector3(0, 0, 0.6));
      } else {
        label.position.copy(p).addScaledVector(out, gap).add(new THREE.Vector3(0, 0, 0.6));
      }
      const edge = halfAt(label.position.z)[0] - px(6) - wide / 2;
      label.position.x = THREE.MathUtils.clamp(label.position.x, -edge, edge);
      label.scale.set(wide, wide / 2, 1);
      label.renderOrder = 5;
      pipeGroup.add(label);
      ringObjects.push({ obj, label, at, pulse: 0 });
    });

    const [hw] = halfAt(0);
    wallR = hw - px(14);
    floorY = toWorld(0, fy, 0).y;
    wallL = toWorld(narrow ? 6 : Math.max(trayRight + 24, L), 0, 0).x;

    const Hb0 = px(Hbs);
    const Wb0 = Hb0 * BUCKET_ASPECT;
    bucket = { cx: toWorld(bxS, 0, 0).x, wI: Wb0 * 0.4, tW: Wb0 * 0.06, top: floorY + Hb0 * 0.78, base: floorY + Hb0 * 0.075 };
    [[bucketBackTex, -px(125)], [bucketFrontTex, px(150)]].forEach(([tex, z]) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
      const h = Hb0 * ((CAM_Z - z) / CAM_Z);
      sprite.scale.set(h * BUCKET_ASPECT, h, 1);
      sprite.position.copy(toWorld(bxS, fy - Hbs / 2, z));
      pipeGroup.add(sprite);
    });
  }

  function resize() {
    const r = hero.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, W < 980 ? 1.5 : 1.75));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    U = (2 * halfAt(0)[1]) / H;
    buildPipe();
  }

  /* ---------- 流れる粒 ---------- */
  const kernels = [];
  let spawnIn = 0.2;
  function spawnKernel() {
    const i = Math.floor(Math.random() * kernelTextures.length);
    const mat = new THREE.SpriteMaterial({ map: kernelTextures[i], alphaTest: 0.35, rotation: Math.random() * 6.28 });
    const obj = new THREE.Sprite(mat);
    const h = px(narrow ? 34 : 46);
    obj.scale.set(h * KERNEL_ASPECT[i], h, 1);
    scene.add(obj);
    kernels.push({ obj, mat, w: h * KERNEL_ASPECT[i], h, s: 0, speed: 0.15 + Math.random() * 0.03, spin: new THREE.Vector3(0, 0, Math.random() * 2 - 1), passed: 0 });
  }
  function removeKernel(k) {
    scene.remove(k.obj);
    k.mat.dispose();
    kernels.splice(kernels.indexOf(k), 1);
  }

  /* ---------- 弾けたポップコーン（球として転がる） ---------- */
  const pops = [];
  const maxPops = () => (narrow ? 18 : 54);
  function spawnPop(pos, vel, scale = 1) {
    const mat = new THREE.SpriteMaterial({ map: popTextures[Math.floor(Math.random() * popTextures.length)], alphaTest: 0.35, rotation: Math.random() * Math.PI * 2 });
    const sprite = new THREE.Sprite(mat);
    const size = px(narrow ? 44 : 64) * scale * (0.85 + Math.random() * 0.35);
    sprite.scale.setScalar(0.01);
    sprite.position.copy(pos);
    scene.add(sprite);
    pops.push({ sprite, mat, size, r: size * 0.36, vel: vel.clone(), spin: (Math.random() - 0.5) * 8, grow: 0, age: 0, fade: -1 });
    if (pops.length > maxPops()) {
      const old = pops.find((p) => p.fade < 0);
      if (old) old.fade = 0;
    }
  }
  const bursts = [];
  function spawnBurst(pos) {
    const mat = new THREE.SpriteMaterial({ map: popTexture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos).add(new THREE.Vector3(0, 0, 0.8));
    sprite.renderOrder = 6;
    scene.add(sprite);
    bursts.push({ sprite, mat, t: 0 });
  }

  function popKernel(k, burst = true) {
    const p = k.obj.position.clone();
    const tangent = curve.getTangentAt(Math.min(1, k.s));
    const vel = tangent.multiplyScalar(px(70)).add(new THREE.Vector3(px((Math.random() - 0.5) * 70), px(240 + Math.random() * 130), px((Math.random() - 0.5) * 70)));
    spawnPop(p, vel, 1.1);
    if (burst) spawnBurst(p);
    removeKernel(k);
  }

  /* ---------- マウス：カメラが回り込む。クリックで跳ねる ---------- */
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  hero.addEventListener("pointermove", (event) => {
    const r = hero.getBoundingClientRect();
    pointer.tx = (event.clientX - r.left) / r.width - 0.5;
    pointer.ty = (event.clientY - r.top) / r.height - 0.5;
  });
  hero.addEventListener("pointerleave", () => { pointer.tx = 0; pointer.ty = 0; });
  hero.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("input, textarea, select, label, [data-nopop], .kernel")) return;
    const r = hero.getBoundingClientRect();
    ndc.set(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(kernels.map((k) => k.obj), false)[0];
    if (hit) {
      const k = kernels.find((x) => x.obj === hit.object);
      if (k) popKernel(k);
    }
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const at = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, at)) return;
    pops.forEach((p) => {
      const d = p.sprite.position.clone().sub(at);
      d.z = 0;
      const dist = d.length();
      const reach = px(200);
      if (dist > reach) return;
      const k = (1 - dist / reach) * px(760);
      p.vel.x += (d.x / (dist || 1)) * k * 0.6;
      p.vel.y += k;
      p.spin += (Math.random() - 0.5) * 14;
    });
  });

  /* ---------- 動かす ---------- */
  const clock = new THREE.Clock();
  let running = false;
  let visible = true;
  const tmp = new THREE.Vector3();

  function collideBox(p, x0, x1, y0, y1) {
    const pos = p.sprite.position;
    const dx = pos.x - Math.max(x0, Math.min(x1, pos.x));
    const dy = pos.y - Math.max(y0, Math.min(y1, pos.y));
    const d = Math.hypot(dx, dy);
    if (d >= p.r) return;
    let nx = 0;
    let ny = 0;
    if (d > 1e-6) {
      nx = dx / d;
      ny = dy / d;
      pos.x += nx * (p.r - d);
      pos.y += ny * (p.r - d);
    } else {
      const edges = [[pos.x - x0, -1, 0], [x1 - pos.x, 1, 0], [pos.y - y0, 0, -1], [y1 - pos.y, 0, 1]].sort((a, b) => a[0] - b[0]);
      [, nx, ny] = edges[0];
      pos.x += nx * (edges[0][0] + p.r);
      pos.y += ny * (edges[0][0] + p.r);
    }
    const vn = p.vel.x * nx + p.vel.y * ny;
    if (vn < 0) {
      p.vel.x -= 1.28 * vn * nx;
      p.vel.y -= 1.28 * vn * ny;
      p.vel.x *= 0.94;
    }
  }

  function step(dt) {
    spawnIn -= dt;
    if (spawnIn <= 0 && kernels.length < 7) {
      spawnKernel();
      spawnIn = 1.25 + Math.random() * 0.6;
    }
    kernels.slice().forEach((k) => {
      k.s += k.speed * dt;
      const heat = THREE.MathUtils.clamp((k.s - ringObjects[0].at) / (ringObjects[2].at - ringObjects[0].at), 0, 1);
      k.mat.color.copy(KERNEL_COLD).lerp(KERNEL_HOT, heat);
      if (k.s >= 1) { popKernel(k); return; }
      const p = curve.getPointAt(k.s);
      const shake = heat * heat * px(6);
      k.obj.position.set(p.x + (Math.random() - 0.5) * shake, p.y + (Math.random() - 0.5) * shake, p.z);
      k.mat.rotation += k.spin.z * dt * (1 + heat * 3);
      const swell = 1 + heat * 0.2;
      k.obj.scale.set(k.w * swell, k.h * swell, 1);
      ringObjects.forEach((ring, i) => {
        if (k.passed <= i && k.s >= ring.at) {
          k.passed = i + 1;
          ring.pulse = 1;
        }
      });
    });
    ringObjects.forEach((ring) => {
      ring.pulse = Math.max(0, ring.pulse - dt * 3.2);
      const s = 1 + Math.sin(ring.pulse * Math.PI) * 0.22;
      ring.obj.scale.setScalar(s);
      ring.label.material.rotation = Math.sin(ring.pulse * Math.PI) * 0.12;
    });

    const zMin = -px(110);
    const zMax = px(130);
    pops.forEach((p) => {
      p.age += dt;
      p.grow = Math.min(1, p.grow + dt * 5);
      p.vel.y -= px(1000) * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      const pos = p.sprite.position;
      if (pos.y - p.r < floorY) {
        pos.y = floorY + p.r;
        if (p.vel.y < 0) p.vel.y *= -0.28;
        p.vel.x *= 0.86;
        p.vel.z *= 0.86;
        p.spin *= 0.8;
      }
      if (pos.x > wallR - p.r) { pos.x = wallR - p.r; p.vel.x *= -0.5; }
      if (bucket) {
        collideBox(p, bucket.cx - bucket.wI - bucket.tW, bucket.cx - bucket.wI, floorY, bucket.top);
        collideBox(p, bucket.cx + bucket.wI, bucket.cx + bucket.wI + bucket.tW, floorY, bucket.top);
        collideBox(p, bucket.cx - bucket.wI, bucket.cx + bucket.wI, floorY, bucket.base);
      }
      if (pos.y < floorY + px(180) && pos.x < wallL + p.r) { pos.x = wallL + p.r; p.vel.x = Math.abs(p.vel.x) * 0.5; }
      if (pos.z > zMax) { pos.z = zMax; p.vel.z *= -0.4; }
      if (pos.z < zMin) { pos.z = zMin; p.vel.z *= -0.4; }
      p.mat.rotation += p.spin * dt;
      p.spin *= 1 - Math.min(1, dt * 0.6);
    });
    for (let i = 0; i < pops.length; i += 1) {
      const a = pops[i];
      for (let j = i + 1; j < pops.length; j += 1) {
        const b = pops[j];
        tmp.subVectors(b.sprite.position, a.sprite.position);
        const dist = tmp.length();
        const min = a.r + b.r;
        if (dist >= min || dist === 0) continue;
        tmp.divideScalar(dist);
        const push = (min - dist) / 2;
        a.sprite.position.addScaledVector(tmp, -push);
        b.sprite.position.addScaledVector(tmp, push);
        const rel = (b.vel.x - a.vel.x) * tmp.x + (b.vel.y - a.vel.y) * tmp.y + (b.vel.z - a.vel.z) * tmp.z;
        if (rel < 0) {
          const j2 = -rel * 0.6;
          a.vel.addScaledVector(tmp, -j2);
          b.vel.addScaledVector(tmp, j2);
        }
      }
    }
    pops.slice().forEach((p) => {
      let s = p.size * (p.grow < 1 ? easeOutBack(p.grow) : 1);
      if (p.fade >= 0) {
        p.fade += dt * 2.5;
        s *= Math.max(0, 1 - p.fade);
        if (p.fade >= 1) {
          scene.remove(p.sprite);
          p.mat.dispose();
          pops.splice(pops.indexOf(p), 1);
          return;
        }
      }
      p.sprite.scale.setScalar(s);
    });

    bursts.slice().forEach((b) => {
      b.t += dt * 2.6;
      const s = easeOutBack(Math.min(1, b.t * 1.6)) * px(narrow ? 70 : 96);
      b.sprite.scale.setScalar(s);
      b.mat.opacity = 1 - Math.max(0, (b.t - 0.5) * 2);
      b.mat.rotation = b.t * 0.6;
      if (b.t >= 1) {
        scene.remove(b.sprite);
        b.mat.dispose();
        bursts.splice(bursts.indexOf(b), 1);
      }
    });

    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 4);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 4);
    camera.position.set(pointer.x * 0.9, -pointer.y * 0.6, CAM_Z);
    camera.lookAt(pointer.x * 0.25, -pointer.y * 0.15, 0);
    hero.style.setProperty("--tilt-x", pointer.x.toFixed(3));
    hero.style.setProperty("--tilt-y", pointer.y.toFixed(3));
  }

  function easeOutBack(t) {
    const c = 1.9;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  }

  function frame() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 1 / 30);
    step(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  function play() {
    if (running || !visible || document.hidden) return;
    running = true;
    clock.getDelta();
    requestAnimationFrame(frame);
  }
  function pause() { running = false; }

  resize();
  const ro = new ResizeObserver(() => resize());
  ro.observe(hero);
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load("700 58px Silkscreen"), document.fonts.ready]).then(() => {
      popTexture = burstTexture();
      resize();
    }, () => {});
  }
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) play(); else pause();
  }).observe(hero);
  document.addEventListener("visibilitychange", () => (document.hidden ? pause() : play()));
  // 最初から少し積もっているように
  for (let i = 0; i < (narrow ? 3 : 5); i += 1) {
    const x = bucket.cx + (Math.random() - 0.5) * bucket.wI * 0.8;
    spawnPop(new THREE.Vector3(x, bucket.base + px((narrow ? 24 : 36) + i * (narrow ? 34 : 52)), px((Math.random() - 0.5) * 80)), new THREE.Vector3(0, 0, 0), 1);
  }
  play();
}
