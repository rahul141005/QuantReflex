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
  var _myAnswerCache = {};   // ADR-064: { idx: {value, ms} } captured during solving for the post-match review
  var _myReview = null;      // ADR-064: [{i,a,y,c}] per-question review (correct answer + yours + right/wrong)
  var _serverOffset = 0;     // estimated (serverNow - clientNow) ms — anchors the countdown
  var _token = null;         // cached ID token for the finalize-on-leave keepalive beacon
  var _hbTimer = null, _deadlineTimer = null, _countTimer = null, _perqTimer = null;
  var _lobbyPollTimer = null, _recoverTimer = null, _lobbySig = '';   // presence-sync backstop + listener-recovery debounce (DR1)
  var _homeCardState = 'idle', _syncRetries = 0;   // in-place Home duel-card state + start-sync retry cap (Bug-2 / Bug-1)
  var _runner = null;        // light solving state { total, index } for the Submit-&-Leave counts
  var _lastAnswerWrite = null;   // promise of the most recent answer write — flushed before finalize (audit fix)
  var _solvePrompts = null;       // LOCKED question set for the active solve — snapshots can't clobber it (P0 guest-no-questions)
  var _engine = null;        // the reused Practice drill-engine instance (capture-only duel mode, ADR-033)
  var _finalizing = false;
  var _reconChecked = false;
  var _pendingDeepLink = null;

  function _el(id) { return document.getElementById(id); }
  function _premiumOk() { return (typeof canAccessFeature === 'function') ? canAccessFeature('math_duel') : true; }
  /* Math Duel is PWA-ONLY (ADR-038): real-time multiplayer needs the installed app — browser tabs don't run duels. */
  function _pwaOk() {
    try {
      if (document.body.classList.contains('pwa-mode')) return true;
      if (document.body.classList.contains('web-mode')) return false;
      return !!((window.matchMedia && (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches)) || navigator.standalone === true);
    } catch (_) { return true; }   // fail-open: never hard-block a legitimate installed user on a detection error
  }
  function _showInstallGate() {
    _phase = 'idle';
    var modal = _openSetupModal();
    if (!modal || typeof DuelUI.renderInstallGate !== 'function') { _toast('Open Math Duels inside the installed QuantReflex app.'); return; }
    DuelUI.renderInstallGate(modal, {
      onClose: _closeSetupModal,
      onInstall: function () {
        var dp = window._deferredPrompt;
        if (dp && dp.prompt) { try { dp.prompt(); dp.userChoice.then(function () { window._deferredPrompt = null; }); } catch (_) {} }
        else { _toast('In your browser menu, choose "Add to Home screen" to install QuantReflex.'); }
      }
    });
  }
  function _myUid() { return DuelCore.getMyUid(); }
  function _myName() {
    // ADR-063: use the canonical onboarding name (users/{uid}.profile.name), already cached in memory — the same
    // source the home greeting + drill share-card use. Email prefix is a LAST resort, never the primary identity.
    try {
      var c = (typeof FirestoreSync !== 'undefined' && FirestoreSync._getCache) ? FirestoreSync._getCache() : null;
      if (c && c.profile && c.profile.name && String(c.profile.name).trim()) return String(c.profile.name).trim();
    } catch (_) {}
    try {
      var s = (typeof AppState !== 'undefined' && AppState.getSettings) ? AppState.getSettings() : null;
      if (s && s.profile && s.profile.name && String(s.profile.name).trim()) return String(s.profile.name).trim();
    } catch (_) {}
    try { var u = (typeof Auth !== 'undefined') ? Auth.getCurrentUser() : null; if (u && u.email) return u.email.split('@')[0]; } catch (_) {}
    return 'Anonymous';
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

  /* Setup/Join render as a bottom-sheet MODAL over Home (no route switch) — the user configures a session, never
     navigates to another screen. Lobby/solving/waiting/results remain full duel-view screens. */
  function _openSetupModal() {
    var m = _el('duelSetupModal');
    if (m) { m.style.display = 'flex'; document.body.classList.add('modal-open'); }
    return m;
  }
  function _closeSetupModal(keepPhase) {
    var m = _el('duelSetupModal');
    if (m) { m.style.display = 'none'; m.innerHTML = ''; m.onclick = null; }
    document.body.classList.remove('modal-open');
    if (!keepPhase && (_phase === 'setup' || _phase === 'join')) _phase = 'idle';
  }

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
    if (!_pwaOk()) { _phase = 'idle'; refreshActiveCard(); return; }   // PWA-only: in a browser, never auto-enter a duel — just surface the Home card
    var uid = _myUid();
    var st = duel.status;
    if (st === 'lobby') { _enterLobby(code, duel); return; }
    if (st === 'complete') { _phase = 'idle'; refreshActiveCard(); return; }   // P0: a completed duel must NEVER hijack navigation on reopen — show the passive "Results ready" Home card; the user opens it intentionally
    if (st === 'active') {
      var myP = (duel.presence && duel.presence[uid]) ? duel.presence[uid] : null;
      var myState = myP ? myP.state : 'joined';
      if (myState === 'finished') { _enterWaiting(code, duel); return; }
      // Another device may be actively solving as this same uid — if our presence heartbeat is FRESH, do NOT
      // force-finalize (that stamps 'finished' and locks the live device out of answering — audit adversarial-04
      // / network-recovery-05). Leave the active duel to the other device; this one just returns to Home.
      var freshMs = (myP && myP.lastSeenAt) ? ((Date.now() + _serverOffset) - myP.lastSeenAt) : Infinity;
      if (myState === 'solving' && freshMs >= 0 && freshMs < 15000) { _toast('This duel is active on another device.'); exitToHome(true); return; }
      _finishMe('submitted_early');   // off the solving screen → finalize on the synced answers
      return;
    }
    refreshActiveCard();
  }

  /* ── Entry points (called from home view / deep link) ── */
  function openSetup() {
    if (!_pwaOk()) { _showInstallGate(); return; }
    if (!_premiumOk()) { _paywall(); return; }
    _phase = 'setup';
    var modal = _openSetupModal();
    DuelUI.renderSetup(modal, {
      onBack: _closeSetupModal,
      onCreate: function (config, done) {
        DuelCore.createDuel(config, _myName()).then(function (res) { _closeSetupModal(true); _enterLobby(res.code, res.duel); })
          .catch(function (e) { done && done(); _toast(_err(e)); if (e && e.code === 'DUEL_IN_PROGRESS' && e.payload && e.payload.code) { _closeSetupModal(true); DuelCore.fetchState(e.payload.code).then(function (r) { _routeRecovered(e.payload.code, r.duel, r.my); }).catch(function () {}); } });
      }
    });
  }
  function openJoinDuel() { _openJoinWith(null); }
  function _openJoinWith(prefill) {
    if (!_pwaOk()) { _showInstallGate(); return; }
    if (!_premiumOk()) { _paywall(); return; }
    _phase = 'join';
    var modal = _openSetupModal();
    DuelUI.renderJoin(modal, {
      onBack: _closeSetupModal,
      onSwitchToCreate: function () { _closeSetupModal(true); openSetup(); },
      onJoin: function (code, done) {
        DuelCore.joinDuel(code, _myName()).then(function (res) { _closeSetupModal(true); _enterLobby(res.code, res.duel); })
          .catch(function (e) { done && done(_err(e), e && e.code); });
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
    DuelCore.heartbeat(_code);   // lobby heartbeat — keep our presence.lastSeenAt fresh so the host's start-liveness check is trustworthy (audit room-occupancy-05 → -02)
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
        DuelCore.startDuel(_code).then(function (res) { _serverOffset = (res.serverNow || Date.now()) - Date.now(); _duel = res.duel; if (res.duel && res.duel.prompts && res.duel.prompts.length) _solvePrompts = res.duel.prompts.slice(); _beginCountdown(); })
          .catch(function (e) { done && done(); _toast(_err(e)); });
      },
      onLeave: function () {
        // Host abandons the room; a GUEST must call leaveLobby so the server removes them from participantUids +
        // presence + clears their activeDuelId (audit room-occupancy-01 — otherwise they're stranded as a ghost
        // participant, the room is bricked to replacements, and their next create is bounced DUEL_IN_PROGRESS).
        if (_duel.createdBy === uid) { if (_duel.status === 'lobby') DuelCore.abandonDuel(_code).catch(function () {}); }
        else { DuelCore.leaveLobby(_code).catch(function () {}); }
        exitToHome();
      }
    });
  }

  /* ── Countdown (server-anchored) ── */
  function _beginCountdown() {
    if (_phase === 'countdown' || _phase === 'solving') return;   // single-flight — a queued retry/reconnect must not restart the countdown (audit countdown-timer-02 / network-recovery-07)
    _phase = 'countdown';
    _syncRetries = 0;
    _cacheToken();   // cache the ID token early so the keepalive beacon has one even on a fast close (audit solving-exit-forfeit-05)
    _showContainer('duelActive', true);
    var c = _el('duelActive');
    c.innerHTML = '<div class="duel-countdown-overlay"><div id="duCount" class="duel-countdown-num">3</div></div>';
    if (_countTimer) clearInterval(_countTimer);
    var goAt = _duel.startedAt;   // server ms
    _countTimer = setInterval(function () {
      var remain = goAt - (Date.now() + _serverOffset);
      var el = _el('duCount');
      if (remain <= 0) { clearInterval(_countTimer); _countTimer = null; if (el && el.textContent !== 'GO!') { el.textContent = 'GO!'; _popCount(el); } setTimeout(_startSolving, 250); }
      else if (el) { var s = String(Math.min(3, Math.max(1, Math.ceil(remain / 1000)))); if (el.textContent !== s) { el.textContent = s; _popCount(el); } }
    }, 150);
  }
  /* Re-trigger the count-pop keyframe on each digit change (reflow forces a restart on the reused element). */
  function _popCount(el) { try { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; } catch (_) {} }

  /* ── Solving runner — REUSES the Practice drill-engine in capture-only mode (ADR-033). The duel adds ONLY the
     multiplayer header (opponent presence chip + Exit); the question container, answer input, custom numpad,
     action buttons, transitions and animations ARE the Practice components. The client has prompts only — it
     never grades; the server grades the answers we persist per question. ── */
  function _startSolving() {
    if (_phase === 'solving') return;
    // Read from the LOCKED question set captured at the active-transition (immune to snapshot clobber), falling back
    // to _duel.prompts. This is the P0 guarantee that the guest renders the SAME questions the host does.
    var src = (_solvePrompts && _solvePrompts.length) ? _solvePrompts : (_duel && _duel.prompts) || [];
    var prompts = src.slice().sort(function (a, b) { return a.index - b.index; });
    if (!prompts.length) {   // DR2 backstop — never run a 0-question engine; re-fetch the room, then retry (CAPPED)
      _syncRetries++;
      if (_syncRetries > 6) { _syncRetries = 0; _toast('Trouble loading the duel — check your connection.'); exitToHome(true); return; }   // surface, don't loop forever (audit question-delivery-03)
      _toast('Loading questions…');
      DuelCore.fetchState(_code).then(function (res) { if (res && res.duel) { _duel = res.duel; if (res.duel.prompts && res.duel.prompts.length) _solvePrompts = res.duel.prompts.slice(); if (res.serverNow) _serverOffset = res.serverNow - Date.now(); } setTimeout(_startSolving, 400); }).catch(function () { setTimeout(_startSolving, 800); });
      return;
    }
    _solvePrompts = prompts;   // lock the question set for this solve
    _phase = 'solving';
    _cacheToken();
    _runner = { total: prompts.length, index: 0 };   // light state for the Submit-&-Leave counts
    _lastAnswerWrite = null;
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
        _myAnswerCache[idx] = { value: raw == null ? '' : String(raw), ms: ms || 0 };   // ADR-064: for post-match review
        _lastAnswerWrite = DuelCore.writeAnswer(_code, idx, raw, ms);   // persist; track for the finalize flush
      },
      onFinish: function () { _finishMe('completed_all'); }
    });
    // Start the engine IMMEDIATELY — NEVER gate it on a network write. (A slow/hung presence write must never blank
    // the guest's screen — that was the guest-no-questions P0.) setPresence runs in parallel; the rules' first-answer
    // race is covered by writeAnswer's retry-on-permission-denied (it re-asserts presence + retries). A watchdog
    // re-starts the engine if the first question somehow didn't render.
    DuelCore.setPresence(_code, 'solving');
    try { _engine.start(); } catch (_) {}
    if (_perqTimer) { clearTimeout(_perqTimer); }
    _perqTimer = setTimeout(function () {
      if (_phase === 'solving' && _engine && !_el('duOppChip')) { try { _engine.start(); } catch (_) {} }   // #duOppChip is rendered by the duel header on first render → its absence means Q1 never rendered
    }, 1200);
  }

  /* The multiplayer header injected above the Practice question card on every render. Static structure; the live
     opponent state + Exit binding are (re)applied by _onDuelRender after each render. */
  function _duelHeaderHTML() {
    // ADR-063: a polished two-zone multiplayer header — opponent identity on the LEFT (~2/3), a compact Exit on
    // the RIGHT (~1/3). The left zone is structured (avatar slot + name + status) so an avatar / premium / league /
    // streak badge can slot in later WITHOUT another refactor. Live values are filled by _updateOppChip().
    return '<div class="duel-solve-header">' +
      '<div class="duel-opp">' +
        '<span id="duOppAvatar" class="duel-opp-avatar" aria-hidden="true">⚔</span>' +
        '<div class="duel-opp-info">' +
          '<span id="duOppName" class="duel-opp-name">Opponent</span>' +
          '<span id="duOppStatus" class="duel-opp-status"><span class="duel-opp-dot is-solving"></span>Solving</span>' +
        '</div>' +
      '</div>' +
      '<button id="duExit" class="duel-exit-btn" type="button">Exit</button>' +
    '</div>';
  }
  function _onDuelRender(container, index, total) {
    if (_runner) _runner.index = index;
    _updateOppChip();
    var ex = _el('duExit'); if (ex) ex.onclick = _promptExit;
  }

  function _updateOppChip() {
    if (_phase !== 'solving') return;
    var uid = _myUid();
    var opp = (_duel.participantUids || []).find(function (u) { return u !== uid; });
    var p = (opp && _duel.presence && _duel.presence[opp]) ? _duel.presence[opp] : null;
    var oppName = (p && p.name) ? p.name : 'Opponent';
    var finished = !!(p && p.state === 'finished');
    var nameEl = _el('duOppName'); if (nameEl) nameEl.textContent = oppName;            // textContent → XSS-safe
    var avEl = _el('duOppAvatar'); if (avEl) avEl.textContent = (oppName.trim()[0] || '⚔').toUpperCase();
    var stEl = _el('duOppStatus');
    if (stEl) stEl.innerHTML = '<span class="duel-opp-dot ' + (finished ? 'is-finished' : 'is-solving') + '"></span>' + (finished ? 'Finished' : 'Solving');
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
    var code = _code;
    // Flush the LAST answer write before finalizing, so completing the final question can't grade BEFORE its answer
    // commits (audit solving-exit-forfeit-02). Bounded by a 1.5s cap so a hung write never blocks finalize.
    var flush = Promise.race([
      Promise.resolve(_lastAnswerWrite).catch(function () {}),
      new Promise(function (r) { setTimeout(r, 1500); })
    ]);
    _teardownSolving();
    // ADR-064: a premium finish transition instead of a dead gap — branded "calculating" overlay held a minimum
    // beat so the result reveal feels intentional, never like the app is hanging.
    var oppName = _oppName();
    DuelUI.showCalculating(oppName);
    var minBeat = new Promise(function (r) { setTimeout(r, 900); });
    flush.then(function () { return DuelCore.finishDuel(code, reason); }).then(function (res) {
      _finalizing = false;
      _my = res.my || _my;
      _myReview = res.myReview || _myReview;
      if (res.duel) _duel = res.duel;
      minBeat.then(function () {
        if (res.complete) { DuelUI.hideCalculating(); _showResults(code, _duel); }
        else { DuelUI.hideCalculating(); _enterWaiting(code, _duel); }
      });
    }).catch(function (e) {
      _finalizing = false;
      minBeat.then(function () {
        DuelUI.hideCalculating();
        // Couldn't reach the server — go to waiting; the deadline/cron/opponent poll will finalize.
        _enterWaiting(code, _duel || { participantUids: [], presence: {} });
        _toast(_err(e));
      });
    });
  }

  /** Opponent display name (for the transition overlay), best-effort. */
  function _oppName() {
    try {
      var uid = _myUid();
      var opp = ((_duel && _duel.participantUids) || []).find(function (u) { return u !== uid; });
      return (opp && _duel.presence && _duel.presence[opp] && _duel.presence[opp].name) || 'your opponent';
    } catch (_) { return 'your opponent'; }
  }

  function _teardownSolving() {
    if (_hbTimer) { clearInterval(_hbTimer); _hbTimer = null; }
    if (_perqTimer) { clearInterval(_perqTimer); _perqTimer = null; }
    if (_countTimer) { clearInterval(_countTimer); _countTimer = null; }
    if (_recoverTimer) { clearTimeout(_recoverTimer); _recoverTimer = null; }   // no stale re-listen after teardown (audit adversarial-08)
    _stopLobbyPoll();
    if (_engine) { try { _engine.cleanup(); } catch (_) {} _engine = null; }
    _runner = null;
    if (typeof hideCustomNumpad === 'function') hideCustomNumpad();
    document.body.classList.remove('drill-session-active');
  }

  /* Best-effort finalize when the player leaves the solving screen (keepalive beacon). SOLVING ONLY — a close
     during the countdown has nothing answerable and must NOT finalize (audit network-recovery-01): it would record
     a 0-answer loss for a player who never saw a question. The server deadline + reopen-recovery resolve it. */
  function _finalizeOnLeave() {
    if (_phase !== 'solving' || !_code || _finalizing) return;
    try {
      fetch('/api/duel?action=finish', {
        method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (_token || ''), 'X-Session-Id': (window.Session ? Session.id() : '') },
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
    DuelUI.renderWaiting(_el('duelWaiting'), { opponentName: oppName, opponentState: oppP ? oppP.state : 'connecting', opponentStale: stale, onHome: function () { exitToHome(true); } });
  }
  /* RESILIENT waiting-phase finalize poll. On Spark there is no realtime reaper, so for a waiting player whose
     opponent abandoned, this poll is the ONLY thing that converts active→complete. It RE-ARMS on every tick
     (whether the fetch succeeds, returns still-active, or errors) until the room is terminal — so a single
     transient offline at the deadline can no longer strand the player forever (audit waiting-result-01 / -06 /
     mobile-ux-perf-08). It self-stops once _onSnapshot routes off the waiting phase (complete/abandoned). */
  function _armDeadlinePoll() {
    if (_deadlineTimer) { clearTimeout(_deadlineTimer); _deadlineTimer = null; }
    var firstDelay = 2000;
    if (_duel && _duel.totalDeadline) firstDelay = Math.max(2000, _duel.totalDeadline - (Date.now() + _serverOffset) + 1500);
    var tick = function () {
      if (_phase !== 'waiting') { _deadlineTimer = null; return; }
      DuelCore.fetchState(_code)
        .then(function (res) { if (res && res.duel) { if (res.serverNow) _serverOffset = res.serverNow - Date.now(); _onSnapshot({ data: res.duel }); } })   // refresh clock offset on reconnect (audit network-recovery-04)
        .catch(function () {})
        .then(function () { if (_phase === 'waiting') _deadlineTimer = setTimeout(tick, 8000); });   // keep polling ~8s until terminal
    };
    _deadlineTimer = setTimeout(tick, firstDelay);
  }

  /* ── Results ── */
  function _showResults(code, duel) {
    _code = code; _duel = duel; _phase = 'results';
    _teardownSolving();
    if (_deadlineTimer) { clearTimeout(_deadlineTimer); _deadlineTimer = null; }
    DuelCore.stopListening();
    _showNav();
    _showContainer('duelResults');
    _renderResults();
    refreshActiveCard();
    // ADR-068: a duel just completed locally → invalidate the Battle Archive cache so it reflects this result the
    // next time Home renders (or live, if the archive is currently expanded). Uses the existing completion moment —
    // no new listener, no extra read on the hot path.
    try { if (typeof DuelArchive !== 'undefined' && DuelArchive.onLocalDuelComplete) DuelArchive.onLocalDuelComplete(); } catch (_) {}
  }

  function _renderResults() {
    DuelUI.renderResults(_el('duelResults'), {
      duel: _duel, myUid: _myUid(),
      onReview: _openReview,                      // ADR-064: per-question match review
      onFinish: function () { _finishDuel(_code); }
    });
  }

  /* ADR-064: per-question review — merge prompts (text+category) + my cached answers + the server review
     (correct answer + right/wrong). Lazy-loads the review for the player who reached results via the listener. */
  function _openReview() {
    var go = function () {
      var dz = _duel || {};
      if ((!dz.prompts || !dz.prompts.length) && _solvePrompts && _solvePrompts.length) dz = Object.assign({}, dz, { prompts: _solvePrompts });
      DuelUI.renderReview(_el('duelResults'), {
        duel: dz, review: _myReview || [], myAnswers: _myAnswerCache,
        onBack: function () { _renderResults(); },
        onExplain: function (question, answer, category) {
          /* ADR-103: same free-explain allowance as the drill Explain button — a free user may attempt until the
             server reports exhaustion; the server is the true gate and opens the paywall on 403. */
          var _allowed = (typeof canOpenExplain === 'function') ? canOpenExplain()
            : ((typeof canAccessFeature !== 'function') || canAccessFeature('ai_explain'));
          if (!_allowed) { if (typeof showPaywall === 'function') showPaywall('ai_explain'); return; }
          /* ADR-098: pass a minimal report context so a "Report this explanation" from the duel-review sheet
             still carries the item (duels are server-authoritative — only text/answer/category are available). */
          if (typeof AIFeatures !== 'undefined' && AIFeatures.showExplanationModal) AIFeatures.showExplanationModal(question, answer, category, { question: { questionText: question, answer: answer, category: category, isDuel: true, mode: 'Duel' }, session: { mode: 'Duel', isDuel: true } });
        }
      });
    };
    if (_myReview && _myReview.length) { go(); return; }
    DuelUI.renderReviewLoading(_el('duelResults'));   // brief loader while we fetch own result
    DuelCore.fetchMyResult(_code).then(function (r) { _myReview = (r && r.review) || []; go(); }).catch(go);
  }

  /* Finish Duel — the ONLY exit from results (Rematch removed). The user must ESCAPE INSTANTLY and can NEVER hang on
     "Finishing…": do local cleanup + navigation FIRST and SYNCHRONOUSLY (each guarded so one failure can't block the
     others), then acknowledge. ackResult() records a DURABLE on-device tombstone SYNCHRONOUSLY (ADR-044) — so this
     duel can never resurrect on the next launch even if the background server mirror-clear never lands — then clears
     the server mirror best-effort in the background (never awaited). Idempotent. */
  function _finishDuel(code) {
    var theCode = code || _code;
    try { DuelCore.ackResult(theCode); } catch (_) {}   // durable tombstone (sync) + background server mirror clear (retry); the tombstone is what makes Finish permanent
    try { _resetState(); } catch (_) {}   // stops listener, clears all timers/poll/recover, nulls state, _phase='idle'
    try { exitToHome(); } catch (_) {}     // hides duel containers + routes Home + refreshActiveCard() → card idle
  }
  /* Hard escape hatch for the results-screen failsafe (and any "stuck" guard): nuke all duel state + go Home. */
  function forceReset() {
    try { _resetState(); } catch (_) {}
    try { exitToHome(); } catch (_) {}
  }

  /* ── Active-Duel home card (derived from current waiting/results state) ── */
  /* Active-Duel state mutates the EXISTING #homeDuelCard IN PLACE — no second floating card, Home hierarchy
     preserved (owner Bug-2). idle = "Challenge…" + Create/Join; active = "Waiting…/Results ready" + View. We only
     mutate when crossing idle⇄active, so the static card + home-view's wiring stay intact when there's no duel. */
  function refreshActiveCard() {
    var card = _el('homeDuelCard'); if (!card) return;
    var mode = null;
    if (_phase === 'lobby' && _duel && _duel.status === 'lobby') mode = 'lobby';
    else if (_phase === 'waiting') mode = 'waiting';
    else if (_phase === 'results' || (_duel && _duel.status === 'complete' && _code)) mode = 'results';
    if (mode) { _setHomeCardActive(card, mode); _homeCardState = 'active'; }
    else { if (_homeCardState === 'active') _setHomeCardIdle(card); _homeCardState = 'idle'; }
  }
  function _setHomeCardActive(card, mode) {
    var uid = _myUid();
    var opp = (_duel.participantUids || []).find(function (u) { return u !== uid; });
    var oppName = (opp && _duel.presence && _duel.presence[opp]) ? _duel.presence[opp].name : 'your opponent';
    var desc = card.querySelector('.home-bento-desc');
    var actions = card.querySelector('#homeDuelActions');
    var label, cta;
    if (mode === 'lobby') {
      var full = (_duel.participantUids || []).length >= 2;
      label = full ? ('Lobby ready · vs ' + oppName) : ('Lobby · code ' + (_code || '') + ' · waiting for a player');
      cta = 'Resume Lobby →';
    } else if (mode === 'results') {
      label = 'Results ready · vs ' + oppName; cta = 'View Results →';
    } else {
      label = 'Waiting for ' + oppName + ' to finish…'; cta = 'View Status →';
    }
    if (desc) desc.textContent = label;
    if (actions) {
      actions.innerHTML = '<button class="home-duel-btn btn-secondary home-duel-view" id="homeDuelView" type="button">' + cta + '</button>';
      var v = _el('homeDuelView'); if (v) v.onclick = _resumeActiveDuel;
    }
  }
  /* Resume whatever active duel the card points at — server status decides the screen (no resume into solving). */
  function _resumeActiveDuel() {
    if (!_pwaOk()) { _showInstallGate(); return; }
    if (!_code) { refreshActiveCard(); return; }
    DuelCore.fetchState(_code).then(function (res) {
      _serverOffset = (res.serverNow || Date.now()) - Date.now();
      var dd = res.duel;
      if (!dd) { _resetState(); refreshActiveCard(); return; }
      if (dd.status === 'abandoned' || dd.status === 'expired') { _toast('That duel has ended.'); _resetState(); exitToHome(); return; }
      if (dd.status === 'complete') { _duel = dd; _my = res.my || _my; _showResults(_code, dd); return; }   // INTENTIONAL open from the Home "Results ready" card
      _routeRecovered(_code, dd, res.my);
    }).catch(function () { _toast('Couldn’t reach the duel — check your connection.'); refreshActiveCard(); });   // don't blindly re-enter from stale _duel (audit arch-statemachine-05 / home-history-05)
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
    if (ev.removed) { _scheduleListenerRecovery(); return; }   // doc read-denied / participant-removed → attempt recovery, don't silently stall (audit realtime-sync-04)
    var d = ev.data; if (!d) return;
    // Sanitize: the raw doc may carry perPlayer only when complete (server keeps it off the doc until then).
    if (d && (!d.prompts || !d.prompts.length) && _solvePrompts && _solvePrompts.length) d.prompts = _solvePrompts;   // never let a snapshot blank the active question set (P0)
    _duel = d;
    var uid = _myUid();
    if (d.status === 'complete') { if (_phase !== 'results') _showResults(_code, d); return; }   // render results ONCE — never re-render on every snapshot (that rebinds the Finish button mid-click)
    if (d.status === 'abandoned' || d.status === 'expired') { _stopLobbyPoll(); _toast(d.abandonedReason === 'no_contest' ? 'Duel ended — no questions were answered.' : (d.createdBy === uid ? 'Duel ended.' : 'The host cancelled this duel.')); _resetState(); exitToHome(); return; }
    if (d.status === 'lobby') { if (_phase === 'lobby') { var lsig = _lobbySigOf(d); if (lsig !== _lobbySig) { _lobbySig = lsig; _renderLobby(); } } return; }   // re-render only on real change (audit realtime-sync-04)
    if (d.status === 'active') {
      if (_phase === 'lobby') { _stopLobbyPoll(); _onActiveFromLobby(); return; }
      if (_phase === 'solving' || _phase === 'countdown') { _updateOppChip(); return; }
      if (_phase === 'waiting') { var wsig = _lobbySigOf(d); if (wsig !== _lobbySig) { _lobbySig = wsig; _renderWaiting(); } return; }   // re-render only when opponent presence changed (audit realtime-sync-05)
    }
  }
  function _scheduleListenerRecovery() {
    if (_recoverTimer || !_code) return;   // debounce: one recovery in flight at a time
    _recoverTimer = setTimeout(function () {
      _recoverTimer = null;
      if (!_code) return;
      DuelCore.fetchState(_code).then(function (res) { if (res && res.duel) _onSnapshot({ data: res.duel }); }).catch(function () {});
      if (_phase === 'lobby' || _phase === 'waiting' || _phase === 'solving' || _phase === 'countdown') DuelCore.listen(_code, _onSnapshot);
      if (_phase === 'lobby' && !_lobbyPollTimer) _startLobbyPoll();   // ensure the 2s backstop survives a listener hiccup (audit realtime-sync-04)
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
      _solvePrompts = _duel.prompts.slice();   // P0: lock the guest's question set the moment we have it
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
    var _sm = _el('duelSetupModal'); if (_sm) { _sm.style.display = 'none'; _sm.innerHTML = ''; _sm.onclick = null; }   // no setup-modal ghost
    document.body.classList.remove('modal-open');
    _lobbySig = '';
    _code = null; _duel = null; _my = null; _solvePrompts = null; _phase = 'idle'; _finalizing = false;
    _myAnswerCache = {}; _myReview = null;   // ADR-064: clear post-match review state
  }

  function isInDuel() { return _phase !== 'idle'; }
  function getCurrentDuelId() { return _code; }

  /* Nav-away from a live duel view (lobby/waiting/results) via the bottom nav — stop ALL live sync (listener +
     polls + timers) but KEEP _code/_duel/_phase so the Home "Resume" card works (audit realtime-sync-02). Solving
     and countdown hide the nav, so suspend is never reached there. The internal duel re-renders do NOT call this
     (router gates it on target view !== 'duel'). */
  function suspend() {
    if (_phase === 'idle') return;
    // Leaving the RESULTS screen via the nav == finished — clear the completed duel so it never ghosts on Home.
    if (_phase === 'results') { DuelCore.ackResult(_code); _resetState(); return; }
    DuelCore.stopListening();
    _stopLobbyPoll();
    if (_deadlineTimer) { clearTimeout(_deadlineTimer); _deadlineTimer = null; }
    if (_recoverTimer) { clearTimeout(_recoverTimer); _recoverTimer = null; }
    if (_countTimer) { clearInterval(_countTimer); _countTimer = null; }
  }

  /* Browser/hardware Back during a duel. Returns true if handled (the router then absorbs the navigation). Solving
     → the Submit & Leave modal (never a silent un-submitted leave — audit solving-exit-forfeit-01); countdown →
     absorb it (the ~3.5s countdown finishes shortly, nothing answerable to leave). Lobby/waiting/results fall
     through to normal navigation, where suspend() tidies up. */
  function handleBackNav() {
    if (_phase === 'solving') { _promptExit(); return true; }
    if (_phase === 'countdown') { return true; }
    return false;
  }

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
    suspend: suspend,
    handleBackNav: handleBackNav,
    forceReset: forceReset,
    exitDuel: exitToHome
  };
})();
