// Deterministic landing spot inside the playable Manhattan grid (about 8th Ave to 1st Ave,
// 59th St to 14th St). Streets sit on the avenue/street lattice; sidewalks step off it;
// roofs step further into the block. The game resolves the vertical height at runtime.

import { rngFor } from './drop-rng.js';

const AVENUE0 = -860;
const STREET0 = -1370;
const AVENUE_STEP = 270;
const STREET_STEP = 80;

// Points around a drop where the roach can stand, nearest first, outside the drawing.
export function standOffsets(yaw, reach) {
  const out = [];
  for (let i = 0; i < 16; i++) {
    const angle = yaw + i * Math.PI / 8;
    out.push([Math.sin(angle) * reach, Math.cos(angle) * reach]);
  }
  return out;
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
