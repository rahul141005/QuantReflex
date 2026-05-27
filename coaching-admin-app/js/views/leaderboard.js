/**
 * leaderboard.js — Coaching Leaderboard View
 *
 * Gamified leaderboard with period tabs, metric selector, podium, and ranked list.
 */
var LeaderboardView = (function () {
  'use strict';

  var _currentPeriod = 'weekly';
  var _currentMetric = 'accuracy';

  function render(forceRefresh) {
    var container = document.getElementById('view-leaderboard');
    if (!container) return;

    container.innerHTML = _buildShell() + '<div id="leaderboardContent">' + CoachingUtils.skeletonCard(5) + '</div>';

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
        '<div class="empty-state-text">' + CoachingUtils.escapeHtml(CoachingUtils.getReadableError(err)) + '</div></div>';
    });
  }

  function _buildShell() {
    var html = '';

    /* Period Tabs */
    html += '<div class="tab-group">';
    html += _periodPill('daily', 'Daily');
    html += _periodPill('weekly', 'Weekly');
    html += _periodPill('monthly', 'Monthly');
    html += _periodPill('allTime', 'All Time');
    html += '</div>';

    /* Metric Selector */
    html += '<div class="tab-group">';
    html += _metricPill('accuracy', '🎯 Accuracy');
    html += _metricPill('speed', '⚡ Speed');
    html += _metricPill('streak', '🔥 Streak');
    html += _metricPill('questions', '📝 Questions');
    html += _metricPill('xp', '⭐ XP');
    html += '</div>';

    return html;
  }

  function _periodPill(key, label) {
    var active = _currentPeriod === key ? ' active' : '';
    return '<button class="tab-pill' + active + '" onclick="LeaderboardView.setPeriod(\'' + key + '\')">' + label + '</button>';
  }

  function _metricPill(key, label) {
    var active = _currentMetric === key ? ' active' : '';
    return '<button class="tab-pill' + active + '" onclick="LeaderboardView.setMetric(\'' + key + '\')">' + label + '</button>';
  }

  function _buildLeaderboard(data) {
    var list = data.leaderboard || [];
    if (list.length === 0) {
      return '<div class="empty-state"><div class="empty-state-icon">🏆</div>' +
        '<div class="empty-state-text">No leaderboard data for this period.</div>' +
        '<div class="empty-state-hint">Students need to be active to appear here.</div></div>';
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

    /* Full List */
    html += '<div class="card" style="padding:0;overflow:hidden;">';
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      var rankClass = i === 0 ? ' gold' : (i === 1 ? ' silver' : (i === 2 ? ' bronze' : ''));
      html += '<div class="leaderboard-item" onclick="StudentsView.showProfile(\'' + s.uid + '\')" style="cursor:pointer;">';
      html += '<div class="leaderboard-rank' + rankClass + '">' + (i < 3 ? _rankEmoji(i) : s.rank) + '</div>';
      html += '<div class="student-avatar" style="width:36px;height:36px;font-size:var(--font-sm);">' + CoachingUtils.getInitial(s.name || s.email) + '</div>';
      html += '<div class="flex-1" style="min-width:0;">';
      html += '<div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + CoachingUtils.escapeHtml(s.name || s.email) + '</div>';
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
    return '<div class="podium-item">' +
      '<div class="student-avatar" style="width:40px;height:40px;font-size:var(--font-base);">' + CoachingUtils.getInitial(s.name || s.email) + '</div>' +
      '<div class="podium-name">' + CoachingUtils.escapeHtml(s.name || s.email) + '</div>' +
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
    return CoachingUtils.formatNumber(val);
  }

  function setPeriod(p) {
    _currentPeriod = p;
    var container = document.getElementById('view-leaderboard');
    if (container) {
      container.innerHTML = _buildShell() + '<div id="leaderboardContent">' + CoachingUtils.skeletonCard(5) + '</div>';
      _fetchAndRender(true);
    }
  }

  function setMetric(m) {
    _currentMetric = m;
    var container = document.getElementById('view-leaderboard');
    if (container) {
      container.innerHTML = _buildShell() + '<div id="leaderboardContent">' + CoachingUtils.skeletonCard(5) + '</div>';
      _fetchAndRender(true);
    }
  }

  return { render: render, setPeriod: setPeriod, setMetric: setMetric };
})();
