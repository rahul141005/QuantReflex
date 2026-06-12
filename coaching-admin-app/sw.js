/* V3 (ADR-028): 5-tab IA — leaderboard/notices/more views retired; performance/engagement/settings added. */
const CACHE_NAME = 'qr-coach-cache-v2';
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
  /* Use Promise.allSettled — a single missing asset should not block SW install.
     Do NOT call skipWaiting() — admin panels should not swap SW mid-session. */
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) =>
          fetch(url).then((response) => {
            if (response.ok) return cache.put(url, response);
          }).catch((err) => {
            console.warn('[SW] Failed to cache:', url, err.message || '');
          })
        )
      );
    })
  );
});

/* Allow controlled activation via postMessage */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  /* Skip cross-origin requests */
  if (!event.request.url.startsWith(self.location.origin)) return;

  /* NEVER cache API requests — always go to network for fresh data */
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) return response;
      return fetch(event.request).then((networkResponse) => {
        return networkResponse;
      });
    })
  );
});
