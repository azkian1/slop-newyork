// Whitelist for drop records. One bad field rejects the whole record.
// Remote files are untrusted. Local demo records go through the same gate.

import { hashText } from './drop-layout.js';
import { CITY_BOUNDS } from './drop-place.js';
import { MAX_WORLD_HEIGHT, MAX_WORLD_WIDTH, cardEdgeFor, worldCardSize } from './drop-size.js';

export const MAX_REMOTE_BYTES = 50 * 1024 * 1024;
export const MAX_SHAPES = 80;
export const MAX_POINTS = 64;
export const SPEC_MARGIN = 0.5;

const TOP_KEYS = ['id', 'author', 'sourceId', 'request', 'name', 'created', 'height', 'x', 'z', 'yaw', 'surface', 'spec'];
const SPEC_KEYS = ['width', 'height', 'shapes'];
const SHAPE_KEYS = {
  rect: ['type', 'x0', 'y0', 'x1', 'y1', 'color'],
  ellipse: ['type', 'cx', 'cy', 'rx', 'ry', 'color'],
  polygon: ['type', 'points', 'color'],
  line: ['type', 'points', 'color']
};
const SURFACES = ['street', 'sidewalk', 'roof'];
const ID_RE = /^[a-z0-9-]{1,64}$/;
const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
const SOURCE_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function keysAllowed(obj, allowed) {
  const keys = Object.keys(obj);
  if (keys.length !== allowed.length) return false;
  for (let i = 0; i < keys.length; i++) if (!allowed.includes(keys[i])) return false;
  return true;
}

function plainText(value, max) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) return false;
  if (value.includes('<') || value.includes('>') || value.includes('`')) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) return false;
  }
  return true;
}

function isoDate(value) {
  if (typeof value !== 'string' || !ISO_RE.test(value)) return false;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return false;
  const iso = new Date(time).toISOString();
  if (!value.includes('.')) return iso === `${value.slice(0, -1)}.000Z`;
  const match = value.match(/\.(\d+)Z$/);
  const padded = `${value.slice(0, match.index)}.${match[1].padEnd(3, '0')}Z`;
  return iso === padded;
}

function inSpan(n, size) {
  return Number.isFinite(n) && n >= -SPEC_MARGIN && n <= size + SPEC_MARGIN;
}

function colorOk(color) {
  return Array.isArray(color)
    && color.length === 3
    && color.every((c) => Number.isInteger(c) && c >= 0 && c <= 255);
}

function pointsOk(points, width, height) {
  if (!Array.isArray(points) || points.length < 2 || points.length > MAX_POINTS) return false;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!Array.isArray(p) || p.length !== 2 || !inSpan(p[0], width) || !inSpan(p[1], height)) return false;
  }
  return true;
}

function shapeOk(shape, width, height) {
  if (!shape || typeof shape !== 'object' || Array.isArray(shape)) return false;
  const allowed = SHAPE_KEYS[shape.type];
  if (!allowed || !keysAllowed(shape, allowed) || !colorOk(shape.color)) return false;
  if (shape.type === 'rect') {
    return inSpan(shape.x0, width) && inSpan(shape.y0, height) && inSpan(shape.x1, width) && inSpan(shape.y1, height);
  }
  if (shape.type === 'ellipse') {
    if (!Number.isFinite(shape.rx) || !Number.isFinite(shape.ry) || shape.rx < 0 || shape.ry < 0) return false;
    return inSpan(shape.cx - shape.rx, width) && inSpan(shape.cx + shape.rx, width)
      && inSpan(shape.cy - shape.ry, height) && inSpan(shape.cy + shape.ry, height);
  }
  return pointsOk(shape.points, width, height);
}

export function validateDropRecord(drop) {
  if (!drop || typeof drop !== 'object' || Array.isArray(drop)) return ['drop must be an object'];
  if (!keysAllowed(drop, TOP_KEYS)) return ['unknown or missing key'];
  if (typeof drop.id !== 'string' || !ID_RE.test(drop.id)) return ['id is not a short lowercase slug'];
  if (typeof drop.author !== 'string' || !HANDLE_RE.test(drop.author)) return ['author is not an X handle'];
  if (typeof drop.sourceId !== 'string' || !SOURCE_RE.test(drop.sourceId)) return ['sourceId is not a short token'];
  if (!plainText(drop.name, 40)) return ['name must be plain ASCII, 1..40 characters'];
  if (!plainText(drop.request, 200)) return ['request must be plain ASCII, 1..200 characters'];
  if (!isoDate(drop.created)) return ['created must be an ISO timestamp'];
  if (!Number.isFinite(drop.height) || drop.height < 0.5 || drop.height > MAX_WORLD_HEIGHT) {
    return [`height must be 0.5..${MAX_WORLD_HEIGHT} m`];
  }
  if (!Number.isFinite(drop.x) || drop.x < CITY_BOUNDS.minX || drop.x > CITY_BOUNDS.maxX) return ['x is outside the city'];
  if (!Number.isFinite(drop.z) || drop.z < CITY_BOUNDS.minZ || drop.z > CITY_BOUNDS.maxZ) return ['z is outside the city'];
  if (!Number.isFinite(drop.yaw) || drop.yaw < 0 || drop.yaw > Math.PI * 2) return ['yaw must be 0..2*PI'];
  if (!SURFACES.includes(drop.surface)) return ['surface must be street, sidewalk, or roof'];
  const spec = drop.spec;
  if (!spec || typeof spec !== 'object' || Array.isArray(spec) || !keysAllowed(spec, SPEC_KEYS)) return ['spec has an unknown key'];
  if (!Number.isFinite(spec.width) || spec.width < 0.1 || spec.width > 10) return ['spec.width must be 0.1..10'];
  if (!Number.isFinite(spec.height) || spec.height < 0.1 || spec.height > 10) return ['spec.height must be 0.1..10'];
  if (!Array.isArray(spec.shapes) || spec.shapes.length < 1 || spec.shapes.length > MAX_SHAPES) return ['spec.shapes must have 1..80 shapes'];
  for (let i = 0; i < spec.shapes.length; i++) {
    if (!shapeOk(spec.shapes[i], spec.width, spec.height)) return [`shape ${i} is not a supported paint shape`];
  }
  const card = worldCardSize(drop.height, spec, cardEdgeFor(drop.id));
  if (card.worldH > MAX_WORLD_HEIGHT) return [`card is taller than ${MAX_WORLD_HEIGHT} m`];
  if (card.worldW > MAX_WORLD_WIDTH) return [`card is wider than ${MAX_WORLD_WIDTH} m`];
  return [];
}

// The profile URL is only this prefix plus the handle. Nothing in the record can replace it.
export function xProfileUrl(author) {
  const handle = String(author ?? '').trim().replace(/^@/, '');
  if (!HANDLE_RE.test(handle)) return null;
  return `https://x.com/${encodeURIComponent(handle)}`;
}

// Size is checked on the text, before JSON.parse. Failure means "no remote rows".
export function parseRemoteDocument(text) {
  if (typeof text !== 'string' || text.length > MAX_REMOTE_BYTES) return null;
  try {
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function responseHeader(res, name) {
  const headers = res && res.headers;
  if (!headers || typeof headers.get !== 'function') return null;
  return headers.get(name) || null;
}

function remoteResult(meta, rows, notModified, etag, lastModified, hash) {
  if (!meta) return rows;
  return { rows, notModified, etag, lastModified, hash };
}

// `meta: true` reports validators so a poll can send If-None-Match / If-Modified-Since
// and skip a rebuild on 304 or on a body whose text hash has not changed.
// The default return is still the row array.
async function fetchRemoteDocument(url, { fetchImpl = globalThis.fetch, timeoutMs = 30000, meta = false, etag = null, modified = null, hash = null } = {}) {
  const Timeout = globalThis.AbortController;
  const timeout = Timeout ? new Timeout() : null;
  const timer = timeout && globalThis.setTimeout ? globalThis.setTimeout(() => timeout.abort(), timeoutMs) : null;
  const empty = () => remoteResult(meta, [], false, null, null, null);
  try {
    const init = { cache: 'no-store', signal: timeout ? timeout.signal : undefined };
    if (etag || modified) {
      init.headers = {};
      if (etag) init.headers['If-None-Match'] = etag;
      if (modified) init.headers['If-Modified-Since'] = modified;
    }
    const res = await fetchImpl(url, init);
    if (res && res.status === 304) return remoteResult(meta, [], true, etag || null, modified || null, hash || null);
    if (!res || !res.ok) return empty();
    const text = await res.text();
    const nextHash = hashText(text);
    const nextEtag = responseHeader(res, 'etag') || etag || null;
    const nextModified = responseHeader(res, 'last-modified') || modified || null;
    if (hash && hash === nextHash) return remoteResult(meta, [], true, nextEtag, nextModified, nextHash);
    const rows = parseRemoteDocument(text) || [];
    return remoteResult(meta, rows, false, nextEtag, nextModified, nextHash);
  } catch {
    return empty();
  } finally {
    if (timer && globalThis.clearTimeout) globalThis.clearTimeout(timer);
  }
}

export function acceptLocalRecords(rows, warn = () => {}) {
  const taken = [];
  const ids = new Set();
  if (!Array.isArray(rows)) return taken;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const errors = validateDropRecord(row);
    if (errors.length) {
      warn(`Rejected drop ${row && row.id}: ${errors[0]}`);
      continue;
    }
    if (ids.has(row.id)) continue;
    ids.add(row.id);
    taken.push(row);
  }
  return taken;
}

// New ids only. Already placed records are left untouched. There is no count cap.
export function acceptRemoteRecords(rows, { ids, accepted = 0, warn = () => {}, warned = null } = {}) {
  const taken = [];
  const known = ids && typeof ids.has === 'function' && typeof ids.add === 'function' ? ids : new Set();
  if (!Array.isArray(rows)) return { taken, accepted };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const errors = validateDropRecord(row);
    if (errors.length) {
      const key = row && typeof row.id === 'string' && row.id ? row.id : errors[0];
      if (!warned || !warned.has(key)) {
        if (warned) warned.add(key);
        warn(`Rejected drop ${row && row.id}: ${errors[0]}`);
      }
      continue;
    }
    if (known.has(row.id)) continue;
    known.add(row.id);
    taken.push(row);
    accepted += 1;
  }
  return { taken, accepted };
}

export { fetchRemoteDocument };
