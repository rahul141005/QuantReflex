/**
 * duel-manager.js — Math Duel lifecycle orchestrator (V3 — Room Code Only)
 *
 * Simplified rebuild:
 *   - Room-code-only flow (no invitations, no username lookup)
 *   - 5-state lifecycle: idle → setup → waiting → active → results
 *   - Stateful active duel: renders once, updates scoreboard via listener
 *   - Independent exit handling (partial results → realtime opponent updates)
 *   - Reconnection on app load (deduplicated)
 *   - Client-side countdown (3-2-1-GO!) — only creator calls startDuel
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
  var _activeDuelData = null;
  var _duelPhase = 'idle'; /* idle | setup | waiting | active | results */
  var _exitedEarly = false;
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

    /* Navigate to dedicated duel view */
    if (typeof Router !== 'undefined') Router.showView('duel');

    _duelPhase = 'setup';
    var container = _getEl('duelSetup');
    if (!container) return;

    /* Hide any active duel card */
    var activeCard = _getEl('activeDuelCard');
    if (activeCard) activeCard.style.display = 'none';

    DuelUI.renderSetup(container, function onBack() {
      _duelPhase = 'idle';
      if (typeof Router !== 'undefined') Router.showView('home');
    });
  }

  /**
   * Open the join duel screen (room code input).
   * Called from home view "Join Duel" button.
   */
  function openJoinDuel() {
    if (!_isPremiumPlus()) {
      if (typeof canAccessFeature !== 'undefined' && typeof showPremiumPlusModal === 'function') {
        showPremiumPlusModal('math_duel');
      } else if (typeof showToast === 'function') {
        showToast('Premium+ is required for Math Duel');
      }
      return;
    }

    /* Navigate to dedicated duel view */
    if (typeof Router !== 'undefined') Router.showView('duel');

    _duelPhase = 'setup';
    var container = _getEl('duelSetup');
    if (!container) return;

    DuelUI.renderJoinScreen(container, function onBack() {
      _duelPhase = 'idle';
      if (typeof Router !== 'undefined') Router.showView('home');
    });
  }

  /* ================================================================
   * WAITING ROOM — after creating a duel, waiting for opponent
   * ================================================================ */

  function enterWaitingRoom(duelId) {
    _currentDuelId = duelId;
    _duelPhase = 'waiting';
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

      /* Hide setup, show waiting screen */
      var setupEl = _getEl('duelSetup');
      if (setupEl) setupEl.style.display = 'none';

      var container = _getEl('duelWaiting');
      if (container) {
        DuelUI.renderWaitingRoom(container, data);
      }

      /* Hide bottom nav while in duel flow */
      var nav = document.querySelector('.bottom-nav');
      if (nav) nav.style.display = 'none';

      /* Start listening to duel updates */
      _startDuelListener(_currentDuelId);

      DuelEvents.emit('duel_created', { duelId: duelId });
    });
  }

  /* ================================================================
   * DUEL LISTENER — realtime state management
   * Handles all transitions from waiting → active → completed
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
          console.log('[DUEL TRACE] Listener state: waiting');
          /* Always render waiting room. Do NOT auto-start countdown.
             Host must explicitly click "Start Duel". */
          _renderWaitingRoom(data);
          break;

        case 'active':
          console.log('[DUEL TRACE] Listener state: active. screenRendered:', _duelScreenRendered, 'countdownRunning:', _countdownRunning, 'questions:', (data.questions || []).length);
          
          /* If local player is finished, DO NOT force jump. We wait for user to click View Results 
             which triggers onFinish('duel_ended'). Just update the scoreboard behind the scenes. */
          var myUid = (typeof Auth !== 'undefined') ? Auth.getUserId() : '';
          var myP = data.participants[myUid] || {};
          
          if (!_duelScreenRendered && !_countdownRunning) {
            _renderCountdown(data, function () {
              console.log('[DUEL TRACE] Countdown complete, entering active duel');
              _enterActiveDuel(data);
            });
          } else if (!_countdownRunning) {
            if (_duelScreenRendered) {
              /* Engine is already running. Just update scoreboard with opponent stats. */
              if (typeof DuelUI !== 'undefined') DuelUI.updateScoreboard(data);
            } else {
              _enterActiveDuel(data);
            }
          }
          break;

        case 'completed':
          _showResults(data, false);
          break;

        case 'expired':
        case 'abandoned':
        case 'cancelled':
          if (typeof showToast === 'function') showToast('Duel ended');
          exitDuel();
          break;
      }
    });
  }

  /* ================================================================
   * WAITING ROOM RENDER
   * ================================================================ */

  function _renderWaitingRoom(data) {
    if (_duelPhase === 'active' || _duelPhase === 'results') return;
    _duelPhase = 'waiting';

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
    console.log('[DUEL TRACE] _renderCountdown started');
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
    console.log('[DUEL TRACE] _enterActiveDuel initiated');
    if (_exitedEarly) {
      /* If player exited early, update partial results */
      console.log('[DUEL TRACE] _enterActiveDuel aborted: _exitedEarly');
      _showResults(data, true);
      return;
    }

    /* Check if already completed from player's perspective */
    var uid = (typeof Auth !== 'undefined') ? Auth.getUserId() : '';
    var myP = data.participants && data.participants[uid];
    if (myP && (myP.status === 'finished' || myP.status === 'exited')) {
      console.log('[DUEL TRACE] _enterActiveDuel aborted: player already finished');
      _showResults(data, true);
      return;
    }

    /* If active duel screen is already rendered, just update scoreboard */
    if (_duelScreenRendered && _duelPhase === 'active') {
      console.log('[DUEL TRACE] _enterActiveDuel: screen already rendered, updating scoreboard');
      DuelUI.updateScoreboard(data);
      return;
    }

    console.log('[DUEL TRACE] _enterActiveDuel: hiding old screens and rendering new active screen');
    _duelPhase = 'active';
    _duelScreenRendered = true;
    _hideAllDuelScreens();

    /* Ensure session-active classes for numpad */
    document.body.classList.add('drill-session-active');
    document.documentElement.classList.add('drill-session-active');

    /* Hide bottom nav */
    var nav = document.querySelector('.bottom-nav');
    if (nav) nav.style.display = 'none';

    if (typeof Router !== 'undefined') Router.showView('practice');

    var container = _getEl('drillContainer');
    if (!container) return;

    /* Hide practice modes wrapper so only the drill container shows */
    var pmWrapper = _getEl('practiceModesWrapper');
    if (pmWrapper) pmWrapper.style.display = 'none';

    /* Hide the practice header to prevent layout squeezing */
    var practiceHeader = document.querySelector('#view-practice header');
    if (practiceHeader) practiceHeader.style.display = 'none';

    container.style.display = 'block';

    var uid = (typeof Auth !== 'undefined') ? Auth.getUserId() : '';
    var myName = data.participants && data.participants[uid] ? (data.participants[uid].name || 'You') : 'You';
    var opUid = Object.keys(data.participants).find(function (u) { return u !== uid; });
    var opName = opUid && data.participants[opUid] ? (data.participants[opUid].name || 'Opponent') : 'Opponent';

    var headerHTML =
      '<div class="duel-scoreboard-wrapper" style="width:100%; max-width:800px; margin:0 auto; padding:0 1rem; position:relative;">' +
        '<button class="session-exit drill-exit-btn" id="drillExitBtn" aria-label="Exit session" title="Exit session" style="position:absolute; top:-35px; right:1rem; z-index:10; background:transparent; border:none; color:rgba(255,255,255,0.6); font-size:1.5rem; cursor:pointer;">✕</button>' +
        '<div class="duel-scoreboard" id="duelScoreboard" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; margin-top: 1rem; background:rgba(255,255,255,0.05); padding:1rem; border-radius:12px; border:1px solid rgba(255,255,255,0.1);">' +
          '<div class="duel-sb-player" style="flex:1; text-align:left; min-width:0;">' +
            '<div class="duel-sb-name" style="font-size:0.9rem; opacity:0.8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + myName + '</div>' +
            '<div class="duel-sb-score" id="duelMyScore" style="font-size:1.5rem; font-weight:700;">' + (data.participants[uid].score || 0) + '</div>' +
          '</div>' +
          '<div class="duel-sb-vs" style="font-size:1rem; opacity:0.5; font-weight:600; padding:0 1rem;">VS</div>' +
          '<div class="duel-sb-player" style="flex:1; text-align:right; min-width:0;">' +
            '<div class="duel-sb-name" style="font-size:0.9rem; opacity:0.8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + opName + '</div>' +
            '<div class="duel-sb-score" id="duelOpScore" style="font-size:1.5rem; font-weight:700;">' + (data.participants[opUid].score || 0) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    /* Map questions for DrillEngine */
    var mappedQuestions = (data.questions || []).map(function(q) {
      return {
        question: q.text,
        answer: q.answer,
        category: 'duel',
        subtype: 'duel'
      };
    });

    /* We use createDrillEngine from drill-engine.js natively */
    var engine = createDrillEngine(container, {
      count: mappedQuestions.length,
      timeLimitSec: data.config.timerTotal || null,
      perQuestionSec: data.config.timerPerQuestion || null,
      mode: 'Duel',
      isDuel: true,
      duelHeaderHTML: headerHTML,
      _preloadedQuestions: mappedQuestions,
      onFinish: function(state) {
        if (state === 'duel_ended') {
          console.log('[DUEL] DrillEngine finished questions.');
          _showResults(_activeDuelData, true);
        }
      },
      onDuelAnswerSubmit: function(correct, expected, timeMs, qObj, qIndex, advanceCb) {
        /* This is called by checkAnswer when the user taps Submit */
        /* Update local my score optimistically */
        var currentScore = parseInt(document.getElementById('duelMyScore').textContent || '0');
        if (correct) {
          document.getElementById('duelMyScore').textContent = currentScore + 1;
        }

        /* Submit answer exactly at the provided index */
        DuelCore.submitAnswer(data.id, qIndex, qObj.answer, correct, timeMs, function(err) {
          if (err) console.warn('[DuelManager] submitAnswer error:', err);
          /* The DrillEngine handles advancing locally */
        });
      }
    });

    engine.start();

    /* Make engine globally accessible for cleanup */
    window._activeDrillEngine = engine;

    console.log('[DUEL] Question Render Success via DrillEngine');

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

    /* Clean up active duel session via DrillEngine */
    if (window._activeDrillEngine) {
      window._activeDrillEngine.cleanup();
      window._activeDrillEngine = null;
    }
    _duelScreenRendered = false;

    _duelPhase = 'results';
    _hideAllDuelScreens();

    /* Remove session-active classes */
    document.body.classList.remove('drill-session-active');
    document.documentElement.classList.remove('drill-session-active');

    /* Show bottom nav */
    var nav = document.querySelector('.bottom-nav');
    if (nav) nav.style.display = '';

    /* Restore duel view */
    if (typeof Router !== 'undefined') Router.showView('duel');

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
      /* Populate counts */
      var solvedCount = 0;
      var totalCount = 0;
      if (_activeDuelData) {
        var uid = (typeof Auth !== 'undefined') ? Auth.getUserId() : '';
        var myP = _activeDuelData.participants && _activeDuelData.participants[uid];
        solvedCount = myP && myP.answers ? myP.answers.length : 0;
        totalCount = _activeDuelData.config && _activeDuelData.config.questionCount 
          ? _activeDuelData.config.questionCount 
          : (_activeDuelData.questions ? _activeDuelData.questions.length : 0);
      }
      /* Build Accuracy metrics */
      var myScore = _activeDuelData && _activeDuelData.participants && _activeDuelData.participants[uid] ? (_activeDuelData.participants[uid].score || 0) : 0;
      var accuracy = solvedCount > 0 ? Math.round((myScore / solvedCount) * 100) : 0;
      var remainingCount = Math.max(0, totalCount - solvedCount);

      modal.innerHTML = 
        '<div class="modal-content premium-modal">' +
          '<h3 style="font-size:1.5rem; margin-bottom:1rem;">Leave Duel?</h3>' +
          '<div style="background:rgba(255,255,255,0.05); padding:1rem; border-radius:12px; display:flex; justify-content:space-around; margin-bottom:1rem; text-align:center;">' +
            '<div><div style="font-size:1.5rem; font-weight:700;">' + myScore + '</div><div style="font-size:0.8rem; color:#94a3b8;">Score</div></div>' +
            '<div><div style="font-size:1.5rem; font-weight:700;">' + solvedCount + '</div><div style="font-size:0.8rem; color:#94a3b8;">Solved</div></div>' +
            '<div><div style="font-size:1.5rem; font-weight:700;">' + remainingCount + '</div><div style="font-size:0.8rem; color:#94a3b8;">Remaining</div></div>' +
            '<div><div style="font-size:1.5rem; font-weight:700; color:#4ade80;">' + accuracy + '%</div><div style="font-size:0.8rem; color:#94a3b8;">Accuracy</div></div>' +
          '</div>' +
          '<p style="color:#94a3b8; font-size:0.95rem; margin-bottom:1.5rem;">Leaving now will submit your current progress and end participation in this duel.</p>' +
          '<div class="modal-actions" style="display:flex; flex-direction:column; gap:0.5rem;">' +
            '<button class="btn btn-secondary" id="exitDuelCancel" style="width:100%;">Continue Duel</button>' +
            '<button class="btn btn-primary" id="exitDuelConfirm" style="width:100%; background:var(--color-accent); color:black;">Confirm Exit</button>' +
          '</div>' +
        '</div>';

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

    /* Clean up active session via DrillEngine */
    if (window._activeDrillEngine) {
      window._activeDrillEngine.cleanup();
      window._activeDrillEngine = null;
    }
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
    if (window._activeDrillEngine) {
      window._activeDrillEngine.cleanup();
      window._activeDrillEngine = null;
    }
    DuelCore.stopListening();

    _currentDuelId = null;
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

    /* Navigate back to home */
    if (typeof Router !== 'undefined') Router.showView('home');
  }

  /**
   * Leave duel (from waiting room) — cancel and exit.
   */
  function leaveDuel(duelId) {
    var id = duelId || _currentDuelId;
    if (id) {
      DuelCore.deleteDuel(id);
    }
    exitDuel();
  }

  /**
   * Return to Home screen without destroying the duel (e.g. from waiting room)
   */
  function returnToHome() {
    /* Hide all duel screens */
    _hideAllDuelScreens();
    /* Show bottom nav */
    var nav = document.querySelector('.bottom-nav');
    if (nav) nav.style.display = '';
    /* Navigate back to home */
    if (typeof Router !== 'undefined') Router.showView('home');
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
          if (typeof Router !== 'undefined') Router.showView('duel');
          _startDuelListener(data.id);
        } else if (data.status === 'waiting') {
          _duelPhase = 'waiting';
          if (typeof Router !== 'undefined') Router.showView('duel');
          _startDuelListener(data.id);
        } else if (data.status === 'completed') {
          _duelPhase = 'results';
          if (typeof Router !== 'undefined') Router.showView('duel');
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
    openJoinDuel: openJoinDuel,
    enterWaitingRoom: enterWaitingRoom,
    exitDuel: exitDuel,
    leaveDuel: leaveDuel,
    returnToHome: returnToHome,
    isInDuel: isInDuel,
    getCurrentDuelId: getCurrentDuelId,
    checkActiveDuel: checkActiveDuel,

    /* Exit dialog */
    showExitDuelDialog: showExitDuelDialog,

    /* Events (for future FCM hooks) */
    events: DuelEvents
  };
})();
