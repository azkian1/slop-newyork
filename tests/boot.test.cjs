const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
const importMap = html.match(/<script type="importmap">([^]*?)<\/script>/);
const preloads = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)"\s*\/>/g)];
const entries = [...html.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)];

test('city module preloads start after the import map and before stylesheets', () => {
  assert.ok(importMap);
  assert.ok(preloads.length > 0);
  const stylesheetIndex = html.indexOf('rel="stylesheet"');
  for (const preload of preloads) {
    assert.ok(importMap.index < preload.index);
    assert.ok(preload.index < stylesheetIndex);
  }
  assert.equal(entries.length, 1);
  assert.ok(importMap.index < entries[0].index);
  assert.ok(entries[0].index < stylesheetIndex, 'the module graph starts loading early too');
  assert.match(html, /<link rel="preconnect" href="https:\/\/cdn\.jsdelivr\.net" crossorigin\s*\/>/);
  const { imports } = JSON.parse(importMap[1]);
  assert.equal(imports.three, imports['three/webgpu'], 'Three.js aliases share one module instance');
});

test('the page preloads the hashed city bundle and fetches building geodata up front', () => {
  const links = preloads.map((match) => match[1]);
  assert.ok(links.length >= 1);
  for (const href of links) assert.match(href, /^\.\/dist\/(?:city-[a-f0-9]+|part-[A-Za-z0-9]+)\.js$/);
  assert.equal(entries.length, 1);
  assert.match(entries[0][1], /^\.\/dist\/city-[a-f0-9]+\.js$/);
  assert.ok(links.includes(entries[0][1]));
  assert.match(html, /__slopGeo/);
  assert.match(html, /building-geodata\.bin\.gz" as="fetch"/);
  const scripts = [...html.matchAll(/<script\b/g)];
  assert.equal(scripts.length, 3, 'import map, geodata kickoff, and the bundle');
});
