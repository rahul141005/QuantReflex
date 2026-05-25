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

/* ---- Initialize Firebase ---- */
(function () {
  if (typeof FirebaseApp !== 'undefined') {
    FirebaseApp.init();
  }
})();

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
  document.body.classList.add('loaded');

  var loginScreen = document.getElementById('loginScreen');
  var container = document.querySelector('.container');
  var bottomNav = document.querySelector('.bottom-nav');
  var _authRequestInFlight = false;
  var _authViewToken = 0;

  /**
   * Show the main app and hide the login screen.
   * Loads data from Firestore and initializes the app.
   * Onboarding is checked before revealing the main app UI
   * to prevent the main interface from flashing before onboarding.
   */
  function showApp() {
    _authViewToken++;
    var token = _authViewToken;
    var expectedUserId = (typeof Auth !== 'undefined' && typeof Auth.getUserId === 'function') ? Auth.getUserId() : null;
    if (loginScreen) loginScreen.style.display = 'none';

    /* Load data from Firestore after authentication */
    if (typeof FirestoreSync !== 'undefined' && typeof FirebaseApp !== 'undefined' && FirebaseApp.isReady() && FirebaseApp.getUserId()) {
      FirestoreSync.loadFromFirestore(function (success) {
        if (token !== _authViewToken) return;
        var currentUserId = (typeof Auth !== 'undefined' && typeof Auth.getUserId === 'function') ? Auth.getUserId() : null;
        if (expectedUserId && currentUserId !== expectedUserId) return;
        if (success) {
          /* Re-apply dark mode and theme in case Firestore had updated settings */
          try {
            var s = JSON.parse(localStorage.getItem('quant_reflex_settings') || '{}');
            document.body.classList.toggle('dark-mode', !!s.darkMode);
            if (typeof applyTheme === 'function') applyTheme(s.theme || 'classic');
          } catch (_) { /* ignore */ }
        }
        /* Check onboarding BEFORE showing main UI */
        _launchOnboardingOrShowMain();
      });
    } else {
      if (token !== _authViewToken) return;
      var currentUserId = (typeof Auth !== 'undefined' && typeof Auth.getUserId === 'function') ? Auth.getUserId() : null;
      if (expectedUserId && currentUserId !== expectedUserId) return;
      /* No Firestore — check onboarding immediately */
      _launchOnboardingOrShowMain();
    }
  }

  /**
   * Check onboarding: if needed, show it first (main UI stays hidden).
   * After onboarding completes, reveal the main app.
   * If no onboarding needed, reveal immediately.
   */
  function _launchOnboardingOrShowMain() {
    if (typeof Onboarding !== 'undefined' && Onboarding.shouldShow()) {
      Onboarding.show(function () {
        _revealMainApp();
        Router.showView('learn');
      });
    } else {
      _revealMainApp();
    }

    /* Initialize notification scheduling if enabled */
    if (typeof NotificationManager !== 'undefined') {
      NotificationManager.init();
    }
  }

  /**
   * Reveal the main app container and bottom nav.
   * Re-render the current view to reflect loaded data.
   */
  function _revealMainApp() {
    _hideAppLoader();
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    if (container) container.style.display = '';
    if (bottomNav) bottomNav.style.display = '';
    /* Apply correct navigation icons for the current theme */
    try {
      var s = JSON.parse(localStorage.getItem('quant_reflex_settings') || '{}');
      updateNavigationIcons(s.theme || 'classic');
    } catch (_) {
      updateNavigationIcons('classic');
    }
    /* Re-render current view to reflect loaded data.
       Fall back to 'home' if Router hasn't initialized yet —
       Router.showView safely handles unknown views by defaulting to home. */
    var currentView = Router.getCurrentView() || 'home';
    Router.showView(currentView);

    /* Initialize Math Duel invitation listener + reconnection (V2) */
    if (typeof DuelManager !== 'undefined' && typeof DuelManager.init === 'function') {
      DuelManager.init();
    }
  }

  /**
   * Show the login screen and hide the main app.
   */
  function showLogin() {
    _authViewToken++;
    _hideAppLoader();
    _authRequestInFlight = false;
    if (loginScreen) loginScreen.style.display = 'flex';
    if (container) container.style.display = 'none';
    if (bottomNav) bottomNav.style.display = 'none';
  }

  /* ---- Auth Gate ---- */
  if (typeof Auth !== 'undefined' && typeof FirebaseApp !== 'undefined' && FirebaseApp.isReady()) {
    /* Keep everything hidden until auth state is determined.
       This prevents the login screen from flashing for authenticated users. */
    if (loginScreen) loginScreen.style.display = 'none';
    if (container) container.style.display = 'none';
    if (bottomNav) bottomNav.style.display = 'none';

    var _authResolved = false;
    /* Fallback: if Firebase auth doesn't respond within 8 seconds, show login.
       Cold starts with cached credentials can take 3-6s on slow networks. */
    var _authTimeoutId = setTimeout(function () {
      if (!_authResolved) {
        _authResolved = true;
        console.warn('Firebase auth timeout — falling back to login screen.');
        showLogin();
      }
    }, 8000);

    Auth.onAuthReady(function (user) {
      if (_authResolved) {
        /* Late resolution: if we timed out and showed login, but Firebase
           now confirms the user is logged in, smoothly transition to the app
           instead of leaving them stranded on the login screen. */
        if (user) {
          console.log('Firebase auth resolved late with user, transitioning to app.');
          showApp();
        }
        return;
      }
      _authResolved = true;
      clearTimeout(_authTimeoutId);
      if (user) {
        showApp();
      } else {
        showLogin();
      }
    });

    /* Login form handlers */
    var loginBtn = document.getElementById('loginBtn');
    var signupBtn = document.getElementById('signupBtn');
    var loginUsername = document.getElementById('loginUsername');
    var loginPassword = document.getElementById('loginPassword');
    var loginError = document.getElementById('loginError');

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

    function setButtonsDisabled(disabled) {
      if (loginBtn) loginBtn.disabled = disabled;
      if (signupBtn) signupBtn.disabled = disabled;
    }

    /* Track whether user is in signup mode (vs login mode) */
    var _isSignupMode = false;
    var loginCoachingId = document.getElementById('loginCoachingId');
    var coachingIdField = document.getElementById('coachingIdField');

    /* ---- Realtime Validation System ---- */
    var _usernameTouched = false;
    var _passwordTouched = false;
    var _usernameDebounce = null;
    var _passwordDebounce = null;
    var _availabilityDebounce = null;
    var _lastAvailabilityCheck = ''; /* prevent duplicate Firestore queries */
    var usernameValidationEl = document.getElementById('usernameValidation');
    var passwordValidationEl = document.getElementById('passwordValidation');
    var usernamePreviewEl = document.getElementById('usernamePreview');

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
          var passed = r.test();
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

    /** Update normalized username preview */
    function _updateUsernamePreview(rawVal) {
      if (!usernamePreviewEl) return;
      if (!rawVal || !rawVal.trim()) {
        usernamePreviewEl.className = 'login-username-preview';
        usernamePreviewEl.innerHTML = '';
        return;
      }
      var clean = typeof Auth !== 'undefined' ? Auth.sanitizeUsername(rawVal) : rawVal.toLowerCase().trim();
      if (!clean) {
        usernamePreviewEl.className = 'login-username-preview';
        usernamePreviewEl.innerHTML = '';
        return;
      }
      usernamePreviewEl.className = 'login-username-preview active';
      usernamePreviewEl.innerHTML = '<span class="preview-label">Your username: </span><span class="preview-username">' + clean + '</span>';
    }

    /** Reset username preview */
    function _resetUsernamePreview() {
      if (usernamePreviewEl) {
        usernamePreviewEl.className = 'login-username-preview';
        usernamePreviewEl.innerHTML = '';
      }
    }

    /** Check username availability via Firestore (debounced, only after local validation passes) */
    function _checkAvailability() {
      if (!loginUsername) return;
      var raw = loginUsername.value;
      var clean = typeof Auth !== 'undefined' ? Auth.sanitizeUsername(raw) : raw.toLowerCase().trim();

      /* Only check if local validation passed */
      var result = typeof Auth !== 'undefined' ? Auth.validateUsername(raw) : { valid: true, errors: [] };
      if (!result.valid || !clean || clean.length < 4) {
        _lastAvailabilityCheck = '';
        _hideAvailability();
        return;
      }

      /* Skip if same username was already checked */
      if (clean === _lastAvailabilityCheck) return;
      _lastAvailabilityCheck = clean;

      /* Show checking state */
      _showAvailability('checking', '<span class="duel-search-spinner"></span> Checking availability...');

      if (typeof DuelCore !== 'undefined' && typeof DuelCore.checkUsernameAvailability === 'function') {
        DuelCore.checkUsernameAvailability(clean, function (err, availResult) {
          /* Discard stale result if username changed while checking */
          var currentClean = typeof Auth !== 'undefined' ? Auth.sanitizeUsername(loginUsername.value) : loginUsername.value.toLowerCase().trim();
          if (currentClean !== clean) return;

          if (availResult && availResult.available) {
            _showAvailability('available', 'Username available');
          } else {
            _showAvailability('taken', 'Username is already taken');
          }
        });
      }
    }

    function _showAvailability(state, html) {
      if (!usernameValidationEl) return;
      var avail = usernameValidationEl.parentNode.querySelector('.login-username-availability');
      if (!avail) {
        avail = document.createElement('div');
        avail.className = 'login-username-availability';
        /* Insert after validation, before preview */
        if (usernamePreviewEl) {
          usernameValidationEl.parentNode.insertBefore(avail, usernamePreviewEl);
        } else {
          usernameValidationEl.parentNode.appendChild(avail);
        }
      }
      avail.className = 'login-username-availability active ' + state;
      avail.innerHTML = html;
    }

    function _hideAvailability() {
      if (!usernameValidationEl) return;
      var avail = usernameValidationEl.parentNode.querySelector('.login-username-availability');
      if (avail) {
        avail.className = 'login-username-availability';
        avail.innerHTML = '';
      }
    }

    function _validateUsernameField() {
      if (!loginUsername || !usernameValidationEl) return;
      var val = loginUsername.value;

      /* Update preview on every validation */
      _updateUsernamePreview(val);

      if (!val) {
        _resetFieldValidation(loginUsername, usernameValidationEl);
        _hideAvailability();
        _lastAvailabilityCheck = '';
        return;
      }
      var clean = typeof Auth !== 'undefined' ? Auth.sanitizeUsername(val) : val.toLowerCase().trim();
      var result = typeof Auth !== 'undefined' ? Auth.validateUsername(val) : { valid: true, errors: [] };

      var rules = [
        { label: 'At least 4 characters', test: function () { return clean.length >= 4; } },
        { label: '30 characters or less', test: function () { return clean.length <= 30; } },
        { label: 'Contains at least one letter', test: function () { return /[a-z]/.test(clean); } },
        { label: 'Contains at least one number', test: function () { return /[0-9]/.test(clean); } }
      ];

      _renderValidation(loginUsername, usernameValidationEl, result, rules);

      /* Trigger availability check if local validation passed */
      if (result.valid) {
        if (_availabilityDebounce) clearTimeout(_availabilityDebounce);
        _availabilityDebounce = setTimeout(_checkAvailability, 800);
      } else {
        _hideAvailability();
        _lastAvailabilityCheck = '';
      }
    }

    function _validatePasswordField() {
      if (!loginPassword || !passwordValidationEl) return;
      var val = loginPassword.value;
      if (!val) {
        _resetFieldValidation(loginPassword, passwordValidationEl);
        return;
      }
      var result = typeof Auth !== 'undefined' ? Auth.validatePassword(val) : { valid: true, errors: [] };

      var rules = [
        { label: 'At least 8 characters', test: function () { return val.length >= 8; } },
        { label: 'One uppercase letter', test: function () { return /[A-Z]/.test(val); } },
        { label: 'One lowercase letter', test: function () { return /[a-z]/.test(val); } },
        { label: 'One number', test: function () { return /[0-9]/.test(val); } }
      ];

      _renderValidation(loginPassword, passwordValidationEl, result, rules);
    }

    /** Full state reset — clears all validation, preview, availability */
    function _resetAllValidation() {
      _usernameTouched = false;
      _passwordTouched = false;
      _lastAvailabilityCheck = '';
      if (_usernameDebounce) clearTimeout(_usernameDebounce);
      if (_passwordDebounce) clearTimeout(_passwordDebounce);
      if (_availabilityDebounce) clearTimeout(_availabilityDebounce);
      _resetFieldValidation(loginUsername, usernameValidationEl);
      _resetFieldValidation(loginPassword, passwordValidationEl);
      _resetUsernamePreview();
      _hideAvailability();
    }

    /** Show coaching ID field with animation */
    function _showCoachingId() {
      if (coachingIdField) {
        coachingIdField.classList.add('coaching-visible');
      }
    }

    /** Hide coaching ID field */
    function _hideCoachingId() {
      if (coachingIdField) {
        coachingIdField.classList.remove('coaching-visible');
        coachingIdField.style.display = 'none';
      }
    }

    /* ---- Login Button ---- */
    if (loginBtn) {
      loginBtn.addEventListener('click', function () {
        if (_authRequestInFlight) return;
        hideError();
        /* If switching from signup mode back to login, clear everything */
        if (_isSignupMode) {
          _isSignupMode = false;
          _resetAllValidation();
          _hideCoachingId();
        }
        var username = loginUsername ? loginUsername.value : '';
        var password = loginPassword ? loginPassword.value : '';
        _authRequestInFlight = true;
        setButtonsDisabled(true);

        Auth.login(username, password, function (err) {
          _authRequestInFlight = false;
          setButtonsDisabled(false);
          if (err) {
            showError(err);
          } else {
            if (loginUsername) loginUsername.value = '';
            if (loginPassword) loginPassword.value = '';
            _resetAllValidation();
            showApp();
          }
        });
      });
    }

    /* ---- Signup Button ---- */
    if (signupBtn) {
      signupBtn.addEventListener('click', function () {
        if (_authRequestInFlight) return;
        hideError();
        
        /* Enter signup mode — reveals coaching ID */
        if (!_isSignupMode) {
          _isSignupMode = true;
          _showCoachingId();
          return;
        }

        var username = loginUsername ? loginUsername.value : '';
        var password = loginPassword ? loginPassword.value : '';
        var coachingId = loginCoachingId ? loginCoachingId.value.trim() : '';

        _authRequestInFlight = true;
        setButtonsDisabled(true);

        function _proceedWithSignup() {
          Auth.signup(username, password, coachingId, function (err) {
            _authRequestInFlight = false;
            setButtonsDisabled(false);
            if (err) {
              showError(err);
              /* Trigger full validation display after a failed signup attempt */
              _usernameTouched = true;
              _passwordTouched = true;
              _validateUsernameField();
              _validatePasswordField();
            } else {
              /* Server now atomically links the coaching ID. No client-side sync required. */
              if (loginUsername) loginUsername.value = '';
              if (loginPassword) loginPassword.value = '';
              if (loginCoachingId) loginCoachingId.value = '';
              _isSignupMode = false;
              _resetAllValidation();
              _hideCoachingId();
              showApp();
            }
          });
        }

        /* If a coaching ID is provided, validate it first via our unauthenticated endpoint */
        if (coachingId) {
          fetch('/api/validate-coaching?id=' + encodeURIComponent(coachingId))
            .then(function(res) { return res.json(); })
            .then(function(data) {
              if (data && data.valid) {
                _proceedWithSignup();
              } else {
                _authRequestInFlight = false;
                setButtonsDisabled(false);
                showError('This Coaching ID does not exist or is inactive.');
              }
            })
            .catch(function(err) {
              _authRequestInFlight = false;
              setButtonsDisabled(false);
              showError('Could not verify Coaching ID. Please check your connection.');
            });
        } else {
          _proceedWithSignup();
        }
      });
    }

    /* ---- Validation Listeners ---- */
    /* Validation activates on first meaningful input — no mode flag required.
       The user feels guided immediately, not punished after submit. */

    /* Username: validate on blur, then on debounced input after first blur */
    if (loginUsername) {
      loginUsername.addEventListener('blur', function () {
        if (!loginUsername.value) return;
        _usernameTouched = true;
        _validateUsernameField();
      });
      loginUsername.addEventListener('input', function () {
        /* Always update preview as user types */
        _updateUsernamePreview(loginUsername.value);
        /* Only show validation checklist after first blur */
        if (!_usernameTouched) return;
        if (_usernameDebounce) clearTimeout(_usernameDebounce);
        _usernameDebounce = setTimeout(_validateUsernameField, 400);
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

    /* Allow Enter key to submit login */
    if (loginPassword) {
      loginPassword.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (loginBtn) loginBtn.click();
        }
      });
    }
    if (loginUsername) {
      loginUsername.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (loginPassword) loginPassword.focus();
        }
      });
    }

  } else {
    /* Firebase not available — show app directly (localStorage only mode) */
    _hideAppLoader();
    if (loginScreen) loginScreen.style.display = 'none';
    _launchOnboardingOrShowMain();
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

  /* ---- Initialize router ---- */
  Router.init();
});
