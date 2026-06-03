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
  function _cleanupOverlays() {
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

    var _allModals = document.querySelectorAll('.modal-overlay');
    for (var m = 0; m < _allModals.length; m++) {
      _allModals[m].style.display = 'none';
    }
    document.body.classList.remove('modal-open');
  }

  function showView(viewId, params) {
    console.log('[ROUTER] route transition to:', viewId);
    
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

    _cleanupOverlays();
    
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
      navLinks[j].setAttribute('aria-selected', isActive ? 'true' : 'false');
    }

    if (currentView && currentView !== viewId) {
      if (typeof EventRegistry !== 'undefined') {
        EventRegistry.clearViewListeners(currentView);
      }
    }

    if (viewInitCallbacks[viewId]) {
      console.log('[VIEWS] ' + viewId + ' render begin (init)');
      viewInitCallbacks[viewId](params);
      delete viewInitCallbacks[viewId];
    }

    if (afterShowCallbacks[viewId]) {
      console.log('[VIEWS] ' + viewId + ' render begin (show)');
      for (var cb = 0; cb < afterShowCallbacks[viewId].length; cb++) {
        afterShowCallbacks[viewId][cb](params);
      }
    }

    currentView = viewId;

    if (!_navigatingFromPopstate && window.location.hash !== '#' + viewId) {
      try {
        history.pushState({ view: viewId }, '', '#' + viewId);
      } catch(e) {
        window.location.hash = '#' + viewId;
      }
    }

    window.scrollTo(0, 0);
    var _scrollContainer = document.querySelector('.container');
    if (_scrollContainer) _scrollContainer.scrollTop = 0;
    
    console.log('[VIEWS] DOM mount success for:', viewId);
  }

  function getCurrentView() {
    return currentView;
  }

  function init() {
    console.log('[ROUTER] router init');
    var hash = window.location.hash.replace('#', '') || 'home';
    try {
      history.replaceState({ view: hash }, '', '#' + hash);
    } catch (e) {
      window.location.hash = '#' + hash;
    }
    _navigatingFromPopstate = true;
    try { 
       console.log('[ROUTER] route selection:', hash);
       showView(hash); 
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

      var hash = window.location.hash.replace('#', '') || 'home';
      _navigatingFromPopstate = true;
      try { showView(hash); } finally { _navigatingFromPopstate = false; }
    });
  }

  function teardown() {
    console.log('[ROUTER] full teardown (logout)');
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
