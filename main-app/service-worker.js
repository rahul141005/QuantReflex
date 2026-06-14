/**
 * Service Worker for QuantReflex (SPA)
 * Caches all assets for offline use.
 */

const APP_VERSION = 'v107';
const CACHE_NAME = 'qr-cache-v107';

var ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/state/store.js',
  './js/firebase.js',
  './js/auth.js',
  './js/firestore-sync.js',
  './js/app.js',
  './js/router.js',
  './js/drill-engine.js',
  './js/onboarding.js',
  './js/questions.js',
  './data/syllabus.js',
  './js/progress.js',
  './js/tables.js',
  './js/formulas.js',
  './js/learn-manager.js',
  './js/settings.js',
  './js/notifications.js',
  './js/soundEngine.js',
  './js/paywall.js',
  './js/ai-features.js',
  './js/session-manager.js',
  './js/services/adaptive-state.js',
  './js/services/scoring-service.js',
  './js/services/share-service.js',
  './js/services/ai-analytics.js',
  './js/companion-ui.js',
  './js/controllers/practice-config.js',
  './js/controllers/practice-modes.js',
  './js/ui/numpad.js',
  './js/ui/swipe-nav.js',
  './js/views/home-view.js',
  './js/views/learn-view.js',
  './js/views/stats-view.js',
  './js/duel-core.js',
  './js/duel-manager.js',
  './js/duel-ui.js',
  './js/utils/event-registry.js',
  './js/services/question-bank-service.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './appicons/tab/hometab.svg',
  './appicons/tab/learntab.svg',
  './appicons/tab/practicetab.svg',
  './appicons/tab/settingstab.svg',
  './appicons/tab/statstab.svg',
  './appicons/splashQ.svg',
  './sounds/drillend.mp3',
  './sounds/settingstoggle.mp3',
  './sounds/tablemodalopeningandclosing.mp3',
  './sounds/tabswitching.mp3',
  './sounds/wronganswer.mp3'
];

/* Firebase CDN scripts are cached dynamically on first fetch for offline support */

/* Promise.allSettled polyfill for Safari < 13 and older Android WebViews */
if (typeof Promise.allSettled !== 'function') {
  Promise.allSettled = function (promises) {
    return Promise.all(promises.map(function (p) {
      return Promise.resolve(p).then(
        function (value) { return { status: 'fulfilled', value: value }; },
        function (reason) { return { status: 'rejected', reason: reason }; }
      );
    }));
  };
}

/* Install: pre-cache all assets — resilient: one failing asset won't abort install */
self.addEventListener('install', function (event) {
  self.skipWaiting();   // activate the new SW immediately — a deploy shouldn't wait for every old tab to close
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.allSettled(
        ASSETS.map(function (url) {
          return fetch(url, { cache: 'no-cache' })
            .then(function (response) {
              if (!response.ok) throw new Error('Bad status ' + response.status + ' for ' + url);
              return cache.put(url, response);
            })
            .catch(function (err) {
              console.warn('[SW] Pre-cache skipped:', url, err.message);
            });
        })
      );
    })
  );
});

/* Activate: clean up old caches */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

/* Fetch: serve from cache, fall back to network.
   For Firebase CDN scripts, cache them on first fetch for offline use.
   For Firebase API requests (auth/firestore), always go to network.
   For SPA navigation requests, fall back to cached index.html. */
self.addEventListener('fetch', function (event) {
  var url = event.request.url;

  /* Let Firebase SDK handle its own API requests — don't intercept.
     Use hostname-based checks to avoid substring false positives. */
  try {
    var reqUrl = new URL(url);
    var host = reqUrl.hostname;
    if (host.endsWith('.googleapis.com') ||
        host.endsWith('.firebaseio.com') ||
        host.endsWith('.firebaseinstallations.googleapis.com')) {
      return;
    }
  } catch (e) { /* non-HTTP requests — proceed normally */ }

  /* Never cache backend API calls — always go to network */
  try {
    var apiPath = new URL(url).pathname;
    if (apiPath.startsWith('/api/')) {
      return;
    }
  } catch (e) { /* proceed normally */ }

  /* SPA navigation fallback: serve cached index.html for HTML navigation requests
     so that deep links and browser refresh work offline */
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' }).then(function (response) {
        if (response.ok) {
          var clone = response.clone();
          // Cache navigations under the CANONICAL shell key, never the full URL incl ?duel=CODE — otherwise every
          // deep link grows the cache unbounded and fragments the shell (audit network-recovery-03).
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put('./index.html', clone);
          });
        }
        return response;
      }).catch(function () {
        return caches.match('./index.html');
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      var isAppAsset = url.endsWith('.js') || url.endsWith('.css');
      
      var fetchPromise = fetch(event.request).then(function (response) {
        /* Update cache on successful fetch for assets and Firebase CDN */
        if (response.ok) {
          var urlBase = url.split('?')[0];
          if (urlBase.startsWith('https://www.gstatic.com/firebasejs/') || isAppAsset) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(event.request, clone);
            });
          }
        }
        return response;
      }).catch(function () {
        if (!cached) {
          return new Response('Service Unavailable', { status: 503, statusText: 'Service Unavailable' });
        }
      });

      /* App JS/CSS: NETWORK-FIRST so a new deploy is picked up on the very next load (the cache stays as the
         offline fallback). Other assets (images / sounds / fonts): cache-first for speed + offline.
         This stops a deploy from being masked by a stale cached bundle. */
      if (isAppAsset) { return fetchPromise.then(function (resp) { return resp || cached; }); }
      return cached || fetchPromise;
    })
  );
});

/* ---- Push Notification Handling ---- */

/* Handle postMessage from app to skip waiting (update flow) */
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* Motivational messages for background push notifications */
var PUSH_MESSAGES = [
  { title: '🧮 Time to Practice!', body: 'A quick mental math session can sharpen your skills.' },
  { title: '📐 Math Reflex Check', body: 'Keep your calculation speed sharp — practice now!' },
  { title: '🔥 Streak Alert!', body: 'Don\'t break your streak! Solve a few questions today.' },
  { title: '💪 You\'re Getting Better!', body: 'Consistent practice leads to exam success. Start now!' },
  { title: '🎯 Daily Goal Reminder', body: 'Have you hit your daily question target yet?' },
  { title: '🧠 Train Your Brain', body: 'Train your brain. 5 minutes of mental math now.' },
  { title: '✨ Stay Consistent', body: 'Your quant reflex improves with daily practice.' },
  { title: '📈 Build Your Percentile', body: 'Today\'s 5 drills build tomorrow\'s CAT percentile.' }
];

/* Handle push events (background notifications from FCM) */
self.addEventListener('push', function (event) {
  var data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { notification: { title: 'QuantReflex', body: event.data.text() } };
    }
  }

  var notif = data.notification || {};
  var title = notif.title || 'QuantReflex';
  var body = notif.body || (PUSH_MESSAGES.length > 0 ? PUSH_MESSAGES[Math.floor(Math.random() * PUSH_MESSAGES.length)].body : 'Time to practice mental math!');

  var options = {
    body: body,
    icon: './icons/icon-192.svg',
    badge: './icons/icon-192.svg',
    tag: 'quant-motivation',
    renotify: true,
    data: { url: './index.html#home' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* Handle notification click — open app to Home tab */
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  var urlToOpen = './index.html#home';
  if (event.notification.data && event.notification.data.url) {
    urlToOpen = event.notification.data.url;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      /* If app is already open, focus it and navigate */
      for (var i = 0; i < clients.length; i++) {
        if (clients[i].url.indexOf('index.html') !== -1 || clients[i].url.endsWith('/')) {
          return clients[i].focus();
        }
      }
      /* Otherwise open a new window */
      return self.clients.openWindow(urlToOpen);
    })
  );
});
