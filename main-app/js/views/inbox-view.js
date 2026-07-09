/**
 * inbox-view.js — Handles the Notification Center drawer
 */
var InboxView = (function () {
  'use strict';

  var _notifications = [];
  var _unreadCount = 0;
  var _isOpen = false;
  var _initialized = false;

  /* i18n (ADR-111): app-language channel; guarded for load order. */
  function _t(key, params) { return (typeof QRI18n !== 'undefined') ? QRI18n.t(key, params) : key; }

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
    if (interval > 1) return _t('inbox.agoYears', { n: Math.floor(interval) });
    interval = seconds / 2592000;
    if (interval > 1) return _t('inbox.agoMonths', { n: Math.floor(interval) });
    interval = seconds / 86400;
    if (interval > 1) return _t('inbox.agoDays', { n: Math.floor(interval) });
    interval = seconds / 3600;
    if (interval > 1) return _t('inbox.agoHours', { n: Math.floor(interval) });
    interval = seconds / 60;
    if (interval > 1) return _t('inbox.agoMins', { n: Math.floor(interval) });
    return _t('inbox.justNow');
  }

  function renderList() {
    var listEl = document.getElementById('inboxList');
    var markAllBtn = document.getElementById('inboxMarkAllBtn');
    if (!listEl) return;

    if (markAllBtn) {
      markAllBtn.style.display = _unreadCount > 0 ? 'block' : 'none';
    }

    if (_notifications.length === 0) {
      listEl.innerHTML = '<div class="empty-state" style="padding:3rem 1rem; text-align:center;">' +
        '<div class="empty-state-icon" style="font-size:3rem; margin-bottom:1rem; opacity:0.5;">📭</div>' +
        '<div class="empty-state-text" style="color:var(--text-secondary);">' + ((typeof QRI18n !== 'undefined') ? QRI18n.t('modals.inboxEmpty') : 'You\'re all caught up! No new notifications.') + '</div>' +
        '</div>';
      return;
    }

    var html = '';
    _notifications.forEach(function(n) {
      var bg = n.isRead ? 'var(--bg-surface)' : 'var(--bg-elevated)';
      var weight = n.isRead ? '500' : '700';
      var border = n.isRead ? '1px solid var(--border-color)' : '1px solid var(--qr-danger, #ef4444)';

      // ADR-066: prefer the pipeline-provided icon; fall back to a type/category guess for older docs.
      var icon = n.icon || ({ direct_message: '💬', topic_nudge: '🎯' })[n.type] || _catMeta(n.category).icon;
      var cat = _catMeta(n.category);
      var unreadDot = n.isRead ? '' : '<span style="width:8px;height:8px;border-radius:50%;background:var(--qr-danger,#ef4444);flex-shrink:0;"></span>';

      html += '<div class="notification-card" data-id="' + n.id + '" data-link="' + _escapeHtml(n.deepLink || '') + '" style="background:' + bg + '; border:' + border + '; border-radius:var(--radius-lg); padding:1rem; cursor:pointer; transition:transform 0.15s, background 0.2s;">';
      html += '  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem; gap:0.5rem;">';
      html += '    <span style="display:inline-flex; align-items:center; gap:0.35rem; font-size:0.66rem; font-weight:700; text-transform:uppercase; letter-spacing:0.03em; color:' + cat.color + '; background:' + cat.bg + '; padding:0.12rem 0.5rem; border-radius:999px;">' + cat.label + '</span>';
      html += '    <span style="display:flex;align-items:center;gap:0.4rem;"><span style="font-size:0.72rem; color:var(--text-muted); white-space:nowrap;">' + timeAgo(n.timestamp) + '</span>' + unreadDot + '</span>';
      html += '  </div>';
      html += '  <div style="font-weight:' + weight + '; color:var(--text-primary); font-size:0.9375rem; display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">' + icon + ' ' + _escapeHtml(n.title) + '</div>';
      html += '  <div style="font-size:0.875rem; color:var(--text-secondary); line-height:1.4;">' + _escapeHtml(n.body) + '</div>';
      html += '</div>';
    });

    listEl.innerHTML = html;

    // Tap = mark read + route via the ONE notification-routing seam (ADR-066).
    var cards = listEl.querySelectorAll('.notification-card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        markAsRead(id);
        var n = null;
        for (var j = 0; j < _notifications.length; j++) { if (_notifications[j].id === id) { n = _notifications[j]; break; } }
        _routeNotification(n);
      });
    }
  }

  // The single place that decides what tapping a notification does. Keying on the notification's type/metadata
  // (not just a raw hash) keeps routing future-proof: when Duel History ships, the `duel` branch becomes a
  // navigation to '#duel-history' (using n.metadata.code) with NO other change.
  function _routeNotification(n) {
    if (!n) return;
    try { if (typeof close === 'function') close(); } catch (_) {}
    // Finished-duel notifications point at a duel session that no longer exists — never navigate to a dead/blank
    // duel view. For now show a toast; the architecture (type 'duel' + metadata.code) is ready for Duel History.
    if (n.type === 'duel') {
      try { if (typeof showToast === 'function') showToast((typeof QRI18n !== 'undefined') ? QRI18n.t('duel.historySoon') : 'Duel history will be available soon.'); } catch (_) {}
      return;
    }
    var link = n.deepLink || '';
    if (link) { try { location.hash = link.charAt(0) === '#' ? link : '#' + link; } catch (_) {} }
  }

  // ADR-066: category → badge presentation (label + colour). Keeps the inbox scannable + premium.
  function _catMeta(category) {
    var m = {
      system:   { label: _t('inbox.catSystem'),   icon: '🔔', color: '#475569', bg: 'rgba(100,116,139,.14)' },
      reminder: { label: _t('inbox.catReminder'), icon: '⏰', color: '#b45309', bg: 'rgba(217,119,6,.14)' },
      coaching: { label: _t('inbox.catCoaching'), icon: '🎓', color: '#7c3aed', bg: 'rgba(124,58,237,.14)' },
      social:   { label: _t('inbox.catDuel'),     icon: '⚔️', color: '#db2777', bg: 'rgba(219,39,119,.14)' },
      billing:  { label: _t('inbox.catBilling'),  icon: '💳', color: '#047857', bg: 'rgba(16,185,129,.14)' },
      ai:       { label: _t('inbox.catCoach'),    icon: '🧠', color: '#2563eb', bg: 'rgba(37,99,235,.14)' }
    };
    return m[category] || m.system;
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
