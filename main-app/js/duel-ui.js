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
    var src = (typeof _CATEGORY_LABELS !== 'undefined' && _CATEGORY_LABELS) ? _CATEGORY_LABELS : {
      squares: 'Squares', cubes: 'Cubes', area: 'Area', volume: 'Volume', fractions: 'Fractions',
      percentages: 'Percentages', multiplication: 'Multiplication', ratios: 'Ratios', averages: 'Averages',
      'profit-loss': 'Profit & Loss', 'time-speed-distance': 'Time, Speed & Distance', 'time-and-work': 'Time & Work'
    };
    return Object.keys(src).map(function (k) { return { key: k, label: src[k] }; });
  }
  function _initial(name) { var n = String(name || '?').trim(); return n ? n.charAt(0).toUpperCase() : '?'; }
  function _configSummary(cfg) {
    cfg = cfg || {};
    var bits = [String(cfg.questionCount || '?') + ' questions', _cap(cfg.difficulty || 'medium')];
    if (cfg.topics && cfg.topics.length) bits.push(cfg.topics.map(_fmtCat).join(', '));
    else bits.push('Mixed topics');
    if (cfg.timerTotal) bits.push(cfg.timerTotal + 's total');
    else if (cfg.timerPerQuestion) bits.push(cfg.timerPerQuestion + 's / question');
    else bits.push('No timer');
    if (cfg.allowSkip) bits.push('Skip on');
    return bits.join(' · ');
  }
  function _cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ═════════════════ Setup (create) — bottom-sheet modal ═════════════════ */
  function renderSetup(overlay, opts) {
    if (!overlay) { return; }
    var cats = _categoryEntries();
    overlay.style.display = 'flex';
    overlay.innerHTML =
      '<div class="training-card duel-sheet" role="dialog" aria-modal="true" aria-label="Create a Duel">' +
        '<h3 class="category-select-title duel-sheet-title">⚔️ Create a Duel</h3>' +
        '<div class="training-card-body duel-sheet-body">' +

          '<div class="duel-field">' +
            '<label class="duel-field-label">Question Type</label>' +
            '<div class="timer-pill-selector" id="duType">' +
              '<button class="timer-pill active" data-type="quick" type="button">Quick Math</button>' +
              '<button class="timer-pill is-soon" data-type="word" type="button" disabled>Word Problems · Soon</button>' +
            '</div>' +
          '</div>' +

          '<div class="duel-field">' +
            '<label class="duel-field-label" for="duCount">Questions</label>' +
            '<input id="duCount" class="custom-question-range" type="range" min="5" max="50" value="20" />' +
            '<div class="custom-practice-meta-row"><strong id="duCountVal">20</strong>' +
              '<span class="secondary-text" id="duCountText">You will solve 20 questions</span></div>' +
          '</div>' +

          '<div class="duel-field">' +
            '<label class="duel-field-label">Difficulty</label>' +
            '<div class="timer-pill-selector" id="duDiff">' +
              '<button class="timer-pill" data-d="easy" type="button">Easy</button>' +
              '<button class="timer-pill active" data-d="medium" type="button">Medium</button>' +
              '<button class="timer-pill" data-d="hard" type="button">Hard</button>' +
            '</div>' +
          '</div>' +

          '<div class="duel-field">' +
            '<label class="duel-field-label">Topics <span class="duel-field-hint">— none = mixed</span></label>' +
            '<div class="category-grid duel-topic-grid" id="duTopics">' +
              cats.map(function (c) { return '<button class="category-btn category-card" type="button" data-cat="' + _esc(c.key) + '">' + _esc(c.label) + '</button>'; }).join('') +
            '</div>' +
          '</div>' +

          '<div class="timer-select-section" id="duTimerSection">' +
            '<div class="timer-toggle-row">' +
              '<span class="timer-toggle-label">Timer</span>' +
              '<label class="toggle"><input type="checkbox" id="duTimerToggle" /><span class="toggle-slider"></span></label>' +
            '</div>' +
            '<div class="timer-config-area" id="duTimerArea" style="display:none;">' +
              '<div class="timer-pill-selector" id="duTimerPills">' +
                '<button class="timer-pill active" data-tmode="per" type="button">Per Ques.</button>' +
                '<button class="timer-pill" data-tmode="total" type="button">Total</button>' +
              '</div>' +
              '<div class="timer-input-row">' +
                '<input type="number" id="duTimerSec" class="timer-seconds-input" min="5" max="120" value="15" />' +
                '<span class="timer-unit-label">seconds</span>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div class="timer-select-section">' +
            '<div class="timer-toggle-row">' +
              '<span class="timer-toggle-label">Skip Questions</span>' +
              '<label class="toggle"><input type="checkbox" id="duSkipChk" /><span class="toggle-slider"></span></label>' +
            '</div>' +
            '<p class="duel-field-hint duel-skip-hint">Off — every question must be answered.</p>' +
          '</div>' +

        '</div>' +
        '<div class="duel-sheet-footer">' +
          '<button id="duCreateBtn" class="btn-primary duel-sheet-cta" type="button">Create Duel</button>' +
          '<button id="duSetupBack" class="training-card-back" type="button">Cancel</button>' +
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
      _el('duCountText').textContent = 'You will solve ' + v + ' questions';
    });

    // Difficulty pills
    _pillGroup('duDiff', function (btn) { cfg.difficulty = btn.getAttribute('data-d'); });
    // Type pills (Quick only; Word disabled)
    var typeWord = overlay.querySelector('#duType .timer-pill[data-type="word"]');
    if (typeWord) typeWord.onclick = function () { if (typeof showComingSoon === 'function') showComingSoon({ title: 'Word Problem Duels', blurb: 'Battle a friend with AI-crafted, exam-style word problems. Launching soon for Premium.' }); };

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
    skip.addEventListener('change', function () { var h = overlay.querySelector('.duel-skip-hint'); if (h) h.textContent = skip.checked ? 'On — a Skip button appears during solving.' : 'Off — every question must be answered.'; });

    _el('duSetupBack').onclick = function () { opts.onBack(); };

    var createBtn = _el('duCreateBtn');
    createBtn.onclick = function () {
      createBtn.disabled = true; createBtn.textContent = 'Creating…';
      opts.onCreate(_collectConfig(cfg), function () { createBtn.disabled = false; createBtn.textContent = 'Create Duel'; });
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
      '<div class="training-card duel-sheet duel-sheet-compact" role="dialog" aria-modal="true" aria-label="Join a Duel">' +
        '<h3 class="category-select-title duel-sheet-title">Join a Duel</h3>' +
        '<div class="training-card-body duel-sheet-body">' +
          '<p class="secondary-text duel-join-help">Enter the room code your friend shared.</p>' +
          '<input id="duJoinCode" class="duel-join-input" inputmode="text" autocapitalize="characters" maxlength="6" placeholder="ABC123" />' +
          '<div id="duJoinErr" class="duel-join-err" role="alert"></div>' +
        '</div>' +
        '<div class="duel-sheet-footer">' +
          '<button id="duJoinBtn" class="btn-primary duel-sheet-cta" type="button">Join Duel</button>' +
          '<button id="duJoinBack" class="training-card-back" type="button">Cancel</button>' +
        '</div>' +
      '</div>';
    overlay.onclick = function (e) { if (e.target === overlay) opts.onBack(); };
    var input = _el('duJoinCode'), btn = _el('duJoinBtn'), err = _el('duJoinErr');
    function go() {
      var code = (input.value || '').trim().toUpperCase();
      if (code.length < 4) { err.textContent = 'Enter the full room code.'; return; }
      err.textContent = ''; btn.disabled = true; btn.textContent = 'Joining…';
      opts.onJoin(code, function (msg, errCode) {
        btn.disabled = false; btn.textContent = 'Join Duel';
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
          '<h3 class="duel-arena-title">This duel is already full</h3>' +
          '<p class="secondary-text">Two warriors are already battling in this arena. Ask for a fresh room code, or create your own duel.</p>' +
        '</div>' +
        '<div class="duel-sheet-footer">' +
          '<button id="duFullCreate" class="btn-primary duel-sheet-cta" type="button">Create My Own</button>' +
          '<button id="duFullBack" class="training-card-back" type="button">Back</button>' +
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
        '<div class="duel-roomcode-label">Room Code</div>' +
        '<div class="duel-roomcode" id="duCode">' + _esc(code) + '</div>' +
        '<div class="duel-share-row">' +
          '<button id="duCopy" class="duel-share-btn" type="button">Copy</button>' +
          '<button id="duWhats" class="duel-share-btn" type="button">WhatsApp</button>' +
        '</div>' +
      '</div>' +
      '<div class="duel-slots">' +
        _slot('You', 'is-you', true, 'Host · Connected') +
        (full ? _slot(oppName || 'Player 2', 'is-filled', true, 'Connected') : _slotWaiting()) +
      '</div>' +
      '<div class="duel-config-summary">' + _esc(_configSummary(d.config)) + '</div>' +
      '<button id="duStart" class="btn-primary duel-cta" type="button"' + (full ? '' : ' disabled') + '>' + (full ? 'Start Duel' : 'Waiting for opponent…') + '</button>' +
      '<button id="duLeave" class="duel-leave-link" type="button">Leave duel</button>' +
    '</div></div>';
  }

  function _lobbyGuest(d, hostName, full) {
    return '<div class="duel-screen"><div class="duel-card">' +
      '<div class="duel-joined-badge">✓ Joined successfully</div>' +
      '<div class="duel-vs-head">vs ' + _esc(hostName) + '</div>' +
      '<div class="duel-slots">' +
        _slot(hostName, 'is-filled', true, 'Host · Connected') +
        _slot('You', 'is-you', true, 'Connected') +
      '</div>' +
      '<div class="duel-section-label">Match settings</div>' +
      '<div class="duel-config-summary">' + _esc(_configSummary(d.config)) + '</div>' +
      '<div class="duel-waiting-host"><span class="duel-pulse-dot"></span> Waiting for the host to start…</div>' +
      '<button id="duLeave" class="duel-leave-link" type="button">Leave duel</button>' +
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
      '<span class="duel-slot-name">Waiting for player 2…</span>' +
      '<span class="duel-slot-status"><span class="duel-pulse-dot"></span> Open</span>' +
    '</div>';
  }

  function _wireLobby(container, opts, code, isHost) {
    if (isHost) {
      var inviteText = 'Join my QuantReflex duel — code ' + code + '\n' + _inviteUrl(code);
      var copyBtn = _el('duCopy'); if (copyBtn) copyBtn.onclick = function () { _copy(code); copyBtn.textContent = 'Copied!'; setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1500); };
      var wBtn = _el('duWhats'); if (wBtn) wBtn.onclick = function () { window.open('https://wa.me/?text=' + encodeURIComponent(inviteText), '_blank'); };
      var startBtn = _el('duStart'); if (startBtn && !startBtn.disabled) startBtn.onclick = function () { startBtn.disabled = true; startBtn.textContent = 'Starting…'; opts.onStart(function () { startBtn.disabled = false; startBtn.textContent = 'Start Duel'; }); };
    }
    var leaveBtn = _el('duLeave'); if (leaveBtn) leaveBtn.onclick = opts.onLeave;
  }

  /* ═════════════════ Finished-waiting ═════════════════ */
  function renderWaiting(container, opts) {
    var oppName = opts.opponentName || 'your opponent';
    var oppState = opts.opponentState || 'connecting';
    var connecting = oppState === 'connecting';   // presence unknown → neutral, don't claim "Solving…" (audit waiting-result-05)
    var chipCls = oppState === 'finished' ? 'is-finished' : ((opts.opponentStale || connecting) ? 'is-stale' : 'is-solving');
    var chip = oppState === 'finished' ? 'Finished' : (connecting ? 'Connecting…' : (opts.opponentStale ? 'Reconnecting…' : 'Solving…'));
    container.style.display = 'block';
    container.innerHTML =
      '<div class="duel-screen"><div class="duel-card duel-waiting-card">' +
        '<span class="duel-avatar lg ' + chipCls + '">' + _esc(_initial(oppName)) + '</span>' +
        '<h2 class="duel-waiting-title">Waiting for ' + _esc(oppName) + '…</h2>' +
        '<p class="duel-waiting-sub">Your answers are in. Results unlock the moment ' + _esc(oppName) + ' finishes.</p>' +
        '<div class="duel-opp-status"><span class="duel-opp-dot ' + chipCls + '"></span>' + _esc(oppName) + ': ' + chip + '</div>' +
        '<button id="duHome" class="duel-leave-link" type="button">Return to Home</button>' +
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
    var myName = (d.presence && d.presence[myUid] && d.presence[myUid].name) || 'You';
    var opName = (d.presence && opp && d.presence[opp] && d.presence[opp].name) || 'Opponent';
    var n = d.effectiveQuestionCount || 1;
    var draw = d.result === 'draw';
    var iWon = d.winnerUid === myUid;
    var banner = draw ? 'Draw' : (iWon ? 'You win' : opName + ' wins');
    var bannerCls = draw ? 'is-draw' : (iWon ? 'is-win' : 'is-loss');
    var icon = draw ? '🤝' : (iWon ? '🏆' : '⚔️');

    container.style.display = 'block';
    // CENTERED composition: every block aligns to one vertical axis. The VS row and the stats table are both
    // symmetric 3-column grids (1fr · auto · 1fr) — you on the left half, opponent on the right half, label centered.
    container.innerHTML =
      '<div class="duel-screen"><div class="duel-card duel-result-card">' +
        '<div class="duel-result-icon">' + icon + '</div>' +
        '<div class="duel-result-banner ' + bannerCls + '">' + _esc(banner) + '</div>' +
        '<div class="duel-result-vs">' +
          _resultCol(myName + ' (you)', me, iWon && !draw) +
          '<div class="duel-vs-sep">vs</div>' +
          _resultCol(opName, op, !iWon && !draw) +
        '</div>' +
        '<div class="duel-result-stats">' +
          _statRow('Correct', me.correctCount + ' / ' + n, op.correctCount + ' / ' + n) +
          _statRow('Accuracy', _acc(me) + '%', _acc(op) + '%') +
          _statRow('Speed', _spd(me), _spd(op)) +
        '</div>' +
        '<div class="duel-result-why">' + _esc(_why(draw, iWon, me, op, opName)) + '</div>' +
        '<div class="duel-result-actions">' +
          '<button id="duShareRes" class="btn-secondary" type="button">Share</button>' +
          '<button id="duFinish" class="btn-primary duel-finish-btn" type="button">Finish Duel</button>' +
        '</div>' +
      '</div></div>';

    var sh = _el('duShareRes'); if (sh) sh.onclick = function () {
      var data = { result: d.result, myName: myName, opName: opName, myScore: me.correctCount, opScore: op.correctCount, winner: d.winnerUid, myUid: myUid, myAccuracy: _acc(me), opAccuracy: _acc(op), myAttempted: (me.answeredCount != null ? me.answeredCount : me.correctCount), opAttempted: (op.answeredCount != null ? op.answeredCount : op.correctCount) };
      if (typeof ShareService !== 'undefined' && ShareService.shareDuelAsImage) ShareService.shareDuelAsImage(data);
      else _nativeShare('QuantReflex Duel', (iWon ? myName + ' defeated ' + opName : opName + ' defeated ' + myName) + ' · ' + n + ' Q · ' + _spd(me) + ' · ' + _acc(me) + '%');
    };
    var fin = _el('duFinish'); if (fin) fin.onclick = function () {
      if (fin._busy) return; fin._busy = true;
      fin.disabled = true; fin.textContent = 'Finishing…';
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
    return '<div class="rs-you">' + _esc(youVal) + '</div>' +
           '<div class="rs-label">' + _esc(label) + '</div>' +
           '<div class="rs-opp">' + _esc(oppVal) + '</div>';
  }
  function _resultCol(name, r, win) {
    return '<div class="duel-result-col' + (win ? ' is-winner' : '') + '">' +
      '<span class="duel-avatar">' + _esc(_initial(name)) + '</span>' +
      '<div class="duel-result-name">' + _esc(name) + '</div>' +
      '<div class="duel-result-score">' + (r.correctCount || 0) + '</div>' +
      '<div class="duel-result-correct">correct</div>' +
      (win ? '<div class="duel-result-crown">Winner</div>' : '') +
    '</div>';
  }
  function _spd(r) { return (r.answeredCount > 0 && r.totalSolveMs > 0) ? (r.totalSolveMs / 1000 / r.answeredCount).toFixed(1) + 's/q' : 'No data'; }
  function _acc(r) { var a = (r.answeredCount != null) ? r.answeredCount : r.correctCount; return a > 0 ? Math.round((r.correctCount / a) * 100) : 0; }
  function _why(draw, iWon, me, op, opName) {
    if (draw) return 'Dead even — same score and speed.';
    var w = iWon ? me : op, l = iWon ? op : me, wn = iWon ? 'You' : opName;
    if ((w.correctCount || 0) > (l.correctCount || 0)) return wn + ' won on accuracy (' + (w.correctCount || 0) + ' vs ' + (l.correctCount || 0) + ' correct).';
    if ((l.answeredCount || 0) === 0) return wn + ' won — opponent didn’t answer.';   // honest: don't claim "same accuracy" when the loser played nothing (audit waiting-result-03)
    return wn + ' won on speed — same accuracy, faster solving.';
  }

  /* ═════════════════ Submit & Leave modal ═════════════════ */
  function showExitModal(opts) {
    var modal = _el('exitDuelModal'); if (!modal) { opts.onConfirm(); return; }
    modal.innerHTML =
      '<div class="modal-content duel-exit-modal">' +
        '<h3 class="duel-exit-title">Leave the duel?</h3>' +
        '<p class="duel-exit-body">You’ve answered <strong>' + opts.answered + ' / ' + opts.total + '</strong>. Your current answers will be submitted and <strong>you can’t rejoin</strong>. The result appears once your opponent finishes.</p>' +
        '<div class="duel-exit-actions">' +
          '<button id="duExitCancel" class="btn-secondary" type="button">Keep solving</button>' +
          '<button id="duExitConfirm" class="btn-primary" type="button">Submit &amp; leave</button>' +
        '</div>' +
      '</div>';
    modal.style.display = 'flex'; document.body.classList.add('modal-open');
    _el('duExitCancel').onclick = function () { hideExitModal(); if (opts.onCancel) opts.onCancel(); };
    _el('duExitConfirm').onclick = function () { hideExitModal(); opts.onConfirm(); };
  }
  function hideExitModal() { var m = _el('exitDuelModal'); if (m) { m.style.display = 'none'; m.innerHTML = ''; } document.body.classList.remove('modal-open'); }

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
    renderSetup: renderSetup, renderJoin: renderJoin, renderLobby: renderLobby,
    renderWaiting: renderWaiting, renderResults: renderResults,
    showExitModal: showExitModal, hideExitModal: hideExitModal,
    inviteUrl: _inviteUrl
  };
})();
