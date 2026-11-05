const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { loadModule } = require('./helpers/module.cjs');

const root = join(__dirname, '..');
const layout = loadModule(readFileSync(join(root, 'js/drop-layout.js'), 'utf8'));
const {
  PROTECT_RADIUS, FRESH_MS, DELIVER_CAP, PANEL_FIRST, PANEL_PAGE, CARD_CAP, CLUSTER_PX, MAX_DROP_ICONS,
  isFresh, hashText, placeProtected, nearestFree, clusterIcons, compareCreated
} = layout;

const bounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };

test('fresh drops are the ones created in the last two hours', () => {
  assert.equal(FRESH_MS, 2 * 60 * 60 * 1000);
  assert.equal(DELIVER_CAP, 10);
  assert.equal(PANEL_FIRST, 10);
  assert.equal(PANEL_PAGE, 20);
  assert.equal(CARD_CAP, 60);
  assert.equal(CLUSTER_PX, 24);
  assert.equal(PROTECT_RADIUS, 7);
  const now = Date.parse('2026-11-04T12:00:00.000Z');
  assert.equal(isFresh('2026-11-04T11:00:00.000Z', now), true);
  assert.equal(isFresh('2026-11-04T10:00:00.000Z', now), true);
  assert.equal(isFresh('2026-11-04T09:59:00.000Z', now), false);
  assert.equal(isFresh('2026-11-04T13:00:00.000Z', now), false);
  assert.equal(isFresh('not-a-date', now), false);
});

test('placement keeps a 7 m gap and does not depend on input order', () => {
  const records = [
    { id: 'b', created: '2020-01-01T00:00:00.000Z', x: 0, z: 0 },
    { id: 'a', created: '2020-01-01T00:00:00.000Z', x: 0, z: 0 },
    { id: 'c', created: '2021-06-01T00:00:00.000Z', x: 1, z: 1 }
  ];
  const first = placeProtected(records, bounds, () => true);
  const second = placeProtected(records.slice().reverse(), bounds, () => true);
  const kept = first.get('a');
  assert.equal(kept.x, 0);
  assert.equal(kept.z, 0);
  assert.ok(Math.hypot(first.get('b').x - first.get('a').x, first.get('b').z - first.get('a').z) >= PROTECT_RADIUS);
  const ids = ['a', 'b', 'c'];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const p = first.get(ids[i]);
      const q = first.get(ids[j]);
      assert.ok(Math.hypot(p.x - q.x, p.z - q.z) >= PROTECT_RADIUS - 0.02, `${ids[i]} ${ids[j]}`);
    }
  }
  for (const id of ids) {
    assert.equal(first.get(id).x, second.get(id).x);
    assert.equal(first.get(id).z, second.get(id).z);
  }
  assert.ok(compareCreated(records[1], records[0]) < 0);
});

test('a blocked landing walks outward and stays inside the city', () => {
  const spot = nearestFree(0, 0, bounds, (x) => x >= 0, [{ x: 0, z: 0 }]);
  assert.ok(spot.x >= 0);
  assert.ok(Math.hypot(spot.x, spot.z) >= PROTECT_RADIUS - 0.02);
  assert.ok(spot.x <= bounds.maxX && spot.z >= bounds.minZ && spot.z <= bounds.maxZ);
  const again = nearestFree(0, 0, bounds, (x) => x >= 0, [{ x: 0, z: 0 }]);
  assert.equal(spot.x, again.x);
  assert.equal(spot.z, again.z);
});

test('a stack of copies separates by the protection radius', () => {
  const records = [];
  for (let i = 0; i < 400; i++) {
    records.push({ id: `d${String(i).padStart(4, '0')}`, created: '2024-01-01T00:00:00.000Z', x: 3, z: -2 });
  }
  const placed = placeProtected(records, { minX: -2000, maxX: 2000, minZ: -2000, maxZ: 2000 }, () => true);
  assert.equal(placed.size, 400);
  const origin = placed.get('d0000');
  const next = placed.get('d0001');
  assert.equal(origin.x, 3);
  assert.equal(origin.z, -2);
  assert.ok(Math.hypot(next.x - origin.x, next.z - origin.z) >= PROTECT_RADIUS - 0.02);
  const last = placed.get('d0399');
  assert.ok(Math.hypot(last.x - origin.x, last.z - origin.z) >= PROTECT_RADIUS - 0.02);
});

test('minimap buckets collapse a cell and cap the icons', () => {
  const clusters = clusterIcons([
    { x: 0, y: 0, thumb: 'a' },
    { x: 10, y: 8, thumb: null },
    { x: 80, y: 0, thumb: 'b' }
  ], CLUSTER_PX, 10);
  assert.equal(clusters.length, 2);
  const packed = clusters.find((c) => c.count === 2);
  assert.ok(packed);
  assert.equal(packed.thumb, 'a');
  const many = [];
  for (let i = 0; i < 80; i++) many.push({ x: i * 40, y: i * 10 });
  const capped = clusterIcons(many, CLUSTER_PX, MAX_DROP_ICONS);
  assert.equal(capped.length, MAX_DROP_ICONS);
  assert.ok(capped.some((c) => c.x === 0 && c.y === 0));
});

test('the text hash is stable and ignores nothing but the bytes', () => {
  assert.equal(hashText('[]'), hashText('[]'));
  assert.notEqual(hashText('[]'), hashText('[{}]'));
  assert.equal(typeof hashText('drops'), 'string');
});

test('the game drops the per-browser seen list and wires the new rules', () => {
  const drops = readFileSync(join(root, 'js/drops.js'), 'utf8');
  const map = readFileSync(join(root, 'js/nyc-map.js'), 'utf8');
  const main = readFileSync(join(root, 'js/main.js'), 'utf8');
  const tool = readFileSync(join(root, 'tools/add-drop.mjs'), 'utf8');
  const sw = readFileSync(join(root, 'tools/build-pages.mjs'), 'utf8');
  assert.equal(/localStorage\.(get|set)Item\(\s*['"]slop-drops-seen['"]/.test(drops), false);
  assert.equal(drops.includes('SEEN_KEY'), false);
  assert.match(drops, /placeProtected\(/);
  assert.match(drops, /mode = 'blink'/);
  assert.match(drops, /DELIVER_CAP/);
  assert.match(drops, /CARD_CAP/);
  assert.match(drops, /PANEL_FIRST/);
  assert.match(drops, /PANEL_PAGE/);
  assert.match(drops, /notModified/);
  assert.match(drops, /If-None-Match|etag: remoteEtag/);
  assert.match(map, /clusterIcons\(/);
  assert.match(main, /if \(!LITE\) renderer\.lighting = new ClusteredLighting/);
  assert.match(tool, /nearestFree\(/);
  assert.match(sw, /paint1/);
});

test('add-drop keeps a new landing off an existing drop', async () => {
  const place = loadModule(readFileSync(join(root, 'js/drop-place.js'), 'utf8'), {
    imports: { './drop-rng.js': loadModule(readFileSync(join(root, 'js/drop-rng.js'), 'utf8')) }
  });
  const { buildDrop } = await import('../tools/add-drop.mjs');
  const local = JSON.parse(readFileSync(join(root, 'data/drops.json'), 'utf8'));
  const sourceId = 'alpha-source';
  const spot = place.landingFor(sourceId);
  const { drop, errors } = buildDrop({
    author: 'azaticus',
    sourceId,
    request: 'a cat',
    name: 'cat',
    height: 1,
    spec: local[0].spec
  }, [{ id: 'drop-old', sourceId: 'old', x: spot.x, z: spot.z }]);
  assert.equal(errors.length, 0, errors.join('; '));
  assert.ok(Math.hypot(drop.x - spot.x, drop.z - spot.z) >= PROTECT_RADIUS - 0.02);
});
