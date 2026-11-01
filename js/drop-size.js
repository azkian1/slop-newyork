// World height of a dropped object, in meters. The drawing spec is scaled to this height.
// Explicit numbers in the request win, then size words, then the dictionary, then a size class.
// The placed card may not exceed MAX_WORLD_HEIGHT by MAX_WORLD_WIDTH. The validator rejects
// anything larger. This resolver reports the asked size and does not shrink it.

export const MAX_WORLD_HEIGHT = 10;
export const MAX_WORLD_WIDTH = 8;
export const MAX_DROP_HEIGHT = MAX_WORLD_HEIGHT;
// Paint resolution shared by the renderer and the size check. Far below the old 640 px edge.
export const CARD_MAX_EDGE = 192;

export const OBJECT_HEIGHTS = {
  cat: 0.4,
  dog: 0.6,
  person: 1.75,
  human: 1.75,
  piano: 1.5,
  'grand piano': 1.5,
  car: 4.5,
  taxi: 1.8,
  bus: 3.2,
  truck: 4,
  tank: 7,
  whale: 25,
  snowman: 2,
  horse: 2.2,
  statue: 3,
  bicycle: 1.1,
  bike: 1.1,
  chair: 0.9,
  table: 0.75,
  couch: 0.9,
  sofa: 0.9,
  fridge: 1.8,
  elephant: 3.2,
  giraffe: 5,
  boat: 8,
  ship: 40,
  plane: 12,
  helicopter: 4,
  house: 10,
  tree: 8,
  ball: 0.22
};

export const SIZE_CLASSES = {
  tiny: 0.3,
  human: 1.8,
  car: 4.5,
  house: 12,
  building: 50
};

function clampHeight(value) {
  if (!Number.isFinite(value) || value <= 0) return SIZE_CLASSES.human;
  return value;
}

// Pixel layout of a card. Kept in lockstep with paintDrop so the validator
// measures the same billboard the city will stand up.
export function cardPixels(spec, maxEdge = CARD_MAX_EDGE) {
  const pad = 30;
  const natural = Math.max(spec.width, spec.height) * 100 + pad * 2;
  const px = 100 * Math.min(1, maxEdge / natural);
  const width = Math.max(8, Math.ceil(spec.width * px) + pad * 2);
  const objectHeight = Math.max(8, Math.ceil(spec.height * px) + pad * 2);
  const labelBand = Math.max(36, Math.round(52 * (px / 100)));
  return { px, pad, width, objectHeight, labelBand };
}

export function worldCardSize(height, spec, maxEdge = CARD_MAX_EDGE) {
  const card = cardPixels(spec, maxEdge);
  const canvasH = card.objectHeight + card.labelBand;
  const worldH = height * (canvasH / card.objectHeight);
  const worldW = worldH * (card.width / canvasH);
  return { worldW, worldH, objectPx: card.objectHeight };
}

function lookupHeight(name) {
  const key = String(name || '').trim().toLowerCase();
  if (OBJECT_HEIGHTS[key] != null) return OBJECT_HEIGHTS[key];
  const parts = key.split(/\s+/);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (OBJECT_HEIGHTS[parts[i]] != null) return OBJECT_HEIGHTS[parts[i]];
  }
  return null;
}

export function resolveDropHeight({ name = '', request = '', height } = {}) {
  if (Number.isFinite(height) && height > 0) return clampHeight(height);
  const text = `${name} ${request}`.toLowerCase();
  const explicit = text.match(/(\d+(?:\.\d+)?)\s*(?:m\b|meter|metre)/);
  if (explicit) return clampHeight(parseFloat(explicit[1]));
  let base = lookupHeight(name);
  const known = base != null;
  if (!known) {
    if (/\bbuilding\b|\bskyscraper\b/.test(text)) base = SIZE_CLASSES.building;
    else if (/\bhouse\b/.test(text)) base = SIZE_CLASSES.house;
    else if (/\bcar\b|\bvehicle\b/.test(text)) base = SIZE_CLASSES.car;
    else if (/\btiny\b/.test(text)) base = SIZE_CLASSES.tiny;
    else base = SIZE_CLASSES.human;
  }
  if (/\bskyscraper[- ]sized\b/.test(text)) base = Math.max(base, 200);
  else if (/\bgiant\b/.test(text)) base *= 8;
  else if (/\bhuge\b/.test(text)) base *= 4;
  else if (/\btiny\b/.test(text)) base *= 0.25;
  else if (/\bmini\b/.test(text)) base *= 0.45;
  return clampHeight(base);
}
