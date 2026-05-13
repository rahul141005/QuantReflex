const CACHE_NAME = 'qr-admin-cache-v6';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/admin-style.css',
  '/js/app.js',
  '/js/services/api.js',
  '/js/state/store.js',
  '/js/firebase/firebase.js',
  '/js/firebase/auth.js',
  '/js/ui/toast.js',
  '/js/ui/modal.js',
  '/js/ui/table.js',
  '/js/views/dashboard.js',
  '/js/views/users.js',
  '/js/views/payments.js',
  '/js/views/questions.js',
  '/js/views/system.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
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
        // Cache dynamic responses for static assets if needed, but here we just return
        return networkResponse;
      });
    })
  );
});
