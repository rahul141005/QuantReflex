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
    
    /* ── Header & Profile ── */
    html += '<div style="display:flex;align-items:center;gap:var(--space-lg);margin-bottom:var(--space-md);">';
    html += '<div class="student-avatar profile-avatar-ring" style="width:64px;height:64px;font-size:var(--font-2xl);">' + CoachingUtils.getInitial(p.name || p.email) + '</div>';
    html += '<div class="flex-1">';
    html += '<div style="font-size:var(--font-xl);font-weight:700;">' + CoachingUtils.escapeHtml(p.name || p.email || 'Unknown') + '</div>';
    if (p.email) html += '<div style="font-size:var(--font-sm);color:var(--text-tertiary);">' + CoachingUtils.escapeHtml(p.email) + '</div>';
    html += '<div style="margin-top:var(--space-xs);display:flex;gap:var(--space-xs);flex-wrap:wrap;">';
    html += CoachingUtils.getEngagementBadge(p.engagementLevel);
    html += CoachingUtils.getSubscriptionBadge(p.plan, p.isTrial);
    html += '</div></div></div>';
    
    /* Action Row */
    html += '<div style="display:flex; gap:var(--space-sm); margin-bottom:var(--space-xl);">';
    html += '<button class="btn btn-sm flex-1" onclick="NoticesView.sendNudge(\'' + p.uid + '\', \'' + CoachingUtils.escapeHtml(p.name || p.email || 'Student') + '\')" style="background:var(--bg-elevated); border:1px solid var(--border-default); color:var(--text-primary); cursor:pointer;">🔔 Direct Message</button>';
    html += '<button class="btn btn-sm flex-1" onclick="window.print()" style="background:var(--bg-elevated); border:1px solid var(--border-default); color:var(--text-primary); cursor:pointer;">📄 Download Report</button>';
    html += '</div>';

    /* ── Performance Analytics ── */
    html += '<div class="section-header"><div class="section-title">📊 Performance Analytics</div></div>';
    var consistencyScore = CoachingUtils.getConsistencyScore({
      streak: s.dailyStreak,
      totalAttempted: s.totalAttempted,
      accuracy: s.accuracy
    });
    html += '<div class="metrics-grid" style="margin-bottom:var(--space-xl);">';
    html += _miniMetric(CoachingUtils.formatAccuracy(s.accuracy), 'Lifetime Accuracy', 'accent-emerald');
    html += _miniMetric(CoachingUtils.formatSpeed(s.avgSpeed), 'Average Speed', 'accent-cyan');
    html += _miniMetric(s.dailyStreak + 'd', 'Active Streak ' + CoachingUtils.getStreakEmoji(s.dailyStreak), 'accent-amber');
    html += _miniMetric(consistencyScore + '%', 'Consistency Score', 'accent-violet');
    html += '</div>';

    /* ── Topic Analysis ── */
    if (data.categoryPerformance && data.categoryPerformance.length > 0) {
      html += '<div class="section-header"><div class="section-title">🎯 Topic Analysis</div></div>';
      html += '<div class="card mb-lg">';
      
      // Separate into strengths and weaknesses (threshold 60%)
      var strengths = data.categoryPerformance.filter(function(c) { return c.accuracy >= 60; });
      var weaknesses = data.categoryPerformance.filter(function(c) { return c.accuracy < 60; });

      if (weaknesses.length > 0) {
        html += '<div style="font-weight:600; color:var(--text-secondary); font-size:var(--font-xs); text-transform:uppercase; margin-bottom:var(--space-sm);">Needs Attention</div>';
        for (var w = 0; w < weaknesses.length; w++) {
          var wCat = weaknesses[w];
          html += '<div class="bar-chart-row" style="cursor:pointer; transition:background 0.2s; border-radius:4px; padding:2px;" onclick="NoticesView.targetTopic(\'' + wCat.topic + '\')" onmouseover="this.style.background=\'var(--bg-elevated)\'" onmouseout="this.style.background=\'transparent\'">';
          html += '<div class="bar-chart-label">' + CoachingUtils.escapeHtml(CoachingUtils.capitalize(wCat.topic)) + '</div>';
          html += '<div class="bar-chart-track"><div class="bar-chart-fill ' + CoachingUtils.getAccuracyColor(wCat.accuracy) + '" style="width:' + wCat.accuracy + '%;"></div></div>';
          html += '<div class="bar-chart-value">' + wCat.accuracy + '%</div>';
          html += '</div>';
        }
        if (strengths.length > 0) html += '<hr style="border:0; border-top:1px solid var(--border-subtle); margin:var(--space-md) 0;">';
      }

      if (strengths.length > 0) {
        html += '<div style="font-weight:600; color:var(--text-secondary); font-size:var(--font-xs); text-transform:uppercase; margin-bottom:var(--space-sm);">Strong Areas</div>';
        for (var st = 0; st < strengths.length; st++) {
          var sCat = strengths[st];
          html += '<div class="bar-chart-row">';
          html += '<div class="bar-chart-label">' + CoachingUtils.escapeHtml(CoachingUtils.capitalize(sCat.topic)) + '</div>';
          html += '<div class="bar-chart-track"><div class="bar-chart-fill ' + CoachingUtils.getAccuracyColor(sCat.accuracy) + '" style="width:' + sCat.accuracy + '%;"></div></div>';
          html += '<div class="bar-chart-value">' + sCat.accuracy + '%</div>';
          html += '</div>';
        }
      }
      
      html += '</div>';
    }

    /* ── Recent Activity & Retention ── */
    html += '<div class="section-header"><div class="section-title">📈 Activity & Retention</div></div>';
    
    // Duel Stats inline
    if (data.duelStats && (data.duelStats.wins > 0 || data.duelStats.losses > 0 || data.duelStats.draws > 0)) {
      html += '<div class="card card-compact mb-md" style="display:flex; justify-content:space-around; text-align:center;">';
      html += '<div><span class="text-emerald" style="font-size:var(--font-xl);font-weight:800;">' + data.duelStats.wins + '</span><br><span class="text-secondary" style="font-size:var(--font-xs);">Duel Wins</span></div>';
      html += '<div><span class="text-red" style="font-size:var(--font-xl);font-weight:800;">' + data.duelStats.losses + '</span><br><span class="text-secondary" style="font-size:var(--font-xs);">Duel Losses</span></div>';
      html += '<div><span class="text-secondary" style="font-size:var(--font-xl);font-weight:800;">' + data.duelStats.draws + '</span><br><span class="text-secondary" style="font-size:var(--font-xs);">Duel Draws</span></div>';
      html += '</div>';
    }

    if (data.recentSessions && data.recentSessions.length > 0) {
      html += '<div class="card mb-lg">';
      html += '<div class="card-title">Recent Practice Sessions</div>';
      for (var j = 0; j < data.recentSessions.length; j++) {
        var sess = data.recentSessions[j];
        var sessAcc = sess.total > 0 ? Math.round((sess.score / sess.total) * 100) : 0;
        html += '<div style="display:flex;justify-content:space-between;padding:var(--space-sm) 0;border-bottom:1px solid var(--border-subtle);">';
        html += '<div><div style="font-weight:500;">' + CoachingUtils.escapeHtml(CoachingUtils.capitalize(sess.category)) + '</div><div style="font-size:var(--font-xs);color:var(--text-muted);">' + CoachingUtils.getRelativeTime(sess.timestamp) + '</div></div>';
        html += '<div style="text-align:right;"><div style="font-weight:600;color:var(--accent-primary);">' + sessAcc + '%</div><div style="font-size:var(--font-xs);color:var(--text-muted);">' + sess.score + '/' + sess.total + '</div></div>';
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
