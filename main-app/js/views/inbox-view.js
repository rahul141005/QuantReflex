/**
 * inbox-view.js — Handles the Notification Center drawer
 */
var InboxView = (function () {
  'use strict';

  var _notifications = [];
  var _unreadCount = 0;
  var _isOpen = false;
  var _initialized = false;

  function init() {
    if (_initialized) return;
    
    var bellBtn = document.getElementById('inboxBellBtn');
    var closeBtn = document.getElementById('closeInboxBtn');
    var markAllBtn = document.getElementById('inboxMarkAllBtn');
    var overlay = document.getElementById('inboxDrawerOverlay');
    var drawer = document.getElementById('inboxDrawer');

    if (bellBtn) {
      bellBtn.addEventListener('click', function(e) {
        e.preventDefault();
        open();
      });
    }

    if (closeBtn) closeBtn.addEventListener('click', close);
    
    if (overlay && drawer) {
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) close();
      });
    }

    if (markAllBtn) {
      markAllBtn.addEventListener('click', function() {
        markAsRead('all');
      });
    }

    // Refresh notifications when the app becomes visible again
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    });

    _initialized = true;
    refresh();
  }

  function open() {
    var overlay = document.getElementById('inboxDrawerOverlay');
    var drawer = document.getElementById('inboxDrawer');
    if (!overlay || !drawer) return;

    _isOpen = true;
    overlay.style.display = 'block';
    drawer.style.display = 'flex';
    
    // Force reflow before animating
    void drawer.offsetWidth;
    drawer.style.right = '0';
    
    renderList();
  }

  function close() {
    var overlay = document.getElementById('inboxDrawerOverlay');
    var drawer = document.getElementById('inboxDrawer');
    if (!overlay || !drawer) return;

    _isOpen = false;
    drawer.style.right = '-400px';
    
    setTimeout(function() {
      if (!_isOpen) { // Double check it hasn't been reopened during animation
        overlay.style.display = 'none';
        drawer.style.display = 'none';
      }
    }, 300); // Matches CSS transition time
  }

  function refresh() {
    if (typeof FirestoreSync === 'undefined' || !FirestoreSync.getNotifications) return;
    
    // Realtime listener
    if (FirestoreSync.listenForNotifications) {
      FirestoreSync.listenForNotifications(function(data) {
        _notifications = data.notifications || [];
        _unreadCount = data.unreadCount || 0;
        updateBadge();
        if (_isOpen) renderList();
      });
    }
  }

  function markAsRead(id) {
    if (typeof FirestoreSync === 'undefined' || !FirestoreSync.markNotificationRead) return;

    // Optimistic UI update
    if (id === 'all') {
      _unreadCount = 0;
      _notifications.forEach(function(n) { n.isRead = true; });
    } else {
      var n = _notifications.find(function(n) { return n.id === id; });
      if (n && !n.isRead) {
        n.isRead = true;
        _unreadCount = Math.max(0, _unreadCount - 1);
      }
    }
    
    updateBadge();
    if (_isOpen) renderList();

    // Persist to backend
    FirestoreSync.markNotificationRead(id, function(err) {
      if (err) {
        console.warn('Failed to mark notification read:', err);
        refresh(); // Rollback on failure
      }
    });
  }

  function updateBadge() {
    var badge = document.getElementById('inboxUnreadBadge');
    if (!badge) return;

    if (_unreadCount > 0) {
      badge.textContent = _unreadCount > 9 ? '9+' : _unreadCount;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  function timeAgo(dateString) {
    if (!dateString) return '';
    var date = new Date(dateString);
    var seconds = Math.floor((new Date() - date) / 1000);
    var interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + ' years ago';
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + ' months ago';
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + 'd ago';
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + 'h ago';
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + 'm ago';
    return 'Just now';
  }

  function renderList() {
    var listEl = document.getElementById('inboxList');
    var markAllBtn = document.getElementById('inboxMarkAllBtn');
    if (!listEl) return;

    if (markAllBtn) {
      markAllBtn.style.display = _unreadCount > 0 ? 'block' : 'none';
    }

    if (_notifications.length === 0) {
      listEl.innerHTML = '<div class="qr-empty-state">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>' +
        '<h2>You\'re all caught up!</h2>' +
        '<p>No new notifications at this time.</p>' +
        '</div>';
      return;
    }

    var html = '';
    _notifications.forEach(function(n) {
      var bg = n.isRead ? 'var(--bg-surface)' : 'var(--bg-elevated)';
      var weight = n.isRead ? '500' : '700';
      var border = n.isRead ? '1px solid var(--border-color)' : '1px solid var(--accent-primary, #ef4444)';
      
      var icon = '🔔';
      if (n.type === 'direct_message') icon = '💬';
      if (n.type === 'topic_nudge') icon = '🎯';

      html += '<div class="notification-card" data-id="' + n.id + '" style="background:' + bg + '; border:' + border + '; border-radius:var(--radius-lg); padding:1rem; cursor:pointer; transition:transform 0.2s, background 0.2s;">';
      html += '  <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem; gap:0.5rem;">';
      html += '    <div style="font-weight:' + weight + '; color:var(--text-primary); font-size:0.9375rem; display:flex; align-items:center; gap:0.5rem;">' + icon + ' ' + _escapeHtml(n.title) + '</div>';
      html += '    <div style="font-size:0.75rem; color:var(--text-muted); white-space:nowrap; flex-shrink:0;">' + timeAgo(n.timestamp) + '</div>';
      html += '  </div>';
      html += '  <div style="font-size:0.875rem; color:var(--text-secondary); line-height:1.4;">' + _escapeHtml(n.body) + '</div>';
      html += '</div>';
    });

    listEl.innerHTML = html;

    // Attach click listeners to cards
    var cards = listEl.querySelectorAll('.notification-card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        markAsRead(id);
      });
    }
  }

  function _escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function(m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }

  return {
    init: init,
    open: open,
    close: close,
    refresh: refresh
  };
})();
