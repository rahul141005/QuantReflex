/**
 * leaderboard.js — Coaching Leaderboard View
 *
 * Gamified leaderboard with segmented controls, metric selector, podium, and ranked list.
 * XP replaced by Consistency Score (weighted composite of streak + volume + accuracy).
 */
var LeaderboardView = (function () {
  'use strict';

  var _currentPeriod = 'weekly';
  var _currentMetric = 'accuracy';

  var PERIODS = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'allTime', label: 'All Time' }
  ];

  var METRICS = [
    { key: 'accuracy', label: '🎯 Accuracy' },
    { key: 'speed', label: '⚡ Speed' },
    { key: 'streak', label: '🔥 Streak' },
    { key: 'questions', label: '📝 Questions' },
    { key: 'consistency', label: '🧠 Consistency' }
  ];

  function render(forceRefresh) {
    var container = document.getElementById('view-leaderboard');
    if (!container) return;

    container.innerHTML = _buildShell() + '<div id="leaderboardContent">' + CoachingUtils.skeletonCard(5) + '</div>';
    _initSegmentedControls();
    _fetchAndRender(forceRefresh);
  }

  function _fetchAndRender(forceRefresh) {
    var contentEl = document.getElementById('leaderboardContent');
    if (!contentEl) return;
    contentEl.innerHTML = CoachingUtils.skeletonCard(5);

    CoachingAPI.getLeaderboard(_currentPeriod, _currentMetric, forceRefresh).then(function (data) {
      contentEl.innerHTML = _buildLeaderboard(data);
    }).catch(function (err) {
      contentEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div>' +
        '<div class="empty-state-text">' + CoachingUtils.escapeHtml(CoachingUtils.getReadableError(err)) + '</div>' +
        '<button class="btn-retry" onclick="LeaderboardView.render(true)">Retry</button></div>';
    });
  }

  function _buildShell() {
    var html = '';

    /* Period Segmented Control */
    html += '<div class="segmented-control" id="periodSegmented">';
    html += '<div class="segmented-indicator" id="periodIndicator"></div>';
    for (var i = 0; i < PERIODS.length; i++) {
      var p = PERIODS[i];
      var active = _currentPeriod === p.key ? ' active' : '';
      html += '<button class="segmented-btn' + active + '" data-segment="period" data-key="' + p.key + '">' + p.label + '</button>';
    }
    html += '</div>';

    /* Metric Segmented Control */
    html += '<div class="segmented-control segmented-scroll" id="metricSegmented">';
    html += '<div class="segmented-indicator" id="metricIndicator"></div>';
    for (var j = 0; j < METRICS.length; j++) {
      var m = METRICS[j];
      var mActive = _currentMetric === m.key ? ' active' : '';
      html += '<button class="segmented-btn' + mActive + '" data-segment="metric" data-key="' + m.key + '">' + m.label + '</button>';
    }
    html += '</div>';

    return html;
  }

  function _initSegmentedControls() {
    _positionIndicator('periodSegmented', 'periodIndicator');
    _positionIndicator('metricSegmented', 'metricIndicator');

    document.querySelectorAll('.segmented-btn[data-segment="period"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _currentPeriod = this.dataset.key;
        _activateBtn('period', this);
        _positionIndicator('periodSegmented', 'periodIndicator');
        _fetchAndRender(true);
      });
    });

    document.querySelectorAll('.segmented-btn[data-segment="metric"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _currentMetric = this.dataset.key;
        _activateBtn('metric', this);
        _positionIndicator('metricSegmented', 'metricIndicator');
        _fetchAndRender(true);
      });
    });
  }

  function _activateBtn(segment, activeBtn) {
    document.querySelectorAll('.segmented-btn[data-segment="' + segment + '"]').forEach(function (b) {
      b.classList.remove('active');
    });
    activeBtn.classList.add('active');
  }

  function _positionIndicator(containerId, indicatorId) {
    var container = document.getElementById(containerId);
    var indicator = document.getElementById(indicatorId);
    if (!container || !indicator) return;

    var activeBtn = container.querySelector('.segmented-btn.active');
    if (!activeBtn) return;

    /* Use requestAnimationFrame to ensure DOM is laid out */
    requestAnimationFrame(function () {
      var containerRect = container.getBoundingClientRect();
      var btnRect = activeBtn.getBoundingClientRect();
      indicator.style.width = btnRect.width + 'px';
      indicator.style.transform = 'translateX(' + (btnRect.left - containerRect.left) + 'px)';
    });
  }

  function _buildLeaderboard(data) {
    var list = data.leaderboard || [];
    if (list.length === 0) {
      return '<div class="empty-state"><div class="empty-state-icon">🏆</div>' +
        '<div class="empty-state-text">No leaderboard data for this period.</div>' +
        '<div class="empty-state-hint">Students need to practice to appear on the leaderboard.</div></div>';
    }

    var html = '';

    /* Podium (top 3) */
    if (list.length >= 3) {
      html += '<div class="podium-section">';
      html += _podiumItem(list[1], 2, 'second');
      html += _podiumItem(list[0], 1, 'first');
      html += _podiumItem(list[2], 3, 'third');
      html += '</div>';
    }

    /* Full Ranked List */
    html += '<div class="card" style="padding:0;overflow:hidden;">';
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      var rankClass = i === 0 ? ' gold' : (i === 1 ? ' silver' : (i === 2 ? ' bronze' : ''));
      html += '<div class="leaderboard-item" onclick="StudentsView.showProfile(\'' + s.uid + '\')" style="cursor:pointer;">';
      html += '<div class="leaderboard-rank' + rankClass + '">' + (i < 3 ? _rankEmoji(i) : s.rank) + '</div>';
      html += '<div class="student-avatar" style="width:36px;height:36px;font-size:var(--font-sm);">' + CoachingUtils.getInitial(s.name || s.email) + '</div>';
      html += '<div class="flex-1" style="min-width:0;">';
      html += '<div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + CoachingUtils.escapeHtml(s.name || s.email);
      html += CoachingUtils.getSubscriptionBadge(s.isPremium, s.isPremiumPlus);
      html += '</div>';
      html += '<div style="font-size:var(--font-xs);color:var(--text-muted);">' + s.accuracy + '% · ' + CoachingUtils.formatSpeed(s.speed) + ' · 🔥' + s.streak + '</div>';
      html += '</div>';
      html += '<div style="font-weight:700;color:var(--accent-primary);white-space:nowrap;">' + _formatMetricValue(s.metricValue) + '</div>';
      html += '</div>';
    }
    html += '</div>';

    html += '<div style="text-align:center;font-size:var(--font-xs);color:var(--text-muted);margin-top:var(--space-lg);">' +
      data.total + ' student' + (data.total !== 1 ? 's' : '') + ' ranked</div>';

    return html;
  }

  function _podiumItem(s, rank, cls) {
    var badge = CoachingUtils.getSubscriptionBadge(s.isPremium, s.isPremiumPlus);
    return '<div class="podium-item">' +
      '<div class="student-avatar podium-avatar-' + cls + '" style="width:44px;height:44px;font-size:var(--font-base);">' + CoachingUtils.getInitial(s.name || s.email) + '</div>' +
      '<div class="podium-name">' + CoachingUtils.escapeHtml(s.name || s.email) + '</div>' +
      (badge ? '<div style="margin-bottom:2px;">' + badge + '</div>' : '') +
      '<div class="podium-bar ' + cls + '">' +
      '<div style="font-size:var(--font-xl);">' + _rankEmoji(rank - 1) + '</div>' +
      '<div class="podium-value">' + _formatMetricValue(s.metricValue) + '</div>' +
      '</div></div>';
  }

  function _rankEmoji(index) {
    var emojis = ['🥇', '🥈', '🥉'];
    return emojis[index] || '';
  }

  function _formatMetricValue(val) {
    if (_currentMetric === 'accuracy') return val + '%';
    if (_currentMetric === 'speed') return val < 999 ? val.toFixed(1) + 's' : '—';
    if (_currentMetric === 'streak') return val + 'd';
    if (_currentMetric === 'consistency') return val + '/100';
    return CoachingUtils.formatNumber(val);
  }

  /* Legacy pill-based API preserved for backward compat */
  function setPeriod(p) {
    _currentPeriod = p;
    render(true);
  }

  function setMetric(m) {
    _currentMetric = m;
    render(true);
  }

  return { render: render, setPeriod: setPeriod, setMetric: setMetric };
})();
