/**
 * student-profile.js — Student-360 detail (ADR-028). Speed-first.
 *
 * Leads with current speed + a REAL speed curve (built from the dated dailyHistory sumTimes/count,
 * ADR-027) — or an honest "collecting" state until ≥2 dated-speed days exist. No fabricated trend,
 * no Consistency Score, no duel W/L, no print "report".
 */
var StudentProfileView = (function () {
  'use strict';

  var U = CoachingUtils;

  function buildProfileHtml(data) {
    var p = data.profile || {};
    var s = data.stats || {};
    var name = p.name || p.email || 'Student';
    var safeName = (name + '').replace(/'/g, '');
    var html = '';

    /* Header */
    html += '<div class="d-flex" style="align-items:center;gap:var(--space-md);margin-bottom:var(--space-lg);">';
    html += '<div class="coaching-logo" style="width:52px;height:52px;font-size:var(--font-xl);">' + U.escapeHtml(U.getInitial(name)) + '</div>';
    html += '<div class="flex-1" style="min-width:0;">';
    html += '<div style="font-size:var(--font-xl);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + U.escapeHtml(name) + '</div>';
    if (p.email) html += '<div class="list-row-sub">' + U.escapeHtml(p.email) + '</div>';
    html += '<div class="mt-sm" style="display:flex;gap:6px;flex-wrap:wrap;">' + U.getEngagementBadge(p.engagementLevel) + U.getSubscriptionBadge(p.plan, p.isTrial) + '</div>';
    html += '</div></div>';

    /* Current speed hero */
    var speedStr = (s.avgSpeed && s.avgSpeed > 0) ? s.avgSpeed.toFixed(1) : '—';
    html += '<div class="speed-hero mb-md"><div style="flex:1;">' +
      '<div><span class="speed-hero-num">' + speedStr + '</span> <span class="speed-hero-unit">s/question</span></div>' +
      '<div class="speed-hero-label">Current average solving speed</div></div></div>';

    /* Real speed curve from dated dailyHistory (ADR-027), else honest collecting state */
    var dh = data.dailyHistory || {};
    var keys = Object.keys(dh).sort(function (a, b) { return (Date.parse(a) || 0) - (Date.parse(b) || 0); });
    var speedDays = keys.filter(function (k) { return dh[k] && dh[k].count > 0; });
    var series = speedDays.map(function (k) { return dh[k].sumTimes / dh[k].count; });

    html += '<div class="section-label">Speed trend</div>';
    if (series.length >= 2) {
      var windowSeries = series.slice(-30);
      var first = windowSeries[0], last = windowSeries[windowSeries.length - 1];
      var deltaHtml = (first > 0) ? U.deltaBadge(((last - first) / first) * 100, true) + ' over last ' + windowSeries.length + ' active days' : '';
      html += '<div class="card mb-md">' + U.sparkline(windowSeries, { invert: true, color: 'var(--accent-emerald)' }) +
        '<div class="d-flex" style="justify-content:space-between;font-size:var(--font-xs);color:var(--text-muted);margin-top:6px;">' +
          '<span>Older</span><span>' + deltaHtml + '</span><span>Recent</span></div></div>';
    } else {
      html += U.collectingCard('Speed trend for this student', speedDays.length, 7);
      html += '<div class="collecting-sub mt-sm muted">Each day of practice from now adds a real data point.</div>';
    }

    /* Accuracy + streak (secondary, real) */
    html += '<div class="metrics-grid mb-md">' +
      '<div class="metric-card"><div class="metric-value">' + (s.accuracy != null ? s.accuracy + '%' : '—') + '</div><div class="metric-label">Lifetime accuracy</div></div>' +
      '<div class="metric-card"><div class="metric-value">' + (s.dailyStreak || 0) + 'd ' + U.getStreakEmoji(s.dailyStreak) + '</div><div class="metric-label">Daily streak</div></div>' +
    '</div>';

    /* Topic speed/accuracy — actionable nudge target (performance lens, not LMS remediation) */
    var cats = (data.categoryPerformance || []).slice();
    if (cats.length) {
      html += '<div class="section-label">Topics needing attention</div>';
      var weak = cats.filter(function (c) { return c.accuracy < 60; }).slice(0, 5);
      var show = weak.length ? weak : cats.slice(0, 4);
      html += '<div class="card mb-md">';
      html += show.map(function (c) {
        var color = c.accuracy >= 70 ? 'var(--accent-emerald)' : (c.accuracy >= 50 ? 'var(--accent-amber)' : 'var(--accent-red)');
        return '<div class="bar-chart-row">' +
          '<div class="bar-chart-label">' + U.escapeHtml(U.capitalize(c.topic)) + '</div>' +
          '<div class="bar-chart-track"><div class="bar-chart-fill" style="width:' + c.accuracy + '%;background:' + color + ';"></div></div>' +
          '<div class="bar-chart-value">' + c.accuracy + '%</div></div>';
      }).join('');
      html += '</div>';
    }

    /* Recent sessions — now with per-session speed (duration / questions) from real practiceSessions */
    if (data.recentSessions && data.recentSessions.length) {
      html += '<div class="section-label">Recent sessions</div><div class="card mb-md">';
      html += data.recentSessions.slice(0, 10).map(function (ss) {
        var acc = ss.total > 0 ? Math.round((ss.score / ss.total) * 100) : 0;
        var perQ = (ss.duration > 0 && ss.total > 0) ? (ss.duration / ss.total) : 0;
        var speedTag = perQ > 0 ? ('⚡ ' + perQ.toFixed(1) + 's/q') : '';
        return '<div class="d-flex" style="justify-content:space-between;padding:var(--space-sm) 0;border-bottom:1px solid var(--border-subtle);">' +
          '<div><div class="font-semibold">' + U.escapeHtml(U.capitalize(ss.category)) + '</div>' +
          '<div class="list-row-sub">' + U.escapeHtml(U.getRelativeTime(ss.timestamp)) + (speedTag ? ' · ' + speedTag : '') + '</div></div>' +
          '<div class="text-center"><div class="font-bold" style="color:var(--accent-primary);">' + acc + '%</div>' +
          '<div class="list-row-sub">' + ss.score + '/' + ss.total + '</div></div></div>';
      }).join('');
      html += '</div>';
    }

    /* Intervention */
    html += '<button class="btn btn-primary btn-full mb-md" onclick="EngagementView.nudgeStudent(\'' + U.escapeHtml(p.uid) + '\',\'' + U.escapeHtml(safeName) + '\')">🔔 Send a nudge</button>';
    html += '<div class="text-center list-row-sub" style="padding-bottom:var(--space-lg);">Member since ' + U.escapeHtml(U.formatDate(p.createdAt)) + '</div>';

    return html;
  }

  return { buildProfileHtml: buildProfileHtml };
})();
