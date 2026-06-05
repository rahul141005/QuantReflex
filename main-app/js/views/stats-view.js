/**
 * stats-view.js — Stats view renderer
 *
 * Extracted from app.js. Renders all stats sections:
 *   - Practice overview, speed, activity, consistency
 *   - 7-day accuracy sparkline chart
 *   - Performance insights (premium gated)
 *   - AI insights integration
 *   - Category accuracy bars
 */
var _lastStatsFingerprint = null;

function renderStatsView() {
  var p = loadProgress();

  /* Dirty-flag cache: skip full DOM rebuild if progress hasn't changed */
  var fingerprint = (p.totalAttempted || 0) + ':' + (p.totalCorrect || 0) + ':' +
    (p.dailyStreak || 0) + ':' + (p.todayAttempted || 0);
  if (_lastStatsFingerprint === fingerprint) return;
  _lastStatsFingerprint = fingerprint;
  var canSeeInsights = canAccessFeature('performance_insights');
  var canSeeCategoryAccuracy = canAccessFeature('category_accuracy');
  var accuracy = p.totalAttempted ? ((p.totalCorrect / p.totalAttempted) * 100).toFixed(1) : '0';
  var avgTime = getAvgResponseTime();
  var weakest = getWeakestCategory();
  var strongest = getStrongestCategory();

  var trend = '-';
  var trendClass = '';
  var history = p.dailyHistory || {};
  var dates = Object.keys(history).sort();
  if (dates.length >= 2) {
    var recentDays = dates.slice(-7);
    var olderDays = dates.slice(-14, -7);
    if (olderDays.length > 0) {
      var recentAcc = 0, recentTotal = 0;
      for (var r = 0; r < recentDays.length; r++) {
        var rd = history[recentDays[r]];
        if (rd.attempted > 0) { recentAcc += rd.correct; recentTotal += rd.attempted; }
      }
      var olderAcc = 0, olderTotal = 0;
      for (var o = 0; o < olderDays.length; o++) {
        var od = history[olderDays[o]];
        if (od.attempted > 0) { olderAcc += od.correct; olderTotal += od.attempted; }
      }
      if (recentTotal > 0 && olderTotal > 0) {
        var recentPct = (recentAcc / recentTotal) * 100;
        var olderPct = (olderAcc / olderTotal) * 100;
        var diff = recentPct - olderPct;
        if (diff > 2) { trend = '📈 Improving'; trendClass = ' stat-card-positive'; }
        else if (diff < -2) { trend = '📉 Declining'; trendClass = ' stat-card-negative'; }
        else { trend = '➡️ Steady'; }
      }
    }
  }

  var overviewEl = document.getElementById('statsPracticeOverview');
  if (overviewEl) {
    overviewEl.innerHTML =
      '<div class="stat-card"><div class="value">' + p.totalAttempted + '</div><div class="label">Questions Attempted</div></div>' +
      '<div class="stat-card"><div class="value">' + p.totalCorrect + '</div><div class="label">Correct Answers</div></div>' +
      '<div class="stat-card"><div class="value">' + accuracy + '%</div><div class="label">Accuracy</div></div>';
  }

  var speedEl = document.getElementById('statsSpeed');
  if (speedEl) {
    speedEl.innerHTML =
      '<div class="stat-card"><div class="value">' + (Number(avgTime) > 0 ? avgTime + 's' : '-') + '</div><div class="label">Avg Response Time</div></div>' +
      '<div class="stat-card"><div class="value">' + (p.bestStreak || 0) + '</div><div class="label">Best Streak</div></div>';
  }

  var activityEl = document.getElementById('statsActivity');
  if (activityEl) {
    activityEl.innerHTML =
      '<div class="stat-card"><div class="value">' + (p.drillSessions || 0) + '</div><div class="label">Drill Sessions</div></div>' +
      '<div class="stat-card"><div class="value">' + (p.timedTestSessions || 0) + '</div><div class="label">Timed Tests</div></div>';
  }

  var consistencyEl = document.getElementById('statsConsistency');
  if (consistencyEl) {
    consistencyEl.innerHTML =
      '<div class="stat-card"><div class="value">' + (p.dailyStreak || 0) + ' 🔥</div><div class="label">Daily Streak</div></div>' +
      '<div class="stat-card"><div class="value">' + (p.todayAttempted || 0) + '</div><div class="label">Today\'s Questions</div></div>';
  }

  /* 7-Day Accuracy Bar Chart — Premium Redesign */
  var sparklineEl = document.getElementById('statsSparkline');
  if (sparklineEl) {
    var _allDates = Object.keys(history).sort(function (a, b) {
      return new Date(a).getTime() - new Date(b).getTime();
    });
    var _last7 = _allDates.slice(-7);
    if (_last7.length < 2) {
      sparklineEl.innerHTML = '<div class="qr-empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg><h2>Not enough data</h2><p>Practice for 2+ days to see your accuracy trend.</p></div>';
    } else {
      var _DAY_ABBREV = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
      var _barW = 28, _barGap = 12, _chartH = 72, _labelH = 20, _topPad = 18;
      var _svgW = _last7.length * (_barW + _barGap) - _barGap + 16;
      var _svgH = _topPad + _chartH + _labelH + 4;
      var _values = _last7.map(function (d) {
        var e = history[d];
        return e && e.attempted > 0 ? Math.round((e.correct / e.attempted) * 100) : 0;
      });
      var _maxVal = Math.max.apply(null, _values);
      /* SVG gradient definitions for premium look */
      var _defs =
        '<defs>' +
          '<linearGradient id="barGradHigh" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#34d399"/>' +
            '<stop offset="100%" stop-color="#059669"/>' +
          '</linearGradient>' +
          '<linearGradient id="barGradMid" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#60a5fa"/>' +
            '<stop offset="100%" stop-color="#2563eb"/>' +
          '</linearGradient>' +
          '<linearGradient id="barGradLow" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#fca5a5"/>' +
            '<stop offset="100%" stop-color="#ef4444"/>' +
          '</linearGradient>' +
          '<linearGradient id="barGradBest" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#67e8f9"/>' +
            '<stop offset="100%" stop-color="#06b6d4"/>' +
          '</linearGradient>' +
        '</defs>';

      var _bars = '';
      for (var _i = 0; _i < _last7.length; _i++) {
        var _pct = _values[_i];
        var _barH = Math.max(3, Math.round((_pct / 100) * _chartH));
        var _x = 8 + _i * (_barW + _barGap);
        var _y = _topPad + (_chartH - _barH);
        var _fillRef = (_pct === _maxVal && _maxVal > 0) ? 'url(#barGradBest)'
          : _pct >= 80 ? 'url(#barGradHigh)' : _pct >= 60 ? 'url(#barGradMid)' : 'url(#barGradLow)';
        var _d = new Date(_last7[_i]);
        var _dayLabel = _DAY_ABBREV[_d.getDay()];
        var _valDisplay = _pct > 0 ? _pct + '%' : '';
        var _animDelay = (_i * 0.06).toFixed(2);
        _bars +=
          '<rect class="sparkline-bar" x="' + _x + '" y="' + _y + '" width="' + _barW + '" height="' + _barH + '" rx="6" fill="' + _fillRef + '" style="animation-delay:' + _animDelay + 's"/>' +
          '<text x="' + (_x + _barW / 2) + '" y="' + (_y - 5) + '" text-anchor="middle" class="sparkline-val">' + _valDisplay + '</text>' +
          '<text x="' + (_x + _barW / 2) + '" y="' + (_topPad + _chartH + _labelH - 2) + '" text-anchor="middle" class="sparkline-day">' + _dayLabel + '</text>';
      }
      /* Dotted baseline */
      var _baseline = '<line x1="8" y1="' + (_topPad + _chartH) + '" x2="' + (_svgW - 8) + '" y2="' + (_topPad + _chartH) + '" stroke="currentColor" opacity="0.1" stroke-width="1" stroke-dasharray="4 3"/>';

      var _trendLabel = trend !== '-' ? trend : '';
      var _trendPillClass = trendClass.indexOf('positive') !== -1 ? ' sparkline-trend-positive'
        : trendClass.indexOf('negative') !== -1 ? ' sparkline-trend-negative' : ' sparkline-trend-steady';

      sparklineEl.innerHTML =
        '<div class="sparkline-chart-wrap">' +
          '<svg class="stats-sparkline" viewBox="0 0 ' + _svgW + ' ' + _svgH + '" preserveAspectRatio="xMidYMid meet" aria-label="7-day accuracy chart">' +
            _defs + _baseline + _bars +
          '</svg>' +
        '</div>' +
        (_trendLabel ? '<div class="sparkline-trend-label' + _trendPillClass + '">' + _trendLabel + '</div>' : '');
    }
  }

  /* Performance Insights + Category Accuracy */
  var insightsEl = document.getElementById('statsInsights');
  var catContainer = document.getElementById('categoryStats');
  var perfSection = document.getElementById('performanceInsightsSection');
  var catSection = document.getElementById('categoryAccuracySection');

  if (!canSeeInsights) {
    /* ---- FREE USER: combined locked section ---- */
    /* Show a single blurred/locked card spanning both sections */
    if (insightsEl) {
      insightsEl.innerHTML =
        '<button class="stats-insights-locked" id="unlockInsightsBtn" type="button">' +
          '<div class="stats-insights-locked-content">' +
            '<p class="stats-insights-locked-title">Performance Insights and Category Accuracy is a Premium feature 🔒</p>' +
            '<p class="stats-insights-locked-cta">Upgrade to view detailed insights</p>' +
          '</div>' +
        '</button>';
      var unlockInsightsBtn = document.getElementById('unlockInsightsBtn');
      if (unlockInsightsBtn) {
        unlockInsightsBtn.addEventListener('click', function () { showPaywall('stats'); });
      }
    }
    /* Hide the separate Category Accuracy section for free users */
    if (catSection) catSection.style.display = 'none';
  } else {
    /* ---- PREMIUM USER: show both sections separately ---- */
    if (catSection) catSection.style.display = '';

    /* Performance Insights */
    if (insightsEl) {
      var categoryInsightMsg = (!weakest && !strongest) ? 'Solve more questions to unlock category insights.' : '';
      var weakestDisplay = weakest ? formatCategoryName(weakest) : (categoryInsightMsg ? '🔒' : '-');
      var strongestDisplay = strongest ? formatCategoryName(strongest) : (categoryInsightMsg ? '🔒' : '-');
      insightsEl.className = 'stat-grid stat-grid-2';
      insightsEl.innerHTML =
        '<div class="stat-card' + (strongest ? ' stat-card-positive' : '') + '"><div class="value value-sm">' + strongestDisplay + '</div><div class="label">Strongest Category</div>' + (categoryInsightMsg && !strongest ? '<div class="stat-hint">' + categoryInsightMsg + '</div>' : '') + '</div>' +
        '<div class="stat-card' + (weakest ? ' stat-card-negative' : '') + '"><div class="value value-sm">' + weakestDisplay + '</div><div class="label">Weakest Category</div>' + (categoryInsightMsg && !weakest ? '<div class="stat-hint">' + categoryInsightMsg + '</div>' : '') + '</div>';
    }

    /* Category Stats */
    if (catContainer) {
      var cats = p.categoryStats || {};
      var keys = Object.keys(cats);
      keys = keys.filter(function (k) { return isValidCategory(k); });
      if (keys.length === 0) {
        catContainer.innerHTML = '<p class="secondary-text">Start practicing to see category-wise performance.</p>';
      } else {
        keys.sort(function (a, b) {
          var accA = cats[a].attempted ? (cats[a].correct / cats[a].attempted) : 0;
          var accB = cats[b].attempted ? (cats[b].correct / cats[b].attempted) : 0;
          return accA - accB;
        });
        var html = '<div class="category-stats-list">';
        for (var i = 0; i < keys.length; i++) {
          var cat = keys[i];
          var cs = cats[cat];
          var catAcc = cs.attempted ? ((cs.correct / cs.attempted) * 100).toFixed(0) : '0';
          var barWidth = cs.attempted ? Math.round((cs.correct / cs.attempted) * 100) : 0;
          var barClass = 'cat-bar ';
          var strengthLabel = '';
          if (barWidth >= 85) { barClass += 'cat-bar-high'; strengthLabel = '<span class="category-strength-label strength-strong">Strong</span>'; }
          else if (barWidth >= 65) { barClass += 'cat-bar-mid'; strengthLabel = '<span class="category-strength-label strength-moderate">Moderate</span>'; }
          else if (barWidth >= 40) { barClass += 'cat-bar-low'; strengthLabel = '<span class="category-strength-label strength-weak">Weak</span>'; }
          else { barClass += 'cat-bar-weak'; strengthLabel = '<span class="category-strength-label strength-weak">Weak</span>'; }
          html +=
            '<div class="category-stat-row">' +
              '<span class="cat-name">' + formatCategoryName(cat) + '</span>' +
              '<div class="cat-bar-container">' +
                '<div class="' + barClass + '" style="width:' + barWidth + '%"></div>' +
              '</div>' +
              strengthLabel +
              '<span class="cat-accuracy">' + catAcc + '%</span>' +
            '</div>';
        }
        html += '</div>';
        catContainer.innerHTML = html;
      }
    }
  }

  /* AI Insights (always last — DOM order guarantees bottom position) */
  var aiInsightsContainer = document.getElementById('aiInsightsContainer');
  if (aiInsightsContainer && typeof AIFeatures !== 'undefined') {
    if (!AIFeatures.isPremium()) {
      aiInsightsContainer.innerHTML =
        '<p class="secondary-text" style="text-align:center;">🔒 AI-powered insights are a Premium+ feature.</p>' +
        '<button class="btn-primary ai-coach-unlock-btn" type="button" style="margin-top:.5rem;">Unlock with Premium+</button>';
      var aiUnlockBtn = aiInsightsContainer.querySelector('.ai-coach-unlock-btn');
      if (aiUnlockBtn) aiUnlockBtn.addEventListener('click', function () { showPaywall('ai_coach'); });
    } else if (p.totalAttempted >= 5) {
      aiInsightsContainer.innerHTML =
        '<div class="ai-stats-body">' +
          '<button class="btn-primary ai-insights-btn" type="button">AI Pattern Analysis ✨</button>' +
        '</div>';
      var _statsInsightsBtn = aiInsightsContainer.querySelector('.ai-insights-btn');
      _statsInsightsBtn.addEventListener('click', function () {
        AIFeatures.showStatsInsightsModal(p);
      });
    } else {
      aiInsightsContainer.innerHTML = '<p class="secondary-text">Complete at least 5 questions to get AI insights.</p>';
    }
  }
}
