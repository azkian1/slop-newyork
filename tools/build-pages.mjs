// Bundle the city into a few minified ES modules for GitHub Pages.
// Run from the repo root: node tools/build-pages.mjs

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';

const outdir = 'dist';
await build({
  entryPoints: { city: 'js/main.js' },
  bundle: true,
  splitting: true,
  format: 'esm',
  outdir,
  entryNames: '[name]',
  chunkNames: 'part-[hash]',
  minify: true,
  metafile: true,
  external: ['three', 'three/*'],
  legalComments: 'none'
});

const cityPath = join(outdir, 'city.js');
const hash = createHash('sha256').update(readFileSync(cityPath)).digest('hex').slice(0, 10);
const hashed = `city-${hash}.js`;
const files = readdirSync(outdir);
for (const name of files) {
  if (name.startsWith('city-') && name.endsWith('.js')) unlinkSync(join(outdir, name));
}
const cityJs = readFileSync(cityPath);
writeFileSync(join(outdir, hashed), cityJs);
unlinkSync(cityPath);

const entryText = readFileSync(join(outdir, hashed), 'utf8');
const staticParts = [...new Set([...entryText.matchAll(/from"(\.\/part-[^"]+\.js)"/g)].map((match) => `./dist/${match[1].slice(2)}`))];
let html = readFileSync('index.html', 'utf8');
html = html.replace(/\.\/dist\/city(?:-[a-f0-9]+)?\.js/g, `./dist/${hashed}`);
html = html.replace(/[ \t]*<link rel="modulepreload" href="\.\/dist\/[^"]+" \/>\n/g, '');
const preloadBlock = [`./dist/${hashed}`, ...staticParts]
  .map((href) => `  <link rel="modulepreload" href="${href}" />`)
  .join('\n') + '\n';
html = html.replace('  <!-- One bundled module.', `${preloadBlock}  <!-- One bundled module.`);
writeFileSync('index.html', html);

const precache = [`./dist/${hashed}`, './js/building-geodata.bin.gz', './js/tree-geodata.bin.gz', './css/style.css'];
for (const name of readdirSync(outdir)) {
  if (name.startsWith('part-') && name.endsWith('.js')) precache.push(`./dist/${name}`);
}
const sw = `const CACHE = 'slop-${hash}';
const FILES = ${JSON.stringify(precache)};
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request).then((res) => {
    if (res.ok && (url.pathname.includes('/dist/') || url.pathname.endsWith('.bin.gz'))) {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    }
    return res;
  })));
});
`;
writeFileSync('sw.js', sw);
const bytes = statSync(join(outdir, hashed)).size;
console.log(`wrote dist/${hashed} (${bytes} bytes) and ${precache.length} cached urls`);
