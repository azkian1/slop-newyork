const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { loadModule } = require('./helpers/module.cjs');

const root = join(__dirname, '..');
const size = loadModule(readFileSync(join(root, 'js/drop-size.js'), 'utf8'));
const paint = loadModule(readFileSync(join(root, 'js/drop-paint.js'), 'utf8'), {
  imports: {
    './drop-rng.js': loadModule(readFileSync(join(root, 'js/drop-rng.js'), 'utf8')),
    './drop-size.js': size
  }
});
const { shapeSpan, outlineWidth, outlineJitter } = paint;
const { cardPixels, CARD_MAX_EDGE } = size;

test('a small feature strokes thinner than a large body, which keeps the old width', () => {
  const body = { type: 'ellipse', cx: 1.3, cy: 3, rx: 1.2, ry: 1.15 };
  const eye = { type: 'ellipse', cx: 1.1, cy: 3.2, rx: 0.07, ry: 0.08 };
  const px = 40;
  const bold = Math.max(2, 4 * (px / 100));
  assert.equal(outlineWidth(shapeSpan(body), px), bold);
  const thin = outlineWidth(shapeSpan(eye), px);
  assert.ok(thin < bold);
  assert.ok(thin >= 1 && thin <= 2);
  assert.equal(outlineJitter(shapeSpan(body)), 0.05);
  assert.ok(outlineJitter(shapeSpan(eye)) < 0.05);
});

test('card-resolution strokes stay thin on eyes and bold on the snowman body', () => {
  const local = JSON.parse(readFileSync(join(root, 'data/drops.json'), 'utf8'));
  const snowman = local.find((row) => row.id === 'drop-demo-snowman');
  const px = cardPixels(snowman.spec, CARD_MAX_EDGE).px;
  const bold = Math.max(2, 4 * (px / 100));
  const widths = snowman.spec.shapes.map((shape) => outlineWidth(shapeSpan(shape), px));
  const body = widths[0];
  const eye = outlineWidth(shapeSpan(snowman.spec.shapes.find((shape) => shape.rx === 0.07)), px);
  assert.equal(body, bold);
  assert.ok(eye < body);
  assert.ok(eye <= 1.5);
});

test('a flat detail uses its short side, and a wide rect stays bold', () => {
  const nose = {
    type: 'polygon',
    points: [[1.3, 0.9], [1.95, 0.98], [1.3, 1.05]]
  };
  const scarf = { type: 'rect', x0: 1, y0: 0.22, x1: 1.6, y1: 0.32 };
  const panel = { type: 'rect', x0: 0, y0: 0, x1: 2, y1: 1.4 };
  assert.ok(shapeSpan(nose) < 0.2);
  assert.ok(shapeSpan(scarf) < 0.2);
  assert.ok(outlineWidth(shapeSpan(panel), 100) > outlineWidth(shapeSpan(scarf), 100));
  assert.equal(outlineWidth(shapeSpan(panel), 100), Math.max(2, 4));
});
