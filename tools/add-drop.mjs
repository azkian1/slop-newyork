// Append one drop to data/drops.json.
// Usage: node tools/add-drop.mjs payload.json
//    or: node tools/add-drop.mjs --stdin
// The payload is { author, sourceId, request, name, height?, spec }.
// id, created, and the landing position are assigned here.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CITY_BOUNDS, landingFor } from '../js/drop-place.js';
import { nearestFree } from '../js/drop-layout.js';
import { resolveDropHeight } from '../js/drop-size.js';
import { sanitizeText, validateDrop, MAX_HANDLE, MAX_NAME, MAX_TEXT } from '../js/drop-schema.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'data', 'drops.json');

export function buildDrop(payload, existing) {
  const errors = [];
  if (!payload || typeof payload !== 'object') return { errors: ['payload must be an object'] };
  const author = sanitizeText(String(payload.author || '').replace(/^@/, ''), MAX_HANDLE);
  const sourceId = sanitizeText(payload.sourceId, 64);
  const name = sanitizeText(payload.name, MAX_NAME);
  const request = sanitizeText(payload.request, MAX_TEXT);
  if (!author) errors.push('author is required');
  if (!sourceId) errors.push('sourceId is required');
  if (!name) errors.push('name is required');
  if (!request) errors.push('request is required');
  if (existing.some((row) => row.sourceId === sourceId)) errors.push(`duplicate source id ${sourceId}`);
  const height = resolveDropHeight({ name, request, height: payload.height });
  const spot = landingFor(sourceId);
  const occupied = [];
  for (let i = 0; i < existing.length; i++) {
    const row = existing[i];
    if (row && Number.isFinite(row.x) && Number.isFinite(row.z)) occupied.push({ x: row.x, z: row.z });
  }
  // Same spiral as the client. The browser also rejects points that are not walkable.
  const clear = nearestFree(spot.x, spot.z, CITY_BOUNDS, () => true, occupied);
  const drop = {
    id: `drop-${sourceId.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'item'}`,
    author,
    sourceId,
    request,
    name,
    created: payload.created || new Date().toISOString(),
    height,
    x: clear.x,
    z: clear.z,
    yaw: spot.yaw,
    surface: spot.surface,
    spec: payload.spec
  };
  if (existing.some((row) => row.id === drop.id)) errors.push(`duplicate id ${drop.id}`);
  errors.push(...validateDrop(drop));
  return { drop, errors };
}

function readDrops() {
  try {
    const rows = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(rows)) throw new Error('drops.json must be an array');
    return rows;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export function appendDrop(payload) {
  const rows = readDrops();
  const { drop, errors } = buildDrop(payload, rows);
  if (errors.length) {
    const err = new Error(errors.join('; '));
    err.errors = errors;
    throw err;
  }
  rows.push(drop);
  writeFileSync(file, JSON.stringify(rows, null, 2) + '\n');
  return drop;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv[2];
  const raw = arg === '--stdin' || !arg
    ? readFileSync(0, 'utf8')
    : readFileSync(arg, 'utf8');
  try {
    const drop = appendDrop(JSON.parse(raw));
    console.log(`added ${drop.id} at ${drop.x}, ${drop.z} (${drop.surface}), ${drop.height} m`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
