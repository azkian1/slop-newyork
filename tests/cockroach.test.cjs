const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { loadModule } = require('./helpers/module.cjs');

const root = join(__dirname, '..');
const source = readFileSync(join(root, 'js/cockroach.js'), 'utf8');
const {
  stepGiant, giantFootprint, roachVulnerable, resolveCurb, supportHeight, climbStep, FOOT_REACH,
  GIANT_TIME, GIANT_SCALE, GIANT_HALF_W, GIANT_HALF_L
} = loadModule(source, {
  imports: {
    'three/webgpu': {},
    './cars.js': { BODY_SPECS: { sedan: { cabin: { roofY: [[0, 1.445]] } } } },
    './bus.js': { BUS_SPEC: { edge: [[0, 2.94]], crown: [[0, 0.04]] } },
    './controllers.js': {
      buildingContact() { return false; },
      collisionBody() { return {}; }
    },
    './city-grid.js': { deckHeightAt() { return 0; } },
    './cameras.js': { ORBIT_PITCH_MIN: -85 * Math.PI / 180, ORBIT_PITCH_MAX: 85 * Math.PI / 180 }
  }
});

test('red crumb timer grows to car size in half a second and shrinks after 30 s', () => {
  const state = { giant: GIANT_TIME, scale: 1 };
  stepGiant(state, 0.5);
  assert.equal(state.scale, GIANT_SCALE);
  assert.equal(state.giant, GIANT_TIME - 0.5);
  while (state.giant > 0) stepGiant(state, 0.05);
  assert.equal(state.giant, 0);
  assert.ok(state.scale > 50, 'still enlarged at the moment the timer ends');
  stepGiant(state, 0.5);
  assert.equal(state.scale, 1);
  assert.equal(roachVulnerable(1, 0), true);
  assert.equal(roachVulnerable(GIANT_SCALE, 10), false);
  assert.equal(roachVulnerable(40, 0), false);
});

test('giant footprint matches a person at rest and is a bit bigger than a sedan when grown', () => {
  const small = giantFootprint(1);
  assert.equal(small.active, false);
  assert.equal(small.halfW, 0.32);
  assert.equal(small.halfL, 0.32);
  const grown = giantFootprint(GIANT_SCALE);
  assert.equal(grown.active, true);
  assert.equal(grown.halfW, GIANT_HALF_W);
  assert.equal(grown.halfL, GIANT_HALF_L);
  assert.ok(grown.halfW > 0.86 && grown.halfL > 2.18);
  const mid = giantFootprint(1 + (GIANT_SCALE - 1) * 0.5);
  assert.ok(Math.abs(mid.halfW - (0.32 + GIANT_HALF_W) / 2) < 1e-9);
  assert.ok(Math.abs(mid.halfL - (0.32 + GIANT_HALF_L) / 2) < 1e-9);
});

test('traffic and pedestrians reuse the player vehicle for a giant roach', () => {
  const traffic = readFileSync(join(root, 'js/traffic.js'), 'utf8');
  const peds = readFileSync(join(root, 'js/pedestrian-system.js'), 'utf8');
  const audio = readFileSync(join(root, 'js/audio-events.js'), 'utf8');
  assert.match(traffic, /playerEntity\.roachScale > 1/);
  assert.match(traffic, /giantHalfW/);
  assert.match(traffic, /isGiantRoach \|\| pe\.type === 'car'/);
  assert.match(peds, /function frightenGiant/);
  assert.match(peds, /ent\.roachScale > 1/);
  assert.match(audio, /kind === 'scream'/);
});

test('a curb step lifts the roach onto the sidewalk and a wall does not', () => {
  assert.equal(resolveCurb(0, 0), 0);
  assert.equal(resolveCurb(0, 0.22), 0.22);
  assert.equal(resolveCurb(0.05, 0.22), 0.22);
  assert.equal(resolveCurb(0, 3), 0);
  let y = 0;
  for (const floor of [0, 0, 0.22, 0.22, 0.22]) y = resolveCurb(y, floor);
  assert.equal(y, 0.22);
  y = resolveCurb(0.22, 0);
  assert.equal(y, 0.22);
  for (let i = 0; i < 6; i++) y = resolveCurb(y, i % 2 ? 0.22 : 0);
  assert.ok(y >= 0);
  assert.ok(y <= 0.22);
});

// Same substep the roach uses: move, then stand on the highest column the body overlaps.
function drive(speed, sidewalkAt, passes) {
  const dt = 1 / 60;
  const pos = { x: sidewalkAt - 1.2, z: 0, y: 0, heading: Math.PI / 2 };
  const heightAt = (x) => (x >= sidewalkAt ? 0.22 : 0);
  let lowestOnSlab = Infinity;
  for (let pass = 0; pass < passes; pass++) {
    const dir = pass % 2 === 0 ? 1 : -1;
    pos.heading = Math.PI / 2;
    for (let frame = 0; frame < 180; frame++) {
      const distance = dir * speed * dt;
      const n = Math.max(1, Math.ceil(Math.abs(distance) / 0.06));
      const step = distance / n;
      const hx = Math.sin(pos.heading);
      const hz = Math.cos(pos.heading);
      for (let i = 0; i < n; i++) {
        pos.x += hx * step;
        pos.z += hz * step;
        const offs = [[0, 0], [hx, hz], [-hx, -hz], [-hz, hx], [hz, -hx]];
        const heights = offs.map(([ox, oz], k) => {
          const reach = k === 0 ? 0 : FOOT_REACH;
          return heightAt(pos.x + ox * reach, pos.z + oz * reach);
        });
        pos.y = climbStep(pos.y, heights);
        const overlaps = pos.x + FOOT_REACH >= sidewalkAt && pos.x - FOOT_REACH <= sidewalkAt + 8;
        if (overlaps && pos.x >= sidewalkAt - FOOT_REACH) lowestOnSlab = Math.min(lowestOnSlab, pos.y);
      }
    }
  }
  return { pos, lowestOnSlab };
}

test('driving onto a sidewalk climbs the curb and never stays inside the slab', () => {
  assert.equal(supportHeight(0, [0, 0.22, 0, 0]), 0.22);
  assert.equal(supportHeight(0, [0, 3]), 0);
  assert.equal(supportHeight(0, [0.22, 0]), 0.22);
  assert.equal(climbStep(0, [0.22]), 0.22);
  assert.equal(climbStep(0.22, [0]), 0.22);
  for (const speed of [1.5, 14]) {
    const crossed = drive(speed, 0, 6);
    assert.ok(crossed.pos.x < -0.2, 'ends back on the road after an even number of passes');
    assert.equal(crossed.lowestOnSlab, 0.22);
  }
  const inside = { y: climbStep(0, [0.22, 0.22, 0.22, 0.22]) };
  assert.equal(inside.y, 0.22);
  const deck = climbStep(0, [0.22]);
  assert.equal(deck, 0.22);
});
