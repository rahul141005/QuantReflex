/**
 * drill-engine.js — Core drill / test engine (SPA compatible)
 *
 * Manages: question display, answer checking, per-question timer,
 *          scoring, streak tracking, and results summary.
 *
 * Modes:
 *   - Quick Drill:    5 questions, no timer
 *   - Reflex Drill:  10 questions, per-question timer (15s)
 *   - Timed Test:    10 questions, 180s overall limit
 *   - Focus Training: 10 questions from a specific category
 *   - Review Mistakes: review previously wrong questions
 *
 * Usage:
 *   var engine = createDrillEngine(container, { count, timeLimitSec, perQuestionSec, category, mode });
 *   engine.start();
 */

/**
 * Create a drill engine bound to the given container element.
 *
 * @param {HTMLElement} container  - wrapper element on the page
 * @param {object}      opts
 * @param {number}      opts.count           - number of questions (default 10)
 * @param {number|null} opts.timeLimitSec    - overall time limit in seconds (null = unlimited)
 * @param {number|null} opts.perQuestionSec  - per-question time limit in seconds (null = unlimited)
 * @param {string|null} opts.category        - question category filter (null = all)
 * @param {string[]|null} opts.topics        - optional custom mode topic list
 * @param {string}      opts.mode            - drill mode label for display
 * @param {boolean}     opts.reviewMode      - if true, use mistake review questions
 * @param {function}    opts.onFinish        - callback when drill finishes (for SPA navigation)
 * @returns {object} engine with .start() and .cleanup() methods
 */
function createDrillEngine(container, opts) {
  var count = opts.count || 10;
  var timeLimit = opts.timeLimitSec || null;
  var perQLimit = opts.perQuestionSec || null;
  var category = opts.category || null;
  var topics = Array.isArray(opts.topics) ? opts.topics : null;
  var mode = opts.mode || 'Drill';
  var reviewMode = opts.reviewMode || false;
  var onFinish = opts.onFinish || null;
  var preloadedQuestions = opts._preloadedQuestions || null;
  var adaptiveMode = opts.adaptive === true;
  
  /* ---- Duel Context Extensions ---- */
  var isDuel = opts.isDuel === true;
  var duelHeaderHTML = opts.duelHeaderHTML || '';
  var onDuelAnswerSubmit = opts.onDuelAnswerSubmit || null;

  /* ---- Adaptive controller state ---- */
  var _adaptiveHistory = [];   /* [{correct, timeSec}] last N answers */
  var _adaptiveDifficulty = 'medium';
  var _ADAPTIVE_WINDOW = 4;    /* rolling 4-answer window for fast in-session adaptation */

  function _computeAdaptiveDifficulty() {
    if (_adaptiveHistory.length < 2) return _adaptiveDifficulty;
    var window = _adaptiveHistory.slice(-_ADAPTIVE_WINDOW);
    var correct = 0;
    var totalTime = 0;
    for (var i = 0; i < window.length; i++) {
      if (window[i].correct) correct++;
      totalTime += window[i].timeSec;
    }
    var acc = correct / window.length;
    var avgTime = totalTime / window.length;
    if (acc > 0.8 && avgTime < 12) return 'hard';
    if (acc >= 0.5) return 'medium';
    return 'easy';
  }

  function _setAdaptiveOverride(diff) {
    _adaptiveDifficulty = diff;
    if (typeof AdaptiveState !== 'undefined') {
      AdaptiveState.setDifficulty(diff);
    } else {
      window._adaptiveOverrideDifficulty = diff;
    }
  }

  function _clearAdaptiveOverride() {
    if (typeof AdaptiveState !== 'undefined') {
      AdaptiveState.clearDifficulty();
    } else {
      window._adaptiveOverrideDifficulty = null;
    }
  }

  var questions = [];
  var current = 0;
  var score = 0;
  var bestSessionStreak = 0;
  var currentSessionStreak = 0;
  var perQuestionTimes = [];
  var sessionWrongCategories = {}; /* category → wrong count for insight engine */
  var qStart = 0;
  var overallStart = 0;
  var overallTimer = null;
  var perQTimer = null;
  var answered = false; /* prevents double-counting */
  var _nextReady = true; /* debounce guard — false for 350ms after answer confirmed, prevents carry-over taps */
  var beginStarted = false; /* prevents duplicate START on rapid taps */
  var _isFinished = false; /* prevents timer/checkAnswer race after finish() */
  var reviewOriginalCount = 0; /* track original count for review mode cap */
  var ui = {
    globalTimerEl: null,
    perQTimerEl: null,
    answerInputEl: null,
    submitBtnEl: null,
    feedbackEl: null,
    cardEl: null
  };

  /* ---- render helpers ---- */

  function renderStart() {
    var subtitle = count + ' questions';
    if (timeLimit) subtitle += ' · ' + timeLimit + 's time limit';
    if (perQLimit) subtitle += ' · ' + perQLimit + 's per question';
    if (category) subtitle += ' · ' + category;
    if (topics && topics.length) subtitle += ' · ' + topics.length + ' topics';

    container.innerHTML =
      '<div class="card center-content">' +
        '<h2>' + mode + '</h2>' +
        '<p>' + subtitle + '</p>' +
        '<button id="startBtn" class="btn-primary">Begin Challenge</button>' +
        '<button id="startBackBtn" class="btn-secondary">← Back to Modes</button>' +
      '</div>';
    hideCustomNumpad();
    _exitDrillSession();
    container.querySelector('#startBtn').addEventListener('click', begin);
    container.querySelector('#startBackBtn').addEventListener('click', function () {
      cleanup();
      _exitDrillSession();
      if (typeof FirestoreSync !== 'undefined') {
        FirestoreSync.endDrillBatch();
      }
      if (onFinish) {
        onFinish('practice');
      } else {
        Router.showView('practice');
      }
    });
  }

  function _escHtml(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

  function _adaptiveDiffLabel(diff) {
    if (diff === 'hard') return '<span class="adaptive-mode-pill adaptive-pill-hard">Hard ▲</span>';
    if (diff === 'easy') return '<span class="adaptive-mode-pill adaptive-pill-easy">Easy ▼</span>';
    return '<span class="adaptive-mode-pill adaptive-pill-medium">Medium ●</span>';
  }

  function renderQuestion() {
    answered = false;
    _nextReady = true; /* reset debounce for each new question */
    var q = questions[current];
    /* Use original count for progress display in review mode to avoid
       confusing jumps when wrong answers add questions to the queue.
       If current question exceeds original count (re-queued mistakes),
       show actual count instead. */
    var displayCount = reviewMode && reviewOriginalCount > 0
      ? (current >= reviewOriginalCount ? count : reviewOriginalCount)
      : count;
    var progressPct = displayCount > 0 ? Math.min(100, Math.round(((current) / displayCount) * 100)) : 0;
    var adaptivePill = adaptiveMode ? _adaptiveDiffLabel(_adaptiveDifficulty) : '';
    container.innerHTML =
      (isDuel ? duelHeaderHTML : '') +
      '<button class="session-exit drill-exit-btn" id="drillExitBtn" aria-label="Exit session" title="Exit session">✕</button>' +
      '<div class="card center-content fade-in question-card-transition">' +
        '<div class="drill-question-scroll">' +
          '<p class="drill-progress">Question ' + (current + 1) + ' / ' + displayCount + (adaptivePill ? ' ' + adaptivePill : '') + '</p>' +
          '<div class="drill-progress-bar"><div class="drill-progress-fill" style="width:' + progressPct + '%"></div></div>' +
          (timeLimit ? '<p id="globalTimer" class="timer"></p>' : '') +
          (perQLimit ? '<p id="perQTimer" class="timer"></p>' : '') +
          '<h2 class="question-text">' + _escHtml(q.question) + '</h2>' +
          '<input id="answerInput" class="input" type="text" inputmode="none" autocomplete="off" placeholder="Your answer" maxlength="15" readonly />' +
          '<div id="feedback" class="feedback"></div>' +
        '</div>' +
      '</div>' +
      '<div class="drill-actions">' +
        '<button id="submitBtn" class="btn-primary">Submit</button>' +
      '</div>';
    ui.globalTimerEl = container.querySelector('#globalTimer');
    ui.perQTimerEl = container.querySelector('#perQTimer');
    ui.answerInputEl = container.querySelector('#answerInput');
    ui.submitBtnEl = container.querySelector('#submitBtn');
    ui.feedbackEl = container.querySelector('#feedback');
    ui.cardEl = container.querySelector('.card');

    /* Exit button handler — uses custom in-app dialog because native
       confirm() can behave unreliably, sometimes ending sessions prematurely */
    container.querySelector('#drillExitBtn').addEventListener('click', function () {
      function performExit() {
        cleanup();
        _exitDrillSession();
        /* End Firestore batch that was started in begin() */
        if (typeof FirestoreSync !== 'undefined') {
          FirestoreSync.endDrillBatch();
        }
        if (onFinish) {
          onFinish('practice');
        } else {
          Router.showView('practice');
        }
      }

      if (typeof showExitSessionDialog === 'function') {
        showExitSessionDialog(performExit);
      } else {
        console.error('[DrillEngine] showExitSessionDialog missing. Exiting automatically.');
        performExit();
      }
    });

    var input = ui.answerInputEl;
    var submitBtn = ui.submitBtnEl;
    /* NOTE: input.focus() intentionally removed here —
       it triggers the native keyboard on mobile, fighting with our custom numpad.
       The input is readonly and receives input from the custom numpad buttons. */

    function submit() {
      if (!answered) checkAnswer(input.value.trim());
    }
    submitBtn.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });

    /* Skip button — only when skip setting is enabled and difficulty is not hard */
    var _skipSettings = typeof loadSettings === 'function' ? loadSettings() : {};
    var _skipFeatureAccess = (typeof canAccessFeature === 'function') ? canAccessFeature('skip_question') : true;
    if (_skipFeatureAccess && _skipSettings.skipEnabled && _skipSettings.difficulty !== 'hard') {
      var skipBtn = document.createElement('button');
      skipBtn.className = 'btn skip-btn';
      skipBtn.textContent = 'Skip →';
      skipBtn.addEventListener('click', function () {
        if (answered) return;
        answered = true;
        if (perQTimer) { clearInterval(perQTimer); perQTimer = null; }
        recordAnswer(false, q.category, q, 0);
        nextQuestion();
      });
      var actionsDiv = container.querySelector('.drill-actions');
      if (actionsDiv) {
        actionsDiv.classList.add('has-skip');
        actionsDiv.insertBefore(skipBtn, submitBtn);
      }
    }

    qStart = performance.now();

    /* Show custom numpad */
    showCustomNumpad(input, function() {
      if (!answered) checkAnswer(input.value.trim());
    });

    /* Per-question timer */
    if (perQLimit) {
      startPerQTimer();
    }
  }

  function checkAnswer(raw) {
    if (answered || _isFinished) return; /* prevent double-counting or post-finish race */
    answered = true;

    if (perQTimer) { clearInterval(perQTimer); perQTimer = null; }

    var elapsed = ((performance.now() - qStart) / 1000);
    var elapsedRounded = parseFloat(elapsed.toFixed(1));
    perQuestionTimes.push(elapsedRounded);

    var q = questions[current];
    var expected = String(q.answer);

    /* Normalize both values for comparison:
       - trim whitespace
       - handle numeric equivalence (e.g. "57.0" == "57", "3234.00" == "3234")
       - answer tolerance for decimal precision (33.33 matches 33.333, 33.3)
       Tolerance: allow rounding differences up to 0.5% of the expected value
       (min 0.05) to accept reasonable decimal approximations without being too lenient */
    var normalizedRaw = raw.replace(/\s/g, '');
    var normalizedExpected = expected.replace(/\s/g, '');
    var correct = false;

    if (normalizedRaw === normalizedExpected) {
      correct = true;
    } else if (normalizedRaw !== '' && !isNaN(normalizedRaw) && !isNaN(normalizedExpected)) {
      var rawNum = parseFloat(normalizedRaw);
      var expNum = parseFloat(normalizedExpected);
      if (rawNum === expNum) {
        correct = true;
      } else {
        /* Tolerance: allow rounding differences up to 0.01 for decimal answers */
        var tolerance = Math.abs(expNum) > 0 ? Math.max(0.01, Math.abs(expNum) * 0.001) : 0.01;
        if (Math.abs(rawNum - expNum) <= tolerance) {
          correct = true;
        }
      }
    }

    /* Track for adaptive controller */
    if (adaptiveMode && !isDuel) {
      _adaptiveHistory.push({ correct: correct, timeSec: elapsedRounded });
    }

    if (correct) {
      score++;
      currentSessionStreak++;
      if (currentSessionStreak > bestSessionStreak) bestSessionStreak = currentSessionStreak;
    } else {
      currentSessionStreak = 0;
      /* Track wrong-answer categories for post-session insight */
      var _wCat = q.category || 'unknown';
      sessionWrongCategories[_wCat] = (sessionWrongCategories[_wCat] || 0) + 1;
      /* In review mode, re-queue incorrect questions at the end so users
         cycle through remaining mistakes before seeing the same one again.
         Only re-queue if this exact question isn't already waiting in the
         remaining queue, to prevent duplicates. Cap at 2x original count. */
      if (reviewMode && count < reviewOriginalCount * 2) {
        var isDuplicate = false;
        for (var ri = current + 1; ri < questions.length; ri++) {
          if (questions[ri].question === q.question && String(questions[ri].answer) === String(q.answer)) {
            isDuplicate = true;
            break;
          }
        }
        if (!isDuplicate) {
          questions.push({ question: q.question, answer: q.answer, category: q.category, subtype: q.subtype });
          count++;
        }
      }
    }

    /* Record answer with response time and question data for mistake tracking */
    if (!isDuel) {
      recordAnswer(correct, q.category, q, elapsedRounded);
    } else if (typeof onDuelAnswerSubmit === 'function') {
      onDuelAnswerSubmit(correct, expected, elapsedRounded, q, function advance() {
        /* This allows the duel manager to control when to advance to the next question */
      });
    }

    /* Provide optional haptic/sound feedback */
    if (correct) {
      if (typeof triggerHaptic === 'function') triggerHaptic(50);
    } else {
      SoundEngine.play('wrongAnswer');
      if (typeof triggerHaptic === 'function') triggerHaptic([40, 30, 40]);
    }

    var feedback = ui.feedbackEl;

    if (correct) {
      feedback.textContent = '✓ Correct!';
      feedback.className = 'feedback correct feedback-anim';
    } else {
      feedback.className = 'feedback wrong wrong-answer-card feedback-anim';
      feedback.innerHTML = '';
      var wrongLabel = document.createElement('div');
      wrongLabel.className = 'wrong-answer-header';
      wrongLabel.textContent = '❌ Wrong Answer';
      var correctLabel = document.createElement('div');
      correctLabel.className = 'wrong-answer-correct';
      correctLabel.textContent = 'Correct Answer: ' + expected;
      feedback.appendChild(wrongLabel);
      feedback.appendChild(correctLabel);

      /* Auto-explain: show a rule-based tip immediately, no button press needed.
         Premium users always see the tip. Free users get 5 lifetime credits. */
      var autoTipEl = document.createElement('div');
      var _isPremium = (typeof canAccessFeature === 'function') ? canAccessFeature('adaptive_training') : false;
      if (_isPremium) {
        autoTipEl.className = 'auto-explain-tip';
        autoTipEl.textContent = _getAutoTip(q.category, q.subtype);
      } else {
        var _credits = _getExplainCredits();
        if (_credits > 0) {
          _decrementExplainCredits();
          autoTipEl.className = 'auto-explain-tip';
          autoTipEl.textContent = _getAutoTip(q.category, q.subtype);
        } else {
          autoTipEl.className = 'auto-explain-tip auto-explain-locked';
          autoTipEl.innerHTML = '🔒 <a class="auto-explain-unlock" href="#">Unlock unlimited explanations</a>';
          var _lockLink = autoTipEl.querySelector('.auto-explain-unlock');
          if (_lockLink) {
            _lockLink.addEventListener('click', function (e) {
              e.preventDefault();
              if (typeof showPaywall === 'function') showPaywall('ai_explain');
            });
          }
        }
      }
      feedback.appendChild(autoTipEl);

      var card = ui.cardEl;
      if (card) card.classList.add('feedback-shake');
      setTimeout(function () { if (card) card.classList.remove('feedback-shake'); }, 400);
    }

    if (typeof AIFeatures !== 'undefined' && (!correct || reviewMode)) {
      var explainBtn = document.createElement('button');
      explainBtn.className = 'drill-explain-btn';
      var _canExplain = (typeof canAccessFeature === 'function') ? canAccessFeature('ai_explain') : true;
      explainBtn.textContent = _canExplain ? '🧠 Explain' : '🧠 Explain 🔒';
      explainBtn.addEventListener('click', function () {
        if (typeof canAccessFeature === 'function' && !canAccessFeature('ai_explain')) {
          if (typeof showPaywall === 'function') showPaywall('ai_explain');
          return;
        }
        AIFeatures.showExplanationModal(q.question, expected, q.category);
      });
      feedback.parentNode.insertBefore(explainBtn, feedback.nextSibling);
    }

    var actionsDiv = container.querySelector('.drill-actions');
    if (actionsDiv) {
      var existingSkip = actionsDiv.querySelector('.skip-btn');
      if (existingSkip) {
        if (correct) {
          existingSkip.parentNode.removeChild(existingSkip);
          actionsDiv.classList.remove('has-skip');
        } else {
          existingSkip.disabled = true;
          existingSkip.classList.add('skip-btn-disabled');
        }
      }
    }

    /* Replace submit with next */
    var submitBtn = ui.submitBtnEl;
    submitBtn.textContent = current + 1 < count ? 'Next →' : 'View Results';
    /* Block next-question for 350ms to prevent carry-over numpad taps */
    _nextReady = false;
    var _nextGuardTimer = setTimeout(function () {
      _nextReady = true;
      /* Pulse the Next button after the guard clears to draw attention */
      submitBtn.classList.add('next-btn-pulse');
      setTimeout(function () { submitBtn.classList.remove('next-btn-pulse'); }, 600);
    }, 350);

    if (isDuel) {
      // In a duel, auto-advance is handled or skipped. Let's still pause 1.5s then nextQuestion,
      // but only if the user didn't hit next. Wait, in standard drill it auto advances.
      // We will let it auto advance locally so the user proceeds to their next question.
      _nextReady = false;
      setTimeout(nextQuestion, 1500);
    } else {
      /* Auto-advance logic for quick reflex modes */
      if (mode === 'Reflex Drill' && correct) {
        _nextReady = false;
        setTimeout(nextQuestion, 600);
      } else {
        /* Wait for manual "Next" button click for standard modes */
      }
    }
    
    submitBtn.onclick = function () {
      if (!_nextReady) return; /* guard against carry-over taps */
      nextQuestion();
    };

    /* Focus next button for keyboard navigation */
    submitBtn.focus();

    ui.answerInputEl.disabled = true;

    /* Correct-answer micro-interaction: flash card green */
    if (correct) {
      var card = ui.cardEl;
      if (card) {
        card.classList.add('correct-flash');
        setTimeout(function () { if (card) card.classList.remove('correct-flash'); }, 450);
      }
    }
  }

  function nextQuestion() {
    /* Guard against carry-over taps during transition debounce */
    if (!_nextReady) return;
    current++;
    if (current < count) {
      /* Adaptive: recompute difficulty and generate a fresh question for next slot */
      if (adaptiveMode && !preloadedQuestions && !reviewMode) {
        var newDiff = _computeAdaptiveDifficulty();
        _setAdaptiveOverride(newDiff);
        var nextCat = category;
        if (!nextCat && topics && topics.length) {
          nextCat = topics[current % topics.length];
        }
        var fresh = generateQuestions(1, nextCat || null);
        if (fresh && fresh.length > 0) questions[current] = fresh[0];
        _clearAdaptiveOverride();
      }
      renderQuestion();
    } else {
      if (adaptiveMode) _clearAdaptiveOverride();
      finish();
    }
  }

  /* ---- Scoring, share, and insight — delegated to extracted services ---- */
  /* See js/services/scoring-service.js and js/services/share-service.js */

  function _computeSpeedScore(accNum, avgTimeSec) {
    return ScoringService.computeSpeedScore(accNum, avgTimeSec);
  }

  var _PERCENTILE_KEY = ScoringService.PERCENTILE_KEY;
  var _SESSIONS_COUNT_KEY = ScoringService.SESSIONS_COUNT_KEY;

  function _computeContinuousPercentile(speedScore) {
    return ScoringService.computePercentile(speedScore);
  }

  function _getPercentileClass(pct) {
    return ScoringService.getPercentileClass(pct);
  }

  function _loadBestScores() {
    return ScoringService.loadBestScores();
  }

  function _saveBestScores(obj) {
    ScoringService.saveBestScores(obj);
  }

  function _getExplainCredits() {
    return ScoringService.getExplainCredits();
  }

  function _decrementExplainCredits() {
    ScoringService.decrementExplainCredits();
  }

  function _getAutoTip(cat, subtype) {
    return ScoringService.getAutoTip(cat, subtype);
  }

  function _shareAsImage(shareData) {
    ShareService.shareAsImage(shareData);
  }

  function _shareTextFallback(accuracy, percentile) {
    ShareService.shareTextFallback(accuracy, percentile);
  }

  function _computeSessionInsight(accNum, wrongCats) {
    return ScoringService.computeSessionInsight(accNum, wrongCats);
  }

  function finish() {
    _isFinished = true;
    cleanup();
    _exitDrillSession();
    if (adaptiveMode) _clearAdaptiveOverride();
    SoundEngine.play('drillEnd');
    /* Haptic feedback on drill completion */
    if (typeof triggerHaptic === 'function') triggerHaptic([50, 50, 100]);

    /* Record session type */
    if (!isDuel) {
      if (timeLimit) {
        recordTimedTestSession();
      } else {
        recordDrillSession();
      }
    }

    /* End Firestore write batching — flush all queued updates */
    if (typeof FirestoreSync !== 'undefined' && !isDuel) {
      FirestoreSync.endDrillBatch();
    }
    
    if (isDuel) {
      if (onFinish) onFinish('duel_ended');
      return; /* Duel UI takes over from here */
    }

    var totalTime = ((performance.now() - overallStart) / 1000).toFixed(1);
    var avgRaw = perQuestionTimes.length
      ? (perQuestionTimes.reduce(function (a, b) { return a + b; }, 0) / perQuestionTimes.length)
      : 0;
    var avg = avgRaw.toFixed(1);
    var accuracy = ((score / count) * 100).toFixed(0);
    var accNum = parseFloat(accuracy);

    /* Speed benchmark computation */
    var speedScore = _computeSpeedScore(accNum, avgRaw);
    var percentile = _computeContinuousPercentile(speedScore);
    var percentileClass = _getPercentileClass(percentile);

    /* Session delta: compare with last stored percentile */
    var lastPct = null;
    try { lastPct = parseInt(localStorage.getItem(_PERCENTILE_KEY)); } catch (_) {}
    var deltaHtml = '';
    if (!isNaN(lastPct) && lastPct > 0) {
      var delta = percentile - lastPct;
      if (delta > 0) deltaHtml = '<span class="percentile-delta delta-up">↑ +' + delta + '% from last session</span>';
      else if (delta < 0) deltaHtml = '<span class="percentile-delta delta-down">↓ ' + delta + '% from last session</span>';
    }
    try { localStorage.setItem(_PERCENTILE_KEY, String(percentile)); } catch (_) {}

    /* New Best detection */
    var bests = _loadBestScores();
    var prevBestAcc = bests.bestAccuracy || 0;
    var prevBestScore = bests.bestSpeedScore || 0;
    var isNewBest = (accNum > prevBestAcc) || (speedScore > prevBestScore);
    if (isNewBest) {
      bests.bestAccuracy = Math.max(prevBestAcc, accNum);
      bests.bestSpeedScore = Math.max(prevBestScore, speedScore);
      _saveBestScores(bests);
    }

    /* Performance badge */
    var badgeText, badgeClass;
    if (accNum >= 90) { badgeText = '🏆 Outstanding Performance'; badgeClass = 'badge-excellent'; }
    else if (accNum >= 75) { badgeText = '💎 Strong Performance'; badgeClass = 'badge-good'; }
    else if (accNum >= 50) { badgeText = '📈 Building Momentum'; badgeClass = 'badge-practice'; }
    else { badgeText = '🌱 Growth in Progress'; badgeClass = 'badge-weak'; }

    /* Rule-based post-session insight (always visible, no AI call) */
    var _insightText = _computeSessionInsight(accNum, sessionWrongCategories);

    /* Activate fullscreen scrollable results mode on the container */
    container.classList.add('drill-results-active');

    /* Resolve user display name for share card */
    var _shareDisplayName = '';
    try {
      if (typeof FirestoreSync !== 'undefined' && FirestoreSync._getCache) {
        var _cache = FirestoreSync._getCache();
        if (_cache && _cache.profile && _cache.profile.name) {
          _shareDisplayName = String(_cache.profile.name).trim();
        }
      }
    } catch (_) {}

    /* Resolve topics for share card */
    var _shareTopics = [];
    if (topics && topics.length) {
      for (var ti = 0; ti < Math.min(topics.length, 6); ti++) {
        var _tLabel = (typeof formatCategoryName === 'function') ? formatCategoryName(topics[ti]) : topics[ti];
        _shareTopics.push(_tLabel);
      }
    } else if (category) {
      var _cLabel = (typeof formatCategoryName === 'function') ? formatCategoryName(category) : category;
      _shareTopics.push(_cLabel);
    }

    /* Resolve difficulty label */
    var _shareDifficulty = 'medium';
    try {
      var _sett = (typeof loadSettings === 'function') ? loadSettings() : {};
      _shareDifficulty = _sett.difficulty || 'medium';
    } catch (_) {}

    /* Build share data object for the new ShareService API */
    var _shareData = {
      accuracy: accuracy,
      avgTime: avg,
      percentile: percentile,
      score: score,
      total: count,
      streak: bestSessionStreak,
      mode: mode,
      difficulty: _shareDifficulty,
      totalTime: totalTime,
      displayName: _shareDisplayName,
      topics: _shareTopics
    };

    container.innerHTML =
      '<div class="card center-content fade-in">' +
        '<h2>Session Complete</h2>' +
        (isNewBest ? '<div class="new-best-badge">🎉 New Personal Best!</div>' : '') +
        '<div class="performance-badge ' + badgeClass + '">' + badgeText + '</div>' +
        '<div class="session-insight-card">' + _escHtml(_insightText) + '</div>' +
        '<div class="results-grid">' +
          '<div class="result-item"><span class="result-value">' + score + '/' + count + '</span><span class="result-label">Score</span></div>' +
          '<div class="result-item"><span class="result-value">' + accuracy + '%</span><span class="result-label">Accuracy</span></div>' +
          '<div class="result-item"><span class="result-value">' + avg + 's</span><span class="result-label">Avg Time</span></div>' +
          '<div class="result-item"><span class="result-value">' + bestSessionStreak + '</span><span class="result-label">Best Streak</span></div>' +
          '<div class="result-item"><span class="result-value">' + totalTime + 's</span><span class="result-label">Total Time</span></div>' +
        '</div>' +
        '<div class="speed-benchmark-card" id="speedBenchmarkCard">' +
          '<div class="benchmark-header">' +
            '<span class="benchmark-icon">⚡</span>' +
            '<span class="benchmark-title">Speed Benchmark</span>' +
          '</div>' +
          '<div class="benchmark-highlight ' + percentileClass + '">' +
            '<span class="benchmark-highlight-pct">Faster than <strong>' + percentile + '%</strong> of users</span>' +
            deltaHtml +
          '</div>' +
          '<div class="benchmark-stats-row">' +
            '<div class="benchmark-stat-block">' +
              '<span class="benchmark-stat-value">' + accuracy + '%</span>' +
              '<span class="benchmark-stat-label">Accuracy</span>' +
            '</div>' +
            '<div class="benchmark-stat-block">' +
              '<span class="benchmark-stat-value">' + avg + 's</span>' +
              '<span class="benchmark-stat-label">Avg Time</span>' +
            '</div>' +
            '<div class="benchmark-stat-block">' +
              '<span class="benchmark-stat-value">' + speedScore + '</span>' +
              '<span class="benchmark-stat-label">Speed Score</span>' +
            '</div>' +
          '</div>' +
          '<div class="benchmark-ai-section" id="benchmarkAiSection">' +
            '<div class="benchmark-ai-placeholder" id="benchmarkAiPlaceholder"></div>' +
          '</div>' +
        '</div>' +
        '<button class="btn-primary results-share-btn" type="button" id="shareResultBtn">🏆 Share Achievement</button>' +
        '<button class="btn-primary" id="tryAgainBtn">Challenge Again</button>' +
        '<button class="btn-secondary" id="homeBtn">Back to Home</button>' +
      '</div>';

    container.querySelector('#tryAgainBtn').addEventListener('click', function () {
      if (onFinish) {
        onFinish('practice');
      } else {
        Router.showView('practice');
      }
    });
    container.querySelector('#homeBtn').addEventListener('click', function () {
      if (onFinish) {
        onFinish('home');
      } else {
        Router.showView('home');
      }
    });
    /* Share button — opens premium share card preview */
    var shareBtn = container.querySelector('#shareResultBtn');
    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        _shareAsImage(_shareData);
      });
    }

    /* Speed Benchmark summary — generated locally, available to all users */
    var benchmarkPlaceholder = container.querySelector('#benchmarkAiPlaceholder');
    if (benchmarkPlaceholder && typeof AIFeatures !== 'undefined' && typeof AIFeatures.fetchSpeedBenchmark === 'function') {
      AIFeatures.fetchSpeedBenchmark(accNum, parseFloat(avg), speedScore, percentile, count, mode, function (err, data) {
        if (err || !data) {
          benchmarkPlaceholder.innerHTML = '';
          return;
        }
        _renderBenchmarkAi(benchmarkPlaceholder, data);
      });
    }

    /* Post-session soft upgrade prompt — shown after 2nd session and every 5th after (free users only) */
    try {
      var _isPremiumUser = (typeof canAccessFeature === 'function') ? canAccessFeature('adaptive_training') : false;
      if (!_isPremiumUser) {
        var _sessCount = parseInt(localStorage.getItem(_SESSIONS_COUNT_KEY)) || 0;
        _sessCount++;
        localStorage.setItem(_SESSIONS_COUNT_KEY, String(_sessCount));
        var _shouldPrompt = (_sessCount === 2) || (_sessCount > 2 && (_sessCount - 2) % 5 === 0);
        if (_shouldPrompt) {
          setTimeout(function () {
            var _resultsCard = container.querySelector('.card');
            if (!_resultsCard) return;
            var _existing = container.querySelector('.session-upgrade-banner');
            if (_existing) return;
            var _banner = document.createElement('div');
            _banner.className = 'session-upgrade-banner';
            _banner.innerHTML =
              '<span class="session-upgrade-text">Ready for the next level? Unlock your full potential.</span>' +
              '<button class="session-upgrade-btn" type="button">Go Premium</button>' +
              '<button class="session-upgrade-dismiss" type="button" aria-label="Dismiss">×</button>';
            _banner.querySelector('.session-upgrade-btn').addEventListener('click', function () {
              if (typeof showPaywall === 'function') showPaywall('upgrade');
            });
            _banner.querySelector('.session-upgrade-dismiss').addEventListener('click', function () {
              if (_banner.parentNode) _banner.parentNode.removeChild(_banner);
            });
            _resultsCard.appendChild(_banner);
          }, 900);
        }
      }
    } catch (_) {}
  }

  function _renderBenchmarkAi(el, data) {
    if (!el || !data) return;
    el.innerHTML =
      '<div class="benchmark-ai-result">' +
        '<span class="benchmark-level">' + _escHtml(data.level || '') + '</span>' +
        '<p class="benchmark-summary">' + _escHtml(data.summary || '') + '</p>' +
        '<p class="benchmark-suggestion"><span class="benchmark-tip-label">Tip:</span> ' + _escHtml(data.suggestion || '') + '</p>' +
      '</div>';
  }

  /* ---- global timer (for timed tests) ---- */

  function startGlobalTimer() {
    if (!timeLimit) return;
    var remaining = timeLimit;
    function tick() {
      var el = ui.globalTimerEl;
      if (el) el.textContent = '⏱ ' + remaining + 's';
      if (remaining <= 0) { clearInterval(overallTimer); overallTimer = null; finish(); return; }
      remaining--;
    }
    tick();
    overallTimer = setInterval(tick, 1000);
  }

  /* ---- per-question timer (for reflex drills) ---- */

  function startPerQTimer() {
    var remaining = perQLimit;
    function tick() {
      var el = ui.perQTimerEl;
      if (el) el.textContent = '⏱ ' + remaining + 's';
      if (remaining <= 0) {
        clearInterval(perQTimer);
        perQTimer = null;
        /* Auto-submit empty answer when time runs out */
        if (!answered && !_isFinished) checkAnswer('');
        return;
      }
      remaining--;
    }
    tick();
    perQTimer = setInterval(tick, 1000);
  }

  /* ---- cleanup timers ---- */
  function cleanup() {
    if (overallTimer) { clearInterval(overallTimer); overallTimer = null; }
    if (perQTimer) { clearInterval(perQTimer); perQTimer = null; }
    _nextReady = true; /* reset guard on cleanup */
    beginStarted = false;
    if (adaptiveMode) _clearAdaptiveOverride();
    /* Clear session pattern so non-adaptive sessions don't inherit stale hints */
    if (typeof AdaptiveState !== 'undefined') {
      AdaptiveState.setPattern(null);
    } else {
      window._sessionAdaptivePattern = null;
    }
  }

  /* ---- begin drill ---- */

  function _generateCustomTopicQuestions(totalCount, topicKeys) {
    var validTopics = [];
    var topicSeen = {};
    for (var i = 0; i < topicKeys.length; i++) {
      var topicKey = topicKeys[i];
      if (categoryGenerators[topicKey] && !topicSeen[topicKey]) {
        validTopics.push(topicKey);
        topicSeen[topicKey] = true;
      }
    }

    if (!validTopics.length) {
      return generateQuestions(totalCount, null);
    }

    var eachCount = Math.floor(totalCount / validTopics.length);
    var remainder = totalCount % validTopics.length;
    var assembled = [];

    for (var v = 0; v < validTopics.length; v++) {
      var perTopic = eachCount + (v < remainder ? 1 : 0);
      if (perTopic <= 0) continue;
      var topicQuestions = generateQuestions(perTopic, validTopics[v]);
      for (var q = 0; q < topicQuestions.length; q++) {
        assembled.push(topicQuestions[q]);
      }
    }

    _shuffleInPlace(assembled);

    return assembled.slice(0, totalCount);
  }

  function _shuffleInPlace(arr) {
    for (var currentIndex = arr.length - 1; currentIndex > 0; currentIndex--) {
      var randomIndex = Math.floor(Math.random() * (currentIndex + 1));
      var tempQuestion = arr[currentIndex];
      arr[currentIndex] = arr[randomIndex];
      arr[randomIndex] = tempQuestion;
    }
  }

  function begin() {
    if (beginStarted) return;
    beginStarted = true;
    _nextReady = true; /* ensure clean guard state at session start */
    /* Reset anti-repetition tracker so new session gets fresh questions */
    if (typeof resetRecentQuestions === 'function') resetRecentQuestions();
    /* Mark session as active and hide nav for immersive experience */
    _enterDrillSession();

    /* Begin Firestore write batching during drill */
    if (typeof FirestoreSync !== 'undefined') {
      FirestoreSync.beginDrillBatch();
    }

    /* Set initial adaptive difficulty based on session settings */
    if (adaptiveMode) {
      try {
        var _s = (typeof AppState !== 'undefined') ? AppState.getSettings() : JSON.parse(localStorage.getItem('quant_reflex_settings') || '{}');
        _setAdaptiveOverride(_s.difficulty || 'medium');
      } catch (_) { _setAdaptiveOverride('medium'); }
    }

    if (preloadedQuestions && preloadedQuestions.length > 0) {
      questions = preloadedQuestions;
      count = questions.length;
    } else if (reviewMode) {
      questions = generateMistakeReviewQuestions(count);
      if (questions.length === 0) {
        _exitDrillSession();
        if (typeof FirestoreSync !== 'undefined') {
          FirestoreSync.endDrillBatch();
        }
        container.innerHTML =
          '<div class="card center-content">' +
            '<h2>All Caught Up!</h2>' +
            '<p class="secondary-text">Impressive — you\'ve mastered all your previous mistakes.</p>' +
            '<button class="btn-primary" id="backToPractice">Continue Training</button>' +
          '</div>';
        container.querySelector('#backToPractice').addEventListener('click', function () {
          Router.showView('practice');
        });
        return;
      }
      count = questions.length;
      reviewOriginalCount = count;
    } else if (topics && topics.length) {
      questions = _generateCustomTopicQuestions(count, topics);
    } else {
      questions = generateQuestions(count, category);
    }
    current = 0;
    score = 0;
    bestSessionStreak = 0;
    currentSessionStreak = 0;
    perQuestionTimes = [];
    sessionWrongCategories = {};
    overallStart = performance.now();
    startGlobalTimer();
    renderQuestion();
  }

  /* ---- public API ---- */
  return { start: renderStart, cleanup: cleanup };
}
