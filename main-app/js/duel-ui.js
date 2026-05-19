/**
 * duel-ui.js — Math Duel UI rendering
 *
 * Renders all duel screens: setup, waiting room, active play, results.
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

  /* ---- Setup Screen ---- */

  function renderSetup(container, onBack) {
    var topicsHtml = '';
    for (var i = 0; i < _categories.length; i++) {
      topicsHtml += '<button class="category-btn category-card duel-topic-btn" data-cat="' +
        _categories[i].key + '">' + _categories[i].label + '</button>';
    }

    container.innerHTML =
      '<div class="duel-setup-card">' +
        '<div class="duel-setup-header">' +
          '<h3>⚔️ Math Duel Setup</h3>' +
          '<p>Configure your 1v1 challenge</p>' +
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
          '<button class="duel-create-btn" id="duelCreateBtn">Create Duel</button>' +
        '</div>' +
        '<button class="duel-setup-back" id="duelBackBtn">← Back</button>' +
      '</div>';

    container.style.display = 'flex';
    _bindSetupHandlers(container, onBack);
  }

  function _bindSetupHandlers(container, onBack) {
    var selectedTopics = [];
    var questionMode = 'quick';

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
        timerInput.value = '180'; /* 3 mins default */
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

    /* Create button */
    var createBtn = document.getElementById('duelCreateBtn');
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
          createBtn.textContent = 'Create Duel';
          if (err) {
            if (typeof showToast === 'function') showToast(err);
            return;
          }
          container.style.display = 'none';
          DuelManager.enterWaitingRoom(duelId);
        });
      });
    }
  }

  /* ---- Preview Screen (Join via Link) ---- */

  function renderPreviewScreen(container, duelData, onJoin, onCancel) {
    var config = duelData.config || {};
    var creatorName = duelData.createdByName || 'A user';
    
    var topicPills = '';
    var topics = config.topics || [];
    for (var i = 0; i < topics.length; i++) {
      topicPills += '<span class="duel-config-pill">' +
        (typeof formatCategoryName === 'function' ? formatCategoryName(topics[i]) : topics[i]) +
        '</span>';
    }

    var timerLabel = config.timerPerQuestion ? config.timerPerQuestion + 's/q' : 'No timer';

    container.innerHTML =
      '<div class="duel-setup-card">' +
        '<div class="duel-setup-header">' +
          '<h3>⚔️ Math Duel Invitation</h3>' +
          '<p>' + creatorName + ' challenged you</p>' +
        '</div>' +
        '<div class="duel-setup-body">' +
          '<div style="text-align:center;margin-bottom:1.5rem;">' +
            '<div style="font-size:3rem;margin-bottom:.5rem;">🥊</div>' +
            '<h4 style="margin-bottom:.5rem;">Duel Settings</h4>' +
            '<div class="duel-config-pills" style="justify-content:center;">' +
              topicPills +
              '<span class="duel-config-pill">📝 ' + (config.questionCount || 10) + ' Qs</span>' +
              '<span class="duel-config-pill">⏱ ' + timerLabel + '</span>' +
              '<span class="duel-config-pill">📊 ' + (config.difficulty || 'medium') + '</span>' +
            '</div>' +
          '</div>' +
          '<button class="duel-create-btn" id="duelJoinAcceptBtn" style="margin-bottom:.75rem;">Join Duel</button>' +
          '<button class="btn" id="duelJoinCancelBtn" style="width:100%;">Cancel</button>' +
        '</div>' +
      '</div>';

    container.style.display = 'flex';

    var acceptBtn = document.getElementById('duelJoinAcceptBtn');
    if (acceptBtn) {
      acceptBtn.addEventListener('click', function () {
        if (acceptBtn.disabled) return;
        acceptBtn.disabled = true;
        acceptBtn.textContent = 'Joining...';
        if (onJoin) onJoin();
      });
    }

    var cancelBtn = document.getElementById('duelJoinCancelBtn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        container.style.display = 'none';
        if (onCancel) onCancel();
      });
    }
  }

  /* ---- Waiting Room ---- */

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
      topicPills += '<span class="duel-config-pill">' +
        (typeof formatCategoryName === 'function' ? formatCategoryName(topics[i]) : topics[i]) +
        '</span>';
    }

    var timerLabel = config.timerPerQuestion ? config.timerPerQuestion + 's/q' : 'No timer';
    var myUid = (typeof Auth !== 'undefined') ? Auth.getUserId() : '';
    var isCreator = d.createdBy === myUid;
    var bothReady = uids.length >= 2;

    container.innerHTML =
      '<div class="duel-room-card">' +
        '<p class="duel-room-subtitle">Duel Room</p>' +
        '<div class="duel-room-code">' + d.id + '</div>' +
        '<div class="duel-config-pills">' +
          topicPills +
          '<span class="duel-config-pill">📝 ' + (config.questionCount || 10) + ' Qs</span>' +
          '<span class="duel-config-pill">⏱ ' + timerLabel + '</span>' +
          '<span class="duel-config-pill">📊 ' + (config.difficulty || 'medium') + '</span>' +
          '<span class="duel-config-pill">' + (config.questionMode === 'wordproblems' ? '🤖 Word' : '⚡ Quick') + '</span>' +
        '</div>' +
        '<div class="duel-players">' +
          _renderPlayerSlot(p1, true) +
          _renderPlayerSlot(p2, false) +
        '</div>' +
        (bothReady
          ? '<button class="duel-start-btn" id="duelStartBtn">Start Duel ⚔️</button>'
          : '<div class="duel-waiting-indicator">' +
              '<span class="dot"></span><span class="dot"></span><span class="dot"></span>' +
              '<span style="margin-left:.35rem;">Waiting for opponent…</span>' +
            '</div>' +
            '<button class="duel-share-btn" id="duelShareBtn">📤 Share Invite</button>'
        ) +
        '<button class="duel-leave-btn" id="duelLeaveBtn">Leave Duel</button>' +
      '</div>';

    container.style.display = 'flex';
    _bindWaitingHandlers(container, d.id, isCreator);
  }

  function _renderPlayerSlot(player, isFirst) {
    if (!player) {
      return '<div class="duel-player-slot empty">' +
        '<div class="duel-player-icon">👤</div>' +
        '<div class="duel-player-name">Waiting…</div>' +
        '</div>';
    }
    return '<div class="duel-player-slot filled fade-in" style="animation-duration: 0.3s;">' +
      '<div class="duel-player-icon" style="transform: scale(1.1);">' + (isFirst ? '🟣' : '🔵') + '</div>' +
      '<div class="duel-player-name" style="font-weight:600;">' + (player.name || 'Player') + '</div>' +
      '<div class="duel-player-status" style="color:var(--success);"><span class="dot" style="background:var(--success);animation:none;display:inline-block;width:6px;height:6px;margin-right:4px;"></span>Connected!</div>' +
      '</div>';
  }

  function _bindWaitingHandlers(container, duelId, isCreator) {
    var shareBtn = document.getElementById('duelShareBtn');
    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        var url = window.location.origin + window.location.pathname + '?duel=' + duelId;
        if (navigator.share) {
          navigator.share({ title: 'Math Duel Challenge', text: 'Join my Math Duel on QuantReflex!', url: url }).catch(function () {});
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(url).then(function () {
            if (typeof showToast === 'function') showToast('Invite link copied!');
          });
        }
        if (typeof triggerHaptic === 'function') triggerHaptic(10);
      });
    }

    var startBtn = document.getElementById('duelStartBtn');
    if (startBtn) {
      startBtn.addEventListener('click', function () {
        if (startBtn.disabled) return;
        
        startBtn.disabled = true;
        startBtn.textContent = 'Starting…';
        DuelCore.startDuel(duelId, function (err) {
          if (err && typeof showToast === 'function') showToast(err);
        });
      });
    }

    var leaveBtn = document.getElementById('duelLeaveBtn');
    if (leaveBtn) {
      leaveBtn.addEventListener('click', function () {
        DuelManager.leaveDuel(duelId);
      });
    }
  }

  /* ---- Active Duel Screen ---- */

  var _activeDuelTimer = null;

  function clearTimers() {
    if (_activeDuelTimer) {
      clearInterval(_activeDuelTimer);
      _activeDuelTimer = null;
    }
  }

  function renderActiveScreen(container, duelData, onAnswer) {
    clearTimers();
    var uid = (typeof Auth !== 'undefined') ? Auth.getUserId() : '';
    var participants = duelData.participants || {};
    var uids = Object.keys(participants);
    var myP = participants[uid];
    var opUid = uids.find(function (u) { return u !== uid; });
    var opP = opUid ? participants[opUid] : null;
    var qIndex = myP ? (myP.answers ? myP.answers.length : 0) : 0;
    var questions = duelData.questions || [];
    var totalQ = duelData.config ? duelData.config.questionCount : questions.length;

    if (qIndex >= totalQ || qIndex >= questions.length) {
      /* Player finished — show waiting for opponent */
      container.innerHTML =
        '<div class="duel-scoreboard">' +
          '<div class="duel-sb-player"><div class="duel-sb-name">' + (myP ? myP.name : 'You') + '</div><div class="duel-sb-score">' + (myP ? myP.score : 0) + '</div></div>' +
          '<div class="duel-sb-vs">VS</div>' +
          '<div class="duel-sb-player"><div class="duel-sb-name">' + (opP ? opP.name : 'Opponent') + '</div><div class="duel-sb-score">' + (opP ? opP.score : 0) + '</div></div>' +
        '</div>' +
        '<div class="duel-question-area">' +
          '<h2 style="margin-bottom:.5rem;">✅ You finished!</h2>' +
          '<p class="secondary-text">Waiting for opponent to finish…</p>' +
          '<div class="duel-waiting-indicator" style="margin-top:1rem;"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>' +
        '</div>';
      container.style.display = 'flex';
      return;
    }

    var q = questions[qIndex];
    var config = duelData.config || {};
    var timerHtml = '';
    if (config.timerTotal || config.timerPerQuestion) {
      timerHtml = '<p id="duelTimerDisplay" class="timer"></p>';
    }

    container.innerHTML =
      '<div class="duel-scoreboard">' +
        '<div class="duel-sb-player"><div class="duel-sb-name">' + (myP ? myP.name : 'You') + '</div><div class="duel-sb-score">' + (myP ? myP.score : 0) + '</div></div>' +
        '<div class="duel-sb-vs">VS</div>' +
        '<div class="duel-sb-player"><div class="duel-sb-name">' + (opP ? opP.name : 'Opponent') + '</div><div class="duel-sb-score">' + (opP ? opP.score : 0) + '</div></div>' +
      '</div>' +
      '<div class="duel-question-area">' +
        '<div class="drill-progress">Question ' + (qIndex + 1) + ' of ' + totalQ + '</div>' +
        '<div class="drill-progress-bar" style="max-width:200px;margin:0 auto .75rem;"><div class="drill-progress-fill" style="width:' + ((qIndex / totalQ) * 100) + '%;"></div></div>' +
        timerHtml +
        '<div class="question-text">' + (q ? q.text : '') + '</div>' +
        '<input type="text" class="input duel-answer-input" id="duelAnswerInput" readonly placeholder="Tap numpad to answer" autocomplete="off" />' +
        '<div class="feedback" id="duelFeedback"></div>' +
      '</div>';

    container.style.display = 'flex';

    /* Show numpad */
    var input = document.getElementById('duelAnswerInput');
    var isAnswered = false;

    function _forceSubmit() {
      if (isAnswered) return;
      isAnswered = true;
      clearTimers();
      input.disabled = true;
      if (typeof hideCustomNumpad === 'function') hideCustomNumpad();
      if (onAnswer) onAnswer(qIndex, null, false, 0);
    }

    if (config.timerTotal) {
      var startedAt = duelData.duelStartedAt ? duelData.duelStartedAt.toMillis() : Date.now();
      var limitMs = config.timerTotal * 1000;
      _activeDuelTimer = setInterval(function() {
        var el = document.getElementById('duelTimerDisplay');
        var elapsed = Date.now() - startedAt;
        var rem = Math.ceil((limitMs - elapsed) / 1000);
        if (rem < 0) rem = 0;
        if (el) el.textContent = '⏱ ' + rem + 's';
        if (rem <= 0) _forceSubmit();
      }, 1000);
    } else if (config.timerPerQuestion) {
      var remaining = config.timerPerQuestion;
      _activeDuelTimer = setInterval(function() {
        var el = document.getElementById('duelTimerDisplay');
        if (el) el.textContent = '⏱ ' + remaining + 's';
        if (remaining <= 0) _forceSubmit();
        remaining--;
      }, 1000);
    }

    if (input && typeof showCustomNumpad === 'function') {
      var answerStartTime = Date.now();
      showCustomNumpad(input, function () {
        if (isAnswered) return;
        isAnswered = true;
        clearTimers();
        var val = input.value.trim();
        if (!val) return;
        var userAnswer = parseFloat(val);
        var correct = q && (userAnswer === q.answer);
        var timeMs = Date.now() - answerStartTime;

        /* Show feedback briefly */
        var fb = document.getElementById('duelFeedback');
        if (fb) {
          fb.textContent = correct ? '✓ Correct!' : '✗ ' + q.answer;
          fb.className = 'feedback feedback-anim ' + (correct ? 'correct' : 'wrong');
        }
        if (typeof triggerHaptic === 'function') triggerHaptic(correct ? 10 : [30, 20, 30]);
        if (typeof SoundEngine !== 'undefined') SoundEngine.play(correct ? 'correct' : 'wrong');

        input.disabled = true;
        if (typeof hideCustomNumpad === 'function') hideCustomNumpad();

        if (onAnswer) onAnswer(qIndex, userAnswer, correct, timeMs);
      });
    }
  }

  /* ---- Results Screen ---- */

  function renderResults(container, duelData) {
    var uid = (typeof Auth !== 'undefined') ? Auth.getUserId() : '';
    var participants = duelData.participants || {};
    var uids = Object.keys(participants);
    var myP = participants[uid];
    var opUid = uids.find(function (u) { return u !== uid; });
    var opP = opUid ? participants[opUid] : null;

    var isWinner = duelData.winner === uid;
    var isDraw = duelData.result === 'draw';
    var titleClass = isDraw ? 'duel-result-draw' : (isWinner ? 'duel-result-winner' : 'duel-result-loser');
    var titleText = isDraw ? '🤝 Draw!' : (isWinner ? '🏆 You Won!' : '😤 You Lost!');

    var myTime = myP ? ((myP.totalTime || 0) / 1000).toFixed(1) + 's' : '-';
    var opTime = opP ? ((opP.totalTime || 0) / 1000).toFixed(1) + 's' : '-';

    container.innerHTML =
      '<div class="duel-results-card duel-result-celebrate">' +
        '<h2 class="duel-result-title ' + titleClass + '">' + titleText + '</h2>' +
        '<div class="duel-result-comparison">' +
          '<div class="duel-result-player' + (isWinner ? ' winner' : '') + '">' +
            '<div class="duel-player-icon">🟣</div>' +
            '<div class="duel-player-name">' + (myP ? myP.name : 'You') + '</div>' +
            '<div class="duel-result-score">' + (myP ? myP.score : 0) + '</div>' +
            '<div class="duel-result-label">correct</div>' +
            '<div class="duel-result-stat">⏱ ' + myTime + '</div>' +
          '</div>' +
          '<div class="duel-result-player' + (!isWinner && !isDraw ? ' winner' : '') + '">' +
            '<div class="duel-player-icon">🔵</div>' +
            '<div class="duel-player-name">' + (opP ? opP.name : 'Opponent') + '</div>' +
            '<div class="duel-result-score">' + (opP ? opP.score : 0) + '</div>' +
            '<div class="duel-result-label">correct</div>' +
            '<div class="duel-result-stat">⏱ ' + opTime + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="duel-result-actions">' +
          '<button class="btn accent" id="duelResultDone" style="max-width:240px;">Back to Practice</button>' +
        '</div>' +
      '</div>';

    container.style.display = 'flex';
    if (typeof triggerHaptic === 'function') triggerHaptic(isWinner ? [50, 30, 50] : 30);
    if (typeof SoundEngine !== 'undefined') SoundEngine.play('drillEnd');

    var doneBtn = document.getElementById('duelResultDone');
    if (doneBtn) {
      doneBtn.addEventListener('click', function () {
        DuelManager.exitDuel();
      });
    }
  }

  return {
    renderSetup: renderSetup,
    renderPreviewScreen: renderPreviewScreen,
    renderWaitingRoom: renderWaitingRoom,
    renderActiveScreen: renderActiveScreen,
    renderResults: renderResults,
    clearTimers: clearTimers
  };
})();
