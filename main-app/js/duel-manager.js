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
  var _lobbyPollTimer = null, _recoverTimer = null, _lobbySig = '';   // presence-sync backstop + listener-recovery debounce (DR1)
  var _homeCardState = 'idle', _syncRetries = 0;   // in-place Home duel-card state + start-sync retry cap (Bug-2 / Bug-1)
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
    _lobbySig = _lobbySigOf(duel);
    _syncLobbyOnce();                      // DR1 — immediate authoritative refresh (covers a missed initial snapshot)
    _startLobbyPoll();                     // DR1 — ~2s backstop so the host sees the guest even if the listener hiccups
    refreshActiveCard();
  }

  /* DR1 — presence-sync robustness. The room onSnapshot stays the PRIMARY (instant) path; these guarantee the host
     sees the guest within ~2s even if a transient listener error is dropped, with no refresh. */
  function _lobbySigOf(d) {
    if (!d) return '';
    var uids = (d.participantUids || []).slice().sort();
    var states = uids.map(function (u) { return (d.presence && d.presence[u]) ? (u + ':' + d.presence[u].state) : (u + ':?'); });
    return (d.status || '') + '|' + states.join(',');
  }
  function _syncLobbyOnce() {
    if (!_code) return;
    DuelCore.fetchState(_code).then(function (res) {
      if (!res || !res.duel || _phase !== 'lobby') return;
      if (res.serverNow) _serverOffset = res.serverNow - Date.now();
      if (res.duel.status !== 'lobby') { _onSnapshot({ data: res.duel }); return; }   // host started while we polled
      var sig = _lobbySigOf(res.duel);
      _duel = res.duel;
      if (sig !== _lobbySig) { _lobbySig = sig; _renderLobby(); }
    }).catch(function () {});
  }
  function _startLobbyPoll() {
    _stopLobbyPoll();
    _lobbyPollTimer = setInterval(function () {
      if (_phase !== 'lobby') { _stopLobbyPoll(); return; }
      _syncLobbyOnce();
    }, 2000);
  }
  function _stopLobbyPoll() { if (_lobbyPollTimer) { clearInterval(_lobbyPollTimer); _lobbyPollTimer = null; } }
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
    _syncRetries = 0;
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
    var prompts = (_duel.prompts || []).slice().sort(function (a, b) { return a.index - b.index; });
    if (!prompts.length) {   // DR2 backstop — never run a 0-question engine; re-fetch the room, then retry
      _toast('Loading questions…');
      DuelCore.fetchState(_code).then(function (res) { if (res && res.duel) { _duel = res.duel; if (res.serverNow) _serverOffset = res.serverNow - Date.now(); } setTimeout(_startSolving, 400); }).catch(function () { setTimeout(_startSolving, 800); });
      return;
    }
    _phase = 'solving';
    DuelCore.setPresence(_code, 'solving').catch(function () {});
    _cacheToken();
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
      duelAllowSkip: !!(_duel.config && _duel.config.allowSkip),   /* host-set Skip toggle (default OFF) */
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
    _stopLobbyPoll();
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
  /* Active-Duel state mutates the EXISTING #homeDuelCard IN PLACE — no second floating card, Home hierarchy
     preserved (owner Bug-2). idle = "Challenge…" + Create/Join; active = "Waiting…/Results ready" + View. We only
     mutate when crossing idle⇄active, so the static card + home-view's wiring stay intact when there's no duel. */
  function refreshActiveCard() {
    var card = _el('homeDuelCard'); if (!card) return;
    var active = (_phase === 'waiting') || (_phase === 'results') || (_duel && _duel.status === 'complete' && _phase !== 'idle');
    if (active) { _setHomeCardActive(card); _homeCardState = 'active'; }
    else { if (_homeCardState === 'active') _setHomeCardIdle(card); _homeCardState = 'idle'; }
  }
  function _setHomeCardActive(card) {
    var uid = _myUid();
    var opp = (_duel.participantUids || []).find(function (u) { return u !== uid; });
    var oppName = (opp && _duel.presence && _duel.presence[opp]) ? _duel.presence[opp].name : 'your opponent';
    var complete = _duel.status === 'complete';
    var desc = card.querySelector('.home-bento-desc');
    var actions = card.querySelector('#homeDuelActions');
    if (desc) desc.textContent = complete ? ('Results ready · vs ' + oppName) : ('Waiting for ' + oppName + ' to finish…');
    if (actions) {
      actions.innerHTML = '<button class="home-duel-btn btn-secondary home-duel-view" id="homeDuelView" type="button">' + (complete ? 'View Results →' : 'View Status →') + '</button>';
      var v = _el('homeDuelView');
      if (v) v.onclick = function () {
        DuelCore.fetchState(_code).then(function (res) {
          _serverOffset = (res.serverNow || Date.now()) - Date.now();
          if (res.duel && res.duel.status === 'complete') _showResults(_code, res.duel);
          else { _duel = res.duel || _duel; _enterWaiting(_code, _duel); }
        }).catch(function () { if (_duel && _duel.status === 'complete') _showResults(_code, _duel); else _enterWaiting(_code, _duel); });
      };
    }
  }
  function _setHomeCardIdle(card) {
    var desc = card.querySelector('.home-bento-desc');
    var actions = card.querySelector('#homeDuelActions');
    if (desc) desc.textContent = 'Challenge anyone in real-time competitive math battles.';
    if (actions) {
      actions.innerHTML =
        '<button class="home-duel-btn btn-secondary home-duel-create" id="homeDuelCreate" type="button">Create Duel</button>' +
        '<button class="home-duel-btn btn-secondary home-duel-join" id="homeDuelJoin" type="button">Join Duel</button>';
      var c = _el('homeDuelCreate'); if (c) c.onclick = function () { openSetup(); };
      var j = _el('homeDuelJoin'); if (j) j.onclick = function () { openJoinDuel(); };
    }
  }

  /* ── Realtime snapshot routing ── */
  function _onSnapshot(ev) {
    if (ev.error) {
      console.warn('[Duel] listener error:', ev.error);
      _scheduleListenerRecovery();   // DR1 — never silently swallow; re-sync + re-attach once (debounced)
      return;
    }
    if (ev.removed) { return; }
    var d = ev.data; if (!d) return;
    // Sanitize: the raw doc may carry perPlayer only when complete (server keeps it off the doc until then).
    _duel = d;
    var uid = _myUid();
    if (d.status === 'complete') { if (_phase !== 'results') _showResults(_code, d); else DuelUI.renderResults(_el('duelResults'), { duel: d, myUid: uid, onRematch: function () { DuelCore.ackResult(_code); _resetState(); openSetup(); }, onShare: function () {}, onDone: function () { DuelCore.ackResult(_code); _resetState(); exitToHome(); } }); return; }
    if (d.status === 'abandoned' || d.status === 'expired') { _stopLobbyPoll(); _toast(d.createdBy === uid ? 'Duel ended.' : 'The host cancelled this duel.'); _resetState(); exitToHome(); return; }
    if (d.status === 'lobby') { if (_phase === 'lobby') { _lobbySig = _lobbySigOf(d); _renderLobby(); } return; }
    if (d.status === 'active') {
      if (_phase === 'lobby') { _stopLobbyPoll(); _onActiveFromLobby(); return; }
      if (_phase === 'solving' || _phase === 'countdown') { _updateOppChip(); return; }
      if (_phase === 'waiting') { _renderWaiting(); return; }   // opponent presence/stale refresh
    }
  }
  function _scheduleListenerRecovery() {
    if (_recoverTimer || !_code) return;   // debounce: one recovery in flight at a time
    _recoverTimer = setTimeout(function () {
      _recoverTimer = null;
      if (!_code) return;
      DuelCore.fetchState(_code).then(function (res) { if (res && res.duel) _onSnapshot({ data: res.duel }); }).catch(function () {});
      if (_phase === 'lobby' || _phase === 'waiting' || _phase === 'solving' || _phase === 'countdown') DuelCore.listen(_code, _onSnapshot);
    }, 1500);
  }
  function _onActiveFromLobby() {
    // The host started. Fetch a fresh server-time offset + the prompts, then count down. DR2: NEVER proceed with
    // empty prompts (that would build a 0-question engine) — re-sync and retry until the prompts are present.
    DuelCore.fetchState(_code).then(function (res) {
      if (!res || !res.duel) { _retryActiveFromLobby(); return; }
      _serverOffset = (res.serverNow || Date.now()) - Date.now();
      _duel = res.duel;
      if (!_duel.prompts || !_duel.prompts.length) { _retryActiveFromLobby(); return; }
      _beginCountdown();
    }).catch(function () { _retryActiveFromLobby(); });
  }
  function _retryActiveFromLobby() {
    if (_phase !== 'lobby' && _phase !== 'countdown') return;
    _syncRetries++;
    if (_syncRetries > 6) { _syncRetries = 0; _toast('Trouble reaching the duel — check your connection.'); return; }   // surface, don't loop forever
    _toast('Syncing with host…');
    setTimeout(function () { if (_phase === 'lobby' || _phase === 'countdown') _onActiveFromLobby(); }, 1200);
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
    if (_recoverTimer) { clearTimeout(_recoverTimer); _recoverTimer = null; }
    _teardownSolving();
    _lobbySig = '';
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
