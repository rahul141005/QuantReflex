/**
 * performance.js — Coaching performance & growth (ADR-028).
 *
 * North Star = the coaching's SPEED trend over time. Honest by construction: speed trend / improvement
 * score / improvers come from the real per-coaching daily rollup (coachingMetrics, ADR-027) and render a
 * "collecting" state until enough days accrue. Participation + accuracy trends are REAL today (server reads
 * the existing dated dailyHistory). Adoption (premium/trial/active) is real now; conversion/retention collect.
 */
var PerformanceView = (function () {
  'use strict';

  var U = CoachingUtils;

  function render(forceRefresh) {
    var root = document.getElementById('view-performance');
    if (!root) return;
    root.innerHTML = '<div class="view-pad">' + U.skeletonCard(5) + '</div>';
    Promise.all([
      CoachingAPI.getCoachingMetrics(forceRefresh).catch(function () { return { days: {} }; }),
      CoachingAPI.getPerformance(forceRefresh).catch(function () { return {}; }),
      CoachingAPI.getDashboard(forceRefresh).catch(function () { return {}; })   // speed distribution, session improvement, leaderboard (ADR-030)
    ]).then(function (res) {
      _paint(root, res[0] || { days: {} }, res[1] || {}, res[2] || {});
    }).catch(function (err) {
      root.innerHTML = '<div class="view-pad"><div class="empty-state"><div class="empty-state-icon">' + U.icon('alert', 28) + '</div>' +
        '<div class="empty-state-text">' + U.escapeHtml(U.getReadableError(err)) + '</div>' +
        '<button class="btn btn-outline btn-sm mt-md" onclick="PerformanceView.render(true)">Retry</button></div></div>';
    });
  }

  function _paint(root, rollup, perf, dash) {
    var days = (rollup && rollup.days) || {};
    var keys = Object.keys(days).sort();
    var have = keys.length;
    var speedSeries = keys.map(function (k) { return days[k].avgSpeed; }).filter(function (v) { return v > 0; });
    var m = (dash && dash.metrics) || {};
    var strongest = (dash && dash.strongestStudents) || [];
    var improvers = (dash && dash.topImprovers) || [];
    var weak = (dash && dash.weakTopics) || [];

    var html = '<div class="view-pad">';

    /* ── Anchor: today's coaching-wide avg speed (real now) ── */
    var speedNow = (m.avgSpeed && m.avgSpeed > 0) ? m.avgSpeed.toFixed(1) : '—';
    html += '<div class="speed-hero mb-md"><div style="flex:1;">' +
      '<div class="speed-hero-eyebrow">' + U.icon('bolt', 15) + ' Today</div>' +
      '<div><span class="speed-hero-num">' + speedNow + '</span> <span class="speed-hero-unit">s/question</span></div>' +
      '<div class="speed-hero-label">Coaching-wide average solving speed</div></div></div>';

    /* ── This week vs last (REAL today, from dated dailyHistory) — promoted to lead ── */
    var at = perf.accuracyTrend || {};
    var pt = perf.participation || {};
    html += '<div class="section-title">This week vs last week</div><div class="metrics-grid mb-md">';
    html += '<div class="metric-card accent-cyan"><div class="metric-value">' + (at.thisWeek != null ? at.thisWeek + '%' : '—') + '</div>' +
      '<div class="metric-label">Accuracy ' + (at.change != null ? U.deltaBadge(at.change, false) : '') + '</div></div>';
    html += '<div class="metric-card accent-primary"><div class="metric-value">' + (pt.activeThisWeek != null ? pt.activeThisWeek : '—') + '</div>' +
      '<div class="metric-label">Active students ' + (pt.change != null ? U.deltaBadge(pt.change, false) : '') + '</div></div>';
    html += '</div>';

    /* ── Speed distribution (real now — counts only, ADR-030) ── */
    var sd = m.speedDistribution || {};
    var totalSd = (sd.fast || 0) + (sd.onTrack || 0) + (sd.slow || 0);
    html += '<div class="section-title">Speed distribution</div>';
    if (totalSd > 0) {
      function bucketBar(label, n, color) {
        var pct = Math.round((n / totalSd) * 100);
        return '<div class="bar-chart-row">' +
          '<div class="bar-chart-label">' + label + '</div>' +
          '<div class="bar-chart-track"><div class="bar-chart-fill" style="width:' + pct + '%;background:' + color + ';"></div></div>' +
          '<div class="bar-chart-value">' + n + '</div></div>';
      }
      html += '<div class="card mb-md">' +
        bucketBar('Fast (&lt;5s)', sd.fast || 0, 'var(--accent-emerald)') +
        bucketBar('On track (5–10s)', sd.onTrack || 0, 'var(--accent-primary)') +
        bucketBar('Slow (10s+)', sd.slow || 0, 'var(--accent-amber)') +
        '<div class="list-row-sub muted mt-sm">Based on each student\'s average solving speed.</div></div>';
    } else {
      html += '<div class="empty-state"><div class="empty-state-text">No timed practice yet to chart speed spread.</div></div>';
    }

    /* ── Session Improvement (ADR-030 — honest cold-start speed proof) ── */
    html += '<div class="section-title">Session Improvement <span class="section-sub">faster by end of session</span></div>';
    if (improvers.length && m.avgSessionImprovement != null) {
      html += '<div class="card mb-md">' +
        '<div class="d-flex" style="justify-content:space-between;align-items:baseline;">' +
          '<div class="font-semibold">Coaching average</div>' +
          '<div class="font-bold" style="font-size:var(--font-lg);">' + (m.avgSessionImprovement > 0 ? '<span class="delta-up">↑ ' + m.avgSessionImprovement + '%</span>' : m.avgSessionImprovement + '%') + '</div>' +
        '</div>' +
        '<div class="list-row-sub">Students typically speed up this much from the first half to the last half of a session (' + (m.sessionImprovementSampleSize || 0) + ' student' + ((m.sessionImprovementSampleSize === 1) ? '' : 's') + ').</div>';
      html += improvers.slice(0, 5).map(function (s) {
        return '<div class="d-flex" style="justify-content:space-between;padding:var(--space-sm) 0;border-bottom:1px solid var(--border-subtle);">' +
          '<div class="font-semibold">' + U.escapeHtml(U.truncate(s.name, 22)) + '</div>' +
          '<div class="delta-up">↑ ' + Math.abs(Math.round(s.sessionImprovement)) + '%</div></div>';
      }).join('');
      html += '</div>';
    } else {
      html += '<div class="collecting"><div class="collecting-title">' + U.icon('bolt', 16) + ' Session Improvement</div>' +
        '<div class="collecting-sub">Once students complete 6+ question timed sessions, we show who speeds up the most from start to finish.</div></div>';
    }

    /* ── Current fastest students (real now — leaderboard from strongestStudents) ── */
    var fastest = strongest.filter(function (s) { return s.speed && s.speed > 0; })
      .sort(function (a, b) { return a.speed - b.speed; }).slice(0, 5);
    html += '<div class="section-title">Fastest right now</div>';
    if (fastest.length) {
      html += '<div class="card mb-md">' + fastest.map(function (s, i) {
        return '<div class="d-flex" style="justify-content:space-between;align-items:center;padding:var(--space-sm) 0;border-bottom:1px solid var(--border-subtle);">' +
          '<div class="d-flex" style="align-items:center;gap:var(--space-sm);"><span class="rank-num">' + (i + 1) + '</span><div class="font-semibold">' + U.escapeHtml(U.truncate(s.name, 22)) + '</div></div>' +
          '<div class="font-bold" style="color:var(--accent-emerald);">' + s.speed.toFixed(1) + 's</div></div>';
      }).join('') + '</div>';
    } else {
      html += '<div class="empty-state"><div class="empty-state-text">No timed sessions yet.</div></div>';
    }

    /* ── Weak topics across the coaching (real now) ── */
    if (weak.length) {
      html += '<div class="section-title">Weakest topics</div><div class="card mb-md">';
      html += weak.slice(0, 5).map(function (t) {
        var acc = t.accuracy || 0;
        var color = acc >= 70 ? 'var(--accent-emerald)' : (acc >= 50 ? 'var(--accent-amber)' : 'var(--accent-red)');
        return '<div class="bar-chart-row"><div class="bar-chart-label">' + U.escapeHtml(U.capitalize(t.topic)) + '</div>' +
          '<div class="bar-chart-track"><div class="bar-chart-fill" style="width:' + acc + '%;background:' + color + ';"></div></div>' +
          '<div class="bar-chart-value">' + acc + '%</div></div>';
      }).join('');
      html += '</div>';
    }

    /* ── The genuinely-accruing multi-day speed trend (ONE honest teaser/chart) ── */
    html += '<div class="section-title">Speed trend over time <span class="section-sub">lower is faster</span></div>';
    if (speedSeries.length >= 2) {
      var f = speedSeries[0], l = speedSeries[speedSeries.length - 1];
      var delta = f > 0 ? U.deltaBadge(((l - f) / f) * 100, true) : '';
      html += '<div class="card mb-md">' + U.sparkline(speedSeries, { invert: true, color: 'var(--accent-emerald)' }) +
        '<div class="d-flex" style="justify-content:space-between;font-size:var(--font-xs);color:var(--text-muted);margin-top:6px;">' +
          '<span>' + speedSeries.length + ' days</span><span>' + delta + ' overall</span>' +
          '<span>now ' + (l ? l.toFixed(1) : '—') + 's</span></div>';
      if (have < 7) html += '<div class="list-row-sub muted mt-sm">Full 7-day trend in ' + (7 - have) + ' more day' + ((7 - have) === 1 ? '' : 's') + '.</div>';
      html += '</div>';
    } else {
      html += U.collectingCard('Multi-day speed trend', speedSeries.length, 7);
    }

    html += '</div>';
    root.innerHTML = html;
  }

  return { render: render };
})();
