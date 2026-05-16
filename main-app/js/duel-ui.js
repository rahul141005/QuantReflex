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
          '<div class="duel-mode-toggle">' +
            '<button class="duel-mode-btn active" data-qmode="quick">⚡ Quick Questions</button>' +
            '<button class="duel-mode-btn" data-qmode="wordproblems">🤖 Word Problems</button>' +
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
            '<input type="range" id="duelQCount" class="custom-question-range" min="5" max="20" value="10" style="width:100%;" />' +
          '</div>' +
          /* Timer */
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;">' +
            '<span style="font-size:.85rem;font-weight:600;">Timer per question</span>' +
            '<select id="duelTimer" class="theme-select" style="min-width:7rem;">' +
              '<option value="0">No timer</option>' +
              '<option value="10">10 sec</option>' +
              '<option value="15" selected>15 sec</option>' +
              '<option value="20">20 sec</option>' +
              '<option value="30">30 sec</option>' +
            '</select>' +
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

        var timerVal = parseInt(document.getElementById('duelTimer').value, 10);
        var config = {
          topics: selectedTopics.slice(),
          difficulty: document.getElementById('duelDifficulty').value,
          questionCount: parseInt(qSlider.value, 10) || 10,
          questionMode: questionMode,
          timerPerQuestion: timerVal > 0 ? timerVal : null,
          timerTotal: null
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
    return '<div class="duel-player-slot filled">' +
      '<div class="duel-player-icon">' + (isFirst ? '🟣' : '🔵') + '</div>' +
      '<div class="duel-player-name">' + (player.name || 'Player') + '</div>' +
      '<div class="duel-player-status">Ready</div>' +
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

  function renderActiveScreen(container, duelData, onAnswer) {
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
    container.innerHTML =
      '<div class="duel-scoreboard">' +
        '<div class="duel-sb-player"><div class="duel-sb-name">' + (myP ? myP.name : 'You') + '</div><div class="duel-sb-score">' + (myP ? myP.score : 0) + '</div></div>' +
        '<div class="duel-sb-vs">VS</div>' +
        '<div class="duel-sb-player"><div class="duel-sb-name">' + (opP ? opP.name : 'Opponent') + '</div><div class="duel-sb-score">' + (opP ? opP.score : 0) + '</div></div>' +
      '</div>' +
      '<div class="duel-question-area">' +
        '<div class="drill-progress">Question ' + (qIndex + 1) + ' of ' + totalQ + '</div>' +
        '<div class="drill-progress-bar" style="max-width:200px;margin:0 auto .75rem;"><div class="drill-progress-fill" style="width:' + ((qIndex / totalQ) * 100) + '%;"></div></div>' +
        '<div class="question-text">' + (q ? q.text : '') + '</div>' +
        '<input type="text" class="input duel-answer-input" id="duelAnswerInput" readonly placeholder="Tap numpad to answer" autocomplete="off" />' +
        '<div class="feedback" id="duelFeedback"></div>' +
      '</div>';

    container.style.display = 'flex';

    /* Show numpad */
    var input = document.getElementById('duelAnswerInput');
    if (input && typeof showCustomNumpad === 'function') {
      var answerStartTime = Date.now();
      showCustomNumpad(input, function () {
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
    renderWaitingRoom: renderWaitingRoom,
    renderActiveScreen: renderActiveScreen,
    renderResults: renderResults
  };
})();
