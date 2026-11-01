const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { loadModule } = require('./helpers/module.cjs');

const root = join(__dirname, '..');
const source = readFileSync(join(root, 'js/matrix-mode.js'), 'utf8');
const { matrixGlyphChars, matrixFromSearch } = loadModule(source, {
  imports: {
    'three/webgpu': {},
    'three/tsl': {}
  },
  globals: { URLSearchParams }
});

test('matrix glyph set is digits, latin and halfwidth katakana', () => {
  const text = matrixGlyphChars();
  assert.equal(text.length, 92);
  assert.ok(text.startsWith('0123456789'));
  assert.ok(text.includes('A') && text.includes('Z'));
  assert.equal(text.codePointAt(36), 0xff66);
  assert.equal(text.codePointAt(text.length - 1), 0xff9d);
  for (const char of text) {
    const code = char.codePointAt(0);
    assert.ok(code < 0x400 || code > 0x4ff);
  }
});

test('matrix=1 in the query turns the mode on', () => {
  assert.equal(matrixFromSearch('?matrix=1'), true);
  assert.equal(matrixFromSearch('matrix=1'), true);
  assert.equal(matrixFromSearch('?matrix=1&lite=1'), true);
  assert.equal(matrixFromSearch('?lite=1'), false);
  assert.equal(matrixFromSearch('?matrix=0'), false);
  assert.equal(matrixFromSearch(''), false);
});

test('M swaps mesh materials for a world-space glyph shader', () => {
  const main = readFileSync(join(root, 'js/main.js'), 'utf8');
  const mode = readFileSync(join(root, 'js/matrix-mode.js'), 'utf8');
  const grade = readFileSync(join(root, 'js/post-processing.js'), 'utf8');
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.match(main, /case 'KeyM'/);
  assert.match(main, /matrixFromSearch\(location\.search\)/);
  assert.match(main, /\['M'\], 'Matrix'/);
  assert.match(main, /matrixMode\.setEnabled\(scene/);
  assert.match(mode, /positionWorld/);
  assert.match(mode, /normalWorld/);
  assert.match(mode, /MeshBasicNodeMaterial/);
  assert.doesNotMatch(grade, /matrix\.enabled/);
  assert.match(html, /js\/matrix-mode\.js/);
});
