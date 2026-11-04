const CACHE = 'slop-ny-ed24891f0f-pills3';
const FILES = ["./dist/city-ed24891f0f.js","./js/building-geodata.bin.gz","./js/tree-geodata.bin.gz","./assets/ui/pill-red.png?v=ed24891f0f","./assets/ui/pill-blue.png?v=ed24891f0f","./assets/ui/avatar-roach.png","./assets/ui/avatar-rat.png","./dist/part-2DKW5JFN.js","./dist/part-5FHELVQX.js","./dist/part-APXUDIYS.js","./dist/part-HYZ3WC7W.js","./dist/part-JWV234YZ.js","./dist/part-K7TJC2CO.js","./dist/part-O4WC5KQW.js","./dist/part-PH6WOWCI.js","./dist/part-RMIFO4CX.js","./dist/part-XKQIZPQY.js"];
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(FILES.map(async (path) => {
      const res = await fetch(path, { cache: 'reload' });
      if (!res.ok) throw new Error(path);
      await cache.put(path, res);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting();
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;
  // A worker must not answer the document. A bad response there is a blank white page,
  // and a returning visitor has to be able to pick up a new index.html.
  if (event.request.mode === 'navigate' || event.request.destination === 'document') return;
  if (url.pathname.endsWith('/sw.js') || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) return;
  // drops.json changes often. Never keep a stale copy.
  if (url.pathname.includes('/data/')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }
  // Leave stylesheets to the network. The loader is inline, and a worker that is
  // still starting must not hold the sheet that used to block the first paint.
  if (url.pathname.endsWith('.css')) return;
  const asset = url.pathname.includes('/dist/') || url.pathname.endsWith('.bin.gz') || url.pathname.includes('/assets/ui/');
  if (!asset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(event.request);
    if (hit) return hit;
    const res = await fetch(event.request);
    if (res.ok) await cache.put(event.request, res.clone());
    return res;
  })());
});
