/**
 * duel-manager.js — Math Duel orchestrator
 *
 * Coordinates DuelCore (Firestore) and DuelUI (rendering).
 * Manages duel lifecycle: setup → waiting → active → results.
 * Handles deep-link joins (?duel=ID), cleanup, and state transitions.
 */

var DuelManager = (function () {
  'use strict';

  var _currentDuelId = null;
  var _currentState = null; /* 'setup' | 'waiting' | 'active' | 'results' */
  var _pendingDuelId = null; /* Set from deep-link before auth */

  function _getContainer(id) { return document.getElementById(id); }

  /* ---- Public API ---- */

  /**
   * Open duel setup screen (from practice mode card click).
   */
  function openSetup() {
    if (!_checkPremiumPlus()) return;
    _currentState = 'setup';
    var container = _getContainer('duelSetup');
    if (!container) return;

    /* Hide bottom nav for immersive feel */
    var nav = document.querySelector('.bottom-nav');
    if (nav) nav.style.display = 'none';

    DuelUI.renderSetup(container, function () {
      /* onBack callback */
      _currentState = null;
      if (nav) nav.style.display = '';
    });
  }

  /**
   * Enter waiting room for a duel (after create or join).
   */
  function enterWaitingRoom(duelId) {
    _currentDuelId = duelId;
    _currentState = 'waiting';
    var container = _getContainer('duelWaitingRoom');
    if (!container) return;

    /* Hide bottom nav and other duel screens */
    var nav = document.querySelector('.bottom-nav');
    if (nav) nav.style.display = 'none';
    _hideAllDuelScreens();
    document.body.classList.add('drill-session-active');
    _bindLifecycleCleanup();

    /* Start listening for realtime updates */
    DuelCore.listenToDuel(duelId, function (event) {
      if (event.error) {
        if (typeof showToast === 'function') showToast(event.error);
        exitDuel();
        return;
      }
      if (event.expired) {
        if (typeof showToast === 'function') showToast('Duel room expired');
        exitDuel();
        return;
      }

      var data = event.data;
      if (!data) return;

      /* State transitions based on Firestore duel status */
      if (data.status === 'active' && _currentState !== 'active') {
        _enterActiveDuel(data);
        return;
      }
      if (data.status === 'completed' && _currentState !== 'results') {
        _enterResults(data);
        return;
      }

      /* Re-render waiting room with updated participant data */
      if (_currentState === 'waiting') {
        DuelUI.renderWaitingRoom(container, data);
      }

      /* During active play, update opponent's score in real-time */
      if (_currentState === 'active') {
        _handleActiveUpdate(data);
      }
    });

    /* Initial render — get current state */
    DuelCore.getDuelState(duelId, function (err, data) {
      if (err) {
        if (typeof showToast === 'function') showToast(err);
        exitDuel();
        return;
      }
      if (data.status === 'active') {
        _enterActiveDuel(data);
      } else if (data.status === 'completed') {
        _enterResults(data);
      } else {
        DuelUI.renderWaitingRoom(container, data);
      }
    });
  }

  var _joinInFlight = false;

  /**
   * Handle joining a duel from deep-link or invite.
   */
  function joinDuelById(duelId) {
    if (!_checkPremiumPlus()) return;
    if (_joinInFlight) return;
    
    _joinInFlight = true;
    if (typeof showToast === 'function') showToast('Joining duel…');

    DuelCore.joinDuel(duelId, function (err, data) {
      _joinInFlight = false;
      if (err) {
        if (typeof showToast === 'function') showToast(err);
        return;
      }
      enterWaitingRoom(duelId);
    });
  }

  /**
   * Leave current duel and return to practice.
   */
  function leaveDuel(duelId) {
    DuelCore.leaveDuel(duelId || _currentDuelId);
    exitDuel();
  }

  /**
   * Exit duel completely — cleanup and return to practice view.
   */
  function exitDuel() {
    DuelCore.stopListening();
    _unbindLifecycleCleanup();
    _currentDuelId = null;
    _currentState = null;
    _hideAllDuelScreens();
    document.body.classList.remove('drill-session-active');

    /* Restore bottom nav */
    var nav = document.querySelector('.bottom-nav');
    if (nav) nav.style.display = '';

    /* Hide numpad */
    if (typeof hideCustomNumpad === 'function') hideCustomNumpad();

    /* Return to practice view */
    if (typeof Router !== 'undefined' && Router.showView) {
      Router.showView('practice');
    }
  }

  /* ---- Internal State Transitions ---- */

  function _enterActiveDuel(duelData) {
    _currentState = 'active';
    _hideAllDuelScreens();
    var container = _getContainer('duelActiveScreen');
    if (!container) return;

    function _onAnswerSubmit(qIdx, answer, correct, timeMs) {
      /* Answer submitted — send to Firestore */
      DuelCore.submitAnswer(_currentDuelId, qIdx, answer, correct, timeMs, function (err) {
        if (err) console.warn('[Duel] Submit error:', err);
      });

      /* Short delay then render next question */
      setTimeout(function () {
        DuelCore.getDuelState(_currentDuelId, function (err, freshData) {
          if (err) return;
          if (freshData.status === 'completed') {
            _enterResults(freshData);
          } else {
            DuelUI.renderActiveScreen(container, freshData, _onAnswerSubmit);
          }
        });
      }, 600);
    }

    DuelUI.renderActiveScreen(container, duelData, _onAnswerSubmit);
  }

  function _handleActiveUpdate(duelData) {
    /* If duel completed while we're playing, show results */
    if (duelData.status === 'completed') {
      _enterResults(duelData);
      return;
    }

    /* Update opponent score display */
    var uid = (typeof Auth !== 'undefined') ? Auth.getUserId() : '';
    var participants = duelData.participants || {};
    var uids = Object.keys(participants);
    var opUid = uids.find(function (u) { return u !== uid; });
    var opP = opUid ? participants[opUid] : null;

    var opScoreEl = document.querySelectorAll('.duel-sb-score');
    if (opScoreEl.length >= 2 && opP) {
      opScoreEl[1].textContent = opP.score || 0;
    }
  }

  function _enterResults(duelData) {
    _currentState = 'results';
    DuelCore.stopListening();
    _hideAllDuelScreens();
    var container = _getContainer('duelResults');
    if (!container) return;
    DuelUI.renderResults(container, duelData);
  }

  /* ---- Helpers ---- */

  function _hideAllDuelScreens() {
    var ids = ['duelSetup', 'duelWaitingRoom', 'duelActiveScreen', 'duelResults'];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el) el.style.display = 'none';
    }
  }

  function _checkPremiumPlus() {
    if (typeof canAccessFeature === 'function' && canAccessFeature('math_duel')) {
      return true;
    }
    if (typeof showPaywall === 'function') showPaywall('math_duel');
    return false;
  }

  /* ---- Duel Lifecycle Safety Handlers ---- */
  /* Ensure Firestore listeners are cleaned up when the user navigates
     away from a duel via browser back button, popstate, or app backgrounding. */

  var _duelPopstateHandler = null;
  var _duelVisibilityHandler = null;

  function _bindLifecycleCleanup() {
    _unbindLifecycleCleanup(); /* Prevent duplicate listeners */

    _duelPopstateHandler = function () {
      if (_currentState && (_currentState === 'waiting' || _currentState === 'active')) {
        console.log('[DuelManager] popstate detected during active duel, cleaning up listeners');
        DuelCore.stopListening();
      }
    };
    window.addEventListener('popstate', _duelPopstateHandler);

    _duelVisibilityHandler = function () {
      /* When app goes to background during a duel, don't stop listening
         (user may come back), but log for diagnostics */
      if (document.visibilityState === 'hidden' && _currentState === 'active') {
        console.log('[DuelManager] app backgrounded during active duel');
      }
    };
    document.addEventListener('visibilitychange', _duelVisibilityHandler);
  }

  function _unbindLifecycleCleanup() {
    if (_duelPopstateHandler) {
      window.removeEventListener('popstate', _duelPopstateHandler);
      _duelPopstateHandler = null;
    }
    if (_duelVisibilityHandler) {
      document.removeEventListener('visibilitychange', _duelVisibilityHandler);
      _duelVisibilityHandler = null;
    }
  }

  /* ---- Deep-link Support ---- */

  function setPendingDuelId(id) { _pendingDuelId = id; }

  function consumePendingDuel() {
    var storedId = null;
    try { storedId = sessionStorage.getItem('qr_pending_duel'); } catch (_) {}
    var id = _pendingDuelId || storedId;
    if (!id) return;
    
    _pendingDuelId = null;
    try { sessionStorage.removeItem('qr_pending_duel'); } catch (_) {}
    
    joinDuelById(id);
  }

  function getCurrentState() { return _currentState; }
  function getCurrentDuelId() { return _currentDuelId; }

  return {
    openSetup: openSetup,
    enterWaitingRoom: enterWaitingRoom,
    joinDuelById: joinDuelById,
    leaveDuel: leaveDuel,
    exitDuel: exitDuel,
    setPendingDuelId: setPendingDuelId,
    consumePendingDuel: consumePendingDuel,
    getCurrentState: getCurrentState,
    getCurrentDuelId: getCurrentDuelId
  };
})();
