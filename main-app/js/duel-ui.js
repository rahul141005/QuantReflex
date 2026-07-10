/**
 * duel-ui.js — Duel V2 screen renderers (ADR-031, redesigned). Premium §10A styling, NO inline indigo.
 *
 * Setup + Join render as `.training-card` bottom-sheet MODALS over Home (reusing Custom Training's slider,
 * category grid, and timer section — one design language). Lobby is split host vs guest. Solving reuses the
 * Practice drill-engine (in DuelManager). Hidden-until-results: the opponent surface is presence-only during play.
 * DuelManager owns all state; these are render helpers.
 */
var DuelUI = (function () {
  'use strict';

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]; }); }
  function _el(id) { return document.getElementById(id); }
  function _fmtCat(k) { return (typeof formatCategoryName === 'function') ? formatCategoryName(k) : String(k); }
  function _categoryEntries() {
    /* Derive the duel category list from the SINGLE source of truth (services/quantTopics.js) so every Quant drill
       category is duel-able and no stale snapshot can drift (ADR-084). */
    var labels = (typeof QuantTopics !== 'undefined' && QuantTopics.CATEGORY_LABELS) ? QuantTopics.CATEGORY_LABELS : {};
    return Object.keys(labels).map(function (k) { return { key: k, label: _fmtCat(k) }; });
  }
  function _initial(name) { var n = String(name || '?').trim(); return n ? n.charAt(0).toUpperCase() : '?'; }
  function _configSummary(cfg) {
    cfg = cfg || {};
    var bits = [_t('duel.sumQuestions', { count: cfg.questionCount || 0 }), _diff(cfg.difficulty || 'medium')];
    if (cfg.topics && cfg.topics.length) bits.push(cfg.topics.map(_fmtCat).join(', '));
    else bits.push(_t('duel.sumMixedTopics'));
    if (cfg.timerTotal) bits.push(_t('duel.sumTotalSecs', { s: cfg.timerTotal }));
    else if (cfg.timerPerQuestion) bits.push(_t('duel.sumPerQ', { s: cfg.timerPerQuestion }));
    else bits.push(_t('duel.sumNoTimer'));
    if (cfg.allowSkip) bits.push(_t('duel.sumSkipOn'));
    return bits.join(' · ');
  }
  function _cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  /* i18n (ADR-111): app-language channel; guarded for harness contexts without QRI18n. */
  function _t(k, prm) { return (typeof QRI18n !== 'undefined') ? QRI18n.t(k, prm) : k; }
  function _diff(d) { var m = { easy: 'settings.difficultyEasy', medium: 'settings.difficultyMedium', hard: 'settings.difficultyHard' }[String(d || '').toLowerCase()]; return m ? _t(m) : _cap(d); }

  /* ═════════════════ PWA-only install gate (ADR-038) ═════════════════ */
  function renderInstallGate(overlay, opts) {
    if (!overlay) return;
    var canInstall = !!(typeof window !== 'undefined' && window._deferredPrompt);
    overlay.style.display = 'flex';
    overlay.innerHTML =
      '<div class="training-card duel-sheet duel-sheet-compact" role="dialog" aria-modal="true" aria-label="' + _esc(_t('duel.installAria')) + '">' +
        '<div class="training-card-body duel-installgate">' +
          '<div class="duel-installgate-icon">⚔️</div>' +
          '<h3 class="duel-installgate-title">' + _esc(_t('duel.installTitle')) + '</h3>' +
          '<p class="secondary-text">' + _esc(_t('duel.installBody')) + '</p>' +
        '</div>' +
        '<div class="duel-sheet-footer">' +
          '<button id="duInstall" class="btn-primary duel-sheet-cta" type="button">' + (canInstall ? _esc(_t('duel.installCta')) : _esc(_t('duel.installHow'))) + '</button>' +
          '<button id="duGateClose" class="training-card-back" type="button">' + _esc(_t('duel.notNow')) + '</button>' +
        '</div>' +
      '</div>';
    overlay.onclick = function (e) { if (e.target === overlay) opts.onClose(); };
    var ib = _el('duInstall'); if (ib) ib.onclick = function () { if (opts.onInstall) opts.onInstall(); };
    var cb = _el('duGateClose'); if (cb) cb.onclick = function () { opts.onClose(); };
  }

  /* ═════════════════ Setup (create) — bottom-sheet modal ═════════════════ */
  function renderSetup(overlay, opts) {
    if (!overlay) { return; }
    var cats = _categoryEntries();
    overlay.style.display = 'flex';
    overlay.innerHTML =
      '<div class="training-card duel-sheet" role="dialog" aria-modal="true" aria-label="' + _esc(_t('duel.createAria')) + '">' +
        '<h3 class="category-select-title duel-sheet-title">⚔️ ' + _esc(_t('duel.createTitle')) + '</h3>' +
        '<div class="training-card-body duel-sheet-body">' +

          '<div class="duel-field">' +
            '<label class="duel-field-label">' + _esc(_t('duel.questionType')) + '</label>' +
            '<div class="timer-pill-selector" id="duType">' +
              '<button class="timer-pill active" data-type="quick" type="button">' + _esc(_t('duel.quickMath')) + '</button>' +
              '<button class="timer-pill" data-type="word" type="button">' + _esc(_t('duel.wordSoon')) + '</button>' +
            '</div>' +
          '</div>' +

          '<div class="duel-field">' +
            '<label class="duel-field-label" for="duCount">' + _esc(_t('duel.questionsLabel')) + '</label>' +
            '<input id="duCount" class="custom-question-range" type="range" min="5" max="50" value="20" />' +
            '<div class="custom-practice-meta-row"><strong id="duCountVal">20</strong>' +
              '<span class="secondary-text" id="duCountText">' + _esc(_t('practice.youWillSolve', { count: 20 })) + '</span></div>' +
          '</div>' +

          '<div class="duel-field">' +
            '<label class="duel-field-label">' + _esc(_t('drill.difficultyLbl')) + '</label>' +
            '<div class="timer-pill-selector" id="duDiff">' +
              '<button class="timer-pill" data-d="easy" type="button">' + _esc(_t('settings.difficultyEasy')) + '</button>' +
              '<button class="timer-pill active" data-d="medium" type="button">' + _esc(_t('settings.difficultyMedium')) + '</button>' +
              '<button class="timer-pill" data-d="hard" type="button">' + _esc(_t('settings.difficultyHard')) + '</button>' +
            '</div>' +
          '</div>' +

          '<div class="duel-field">' +
            '<label class="duel-field-label">' + _esc(_t('duel.topics')) + ' <span class="duel-field-hint">' + _esc(_t('duel.topicsHint')) + '</span></label>' +
            '<div class="category-grid duel-topic-grid" id="duTopics">' +
              cats.map(function (c) { return '<button class="category-btn category-card" type="button" data-cat="' + _esc(c.key) + '">' + _esc(c.label) + '</button>'; }).join('') +
            '</div>' +
          '</div>' +

          '<div class="timer-select-section" id="duTimerSection">' +
            '<div class="timer-toggle-row">' +
              '<span class="timer-toggle-label">' + _esc(_t('practice.timer')) + '</span>' +
              '<label class="toggle"><input type="checkbox" id="duTimerToggle" /><span class="toggle-slider"></span></label>' +
            '</div>' +
            '<div class="timer-config-area" id="duTimerArea" style="display:none;">' +
              '<div class="timer-pill-selector" id="duTimerPills">' +
                '<button class="timer-pill active" data-tmode="per" type="button">' + _esc(_t('practice.perQues')) + '</button>' +
                '<button class="timer-pill" data-tmode="total" type="button">' + _esc(_t('practice.total')) + '</button>' +
              '</div>' +
              '<div class="timer-input-row">' +
                '<input type="number" id="duTimerSec" class="timer-seconds-input" min="5" max="120" value="15" />' +
                '<span class="timer-unit-label">' + _esc(_t('practice.seconds')) + '</span>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div class="timer-select-section">' +
            '<div class="timer-toggle-row">' +
              '<span class="timer-toggle-label">' + _esc(_t('duel.skipQuestions')) + '</span>' +
              '<label class="toggle"><input type="checkbox" id="duSkipChk" /><span class="toggle-slider"></span></label>' +
            '</div>' +
            '<p class="duel-field-hint duel-skip-hint">' + _esc(_t('duel.skipOff')) + '</p>' +
          '</div>' +

        '</div>' +
        '<div class="duel-sheet-footer">' +
          '<button id="duCreateBtn" class="btn-primary duel-sheet-cta" type="button">' + _esc(_t('duel.createBtn')) + '</button>' +
          '<button id="duSetupBack" class="training-card-back" type="button">' + _esc(_t('modals.cancel')) + '</button>' +
        '</div>' +
      '</div>';

    overlay.onclick = function (e) { if (e.target === overlay) opts.onBack(); };

    var cfg = { questionCount: 20, difficulty: 'medium', topics: {}, allowSkip: false };

    // Question count slider
    var slider = _el('duCount');
    slider.addEventListener('input', function () {
      var v = parseInt(slider.value, 10); if (isNaN(v)) v = 20; v = Math.max(5, Math.min(50, v));
      cfg.questionCount = v;
      _el('duCountVal').textContent = String(v);
      _el('duCountText').textContent = _t('practice.youWillSolve', { count: v });
    });

    // Difficulty pills
    _pillGroup('duDiff', function (btn) { cfg.difficulty = btn.getAttribute('data-d'); });
    // Type pills — Quick Math is the only live option. Word Problems is intentionally staged: tapping it animates an
    // honest "selection" onto the pill, then slides/fades the selection back to Quick Math and opens the Coming Soon
    // modal. Quick Math stays selected (and _collectConfig always emits questionMode:'quick'), so there is no dead UI.
    var typeQuick = overlay.querySelector('#duType .timer-pill[data-type="quick"]');
    var typeWord = overlay.querySelector('#duType .timer-pill[data-type="word"]');
    if (typeWord && typeQuick) {
      var _wordReverting = false;
      typeWord.onclick = function () {
        if (_wordReverting) return;                 // guard against rapid re-taps mid-animation
        _wordReverting = true;
        typeQuick.classList.remove('active');        // animate selection onto Word Problems
        typeWord.classList.add('active');
        setTimeout(function () {
          typeWord.classList.remove('active');       // slide/fade selection back to Quick Math
          typeQuick.classList.add('active');
          _wordReverting = false;
          if (typeof showComingSoon === 'function') showComingSoon({ title: QRI18n.t('duel.wpDuelsTitle'), blurb: QRI18n.t('duel.wpDuelsBlurb') });
        }, 280);
      };
    }

    // Topics (toggle .selected, reusing Custom Training visuals)
    overlay.querySelectorAll('#duTopics .category-btn').forEach(function (b) {
      b.onclick = function () { var k = b.getAttribute('data-cat'); if (cfg.topics[k]) { delete cfg.topics[k]; b.classList.remove('selected'); } else { cfg.topics[k] = 1; b.classList.add('selected'); } };
    });

    // Timer
    var tToggle = _el('duTimerToggle'), tArea = _el('duTimerArea');
    tToggle.addEventListener('change', function () { tArea.style.display = tToggle.checked ? 'block' : 'none'; });
    _pillGroup('duTimerPills', function (btn) { var sec = _el('duTimerSec'); if (sec) sec.max = (btn.getAttribute('data-tmode') === 'per') ? '120' : '600'; });   // per-Q server clamp ≤120; total ≤600 (audit countdown-timer-04)

    // Skip hint
    var skip = _el('duSkipChk');
    skip.addEventListener('change', function () { var h = overlay.querySelector('.duel-skip-hint'); if (h) h.textContent = skip.checked ? _t('duel.skipOn') : _t('duel.skipOff'); });

    _el('duSetupBack').onclick = function () { opts.onBack(); };

    var createBtn = _el('duCreateBtn');
    createBtn.onclick = function () {
      createBtn.disabled = true; createBtn.textContent = _t('duel.creating');
      opts.onCreate(_collectConfig(cfg), function () { createBtn.disabled = false; createBtn.textContent = _t('duel.createBtn'); });
    };
  }

  function _collectConfig(cfg) {
    var timer = { timerPerQuestion: null, timerTotal: null };
    var tOn = _el('duTimerToggle') && _el('duTimerToggle').checked;
    if (tOn) {
      var active = document.querySelector('#duTimerPills .timer-pill.active');
      var mode = active ? active.getAttribute('data-tmode') : 'per';
      var secs = parseInt((_el('duTimerSec') || {}).value, 10); if (isNaN(secs) || secs <= 0) secs = 15;
      if (mode === 'total') timer.timerTotal = secs; else timer.timerPerQuestion = secs;
    }
    return {
      questionMode: 'quick',
      questionCount: cfg.questionCount,
      difficulty: cfg.difficulty,
      topics: Object.keys(cfg.topics),
      timerPerQuestion: timer.timerPerQuestion,
      timerTotal: timer.timerTotal,
      allowSkip: !!(_el('duSkipChk') && _el('duSkipChk').checked)
    };
  }

  /* generic single-select pill group (data-* preserved); onPick optional */
  function _pillGroup(id, onPick) {
    var group = _el(id); if (!group) return;
    group.querySelectorAll('.timer-pill').forEach(function (btn) {
      if (btn.disabled) return;
      btn.onclick = function () {
        group.querySelectorAll('.timer-pill').forEach(function (x) { x.classList.remove('active'); });
        btn.classList.add('active');
        if (onPick) onPick(btn);
      };
    });
  }

  /* ═════════════════ Join (by code) — modal ═════════════════ */
  function renderJoin(overlay, opts) {
    if (!overlay) return;
    overlay.style.display = 'flex';
    overlay.innerHTML =
      '<div class="training-card duel-sheet duel-sheet-compact" role="dialog" aria-modal="true" aria-label="' + _esc(_t('duel.joinAria')) + '">' +
        '<h3 class="category-select-title duel-sheet-title">' + _esc(_t('duel.joinTitle')) + '</h3>' +
        '<div class="training-card-body duel-sheet-body">' +
          '<p class="secondary-text duel-join-help">' + _esc(_t('duel.joinHelp')) + '</p>' +
          '<input id="duJoinCode" class="duel-join-input" inputmode="text" autocapitalize="characters" maxlength="6" placeholder="ABC123" />' +
          '<div id="duJoinErr" class="duel-join-err" role="alert"></div>' +
        '</div>' +
        '<div class="duel-sheet-footer">' +
          '<button id="duJoinBtn" class="btn-primary duel-sheet-cta" type="button">' + _esc(_t('duel.joinBtn')) + '</button>' +
          '<button id="duJoinBack" class="training-card-back" type="button">' + _esc(_t('modals.cancel')) + '</button>' +
        '</div>' +
      '</div>';
    overlay.onclick = function (e) { if (e.target === overlay) opts.onBack(); };
    var input = _el('duJoinCode'), btn = _el('duJoinBtn'), err = _el('duJoinErr');
    function go() {
      var code = (input.value || '').trim().toUpperCase();
      if (code.length < 4) { err.textContent = _t('duel.joinErr'); return; }
      err.textContent = ''; btn.disabled = true; btn.textContent = _t('duel.joining');
      opts.onJoin(code, function (msg, errCode) {
        btn.disabled = false; btn.textContent = _t('duel.joinBtn');
        if (errCode === 'ROOM_FULL') { _renderArenaFull(overlay, opts); return; }
        if (msg) err.textContent = msg;
      });
    }
    btn.onclick = go;
    _el('duJoinBack').onclick = function () { opts.onBack(); };
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    try { input.focus(); } catch (_) {}
  }

  function _renderArenaFull(overlay, opts) {
    overlay.innerHTML =
      '<div class="training-card duel-sheet duel-sheet-compact" role="dialog" aria-modal="true">' +
        '<div class="training-card-body duel-arena-full">' +
          '<div class="duel-arena-emoji">⚔️</div>' +
          '<h3 class="duel-arena-title">' + _esc(_t('duel.arenaFullTitle')) + '</h3>' +
          '<p class="secondary-text">' + _esc(_t('duel.arenaFullBody')) + '</p>' +
        '</div>' +
        '<div class="duel-sheet-footer">' +
          '<button id="duFullCreate" class="btn-primary duel-sheet-cta" type="button">' + _esc(_t('duel.createMyOwn')) + '</button>' +
          '<button id="duFullBack" class="training-card-back" type="button">' + _esc(_t('duel.back')) + '</button>' +
        '</div>' +
      '</div>';
    var c = _el('duFullCreate'); if (c) c.onclick = function () { if (opts.onSwitchToCreate) opts.onSwitchToCreate(); else opts.onBack(); };
    var b = _el('duFullBack'); if (b) b.onclick = function () { opts.onBack(); };
  }

  /* ═════════════════ Lobby (host / guest split) ═════════════════ */
  function renderLobby(container, opts) {
    var d = opts.duel || {}, code = opts.code, isHost = opts.isHost;
    var uids = d.participantUids || [];
    var opp = uids.find(function (u) { return u !== opts.myUid; });
    var oppName = (opp && d.presence && d.presence[opp]) ? d.presence[opp].name : null;
    var hostUid = d.createdBy;
    var hostName = (d.presence && d.presence[hostUid]) ? d.presence[hostUid].name : 'Host';
    var full = uids.length >= 2;
    container.style.display = 'block';
    container.innerHTML = isHost ? _lobbyHost(d, code, opts, opp, oppName, full) : _lobbyGuest(d, hostName, full);
    _wireLobby(container, opts, code, isHost);
  }

  function _lobbyHost(d, code, opts, opp, oppName, full) {
    return '<div class="duel-screen"><div class="duel-card">' +
      '<div class="duel-vs-head">⚔️ Math Duel</div>' +
      '<div class="duel-roomcode-block">' +
        '<div class="duel-roomcode-label">' + _esc(_t('duel.roomCode')) + '</div>' +
        '<div class="duel-roomcode" id="duCode">' + _esc(code) + '</div>' +
        '<div class="duel-share-row">' +
          '<button id="duCopy" class="duel-share-btn" type="button">' + _esc(_t('duel.copy')) + '</button>' +
          '<button id="duWhats" class="duel-share-btn" type="button">WhatsApp</button>' +
        '</div>' +
      '</div>' +
      '<div class="duel-slots">' +
        _slot(_t('share.you'), 'is-you', true, _t('duel.hostConnected')) +
        (full ? _slot(oppName || _t('duel.player2'), 'is-filled', true, _t('duel.connected')) : _slotWaiting()) +
      '</div>' +
      '<div class="duel-config-summary">' + _esc(_configSummary(d.config)) + '</div>' +
      '<button id="duStart" class="btn-primary duel-cta" type="button"' + (full ? '' : ' disabled') + '>' + (full ? _esc(_t('duel.startDuel')) : _esc(_t('duel.waitingOpponent'))) + '</button>' +
      '<button id="duLeave" class="duel-leave-link" type="button">' + _esc(_t('duel.leaveDuel')) + '</button>' +
    '</div></div>';
  }

  function _lobbyGuest(d, hostName, full) {
    return '<div class="duel-screen"><div class="duel-card">' +
      '<div class="duel-joined-badge">✓ ' + _esc(_t('duel.joinedOk')) + '</div>' +
      '<div class="duel-vs-head">' + _esc(_t('duel.vs')) + ' ' + _esc(hostName) + '</div>' +
      '<div class="duel-slots">' +
        _slot(hostName, 'is-filled', true, _t('duel.hostConnected')) +
        _slot(_t('share.you'), 'is-you', true, _t('duel.connected')) +
      '</div>' +
      '<div class="duel-section-label">' + _esc(_t('duel.matchSettings')) + '</div>' +
      '<div class="duel-config-summary">' + _esc(_configSummary(d.config)) + '</div>' +
      '<div class="duel-waiting-host"><span class="duel-pulse-dot"></span> ' + _esc(_t('duel.waitingHost')) + '</div>' +
      '<button id="duLeave" class="duel-leave-link" type="button">' + _esc(_t('duel.leaveDuel')) + '</button>' +
    '</div></div>';
  }

  function _slot(name, mod, connected, status) {
    return '<div class="duel-slot ' + mod + '">' +
      '<span class="duel-avatar">' + _esc(_initial(name)) + '</span>' +
      '<span class="duel-slot-name">' + _esc(name) + '</span>' +
      '<span class="duel-slot-status' + (connected ? ' is-on' : '') + '">' + _esc(status) + '</span>' +
    '</div>';
  }
  function _slotWaiting() {
    return '<div class="duel-slot is-empty">' +
      '<span class="duel-avatar is-empty">?</span>' +
      '<span class="duel-slot-name">' + _esc(_t('duel.waitingPlayer2')) + '</span>' +
      '<span class="duel-slot-status"><span class="duel-pulse-dot"></span> ' + _esc(_t('duel.open')) + '</span>' +
    '</div>';
  }

  function _wireLobby(container, opts, code, isHost) {
    if (isHost) {
      var inviteText = _t('duel.inviteText', { code: code, url: _inviteUrl(code) });
      var copyBtn = _el('duCopy'); if (copyBtn) copyBtn.onclick = function () { _copy(code); copyBtn.textContent = _t('duel.copied'); setTimeout(function () { copyBtn.textContent = _t('duel.copy'); }, 1500); };
      var wBtn = _el('duWhats'); if (wBtn) wBtn.onclick = function () { window.open('https://wa.me/?text=' + encodeURIComponent(inviteText), '_blank'); };
      var startBtn = _el('duStart'); if (startBtn && !startBtn.disabled) startBtn.onclick = function () { startBtn.disabled = true; startBtn.textContent = _t('duel.starting'); opts.onStart(function () { startBtn.disabled = false; startBtn.textContent = _t('duel.startDuel'); }); };
    }
    var leaveBtn = _el('duLeave'); if (leaveBtn) leaveBtn.onclick = opts.onLeave;
  }

  /* ═════════════════ Finished-waiting ═════════════════ */
  function renderWaiting(container, opts) {
    var oppName = opts.opponentName || _t('duel.yourOpponent');
    var oppState = opts.opponentState || 'connecting';
    var connecting = oppState === 'connecting';   // presence unknown → neutral, don't claim "Solving…" (audit waiting-result-05)
    var chipCls = oppState === 'finished' ? 'is-finished' : ((opts.opponentStale || connecting) ? 'is-stale' : 'is-solving');
    var chip = oppState === 'finished' ? _t('duel.chipFinished') : (connecting ? _t('duel.chipConnecting') : (opts.opponentStale ? _t('duel.chipReconnecting') : _t('duel.chipSolving')));
    container.style.display = 'block';
    container.innerHTML =
      '<div class="duel-screen"><div class="duel-card duel-waiting-card">' +
        '<span class="duel-avatar lg ' + chipCls + '">' + _esc(_initial(oppName)) + '</span>' +
        '<h2 class="duel-waiting-title">' + _t('duel.waitingForName', { name: _esc(oppName) }) + '</h2>' +
        '<p class="duel-waiting-sub">' + _t('duel.resultsUnlock', { name: _esc(oppName) }) + '</p>' +
        '<div class="duel-opp-status"><span class="duel-opp-dot ' + chipCls + '"></span>' + _esc(oppName) + ': ' + chip + '</div>' +
        '<button id="duHome" class="duel-leave-link" type="button">' + _esc(_t('duel.returnHome')) + '</button>' +
      '</div></div>';
    var home = _el('duHome'); if (home) home.onclick = opts.onHome;
  }

  /* ═════════════════ Results (premium head-to-head, §10A) ═════════════════ */
  function renderResults(container, opts) {
    var d = opts.duel || {}, myUid = opts.myUid;
    var uids = d.participantUids || [];
    var opp = uids.find(function (u) { return u !== myUid; });
    var per = d.perPlayer || {};
    var me = per[myUid] || { correctCount: 0, totalSolveMs: 0, answeredCount: 0 };
    var op = per[opp] || { correctCount: 0, totalSolveMs: 0, answeredCount: 0 };
    var myName = (d.presence && d.presence[myUid] && d.presence[myUid].name) || _t('share.you');
    var opName = (d.presence && opp && d.presence[opp] && d.presence[opp].name) || _t('share.opponent');
    var n = d.effectiveQuestionCount || 1;
    var draw = d.result === 'draw';
    var iWon = d.winnerUid === myUid;
    var banner = draw ? _t('share.draw') : (iWon ? _t('duel.youWin') : _t('share.wins', { name: opName }));
    var bannerCls = draw ? 'is-draw' : (iWon ? 'is-win' : 'is-loss');
    var icon = draw ? '🤝' : (iWon ? '🏆' : '⚔️');

    var allowSkip = !!(d.config && d.config.allowSkip);   // ADR-064: show attempted/skipped only when Skip was on
    container.style.display = 'block';
    // CENTERED composition: every block aligns to one vertical axis. The VS row and the stats table are both
    // symmetric 3-column grids (1fr · auto · 1fr) — you on the left half, opponent on the right half, label centered.
    container.innerHTML =
      '<div class="duel-screen"><div class="duel-card duel-result-card duel-reveal">' +
        '<div class="duel-result-icon">' + icon + '</div>' +
        '<div class="duel-result-banner ' + bannerCls + '">' + _esc(banner) + '</div>' +
        '<div class="duel-result-vs">' +
          _resultCol(_t('duel.youParen', { name: myName }), me, iWon && !draw) +
          '<div class="duel-vs-sep">vs</div>' +
          _resultCol(opName, op, !iWon && !draw) +
        '</div>' +
        '<div class="duel-result-stats">' +
          _statRow(_t('duel.statCorrect'), me.correctCount + ' / ' + n, op.correctCount + ' / ' + n) +
          (allowSkip ? _statRow(_t('duel.statAttempted'), (me.answeredCount || 0) + ' / ' + n, (op.answeredCount || 0) + ' / ' + n) : '') +
          (allowSkip ? _statRow(_t('duel.statSkipped'), String(n - (me.answeredCount || 0)), String(n - (op.answeredCount || 0))) : '') +
          _statRow(_t('duel.statAccuracy'), _acc(me) + '%', _acc(op) + '%') +
          _statRow(_t('duel.statSpeed'), _spd(me), _spd(op)) +
        '</div>' +
        '<div class="duel-result-why">' + _esc(_why(draw, iWon, me, op, opName)) + '</div>' +
        '<div class="duel-result-actions">' +
          '<button id="duReview" class="btn-secondary duel-review-btn" type="button">🔍 ' + _esc(_t('duel.reviewAll')) + '</button>' +
          '<div class="duel-actions-row">' +
            '<button id="duShareRes" class="btn-secondary" type="button">' + _esc(_t('share.shareBtn')) + '</button>' +
            '<button id="duFinish" class="btn-primary duel-finish-btn" type="button">' + _esc(_t('duel.finish')) + '</button>' +
          '</div>' +
        '</div>' +
      '</div></div>';

    var rv = _el('duReview'); if (rv) rv.onclick = function () { try { if (opts.onReview) opts.onReview(); } catch (_) {} };
    var sh = _el('duShareRes'); if (sh) sh.onclick = function () {
      var data = { result: d.result, myName: myName, opName: opName, myScore: me.correctCount, opScore: op.correctCount, total: n, winner: d.winnerUid, myUid: myUid, myAccuracy: _acc(me), opAccuracy: _acc(op), myAttempted: (me.answeredCount != null ? me.answeredCount : me.correctCount), opAttempted: (op.answeredCount != null ? op.answeredCount : op.correctCount), mySpeed: _spd(me), opSpeed: _spd(op) };
      if (typeof ShareService !== 'undefined' && ShareService.shareDuelAsImage) ShareService.shareDuelAsImage(data);
      else _nativeShare(_t('duel.shareTitle'), _t('duel.shareText', { winner: (iWon ? myName : opName), loser: (iWon ? opName : myName), n: n, spd: _spd(me), acc: _acc(me) }));
    };
    var fin = _el('duFinish'); if (fin) fin.onclick = function () {
      if (fin._busy) return; fin._busy = true;
      fin.disabled = true; fin.textContent = _t('duel.finishing');
      try { if (opts.onFinish) opts.onFinish(); } catch (_) {}
      // FAILSAFE — the user must NEVER stay trapped on "Finishing…". If we're STILL on the results screen ~2.5s
      // later (handler missing / cleanup hung / version mismatch), force-escape: hide results, hard-reset, go Home.
      setTimeout(function () {
        if (!document.getElementById('duFinish')) return;   // already navigated away → all good
        try { var dr = _el('duelResults'); if (dr) { dr.style.display = 'none'; dr.innerHTML = ''; } } catch (_) {}
        try { if (typeof DuelManager !== 'undefined' && DuelManager.forceReset) DuelManager.forceReset(); } catch (_) {}
        try { if (typeof Router !== 'undefined') Router.showView('home'); else location.hash = '#home'; } catch (_) { try { location.hash = '#home'; } catch (e2) {} }
      }, 2500);
    };
  }
  /* One stat row → three grid cells (you · label · opp). The parent .duel-result-stats is a symmetric 1fr·auto·1fr
     grid, so values mirror around the centered label. */
  function _statRow(label, youVal, oppVal) {
    return '<div class="rs-row">' +
      '<div class="rs-you">' + _esc(youVal) + '</div>' +
      '<div class="rs-label">' + _esc(label) + '</div>' +
      '<div class="rs-opp">' + _esc(oppVal) + '</div>' +
    '</div>';
  }
  function _resultCol(name, r, win) {
    // A fixed-height crown slot on BOTH columns keeps them exactly equal height (no perceived tilt); the winner
    // highlight is a subtle avatar ring (set via .is-winner CSS), not an extra text line.
    return '<div class="duel-result-col' + (win ? ' is-winner' : '') + '">' +
      '<div class="duel-result-crown">' + (win ? '👑' : '') + '</div>' +
      '<span class="duel-avatar">' + _esc(_initial(name)) + '</span>' +
      '<div class="duel-result-name">' + _esc(name) + '</div>' +
      '<div class="duel-result-score">' + (r.correctCount || 0) + '</div>' +
      '<div class="duel-result-correct">' + _esc(_t('duel.correctLower')) + '</div>' +
    '</div>';
  }
  function _spd(r) { return (r.answeredCount > 0 && r.totalSolveMs > 0) ? (r.totalSolveMs / 1000 / r.answeredCount).toFixed(1) + 's/q' : _t('duel.noData'); }
  function _acc(r) { var a = (r.answeredCount != null) ? r.answeredCount : r.correctCount; return a > 0 ? Math.round((r.correctCount / a) * 100) : 0; }
  function _why(draw, iWon, me, op, opName) {
    if (draw) return _t('duel.whyDraw');
    var w = iWon ? me : op, l = iWon ? op : me, wn = iWon ? _t('share.you') : opName;
    if ((w.correctCount || 0) > (l.correctCount || 0)) return _t('duel.whyAccuracy', { name: wn, w: (w.correctCount || 0), l: (l.correctCount || 0) });
    if ((l.answeredCount || 0) === 0) return _t('duel.whyNoAnswer', { name: wn });   // honest: don't claim "same accuracy" when the loser played nothing (audit waiting-result-03)
    return _t('duel.whySpeed', { name: wn });
  }

  /* ═════════════════ ADR-064: premium finish transition ═════════════════ */
  function showCalculating(oppName) {
    hideCalculating();
    var ov = document.createElement('div');
    ov.id = 'duelCalcOverlay'; ov.className = 'duel-calc-overlay';
    ov.innerHTML = '<div class="duel-calc-card">' +
      '<div class="duel-calc-spinner" aria-hidden="true"><span></span><span></span><span></span></div>' +
      '<div class="duel-calc-text" id="duelCalcText">' + _esc(_t('duel.calcSubmitting')) + '</div></div>';
    document.body.appendChild(ov);
    var steps = [_t('duel.calcSubmitting'), _t('duel.calcSyncing', { name: (oppName || _t('duel.yourOpponent')) }), _t('duel.calcResults')];
    var i = 0;
    ov._timer = setInterval(function () {
      i = Math.min(i + 1, steps.length - 1);
      var el = document.getElementById('duelCalcText');
      if (el) { el.textContent = steps[i]; el.classList.remove('is-swap'); void el.offsetWidth; el.classList.add('is-swap'); }
    }, 750);
  }
  function hideCalculating() {
    var ov = document.getElementById('duelCalcOverlay');
    if (!ov) return;
    if (ov._timer) clearInterval(ov._timer);
    ov.classList.add('is-out');
    setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 200);
  }

  /* ═════════════════ ADR-064: post-match per-question review ═════════════════ */
  function renderReviewLoading(container) {
    container.style.display = 'block';
    container.innerHTML = '<div class="duel-screen"><div class="duel-card duel-review-card">' +
      '<div class="duel-review-loading"><div class="duel-calc-spinner"><span></span><span></span><span></span></div><div>' + _esc(_t('duel.reviewLoading')) + '</div></div></div></div>';
  }
  function renderReview(container, opts) {
    var d = opts.duel || {}, prompts = d.prompts || [], review = opts.review || [], myAnswers = opts.myAnswers || {};
    var byIndex = {}; review.forEach(function (r) { byIndex[r.i] = r; });
    var rows = prompts.map(function (p) {
      var r = byIndex[p.index];
      var hasReview = !!r;                              // server graded data for THIS question
      r = r || {};
      var your = (r.y != null && r.y !== '') ? r.y : ((myAnswers[p.index] && myAnswers[p.index].value) || '');
      var skipped = !String(your).trim();
      var correct = !!r.c;
      var correctAns = (r.a != null) ? String(r.a) : '';
      // Only label right/wrong when we actually have the graded data; otherwise stay neutral (never mislabel).
      var cls = !hasReview ? '' : (skipped ? 'is-skipped' : (correct ? 'is-correct' : 'is-wrong'));
      var badge = !hasReview ? '' : (skipped ? '<span class="drv-badge is-skip">' + _esc(_t('duel.skippedBadge')) + '</span>'
        : (correct ? '<span class="drv-badge is-ok">' + _esc(_t('drill.correct')) + '</span>' : '<span class="drv-badge is-no">' + _esc(_t('duel.wrongBadge')) + '</span>'));
      var showCorrect = hasReview && !correct && correctAns !== '';
      return '<div class="duel-review-row ' + cls + '">' +
        '<div class="drv-head"><span class="drv-qn">Q' + (p.index + 1) + '</span>' +
          '<span class="drv-cat">' + _esc(_fmtCat(p.category)) + '</span>' + badge + '</div>' +
        '<div class="drv-q">' + _esc(p.text) + '</div>' +
        '<div class="drv-answers">' +
          '<div class="drv-yours"><span class="drv-k">' + _esc(_t('drill.yourAnswer')) + '</span><span class="drv-v">' + (skipped ? '—' : _esc(your)) + '</span></div>' +
          (showCorrect ? '<div class="drv-correct"><span class="drv-k">' + _esc(_t('drill.correctAnswer')) + '</span><span class="drv-v">' + _esc(correctAns) + '</span></div>' : '') +
        '</div>' +
        (correctAns !== '' ? '<button class="drv-explain" data-i="' + p.index + '" type="button">🧠 ' + _esc(_t('duel.explainBtn')) + '</button>' : '') +
      '</div>';
    }).join('');
    var correctN = review.filter(function (r) { return r.c; }).length;
    container.style.display = 'block';
    container.innerHTML =
      '<div class="duel-screen"><div class="duel-card duel-review-card">' +
        '<div class="duel-review-head">' +
          '<button class="duel-review-back" id="drvBack" type="button">‹ ' + _esc(_t('duel.back')) + '</button>' +
          '<div class="duel-review-titlewrap"><div class="duel-review-title">' + _esc(_t('duel.matchReview')) + '</div>' +
            '<div class="duel-review-sub">' + _esc(_t('duel.reviewScore', { correct: correctN, total: prompts.length })) + '</div></div>' +
        '</div>' +
        '<div class="duel-review-list">' + (rows || '<div class="duel-review-empty">' + _esc(_t('duel.reviewEmpty')) + '</div>') + '</div>' +
      '</div></div>';
    var back = _el('drvBack'); if (back) back.onclick = function () { try { if (opts.onBack) opts.onBack(); } catch (_) {} };
    container.querySelectorAll('.drv-explain').forEach(function (btn) {
      btn.onclick = function () {
        var i = parseInt(btn.getAttribute('data-i'), 10);
        var p = prompts.filter(function (x) { return x.index === i; })[0], r = byIndex[i] || {};
        if (p && opts.onExplain) opts.onExplain(p.text, r.a, p.category);
      };
    });
  }

  /* ═════════════════ Submit & Leave modal ═════════════════ */
  var _exitHandle = null;
  function showExitModal(opts) {
    var modal = _el('exitDuelModal'); if (!modal) { opts.onConfirm(); return; }
    modal.innerHTML =
      '<div class="modal-content duel-exit-modal" role="dialog" aria-modal="true" aria-labelledby="duExitTitle">' +
        '<h3 class="duel-exit-title" id="duExitTitle">' + _esc(_t('duel.exitTitle')) + '</h3>' +
        '<p class="duel-exit-body">' + _t('duel.exitAnswered', { n: '<strong>' + opts.answered + ' / ' + opts.total + '</strong>' }) + ' ' + _t('duel.exitNoRejoin') + '</p>' +
        '<div class="duel-exit-actions">' +
          '<button id="duExitCancel" class="btn-secondary" type="button">' + _esc(_t('duel.exitKeep')) + '</button>' +
          '<button id="duExitConfirm" class="btn-primary" type="button">' + _esc(_t('duel.exitConfirm')) + '</button>' +
        '</div>' +
      '</div>';
    modal.style.display = 'flex';
    /* UI Phase 1 / M3: route through the shared overlay controller — gains focus-trap, focus-restore,
       Escape-to-cancel and backdrop-to-cancel (both equivalent to "Keep Solving", whose onCancel is a
       no-op). The static #exitDuelModal element and its i18n content are unchanged; close stays instant. */
    _exitHandle = (typeof QROverlay !== 'undefined') ? QROverlay.open(modal, {
      dialogEl: modal.querySelector('.modal-content'),
      removeOnClose: false, closingClass: null, closeMs: 0,
      initialFocus: '#duExitCancel',
      onClose: function () { modal.style.display = 'none'; modal.innerHTML = ''; _exitHandle = null; }
    }) : null;
    if (!_exitHandle) document.body.classList.add('modal-open');
    _el('duExitCancel').onclick = function () { hideExitModal(); if (opts.onCancel) opts.onCancel(); };
    _el('duExitConfirm').onclick = function () { hideExitModal(); opts.onConfirm(); };
  }
  function hideExitModal() {
    if (_exitHandle) { _exitHandle.close(); return; }
    var m = _el('exitDuelModal'); if (m) { m.style.display = 'none'; m.innerHTML = ''; } document.body.classList.remove('modal-open');
  }

  /* ═════════════════ shared share/clipboard helpers ═════════════════ */
  function _inviteUrl(code) {
    try { return location.origin + '/?duel=' + encodeURIComponent(code); } catch (_) { return 'https://quantreflex.app/?duel=' + code; }
  }
  function _copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(function () {});
    else { try { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); } catch (_) {} }
  }
  function _nativeShare(title, text) {
    if (navigator.share) navigator.share({ title: title, text: text }).catch(function () {});
    else _copy(text);
  }

  return {
    renderInstallGate: renderInstallGate,
    renderSetup: renderSetup, renderJoin: renderJoin, renderLobby: renderLobby,
    renderWaiting: renderWaiting, renderResults: renderResults,
    renderReview: renderReview, renderReviewLoading: renderReviewLoading,
    showCalculating: showCalculating, hideCalculating: hideCalculating,
    showExitModal: showExitModal, hideExitModal: hideExitModal,
    inviteUrl: _inviteUrl
  };
})();
