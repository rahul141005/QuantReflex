/**
 * duel-manager.js — Math Duel lifecycle orchestrator (V2 — Stabilized)
 *
 * Complete rebuild with:
 *   - 10-state lifecycle management
 *   - Username-based invitation flow (send, listen, accept, reject)
 *   - Boot-time invitation listener (shows cards on Home tab)
 *   - Stateful active duel: renders once, updates scoreboard via listener
 *   - Independent exit handling (partial results → realtime opponent updates)
 *   - Reconnection on app load (deduplicated)
 *   - Client-side countdown (3-2-1-GO) — only creator calls startDuel
 *   - beforeunload cleanup for active duels
 *   - DuelEvents emitter for future FCM notification hooks
 *
 * Depends on DuelCore (Firestore ops) and DuelUI (rendering).
 * Premium+ gated.
 */

var DuelManager = (function () {
  'use strict';

  /* ---- State ---- */
  var _currentDuelId = null;
  var _currentInvitationId = null;
  var _activeDuelData = null;
  var _outgoingInviteListener = null;
  var _duelPhase = 'idle'; /* idle | setup | waiting_for_acceptance | waiting_room | active | results */
  var _exitedEarly = false;
  var _invitationListenerActive = false;
  var _reconnectionChecked = false;
  var _countdownRunning = false;
  var _duelScreenRendered = false; /* guard: renderActiveScreen called only once per duel */

  /* ---- DOM Refs ---- */
  function _getEl(id) { return document.getElementById(id); }

  /* ---- Premium+ Check ---- */
  function _isPremiumPlus() {
    return (typeof canAccessFeature === 'function') && canAccessFeature('math_duel');
  }

  /* ================================================================
   * DUEL EVENTS — Simple event emitter for notification hooks
   * Future FCM integration can subscribe to these events.
   * ================================================================ */

  var _eventHandlers = {};

  var DuelEvents = {
    on: function (event, handler) {
      if (!_eventHandlers[event]) _eventHandlers[event] = [];
      _eventHandlers[event].push(handler);
    },
    off: function (event, handler) {
      if (!_eventHandlers[event]) return;
      _eventHandlers[event] = _eventHandlers[event].filter(function (h) { return h !== handler; });
    },
    emit: function (event, data) {
      var handlers = _eventHandlers[event] || [];
      for (var i = 0; i < handlers.length; i++) {
        try { handlers[i](data); } catch (e) { console.warn('[DuelEvents] Handler error:', e); }
      }
    }
  };

  /* ================================================================
   * INITIALIZATION — called once on app boot from app.js
   * ================================================================ */

  function init() {
    /* Start listening for incoming invitations */
    _startInvitationListener();

    /* Check for active duel to reconnect */
    _checkReconnection();

    /* Register beforeunload handler for active duels */
    window.addEventListener('beforeunload', _handleBeforeUnload);
  }

  function _handleBeforeUnload() {
    if (_duelPhase === 'active' && _currentDuelId) {
      /* Attempt to mark player as exited before tab closes */
      DuelCore.exitDuelEarly(_currentDuelId);
    }
  }

  /* ================================================================
   * INVITATION LISTENER (boot-time)
   * Shows invitation banners on Home tab
   * ================================================================ */

  function _startInvitationListener() {
    if (_invitationListenerActive) return;

    /* Wait for auth to be ready */
    if (typeof Auth !== 'undefined' && typeof Auth.onAuthReady === 'function') {
      Auth.onAuthReady(function (user) {
        if (!user) return;
        _invitationListenerActive = true;

        DuelCore.listenToInvitations(function (invitations) {
          var banner = _getEl('duelInvitationBanner');
          if (!banner) return;
          DuelUI.renderInvitationBanner(banner, invitations);

          /* Emit event for each new invitation */
          if (invitations.length > 0) {
            DuelEvents.emit('invitation_received', invitations);
          }
        });

        /* Also update public username index on login */
        DuelCore.updatePublicUsername();
      });
    }
  }

  /* ================================================================
   * INVITATION HANDLING (from invitation banner)
   * ================================================================ */

  function handleInvitationAccept(invitation) {
    if (!_isPremiumPlus()) {
      if (typeof showToast === 'function') showToast('Premium+ is required for Math Duel');
      return;
    }

    DuelCore.acceptInvitation(invitation, function (err, duelData) {
      if (err) {
        if (typeof showToast === 'function') showToast(err);
        return;
      }

      /* Store active duel */
      _currentDuelId = invitation.duelId;
      _duelPhase = 'waiting_room';
      _duelScreenRendered = false;
      try { localStorage.setItem('qr_active_duel', _currentDuelId); } catch (_) {}

      /* Navigate to practice view and show waiting room */
      if (typeof Router !== 'undefined') Router.showView('practice');

      /* Start listening to duel updates */
      _startDuelListener(_currentDuelId);

      DuelEvents.emit('invitation_accepted', { duelId: invitation.duelId });
    });
  }

  function handleInvitationReject(invitation) {
    DuelCore.rejectInvitation(invitation, function (err) {
      if (err) {
        if (typeof showToast === 'function') showToast('Failed to decline: ' + err);
      }
    });
  }

  /* ================================================================
   * SETUP FLOW
   * ================================================================ */

  /**
   * Open the duel setup screen.
   * Called from home view / practice view duel button.
   */
  function openSetup() {
    if (!_isPremiumPlus()) {
      if (typeof canAccessFeature !== 'undefined' && typeof showPremiumPlusModal === 'function') {
        showPremiumPlusModal('math_duel');
      } else if (typeof showToast === 'function') {
        showToast('Premium+ is required for Math Duel');
      }
      return;
    }

    _duelPhase = 'setup';
    var container = _getEl('duelSetup');
    if (!container) return;

    /* Hide any active duel card */
    var activeCard = _getEl('activeDuelCard');
    if (activeCard) activeCard.style.display = 'none';

    DuelUI.renderSetup(container, function onBack() {
      _duelPhase = 'idle';
    });
  }

  /* ================================================================
   * WAITING FOR ACCEPTANCE (sender side)
   * After sendInvitation(), listen for accept/reject
   * ================================================================ */

  function enterWaitingForAcceptance(duelId, invitationId) {
    _currentDuelId = duelId;
    _currentInvitationId = invitationId;
    _duelPhase = 'waiting_for_acceptance';
    _duelScreenRendered = false;
    try { localStorage.setItem('qr_active_duel', duelId); } catch (_) {}

    /* Get duel data and render waiting screen */
    DuelCore.getDuelState(duelId, function (err, data) {
      if (err) {
        if (typeof showToast === 'function') showToast(err);
        exitDuel();
        return;
      }

      _activeDuelData = data;

      /* Hide setup, show waiting screen in practice container */
      var setupEl = _getEl('duelSetup');
      if (setupEl) setupEl.style.display = 'none';

      var container = _getEl('duelWaiting');
      if (container) {
        DuelUI.renderWaitingForAcceptance(container, data, invitationId);
      }

      /* Listen for invitation status changes */
      _stopOutgoingInviteListener();
      _outgoingInviteListener = DuelCore.listenToOutgoingInvitation(invitationId, function (event) {
        if (event.accepted) {
          _stopOutgoingInviteListener();
          /* Transition to waiting room */
          _duelPhase = 'waiting_room';
          _startDuelListener(duelId);
          DuelEvents.emit('invitation_accepted', { duelId: duelId });
        } else if (event.rejected) {
          _stopOutgoingInviteListener();
          if (typeof showToast === 'function') showToast('Your duel invitation was declined');
          exitDuel();
        } else if (event.expired || event.error) {
          _stopOutgoingInviteListener();
          if (typeof showToast === 'function') showToast('Invitation expired');
          exitDuel();
        }
      });
    });
  }

  function _stopOutgoingInviteListener() {
    if (_outgoingInviteListener) {
      _outgoingInviteListener();
      _outgoingInviteListener = null;
    }
  }

  /* ================================================================
   * DUEL LISTENER — realtime state management
   * Handles all transitions from waiting_room → active → completed
   * ================================================================ */

  function _startDuelListener(duelId) {
    DuelCore.listenToDuel(duelId, function (event) {
      if (event.error) {
        if (typeof showToast === 'function') showToast('Duel error: ' + event.error);
        exitDuel();
        return;
      }

      if (event.expired) {
        if (typeof showToast === 'function') showToast('Duel has expired');
        exitDuel();
        return;
      }

      var data = event.data;
      if (!data) return;

      _activeDuelData = data;

      /* Route to correct UI based on duel status */
      switch (data.status) {
        case 'waiting':
        case 'waiting_for_acceptance':
          /* Still waiting — keep current screen */
          break;

        case 'waiting_room':
        case 'ready':
          _renderWaitingRoom(data);
          break;

        case 'active':
          _enterActiveDuel(data);
          break;

        case 'completed':
          _showResults(data, false);
          break;

        case 'rejected':
          if (typeof showToast === 'function') showToast('Duel was declined');
          exitDuel();
          break;

        case 'expired':
        case 'abandoned':
        case 'deleted':
          if (typeof showToast === 'function') showToast('Duel ended');
          exitDuel();
          break;
      }
    });
  }

  /* ================================================================
   * WAITING ROOM
   * ================================================================ */

  function _renderWaitingRoom(data) {
    if (_duelPhase === 'active' || _duelPhase === 'results') return;
    _duelPhase = 'waiting_room';

    _hideAllDuelScreens();
    var container = _getEl('duelWaiting');
    if (container) {
      DuelUI.renderWaitingRoom(container, data);
    }

    /* Hide bottom nav while in duel flow */
    var nav = document.querySelector('.bottom-nav');
    if (nav) nav.style.display = 'none';
  }

  /* ================================================================
   * COUNTDOWN (3-2-1-GO!) — Client-side only
   * Only the creator calls DuelCore.startDuel() after countdown.
   * The other player's listener will pick up the status change.
   * ================================================================ */

  function _renderCountdown(data, callback) {
    if (_countdownRunning) return;
    _countdownRunning = true;
    _duelPhase = 'active';
    _hideAllDuelScreens();

    /* Use active container for countdown overlay */
    var container = _getEl('duelActive');
    if (container) {
      container.innerHTML =
        '<div class="duel-countdown-overlay" id="duelCountdownOverlay">' +
          '<div class="duel-countdown-number" id="duelCountdownNum">3</div>' +
        '</div>';
      container.style.display = 'flex';

      var num = 3;
      var countEl = document.getElementById('duelCountdownNum');
      var countInterval = setInterval(function () {
        num--;
        if (num > 0) {
          if (countEl) countEl.textContent = num;
        } else if (num === 0) {
          if (countEl) countEl.textContent = 'GO!';
        } else {
          clearInterval(countInterval);
          _countdownRunning = false;
          if (callback) callback();
        }
      }, 800);
    } else {
      _countdownRunning = false;
      if (callback) callback();
    }
  }

  /* ================================================================
   * ACTIVE DUEL — Stateful: renders once, listener only updates scoreboard
   * ================================================================ */

  function _enterActiveDuel(data) {
    if (_exitedEarly) {
      /* If player exited early, update partial results */
      _showResults(data, true);
      return;
    }

    /* Check if already completed from player's perspective */
    var uid = (typeof Auth !== 'undefined') ? Auth.getUserId() : '';
    var myP = data.participants && data.participants[uid];
    if (myP && (myP.status === 'finished' || myP.status === 'exited')) {
      _showResults(data, true);
      return;
    }

    /* If active duel screen is already rendered, just update scoreboard */
    if (_duelScreenRendered && _duelPhase === 'active') {
      DuelUI.updateScoreboard(data);
      return;
    }

    _duelPhase = 'active';
    _duelScreenRendered = true;
    _hideAllDuelScreens();

    /* Ensure session-active classes for numpad */
    document.body.classList.add('drill-session-active');
    document.documentElement.classList.add('drill-session-active');

    /* Hide bottom nav */
    var nav = document.querySelector('.bottom-nav');
    if (nav) nav.style.display = 'none';

    var container = _getEl('duelActive');
    if (!container) return;

    DuelUI.renderActiveScreen(container, data, function onAnswer(qIndex, answer, correct, timeMs) {
      DuelCore.submitAnswer(data.id, qIndex, answer, correct, timeMs, function (err) {
        if (err) console.warn('[DuelManager] submitAnswer error:', err);
      });
    });

    DuelEvents.emit('duel_started', { duelId: data.id });
  }

  /* ================================================================
   * RESULTS
   * ================================================================ */

  function _showResults(data, isPartial) {
    if (_duelPhase === 'results' && data.status !== 'completed') {
      /* Already showing results — update opponent info in place */
      var container = _getEl('duelResults');
      if (container) DuelUI.renderResults(container, data, isPartial && data.status !== 'completed');
      return;
    }

    /* Clean up active duel session */
    DuelUI.destroyDuelSession();
    _duelScreenRendered = false;

    _duelPhase = 'results';
    _hideAllDuelScreens();

    /* Remove session-active classes */
    document.body.classList.remove('drill-session-active');
    document.documentElement.classList.remove('drill-session-active');

    /* Show bottom nav */
    var nav = document.querySelector('.bottom-nav');
    if (nav) nav.style.display = '';

    /* Hide numpad */
    if (typeof hideCustomNumpad === 'function') hideCustomNumpad();

    var container = _getEl('duelResults');
    if (container) {
      DuelUI.renderResults(container, data, isPartial && data.status !== 'completed');
    }

    if (data.status === 'completed') {
      DuelEvents.emit('duel_completed', {
        duelId: data.id,
        winner: data.winner,
        result: data.result
      });
    }
  }

  /* ================================================================
   * EXIT DUEL
   * ================================================================ */

  /**
   * Show exit confirmation dialog during active duel.
   */
  function showExitDuelDialog() {
    var modal = _getEl('exitDuelModal');
    if (modal) {
      modal.style.display = 'flex';
      document.body.classList.add('modal-open');

      var cancelBtn = _getEl('exitDuelCancel');
      var confirmBtn = _getEl('exitDuelConfirm');

      if (cancelBtn) {
        cancelBtn.onclick = function () {
          modal.style.display = 'none';
          document.body.classList.remove('modal-open');
        };
      }

      if (confirmBtn) {
        confirmBtn.onclick = function () {
          modal.style.display = 'none';
          document.body.classList.remove('modal-open');
          _exitDuelEarly();
        };
      }
    }
  }

  /**
   * Exit duel early — sets participant status to 'exited', keeps listener active
   * to show partial results and receive opponent updates.
   */
  function _exitDuelEarly() {
    if (!_currentDuelId) return;
    _exitedEarly = true;

    /* Clean up active session */
    DuelUI.destroyDuelSession();
    _duelScreenRendered = false;

    /* Hide numpad */
    if (typeof hideCustomNumpad === 'function') hideCustomNumpad();

    DuelCore.exitDuelEarly(_currentDuelId, function (err, data) {
      if (err) {
        if (typeof showToast === 'function') showToast('Error exiting duel: ' + err);
        return;
      }
      /* Show partial results — listener will update when opponent finishes */
      if (_activeDuelData) _showResults(_activeDuelData, true);

      DuelEvents.emit('opponent_exited', { duelId: _currentDuelId });
    });
  }

  /**
   * Full exit — cleanup and return to practice view.
   */
  function exitDuel() {
    DuelUI.clearTimers();
    DuelUI.destroyDuelSession();
    _stopOutgoingInviteListener();
    DuelCore.stopListening();

    _currentDuelId = null;
    _currentInvitationId = null;
    _activeDuelData = null;
    _duelPhase = 'idle';
    _exitedEarly = false;
    _duelScreenRendered = false;
    _countdownRunning = false;

    try { localStorage.removeItem('qr_active_duel'); } catch (_) {}

    /* Remove session-active classes */
    document.body.classList.remove('drill-session-active');
    document.documentElement.classList.remove('drill-session-active');

    /* Show bottom nav */
    var nav = document.querySelector('.bottom-nav');
    if (nav) nav.style.display = '';

    /* Hide numpad BEFORE clearing screens */
    if (typeof hideCustomNumpad === 'function') hideCustomNumpad();

    /* Hide all duel screens */
    _hideAllDuelScreens();

    /* Navigate back to practice */
    if (typeof Router !== 'undefined') Router.showView('practice');
  }

  /**
   * Leave duel (from waiting room) — mark as exited and exit.
   */
  function leaveDuel(duelId) {
    var id = duelId || _currentDuelId;
    if (id) {
      /* Use exitDuelEarly instead of leaveDuel to set status to 'exited'
         which properly triggers completion check */
      DuelCore.exitDuelEarly(id, function () {});
    }
    exitDuel();
  }

  /* ================================================================
   * RECONNECTION (deduplicated)
   * ================================================================ */

  function _checkReconnection() {
    if (_reconnectionChecked) return;
    if (typeof Auth === 'undefined') return;

    Auth.onAuthReady(function (user) {
      if (!user || _reconnectionChecked) return;
      _reconnectionChecked = true;

      DuelCore.findActiveDuel(function (err, data) {
        if (err || !data) return;

        _currentDuelId = data.id;
        _activeDuelData = data;
        _duelScreenRendered = false;
        try { localStorage.setItem('qr_active_duel', data.id); } catch (_) {}

        /* Reconnect based on duel status */
        if (data.status === 'active') {
          _duelPhase = 'active';
          if (typeof Router !== 'undefined') Router.showView('practice');
          _startDuelListener(data.id);
        } else if (data.status === 'waiting_room' || data.status === 'ready') {
          _duelPhase = 'waiting_room';
          if (typeof Router !== 'undefined') Router.showView('practice');
          _startDuelListener(data.id);
        } else if (data.status === 'completed') {
          _duelPhase = 'results';
          if (typeof Router !== 'undefined') Router.showView('practice');
          _showResults(data, false);
        }
      });
    });
  }

  /* ================================================================
   * ACTIVE DUEL CARD (shown on practice view)
   * ================================================================ */

  function checkActiveDuel() {
    /* Called by practice view to show/hide the active duel card */
    var activeCard = _getEl('activeDuelCard');
    var storedId = null;
    try { storedId = localStorage.getItem('qr_active_duel'); } catch (_) {}

    if (storedId && activeCard && _duelPhase !== 'idle') {
      activeCard.style.display = 'block';
      activeCard.innerHTML =
        '<div class="card active-duel-mini-card" style="cursor:pointer;">' +
          '<div style="display:flex;align-items:center;gap:.5rem;">' +
            '<span style="font-size:1.3rem;">⚔️</span>' +
            '<div>' +
              '<div style="font-weight:600;">Active Duel</div>' +
              '<div class="secondary-text" style="font-size:.75rem;">Tap to rejoin</div>' +
            '</div>' +
          '</div>' +
        '</div>';
      activeCard.onclick = function () {
        if (_currentDuelId) _startDuelListener(_currentDuelId);
      };
    } else if (activeCard) {
      activeCard.style.display = 'none';
    }
  }

  /* ================================================================
   * UTILITIES
   * ================================================================ */

  function _hideAllDuelScreens() {
    /* Hide numpad first to prevent stale reference */
    if (typeof hideCustomNumpad === 'function') hideCustomNumpad();

    var screens = ['duelSetup', 'duelWaiting', 'duelActive', 'duelResults'];
    for (var i = 0; i < screens.length; i++) {
      var el = _getEl(screens[i]);
      if (el) { el.style.display = 'none'; el.innerHTML = ''; }
    }
  }

  function isInDuel() {
    return _duelPhase !== 'idle';
  }

  function getCurrentDuelId() {
    return _currentDuelId;
  }

  /* ================================================================
   * PUBLIC API
   * ================================================================ */

  return {
    init: init,
    openSetup: openSetup,
    exitDuel: exitDuel,
    leaveDuel: leaveDuel,
    isInDuel: isInDuel,
    getCurrentDuelId: getCurrentDuelId,
    checkActiveDuel: checkActiveDuel,

    /* Invitation handling */
    handleInvitationAccept: handleInvitationAccept,
    handleInvitationReject: handleInvitationReject,
    enterWaitingForAcceptance: enterWaitingForAcceptance,

    /* Exit dialog */
    showExitDuelDialog: showExitDuelDialog,

    /* Events (for future FCM hooks) */
    events: DuelEvents
  };
})();
