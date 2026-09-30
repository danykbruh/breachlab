// BreachLab — 3D-глобус «карта угроз» на главной (Three.js).
// Точки на сфере складываются в «континенты», между ними летят красные дуги-атаки,
// вокруг вращается орбита со спутником. Сцена запускается только когда холст на экране,
// ставится на паузу во вкладке в фоне и уважает «уменьшить движение» в системе.
import * as THREE from "three";

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let app = null;


function check() {
  const canvas = document.getElementById("hero3d");
  if (canvas && (!app || app.canvas !== canvas)) { app?.dispose(); app = null; try { app = mount(canvas); } catch (e) { console.warn("BreachLab 3D:", e); canvas.remove(); } }
  if (!canvas && app) { app.dispose(); app = null; }
}

// ---------- простой 3D-шум для «континентов» ----------
function hash(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function noise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  return l(l(l(c(0,0,0), c(1,0,0), u), l(c(0,1,0), c(1,1,0), u), v), l(l(c(0,0,1), c(1,0,1), u), l(c(0,1,1), c(1,1,1), u), v), w);
}
const land = (p) => noise(p.x * 1.6 + 3, p.y * 1.6, p.z * 1.6) * 0.65 + noise(p.x * 3.4, p.y * 3.4 + 7, p.z * 3.4) * 0.35;

function mount(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0.4, 7.2);
  camera.lookAt(0, 0, 0);

  const world = new THREE.Group();
  world.rotation.z = 0.28;                   // наклон оси, как у Земли
  scene.add(world);
  const globe = new THREE.Group();
  world.add(globe);
  const R = 1.6;

  // Тёмное ядро с красным свечением по краю (эффект Френеля)
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.985, 64, 64),
    new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { uColor: { value: new THREE.Color(0xff3b3b) } },
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
        void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.6); vec3 base = vec3(0.035,0.03,0.035);
          gl_FragColor = vec4(base + uColor * f * 0.9, 0.96); }`,
    }));
  globe.add(core);

  // Внешнее свечение атмосферы
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.18, 48, 48),
    new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vN; void main(){ float i = pow(0.62 - dot(vN, vec3(0.0,0.0,1.0)), 3.0); gl_FragColor = vec4(1.0,0.23,0.23,1.0) * i * 1.6; }`,
    }));
  world.add(halo);

  // Точки-«города»: сфера Фибоначчи, оставляем только «сушу»
  const N = innerWidth < 700 ? 2600 : 4200;
  const pos = [], landPts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = golden * i;
    const p = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
    if (land(p) > 0.5) { const q = p.clone().multiplyScalar(R); pos.push(q.x, q.y, q.z); landPts.push(q); }
  }
  const dotsGeo = new THREE.BufferGeometry();
  dotsGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const dots = new THREE.Points(dotsGeo, new THREE.PointsMaterial({ color: 0xff6b6b, size: 0.028, sizeAttenuation: true, transparent: true, opacity: 0.85 }));
  globe.add(dots);

  // Сетка широт — тонкие кольца для «технологичного» вида
  const gridMat = new THREE.LineBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.08 });
  for (let k = -2; k <= 2; k++) {
    const lat = (k / 3) * (Math.PI / 2), rr = Math.cos(lat) * R * 1.002, yy = Math.sin(lat) * R * 1.002;
    const pts = []; for (let a = 0; a <= 96; a++) { const t = (a / 96) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(t) * rr, yy, Math.sin(t) * rr)); }
    globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
  }

  // Орбита со спутником
  const orbit = new THREE.Group(); orbit.rotation.set(1.15, 0.3, 0); world.add(orbit);
  const ringPts = []; for (let a = 0; a <= 160; a++) { const t = (a / 160) * Math.PI * 2; ringPts.push(new THREE.Vector3(Math.cos(t) * R * 1.55, Math.sin(t) * R * 1.55, 0)); }
  orbit.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), new THREE.LineBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.35 })));
  const sat = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  orbit.add(sat);

  // Дуги-«атаки» между точками суши, рисуются и гаснут по очереди
  const ARCS = innerWidth < 700 ? 7 : 12, SEG = 64;
  const arcs = [];
  const pulseGeo = new THREE.RingGeometry(0.03, 0.05, 24);
  for (let i = 0; i < ARCS; i++) {
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array((SEG + 1) * 3), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: i % 4 === 0 ? 0xffffff : 0xff3b3b, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
    const pulse = new THREE.Mesh(pulseGeo, new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    globe.add(line, pulse);
    const a = { line, pulse, t: -Math.random() * 3, dur: 1.6 + Math.random() * 1.4 };
    reset(a); arcs.push(a);
  }
  function reset(a) {
    if (!landPts.length) return;
    let p1, p2, tries = 0;
    do { p1 = landPts[(Math.random() * landPts.length) | 0]; p2 = landPts[(Math.random() * landPts.length) | 0]; tries++; }
    while ((p1.distanceTo(p2) < R * 0.6 || p1.distanceTo(p2) > R * 1.7) && tries < 30);
    const mid = p1.clone().add(p2).multiplyScalar(0.5); mid.setLength(R + p1.distanceTo(p2) * 0.45);
    const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
    const arr = a.line.geometry.attributes.position.array;
    curve.getPoints(SEG).forEach((p, j) => { arr[j * 3] = p.x; arr[j * 3 + 1] = p.y; arr[j * 3 + 2] = p.z; });
    a.line.geometry.attributes.position.needsUpdate = true;
    a.line.geometry.computeBoundingSphere();
    a.pulse.position.copy(p2); a.pulse.lookAt(p2.clone().multiplyScalar(2)); a.pulse.scale.setScalar(0.001);
  }

  // Размер под контейнер
  function resize() {
    const w = canvas.clientWidth || 400, h = canvas.clientHeight || 400;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  // Мышь — лёгкий наклон; перетаскивание — вращение глобуса
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 }; let drag = null, spin = 0;
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    ptr.tx = ((e.clientX - r.left) / r.width - 0.5) * 2; ptr.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    if (drag !== null) { spin += (e.clientX - drag) * 0.006; drag = e.clientX; }
  };
  const onDown = (e) => { drag = e.clientX; canvas.setPointerCapture?.(e.pointerId); };
  const onUp = () => { drag = null; };
  canvas.addEventListener("pointermove", onMove); canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp); canvas.addEventListener("pointercancel", onUp);

  // Анимация: только когда холст виден и вкладка активна
  let visible = true, raf = 0, last = performance.now(), t = 0, appear = reduceMotion ? 1 : 0;
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; wake(); }, { threshold: 0.01 }); io.observe(canvas);
  const onVis = () => wake(); document.addEventListener("visibilitychange", onVis);
  function wake() { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  function frame(now) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 0.05); last = now; t += dt;
    appear = Math.min(1, appear + dt * 0.8);
    const e = 1 - Math.pow(1 - appear, 3);
    world.scale.setScalar(0.85 + 0.15 * e);
    dots.material.opacity = 0.85 * e;

    const k = 1 - Math.exp(-dt * 4);
    ptr.x += (ptr.tx - ptr.x) * k; ptr.y += (ptr.ty - ptr.y) * k;
    if (!reduceMotion) { globe.rotation.y += dt * 0.12; orbit.rotation.z += dt * 0.35; }
    globe.rotation.y += spin * 0.1; spin *= 0.9;
    world.rotation.x = ptr.y * 0.15; world.rotation.y = ptr.x * 0.25;
    const st = t * 0.6; sat.position.set(Math.cos(st) * R * 1.55, Math.sin(st) * R * 1.55, 0);

    for (const a of arcs) {
      if (reduceMotion) { a.line.geometry.setDrawRange(0, SEG + 1); continue; }
      a.t += dt;
      const p = a.t / a.dur;                                   // 0..1 рост, 1..1.6 пульс и угасание
      if (p < 0) { a.line.visible = false; a.pulse.visible = false; continue; }
      a.line.visible = true;
      const head = Math.min(1, p), tail = Math.max(0, (p - 0.9) / 0.7);
      const from = Math.floor(tail * SEG), to = Math.ceil(head * SEG) + 1;
      a.line.geometry.setDrawRange(from, Math.max(0, to - from));
      a.pulse.visible = p >= 1;
      if (p >= 1) { const q = (p - 1) / 0.6; a.pulse.scale.setScalar(1 + q * 5); a.pulse.material.opacity = 1 - q; }
      if (p > 1.6) { a.t = -Math.random() * 1.5; reset(a); }
    }
    renderer.render(scene, camera);
    if (visible && !document.hidden && !reduceMotion) raf = requestAnimationFrame(frame);
    else if (reduceMotion && appear < 1) raf = requestAnimationFrame(frame);
  }
  canvas.classList.add("ready");
  if (reduceMotion) { renderer.render(scene, camera); }
  wake();

  return {
    canvas,
    dispose() {
      cancelAnimationFrame(raf); raf = 0; visible = false;
      io.disconnect(); ro.disconnect(); document.removeEventListener("visibilitychange", onVis);
      scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
      renderer.dispose();
    },
  };
}

// Следим, появился ли холст (главная страница перерисовывается при смене маршрута).
// Запуск в самом конце файла — когда все функции и константы уже объявлены.
new MutationObserver(check).observe(document.getElementById("main"), { childList: true, subtree: true });
check();
