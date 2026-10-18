/* 离线缓存：App 外壳 + 单元 JSON */
const CACHE = 'b1u1app-v1';
const SHELL = [
  './', './index.html', './style.css', './app.js', './manifest.webmanifest',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
  './units/index.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // 跨域（在线发音）不缓存

  if (url.pathname.includes('/units/')) {
    // 单元数据：先给缓存，再后台更新
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(req);
        const network = fetch(req).then(res => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => null);
        return cached || network || new Response('offline', { status: 503 });
      })
    );
    return;
  }

  // 外壳：缓存优先，后台更新
  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req);
      const network = fetch(req).then(res => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return cached || network || new Response('offline', { status: 503 });
    })
  );
});
