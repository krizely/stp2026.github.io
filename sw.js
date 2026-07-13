/* ============================================================
   Sea To Peak 2026 — Roadbook · Service Worker
     - Page (navigation) → RÉSEAU D'ABORD (timeout 3 s), cache en secours
     - Polices / assets  → CACHE PERMANENT + revalidation en fond
   ============================================================ */

/*  ⚠️  INCRÉMENTE À CHAQUE PUBLICATION  ⚠️  */
const VERSION = 'v3.2';

const CACHE_APP    = `stp2026-app-${VERSION}`;  // purgé à chaque version
const CACHE_ASSETS = 'stp2026-assets';          // JAMAIS purgé (polices !)

const CORE = ['./', './index.html', './manifest.webmanifest'];
const NET_TIMEOUT = 3000;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_APP).then((c) => c.addAll(CORE).catch(() => {}))
    // PAS de skipWaiting ici : on laisse le toast décider
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.startsWith('stp2026-app-') && k !== CACHE_APP)
          .map((k) => caches.delete(k))        // on ne touche PAS aux assets
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req)); return; }
  e.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE_APP);
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), NET_TIMEOUT);
  try {
    const fresh = await fetch(req, { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(timer);
    if (fresh && fresh.status === 200) cache.put(req, fresh.clone());
    return fresh;
  } catch (_) {
    clearTimeout(timer);
    return (await cache.match(req))
        || (await cache.match('./index.html'))
        || (await cache.match('./'))
        || new Response('Hors ligne', { status: 503 });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_ASSETS);
  const hit = await cache.match(req);
  const net = fetch(req)
    .then((res) => {
      if (res && res.status === 200) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await net) || new Response('', { status: 504 });
}