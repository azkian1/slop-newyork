// Objects people asked for, spat into the city by a GrokBot and left as trash.
// New since the last visit fall from the sky. Older ones are already on the ground.
// Pushes stay on this machine.

import * as THREE from 'three/webgpu';
import { paintDrop } from './drop-paint.js';
import { buildingContact, collisionBody } from './controllers.js';
import { makeBot } from './grok-bot.js';
import { standOffsets } from './drop-place.js';
import { xProfileUrl } from './drop-schema.js';

const SEEN_KEY = 'slop-drops-seen';
const BODY = collisionBody('person', 0.2, 0);

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

function makeCard(drop) {
  const painted = paintDrop(drop.spec, drop.author, drop.id);
  const tex = new THREE.CanvasTexture(painted.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  const worldH = drop.height * (painted.canvas.height / painted.objectPx);
  const worldW = worldH * (painted.canvas.width / painted.canvas.height);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(worldW, worldH),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  );
  mesh.name = 'DropCard';
  mesh.userData.drop = true;
  mesh.renderOrder = 2;
  return { mesh, tex, painted, worldH, worldW };
}

export async function createDrops({ scene, cameraSystem, controllerManager, mapSystem, renderer, network }) {
  let rows;
  try {
    const res = await fetch(new URL('../data/drops.json', import.meta.url), { cache: 'no-store' });
    if (!res.ok) return null;
    rows = await res.json();
  } catch {
    return null;
  }
  if (!Array.isArray(rows) || !rows.length) return null;

  const seen = loadSeen();
  const cm = controllerManager;
  const group = new THREE.Group();
  group.name = 'Drops';
  scene.add(group);

  const panel = document.createElement('aside');
  panel.id = 'drop-log';
  panel.className = 'drop-log';
  panel.innerHTML = '<button type="button" class="drop-log-toggle" aria-expanded="true">Drops</button><div class="drop-log-list"></div>';
  document.body.appendChild(panel);
  const list = panel.querySelector('.drop-log-list');
  panel.querySelector('.drop-log-toggle').addEventListener('click', () => {
    const closed = panel.classList.toggle('is-closed');
    panel.querySelector('.drop-log-toggle').setAttribute('aria-expanded', String(!closed));
  });

  const items = [];
  const contact = { nx: 0, nz: 0, depth: 0 };
  function teleportTo(actor) {
    if (cameraSystem._focus) cameraSystem._focus = null;
    const heading = Number.isFinite(actor.drop.yaw) ? actor.drop.yaw : 0;
    let spot = null;
    const reach = Math.max(1.4, (actor.radius || 1) + 0.8);
    for (const [ox, oz] of standOffsets(heading, reach)) {
      spot = cm.findTeleportPosition(actor.x + ox, actor.z + oz, heading, 0);
      if (spot) break;
    }
    if (!spot) spot = cm.findTeleportPosition(actor.x, actor.z, heading, 0);
    if (!spot) return;
    if (window.roach && window.roach.teleport) window.roach.teleport(spot.x, spot.z, heading);
    else cm.teleportActiveTo(spot.x, spot.z, heading);
  }
  const newest = [...rows].sort((a, b) => Date.parse(b.created) - Date.parse(a.created));

  for (const drop of newest) {
    const card = makeCard(drop);
    const y0 = groundY(cm, drop);
    const fresh = !seen.has(drop.id);
    const actor = {
      drop, ...card,
      x: drop.x, z: drop.z, y: y0,
      vx: 0, vz: 0, vy: 0,
      grounded: !fresh,
      falling: false,
      pending: fresh,
      radius: Math.max(0.35, Math.min(card.worldW, card.worldH) * 0.28)
    };
    card.mesh.position.set(actor.x, actor.y + card.worldH * 0.5, actor.z);
    group.add(card.mesh);
    if (fresh) {
      actor.mesh.visible = false;
      seen.add(drop.id);
    }
    items.push(actor);

    const name = String(drop.name || '');
    const author = String(drop.author || '');
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'drop-row';
    const img = document.createElement('img');
    img.alt = '';
    img.src = card.painted.thumb.toDataURL();
    const text = document.createElement('span');
    text.className = 'drop-row-text';
    const title = document.createElement('strong');
    title.textContent = name;
    const meta = document.createElement('em');
    const profile = xProfileUrl(author);
    const handle = author.startsWith('@') ? author : `@${author}`;
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
    list.appendChild(row);
  }
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
  const overlay = {
    bot: { x: flyer.x, z: flyer.z },
    drops: items.map((actor) => ({
      get x() { return actor.x; },
      get z() { return actor.z; },
      thumb: actor.painted.thumb
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
    for (const c of cm.nearColliders(actor.x, actor.z, actor.radius + 2)) {
      if (!buildingContact(c, actor.x, actor.y + 0.2, actor.z, { ...BODY, radius: actor.radius, extX: actor.radius, extZ: actor.radius }, contact)) continue;
      actor.x += contact.nx * contact.depth;
      actor.z += contact.nz * contact.depth;
      const vn = actor.vx * contact.nx + actor.vz * contact.nz;
      if (vn < 0) {
        actor.vx -= contact.nx * vn;
        actor.vz -= contact.nz * vn;
      }
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
    for (const actor of items) {
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
      } else if (actor.grounded) {
        actor.x += actor.vx * dt;
        actor.z += actor.vz * dt;
        const drag = Math.exp(-dt * 2.4);
        actor.vx *= drag;
        actor.vz *= drag;
        if (Math.hypot(actor.vx, actor.vz) < 0.05) actor.vx = actor.vz = 0;
        separate(actor);
        actor.y = groundY(cm, { ...actor.drop, x: actor.x, z: actor.z });
      }
      actor.mesh.position.set(actor.x, actor.y + actor.worldH * 0.5, actor.z);
      actor.mesh.lookAt(cam.x, actor.mesh.position.y, cam.z);
      const near = Math.hypot(cam.x - actor.x, cam.z - actor.z) < 80 || actor.falling;
      if (near) {
        actor.painted.redrawLabel(performance.now() / 1000);
        actor.tex.needsUpdate = true;
      }
    }
    group.updateMatrixWorld(true);
  }

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
    for (let i = 0; i < items.length; i++) if (items[i].mesh.visible) meshes.push(items[i].mesh);
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

  return { group, update };
}
