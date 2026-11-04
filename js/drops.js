// Objects people asked for, spat into the city by a GrokBot and left as trash.
// New since the last visit fall from the sky. Older ones are already on the ground.
// Pushes stay on this machine.

import * as THREE from 'three/webgpu';
import { paintDrop } from './drop-paint.js';
import { buildingContact } from './controllers.js';
import { makeBot } from './grok-bot.js';
import { chooseStand, ejectCircle } from './drop-place.js';
import { cardEdgeFor, worldCardSize } from './drop-size.js';
import { DROPS_FETCH_TIMEOUT_MS, DROPS_POLL_MS, DROPS_REMOTE_URL, pollDue } from './drops-config.js';
import {
  acceptLocalRecords,
  acceptRemoteRecords,
  fetchRemoteDocument,
  xProfileUrl
} from './drop-validate.js';

const SEEN_KEY = 'slop-drops-seen';

function loadSeen() {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

function saveSeen(set) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...set])); } catch { /* storage off */ }
}

function ago(iso) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (!Number.isFinite(s)) return '';
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

function groundY(cm, drop) {
  if (drop.surface === 'roof') {
    let top = 0;
    for (const c of cm.nearColliders(drop.x, drop.z, 6)) {
      if (drop.x < c.minX || drop.x > c.maxX || drop.z < c.minZ || drop.z > c.maxZ) continue;
      if (c.maxY > top && c.maxY < 220) top = c.maxY;
    }
    if (top > 3) return top;
  }
  return cm.getGroundHeight(drop.x, drop.z, 'person');
}

const CARD_GEOMETRY = new THREE.PlaneGeometry(1, 1);
const BUILD_NEAR = 120;
const BUILD_FAR = 180;
const LABEL_NEAR = 32;
const OBSTACLE_NEAR = 420;

function makeCard(drop) {
  const edge = cardEdgeFor(drop.id);
  const painted = paintDrop(drop.spec, drop.author, drop.id, edge);
  const tex = new THREE.CanvasTexture(painted.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  const size = worldCardSize(drop.height, drop.spec, edge);
  const mesh = new THREE.Mesh(
    CARD_GEOMETRY,
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  );
  mesh.name = 'DropCard';
  mesh.userData.drop = true;
  mesh.renderOrder = 2;
  mesh.scale.set(size.worldW, size.worldH, 1);
  return { mesh, tex, painted, worldH: size.worldH, worldW: size.worldW };
}

export async function createDrops({ scene, cameraSystem, controllerManager, mapSystem, renderer, network, obstacles }) {
  let localRows = [];
  try {
    const res = await fetch(new URL('../data/drops.json', import.meta.url), { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) localRows = data;
    }
  } catch {
    localRows = [];
  }
  // A missing or hostile remote file must not surface in the page. Local drawings still load.
  const remoteRows = await fetchRemoteDocument(DROPS_REMOTE_URL, { timeoutMs: DROPS_FETCH_TIMEOUT_MS });
  const local = acceptLocalRecords(localRows, (message) => console.warn(message));
  const knownIds = new Set(local.map((row) => row.id));
  const warned = new Set();
  let remote = acceptRemoteRecords(remoteRows, {
    ids: knownIds,
    warn: (message) => console.warn(message),
    warned
  });
  const rows = [...local, ...remote.taken];
  if (!rows.length) return null;

  const seen = loadSeen();
  const cm = controllerManager;
  const group = new THREE.Group();
  group.name = 'Drops';
  scene.add(group);

  const panel = document.createElement('aside');
  panel.id = 'drop-log';
  panel.className = 'drop-log';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'drop-log-toggle';
  toggle.setAttribute('aria-expanded', 'true');
  toggle.textContent = 'Drops';
  const list = document.createElement('div');
  list.className = 'drop-log-list';
  panel.append(toggle, list);
  document.body.appendChild(panel);
  const PANEL_KEY = 'slop-drops-panel';
  function setDropsOpen(open) {
    panel.classList.toggle('is-closed', !open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Hide the drawings list' : 'Show the drawings list');
    toggle.textContent = 'Drops';
    try { localStorage.setItem(PANEL_KEY, open ? '1' : '0'); } catch { /* storage off */ }
  }
  let dropsOpen = true;
  try { if (localStorage.getItem(PANEL_KEY) === '0') dropsOpen = false; } catch { /* storage off */ }
  setDropsOpen(dropsOpen);
  toggle.addEventListener('click', () => setDropsOpen(panel.classList.contains('is-closed')));

  const items = [];
  const contact = { nx: 0, nz: 0, depth: 0 };
  const standBody = { car: false, radius: 0.16, extX: 0.16, extZ: 0.16, bottom: 0.02, top: 0.35 };
  function standHeight(actor, qx, qz) {
    let y = cm.getGroundHeight(qx, qz, 'person');
    if (actor.drop.surface !== 'roof') return y;
    let top = 0;
    for (const c of cm.nearColliders(qx, qz, 2)) {
      if (qx < c.minX || qx > c.maxX || qz < c.minZ || qz > c.maxZ) continue;
      if (c.maxY > top && c.maxY < 220) top = c.maxY;
    }
    return top > 3 ? top : y;
  }
  function teleportTo(actor) {
    if (cameraSystem._focus) cameraSystem._focus = null;
    const cam = cameraSystem.camera.position;
    let fx = cam.x - actor.x;
    let fz = cam.z - actor.z;
    if (fx * fx + fz * fz < 0.36) {
      const yaw = Number.isFinite(actor.drop.yaw) ? actor.drop.yaw : 0;
      fx = Math.sin(yaw);
      fz = Math.cos(yaw);
    }
    const spot = chooseStand(actor.x, actor.z, actor.radius, fx, fz, (qx, qz) => {
      const y = standHeight(actor, qx, qz);
      for (const c of cm.nearColliders(qx, qz, 1.2)) {
        if (buildingContact(c, qx, y + 0.04, qz, standBody)) return null;
      }
      return { x: qx, z: qz };
    });
    if (!spot) return;
    if (cameraSystem.resetForTeleport) cameraSystem.resetForTeleport();
    const aim = { x: actor.x, y: actor.y + Math.min(actor.worldH * 0.42, 6), z: actor.z };
    if (window.roach && window.roach.teleport) window.roach.teleport(spot.x, spot.z, spot.heading, aim);
    else cm.teleportActiveTo(spot.x, spot.z, spot.heading);
  }
  let overlay = null;
  const rowQueue = [];
  let rowCursor = 0;
  function ensureCard(actor) {
    if (actor.mesh) return;
    const card = makeCard(actor.drop);
    actor.mesh = card.mesh;
    actor.tex = card.tex;
    actor.painted = card.painted;
    actor.worldH = card.worldH;
    actor.worldW = card.worldW;
    actor.radius = Math.max(0.55, Math.min(card.worldW * 0.5, 4));
    card.mesh.position.set(actor.x, actor.y + card.worldH * 0.5, actor.z);
    card.mesh.visible = !actor.pending;
    group.add(card.mesh);
    if (actor.img && card.painted) actor.img.src = card.painted.thumb.toDataURL();
  }
  function releaseCard(actor) {
    if (!actor.mesh || actor.falling || actor.pending) return;
    group.remove(actor.mesh);
    actor.mesh.material.map = null;
    actor.mesh.material.dispose();
    if (actor.tex) actor.tex.dispose();
    actor.mesh = null;
    actor.tex = null;
    actor.painted = null;
  }
  function addActor(drop, { prepend = false } = {}) {
    const size = worldCardSize(drop.height, drop.spec, cardEdgeFor(drop.id));
    const y0 = groundY(cm, drop);
    const fresh = !seen.has(drop.id);
    const actor = {
      drop,
      mesh: null,
      tex: null,
      painted: null,
      img: null,
      worldH: size.worldH,
      worldW: size.worldW,
      x: drop.x, z: drop.z, y: y0,
      vx: 0, vz: 0, vy: 0,
      grounded: !fresh,
      falling: false,
      pending: fresh,
      radius: Math.max(0.55, Math.min(size.worldW * 0.5, 4))
    };
    separate(actor);
    actor.y = groundY(cm, { ...actor.drop, x: actor.x, z: actor.z });
    separate(actor);
    actor.drop.x = actor.x;
    actor.drop.z = actor.z;
    if (fresh) seen.add(drop.id);
    items.push(actor);
    if (overlay) {
      overlay.drops.push({
        get x() { return actor.x; },
        get z() { return actor.z; },
        get thumb() { return actor.painted ? actor.painted.thumb : null; }
      });
    }
    rowQueue.push({ actor, prepend });
    return actor;
  }
  function thumbURL(actor) {
    if (actor.thumbUrl) return actor.thumbUrl;
    const painted = paintDrop(actor.drop.spec, actor.drop.author, actor.drop.id);
    actor.thumbUrl = painted.thumb.toDataURL();
    return actor.thumbUrl;
  }
  const thumbObserver = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target;
        const actor = img._actor;
        if (actor && !img.getAttribute('src')) img.src = thumbURL(actor);
        thumbObserver.unobserve(img);
      }
    }, { root: list, rootMargin: '120px' })
    : null;
  function buildRow(actor, prepend) {
    const drop = actor.drop;
    const author = String(drop.author || '');
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'drop-row';
    const img = document.createElement('img');
    img.alt = '';
    actor.img = img;
    img._actor = actor;
    if (actor.painted) img.src = actor.painted.thumb.toDataURL();
    else if (typeof IntersectionObserver === 'function') thumbObserver.observe(img);
    else img.src = thumbURL(actor);
    const text = document.createElement('span');
    text.className = 'drop-row-text';
    const title = document.createElement('strong');
    title.textContent = String(drop.name || '');
    const meta = document.createElement('em');
    const profile = xProfileUrl(author);
    const handle = `@${author.replace(/^@/, '')}`;
    if (profile) {
      const link = document.createElement('a');
      link.className = 'drop-author';
      link.href = profile;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = handle;
      link.title = 'Open X profile';
      link.addEventListener('click', (event) => event.stopPropagation());
      meta.append(link, document.createTextNode(` · ${ago(drop.created)}`));
    } else {
      meta.textContent = `${handle} · ${ago(drop.created)}`;
    }
    text.append(title, meta);
    row.append(img, text);
    row.addEventListener('click', () => teleportTo(actor));
    if (prepend && list.firstChild) list.insertBefore(row, list.firstChild);
    else list.appendChild(row);
    return actor;
  }
  const newest = [...rows].sort((a, b) => Date.parse(b.created) - Date.parse(a.created));
  for (const drop of newest) addActor(drop);
  saveSeen(seen);

  const streets = ((network && network.edges) || []).map((edge) => ({
    x0: edge.x0,
    z0: edge.z0,
    x1: edge.x0 + edge.dx * edge.span,
    z1: edge.z0 + edge.dz * edge.span,
    len: Math.max(0.5, edge.span),
    next: []
  }));
  if (network && network.edges) {
    const index = new Map(network.edges.map((edge, i) => [edge, i]));
    network.edges.forEach((edge, i) => {
      for (const move of edge.moves || []) {
        const j = index.get(move.to);
        if (j !== undefined && j !== i) streets[i].next.push(j);
      }
    });
  }
  const nearestStreet = (x, z) => {
    let best = 0;
    let bestD = Infinity;
    let bestT = 0;
    for (let i = 0; i < streets.length; i++) {
      const e = streets[i];
      const dx = e.x1 - e.x0;
      const dz = e.z1 - e.z0;
      let t = ((x - e.x0) * dx + (z - e.z0) * dz) / (e.len * e.len);
      t = Math.max(0, Math.min(1, t));
      const px = e.x0 + dx * t;
      const pz = e.z0 + dz * t;
      const d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < bestD) { bestD = d; best = i; bestT = t; }
    }
    return { i: best, t: bestT };
  };
  const routeTo = (from, to) => {
    if (!streets.length || from === to) return [from];
    const goal = streets[to];
    const gx = (goal.x0 + goal.x1) * 0.5;
    const gz = (goal.z0 + goal.z1) * 0.5;
    const score = new Map([[from, 0]]);
    const prev = new Map();
    const open = [from];
    const seen = new Set();
    while (open.length) {
      let pick = 0;
      let best = Infinity;
      for (let i = 0; i < open.length; i++) {
        const e = streets[open[i]];
        const s = score.get(open[i]) + Math.hypot((e.x0 + e.x1) * 0.5 - gx, (e.z0 + e.z1) * 0.5 - gz);
        if (s < best) { best = s; pick = i; }
      }
      const cur = open.splice(pick, 1)[0];
      if (cur === to) break;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const base = score.get(cur);
      for (const nxt of streets[cur].next) {
        const ng = base + streets[cur].len;
        if (ng < (score.get(nxt) ?? Infinity)) {
          score.set(nxt, ng);
          prev.set(nxt, cur);
          open.push(nxt);
        }
      }
    }
    const path = [];
    let cursor = prev.has(to) || to === from ? to : from;
    const guard = new Set();
    while (cursor !== undefined && !guard.has(cursor)) {
      guard.add(cursor);
      path.push(cursor);
      if (cursor === from) break;
      cursor = prev.get(cursor);
    }
    path.reverse();
    return path.length ? path : [from];
  };
  const startOn = streets.length ? nearestStreet(40, 360) : { i: 0, t: 0 };
  const flyer = {
    mesh: makeBot(),
    x: streets.length ? streets[startOn.i].x0 : 40,
    y: 8,
    z: streets.length ? streets[startOn.i].z0 : 360,
    edge: startOn.i,
    along: startOn.t,
    path: null,
    pathAt: 0,
    alt: 8,
    altTarget: 8,
    altT: 2,
    mode: 'wander',
    job: null,
    spitT: 0,
    released: false
  };
  group.add(flyer.mesh);
  overlay = {
    bot: { x: flyer.x, z: flyer.z },
    drops: items.map((actor) => ({
      get x() { return actor.x; },
      get z() { return actor.z; },
      get thumb() { return actor.painted ? actor.painted.thumb : null; }
    }))
  };
  if (mapSystem && mapSystem.setLiveOverlay) mapSystem.setLiveOverlay(overlay);

  function pushFrom(px, pz, radius, speed) {
    for (const actor of items) {
      if (!actor.grounded) continue;
      const dx = actor.x - px;
      const dz = actor.z - pz;
      const reach = radius + actor.radius;
      const d = Math.hypot(dx, dz);
      if (d > reach || d < 1e-4) continue;
      const nx = dx / d;
      const nz = dz / d;
      const kick = 4 + Math.min(10, Math.abs(speed) * 0.35);
      actor.vx += nx * kick;
      actor.vz += nz * kick;
    }
  }

  function separate(actor) {
    const body = {
      car: false,
      radius: actor.radius,
      extX: actor.radius,
      extZ: actor.radius,
      bottom: 0.02,
      top: Math.max(0.8, actor.worldH)
    };
    const stop = (nx, nz) => {
      const vn = actor.vx * nx + actor.vz * nz;
      if (vn < 0) {
        actor.vx -= nx * vn;
        actor.vz -= nz * vn;
      }
    };
    for (let pass = 0; pass < 6; pass++) {
      const near = cm.nearColliders(actor.x, actor.z, Math.max(8, actor.radius + 4));
      const ejected = ejectCircle(actor.x, actor.z, near, (c, x, z) => {
        if (!buildingContact(c, x, actor.y, z, body, contact)) return null;
        return { nx: contact.nx, nz: contact.nz, depth: contact.depth };
      }, 1, stop);
      actor.x = ejected.x;
      actor.z = ejected.z;
      if (!ejected.hit) break;
    }
  }

  function update(dt, camera) {
    const entity = cm.getActiveEntity();
    if (entity && (cm.activeMode === 'car' || entity.roachScale > 1)) {
      const reach = cm.activeMode === 'car' ? (entity.half || 2.4) : Math.max(entity.giantHalfW || 1, entity.giantHalfL || 1);
      pushFrom(entity.position.x, entity.position.z, reach, entity.speed || 0);
    }
    const cam = camera.position;
    const mouthOf = (actor) => groundY(cm, actor.drop) + actor.worldH + 1.2;
    const nextJob = () => items.find((actor) => actor.pending) || null;
    const beginJob = (job) => {
      flyer.mode = 'route';
      flyer.job = job;
      flyer.released = false;
      flyer.spitT = 0;
      if (streets.length) {
        const dest = nearestStreet(job.x, job.z);
        flyer.path = routeTo(flyer.edge, dest.i);
        flyer.pathAt = 0;
      }
    };
    const rideStreet = (speed) => {
      if (!streets.length) return;
      let left = speed * dt;
      let guard = 6;
      while (left > 0.01 && guard--) {
        const edge = streets[flyer.edge];
        const remain = Math.max(0, (1 - flyer.along) * edge.len);
        if (left < remain) {
          flyer.along += left / edge.len;
          left = 0;
          break;
        }
        left -= remain;
        const planned = flyer.path && flyer.path[flyer.pathAt + 1];
        const options = edge.next;
        let nxt = planned !== undefined && options.includes(planned) ? planned : options[(Math.random() * options.length) | 0];
        if (nxt === undefined) {
          flyer.along = Math.max(0, flyer.along - 0.02);
          break;
        }
        flyer.edge = nxt;
        flyer.along = 0;
        if (flyer.path && flyer.path[flyer.pathAt + 1] === nxt) flyer.pathAt++;
      }
      const edge = streets[flyer.edge];
      flyer.x = edge.x0 + (edge.x1 - edge.x0) * flyer.along;
      flyer.z = edge.z0 + (edge.z1 - edge.z0) * flyer.along;
    };
    flyer.altT -= dt;
    if (flyer.altT <= 0) {
      flyer.altT = 5 + Math.random() * 7;
      flyer.altTarget = 3 + Math.random() * 17;
    }
    flyer.alt += (flyer.altTarget - flyer.alt) * (1 - Math.exp(-dt * 0.35));
    flyer.alt = Math.max(3, Math.min(20, flyer.alt));
    const streetClear = (y) => {
      let top = y;
      for (const c of cm.nearColliders(flyer.x, flyer.z, 2)) {
        if ((c.maxY ?? 0) > 24) continue;
        if (flyer.x < c.minX - 1.6 || flyer.x > c.maxX + 1.6 || flyer.z < c.minZ - 1.6 || flyer.z > c.maxZ + 1.6) continue;
        if (top < c.maxY + 1.7) top = c.maxY + 1.7;
      }
      return Math.max(3, Math.min(20, top));
    };
    if (flyer.mode === 'wander') {
      rideStreet(16);
      flyer.y = streetClear(flyer.alt);
      const job = nextJob();
      if (job) beginJob(job);
    } else if (flyer.mode === 'route' && flyer.job) {
      rideStreet(28);
      flyer.y = streetClear(flyer.alt);
      const dx = flyer.job.x - flyer.x;
      const dz = flyer.job.z - flyer.z;
      if (dx * dx + dz * dz < 12 * 12 || (flyer.path && flyer.pathAt >= flyer.path.length - 1 && dx * dx + dz * dz < 40 * 40)) {
        flyer.mode = 'spit';
        flyer.spitT = 0;
        flyer.released = false;
      }
    } else if (flyer.mode === 'spit' && flyer.job) {
      const job = flyer.job;
      const mouth = mouthOf(job);
      flyer.spitT += dt;
      const k = 1 - Math.exp(-dt * 8);
      flyer.x += (job.x - flyer.x) * k;
      flyer.y += (mouth - flyer.y) * k;
      flyer.z += (job.z - flyer.z) * k;
      flyer.vx = flyer.vy = flyer.vz = 0;
      if (!flyer.released && flyer.spitT > 0.18) {
        ensureCard(job);
        job.mesh.visible = true;
        job.x = job.drop.x;
        job.z = job.drop.z;
        job.y = mouth;
        job.falling = true;
        job.grounded = false;
        job.vy = -1;
        job.pending = false;
        flyer.released = true;
      }
      if (flyer.spitT > 0.55) {
        const again = nextJob();
        if (again) beginJob(again);
        else {
          flyer.mode = 'wander';
          flyer.job = null;
          flyer.path = null;
        }
      }
    }
    flyer.mesh.position.set(flyer.x, flyer.y, flyer.z);
    flyer.mesh.lookAt(cam.x, cam.y, cam.z);
    overlay.bot.x = flyer.x;
    overlay.bot.z = flyer.z;
    let rowBudget = 24;
    while (rowCursor < rowQueue.length && rowBudget--) {
      const next = rowQueue[rowCursor++];
      buildRow(next.actor, next.prepend);
    }
    if (rowCursor >= rowQueue.length) {
      rowQueue.length = 0;
      rowCursor = 0;
    }
    let builds = 0;
    let labels = 0;
    const now = performance.now() / 1000;
    for (let i = 0; i < items.length; i++) {
      const actor = items[i];
      const dx = actor.x - cam.x;
      const dz = actor.z - cam.z;
      const dist2 = dx * dx + dz * dz;
      const moving = actor.falling || Math.abs(actor.vx) > 0.02 || Math.abs(actor.vz) > 0.02;
      if (actor.falling) {
        actor.vy -= 12 * dt;
        actor.y += actor.vy * dt;
        const gy = groundY(cm, actor.drop);
        if (actor.y <= gy) {
          actor.y = gy;
          actor.vy = 0;
          actor.falling = false;
          actor.grounded = true;
        }
        separate(actor);
        if (actor.grounded) actor.y = groundY(cm, { ...actor.drop, x: actor.x, z: actor.z });
      } else if (moving) {
        actor.x += actor.vx * dt;
        actor.z += actor.vz * dt;
        const drag = Math.exp(-dt * 2.4);
        actor.vx *= drag;
        actor.vz *= drag;
        if (Math.hypot(actor.vx, actor.vz) < 0.05) actor.vx = actor.vz = 0;
        separate(actor);
        actor.y = groundY(cm, { ...actor.drop, x: actor.x, z: actor.z });
      }
      const close = dist2 < BUILD_NEAR * BUILD_NEAR || actor.falling;
      if (!actor.mesh && !actor.pending && close && builds < 4) {
        ensureCard(actor);
        builds++;
      }
      if (actor.mesh && !actor.pending && !actor.falling && dist2 > BUILD_FAR * BUILD_FAR) releaseCard(actor);
      if (!actor.mesh) continue;
      actor.mesh.visible = !actor.pending;
      actor.mesh.position.set(actor.x, actor.y + actor.worldH * 0.5, actor.z);
      actor.mesh.lookAt(cam.x, actor.mesh.position.y, cam.z);
      if (actor.painted && labels < 4 && (actor.falling || dist2 < LABEL_NEAR * LABEL_NEAR)) {
        actor.painted.redrawLabel(now);
        actor.tex.needsUpdate = true;
        labels++;
      }
    }
    group.updateMatrixWorld(true);
    publishObstacles();
  }

  const published = [];
  function publishObstacles() {
    if (!obstacles) return;
    const focus = cameraSystem.camera.position;
    let n = 0;
    for (let i = 0; i < items.length; i++) {
      const actor = items[i];
      if (!actor.grounded) continue;
      const dx = actor.x - focus.x;
      const dz = actor.z - focus.z;
      if (dx * dx + dz * dz > OBSTACLE_NEAR * OBSTACLE_NEAR) continue;
      if (!published[n]) published[n] = { x: 0, z: 0, radius: 0 };
      const slot = published[n++];
      slot.x = actor.x;
      slot.z = actor.z;
      slot.radius = actor.radius;
    }
    obstacles.length = n;
    for (let i = 0; i < n; i++) obstacles[i] = published[i];
  }
  publishObstacles();

  const tip = document.createElement('div');
  tip.id = 'drop-tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const canvas = renderer && renderer.domElement;
  let pressed = null;

  function pick(event) {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, cameraSystem.camera);
    const meshes = [];
    for (let i = 0; i < items.length; i++) if (items[i].mesh && items[i].mesh.visible) meshes.push(items[i].mesh);
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    for (let i = 0; i < items.length; i++) if (items[i].mesh === hits[0].object) return items[i];
    return null;
  }

  function showTip(actor, x, y, touch) {
    if (!actor) {
      tip.hidden = true;
      tip.classList.remove('is-touch');
      if (canvas) canvas.style.cursor = '';
      return;
    }
    const author = String(actor.drop.author || '');
    const handle = author.startsWith('@') ? author : `@${author}`;
    const profile = xProfileUrl(author);
    tip.hidden = false;
    tip.classList.toggle('is-touch', !!touch);
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
    tip.replaceChildren();
    const name = document.createElement('div');
    name.textContent = String(actor.drop.name || '');
    tip.appendChild(name);
    if (profile) {
      const link = document.createElement('a');
      link.href = profile;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = handle;
      link.title = 'Open X profile';
      tip.appendChild(link);
    } else {
      const who = document.createElement('div');
      who.textContent = handle;
      tip.appendChild(who);
    }
    if (canvas && !touch) canvas.style.cursor = 'pointer';
  }

  if (canvas) {
    canvas.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      showTip(pick(event), event.clientX, event.clientY, false);
    });
    canvas.addEventListener('pointerleave', () => {
      if (!tip.classList.contains('is-touch')) showTip(null);
    });
    canvas.addEventListener('pointerdown', (event) => {
      const actor = pick(event);
      pressed = { x: event.clientX, y: event.clientY, actor, type: event.pointerType };
      if (event.pointerType === 'touch') showTip(actor, event.clientX, event.clientY, true);
    });
    canvas.addEventListener('pointerup', (event) => {
      if (!pressed || event.pointerType === 'touch') return;
      const moved = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y);
      const actor = pressed.actor;
      pressed = null;
      if (moved > 6 || !actor) return;
      teleportTo(actor);
    });
  }

  let lastFetch = Date.now();
  let polling = false;
  let pollTimer = 0;
  function schedulePoll() {
    clearTimeout(pollTimer);
    if (document.hidden) return;
    const delay = Math.max(1000, DROPS_POLL_MS - (Date.now() - lastFetch));
    pollTimer = setTimeout(() => { pollRemote('interval'); }, delay);
  }
  function pollRemote(reason) {
    if (polling || !pollDue(lastFetch, Date.now(), document.hidden, reason)) return false;
    polling = true;
    lastFetch = Date.now();
    clearTimeout(pollTimer);
    fetchRemoteDocument(DROPS_REMOTE_URL, { timeoutMs: DROPS_FETCH_TIMEOUT_MS }).then((again) => {
      remote = acceptRemoteRecords(again, {
        ids: knownIds,
        accepted: remote.accepted,
        warn: (message) => console.warn(message),
        warned
      });
      for (let i = 0; i < remote.taken.length; i++) addActor(remote.taken[i], { prepend: true });
    }).catch(() => {
      /* remote stays optional */
    }).finally(() => {
      polling = false;
      schedulePoll();
    });
    return true;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(pollTimer);
    else if (!pollRemote('focus')) schedulePoll();
  });
  window.addEventListener('focus', () => { pollRemote('focus'); });
  schedulePoll();

  return { group, update };
}
