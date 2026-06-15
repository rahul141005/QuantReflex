var AIFeatures = (function () {
  var WP_FREE_LIMIT = 5;
  var WP_PREMIUM_DAILY_LIMIT = 30;

  var _wpInFlight = false;
  var _wpAdaptiveModeActive = false;

  function _esc(str) {
    if (typeof str !== 'string') return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function _uid() {
    if (typeof Auth !== 'undefined' && typeof Auth.getCurrentUser === 'function') {
      var u = Auth.getCurrentUser();
      if (u && u.uid) return u.uid;
    }
    return 'anon';
  }

  function _wpKey() { return 'quant_ai_wp_usage_' + _uid(); }

  function _getWpUsage() {
    try {
      var raw = localStorage.getItem(_wpKey());
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { lifetimeUsed: 0, dailyUsed: 0, dailyDate: null };
  }

  function _saveWpUsage(usage) {
    try { localStorage.setItem(_wpKey(), JSON.stringify(usage)); } catch (_) {}
  }

  function _isPremium() {
    if (typeof hasPremiumAccess === 'function') return hasPremiumAccess();
    if (typeof canAccessFeature === 'function') return canAccessFeature('ai_coach');
    if (typeof FirestoreSync !== 'undefined' && typeof FirestoreSync.getAccessState === 'function') {
      var state = FirestoreSync.getAccessState();
      if (state && state.plan === 'premium') return true;
    }
    return false;
  }


  var FRIENDLY_ERROR = 'Unable to generate right now. Try again later.';


  function getWordProblemQuota() {
    var usage = _getWpUsage();
    var today = new Date().toDateString();
    if (_isPremium()) {
      if (usage.dailyDate !== today) {
        usage.dailyUsed = 0;
        usage.dailyDate = today;
        _saveWpUsage(usage);
      }
      return { remaining: WP_PREMIUM_DAILY_LIMIT - usage.dailyUsed, limit: WP_PREMIUM_DAILY_LIMIT, type: 'daily' };
    }
    return { remaining: WP_FREE_LIMIT - usage.lifetimeUsed, limit: WP_FREE_LIMIT, type: 'lifetime' };
  }

  function consumeWordProblemQuota(count) {
    var usage = _getWpUsage();
    var today = new Date().toDateString();
    if (_isPremium()) {
      if (usage.dailyDate !== today) {
        usage.dailyUsed = 0;
        usage.dailyDate = today;
      }
      usage.dailyUsed += count;
    } else {
      usage.lifetimeUsed += count;
    }
    _saveWpUsage(usage);
  }

  function fetchWordProblems(category, difficulty, count, callback) {
    if (_wpInFlight) { callback('request_in_progress'); return; }
    _wpInFlight = true;

    var quota = getWordProblemQuota();
    if (quota.remaining <= 0) {
      _wpInFlight = false;
      if (!_isPremium()) {
        callback('free_limit_reached');
      } else {
        callback('daily_limit_reached');
      }
      return;
    }
    var actualCount = Math.min(count, quota.remaining);

    /* Fetch from centralized Firestore question bank instead of runtime OpenAI.
       The AI generation pipeline now lives in the Super Admin ecosystem —
       questions are pre-generated, curated, and approved before reaching users. */
    if (typeof QuestionBankService !== 'undefined') {
      QuestionBankService.fetchQuestions(
        { topic: category, difficulty: difficulty, count: actualCount },
        function (err, questions) {
          _wpInFlight = false;
          if (err) { callback(err); return; }
          if (questions && questions.length > 0) {
            consumeWordProblemQuota(questions.length);
            callback(null, questions);
          } else {
            callback('No questions available for this topic.');
          }
        });
    } else {
      /* Fallback: QuestionBankService not loaded */
      _wpInFlight = false;
      callback('Question bank service unavailable. Please update the app.');
    }
  }

  function renderAICoachCard(containerId, stats) {
    var container = document.getElementById(containerId);
    if (!container) return;

    if (!_isPremium()) {
      container.innerHTML =
        '<div class="ai-coach-body">' +
          '<button class="home-bento-action-btn ai-coach-unlock-btn" type="button" id="coachUnlockBtn">Unlock AI Coach ✨</button>' +
        '</div>';
      var unlockBtn = container.querySelector('.ai-coach-unlock-btn');
      if (unlockBtn) {
        unlockBtn.addEventListener('click', function () {
          if (typeof showPaywall === 'function') showPaywall('ai_coach');
        });
      }
      return;
    }

    container.innerHTML =
      '<div class="ai-coach-body">' +
        '<button class="home-bento-action-btn ai-insights-btn" type="button">Talk to your coach ✨</button>' +
      '</div>';

    var insightsBtn = container.querySelector('.ai-insights-btn');
    insightsBtn.addEventListener('click', function () {
      // The brain handles cold-start server-side (deterministic, no LLM) — always open the unified coach.
      if (window.Companion) return Companion.openCoach();
      if (typeof showToast === 'function') showToast('Reopen the app to use AI.');
    });
  }

  var WP_CATEGORIES = [
    { key: 'percentages', label: 'Percentages' },
    { key: 'profit-loss', label: 'Profit & Loss' },
    { key: 'ratios', label: 'Ratios' },
    { key: 'time-speed-distance', label: 'Time Speed Dist' },
    { key: 'time-and-work', label: 'Time & Work' },
    { key: 'averages', label: 'Averages' },
    { key: 'fractions', label: 'Fractions' },
    { key: 'area', label: 'Area' },
    { key: 'volume', label: 'Volume' }
  ];
  var WP_MAX_QUESTIONS_PREMIUM = 25;
  var WP_MAX_QUESTIONS_FREE = 5;
  var WP_DEFAULT_QUESTIONS = 5;

  var _wpSelectedCategory = null;
  var _wpQuestionCount = WP_DEFAULT_QUESTIONS;
  var _wpTimerEnabled = false;
  var _wpTimerPillMode = 'per';
  var _wpTimerSeconds = 15;

  function _computeWpAdaptiveDifficulty() {
    try {
      var progress = (typeof loadProgress === 'function') ? loadProgress() : {};
      var attempted = parseInt(progress.totalAttempted, 10) || 0;
      var correct = parseInt(progress.totalCorrect, 10) || 0;
      if (attempted >= 5) {
        var acc = (correct / attempted) * 100;
        if (acc > 80) return 'hard';
        if (acc >= 50) return 'medium';
        return 'easy';
      }
    } catch (_) {}
    try {
      var s = (typeof loadSettings === 'function') ? loadSettings() : {};
      return s.difficulty || 'medium';
    } catch (_) { return 'medium'; }
  }

  function renderWordProblemsSetup(container, onStart) {
    var quota = getWordProblemQuota();
    var quotaText = quota.type === 'lifetime'
      ? quota.remaining + '/' + quota.limit + ' free AI questions remaining'
      : quota.remaining + '/' + quota.limit + ' daily AI questions remaining';

    var wpMaxQuestions = _isPremium() ? WP_MAX_QUESTIONS_PREMIUM : WP_MAX_QUESTIONS_FREE;
    var wpDefaultCount = Math.min(WP_DEFAULT_QUESTIONS, wpMaxQuestions);

    _wpSelectedCategory = null;
    _wpQuestionCount = wpDefaultCount;
    _wpTimerEnabled = false;
    _wpTimerPillMode = 'per';
    _wpTimerSeconds = 15;
    _wpAdaptiveModeActive = false;

    var wpCanAdaptive = (typeof canAccessFeature === 'function') ? canAccessFeature('adaptive_training') : false;
    var wpCurrentDiff = (typeof loadSettings === 'function') ? (loadSettings().difficulty || 'medium') : 'medium';

    var catHtml = '';
    for (var c = 0; c < WP_CATEGORIES.length; c++) {
      catHtml += '<button class="category-btn category-card wp-cat-btn" type="button" data-wpcat="' + WP_CATEGORIES[c].key + '">' + WP_CATEGORIES[c].label + '</button>';
    }

    container.innerHTML =
      '<div class="training-card">' +
        '<h3 class="category-select-title">🤖 Word Problems</h3>' +
        '<div class="training-card-body">' +
          '<p class="ai-quota-text">' + quotaText + '</p>' +
          '<div class="category-grid">' + catHtml + '</div>' +
          '<div class="wp-config-section">' +
            '<label class="secondary-text" for="wpQuestionSlider">Number of Questions</label>' +
            '<input id="wpQuestionSlider" class="custom-question-range" type="range" min="1" max="' + wpMaxQuestions + '" value="' + wpDefaultCount + '" />' +
            '<div class="custom-practice-meta-row">' +
              '<strong id="wpQuestionCountValue">' + wpDefaultCount + '</strong>' +
              '<span class="secondary-text" id="wpQuestionCountText">You will solve ' + wpDefaultCount + ' questions</span>' +
            '</div>' +
          '</div>' +
          '<div class="timer-select-section adaptive-toggle-section">' +
            '<div class="timer-toggle-row">' +
              '<span class="timer-toggle-label">Adaptive Training ✨' + (wpCanAdaptive ? '' : ' <span class="adaptive-lock">🔒</span>') + '</span>' +
              '<label class="toggle">' +
                '<input type="checkbox" id="wpAdaptiveToggle" />' +
                '<span class="toggle-slider"></span>' +
              '</label>' +
            '</div>' +
          '</div>' +
          '<div id="wpDiffRow" class="timer-select-section">' +
            '<div class="timer-toggle-row">' +
              '<span class="timer-toggle-label secondary-text">Difficulty</span>' +
              '<span class="secondary-text" id="wpDiffLabel">' + _esc(wpCurrentDiff) + '</span>' +
            '</div>' +
          '</div>' +
          '<div id="wpAdaptiveActiveChip" class="adaptive-toggle-hint" style="display:none;">' +
            '<p class="adaptive-hint-text">Difficulty is auto-managed based on your performance.</p>' +
          '</div>' +
          '<div class="timer-select-section wp-timer-section">' +
            '<div class="timer-toggle-row">' +
              '<span class="timer-toggle-label">Timer</span>' +
              '<label class="toggle">' +
                '<input type="checkbox" id="wpTimerToggle" />' +
                '<span class="toggle-slider"></span>' +
              '</label>' +
            '</div>' +
            '<div class="timer-config-area" id="wpTimerConfigArea" style="display:none;">' +
              '<div class="timer-pill-selector">' +
                '<button class="timer-pill active" data-wppill="per" type="button">Per Ques.</button>' +
                '<button class="timer-pill" data-wppill="total" type="button">Total</button>' +
              '</div>' +
              '<div class="timer-input-row">' +
                '<input type="number" id="wpTimerSecondsInput" class="timer-seconds-input" min="5" max="600" value="15" />' +
                '<span class="timer-unit-label">seconds</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<button class="btn-primary custom-practice-start-btn" id="startWordProblems" type="button">Generate Word Problems</button>' +
          '<div id="wpError" class="custom-mode-error secondary-text"></div>' +
        '</div>' +
        '<button class="training-card-back" id="wpBackToModes" type="button" aria-label="Back to practice modes">← Back</button>' +
      '</div>';

    var startBtn = container.querySelector('#startWordProblems');
    var backBtn = container.querySelector('#wpBackToModes');
    var errorEl = container.querySelector('#wpError');
    var slider = container.querySelector('#wpQuestionSlider');
    var countValue = container.querySelector('#wpQuestionCountValue');
    var countText = container.querySelector('#wpQuestionCountText');
    var wpTimerToggle = container.querySelector('#wpTimerToggle');
    var wpTimerConfigArea = container.querySelector('#wpTimerConfigArea');
    var wpTimerPillContainer = container.querySelector('.wp-timer-section .timer-pill-selector');
    var wpTimerSecondsInput = container.querySelector('#wpTimerSecondsInput');
    var wpAdaptiveToggle = container.querySelector('#wpAdaptiveToggle');
    var wpAdaptiveChip = container.querySelector('#wpAdaptiveActiveChip');
    var wpDiffRow = container.querySelector('#wpDiffRow');

    var catBtns = container.querySelectorAll('.wp-cat-btn');
    for (var cb = 0; cb < catBtns.length; cb++) {
      catBtns[cb].addEventListener('click', function () {
        var key = this.getAttribute('data-wpcat');
        if (_wpSelectedCategory === key) {
          _wpSelectedCategory = null;
          this.classList.remove('selected');
        } else {
          for (var j = 0; j < catBtns.length; j++) catBtns[j].classList.remove('selected');
          _wpSelectedCategory = key;
          this.classList.add('selected');
        }
        if (errorEl) errorEl.textContent = '';
      });
    }

    if (slider) {
      slider.addEventListener('input', function () {
        var val = parseInt(slider.value, 10);
        if (isNaN(val)) val = wpDefaultCount;
        _wpQuestionCount = Math.max(1, Math.min(wpMaxQuestions, val));
        if (countValue) countValue.textContent = String(_wpQuestionCount);
        if (countText) countText.textContent = 'You will solve ' + _wpQuestionCount + ' questions';
      });
    }

    if (wpAdaptiveToggle) {
      wpAdaptiveToggle.addEventListener('change', function () {
        if (this.checked) {
          if (!wpCanAdaptive) {
            this.checked = false;
            if (typeof showPaywall === 'function') showPaywall('adaptive_training');
            return;
          }
          _wpAdaptiveModeActive = true;
          if (wpDiffRow) wpDiffRow.style.display = 'none';
          if (wpAdaptiveChip) wpAdaptiveChip.style.display = 'block';
        } else {
          _wpAdaptiveModeActive = false;
          if (wpDiffRow) wpDiffRow.style.display = '';
          if (wpAdaptiveChip) wpAdaptiveChip.style.display = 'none';
        }
      });
    }

    if (wpTimerToggle) {
      wpTimerToggle.addEventListener('change', function () {
        _wpTimerEnabled = this.checked;
        if (wpTimerConfigArea) wpTimerConfigArea.style.display = this.checked ? 'block' : 'none';
      });
    }

    if (wpTimerPillContainer) {
      wpTimerPillContainer.addEventListener('click', function (e) {
        var pill = e.target.closest('.timer-pill');
        if (!pill) return;
        var pills = wpTimerPillContainer.querySelectorAll('.timer-pill');
        for (var i = 0; i < pills.length; i++) pills[i].classList.remove('active');
        pill.classList.add('active');
        _wpTimerPillMode = pill.getAttribute('data-wppill');
      });
    }

    if (wpTimerSecondsInput) {
      wpTimerSecondsInput.addEventListener('input', function () {
        var val = parseInt(this.value, 10);
        if (!isNaN(val)) _wpTimerSeconds = Math.max(5, Math.min(600, val));
      });
    }

    if (quota.remaining <= 0) {
      startBtn.disabled = true;
      startBtn.textContent = quota.type === 'lifetime' ? '🔒 Free limit reached' : 'Daily limit reached';
      if (quota.type === 'lifetime') {
        errorEl.textContent = 'Upgrade to Premium for 30 AI questions per day.';
        errorEl.style.display = 'block';
      }
    }

    startBtn.addEventListener('click', function () {
      if (startBtn.disabled || _wpInFlight) return;
      
      if (!_wpSelectedCategory) {
        if (errorEl) errorEl.textContent = 'Please select a category';
        return;
      }
      var diff = _wpAdaptiveModeActive ? _computeWpAdaptiveDifficulty() : ((typeof loadSettings === 'function') ? (loadSettings().difficulty || 'medium') : 'medium');
      var cnt = Math.min(_wpQuestionCount, quota.remaining);
      if (cnt <= 0) {
        if (errorEl) errorEl.textContent = quota.type === 'lifetime' ? 'No free questions remaining.' : 'Daily limit reached.';
        return;
      }

      startBtn.disabled = true;
      startBtn.innerHTML = '<div class="ai-spinner-inline"></div> Generating...';
      errorEl.textContent = '';

      var wpTimerCfg = { timeLimitSec: null, perQuestionSec: null };
      if (_wpTimerEnabled && _wpTimerSeconds >= 5) {
        if (_wpTimerPillMode === 'per') {
          wpTimerCfg.perQuestionSec = _wpTimerSeconds;
        } else {
          wpTimerCfg.timeLimitSec = _wpTimerSeconds;
        }
      }

      fetchWordProblems(_wpSelectedCategory, diff, cnt, function (err, questions) {
        if (err) {
          startBtn.disabled = false;
          startBtn.textContent = 'Generate Word Problems';
          if (err === 'free_limit_reached') {
            errorEl.textContent = 'You\'ve used all 5 free AI questions. Upgrade to Premium for more.';
            if (typeof showPaywall === 'function') showPaywall('ai_explain');
          } else if (err === 'daily_limit_reached') {
            errorEl.textContent = 'You\'ve reached today\'s limit of 30 AI questions. Come back tomorrow!';
          } else if (err === 'request_in_progress') {
            errorEl.textContent = 'A request is already in progress. Please wait.';
          } else if (err === 'rate_limited') {
            errorEl.textContent = 'Too many requests. Please wait a moment and try again.';
          } else {
            errorEl.textContent = FRIENDLY_ERROR;
          }
          return;
        }
        if (onStart) onStart(questions, _wpSelectedCategory, diff, wpTimerCfg);
      });
    });

    if (backBtn) {
      backBtn.addEventListener('click', function () {
        if (typeof _resetPracticeUiToModes === 'function') {
          _resetPracticeUiToModes();
        }
      });
    }
  }

  function renderStudyPlanCard(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;

    if (!_isPremium()) {
      container.innerHTML =
        '<button class="home-bento-action-btn sp-unlock-btn" type="button">🔒 Unlock with Premium</button>';
      container.querySelector('.sp-unlock-btn').addEventListener('click', function () {
        if (typeof showPaywall === 'function') showPaywall('ai_study_plan');
      });
      return;
    }

    container.innerHTML =
      '<button class="home-bento-action-btn sp-open-btn" type="button">Open your Study Planner ✨</button>';

    container.querySelector('.sp-open-btn').addEventListener('click', function () {
      // QuanAI Planner (ADR-046) via the unified Companion. Prefer the full calendar view if it's loaded.
      if (window.Planner && Planner.open) return Planner.open();
      if (window.Companion && Companion.openStudyPlanner) return Companion.openStudyPlanner();
      if (typeof showToast === 'function') showToast('Reopen the app to use AI.');
    });
  }

  function fetchSpeedBenchmark(accuracy, avgTimeSec, speedScore, percentileBand, questionCount, mode, callback) {
    try {
      var result = _generateLocalBenchmark(accuracy, avgTimeSec, speedScore, percentileBand);
      callback(null, result);
    } catch (e) {
      callback('benchmark_error');
    }
  }

  function _generateLocalBenchmark(accuracy, avgTimeSec, speedScore, percentileBand) {
    var level, summary, suggestion;
    var accNum = parseFloat(accuracy) || 0;
    var timeNum = parseFloat(avgTimeSec) || 0;
    var band = typeof percentileBand === 'string' ? percentileBand : '';

    if (speedScore >= 85) {
      level = 'Blazing Fast';
    } else if (speedScore >= 65) {
      level = 'Quick Thinker';
    } else if (speedScore >= 40) {
      level = 'Steady Pacer';
    } else {
      level = 'Needs Speed Work';
    }

    var bandPhrase = band ? ' (' + band + ')' : '';

    if (speedScore >= 85) {
      summary = 'Outstanding session! You nailed ' + accNum.toFixed(0) + '% accuracy at ' + timeNum.toFixed(1) + 's per question' + bandPhrase + ' — that\'s top-tier reflex performance.';
    } else if (speedScore >= 65) {
      summary = 'Strong work — ' + accNum.toFixed(0) + '% accuracy with an average of ' + timeNum.toFixed(1) + 's per question' + bandPhrase + '. Your speed and precision are well balanced.';
    } else if (speedScore >= 40) {
      summary = 'Solid effort with ' + accNum.toFixed(0) + '% accuracy at ' + timeNum.toFixed(1) + 's per question' + bandPhrase + '. Keep pushing the pace to climb the rankings.';
    } else {
      summary = 'You answered at ' + accNum.toFixed(0) + '% accuracy and ' + timeNum.toFixed(1) + 's per question' + bandPhrase + '. Focus on core formulas first, then chip away at your response time.';
    }

    if (accNum < 60) {
      suggestion = 'Accuracy first — slow down slightly and double-check each step before answering. Speed will follow naturally once the fundamentals are solid.';
    } else if (timeNum > 12) {
      suggestion = 'Try the Quick Drill mode daily to build faster recall. Aim to shave 1–2 seconds off your average time each session.';
    } else if (speedScore < 65) {
      suggestion = 'Run a focused 10-question Reflex Drill on your weakest category to push both accuracy and speed simultaneously.';
    } else {
      suggestion = 'Challenge yourself with Hard mode questions or timed tests to sharpen your edge even further.';
    }

    return { level: level, summary: summary, suggestion: suggestion };
  }

  function resetWpAdaptive() {
    _wpAdaptiveModeActive = false;
  }

  /* AI brain (ADR-039): the LLM features now route through the unified Companion system (one brain, one design
     language, interactive). The old one-shot modal bodies remain as a defensive fallback if Companion is absent. */
  return {
    fetchSpeedBenchmark: fetchSpeedBenchmark,
    showExplanationModal: function (q, a, c) { if (window.Companion) return Companion.openExplain(q, a, c); if (typeof showToast === 'function') showToast('Reopen the app to use AI.'); },
    showStatsInsightsModal: function () { if (window.Companion) return Companion.openInsights(); if (typeof showToast === 'function') showToast('Reopen the app to use AI.'); },
    showCoachModal: function () { if (window.Companion) return Companion.openCoach(); if (typeof showToast === 'function') showToast('Reopen the app to use AI.'); },
    openStudyPlanner: function (forceSetup) { if (window.Planner && Planner.open && !forceSetup) return Planner.open(); if (window.Companion && Companion.openStudyPlanner) return Companion.openStudyPlanner(forceSetup); },
    renderAICoachCard: renderAICoachCard,
    renderStudyPlanCard: renderStudyPlanCard,
    renderWordProblemsSetup: renderWordProblemsSetup,
    resetWpAdaptive: resetWpAdaptive,
    isPremium: _isPremium
  };
})();
