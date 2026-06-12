const CACHE_NAME = 'qr-admin-cache-v12';
/* Super Admin V2 (ADR-022) script set — matches index.html exactly. The legacy
   dashboard/payments/system/inactive/security/firestore-ops/exports/notifications
   view files were deleted in the 5-Center consolidation and are no longer cached. */
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/admin-style.css',
  '/js/state/store.js',
  '/js/firebase/firebase.js',
  '/js/firebase/security-events.js',
  '/js/firebase/auth.js',
  '/js/services/api.js',
  '/js/ui/toast.js',
  '/js/ui/modal.js',
  '/js/ui/table.js',
  '/js/ui/split.js',
  '/js/ui/tabs.js',
  '/js/utils.js',
  '/js/views/users.js',
  '/js/views/coachings.js',
  '/js/views/revenue.js',
  '/js/views/questions.js',
  '/js/views/ai.js',
  '/js/views/operations.js',
  '/js/views/command-center.js',
  '/js/views/settings.js',
  '/js/app.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  /* Use Promise.allSettled instead of cache.addAll to prevent a single
     failing asset from blocking the entire service worker install.
     Do NOT call skipWaiting() here — admin panels performing sensitive
     operations should not have their SW swapped mid-session. */
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

/* Allow controlled activation via postMessage from the app */
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
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  // Skip API requests from caching entirely to avoid stale data
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached response if found
      if (response) {
        return response;
      }
      
      // Fallback to network
      return fetch(event.request).then((networkResponse) => {
        return networkResponse;
      });
    })
  );
});
