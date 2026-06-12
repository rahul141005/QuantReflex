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
      CoachingAPI.getPerformance(forceRefresh).catch(function () { return {}; })
    ]).then(function (res) {
      _paint(root, res[0] || { days: {} }, res[1] || {});
    }).catch(function (err) {
      root.innerHTML = '<div class="view-pad"><div class="empty-state"><div class="empty-state-icon">⚠️</div>' +
        '<div class="empty-state-text">' + U.escapeHtml(U.getReadableError(err)) + '</div>' +
        '<button class="btn btn-outline btn-sm mt-md" onclick="PerformanceView.render(true)">Retry</button></div></div>';
    });
  }

  function _paint(root, rollup, perf) {
    var days = (rollup && rollup.days) || {};
    var keys = Object.keys(days).sort();
    var have = keys.length;
    var latest = have ? days[keys[keys.length - 1]] : {};
    var speedSeries = keys.map(function (k) { return days[k].avgSpeed; }).filter(function (v) { return v > 0; });

    var html = '<div class="view-pad">';

    /* ── Coaching Improvement Score (vs the coaching's OWN history) ── */
    html += '<div class="section-label">Coaching Improvement Score</div>';
    if (have >= 7) {
      var first = days[keys[0]], last = latest;
      var speedImp = (first.avgSpeed > 0 && last.avgSpeed > 0) ? ((first.avgSpeed - last.avgSpeed) / first.avgSpeed) * 100 : 0; // +ve = faster
      var accImp = (last.avgAccuracy || 0) - (first.avgAccuracy || 0);
      var participation = last.participation || 0;
      /* Simple, documented composite (0–100): speed improvement (45) + accuracy improvement (25) + participation (30). */
      var score = Math.round(
        Math.max(0, Math.min(1, speedImp / 25)) * 45 +
        Math.max(0, Math.min(1, accImp / 25)) * 25 +
        (participation / 100) * 30
      );
      html += '<div class="card mb-md text-center">' +
        '<div class="score-big">' + score + '<span class="speed-hero-unit"> / 100</span></div>' +
        '<div class="list-row-sub mt-sm">Speed ' + U.deltaBadge(speedImp, false) + ' · Accuracy ' + U.deltaBadge(accImp, false) + ' · Participation ' + participation + '%</div>' +
        '<div class="list-row-sub muted mt-sm">Measured against your own history over ' + have + ' days.</div></div>';
    } else {
      html += U.collectingCard('Coaching Improvement Score', have, 7);
    }

    /* ── Speed trend (North Star) ── */
    html += '<div class="section-label">Speed trend (lower is faster)</div>';
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
      html += U.collectingCard('7-day speed trend', have, 7);
    }

    /* ── Participation + Accuracy trend (REAL today, from dated dailyHistory) ── */
    var at = perf.accuracyTrend || {};
    var pt = perf.participation || {};
    html += '<div class="section-label">This week vs last week</div><div class="metrics-grid mb-md">';
    html += '<div class="metric-card"><div class="metric-value">' + (at.thisWeek != null ? at.thisWeek + '%' : '—') + '</div>' +
      '<div class="metric-label">Accuracy ' + (at.change != null ? U.deltaBadge(at.change, false) : '') + '</div></div>';
    html += '<div class="metric-card"><div class="metric-value">' + (pt.activeThisWeek != null ? pt.activeThisWeek : '—') + '</div>' +
      '<div class="metric-label">Active students ' + (pt.change != null ? U.deltaBadge(pt.change, false) : '') + '</div></div>';
    html += '</div>';

    /* ── Top / bottom improvers (need real dated speed deltas) ── */
    html += '<div class="section-label">Fastest improving students</div>';
    html += U.collectingCard('Per-student speed improvement', have, 7);

    /* ── Adoption (real now) + conversion/retention (collecting) ── */
    html += '<div class="section-label">Adoption</div><div class="metrics-grid mb-md">';
    html += '<div class="metric-card"><div class="metric-value">' + (latest.premiumCount != null ? latest.premiumCount : '—') + '</div><div class="metric-label">Premium</div></div>';
    html += '<div class="metric-card"><div class="metric-value">' + (latest.trialCount != null ? latest.trialCount : '—') + '</div><div class="metric-label">On trial</div></div>';
    html += '<div class="metric-card"><div class="metric-value">' + (latest.activeThisWeek != null ? latest.activeThisWeek : '—') + '</div><div class="metric-label">Active / week</div></div>';
    html += '<div class="metric-card"><div class="metric-value">' + (latest.totalStudents != null ? latest.totalStudents : '—') + '</div><div class="metric-label">Total students</div></div>';
    html += '</div>';
    if (have < 7) {
      html += U.collectingCard('Conversion & retention', have, 7);
    }

    html += '</div>';
    root.innerHTML = html;
  }

  return { render: render };
})();
