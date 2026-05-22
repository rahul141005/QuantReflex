/**
 * router.js — Simple vanilla SPA router
 *
 * Manages view switching by showing/hiding sections.
 * Supports hash-based navigation and bottom nav active states.
 */

var Router = (function () {
  var currentView = null;
  var viewInitCallbacks = {};
  var afterShowCallbacks = {};
  var _navigatingFromPopstate = false;

  /**
   * Register an initialization callback for a view.
   * Called the first time a view is shown.
   */
  function onInit(viewId, callback) {
    viewInitCallbacks[viewId] = callback;
  }

  /**
   * Register a callback that runs every time a view is shown.
   */
  function onShow(viewId, callback) {
    afterShowCallbacks[viewId] = callback;
  }

  /**
   * Show a view by its ID, hide all others.
   * @param {string} viewId - The view to show (e.g. 'home', 'practice')
   * @param {object} [params] - Optional parameters to pass to callbacks
   */
  function showView(viewId, params) {
    var views = document.querySelectorAll('.spa-view');
    for (var i = 0; i < views.length; i++) {
      views[i].classList.remove('spa-view-active');
    }

    var target = document.getElementById('view-' + viewId);
    if (!target) {
      target = document.getElementById('view-home');
      viewId = 'home';
    }
    target.classList.add('spa-view-active');

    /* Hide custom numpad on every view transition to prevent stale numpad state.
       The drill engine will re-show it when a question is rendered. */
    if (typeof hideCustomNumpad === 'function') {
      hideCustomNumpad();
    }

    /* ---- Lifecycle cleanup safety net ----
       Remove stale fullscreen overlay classes that can persist after abnormal exits
       (e.g. navigating away from drill results, popstate during duel, stale modals).
       These classes create position:fixed overlays that block the entire UI if not removed. */
    var _drillContainer = document.getElementById('drillContainer');
    if (_drillContainer) {
      _drillContainer.classList.remove('drill-results-active');
    }
    /* Only clear drill-session-active if no actual drill is running.
       The practice onShow callback handles its own cleanup, but this catches edge cases
       where the user navigates away via means that skip that callback. */
    if (typeof _drillSessionActive !== 'undefined' && !_drillSessionActive) {
      document.body.classList.remove('drill-session-active');
      document.documentElement.classList.remove('drill-session-active');
    }
    /* Clear stale modal-open body class (prevents scroll lock after orphaned modals) */
    var _anyModalVisible = document.querySelector('.modal-overlay[style*="display: flex"], .modal-overlay[style*="display:flex"]');
    if (!_anyModalVisible) {
      document.body.classList.remove('modal-open');
    }
    /* Ensure bottom nav is visible when not in an active session */
    if (typeof _drillSessionActive !== 'undefined' && !_drillSessionActive) {
      var _nav = document.querySelector('.bottom-nav');
      if (_nav) _nav.style.display = '';
    }

    /* Update bottom nav active state */
    var navLinks = document.querySelectorAll('.bottom-nav a');
    for (var j = 0; j < navLinks.length; j++) {
      var isActive = navLinks[j].getAttribute('data-view') === viewId;
      navLinks[j].classList.toggle('active', isActive);
      navLinks[j].setAttribute('aria-selected', isActive ? 'true' : 'false');
    }

    /* Clean up orphaned listeners from the outgoing view */
    if (currentView && currentView !== viewId) {
      if (typeof EventRegistry !== 'undefined') {
        EventRegistry.clearViewListeners(currentView);
      }
    }

    /* Run init callback once */
    if (viewInitCallbacks[viewId]) {
      viewInitCallbacks[viewId](params);
      delete viewInitCallbacks[viewId];
    }

    /* Run after-show callback every time */
    if (afterShowCallbacks[viewId]) {
      afterShowCallbacks[viewId](params);
    }

    currentView = viewId;

    /* Update hash — only pushState for user-initiated navigation,
       skip when restoring from popstate to avoid duplicate history entries
       that would break swipe-back / browser back button behavior */
    if (!_navigatingFromPopstate && window.location.hash !== '#' + viewId) {
      history.pushState({ view: viewId }, '', '#' + viewId);
    }

    /* Scroll to top — must target .container since body/html have overflow:hidden */
    window.scrollTo(0, 0);
    var _scrollContainer = document.querySelector('.container');
    if (_scrollContainer) _scrollContainer.scrollTop = 0;
  }

  /**
   * Get the current active view ID.
   */
  function getCurrentView() {
    return currentView;
  }

  /**
   * Initialize router: read hash and show the correct view.
   */
  function init() {
    /* Detect duel deep-link (?duel=DUEL_ID) before normal routing */
    try {
      var urlParams = new URLSearchParams(window.location.search);
      var duelParam = urlParams.get('duel');
      if (duelParam && duelParam.length >= 4 && duelParam.length <= 8) {
        try { sessionStorage.setItem('qr_pending_duel', duelParam.toUpperCase()); } catch (_) {}
        if (typeof DuelManager !== 'undefined') {
          DuelManager.setPendingDuelId(duelParam.toUpperCase());
        }
        /* Clean URL to prevent re-triggering on refresh */
        var cleanUrl = window.location.pathname + (window.location.hash || '');
        history.replaceState(null, '', cleanUrl);
      }
    } catch (_) {}

    /* Set initial history state so first back press works correctly */
    var hash = window.location.hash.replace('#', '') || 'home';
    history.replaceState({ view: hash }, '', '#' + hash);
    _navigatingFromPopstate = true;
    try { showView(hash); } finally { _navigatingFromPopstate = false; }

    /* Listen for back/forward button and swipe-back navigation */
    window.addEventListener('popstate', function () {
      /* Skip if a drill session is active — app.js handles
         back navigation during drills with its own confirm dialog */
      if (typeof _drillSessionActive !== 'undefined' && _drillSessionActive) return;
      var hash = window.location.hash.replace('#', '') || 'home';
      _navigatingFromPopstate = true;
      try { showView(hash); } finally { _navigatingFromPopstate = false; }
    });
  }

  return {
    showView: showView,
    onInit: onInit,
    onShow: onShow,
    getCurrentView: getCurrentView,
    init: init
  };
})();
