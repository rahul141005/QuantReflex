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
  try {
    var _updateKey = 'updateToastShown_' + (typeof CACHE_NAME !== 'undefined' ? CACHE_NAME : 'unknown');
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
    console.error('Missing custom confirm dialog elements.');
    onConfirm();
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

  /* ---- Initialize Auth and App Shell Boot Sequence ---- */
  if (typeof Auth !== 'undefined' && typeof FirebaseApp !== 'undefined' && FirebaseApp.isReady()) {
    Auth.init(function (user) {
      if (user) {
        /* User logged in. Wait for Firestore sync then show app/onboarding */
        if (typeof FirestoreSync !== 'undefined') {
          FirestoreSync.loadFromFirestore(function (success) {
            _launchOnboardingOrShowMain();
          });
        } else {
          _launchOnboardingOrShowMain();
        }
      } else {
        /* User logged out */
        _hideAppLoader();
        Auth.showAuthScreen();
      }
    });
  } else {
    _hideAppLoader();
    console.error('[App] Firebase unavailable.');
    if (typeof Auth !== 'undefined') {
      Auth.showAuthScreen();
    } else {
      /* Fallback if even Auth is missing */
      var authScreen = document.getElementById('authScreen');
      if (authScreen) authScreen.style.display = 'flex';
    }
  }

  function _launchOnboardingOrShowMain() {
    /* Apply dark mode/theme from settings before showing */
    try {
      var s = JSON.parse(localStorage.getItem('quant_reflex_settings') || '{}');
      document.body.classList.toggle('dark-mode', !!s.darkMode);
      if (typeof applyTheme === 'function') applyTheme(s.theme || 'classic');
      updateNavigationIcons(s.theme || 'classic');
    } catch (_) { 
      updateNavigationIcons('classic');
    }

    if (typeof Onboarding !== 'undefined' && Onboarding.shouldShow()) {
      Auth.hideAuthScreen();
      _hideAppLoader();
      Onboarding.show(function () {
        Auth.showAppShell();
        _initializeAppState();
        if (typeof Router !== 'undefined') Router.showView('learn');
      });
    } else {
      _hideAppLoader();
      Auth.showAppShell();
      _initializeAppState();
    }
  }

  function _initializeAppState() {
    if (typeof NotificationManager !== 'undefined') {
      NotificationManager.init();
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

  /* ---- Cleanup drill engine on back/forward navigation ---- */
  window.addEventListener('popstate', function (e) {
    /* Close any open info modals on navigation */
    _closeAllInfoModals();
    if (_drillSessionActive) {
      /* Push history state back to prevent the browser from actually navigating away.
         This must happen before the dialog to keep the URL stable. */
      history.pushState({ view: 'practice' }, '', '#practice');

      showExitSessionDialog(function () {
        if (_activeDrillEngine) {
          _activeDrillEngine.cleanup();
          _activeDrillEngine = null;
        }
        /* Clear stale drill results overlay */
        var _dc = document.getElementById('drillContainer');
        if (_dc) {
          _dc.classList.remove('drill-results-active');
          _dc.style.display = 'none';
        }
        /* End Firestore batch that was started when session began */
        if (typeof FirestoreSync !== 'undefined') {
          FirestoreSync.endDrillBatch();
        }
        _exitDrillSession();
        Router.showView('practice');
      });
      /* If cancelled, session continues — dialog closes without action */
      return;
    }
    if (_activeDrillEngine) {
      _activeDrillEngine.cleanup();
      _activeDrillEngine = null;
    }
    /* Clear stale drill results overlay on non-session popstate too */
    var _dc2 = document.getElementById('drillContainer');
    if (_dc2) {
      _dc2.classList.remove('drill-results-active');
      _dc2.style.display = 'none';
    }
    _exitDrillSession();
  });


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

  /* Router.onShow now supports multiple callbacks per view, so this is safe to add
     alongside the main practice cleanup callback registered in initPracticeView(). */
  Router.onShow('practice', function() { if (typeof DuelManager !== 'undefined') DuelManager.checkActiveDuel(); });

  /* Stats view: render on every show */
  Router.onShow('stats', renderStatsView);

  /* Settings view: init on every show */
  Router.onShow('settings', initSettingsView);

  /* ---- Initialize swipe navigation ---- */
  initSwipeNavigation();
});
