/**
 * dashboard.js — Speed Training Control Center home (ADR-028).
 *
 * Answers in <10s: are students practicing? · how fast are they (now)? · who needs attention?
 * Everything here is REAL today (no history dependency): current avg speed, active counts, at-risk
 * queue, weak topics, premium. The speed TREND lives in Performance (it needs accrued history).
 */
var DashboardView = (function () {
  'use strict';

  var U = CoachingUtils;

  function render(forceRefresh) {
    var root = document.getElementById('view-dashboard');
    if (!root) return;
    root.innerHTML = '<div class="view-pad">' + U.skeletonMetrics() + U.skeletonCard(3) + '</div>';

    Promise.all([
      CoachingAPI.getDashboard(forceRefresh),
      CoachingAPI.getCoachingMetrics(forceRefresh).catch(function () { return { days: {} }; }),
      CoachingAPI.getPerformance(forceRefresh).catch(function () { return {}; })   // for the week-over-week participation delta (Q5)
    ]).then(function (res) {
      _paint(root, res[0] || {}, res[1] || { days: {} }, res[2] || {});
    }).catch(function (err) {
      root.innerHTML = '<div class="view-pad"><div class="empty-state">' +
        '<div class="empty-state-icon">' + U.icon('alert', 28) + '</div>' +
        '<div class="empty-state-text">' + U.escapeHtml(U.getReadableError(err)) + '</div>' +
        '<button class="btn btn-outline btn-sm mt-md" onclick="DashboardView.render(true)">Retry</button>' +
        '</div></div>';
    });
  }

  function _paint(root, data, rollup, perf) {
    var m = data.metrics || {};
    var inactive = data.inactiveStudents || [];
    var weak = data.weakTopics || [];
    var strongest = data.strongestStudents || [];     // discarded before V4
    var recent = data.recentActivity || [];           // discarded before V4
    var improvers = data.topImprovers || [];          // session-improvement leaders (ADR-030)
    var total = m.totalStudents || 0;
    var part = (perf && perf.participation) || {};         // {activeThisWeek, activeLastWeek, change}
    var accTrend = (perf && perf.accuracyTrend) || {};      // {thisWeek, lastWeek, change}

    /* ── SNAPSHOT: speed hero + 4 vitals ── */
    var speedStr = (m.avgSpeed && m.avgSpeed > 0) ? m.avgSpeed.toFixed(1) : '—';
    var days = (rollup && rollup.days) || {};
    var dayKeys = Object.keys(days).sort();
    var fastest = strongest.length ? strongest.reduce(function (a, b) { return (b.speed > 0 && (a == null || b.speed < a.speed)) ? b : a; }, null) : null;
    var heroContext = (fastest && fastest.speed > 0)
      ? 'Fastest: ' + U.escapeHtml(U.truncate(fastest.name, 18)) + ' at ' + fastest.speed.toFixed(1) + 's'
      : 'Average solving speed · lower is faster';

    var hero =
      '<div class="speed-hero" role="button" tabindex="0" onclick="CoachingApp.navigateTo(\'performance\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();CoachingApp.navigateTo(\'performance\');}" aria-label="Open Performance — view speed trend">' +
        '<div style="flex:1;">' +
          '<div class="speed-hero-eyebrow">' + U.icon('bolt', 15) + ' Coaching speed</div>' +
          '<div><span class="speed-hero-num">' + speedStr + '</span> <span class="speed-hero-unit">s/question</span></div>' +
          '<div class="speed-hero-label">' + heroContext + '</div>' +
        '</div>' +
      '</div>';

    function metric(label, value, iconName, accent, extra) {
      return '<div class="metric-card ' + (accent || '') + '">' +
        '<div class="metric-icon">' + U.icon(iconName, 18) + '</div>' +
        '<div class="metric-value">' + value + '</div>' +
        '<div class="metric-label">' + label + (extra ? ' ' + extra : '') + '</div>' +
      '</div>';
    }
    var attnTotal = (m.inactiveCount != null ? m.inactiveCount : inactive.length);
    var grid = '<div class="metrics-grid">' +
      metric('Active today', (m.activeToday || 0) + (total ? ' / ' + total : ''), 'users', 'accent-emerald') +
      metric('Active this week', (m.activeThisWeek || 0) + (total ? ' / ' + total : ''), 'activity', 'accent-primary', part.change != null ? U.deltaBadge(part.change, false) : '') +
      metric('Need attention', String(attnTotal), 'alert', 'accent-amber') +
      metric('Avg accuracy', (m.avgAccuracy != null ? m.avgAccuracy + '%' : '—'), 'target', 'accent-cyan', accTrend.change != null ? U.deltaBadge(accTrend.change, false) : '') +
    '</div>';

    /* ── MOMENTUM: this week vs last (honest — real WoW + speed teaser) ── */
    function momentumStat(label, valueHtml) {
      return '<div class="momentum-stat"><div class="momentum-stat-val">' + valueHtml + '</div><div class="momentum-stat-label">' + label + '</div></div>';
    }
    var accThisHtml = (accTrend.thisWeek != null) ? accTrend.thisWeek + '%' : '—';
    var partThisHtml = (part.activeThisWeek != null) ? String(part.activeThisWeek) : '—';
    var speedTeaser;
    if (dayKeys.length >= 7) {
      var latest = days[dayKeys[dayKeys.length - 1]];
      var weekAgo = days[dayKeys[dayKeys.length - 7]];
      if (latest && weekAgo && weekAgo.avgSpeed > 0 && latest.avgSpeed > 0) {
        var spct = ((latest.avgSpeed - weekAgo.avgSpeed) / weekAgo.avgSpeed) * 100;
        speedTeaser = momentumStat('Speed vs last week', U.deltaBadge(spct, true) || '±0%');
      } else {
        speedTeaser = momentumStat('Speed trend', '<span class="muted">—</span>');
      }
    } else {
      var rem = Math.max(0, 7 - dayKeys.length);
      speedTeaser = momentumStat('Speed trend', '<span class="muted">' + rem + 'd</span>');
    }
    var momentum = '<div class="section-title">Momentum <span class="section-sub">this week vs last</span></div>' +
      '<div class="momentum-grid">' +
        momentumStat('Accuracy ' + (accTrend.change != null ? U.deltaBadge(accTrend.change, false) : ''), accThisHtml) +
        momentumStat('Active students ' + (part.change != null ? U.deltaBadge(part.change, false) : ''), partThisHtml) +
        speedTeaser +
      '</div>';

    /* ── ACTION REQUIRED: at-risk queue + weak topics ── */
    var attn = '<div class="section-title">Action required</div>';
    attn += '<div class="section-label">Students needing a nudge</div>';
    if (!inactive.length) {
      attn += '<div class="empty-state"><div class="empty-state-icon">' + U.icon('check', 28) + '</div>' +
        '<div class="empty-state-text">Everyone\'s been practicing recently.</div>' +
        '<div class="empty-state-hint">At-risk students (no practice in 3+ days) appear here.</div></div>';
    } else {
      var shown = Math.min(6, inactive.length);
      attn += inactive.slice(0, 6).map(function (s) {
        var name = s.name || s.uid;
        var safeName = (name + '').replace(/'/g, '');
        return '<div class="list-row">' +
          '<div class="list-row-main">' +
            '<div class="list-row-title">' + U.escapeHtml(name) + '</div>' +
            '<div class="list-row-sub">Last seen ' + U.escapeHtml(U.getRelativeTime(s.lastActive)) + '</div>' +
          '</div>' +
          '<button class="btn btn-sm btn-outline" onclick="EngagementView.nudgeStudent(\'' + U.escapeHtml(s.uid) + '\',\'' + U.escapeHtml(safeName) + '\')">Nudge</button>' +
        '</div>';
      }).join('');
      if (attnTotal > shown) {
        attn += '<div class="list-row-sub muted text-center mt-sm">Showing ' + shown + ' of ' + attnTotal + ' — open Students to see the rest.</div>';
      }
    }
    attn += '<div class="section-label mt-md">Weak topics</div>';
    if (weak.length) {
      attn += weak.slice(0, 5).map(function (t) {
        var acc = t.accuracy || 0;
        var color = acc >= 70 ? 'var(--accent-emerald)' : (acc >= 50 ? 'var(--accent-amber)' : 'var(--accent-red)');
        var safeTopic = (t.topic + '').replace(/'/g, '');
        return '<div class="bar-chart-row" role="button" tabindex="0" onclick="EngagementView.nudgeTopic(\'' + U.escapeHtml(safeTopic) + '\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();EngagementView.nudgeTopic(\'' + U.escapeHtml(safeTopic) + '\');}" aria-label="Nudge students weak in ' + U.escapeHtml(t.topic) + '">' +
          '<div class="bar-chart-label">' + U.escapeHtml(U.capitalize(t.topic)) + '</div>' +
          '<div class="bar-chart-track"><div class="bar-chart-fill" style="width:' + acc + '%;background:' + color + ';"></div></div>' +
          '<div class="bar-chart-value">' + acc + '%</div>' +
        '</div>';
      }).join('');
    } else {
      attn += '<div class="empty-state"><div class="empty-state-text">Not enough practice yet to spot weak topics.</div>' +
        '<div class="empty-state-hint">Topics with 5+ attempts across your students appear here.</div></div>';
    }

    /* ── COACHING WINS: celebrate real progress (all from already-fetched data) ── */
    function winRow(iconName, name, valueHtml) {
      return '<div class="list-row list-row-tight">' +
        '<div class="list-row-main d-flex" style="align-items:center;gap:var(--space-sm);">' +
          '<span class="win-ic">' + U.icon(iconName, 16) + '</span>' +
          '<div class="list-row-title">' + U.escapeHtml(U.truncate(name, 22)) + '</div>' +
        '</div>' +
        '<div class="win-val">' + valueHtml + '</div>' +
      '</div>';
    }
    var wins = '<div class="section-title">Coaching wins</div>';
    var hasWins = false;
    // Top performers (accuracy)
    if (strongest.length) {
      hasWins = true;
      wins += '<div class="section-label">Top accuracy</div>';
      wins += strongest.slice(0, 3).map(function (s) { return winRow('target', s.name, (s.accuracy || 0) + '%'); }).join('');
    }
    // Most active today
    var activeToday = recent.filter(function (r) { return (r.todayAttempted || 0) > 0; })
      .sort(function (a, b) { return (b.todayAttempted || 0) - (a.todayAttempted || 0); });
    if (activeToday.length) {
      hasWins = true;
      wins += '<div class="section-label mt-md">Most active today</div>';
      wins += activeToday.slice(0, 3).map(function (r) { return winRow('activity', r.name, (r.todayAttempted || 0) + ' solved'); }).join('');
    }
    // Top same-session improvers (ADR-030) — honest cold-start speed proof
    wins += '<div class="section-label mt-md">Session Improvement <span class="section-sub">faster by end of session</span></div>';
    if (improvers.length && m.avgSessionImprovement != null) {
      hasWins = true;
      wins += improvers.slice(0, 3).map(function (s) {
        return winRow('bolt', s.name, '<span class="delta-up">↑ ' + Math.abs(Math.round(s.sessionImprovement)) + '%</span>');
      }).join('');
      wins += '<div class="list-row-sub muted mt-sm">Coaching average: ' +
        (m.avgSessionImprovement > 0 ? 'students speed up ' + m.avgSessionImprovement + '% within a session' : m.avgSessionImprovement + '%') +
        ' (' + (m.sessionImprovementSampleSize || 0) + ' student' + ((m.sessionImprovementSampleSize === 1) ? '' : 's') + ').</div>';
    } else {
      wins += '<div class="collecting"><div class="collecting-title">' + U.icon('bolt', 16) + ' Session Improvement</div>' +
        '<div class="collecting-sub">As students finish 6+ question sessions, we show who speeds up the most from start to finish.</div></div>';
    }
    // Streak stat line
    if (m.activeStreakUsers) {
      wins += '<div class="list-row list-row-tight mt-sm"><div class="list-row-main d-flex" style="align-items:center;gap:var(--space-sm);">' +
        '<span class="win-ic">' + U.icon('flame', 16) + '</span><div class="list-row-title">On an active daily streak</div></div>' +
        '<div class="win-val">' + m.activeStreakUsers + ' student' + (m.activeStreakUsers === 1 ? '' : 's') + '</div></div>';
    }
    if (!hasWins && !m.activeStreakUsers) {
      wins += '<div class="empty-state"><div class="empty-state-text">Wins show up as your students practice.</div></div>';
    }

    root.innerHTML = '<div class="view-pad">' + hero + grid + momentum + attn + wins + '</div>';
  }

  return { render: render };
})();
