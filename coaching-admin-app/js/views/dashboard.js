/**
 * dashboard.js — Performance Command Center View
 *
 * The main landing view for coaching admins.
 * Shows aggregated metrics, weak topics, top performers,
 * inactive alerts, and recent activity.
 */
var DashboardView = (function () {
  'use strict';

  var _rendered = false;

  function render(forceRefresh) {
    var container = document.getElementById('view-dashboard');
    if (!container) return;

    /* Show skeleton while loading */
    if (!_rendered || forceRefresh) {
      container.innerHTML = _skeletonHtml();
    }

    CoachingAPI.getDashboard(forceRefresh).then(function (data) {
      _rendered = true;
      container.innerHTML = _buildDashboard(data);

      /* Update header with coaching name */
      if (data.coaching && data.coaching.name) {
        CoachingState.set({ coachingName: data.coaching.name });
        var headerTitle = document.getElementById('headerTitle');
        if (headerTitle) headerTitle.textContent = data.coaching.name;
      }
    }).catch(function (err) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div>' +
        '<div class="empty-state-text">' + CoachingUtils.escapeHtml(CoachingUtils.getReadableError(err)) + '</div>' +
        '<button class="btn btn-outline mt-lg" onclick="DashboardView.render(true)">Try Again</button></div>';
    });
  }

  function _buildDashboard(data) {
    var m = data.metrics || {};
    var html = '';

    /* ── Hero Metrics ── */
    html += '<div class="metrics-grid">';
    html += _metricCard(m.activeToday, 'Active Today', '📊', 'accent-emerald');
    html += _metricCard(CoachingUtils.formatAccuracy(m.avgAccuracy), 'Avg Accuracy', '🎯', 'accent-primary');
    html += _metricCard(CoachingUtils.formatSpeed(m.avgSpeed), 'Avg Speed', '⚡', 'accent-cyan');
    html += _metricCard(m.activeStreakUsers, 'On Streaks', '🔥', 'accent-amber');
    html += '</div>';

    /* ── Quick Stats Row ── */
    html += '<div class="card card-compact">';
    html += '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:var(--space-md);">';
    html += '<div><span class="text-secondary" style="font-size:var(--font-xs);">Total Students</span><br><strong>' + CoachingUtils.formatNumber(m.totalStudents) + '</strong></div>';
    html += '<div><span class="text-secondary" style="font-size:var(--font-xs);">Questions Solved</span><br><strong>' + CoachingUtils.formatNumber(m.totalQuestionsSolved) + '</strong></div>';
    html += '<div><span class="text-secondary" style="font-size:var(--font-xs);">Active This Week</span><br><strong>' + CoachingUtils.formatNumber(m.activeThisWeek) + '</strong></div>';
    if (m.premiumUsers > 0 || m.premiumPlusUsers > 0) {
      html += '<div><span class="text-secondary" style="font-size:var(--font-xs);">Premium</span><br><strong>' + (m.premiumUsers + m.premiumPlusUsers) + '</strong></div>';
    }
    html += '</div></div>';

    /* ── Weak Topics ── */
    if (data.weakTopics && data.weakTopics.length > 0) {
      html += '<div class="section-header"><div class="section-title">⚠️ Weak Topics</div></div>';
      html += '<div class="card">';
      for (var i = 0; i < data.weakTopics.length; i++) {
        var t = data.weakTopics[i];
        var color = CoachingUtils.getAccuracyColor(t.accuracy);
        html += '<div class="bar-chart-row">';
        html += '<div class="bar-chart-label">' + CoachingUtils.escapeHtml(CoachingUtils.capitalize(t.topic)) + '</div>';
        html += '<div class="bar-chart-track"><div class="bar-chart-fill ' + color + '" style="width:' + t.accuracy + '%;"></div></div>';
        html += '<div class="bar-chart-value">' + t.accuracy + '%</div>';
        html += '</div>';
      }
      html += '</div>';
    }

    /* ── Top Performers ── */
    if (data.strongestStudents && data.strongestStudents.length > 0) {
      html += '<div class="section-header"><div class="section-title">🏆 Top Performers</div></div>';
      for (var j = 0; j < Math.min(data.strongestStudents.length, 3); j++) {
        var s = data.strongestStudents[j];
        html += _miniStudentCard(s, j + 1);
      }
    }

    /* ── Inactive Alert ── */
    if (data.inactiveStudents && data.inactiveStudents.length > 0) {
      html += '<div class="section-header"><div class="section-title">💤 Inactive Students</div>';
      html += '<div class="section-subtitle">' + data.inactiveStudents.length + ' students with 3+ days inactivity</div></div>';
      for (var k = 0; k < Math.min(data.inactiveStudents.length, 5); k++) {
        var inactive = data.inactiveStudents[k];
        html += '<div class="card card-compact" style="display:flex;align-items:center;gap:var(--space-md);">';
        html += '<div class="student-avatar" style="width:36px;height:36px;font-size:var(--font-sm);">' + CoachingUtils.getInitial(inactive.name || inactive.email) + '</div>';
        html += '<div class="flex-1"><div style="font-weight:500;">' + CoachingUtils.escapeHtml(inactive.name || inactive.email || 'Unknown') + '</div>';
        html += '<div style="font-size:var(--font-xs);color:var(--text-muted);">Last seen ' + CoachingUtils.getRelativeTime(inactive.lastActive) + '</div></div>';
        html += '</div>';
      }
    }

    /* ── Recent Activity ── */
    if (data.recentActivity && data.recentActivity.length > 0) {
      html += '<div class="section-header mt-lg"><div class="section-title">📈 Recent Activity</div></div>';
      html += '<div class="card">';
      for (var l = 0; l < data.recentActivity.length; l++) {
        var act = data.recentActivity[l];
        html += '<div style="display:flex;align-items:center;gap:var(--space-md);padding:var(--space-sm) 0;' +
          (l < data.recentActivity.length - 1 ? 'border-bottom:1px solid var(--border-subtle);' : '') + '">';
        html += '<div style="font-size:var(--font-sm);font-weight:500;flex:1;">' + CoachingUtils.escapeHtml(act.name) + '</div>';
        html += '<div style="font-size:var(--font-xs);color:var(--text-muted);">' + (act.todayAttempted || 0) + ' Qs</div>';
        html += '<div style="font-size:var(--font-xs);color:var(--text-muted);">' + CoachingUtils.getRelativeTime(act.lastActive) + '</div>';
        html += '</div>';
      }
      html += '</div>';
    }

    return html;
  }

  function _metricCard(value, label, icon, accentClass) {
    return '<div class="metric-card ' + accentClass + '">' +
      '<div class="metric-icon">' + icon + '</div>' +
      '<div class="metric-value">' + (value !== undefined && value !== null ? value : '—') + '</div>' +
      '<div class="metric-label">' + label + '</div>' +
      '</div>';
  }

  function _miniStudentCard(s, rank) {
    var rankEmoji = rank === 1 ? '🥇' : (rank === 2 ? '🥈' : '🥉');
    return '<div class="card card-compact" style="display:flex;align-items:center;gap:var(--space-md);cursor:pointer;" onclick="StudentsView.showProfile(\'' + s.uid + '\')">' +
      '<div style="font-size:var(--font-lg);">' + rankEmoji + '</div>' +
      '<div class="student-avatar" style="width:36px;height:36px;font-size:var(--font-sm);">' + CoachingUtils.getInitial(s.name || s.email) + '</div>' +
      '<div class="flex-1"><div style="font-weight:600;">' + CoachingUtils.escapeHtml(s.name || s.email || 'Unknown') + '</div></div>' +
      '<div class="stat-pill accuracy">' + s.accuracy + '%</div>' +
      '</div>';
  }

  function _skeletonHtml() {
    return CoachingUtils.skeletonMetrics() +
      '<div class="skeleton skeleton-card" style="height:60px;"></div>' +
      '<div class="skeleton skeleton-card" style="height:120px;"></div>' +
      CoachingUtils.skeletonCard(3);
  }

  return { render: render };
})();
