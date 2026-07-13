/* ============================================================
   Sea To Peak 2026 — Roadbook · Service Worker
   Stratégie :
     - Page (navigation) → RÉSEAU D'ABORD (timeout 4 s), cache en secours.
       => en ligne tu as toujours la dernière version publiée
       => hors ligne (zone blanche) tu gardes le roadbook complet
     - Polices / assets  → CACHE D'ABORD + rafraîchissement en arrière-plan
   ============================================================ */

/*  ⚠️  INCRÉMENTE CE NUMÉRO À CHAQUE PUBLICATION  ⚠️
    C'est le seul geste à faire pour forcer la mise à jour. */
const VERSION = 'v1';

const CACHE = `stp2026-${VERSION}`;
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
];
const NET_TIMEOUT = 4000; // ms avant de basculer sur le cache

/* ---------- INSTALL : pré-cache + activation immédiate ---------- */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(CORE).catch(() => {}))
      .then(() => self.skipWaiting()) // ne reste pas "en attente"
  );
});

/* ---------- ACTIVATE : purge des anciens caches ---------- */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim()) // prend la main tout de suite
  );
});

/* ---------- Permet à la page de forcer l'activation ---------- */
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

/* ---------- FETCH ---------- */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // 1) La page elle-même : réseau d'abord, cache en secours
  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req));
    return;
  }

  // 2) Le reste (polices, icônes…) : cache d'abord, revalidation en fond
  e.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await withTimeout(fetch(req, { cache: 'no-store' }), NET_TIMEOUT);
    cache.put(req, fresh.clone());          // on garde la dernière version connue
    return fresh;
  } catch (_) {
    return (await cache.match(req))
        || (await cache.match('./index.html'))
        || (await cache.match('./'))
        || new Response('Hors ligne', { status: 503 });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const net = fetch(req)
    .then((res) => {
      if (res && res.status === 200) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await net) || new Response('', { status: 504 });
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}
