const CACHE = 'slop-a43c7d2282';
const FILES = ["./dist/city-a43c7d2282.js","./js/building-geodata.bin.gz","./js/tree-geodata.bin.gz","./css/style.css","./dist/part-5FHELVQX.js","./dist/part-APXUDIYS.js","./dist/part-HYZ3WC7W.js","./dist/part-O4WC5KQW.js","./dist/part-OUPB7CKJ.js","./dist/part-PH6WOWCI.js","./dist/part-RMIFO4CX.js","./dist/part-T65JIARU.js","./dist/part-XKQIZPQY.js"];
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
  // drops.json changes often. Never keep a stale copy.
  if (url.pathname.includes('/data/')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }
  event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request).then((res) => {
    if (res.ok && (url.pathname.includes('/dist/') || url.pathname.endsWith('.bin.gz'))) {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    }
    return res;
  })));
});
