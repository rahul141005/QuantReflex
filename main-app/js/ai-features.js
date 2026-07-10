var AIFeatures = (function () {

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

  function _isPremium() {
    if (typeof hasPremiumAccess === 'function') return hasPremiumAccess();
    if (typeof canAccessFeature === 'function') return canAccessFeature('ai_coach');
    if (typeof FirestoreSync !== 'undefined' && typeof FirestoreSync.getAccessState === 'function') {
      var state = FirestoreSync.getAccessState();
      if (state && state.plan === 'premium') return true;
    }
    return false;
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
    isPremium: _isPremium
  };
})();
