// Rebuild data/drops.json with the four demo objects. Not part of the runtime.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendDrop } from './add-drop.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
writeFileSync(join(root, 'data', 'drops.json'), '[]\n');

const K = [15, 15, 15];
const rect = (x0, y0, x1, y1, color) => ({ type: 'rect', x0, y0, x1, y1, color });
const poly = (points, color) => ({ type: 'polygon', points, color });
const ell = (cx, cy, rx, ry, color) => ({ type: 'ellipse', cx, cy, rx, ry, color });

const piano = {
  author: 'azaticus',
  sourceId: 'demo-piano',
  request: 'a grand piano',
  name: 'grand piano',
  created: '2026-11-01T12:00:00.000Z',
  spec: {
    width: 1.6,
    height: 1.45,
    shapes: [
      rect(0.1, 0.95, 0.2, 1.4, [30, 30, 30]),
      rect(1.35, 0.95, 1.45, 1.4, [30, 30, 30]),
      poly([[0, 0.45], [1.2, 0.05], [1.55, 0.45], [1.55, 0.95], [0, 0.95]], [25, 25, 25]),
      rect(0.08, 0.6, 1.0, 0.78, [250, 250, 245]),
      ...Array.from({ length: 6 }, (_, i) => rect(0.15 + i * 0.15, 0.6, 0.22 + i * 0.15, 0.7, K))
    ]
  }
};

const snowman = {
  author: 'user_snow',
  sourceId: 'demo-snowman',
  request: 'a 4 meter snowman',
  name: 'snowman',
  height: 4,
  created: '2026-11-01T12:05:00.000Z',
  spec: {
    width: 2.7,
    height: 4.2,
    shapes: [
      ell(1.3, 3.0, 1.2, 1.15, [255, 255, 255]),
      ell(1.3, 1.7, 0.85, 0.8, [255, 255, 255]),
      ell(1.3, 0.85, 0.55, 0.52, [255, 255, 255]),
      rect(0.8, 0.28, 1.8, 0.38, K),
      rect(1.0, 0, 1.6, 0.32, K),
      rect(1.0, 0.22, 1.6, 0.3, [230, 20, 20]),
      ell(1.12, 0.75, 0.07, 0.07, K),
      ell(1.48, 0.75, 0.07, 0.07, K),
      poly([[1.3, 0.9], [1.95, 0.98], [1.3, 1.05]], [255, 120, 0]),
      ell(1.3, 1.5, 0.09, 0.09, K),
      ell(1.3, 1.8, 0.09, 0.09, K),
      ell(1.3, 2.1, 0.09, 0.09, K),
      poly([[0.55, 1.6], [-0.1, 1.0], [0, 0.95], [0.6, 1.5]], [110, 60, 20]),
      poly([[2.05, 1.6], [2.7, 1.0], [2.6, 0.95], [2.0, 1.5]], [110, 60, 20])
    ]
  }
};

const G = [70, 140, 40];
const D = [40, 80, 25];
const tank = {
  author: 'tank_enjoyer',
  sourceId: 'demo-tank',
  request: 'a tank',
  name: 'tank',
  created: '2026-11-01T12:10:00.000Z',
  spec: {
    width: 7.7,
    height: 2.6,
    shapes: [
      poly([[0, 1.7], [0.4, 1.5], [6.6, 1.5], [7, 1.7], [6.6, 2.5], [0.4, 2.5]], D),
      ...Array.from({ length: 7 }, (_, i) => ell(0.75 + i * 0.92, 2.0, 0.38, 0.38, [90, 90, 90])),
      poly([[0.3, 1.5], [0.9, 0.95], [6.2, 0.95], [6.8, 1.5]], G),
      poly([[2.0, 1.0], [2.3, 0.3], [4.3, 0.3], [4.6, 1.0]], G),
      rect(4.4, 0.5, 7.6, 0.7, G),
      ell(3.2, 0.65, 0.25, 0.15, [255, 30, 30])
    ]
  }
};

const B = [60, 170, 140];
const P = [170, 170, 160];
const horse = {
  author: 'horsefan',
  sourceId: 'demo-horse',
  request: 'a horse statue with a rider on a pedestal',
  name: 'horse statue',
  height: 4.6,
  created: '2026-11-01T12:15:00.000Z',
  spec: {
    width: 3.0,
    height: 4.6,
    shapes: [
      rect(0, 3.0, 2.9, 4.5, P),
      rect(0.9, 3.5, 2.0, 3.9, [230, 190, 40]),
      poly([[0.6, 2.2], [0.65, 2.95], [0.8, 2.95], [0.85, 2.2]], B),
      poly([[1.0, 2.2], [1.05, 2.95], [1.2, 2.95], [1.25, 2.2]], B),
      poly([[1.9, 2.1], [1.95, 2.95], [2.1, 2.95], [2.15, 2.1]], B),
      ell(1.4, 1.85, 0.95, 0.42, B),
      poly([[2.0, 1.8], [2.6, 1.2], [2.75, 1.35], [2.2, 2.0]], B),
      poly([[1.9, 1.65], [2.1, 0.55], [2.5, 0.65], [2.35, 1.8]], B),
      poly([[2.05, 0.6], [2.85, 0.85], [2.8, 1.05], [2.3, 1.0]], B),
      poly([[0.5, 1.75], [0.05, 2.5], [0.25, 2.5], [0.6, 1.95]], B),
      poly([[1.15, 1.5], [1.35, 0.65], [1.6, 0.65], [1.6, 1.5]], [220, 40, 40]),
      ell(1.47, 0.5, 0.17, 0.17, [250, 200, 160])
    ]
  }
};

for (const payload of [piano, snowman, tank, horse]) {
  const drop = appendDrop(payload);
  console.log(drop.id, drop.height, drop.x, drop.z, drop.surface);
}
