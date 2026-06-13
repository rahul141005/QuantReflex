/**
 * engagement.js — Student Engagement Center (ADR-028).
 *
 * Behavior-change engine, NOT a comms platform. Exactly 3 sections:
 *   1) Quick Broadcast  — instant message to an audience (all / premium / free) for motivation.
 *   2) Smart Nudges + Achievements — one-tap, situation-aware messages (incl. the data-driven weak-topic
 *      nudge that the server targets to genuinely weak students) and celebration broadcasts.
 *   3) Recent Notices   — last 20, read-only log.
 * Removed (LMS bloat): templates library, scheduling, history management, inbox/reply/chat.
 */
var EngagementView = (function () {
  'use strict';

  var U = CoachingUtils;
  var _pending = null;   // {title, body, segment?, targetUid?, targetName?, targetTopic?}
  var _segment = 'all';

  /* Called from Dashboard / Students / Profile — prefill a targeted nudge then jump here. */
  function nudgeStudent(uid, name) {
    _pending = { targetUid: uid, targetName: name || 'student',
      title: 'Time to practice', body: (name || 'Hi') + ', we miss you! Jump back in for a quick set and keep your speed sharp.' };
    CoachingApp.navigateTo('engagement');
  }
  function nudgeTopic(topic) {
    _pending = { targetTopic: topic, title: 'Sharpen ' + U.capitalize(topic),
      body: 'Let\'s work on ' + topic + ' today — a few focused questions will boost both speed and accuracy.' };
    CoachingApp.navigateTo('engagement');
  }

  function render() {
    var root = document.getElementById('view-engagement');
    if (!root) return;
    var pending = _pending; _pending = null;
    root.innerHTML = '<div class="view-pad">' + U.skeletonCard(4) + '</div>';
    /* Pull the dashboard (cached → instant) so audience counts + at-risk names + top performers are REAL,
       not blind (ADR-030). Failure degrades to no-counts, never blocks sending. */
    CoachingAPI.getDashboard().then(function (dash) { _paint(root, pending, dash || {}); })
      .catch(function () { _paint(root, pending, {}); });
  }

  function _paint(root, pending, dash) {
    var m = (dash && dash.metrics) || {};
    var inactive = (dash && dash.inactiveStudents) || [];
    var strongest = (dash && dash.strongestStudents) || [];
    var total = m.totalStudents || 0;
    var premium = m.premiumUsers || 0;
    var free = (total && premium != null) ? Math.max(0, total - premium) : null;
    function cnt(n) { return (n != null) ? ' <span class="seg-count">' + n + '</span>' : ''; }

    /* Honor a chip-selected audience. 'all'|'premium'|'free' show the selector; behavior segments
       ('inactive'|'lowstreak') show a "targeting" banner and the server filters them (ADR-029). */
    var initSeg = (pending && !pending.targetUid && !pending.targetTopic && pending.segment) ? pending.segment : 'all';
    var isBehaviorSeg = (initSeg === 'inactive' || initSeg === 'lowstreak');

    var html = '<div class="view-pad">';

    /* ── 1) Quick Broadcast (audience counts are live) ── */
    html += '<div class="section-title">Quick broadcast</div><div class="card mb-md">';
    if (pending && pending.targetUid) {
      html += '<div class="pill good mb-sm">Sending to ' + U.escapeHtml(pending.targetName) + '</div>';
    } else if (pending && pending.targetTopic) {
      html += '<div class="pill warn mb-sm">Targeting students weak in ' + U.escapeHtml(pending.targetTopic) + '</div>';
    } else if (isBehaviorSeg) {
      html += '<div class="pill warn mb-sm">Targeting ' + (initSeg === 'inactive' ? 'inactive (3+ days)' : 'low-streak') + ' students</div>';
    } else {
      html += '<div class="seg mb-sm" id="engSeg">' +
        '<button class="' + (initSeg === 'all' ? 'active' : '') + '" data-seg="all" onclick="EngagementView.setSeg(\'all\')">Everyone' + cnt(total || null) + '</button>' +
        '<button class="' + (initSeg === 'premium' ? 'active' : '') + '" data-seg="premium" onclick="EngagementView.setSeg(\'premium\')">Premium' + cnt(premium) + '</button>' +
        '<button class="' + (initSeg === 'free' ? 'active' : '') + '" data-seg="free" onclick="EngagementView.setSeg(\'free\')">Free' + cnt(free) + '</button>' +
      '</div>';
    }
    html += '<input type="text" id="engTitle" class="auth-input mb-sm" maxlength="100" placeholder="Title (e.g. Today\'s speed challenge)" value="' + U.escapeHtml(pending ? pending.title : '') + '" />';
    html += '<textarea id="engBody" class="auth-input" rows="3" maxlength="500" placeholder="Message…">' + U.escapeHtml(pending ? pending.body : '') + '</textarea>';
    html += '<input type="hidden" id="engTargetUid" value="' + U.escapeHtml(pending && pending.targetUid ? pending.targetUid : '') + '" />';
    html += '<input type="hidden" id="engTargetTopic" value="' + U.escapeHtml(pending && pending.targetTopic ? pending.targetTopic : '') + '" />';
    html += '<button class="btn btn-primary btn-full mt-sm" id="engSend" onclick="EngagementView.send()">Send now</button>';
    /* Broadcast presets (motivational, audience = current selector) — folded out of "Smart nudges" since
       they don't target a behavior (ADR-030). */
    html += '<div class="d-flex mt-sm" style="flex-wrap:wrap;gap:var(--space-sm);">';
    html += _preset('Speed challenge', 'Today\'s speed challenge', 'Beat your best solving time today! Aim for a faster average than yesterday.');
    html += _preset('Daily target', 'Hit 50 today', 'Target: 50 questions today. Small daily reps compound into big speed gains.');
    html += '</div>';
    html += '</div>';

    /* ── 2) Smart Nudges — behavior-targeted (server filters to genuinely inactive/low-streak) ── */
    html += '<div class="section-title">Smart nudges <span class="section-sub">targeted by behavior</span></div>';
    html += '<div class="d-flex" style="flex-wrap:wrap;gap:var(--space-sm);" id="engChips">';
    html += _chip('Re-engage inactive', 'We miss you!', 'Haven\'t seen you practice lately — come back for a quick speed set today!', 'inactive');
    html += _chip('Streak reminder', 'Keep your streak alive', 'Your practice streak is at risk — a 2-minute set keeps it going!', 'lowstreak');
    html += '</div>';

    /* At-risk students with NAMES (real, from the dashboard) — one-tap per-student nudge. */
    if (inactive.length) {
      html += '<div class="section-label mt-md">At-risk students</div>';
      html += inactive.slice(0, 5).map(function (s) {
        var name = s.name || s.uid; var safe = (name + '').replace(/'/g, '');
        return '<div class="list-row list-row-tight"><div class="list-row-main">' +
          '<div class="list-row-title">' + U.escapeHtml(name) + '</div>' +
          '<div class="list-row-sub">Last seen ' + U.escapeHtml(U.getRelativeTime(s.lastActive)) + '</div></div>' +
          '<button class="btn btn-sm btn-outline" onclick="EngagementView.nudgeStudent(\'' + U.escapeHtml(s.uid) + '\',\'' + U.escapeHtml(safe) + '\')">Nudge</button></div>';
      }).join('');
    }

    /* ── 3) Celebrate — names the actual top performers (real, from strongestStudents) ── */
    html += '<div class="section-title">Celebrate</div>';
    var topNames = strongest.slice(0, 3).map(function (s) { return s.name; }).filter(Boolean);
    if (topNames.length) {
      var nameList = topNames.map(function (n) { return U.truncate(n, 18); }).join(', ');
      var celebrateBody = 'Huge congratulations to ' + nameList + ' for leading the way this week — keep it up, everyone!';
      html += '<div class="card mb-md"><div class="list-row-sub mb-sm">Top performers right now: <strong>' + U.escapeHtml(nameList) + '</strong></div>' +
        '<button class="btn btn-outline btn-full" onclick="EngagementView.fill(\'Shoutout to our top performers\',\'' + celebrateBody.replace(/'/g, '\\\'') + '\',\'all\')">Broadcast a shoutout</button></div>';
    } else {
      html += '<div class="d-flex" style="flex-wrap:wrap;gap:var(--space-sm);">' +
        _preset('Top performers', 'Shoutout to our top performers', 'Huge congratulations to this week\'s fastest and most consistent students — keep it up!') +
        '</div>';
    }

    /* ── 4) Recent notices (last 20, read-only) ── */
    html += '<div class="section-title">Recent notices</div><div id="engHistory">' + U.skeletonCard(2) + '</div>';

    html += '</div>';
    root.innerHTML = html;
    _segment = initSeg;

    CoachingAPI.getNoticeHistory().then(function (data) {
      var list = (data && (data.notices || data.history)) || [];
      var el = document.getElementById('engHistory');
      if (!el) return;
      if (!list.length) {
        el.innerHTML = '<div class="empty-state"><div class="empty-state-text">No notices sent yet.</div>' +
          '<div class="empty-state-hint">Broadcasts and nudges you send appear here.</div></div>';
        return;
      }
      el.innerHTML = list.slice(0, 20).map(function (n) {
        return '<div class="card card-compact mb-sm">' +
          '<div class="font-semibold">' + U.escapeHtml(n.title || 'Notice') + '</div>' +
          '<div class="list-row-sub">' + U.escapeHtml(U.truncate(n.body || '', 120)) + '</div>' +
          '<div class="list-row-sub muted mt-sm">' + U.escapeHtml(U.getRelativeTime(n.timestamp || n.sentAt || n.createdAt)) +
            (n.sent != null ? ' · delivered to ' + n.sent : '') + '</div></div>';
      }).join('');
    }).catch(function () {
      var el = document.getElementById('engHistory');
      if (el) el.innerHTML = '<div class="empty-state"><div class="empty-state-text">Couldn\'t load recent notices.</div>' +
        '<button class="btn btn-outline btn-sm mt-md" onclick="EngagementView.render()">Retry</button></div>';
    });
  }

  function _chip(label, title, body, seg) {
    var t = title.replace(/'/g, '\\\''), b = body.replace(/'/g, '\\\'');
    return '<button class="pill" style="cursor:pointer;padding:8px 12px;" onclick="EngagementView.fill(\'' + t + '\',\'' + b + '\',\'' + seg + '\')">' + label + '</button>';
  }

  /* A broadcast preset just fills the title/body in place (preserving the chosen audience) — it does NOT
     re-target a behavior segment, so it must not re-render with a segment (ADR-030). */
  function _preset(label, title, body) {
    var t = title.replace(/'/g, '\\\''), b = body.replace(/'/g, '\\\'');
    return '<button class="pill" style="cursor:pointer;padding:8px 12px;" onclick="EngagementView.fillText(\'' + t + '\',\'' + b + '\')">' + label + '</button>';
  }
  function fillText(title, body) {
    var t = document.getElementById('engTitle'), b = document.getElementById('engBody');
    if (t) t.value = title;
    if (b) b.value = body;
    if (b) b.focus();
  }

  function fill(title, body, seg) {
    _pending = { title: title, body: body, segment: seg };
    render();
    var el = document.getElementById('view-engagement'); if (el) el.scrollTop = 0;
  }

  function setSeg(seg) {
    _segment = seg;
    var bar = document.getElementById('engSeg');
    if (bar) bar.querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-seg') === seg); });
  }

  function send() {
    var title = (document.getElementById('engTitle') || {}).value || '';
    var body = (document.getElementById('engBody') || {}).value || '';
    var targetUid = (document.getElementById('engTargetUid') || {}).value || '';
    var targetTopic = (document.getElementById('engTargetTopic') || {}).value || '';
    if (!title.trim() || !body.trim()) { Toast.error('Add a title and a message.'); return; }

    var btn = document.getElementById('engSend');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    CoachingAPI.sendNotice({
      title: title.trim(), body: body.trim(),
      segment: targetUid || targetTopic ? undefined : _segment,
      targetUid: targetUid || undefined,
      targetTopic: targetTopic || undefined
    }).then(function (res) {
      var reached = (res && res.reached != null) ? res.reached : 0;
      if (reached === 0) {
        /* Don't claim success when the targeting matched nobody (ADR-029). */
        Toast.show((res && res.message) || 'No students matched — nobody was messaged.', 4000, 'info');
        if (btn) { btn.disabled = false; btn.textContent = 'Send now'; }
        return;
      }
      Toast.success(targetUid ? 'Nudge sent.' : ('Delivered to ' + reached + ' student' + (reached === 1 ? '' : 's') + '.'));
      render();
    }).catch(function (err) {
      Toast.error(U.getReadableError(err));
      if (btn) { btn.disabled = false; btn.textContent = 'Send now'; }
    });
  }

  return { render: render, send: send, setSeg: setSeg, fill: fill, fillText: fillText, nudgeStudent: nudgeStudent, nudgeTopic: nudgeTopic };
})();
