// Shared drop layout. Every visitor runs the same placement, so the picture does not
// depend on who has opened the page before. Fresh deliveries, the panel page size,
// the card cap, and the minimap buckets live here too so the game and the tests agree.

export const PROTECT_RADIUS = 7;
export const FRESH_MS = 2 * 60 * 60 * 1000;
export const DELIVER_CAP = 10;
export const PANEL_FIRST = 10;
export const PANEL_PAGE = 20;
export const CARD_CAP = 60;
export const CLUSTER_PX = 24;
export const MAX_DROP_ICONS = 48;

const FINE = 1.25;
const FINE_ARC = 2.5;
const FINE_MAX = 16;
const MAX_RADIUS = 960;

export function isFresh(created, now, windowMs = FRESH_MS) {
  const t = Date.parse(created);
  return Number.isFinite(t) && now - t >= 0 && now - t <= windowMs;
}

export function hashText(text) {
  let h = 2166136261;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function polish(x, z) {
  const rx = Math.round(x * 100) / 100;
  const rz = Math.round(z * 100) / 100;
  return { x: rx === 0 ? 0 : rx, z: rz === 0 ? 0 : rz };
}

function inBounds(x, z, bounds) {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

// Cell size equals the protection radius, so a conflicting center is in this cell or a neighbor.
function Occupancy(cell) {
  this.cell = cell;
  this.buckets = new Map();
}

function cellKey(ix, iz) {
  return ix * 131072 + iz;
}

Occupancy.prototype.add = function add(x, z) {
  const ix = Math.floor(x / this.cell);
  const iz = Math.floor(z / this.cell);
  const key = cellKey(ix, iz);
  let bucket = this.buckets.get(key);
  if (!bucket) this.buckets.set(key, bucket = []);
  bucket.push(x, z);
};

Occupancy.prototype.conflicts = function conflicts(x, z, radius) {
  const ix = Math.floor(x / this.cell);
  const iz = Math.floor(z / this.cell);
  const r2 = radius * radius;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const bucket = this.buckets.get(cellKey(ix + dx, iz + dz));
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i += 2) {
        const ox = bucket[i] - x;
        const oz = bucket[i + 1] - z;
        if (ox * ox + oz * oz < r2) return true;
      }
    }
  }
  return false;
};

function acceptable(x, z, bounds, freeSpot, occ, radius, drop) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (bounds && !inBounds(x, z, bounds)) return false;
  if (occ && occ.conflicts(x, z, radius)) return false;
  if (freeSpot && !freeSpot(x, z, drop)) return false;
  return true;
}

function scan(x, z, radial, arc, start, end, bounds, freeSpot, occ, radius, drop) {
  const first = Math.max(1, Math.ceil(start / radial));
  const last = Math.floor(end / radial);
  for (let ring = first; ring <= last; ring++) {
    const dist = ring * radial;
    const count = Math.max(8, Math.ceil((Math.PI * 2 * dist) / arc));
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const spot = polish(x + Math.cos(ang) * dist, z + Math.sin(ang) * dist);
      if (acceptable(spot.x, spot.z, bounds, freeSpot, occ, radius, drop)) return spot;
    }
  }
  return null;
}

// Coarse square spiral. Step equals the protection radius, so a pile of copies
// spreads into the nearest open cell instead of sampling every metre of the disk.
function gridSpiral(x, z, bounds, freeSpot, occ, radius, drop) {
  const maxRing = Math.ceil(MAX_RADIUS / radius);
  for (let ring = 1; ring <= maxRing; ring++) {
    for (let ix = -ring; ix <= ring; ix++) {
      const vertical = ix === -ring || ix === ring;
      const z0 = vertical ? -ring : ring;
      const z1 = vertical ? ring : -ring;
      for (let iz = z0; vertical ? iz <= z1 : iz >= z1; iz += vertical ? 1 : -ring * 2) {
        const spot = polish(x + ix * radius, z + iz * radius);
        if (acceptable(spot.x, spot.z, bounds, freeSpot, occ, radius, drop)) return spot;
      }
    }
  }
  return null;
}

function settle(x, z, bounds, freeSpot, occ, radius, drop) {
  if (acceptable(x, z, bounds, freeSpot, occ, radius, drop)) return { x: x === 0 ? 0 : x, z: z === 0 ? 0 : z };
  return scan(x, z, FINE, FINE_ARC, FINE, FINE_MAX, bounds, freeSpot, occ, radius, drop)
    || gridSpiral(x, z, bounds, freeSpot, occ, radius, drop)
    || { x, z };
}

// Nearest free point. The original is kept when it is inside the city, on ground the
// caller accepts, and at least `radius` metres from every center in `placed`.
export function nearestFree(x, z, bounds, freeSpot, placed, radius = PROTECT_RADIUS, drop = null) {
  const occ = new Occupancy(radius);
  const list = placed || [];
  for (let i = 0; i < list.length; i++) occ.add(list[i].x, list[i].z);
  return settle(x, z, bounds, freeSpot, occ, radius, drop);
}

export function compareCreated(a, b) {
  const ta = Date.parse(a && a.created);
  const tb = Date.parse(b && b.created);
  const da = Number.isFinite(ta) ? ta : 0;
  const db = Number.isFinite(tb) ? tb : 0;
  if (da !== db) return da - db;
  return String(a && a.id).localeCompare(String(b && b.id));
}

// Place every record in created order (id as the tie-break). `freeSpot(x, z, drop)`
// is the walkable-ground test. The same records always produce the same map.
export function placeProtected(records, bounds, freeSpot, radius = PROTECT_RADIUS) {
  const ordered = (records || []).slice().sort(compareCreated);
  const occ = new Occupancy(radius);
  const out = new Map();
  for (let i = 0; i < ordered.length; i++) {
    const drop = ordered[i];
    const spot = settle(drop.x, drop.z, bounds, freeSpot, occ, radius, drop);
    occ.add(spot.x, spot.z);
    out.set(drop.id, spot);
  }
  return out;
}

// Screen-space buckets. A cell with one drop stays an icon; a cell with several
// becomes one circle. Extra cells past `cap` are dropped, nearest the center first.
export function clusterIcons(points, cell = CLUSTER_PX, cap = MAX_DROP_ICONS) {
  const buckets = new Map();
  const list = points || [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const cx = Math.floor(p.x / cell);
    const cy = Math.floor(p.y / cell);
    const key = `${cx},${cy}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { x: 0, y: 0, count: 0, thumb: null };
      buckets.set(key, bucket);
    }
    bucket.x += p.x;
    bucket.y += p.y;
    bucket.count += 1;
    if (!bucket.thumb && p.thumb) bucket.thumb = p.thumb;
  }
  const clusters = [];
  for (const bucket of buckets.values()) {
    clusters.push({
      x: bucket.x / bucket.count,
      y: bucket.y / bucket.count,
      count: bucket.count,
      thumb: bucket.thumb
    });
  }
  if (clusters.length > cap) {
    clusters.sort((a, b) => (a.x * a.x + a.y * a.y) - (b.x * b.x + b.y * b.y));
    clusters.length = cap;
  }
  return clusters;
}
