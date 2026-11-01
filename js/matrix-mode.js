import * as THREE from 'three/webgpu';
import {
  Fn,
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
  dot,
  and,
  texture,
  time,
  positionWorld,
  positionView,
  normalWorld,
  normalView,
  cameraPosition,
  modelRadius
} from 'three/tsl';

// Glyphs live on the surface. The grid is fixed in world space; only a wave of
// brightness travels down each column (the film's raindrop), so the letters stay
// glued to walls, cars and people as the camera moves.

const ATLAS_COLS = 10;
const ATLAS_ROWS = 10;
const GLYPH_COUNT = 92;
const CELL = 48;
// A storey is about 3.5 m. This cell puts many columns across a facade, and a
// raindrop takes several seconds to fall one storey.
const CELL_W = 0.48;
const CELL_H = 0.72;
const TRAIL = 14;

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

// Pixel letter used before the webfont arrives, and if it never does. Each code point
// picks a different set of bars so columns are not all the same mark.
function drawProceduralGlyph(ctx, code, x, y) {
  const cols = 4;
  const rows = 7;
  const padX = 10;
  const padY = 6;
  const cw = (CELL - padX * 2) / cols;
  const rh = (CELL - padY * 2) / rows;
  let bits = (code * 1315423911) >>> 0;
  ctx.fillStyle = '#fff';
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (bits & 1) {
        // Mirror in x so the mark matches the flipped film glyphs.
        const mx = cols - 1 - col;
        ctx.fillRect(x + padX + mx * cw, y + padY + row * rh, cw - 1.5, rh - 1.5);
      }
      bits = (bits >>> 1) | ((bits & 1) << 15);
    }
  }
}

function paintGlyphAtlas(canvas, font) {
  const chars = matrixGlyphChars();
  canvas.width = ATLAS_COLS * CELL;
  canvas.height = ATLAS_ROWS * CELL;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const useFont = !!font;
  if (useFont) {
    ctx.fillStyle = '#fff';
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
  }
  for (let i = 0; i < chars.length && i < ATLAS_COLS * ATLAS_ROWS; i++) {
    const col = i % ATLAS_COLS;
    const row = Math.floor(i / ATLAS_COLS);
    const x = col * CELL;
    const y = (ATLAS_ROWS - 1 - row) * CELL;
    if (!useFont) {
      drawProceduralGlyph(ctx, chars.charCodeAt(i), x, y);
      continue;
    }
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
  const font = '500 34px "Noto Sans JP", "Hiragino Sans", "MS Gothic", sans-serif';
  paintGlyphAtlas(canvas, null);
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
    document.fonts.load('500 34px "Noto Sans JP"', chars).then(() => {
      paintGlyphAtlas(canvas, font);
      tex.needsUpdate = true;
    }).catch(() => {});
  }
  return tex;
}

function matrixSurfaceColor(atlas) {
  const cols = float(ATLAS_COLS);
  const rows = float(ATLAS_ROWS);
  const count = float(GLYPH_COUNT);
  const trailN = float(TRAIL);

  return Fn(() => {
    // People and the roach are about a metre across or less. A facade cell would
    // leave a body in the gap between letters, so small meshes get a tighter grid.
    const radius = max(modelRadius, float(0.02));
    const cell = clamp(radius.mul(0.09), float(0.055), float(CELL_W));
    const cellH = cell.mul(1.5);
    const world = positionWorld;
    const n = normalize(normalWorld);
    const ax = abs(n);
    // Dominant axis: walls project onto a vertical plane (columns run on world up).
    // Floors and ceilings project onto the ground plane.
    const useY = and(ax.y.greaterThan(ax.x), ax.y.greaterThan(ax.z));
    const useX = ax.x.greaterThan(ax.z);
    const u = useY.select(world.x, useX.select(world.z, world.x));
    const v = useY.select(world.z, world.y);

    const col = floor(u.div(cell));
    const along = v.div(cellH);
    const row = floor(along);
    const cellU = fract(u.div(cell));
    const cellV = fract(along);
    const colSeed = fract(sin(col.mul(127.1)).mul(43758.5453));
    // A few columns change letters now and then. The rest stay put.
    const cycling = colSeed.greaterThan(0.84);
    const tick = floor(time.mul(0.22).add(colSeed.mul(5.0)));
    const cycle = cycling.select(tick, float(0));
    const seed = fract(sin(col.mul(19.13).add(row.mul(47.77)).add(cycle.mul(13.17))).mul(43758.5453));
    const id = min(floor(seed.mul(count)), count.sub(1));
    const gx = mod(id, cols);
    const gy = floor(id.div(cols));
    const tuv = vec2(gx.add(cellU).div(cols), gy.add(cellV).div(rows));
    // Figures (people, the roach) use thicker strokes so a body reads as letters, not a rim.
    const figureMask = smoothstep(float(3.0), float(0.55), radius);
    const mask = smoothstep(
      mix(float(0.4), float(0.16), figureMask),
      mix(float(0.72), float(0.42), figureMask),
      texture(atlas, tuv).r
    );

    // Illumination travels down the column. The glyph grid itself does not scroll.
    const speed = float(0.42).add(colSeed.mul(0.38));
    const head = time.mul(speed).add(colSeed.mul(trailN));
    const dist = fract(along.add(head).div(trailN));
    const trail = pow(max(float(1).sub(dist), float(0.0001)), float(2.2));
    const lead = smoothstep(float(1.15).div(trailN), float(0.0), dist);
    const alive = step(float(0.06), colSeed);
    const figure = figureMask;
    const body = vec3(0.0, mix(float(0.55), float(1.45), figure), mix(float(0.14), float(0.42), figure)).mul(mix(trail, max(trail, float(0.9)), figure));
    const tracer = vec3(1.7, 2.5, 1.85).mul(lead);
    const glyph = body.add(tracer).mul(mask).mul(alive);

    const facing = normalize(positionView).negate();
    const ndotv = clamp(dot(normalize(normalView), facing), float(0), float(1));
    const fres = pow(float(1).sub(ndotv), float(2.4));
    const edge = vec3(0.06, 0.85, 0.28).mul(fres).mul(mix(float(0.35), float(0.7), figure));
    // Green between the letters so a person is a figure, not an empty outline.
    const fill = vec3(0.0, 0.34, 0.09).mul(figure);
    const lit = glyph.add(edge).add(fill);
    const distCam = length(world.sub(cameraPosition));
    const fog = smoothstep(float(55), float(320), distCam);
    return mix(lit, vec3(0), fog);
  })();
}

export function createMatrixMode() {
  const atlas = createGlyphAtlas();
  const material = new THREE.MeshBasicNodeMaterial();
  material.name = 'MatrixRain';
  material.colorNode = matrixSurfaceColor(atlas);
  material.fog = false;
  material.toneMapped = false;
  material.side = THREE.DoubleSide;
  material.forceSinglePass = true;

  const saved = new Map();
  const patched = new Map();
  let active = false;
  let clearColor = null;
  let clearAlpha = 1;

  // Crowd people, trees and fire escapes place vertices in positionNode. Replacing
  // the material drops that and the figures vanish. Keep the vertex shader and
  // only retint the surface.
  function patchPlaced(mat) {
    if (!mat || patched.has(mat) || mat === material) return;
    patched.set(mat, {
      colorNode: mat.colorNode,
      emissiveNode: mat.emissiveNode,
      emissive: mat.emissive && mat.emissive.isColor ? mat.emissive.getHex() : null,
      emissiveIntensity: mat.emissiveIntensity,
      metalnessNode: mat.metalnessNode,
      roughnessNode: mat.roughnessNode,
      fog: mat.fog,
      toneMapped: mat.toneMapped
    });
    const glyphs = matrixSurfaceColor(atlas);
    // colorNode covers basic materials; emissiveNode keeps standard materials
    // (the pedestrian crowd) unlit-bright after the lighting multiply.
    // The emissive color itself defaults to black, which would zero the node.
    mat.colorNode = glyphs;
    mat.emissiveNode = glyphs;
    if (mat.emissive && mat.emissive.isColor) mat.emissive.setRGB(1, 1, 1);
    mat.emissiveIntensity = 1;
    if ('metalnessNode' in mat) mat.metalnessNode = float(0);
    if ('roughnessNode' in mat) mat.roughnessNode = float(1);
    mat.fog = false;
    mat.toneMapped = false;
    mat.needsUpdate = true;
  }

  function setEnabled(scene, sky, renderer, on) {
    if (on === active) return;
    active = on;
    if (on) {
      clearColor = new THREE.Color();
      if (renderer.getClearColor) renderer.getClearColor(clearColor);
      clearAlpha = renderer.getClearAlpha ? renderer.getClearAlpha() : 1;
      if (renderer.setClearColor) renderer.setClearColor(0x000000, 1);
      scene.traverse((obj) => {
        if (obj === sky) {
          saved.set(obj, { visible: obj.visible });
          obj.visible = false;
          return;
        }
        if (obj.isMesh) {
          const list = Array.isArray(obj.material) ? obj.material : [obj.material];
          if (list.some((mat) => mat && mat.positionNode)) {
            for (const mat of list) if (mat && mat.positionNode) patchPlaced(mat);
            return;
          }
          if (obj.material === material) return;
          saved.set(obj, { material: obj.material });
          obj.material = material;
          return;
        }
        if (obj.isSprite || obj.isPoints || obj.isLine || obj.isLineSegments) {
          saved.set(obj, { visible: obj.visible });
          obj.visible = false;
        }
      });
      return;
    }
    for (const [mat, rec] of patched) {
      mat.colorNode = rec.colorNode;
      mat.emissiveNode = rec.emissiveNode;
      if (rec.emissive != null && mat.emissive && mat.emissive.isColor) mat.emissive.setHex(rec.emissive);
      mat.emissiveIntensity = rec.emissiveIntensity;
      mat.metalnessNode = rec.metalnessNode;
      mat.roughnessNode = rec.roughnessNode;
      mat.fog = rec.fog;
      mat.toneMapped = rec.toneMapped;
      mat.needsUpdate = true;
    }
    patched.clear();
    for (const [obj, rec] of saved) {
      if (rec.material !== undefined) obj.material = rec.material;
      if (rec.visible !== undefined) obj.visible = rec.visible;
    }
    saved.clear();
    if (clearColor && renderer.setClearColor) renderer.setClearColor(clearColor, clearAlpha);
    clearColor = null;
  }

  return { setEnabled, material, atlas };
}
