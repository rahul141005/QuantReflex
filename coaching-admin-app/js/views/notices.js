/**
 * notices.js — Coaching Notices View
 *
 * Compose and send notices to coaching students.
 * Quick templates, character count, delivery stats.
 * History tab shows past notices.
 */
var NoticesView = (function () {
  'use strict';

  var _currentTab = 'compose';

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
    }
  }

  function _buildView() {
    var html = '';

    /* Tabs */
    html += '<div class="tab-group">';
    html += '<button class="tab-pill' + (_currentTab === 'compose' ? ' active' : '') + '" onclick="NoticesView.setTab(\'compose\')">✏️ Compose</button>';
    html += '<button class="tab-pill' + (_currentTab === 'history' ? ' active' : '') + '" onclick="NoticesView.setTab(\'history\')">📋 History</button>';
    html += '</div>';

    if (_currentTab === 'compose') {
      html += _buildCompose();
    } else {
      html += '<div id="noticeHistoryContainer">' + CoachingUtils.skeletonCard(3) + '</div>';
    }

    return html;
  }

  function _buildCompose() {
    var html = '';

    /* Quick Templates */
    html += '<div class="card-title">Quick Templates</div>';
    html += '<div class="template-grid">';
    for (var i = 0; i < TEMPLATES.length; i++) {
      var t = TEMPLATES[i];
      html += '<button class="template-btn" onclick="NoticesView.useTemplate(' + i + ')">' + t.emoji + ' ' + t.label + '</button>';
    }
    html += '</div>';

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
    html += '<div id="noticeSendError" class="auth-error"></div>';
    html += '<button id="noticeSendBtn" class="btn btn-primary btn-full" onclick="NoticesView.send()">📨 Send Notice</button>';
    html += '</div>';

    return html;
  }

  function _bindEvents() {
    var titleInput = document.getElementById('noticeTitle');
    var bodyInput = document.getElementById('noticeBody');

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

    var title = titleInput ? titleInput.value.trim() : '';
    var body = bodyInput ? bodyInput.value.trim() : '';

    if (!title || !body) {
      if (errorEl) { errorEl.textContent = 'Both title and message are required.'; errorEl.style.display = 'block'; }
      return;
    }

    if (errorEl) errorEl.style.display = 'none';
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    CoachingAPI.sendNotice(title, body).then(function (data) {
      if (btn) { btn.disabled = false; btn.textContent = '📨 Send Notice'; }
      Toast.success('Notice sent! Delivered to ' + (data.sent || 0) + ' student' + (data.sent !== 1 ? 's' : '') + '.');
      if (titleInput) titleInput.value = '';
      if (bodyInput) bodyInput.value = '';
      var titleCount = document.getElementById('noticeTitleCount');
      var bodyCount = document.getElementById('noticeBodyCount');
      if (titleCount) titleCount.textContent = '0/100';
      if (bodyCount) bodyCount.textContent = '0/500';
    }).catch(function (err) {
      if (btn) { btn.disabled = false; btn.textContent = '📨 Send Notice'; }
      if (errorEl) { errorEl.textContent = CoachingUtils.getReadableError(err); errorEl.style.display = 'block'; }
    });
  }

  function _loadHistory(forceRefresh) {
    var historyEl = document.getElementById('noticeHistoryContainer');
    if (!historyEl) return;

    CoachingAPI.getNoticeHistory(forceRefresh).then(function (data) {
      var notices = data.notices || [];
      if (notices.length === 0) {
        historyEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div>' +
          '<div class="empty-state-text">No notices sent yet.</div></div>';
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

  return { render: render, setTab: setTab, useTemplate: useTemplate, send: send };
})();
