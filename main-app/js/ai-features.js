var AIFeatures = (function () {
  var WP_FREE_LIMIT = 5;
  var WP_PREMIUM_DAILY_LIMIT = 25;
  var COACH_CACHE_HOURS = 24;

  var _wpInFlight = false;
  var _wpAdaptiveModeActive = false;
  var _explainInFlight = false;
  var _coachInFlight = false;
  var _insightsInFlight = false;

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
  function _coachKey() { return 'quant_ai_coach_cache_' + _uid(); }
  function _insightsKey() { return 'quant_ai_insights_cache_' + _uid(); }

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

  function _getIdToken(callback) {
    if (typeof Auth !== 'undefined' && typeof Auth.getCurrentUser === 'function') {
      var u = Auth.getCurrentUser();
      if (u && typeof u.getIdToken === 'function') {
        u.getIdToken().then(function (token) {
          callback(token);
        }).catch(function () {
          callback(null);
        });
        return;
      }
    }
    callback(null);
  }

  var FRIENDLY_ERROR = 'Unable to generate right now. Try again later.';

  function _sendAuthenticatedRequest(method, url, body, timeout, callback) {
    _getIdToken(function (token) {
      if (!token) {
        callback(FRIENDLY_ERROR);
        return;
      }
      var xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.timeout = timeout;
      xhr.onload = function () {
        if (xhr.status === 200) {
          try {
            callback(null, JSON.parse(xhr.responseText));
          } catch (e) {
            callback(FRIENDLY_ERROR);
          }
        } else if (xhr.status === 403) {
          try {
            var errData = JSON.parse(xhr.responseText);
            var code = errData.error && errData.error.code;
            callback(code === 'PREMIUM_REQUIRED' ? 'premium_required' : FRIENDLY_ERROR);
          } catch (_) {
            callback(FRIENDLY_ERROR);
          }
        } else if (xhr.status === 429) {
          callback('rate_limited');
        } else {
          callback(FRIENDLY_ERROR);
        }
      };
      xhr.onerror = function () { callback(FRIENDLY_ERROR); };
      xhr.ontimeout = function () { callback(FRIENDLY_ERROR); };
      xhr.send(JSON.stringify(body));
    });
  }

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

  function fetchExplanation(question, answer, category, callback) {
    if (_explainInFlight) { callback('request_in_progress'); return; }
    _explainInFlight = true;

    _sendAuthenticatedRequest('POST', '/api/ai/explain',
      { question: question, answer: answer, category: category }, 20000,
      function (err, data) {
        _explainInFlight = false;
        if (err) { callback(err); return; }
        callback(null, data.explanation);
      });
  }

  function fetchCoachV2(stats, callback) {
    if (_coachInFlight) { callback('request_in_progress'); return; }
    var cached = _getCachedCoach();
    if (cached) { callback(null, cached); return; }

    _coachInFlight = true;
    _sendAuthenticatedRequest('POST', '/api/ai/insights',
      { stats: stats, type: 'coach' }, 20000,
      function (err, data) {
        _coachInFlight = false;
        if (err) { callback(err); return; }
        _cacheCoach(data.insights);
        callback(null, data.insights);
      });
  }

  function fetchInsightsV2(stats, callback) {
    if (_insightsInFlight) { callback('request_in_progress'); return; }
    var cached = _getCachedInsights();
    if (cached) { callback(null, cached); return; }

    _insightsInFlight = true;
    _sendAuthenticatedRequest('POST', '/api/ai/insights',
      { stats: stats, type: 'insights' }, 20000,
      function (err, data) {
        _insightsInFlight = false;
        if (err) { callback(err); return; }
        _cacheInsights(data.insights);
        callback(null, data.insights);
      });
  }

  function _getCachedCoach() {
    try {
      var raw = localStorage.getItem(_coachKey());
      if (!raw) return null;
      var cached = JSON.parse(raw);
      if (Date.now() - (cached.timestamp || 0) < COACH_CACHE_HOURS * 60 * 60 * 1000) return cached.data;
    } catch (_) {}
    return null;
  }

  function _cacheCoach(data) {
    try { localStorage.setItem(_coachKey(), JSON.stringify({ data: data, timestamp: Date.now() })); } catch (_) {}
  }

  function _getCachedInsights() {
    try {
      var raw = localStorage.getItem(_insightsKey());
      if (!raw) return null;
      var cached = JSON.parse(raw);
      if (Date.now() - (cached.timestamp || 0) < COACH_CACHE_HOURS * 60 * 60 * 1000) return cached.data;
    } catch (_) {}
    return null;
  }

  function _cacheInsights(data) {
    try { localStorage.setItem(_insightsKey(), JSON.stringify({ data: data, timestamp: Date.now() })); } catch (_) {}
  }

  function showExplanationModal(question, answer, category) {
    if (_explainInFlight) return;

    var existing = document.getElementById('aiExplainModal');
    if (existing) existing.parentNode.removeChild(existing);

    var overlay = document.createElement('div');
    overlay.id = 'aiExplainModal';
    overlay.className = 'modal-overlay ai-explain-overlay';
    overlay.style.display = 'flex';
    overlay.innerHTML =
      '<div class="modal-content ai-explain-modal">' +
        '<h3 class="modal-title">🧠 AI Explanation</h3>' +
        '<div class="ai-explain-body">' +
          '<div class="ai-loading"><div class="ai-spinner"></div><p>Generating explanation...</p></div>' +
        '</div>' +
        '<div class="modal-actions">' +
          '<button class="btn-secondary modal-cancel ai-explain-close">Close</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    function closeModal() {
      overlay.style.display = 'none';
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    overlay.querySelector('.ai-explain-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    fetchExplanation(question, answer, category, function (err, explanation) {
      var body = overlay.querySelector('.ai-explain-body');
      if (!body) return;

      if (err) {
        body.innerHTML = '<p class="ai-error">' + (err === 'rate_limited' ? 'Too many requests. Please wait a moment and try again.' : FRIENDLY_ERROR) + '</p>';
        return;
      }

      var stepsHtml = '';
      if (explanation.steps && explanation.steps.length > 0) {
        for (var i = 0; i < explanation.steps.length; i++) {
          stepsHtml += '<li>' + _esc(explanation.steps[i]) + '</li>';
        }
      }

      body.innerHTML =
        '<div class="ai-explain-section">' +
          '<h4>📌 Concept</h4>' +
          '<p>' + _esc(explanation.concept) + '</p>' +
        '</div>' +
        '<div class="ai-explain-section">' +
          '<h4>📝 Step-by-Step Solution</h4>' +
          '<ol class="ai-steps-list">' + stepsHtml + '</ol>' +
        '</div>' +
        (explanation.mistake ? '<div class="ai-explain-section"><h4>⚠️ Common Mistake</h4><p>' + _esc(explanation.mistake) + '</p></div>' : '') +
        (explanation.tip ? '<div class="ai-explain-section ai-tip-section"><h4>💡 Quick Tip</h4><p>' + _esc(explanation.tip) + '</p></div>' : '');
    });
  }

  function showCoachModal(stats) {
    var existing = document.getElementById('aiCoachModal');
    if (existing) existing.parentNode.removeChild(existing);

    var overlay = document.createElement('div');
    overlay.id = 'aiCoachModal';
    overlay.className = 'modal-overlay ai-explain-overlay';
    overlay.style.display = 'flex';
    overlay.innerHTML =
      '<div class="modal-content ai-explain-modal" style="background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);">' +
        '<h3 class="modal-title" style="color:#fff; border-bottom: 1px solid #334155; padding-bottom: 1rem;">🎯 Personal Coach</h3>' +
        '<div class="ai-explain-body">' +
          '<div class="ai-loading"><div class="ai-spinner"></div><p style="color:#94a3b8;">Preparing your plan...</p></div>' +
        '</div>' +
        '<div class="modal-actions">' +
          '<button class="btn-secondary modal-cancel ai-explain-close" style="background:#334155; color:#fff; border:none;">Close</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    function closeModal() {
      overlay.style.display = 'none';
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    overlay.querySelector('.ai-explain-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    var bodyEl = overlay.querySelector('.ai-explain-body');
    fetchCoachV2(stats, function (err, coachData) {
      if (err) {
        bodyEl.innerHTML = '<p class="ai-error" style="color:#f87171;">' + (err === 'rate_limited' ? 'Too many requests. Please wait a moment.' : 'Unable to generate right now.') + '</p>';
        return;
      }

      bodyEl.innerHTML =
        '<div class="ai-explain-section" style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); padding: 1rem; border-radius: 8px;">' +
          '<h4 style="color:#60a5fa; margin-top:0;">⚡ Today</h4>' +
          '<p style="color:#f8fafc; font-size: 1.05rem; font-weight: 500;">' + _esc(coachData.today) + '</p>' +
        '</div>' +
        '<div class="ai-explain-section" style="margin-top: 1rem; background: rgba(52, 211, 153, 0.1); border: 1px solid rgba(52, 211, 153, 0.2); padding: 1rem; border-radius: 8px;">' +
          '<h4 style="color:#34d399; margin-top:0;">📅 Tomorrow</h4>' +
          '<p style="color:#f8fafc; font-weight: 500;">' + _esc(coachData.tomorrow) + '</p>' +
        '</div>' +
        '<div class="ai-explain-section" style="margin-top: 1rem;">' +
          '<h4 style="color:#a78bfa;">📆 This Week</h4>' +
          '<p style="color:#cbd5e1;">' + _esc(coachData.thisWeek) + '</p>' +
        '</div>' +
        '<div class="ai-explain-section ai-tip-section" style="margin-top: 1rem; background: rgba(245, 158, 11, 0.1); border-color: rgba(245, 158, 11, 0.2);">' +
          '<h4 style="color:#fbbf24;">💡 Recommendations</h4>' +
          '<p style="color:#fef3c7;">' + _esc(coachData.recommendations) + '</p>' +
        '</div>';
    });
  }

  function showStatsInsightsModal(stats) {
    var existing = document.getElementById('aiInsightsModal');
    if (existing) existing.parentNode.removeChild(existing);

    var overlay = document.createElement('div');
    overlay.id = 'aiInsightsModal';
    overlay.className = 'modal-overlay ai-explain-overlay';
    overlay.style.display = 'flex';
    overlay.innerHTML =
      '<div class="modal-content ai-explain-modal">' +
        '<h3 class="modal-title">🔍 Pattern Analysis</h3>' +
        '<div class="ai-explain-body">' +
          '<div class="ai-loading"><div class="ai-spinner"></div><p>Searching for hidden patterns...</p></div>' +
        '</div>' +
        '<div class="modal-actions">' +
          '<button class="btn-secondary modal-cancel ai-explain-close">Close</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    function closeModal() {
      overlay.style.display = 'none';
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    overlay.querySelector('.ai-explain-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    var bodyEl = overlay.querySelector('.ai-explain-body');
    fetchInsightsV2(stats, function (err, insightsData) {
      if (err) {
        bodyEl.innerHTML = '<p class="ai-error">' + (err === 'rate_limited' ? 'Too many requests. Please wait a moment.' : 'Unable to generate right now.') + '</p>';
        return;
      }

      var obsHtml = '';

      var renderField = function (icon, title, value) {
        return '<div class="ai-insight-block" style="margin-bottom: 1rem; border-left: 3px solid var(--accent-primary); padding-left: 1rem;">' +
                 '<h4 style="margin: 0 0 0.25rem 0; font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem;">' + 
                   '<span>' + icon + '</span> ' + _esc(title) + 
                 '</h4>' +
                 '<p style="margin: 0; font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.25rem;">' + _esc(value || 'Insufficient data') + '</p>' +
               '</div>';
      };

      obsHtml += renderField('🧠', 'Learning Pattern', insightsData.learningPattern);
      obsHtml += renderField('📈', 'Accuracy Trend', insightsData.accuracyTrend);
      obsHtml += renderField('⏱️', 'Speed Trend', insightsData.speedTrend);
      obsHtml += renderField('🎯', 'Consistency Score', insightsData.consistencyScore);
      obsHtml += renderField('💪', 'Strongest Category', insightsData.strongestCategory);
      obsHtml += renderField('⚠️', 'Weakest Category', insightsData.weakestCategory);
      obsHtml += renderField('🚀', 'Improvement Potential', insightsData.improvementPotential);
      
      obsHtml += '<div class="ai-explain-section ai-tip-section" style="margin-top: 1.5rem; background: rgba(59, 130, 246, 0.1); border-color: rgba(59, 130, 246, 0.2);">' +
                   '<h4 style="color:#60a5fa;">📋 AI Summary</h4>' +
                   '<p style="color:#f8fafc;">' + _esc(insightsData.aiSummary || 'Keep practicing to unlock detailed summaries.') + '</p>' +
                 '</div>';

      bodyEl.innerHTML = obsHtml;
    });
  }

  function showInsufficientDataModal(title, typeName, futureInsights) {
    var existing = document.getElementById('aiInsufficientModal');
    if (existing) existing.parentNode.removeChild(existing);

    var overlay = document.createElement('div');
    overlay.id = 'aiInsufficientModal';
    overlay.className = 'modal-overlay ai-explain-overlay';
    overlay.style.display = 'flex';
    
    var listHtml = '';
    if (futureInsights && futureInsights.length > 0) {
      listHtml = '<ul style="text-align:left; color:#94a3b8; font-size:1rem; padding-left:1.5rem; margin-top:1rem; line-height:1.6;">';
      for (var i = 0; i < futureInsights.length; i++) {
        listHtml += '<li>' + _esc(futureInsights[i]) + '</li>';
      }
      listHtml += '</ul>';
    }

    overlay.innerHTML =
      '<div class="modal-content ai-explain-modal" style="background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%); max-width: 400px; text-align: center;">' +
        '<h3 class="modal-title" style="color:#fff; border-bottom: 1px solid #334155; padding-bottom: 1rem; margin-bottom: 1.5rem;">' + _esc(title) + '</h3>' +
        '<div class="ai-explain-body">' +
          '<div style="font-size:3rem; margin-bottom:1rem;">🤖</div>' +
          '<p style="color:#f8fafc; font-size: 1.1rem; font-weight: 500; margin-bottom: 0.5rem;">Not enough ' + (typeName === 'coaching' ? 'practice' : 'performance') + ' data yet.</p>' +
          '<p style="color:#94a3b8;">Complete at least 5 questions to unlock ' + (typeName === 'coaching' ? 'personalized coaching' : 'advanced insights') + '.</p>' +
          (listHtml ? ('<p style="color:#f8fafc; font-weight: 500; margin-top:1.5rem; text-align:left;">What you\'ll unlock:</p>' + listHtml) : '') +
        '</div>' +
        '<div class="modal-actions" style="margin-top:2rem; flex-direction:column; gap:0.5rem;">' +
          '<button class="btn-primary" id="aiInsufficientStartBtn" style="width:100%;">Start Practicing</button>' +
          '<button class="btn-secondary modal-cancel ai-explain-close" style="width:100%; background:transparent; border:1px solid #334155;">Close</button>' +
        '</div>' +
      '</div>';
      
    document.body.appendChild(overlay);

    function closeModal() {
      overlay.style.display = 'none';
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    
    overlay.querySelector('.ai-explain-close').addEventListener('click', closeModal);
    overlay.querySelector('#aiInsufficientStartBtn').addEventListener('click', function() {
      closeModal();
      if (typeof Router !== 'undefined') {
        var _navLinks = document.querySelectorAll('.bottom-nav a');
        var practiceLink = Array.from(_navLinks).find(l => l.getAttribute('data-view') === 'practice');
        if (practiceLink) practiceLink.click();
        else Router.showView('practice');
      }
    });
    
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });
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
        '<button class="home-bento-action-btn ai-insights-btn" type="button">Get Coach Advice ✨</button>' +
      '</div>';

    var insightsBtn = container.querySelector('.ai-insights-btn');
    insightsBtn.addEventListener('click', function () {
      if (!stats || !stats.totalAttempted || stats.totalAttempted < 5) {
        showInsufficientDataModal('AI Coach', 'coaching', [
          'Weak area detection',
          'Accuracy coaching',
          'Study recommendations',
          'Practice strategy'
        ]);
        return;
      }
      showCoachModal(stats);
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
        errorEl.textContent = 'Upgrade to Premium for 25 AI questions per day.';
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
            errorEl.textContent = 'You\'ve reached today\'s limit of 25 AI questions. Come back tomorrow!';
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

  var _studyPlanInFlight = false;
  var SP_EXAMS = ['CAT', 'GMAT', 'Bank PO', 'SSC', 'UPSC', 'NTSE', 'XAT', 'Other'];
  var _spWizardData = {
    examName: '',
    examDate: '',
    dailyTimeMinutes: 60,
    currentLevel: '',
    weakTopics: [],
    strongTopics: [],
    targetScore: ''
  };
  var _spWizardStep = 1;

    function _buildResultHTML(plan) {
    var totalCount = plan.timetable ? plan.timetable.length : 0;
    var completedCount = 0;
    if (plan.timetable) {
      for(var i=0; i<plan.timetable.length; i++) {
        if(plan.progress && plan.progress[plan.timetable[i].day]) completedCount++;
      }
    }

    var examMs = new Date(plan.examDate).getTime();
    var daysRemaining = Math.max(1, Math.ceil((examMs - Date.now()) / (1000 * 60 * 60 * 24)));
    var daysLabel = daysRemaining === 1 ? '1 day' : daysRemaining + ' days';
    
    var html = '<div class="sp-result-container">';
    
    // Top Section
    html += '<div class="sp-top-section">' +
       '<div class="sp-progress-ring-lg" style="--sp-pct: ' + (totalCount > 0 ? Math.round((completedCount/totalCount)*100) : 0) + '%;">' +
         '<div class="sp-progress-ring-inner">' +
           '<span class="sp-ring-val">' + completedCount + ' / ' + totalCount + '</span>' +
           '<span class="sp-ring-lbl">Days Done</span>' +
         '</div>' +
       '</div>' +
       '<div class="sp-top-meta">' +
         '<span class="sp-top-badge bg-brand">' + _esc(plan.examName) + '</span>' +
         '<span class="sp-top-badge bg-dark">' + daysLabel + ' left</span>' +
         (plan.targetScore ? '<span class="sp-top-badge bg-outline">Target ' + _esc(plan.targetScore) + '</span>' : '') +
       '</div>' +
    '</div>';

    // Timetable (Continuous)
    html += '<div class="sp-timeline-wrapper">';
    if (plan.timetable) {
      for(var i=0; i<plan.timetable.length; i++) {
        var dayObj = plan.timetable[i];
        var isCompleted = plan.progress && plan.progress[dayObj.day] === true;
        var nodeClass = isCompleted ? 'completed' : '';
        if(dayObj.dayType === 'revision') nodeClass += ' revision-day';
        if(dayObj.dayType === 'mock') nodeClass += ' mock-day';

        var dayTotalMin = 0;
        var sessionsHtml = '';
        if (dayObj.sessions && dayObj.sessions.length > 0) {
          for(var j=0; j<dayObj.sessions.length; j++) {
            var sess = dayObj.sessions[j];
            dayTotalMin += (sess.estimatedMinutes || 0);
            
            // Rich Session Cards
            sessionsHtml += '<div class="sp-tl-session">' +
              '<div class="sp-tl-subj">' + _esc(sess.subject || 'Focus') + '</div>' +
              '<div class="sp-tl-top">' +
                '<strong style="display:block;margin-bottom:0.25rem">' + _esc(sess.topic) + '</strong>' +
                (sess.subTopic ? '<span style="font-size:0.8rem;color:#64748b;display:block;margin-bottom:0.25rem">' + _esc(sess.subTopic) + '</span>' : '') +
                (sess.focusArea ? '<span style="font-size:0.75rem;background:#fef3c7;color:#92400e;padding:0.15rem 0.3rem;border-radius:4px;display:inline-block">Goal: ' + _esc(sess.focusArea) + '</span>' : '') +
              '</div>' +
              '<div class="sp-tl-min">' + (sess.estimatedMinutes || 0) + 'm</div>' +
            '</div>';
          }
        } else {
          sessionsHtml = '<div style="color:#64748b;font-style:italic;padding:1rem;text-align:center;">Self Practice / General Revision</div>';
        }

        html += '<div class="sp-tl-node ' + nodeClass + '">' +
          '<div class="sp-tl-line"></div>' +
          '<div class="sp-tl-dot"></div>' +
          '<div class="sp-tl-card">' +
            '<div class="sp-tl-card-header sp-day-toggle" data-day="' + dayObj.day + '">' +
              '<div><strong style="color:#0f172a;font-size:1.05rem">Day ' + dayObj.day + '</strong>' + (isCompleted ? ' <span style="color:#10b981;font-size:0.8rem;margin-left:0.5rem">✓ Done</span>' : '') + '</div>' +
              '<div class="sp-tl-total-min">' + dayTotalMin + 'm <span style="font-size:0.7rem;margin-left:0.25rem">▼</span></div>' +
            '</div>' +
            '<div class="sp-tl-card-body">' + sessionsHtml + '</div>' +
          '</div>' +
        '</div>';
      }
    }
    html += '</div>'; // close timeline-wrapper

    // Actions Area (OUTSIDE Timeline)
    var csvData = 'Day,Subject,Topic,Subtopic,EstimatedMinutes,Completed,PlanPhase,ExamType\n';
    if(plan.timetable) {
      for(var i=0; i<plan.timetable.length; i++) {
        var dayObj = plan.timetable[i];
        var isCompleted = plan.progress && plan.progress[dayObj.day] === true;
        if(dayObj.sessions) {
          for(var j=0; j<dayObj.sessions.length; j++) {
            var sess = dayObj.sessions[j];
            csvData += [
              '"' + _esc(dayObj.day) + '"',
              '"' + _esc(sess.subject) + '"',
              '"' + _esc(sess.topic) + '"',
              '"' + _esc(sess.subTopic || '') + '"',
              '"' + _esc(sess.estimatedMinutes) + '"',
              '"' + (isCompleted ? 'Yes' : 'No') + '"',
              '"' + _esc(plan.timetable.length > 0 && plan.timetable[0].day > 1 ? 'Continuation' : 'Initial') + '"',
              '"' + _esc(plan.examName) + '"'
            ].join(',') + '\n';
          }
        }
      }
    }
    var csvBlob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    var csvUrl = URL.createObjectURL(csvBlob);

    html += '<div class="sp-fab-bar sp-fab-actions">';
    if (plan.status === 'draft') {
      html += '<button class="btn btn-secondary sp-regenerate-btn" type="button">Regenerate ↺</button>' +
              '<button class="btn-primary sp-finalize-btn" type="button">Finalize Plan ✨</button>';
    } else {
      var isPhaseComplete = completedCount === totalCount && totalCount > 0;
      if (isPhaseComplete) {
         html += '<div class="sp-phase-complete-msg">🎉 Phase Completed!</div>';
         html += '<button class="btn-primary sp-next-14-btn" type="button" style="width:100%">Generate Next Block ⏭️</button>';
      } else {
         html += '<a href="' + csvUrl + '" download="' + _esc(plan.examName) + '_StudyPlan.csv" class="btn btn-secondary sp-csv-btn">Export CSV</a>' +
                 '<button class="btn-primary sp-next-14-btn" type="button">Next Block ⏭️</button>';
      }
    }
    html += '</div>';

    // Collapsible AI Strategy Summary (Moved to Bottom)
    html += '<details class="sp-ai-insight-details" style="margin-top:2rem;">' +
       '<summary><span class="icon">🤖</span> AI Strategy Insight <span class="expand-icon">▼</span></summary>' +
       '<div class="sp-ai-insight-content">' + _esc(plan.rationale) + '</div>' +
    '</details>';

    html += '</div>';
    return html;
  }


  function _openStudyPlanModal(containerId) {
    var existing = document.getElementById('aiStudyPlanModal');
    if (existing) existing.parentNode.removeChild(existing);

    var _spActiveXhr = null;
    var _spClosed = false;

    function _spPost(body, callback) {
      _getIdToken(function (token) {
        if (_spClosed) return;
        if (!token) { callback(FRIENDLY_ERROR); return; }
        var xhr = new XMLHttpRequest();
        _spActiveXhr = xhr;
        xhr.open('POST', '/api/ai/study-plan', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        xhr.timeout = 60000;
        xhr.onload = function () {
          _spActiveXhr = null;
          if (_spClosed) return;
          if (xhr.status === 200) {
            try { callback(null, JSON.parse(xhr.responseText)); } catch (e) { callback(FRIENDLY_ERROR); }
          } else if (xhr.status === 403) {
            try {
              var errData = JSON.parse(xhr.responseText);
              var spCode = errData.error && errData.error.code;
              callback(spCode === 'PREMIUM_REQUIRED' ? 'premium_required' : FRIENDLY_ERROR);
            } catch (_e) { callback(FRIENDLY_ERROR); }
          } else if (xhr.status === 429) {
            callback('rate_limited');
          } else {
            callback(FRIENDLY_ERROR);
          }
        };
        xhr.onerror = function () { _spActiveXhr = null; if (!_spClosed) callback(FRIENDLY_ERROR); };
        xhr.ontimeout = function () { _spActiveXhr = null; if (!_spClosed) callback(FRIENDLY_ERROR); };
        xhr.send(JSON.stringify(body));
      });
    }

    var overlay = document.createElement('div');
    overlay.id = 'aiStudyPlanModal';
    overlay.className = 'modal-overlay sp-premium-overlay';
    overlay.style.display = 'flex';
    overlay.innerHTML =
      '<div class="modal-content sp-premium-modal">' +
        '<div class="sp-modal-header">' +
          '<h3 class="modal-title">AI Study Planner</h3>' +
          '<button class="info-modal-close sp-close-btn" aria-label="Close">✕</button>' +
        '</div>' +
        '<div class="sp-modal-body" id="spModalBody">' +
          '<div class="sp-loading-active" style="text-align:center; padding: 4rem 1rem;"><div class="ai-spinner" style="margin:0 auto 1rem;"></div><p style="color:#64748b;font-weight:500;">Loading your active plan...</p></div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    function closeModal() {
      _spClosed = true;
      if (_spActiveXhr) { try { _spActiveXhr.abort(); } catch (_e) {} _spActiveXhr = null; }
      _studyPlanInFlight = false;
      overlay.style.display = 'none';
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

        function renderWizardStep() {
      var bodyEl = overlay.querySelector('#spModalBody');
      var html = '';
      
      var progressPct = Math.round((_spWizardStep / 4) * 100);
      var wizardHeader = '<div class="sp-wiz-header">' +
        '<button class="sp-wiz-back" ' + (_spWizardStep === 1 ? 'style="visibility:hidden"' : '') + '>← Back</button>' +
        '<div class="sp-wiz-progress"><div class="sp-wiz-bar" style="width:' + progressPct + '%"></div></div>' +
        '</div>';

      if (_spWizardStep === 1) {
        var todayStr = new Date().toISOString().slice(0, 10);
        var daysLeftHtml = '';
        if (_spWizardData.examDate) {
          var examMs = new Date(_spWizardData.examDate).getTime();
          var daysRemaining = Math.ceil((examMs - Date.now()) / (1000 * 60 * 60 * 24));
          if (daysRemaining > 0) {
             daysLeftHtml = '<div class="sp-wiz-days-left">⏳ ' + daysRemaining + ' Days Remaining</div>';
          }
        }
        
        var isOther = SP_EXAMS.indexOf(_spWizardData.examName) === -1 && _spWizardData.examName;
        html = wizardHeader + 
          '<div class="sp-wiz-content">' +
            '<h3 class="sp-wiz-title">Target Exam</h3>' +
            '<p class="sp-wiz-desc">Select your target exam and date.</p>' +
            '<div class="sp-wiz-grid" style="margin-bottom:1.5rem;width:100%">' +
              SP_EXAMS.map(function(ex) {
                 var isSel = _spWizardData.examName === ex || (ex === 'Other' && isOther);
                 return '<div class="sp-wiz-card ' + (isSel ? 'selected' : '') + '" data-exam="' + ex + '"><span>' + ex + '</span></div>';
              }).join('') +
            '</div>' +
            '<div id="spExamCustomWrapper" style="display:' + (isOther ? 'block' : 'none') + ';width:100%;margin-bottom:1.5rem;">' +
              '<input id="spExamCustom" class="sp-input" type="text" placeholder="Type exam name..." maxlength="80" value="' + (isOther ? _spWizardData.examName : '') + '"/>' +
            '</div>' +
            '<h3 class="sp-wiz-title" style="font-size:1.2rem;margin-bottom:0.5rem">Exam Date</h3>' +
            '<input id="spExamDate" class="sp-input sp-date-lg" type="date" min="' + todayStr + '" value="' + _spWizardData.examDate + '" style="margin-bottom:0.5rem;width:100%" />' +
            daysLeftHtml +
            '<h3 class="sp-wiz-title" style="font-size:1.2rem;margin-top:1.5rem;margin-bottom:0.5rem">Target Score (Optional)</h3>' +
            '<input id="spTargetScore" class="sp-input sp-date-lg" type="text" placeholder="e.g. 99%ile, 720" maxlength="50" value="' + _spWizardData.targetScore + '" style="margin-bottom:1.5rem;width:100%"/>' +
          '</div>' +
          '<div class="sp-fab-bar"><button class="btn-primary sp-wiz-next" ' + (_spWizardData.examName && _spWizardData.examDate ? '' : 'disabled') + '>Next</button></div>';
      } else if (_spWizardStep === 2) {
        html = wizardHeader + 
          '<div class="sp-wiz-content">' +
            '<h3 class="sp-wiz-title">What is your current level?</h3>' +
            '<p class="sp-wiz-desc">We will adapt the plan difficulty.</p>' +
            '<div class="sp-wiz-list">' +
              ['Beginner', 'Intermediate', 'Advanced'].map(function(lvl) {
                 var isSel = _spWizardData.currentLevel === lvl;
                 return '<div class="sp-wiz-list-item ' + (isSel ? 'selected' : '') + '" data-level="' + lvl + '"><div class="sp-wiz-list-check"></div><span>' + lvl + '</span></div>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<div class="sp-fab-bar"><button class="btn-primary sp-wiz-next" ' + (_spWizardData.currentLevel ? '' : 'disabled') + '>Next</button></div>';
      } else if (_spWizardStep === 3) {
        var commonWeak = ['Percentages', 'Geometry', 'RC', 'LRDI', 'Algebra', 'Data Insights'];
        var weakStr = _spWizardData.weakTopics.filter(function(t){ return commonWeak.indexOf(t) === -1; }).join(', ');
        var strongStr = _spWizardData.strongTopics.join(', ');
        html = wizardHeader + 
          '<div class="sp-wiz-content">' +
            '<h3 class="sp-wiz-title">Study Preferences</h3>' +
            '<p class="sp-wiz-desc">Configure your daily time and focus areas.</p>' +
            '<div class="sp-slider-container">' +
              '<div class="sp-slider-val" id="spSliderVal">60 mins</div>' +
              '<input type="range" min="0" max="4" step="1" value="2" class="sp-slider" id="spTimeSlider">' +
              '<div class="sp-slider-labels"><span>15m</span><span>Custom</span></div>' +
              '<input id="spTimeCustom" class="sp-input" type="number" placeholder="Minutes per day" style="display:none;margin-top:1rem;width:100%" value="60"/>' +
            '</div>' +
            '<div class="sp-field" style="width:100%">' +
              '<label class="sp-label" style="text-align:center;display:block">Weak Areas</label>' +
              '<div class="sp-wiz-chips sp-chips-sm" style="margin-bottom:0.5rem;justify-content:center">' +
                 commonWeak.map(function(t) {
                   var isSel = _spWizardData.weakTopics.indexOf(t) > -1;
                   return '<div class="sp-wiz-chip sp-wiz-chip-toggle ' + (isSel ? 'selected' : '') + '" data-type="weak" data-val="' + t + '">+' + t + '</div>';
                 }).join('') +
              '</div>' +
              '<input id="spWeakTopics" class="sp-input" type="text" placeholder="Other weak areas (comma separated)..." maxlength="200" value="' + weakStr + '" />' +
            '</div>' +
            '<div class="sp-field" style="margin-top:1.5rem;width:100%">' +
              '<label class="sp-label" style="text-align:center;display:block">Strong Areas</label>' +
              '<input id="spStrongTopics" class="sp-input" type="text" placeholder="e.g. Arithmetic, Logic Games" maxlength="200" value="' + strongStr + '" />' +
            '</div>' +
          '</div>' +
          '<div class="sp-fab-bar"><button class="btn-primary sp-wiz-next">Review Plan</button></div>';
      } else if (_spWizardStep === 4) {
        var examMs2 = new Date(_spWizardData.examDate).getTime();
        var daysRemaining2 = Math.max(1, Math.ceil((examMs2 - Date.now()) / (1000 * 60 * 60 * 24)));
        var estTotalHours = Math.round((daysRemaining2 * _spWizardData.dailyTimeMinutes) / 60);
        html = wizardHeader + 
          '<div class="sp-wiz-content">' +
            '<h3 class="sp-wiz-title">Ready to Generate</h3>' +
            '<p class="sp-wiz-desc">Review your details before generating the plan.</p>' +
            '<div class="sp-wiz-summary" style="width:100%">' +
              '<div class="sp-wiz-sum-row"><span>Exam</span><strong>' + _esc(_spWizardData.examName) + ' (' + _esc(_spWizardData.examDate) + ')</strong></div>' +
              '<div class="sp-wiz-sum-row"><span>Days Left</span><strong>' + daysRemaining2 + '</strong></div>' +
              '<div class="sp-wiz-sum-row"><span>Target Score</span><strong>' + (_spWizardData.targetScore ? _esc(_spWizardData.targetScore) : 'N/A') + '</strong></div>' +
              '<div class="sp-wiz-sum-row"><span>Level</span><strong>' + _esc(_spWizardData.currentLevel) + '</strong></div>' +
              '<div class="sp-wiz-sum-row"><span>Daily Study</span><strong>' + _spWizardData.dailyTimeMinutes + 'm</strong></div>' +
              '<div class="sp-wiz-sum-row"><span>Weak Areas</span><strong style="max-width:150px;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + _esc(_spWizardData.weakTopics.join(', ')) + '">' + (_spWizardData.weakTopics.length ? _esc(_spWizardData.weakTopics.join(', ')) : 'None') + '</strong></div>' +
              '<div class="sp-wiz-sum-row"><span>Estimated Total</span><strong>~' + estTotalHours + ' Hours</strong></div>' +
            '</div>' +
            '<div class="sp-error" id="spError" style="display:none;margin-top:1rem;width:100%;text-align:center"></div>' +
          '</div>' +
          '<div class="sp-fab-bar"><button class="btn-primary sp-wiz-generate" id="spGenerateBtn">Generate Study Plan ✨</button></div>';
      }

      bodyEl.innerHTML = html;
      _bindWizardHandlers(bodyEl);
    }

    function _bindWizardHandlers(bodyEl) {
      var backBtn = bodyEl.querySelector('.sp-wiz-back');
      if (backBtn) {
        backBtn.addEventListener('click', function() {
          if (_spWizardStep > 1) { _spWizardStep--; renderWizardStep(); }
        });
      }

      // Step 1
      if (_spWizardStep === 1) {
        var cards = bodyEl.querySelectorAll('.sp-wiz-card');
        var customInpWrapper = bodyEl.querySelector('#spExamCustomWrapper');
        var customInp = bodyEl.querySelector('#spExamCustom');
        var dateInp = bodyEl.querySelector('#spExamDate');
        var targetInp = bodyEl.querySelector('#spTargetScore');
        var nextBtn = bodyEl.querySelector('.sp-wiz-next');
        
        function validateStep1() {
          nextBtn.disabled = !(_spWizardData.examName && _spWizardData.examDate);
        }

        for (var i = 0; i < cards.length; i++) {
          cards[i].addEventListener('click', function() {
            var ex = this.getAttribute('data-exam');
            if (ex === 'Other') {
              _spWizardData.examName = customInp.value;
              customInpWrapper.style.display = 'block';
              customInp.focus();
            } else {
              _spWizardData.examName = ex;
              customInpWrapper.style.display = 'none';
            }
            // Update UI without full rerender to avoid losing input focus
            for (var j = 0; j < cards.length; j++) cards[j].classList.remove('selected');
            this.classList.add('selected');
            validateStep1();
          });
        }
        if (customInp) {
          customInp.addEventListener('input', function() {
            _spWizardData.examName = this.value;
            validateStep1();
          });
        }
        dateInp.addEventListener('input', function() {
          _spWizardData.examDate = this.value;
          validateStep1();
        });
        targetInp.addEventListener('input', function() {
          _spWizardData.targetScore = this.value;
        });

        nextBtn.addEventListener('click', function() {
          if (_spWizardData.examName && _spWizardData.examDate) { 
             var todayStr = new Date().toISOString().slice(0, 10); 
             if (_spWizardData.examDate > todayStr) { 
                 _spWizardStep++; renderWizardStep(); 
             } 
          }
        });
      }

      // Step 2
      if (_spWizardStep === 2) {
        var listItems = bodyEl.querySelectorAll('.sp-wiz-list-item');
        var nextBtn = bodyEl.querySelector('.sp-wiz-next');
        for (var i = 0; i < listItems.length; i++) {
          listItems[i].addEventListener('click', function() {
            _spWizardData.currentLevel = this.getAttribute('data-level');
            renderWizardStep();
          });
        }
        nextBtn.addEventListener('click', function() {
          if (_spWizardData.currentLevel) { _spWizardStep++; renderWizardStep(); }
        });
      }

      // Step 3
      if (_spWizardStep === 3) {
        var slider = bodyEl.querySelector('#spTimeSlider');
        var sliderVal = bodyEl.querySelector('#spSliderVal');
        var customInp = bodyEl.querySelector('#spTimeCustom');
        var toggles = bodyEl.querySelectorAll('.sp-wiz-chip-toggle');
        var weakInp = bodyEl.querySelector('#spWeakTopics');
        var strongInp = bodyEl.querySelector('#spStrongTopics');
        var nextBtn = bodyEl.querySelector('.sp-wiz-next');

        var stops = [15, 30, 60, 90, 'Custom'];

        if (slider) {
          var initVal = _spWizardData.dailyTimeMinutes;
          var idx = stops.indexOf(initVal);
          if (idx === -1) {
            slider.value = 4;
            customInp.value = initVal;
            customInp.style.display = 'block';
            sliderVal.textContent = 'Custom';
          } else {
            slider.value = idx;
            sliderVal.textContent = initVal + ' mins';
            customInp.style.display = 'none';
          }

          slider.addEventListener('input', function() {
            var v = parseInt(this.value);
            if (v === 4) {
              sliderVal.textContent = 'Custom';
              customInp.style.display = 'block';
              _spWizardData.dailyTimeMinutes = Math.max(15, Math.min(720, parseInt(customInp.value) || 60));
            } else {
              sliderVal.textContent = stops[v] + ' mins';
              customInp.style.display = 'none';
              _spWizardData.dailyTimeMinutes = stops[v];
            }
          });
          customInp.addEventListener('input', function() {
            var v = parseInt(this.value);
            if (isNaN(v)) v = 60;
            _spWizardData.dailyTimeMinutes = Math.max(15, Math.min(720, v));
          });
        }

        for (var i = 0; i < toggles.length; i++) {
          toggles[i].addEventListener('click', function() {
            var val = this.getAttribute('data-val');
            var idx = _spWizardData.weakTopics.indexOf(val);
            if (idx > -1) {
               _spWizardData.weakTopics.splice(idx, 1);
            } else {
               _spWizardData.weakTopics.push(val);
            }
            renderWizardStep(); // Will re-render Step 3 with updated chips
          });
        }
        nextBtn.addEventListener('click', function() {
          var wCustom = weakInp.value.split(',').map(function(s){return s.trim();}).filter(function(s){return s;});
          var sCustom = strongInp.value.split(',').map(function(s){return s.trim();}).filter(function(s){return s;});
          // Merge custom with clicked chips
          var finalWeak = _spWizardData.weakTopics.filter(function(t) { return document.querySelector('.sp-wiz-chip-toggle[data-val="' + t + '"]'); }); // Keep only common ones as base
          for(var i=0; i<wCustom.length; i++) if(finalWeak.indexOf(wCustom[i]) === -1) finalWeak.push(wCustom[i]);
          
          _spWizardData.weakTopics = finalWeak;
          _spWizardData.strongTopics = sCustom;
          _spWizardStep++; renderWizardStep();
        });
      }

      // Step 4
      if (_spWizardStep === 4) {
        var genBtn = bodyEl.querySelector('#spGenerateBtn');
        var errorEl = bodyEl.querySelector('#spError');
        genBtn.addEventListener('click', function() {
          if (_studyPlanInFlight) return;
          _studyPlanInFlight = true;
          genBtn.disabled = true;
          genBtn.innerHTML = '<div class="ai-spinner-inline"></div> Generating...';

          var progress = typeof loadProgress === 'function' ? loadProgress() : {};
          var statsPayload = {
            totalAttempted: progress.totalAttempted || 0,
            totalCorrect: progress.totalCorrect || 0,
            categoryStats: progress.categoryStats || {}
          };

          _spPost({
            action: 'generate',
            examName: _spWizardData.examName,
            examDate: _spWizardData.examDate,
            dailyTimeMinutes: _spWizardData.dailyTimeMinutes,
            targetScore: _spWizardData.targetScore,
            currentLevel: _spWizardData.currentLevel,
            weakTopics: _spWizardData.weakTopics,
            strongTopics: _spWizardData.strongTopics,
            stats: statsPayload
          }, function (err, data) {
            _studyPlanInFlight = false;
            genBtn.disabled = false;
            genBtn.innerHTML = 'Generate Study Plan ✨';

            if (err === 'premium_required') {
              closeModal();
              if (typeof showPaywall === 'function') showPaywall('ai_study_plan');
              return;
            }
            if (err || !data || !data.plan) {
              errorEl.textContent = 'Unable to generate plan right now.';
              errorEl.style.display = 'block';
              return;
            }
            showResult(data.plan);
          });
        });
      }
    }


    function showResult(plan) {
      var bodyEl = overlay.querySelector('#spModalBody');
      bodyEl.innerHTML = _buildResultHTML(plan);
      
      var nextBtn = bodyEl.querySelector('.sp-next-14-btn');
      if (nextBtn) {
        nextBtn.addEventListener('click', function() {
          if (_studyPlanInFlight) return;
          _studyPlanInFlight = true;
          this.disabled = true;
          this.innerHTML = '<div class="ai-spinner-inline"></div> Generating...';
          
          _spPost({
            action: 'generate',
            examName: plan.examName,
            examDate: plan.examDate,
            dailyTimeMinutes: plan.dailyTimeMinutes,
            targetScore: plan.targetScore,
            currentLevel: plan.currentLevel,
            weakTopics: plan.weakTopics,
            strongTopics: plan.strongTopics,
            previousPlanId: plan.id
          }, function(err, data) {
            _studyPlanInFlight = false;
            if (err || !data || !data.plan) {
               alert('Unable to generate next block. Please try again.');
               var resetBtn = document.querySelector('.sp-next-14-btn');
               if(resetBtn){ resetBtn.disabled=false; resetBtn.innerHTML='Generate Next Block ⏭️'; }
               return;
            }
            showResult(data.plan);
          });
        });
      }

      var regenBtn = bodyEl.querySelector('.sp-regenerate-btn');
      if (regenBtn) {
        regenBtn.addEventListener('click', function() {
          _spWizardStep = 1;
          renderWizardStep();
        });
      }

      var finBtn = bodyEl.querySelector('.sp-finalize-btn');
      if (finBtn) {
        finBtn.addEventListener('click', function() {
          if (_studyPlanInFlight) return;
          _studyPlanInFlight = true;
          this.disabled = true;
          this.innerHTML = '<div class="ai-spinner-inline"></div> Finalizing...';
          _spPost({ action: 'finalize', planId: plan.id }, function(err) {
            _studyPlanInFlight = false;
            if (err) { alert('Unable to finalize.'); return; }
            plan.status = 'active';
            showResult(plan);
          });
        });
      }

      var dayToggles = bodyEl.querySelectorAll('.sp-day-toggle');
      for(var i=0; i<dayToggles.length; i++) {
        dayToggles[i].addEventListener('click', function() {
          var body = this.nextElementSibling;
          if (body.style.display === 'block') {
            body.style.display = 'none';
          } else {
            body.style.display = 'block';
          }
        });
      }
    }

    overlay.querySelector('.sp-close-btn').addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    _spPost({ action: 'get_active' }, function(err, data) {
      if (err || !data || !data.plan) {
        _spWizardStep = 1;
        renderWizardStep();
      } else {
        showResult(data.plan);
      }
    });
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
      '<button class="home-bento-action-btn sp-open-btn" type="button">Generate Plan ✨</button>';

    container.querySelector('.sp-open-btn').addEventListener('click', function () {
      _openStudyPlanModal(containerId);
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

  return {
    fetchSpeedBenchmark: fetchSpeedBenchmark,
    showExplanationModal: showExplanationModal,
    showStatsInsightsModal: showStatsInsightsModal,
    showCoachModal: showCoachModal,
    showInsufficientDataModal: showInsufficientDataModal,
    renderAICoachCard: renderAICoachCard,
    renderStudyPlanCard: renderStudyPlanCard,
    renderWordProblemsSetup: renderWordProblemsSetup,
    resetWpAdaptive: resetWpAdaptive,
    isPremium: _isPremium
  };
})();
