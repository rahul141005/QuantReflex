/**
 * duel-manager.js — Duel V2 orchestrator + state machine + answerless solving runner (ADR-031).
 *
 * Server-authoritative: all outcomes come from api/duel via DuelCore. The client never grades. The four
 * lifecycle states are Active Duel → Submit & Leave → Waiting for Opponent → Results Ready. There is NO
 * resume/rejoin/continue-after-exit: leaving the solving screen is a finalized submission.
 *
 * Phases (in-memory): idle | setup | join | lobby | countdown | solving | waiting | results.
 */
var DuelManager = (function () {
  'use strict';

  var _phase = 'idle';
  var _code = null;
  var _duel = null;          // latest room view
  var _my = null;            // my graded result (when finished)
  var _serverOffset = 0;     // estimated (serverNow - clientNow) ms — anchors the countdown
  var _token = null;         // cached ID token for the finalize-on-leave keepalive beacon
  var _hbTimer = null, _deadlineTimer = null, _countTimer = null, _perqTimer = null;
  var _runner = null;        // light solving state { total, index } for the Submit-&-Leave counts
  var _engine = null;        // the reused Practice drill-engine instance (capture-only duel mode, ADR-033)
  var _finalizing = false;
  var _reconChecked = false;
  var _pendingDeepLink = null;

  function _el(id) { return document.getElementById(id); }
  function _premiumOk() { return (typeof canAccessFeature === 'function') ? canAccessFeature('math_duel') : true; }
  function _myUid() { return DuelCore.getMyUid(); }
  function _myName() {
    try {
      var s = (typeof AppState !== 'undefined' && AppState.getSettings) ? AppState.getSettings() : null;
      if (s && s.profile && s.profile.name) return s.profile.name;
    } catch (_) {}
    try { var p = (typeof FirestoreSync !== 'undefined' && FirestoreSync.getProfile) ? FirestoreSync.getProfile() : null; if (p && p.name) return p.name; } catch (_) {}
    try { var u = (typeof Auth !== 'undefined') ? Auth.getCurrentUser() : null; if (u && u.email) return u.email.split('@')[0]; } catch (_) {}
    return 'Player';
  }
  function _toast(m) { if (typeof showToast === 'function') showToast(m); }
  function _paywall() { if (typeof showPaywall === 'function') showPaywall('math_duel'); else _toast('Premium is required for Math Duel'); }

  /* ── View plumbing ── */
  var DUEL_CONTAINERS = ['duelSetup', 'duelPreview', 'duelWaiting', 'duelActive', 'duelResults'];
  function _showContainer(id, hideNav) {
    if (typeof Router !== 'undefined') Router.showView('duel');
    DUEL_CONTAINERS.forEach(function (c) { var el = _el(c); if (el) { if (c === id) { el.style.display = 'block'; } else { el.style.display = 'none'; el.innerHTML = ''; } } });
    var nav = document.querySelector('.bottom-nav'); if (nav) nav.style.display = hideNav ? 'none' : '';
  }
  function _showNav() { var nav = document.querySelector('.bottom-nav'); if (nav) nav.style.display = ''; }

  /* ── Init ── */
  function init() {
    // Finalize-on-leave fires ONLY on a real page unload (pagehide) — NOT on a brief background
    // (visibilitychange-hidden). A quick app-switch that returns keeps solving; a true close finalizes
    // (best-effort beacon), and the server deadline + reopen-finalize guarantee resolution either way.
    window.addEventListener('pagehide', _finalizeOnLeave);
    try { var m = (location.search || '').match(/[?&]duel=([A-Za-z0-9]+)/); if (m) _pendingDeepLink = m[1].toUpperCase(); } catch (_) {}
    if (typeof Auth !== 'undefined' && Auth.onAuthReady) {
      Auth.onAuthReady(function (user) { if (user && !_reconChecked) { _reconChecked = true; _recoverThenDeepLink(); } });
    }
  }

  function _recoverThenDeepLink() {
    DuelCore.recover().then(function (res) {
      if (res && res.code) { _serverOffset = (res.serverNow || Date.now()) - Date.now(); _routeRecovered(res.code, res.duel, res.my); }
      else if (_pendingDeepLink) { var c = _pendingDeepLink; _pendingDeepLink = null; _openJoinWith(c); }
      else { refreshActiveCard(); }
    }).catch(function () { if (_pendingDeepLink) { var c = _pendingDeepLink; _pendingDeepLink = null; _openJoinWith(c); } });
  }

  /* Recovery routing — never lands on the solving screen (no resume). */
  function _routeRecovered(code, duel, my) {
    _code = code; _duel = duel; _my = my || null;
    var uid = _myUid();
    var st = duel.status;
    if (st === 'lobby') { _enterLobby(code, duel); return; }
    if (st === 'complete') { _showResults(code, duel); return; }
    if (st === 'active') {
      var myState = (duel.presence && duel.presence[uid]) ? duel.presence[uid].state : 'joined';
      if (myState === 'finished') { _enterWaiting(code, duel); }
      else { _finishMe('submitted_early'); }   // off the solving screen → finalize on the synced answers
      return;
    }
    refreshActiveCard();
  }

  /* ── Entry points (called from home view / deep link) ── */
  function openSetup() {
    if (!_premiumOk()) { _paywall(); return; }
    _phase = 'setup';
    _showContainer('duelSetup');
    DuelUI.renderSetup(_el('duelSetup'), {
      onBack: exitToHome,
      onCreate: function (config, done) {
        DuelCore.createDuel(config, _myName()).then(function (res) { _enterLobby(res.code, res.duel); })
          .catch(function (e) { done && done(); _toast(_err(e)); if (e && e.code === 'DUEL_IN_PROGRESS' && e.payload && e.payload.code) { DuelCore.fetchState(e.payload.code).then(function (r) { _routeRecovered(e.payload.code, r.duel, r.my); }).catch(function () {}); } });
      }
    });
  }
  function openJoinDuel() { _openJoinWith(null); }
  function _openJoinWith(prefill) {
    if (!_premiumOk()) { _paywall(); return; }
    _phase = 'join';
    _showContainer('duelSetup');
    DuelUI.renderJoin(_el('duelSetup'), {
      onBack: exitToHome,
      onJoin: function (code, done) {
        DuelCore.joinDuel(code, _myName()).then(function (res) { _enterLobby(res.code, res.duel); })
          .catch(function (e) { done && done(_err(e)); });
      }
    });
    if (prefill) { var inp = _el('duJoinCode'); var btn = _el('duJoinBtn'); if (inp) inp.value = prefill; if (btn) setTimeout(function () { btn.click(); }, 50); }
  }

  /* ── Lobby ── */
  function _enterLobby(code, duel) {
    _code = code; _duel = duel; _phase = 'lobby';
    try { firebase.auth(); } catch (_) {}
    _renderLobby();
    DuelCore.listen(code, _onSnapshot);   // attach AFTER we have the room payload (join returns it)
    refreshActiveCard();
  }
  function _renderLobby() {
    _showContainer('duelPreview');
    var uid = _myUid();
    DuelUI.renderLobby(_el('duelPreview'), {
      duel: _duel, code: _code, myUid: uid, isHost: _duel.createdBy === uid,
      onStart: function (done) {
        DuelCore.startDuel(_code).then(function (res) { _serverOffset = (res.serverNow || Date.now()) - Date.now(); _duel = res.duel; _beginCountdown(); })
          .catch(function (e) { done && done(); _toast(_err(e)); });
      },
      onLeave: function () {
        if (_duel.createdBy === uid && _duel.status === 'lobby') { DuelCore.abandonDuel(_code).catch(function () {}); }
        exitToHome();
      }
    });
  }

  /* ── Countdown (server-anchored) ── */
  function _beginCountdown() {
    _phase = 'countdown';
    _showContainer('duelActive', true);
    var c = _el('duelActive');
    c.innerHTML = '<div class="duel-countdown-overlay"><div id="duCount" class="duel-countdown-num">3</div></div>';
    if (_countTimer) clearInterval(_countTimer);
    var goAt = _duel.startedAt;   // server ms
    _countTimer = setInterval(function () {
      var remain = goAt - (Date.now() + _serverOffset);
      var el = _el('duCount');
      if (remain <= 0) { clearInterval(_countTimer); _countTimer = null; if (el) el.textContent = 'GO!'; setTimeout(_startSolving, 250); }
      else if (el) { var s = Math.ceil(remain / 1000); el.textContent = String(Math.min(3, Math.max(1, s))); }
    }, 150);
  }

  /* ── Solving runner — REUSES the Practice drill-engine in capture-only mode (ADR-033). The duel adds ONLY the
     multiplayer header (opponent presence chip + Exit); the question container, answer input, custom numpad,
     action buttons, transitions and animations ARE the Practice components. The client has prompts only — it
     never grades; the server grades the answers we persist per question. ── */
  function _startSolving() {
    if (_phase === 'solving') return;
    _phase = 'solving';
    DuelCore.setPresence(_code, 'solving').catch(function () {});
    _cacheToken();
    var prompts = (_duel.prompts || []).slice().sort(function (a, b) { return a.index - b.index; });
    _runner = { total: prompts.length, index: 0 };   // light state for the Submit-&-Leave counts
    if (_hbTimer) clearInterval(_hbTimer);
    _hbTimer = setInterval(function () { DuelCore.heartbeat(_code); }, 10000);
    document.body.classList.add('drill-session-active');
    _showContainer('duelActive', true);
    var container = _el('duelActive');
    /* Engine question objects: TEXT ONLY (no `answer` — the key is server-only). */
    var qObjs = prompts.map(function (p) { return { question: p.text, category: p.category || null }; });
    if (_engine) { try { _engine.cleanup(); } catch (_) {} }
    _engine = createDrillEngine(container, {
      isDuel: true,
      count: qObjs.length,
      _preloadedQuestions: qObjs,
      perQuestionSec: (_duel.config && _duel.config.timerPerQuestion) || null,
      duelHeaderHTML: _duelHeaderHTML(),
      onDuelRender: _onDuelRender,
      onDuelAnswerSubmit: function (raw, ms, idx) {
        if (_runner) _runner.index = idx + 1;
        DuelCore.writeAnswer(_code, idx, raw, ms);   // persist to own doc; server grades at finalize
      },
      onFinish: function () { _finishMe('completed_all'); }
    });
    _engine.start();
  }

  /* The multiplayer header injected above the Practice question card on every render. Static structure; the live
     opponent state + Exit binding are (re)applied by _onDuelRender after each render. */
  function _duelHeaderHTML() {
    return '<div class="duel-solve-header">' +
      '<button id="duExit" class="btn btn-secondary btn-sm" type="button">Exit</button>' +
      '<span id="duOppChip" class="duel-opp-chip"></span>' +
    '</div>';
  }
  function _onDuelRender(container, index, total) {
    if (_runner) _runner.index = index;
    _updateOppChip();
    var ex = _el('duExit'); if (ex) ex.onclick = _promptExit;
  }

  function _oppChipHtml(name, state) {
    var cls = state === 'finished' ? 'is-finished' : 'is-solving';
    var label = state === 'finished' ? 'Finished' : 'Solving';
    return '<span class="duel-opp-dot ' + cls + '"></span><span>' + _escText(name) + ': ' + label + '</span>';
  }
  function _updateOppChip() {
    var el = _el('duOppChip'); if (!el || _phase !== 'solving') return;
    var uid = _myUid();
    var opp = (_duel.participantUids || []).find(function (u) { return u !== uid; });
    var oppName = (opp && _duel.presence && _duel.presence[opp]) ? _duel.presence[opp].name : 'Opponent';
    var oppState = (opp && _duel.presence && _duel.presence[opp]) ? _duel.presence[opp].state : 'solving';
    el.innerHTML = _oppChipHtml(oppName, oppState);
  }

  function _promptExit() {
    var answered = _runner ? _runner.index : 0;
    var total = _runner ? _runner.total : ((_duel && _duel.effectiveQuestionCount) || 0);
    DuelUI.showExitModal({
      answered: answered, total: total,
      onConfirm: function () { _finishMe('submitted_early'); },
      onCancel: function () { /* resume — the engine question stays rendered under the modal */ }
    });
  }

  /* ── Finalize (the caller only) ── */
  function _finishMe(reason) {
    if (_finalizing) return;
    _finalizing = true;
    _teardownSolving();
    DuelCore.finishDuel(_code, reason).then(function (res) {
      _finalizing = false;
      _my = res.my || _my;
      if (res.duel) _duel = res.duel;
      if (res.complete) { _showResults(_code, _duel); }
      else { _enterWaiting(_code, _duel); }
    }).catch(function (e) {
      _finalizing = false;
      // Couldn't reach the server — go to waiting; the deadline/cron/opponent poll will finalize.
      _enterWaiting(_code, _duel || { participantUids: [], presence: {} });
      _toast(_err(e));
    });
  }

  function _teardownSolving() {
    if (_hbTimer) { clearInterval(_hbTimer); _hbTimer = null; }
    if (_perqTimer) { clearInterval(_perqTimer); _perqTimer = null; }
    if (_countTimer) { clearInterval(_countTimer); _countTimer = null; }
    if (_engine) { try { _engine.cleanup(); } catch (_) {} _engine = null; }
    _runner = null;
    if (typeof hideCustomNumpad === 'function') hideCustomNumpad();
    document.body.classList.remove('drill-session-active');
  }

  /* Best-effort finalize when the player leaves the solving screen (keepalive beacon). */
  function _finalizeOnLeave() {
    if ((_phase !== 'solving' && _phase !== 'countdown') || !_code || _finalizing) return;
    try {
      fetch('/api/duel?action=finish', {
        method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (_token || '') },
        body: JSON.stringify({ code: _code, finishReason: 'submitted_early' })
      });
    } catch (_) {}
    // Local guard: we left solving — never resume it. Next reopen/recovery finalizes authoritatively.
  }
  function _cacheToken() {
    try { if (typeof Auth !== 'undefined' && Auth.getIdToken) Auth.getIdToken().then(function (t) { _token = t; }); } catch (_) {}
  }

  /* ── Finished-waiting ── */
  function _enterWaiting(code, duel) {
    _code = code; _duel = duel || _duel; _phase = 'waiting';
    _teardownSolving();
    _showNav();
    _renderWaiting();
    DuelCore.listen(code, _onSnapshot);
    _armDeadlinePoll();
    refreshActiveCard();
  }
  function _renderWaiting() {
    _showContainer('duelWaiting');
    var uid = _myUid();
    var opp = (_duel.participantUids || []).find(function (u) { return u !== uid; });
    var oppName = (opp && _duel.presence && _duel.presence[opp]) ? _duel.presence[opp].name : 'your opponent';
    var oppP = (opp && _duel.presence) ? _duel.presence[opp] : null;
    var stale = oppP && oppP.lastSeenAt && (Date.now() + _serverOffset - oppP.lastSeenAt > 30000);
    DuelUI.renderWaiting(_el('duelWaiting'), { opponentName: oppName, opponentState: oppP ? oppP.state : 'solving', opponentStale: stale, onHome: function () { exitToHome(true); } });
  }
  /* When the deadline passes with no opponent finish, poke ?action=state to force the server finalize. */
  function _armDeadlinePoll() {
    if (_deadlineTimer) { clearTimeout(_deadlineTimer); _deadlineTimer = null; }
    if (!_duel || !_duel.totalDeadline) return;
    var ms = _duel.totalDeadline - (Date.now() + _serverOffset) + 1500;
    var poll = function () { DuelCore.fetchState(_code).then(function (res) { if (res.duel) { _duel = res.duel; if (res.duel.status === 'complete') { _showResults(_code, res.duel); } } }).catch(function () {}); };
    _deadlineTimer = setTimeout(poll, Math.max(2000, ms));
  }

  /* ── Results ── */
  function _showResults(code, duel) {
    _code = code; _duel = duel; _phase = 'results';
    _teardownSolving();
    if (_deadlineTimer) { clearTimeout(_deadlineTimer); _deadlineTimer = null; }
    DuelCore.stopListening();
    _showNav();
    _showContainer('duelResults');
    DuelUI.renderResults(_el('duelResults'), {
      duel: duel, myUid: _myUid(),
      onRematch: function () { DuelCore.ackResult(code); _resetState(); openSetup(); /* fresh room; user re-confirms config */ },
      onShare: function () {},
      onDone: function () { DuelCore.ackResult(code); _resetState(); exitToHome(); }
    });
    refreshActiveCard();
  }

  /* ── Active-Duel home card (derived from current waiting/results state) ── */
  function refreshActiveCard() {
    var home = _el('view-home'); if (!home) return;
    var card = _el('homeActiveDuelCard');
    var show = (_phase === 'waiting') || (_phase === 'results') || (_duel && _duel.status === 'complete' && _phase !== 'idle');
    if (!show) { if (card) card.style.display = 'none'; return; }
    if (!card) { card = document.createElement('div'); card.id = 'homeActiveDuelCard'; card.style.cssText = 'padding:0 1rem;margin:.75rem 0;'; home.insertBefore(card, home.firstChild); }
    card.style.display = 'block';
    var uid = _myUid();
    var opp = (_duel.participantUids || []).find(function (u) { return u !== uid; });
    var oppName = (opp && _duel.presence && _duel.presence[opp]) ? _duel.presence[opp].name : 'opponent';
    var complete = _duel.status === 'complete';
    /* On-system home card (ADR-033): reuse .home-bento-card + the amber duel squircle (matches the static
       #homeDuelCard on the same screen) — no indigo. Keyboard-operable (role/tabindex/Enter-Space). */
    card.innerHTML =
      '<div id="duHomeCard" class="home-bento-card duel-active-card" role="button" tabindex="0" aria-label="Open active duel">' +
        '<div class="duel-active-card-row">' +
          '<div class="home-bento-icon-squircle icon-amber"><span class="home-bento-icon">⚔️</span></div>' +
          '<div class="duel-active-card-body"><div class="duel-active-card-title">Active Duel · vs ' + _escText(oppName) + '</div>' +
            '<div class="duel-active-card-sub">' + (complete ? 'Result ready' : 'Waiting for opponent to finish') + '</div></div>' +
          '<span class="duel-active-card-cta">' + (complete ? 'View Results' : 'View Status') + '</span>' +
        '</div>' +
      '</div>';
    var tap = _el('duHomeCard');
    if (tap) {
      var _openActive = function () {
        DuelCore.fetchState(_code).then(function (res) {
          _serverOffset = (res.serverNow || Date.now()) - Date.now();
          if (res.duel && res.duel.status === 'complete') _showResults(_code, res.duel);
          else { _duel = res.duel || _duel; _enterWaiting(_code, _duel); }
        }).catch(function () { if (_duel && _duel.status === 'complete') _showResults(_code, _duel); else _enterWaiting(_code, _duel); });
      };
      tap.onclick = _openActive;
      tap.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); _openActive(); } });
    }
  }

  /* ── Realtime snapshot routing ── */
  function _onSnapshot(ev) {
    if (ev.error) { return; }   // transient — keep current screen
    if (ev.removed) { return; }
    var d = ev.data; if (!d) return;
    // Sanitize: the raw doc may carry perPlayer only when complete (server keeps it off the doc until then).
    _duel = d;
    var uid = _myUid();
    if (d.status === 'complete') { if (_phase !== 'results') _showResults(_code, d); else DuelUI.renderResults(_el('duelResults'), { duel: d, myUid: uid, onRematch: function () { DuelCore.ackResult(_code); _phase = 'idle'; openSetup(); }, onShare: function () {}, onDone: function () { DuelCore.ackResult(_code); _resetState(); exitToHome(); } }); return; }
    if (d.status === 'abandoned' || d.status === 'expired') { _toast('Duel ended.'); _resetState(); exitToHome(); return; }
    if (d.status === 'lobby') { if (_phase === 'lobby') _renderLobby(); return; }
    if (d.status === 'active') {
      if (_phase === 'lobby') { _onActiveFromLobby(); return; }
      if (_phase === 'solving' || _phase === 'countdown') { _updateOppChip(); return; }
      if (_phase === 'waiting') { _renderWaiting(); return; }   // opponent presence/stale refresh
    }
  }
  function _onActiveFromLobby() {
    // The host started. Fetch state once for a fresh server-time offset + prompts, then count down.
    DuelCore.fetchState(_code).then(function (res) { _serverOffset = (res.serverNow || Date.now()) - Date.now(); _duel = res.duel; _beginCountdown(); })
      .catch(function () { _beginCountdown(); });
  }

  /* ── Exit / cleanup ── */
  function exitToHome(keepDuel) {
    if (!keepDuel) {
      // Leaving setup/join/lobby (not an active solving session) — tidy up.
      if (_phase === 'lobby' && _duel && _duel.createdBy === _myUid() && _duel.status === 'lobby') { /* abandon handled in onLeave */ }
      if (_phase === 'setup' || _phase === 'join' || _phase === 'idle' || _phase === 'lobby') { _resetState(); }
    }
    _teardownSolving();
    _showNav();
    DUEL_CONTAINERS.forEach(function (c) { var el = _el(c); if (el) { el.style.display = 'none'; el.innerHTML = ''; } });
    if (typeof Router !== 'undefined') Router.showView('home');
    refreshActiveCard();
  }
  function _resetState() {
    DuelCore.stopListening();
    if (_deadlineTimer) { clearTimeout(_deadlineTimer); _deadlineTimer = null; }
    _teardownSolving();
    _code = null; _duel = null; _my = null; _phase = 'idle'; _finalizing = false;
  }

  function isInDuel() { return _phase !== 'idle'; }
  function getCurrentDuelId() { return _code; }

  /* ── helpers ── */
  function _err(e) { return (e && e.message) ? e.message : 'Something went wrong. Try again.'; }
  function _escText(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]; }); }

  return {
    init: init,
    openSetup: openSetup,
    openJoinDuel: openJoinDuel,
    isInDuel: isInDuel,
    getCurrentDuelId: getCurrentDuelId,
    refreshActiveCard: refreshActiveCard,
    exitDuel: exitToHome
  };
})();
