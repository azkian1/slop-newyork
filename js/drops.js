// Objects people asked for, spat into the city by a GrokBot and left as trash.
// New since the last visit fall from the sky. Older ones are already on the ground.
// Pushes stay on this machine.

import * as THREE from 'three/webgpu';
import { paintDrop } from './drop-paint.js';
import { buildingContact, collisionBody } from './controllers.js';

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

function makeBot() {
  const g = new THREE.Group();
  g.name = 'GrokBot';
  g.userData.drop = true;
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 18, 14),
    new THREE.MeshBasicMaterial({ color: 0x111111 })
  );
  const eyeGeo = new THREE.SphereGeometry(0.14, 10, 8);
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pupilGeo = new THREE.SphereGeometry(0.06, 8, 6);
  const ink = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, white);
    eye.position.set(side * 0.18, 0.1, 0.46);
    eye.userData.drop = true;
    const pupil = new THREE.Mesh(pupilGeo, ink);
    pupil.position.set(0, 0, 0.1);
    pupil.userData.drop = true;
    eye.add(pupil);
    g.add(eye);
  }
  body.userData.drop = true;
  g.add(body);
  return g;
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

export async function createDrops({ scene, cameraSystem, controllerManager }) {
  let rows;
  try {
    const res = await fetch(new URL('../data/drops.json', import.meta.url));
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
  const newest = [...rows].sort((a, b) => Date.parse(b.created) - Date.parse(a.created));

  for (const drop of newest) {
    const card = makeCard(drop);
    const y0 = groundY(cm, drop);
    const fresh = !seen.has(drop.id);
    const actor = {
      drop, ...card,
      x: drop.x, z: drop.z, y: fresh ? y0 + 28 : y0,
      vx: 0, vz: 0, vy: 0,
      grounded: !fresh,
      falling: fresh,
      bot: null,
      botT: 0,
      radius: Math.max(0.35, Math.min(card.worldW, card.worldH) * 0.28)
    };
    card.mesh.position.set(actor.x, actor.y + card.worldH * 0.5, actor.z);
    group.add(card.mesh);
    if (fresh) {
      actor.mesh.visible = false;
      actor.bot = makeBot();
      actor.bot.position.set(drop.x, y0 + 36, drop.z);
      group.add(actor.bot);
      seen.add(drop.id);
    }
    items.push(actor);

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'drop-row';
    const img = document.createElement('img');
    img.alt = '';
    img.src = card.painted.thumb.toDataURL();
    const text = document.createElement('span');
    text.className = 'drop-row-text';
    const title = document.createElement('strong');
    title.textContent = drop.name;
    const meta = document.createElement('em');
    meta.textContent = `${drop.author.startsWith('@') ? drop.author : '@' + drop.author} · ${ago(drop.created)}`;
    text.append(title, meta);
    row.append(img, text);
    row.addEventListener('click', () => {
      const gy = groundY(cm, drop);
      cameraSystem.focusOn(actor.x, gy + card.worldH * 0.5, actor.z);
    });
    list.appendChild(row);
  }
  saveSeen(seen);

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
    for (const actor of items) {
      if (actor.bot) {
        actor.botT += dt;
        const gy = groundY(cm, actor.drop);
        const mouth = gy + actor.worldH + 1.2;
        if (actor.botT < 0.9) {
          const k = actor.botT / 0.9;
          actor.bot.position.set(actor.x, (gy + 36) + (mouth - (gy + 36)) * k, actor.z);
        } else if (actor.botT < 1.15) {
          actor.bot.position.set(actor.x, mouth, actor.z);
          actor.mesh.visible = true;
          actor.y = mouth;
          actor.falling = true;
          actor.vy = -1;
        } else {
          actor.bot.position.y += dt * 18;
          actor.bot.position.x += dt * 6;
          if (actor.botT > 2.4) {
            group.remove(actor.bot);
            actor.bot = null;
          }
        }
      }
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

  return { group, update };
}
