import * as THREE from 'three/webgpu';
import { BODY_SPECS } from './cars.js';
import { BUS_SPEC } from './bus.js';
import { buildingContact, collisionBody } from './controllers.js';

// SLOP COCKROACH: the player is a 4 cm cockroach. Climbs anything by cheating, dies only from below.

// Walkable roof height (m above the street) from the loft specs the traffic meshes use.
// A car's centerline roof peaks at the highest cabin.roofY knot: carLayout places the
// crown on railY such that railY + crown equals roofY. A cargo van adds cargo.rise
// above that cab roof. A bus has no cabin; its roof skin is edge + crown.
// Sedan and taxi share one spec (~1.445 m). There is no separate truck kind; the
// pickup is the tall cab. Unknown bodies fall back to the old sedan roof.
function specRoofHeight(spec) {
  if (spec.cabin && spec.cabin.roofY) {
    let y = 0;
    for (let i = 0; i < spec.cabin.roofY.length; i++) {
      const h = spec.cabin.roofY[i][1];
      if (h > y) y = h;
    }
    if (spec.cargo && spec.cargo.rise) {
      let rise = 0;
      for (let i = 0; i < spec.cargo.rise.length; i++) {
        const h = spec.cargo.rise[i][1];
        if (h > rise) rise = h;
      }
      y += rise;
    }
    return y;
  }
  let edge = 0;
  let crown = 0;
  if (spec.edge) for (let i = 0; i < spec.edge.length; i++) if (spec.edge[i][1] > edge) edge = spec.edge[i][1];
  if (spec.crown) for (let i = 0; i < spec.crown.length; i++) if (spec.crown[i][1] > crown) crown = spec.crown[i][1];
  return edge + crown || 1.45;
}

const ROOF_HEIGHT = { bus: specRoofHeight(BUS_SPEC) };
for (const kind of Object.keys(BODY_SPECS)) ROOF_HEIGHT[kind] = specRoofHeight(BODY_SPECS[kind]);

function carRoof(car) {
  if (car.bus) return ROOF_HEIGHT.bus;
  return ROOF_HEIGHT[car.bodyType] || 1.45;
}

const WALK_SPEED = 1.5;      // m/s, a real cockroach sprint
const BOOST_SPEED = 14;      // m/s, "car speed" after a crumb
const BOOST_TIME = 60;
const GIANT_TIME = 30;       // s, red crumb
const GIANT_SCALE = 100;     // 4.5 cm body -> about 4.5 m, car length
const GROW_TIME = 0.5;       // s to grow or shrink
const GIANT_HALF_W = 1.15;   // a bit wider than a sedan (0.86)
const GIANT_HALF_L = 2.6;    // a bit longer than a sedan (2.18)
const PERSON_HALF = 0.32;    // traffic.js person footprint, used while the body is still small
const TURN_RATE = 3.2;
const RADIUS = 0.03;
const CRUMB_COUNT = 28;
const RED_CRUMB_COUNT = 6;

// Red-crumb timer and body scale. Exported so tests can step them without WebGPU.
function stepGiant(state, dt) {
  if (state.giant > 0) state.giant = Math.max(0, state.giant - dt);
  const target = state.giant > 0 ? GIANT_SCALE : 1;
  const rate = (GIANT_SCALE - 1) / GROW_TIME;
  if (state.scale < target) state.scale = Math.min(target, state.scale + rate * dt);
  else if (state.scale > target) state.scale = Math.max(target, state.scale - rate * dt);
  return state;
}

// Oriented box fed to traffic's player object. Scale 1 stays the person footprint.
function giantFootprint(scale) {
  const k = scale <= 1 ? 0 : Math.min(1, (scale - 1) / (GIANT_SCALE - 1));
  return {
    active: scale > 1,
    halfW: PERSON_HALF + (GIANT_HALF_W - PERSON_HALF) * k,
    halfL: PERSON_HALF + (GIANT_HALF_L - PERSON_HALF) * k
  };
}

function roachVulnerable(scale, giant) {
  return !(scale > 1 || giant > 0);
}

function buildRoachModel() {
  // Procedural American cockroach (~4.5 cm): glossy tegmina, pale-rimmed pronotum,
  // segmented abdomen, head with mandibles + palps, jointed spiny legs, segmented antennae, cerci.
  const root = new THREE.Group();
  root.name = 'Cockroach';
  root.rotation.order = 'YXZ';
  const M = (color, roughness) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.1 });
  const wingMat = M(0x4a1604, 0.32);
  const seamMat = M(0x2a1006, 0.5);
  const rimMat = M(0xb07a3a, 0.4);
  const pronMat = M(0x3e1404, 0.32);
  const spotMat = M(0x2e1206, 0.3);
  const abdMat = M(0x3a1406, 0.45);
  const abdRing = M(0x3a170a, 0.5);
  const headMat = M(0x4a200c, 0.35);
  const eyeMat = M(0x080402, 0.15);
  const legMat = M(0x4e1e08, 0.45);
  const antMat = M(0x5a2a10, 0.5);
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  const hemi = new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const add = (geo, mat, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0, parent = root) => {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    parent.add(m); return m;
  };

  // Abdomen: 7 tapering segments with darker intersegment rings (visible past/under the wings)
  for (let i = 0; i < 7; i++) {
    const t = i / 6, z = 0.006 - i * 0.0042, w = 0.0105 * (1 - t * 0.55), h = 0.0042 * (1 - t * 0.4);
    add(sphere, i % 2 ? abdRing : abdMat, w, h, 0.0028, 0, 0.0062 - t * 0.0012, z);
  }
  // Cerci
  for (const s of [1, -1]) add(new THREE.ConeGeometry(0.0007, 0.006, 5), legMat, 1, 1, 1, s * 0.0022, 0.0055, -0.0245, -Math.PI / 2 - 0.15, 0, s * 0.35);

  // Tegmina: two long glossy shells overlapping at a dark center seam, slightly raised at the rear
  for (const s of [1, -1]) {
    add(hemi, wingMat, 0.0062, 0.0034, 0.0205, s * 0.0047, 0.0078, -0.0055, 0.04, s * 0.05, s * -0.18);
  }
  add(new THREE.BoxGeometry(1, 1, 1), seamMat, 0.0005, 0.0008, 0.036, 0, 0.0113, -0.0055, 0.04);
  // faint wing veins
  for (const s of [1, -1]) for (let k = 0; k < 3; k++) {
    add(new THREE.BoxGeometry(1, 1, 1), seamMat, 0.00025, 0.0003, 0.02 - k * 0.004, s * (0.0035 + k * 0.0018), 0.0108 - k * 0.0009, -0.006, 0.04, s * 0.08, s * -0.2);
  }

  // Thorax under the pronotum
  add(sphere, abdMat, 0.0085, 0.0045, 0.0065, 0, 0.0068, 0.0115);
  // Pronotum: pale rim, glossy shield, dark central "figure-8" patch
  add(hemi, rimMat, 0.0112, 0.0031, 0.0082, 0, 0.0085, 0.0155);
  add(hemi, pronMat, 0.0098, 0.0035, 0.007, 0, 0.0087, 0.0152);
  for (const s of [1, -1]) add(hemi, spotMat, 0.0028, 0.0034, 0.0042, s * 0.0024, 0.0092, 0.0148);

  // Head: tucked under the pronotum front, pointing down/forward
  const head = new THREE.Group();
  head.position.set(0, 0.0062, 0.0225);
  head.rotation.x = 0.7;
  root.add(head);
  add(sphere, headMat, 0.0042, 0.0034, 0.0046, 0, 0, 0, 0, 0, 0, head);
  for (const s of [1, -1]) {
    add(sphere, eyeMat, 0.0017, 0.0024, 0.0016, s * 0.0034, 0.0006, 0.0006, 0, 0, 0, head);           // kidney eyes
    add(new THREE.ConeGeometry(0.0009, 0.0024, 5), seamMat, 1, 1, 1, s * 0.0013, -0.0022, 0.0038, 2.4, 0, s * 0.5, head); // mandibles
    add(new THREE.CylinderGeometry(0.00028, 0.0002, 0.004, 4), legMat, 1, 1, 1, s * 0.0028, -0.0026, 0.0034, 2.2, 0, s * 0.6, head); // palps
  }

  // Antennae: 16 tapering joints each, nested so the whole whip curves and waves
  const antennae = [];
  const jointGeo = new THREE.CylinderGeometry(1, 0.85, 1, 5);
  jointGeo.translate(0, 0.5, 0);
  for (const s of [1, -1]) {
    const base = new THREE.Group();
    base.position.set(s * 0.0016, 0.0022, 0.0035);
    base.rotation.set(-0.35, 0, -s * 0.45);
    head.add(base);
    const joints = [];
    let parent = base;
    for (let j = 0; j < 16; j++) {
      const g = new THREE.Group();
      if (j) g.position.y = 0.0034;
      const seg = new THREE.Mesh(jointGeo, antMat);
      const r = 0.00042 * (1 - j / 20);
      seg.scale.set(r, 0.0032, r);
      g.add(seg);
      parent.add(g);
      joints.push(g);
      parent = g;
    }
    antennae.push({ base, joints, side: s });
  }

  // Legs: coxa pivot -> femur -> tibia (with spines) -> tarsus
  const segGeo = new THREE.CylinderGeometry(1, 0.8, 1, 6);
  segGeo.translate(0, 0.5, 0); segGeo.rotateZ(-Math.PI / 2); // along +x
  const spineGeo = new THREE.ConeGeometry(0.00022, 0.0016, 3);
  const legs = [];
  const zs = [0.012, 0.004, -0.003];
  const L = [[0.0075, 0.0085, 0.0065], [0.009, 0.011, 0.0075], [0.012, 0.015, 0.009]];
  for (let i = 0; i < 3; i++) {
    for (const side of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.0045, 0.0055, zs[i]);
      const mirror = new THREE.Group();
      if (side < 0) mirror.rotation.y = Math.PI;
      pivot.add(mirror);
      const [lf, lt, la] = L[i];
      const femurG = new THREE.Group(); femurG.rotation.z = 0.45; mirror.add(femurG);
      const fem = new THREE.Mesh(segGeo, legMat); fem.scale.set(lf, 0.0011, 0.0011); femurG.add(fem);
      const tibG = new THREE.Group(); tibG.position.x = lf; tibG.rotation.z = -1.35; femurG.add(tibG);
      const tib = new THREE.Mesh(segGeo, legMat); tib.scale.set(lt, 0.0007, 0.0007); tibG.add(tib);
      for (let k = 1; k <= 4; k++) {
        const sp = new THREE.Mesh(spineGeo, seamMat);
        sp.position.set(lt * k / 5, 0.0006, (k % 2 ? 1 : -1) * 0.0004);
        sp.rotation.z = -0.9;
        tibG.add(sp);
      }
      const tarG = new THREE.Group(); tarG.position.x = lt; tarG.rotation.z = 0.55; tibG.add(tarG);
      const tar = new THREE.Mesh(segGeo, legMat); tar.scale.set(la, 0.0004, 0.0004); tarG.add(tar);
      pivot.userData = { side, base: (i - 1) * -0.75 * side + (i === 2 ? -0.2 * side : 0), group: (i % 2 === 0) === (side > 0) ? 0 : 1 };
      pivot.rotation.y = pivot.userData.base;
      root.add(pivot);
      legs.push(pivot);
    }
  }
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, legs, antennae };
}

function createCockroach({ scene, controllerManager: cm, trafficSystem, cameraSystem }) {
  const vehicles = trafficSystem.cars.concat(trafficSystem.buses || []);
  const p = cm.entities.person;
  p.isRoach = true;
  p.label = 'Cockroach';
  p.mesh.visible = false;
  // Roaches can't drive: lock to person mode and hide vehicle buttons
  const setModeOrig = cm.setMode.bind(cm);
  cm.setMode = () => setModeOrig('person');
  document.querySelectorAll('[data-mode]').forEach((b) => { if (b.getAttribute('data-mode') !== 'person') b.style.display = 'none'; });
  p.crowd.meshes.forEach((m) => { m.visible = false; m.castShadow = false; });
  p.chaseDistance = 0.3;
  p.chaseHeight = 0.12;
  p.cameraTargetOffset.set(0, 0.03, 0);
  p.roachScale = 1;
  p.isGiantRoach = false;
  p.giantHalfW = PERSON_HALF;
  p.giantHalfL = PERSON_HALF;

  const model = buildRoachModel();
  const group = new THREE.Group();
  group.name = 'CockroachMod';
  group.add(model.root);
  scene.add(group);

  // Splat: a squashed brown disc with a yellow-green smear
  const splat = new THREE.Group();
  const splatA = new THREE.Mesh(new THREE.CircleGeometry(0.035, 18), new THREE.MeshStandardMaterial({ color: 0x3b1e0b, roughness: 0.3 }));
  const splatB = new THREE.Mesh(new THREE.CircleGeometry(0.02, 12), new THREE.MeshStandardMaterial({ color: 0xb8c43a, roughness: 0.2 }));
  splatA.rotation.x = splatB.rotation.x = -Math.PI / 2;
  splatB.position.set(0.018, 0.001, 0.01);
  splatB.scale.set(1.6, 0.7, 1);
  splat.add(splatA, splatB);
  splat.visible = false;
  group.add(splat);

  // Crumbs
  const crumbGeo = new THREE.DodecahedronGeometry(0.009, 0);
  const crumbMat = new THREE.MeshStandardMaterial({ color: 0xe0a640, emissive: 0x4a2c00, roughness: 0.9 });
  const crumbs = [];
  for (let i = 0; i < CRUMB_COUNT; i++) {
    const m = new THREE.Mesh(crumbGeo, crumbMat);
    m.castShadow = true;
    m.visible = false;
    group.add(m);
    crumbs.push({ mesh: m, active: false, red: false });
  }
  const redGeo = new THREE.DodecahedronGeometry(0.014, 0);
  const redMat = new THREE.MeshStandardMaterial({ color: 0xd01212, emissive: 0x6a0404, roughness: 0.45 });
  const redCrumbs = [];
  for (let i = 0; i < RED_CRUMB_COUNT; i++) {
    const m = new THREE.Mesh(redGeo, redMat);
    m.castShadow = true;
    m.visible = false;
    group.add(m);
    redCrumbs.push({ mesh: m, active: false, red: true });
  }

  const contact = { nx: 0, nz: 0, depth: 0 };
  const roachBody = () => collisionBody('person', RADIUS * st.scale, 0);
  const st = {
    mode: 'ground', vy: 0, boost: 0, giant: 0, scale: 1, deaths: 0, eaten: 0, redEaten: 0, deadTimer: 0, legPhase: 0,
    wall: null, ped: null, car: null, spawn: p.position.clone(), lastSafe: p.position.clone(), lastEvent: ''
  };
  p.position.y = cm.getGroundHeight(p.position.x, p.position.z, 'person');

  const near = (x, z, r) => cm.nearColliders(x, z, r);
  function blockingCollider(x, y, z) {
    let best = null;
    for (const c of near(x, z, 4)) {
      if (buildingContact(c, x, y, z, roachBody(), contact)) {
        if (!best || c.maxY > best.c.maxY) best = { c, nx: contact.nx, nz: contact.nz };
      }
    }
    return best;
  }
  // Highest roof (or street) under (x, z) not above y
  function surfaceAt(x, z, y) {
    let s = cm.getGroundHeight(x, z, 'person');
    for (const c of near(x, z, 2)) {
      if (!Number.isFinite(c.maxY) || c.maxY > y + 0.05 || c.maxY <= s) continue;
      if (buildingContact(c, x, c.maxY - 0.02, z, collisionBody('person', 0.001, 0), contact)) s = c.maxY;
    }
    return s;
  }
  const streetLevel = (x, z) => cm.getGroundHeight(x, z, 'person');

  function key(name) { const v = cm.keys[name]; return v === true ? 1 : Number(v) || 0; }

  function die(reason) {
    if (st.mode === 'dead' || !roachVulnerable(st.scale, st.giant)) return;
    st.mode = 'dead';
    st.deaths++;
    st.deadTimer = 2;
    st.lastEvent = reason;
    model.root.visible = false;
    splat.visible = true;
    splat.position.set(p.position.x, p.position.y + 0.002, p.position.z);
    splat.rotation.y = Math.random() * Math.PI * 2;
    p.speed = 0;
    console.log(`[roach] squished by ${reason}`);
  }

  function respawn() {
    splat.visible = false;
    model.root.visible = true;
    st.mode = 'ground';
    st.ped = st.car = st.wall = null;
    st.vy = 0;
    p.position.copy(st.lastSafe);
    p.position.y = surfaceAt(p.position.x, p.position.z, p.position.y + 0.5);
  }

  function attachPed(ped) {
    st.mode = 'ped';
    st.ped = { p: ped, ang: Math.atan2(p.position.x - ped.x, p.position.z - ped.z), h: 0.02, lx: ped.x, lz: ped.z };
    st.lastEvent = 'climbing a human';
  }
  function attachCar(car, lx, lz) {
    st.mode = 'car';
    st.car = { car, lx, lz, h: 0.02 };
    st.lastEvent = 'hitchhiking';
  }

  function checkSquish() {
    const vulnerable = roachVulnerable(st.scale, st.giant);
    const x = p.position.x, z = p.position.z;
    for (const ped of trafficSystem.peds) {
      const dx = ped.x - x, dz = ped.z - z;
      if (dx * dx + dz * dz > 4) continue;
      for (const f of ped.rig.feet) {
        const was = f._roachSwing;
        f._roachSwing = f.swing;
        // the heel strike: a foot that was swinging comes down
        if (vulnerable && was && !f.swing) {
          const fx = f.px - x, fz = f.pz - z;
          if (fx * fx + fz * fz < 0.16 * 0.16) return die('a foot');
        }
      }
    }
    for (const car of vehicles) {
      if (!car.edge || Math.abs(car.speed) < 0.2) continue;
      const dx = car.x - x, dz = car.z - z;
      if (dx * dx + dz * dz > 16) continue;
      const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
      for (const a of [car.axle, -car.axle]) {
        for (const s of [1, -1]) {
          const wx = car.x + fx * a + fz * s * car.halfWidth * 0.85;
          const wz = car.z + fz * a - fx * s * car.halfWidth * 0.85;
          if (vulnerable && (wx - x) ** 2 + (wz - z) ** 2 < 0.2 * 0.2) return die('a wheel');
        }
      }
    }
  }

  function tryAttachMoving(fwd) {
    if (fwd <= 0) return false;
    const x = p.position.x, z = p.position.z;
    const hx = Math.sin(p.heading), hz = Math.cos(p.heading);
    // A giant knocks people over instead of climbing them. Normal size still latches on.
    if (roachVulnerable(st.scale, st.giant)) for (const ped of trafficSystem.peds) {
      if (!ped.rig.placed) continue;
      const dx = ped.x - x, dz = ped.z - z;
      if (dx * dx + dz * dz < 0.22 * 0.22 && dx * hx + dz * hz > -0.05) { attachPed(ped); return true; }
    }
    for (const car of vehicles) {
      if (!car.edge) continue;
      const dx = x - car.x, dz = z - car.z;
      const reach = car.half + 2;
      if (dx * dx + dz * dz > reach * reach) continue;
      const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
      const lz = dx * fx + dz * fz, lx = dx * fz - dz * fx;
      if (Math.abs(car.speed) < 0.6 && Math.abs(lz) < car.half + 0.04 && Math.abs(lx) < car.halfWidth + 0.04) { attachCar(car, lx, lz); return true; }
    }
    return false;
  }

  function updateGround(dt, fwd, turn) {
    p.heading += TURN_RATE * dt * turn;
    const speed = ((st.boost > 0 || !roachVulnerable(st.scale, st.giant)) ? BOOST_SPEED : WALK_SPEED) * fwd;
    p.speed = speed;
    const hx = Math.sin(p.heading), hz = Math.cos(p.heading);
    const dist = Math.abs(speed * dt);
    const n = Math.max(1, Math.ceil(dist / 0.06));
    const step = speed * dt / n;
    for (let i = 0; i < n; i++) {
      const bx = p.position.x + hx * step, bz = p.position.z + hz * step;
      p.position.x = bx;
      p.position.z = bz;
      cm.resolveHorizontalCollision(p.position, RADIUS * st.scale, null, null);
      const pushed = Math.hypot(p.position.x - bx, p.position.z - bz);
      if (fwd > 0 && pushed > Math.abs(step) * 0.3) {
        const hit = blockingCollider(bx + hx * 0.02 * st.scale, p.position.y, bz + hz * 0.02 * st.scale);
        if (hit) {
          const len = Math.hypot(p.position.x - bx, p.position.z - bz) || 1;
          st.mode = 'wall';
          st.wall = { c: hit.c, nx: (p.position.x - bx) / len, nz: (p.position.z - bz) / len };
          st.lastEvent = 'climbing a wall';
          return;
        }
      }
      if (st.mode === 'ground' && p.position.y < streetLevel(p.position.x, p.position.z) + 0.05 && tryAttachMoving(fwd)) return;
    }
    // vertical: jumps, falls off roofs
    const surface = surfaceAt(p.position.x, p.position.z, p.position.y);
    const grounded = p.position.y <= surface + 0.005;
    if (grounded && key('up')) st.vy = 1.6;
    if (!grounded || st.vy > 0) {
      st.vy -= 9.8 * dt;
      p.position.y += st.vy * dt;
      if (p.position.y <= surface) { p.position.y = surface; st.vy = 0; }
    } else {
      p.position.y = surface;
      st.vy = 0;
    }
    if (p.position.y <= surface + 0.005) {
      st.lastSafe.copy(p.position);
      if (surface <= streetLevel(p.position.x, p.position.z) + 0.01) checkSquish();
    }
  }

  function updateWall(dt, fwd, turn) {
    const w = st.wall;
    const speed = ((st.boost > 0 || !roachVulnerable(st.scale, st.giant)) ? BOOST_SPEED * 0.5 : WALK_SPEED);
    p.heading = Math.atan2(-w.nx, -w.nz);
    p.speed = speed * fwd;
    p.position.y += speed * fwd * dt;
    // strafe along the wall
    if (turn) {
      const tx = -w.nz, tz = w.nx;
      p.position.x += tx * -turn * speed * 0.6 * dt;
      p.position.z += tz * -turn * speed * 0.6 * dt;
    }
    // stay pressed to the wall
    p.position.x -= w.nx * 0.01 * st.scale;
    p.position.z -= w.nz * 0.01 * st.scale;
    cm.resolveHorizontalCollision(p.position, RADIUS * st.scale, null, null);
    const top = w.c.maxY;
    if (p.position.y >= top - 0.01) {
      // over the edge: drop onto the roof (a raycast down from above, by footprint)
      p.position.x -= w.nx * 0.08 * st.scale;
      p.position.z -= w.nz * 0.08 * st.scale;
      p.position.y = top + 0.3;
      p.position.y = surfaceAt(p.position.x, p.position.z, p.position.y);
      st.mode = 'ground';
      st.wall = null;
      st.lastEvent = `on a roof, ${Math.round(top)} m up`;
      return;
    }
    const still = blockingCollider(p.position.x - w.nx * 0.04 * st.scale, p.position.y, p.position.z - w.nz * 0.04 * st.scale);
    const floor = surfaceAt(p.position.x, p.position.z, p.position.y);
    if (key('up') || !still || p.position.y <= floor) {
      p.position.x += w.nx * 0.05 * st.scale;
      p.position.z += w.nz * 0.05 * st.scale;
      st.mode = 'ground';
      st.wall = null;
      st.vy = 0;
    }
  }

  function updatePed(dt, fwd, turn) {
    const r = st.ped, ped = r.p;
    if (Math.hypot(ped.x - r.lx, ped.z - r.lz) > 2 || !ped.rig.placed) { st.mode = 'ground'; st.ped = null; return; }
    r.lx = ped.x; r.lz = ped.z;
    const s = ped.rig.s || 1;
    const topH = 1.74 * s;
    const climb = roachVulnerable(st.scale, st.giant) ? WALK_SPEED : BOOST_SPEED;
    r.h = Math.max(0, Math.min(topH, r.h + fwd * climb * 0.8 * dt));
    r.ang += turn * 2 * dt;
    const t = r.h / s;
    const rad = r.h >= topH - 0.01 ? 0 : (t < 0.12 ? 0.13 : t < 0.9 ? 0.1 : t < 1.45 ? 0.17 : t < 1.55 ? 0.07 : 0.1) * s;
    const g = ped.rig.feet[0].py ?? streetLevel(ped.x, ped.z);
    p.position.set(ped.x + Math.sin(r.ang) * rad, g + r.h, ped.z + Math.cos(r.ang) * rad);
    p.heading = r.ang + Math.PI;
    p.speed = 0;
    if (r.h >= topH - 0.01) st.lastEvent = 'riding a human';
    if (key('up') || (r.h <= 0 && fwd < 0)) {
      st.mode = 'ground'; st.ped = null; st.vy = 0;
      p.position.x += Math.sin(r.ang) * 0.15 * st.scale; p.position.z += Math.cos(r.ang) * 0.15 * st.scale;
    }
  }

  function updateCar(dt, fwd, turn) {
    const r = st.car, car = r.car;
    if (!car.edge) { st.mode = 'ground'; st.car = null; return; }
    const roof = carRoof(car);
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const climb = roachVulnerable(st.scale, st.giant) ? WALK_SPEED : BOOST_SPEED;
    if (r.h < roof) {
      r.h = Math.max(0, Math.min(roof, r.h + fwd * climb * 0.8 * dt));
      if (r.h >= roof) {
        // step onto the roof edge, facing inward
        const L = Math.hypot(r.lx, r.lz) || 1;
        r.lx -= r.lx / L * 0.12; r.lz -= r.lz / L * 0.12;
        r.lx = Math.max(-car.halfWidth * 0.7, Math.min(car.halfWidth * 0.7, r.lx));
        r.lz = Math.max(-car.half * 0.45, Math.min(car.half * 0.45, r.lz));
        r.rh = Math.atan2(-r.lx, -r.lz);
      }
      p.heading = Math.atan2(-(fx * r.lz + fz * r.lx), -(fz * r.lz - fx * r.lx));
    } else {
      // crawl around the roof in car-local space; the car carries us
      r.rh += turn * TURN_RATE * dt;
      r.lx += Math.sin(r.rh) * fwd * climb * 0.5 * dt;
      r.lz += Math.cos(r.rh) * fwd * climb * 0.5 * dt;
      r.lx = Math.max(-car.halfWidth * 0.75, Math.min(car.halfWidth * 0.75, r.lx));
      r.lz = Math.max(-car.half * 0.45, Math.min(car.half * 0.45, r.lz));
      p.heading = car.yaw + r.rh;
      st.lastEvent = 'riding a car';
    }
    const g = streetLevel(car.x, car.z);
    p.position.set(car.x + fx * r.lz + fz * r.lx, g + r.h, car.z + fz * r.lz - fx * r.lx);
    p.speed = car.speed;
    if (key('up') || (r.h <= 0 && fwd < 0)) {
      st.mode = 'ground'; st.car = null; st.vy = 2;
      p.position.x += Math.sin(p.heading) * 0.1 * st.scale; p.position.z += Math.cos(p.heading) * 0.1 * st.scale;
    }
  }

  // Crumbs scattered on the street around the player
  function updateCrumbs(dt, elapsed) {
    const x = p.position.x, z = p.position.z;
    for (const c of crumbs) {
      if (c.active) {
        const dx = c.mesh.position.x - x, dz = c.mesh.position.z - z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 45 * 45) c.active = false;
        else if (st.mode !== 'dead' && d2 < (0.06 * st.scale) ** 2 && Math.abs(c.mesh.position.y - p.position.y) < 0.08 * st.scale) {
          c.active = false;
          st.eaten++;
          st.boost = BOOST_TIME;
          st.lastEvent = 'ate a crumb: zoom';
        }
      }
      if (!c.active) {
        for (let a = 0; a < 6 && !c.active; a++) {
          const ang = Math.random() * Math.PI * 2, rr = 1.5 + Math.random() * 25;
          const cx = x + Math.sin(ang) * rr, cz = z + Math.cos(ang) * rr;
          if (blockingCollider(cx, 0.1, cz)) continue;
          c.mesh.position.set(cx, streetLevel(cx, cz) + 0.006, cz);
          c.active = true;
        }
      }
      c.mesh.visible = c.active;
      if (c.active) { c.mesh.rotation.y = elapsed * 2 + c.mesh.position.x; }
    }
    for (const c of redCrumbs) {
      if (c.active) {
        const dx = c.mesh.position.x - x, dz = c.mesh.position.z - z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 45 * 45) c.active = false;
        else if (st.mode !== 'dead' && d2 < (0.06 * st.scale) ** 2 && Math.abs(c.mesh.position.y - p.position.y) < 0.08 * st.scale) {
          c.active = false;
          st.redEaten++;
          st.giant = GIANT_TIME;
          st.lastEvent = 'ate a red crumb: giant';
        }
      }
      if (!c.active) {
        for (let a = 0; a < 6 && !c.active; a++) {
          const ang = Math.random() * Math.PI * 2, rr = 4 + Math.random() * 28;
          const cx = x + Math.sin(ang) * rr, cz = z + Math.cos(ang) * rr;
          if (blockingCollider(cx, 0.1, cz)) continue;
          c.mesh.position.set(cx, streetLevel(cx, cz) + 0.008, cz);
          c.active = true;
        }
      }
      c.mesh.visible = c.active;
      if (c.active) { c.mesh.rotation.y = elapsed * 1.4 + c.mesh.position.z; }
    }
  }

  function poseModel(dt) {
    const r = model.root;
    r.position.copy(p.position);
    let pitch = 0;
    if (st.mode === 'wall') pitch = -Math.PI / 2;
    else if (st.mode === 'ped' && st.ped.h < 1.72 * (st.ped.p.rig.s || 1) - 0.01 && st.ped.h > 0.01) pitch = -Math.PI / 2;
    else if (st.mode === 'car' && st.car.h < carRoof(st.car.car) - 0.01 && st.car.h > 0.01) pitch = -Math.PI / 2;
    r.rotation.set(pitch, p.heading, 0);
    r.scale.setScalar(st.scale);
    if (pitch) { r.position.x -= Math.sin(p.heading) * 0.01 * st.scale; r.position.z -= Math.cos(p.heading) * 0.01 * st.scale; }
    const moving = Math.abs(key('forward') - key('backward')) > 0 || Math.abs(p.speed) > 0.05;
    st.legPhase += dt * (moving ? ((st.boost > 0 || st.scale > 1) ? 60 : 22) : 0);
    for (const leg of model.legs) {
      const { base, group: g, side } = leg.userData;
      const ph = st.legPhase + g * Math.PI;
      leg.rotation.y = base + (moving ? Math.sin(ph) * 0.45 * side : 0);
      leg.rotation.z = moving ? Math.max(0, Math.cos(ph)) * 0.35 * side : 0;
    }
    st.antT = (st.antT || 0) + dt;
    for (const a of model.antennae) {
      a.joints.forEach((j, k) => {
        if (!k) return;
        j.rotation.x = -0.06 + Math.sin(st.antT * 2.1 + k * 0.45 + a.side) * 0.05 * (k / 16);
        j.rotation.z = -a.side * 0.035 + Math.sin(st.antT * 1.3 + k * 0.3 + a.side * 2) * 0.04;
      });
    }
  }

  // HUD
  const hud = document.createElement('div');
  hud.id = 'roach-hud';
  hud.style.cssText = 'position:fixed;left:16px;top:84px;z-index:50;font:600 14px/1.45 system-ui,sans-serif;color:#fff;'
    + 'background:rgba(20,10,4,.72);padding:10px 14px;border-radius:12px;pointer-events:none;max-width:340px';
  document.body.appendChild(hud);
  let hudTimer = 0;
  function updateHud(dt) {
    hudTimer -= dt;
    if (hudTimer > 0) return;
    hudTimer = 0.2;
    const lines = [
      `SLOP COCKROACH · deaths ${st.deaths} · crumbs ${st.eaten} · red ${st.redEaten}`,
      st.mode === 'dead' ? `SPLAT (${st.lastEvent}). Respawning...`
        : (st.giant > 0 && st.boost > 0) ? `GIANT ROACH ${Math.ceil(st.giant)} s · CRUMB SPEED ${Math.ceil(st.boost)} s`
        : st.giant > 0 ? `GIANT ROACH ${Math.ceil(st.giant)} s`
        : (st.boost > 0 ? `CRUMB SPEED ${Math.ceil(st.boost)} s` : `status: ${st.lastEvent || 'scuttling'}`),
      'W/S crawl & climb · A/D turn · Space jump / let go'
    ];
    hud.textContent = '';
    lines.forEach((t, i) => { const d = document.createElement('div'); d.textContent = t; if (i === 2) d.style.cssText = 'font-weight:400;opacity:.8;font-size:12px'; hud.appendChild(d); });
  }

  // Replaces the walker controller
  let audio = null;
  const screamUntil = [];
  function maybeScream(ped) {
    if (!audio || !audio.ready || !audio.enabled || audio.context?.state !== 'running') return;
    const now = audio.context.currentTime;
    if (now < (ped._roachScream || 0)) return;
    for (let i = screamUntil.length - 1; i >= 0; i--) if (screamUntil[i] <= now) screamUntil.splice(i, 1);
    if (screamUntil.length >= 3) return;
    const played = audio.emit('scream', {
      id: ped, x: ped.x, y: 0.2, z: ped.z, seed: ped.rig?.seed || 1
    }, { intensity: 0.85 });
    if (!played) return;
    ped._roachScream = now + 4;
    screamUntil.push(now + 0.55);
  }
  p.onGiantPed = maybeScream;

  function publishGiant() {
    const foot = giantFootprint(st.scale);
    p.roachScale = st.scale;
    p.isGiantRoach = foot.active;
    p.giantHalfW = foot.halfW;
    p.giantHalfL = foot.halfL;
  }

  cm.updatePerson = function (dt, elapsed = 0) {
    const fromX = p.position.x, fromZ = p.position.z;
    if (st.boost > 0) st.boost = Math.max(0, st.boost - dt);
    stepGiant(st, dt);
    const fwd = key('forward') - key('backward') * 0.6;
    const turn = key('left') - key('right');
    if (st.mode === 'dead') {
      st.deadTimer -= dt;
      if (st.deadTimer <= 0) respawn();
    } else if (st.mode === 'wall') updateWall(dt, fwd, turn);
    else if (st.mode === 'ped') updatePed(dt, fwd, turn);
    else if (st.mode === 'car') updateCar(dt, fwd, turn);
    else updateGround(dt, fwd, turn);
    updateCrumbs(dt, elapsed);
    // Shrinking (or a shove from a car) must leave the body outside solid walls.
    if (st.scale > 1 && (st.mode === 'ground' || st.mode === 'wall')) {
      cm.resolveHorizontalCollision(p.position, RADIUS * st.scale, null, null);
      if (st.mode === 'ground') {
        const floor = surfaceAt(p.position.x, p.position.z, p.position.y + 1);
        if (p.position.y < floor) p.position.y = floor;
      }
    }
    publishGiant();
    p.prevX = fromX;
    p.prevZ = fromZ;
    poseModel(dt);
    updateHud(dt);
  };

  // Low camera, slightly behind; rotates onto walls with the roach
  cameraSystem.camera.near = 0.01;
  cameraSystem.camera.updateProjectionMatrix();
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), want = new THREE.Vector3(), wantLook = new THREE.Vector3();
  let camInit = false;
  function updateCamera(dt) {
    if (cm.activeMode !== 'person' || cameraSystem.getActivePreset().category !== 'follow') return;
    const hx = Math.sin(p.heading), hz = Math.cos(p.heading);
    const pos = st.mode === 'dead' ? splat.position : p.position;
    const climbingPed = st.mode === 'ped' && model.root.rotation.x !== 0;
    const ridingPed = st.mode === 'ped' && !climbingPed;
    const vertical = st.mode === 'wall' || climbingPed || (st.mode === 'car' && model.root.rotation.x !== 0);
    const sc = st.scale;
    const back = (st.boost > 0 ? 0.45 : 0.28) * sc;
    // Safe origin the camera ray starts from: just off the surface the roach is on
    origin.set(pos.x, pos.y + 0.03 * sc, pos.z);
    if (ridingPed) {
      const ped = st.ped.p, yaw = ped.rig.yaw ?? ped.heading ?? p.heading;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      // Sit on the head: just behind/above the crown, looking down the street ahead
      want.set(pos.x - fx * 0.55 * sc, pos.y + 0.26 * sc, pos.z - fz * 0.55 * sc);
      wantLook.set(pos.x + fx * 3 * sc, pos.y - 0.85 * sc, pos.z + fz * 3 * sc);
    } else if (climbingPed) {
      const ped = st.ped.p, ax = Math.sin(st.ped.ang), az = Math.cos(st.ped.ang);
      origin.set(pos.x + ax * 0.04 * sc, pos.y, pos.z + az * 0.04 * sc);
      want.set(ped.x + ax * 0.75 * sc, pos.y + 0.05 * sc, ped.z + az * 0.75 * sc);
      wantLook.set(pos.x, pos.y + 0.12 * sc, pos.z);
    } else if (vertical) {
      // Outside the wall: back along the outward normal (-heading), slightly below, looking up the wall
      origin.set(pos.x - hx * 0.05 * sc, pos.y, pos.z - hz * 0.05 * sc);
      want.set(pos.x - hx * back, pos.y - 0.1 * sc, pos.z - hz * back);
      wantLook.set(pos.x + hx * 0.02 * sc, pos.y + 0.35 * sc, pos.z + hz * 0.02 * sc);
    } else {
      want.set(pos.x - hx * back, pos.y + 0.13 * sc, pos.z - hz * back);
      wantLook.set(pos.x + hx * 0.5 * sc, pos.y + 0.05 * sc, pos.z + hz * 0.5 * sc);
    }
    if (st.orbit != null) {
      st.orbit += dt * 1.3;
      want.set(pos.x + Math.sin(st.orbit) * 0.11 * sc, pos.y + 0.05 * sc, pos.z + Math.cos(st.orbit) * 0.11 * sc);
      wantLook.set(pos.x, pos.y + 0.006 * sc, pos.z);
    }
    if (st.mode === 'dead') { want.set(pos.x, pos.y + 0.35 * sc, pos.z - 0.05 * sc); wantLook.copy(pos); }
    const k = camInit && st.orbit == null ? 1 - Math.exp(-dt * 10) : 1;
    camInit = true;
    camPos.lerp(want, k);
    camLook.lerp(wantLook, k);
    // Collision: never let the (smoothed) camera end up inside a building, roof, car or under the street
    resolveCamera(origin, camPos);
    cameraSystem.camera.position.copy(camPos);
    cameraSystem.camera.lookAt(camLook);
    cameraSystem.currentPos.copy(camPos);
    cameraSystem.currentLookAt.copy(camLook);
  }
  const origin = new THREE.Vector3(), probe = new THREE.Vector3();
  const camBody = collisionBody('person', 0.035, 0);
  camBody.top = 0.04; camBody.bottom = -0.04;
  const camContact = { nx: 0, nz: 0, depth: 0 };
  function camBlocked(v) {
    if (v.y < streetLevel(v.x, v.z) + 0.02) return true;
    for (const c of near(v.x, v.z, 2)) {
      if (buildingContact(c, v.x, v.y, v.z, camBody, camContact)) return true;
    }
    for (const car of vehicles) {
      if (!car.edge || (st.car && car === st.car.car)) continue;
      const dx = v.x - car.x, dz = v.z - car.z;
      const reach = car.half + 2;
      if (dx * dx + dz * dz > reach * reach) continue;
      const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
      const lz = dx * fx + dz * fz, lx = dx * fz - dz * fx;
      // Same sedan box as before (half 2.25 -> 2.4, halfWidth 0.86 -> 1.05); roof + 0.1 was 1.55.
      if (Math.abs(lz) < car.half + 0.15 && Math.abs(lx) < car.halfWidth + 0.19 && v.y < streetLevel(car.x, car.z) + carRoof(car) + 0.1) return true;
    }
    return false;
  }
  function resolveCamera(from, cam) {
    const d = from.distanceTo(cam);
    // Short pulls keep the original 1.5 cm probe. A giant camera is tens of metres back.
    const n = d <= 0.72 ? Math.max(2, Math.ceil(d / 0.015)) : Math.max(2, Math.ceil(d / Math.max(0.015, d / 48)));
    let ok = 0;
    for (let i = 1; i <= n; i++) {
      probe.lerpVectors(from, cam, i / n);
      if (camBlocked(probe)) break;
      ok = i;
    }
    if (ok < n) cam.lerpVectors(from, cam, Math.max(0, ok - 1) / n);
  }

  const api = {
    group, state: st, entity: p,
    updateCamera,
    attachAudio(system) { audio = system; },
    teleport(x, z, heading = p.heading) {
      st.mode = 'ground'; st.ped = st.car = st.wall = null;
      p.position.set(x, 0, z);
      p.position.y = surfaceAt(x, z, 1000) > 100 ? streetLevel(x, z) : surfaceAt(x, z, 2);
      p.heading = heading; st.lastSafe.copy(p.position); camInit = false;
    },
    nearestPed(maxD = 40) {
      let best = null, bd = maxD * maxD;
      for (const ped of trafficSystem.peds) {
        if (!ped.rig.placed) continue;
        const d = (ped.x - p.position.x) ** 2 + (ped.z - p.position.z) ** 2;
        if (d < bd) { bd = d; best = ped; }
      }
      return best;
    },
    nearestCrumb() {
      let best = null, bd = Infinity;
      for (const c of crumbs) {
        if (!c.active) continue;
        const d = (c.mesh.position.x - p.position.x) ** 2 + (c.mesh.position.z - p.position.z) ** 2;
        if (d < bd) { bd = d; best = c.mesh.position; }
      }
      return best;
    },
    attachPed, die,
    // Direction (heading) and distance to the closest wall within maxD, for scripted demos
    // A low obstacle (kiosk, low building, wall) near the roach, to demo climbing onto a top
    findLow(minH = 0.6, maxH = 5, r = 60) {
      let best = null, bd = Infinity;
      for (const c of cm.nearColliders(p.position.x, p.position.z, r)) {
        if (!(c.maxY >= minH && c.maxY <= maxH)) continue;
        const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
        const d = (cx - p.position.x) ** 2 + (cz - p.position.z) ** 2;
        if (d < bd) { bd = d; best = { cx, cz, maxY: c.maxY, w: c.maxX - c.minX, dpt: c.maxZ - c.minZ }; }
      }
      return best;
    },
    blocked(x, z) { return Boolean(blockingCollider(x, streetLevel(x, z), z)); },
    probeWall(maxD = 6) {
      let best = null;
      for (let i = 0; i < 72; i++) {
        const h = i / 72 * Math.PI * 2;
        for (let d = 0.1; d < maxD; d += 0.1) {
          if (blockingCollider(p.position.x + Math.sin(h) * d, p.position.y, p.position.z + Math.cos(h) * d)) {
            if (!best || d < best.d) best = { h, d };
            break;
          }
        }
      }
      return best;
    }
  };
  return api;
}

export { createCockroach, stepGiant, giantFootprint, roachVulnerable, GIANT_TIME, GIANT_SCALE, GIANT_HALF_W, GIANT_HALF_L };
