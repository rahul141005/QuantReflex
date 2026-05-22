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

  /* ---- Duel Loading Indicator ---- */

  function _showDuelLoading(msg) {
    var el = document.getElementById('duelPreview');
    if (!el) return;
    _hideAllDuelScreens();
    el.innerHTML =
      '<div class="duel-setup-card" style="text-align:center;">' +
        '<div class="duel-setup-header">' +
          '<h3>⚔️ Math Duel</h3>' +
          '<p>' + (msg || 'Loading…') + '</p>' +
        '</div>' +
        '<div class="duel-setup-body" style="padding:2rem;">' +
          '<div class="duel-waiting-indicator" style="margin:1rem 0;">' +
            '<span class="dot"></span><span class="dot"></span><span class="dot"></span>' +
          '</div>' +
        '</div>' +
      '</div>';
    el.style.display = 'flex';
  }

  function _hideDuelLoading() {
    var el = document.getElementById('duelPreview');
    if (el) el.style.display = 'none';
  }

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
    if (_currentState === 'waiting' && _currentDuelId === duelId) return;
    _currentDuelId = duelId;
    _currentState = 'waiting';
    try { localStorage.setItem('qr_active_duel', duelId); } catch (_) {}
    _updateActiveRoomCard(duelId);

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
      if (event.expired || event.data.status === 'deleted') {
        if (typeof showToast === 'function') showToast('Duel room was closed or expired');
        exitDuel();
        return;
      }

      var data = event.data;
      if (!data) return;

      /* Update persistent card */
      _updateActiveRoomCard(duelId, data);

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
    _showDuelLoading('Fetching duel info…');

    /* Timeout guard — if Firestore doesn't respond in 12s, abort */
    var _timedOut = false;
    var _timeout = setTimeout(function () {
      _timedOut = true;
      _joinInFlight = false;
      _hideDuelLoading();
      if (typeof showToast === 'function') showToast('Could not reach duel server. Try again.');
    }, 12000);

    DuelCore.getDuelState(duelId, function (err, data) {
      clearTimeout(_timeout);
      if (_timedOut) return; /* Already timed out, ignore late response */
      _hideDuelLoading();

      if (err) {
        _joinInFlight = false;
        if (typeof showToast === 'function') showToast(err);
        return;
      }
      if (!data || data.status !== 'waiting') {
        _joinInFlight = false;
        /* If user is already a participant, enter room directly */
        var uid = (typeof Auth !== 'undefined') ? Auth.getUserId() : null;
        if (data && data.participants && data.participants[uid]) {
          enterWaitingRoom(duelId);
          return;
        }
        if (typeof showToast === 'function') showToast('This duel is no longer available');
        return;
      }

      /* Show preview screen */
      var container = _getContainer('duelPreview');
      if (!container) { _joinInFlight = false; return; }

      var nav = document.querySelector('.bottom-nav');
      if (nav) nav.style.display = 'none';
      _hideAllDuelScreens();

      DuelUI.renderPreviewScreen(container, data, function () {
        /* onJoin */
        DuelCore.joinDuel(duelId, function (joinErr) {
          _joinInFlight = false;
          if (joinErr) {
            if (typeof showToast === 'function') showToast(joinErr);
            container.style.display = 'none';
            if (nav) nav.style.display = '';
            return;
          }
          container.style.display = 'none';
          enterWaitingRoom(duelId);
        });
      }, function () {
        /* onCancel */
        _joinInFlight = false;
        if (nav) nav.style.display = '';
      });
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
    if (typeof DuelUI !== 'undefined' && DuelUI.clearTimers) DuelUI.clearTimers();
    _unbindLifecycleCleanup();
    _currentDuelId = null;
    _currentState = null;
    try { localStorage.removeItem('qr_active_duel'); } catch (_) {}
    _updateActiveRoomCard(null);

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
    var ids = ['duelSetup', 'duelPreview', 'duelWaitingRoom', 'duelActiveScreen', 'duelResults'];
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

  /* ---- Persistent Room Card UX ---- */

  function _updateActiveRoomCard(duelId, duelData) {
    var container = _getContainer('activeDuelRoomContainer');
    if (!container) return;

    if (!duelId) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    
    var statusEl = _getContainer('activeDuelRoomStatus');
    var oppIcon = _getContainer('activeDuelRoomOpponentIndicator');
    var enterBtn = _getContainer('activeDuelEnterBtn');
    var shareBtn = _getContainer('activeDuelShareBtn');
    var delBtn = _getContainer('activeDuelDeleteBtn');

    if (!duelData) {
      if (statusEl) statusEl.textContent = 'Room active...';
      if (oppIcon) oppIcon.style.opacity = '0.5';
    } else {
      var pCount = duelData.participants ? Object.keys(duelData.participants).length : 0;
      if (statusEl) {
        if (duelData.status === 'active') statusEl.textContent = 'Duel in progress! ⚔️';
        else if (pCount >= 2) statusEl.textContent = 'Opponent joined, ready to start!';
        else statusEl.textContent = 'Waiting for opponent...';
      }
      if (oppIcon) {
        oppIcon.style.opacity = pCount >= 2 ? '1' : '0.5';
      }
      var pillsEl = _getContainer('activeDuelRoomPills');
      if (pillsEl && duelData.config) {
        var c = duelData.config;
        var timerStr = c.timerTotal ? c.timerTotal + 's total' : (c.timerPerQuestion ? c.timerPerQuestion + 's/q' : 'No timer');
        var modeStr = c.questionMode === 'wordproblems' ? '🤖 Word' : '⚡ Quick';
        pillsEl.innerHTML = 
          '<span class="duel-config-pill" style="padding:.15rem .4rem;font-size:.65rem;">📝 ' + (c.questionCount || 10) + ' Qs</span>' +
          '<span class="duel-config-pill" style="padding:.15rem .4rem;font-size:.65rem;">⏱ ' + timerStr + '</span>' +
          '<span class="duel-config-pill" style="padding:.15rem .4rem;font-size:.65rem;">' + modeStr + '</span>';
      }
    }

    if (enterBtn) {
      enterBtn.onclick = function() {
        if (_currentState) return; // Already in it
        enterWaitingRoom(duelId);
      };
    }
    if (shareBtn) {
      shareBtn.onclick = function() {
        var url = window.location.origin + window.location.pathname + '?duel=' + duelId;
        if (navigator.share) {
          navigator.share({ title: 'Math Duel Challenge', text: 'Join my Math Duel on QuantReflex!', url: url }).catch(function () {});
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(url).then(function () {
            if (typeof showToast === 'function') showToast('Invite link copied!');
          });
        }
      };
    }
    if (delBtn) {
      delBtn.onclick = function() {
        if (typeof showCustomConfirm === 'function') {
          showCustomConfirm('Delete this duel room?', function () {
            DuelCore.deleteDuel(duelId);
            exitDuel();
          });
        } else {
          DuelCore.deleteDuel(duelId);
          exitDuel();
        }
      };
    }
  }

  function checkActiveDuel() {
    var storedId = null;
    try { storedId = localStorage.getItem('qr_active_duel'); } catch (_) {}
    if (!storedId) {
      _updateActiveRoomCard(null);
      return;
    }
    
    /* Fetch state to see if it's still active */
    DuelCore.getDuelState(storedId, function (err, data) {
      if (err || !data || data.status === 'completed' || data.status === 'deleted') {
        try { localStorage.removeItem('qr_active_duel'); } catch (_) {}
        _updateActiveRoomCard(null);
        return;
      }
      _updateActiveRoomCard(storedId, data);
    });
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
        console.log('[DuelManager] popstate detected during active duel, performing full cleanup');
        /* Full exit — restores bottom nav, clears body classes, resets state */
        exitDuel();
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

    /* Navigate to practice view FIRST so duel containers are visible */
    if (typeof Router !== 'undefined' && Router.showView) {
      Router.showView('practice');
    }
    
    /* Small delay to let practice view render before showing preview */
    setTimeout(function () { joinDuelById(id); }, 120);
  }

  function hasPendingDuel() {
    if (_pendingDuelId) return true;
    try { return !!sessionStorage.getItem('qr_pending_duel'); } catch (_) { return false; }
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
    hasPendingDuel: hasPendingDuel,
    getCurrentState: getCurrentState,
    getCurrentDuelId: getCurrentDuelId,
    checkActiveDuel: checkActiveDuel
  };
})();
