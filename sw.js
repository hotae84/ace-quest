// 코드든 카드 JSON이든 바뀌면 APP_VERSION을 올린다
const APP_VERSION = '0.3.0';
const CACHE = `aq-${APP_VERSION}`;
const PRECACHE = [
  './', 'index.html', 'admin.html', 'replay.html', 'manifest.webmanifest',
  'css/app.css', 'css/admin.css', 'css/fx.css',
  'js/app.js', 'js/admin.js', 'js/admin-core.js', 'js/replay.js', 'js/check.js', 'js/content.js', 'js/dom.js', 'js/draw.js', 'js/game.js', 'js/github.js',
  'js/hash.js', 'js/records.js', 'js/rng.js', 'js/store.js', 'js/sw-client.js',
  'js/questions/index.js', 'js/questions/mcq.js', 'js/questions/ox.js', 'js/questions/blank.js', 'js/questions/order.js', 'js/questions/match.js',
  'js/questions/render/choice.js', 'js/questions/render/ox.js', 'js/questions/render/order.js', 'js/questions/render/match.js',
  'js/views/index.js', 'js/views/common.js', 'js/views/setup.js', 'js/views/map.js', 'js/views/battle.js', 'js/views/verdict.js', 'js/views/result.js',
  'data/zones.json', 'data/agents.json', 'data/versions.json', 'data/cards-z1.json', 'data/cards-z2.json', 'data/cards-z4.json', 'data/cards-z5.json',
  'data/fixed-f1.json', 'data/fixed-f2.json', 'data/fixed-f3.json', 'data/fixed-f4.json',
  'js/fixed.js', 'js/questions/fixed.js',
  'js/fx/config.js', 'js/fx/motion.js', 'js/fx/rank.js', 'js/fx/once.js', 'js/fx/svg.js', 'js/fx/target.js', 'js/fx/killcut.js', 'js/fx/hit.js', 'js/fx/ace.js', 'js/fx/crate.js', 'js/fx/portrait.js', 'js/fx/avatar.js',
  'assets/fx/emblem-jett.svg', 'assets/fx/emblem-phoenix.svg', 'assets/fx/emblem-sage.svg', 'assets/fx/killcut-basic.svg', 'assets/fx/target-card.svg',
  'assets/agents/jett.webp', 'assets/agents/sage.webp', 'assets/agents/phoenix.webp', 'assets/agents/sova.webp', 'assets/agents/reyna.webp', 'assets/agents/killjoy.webp', 'assets/agents/omen.webp', 'assets/agents/cypher.webp',
  'assets/agents/jett-full.webp', 'assets/agents/sage-full.webp', 'assets/agents/phoenix-full.webp', 'assets/agents/sova-full.webp', 'assets/agents/reyna-full.webp', 'assets/agents/killjoy-full.webp', 'assets/agents/omen-full.webp', 'assets/agents/cypher-full.webp',
  'assets/abilities/jett-ability1.webp', 'assets/abilities/jett-ability2.webp', 'assets/abilities/jett-grenade.webp', 'assets/abilities/jett-ultimate.webp',
  'assets/abilities/sage-ability1.webp', 'assets/abilities/sage-ability2.webp', 'assets/abilities/sage-grenade.webp', 'assets/abilities/sage-ultimate.webp',
  'assets/abilities/phoenix-ability1.webp', 'assets/abilities/phoenix-ability2.webp', 'assets/abilities/phoenix-grenade.webp', 'assets/abilities/phoenix-ultimate.webp',
  'assets/abilities/sova-ability1.webp', 'assets/abilities/sova-ability2.webp', 'assets/abilities/sova-grenade.webp', 'assets/abilities/sova-ultimate.webp',
  'assets/abilities/reyna-ability1.webp', 'assets/abilities/reyna-ability2.webp', 'assets/abilities/reyna-grenade.webp', 'assets/abilities/reyna-ultimate.webp',
  'assets/abilities/killjoy-ability1.webp', 'assets/abilities/killjoy-ability2.webp', 'assets/abilities/killjoy-grenade.webp', 'assets/abilities/killjoy-ultimate.webp',
  'assets/abilities/omen-ability1.webp', 'assets/abilities/omen-ability2.webp', 'assets/abilities/omen-grenade.webp', 'assets/abilities/omen-ultimate.webp',
  'assets/abilities/cypher-ability1.webp', 'assets/abilities/cypher-ability2.webp', 'assets/abilities/cypher-grenade.webp', 'assets/abilities/cypher-ultimate.webp',
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
