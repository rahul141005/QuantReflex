/**
 * payments.js — Payments & Purchased Users view
 */
var PaymentsView = (function () {
  'use strict';

  /**
   * Convert any timestamp format to milliseconds for comparison.
   * Uses centralized AdminUtils.
   */
  function _toMillis(ts) {
    return AdminUtils.toMillis(ts);
  }

  var _allUsers = [];

  async function render() {
    var container = document.getElementById('view-payments');
    container.innerHTML =
      '<div class="view-header">' +
        '<h2 class="view-title">Payments & Entitlements</h2>' +
        '<p class="view-subtitle">Inspect user purchases, active plans, and Razorpay transactions</p>' +
      '</div>' +
      
      '<div class="card" style="margin-bottom:1.5rem;">' +
        '<div style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:center;">' +
          '<div style="flex:1;min-width:200px;">' +
            '<input type="text" id="paySearch" class="search-input" style="width:100%;margin:0;" placeholder="Search by name, email, or Payment ID..." />' +
          '</div>' +
          '<select id="payFilter" class="modal-select" style="width:auto;min-width:180px;">' +
            '<option value="all">All Entitled Users</option>' +
            '<option value="premium">Premium (Active)</option>' +
            '<option value="trial">Active Trials</option>' +
            '<option value="expired">Expired Plans</option>' +
            '<option value="coaching">Coaching Granted</option>' +
            '<option value="direct">Direct Purchases (Razorpay)</option>' +
          '</select>' +
        '</div>' +
      '</div>' +

      '<div id="paymentsListContainer" style="display:flex;flex-direction:column;gap:1rem;">' +
        '<div class="loading">Loading entitlements...</div>' +
      '</div>';

    _bindEvents();
    await _loadData();
  }

  function _bindEvents() {
    var search = document.getElementById('paySearch');
    var filter = document.getElementById('payFilter');

    if (search) search.addEventListener('input', _renderList);
    if (filter) filter.addEventListener('change', _renderList);
  }

  async function _loadData() {
    try {
      var res = await API.getUsers();
      _allUsers = res.data || res.users || (Array.isArray(res) ? res : []);
      _renderList();
    } catch (err) {
      console.error(err);
      var c = document.getElementById('paymentsListContainer');
      if (c) c.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Failed to load entitlement data: ' + AdminUtils.getReadableError(err) + '</div></div>';
    }
  }

  function _getEntitlementState(user) {
    var now = Date.now();
    var state = {
      type: 'none', // premium, trial, none
      status: 'inactive', // active, expired
      expiry: null,
      source: user.planSource || (user.coachingId ? 'coaching' : 'direct'),
      paymentId: user.lastPaymentId || null,
      plan: user.planType || null
    };

    if (user.plan === 'premium') {
      var active = !user.planExpiry || _toMillis(user.planExpiry) > now;
      if (user.isTrial) {
        state.type = 'trial';
        state.expiry = user.trialEnd || user.planExpiry || null;
      } else {
        state.type = 'premium';
        state.expiry = user.planExpiry || null;
      }
      state.status = active ? 'active' : 'expired';
    }

    return state;
  }

  function _renderList() {
    var container = document.getElementById('paymentsListContainer');
    if (!container) return;

    var searchQ = (document.getElementById('paySearch').value || '').toLowerCase();
    var filterQ = document.getElementById('payFilter').value;

    var filtered = _allUsers.map(function(u) {
      return { user: u, state: _getEntitlementState(u) };
    }).filter(function(item) {
      if (item.state.type === 'none') return false; // Ignore completely free users with no history

      var u = item.user;
      var matchesSearch = (u.displayName && u.displayName.toLowerCase().indexOf(searchQ) > -1) ||
                          (u.email && u.email.toLowerCase().indexOf(searchQ) > -1) ||
                          (item.state.paymentId && item.state.paymentId.toLowerCase().indexOf(searchQ) > -1);
      if (!matchesSearch) return false;

      if (filterQ === 'premium' && (item.state.type !== 'premium' || item.state.status !== 'active')) return false;
      if (filterQ === 'trial' && (item.state.type !== 'trial' || item.state.status !== 'active')) return false;
      if (filterQ === 'expired' && item.state.status !== 'expired') return false;
      if (filterQ === 'coaching' && item.state.source !== 'coaching') return false;
      if (filterQ === 'direct' && item.state.source === 'coaching') return false;

      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💸</div><div class="empty-state-text">No users found matching the criteria.</div></div>';
      return;
    }

    // Sort: Active first, then by expiry (most recent first)
    filtered.sort(function(a, b) {
      if (a.state.status === 'active' && b.state.status !== 'active') return -1;
      if (a.state.status !== 'active' && b.state.status === 'active') return 1;
      
      if (a.state.expiry && b.state.expiry) return _toMillis(b.state.expiry) - _toMillis(a.state.expiry); // Most recent first
      return 0;
    });

    var html = '';
    filtered.forEach(function(item) {
      var u = item.user;
      var s = item.state;
      var name = u.displayName || 'Unknown User';
      var email = u.email || 'No email';
      
      var badgeClass = 'badge-free';
      var badgeText = 'Unknown';
      if (s.type === 'premium') { badgeClass = 'badge-premium'; badgeText = s.plan === 'premium_12m' ? 'Premium · 12m' : (s.plan === 'premium_6m' ? 'Premium · 6m' : 'Premium'); }
      if (s.type === 'trial') { badgeClass = 'badge-draft'; badgeText = 'Trial'; }

      var statusBadge = '';
      if (s.status === 'active') statusBadge = '<span class="badge badge-active" style="margin-left:.5rem;">Active</span>';
      else statusBadge = '<span class="badge badge-archived" style="margin-left:.5rem;">Expired</span>';

      var expiryStr = '—';
      if (s.expiry) {
        expiryStr = new Date(s.expiry).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      }

      var sourceText = s.source === 'coaching' ? '🏢 Coaching ID: ' + u.coachingId : '💳 Direct Purchase';
      var paymentStr = s.paymentId ? 'RZP: ' + s.paymentId : 'No Payment ID (Org Grant)';

      html += '<div class="card" style="padding:1.25rem;margin-bottom:0;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem;margin-bottom:1rem;">' +
          '<div style="flex:1;min-width:150px;">' +
            '<h3 style="font-size:1.0625rem;font-weight:700;color:#0f172a;margin-bottom:.25rem;word-break:break-word;overflow-wrap:anywhere;">' + _escapeHtml(name) + '</h3>' +
            '<p class="text-secondary text-sm" style="word-break:break-word;overflow-wrap:anywhere;">' + _escapeHtml(email) + '</p>' +
          '</div>' +
          '<div>' +
            '<span class="badge ' + badgeClass + '">' + badgeText + '</span>' +
            statusBadge +
          '</div>' +
        '</div>' +
        '<div style="background:#f8fafc;border-radius:.75rem;padding:1rem;font-size:.8125rem;display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:1rem;">' +
          '<div><div style="color:#64748b;font-weight:600;margin-bottom:.25rem;text-transform:uppercase;font-size:.6875rem;letter-spacing:.04em;">Source</div><div style="font-weight:500;color:#0f172a;">' + sourceText + '</div></div>' +
          '<div><div style="color:#64748b;font-weight:600;margin-bottom:.25rem;text-transform:uppercase;font-size:.6875rem;letter-spacing:.04em;">Expiry</div><div style="font-weight:500;color:#0f172a;">' + expiryStr + '</div></div>' +
          '<div><div style="color:#64748b;font-weight:600;margin-bottom:.25rem;text-transform:uppercase;font-size:.6875rem;letter-spacing:.04em;">Transaction Ref</div><div style="font-weight:500;color:#0f172a;font-family:monospace;">' + paymentStr + '</div></div>' +
        '</div>' +
      '</div>';
    });

    container.innerHTML = html;
    _renderAuditLogs();
  }

  async function _renderAuditLogs() {
    var container = document.getElementById('paymentsListContainer');
    try {
      var logs = await API.getPaymentLogs();
      if (!logs || logs.length === 0) return;

      var html = '<h3 style="margin-top:2rem;">Recent Entitlement Actions</h3>';
      html += '<div style="background:#fff; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,0.1); overflow:hidden;">';
      html += '<table style="width:100%; text-align:left; border-collapse:collapse; font-size:0.875rem;">';
      html += '<tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0;">' +
        '<th style="padding:1rem;">Timestamp</th>' +
        '<th style="padding:1rem;">User ID</th>' +
        '<th style="padding:1rem;">Action</th>' +
        '<th style="padding:1rem;">Admin</th>' +
        '</tr>';

      logs.forEach(function(l) {
        var ts = AdminUtils.formatDateTime(l.timestamp);
        html += '<tr style="border-bottom:1px solid #f1f5f9;">' +
          '<td style="padding:1rem;">' + ts + '</td>' +
          '<td style="padding:1rem; font-family:monospace;">' + AdminUtils.escapeHtml(l.uid) + '</td>' +
          '<td style="padding:1rem; font-weight:600;">' + AdminUtils.escapeHtml(l.action) + '</td>' +
          '<td style="padding:1rem;">' + AdminUtils.escapeHtml(l.adminUid || 'System') + '</td>' +
          '</tr>';
      });

      html += '</table></div>';
      container.innerHTML += html;

    } catch (e) {
      console.error(e);
    }
  }

  function _escapeHtml(str) {
    return AdminUtils.escapeHtml(str);
  }

  return { render: render };
})();
