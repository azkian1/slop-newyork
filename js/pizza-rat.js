// Pizza Rat skin: takes a loaded Quaternius rat GLTF and adds glossy black eyes
// and a soft, skinned, spring-driven pizza slice held in the mouth.
// Usage: const rat = makePizzaRat(gltf, THREE); scene.add(rat.root); rat.update(dt) each frame.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CLIPS = {
  idle: ['RatArmature|Rat_Idle', 'idle', 'Idle'],
  run: ['RatArmature|Rat_Run', 'run', 'Run'],
  walk: ['RatArmature|Rat_Walk', 'walk', 'Walk'],
  jump: ['RatArmature|Rat_Jump', 'jump', 'Jump']
};

function findClip(animations, names) {
  for (const name of names) {
    const clip = THREE.AnimationClip.findByName(animations, name);
    if (clip) return clip;
  }
  return null;
}

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// Closed slab, wedge-shaped in XZ, subdivided along Z (for skinning) and X.
function slab(THREE, { z0, z1, width, y0, y1, nz = 18, nx = 8, wobble = 0, seed = 1 }) {
  const r = rng(seed), pos = [], idx = [];
  const rows = nz + 1, cols = nx + 1;
  const noise = []; for (let i = 0; i < rows * cols; i++) noise.push((r() - 0.5) * wobble);
  const ring = (yy, yn) => {
    const base = pos.length / 3;
    for (let i = 0; i < rows; i++) {
      const z = z0 + (z1 - z0) * (i / nz), w = width(z);
      for (let j = 0; j < cols; j++) {
        const x = -w / 2 + w * (j / nx);
        pos.push(x, yy + (yn ? noise[i * cols + j] : 0), z);
      }
    }
    return base;
  };
  const top = ring(y1, true), bot = ring(y0, false);
  const q = (a, b, c, d) => idx.push(a, b, c, a, c, d);
  for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) {
    const a = i * cols + j, b = a + 1, c = a + cols + 1, d = a + cols;
    q(top + a, top + d, top + c, top + b);
    q(bot + a, bot + b, bot + c, bot + d);
  }
  for (let i = 0; i < nz; i++) { // side walls
    const L = i * cols, Ln = L + cols, R = L + nx, Rn = R + cols;
    q(top + L, bot + L, bot + Ln, top + Ln);
    q(top + R, top + Rn, bot + Rn, bot + R);
  }
  for (let j = 0; j < nx; j++) { // back (z0) and tip (z1)
    q(top + j, top + j + 1, bot + j + 1, bot + j);
    const t = nz * cols + j; q(top + t, bot + t, bot + t + 1, top + t + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

const clean = (g) => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g.index ? g : g; };

export function buildPizza(THREE, { L = 5.4, W = 3.7, t = 0.13, seed = 7 } = {}) {
  const width = (z) => Math.max(W * (1 - z / L) ** 0.95, 0.06);
  const r = rng(seed);
  // dough + crust
  const dough = slab(THREE, { z0: 0, z1: L, width, y0: 0, y1: t, seed });
  const crust = new THREE.CapsuleGeometry(0.3, W * 0.95, 8, 18); crust.rotateZ(Math.PI / 2); crust.scale(1, 0.85, 1.1); crust.translate(0, t * 0.6, 0.12);
  // cheese layer
  const cw = (z) => Math.max(width(z) * 0.93, 0.04);
  const cheese = slab(THREE, { z0: 0.38, z1: L * 0.985, width: cw, y0: t * 0.7, y1: t + 0.09, nx: 10, wobble: 0.05, seed: seed + 1 });
  const drips = [];
  const drip = (x, y, z, len, rad) => { const d = new THREE.SphereGeometry(rad, 10, 8); d.scale(1, len, 1); d.translate(x, y - rad * len * 0.55, z); drips.push(d); };
  for (let k = 0; k < 7; k++) { // edge drips, more toward the tip
    const z = L * (0.35 + 0.6 * r()), side = r() < 0.5 ? -1 : 1;
    drip(side * cw(z) / 2, t + 0.04, z, 2 + r() * 2.5, 0.07 + r() * 0.05);
  }
  drip(0, t + 0.02, L * 0.97, 3.6, 0.09); drip(0.12, t + 0.02, L * 0.92, 2.4, 0.07);
  // pepperoni, scattered, slightly tilted
  const peps = [];
  const spots = [[0.25, 1.1], [-0.8, 1.0], [0.95, 1.5], [-0.25, 2.15], [0.4, 2.85], [-0.15, 3.6], [0.15, 4.4]];
  for (const [fx, z0] of spots) {
    const z = z0 * (L / 5.4) + (r() - 0.5) * 0.25, rad = 0.3 + r() * 0.07;
    const maxX = Math.max(cw(z) / 2 - rad * 0.9, 0); const x = Math.max(-maxX, Math.min(maxX, fx * (W / 3.7) + (r() - 0.5) * 0.2));
    if (cw(z) < rad * 1.6) continue;
    const p = new THREE.CylinderGeometry(rad, rad * 0.96, 0.06, 20); p.rotateX((r() - 0.5) * 0.25); p.rotateZ((r() - 0.5) * 0.25); p.translate(x, t + 0.12, z); peps.push(p);
  }
  const groups = [mergeGeometries([dough, crust].map(clean)), mergeGeometries([cheese, ...drips].map(clean)), mergeGeometries(peps.map(clean))];
  const geo = mergeGeometries(groups, true);
  // skin to 3 bones along Z
  const pos = geo.attributes.position, n = pos.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const seg = L / 3;
  for (let i = 0; i < n; i++) {
    const s = Math.max(0, Math.min(2, pos.getZ(i) / seg));
    const a = Math.min(Math.floor(s), 1), f = Math.min(s - a, 1);
    if (s >= 2) { si[i * 4] = 2; sw[i * 4] = 1; } else { si[i * 4] = a; si[i * 4 + 1] = a + 1; sw[i * 4] = 1 - f; sw[i * 4 + 1] = f; }
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const mats = [
    new THREE.MeshStandardMaterial({ color: 0xd99a4e, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0xffc23d, roughness: 0.32, emissive: 0x3a2000, emissiveIntensity: 0.25 }),
    new THREE.MeshStandardMaterial({ color: 0xb3302a, roughness: 0.45 }),
  ];
  const bones = [new THREE.Bone(), new THREE.Bone(), new THREE.Bone()];
  bones[1].position.z = seg; bones[2].position.z = seg; bones[0].add(bones[1]); bones[1].add(bones[2]);
  const mesh = new THREE.SkinnedMesh(geo, mats);
  mesh.add(bones[0]); mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true; mesh.frustumCulled = false;
  return { mesh, bones, L, W };
}

export function makePizzaRat(gltf, THREE, opts = {}) {
  const root = new THREE.Group(); const model = gltf.scene; root.add(model);
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  // Grey is the coat. Pink is the ears, feet, and tail already in the file.
  model.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (m.name === 'Grey') { m.color.setRGB(0.075, 0.062, 0.058); m.roughness = 0.75; }
      if (m.name === 'Pink') m.color.multiplyScalar(0.85);
    }
  });
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const [k, names] of Object.entries(CLIPS)) {
    const c = findClip(gltf.animations, names);
    if (c) actions[k] = mixer.clipAction(c);
  }
  if (!actions.idle) throw new Error('rat is missing an idle clip');
  const bone = (n) => model.getObjectByName(n);
  const head = bone('Head'), hips = bone('Hips');
  let headEnd = bone('Head_end');
  actions.idle.play(); mixer.update(0); root.updateMatrixWorld(true);
  const wp = (o) => o.getWorldPosition(new THREE.Vector3());
  if (!headEnd && head && hips) {
    const fwd0 = wp(head).sub(wp(hips));
    fwd0.y = 0;
    if (fwd0.lengthSq() < 1e-6) fwd0.set(0, 0, 1);
    fwd0.normalize();
    headEnd = new THREE.Object3D();
    headEnd.name = 'Head_end';
    headEnd.position.copy(wp(head)).addScaledVector(fwd0, 0.45);
    root.add(headEnd);
    head.attach(headEnd);
    root.updateMatrixWorld(true);
  }
  // face +Z, feet on y=0
  let f = wp(headEnd).sub(wp(hips)); f.y = 0; f.normalize();
  root.rotation.y = -Math.atan2(f.x, f.z) ; root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model); root.position.y = -box.min.y; root.updateMatrixWorld(true);
  const H = wp(head), E = wp(headEnd), d = E.clone().sub(H), hl = d.length();
  const fwd = d.clone().normalize(), up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3().crossVectors(up, fwd).normalize();
  const upL = new THREE.Vector3().crossVectors(fwd, side).normalize();
  // Larger than the studio close-up so the eyes still read from the chase camera. No catchlight.
  const e = opts.eyes || { along: 0.5, up: 0.32, side: 0.3, r: 0.28 };
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.18, metalness: 0 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(e.r * hl, 24, 16), eyeMat); ball.scale.set(1, 1, 0.85); eye.add(ball);
    eye.position.copy(H).addScaledVector(fwd, e.along * hl).addScaledVector(upL, e.up * hl).addScaledVector(side, s * e.side * hl);
    eye.lookAt(eye.position.clone().add(side.clone().multiplyScalar(s).add(fwd.clone().multiplyScalar(0.6))));
    root.add(eye);
    head.attach(eye);
  }
  // pizza: crust along snout direction, clamped in the mouth, slice extends to the rat's side
  const P = buildPizza(THREE, opts.pizza || {});
  const holder = new THREE.Group();
  const p = opts.pizzaPlace || { along: 1.0, down: -0.3, side: 0.0, crustFwd: 0.43, tiltDown: 0.3, yaw: 0.45 };
  holder.position.copy(H).addScaledVector(fwd, p.along * hl).addScaledVector(upL, p.down * hl).addScaledVector(side, p.side * hl);
  // basis: X=fwd (crust axis), Z=side (slice length), Y=up
  const zAx = new THREE.Vector3().crossVectors(fwd, upL).normalize(); holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(fwd.clone(), upL.clone(), zAx));
  holder.rotateY(-p.yaw); holder.rotateX(p.tiltDown);
  const ps = opts.pizzaScale ?? 0.62; P.mesh.scale.setScalar(ps); P.mesh.position.x = p.crustFwd * P.W * ps;
  holder.add(P.mesh); root.add(holder); holder.updateMatrixWorld(true); head.attach(holder);

  // spring state per pizza bone
  const st = P.bones.map(() => ({ ax: 0, ay: 0, vx: 0, vy: 0 }));
  const sag = opts.sag ?? [0.0, 0.36, 0.5];
  const prev = { p: null, v: new THREE.Vector3() };
  const tmpQ = new THREE.Quaternion();
  function stepSpring(dt) {
    const b0 = P.bones[0]; b0.updateWorldMatrix(true, false);
    const pw = b0.getWorldPosition(new THREE.Vector3());
    let acc = new THREE.Vector3();
    if (prev.p) { const v = pw.clone().sub(prev.p).divideScalar(dt); acc = v.clone().sub(prev.v).divideScalar(dt); prev.v.copy(v); }
    prev.p = pw;
    b0.getWorldQuaternion(tmpQ); const aL = acc.applyQuaternion(tmpQ.invert());
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(tmpQ); // gravity in pizza space
    // k and the floor gap were tuned on the unscaled ~7 unit rat. The city scales that
    // model down, so both follow the root's world scale or the slice stands straight up.
    const k = (0.0035 / (opts.pizzaScale ?? 0.62)) * unitScale();
    st.forEach((s, i) => {
      if (i === 0) return;
      const gain = i === 1 ? 1 : 1.4, w = i === 1 ? 13 : 10, z = 0.22;
      const gx = sag[i] * Math.max(0.3, -down.y);
      const tx = gx + k * gain * aL.y, ty = -k * gain * aL.x * 0.8;
      s.vx += (w * w * (tx - s.ax) - 2 * z * w * s.vx) * dt; s.ax += s.vx * dt;
      s.vy += (w * w * (ty - s.ay) - 2 * z * w * s.vy) * dt; s.ay += s.vy * dt;
      s.ax = Math.max(-0.4, Math.min(1.0, s.ax)); s.ay = Math.max(-0.6, Math.min(0.6, s.ay));
      P.bones[i].rotation.set(s.ax, s.ay, 0);
    });
  }
  // ground constraint: bend pizza bones up until no skinned vertex is below the floor
  const baseEps = opts.floorEps ?? 0.012;
  function unitScale() {
    const e = root.matrixWorld.elements;
    const s = Math.hypot(e[0], e[1], e[2]);
    return s > 1e-8 ? s : 1;
  }
  const geoSI = P.mesh.geometry.attributes.skinIndex, geoSW = P.mesh.geometry.attributes.skinWeight;
  const sets = [[], [], []];
  for (let i = 0; i < geoSI.count; i++) for (let c = 0; c < 4; c++) if (geoSW.getComponent(i, c) > 0.001) { const bi = geoSI.getComponent(i, c); for (let k = 1; k <= bi; k++) if (!sets[k].includes(i) ) sets[k].push(i); }
  const vtmp = new THREE.Vector3();
  const minY = (list) => { P.mesh.updateMatrixWorld(true); let m = Infinity; for (const i of list) { P.mesh.getVertexPosition(i, vtmp); vtmp.applyMatrix4(P.mesh.matrixWorld); if (vtmp.y < m) m = vtmp.y; } return m; };
  const allIdx = [...Array(geoSI.count).keys()];
  function groundConstrain() {
    for (let i = 1; i <= 2; i++) {
      const s = st[i], b = P.bones[i];
      const eps = baseEps * unitScale();
      if (minY(sets[i]) >= api.floorY + eps) continue;
      let lo = -1.2, hi = s.ax; // lo lifts tip (negative = bend up)
      for (let it = 0; it < 10; it++) { const mid = (lo + hi) / 2; b.rotation.x = mid; if (minY(sets[i]) >= api.floorY + eps) lo = mid; else hi = mid; }
      s.ax = lo; b.rotation.x = lo; if (s.vx > 0) s.vx *= -0.25; // contact: kill sag velocity, tiny bounce
    }
  }
  const api = {
    pizzaMinY: () => minY(allIdx), floorY: opts.floorY ?? 0,
    root, mixer, actions, clips: CLIPS, head, center: new THREE.Vector3(),
    forward: new THREE.Vector3(0, 0, 1),
    headWorld: () => wp(head),
    reset(clip = 'idle') { mixer.stopAllAction(); actions[clip].reset().play(); mixer.setTime(0); st.forEach((s, i) => { s.ax = sag[i] || 0; s.ay = s.vx = s.vy = 0; }); prev.p = null; prev.v.set(0, 0, 0); for (let i = 0; i < 30; i++) { mixer.update(0); root.updateMatrixWorld(true); stepSpring(1 / 30); groundConstrain(); } },
    crossfade(clip, dur = 0.3) { const nx = actions[clip] || actions.idle; const cur = Object.values(actions).find((a) => a.isRunning()); nx.reset().play(); if (cur && cur !== nx) cur.crossFadeTo(nx, dur, false); },
    update(dt) { mixer.update(dt); root.updateMatrixWorld(true); stepSpring(dt); groundConstrain(); },
  };
  const b2 = new THREE.Box3().setFromObject(model); b2.getCenter(api.center);
  return api;
}
