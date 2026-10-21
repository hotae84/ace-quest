// 코드든 카드 JSON이든 바뀌면 APP_VERSION을 올린다
const APP_VERSION = '0.1.0';
const CACHE = `aq-${APP_VERSION}`;
const PRECACHE = [
  './', 'index.html', 'admin.html', 'replay.html', 'manifest.webmanifest',
  'css/app.css', 'css/admin.css',
  'js/app.js', 'js/admin.js', 'js/replay.js', 'js/check.js', 'js/content.js', 'js/dom.js', 'js/draw.js', 'js/game.js', 'js/github.js',
  'js/hash.js', 'js/records.js', 'js/rng.js', 'js/store.js', 'js/sw-client.js',
  'js/questions/index.js', 'js/questions/mcq.js', 'js/questions/ox.js', 'js/questions/blank.js', 'js/questions/order.js', 'js/questions/match.js',
  'js/questions/render/choice.js', 'js/questions/render/ox.js', 'js/questions/render/order.js', 'js/questions/render/match.js',
  'js/views/index.js', 'js/views/common.js', 'js/views/setup.js', 'js/views/map.js', 'js/views/battle.js', 'js/views/verdict.js', 'js/views/result.js',
  'data/zones.json', 'data/agents.json', 'data/versions.json', 'data/cards-z1.json',
  'assets/icons/icon-180.png', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((p) => new Request(p, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('aq-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// 같은 origin의 GET만 캐시에서 준다. GitHub API·CDN은 origin이 달라 손대지 않는다(설계 §6.1)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    return hit || fetch(req);
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
