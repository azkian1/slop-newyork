// Shared checks for data/drops.json and for tools/add-drop.mjs.
// The game gate is js/drop-validate.js. This module keeps the tool's text trimmer
// and re-exports that gate so a hand-written record cannot skip it.

import { validateDropRecord, xProfileUrl as profileUrl } from './drop-validate.js';

export const MAX_SHAPES = 80;
export const MAX_POINTS = 64;
export const MAX_TEXT = 200;
export const MAX_NAME = 40;
export const MAX_HANDLE = 15;

export function xProfileUrl(author) {
  return profileUrl(author);
}

export function validateDrop(drop) {
  return validateDropRecord(drop);
}

export function sanitizeText(value, max) {
  return String(value || '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

