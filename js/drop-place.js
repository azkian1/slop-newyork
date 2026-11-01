// Deterministic landing spot inside the playable Manhattan grid (about 8th Ave to 1st Ave,
// 59th St to 14th St). Streets sit on the avenue/street lattice; sidewalks step off it;
// roofs step further into the block. The game resolves the vertical height at runtime.

import { rngFor } from './drop-rng.js';

const AVENUE0 = -860;
const STREET0 = -1370;
const AVENUE_STEP = 270;
const STREET_STEP = 80;

// Envelope of landingFor: avenue/street lattice plus the street, sidewalk, and roof offsets.
export const CITY_BOUNDS = {
  minX: AVENUE0 - 8,
  maxX: AVENUE0 + 7 * AVENUE_STEP + 67,
  minZ: STREET0 - 19,
  maxZ: STREET0 + 39 * STREET_STEP + 19
};

// Stand a few metres in front of a drawing, on a spot `probe` accepts.
// fx,fz points from the drawing toward the viewer. The heading faces the drawing.
// probe(x, z) returns {x, z} when that point is walkable, or null. A probe that
// slides the point (out of a building, onto a shore) is rejected when it moves far.
export function chooseStand(x, z, radius, fx, fz, probe) {
  const len = Math.hypot(fx, fz);
  if (!(len > 1e-4)) { fx = 0; fz = 1; }
  else { fx /= len; fz /= len; }
  const minDist = Math.max(3.2, (radius || 0) + 2.2);
  const clearOf = Math.max(2.4, (radius || 0) + 1.5);
  const angles = [0, 0.35, -0.35, 0.75, -0.75, 1.15, -1.15, 2.2, -2.2, Math.PI];
  for (let a = 0; a < angles.length; a++) {
    const ang = angles[a];
    const s = Math.sin(ang);
    const c = Math.cos(ang);
    const dx = fx * c - fz * s;
    const dz = fz * c + fx * s;
    const steps = ang === 0 ? 6 : 3;
    for (let i = 0; i < steps; i++) {
      const dist = minDist + i * 1.35;
      const qx = x + dx * dist;
      const qz = z + dz * dist;
      const spot = probe(qx, qz);
      if (!spot || !Number.isFinite(spot.x) || !Number.isFinite(spot.z)) continue;
      if (Math.hypot(spot.x - qx, spot.z - qz) > 1.75) continue;
      if (Math.hypot(spot.x - x, spot.z - z) < clearOf) continue;
      return { x: spot.x, z: spot.z, heading: Math.atan2(x - spot.x, z - spot.z) };
    }
  }
  return null;
}

// Push a circle out of solids. contact(collider, x, z) returns {nx, nz, depth} or null.
// onHit(nx, nz) runs once per shove so the caller can kill velocity into the wall.
export function ejectCircle(x, z, colliders, contact, passes = 5, onHit) {
  let nx = 0;
  let nz = 0;
  let hit = false;
  const list = colliders || [];
  for (let n = 0; n < passes; n++) {
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      const c = contact(list[i], x, z);
      if (!c || !(c.depth > 0) || !Number.isFinite(c.nx)) continue;
      const pad = c.depth + 0.03;
      x += c.nx * pad;
      z += c.nz * pad;
      nx = c.nx;
      nz = c.nz;
      hit = true;
      moved = true;
      if (onHit) onHit(c.nx, c.nz);
    }
    if (!moved) break;
  }
  return { x, z, hit, nx, nz };
}

// Metres of sidewalk ahead of a walker before a solid circle. 0 when already inside one.
export function pathGap(x, z, ux, uz, dir, body, circles) {
  if (!circles || !circles.length) return Infinity;
  let room = Infinity;
  for (let i = 0; i < circles.length; i++) {
    const d = circles[i];
    const dx = d.x - x;
    const dz = d.z - z;
    const forward = (dx * ux + dz * uz) * dir;
    const side = dx * uz - dz * ux;
    const limit = d.radius + body;
    if (Math.abs(side) >= limit) continue;
    const along = Math.sqrt(Math.max(0, limit * limit - side * side));
    if (forward + along <= 0) continue;
    const gap = forward - along;
    if (gap < room) room = gap;
  }
  return room === Infinity ? Infinity : Math.max(0, room);
}

// Bumper gap for a vehicle. Infinity when no circle lies in its corridor.
export function circleGap(x, z, yaw, half, halfWidth, circles) {
  if (!circles || !circles.length) return Infinity;
  const hx = Math.sin(yaw);
  const hz = Math.cos(yaw);
  let best = Infinity;
  for (let i = 0; i < circles.length; i++) {
    const d = circles[i];
    const dx = d.x - x;
    const dz = d.z - z;
    const ahead = dx * hx + dz * hz;
    const aside = dz * hx - dx * hz;
    if (ahead <= -half || Math.abs(aside) >= halfWidth + d.radius + 0.3) continue;
    const gap = ahead - half - d.radius;
    if (gap < best) best = gap;
  }
  return best;
}

// +1 steer right, -1 steer left, 0 hold the lane. Picks the side away from the nearest circle.
export function circleSwerve(x, z, yaw, halfWidth, circles) {
  if (!circles || !circles.length) return 0;
  const hx = Math.sin(yaw);
  const hz = Math.cos(yaw);
  let asideBest = 0;
  let score = Infinity;
  for (let i = 0; i < circles.length; i++) {
    const d = circles[i];
    const dx = d.x - x;
    const dz = d.z - z;
    const ahead = dx * hx + dz * hz;
    const aside = dz * hx - dx * hz;
    if (ahead < 0.5 || ahead > 28) continue;
    if (Math.abs(aside) > halfWidth + d.radius + 2.5) continue;
    const near = Math.abs(aside) + ahead * 0.15;
    if (near < score) { score = near; asideBest = aside; }
  }
  if (Math.abs(asideBest) < 0.2) return 0;
  return asideBest > 0 ? -1 : 1;
}

// Separate an oriented box from solid circles. x,z is the box center.
export function boxPush(x, z, yaw, halfL, halfW, circles) {
  let dx = 0;
  let dz = 0;
  let hit = false;
  if (!circles) return { x, z, dx, dz, hit };
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = -fz;
  const rz = fx;
  for (let i = 0; i < circles.length; i++) {
    const d = circles[i];
    const ox = d.x - x;
    const oz = d.z - z;
    const ahead = ox * fx + oz * fz;
    const aside = ox * rx + oz * rz;
    const ca = Math.max(-halfL, Math.min(halfL, ahead));
    const cs = Math.max(-halfW, Math.min(halfW, aside));
    const qx = x + fx * ca + rx * cs;
    const qz = z + fz * ca + rz * cs;
    const sx = qx - d.x;
    const sz = qz - d.z;
    const dist = Math.hypot(sx, sz);
    if (dist >= d.radius) continue;
    const nx = dist > 1e-5 ? sx / dist : -fx;
    const nz = dist > 1e-5 ? sz / dist : -fz;
    const push = d.radius - dist + 0.06;
    x += nx * push;
    z += nz * push;
    dx += nx * push;
    dz += nz * push;
    hit = true;
  }
  return { x, z, dx, dz, hit };
}

// Deepest overlap of a point body with the circles, or null.
export function circleOverlap(x, z, body, circles) {
  if (!circles || !circles.length) return null;
  let best = null;
  for (let i = 0; i < circles.length; i++) {
    const d = circles[i];
    const dx = x - d.x;
    const dz = z - d.z;
    const dist = Math.hypot(dx, dz);
    const need = d.radius + body;
    if (dist >= need) continue;
    const depth = need - dist;
    if (!best || depth > best.depth) {
      best = {
        depth,
        nx: dist > 1e-5 ? dx / dist : 1,
        nz: dist > 1e-5 ? dz / dist : 0
      };
    }
  }
  return best;
}

export function landingFor(id) {
  const rng = rngFor(id);
  const yaw = rng() * Math.PI * 2;
  const roll = rng();
  const surface = roll < 0.55 ? 'sidewalk' : roll < 0.9 ? 'street' : 'roof';
  const avenue = AVENUE0 + Math.floor(rng() * 8) * AVENUE_STEP;
  const street = STREET0 + Math.floor(rng() * 40) * STREET_STEP;
  let x = avenue;
  let z = street;
  if (surface === 'street') {
    x += (rng() - 0.5) * 14;
    z += (rng() - 0.5) * 10;
  } else if (surface === 'sidewalk') {
    x += 16 + rng() * 8;
    z += (rng() - 0.5) * 36;
  } else {
    x += 30 + rng() * 36;
    z += (rng() - 0.5) * 36;
  }
  return {
    x: Math.round(x * 100) / 100,
    z: Math.round(z * 100) / 100,
    yaw: Math.round(yaw * 1000) / 1000,
    surface
  };
}
