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

/* ---- Detect runtime mode (browser tab vs installed PWA vs Play TWA) ----
   ADR-142 (WS1): the detection itself moved to js/platform.js, THE single source of platform truth.
   It used to live here as one of three drifting copies, and none of them could tell an installed PWA
   from a Play-store TWA — which matters because a TWA satisfies the installed-app media query, would
   classify as `pwa-mode`, and a `pwa-mode` build offers Razorpay. Charging for digital goods inside a
   Play app through anything but Play Billing is the one unrecoverable Play-policy violation.
   `twa-mode` is ADDITIVE: a TWA still carries `pwa-mode` too, so every existing installed-app rule
   keeps working unchanged. */
(function () {
  if (window.QRPlatform && typeof window.QRPlatform.applyModeClasses === 'function') {
    window.QRPlatform.applyModeClasses();
    return;
  }
  /* Fail-safe if platform.js failed to load: classify as a plain web tab. Deliberately the SAFE
     direction — a web tab shows Razorpay, which is correct outside a Play build, and the Play build
     is additionally protected server-side. */
  console.error('[app] QRPlatform missing — platform.js must load before app.js');
  document.documentElement.classList.add('web-mode');
  document.body.classList.add('web-mode');
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
    var settings = (typeof AppState !== 'undefined') ? AppState.getSettings() : JSON.parse(localStorage.getItem('quant_reflex_settings') || '{}');
    /* Appearance (ADR-091): System/Light/Dark resolved by settings.js's resolveDarkMode (loads
       before app.js); the darkMode boolean remains the guarded fallback. */
    var _dark = (typeof resolveDarkMode === 'function') ? resolveDarkMode(settings) : !!settings.darkMode;
    /* Theme classes live on <html> (lockstep with the pre-paint head script); every selector keys off
       html.* — the transitional body mirror was removed once nothing consumed it. Use toggle so the
       ELSE branch clears any stale pre-paint class. */
    document.documentElement.classList.toggle('dark-mode', _dark);
    if (settings.reducedMotion) document.body.classList.add('reduced-motion');
    /* ADR-137: this used to derive the theme itself (`settings.theme === 'playful'`), which made it one
       of three ungated boot paths — a lapsed subscription kept rendering the premium theme forever.
       applyTheme() is the single enforcement point now; at this moment entitlement is still unknown
       (Firestore has not hydrated), so it renders from the fail-closed hint and persists nothing. */
    if (typeof applyTheme === 'function') applyTheme(settings.theme);
    else document.documentElement.classList.remove('theme-playful');   /* fail closed */
    if (typeof _syncThemeColor === 'function') _syncThemeColor(_dark);
    /* Languages (ADR-111): applied with the other appearance state so static chrome is already
       localized before first paint completes (the inline head script covered <html lang> pre-paint). */
    if (typeof QRI18n !== 'undefined') QRI18n.init(settings);
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
  var RIPPLE_SELECTORS = '.btn, .mode-card, .category-btn, .study-card, .table-select-btn, .clear-option-btn, .quick-link-option, .bottom-nav a';

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
    var settings = (typeof AppState !== 'undefined') ? AppState.getSettings() : JSON.parse(localStorage.getItem('quant_reflex_settings') || '{}');
    if (settings.vibration === false) return;
    if (typeof navigator.vibrate !== 'function') return;
    navigator.vibrate(pattern || 10);
  } catch (_) { /* ignore */ }
}

/* Numpad key press visual feedback moved to js/ui/numpad.js */

/* ---- Error ring-buffer (ADR-096) ----
   Bounded capture of the most recent uncaught errors + promise rejections. ReportContext attaches this
   ring to every report so a bug report carries the JS errors that led up to it (replacing screenshots as
   the debugging aid). Never throws; capped at 10 so it can't grow unbounded. Exposed as window.getRecentErrors. */
(function () {
  var MAX = 10;
  var ring = [];
  window.__qrErrors = ring;
  function push(msg) {
    try {
      if (!msg) return;
      ring.push({ msg: String(msg).slice(0, 500), at: Date.now() });
      if (ring.length > MAX) ring.shift();
    } catch (_) { /* never let logging break the app */ }
  }
  window.getRecentErrors = function () { return ring.slice(-MAX); };
  window.addEventListener('error', function (event) {
    try {
      var m = event && event.message ? event.message : 'error';
      if (event && event.filename) m += ' @ ' + event.filename + ':' + (event.lineno || 0);
      push(m);
    } catch (_) {}
  });
  window.__qrPushError = push;   /* seam for modules that want to record a handled error into the ring */
})();

/* ---- Global error handling for unhandled promise rejections ---- */
window.addEventListener('unhandledrejection', function (event) {
  console.warn('Unhandled promise rejection:', event.reason);
  /* ADR-096: mirror into the report error ring so it shows up in the auto-context. */
  try {
    var r = event && event.reason;
    var m = r && r.message ? r.message : String(r);
    if (window.__qrPushError) window.__qrPushError('unhandledrejection: ' + m);
  } catch (_) {}
  /* NOTE: event.preventDefault() intentionally removed to preserve error
     visibility in console and external monitoring tools (e.g. Sentry). */
});

/* ---- Service Worker + in-app update (ADR-102: unified via the shared QRUpdateManager) ----
   All the mechanics live in the shared module; this file only supplies the main app's PRESENTATION
   (the update toast + the success toast). */
if (typeof QRUpdateManager !== 'undefined') {
  QRUpdateManager.init({
    swUrl: './service-worker.js',
    appKey: 'qr',
    onUpdateAvailable: function (shouldToast) { if (shouldToast) _showUpdateToast(); },
    onUpdated: function () { if (typeof showToast === 'function') showToast(QRI18n.t('app.updated')); }
  });
}

/* Presentation only: the shared module already deduped (once per version/day) before calling us. */
function _showUpdateToast() {
  if (document.getElementById('_swUpdateToast')) return;

  // ADR-066: the update-available prompt is a LOCAL UI affordance, NOT a notification. It stays a toast
  // and is never written to the Inbox. A real "new version" Inbox notification, when wanted, is sent
  // through the server pipeline (super-admin broadcast, category system).

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
  toast.textContent = QRI18n.t('app.updateAvailable');
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
  var _t = function (k) { return (typeof QRI18n !== 'undefined') ? QRI18n.t(k) : null; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]; }); };
  /* UI Phase 1 / M3: routed through the shared confirm (scroll-lock + Escape + focus-trap + focus-restore),
     replacing the hand-wired reuse of #clearConfirmModal. */
  if (typeof QROverlay !== 'undefined' && QROverlay.confirm) {
    QROverlay.confirm({
      danger: true,
      title: _t('modals.confirmTitle') || 'Confirm',
      body: '<p>' + esc(msg) + '</p>',
      cancelText: _t('modals.cancel') || 'Cancel',
      confirmText: _t('modals.delete') || 'Delete',
      onConfirm: onConfirm
    });
    return;
  }
  /* Fallback (no QROverlay — e.g. an isolated harness): the original static-modal path. */
  var modal = document.getElementById('clearConfirmModal');
  var textEl = document.getElementById('clearConfirmText');
  var cancelBtn = document.getElementById('clearConfirmCancel');
  var okBtn = document.getElementById('clearConfirmOk');
  if (!modal || !textEl || !cancelBtn || !okBtn) { console.error('Missing custom confirm dialog elements — action blocked for safety.'); return; }
  textEl.textContent = msg;
  modal.style.display = 'flex';
  function close() { modal.style.display = 'none'; cancelBtn.onclick = null; okBtn.onclick = null; modal.onclick = null; }
  cancelBtn.onclick = function () { close(); };
  okBtn.onclick = function () { close(); onConfirm(); };
  modal.onclick = function (e) { if (e.target === modal) close(); };
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
/**
 * Format a raw category key into a human-readable label.
 * @param {string} key - raw category key (e.g. 'time-and-work')
 * @returns {string} formatted label (e.g. 'Time & Work')
 */
function formatCategoryName(key) {
  if (!key) return '-';
  /* ADR-111: localized display name first. The canonical English maps below stay untouched (they
     are lockstep-checked sources of truth); translation is a display layer keyed by the stable
     category id — `categories.<key>` in the active App-language catalog. Falls through to English
     whenever the key isn't translated or i18n is off. */
  try {
    if (typeof QRI18n !== 'undefined' && QRI18n.appLang() !== 'en') {
      var _loc = QRI18n.t('categories.' + key);
      if (_loc !== 'categories.' + key) return _loc;
    }
  } catch (_) { /* fall through to English */ }
  /* Quant labels come from the SINGLE source of truth (services/quantTopics.js CATEGORY_LABELS) so every drill
     category — including ones added later — renders its real name, never a raw key (ADR-084). */
  try { if (typeof QuantTopics !== 'undefined' && QuantTopics.CATEGORY_LABELS && QuantTopics.CATEGORY_LABELS[key]) return QuantTopics.CATEGORY_LABELS[key]; } catch (_) {}
  /* DI (ADR-074) + LR (ADR-075) categories are labelled by their engines — Stats / post-session read "Bar Graphs" /
     "Syllogisms", not "Di Bar" / "Lr Syllogism". */
  try { if (typeof DIEngine !== 'undefined' && DIEngine.CATEGORY_LABELS && DIEngine.CATEGORY_LABELS[key]) return DIEngine.CATEGORY_LABELS[key]; } catch (_) {}
  try { if (typeof LREngine !== 'undefined' && LREngine.CATEGORY_LABELS && LREngine.CATEGORY_LABELS[key]) return LREngine.CATEGORY_LABELS[key]; } catch (_) {}
  /* ADR-079: LR is also served by the set, authored-content and visual engines — each owns its category labels. */
  try { if (typeof LRSetEngine !== 'undefined' && key === 'lr-seating') return 'Seating Arrangement'; } catch (_) {}
  try { if (typeof LRSetEngine !== 'undefined' && key === 'lr-puzzle') return 'Puzzles'; } catch (_) {}
  try { if (typeof LRAuthoredEngine !== 'undefined' && LRAuthoredEngine.CATEGORY_LABELS && LRAuthoredEngine.CATEGORY_LABELS[key]) return LRAuthoredEngine.CATEGORY_LABELS[key]; } catch (_) {}
  try { if (typeof LRVisualEngine !== 'undefined' && LRVisualEngine.CATEGORY_LABELS && LRVisualEngine.CATEGORY_LABELS[key]) return LRVisualEngine.CATEGORY_LABELS[key]; } catch (_) {}
  /* Fallback: capitalize and replace hyphens with spaces */
  return key.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

/* ---- QR Icon System (ADR: two-personality themes) ----
   One markup for every chrome icon: <span class="qr-ico" data-ico="name" aria-hidden="true">🌙</span>.
   Classic Blue renders the emoji text node (expressive personality); Playful Professional hides it
   and paints a monochrome SVG mask tinted by currentColor — entirely in CSS (see "QR ICON SYSTEM"
   in style.css), so a theme switch is instantly correct on every icon, static or generated, with no
   JS re-render. The old updateNavigationIcons() img-swap (and its 8.3MB appicons/tab PNGs-in-SVG)
   was replaced by this system. qrIco() is a plain string-builder for generated markup — it reads no
   theme, so it can never go stale. */
/* ADR-131: the canonical ico → emoji pairing, lifted verbatim from the pairs index.html already ships
   so generated chrome and static chrome speak the SAME Classic vocabulary. Before this, callers that
   passed no emoji rendered the literal string "undefined" into the span — invisible only because
   Playful sets font-size:0 on it, and about to become visible the moment Classic shows the text node. */
var QR_ICO_EMOJI = {
  'trash': '🗑️', 'alert': '⚠️', 'lock': '🔒', 'zap': '⚡', 'activity': '🧠', 'timer': '⏱',
  'chart-bar': '📊', 'nodes': '🧩', 'target': '🎯', 'shuffle': '🎨', 'rotate': '🔄',
  'file-text': '📝', 'layers': '📚', 'download': '📲', 'moon': '🌙', 'globe': '🌐',
  'book-open': '📚', 'palette': '🎨', 'graduation': '🎓', 'gauge': '📈', 'skip': '⏭️',
  'sliders': '🎚️', 'volume': '🔊', 'vibrate': '📳', 'pause-circle': '🐢', 'bell': '🔔',
  'flag': '⚑', 'mail': '✉️', 'copy': '📋', 'book': '📖', 'info': '💡', 'user': '👤',
  'log-out': '🚪', 'bot': '🤖', 'flame': '🔥', 'cog': '👨‍💻', 'home': '🏠', 'practice': '🎯',
  'learn': '📖', 'stats': '📊', 'settings': '⚙️', 'swords': '⚔️', 'calendar': '📅', 'edit': '✏️'
};
function qrIco(name, emoji) {
  var glyph = emoji || QR_ICO_EMOJI[name] || '';
  return '<span class="qr-ico" data-ico="' + name + '" aria-hidden="true">' + glyph + '</span>';
}

function _handleTabPopAnimationEnd() {
  this.classList.remove('tab-pop');
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
  /* FW-W1: the open info modal is a QROverlay now — close through its handle so the controller's
     keydown listener, scroll-lock refcount and focus-restore are all torn down properly. */
  if (typeof _infoModalHandle !== 'undefined' && _infoModalHandle) {
    try { _infoModalHandle.close(); } catch (_) {}
    _infoModalHandle = null;
  }
  /* Belt-and-braces instant hide (navigation shouldn't wait out the 200ms close animation). */
  var modals = document.querySelectorAll('.info-modal-overlay');
  for (var i = 0; i < modals.length; i++) {
    modals[i].style.display = 'none';
    modals[i].classList.remove('closing');
  }
}




/* ---- Initialize SPA when DOM is ready ---- */
document.addEventListener('DOMContentLoaded', function () {

  /* ---- The single teardown contract (ADR-119) ----
     Registered BEFORE FirebaseApp.init() (which starts the auth observer) so the very first identity
     change already has a complete contract to run.

     This exists because teardown used to be duplicated and divergent: Auth.logout() stopped the duel
     listener, while the account-switch path stopped only the Firestore listeners — so a switch with no
     logout (reachable across tabs) left user A's duel-room subscription and every view-level listener
     alive under user B. Registering here means logout, account switch, deletion, session replacement
     and forced sign-out all run the SAME set, and adding a subsystem is one registration rather than an
     edit to several lifecycle paths. Hooks must be individually safe to run when the subsystem is idle. */
  if (typeof QRIdentity !== 'undefined') {
    QRIdentity.onTeardown('duel', function () {
      if (typeof DuelCore !== 'undefined' && typeof DuelCore.stopListening === 'function') DuelCore.stopListening();
    });
    QRIdentity.onTeardown('view-listeners', function () {
      /* Router.teardown() also clears the hash; EventRegistry.clearAll() is the listener-only half and
         is what must run on every identity change. */
      if (typeof EventRegistry !== 'undefined' && typeof EventRegistry.clearAll === 'function') EventRegistry.clearAll();
    });
    QRIdentity.onTeardown('drill', function () {
      /* A drill in progress belongs to the outgoing account: stop its timers and drop the body flag so
         the incoming user cannot resume it or have their repaint suppressed by it. */
      try {
        if (typeof DrillEngine !== 'undefined' && typeof DrillEngine.cleanup === 'function') DrillEngine.cleanup();
        document.body.classList.remove('drill-session-active');
        document.documentElement.classList.remove('drill-session-active');
      } catch (_) { /* best-effort */ }
    });
  }

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
      /* S2-NAV1: clear the hydration latch on every transition to unauthenticated. Without this, a
         re-login that does NOT reload the page — notably a single-device session displacement, which
         logs out in place — would hit `if (_hydrationStarted) return;` in startHydrationAndShowApp and
         never reach setAppState('app'), wedging the user on the login screen until a manual reload. */
      _hydrationStarted = false;
      _hydrationRetryCount = 0;
      /* ADR-120: kill any in-flight hydration timeout — otherwise a hydration started before the
         sign-out fires later and reveals the app to a signed-out user. */
      if (_hydrationTimeoutId) { clearTimeout(_hydrationTimeoutId); _hydrationTimeoutId = null; }
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
        authBtn.textContent = (activeTab && activeTab.getAttribute('data-mode') === 'register') ? QRI18n.t('auth.tabRegister') : QRI18n.t('auth.submitLogin');
        authBtn.disabled = false;
      }
      /* Reset the Google button's loading state too */
      var gBtn = document.getElementById('googleSignInBtn');
      var gLabel = document.getElementById('googleSignInLabel');
      if (gBtn) gBtn.disabled = false;
      if (gLabel) gLabel.textContent = QRI18n.t('auth.googleContinue');
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
      
      /* Nav/header icons are theme-driven purely in CSS (QR icon system) — no per-theme swap needed. */

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
  /* ADR-120: hoisted out of startHydrationAndShowApp so setAppState('unauthenticated') can cancel it.
     As a closure-local it was unreachable from the sign-out path, so a hydration that hung past 6 s would
     still fire its timeout AFTER the user was signed out and reveal the app shell. */
  var _hydrationTimeoutId = null;
  var _MAX_HYDRATION_RETRIES = 30; /* 3 seconds at 100ms intervals */

  /**
   * Hydrate the signed-in user's state and reveal the app.
   *
   * ADR-119: "the app is rendered" and "the CORRECT user's state is hydrated" are different conditions,
   * and conflating them was a HIGH defect. This used to open with a bare `if (_currentAppState === 'app')
   * return;`, so a direct A→B switch (no logout, no reload — reachable because Firebase Auth persistence
   * is shared across tabs) returned immediately and never ran _executeTransition(). That function is the
   * ONLY caller of applyAppearance/applyTheme/QRI18n.init and of _launchOnboardingOrShowMain, so user B
   * ran inside user A's theme, dark-mode and UI language, and a brand-new B never saw onboarding — while
   * the data repaints introduced by earlier waves redrew B's data underneath A's chrome.
   *
   * The gate is now keyed on IDENTITY, not on render state: an account boundary always re-enters the
   * transition; a same-user re-notification (token refresh, resume, duplicate observer fire) still
   * short-circuits exactly as before, so the common path is unchanged.
   *
   * @param {string|null} [uid] - the uid this hydration is for; defaults to the live auth uid.
   */
  function startHydrationAndShowApp(uid) {
    var targetUid = uid || (typeof FirebaseApp !== 'undefined' && FirebaseApp.getUserId && FirebaseApp.getUserId()) || null;
    var boundary = (typeof QRIdentity !== 'undefined') ? QRIdentity.isAccountBoundary(targetUid) : false;

    /* The decision itself is a pure, exported, unit-executed function (QRIdentity.hydrationDecision) so
       the invariant "an account boundary ALWAYS rehydrates" is verified by running a truth table rather
       than by grepping this file — which is how the first cut of this fix shipped broken. */
    var decision = (typeof QRIdentity !== 'undefined' && QRIdentity.hydrationDecision)
      ? QRIdentity.hydrationDecision(boundary, _currentAppState, _hydrationStarted)
      : ((_currentAppState === 'app' || _hydrationStarted) ? 'SKIP' : 'HYDRATE');
    if (decision === 'SKIP') return;

    if (boundary) {
      /* Account boundary. The latch is ALWAYS released here, whether the previous identity finished
         hydrating (latch left true by its own successful run) or is still in flight (latch true and the
         app not yet shown). Anything less re-creates the original defect one switch later: after the
         first login the latch is permanently true, so a bare `if (_hydrationStarted) return` would
         swallow every subsequent A→B. The previous identity's in-flight callbacks are already inert —
         QRIdentity bumped the generation before teardown — so releasing the latch cannot let them
         resurface. */
      _hydrationStarted = false;
      _hydrationRetryCount = 0;
    }
    if (_hydrationStarted) return;
    _hydrationStarted = true;

    /* Account boundary while the app is already on screen: show the transitional state so the outgoing
       user's rendered data is never visible under the incoming user's session. Cheap and correct beats
       200 ms of somebody else's stats. */
    if (boundary && _currentAppState === 'app') {
      _currentAppState = 'hydrating';
      try {
        document.body.classList.remove('auth-resolved');
        if (container) container.style.display = 'none';
        if (bottomNav) bottomNav.style.display = 'none';
        if (typeof Router !== 'undefined' && typeof Router.teardown === 'function') Router.teardown();
      } catch (_) { /* never block the transition on chrome */ }
    }

    setAppState('hydrating');
    
    var transitionFired = false;
    function _executeTransition() {
      if (transitionFired) return;
      transitionFired = true;
      try {
        var s = (typeof AppState !== 'undefined') ? AppState.getSettings() : JSON.parse(localStorage.getItem('quant_reflex_settings') || '{}');
        if (typeof applyAppearance === 'function') { applyAppearance(s); }
        else { document.documentElement.classList.toggle('dark-mode', !!s.darkMode); }
        if (typeof applyTheme === 'function') applyTheme(s.theme || 'classic');
        /* ADR-111: re-apply languages after Firestore hydration (settings may have synced from
           another device where the user picked a different language). */
        if (typeof QRI18n !== 'undefined') QRI18n.init(s);
      } catch (_) { /* ignore */ }
      /* ADR-119: the app state is now built for this account — appearance, theme and language have been
         re-applied from THIS user's settings, and the onboarding decision below uses them. Marking the
         identity active here (before render) is what lets the next observer fire tell a same-user
         re-notification apart from a genuine account boundary. */
      if (typeof QRIdentity !== 'undefined') QRIdentity.completeTransition(targetUid);
      _launchOnboardingOrShowMain();
    }

    if (_hydrationTimeoutId) clearTimeout(_hydrationTimeoutId);
    var timeoutId = _hydrationTimeoutId = setTimeout(function() {
      _hydrationTimeoutId = null;
      console.warn('Hydration timeout — bypassing onboarding to prevent state corruption.');
      _executeTransition();
    }, 6000);

    if (typeof FirestoreSync !== 'undefined' && typeof FirebaseApp !== 'undefined' && FirebaseApp.isReady() && FirebaseApp.getUserId()) {
      FirestoreSync.loadFromFirestore(function (success) {

        clearTimeout(timeoutId); _hydrationTimeoutId = null;
        _executeTransition();
      });
    } else {
      /* Wait and retry if ID hasn't propagated yet, preventing onboarding bypass */
      if (FirebaseApp.isReady() && typeof Auth !== 'undefined' && Auth.isLoggedIn() && !FirebaseApp.getUserId()) {
         if (_hydrationRetryCount++ < _MAX_HYDRATION_RETRIES) {
           clearTimeout(timeoutId); _hydrationTimeoutId = null;
           _hydrationStarted = false; /* Allow retry */
           setTimeout(startHydrationAndShowApp, 100);
           return;
         }
         console.error('[BOOT] getUserId() still null after ' + _MAX_HYDRATION_RETRIES + ' retries. Proceeding without Firestore.');
      }
      clearTimeout(timeoutId); _hydrationTimeoutId = null;
      _executeTransition();
    }
  }

  function _launchOnboardingOrShowMain() {
    var hasUid = typeof FirebaseApp !== 'undefined' && FirebaseApp.isReady() && !!FirebaseApp.getUserId();

    /* ADR-120: hasUid used to gate ONLY the onboarding branch, so the else fell through to
       setAppState('app') unconditionally — revealing the app shell when no one is signed in (reachable
       when a server-forced sign-out lands during a slow hydration). Nobody signed in ⇒ nothing to show. */
    if (!hasUid) {
      setAppState('unauthenticated');
      return;
    }

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
        /* ADR-119: pass the uid so an A→B boundary re-enters the full lifecycle instead of being
           swallowed by the "already rendered" short-circuit. */
        startHydrationAndShowApp(user.uid);
      } else {
        if (typeof QRIdentity !== 'undefined') QRIdentity.clear();
        setAppState('unauthenticated');
        /* ADR-072: if this sign-out was caused by the account being opened on another device, explain it once. */
        try {
          if (window.Session && Session.consumeReplacedFlag() && typeof showToast === 'function') {
            showToast(QRI18n.t('auth.signedOutElsewhere'));
          }
        } catch (_) {}
      }
    });

    /* Initial state check */
    Auth.onAuthReady(function (user) {
      clearTimeout(_authTimeoutId);
      if (user) {
        startHydrationAndShowApp(user.uid);
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
        authSubmitBtn.textContent = QRI18n.t('auth.pleaseWait');
      } else {
        var activeTab = document.querySelector('.auth-tab.active');
        authSubmitBtn.textContent = (activeTab && activeTab.getAttribute('data-mode') === 'register') ? QRI18n.t('auth.tabRegister') : QRI18n.t('auth.submitLogin');
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
        if (authSubmitBtn) authSubmitBtn.textContent = QRI18n.t('auth.tabRegister');
      } else {
        _isSignupMode = false;
        if (registerFields) registerFields.style.display = 'none';
        if (forgotRow) forgotRow.style.display = 'block';
        if (authSubmitBtn) authSubmitBtn.textContent = QRI18n.t('auth.submitLogin');
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
          if (typeof showToast === 'function') showToast(QRI18n.t('auth.forgotNeedEmail'));
          else if (loginError) { loginError.textContent = QRI18n.t('auth.forgotNeedEmailShort'); loginError.style.display = 'block'; }
          return;
        }
        forgotBtn.disabled = true; var _orig = forgotBtn.textContent; forgotBtn.textContent = QRI18n.t('auth.sending');
        Auth.resetPassword(email, function (err) {
          forgotBtn.disabled = false; forgotBtn.textContent = _orig;
          var msg = err ? err : QRI18n.t('auth.resetSent');
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

    /* ADR-111: validator rule labels come from the byte-locked shared validators (ADR-099) —
       localize at display time by mapping the canonical English label to a catalog key. Unmapped
       labels render as-is (English), never break. */
    var _VAL_LABEL_KEYS = {
      'At least 8 characters': 'auth.ruleMinChars',
      'One uppercase letter': 'auth.ruleUpper',
      'One lowercase letter': 'auth.ruleLower',
      'One number': 'auth.ruleNumber',
      'Please enter a valid email address.': 'auth.invalidEmail',
      'Password must be at least 6 characters.': 'auth.passwordMin6',
      'Password does not meet requirements.': 'auth.passwordWeak'
    };
    function _valLabel(label) {
      var k = _VAL_LABEL_KEYS[label];
      return k ? QRI18n.t(k) : label;
    }

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
        containerEl.innerHTML = '<span class="val-summary">' + QRI18n.t('auth.looksGood') + '</span>';
        if (inputEl) {
          inputEl.classList.remove('input-error');
          inputEl.classList.add('input-valid');
        }
      } else {
        var html = '<ul>';
        for (var i = 0; i < rules.length; i++) {
          var r = rules[i];
          var passed = r.passed !== undefined ? r.passed : (typeof r.test === 'function' ? r.test() : false);
          html += '<li class="' + (passed ? 'val-pass' : 'val-error') + '">' + _valLabel(r.label) + '</li>';
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
              showError(QRI18n.t('auth.serviceUnavailable'));
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
              showError(QRI18n.t('auth.coachingInvalid'));
              return;
            }
            
            if (typeof Auth === 'undefined' || !Auth.signup) {
              showError(QRI18n.t('auth.serviceUnavailable'));
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

    /* ---- Google Sign-In ---- */
    var googleSignInBtn = document.getElementById('googleSignInBtn');
    var googleSignInLabel = document.getElementById('googleSignInLabel');
    function _setGoogleLoading(loading) {
      if (googleSignInBtn) googleSignInBtn.disabled = loading;
      if (googleSignInLabel) googleSignInLabel.textContent = loading ? QRI18n.t('auth.pleaseWaitG') : QRI18n.t('auth.googleContinue');
    }
    if (googleSignInBtn) {
      googleSignInBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (googleSignInBtn.disabled) return;
        if (typeof Auth === 'undefined' || !Auth.loginWithGoogle) {
          showError(QRI18n.t('auth.serviceUnavailable'));
          return;
        }
        hideError();
        _setGoogleLoading(true);
        Auth.loginWithGoogle(function (err, user, meta) {
          if (err) {
            _setGoogleLoading(false);
            /* A deliberate popup dismissal is not an error state — restore silently. */
            if (!(meta && meta.cancelled)) showError(err);
            return;
          }
          /* Success: stay disabled — onStateChange drives hydration exactly like email login,
             with the same 5s watchdog in case the state transition stalls. */
          setTimeout(function () {
            if (googleSignInBtn && googleSignInBtn.disabled && _currentAppState !== 'app') {
              console.warn('Auth state transition timeout (Google). Forcing hydration.');
              startHydrationAndShowApp();
            }
          }, 5000);
        });
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
              var nm = data.name ? QRI18n.t('auth.connectedTo', { name: _esc(data.name) }) : QRI18n.t('auth.validCoachingCode');
              var sc = (typeof data.studentCount === 'number' && data.studentCount > 0) ? QRI18n.t('auth.studentCount', { count: data.studentCount }) : '';
              var logo = (typeof data.logoUrl === 'string' && /^https:\/\//i.test(data.logoUrl))
                ? '<img class="coaching-join-logo" src="' + _esc(data.logoUrl) + '" alt="" onerror="this.style.display=\'none\'" /> ' : '';
              coachingIdValidationEl.className = 'login-field-validation active all-valid';
              /* The ✓ is supplied by .val-summary::before — don't add a literal one (would double it). */
              coachingIdValidationEl.innerHTML = '<span class="val-summary">' + logo + nm + sc + '</span>';
              loginCoachingId.classList.remove('input-error');
              loginCoachingId.classList.add('input-valid');
            } else {
              var msg = (data && data.reason === 'suspended') ? QRI18n.t('auth.instituteSuspended')
                : (data && data.reason === 'deleted') ? QRI18n.t('auth.instituteInactive')
                : QRI18n.t('auth.codeNotFound');
              coachingIdValidationEl.className = 'login-field-validation active';
              coachingIdValidationEl.innerHTML = '<ul><li class="val-error">' + msg + '</li></ul>';
              loginCoachingId.classList.remove('input-valid');
              loginCoachingId.classList.add('input-error');
            }
          })
          .catch(function(err) {
            coachingIdValidationEl.className = 'login-field-validation active';
            coachingIdValidationEl.innerHTML = '<ul><li class="val-error">' + QRI18n.t('auth.verifyFailed') + '</li></ul>';
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
      var icon = link.querySelector('.nav-icon .qr-ico');
      if (icon) {
        icon.removeEventListener('animationend', _handleTabPopAnimationEnd);
        icon.addEventListener('animationend', _handleTabPopAnimationEnd);
      }
    })(navLinks[i]);

    navLinks[i].addEventListener('click', function (e) {
      e.preventDefault();
      if (!_tryBeginNavTransition()) return;
      var view = this.getAttribute('data-view');
      /* Skip if already on this tab and no drill is active and no stale results overlay.
         EXCEPTION (ADR-069): on a Learn topic sub-route (#learn/<id>) the Learn tab is "active" but tapping it must
         return to the hub — otherwise the tab is a dead no-op on topic pages. */
      var _dc_check = document.getElementById('drillContainer');
      var _hasStaleResults = _dc_check && (_dc_check.classList.contains('drill-results-active') || _dc_check.style.display !== 'none');
      var _onLearnSubRoute = (view === 'learn' && window.location.hash.indexOf('#learn/') === 0);
      if (this.classList.contains('active') && !_drillSessionActive && !_hasStaleResults && !_onLearnSubRoute) return;
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
      /* Trigger icon pop animation */
      var iconEl = this.querySelector('.nav-icon .qr-ico');
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

  /* Learn view (ADR-069): render-on-route every show — hub when no path, topic page on #learn/<topicId>.
     The hub itself is built once internally (LearnView guards with _hubBuilt). */
  Router.onShow('learn', function (params) {
    if (typeof renderLearnRoute === 'function') renderLearnRoute(params);
  });

  /* Duel is now in its own dedicated view — no active duel check needed on practice */

  /* Stats view: render on every show */
  Router.onShow('stats', renderStatsView);

  /* Settings view: init on every show */
  Router.onShow('settings', initSettingsView);

  /* ---- Initialize swipe navigation ---- */
  initSwipeNavigation();
});
