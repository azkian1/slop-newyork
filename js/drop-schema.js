// Shared checks for data/drops.json and for tools/add-drop.mjs.
// A writer can append a record directly if it passes validateDrop.

import { MAX_DROP_HEIGHT } from './drop-size.js';

export const MAX_SHAPES = 80;
export const MAX_POINTS = 48;
export const MAX_TEXT = 160;
export const MAX_NAME = 48;
export const MAX_HANDLE = 32;
const COORD_LIMIT = 400;

export function xProfileUrl(author) {
  const handle = String(author || '').trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return null;
  return `https://x.com/${encodeURIComponent(handle)}`;
}

export function sanitizeText(value, max) {
  return String(value || '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function colorOk(color) {
  return Array.isArray(color) && color.length === 3 && color.every((c) => Number.isFinite(c) && c >= 0 && c <= 255);
}

function pointOk(p) {
  return Array.isArray(p) && p.length === 2 && p.every((n) => Number.isFinite(n) && Math.abs(n) <= COORD_LIMIT);
}

function shapeOk(shape, errors, index) {
  if (!shape || typeof shape !== 'object') {
    errors.push(`shape ${index} is missing`);
    return;
  }
  if (!colorOk(shape.color)) errors.push(`shape ${index} needs an rgb color`);
  if (shape.type === 'polygon' || shape.type === 'line') {
    if (!Array.isArray(shape.points) || shape.points.length < 2 || shape.points.length > MAX_POINTS) {
      errors.push(`shape ${index} points must be 2..${MAX_POINTS}`);
    } else if (shape.points.some((p) => !pointOk(p))) errors.push(`shape ${index} has a point out of range`);
  } else if (shape.type === 'rect') {
    for (const key of ['x0', 'y0', 'x1', 'y1']) {
      if (!Number.isFinite(shape[key]) || Math.abs(shape[key]) > COORD_LIMIT) errors.push(`shape ${index} ${key} out of range`);
    }
  } else if (shape.type === 'ellipse') {
    for (const key of ['cx', 'cy', 'rx', 'ry']) {
      if (!Number.isFinite(shape[key]) || Math.abs(shape[key]) > COORD_LIMIT) errors.push(`shape ${index} ${key} out of range`);
    }
  } else errors.push(`shape ${index} type must be polygon, ellipse, rect, or line`);
}

export function validateSpec(spec, errors) {
  if (!spec || !Array.isArray(spec.shapes)) {
    errors.push('spec.shapes must be a list');
    return;
  }
  if (spec.shapes.length < 1 || spec.shapes.length > MAX_SHAPES) errors.push(`spec needs 1..${MAX_SHAPES} shapes`);
  if (!Number.isFinite(spec.width) || spec.width <= 0 || spec.width > COORD_LIMIT) errors.push('spec.width out of range');
  if (!Number.isFinite(spec.height) || spec.height <= 0 || spec.height > COORD_LIMIT) errors.push('spec.height out of range');
  spec.shapes.forEach((shape, i) => shapeOk(shape, errors, i));
}

export function validateDrop(drop) {
  const errors = [];
  if (!drop || typeof drop !== 'object') return ['drop must be an object'];
  if (!sanitizeText(drop.id, 80)) errors.push('id is required');
  if (!sanitizeText(drop.author, MAX_HANDLE)) errors.push('author handle is required');
  if (!sanitizeText(drop.sourceId, 80)) errors.push('sourceId is required');
  if (!sanitizeText(drop.name, MAX_NAME)) errors.push('name is required');
  if (!sanitizeText(drop.request, MAX_TEXT)) errors.push('request text is required');
  if (!Number.isFinite(Date.parse(drop.created))) errors.push('created must be an ISO timestamp');
  if (!Number.isFinite(drop.height) || drop.height <= 0 || drop.height > MAX_DROP_HEIGHT) errors.push(`height must be 0..${MAX_DROP_HEIGHT} m`);
  if (!Number.isFinite(drop.x) || !Number.isFinite(drop.z)) errors.push('x and z are required');
  if (!Number.isFinite(drop.yaw)) errors.push('yaw is required');
  if (!['street', 'sidewalk', 'roof'].includes(drop.surface)) errors.push('surface must be street, sidewalk, or roof');
  validateSpec(drop.spec, errors);
  return errors;
}
