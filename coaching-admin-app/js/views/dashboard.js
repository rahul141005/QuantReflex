/**
 * dashboard.js — Performance Command Center View
 *
 * The main landing view for coaching admins.
 * Shows greeting, multi-factor coaching health display, aggregated metrics,
 * weak topics, top performers, inactive alerts, and recent activity.
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
        '<button class="btn-retry" onclick="DashboardView.render(true)">Try Again</button></div>';
    });
  }

  function _buildDashboard(data) {
    var m = data.metrics || {};
    var html = '';

    /* ── Hero Greeting ── */
    html += _buildGreetingHero(data);

    /* ── Coaching Health Display (Multi-Factor) ── */
    html += _buildHealthDisplay(m);

    /* ── Quick Actions ── */
    html += '<div class="section-header"><div class="section-title">⚡ Quick Actions</div></div>';
    html += '<div style="display:flex; gap:var(--space-sm); margin-bottom:var(--space-lg); overflow-x:auto; padding-bottom:var(--space-xs);">';
    html += '<button class="btn btn-sm" onclick="app.navigate(\'notices\')" style="background:var(--bg-elevated); border:1px solid var(--border-default); white-space:nowrap;">📢 Send Notice</button>';
    html += '<button class="btn btn-sm" onclick="app.navigate(\'students\')" style="background:var(--bg-elevated); border:1px solid var(--border-default); white-space:nowrap;">👥 View Roster</button>';
    html += '<button class="btn btn-sm" onclick="app.navigate(\'leaderboard\')" style="background:var(--bg-elevated); border:1px solid var(--border-default); white-space:nowrap;">🏆 Leaderboard</button>';
    html += '</div>';

    /* ── Hero Metrics Grid ── */
    html += '<div class="metrics-grid">';
    html += _metricCard(m.activeToday, 'Active Today', '🟢', 'accent-emerald');
    html += _metricCard((m.premiumUsers || 0) + '/' + m.totalStudents, 'Premium Users', '💎', 'accent-primary');
    html += _metricCard(m.activeThisWeek, 'Active This Week', '📈', 'accent-cyan');
    html += _metricCard(data.inactiveStudents ? data.inactiveStudents.length : 0, 'At-Risk (Inactive)', '⚠️', 'accent-red');
    html += '</div>';

    /* ── Weak Topics ── */
    if (data.weakTopics && data.weakTopics.length > 0) {
      html += '<div class="section-header"><div class="section-title">⚠️ Weak Topics</div></div>';
      html += '<div class="card">';
      for (var i = 0; i < data.weakTopics.length; i++) {
        var t = data.weakTopics[i];
        var color = CoachingUtils.getAccuracyColor(t.accuracy);
        html += '<div class="bar-chart-row" style="cursor:pointer; transition:background 0.2s; border-radius:4px; padding:2px;" onclick="NoticesView.targetTopic(\'' + t.topic + '\')" onmouseover="this.style.background=\'var(--bg-elevated)\'" onmouseout="this.style.background=\'transparent\'">';
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
        html += '<button class="btn btn-sm" style="padding:6px 12px;font-size:var(--font-xs);background:var(--bg-elevated);border:1px solid var(--border-default);color:var(--text-primary);border-radius:var(--radius-sm);cursor:pointer;" onclick="NoticesView.sendNudge(\'' + inactive.uid + '\', \'' + CoachingUtils.escapeHtml(inactive.name || inactive.email || 'Student') + '\')">🔔 Nudge</button>';
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
        html += '<div class="student-avatar" style="width:28px;height:28px;font-size:0.65rem;">' + CoachingUtils.getInitial(act.name) + '</div>';
        html += '<div style="font-size:var(--font-sm);font-weight:500;flex:1;">' + CoachingUtils.escapeHtml(act.name) + '</div>';
        html += '<div style="font-size:var(--font-xs);color:var(--text-muted);">' + (act.todayAttempted || 0) + ' Qs</div>';
        html += '<div style="font-size:var(--font-xs);color:var(--text-muted);">' + CoachingUtils.getRelativeTime(act.lastActive) + '</div>';
        html += '</div>';
      }
      html += '</div>';
    }

    return html;
  }

  /* ── Greeting Hero Section ── */
  function _buildGreetingHero(data) {
    var hour = new Date().getHours();
    var greeting = hour < 12 ? 'Good morning' : (hour < 17 ? 'Good afternoon' : 'Good evening');
    var dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
    var name = (data.coaching && data.coaching.name) || 'Coach';

    var html = '<div class="dashboard-hero">';
    html += '<div class="dashboard-hero-greeting">';
    html += '<div class="dashboard-hero-date">' + dateStr + '</div>';
    html += '<div class="dashboard-hero-text">' + greeting + ' 👋</div>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  /* ── Multi-Factor Coaching Health Display ── */
  function _buildHealthDisplay(m) {
    var totalStudents = m.totalStudents || 0;
    var activeThisWeek = m.activeThisWeek || 0;
    var avgAccuracy = m.avgAccuracy || 0;

    /* Calculate engagement rate */
    var engagementPct = totalStudents > 0 ? Math.round((activeThisWeek / totalStudents) * 100) : 0;

    /* Accuracy trend (compare to a baseline of 60%) */
    var accuracyTrend = avgAccuracy >= 70 ? 'strong' : (avgAccuracy >= 50 ? 'moderate' : 'needs-attention');
    var accuracyLabel = avgAccuracy >= 70 ? 'Strong' : (avgAccuracy >= 50 ? 'Moderate' : 'Needs Focus');

    /* Retention label */
    var retentionLabel = engagementPct >= 70 ? 'Excellent' : (engagementPct >= 40 ? 'Good' : 'Low');
    var retentionStatus = engagementPct >= 70 ? 'strong' : (engagementPct >= 40 ? 'moderate' : 'needs-attention');

    var html = '<div class="health-display">';
    html += '<div class="health-display-title">📊 Coaching Health</div>';
    html += '<div class="health-factors">';

    /* Factor 1: Engagement */
    html += _healthFactor('👥 Engagement', engagementPct + '%', engagementPct >= 60 ? 'strong' : (engagementPct >= 30 ? 'moderate' : 'needs-attention'),
      activeThisWeek + '/' + totalStudents + ' active this week');

    /* Factor 2: Accuracy Trend */
    html += _healthFactor('🎯 Accuracy', avgAccuracy + '%', accuracyTrend, accuracyLabel);

    /* Factor 3: Retention */
    html += _healthFactor('📈 Retention', retentionLabel, retentionStatus,
      engagementPct + '% weekly return rate');

    html += '</div></div>';
    return html;
  }

  function _healthFactor(title, value, status, subtitle) {
    var statusClass = 'health-factor-' + status;
    return '<div class="health-factor ' + statusClass + '">' +
      '<div class="health-factor-header">' +
      '<span class="health-factor-title">' + title + '</span>' +
      '<span class="health-factor-value">' + value + '</span>' +
      '</div>' +
      '<div class="health-factor-bar"><div class="health-factor-fill"></div></div>' +
      '<div class="health-factor-subtitle">' + subtitle + '</div>' +
      '</div>';
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
    return '<div class="skeleton skeleton-card" style="height:64px;margin-bottom:var(--space-lg);"></div>' +
      '<div class="skeleton skeleton-card" style="height:120px;margin-bottom:var(--space-lg);"></div>' +
      CoachingUtils.skeletonMetrics() +
      '<div class="skeleton skeleton-card" style="height:60px;"></div>' +
      '<div class="skeleton skeleton-card" style="height:120px;"></div>' +
      CoachingUtils.skeletonCard(3);
  }

  return { render: render };
})();
