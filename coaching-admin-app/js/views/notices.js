/**
 * notices.js — Coaching Notices View
 *
 * Compose and send notices to coaching students.
 * Supports instant send and scheduled delivery.
 * Quick templates, character count, delivery stats.
 * Tabs: Compose | Scheduled | History.
 */
var NoticesView = (function () {
  'use strict';

  var _currentTab = 'compose';
  var _targetUid = null;
  var _targetTopic = null;
  var _targetName = null;

  var TEMPLATES = [
    { emoji: '💪', label: 'Motivational', title: '💪 Keep Pushing!', body: 'Your hard work is paying off. Keep practicing and you\'ll ace your exams!' },
    { emoji: '📝', label: 'Reminder', title: '📝 Practice Reminder', body: 'Don\'t forget your daily math practice! Even 10 minutes makes a difference.' },
    { emoji: '🏆', label: 'Leaderboard', title: '🏆 Leaderboard Update', body: 'Check out this week\'s leaderboard rankings! Can you reach the top?' },
    { emoji: '🎯', label: 'Challenge', title: '🎯 Weekly Challenge', body: 'This week\'s challenge: Solve 50 questions with 80%+ accuracy. Are you up for it?' }
  ];

  function render(forceRefresh) {
    var container = document.getElementById('view-notices');
    if (!container) return;
    container.innerHTML = _buildView();
    _bindEvents();
    if (_currentTab === 'history') {
      _loadHistory(forceRefresh);
    } else if (_currentTab === 'scheduled') {
      _loadScheduled();
    }
  }

  function _buildView() {
    var html = '';

    /* Tabs */
    html += '<div class="tab-group">';
    html += '<button class="tab-pill' + (_currentTab === 'compose' ? ' active' : '') + '" onclick="NoticesView.setTab(\'compose\')">✏️ Compose</button>';
    html += '<button class="tab-pill' + (_currentTab === 'scheduled' ? ' active' : '') + '" onclick="NoticesView.setTab(\'scheduled\')">⏰ Scheduled</button>';
    html += '<button class="tab-pill' + (_currentTab === 'history' ? ' active' : '') + '" onclick="NoticesView.setTab(\'history\')">📋 History</button>';
    html += '</div>';

    if (_currentTab === 'compose') {
      html += _buildCompose();
    } else if (_currentTab === 'scheduled') {
      html += '<div id="scheduledNoticesContainer">' + CoachingUtils.skeletonCard(3) + '</div>';
    } else {
      html += '<div id="noticeHistoryContainer">' + CoachingUtils.skeletonCard(3) + '</div>';
    }

    return html;
  }

  function _buildCompose() {
    var html = '';

    if (_targetUid || _targetTopic) {
      html += '<div style="background:var(--accent-primary-glow); border:1px solid var(--accent-primary); border-radius:var(--radius-sm); padding:var(--space-md); margin-bottom:var(--space-md); font-size:var(--font-sm);">';
      if (_targetUid) html += '🎯 <strong>Targeted Nudge:</strong> Sending specifically to ' + CoachingUtils.escapeHtml(_targetName || 'Student') + ' <button onclick="NoticesView.clearTarget()" style="float:right;background:none;border:none;color:var(--accent-primary);cursor:pointer;font-size:var(--font-xs);font-weight:bold;">Clear</button>';
      if (_targetTopic) html += '🎯 <strong>Targeted Topic:</strong> Sending to students weak in ' + CoachingUtils.escapeHtml(CoachingUtils.capitalize(_targetTopic)) + ' (<50% accuracy) <button onclick="NoticesView.clearTarget()" style="float:right;background:none;border:none;color:var(--accent-primary);cursor:pointer;font-size:var(--font-xs);font-weight:bold;">Clear</button>';
      html += '</div>';
    }

    /* Quick Templates */
    if (!_targetUid && !_targetTopic) {
      html += '<div class="card-title">Quick Templates</div>';
      html += '<div class="template-grid">';
      for (var i = 0; i < TEMPLATES.length; i++) {
        var t = TEMPLATES[i];
        html += '<button class="template-btn" onclick="NoticesView.useTemplate(' + i + ')">' + t.emoji + ' ' + t.label + '</button>';
      }
      html += '</div>';
    }

    /* Compose Form */
    html += '<div class="notice-compose">';
    html += '<div class="auth-field">';
    html += '<label class="auth-label">Title</label>';
    html += '<input type="text" id="noticeTitle" class="auth-input" placeholder="Notice title..." maxlength="100" />';
    html += '<div id="noticeTitleCount" style="text-align:right;font-size:var(--font-xs);color:var(--text-muted);margin-top:2px;">0/100</div>';
    html += '</div>';
    html += '<div class="auth-field">';
    html += '<label class="auth-label">Message</label>';
    html += '<textarea id="noticeBody" class="notice-textarea" placeholder="Write your message..." maxlength="500"></textarea>';
    html += '<div id="noticeBodyCount" style="text-align:right;font-size:var(--font-xs);color:var(--text-muted);margin-top:2px;">0/500</div>';
    html += '</div>';

    /* Schedule Toggle */
    html += '<div class="schedule-toggle-section">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-sm);">';
    html += '<label class="auth-label" style="margin-bottom:0;">⏰ Schedule for Later</label>';
    html += '<label class="notice-toggle"><input type="checkbox" id="scheduleToggle" /><span class="notice-toggle-slider"></span></label>';
    html += '</div>';
    html += '<div id="scheduleFields" style="display:none;">';
    html += '<input type="datetime-local" id="scheduleDateTime" class="auth-input" style="color-scheme:dark;" />';
    html += '<div style="font-size:var(--font-xs);color:var(--text-muted);margin-top:4px;">Notice will be sent at the scheduled time.</div>';
    html += '</div>';
    html += '</div>';

    html += '<div id="noticeSendError" class="auth-error"></div>';
    html += '<button id="noticeSendBtn" class="btn btn-primary btn-full" onclick="NoticesView.send()">📨 Send Notice</button>';
    html += '</div>';

    return html;
  }

  function _bindEvents() {
    var titleInput = document.getElementById('noticeTitle');
    var bodyInput = document.getElementById('noticeBody');
    var scheduleToggle = document.getElementById('scheduleToggle');

    if (titleInput) {
      titleInput.addEventListener('input', function () {
        var count = document.getElementById('noticeTitleCount');
        if (count) count.textContent = titleInput.value.length + '/100';
      });
    }

    if (bodyInput) {
      bodyInput.addEventListener('input', function () {
        var count = document.getElementById('noticeBodyCount');
        if (count) count.textContent = bodyInput.value.length + '/500';
      });
    }

    if (scheduleToggle) {
      scheduleToggle.addEventListener('change', function () {
        var fields = document.getElementById('scheduleFields');
        var btn = document.getElementById('noticeSendBtn');
        if (this.checked) {
          if (fields) fields.style.display = 'block';
          if (btn) btn.textContent = '⏰ Schedule Notice';
          /* Set default to 1 hour from now */
          var dt = document.getElementById('scheduleDateTime');
          if (dt && !dt.value) {
            var d = new Date(Date.now() + 3600000);
            dt.value = d.toISOString().slice(0, 16);
          }
        } else {
          if (fields) fields.style.display = 'none';
          if (btn) btn.textContent = '📨 Send Notice';
        }
      });
    }
  }

  function useTemplate(index) {
    var t = TEMPLATES[index];
    if (!t) return;
    var titleInput = document.getElementById('noticeTitle');
    var bodyInput = document.getElementById('noticeBody');
    if (titleInput) {
      titleInput.value = t.title;
      var titleCount = document.getElementById('noticeTitleCount');
      if (titleCount) titleCount.textContent = t.title.length + '/100';
    }
    if (bodyInput) {
      bodyInput.value = t.body;
      var bodyCount = document.getElementById('noticeBodyCount');
      if (bodyCount) bodyCount.textContent = t.body.length + '/500';
    }
  }

  function send() {
    var titleInput = document.getElementById('noticeTitle');
    var bodyInput = document.getElementById('noticeBody');
    var errorEl = document.getElementById('noticeSendError');
    var btn = document.getElementById('noticeSendBtn');
    var scheduleToggle = document.getElementById('scheduleToggle');
    var scheduleDT = document.getElementById('scheduleDateTime');

    var title = titleInput ? titleInput.value.trim() : '';
    var body = bodyInput ? bodyInput.value.trim() : '';

    if (!title || !body) {
      if (errorEl) { errorEl.textContent = 'Both title and message are required.'; errorEl.style.display = 'block'; }
      return;
    }

    /* Check scheduled */
    var scheduledFor = null;
    if (scheduleToggle && scheduleToggle.checked) {
      if (!scheduleDT || !scheduleDT.value) {
        if (errorEl) { errorEl.textContent = 'Please select a date and time for scheduling.'; errorEl.style.display = 'block'; }
        return;
      }
      var schedDate = new Date(scheduleDT.value);
      if (isNaN(schedDate.getTime()) || schedDate.getTime() <= Date.now()) {
        if (errorEl) { errorEl.textContent = 'Scheduled time must be in the future.'; errorEl.style.display = 'block'; }
        return;
      }
      scheduledFor = schedDate.toISOString();
    }

    if (errorEl) errorEl.style.display = 'none';
    if (btn) { btn.disabled = true; btn.textContent = scheduledFor ? 'Scheduling…' : 'Sending…'; }

    CoachingAPI.sendNotice(title, body, scheduledFor, _targetUid, _targetTopic).then(function (data) {
      if (btn) { btn.disabled = false; btn.textContent = scheduledFor ? '⏰ Schedule Notice' : '📨 Send Notice'; }

      /* Handle scheduled response */
      if (data.scheduled) {
        Toast.success('⏰ ' + (data.message || 'Notice scheduled successfully!'));
        _clearForm(titleInput, bodyInput, scheduleToggle);
        return;
      }

      /* Contextual success message for instant send */
      var sent = data.sent || 0;
      var totalStudents = data.totalStudents || 0;
      var withTokens = data.withTokens || 0;

      if (sent > 0) {
        Toast.success('✅ Notice delivered to ' + sent + ' student' + (sent !== 1 ? 's' : '') + '!' +
          (data.failed > 0 ? ' (' + data.failed + ' failed)' : ''));
      } else if (totalStudents > 0 && withTokens === 0) {
        Toast.show('⚠️ Notice saved. ' + totalStudents + ' student' + (totalStudents !== 1 ? 's' : '') +
          ' found but none have push notifications enabled.', 'warning');
      } else if (totalStudents === 0) {
        Toast.show('⚠️ No students linked to your coaching yet.', 'warning');
      } else {
        Toast.show('Notice saved. Delivery: ' + sent + '/' + withTokens);
      }

      _clearForm(titleInput, bodyInput, scheduleToggle);
    }).catch(function (err) {
      if (btn) { btn.disabled = false; btn.textContent = scheduledFor ? '⏰ Schedule Notice' : '📨 Send Notice'; }
      if (errorEl) { errorEl.textContent = CoachingUtils.getReadableError(err); errorEl.style.display = 'block'; }
    });
  }

  function _clearForm(titleInput, bodyInput, scheduleToggle) {
    if (titleInput) titleInput.value = '';
    if (bodyInput) bodyInput.value = '';
    var titleCount = document.getElementById('noticeTitleCount');
    var bodyCount = document.getElementById('noticeBodyCount');
    if (titleCount) titleCount.textContent = '0/100';
    if (bodyCount) bodyCount.textContent = '0/500';
    /* Reset schedule toggle */
    if (scheduleToggle) {
      scheduleToggle.checked = false;
      var fields = document.getElementById('scheduleFields');
      if (fields) fields.style.display = 'none';
      var btn = document.getElementById('noticeSendBtn');
      if (btn) btn.textContent = '📨 Send Notice';
    }
  }

  /* ── Scheduled Notices Tab ── */
  function _loadScheduled() {
    var container = document.getElementById('scheduledNoticesContainer');
    if (!container) return;

    CoachingAPI.getScheduledNotices().then(function (data) {
      var list = data.scheduled || [];
      if (list.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏰</div>' +
          '<div class="empty-state-text">No scheduled notices.</div>' +
          '<div class="empty-state-hint">Use the Compose tab to schedule a notice for later.</div></div>';
        return;
      }

      var html = '';
      for (var i = 0; i < list.length; i++) {
        var n = list[i];
        var schedDate = n.scheduledFor ? new Date(n.scheduledFor) : null;
        var dateStr = schedDate ? schedDate.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

        html += '<div class="notice-history-card">';
        html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;">';
        html += '<div class="notice-history-title">' + CoachingUtils.escapeHtml(n.title) + '</div>';
        html += '<span class="badge" style="background:rgba(245,158,11,0.15);color:#f59e0b;font-size:var(--font-xs);">⏰ Pending</span>';
        html += '</div>';
        html += '<div class="notice-history-body">' + CoachingUtils.escapeHtml(CoachingUtils.truncate(n.body, 120)) + '</div>';
        html += '<div class="notice-history-meta">';
        html += '<span>📅 ' + dateStr + '</span>';
        html += '<button class="btn-cancel-scheduled" onclick="NoticesView.cancelScheduled(\'' + n.id + '\')">Cancel</button>';
        html += '</div></div>';
      }
      container.innerHTML = html;
    }).catch(function (err) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div>' +
        '<div class="empty-state-text">' + CoachingUtils.escapeHtml(CoachingUtils.getReadableError(err)) + '</div></div>';
    });
  }

  function cancelScheduled(noticeId) {
    if (!confirm('Cancel this scheduled notice?')) return;
    CoachingAPI.cancelScheduledNotice(noticeId).then(function () {
      Toast.success('Scheduled notice cancelled.');
      _loadScheduled();
    }).catch(function (err) {
      Toast.show('Failed to cancel: ' + CoachingUtils.getReadableError(err), 'error');
    });
  }

  /* ── History Tab ── */
  function _loadHistory(forceRefresh) {
    var historyEl = document.getElementById('noticeHistoryContainer');
    if (!historyEl) return;

    CoachingAPI.getNoticeHistory(forceRefresh).then(function (data) {
      var notices = data.notices || [];
      if (notices.length === 0) {
        historyEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div>' +
          '<div class="empty-state-text">No notices sent yet.</div>' +
          '<div class="empty-state-hint">Compose your first notice to get started.</div></div>';
        return;
      }

      var html = '';
      for (var i = 0; i < notices.length; i++) {
        var n = notices[i];
        html += '<div class="notice-history-card">';
        html += '<div class="notice-history-title">' + CoachingUtils.escapeHtml(n.title) + '</div>';
        html += '<div class="notice-history-body">' + CoachingUtils.escapeHtml(CoachingUtils.truncate(n.body, 120)) + '</div>';
        html += '<div class="notice-history-meta">';
        html += '<span>📨 ' + n.sent + ' delivered</span>';
        if (n.failed > 0) html += '<span style="color:var(--accent-red);">❌ ' + n.failed + ' failed</span>';
        html += '<span>' + CoachingUtils.getRelativeTime(n.timestamp) + '</span>';
        html += '</div></div>';
      }
      historyEl.innerHTML = html;
    }).catch(function (err) {
      historyEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div>' +
        '<div class="empty-state-text">' + CoachingUtils.escapeHtml(CoachingUtils.getReadableError(err)) + '</div></div>';
    });
  }

  function setTab(tab) {
    _currentTab = tab;
    render(tab === 'history');
  }

  function sendNudge(uid, name) {
    _targetUid = uid;
    _targetName = name;
    _targetTopic = null;
    app.navigate('notices');
    setTimeout(function() {
      var titleInput = document.getElementById('noticeTitle');
      var bodyInput = document.getElementById('noticeBody');
      if (titleInput) titleInput.value = 'We missed you! 🔔';
      if (bodyInput) bodyInput.value = 'Hi ' + (name || 'there') + ', we noticed you haven\'t practiced in a few days. Jump back in and protect your streak!';
      var titleCount = document.getElementById('noticeTitleCount');
      if (titleCount && titleInput) titleCount.textContent = titleInput.value.length + '/100';
      var bodyCount = document.getElementById('noticeBodyCount');
      if (bodyCount && bodyInput) bodyCount.textContent = bodyInput.value.length + '/500';
    }, 100);
  }

  function targetTopic(topic) {
    _targetTopic = topic;
    _targetUid = null;
    _targetName = null;
    app.navigate('notices');
    setTimeout(function() {
      var titleInput = document.getElementById('noticeTitle');
      var bodyInput = document.getElementById('noticeBody');
      if (titleInput) titleInput.value = 'Focus on ' + CoachingUtils.capitalize(topic) + ' 🎯';
      if (bodyInput) bodyInput.value = 'It looks like you could use some extra practice in ' + CoachingUtils.capitalize(topic) + '. Let\'s focus on improving that accuracy this week!';
      var titleCount = document.getElementById('noticeTitleCount');
      if (titleCount && titleInput) titleCount.textContent = titleInput.value.length + '/100';
      var bodyCount = document.getElementById('noticeBodyCount');
      if (bodyCount && bodyInput) bodyCount.textContent = bodyInput.value.length + '/500';
    }, 100);
  }

  function clearTarget() {
    _targetUid = null;
    _targetTopic = null;
    _targetName = null;
    render(false);
  }

  return { render: render, setTab: setTab, useTemplate: useTemplate, send: send, cancelScheduled: cancelScheduled, sendNudge: sendNudge, targetTopic: targetTopic, clearTarget: clearTarget };
})();
