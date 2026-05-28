/**
 * duel-ui.js — Math Duel UI rendering (V3 — Room Code Only)
 *
 * Simplified rebuild:
 *   - Room-code-only setup screen (create duel → share code)
 *   - Room-code join screen (enter code → join)
 *   - Premium waiting room with countdown
 *   - Fixed active screen (numpad always visible, exit button)
 *   - Premium results with realtime comparison
 *   - No invitation system
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
          '<button class="duel-create-btn" id="duelCreateBtn" disabled>Create Duel ⚔️</button>' +
        '</div>' +
        '<button class="duel-setup-back" id="duelBackBtn">← Back</button>' +
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

    /* Bind start button (creator only) — shows 3-2-1-GO then starts */
    var startBtn = document.getElementById('duelStartBtn');
    if (startBtn) {
      startBtn.addEventListener('click', function () {
        if (startBtn.disabled) return;
        startBtn.disabled = true;
        startBtn.textContent = 'Starting…';

        /* Show countdown overlay inside waiting room */
        var countdownDiv = document.createElement('div');
        countdownDiv.className = 'duel-countdown-overlay';
        countdownDiv.innerHTML = '<div class="duel-countdown-number" id="duelCountdownNum">3</div>';
        container.appendChild(countdownDiv);

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
            /* NOW transition to active in Firestore */
            DuelCore.startDuel(d.id, function (err) {
              if (err && typeof showToast === 'function') showToast(err);
            });
          }
        }, 800);
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
   * ACTIVE DUEL SCREEN — Stateful session controller
   * Renders once. Progresses questions locally. Numpad stays visible.
   * Listener only updates scoreboard (via updateScoreboard).
   * ================================================================ */

  /* Shared state for the active duel session */
  var _duelSession = null;

  function renderActiveScreen(container, duelData, onAnswer) {
    clearTimers();

    var uid = (typeof Auth !== 'undefined') ? Auth.getUserId() : '';
    var participants = duelData.participants || {};
    var uids = Object.keys(participants);
    var myP = participants[uid];
    var opUid = uids.find(function (u) { return u !== uid; });
    var opP = opUid ? participants[opUid] : null;
    var questions = duelData.questions || [];
    var config = duelData.config || {};
    var totalQ = config.questionCount || questions.length;

    /* Calculate starting question index from existing answers */
    var startIdx = myP ? (myP.answers ? myP.answers.length : 0) : 0;
    var localScore = myP ? (myP.score || 0) : 0;

    var myName = myP ? (myP.name || 'You') : 'You';
    var opName = opP ? (opP.name || 'Opponent') : 'Opponent';

    /* Ensure body has drill-session-active for numpad positioning */
    document.body.classList.add('drill-session-active');
    document.documentElement.classList.add('drill-session-active');

    /* If already finished, show waiting screen */
    if (startIdx >= totalQ || startIdx >= questions.length) {
      _renderDuelFinished(container, myName, opName, myP, opP);
      return;
    }

    /* Build the full layout ONCE */
    var timerHtml = (config.timerTotal || config.timerPerQuestion)
      ? '<p id="duelTimerDisplay" class="timer"></p>' : '';

    container.innerHTML =
      '<div class="duel-header-bar">' +
        '<span class="duel-header-title">⚔️ Duel</span>' +
        '<button class="duel-exit-btn" id="duelExitBtnActive">Exit</button>' +
      '</div>' +
      '<div class="duel-scoreboard" id="duelScoreboard">' +
        '<div class="duel-sb-player"><div class="duel-sb-name">' + myName + '</div><div class="duel-sb-score" id="duelMyScore">' + localScore + '</div></div>' +
        '<div class="duel-sb-vs">VS</div>' +
        '<div class="duel-sb-player"><div class="duel-sb-name">' + opName + '</div><div class="duel-sb-score" id="duelOpScore">' + (opP ? opP.score : 0) + '</div></div>' +
      '</div>' +
      '<div class="duel-question-area" id="duelQuestionArea">' +
        '<div class="drill-progress" id="duelProgress">Question ' + (startIdx + 1) + ' of ' + totalQ + '</div>' +
        '<div class="drill-progress-bar" style="max-width:200px;margin:0 auto .75rem;"><div class="drill-progress-fill" id="duelProgressFill" style="width:' + ((startIdx / totalQ) * 100) + '%;"></div></div>' +
        timerHtml +
        '<div class="question-text" id="duelQuestionText"></div>' +
        '<input type="text" class="input duel-answer-input" id="duelAnswerInput" inputmode="none" readonly placeholder="Tap numpad to answer" autocomplete="off" />' +
        '<div class="feedback" id="duelFeedback"></div>' +
      '</div>';

    container.style.display = 'flex';
    _bindExitBtn();

    /* Initialize session state in closure */
    var qIndex = startIdx;
    var session = {
      container: container,
      duelData: duelData,
      questions: questions,
      totalQ: totalQ,
      config: config,
      uid: uid,
      myName: myName,
      opName: opName,
      onAnswer: onAnswer,
      qIndex: qIndex,
      localScore: localScore,
      isAnswered: false,
      totalTimeMs: myP ? (myP.totalTime || 0) : 0,
      destroyed: false
    };
    _duelSession = session;

    /* Load the first question */
    _loadDuelQuestion(session);

    /* Start timers */
    _startDuelTimers(session);
  }

  /**
   * Load a question into the existing DOM (no full re-render).
   */
  function _loadDuelQuestion(session) {
    if (session.destroyed) return;

    var q = session.questions[session.qIndex];
    if (!q) return;

    /* Update progress */
    var progressEl = document.getElementById('duelProgress');
    if (progressEl) progressEl.textContent = 'Question ' + (session.qIndex + 1) + ' of ' + session.totalQ;

    var fillEl = document.getElementById('duelProgressFill');
    if (fillEl) fillEl.style.width = ((session.qIndex / session.totalQ) * 100) + '%';

    /* Update question text */
    var textEl = document.getElementById('duelQuestionText');
    if (textEl) textEl.textContent = q.text || '';

    /* Clear and reset input */
    var input = document.getElementById('duelAnswerInput');
    if (input) {
      input.value = '';
      input.disabled = false;
    }

    /* Clear feedback */
    var fb = document.getElementById('duelFeedback');
    if (fb) { fb.textContent = ''; fb.className = 'feedback'; }

    /* Update my score display */
    var myScoreEl = document.getElementById('duelMyScore');
    if (myScoreEl) myScoreEl.textContent = session.localScore;

    /* Reset answered flag */
    session.isAnswered = false;
    var answerStartTime = Date.now();

    /* Show numpad (or rebind if already visible) */
    if (input && typeof showCustomNumpad === 'function') {
      showCustomNumpad(input, function () {
        _handleDuelAnswer(session, answerStartTime);
      });
    }

    /* Per-question timer reset */
    if (session.config.timerPerQuestion && !session.config.timerTotal) {
      _resetPerQuestionTimer(session);
    }
  }

  /**
   * Handle answer submission from numpad.
   */
  function _handleDuelAnswer(session, answerStartTime) {
    if (session.isAnswered || session.destroyed) return;
    session.isAnswered = true;

    var input = document.getElementById('duelAnswerInput');
    var val = input ? input.value.trim() : '';
    if (!val) return; /* empty submit — ignore */

    var q = session.questions[session.qIndex];
    var userAnswer = parseFloat(val);
    var timeMs = Date.now() - answerStartTime;

    /* Answer comparison with tolerance (matching drill-engine logic) */
    var correct = false;
    if (q) {
      var expected = q.answer;
      if (userAnswer === expected) {
        correct = true;
      } else if (!isNaN(userAnswer) && !isNaN(expected)) {
        var tolerance = Math.abs(expected) > 0 ? Math.max(0.01, Math.abs(expected) * 0.001) : 0.01;
        if (Math.abs(userAnswer - expected) <= tolerance) {
          correct = true;
        }
      }
    }

    if (correct) session.localScore++;
    session.totalTimeMs += timeMs;

    /* Show feedback */
    var fb = document.getElementById('duelFeedback');
    if (fb) {
      fb.textContent = correct ? '✓ Correct!' : '✗ ' + (q ? q.answer : '');
      fb.className = 'feedback feedback-anim ' + (correct ? 'correct' : 'wrong');
    }
    if (typeof triggerHaptic === 'function') triggerHaptic(correct ? 10 : [30, 20, 30]);
    if (typeof SoundEngine !== 'undefined') SoundEngine.play(correct ? 'correct' : 'wrong');

    /* Disable input during feedback (but DON'T hide numpad) */
    if (input) input.disabled = true;

    /* Update score immediately */
    var myScoreEl = document.getElementById('duelMyScore');
    if (myScoreEl) myScoreEl.textContent = session.localScore;

    /* Submit answer to Firestore (async) */
    if (session.onAnswer) {
      session.onAnswer(session.qIndex, userAnswer, correct, timeMs);
    }

    /* After brief feedback delay, advance to next question */
    var feedbackDelay = correct ? 600 : 900;
    setTimeout(function () {
      if (session.destroyed) return;
      session.qIndex++;

      if (session.qIndex >= session.totalQ || session.qIndex >= session.questions.length) {
        /* Player finished all questions */
        _onDuelSessionFinished(session);
      } else {
        /* Load next question — numpad stays visible */
        _loadDuelQuestion(session);
      }
    }, feedbackDelay);
  }

  /**
   * Called when player finishes all questions.
   */
  function _onDuelSessionFinished(session) {
    session.destroyed = true;
    clearTimers();
    _renderDuelFinished(session.container, session.myName, session.opName, null, null);
  }

  /**
   * Render "You finished! Waiting for opponent" state.
   */
  function _renderDuelFinished(container, myName, opName, myP, opP) {
    container.innerHTML =
      '<div class="duel-header-bar">' +
        '<span class="duel-header-title">⚔️ Duel</span>' +
        '<button class="duel-exit-btn" id="duelExitBtnActive">Exit</button>' +
      '</div>' +
      '<div class="duel-scoreboard">' +
        '<div class="duel-sb-player"><div class="duel-sb-name">' + myName + '</div><div class="duel-sb-score" id="duelMyScore">' + (_duelSession ? _duelSession.localScore : (myP ? myP.score : 0)) + '</div></div>' +
        '<div class="duel-sb-vs">VS</div>' +
        '<div class="duel-sb-player"><div class="duel-sb-name">' + opName + '</div><div class="duel-sb-score" id="duelOpScore">' + (opP ? opP.score : 0) + '</div></div>' +
      '</div>' +
      '<div class="duel-question-area">' +
        '<h2 style="margin-bottom:.5rem;">✅ You finished!</h2>' +
        '<p class="secondary-text">Waiting for ' + opName + ' to finish…</p>' +
        '<div class="duel-waiting-indicator" style="margin-top:1rem;"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>' +
      '</div>';
    container.style.display = 'flex';
    _bindExitBtn();
    if (typeof hideCustomNumpad === 'function') hideCustomNumpad();
  }

  /**
   * Force-submit current question (timer expiry).
   */
  function _forceSubmitDuel(session) {
    if (session.isAnswered || session.destroyed) return;
    session.isAnswered = true;
    if (session.onAnswer) {
      session.onAnswer(session.qIndex, null, false, 0);
    }
    session.qIndex++;
    if (session.qIndex >= session.totalQ || session.qIndex >= session.questions.length) {
      _onDuelSessionFinished(session);
    } else {
      _loadDuelQuestion(session);
    }
  }

  /**
   * Start duel timers.
   */
  function _startDuelTimers(session) {
    var config = session.config;
    if (config.timerTotal) {
      var startedAt = session.duelData.duelStartedAt && session.duelData.duelStartedAt.toDate
        ? session.duelData.duelStartedAt.toDate().getTime() : Date.now();
      var limitMs = config.timerTotal * 1000;
      _activeDuelTimer = setInterval(function () {
        if (session.destroyed) { clearInterval(_activeDuelTimer); _activeDuelTimer = null; return; }
        var el = document.getElementById('duelTimerDisplay');
        var elapsed = Date.now() - startedAt;
        var rem = Math.ceil((limitMs - elapsed) / 1000);
        if (rem < 0) rem = 0;
        if (el) el.textContent = '⏱ ' + rem + 's';
        if (rem <= 0) { clearInterval(_activeDuelTimer); _activeDuelTimer = null; _forceSubmitDuel(session); }
      }, 1000);
    } else if (config.timerPerQuestion) {
      _resetPerQuestionTimer(session);
    }
  }

  /**
   * Reset per-question timer.
   */
  function _resetPerQuestionTimer(session) {
    if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
    var remaining = session.config.timerPerQuestion;
    _countdownTimer = setInterval(function () {
      if (session.destroyed || session.isAnswered) { clearInterval(_countdownTimer); _countdownTimer = null; return; }
      var el = document.getElementById('duelTimerDisplay');
      if (el) el.textContent = '⏱ ' + remaining + 's';
      if (remaining <= 0) { clearInterval(_countdownTimer); _countdownTimer = null; _forceSubmitDuel(session); return; }
      remaining--;
    }, 1000);
  }

  /**
   * Update only the scoreboard (opponent score) without rebuilding the entire DOM.
   */
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

  /**
   * Destroy the active duel session (cleanup).
   */
  function destroyDuelSession() {
    if (_duelSession) {
      _duelSession.destroyed = true;
      _duelSession = null;
    }
    clearTimers();
  }

  function _bindExitBtn() {
    var exitBtn = document.getElementById('duelExitBtnActive');
    if (exitBtn) {
      exitBtn.addEventListener('click', function () {
        DuelManager.showExitDuelDialog();
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

    container.innerHTML =
      '<div class="duel-results-card-v2 ' + titleClass + '">' +
        /* Header */
        '<div class="duel-result-header">' +
          (isCompleted && isWinner ? '<div class="duel-result-crown">👑</div>' : '') +
          '<h2 class="duel-result-title">' + titleText + '</h2>' +
        '</div>' +

        /* Score comparison */
        '<div class="duel-result-comparison-grid">' +
          '<div class="duel-result-player-col">' +
            '<div class="duel-player-avatar' + (isWinner ? ' avatar-purple winner-glow' : ' avatar-purple') + '">' + _getInitials(myName) + '</div>' +
            '<div class="duel-result-player-name">' + myName + '</div>' +
            '<div class="duel-result-big-score">' + myScore + '</div>' +
            '<div class="duel-result-score-label">correct</div>' +
          '</div>' +
          '<div class="duel-result-vs-col">' +
            '<div class="duel-result-vs-text">VS</div>' +
          '</div>' +
          '<div class="duel-result-player-col">' +
            '<div class="duel-player-avatar' + (!isWinner && !isDraw && isCompleted ? ' avatar-blue winner-glow' : ' avatar-blue') + '">' + _getInitials(opName) + '</div>' +
            '<div class="duel-result-player-name">' + opName + '</div>' +
            '<div class="duel-result-big-score">' + (isPartial && !isCompleted && (opStatus === 'playing' || opStatus === 'joined') ? '…' : opScore) + '</div>' +
            '<div class="duel-result-score-label">' + (isPartial && !isCompleted ? opStatusText : 'correct') + '</div>' +
          '</div>' +
        '</div>' +

        /* Detailed stats */
        '<div class="duel-result-stats-section">' +
          _renderStatRow('Accuracy', myAccuracy + '%', isCompleted ? opAccuracy + '%' : '—', myAccuracy, opAccuracy) +
          _renderStatRow('Avg Speed', myAvgTime + 's', isCompleted ? opAvgTime + 's' : '—', 0, 0) +
          _renderStatRow('Attempted', myAttempted + '/' + totalQ, isCompleted ? opAttempted + '/' + totalQ : '—', 0, 0) +
          _renderStatRow('Total Time', myTotalTime, isCompleted ? opTotalTime : '—', 0, 0) +
        '</div>' +

        /* Opponent status (if partial/waiting) */
        (isPartial && !isCompleted
          ? '<div class="duel-result-waiting-opponent" id="duelResultOpponentStatus">' +
              '<div class="duel-waiting-indicator"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>' +
              '<p class="secondary-text" style="margin-top:.5rem;">' + opName + ' is still playing. Results will update automatically.</p>' +
            '</div>'
          : ''
        ) +

        /* Topic summary */
        (topicPills
          ? '<div class="duel-result-topic-summary">' +
              '<span class="secondary-text" style="font-size:.7rem;">Topics: </span>' + topicPills +
            '</div>'
          : ''
        ) +

        /* Action buttons */
        '<div class="duel-result-actions">' +
          '<button class="btn accent" id="duelResultDone" style="max-width:240px;">Back to Practice</button>' +
        '</div>' +
      '</div>';

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
