/**
 * app.js — SPA application bootstrap & orchestration
 *
 * Responsibilities:
 *   1. Register the service worker
 *   2. Handle the PWA install prompt
 *   3. Apply saved dark mode setting
 *   4. Initialize Firebase and authentication
 *   5. Initialize the SPA router
 *   6. Orchestrate view module initialization
 *   7. Manage auth gate and login flow
 *   8. Provide shared utilities (haptic, category labels, nav icons)
 *
 * View rendering, practice modes, numpad, swipe navigation, and
 * quick study links have been extracted to their respective modules:
 *   - js/views/home-view.js, learn-view.js, stats-view.js
 *   - js/controllers/practice-config.js, practice-modes.js
 *   - js/ui/numpad.js, swipe-nav.js
 *   - js/session-manager.js
 */

/* ---- Detect runtime mode (PWA standalone vs browser tab) ---- */
(function () {
  var isPWA = false;
  try {
    isPWA = !!(
      (window.matchMedia && (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches
      )) ||
      navigator.standalone === true
    );
  } catch (e) { /* ignore */ }

  document.documentElement.classList.add(isPWA ? 'pwa-mode' : 'web-mode');
  document.body.classList.add(isPWA ? 'pwa-mode' : 'web-mode');
})();

/* ---- Apply dark mode, theme and reduced motion from settings immediately ---- */
(function () {
  /* Force cleanup of any stuck state classes that might persist across soft-reloads */
  document.body.classList.remove('modal-open', 'drill-session-active');
  document.documentElement.classList.remove('modal-open', 'drill-session-active');

  /* Bulletproof viewport height fix for mobile browsers */
  function setVH() {
    var vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', vh + 'px');
  }
  setVH();
  window.addEventListener('resize', setVH);
  window.addEventListener('orientationchange', setVH);

  try {
    var settings = (typeof AppState !== 'undefined') ? AppState.getSettings() : JSON.parse(localStorage.getItem('qr_settings') || '{}');
    if (settings.darkMode) document.body.classList.add('dark-mode');
    if (settings.reducedMotion) document.body.classList.add('reduced-motion');
    if (settings.theme === 'playful') document.body.classList.add('theme-playful');
  } catch (_) { /* ignore */ }
})();

/* ---- Initialize Firebase is now handled inside DOMContentLoaded ---- */

/* ---- Prevent native context menu on long-press (native app feel) ---- */
document.addEventListener('contextmenu', function (e) {
  /* Allow context menu only on inputs and textareas */
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  e.preventDefault();
});

/* ---- Prevent accidental image/element dragging ---- */
document.addEventListener('dragstart', function (e) {
  e.preventDefault();
});

/* ---- Prevent pull-to-refresh in PWA mode (Android Chrome fallback) ---- */
/* Removed: JS-level touchmove with {passive: false} causes severe scroll jitter on Android Chrome.
   Relying exclusively on CSS overscroll-behavior-y: contain set on body/html. */

/* ---- Offline / Online indicator ---- */
(function () {
  function _updateOfflineBanner() {
    var banner = document.getElementById('offlineBanner');
    if (!banner) return;
    banner.style.display = navigator.onLine ? 'none' : 'block';
  }
  window.addEventListener('online', _updateOfflineBanner);
  window.addEventListener('offline', _updateOfflineBanner);
  /* Check initial state after DOM is ready */
  _updateOfflineBanner();
})();

/* ---- Ripple effect on interactive elements ---- */
(function () {
  var RIPPLE_SELECTORS = '.btn, .mode-card, .category-btn, .study-card, .learn-jump-btn, .table-select-btn, .clear-option-btn, .quick-link-option, .bottom-nav a';

  document.addEventListener('pointerdown', function (e) {
    var target = e.target.closest(RIPPLE_SELECTORS);
    if (!target) return;

    /* Ensure ripple container setup */
    var style = window.getComputedStyle(target);
    if (style.position === 'static') {
      target.style.position = 'relative';
    }
    if (style.overflow !== 'hidden') {
      target.style.overflow = 'hidden';
    }

    var rect = target.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height) * 1.4;
    var ripple = document.createElement('span');
    ripple.className = 'ripple-effect';
    ripple.style.width = size + 'px';
    ripple.style.height = size + 'px';
    ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
    ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
    target.appendChild(ripple);

    /* Remove ripple after animation */
    setTimeout(function () {
      if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
    }, 500);
  });
})();

/* ---- Haptic feedback utility ---- */
function triggerHaptic(pattern) {
  try {
    var settings = (typeof AppState !== 'undefined') ? AppState.getSettings() : JSON.parse(localStorage.getItem('qr_settings') || '{}');
    if (settings.vibration === false) return;
    if (typeof navigator.vibrate !== 'function') return;
    navigator.vibrate(pattern || 10);
  } catch (_) { /* ignore */ }
}

/* Numpad key press visual feedback moved to js/ui/numpad.js */

/* ---- Global error handling for unhandled promise rejections ---- */
window.addEventListener('unhandledrejection', function (event) {
  console.warn('Unhandled promise rejection:', event.reason);
  /* NOTE: event.preventDefault() intentionally removed to preserve error
     visibility in console and external monitoring tools (e.g. Sentry). */
});

/* ---- Service Worker Registration ---- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register('./service-worker.js')
      .then(function (registration) {
        if (!registration.waiting) {
          try { localStorage.removeItem('qr_pending_update_id'); } catch(_) {}
        }

        /* Detect a new SW waiting to activate and prompt user to reload */
        function onUpdateFound() {
          var newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', function () {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              /* New version is ready — show a lightweight toast / reload prompt */
              _showUpdateToast();
            }
          });
        }

        if (registration.waiting && navigator.serviceWorker.controller) {
          _showUpdateToast();
        }
        registration.addEventListener('updatefound', onUpdateFound);
      })
      .catch(function (err) { console.warn('SW registration failed:', err); });
  });
}

try {
  if (localStorage.getItem('appUpdating') === 'true') {
    localStorage.removeItem('appUpdating');
    window.addEventListener('load', function () {
      setTimeout(function () {
        if (typeof showToast === 'function') {
          showToast('\u2705 App updated successfully');
        }
      }, 1500);
    });
  }
} catch (_) {}

function _showUpdateToast() {
  if (document.getElementById('_swUpdateToast')) return;
  var _updateKey = '';
  try {
    _updateKey = localStorage.getItem('qr_pending_update_id');
    if (!_updateKey) {
      var d = new Date();
      var dateStr = d.getFullYear() + '_' + (d.getMonth() + 1) + '_' + d.getDate();
      _updateKey = 'app_update_' + dateStr;
      localStorage.setItem('qr_pending_update_id', _updateKey);
    }
  } catch (_) {}

  // ADR-066: the "update available → reload" prompt is a LOCAL UI affordance, NOT a notification — it stays a
  // toast and is never written to the Inbox. Clients no longer create notifications; a real "new version" Inbox
  // notification, when wanted, is sent through the server pipeline (super-admin broadcast, category system).

  // Toast Notification generation (deduplicated via localStorage)
  try {
    if (localStorage.getItem(_updateKey) === '1') return;
    localStorage.setItem(_updateKey, '1');
  } catch (_) {}

  var toast = document.createElement('div');
  toast.id = '_swUpdateToast';
  toast.setAttribute('role', 'status');
  toast.style.cssText = [
    'position:fixed', 'bottom:72px', 'left:50%', 'transform:translateX(-50%)',
    'background:#1e293b', 'color:#f8fafc', 'padding:10px 18px',
    'border-radius:10px', 'font-size:14px', 'z-index:99999',
    'display:flex', 'align-items:center', 'gap:12px',
    'box-shadow:0 4px 16px rgba(0,0,0,.35)', 'max-width:90vw',
    'cursor:pointer'
  ].join(';');
  toast.textContent = '\uD83D\uDE80 New version available. Update from Settings';
  document.body.appendChild(toast);
  toast.addEventListener('click', function () {
    toast.remove();
    if (typeof Router !== 'undefined' && typeof Router.showView === 'function') {
      Router.showView('settings');
    }
  });
  setTimeout(function () {
    if (toast.parentNode) toast.remove();
  }, 8000);
}

/**
 * Show a custom confirmation dialog instead of native confirm() to prevent
 * thread-blocking in Android TWAs.
 */
function showCustomConfirm(msg, onConfirm) {
  var modal = document.getElementById('clearConfirmModal');
  var textEl = document.getElementById('clearConfirmText');
  var cancelBtn = document.getElementById('clearConfirmCancel');
  var okBtn = document.getElementById('clearConfirmOk');

  if (!modal || !textEl || !cancelBtn || !okBtn) {
    console.error('Missing custom confirm dialog elements — action blocked for safety.');
    return;
  }

  textEl.textContent = msg;
  modal.style.display = 'flex';

  function close() {
    modal.style.display = 'none';
    cancelBtn.onclick = null;
    okBtn.onclick = null;
    modal.onclick = null;
  }

  cancelBtn.onclick = function () { close(); };
  okBtn.onclick = function () {
    close();
    onConfirm();
  };
  modal.onclick = function (e) {
    if (e.target === modal) close();
  };
}

/* ---- PWA Install Prompt ---- */
window._deferredPrompt = null;

window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  window._deferredPrompt = e;

  /* Show install card if settings view is active */
  var installCard = document.getElementById('installCard');
  if (installCard) {
    installCard.style.display = 'block';
  }
});

/* ---- Category name formatting for display ---- */
var _CATEGORY_LABELS = {
  'squares': 'Squares',
  'cubes': 'Cubes',
  'area': 'Area',
  'volume': 'Volume',
  'fractions': 'Fractions',
  'percentages': 'Percentages',
  'multiplication': 'Multiplication',
  'ratios': 'Ratios',
  'averages': 'Averages',
  'profit-loss': 'Profit & Loss',
  'time-speed-distance': 'Time, Speed & Distance',
  'time-and-work': 'Time & Work'
};

/**
 * Format a raw category key into a human-readable label.
 * @param {string} key - raw category key (e.g. 'time-and-work')
 * @returns {string} formatted label (e.g. 'Time & Work')
 */
function formatCategoryName(key) {
  if (!key) return '-';
  if (_CATEGORY_LABELS[key]) return _CATEGORY_LABELS[key];
  /* Fallback: capitalize and replace hyphens with spaces */
  return key.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

/* ---- Theme-Based Navigation Icon Switching ---- */
var _NAV_EMOJIS = {
  home: '🏠', practice: '🎯', learn: '📖', stats: '📊', settings: '⚙️'
};
var _NAV_SVGS = {
  home: 'appicons/tab/hometab.svg',
  practice: 'appicons/tab/practicetab.svg',
  learn: 'appicons/tab/learntab.svg',
  stats: 'appicons/tab/statstab.svg',
  settings: 'appicons/tab/settingstab.svg'
};
var _HEADER_LABELS = {
  'view-practice': { emoji: '🎯', label: 'Practice', view: 'practice' },
  'view-learn': { emoji: '📖', label: 'Learn', view: 'learn' },
  'view-stats': { emoji: '📊', label: 'Analytics', view: 'stats' },
  'view-settings': { emoji: '⚙️', label: 'Settings', view: 'settings' }
};
function _handleTabPopAnimationEnd() {
  this.classList.remove('tab-pop');
}

/**
 * Switch navigation and header icons based on theme.
 * Classic Blue: emoji icons, Playful Professional: SVG icons.
 * @param {string} theme - 'classic' or 'playful'
 */
function updateNavigationIcons(theme) {
  /* Update bottom nav icons */
  var navLinks = document.querySelectorAll('.bottom-nav a[data-view]');
  for (var i = 0; i < navLinks.length; i++) {
    var view = navLinks[i].getAttribute('data-view');
    var navIcon = navLinks[i].querySelector('.nav-icon');
    if (!navIcon) continue;
    navIcon.innerHTML = '';

    if (theme === 'playful' && _NAV_SVGS[view]) {
      var img = document.createElement('img');
      img.src = _NAV_SVGS[view];
      img.alt = '';
      img.width = 24;
      img.height = 24;
      img.draggable = false;
      navIcon.appendChild(img);
    } else {
      var span = document.createElement('span');
      span.className = 'nav-emoji';
      span.textContent = _NAV_EMOJIS[view] || '';
      navIcon.appendChild(span);
    }

    /* Re-attach animationend cleanup listener */
    var iconChild = navIcon.firstChild;
    if (iconChild) {
      iconChild.removeEventListener('animationend', _handleTabPopAnimationEnd);
      iconChild.addEventListener('animationend', _handleTabPopAnimationEnd);
    }
  }

  /* Update header icons (home header stays as title text, no icon) */
  for (var viewId in _HEADER_LABELS) {
    var viewEl = document.getElementById(viewId);
    if (!viewEl) continue;
    var h1 = viewEl.querySelector('header h1');
    if (!h1) continue;
    var info = _HEADER_LABELS[viewId];
    h1.textContent = '';

    if (theme === 'playful' && _NAV_SVGS[info.view]) {
      var hImg = document.createElement('img');
      hImg.src = _NAV_SVGS[info.view];
      hImg.alt = '';
      hImg.className = 'header-icon';
      hImg.width = 28;
      hImg.height = 28;
      hImg.draggable = false;
      h1.appendChild(hImg);
      h1.appendChild(document.createTextNode(' ' + info.label));
    } else {
      h1.textContent = info.emoji + ' ' + info.label;
    }
  }
}

/* Session management moved to js/session-manager.js */
/* Practice config moved to js/controllers/practice-config.js */
/* Practice modes moved to js/controllers/practice-modes.js */
/* Quick study links moved to js/views/home-view.js */
/* Swipe navigation moved to js/ui/swipe-nav.js */
/* Numpad controller moved to js/ui/numpad.js */



/**
 * Run the splash screen animation sequence and remove it when finished.
 * Stages: pause → bounce → blob emerge → amoeba expand → fill → fade out.
 * Uses CSS classes to trigger GPU-accelerated animations.
 * Falls back to an instant hide when reduced-motion is active.
 */
function _hideAppLoader() {
  var loader = document.getElementById('appLoader');
  if (!loader) return;

  /* Reduced motion — skip animation entirely */
  if (document.body.classList.contains('reduced-motion')) {
    loader.style.display = 'none';
    return;
  }

  /* Stage timing constants (ms) — keep in sync with CSS animation durations.
     Stages overlap slightly for fluid sequencing (~1.95 s total). */
  var BOUNCE_START = 200;   /* idle → bounce          */
  var BLOB_EMERGE  = 480;   /* blob fades in           */
  var BLOB_EXPAND  = 880;   /* amoeba growth begins    */
  var FILL_START   = 1380;  /* bg turns blue + emphasis */
  var FADEOUT_START = 1650;  /* dissolve out            */
  var REMOVE_AT    = 1950;  /* DOM cleanup             */

  /* Stage 1 — brief pause is implicit: the loader is already visible
     with a gentle idle pulse on the Q logo. */

  /* Stage 2 — Q bounce (replaces idle animation via higher specificity) */
  setTimeout(function () {
    loader.classList.add('splash-bounce');
  }, BOUNCE_START);

  /* Stage 3 — blob emerge (overlaps with bounce tail for organic feel) */
  setTimeout(function () {
    loader.classList.add('splash-blob-emerge');
  }, BLOB_EMERGE);

  /* Stage 4 — amoeba expansion (CSS source order overrides emerge animation;
     blob-emerge class stays so opacity: 1 forwards fill is not lost) */
  setTimeout(function () {
    loader.classList.add('splash-expand');
  }, BLOB_EXPAND);

  /* Stage 5 — full-screen blue fill + Q emphasis */
  setTimeout(function () {
    loader.classList.add('splash-fill');
  }, FILL_START);

  /* Stage 6 — fade out */
  setTimeout(function () {
    loader.classList.add('splash-fadeout');
  }, FADEOUT_START);

  /* Remove from DOM after animation completes */
  setTimeout(function () {
    if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
  }, REMOVE_AT);
}

/**
 * Close all open info modals (App Guide, About).
 * Called on navigation to prevent stale modals.
 */
function _closeAllInfoModals() {
  var modals = document.querySelectorAll('.info-modal-overlay');
  for (var i = 0; i < modals.length; i++) {
    modals[i].style.display = 'none';
    modals[i].classList.remove('closing');
  }
  /* Clean up any active Escape key handler from openInfoModal */
  if (typeof _infoModalEscapeHandler === 'function') {
    document.removeEventListener('keydown', _infoModalEscapeHandler);
    _infoModalEscapeHandler = null;
  }
}




/* ---- Initialize SPA when DOM is ready ---- */
document.addEventListener('DOMContentLoaded', function () {

  /* ---- Initialize Firebase ---- */
  if (typeof FirebaseApp !== 'undefined') {
    FirebaseApp.init();
  }

  document.body.classList.add('loaded');

  var authScreen = document.getElementById('authScreen');
  var container = document.querySelector('.container');
  var bottomNav = document.querySelector('.bottom-nav');
  var _authRequestInFlight = false;
  var _currentAppState = 'initializing';

  /**
   * Sets the application state and manages DOM visibility strictly.
   */
  function setAppState(state) {
    if (state === 'unauthenticated' && _currentAppState === 'unauthenticated') return;
    if (state === 'app' && _currentAppState === 'app') return;
    _currentAppState = state;
    
    if (state === 'unauthenticated') {
      _hideAppLoader();
      document.body.classList.remove('auth-resolved');
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      if (authScreen) authScreen.style.display = 'flex';
      if (container) container.style.display = 'none';
      if (bottomNav) bottomNav.style.display = 'none';
      if (typeof Router !== 'undefined' && typeof Router.teardown === 'function') {
        Router.teardown();
      }
      /* Restore button text if it was loading */
      var authBtn = document.getElementById('authSubmitBtn');
      if (authBtn) {
        var activeTab = document.querySelector('.auth-tab.active');
        authBtn.textContent = (activeTab && activeTab.getAttribute('data-mode') === 'register') ? 'Create Account' : 'Log In';
        authBtn.disabled = false;
      }
    } else if (state === 'hydrating') {
      /* Wait for data. Do not hide the login screen or splash screen yet,
         but keep the loading button text active. */
    } else if (state === 'app') {
      _hideAppLoader();
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      document.body.classList.add('auth-resolved');
      
      if (authScreen) authScreen.style.display = 'none';
      if (container) container.style.display = '';
      if (bottomNav) bottomNav.style.display = '';
      
      try {
        var s = (typeof AppState !== 'undefined') ? AppState.getSettings() : JSON.parse(localStorage.getItem('quant_reflex_settings') || '{}');
        updateNavigationIcons(s.theme || 'classic');
      } catch (_) {
        updateNavigationIcons('classic');
      }

      if (typeof Router !== 'undefined') {
        if (!window._routerInitialized) {
          window._routerInitialized = true;
          Router.init();
        } else {
          var currentView = Router.getCurrentView() || 'home';
          Router.showView(currentView);
        }
      }

      if (typeof DuelManager !== 'undefined' && typeof DuelManager.init === 'function') {
        DuelManager.init();
      }
    }
  }

  var _hydrationStarted = false;
  var _hydrationRetryCount = 0;
  var _MAX_HYDRATION_RETRIES = 30; /* 3 seconds at 100ms intervals */

  function startHydrationAndShowApp() {
    if (_currentAppState === 'app') return;
    if (_hydrationStarted) return;
    _hydrationStarted = true;

    setAppState('hydrating');
    
    var transitionFired = false;
    function _executeTransition() {
      if (transitionFired) return;
      transitionFired = true;
      try {
        var s = (typeof AppState !== 'undefined') ? AppState.getSettings() : JSON.parse(localStorage.getItem('quant_reflex_settings') || '{}');
        document.body.classList.toggle('dark-mode', !!s.darkMode);
        if (typeof applyTheme === 'function') applyTheme(s.theme || 'classic');
      } catch (_) { /* ignore */ }
      _launchOnboardingOrShowMain();
    }

    var timeoutId = setTimeout(function() {
      console.warn('Hydration timeout — bypassing onboarding to prevent state corruption.');
      _executeTransition();
    }, 6000);

    if (typeof FirestoreSync !== 'undefined' && typeof FirebaseApp !== 'undefined' && FirebaseApp.isReady() && FirebaseApp.getUserId()) {
      FirestoreSync.loadFromFirestore(function (success) {

        clearTimeout(timeoutId);
        _executeTransition();
      });
    } else {
      /* Wait and retry if ID hasn't propagated yet, preventing onboarding bypass */
      if (FirebaseApp.isReady() && typeof Auth !== 'undefined' && Auth.isLoggedIn() && !FirebaseApp.getUserId()) {
         if (_hydrationRetryCount++ < _MAX_HYDRATION_RETRIES) {
           clearTimeout(timeoutId);
           _hydrationStarted = false; /* Allow retry */
           setTimeout(startHydrationAndShowApp, 100);
           return;
         }
         console.error('[BOOT] getUserId() still null after ' + _MAX_HYDRATION_RETRIES + ' retries. Proceeding without Firestore.');
      }
      clearTimeout(timeoutId);
      _executeTransition();
    }
  }

  function _launchOnboardingOrShowMain() {
    var hasUid = typeof FirebaseApp !== 'undefined' && FirebaseApp.isReady() && !!FirebaseApp.getUserId();
    
    if (typeof Onboarding !== 'undefined' && Onboarding.shouldShow() && hasUid) {
      if (authScreen) authScreen.style.display = 'none';
      _hideAppLoader();
      Onboarding.show(function () {
        setAppState('app');
        if (typeof Router !== 'undefined') Router.showView('home');
      });
    } else {
      setAppState('app');
    }
    
    if (typeof NotificationManager !== 'undefined') {
      NotificationManager.init();
    }
    
    if (typeof InboxView !== 'undefined') {
      InboxView.init();
    }
  }

  /* ---- Reactive Auth Gate ---- */
  if (typeof Auth !== 'undefined' && typeof FirebaseApp !== 'undefined' && FirebaseApp.isReady()) {
    if (authScreen) authScreen.style.display = 'none';
    if (container) container.style.display = 'none';
    if (bottomNav) bottomNav.style.display = 'none';

    var _authTimeoutId = setTimeout(function () {
      if (_currentAppState === 'initializing') {
        console.warn('Firebase auth timeout — falling back to login screen.');
        setAppState('unauthenticated');
      }
    }, 8000);

    /* Bind to the single source of truth observer */
    Auth.onStateChange(function (user) {
      clearTimeout(_authTimeoutId);
      if (user) {

        startHydrationAndShowApp();
      } else {
        setAppState('unauthenticated');
      }
    });

    /* Initial state check */
    Auth.onAuthReady(function (user) {
      clearTimeout(_authTimeoutId);
      if (user) {

        startHydrationAndShowApp();
      }
      else setAppState('unauthenticated');
    });
  } else {
    _hideAppLoader();
    console.error('[AuthGate] Firebase unavailable.');
    setAppState('unauthenticated');
  }

    /* Login form handlers */
    var authSubmitBtn = document.getElementById('authSubmitBtn');
    var loginEmail = document.getElementById('loginEmail');
    var loginPassword = document.getElementById('loginPassword');
    var loginError = document.getElementById('loginError');
    var authTabs = document.querySelectorAll('.auth-tab');
    var registerFields = document.getElementById('registerFields');

    /* Password visibility toggle */
    var togglePasswordBtn = document.getElementById('togglePasswordVisibility');
    if (togglePasswordBtn && loginPassword) {
      togglePasswordBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var type = loginPassword.getAttribute('type') === 'password' ? 'text' : 'password';
        loginPassword.setAttribute('type', type);
        
        var showIcon = this.querySelector('.eye-icon-show');
        var hideIcon = this.querySelector('.eye-icon-hide');
        if (type === 'text') {
          if (showIcon) showIcon.style.display = 'none';
          if (hideIcon) hideIcon.style.display = 'block';
        } else {
          if (showIcon) showIcon.style.display = 'block';
          if (hideIcon) hideIcon.style.display = 'none';
        }
      });
    }

    function showError(msg) {
      if (loginError) {
        loginError.textContent = msg;
        loginError.style.display = 'block';
      }
    }

    function hideError() {
      if (loginError) {
        loginError.style.display = 'none';
      }
    }

    function _setLoading(loading) {
      if (!authSubmitBtn) return;
      authSubmitBtn.disabled = loading;
      if (loading) {
        authSubmitBtn.textContent = 'Please wait...';
      } else {
        var activeTab = document.querySelector('.auth-tab.active');
        authSubmitBtn.textContent = (activeTab && activeTab.getAttribute('data-mode') === 'register') ? 'Create Account' : 'Log In';
      }
    }

    var _isSignupMode = false;
    var loginCoachingId = document.getElementById('loginCoachingId');
    var coachingIdField = document.querySelector('.coaching-id-field');

    /* Tab Switching Logic (Event Delegation) */
    document.addEventListener('click', function(e) {
      var tab = e.target.closest('.auth-tab');
      if (!tab) return;
      e.preventDefault();

      var allTabs = document.querySelectorAll('.auth-tab');
      for (var j = 0; j < allTabs.length; j++) allTabs[j].classList.remove('active');
      tab.classList.add('active');

      var mode = tab.getAttribute('data-mode');
      var forgotRow = document.getElementById('forgotPasswordRow');
      if (mode === 'register') {
        _isSignupMode = true;
        if (registerFields) registerFields.style.display = 'block';
        if (forgotRow) forgotRow.style.display = 'none';
        if (authSubmitBtn) authSubmitBtn.textContent = 'Create Account';
      } else {
        _isSignupMode = false;
        if (registerFields) registerFields.style.display = 'none';
        if (forgotRow) forgotRow.style.display = 'block';
        if (authSubmitBtn) authSubmitBtn.textContent = 'Log In';
      }
      hideError();
      _resetAllValidation();
      _setLoading(false);
    });

    /* Forgot-password (ADR-041): emails a Firebase reset link. Enumeration-safe (success copy regardless). */
    var forgotBtn = document.getElementById('forgotPasswordBtn');
    if (forgotBtn) {
      forgotBtn.addEventListener('click', function () {
        var emailInput = document.getElementById('loginEmail');
        var email = emailInput ? emailInput.value : '';
        if (!email || email.indexOf('@') < 1) {
          if (emailInput) emailInput.focus();
          if (typeof showToast === 'function') showToast('Enter your email above first, then tap "Forgot password?".');
          else if (loginError) { loginError.textContent = 'Enter your email above first.'; loginError.style.display = 'block'; }
          return;
        }
        forgotBtn.disabled = true; var _orig = forgotBtn.textContent; forgotBtn.textContent = 'Sending…';
        Auth.resetPassword(email, function (err) {
          forgotBtn.disabled = false; forgotBtn.textContent = _orig;
          var msg = err ? err : 'If an account exists for that email, we just sent a reset link. Check your inbox (and spam).';
          if (typeof showToast === 'function') showToast(msg);
          else if (loginError) { loginError.textContent = msg; loginError.style.display = 'block'; }
        });
      });
    }

    /* ---- Realtime Validation System ---- */
    var _emailTouched = false;
    var _passwordTouched = false;
    var _emailDebounce = null;
    var _passwordDebounce = null;
    var _coachingDebounce = null;
    var passwordValidationEl = document.getElementById('passwordValidation');
    var coachingIdValidationEl = document.getElementById('coachingIdValidation');

    /**
     * Render validation results into a container element.
     * Shows checklist-style feedback with pass/fail indicators.
     */
    function _renderValidation(inputEl, containerEl, result, rules) {
      if (!containerEl) return;
      if (!result) {
        containerEl.className = 'login-field-validation';
        containerEl.innerHTML = '';
        if (inputEl) { inputEl.classList.remove('input-error', 'input-valid'); }
        return;
      }

      if (result.valid) {
        containerEl.className = 'login-field-validation active all-valid';
        containerEl.innerHTML = '<span class="val-summary">Looks good</span>';
        if (inputEl) {
          inputEl.classList.remove('input-error');
          inputEl.classList.add('input-valid');
        }
      } else {
        var html = '<ul>';
        for (var i = 0; i < rules.length; i++) {
          var r = rules[i];
          var passed = r.passed !== undefined ? r.passed : (typeof r.test === 'function' ? r.test() : false);
          html += '<li class="' + (passed ? 'val-pass' : 'val-error') + '">' + r.label + '</li>';
        }
        html += '</ul>';
        containerEl.className = 'login-field-validation active';
        containerEl.innerHTML = html;
        if (inputEl) {
          inputEl.classList.remove('input-valid');
          inputEl.classList.add('input-error');
        }
      }
    }

    function _resetFieldValidation(inputEl, containerEl) {
      if (containerEl) {
        containerEl.className = 'login-field-validation';
        containerEl.innerHTML = '';
      }
      if (inputEl) {
        inputEl.classList.remove('input-error', 'input-valid');
      }
    }

    function _validateEmailField() {
      if (!loginEmail) return;
      var val = loginEmail.value;
      if (!val) {
        loginEmail.classList.remove('input-error', 'input-valid');
        return;
      }
      var valid = typeof Auth !== 'undefined' ? Auth.validateEmail(val) : false;
      if (valid) {
        loginEmail.classList.remove('input-error');
        loginEmail.classList.add('input-valid');
      } else {
        loginEmail.classList.remove('input-valid');
        loginEmail.classList.add('input-error');
      }
    }

    function _validatePasswordField() {
      if (!loginPassword || !passwordValidationEl) return;
      var val = loginPassword.value;
      if (!val) {
        _resetFieldValidation(loginPassword, passwordValidationEl);
        return;
      }
      
      if (!_isSignupMode) {
        // Skip detailed validation rendering when logging in, just basic UI class
        if (val.length >= 6) {
          loginPassword.classList.remove('input-error');
          loginPassword.classList.add('input-valid');
        } else {
          loginPassword.classList.remove('input-valid');
          loginPassword.classList.add('input-error');
        }
        _resetFieldValidation(null, passwordValidationEl);
        return;
      }

      var result = typeof Auth !== 'undefined' ? Auth.validatePassword(val) : { valid: true, errors: [], rules: [] };

      // Render the validation checklist based on the rules array from AuthValidators
      if (result.rules && result.rules.length > 0) {
        _renderValidation(loginPassword, passwordValidationEl, result, result.rules);
      } else {
        // Fallback if rules are not returned (e.g. AuthValidators script failed to load)
        if (val.length >= 8) {
          loginPassword.classList.remove('input-error');
          loginPassword.classList.add('input-valid');
          _resetFieldValidation(null, passwordValidationEl);
        } else {
          loginPassword.classList.remove('input-valid');
          loginPassword.classList.add('input-error');
          _resetFieldValidation(null, passwordValidationEl);
        }
      }
    }

    /** Full state reset — clears all validation */
    function _resetAllValidation() {
      _emailTouched = false;
      _passwordTouched = false;
      if (_emailDebounce) clearTimeout(_emailDebounce);
      if (_passwordDebounce) clearTimeout(_passwordDebounce);
      if (_coachingDebounce) clearTimeout(_coachingDebounce);
      if (loginEmail) loginEmail.classList.remove('input-error', 'input-valid');
      if (loginCoachingId) loginCoachingId.classList.remove('input-error', 'input-valid');
      _resetFieldValidation(loginPassword, passwordValidationEl);
      _resetFieldValidation(loginCoachingId, coachingIdValidationEl);
    }

    /* ---- Submit Action ---- */
    function _handleAuthSubmit() {
        if (authSubmitBtn && authSubmitBtn.disabled) return;
        hideError();
        
        var email = loginEmail ? loginEmail.value.trim() : '';
        var password = loginPassword ? loginPassword.value : '';
        
        if (!_isSignupMode) {
            /* LOGIN FLOW */
            if (typeof Auth === 'undefined' || !Auth.login) {
              showError('Authentication service is currently unavailable. Please check your connection and refresh.');
              return;
            }

            _setLoading(true);
            
            var currentUser = typeof Auth !== 'undefined' && typeof Auth.getCurrentUser === 'function' ? Auth.getCurrentUser() : null;
            if (currentUser && currentUser.email === email) {
                console.warn('User is already logged in with these credentials, manually triggering hydration.');
                if (loginEmail) loginEmail.value = '';
                if (loginPassword) loginPassword.value = '';
                _resetAllValidation();
                startHydrationAndShowApp();
                return;
            }

            Auth.login(email, password, function (err) {
              if (err) {
                _setLoading(false);
                showError(err);
              } else {
                if (loginEmail) loginEmail.value = '';
                if (loginPassword) loginPassword.value = '';
                _resetAllValidation();
                /* Button remains disabled and says 'Please wait...' while onStateChange handles hydration transition */
                setTimeout(function() {
                  if (authSubmitBtn && authSubmitBtn.disabled && _currentAppState !== 'app') {
                    console.warn('Auth state transition timeout. Forcing hydration.');
                    startHydrationAndShowApp();
                  }
                }, 5000);
              }
            });
        } else {
            /* SIGNUP FLOW */
            var coachingId = loginCoachingId ? loginCoachingId.value.trim() : '';
            
            if (loginCoachingId && loginCoachingId.classList.contains('input-error')) {
              showError('Please enter a valid coaching code or leave it blank.');
              return;
            }
            
            if (typeof Auth === 'undefined' || !Auth.signup) {
              showError('Authentication service is currently unavailable. Please check your connection and refresh.');
              return;
            }

            _setLoading(true);
            Auth.signup(email, password, coachingId, function (err) {
              if (err) {
                _setLoading(false);
                showError(err);
                _validatePasswordField();
              } else {
                if (loginEmail) loginEmail.value = '';
                if (loginPassword) loginPassword.value = '';
                if (loginCoachingId) loginCoachingId.value = '';
                /* DO NOT trigger tab click; button MUST remain disabled while onStateChange handles transition */
                setTimeout(function() {
                  if (authSubmitBtn && authSubmitBtn.disabled && _currentAppState !== 'app') {
                    console.warn('Auth state transition timeout. Forcing hydration.');
                    startHydrationAndShowApp();
                  }
                }, 5000);
              }
            });
        }
    }

    if (authSubmitBtn) {
      /* Standard click event matching Coaching Admin App reference architecture */
      authSubmitBtn.addEventListener('click', function (e) {
        e.preventDefault();
        _handleAuthSubmit();
      });
    }

    /* ---- Validation Listeners ---- */

    /* Email: validate on blur, then on debounced input after first blur */
    if (loginEmail) {
      loginEmail.addEventListener('blur', function () {
        if (!loginEmail.value) return;
        _emailTouched = true;
        _validateEmailField();
      });
      loginEmail.addEventListener('input', function () {
        if (!_emailTouched) return;
        if (_emailDebounce) clearTimeout(_emailDebounce);
        _emailDebounce = setTimeout(_validateEmailField, 400);
      });
    }

    /* Password: validate on blur, then on debounced input after first blur */
    if (loginPassword) {
      loginPassword.addEventListener('blur', function () {
        if (!loginPassword.value) return;
        _passwordTouched = true;
        _validatePasswordField();
      });
      loginPassword.addEventListener('input', function () {
        if (!_passwordTouched) return;
        if (_passwordDebounce) clearTimeout(_passwordDebounce);
        _passwordDebounce = setTimeout(_validatePasswordField, 400);
      });
    }

    /* Coaching ID: debounced validation via API */
    function _validateCoachingIdField() {
      if (!loginCoachingId || !coachingIdValidationEl) return;
      var val = loginCoachingId.value.trim();
      if (!val) {
        _resetFieldValidation(loginCoachingId, coachingIdValidationEl);
        return;
      }
      if (!_isSignupMode) return;

      if (_coachingDebounce) clearTimeout(_coachingDebounce);
      _coachingDebounce = setTimeout(function() {
        fetch('/api/validate-coaching?id=' + encodeURIComponent(val))
          .then(function(res) { return res.json(); })
          .then(function(data) {
            /* Inline escape (no load-order assumption on the global escapeHtml). */
            function _esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]; }); }
            if (data && data.valid) {
              /* Trust signal (ADR-030): confirm WHICH institute ("Connected to <name>"), with the logo when
                 the coaching has set one (coachings.logoUrl) — a stronger join confirmation than "valid". */
              var nm = data.name ? ('Connected to ' + _esc(data.name)) : 'Valid coaching code';
              var sc = (typeof data.studentCount === 'number' && data.studentCount > 0) ? (' · ' + data.studentCount + ' students') : '';
              var logo = (typeof data.logoUrl === 'string' && /^https:\/\//i.test(data.logoUrl))
                ? '<img class="coaching-join-logo" src="' + _esc(data.logoUrl) + '" alt="" onerror="this.style.display=\'none\'" /> ' : '';
              coachingIdValidationEl.className = 'login-field-validation active all-valid';
              /* The ✓ is supplied by .val-summary::before — don't add a literal one (would double it). */
              coachingIdValidationEl.innerHTML = '<span class="val-summary">' + logo + nm + sc + '</span>';
              loginCoachingId.classList.remove('input-error');
              loginCoachingId.classList.add('input-valid');
            } else {
              var msg = (data && data.reason === 'suspended') ? 'This institute is suspended — contact them.'
                : (data && data.reason === 'deleted') ? 'This institute is no longer active.'
                : 'Code not found.';
              coachingIdValidationEl.className = 'login-field-validation active';
              coachingIdValidationEl.innerHTML = '<ul><li class="val-error">' + msg + '</li></ul>';
              loginCoachingId.classList.remove('input-valid');
              loginCoachingId.classList.add('input-error');
            }
          })
          .catch(function(err) {
            coachingIdValidationEl.className = 'login-field-validation active';
            coachingIdValidationEl.innerHTML = '<ul><li class="val-error">Could not verify code</li></ul>';
          });
      }, 500);
    }

    if (loginCoachingId) {
      loginCoachingId.addEventListener('input', function () {
        _validateCoachingIdField();
      });
    }

    /* Allow Enter key to submit */
    if (loginPassword) {
      loginPassword.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (authSubmitBtn) authSubmitBtn.click();
        }
      });
    }
    if (loginEmail) {
      loginEmail.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (loginPassword) loginPassword.focus();
        }
      });
    }

  /* ---- Bottom nav click handlers ---- */
  var navLinks = document.querySelectorAll('.bottom-nav a');
  for (var i = 0; i < navLinks.length; i++) {
    /* Clean up tab-pop class after animation finishes */
    (function (link) {
      var icon = link.querySelector('.nav-icon img') || link.querySelector('.nav-icon .nav-emoji');
      if (icon) {
        icon.removeEventListener('animationend', _handleTabPopAnimationEnd);
        icon.addEventListener('animationend', _handleTabPopAnimationEnd);
      }
    })(navLinks[i]);

    navLinks[i].addEventListener('click', function (e) {
      e.preventDefault();
      if (!_tryBeginNavTransition()) return;
      var view = this.getAttribute('data-view');
      /* Skip if already on this tab and no drill is active and no stale results overlay */
      var _dc_check = document.getElementById('drillContainer');
      var _hasStaleResults = _dc_check && (_dc_check.classList.contains('drill-results-active') || _dc_check.style.display !== 'none');
      if (this.classList.contains('active') && !_drillSessionActive && !_hasStaleResults) return;
      /* Cleanup any active drill engine when navigating away */
      if (_activeDrillEngine) {
        _activeDrillEngine.cleanup();
        _activeDrillEngine = null;
      }
      /* Clear stale drill results overlay (fullscreen fixed z-index layer) */
      var _dc = document.getElementById('drillContainer');
      if (_dc) {
        _dc.classList.remove('drill-results-active');
        _dc.style.display = 'none';
      }
      /* End any active Firestore batch */
      if (_drillSessionActive && typeof FirestoreSync !== 'undefined') {
        FirestoreSync.endDrillBatch();
      }
      _exitDrillSession();
      /* Close any open info modals */
      _closeAllInfoModals();
      SoundEngine.play('tabSwitch');
      triggerHaptic(10);
      /* Trigger icon pop animation (works for both img and emoji) */
      var iconEl = this.querySelector('.nav-icon img') || this.querySelector('.nav-icon .nav-emoji');
      if (iconEl) {
        iconEl.classList.remove('tab-pop');
        void iconEl.offsetWidth; /* force reflow to restart animation */
        iconEl.classList.add('tab-pop');
      }
      Router.showView(view);
    });
  }

  /* NOTE: popstate drill-session handling has been consolidated into Router.init()
     to prevent double-firing of popstate handlers. See router.js. */


  /* ---- Initialize view modules ---- */
  /* Home view: stats rendering, quick links, warmup handler */
  if (typeof initHomeView === 'function') initHomeView();

  /* Practice view: mode selection, drill launching */
  if (typeof initPracticeView === 'function') initPracticeView();

  /* Learn view: lazy init on first show */
  var _learnInitialized = false;
  Router.onShow('learn', function () {
    if (!_learnInitialized) {
      initLearnView();
      _learnInitialized = true;
    }
  });

  /* Duel is now in its own dedicated view — no active duel check needed on practice */

  /* Stats view: render on every show */
  Router.onShow('stats', renderStatsView);

  /* Settings view: init on every show */
  Router.onShow('settings', initSettingsView);

  /* ---- Initialize swipe navigation ---- */
  initSwipeNavigation();
});
