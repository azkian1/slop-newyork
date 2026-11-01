import * as THREE from 'three/webgpu';
import {
  Fn,
  uniform,
  float,
  vec2,
  vec3,
  vec4,
  floor,
  fract,
  sin,
  abs,
  max,
  min,
  pow,
  step,
  smoothstep,
  mix,
  mod,
  clamp,
  length,
  normalize,
  fwidth,
  texture,
  time,
  screenUV,
  screenSize,
  cameraNear,
  cameraFar,
  cameraViewMatrix,
  cameraWorldMatrix,
  cameraProjectionMatrixInverse,
  getViewPosition,
  projectionDepth,
  isBackgroundDepth,
  transformNormalByInverseViewMatrix
} from 'three/tsl';

// World-space Matrix rain. One fullscreen pass samples the scene depth and normals,
// so every surface (buildings, streets, cars, batched pedestrians, the roach) is covered.
// Turning the uniform off selects the original grade, which is left unchanged.

const ATLAS_COLS = 10;
const ATLAS_ROWS = 10;
const GLYPH_COUNT = 92;
const CELL = 48;

// Digits, latin capitals, and halfwidth katakana (U+FF66..U+FF9D). Mirrored when drawn.
export function matrixGlyphChars() {
  let text = '';
  for (let code = 0x30; code <= 0x39; code++) text += String.fromCharCode(code);
  for (let code = 0x41; code <= 0x5a; code++) text += String.fromCharCode(code);
  for (let code = 0xff66; code <= 0xff9d; code++) text += String.fromCharCode(code);
  return text;
}

export function matrixFromSearch(search) {
  const query = String(search || '').replace(/^\?/, '');
  return new URLSearchParams(query).get('matrix') === '1';
}

function paintGlyphAtlas(canvas, font) {
  const chars = matrixGlyphChars();
  canvas.width = ATLAS_COLS * CELL;
  canvas.height = ATLAS_ROWS * CELL;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < chars.length && i < ATLAS_COLS * ATLAS_ROWS; i++) {
    const col = i % ATLAS_COLS;
    const row = Math.floor(i / ATLAS_COLS);
    // Row 0 sits on the bottom of the canvas so texture v = 0 matches it (flipY).
    const x = col * CELL;
    const y = (ATLAS_ROWS - 1 - row) * CELL;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, CELL, CELL);
    ctx.clip();
    // Mirror horizontally, the way the film's glyphs are flipped.
    ctx.translate(x + CELL, y + CELL * 0.55);
    ctx.scale(-1, 1);
    ctx.fillText(chars[i], CELL * 0.5, 0);
    ctx.restore();
  }
  return canvas;
}

function createGlyphAtlas() {
  const canvas = document.createElement('canvas');
  const font = '500 30px "Noto Sans JP", "Hiragino Sans", "MS Gothic", sans-serif';
  paintGlyphAtlas(canvas, font);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.flipY = true;
  const chars = matrixGlyphChars();
  if (document.fonts && !document.getElementById('matrix-glyph-font')) {
    const link = document.createElement('link');
    link.id = 'matrix-glyph-font';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@500&text=' + encodeURIComponent(chars);
    document.head.appendChild(link);
    document.fonts.load('500 30px "Noto Sans JP"', chars).then(() => {
      paintGlyphAtlas(canvas, font);
      tex.needsUpdate = true;
    }).catch(() => {});
  }
  return tex;
}

// Triplanar columns. Walls fall along world Y. Floors fall along world Z so the
// street keeps a stable stream instead of swimming with the camera.
function matrixRainColor(depthNode, normalNode, atlas) {
  const cols = float(ATLAS_COLS);
  const rows = float(ATLAS_ROWS);
  const count = float(GLYPH_COUNT);
  const colW = float(0.42);
  const glyphH = float(0.58);
  const trailN = float(18);
  const speed = float(7.5);

  const column = Fn(([u, v]) => {
    const col = floor(u.div(colW));
    const jitter = float(0.55).add(fract(sin(col.mul(12.9898)).mul(43758.5453)).mul(0.9));
    const fall = v.div(glyphH).add(time.mul(speed).mul(jitter));
    const row = floor(fall);
    const cellU = fract(u.div(colW));
    const cellV = fract(fall);
    const seed = fract(sin(col.mul(127.1).add(row.mul(311.7))).mul(43758.5453));
    const id = min(floor(seed.mul(count)), count.sub(1));
    const gx = mod(id, cols);
    const gy = floor(id.div(cols));
    const tuv = vec2(gx.add(cellU).div(cols), gy.add(cellV).div(rows));
    const mask = texture(atlas, tuv).r;
    const dist = fract(fall.div(trailN));
    const trail = pow(max(float(1).sub(dist), float(0.0001)), float(1.7));
    const lead = smoothstep(float(1).div(trailN), float(0), dist);
    const alive = step(float(0.12), fract(sin(col.mul(78.233)).mul(12345.678)));
    const body = vec3(0.0, 0.62, 0.16).mul(trail);
    const head = vec3(0.82, 1.0, 0.88).mul(lead);
    const glyph = body.add(head).mul(mask).mul(alive);
    const streak = vec3(0.0, 0.28, 0.07).mul(trail).mul(alive).mul(0.4);
    return glyph.add(streak);
  });

  return Fn(() => {
    const raw = depthNode.sample(screenUV).r;
    const depth = projectionDepth(raw, cameraNear, cameraFar);
    const background = isBackgroundDepth(depth);
    const viewPosition = getViewPosition(screenUV, depth, cameraProjectionMatrixInverse);
    const world = cameraWorldMatrix.mul(vec4(viewPosition, 1.0)).xyz;
    const nSample = normalNode.sample(screenUV).xyz;
    const nLen = length(nSample);
    const nView = normalize(nLen.greaterThan(0.05).select(nSample, vec3(0, 0, 1)));
    const nWorld = normalize(transformNormalByInverseViewMatrix(nView, cameraViewMatrix));
    const weight = nWorld.abs();
    const weightSum = max(weight.x.add(weight.y).add(weight.z), float(0.0001));
    // X walls use Z/Y, Z walls use X/Y, floors use X/Z.
    const rain = column(world.z, world.y).mul(weight.x)
      .add(column(world.x, world.z).mul(weight.y))
      .add(column(world.x, world.y).mul(weight.z))
      .div(weightSum);
    const edge = smoothstep(float(0.0), float(0.02), fwidth(depth));
    const fres = pow(clamp(float(1).sub(abs(nView.z)), float(0), float(1)), float(1.6));
    const rim = vec3(0.25, 1.0, 0.55).mul(max(edge, fres.mul(0.5)).mul(0.6));
    const glow = fwidth(rain).mul(0.7);
    const lit = rain.add(glow).add(rim);
    const dist = length(viewPosition);
    const fog = smoothstep(float(36), float(240), dist);
    const fogged = mix(lit, vec3(0), fog);
    const aspect = screenSize.x.div(screenSize.y);
    const radius = length(screenUV.sub(0.5).mul(vec2(aspect, 1))).div(length(vec2(aspect, 1).mul(0.5)));
    const vig = float(1).sub(smoothstep(float(0.4), float(1.2), radius).mul(0.5));
    return background.select(vec3(0), fogged.mul(vig));
  })();
}

export function createMatrixMode(depthNode, normalNode) {
  const atlas = createGlyphAtlas();
  const color = matrixRainColor(depthNode, normalNode, atlas);
  const enabled = uniform(0);
  return { color, enabled, atlas };
}
