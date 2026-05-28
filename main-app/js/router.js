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
   * Multiple callbacks per view are supported — they run in registration order.
   */
  function onShow(viewId, callback) {
    if (!afterShowCallbacks[viewId]) afterShowCallbacks[viewId] = [];
    afterShowCallbacks[viewId].push(callback);
  }

  /**
   * Globally destroys all active overlays, modals, and sessions.
   * Called on auth transitions or major route shifts to ensure a clean slate.
   */
  function teardown() {
    /* Hide custom numpad to prevent stale numpad state. */
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
      if (typeof _drillSessionActive === 'undefined' || !_drillSessionActive) {
        _drillContainer.style.display = 'none';
      }
    }

    var _onboardingOverlay = document.getElementById('onboardingOverlay');
    if (_onboardingOverlay && _onboardingOverlay.style.display !== 'none') {
      _onboardingOverlay.style.display = 'none';
      if (typeof Onboarding !== 'undefined' && typeof Onboarding.forceCleanup === 'function') {
        Onboarding.forceCleanup();
      }
    }

    var _paywallOverlay = document.getElementById('paywallModalOverlay');
    if (_paywallOverlay) {
      if (_paywallOverlay.parentNode) _paywallOverlay.parentNode.removeChild(_paywallOverlay);
      document.body.classList.remove('paywall-open');
    }

    if (typeof DuelCore !== 'undefined' && typeof DuelCore.stopListening === 'function') {
      if (typeof DuelManager !== 'undefined' && DuelManager.isInDuel()) {
        DuelCore.stopListening();
      }
    }

    if (typeof _drillSessionActive !== 'undefined' && !_drillSessionActive) {
      document.body.classList.remove('drill-session-active');
      document.documentElement.classList.remove('drill-session-active');
    }

    /* Clear all modals and stale modal-open body class to prevent scroll lock and dead click zones */
    var _allModals = document.querySelectorAll('.modal-overlay');
    for (var m = 0; m < _allModals.length; m++) {
      _allModals[m].style.display = 'none';
    }
    document.body.classList.remove('modal-open');
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

    teardown();
    /* Ensure bottom nav is visible when not in an active session, 
       BUT ONLY IF authentication has completed and the app shell is allowed to render */
    if (typeof _drillSessionActive !== 'undefined' && !_drillSessionActive) {
      if (document.body.classList.contains('auth-resolved')) {
        var _nav = document.querySelector('.bottom-nav');
        if (_nav) _nav.style.display = '';
      }
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

    /* Run after-show callbacks every time (supports multiple per view) */
    if (afterShowCallbacks[viewId]) {
      for (var cb = 0; cb < afterShowCallbacks[viewId].length; cb++) {
        afterShowCallbacks[viewId][cb](params);
      }
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
    /* Duel deep-links removed — duels now use room codes only.
       The ?duel=ID URL parameter is no longer supported.
       See duel-manager.js for the room-code flow. */

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

  /**
   * Resets the router state completely. Used during logout.
   */
  function teardown() {
    var views = document.querySelectorAll('.spa-view');
    for (var i = 0; i < views.length; i++) {
      views[i].classList.remove('spa-view-active');
    }
    currentView = null;
    window.location.hash = '';
    
    var navLinks = document.querySelectorAll('.bottom-nav a');
    for (var j = 0; j < navLinks.length; j++) {
      navLinks[j].classList.remove('active');
      navLinks[j].setAttribute('aria-selected', 'false');
    }
    
    var _allModals = document.querySelectorAll('.modal-overlay');
    for (var m = 0; m < _allModals.length; m++) {
      _allModals[m].style.display = 'none';
  return {
    init: init,
    showView: showView,
    getCurrentView: getCurrentView,
    onInit: onInit,
    onShow: onShow,
    teardown: teardown
  };
})();
