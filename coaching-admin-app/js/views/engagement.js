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
    /* Honor a chip-selected audience for plain broadcasts (targeted nudges ignore segment). */
    var initSeg = (pending && !pending.targetUid && !pending.targetTopic && pending.segment) ? pending.segment : 'all';

    var html = '<div class="view-pad">';

    /* ── 1) Quick Broadcast ── */
    html += '<div class="section-label">Quick broadcast</div><div class="card mb-md">';
    if (pending && pending.targetUid) {
      html += '<div class="pill good mb-sm">Sending to ' + U.escapeHtml(pending.targetName) + '</div>';
    } else if (pending && pending.targetTopic) {
      html += '<div class="pill warn mb-sm">Targeting students weak in ' + U.escapeHtml(pending.targetTopic) + '</div>';
    } else {
      html += '<div class="seg mb-sm" id="engSeg">' +
        '<button class="' + (initSeg === 'all' ? 'active' : '') + '" data-seg="all" onclick="EngagementView.setSeg(\'all\')">Everyone</button>' +
        '<button class="' + (initSeg === 'premium' ? 'active' : '') + '" data-seg="premium" onclick="EngagementView.setSeg(\'premium\')">Premium</button>' +
        '<button class="' + (initSeg === 'free' ? 'active' : '') + '" data-seg="free" onclick="EngagementView.setSeg(\'free\')">Free</button>' +
      '</div>';
    }
    html += '<input type="text" id="engTitle" class="auth-input mb-sm" maxlength="100" placeholder="Title (e.g. Today\'s speed challenge)" value="' + U.escapeHtml(pending ? pending.title : '') + '" />';
    html += '<textarea id="engBody" class="auth-input" rows="3" maxlength="500" placeholder="Message…">' + U.escapeHtml(pending ? pending.body : '') + '</textarea>';
    html += '<input type="hidden" id="engTargetUid" value="' + U.escapeHtml(pending && pending.targetUid ? pending.targetUid : '') + '" />';
    html += '<input type="hidden" id="engTargetTopic" value="' + U.escapeHtml(pending && pending.targetTopic ? pending.targetTopic : '') + '" />';
    html += '<button class="btn btn-primary btn-full mt-sm" id="engSend" onclick="EngagementView.send()">Send now</button>';
    html += '</div>';

    /* ── 2) Smart Nudges + Achievement broadcasts ── */
    html += '<div class="section-label">Smart nudges</div><div class="d-flex" style="flex-wrap:wrap;gap:var(--space-sm);" id="engChips">';
    html += _chip('💤 Re-engage inactive', 'We miss you!', 'Haven\'t seen you practice lately — come back for a quick speed set today!', 'all');
    html += _chip('⚡ Speed challenge', 'Today\'s speed challenge', 'Beat your best solving time today! Aim for a faster average than yesterday.', 'all');
    html += _chip('🎯 Daily target', 'Hit 50 today', 'Target: 50 questions today. Small daily reps compound into big speed gains.', 'all');
    html += _chip('🔥 Streak reminder', 'Keep your streak alive', 'Your practice streak is at risk — a 2-minute set keeps it going!', 'all');
    html += '</div>';

    html += '<div class="section-label">Celebrate</div><div class="d-flex" style="flex-wrap:wrap;gap:var(--space-sm);">';
    html += _chip('🏆 Top performers', 'Shoutout to our top performers', 'Huge congratulations to this week\'s fastest and most consistent students — keep it up!', 'all');
    html += _chip('📈 Most improved', 'Most improved this week', 'Big shoutout to everyone who got faster this week. Improvement is the whole game!', 'all');
    html += '</div>';

    /* ── 3) Recent notices (last 20, read-only) ── */
    html += '<div class="section-label">Recent notices</div><div id="engHistory">' + U.skeletonCard(2) + '</div>';

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
      if (el) el.innerHTML = '<div class="empty-state"><div class="empty-state-text">Couldn\'t load recent notices.</div></div>';
    });
  }

  function _chip(label, title, body, seg) {
    var t = title.replace(/'/g, '\\\''), b = body.replace(/'/g, '\\\'');
    return '<button class="pill" style="cursor:pointer;padding:8px 12px;" onclick="EngagementView.fill(\'' + t + '\',\'' + b + '\',\'' + seg + '\')">' + label + '</button>';
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
      var n = (res && (res.successCount != null ? res.successCount : res.sent)) || 0;
      Toast.success(targetUid ? 'Nudge sent.' : ('Sent' + (n ? ' to ' + n + ' students' : '') + '.'));
      render();
    }).catch(function (err) {
      Toast.error(U.getReadableError(err));
      if (btn) { btn.disabled = false; btn.textContent = 'Send now'; }
    });
  }

  return { render: render, send: send, setSeg: setSeg, fill: fill, nudgeStudent: nudgeStudent, nudgeTopic: nudgeTopic };
})();
