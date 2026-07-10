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

  /* Parse a location hash into a view id + optional sub-path (ADR-069, deep links like #learn/percentages).
     Single-segment hashes (#home, #learn) are unchanged → fully backwards-compatible. */
  function _parseHash(raw) {
    var h = (raw || '').replace(/^#/, '');
    if (!h) return { view: 'home', path: null };
    var slash = h.indexOf('/');
    if (slash === -1) return { view: h, path: null };
    return { view: h.slice(0, slash), path: h.slice(slash + 1) || null };
  }

  function onInit(viewId, callback) {
    viewInitCallbacks[viewId] = callback;
  }

  function onShow(viewId, callback) {
    if (!afterShowCallbacks[viewId]) afterShowCallbacks[viewId] = [];
    afterShowCallbacks[viewId].push(callback);
  }

  /**
   * Globally destroys all active overlays, modals, and sessions.
   * Called on auth transitions or major route shifts to ensure a clean slate.
   */
  function _cleanupOverlays(targetViewId) {
    if (typeof hideCustomNumpad === 'function') hideCustomNumpad();

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
      /* FW-W2: close through the paywall's QROverlay handle first so its document-level key
         listener and ref-counted body lock are released; the instant removal below keeps this
         teardown synchronous (the handle's own delayed removal then no-ops). */
      if (typeof Paywall !== 'undefined' && Paywall.closeModal) { try { Paywall.closeModal(); } catch (_) {} }
      if (_paywallOverlay.parentNode) _paywallOverlay.parentNode.removeChild(_paywallOverlay);
      document.body.classList.remove('paywall-open');
    }

    /* Duel realtime: tear down ONLY when actually navigating AWAY from the duel view. Internal duel re-renders
       call showView('duel') on every screen change — tearing the listener down there silently kills realtime sync
       after the first snapshot (audit realtime-sync-01, the keystone defect). On a genuine nav-away, suspend()
       stops the listener AND the lobby/deadline polls (audit realtime-sync-02) while keeping state for the Home
       "Resume" card. */
    if (typeof DuelManager !== 'undefined' && DuelManager.isInDuel() && targetViewId !== 'duel') {
      if (typeof DuelManager.suspend === 'function') DuelManager.suspend();
      else if (typeof DuelCore !== 'undefined' && typeof DuelCore.stopListening === 'function') DuelCore.stopListening();
    }

    if (typeof _drillSessionActive !== 'undefined' && !_drillSessionActive) {
      document.body.classList.remove('drill-session-active');
      document.documentElement.classList.remove('drill-session-active');
    }

    var _allModals = document.querySelectorAll('.modal-overlay');
    for (var m = 0; m < _allModals.length; m++) {
      _allModals[m].style.display = 'none';
    }
    document.body.classList.remove('modal-open');
  }

  function showView(viewId, params) {

    /* ADR-107 hardening: a pending one-shot drill resume hook (window.__qrResumeAfterUpgrade, set when a free user
       pauses at the daily cap) is only valid within an uninterrupted paused session. Any view navigation invalidates
       it, so drop it here — a later upgrade from elsewhere must fall through to the normal refresh, never fire
       renderQuestion() into a hidden/torn-down engine. The happy-path resume runs renderQuestion() and returns
       before any showView(), so this never clears a live resume. */
    if (typeof window !== 'undefined' && window.__qrResumeAfterUpgrade) window.__qrResumeAfterUpgrade = null;

    var views = document.querySelectorAll('.spa-view');
    for (var i = 0; i < views.length; i++) {
      views[i].classList.remove('spa-view-active');
    }

    var target = document.getElementById('view-' + viewId);
    if (!target) {
      target = document.getElementById('view-home');
      viewId = 'home';
      params = undefined;   // unknown view: drop any stale sub-path so the URL canonicalizes to #home, not #home/<garbage>
    }
    target.classList.add('spa-view-active');
    /* Practice owns its own scroll shell — neutralize the app-level .container scroller so the
       fixed header and bottom nav never drift (ADR-011). */
    document.body.classList.toggle('view-practice-active', viewId === 'practice');
    /* Learn opts into the wider responsive shell (ADR-069); scoped via this body class so no other view changes. */
    document.body.classList.toggle('view-learn-active', viewId === 'learn');

    _cleanupOverlays(viewId);
    
    if (typeof _drillSessionActive !== 'undefined' && !_drillSessionActive) {
      if (document.body.classList.contains('auth-resolved')) {
        var _nav = document.querySelector('.bottom-nav');
        if (_nav) _nav.style.display = '';
      }
    }

    var navLinks = document.querySelectorAll('.bottom-nav a');
    for (var j = 0; j < navLinks.length; j++) {
      var isActive = navLinks[j].getAttribute('data-view') === viewId;
      navLinks[j].classList.toggle('active', isActive);
      if (isActive) navLinks[j].setAttribute('aria-current', 'page'); else navLinks[j].removeAttribute('aria-current');
    }

    if (currentView && currentView !== viewId) {
      if (typeof EventRegistry !== 'undefined') {
        EventRegistry.clearViewListeners(currentView);
      }
    }

    if (viewInitCallbacks[viewId]) {
      viewInitCallbacks[viewId](params);
      delete viewInitCallbacks[viewId];
    }

    if (afterShowCallbacks[viewId]) {
      for (var cb = 0; cb < afterShowCallbacks[viewId].length; cb++) {
        afterShowCallbacks[viewId][cb](params);
      }
    }

    currentView = viewId;

    var _targetHash = '#' + viewId + (params && params.path ? '/' + params.path : '');
    if (!_navigatingFromPopstate && window.location.hash !== _targetHash) {
      try {
        history.pushState({ view: viewId, path: (params && params.path) || null }, '', _targetHash);
      } catch(e) {
        window.location.hash = _targetHash;
      }
    }

    window.scrollTo(0, 0);
    var _scrollContainer = document.querySelector('.container');
    if (_scrollContainer) _scrollContainer.scrollTop = 0;
    

  }

  function getCurrentView() {
    return currentView;
  }

  function init() {

    var parsed = _parseHash(window.location.hash);
    var canonical = '#' + parsed.view + (parsed.path ? '/' + parsed.path : '');
    try {
      history.replaceState({ view: parsed.view, path: parsed.path }, '', canonical);
    } catch (e) {
      window.location.hash = canonical;
    }
    _navigatingFromPopstate = true;
    try {

       showView(parsed.view, parsed.path ? { path: parsed.path } : undefined);
    } catch(e) {
       console.error('[ERRORS] Router initialization failed:', e);
    } finally { 
       _navigatingFromPopstate = false; 
    }

    window.addEventListener('popstate', function () {
      /* Close any open info modals on navigation */
      if (typeof _closeAllInfoModals === 'function') _closeAllInfoModals();

      /* If a drill session is active, show exit dialog instead of navigating */
      if (typeof _drillSessionActive !== 'undefined' && _drillSessionActive) {
        /* Push history state back to prevent the browser from actually navigating away */
        try {
          history.pushState({ view: 'practice' }, '', '#practice');
        } catch (e) {
          window.location.hash = '#practice';
        }

        if (typeof showExitSessionDialog === 'function') {
          showExitSessionDialog(function () {
            if (typeof _activeDrillEngine !== 'undefined' && _activeDrillEngine) {
              _activeDrillEngine.cleanup();
              _activeDrillEngine = null;
            }
            var _dc = document.getElementById('drillContainer');
            if (_dc) {
              _dc.classList.remove('drill-results-active');
              _dc.style.display = 'none';
            }
            if (typeof FirestoreSync !== 'undefined') {
              FirestoreSync.endDrillBatch();
            }
            if (typeof _exitDrillSession === 'function') _exitDrillSession();
            showView('practice');
          });
        }
        return;
      }

      /* Duel solving/countdown: intercept Back so it can never silently leave an un-submitted duel (audit
         solving-exit-forfeit-01). The manager shows the Submit & Leave modal (solving) or absorbs it (countdown);
         re-push the duel state so the browser does not actually navigate. */
      if (typeof DuelManager !== 'undefined' && typeof DuelManager.handleBackNav === 'function' && DuelManager.handleBackNav()) {
        try {
          history.pushState({ view: 'duel' }, '', '#duel');
        } catch (e) {
          window.location.hash = '#duel';
        }
        return;
      }

      /* Non-session popstate: clean up any stale drill state */
      if (typeof _activeDrillEngine !== 'undefined' && _activeDrillEngine) {
        _activeDrillEngine.cleanup();
        _activeDrillEngine = null;
      }
      var _dc2 = document.getElementById('drillContainer');
      if (_dc2) {
        _dc2.classList.remove('drill-results-active');
        _dc2.style.display = 'none';
      }
      if (typeof _exitDrillSession === 'function') _exitDrillSession();

      var parsed = _parseHash(window.location.hash);
      _navigatingFromPopstate = true;
      try { showView(parsed.view, parsed.path ? { path: parsed.path } : undefined); } finally { _navigatingFromPopstate = false; }
    });
  }

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
      navLinks[j].removeAttribute('aria-current');
    }
    
    var _allModals = document.querySelectorAll('.modal-overlay');
    for (var m = 0; m < _allModals.length; m++) {
      _allModals[m].style.display = 'none';
    }

    /* Clean up all registered event listeners to prevent leaks across login/logout */
    if (typeof EventRegistry !== 'undefined' && typeof EventRegistry.clearAll === 'function') {
      EventRegistry.clearAll();
    }
  }

  return {
    init: init,
    showView: showView,
    getCurrentView: getCurrentView,
    onInit: onInit,
    onShow: onShow,
    teardown: teardown
  };
})();
