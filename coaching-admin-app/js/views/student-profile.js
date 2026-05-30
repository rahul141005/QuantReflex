/**
 * student-profile.js — Student 360° Profile View
 *
 * Rendered inside the bottom sheet.
 * Shows full student details: stats, category performance,
 * speed trend, streak, sessions, duels, engagement.
 */
var StudentProfileView = (function () {
  'use strict';

  /**
   * Build the full profile HTML from API data.
   * @param {object} data — response from /api/coaching/students?action=details
   * @returns {string} HTML string
   */
  function buildProfileHtml(data) {
    var p = data.profile || {};
    var s = data.stats || {};
    var html = '';

    /* ── Header ── */
    html += '<div style="display:flex;align-items:center;gap:var(--space-lg);margin-bottom:var(--space-xl);">';
    html += '<div class="student-avatar profile-avatar-ring" style="width:56px;height:56px;font-size:var(--font-xl);">' + CoachingUtils.getInitial(p.name || p.email) + '</div>';
    html += '<div class="flex-1">';
    html += '<div style="font-size:var(--font-xl);font-weight:700;">' + CoachingUtils.escapeHtml(p.name || p.email || 'Unknown') + '</div>';
    if (p.email) html += '<div style="font-size:var(--font-sm);color:var(--text-tertiary);">' + CoachingUtils.escapeHtml(p.email) + '</div>';
    html += '<div style="margin-top:var(--space-xs);display:flex;gap:var(--space-xs);flex-wrap:wrap;">' + CoachingUtils.getEngagementBadge(p.engagementLevel);
    html += CoachingUtils.getSubscriptionBadge(p.isPremium, p.isPremiumPlus);
    html += '</div></div></div>';

    /* ── Quick Stats ── */
    var consistencyScore = CoachingUtils.getConsistencyScore({
      streak: s.dailyStreak,
      totalAttempted: s.totalAttempted,
      accuracy: s.accuracy
    });
    html += '<div class="metrics-grid" style="margin-bottom:var(--space-xl);">';
    html += _miniMetric(CoachingUtils.formatAccuracy(s.accuracy), 'Accuracy', 'accent-emerald');
    html += _miniMetric(CoachingUtils.formatSpeed(s.avgSpeed), 'Avg Speed', 'accent-cyan');
    html += _miniMetric(s.dailyStreak + 'd', 'Streak ' + CoachingUtils.getStreakEmoji(s.dailyStreak), 'accent-amber');
    html += _miniMetric(consistencyScore + '/100', '🧠 Consistency', 'accent-violet');
    html += '</div>';

    /* ── Today's Progress ── */
    if (s.todayAttempted > 0) {
      html += '<div class="card card-compact mb-lg">';
      html += '<div class="card-title">Today\'s Progress</div>';
      html += '<div style="display:flex;gap:var(--space-xl);">';
      html += '<div><span class="text-secondary" style="font-size:var(--font-xs);">Attempted</span><br><strong>' + s.todayAttempted + '</strong></div>';
      html += '<div><span class="text-secondary" style="font-size:var(--font-xs);">Correct</span><br><strong>' + s.todayCorrect + '</strong></div>';
      var todayAcc = s.todayAttempted > 0 ? Math.round((s.todayCorrect / s.todayAttempted) * 100) : 0;
      html += '<div><span class="text-secondary" style="font-size:var(--font-xs);">Accuracy</span><br><strong class="text-' + (todayAcc >= 70 ? 'emerald' : todayAcc >= 40 ? 'amber' : 'red') + '">' + todayAcc + '%</strong></div>';
      html += '</div></div>';
    }

    /* ── Category Performance ── */
    if (data.categoryPerformance && data.categoryPerformance.length > 0) {
      html += '<div class="card mb-lg">';
      html += '<div class="card-title">Topic Performance</div>';
      for (var i = 0; i < data.categoryPerformance.length; i++) {
        var cat = data.categoryPerformance[i];
        var color = CoachingUtils.getAccuracyColor(cat.accuracy);
        html += '<div class="bar-chart-row">';
        html += '<div class="bar-chart-label">' + CoachingUtils.escapeHtml(CoachingUtils.capitalize(cat.topic)) + '</div>';
        html += '<div class="bar-chart-track"><div class="bar-chart-fill ' + color + '" style="width:' + cat.accuracy + '%;"></div></div>';
        html += '<div class="bar-chart-value">' + cat.accuracy + '%</div>';
        html += '</div>';
      }
      html += '</div>';
    }

    /* ── Speed Trend ── */
    if (data.speedTrend && data.speedTrend.length > 2) {
      html += '<div class="card mb-lg">';
      html += '<div class="card-title">Speed Trend (last ' + data.speedTrend.length + ')</div>';
      html += _miniSparkline(data.speedTrend);
      html += '</div>';
    }

    /* ── Duel Stats ── */
    if (data.duelStats && (data.duelStats.wins > 0 || data.duelStats.losses > 0 || data.duelStats.draws > 0)) {
      html += '<div class="card card-compact mb-lg">';
      html += '<div class="card-title">Duel Record</div>';
      html += '<div style="display:flex;gap:var(--space-xl);">';
      html += '<div><span class="text-emerald" style="font-size:var(--font-2xl);font-weight:800;">' + data.duelStats.wins + '</span><br><span class="text-secondary" style="font-size:var(--font-xs);">Wins</span></div>';
      html += '<div><span class="text-red" style="font-size:var(--font-2xl);font-weight:800;">' + data.duelStats.losses + '</span><br><span class="text-secondary" style="font-size:var(--font-xs);">Losses</span></div>';
      html += '<div><span class="text-secondary" style="font-size:var(--font-2xl);font-weight:800;">' + data.duelStats.draws + '</span><br><span class="text-secondary" style="font-size:var(--font-xs);">Draws</span></div>';
      html += '</div></div>';
    }

    /* ── Recent Sessions ── */
    if (data.recentSessions && data.recentSessions.length > 0) {
      html += '<div class="card mb-lg">';
      html += '<div class="card-title">Recent Sessions</div>';
      for (var j = 0; j < data.recentSessions.length; j++) {
        var sess = data.recentSessions[j];
        var sessAcc = sess.total > 0 ? Math.round((sess.score / sess.total) * 100) : 0;
        html += '<div style="display:flex;align-items:center;gap:var(--space-md);padding:var(--space-sm) 0;' +
          (j < data.recentSessions.length - 1 ? 'border-bottom:1px solid var(--border-subtle);' : '') + '">';
        html += '<div style="font-size:var(--font-sm);flex:1;">';
        html += '<div style="font-weight:500;">' + CoachingUtils.escapeHtml(CoachingUtils.capitalize(sess.mode)) + '</div>';
        html += '<div style="font-size:var(--font-xs);color:var(--text-muted);">' + CoachingUtils.escapeHtml(CoachingUtils.capitalize(sess.category)) + '</div>';
        html += '</div>';
        html += '<div class="stat-pill accuracy">' + sess.score + '/' + sess.total + '</div>';
        html += '<div style="font-size:var(--font-xs);color:var(--text-muted);">' + CoachingUtils.getRelativeTime(sess.timestamp) + '</div>';
        html += '</div>';
      }
      html += '</div>';
    }

    /* ── Member Since ── */
    html += '<div style="text-align:center;font-size:var(--font-xs);color:var(--text-muted);padding:var(--space-lg) 0;">';
    html += 'Member since ' + CoachingUtils.formatDate(p.createdAt);
    html += '</div>';

    return html;
  }

  function _miniMetric(value, label, accent) {
    return '<div class="metric-card ' + accent + '">' +
      '<div class="metric-value" style="font-size:var(--font-xl);">' + (value || '—') + '</div>' +
      '<div class="metric-label">' + label + '</div></div>';
  }

  /**
   * Simple inline SVG sparkline for speed trend.
   */
  function _miniSparkline(values) {
    if (!values || values.length < 2) return '';
    var width = 280;
    var height = 50;
    var maxVal = Math.max.apply(null, values);
    var minVal = Math.min.apply(null, values);
    var range = maxVal - minVal || 1;
    var stepX = width / (values.length - 1);
    var points = [];
    for (var i = 0; i < values.length; i++) {
      var x = Math.round(i * stepX);
      var y = Math.round(height - ((values[i] - minVal) / range) * (height - 10) - 5);
      points.push(x + ',' + y);
    }
    return '<svg viewBox="0 0 ' + width + ' ' + height + '" style="width:100%;height:50px;" preserveAspectRatio="none">' +
      '<polyline points="' + points.join(' ') + '" fill="none" stroke="var(--accent-cyan)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>' +
      '<div style="display:flex;justify-content:space-between;font-size:var(--font-xs);color:var(--text-muted);">' +
      '<span>Oldest</span><span>Fastest: ' + minVal.toFixed(1) + 's</span><span>Recent</span></div>';
  }

  return { buildProfileHtml: buildProfileHtml };
})();
