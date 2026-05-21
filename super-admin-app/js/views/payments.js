/**
 * payments.js — Payments & Purchased Users view
 */
var PaymentsView = (function () {
  'use strict';

  /**
   * Convert any timestamp format to milliseconds for comparison.
   * Canonical: shared/constants/entitlements.js — TIMESTAMP STRATEGY
   * Handles: ISO 8601 strings, Unix ms (number), Date objects, Firestore Timestamps.
   */
  function _toMillis(ts) {
    if (!ts) return 0;
    if (typeof ts === 'number') return ts;
    if (typeof ts === 'string') {
      var parsed = Date.parse(ts);
      return isNaN(parsed) ? 0 : parsed;
    }
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts.toDate === 'function') {
      try { return ts.toDate().getTime(); } catch (_) { return 0; }
    }
    return 0;
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
            '<option value="premium">Premium Lifetime</option>' +
            '<option value="plus">Premium+ (Active)</option>' +
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
      _allUsers = await API.getUsers();
      _renderList();
    } catch (err) {
      console.error(err);
      var c = document.getElementById('paymentsListContainer');
      if (c) c.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Failed to load entitlement data.</div></div>';
    }
  }

  function _getEntitlementState(user) {
    var now = Date.now();
    var state = {
      type: 'none', // premium, plus, trial, none
      status: 'inactive', // active, expired
      expiry: null,
      source: user.coachingId ? 'coaching' : 'direct',
      paymentId: user.lastPremiumPlusPaymentId || user.lastPaymentId || null,
      plan: user.premiumPlusPlan || (user.isPremium ? 'lifetime' : null)
    };

    // Premium+ takes highest precedence (canonical order)
    if (user.isPremiumPlus) {
      state.type = 'plus';
      if (user.premiumPlusExpiry && _toMillis(user.premiumPlusExpiry) > now) {
        state.status = 'active';
        state.expiry = user.premiumPlusExpiry;
      } else if (user.premiumPlusExpiry) {
        state.status = 'expired';
        state.expiry = user.premiumPlusExpiry;
      }
      return state;
    }

    if (user.isPremium) {
      state.type = 'premium';
      state.status = 'active';
      return state;
    }


    if (user.isTrial) {
      state.type = 'trial';
      if (user.trialEnd && _toMillis(user.trialEnd) > now) {
        state.status = 'active';
        state.expiry = user.trialEnd;
      } else if (user.trialEnd) {
        state.status = 'expired';
        state.expiry = user.trialEnd;
      }
      return state;
    }

    // Check for explicit expiration statuses even if flags are false
    if (user.premiumPlusExpiry && _toMillis(user.premiumPlusExpiry) < now) {
      state.type = 'plus';
      state.status = 'expired';
      state.expiry = user.premiumPlusExpiry;
      return state;
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

      if (filterQ === 'premium' && item.state.type !== 'premium') return false;
      if (filterQ === 'plus' && (item.state.type !== 'plus' || item.state.status !== 'active')) return false;
      if (filterQ === 'trial' && (item.state.type !== 'trial' || item.state.status !== 'active')) return false;
      if (filterQ === 'expired' && item.state.status !== 'expired') return false;
      if (filterQ === 'coaching' && item.state.source !== 'coaching') return false;
      if (filterQ === 'direct' && item.state.source !== 'direct') return false;

      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💸</div><div class="empty-state-text">No users found matching the criteria.</div></div>';
      return;
    }

    // Sort: Active first, then by expiry (closest first), then premium lifetime
    filtered.sort(function(a, b) {
      if (a.state.status === 'active' && b.state.status !== 'active') return -1;
      if (a.state.status !== 'active' && b.state.status === 'active') return 1;
      
      if (a.state.expiry && b.state.expiry) return b.state.expiry - a.state.expiry; // Most recent first
      if (a.state.type === 'premium') return -1;
      return 1;
    });

    var html = '';
    filtered.forEach(function(item) {
      var u = item.user;
      var s = item.state;
      var name = u.displayName || 'Unknown User';
      var email = u.email || 'No email';
      
      var badgeClass = 'badge-free';
      var badgeText = 'Unknown';
      if (s.type === 'premium') { badgeClass = 'badge-premium'; badgeText = 'Lifetime'; }
      if (s.type === 'plus') { badgeClass = 'badge-premium-plus'; badgeText = 'Premium+'; }
      if (s.type === 'trial') { badgeClass = 'badge-draft'; badgeText = 'Trial'; }

      var statusBadge = '';
      if (s.status === 'active') statusBadge = '<span class="badge badge-active" style="margin-left:.5rem;">Active</span>';
      else statusBadge = '<span class="badge badge-archived" style="margin-left:.5rem;">Expired</span>';

      var expiryStr = 'Lifetime';
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
  }

  function _escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function(m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }

  return { render: render };
})();
