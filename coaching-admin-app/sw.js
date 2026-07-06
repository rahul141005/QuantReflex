/* Coaching-Admin service worker.
   ADR-102: unified lifecycle shape with the main app — APP_VERSION-derived cache, GET_VERSION +
   SKIP_WAITING message handshake, delete-old-caches + claim on activate, and network-first JS/CSS
   (so a deploy is picked up on the next load) + cache-first assets + cached-index.html nav fallback.
   DELIBERATELY still does NOT skipWaiting() on install — an admin panel must not swap its SW
   mid-session; the new worker waits and the in-app QRUpdateManager surfaces the Update affordance. */
const APP_VERSION = 'v3';
const CACHE_NAME = 'qr-coach-cache-' + APP_VERSION;   /* derived so the two strings can never drift */
const NET_FIRST_TIMEOUT_MS = 3000;                    /* network-first JS/CSS falls back to cache on "lie-fi" */

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/coaching-style.css',
  '/js/app.js',
  '/js/state/store.js',
  '/js/firebase/firebase.js',
  '/js/firebase/security-events.js',
  '/js/firebase/auth.js',
  '/js/services/api.js',
  '/js/utils.js',
  '/js/ui/toast.js',
  '/js/ui/bottom-sheet.js',
  '/js/ui/update-manager.js',
  '/js/views/dashboard.js',
  '/js/views/students.js',
  '/js/views/student-profile.js',
  '/js/views/performance.js',
  '/js/views/engagement.js',
  '/js/views/settings.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  /* Promise.allSettled (not cache.addAll) so one failing asset can't block install.
     Do NOT call skipWaiting() here — see the file header. */
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) =>
          fetch(url, { cache: 'no-cache' }).then((response) => {
            if (response.ok) return cache.put(url, response);
          }).catch((err) => {
            console.warn('[SW] Failed to cache:', url, err.message || '');
          })
        )
      );
    })
  );
});

/* Controlled activation + version handshake (ADR-102). */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data && event.data.type === 'GET_VERSION') {
    try { if (event.ports && event.ports[0]) event.ports[0].postMessage({ version: APP_VERSION }); } catch (_) {}
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => { if (cache !== CACHE_NAME) return caches.delete(cache); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = req.url;

  // Skip cross-origin requests.
  if (!url.startsWith(self.location.origin)) return;
  // Never cache API calls — always go to network for fresh data.
  if (url.indexOf('/api/') !== -1) return;

  // SPA navigation fallback: serve cached index.html when offline so deep links/refresh work.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-cache' }).then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
        }
        return response;
      }).catch(() => caches.match('/index.html'))
    );
    return;
  }

  const isAppAsset = url.endsWith('.js') || url.endsWith('.css');
  event.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req).then((response) => {
        if (response && response.ok && isAppAsset) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return response;
      }).catch(() => cached);

      /* App JS/CSS: NETWORK-FIRST (timeout → cache) so a new deploy is picked up on the next load;
         other assets: cache-first for speed + offline. */
      if (isAppAsset) {
        return new Promise((resolve) => {
          let settled = false;
          const to = setTimeout(() => { if (!settled && cached) { settled = true; resolve(cached); } }, NET_FIRST_TIMEOUT_MS);
          net.then((r) => { if (!settled) { settled = true; clearTimeout(to); resolve(r || cached); } },
                   () => { if (!settled) { settled = true; clearTimeout(to); resolve(cached); } });
        });
      }
      return cached || net;
    })
  );
});
