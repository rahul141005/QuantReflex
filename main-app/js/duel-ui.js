/**
 * duel-ui.js — Math Duel UI rendering (V3 — Room Code Only)
 *
 * Simplified rebuild:
 *   - Room-code-only setup screen (create duel → share code)
 *   - Room-code join screen (enter code → join)
 *   - Premium waiting room with countdown
 *   - Fixed active screen (numpad always visible, exit button)
 *   - Premium results with realtime comparison
 *   - No invitation system, no username lookup
 *
 * Depends on DuelCore for Firestore operations.
 */

var DuelUI = (function () {
  'use strict';

  var _categories = [
    { key: 'squares', label: 'Squares' },
    { key: 'cubes', label: 'Cubes' },
    { key: 'percentages', label: 'Percentages' },
    { key: 'multiplication', label: 'Multiplication' },
    { key: 'fractions', label: 'Fractions' },
    { key: 'averages', label: 'Averages' },
    { key: 'ratios', label: 'Ratios' },
    { key: 'profit-loss', label: 'Profit & Loss' },
    { key: 'time-speed-distance', label: 'Time Speed Dist' },
    { key: 'time-and-work', label: 'Time & Work' }
  ];

  var _activeDuelTimer = null;
  var _countdownTimer = null;

  function clearTimers() {
    if (_activeDuelTimer) { clearInterval(_activeDuelTimer); _activeDuelTimer = null; }
    if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
  }

  function _fmtCat(cat) {
    return (typeof formatCategoryName === 'function') ? formatCategoryName(cat) : cat;
  }

  function _getInitials(name) {
    if (!name) return '?';
    var parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }

  /* ================================================================
   * SETUP SCREEN (Create Duel — room code flow)
   * ================================================================ */

  function renderSetup(container, onBack) {
    var topicsHtml = '';
    for (var i = 0; i < _categories.length; i++) {
      topicsHtml += '<button class="category-btn category-card duel-topic-btn" data-cat="' +
        _categories[i].key + '">' + _categories[i].label + '</button>';
    }

    container.innerHTML =
      '<div class="duel-setup-card">' +
        '<div class="duel-setup-header">' +
          '<h3>⚔️ Create Math Duel</h3>' +
          '<p>Set up a duel and share the room code</p>' +
        '</div>' +
        '<div class="duel-setup-body">' +
          /* Question mode toggle */
          '<div class="duel-mode-toggle" style="display:flex;gap:.5rem;margin-bottom:1rem;">' +
            '<button class="duel-mode-btn active" data-qmode="quick" style="flex:1;text-align:left;padding:.75rem;">' +
              '<div style="font-weight:600;margin-bottom:.25rem;">⚡ Quick Questions</div>' +
              '<div style="font-size:.7rem;opacity:.8;font-weight:400;">Procedural generation</div>' +
            '</button>' +
            '<button class="duel-mode-btn" data-qmode="wordproblems" style="flex:1;text-align:left;padding:.75rem;">' +
              '<div style="font-weight:600;margin-bottom:.25rem;">🤖 Word Problems</div>' +
              '<div style="font-size:.7rem;opacity:.8;font-weight:400;">AI-curated bank</div>' +
            '</button>' +
          '</div>' +
          /* Topic selection */
          '<label class="secondary-text" style="font-size:.8rem;margin-bottom:.35rem;display:block;">Topics (select 1+)</label>' +
          '<div class="category-grid" style="margin-bottom:.75rem;">' + topicsHtml + '</div>' +
          /* Difficulty */
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;">' +
            '<span style="font-size:.85rem;font-weight:600;">Difficulty</span>' +
            '<select id="duelDifficulty" class="theme-select" style="min-width:7rem;">' +
              '<option value="easy">Easy</option>' +
              '<option value="medium" selected>Medium</option>' +
              '<option value="hard">Hard</option>' +
            '</select>' +
          '</div>' +
          /* Question count */
          '<div style="margin-bottom:.75rem;">' +
            '<label class="secondary-text" style="font-size:.8rem;">Questions: <strong id="duelQCountVal">10</strong></label>' +
            '<input type="range" id="duelQCount" class="custom-question-range" min="1" max="100" value="10" style="width:100%;" />' +
          '</div>' +
          /* Timer Selection */
          '<div class="timer-select-section" id="duelTimerSelectSection" style="margin-bottom:1rem;">' +
            '<div class="timer-toggle-row">' +
              '<span class="timer-toggle-label" style="font-size:.85rem;font-weight:600;">Timer</span>' +
              '<label class="toggle">' +
                '<input type="checkbox" id="duelTimerToggle" checked />' +
                '<span class="toggle-slider"></span>' +
              '</label>' +
            '</div>' +
            '<div class="timer-config-area" id="duelTimerConfigArea" style="margin-top:.5rem;">' +
              '<div class="timer-pill-selector">' +
                '<button class="timer-pill active" id="duelTimerPillPer" type="button">Per Ques.</button>' +
                '<button class="timer-pill" id="duelTimerPillTotal" type="button">Total</button>' +
              '</div>' +
              '<div class="timer-input-row">' +
                '<input type="number" id="duelTimerSecondsInput" class="timer-seconds-input" min="5" max="600" value="15" />' +
                '<span class="timer-unit-label">seconds</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="duel-setup-footer">' +
          '<button class="duel-create-btn" id="duelCreateBtn" disabled>Create Duel ⚔️</button>' +
          '<button class="duel-setup-back" id="duelBackBtn">← Back</button>' +
        '</div>' +
      '</div>';

    container.style.display = 'flex';
    _bindSetupHandlers(container, onBack);
  }

  function _bindSetupHandlers(container, onBack) {
    var selectedTopics = [];
    var questionMode = 'quick';
    var createBtn = document.getElementById('duelCreateBtn');

    function _updateCreateBtnState() {
      createBtn.disabled = !(selectedTopics.length > 0);
    }

    /* Topic selection */
    var topicBtns = container.querySelectorAll('.duel-topic-btn');
    for (var i = 0; i < topicBtns.length; i++) {
      topicBtns[i].addEventListener('click', function () {
        var cat = this.getAttribute('data-cat');
        var idx = selectedTopics.indexOf(cat);
        if (idx >= 0) {
          selectedTopics.splice(idx, 1);
          this.classList.remove('selected');
        } else {
          selectedTopics.push(cat);
          this.classList.add('selected');
        }
        _updateCreateBtnState();
      });
    }

    /* Question mode toggle */
    var modeBtns = container.querySelectorAll('.duel-mode-btn');
    for (var m = 0; m < modeBtns.length; m++) {
      modeBtns[m].addEventListener('click', function () {
        for (var j = 0; j < modeBtns.length; j++) modeBtns[j].classList.remove('active');
        this.classList.add('active');
        questionMode = this.getAttribute('data-qmode');
      });
    }

    /* Question count slider */
    var qSlider = document.getElementById('duelQCount');
    var qVal = document.getElementById('duelQCountVal');
    if (qSlider && qVal) {
      qSlider.addEventListener('input', function () { qVal.textContent = qSlider.value; });
    }

    /* Timer handlers */
    var timerToggle = document.getElementById('duelTimerToggle');
    var timerConfigArea = document.getElementById('duelTimerConfigArea');
    var pillPer = document.getElementById('duelTimerPillPer');
    var pillTotal = document.getElementById('duelTimerPillTotal');
    var timerInput = document.getElementById('duelTimerSecondsInput');
    var timerMode = 'per';

    if (timerToggle && timerConfigArea) {
      timerToggle.addEventListener('change', function () {
        timerConfigArea.style.display = this.checked ? 'flex' : 'none';
      });
    }

    if (pillPer && pillTotal && timerInput) {
      pillPer.addEventListener('click', function () {
        timerMode = 'per';
        pillPer.classList.add('active');
        pillTotal.classList.remove('active');
        timerInput.value = '15';
      });
      pillTotal.addEventListener('click', function () {
        timerMode = 'total';
        pillTotal.classList.add('active');
        pillPer.classList.remove('active');
        timerInput.value = '180';
      });
    }

    /* Back button */
    var backBtn = document.getElementById('duelBackBtn');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        container.style.display = 'none';
        if (onBack) onBack();
      });
    }

    /* Create Duel button */
    if (createBtn) {
      createBtn.addEventListener('click', function () {
        if (createBtn.disabled) return;

        if (selectedTopics.length === 0) {
          if (typeof showToast === 'function') showToast('Select at least one topic');
          return;
        }
        createBtn.disabled = true;
        createBtn.textContent = 'Creating…';

        var timerVal = null;
        var tTotal = null;
        if (timerToggle && timerToggle.checked) {
          var val = parseInt(timerInput.value, 10);
          if (timerMode === 'per') timerVal = val > 0 ? val : 15;
          else tTotal = val > 0 ? val : 180;
        }

        var config = {
          topics: selectedTopics.slice(),
          difficulty: document.getElementById('duelDifficulty').value,
          questionCount: parseInt(qSlider.value, 10) || 10,
          questionMode: questionMode,
          timerPerQuestion: timerVal,
          timerTotal: tTotal
        };

        DuelCore.createDuel(config, function (err, duelId) {
          createBtn.disabled = false;
          createBtn.textContent = 'Create Duel ⚔️';
          if (err) {
            if (typeof showToast === 'function') showToast(err);
            _updateCreateBtnState();
            return;
          }
          container.style.display = 'none';
          /* Enter waiting room — DuelManager handles the realtime listener */
          DuelManager.enterWaitingRoom(duelId);
        });
      });
    }
  }

  /* ================================================================
   * JOIN SCREEN (Room Code Input)
   * ================================================================ */

  function renderJoinScreen(container, onBack) {
    container.innerHTML =
      '<div class="duel-setup-card">' +
        '<div class="duel-setup-header">' +
          '<h3>⚔️ Join Math Duel</h3>' +
          '<p>Enter the room code from your friend</p>' +
        '</div>' +
        '<div class="duel-setup-body">' +
          '<div style="text-align:center;padding:1rem 0;">' +
            '<div style="font-size:3rem;margin-bottom:.75rem;">🎮</div>' +
            '<label class="secondary-text" style="font-size:.85rem;margin-bottom:.5rem;display:block;">Room Code</label>' +
            '<input type="text" id="duelJoinCodeInput" class="duel-room-code-input" ' +
              'placeholder="e.g. ABC123" autocomplete="off" autocapitalize="characters" ' +
              'maxlength="6" style="font-size:1.75rem;text-align:center;letter-spacing:.5rem;' +
              'padding:.75rem;width:100%;max-width:240px;margin:0 auto;display:block;' +
              'border-radius:12px;border:2px solid var(--border-primary);background:var(--bg-primary);' +
              'color:var(--text-primary);font-weight:700;text-transform:uppercase;" />' +
            '<div id="duelJoinStatus" style="margin-top:.5rem;font-size:.8rem;min-height:1.25em;"></div>' +
          '</div>' +
          '<button class="duel-create-btn" id="duelJoinBtn" disabled>Join Duel ⚔️</button>' +
        '</div>' +
        '<button class="duel-setup-back" id="duelJoinBackBtn">← Back</button>' +
      '</div>';

    container.style.display = 'flex';

    var codeInput = document.getElementById('duelJoinCodeInput');
    var joinBtn = document.getElementById('duelJoinBtn');
    var statusEl = document.getElementById('duelJoinStatus');
    var backBtn = document.getElementById('duelJoinBackBtn');

    /* Enable join button when 6 characters entered */
    if (codeInput) {
      codeInput.addEventListener('input', function () {
        var val = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        codeInput.value = val;
        joinBtn.disabled = val.length !== 6;
        if (statusEl) { statusEl.textContent = ''; statusEl.className = ''; }
      });
      codeInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !joinBtn.disabled) joinBtn.click();
      });
    }

    if (joinBtn) {
      joinBtn.addEventListener('click', function () {
        if (joinBtn.disabled) return;
        var code = codeInput.value.toUpperCase().trim();
        if (code.length !== 6) return;

        joinBtn.disabled = true;
        joinBtn.textContent = 'Joining…';
        if (statusEl) { statusEl.textContent = ''; statusEl.className = ''; }

        DuelCore.joinDuel(code, function (err, data) {
          if (err) {
            joinBtn.disabled = false;
            joinBtn.textContent = 'Join Duel ⚔️';
            if (statusEl) {
              statusEl.textContent = err;
              statusEl.style.color = 'var(--danger, #ef4444)';
            }
            return;
          }

          container.style.display = 'none';
          /* Store active duel and start listening */
          try { localStorage.setItem('qr_active_duel', code); } catch (_) {}
          DuelManager.enterWaitingRoom(code);
        });
      });
    }

    if (backBtn) {
      backBtn.addEventListener('click', function () {
        container.style.display = 'none';
        if (onBack) onBack();
      });
    }
  }

  /* ================================================================
   * WAITING ROOM
   * ================================================================ */

  function renderWaitingRoom(container, duelData) {
    var d = duelData;
    var participants = d.participants || {};
    var uids = Object.keys(participants);
    var p1 = uids.length > 0 ? participants[uids[0]] : null;
    var p2 = uids.length > 1 ? participants[uids[1]] : null;
    var config = d.config || {};

    var topicPills = '';
    var topics = config.topics || [];
    for (var i = 0; i < topics.length; i++) {
      topicPills += '<span class="duel-config-pill">' + _fmtCat(topics[i]) + '</span>';
    }

    var timerLabel = config.timerTotal ? config.timerTotal + 's total' :
                     (config.timerPerQuestion ? config.timerPerQuestion + 's/q' : 'No timer');
    var myUid = (typeof Auth !== 'undefined') ? Auth.getUserId() : '';
    var bothReady = uids.length >= 2;
    var isCreator = (d.createdBy === myUid);

    container.innerHTML =
      '<div class="duel-waiting-room-card">' +
        '<div class="duel-room-header-section">' +
          '<p class="duel-room-subtitle">⚔️ Duel Room</p>' +
          '<div class="duel-room-code">' + d.id + '</div>' +
          '<p class="secondary-text" style="font-size:.75rem;margin-top:.5rem;">Share this code with your friend</p>' +
        '</div>' +
        '<div class="duel-config-pills">' +
          topicPills +
          '<span class="duel-config-pill">📝 ' + (config.questionCount || 10) + ' Qs</span>' +
          '<span class="duel-config-pill">⏱ ' + timerLabel + '</span>' +
          '<span class="duel-config-pill">📊 ' + (config.difficulty || 'medium') + '</span>' +
          '<span class="duel-config-pill">' + (config.questionMode === 'wordproblems' ? '🤖 Word' : '⚡ Quick') + '</span>' +
        '</div>' +
        '<div class="duel-players-section">' +
          _renderPlayerCard(p1, true) +
          '<div class="duel-vs-separator"><span>VS</span></div>' +
          _renderPlayerCard(p2, false) +
        '</div>' +
        (bothReady && isCreator
          ? '<button class="duel-start-btn" id="duelStartBtn">Start Duel ⚔️</button>'
          : bothReady && !isCreator
            ? '<div class="duel-waiting-indicator">' +
                '<span style="margin-right:.35rem;">⏳</span>' +
                '<span>Waiting for host to start…</span>' +
              '</div>'
            : '<div class="duel-waiting-indicator">' +
                '<span class="dot"></span><span class="dot"></span><span class="dot"></span>' +
                '<span style="margin-left:.35rem;">Waiting for opponent…</span>' +
              '</div>'
        ) +
        '<button class="duel-leave-btn" id="duelLeaveBtn">Leave Duel</button>' +
      '</div>';

    container.style.display = 'flex';

    /* Bind start button (creator only) — instantly calls startDuel, countdown handled globally */
    var startBtn = document.getElementById('duelStartBtn');
    if (startBtn) {
      startBtn.addEventListener('click', function () {
        if (startBtn.disabled) return;
        startBtn.disabled = true;
        startBtn.textContent = 'Starting…';

        console.log('[DUEL TRACE] Host clicked Start Duel, transitioning to active in Firestore');
        DuelCore.startDuel(d.id, function (err) {
          if (err && typeof showToast === 'function') {
            showToast(err);
            startBtn.disabled = false;
            startBtn.textContent = 'Start Duel ⚔️';
          }
        });
      });
    }

    /* Bind leave button */
    var leaveBtn = document.getElementById('duelLeaveBtn');
    if (leaveBtn) {
      leaveBtn.addEventListener('click', function () {
        DuelManager.leaveDuel(d.id);
      });
    }
  }

  function _renderPlayerCard(player, isFirst) {
    if (!player) {
      return '<div class="duel-player-card empty">' +
        '<div class="duel-player-avatar empty-avatar">?</div>' +
        '<div class="duel-player-name">Waiting…</div>' +
        '<div class="duel-player-connection-dot offline"></div>' +
      '</div>';
    }
    var initials = _getInitials(player.name);
    var name = player.name || 'Player';
    return '<div class="duel-player-card filled">' +
      '<div class="duel-player-avatar' + (isFirst ? ' avatar-purple' : ' avatar-blue') + '">' + initials + '</div>' +
      '<div class="duel-player-name">' + name + '</div>' +
      '<div class="duel-player-connection-dot online"><span class="dot-pulse"></span> Connected</div>' +
    '</div>';
  }

  /* ================================================================
   * ACTIVE DUEL SCREEN — Scoreboard updater
   * Actual session is handled by DrillEngine. This just updates the
   * DOM elements injected by DuelManager -> DrillEngine.
   * ================================================================ */

  function updateScoreboard(duelData) {
    if (!duelData || !duelData.participants) return;
    var uid = (typeof Auth !== 'undefined') ? Auth.getUserId() : '';
    var participants = duelData.participants;
    var uids = Object.keys(participants);
    var opUid = uids.find(function (u) { return u !== uid; });

    /* Update opponent score */
    if (opUid) {
      var opScoreEl = document.getElementById('duelOpScore');
      if (opScoreEl) opScoreEl.textContent = participants[opUid].score || 0;
    }
  }

  function _bindExitBtn() {
    var exitBtn = document.getElementById('duelExitBtnActive');
    if (exitBtn) {
      exitBtn.addEventListener('click', function () {
        if (typeof DuelManager !== 'undefined') {
          DuelManager.showExitDuelDialog();
        }
      });
    }
  }

  /* ================================================================
   * RESULTS SCREEN
   * ================================================================ */

  function renderResults(container, duelData, isPartial) {
    var uid = (typeof Auth !== 'undefined') ? Auth.getUserId() : '';
    var participants = duelData.participants || {};
    var uids = Object.keys(participants);
    var myP = participants[uid];
    var opUid = uids.find(function (u) { return u !== uid; });
    var opP = opUid ? participants[opUid] : null;
    var config = duelData.config || {};
    var totalQ = config.questionCount || 10;

    var myName = myP ? (myP.name || 'You') : 'You';
    var opName = opP ? (opP.name || 'Opponent') : 'Opponent';

    /* Calculate stats */
    var myScore = myP ? (myP.score || 0) : 0;
    var opScore = opP ? (opP.score || 0) : 0;
    var myAttempted = myP ? (myP.answers ? myP.answers.length : 0) : 0;
    var opAttempted = opP ? (opP.answers ? opP.answers.length : 0) : 0;
    var myWrong = Math.max(0, myAttempted - myScore);
    var opWrong = Math.max(0, opAttempted - opScore);
    var myAccuracy = myAttempted > 0 ? Math.round((myScore / myAttempted) * 100) : 0;
    var opAccuracy = opAttempted > 0 ? Math.round((opScore / opAttempted) * 100) : 0;
    var myAvgTime = myP && myP.totalTime && myAttempted ? ((myP.totalTime / myAttempted) / 1000).toFixed(1) : '-';
    var opAvgTime = opP && opP.totalTime && opAttempted ? ((opP.totalTime / opAttempted) / 1000).toFixed(1) : '-';
    var myTotalTime = myP ? ((myP.totalTime || 0) / 1000).toFixed(1) + 's' : '-';
    var opTotalTime = opP ? ((opP.totalTime || 0) / 1000).toFixed(1) + 's' : '-';

    var isWinner = duelData.winner === uid;
    var isDraw = duelData.result === 'draw';
    var isCompleted = duelData.status === 'completed';

    /* Opponent status */
    var opStatus = opP ? opP.status : 'unknown';
    var opStatusText = '';
    if (opStatus === 'exited') opStatusText = '🚪 Exited early';
    else if (opStatus === 'disconnected') opStatusText = '📡 Disconnected';
    else if (opStatus === 'finished') opStatusText = '✅ Finished';
    else if (opStatus === 'playing' || opStatus === 'joined') opStatusText = '⏳ Still playing…';

    /* Title */
    var titleText, titleClass;
    if (!isCompleted || isPartial) {
      titleText = '📊 Your Results';
      titleClass = 'duel-result-partial';
    } else if (isDraw) {
      titleText = '🤝 Draw!';
      titleClass = 'duel-result-draw';
    } else if (isWinner) {
      titleText = '🏆 You Won!';
      titleClass = 'duel-result-winner';
    } else {
      titleText = '😤 You Lost';
      titleClass = 'duel-result-loser';
    }

    /* Topic summary */
    var topicPills = '';
    var topics = config.topics || [];
    for (var t = 0; t < topics.length; t++) {
      topicPills += '<span class="duel-config-pill" style="font-size:.65rem;">' + _fmtCat(topics[t]) + '</span>';
    }

    if (isPartial && !isCompleted) {
      /* Waiting Result Screen */
      container.innerHTML =
        '<div class="duel-results-card-v2 duel-result-waiting" style="background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);">' +
          '<div class="duel-result-header" style="border-bottom: 1px solid #334155; padding-bottom: 1rem;">' +
            '<h2 class="duel-result-title" style="color: #f8fafc; font-size: 1.5rem;">Waiting For Opponent</h2>' +
          '</div>' +
          '<div style="padding: 2rem 1rem; text-align: center;">' +
            '<div class="duel-waiting-indicator" style="margin-bottom: 1rem;"><span class="dot" style="background:#60a5fa;"></span><span class="dot" style="background:#60a5fa;"></span><span class="dot" style="background:#60a5fa;"></span></div>' +
            '<p style="color:#e2e8f0; font-size: 1.1rem; font-weight: 500; margin-bottom: 0.5rem;">Your duel has been submitted.</p>' +
            '<p style="color:#94a3b8; margin-bottom: 2rem;">Waiting for the other player to finish...</p>' +
            '<div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 1.5rem; display: flex; justify-content: space-around; margin-bottom: 2rem;">' +
              '<div>' +
                '<p style="font-size: 2rem; font-weight: 700; color: #fff;">' + myScore + '</p>' +
                '<p style="color: #94a3b8; font-size: 0.8rem;">Score</p>' +
              '</div>' +
              '<div>' +
                '<p style="font-size: 2rem; font-weight: 700; color: #fff;">' + myAttempted + '/' + totalQ + '</p>' +
                '<p style="color: #94a3b8; font-size: 0.8rem;">Attempted</p>' +
              '</div>' +
              '<div>' +
                '<p style="font-size: 2rem; font-weight: 700; color: #fff;">' + myAccuracy + '%</p>' +
                '<p style="color: #94a3b8; font-size: 0.8rem;">Accuracy</p>' +
              '</div>' +
            '</div>' +
            '<div class="duel-result-actions" style="flex-direction: column; gap: 0.5rem;">' +
              '<button class="btn-secondary" id="duelReturnToHome" style="width: 100%; background: transparent; border: 1px solid #334155; color: #94a3b8;">Return To Home</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      
      var returnBtn = container.querySelector('#duelReturnToHome');
      if (returnBtn) returnBtn.addEventListener('click', function() { DuelManager.returnToHome(); });
    } else {
      /* Final Result Screen */
      container.innerHTML =
        '<div class="duel-results-card-v2 ' + titleClass + '" id="duelShareCardContainer">' +
          /* Header */
          '<div class="duel-result-header" style="margin-bottom: 1.5rem;">' +
            (isCompleted && isWinner ? '<div class="duel-result-crown" style="font-size:3rem; margin-bottom:0.5rem;">👑</div>' : '') +
            '<h2 class="duel-result-title" style="font-size: 2rem;">' + titleText + '</h2>' +
          '</div>' +
          
          /* Score comparison */
          '<div class="duel-result-comparison-grid" style="margin-bottom: 2rem;">' +
            '<div class="duel-result-player-col">' +
              '<div class="duel-player-avatar' + (isWinner ? ' avatar-purple winner-glow' : ' avatar-purple') + '" style="width:60px; height:60px; font-size:1.5rem;">' + _getInitials(myName) + '</div>' +
              '<div class="duel-result-player-name" style="font-size:1.1rem; font-weight:600; margin-top:0.5rem;">' + myName + '</div>' +
              '<div class="duel-result-big-score" style="font-size:3rem;">' + myScore + '</div>' +
              '<div class="duel-result-score-label">correct</div>' +
            '</div>' +
            '<div class="duel-result-vs-col">' +
              '<div class="duel-result-vs-text" style="font-size:1.2rem; opacity:0.6;">VS</div>' +
            '</div>' +
            '<div class="duel-result-player-col">' +
              '<div class="duel-player-avatar' + (!isWinner && !isDraw && isCompleted ? ' avatar-blue winner-glow' : ' avatar-blue') + '" style="width:60px; height:60px; font-size:1.5rem;">' + _getInitials(opName) + '</div>' +
              '<div class="duel-result-player-name" style="font-size:1.1rem; font-weight:600; margin-top:0.5rem;">' + opName + '</div>' +
              '<div class="duel-result-big-score" style="font-size:3rem;">' + opScore + '</div>' +
              '<div class="duel-result-score-label">correct</div>' +
            '</div>' +
          '</div>' +
          
          /* Detailed stats */
          '<div class="duel-result-stats-section" style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 1.5rem;">' +
            _renderStatRow('Accuracy', myAccuracy + '%', opAccuracy + '%', myAccuracy, opAccuracy) +
            _renderStatRow('Wrong', myWrong, opWrong, 0, 0) +
            _renderStatRow('Avg Speed', myAvgTime + 's', opAvgTime + 's', 0, 0) +
            _renderStatRow('Attempted', myAttempted + '/' + totalQ, opAttempted + '/' + totalQ, 0, 0) +
            _renderStatRow('Total Time', myTotalTime, opTotalTime, 0, 0) +
          '</div>' +
          
          /* Topic summary */
          (topicPills
            ? '<div class="duel-result-topic-summary" style="margin-top: 1.5rem; text-align: center;">' +
                '<span class="secondary-text" style="font-size:.8rem; display:block; margin-bottom:0.5rem;">Topics</span>' + 
                '<div>' + topicPills + '</div>' +
              '</div>'
            : ''
          ) +
        '</div>' +
        
        /* Action buttons outside the shareable card area */
        '<div class="duel-result-actions" style="margin-top: 1.5rem; display: flex; flex-direction: column; gap: 0.5rem; padding: 0 1rem;">' +
          '<button class="btn-primary" id="duelShareBtn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg> Share Result</button>' +
          '<button class="btn-secondary" id="duelResultDone" style="width: 100%; background: #334155; border: none; color: #fff;">Back to Home</button>' +
        '</div>';
      var shareBtn = container.querySelector('#duelShareBtn');
      if (shareBtn) {
        shareBtn.addEventListener('click', function () {
          if (typeof ShareService !== 'undefined') {
            ShareService.shareAsImage({
              mode: 'Duel vs ' + opName,
              displayName: myName,
              score: myScore,
              total: totalQ,
              accuracy: myAccuracy,
              avgTime: myAvgTime !== '-' ? myAvgTime : '0',
              percentile: 0, /* We could calculate if we wanted */
              streak: 0,
              difficulty: 'Duel',
              totalTime: myTotalTime.replace('s', ''),
              topics: topics
            });
          }
        });
      }
    }

    container.style.display = 'flex';

    if (isCompleted) {
      if (typeof triggerHaptic === 'function') triggerHaptic(isWinner ? [50, 30, 50] : 30);
      if (typeof SoundEngine !== 'undefined') SoundEngine.play('drillEnd');
    }

    var doneBtn = document.getElementById('duelResultDone');
    if (doneBtn) {
      doneBtn.addEventListener('click', function () {
        DuelManager.exitDuel();
      });
    }
  }

  function _renderStatRow(label, myVal, opVal, myNum, opNum) {
    return '<div class="duel-result-stat-row">' +
      '<span class="duel-result-stat-val left">' + myVal + '</span>' +
      '<span class="duel-result-stat-label">' + label + '</span>' +
      '<span class="duel-result-stat-val right">' + opVal + '</span>' +
    '</div>';
  }

  /* ================================================================
   * PUBLIC API
   * ================================================================ */

  return {
    renderSetup: renderSetup,
    renderJoinScreen: renderJoinScreen,
    renderWaitingRoom: renderWaitingRoom,
    renderActiveScreen: renderActiveScreen,
    renderResults: renderResults,
    updateScoreboard: updateScoreboard,
    destroyDuelSession: destroyDuelSession,
    clearTimers: clearTimers
  };
})();
