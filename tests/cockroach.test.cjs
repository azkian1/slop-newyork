const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { loadModule } = require('./helpers/module.cjs');

const root = join(__dirname, '..');
const source = readFileSync(join(root, 'js/cockroach.js'), 'utf8');
const {
  stepGiant, giantFootprint, roachVulnerable, GIANT_TIME, GIANT_SCALE, GIANT_HALF_W, GIANT_HALF_L
} = loadModule(source, {
  imports: {
    'three/webgpu': {},
    './cars.js': { BODY_SPECS: { sedan: { cabin: { roofY: [[0, 1.445]] } } } },
    './bus.js': { BUS_SPEC: { edge: [[0, 2.94]], crown: [[0, 0.04]] } },
    './controllers.js': {
      buildingContact() { return false; },
      collisionBody() { return {}; }
    }
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
