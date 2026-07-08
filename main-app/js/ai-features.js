var AIFeatures = (function () {
  var WP_FREE_LIMIT = 5;
  var WP_PREMIUM_DAILY_LIMIT = 30;

  var _wpInFlight = false;
  var _wpAdaptiveModeActive = false;

  /* i18n (ADR-111): app-language channel; guarded for harness contexts without QRI18n. */
  function _t(key, params) { return (typeof QRI18n !== 'undefined') ? QRI18n.t(key, params) : key; }
  function _tx(key, fallback) { var v = _t(key); return v === key ? fallback : v; }
  function _diffTxt(d) {
    var k = { easy: 'settings.difficultyEasy', medium: 'settings.difficultyMedium', hard: 'settings.difficultyHard' }[String(d || '').toLowerCase()];
    return k ? _t(k) : String(d || '');
  }

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

    /* Fetch from centralized Firestore question bank instead of runtime AI generation.
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
            callback('no_questions');   /* stable code — localized at the display site (ADR-111) */
          }
        });
    } else {
      /* Fallback: QuestionBankService not loaded */
      _wpInFlight = false;
      callback('service_unavailable');   /* stable code — localized at the display site (ADR-111) */
    }
  }

  function renderAICoachCard(containerId, stats) {
    var container = document.getElementById(containerId);
    if (!container) return;

    if (!_isPremium()) {
      container.innerHTML =
        '<div class="ai-coach-body">' +
          '<button class="home-bento-action-btn ai-coach-unlock-btn" type="button" id="coachUnlockBtn">' + _esc(_t('ai.unlockCoach')) + '</button>' +
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
        '<button class="home-bento-action-btn ai-insights-btn" type="button">' + _esc(_t('ai.talkToCoach')) + '</button>' +
      '</div>';

    var insightsBtn = container.querySelector('.ai-insights-btn');
    insightsBtn.addEventListener('click', function () {
      // The brain handles cold-start server-side (deterministic, no LLM) — always open the unified coach.
      if (window.Companion) return Companion.openCoach();
      if (typeof showToast === 'function') showToast(_t('ai.reopenApp'));
    });
  }

  /* INTENTIONAL narrowed subset (ADR-084): the AI word-problem generator only covers these arithmetic categories —
     deliberately NOT the full Quant category set in services/quantTopics.js. Not a stale list. */
  var WP_CATEGORIES = [
    { key: 'percentages', label: 'Percentages' },   /* canonical EN; display via wp.cat_<key> (ADR-111) */
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
      ? _t('wp.quotaFree', { remaining: quota.remaining, limit: quota.limit })
      : _t('wp.quotaDaily', { remaining: quota.remaining, limit: quota.limit });

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
      catHtml += '<button class="category-btn category-card wp-cat-btn" type="button" data-wpcat="' + WP_CATEGORIES[c].key + '">' + _esc(_tx('wp.cat_' + WP_CATEGORIES[c].key, WP_CATEGORIES[c].label)) + '</button>';
    }

    container.innerHTML =
      '<div class="training-card">' +
        '<h3 class="category-select-title">🤖 ' + _esc(_t('practice.wordProblems')) + '</h3>' +
        '<div class="training-card-body">' +
          '<p class="ai-quota-text">' + quotaText + '</p>' +
          '<div class="category-grid">' + catHtml + '</div>' +
          '<div class="wp-config-section">' +
            '<label class="secondary-text" for="wpQuestionSlider">' + _esc(_t('practice.numQuestions')) + '</label>' +
            '<input id="wpQuestionSlider" class="custom-question-range" type="range" min="1" max="' + wpMaxQuestions + '" value="' + wpDefaultCount + '" />' +
            '<div class="custom-practice-meta-row">' +
              '<strong id="wpQuestionCountValue">' + wpDefaultCount + '</strong>' +
              '<span class="secondary-text" id="wpQuestionCountText">' + _esc(_t('practice.youWillSolve', { count: wpDefaultCount })) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="timer-select-section adaptive-toggle-section">' +
            '<div class="timer-toggle-row">' +
              '<span class="timer-toggle-label">' + _esc(_t('practice.adaptiveTraining')) + (wpCanAdaptive ? '' : ' <span class="adaptive-lock">🔒</span>') + '</span>' +
              '<label class="toggle">' +
                '<input type="checkbox" id="wpAdaptiveToggle" />' +
                '<span class="toggle-slider"></span>' +
              '</label>' +
            '</div>' +
          '</div>' +
          '<div id="wpDiffRow" class="timer-select-section">' +
            '<div class="timer-toggle-row">' +
              '<span class="timer-toggle-label secondary-text">' + _esc(_t('drill.difficultyLbl')) + '</span>' +
              '<span class="secondary-text" id="wpDiffLabel">' + _esc(_diffTxt(wpCurrentDiff)) + '</span>' +
            '</div>' +
          '</div>' +
          '<div id="wpAdaptiveActiveChip" class="adaptive-toggle-hint" style="display:none;">' +
            '<p class="adaptive-hint-text">' + _esc(_t('practice.adaptiveDesc')) + '</p>' +
          '</div>' +
          '<div class="timer-select-section wp-timer-section">' +
            '<div class="timer-toggle-row">' +
              '<span class="timer-toggle-label">' + _esc(_t('practice.timer')) + '</span>' +
              '<label class="toggle">' +
                '<input type="checkbox" id="wpTimerToggle" />' +
                '<span class="toggle-slider"></span>' +
              '</label>' +
            '</div>' +
            '<div class="timer-config-area" id="wpTimerConfigArea" style="display:none;">' +
              '<div class="timer-pill-selector">' +
                '<button class="timer-pill active" data-wppill="per" type="button">' + _esc(_t('practice.perQues')) + '</button>' +
                '<button class="timer-pill" data-wppill="total" type="button">' + _esc(_t('practice.total')) + '</button>' +
              '</div>' +
              '<div class="timer-input-row">' +
                '<input type="number" id="wpTimerSecondsInput" class="timer-seconds-input" min="5" max="600" value="15" />' +
                '<span class="timer-unit-label">' + _esc(_t('practice.seconds')) + '</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<button class="btn-primary custom-practice-start-btn" id="startWordProblems" type="button">' + _esc(_t('wp.generate')) + '</button>' +
          '<div id="wpError" class="custom-mode-error secondary-text"></div>' +
        '</div>' +
        '<button class="training-card-back" id="wpBackToModes" type="button" aria-label="' + _esc(_t('practice.backToModesAria')) + '">' + _esc(_t('practice.backArrow')) + '</button>' +
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
        if (countText) countText.textContent = _t('practice.youWillSolve', { count: _wpQuestionCount });
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
      startBtn.textContent = quota.type === 'lifetime' ? _t('wp.freeLimitBtn') : _t('wp.dailyLimitBtn');
      if (quota.type === 'lifetime') {
        errorEl.textContent = _t('wp.upgradeFor30');
        errorEl.style.display = 'block';
      }
    }

    startBtn.addEventListener('click', function () {
      if (startBtn.disabled || _wpInFlight) return;
      
      if (!_wpSelectedCategory) {
        if (errorEl) errorEl.textContent = _t('wp.selectCategory');
        return;
      }
      var diff = _wpAdaptiveModeActive ? _computeWpAdaptiveDifficulty() : ((typeof loadSettings === 'function') ? (loadSettings().difficulty || 'medium') : 'medium');
      var cnt = Math.min(_wpQuestionCount, quota.remaining);
      if (cnt <= 0) {
        if (errorEl) errorEl.textContent = quota.type === 'lifetime' ? _t('wp.noFreeRemaining') : _t('wp.dailyLimitDot');
        return;
      }

      startBtn.disabled = true;
      startBtn.innerHTML = '<div class="ai-spinner-inline"></div> ' + _esc(_t('wp.generating'));
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
          startBtn.textContent = _t('wp.generate');
          if (err === 'free_limit_reached') {
            errorEl.textContent = _t('wp.errFreeUsed');
            if (typeof showPaywall === 'function') showPaywall('ai_explain');
          } else if (err === 'daily_limit_reached') {
            errorEl.textContent = _t('wp.errDailyLimit');
          } else if (err === 'request_in_progress') {
            errorEl.textContent = _t('wp.errInProgress');
          } else if (err === 'rate_limited') {
            errorEl.textContent = _t('wp.errRateLimited');
          } else if (err === 'no_questions') {
            errorEl.textContent = _t('wp.errNoQuestions');
          } else if (err === 'service_unavailable') {
            errorEl.textContent = _t('wp.errServiceUnavailable');
          } else {
            errorEl.textContent = _tx('wp.errGeneric', FRIENDLY_ERROR);
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
        '<button class="home-bento-action-btn sp-unlock-btn" type="button">' + _esc(_t('ai.unlockPremium')) + '</button>';
      container.querySelector('.sp-unlock-btn').addEventListener('click', function () {
        if (typeof showPaywall === 'function') showPaywall('ai_study_plan');
      });
      return;
    }

    container.innerHTML =
      '<button class="home-bento-action-btn sp-open-btn" type="button">' + _esc(_t('ai.openPlanner')) + '</button>';

    container.querySelector('.sp-open-btn').addEventListener('click', function () {
      // QuanAI Planner (ADR-046) via the unified Companion. Prefer the full calendar view if it's loaded.
      if (window.Planner && Planner.open) return Planner.open();
      if (window.Companion && Companion.openStudyPlanner) return Companion.openStudyPlanner();
      if (typeof showToast === 'function') showToast(_t('ai.reopenApp'));
    });
  }

  /* The 4th arg was once a simulated percentile band — the fabricated cohort comparison is gone
     (removed with computePercentile), so the summary is strictly self-referential now. The arg slot
     is kept for call-site compatibility and ignored. */
  function fetchSpeedBenchmark(accuracy, avgTimeSec, speedScore, _unusedBand, questionCount, mode, callback) {
    try {
      var result = _generateLocalBenchmark(accuracy, avgTimeSec, speedScore);
      callback(null, result);
    } catch (e) {
      callback('benchmark_error');
    }
  }

  function _generateLocalBenchmark(accuracy, avgTimeSec, speedScore) {
    var level, summary, suggestion;
    var accNum = parseFloat(accuracy) || 0;
    var timeNum = parseFloat(avgTimeSec) || 0;

    var prm = { acc: accNum.toFixed(0), time: timeNum.toFixed(1) };
    if (speedScore >= 85) {
      level = _t('drill.benchBlazing');
    } else if (speedScore >= 65) {
      level = _t('drill.benchQuick');
    } else if (speedScore >= 40) {
      level = _t('drill.benchSteady');
    } else {
      level = _t('drill.benchNeedsWork');
    }

    if (speedScore >= 85) {
      summary = _t('drill.benchSummaryTop', prm);
    } else if (speedScore >= 65) {
      summary = _t('drill.benchSummaryStrong', prm);
    } else if (speedScore >= 40) {
      summary = _t('drill.benchSummarySolid', prm);
    } else {
      summary = _t('drill.benchSummaryBase', prm);
    }

    if (accNum < 60) {
      suggestion = _t('drill.benchSugAccuracy');
    } else if (timeNum > 12) {
      suggestion = _t('drill.benchSugQuick');
    } else if (speedScore < 65) {
      suggestion = _t('drill.benchSugReflex');
    } else {
      suggestion = _t('drill.benchSugHard');
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
    showExplanationModal: function (q, a, c, reportCtx) { if (window.Companion) return Companion.openExplain(q, a, c, reportCtx); if (typeof showToast === 'function') showToast(_t('ai.reopenApp')); },
    showStatsInsightsModal: function () { if (window.Companion) return Companion.openInsights(); if (typeof showToast === 'function') showToast(_t('ai.reopenApp')); },
    showCoachModal: function () { if (window.Companion) return Companion.openCoach(); if (typeof showToast === 'function') showToast(_t('ai.reopenApp')); },
    openStudyPlanner: function (forceSetup) { if (window.Planner && Planner.open && !forceSetup) return Planner.open(); if (window.Companion && Companion.openStudyPlanner) return Companion.openStudyPlanner(forceSetup); },
    renderAICoachCard: renderAICoachCard,
    renderStudyPlanCard: renderStudyPlanCard,
    renderWordProblemsSetup: renderWordProblemsSetup,
    resetWpAdaptive: resetWpAdaptive,
    isPremium: _isPremium
  };
})();
