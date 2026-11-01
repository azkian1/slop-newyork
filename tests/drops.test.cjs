const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { loadModule } = require('./helpers/module.cjs');

const root = join(__dirname, '..');

function load(file, imports = {}) {
  const source = readFileSync(join(root, file), 'utf8');
  return loadModule(source, { imports });
}

const size = load('js/drop-size.js');
const { resolveDropHeight, MAX_DROP_HEIGHT, OBJECT_HEIGHTS, SIZE_CLASSES } = size;
const place = load('js/drop-place.js', { './drop-rng.js': load('js/drop-rng.js') });
const { landingFor, chooseStand, ejectCircle, circleGap, pathGap, boxPush, circleOverlap } = place;
const validate = load('js/drop-validate.js', { './drop-place.js': place, './drop-size.js': size });
const { validateDrop, xProfileUrl } = load('js/drop-schema.js', { './drop-validate.js': validate });

test('drop heights follow the dictionary and the words in the request', () => {
  assert.equal(resolveDropHeight({ name: 'cat' }), OBJECT_HEIGHTS.cat);
  assert.equal(resolveDropHeight({ name: 'grand piano' }), 1.5);
  assert.equal(resolveDropHeight({ name: 'tank' }), 7);
  assert.equal(resolveDropHeight({ name: 'whale' }), 25);
  assert.equal(resolveDropHeight({ name: 'snowman', request: 'a 4 meter snowman' }), 4);
  assert.equal(resolveDropHeight({ name: 'cat', request: 'a giant cat' }), 3.2);
  assert.equal(resolveDropHeight({ name: 'car', request: 'a tiny car' }), 4.5 * 0.25);
  assert.equal(resolveDropHeight({ name: 'widget', request: 'a house-sized widget' }), SIZE_CLASSES.house);
  assert.equal(resolveDropHeight({ name: 'mystery' }), SIZE_CLASSES.human);
  assert.equal(resolveDropHeight({ name: 'whale', request: 'a 900 meter whale' }), 900);
  assert.equal(resolveDropHeight({ height: 12 }), 12);
  assert.equal(MAX_DROP_HEIGHT, 10);
});

test('landing spots are stable and inside the midtown grid', () => {
  const a = landingFor('demo-tank');
  const b = landingFor('demo-tank');
  assert.deepEqual(a, b);
  assert.notDeepEqual(landingFor('demo-piano'), a);
  assert.ok(a.x > -900 && a.x < 1400);
  assert.ok(a.z > -1400 && a.z < 2000);
  assert.ok(['street', 'sidewalk', 'roof'].includes(a.surface));
});

test('a click stands in front of the drawing and faces it', () => {
  const spot = chooseStand(10, 20, 2, 0, 1, (x, z) => ({ x, z }));
  assert.ok(spot);
  assert.ok(spot.z > 20 + 3, 'a few metres in front, along the viewer');
  assert.ok(Math.abs(spot.x - 10) < 0.2);
  assert.ok(Math.hypot(spot.x - 10, spot.z - 20) < 8);
  const towardX = 10 - spot.x;
  const towardZ = 20 - spot.z;
  const facing = Math.sin(spot.heading) * towardX + Math.cos(spot.heading) * towardZ;
  assert.ok(facing > 0.95 * Math.hypot(towardX, towardZ));
  const shifted = chooseStand(0, 0, 1.5, 1, 0, (x, z) => (x > 2 ? null : { x, z }));
  assert.ok(shifted);
  assert.ok(Math.hypot(shifted.x, shifted.z) > 1.5 + 1.4);
  const inside = chooseStand(0, 0, 1, 0, 1, () => ({ x: 0, z: 0.2 }));
  assert.equal(inside, null);
  const source = readFileSync(join(root, 'js/drops.js'), 'utf8');
  assert.match(source, /function teleportTo\(actor\)/);
  assert.match(source, /chooseStand\(/);
  assert.match(source, /roach\.teleport\(spot\.x, spot\.z, spot\.heading, aim\)/);
  assert.match(source, /row\.addEventListener\('click', \(\) => teleportTo\(actor\)\)/);
  assert.match(source, /moved > 6/);
  const roach = readFileSync(join(root, 'js/cockroach.js'), 'utf8');
  assert.match(roach, /orbitYawOffset/);
  assert.match(roach, /pos\.y \+ 0\.03 \* sc/);
});

test('a drawing is pushed out of a building and blocks cars and people', () => {
  const box = { minX: -2, maxX: 2, minZ: -2, maxZ: 2 };
  const contact = (_c, x, z) => {
    if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) return null;
    const left = x - box.minX;
    const right = box.maxX - x;
    const down = z - box.minZ;
    const up = box.maxZ - z;
    const m = Math.min(left, right, down, up);
    if (m === left) return { nx: -1, nz: 0, depth: left + 0.5 };
    if (m === right) return { nx: 1, nz: 0, depth: right + 0.5 };
    if (m === down) return { nx: 0, nz: -1, depth: down + 0.5 };
    return { nx: 0, nz: 1, depth: up + 0.5 };
  };
  const out = ejectCircle(0.2, 0.1, [box], contact);
  assert.ok(out.hit);
  assert.ok(out.x < box.minX - 0.4 || out.x > box.maxX + 0.4 || out.z < box.minZ - 0.4 || out.z > box.maxZ + 0.4);
  const circles = [{ x: 0, z: 10, radius: 2 }];
  assert.ok(Math.abs(circleGap(0, 0, 0, 2.2, 0.9, circles) - 5.8) < 1e-6);
  assert.equal(circleGap(0, 0, 0, 2.2, 0.9, [{ x: 8, z: 5, radius: 1 }]), Infinity);
  assert.ok(Math.abs(pathGap(0, 0, 0, 1, 1, 0.4, circles) - 7.6) < 1e-6);
  assert.equal(pathGap(0, 10, 0, 1, 1, 0.4, circles), 0);
  const pushed = boxPush(0, 6, 0, 2.2, 0.9, circles);
  assert.ok(pushed.hit);
  assert.ok(pushed.z < 6);
  const overlap = circleOverlap(0, 9, 0.4, circles);
  assert.ok(overlap && overlap.depth > 0);
  const traffic = readFileSync(join(root, 'js/traffic.js'), 'utf8');
  const peds = readFileSync(join(root, 'js/pedestrian-system.js'), 'utf8');
  assert.match(traffic, /dropObstacles/);
  assert.match(traffic, /circleGap\(/);
  assert.match(traffic, /function rejectDrops/);
  assert.match(peds, /pathGap\(/);
  assert.match(peds, /circleOverlap\(/);
});

test('profile links accept an x handle and nothing else', () => {
  assert.equal(xProfileUrl('azaticus'), 'https://x.com/azaticus');
  assert.equal(xProfileUrl('@horsefan'), 'https://x.com/horsefan');
  assert.equal(xProfileUrl('tank_enjoyer'), 'https://x.com/tank_enjoyer');
  assert.equal(xProfileUrl('user_snow'), 'https://x.com/user_snow');
  assert.equal(xProfileUrl('bad handle'), null);
  assert.equal(xProfileUrl('a'.repeat(16)), null);
  assert.equal(xProfileUrl(''), null);
});

test('the four demo drops are valid and unique', () => {
  const rows = JSON.parse(readFileSync(join(root, 'data/drops.json'), 'utf8'));
  assert.equal(rows.length, 4);
  const sources = new Set(rows.map((row) => row.sourceId));
  assert.equal(sources.size, 4);
  for (const row of rows) {
    const errors = validateDrop(row);
    assert.equal(errors.join(';'), '');
    assert.ok(!/[\u0400-\u04FF]/.test(JSON.stringify(row)));
  }
  const byId = Object.fromEntries(rows.map((row) => [row.sourceId, row]));
  assert.equal(byId['demo-lobster'].name, 'giant lobster lifting a barbell');
  assert.equal(byId['demo-lobster'].height, 9.5);
  assert.equal(byId['demo-davy-unicorn'].height, 2.8);
  assert.equal(byId['demo-snowman'].height, 4);
  assert.equal(byId['demo-horse'].height, 4.6);
  assert.equal(byId['demo-piano'], undefined);
  assert.equal(byId['demo-tank'], undefined);
  for (const row of rows) assert.equal(row.author, 'azaticus');
});
