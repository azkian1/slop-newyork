// Crude MS Paint billboard. Port of the Python `paint` / `jitter` look:
// subdivided wobbly outlines, fill nudged off the outline, slightly hot colors, hard edges.

import { rngFor } from './drop-rng.js';
import { CARD_MAX_EDGE, cardPixels } from './drop-size.js';

const INK = 'rgb(15,15,15)';

function ellipsePoints(cx, cy, rx, ry, n = 28) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return pts;
}

function shapePoints(shape) {
  if (shape.type === 'rect') {
    return [[shape.x0, shape.y0], [shape.x1, shape.y0], [shape.x1, shape.y1], [shape.x0, shape.y1]];
  }
  if (shape.type === 'ellipse') return ellipsePoints(shape.cx, shape.cy, shape.rx, shape.ry);
  return shape.points.map((p) => [p[0], p[1]]);
}

function jitter(pts, amount, rng) {
  const mid = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    const a = pts[(i + 1) % pts.length];
    mid.push([x, y]);
    for (let k = 1; k < 4; k++) {
      const t = k / 4;
      mid.push([
        x + (a[0] - x) * t + (rng() * 2 - 1) * amount,
        y + (a[1] - y) * t + (rng() * 2 - 1) * amount
      ]);
    }
  }
  return mid.map(([x, y]) => [x + (rng() * 2 - 1) * amount, y + (rng() * 2 - 1) * amount]);
}

function css([r, g, b]) {
  return `rgb(${r},${g},${b})`;
}

function hot(color) {
  return color.map((c) => Math.min(255, Math.round(c * 1.15)));
}

export function paintDrop(spec, author, seedKey, maxEdge = CARD_MAX_EDGE) {
  const rng = rngFor(seedKey);
  const handle = author.startsWith('@') ? author : `@${author}`;
  const { px, pad, width, objectHeight, labelBand } = cardPixels(spec, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = objectHeight + labelBand;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const toPx = (pts) => pts.map(([x, y]) => [pad + x * px, pad + y * px]);

  for (const shape of spec.shapes) {
    const pts = shapePoints(shape);
    const closed = shape.type !== 'line';
    const fillPts = jitter(pts, 0.04, rng);
    const linePts = jitter(pts, 0.05, rng);
    const color = hot(shape.color);
    if (closed) {
      const offX = (rng() * 2 - 1) * 6 * (px / 100);
      const offY = (rng() * 2 - 1) * 6 * (px / 100);
      const fill = toPx(fillPts);
      ctx.beginPath();
      fill.forEach(([x, y], i) => (i ? ctx.lineTo(x + offX, y + offY) : ctx.moveTo(x + offX, y + offY)));
      ctx.closePath();
      ctx.fillStyle = css(color);
      ctx.fill();
    }
    const line = toPx(linePts);
    ctx.beginPath();
    line.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (closed) ctx.closePath();
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, 4 * (px / 100));
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  const fontPx = Math.max(16, Math.round(30 * (px / 100)));
  const phases = [...handle].map(() => rng() * Math.PI * 2);
  ctx.font = `700 ${fontPx}px "DejaVu Sans", Arial, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';

  function redrawLabel(time) {
    ctx.clearRect(0, objectHeight, canvas.width, labelBand);
    let measured = 0;
    for (const ch of handle) measured += ctx.measureText(ch).width;
    let x = Math.max(8, (canvas.width - measured) / 2);
    const baseY = objectHeight + 8;
    for (let i = 0; i < handle.length; i++) {
      const ch = handle[i];
      const y = baseY + Math.sin(time * 5 + phases[i]) * (fontPx * 0.18);
      ctx.lineWidth = Math.max(2, fontPx * 0.14);
      ctx.strokeStyle = '#000000';
      ctx.strokeText(ch, x, y);
      ctx.fillStyle = '#ff00c8';
      ctx.fillText(ch, x, y);
      x += ctx.measureText(ch).width;
    }
  }
  redrawLabel(0);

  const thumb = document.createElement('canvas');
  thumb.width = 64;
  thumb.height = 48;
  const tctx = thumb.getContext('2d');
  tctx.imageSmoothingEnabled = false;
  const scale = Math.min(64 / canvas.width, 40 / objectHeight);
  const dw = canvas.width * scale;
  const dh = objectHeight * scale;
  tctx.drawImage(canvas, 0, 0, canvas.width, objectHeight, (64 - dw) / 2, (48 - dh) / 2, dw, dh);

  return { canvas, thumb, redrawLabel, objectPx: objectHeight, px };
}
