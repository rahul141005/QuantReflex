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
        '<div class="empty-state-icon">⚠️</div>' +
        '<div class="empty-state-text">' + U.escapeHtml(U.getReadableError(err)) + '</div>' +
        '<button class="btn btn-outline btn-sm mt-md" onclick="DashboardView.render(true)">Retry</button>' +
        '</div></div>';
    });
  }

  function _paint(root, data, rollup, perf) {
    var m = data.metrics || {};
    var inactive = data.inactiveStudents || [];
    var weak = data.weakTopics || [];
    var total = m.totalStudents || 0;
    var part = (perf && perf.participation) || {};   // {activeThisWeek, activeLastWeek, change}

    /* Speed hero — current coaching-wide avg solving speed (real now). Trend delta only if ≥7 real days. */
    var speedStr = (m.avgSpeed && m.avgSpeed > 0) ? m.avgSpeed.toFixed(1) : '—';
    var days = (rollup && rollup.days) || {};
    var dayKeys = Object.keys(days).sort();
    var speedDeltaHtml = '';
    if (dayKeys.length >= 7) {
      var latest = days[dayKeys[dayKeys.length - 1]];
      var weekAgo = days[dayKeys[dayKeys.length - 7]];
      if (latest && weekAgo && weekAgo.avgSpeed > 0 && latest.avgSpeed > 0) {
        var pct = ((latest.avgSpeed - weekAgo.avgSpeed) / weekAgo.avgSpeed) * 100;
        speedDeltaHtml = '<div class="speed-hero-label">' + U.deltaBadge(pct, true) + ' vs last week</div>';
      }
    } else {
      var rem = Math.max(0, 7 - dayKeys.length);
      speedDeltaHtml = '<div class="speed-hero-label muted">7-day trend in ' + rem + ' day' + (rem === 1 ? '' : 's') + ' →</div>';
    }

    var hero =
      '<div class="speed-hero" role="button" tabindex="0" onclick="CoachingApp.navigateTo(\'performance\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();CoachingApp.navigateTo(\'performance\');}" aria-label="Open Performance — view speed trend">' +
        '<div style="flex:1;">' +
          '<div><span class="speed-hero-num">' + speedStr + '</span> <span class="speed-hero-unit">s/question</span></div>' +
          '<div class="speed-hero-label">Average solving speed · lower is faster</div>' +
          speedDeltaHtml +
        '</div>' +
      '</div>';

    /* Real-now metric grid */
    function metric(label, value, icon, accent) {
      return '<div class="metric-card">' +
        '<div class="metric-icon" style="color:' + (accent || 'var(--accent-primary)') + ';">' + icon + '</div>' +
        '<div class="metric-value">' + value + '</div>' +
        '<div class="metric-label">' + label + '</div>' +
      '</div>';
    }
    var grid = '<div class="metrics-grid">' +
      metric('Active today', (m.activeToday || 0) + (total ? ' / ' + total : ''), '🟢', 'var(--accent-emerald)') +
      metric('Active this week' + (part.change != null ? ' ' + U.deltaBadge(part.change, false) : ''), (m.activeThisWeek || 0) + (total ? ' / ' + total : ''), '📈', 'var(--accent-primary)') +
      metric('Need attention', String(m.inactiveCount != null ? m.inactiveCount : inactive.length), '⚠️', 'var(--accent-amber)') +
      metric('Avg accuracy', (m.avgAccuracy != null ? m.avgAccuracy + '%' : '—'), '🎯', 'var(--accent-cyan)') +
    '</div>';

    /* Students requiring attention (inactive ≥3d) — the daily-utility queue with a 1-tap nudge. */
    var attn = '<div class="section-label">Students requiring attention</div>';
    if (!inactive.length) {
      attn += '<div class="empty-state"><div class="empty-state-icon">✅</div>' +
        '<div class="empty-state-text">Everyone\'s been practicing recently.</div>' +
        '<div class="empty-state-hint">At-risk students (no practice in 3+ days) appear here.</div></div>';
    } else {
      var shown = Math.min(6, inactive.length);
      var attnTotal = (m.inactiveCount != null ? m.inactiveCount : inactive.length);
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

    /* Weak topics (accuracy) — actionable: nudge everyone weak in a topic. */
    var topics = '<div class="section-label">Weak topics</div>';
    if (weak.length) {
      topics += weak.slice(0, 5).map(function (t) {
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
      /* Honest empty state instead of silently hiding the section. */
      topics += '<div class="empty-state"><div class="empty-state-text">Not enough practice yet to spot weak topics.</div>' +
        '<div class="empty-state-hint">Topics with 5+ attempts across your students appear here.</div></div>';
    }

    /* Premium strip (monetization — kept small, beside the speed mission) */
    var premium = '<div class="section-label">Adoption</div>' +
      '<div class="card card-compact d-flex" style="justify-content:space-between;align-items:center;">' +
        '<div><div class="font-semibold">Premium students</div><div class="list-row-sub">Drives QuantReflex access</div></div>' +
        '<div class="font-bold" style="font-size:var(--font-xl);">' + (m.premiumUsers || 0) + (total ? ' / ' + total : '') + '</div>' +
      '</div>';

    root.innerHTML = '<div class="view-pad">' + hero + grid + attn + topics + premium + '</div>';
  }

  return { render: render };
})();
