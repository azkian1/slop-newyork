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
const { landingFor, standOffsets } = place;
const { validateDrop, xProfileUrl } = load('js/drop-schema.js', { './drop-size.js': size });

test('drop heights follow the dictionary, modifiers, and the 300 m cap', () => {
  assert.equal(resolveDropHeight({ name: 'cat' }), OBJECT_HEIGHTS.cat);
  assert.equal(resolveDropHeight({ name: 'grand piano' }), 1.5);
  assert.equal(resolveDropHeight({ name: 'tank' }), 7);
  assert.equal(resolveDropHeight({ name: 'whale' }), 25);
  assert.equal(resolveDropHeight({ name: 'snowman', request: 'a 4 meter snowman' }), 4);
  assert.equal(resolveDropHeight({ name: 'cat', request: 'a giant cat' }), 3.2);
  assert.equal(resolveDropHeight({ name: 'car', request: 'a tiny car' }), 4.5 * 0.25);
  assert.equal(resolveDropHeight({ name: 'widget', request: 'a house-sized widget' }), SIZE_CLASSES.house);
  assert.equal(resolveDropHeight({ name: 'mystery' }), SIZE_CLASSES.human);
  assert.equal(resolveDropHeight({ name: 'whale', request: 'a 900 meter whale' }), MAX_DROP_HEIGHT);
  assert.equal(resolveDropHeight({ height: 12 }), 12);
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

test('a click stands beside the drawing, not on top of it', () => {
  const offsets = standOffsets(0, 2);
  assert.equal(offsets.length, 16);
  for (const [ox, oz] of offsets) assert.ok(Math.hypot(ox, oz) > 1.5);
  const source = readFileSync(join(root, 'js/drops.js'), 'utf8');
  assert.match(source, /function teleportTo\(actor\)/);
  assert.match(source, /roach\.teleport\(spot\.x, spot\.z, heading\)/);
  assert.match(source, /row\.addEventListener\('click', \(\) => teleportTo\(actor\)\)/);
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
    assert.equal(validateDrop(row).join(';'), '');
    assert.ok(!/[\u0400-\u04FF]/.test(JSON.stringify(row)));
  }
  const byId = Object.fromEntries(rows.map((row) => [row.sourceId, row]));
  assert.equal(byId['demo-lobster'].name, 'giant lobster lifting a barbell');
  assert.equal(byId['demo-lobster'].height, 15);
  assert.equal(byId['demo-davy-unicorn'].height, 2.8);
  assert.equal(byId['demo-snowman'].height, 4);
  assert.equal(byId['demo-horse'].height, 4.6);
  assert.equal(byId['demo-piano'], undefined);
  assert.equal(byId['demo-tank'], undefined);
  for (const row of rows) assert.equal(row.author, 'azaticus');
});
