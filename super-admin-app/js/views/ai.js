/**
 * ai.js — AI Usage Analytics view
 */
var AIAnalyticsView = (function () {
  'use strict';

  async function render() {
    var container = document.getElementById('view-ai');
    container.innerHTML =
      '<div class="view-header">' +
        '<h2 class="view-title">AI Cost Analytics</h2>' +
        '<p class="view-subtitle">Track token usage, monitor feature costs, and identify top consumers</p>' +
      '</div>' +
      
      '<div id="aiAnalyticsSummary" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:1rem;margin-bottom:1.5rem;"></div>' +
      
      '<div class="card" style="margin-bottom:1.5rem;">' +
        '<div style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:center;">' +
          '<div style="flex:1;min-width:200px;">' +
            '<input type="text" id="aiSearch" class="search-input" style="width:100%;margin:0;" placeholder="Search by name, email, or coaching ID..." />' +
          '</div>' +
          '<select id="aiFilter" class="modal-select" style="width:auto;min-width:180px;">' +
            '<option value="cost_desc">Sort by Cost (High → Low)</option>' +
            '<option value="calls_desc">Sort by API Calls (High → Low)</option>' +
          '</select>' +
        '</div>' +
      '</div>' +

      '<div id="aiListContainer" style="display:flex;flex-direction:column;gap:1rem;">' +
        '<div class="loading">Calculating operational AI costs...</div>' +
      '</div>';

    _bindEvents();
    await _loadData();
  }

  var _allData = [];

  function _bindEvents() {
    var search = document.getElementById('aiSearch');
    var filter = document.getElementById('aiFilter');

    if (search) search.addEventListener('input', _renderList);
    if (filter) filter.addEventListener('change', _renderList);
  }

  async function _loadData() {
    try {
      var res = await API.getAIUsage();
      _allData = res.analytics || [];
      _renderSummary();
      _renderList();
    } catch (err) {
      console.error(err);
      var c = document.getElementById('aiListContainer');
      if (c) c.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Failed to load AI usage analytics.</div></div>';
    }
  }

  function _renderSummary() {
    var container = document.getElementById('aiAnalyticsSummary');
    if (!container) return;

    var totalCost = 0;
    var totalTokens = 0;
    var totalUsers = _allData.length;

    _allData.forEach(function(u) {
      totalCost += parseFloat(u.totalEstimatedCost);
      totalTokens += u.totalEstimatedTokens;
    });

    container.innerHTML = 
      '<div class="card" style="padding:1.25rem;text-align:center;">' +
        '<div style="font-size:1.75rem;font-weight:800;color:#0f172a;margin-bottom:.25rem;">$' + totalCost.toFixed(2) + '</div>' +
        '<div style="font-size:.75rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">Est. Total Cost</div>' +
      '</div>' +
      '<div class="card" style="padding:1.25rem;text-align:center;">' +
        '<div style="font-size:1.75rem;font-weight:800;color:#0f172a;margin-bottom:.25rem;">' + totalTokens.toLocaleString() + '</div>' +
        '<div style="font-size:.75rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">Est. Total Tokens</div>' +
      '</div>' +
      '<div class="card" style="padding:1.25rem;text-align:center;">' +
        '<div style="font-size:1.75rem;font-weight:800;color:#0f172a;margin-bottom:.25rem;">' + totalUsers + '</div>' +
        '<div style="font-size:.75rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">Active AI Consumers</div>' +
      '</div>';
  }

  function _renderList() {
    var container = document.getElementById('aiListContainer');
    if (!container) return;

    var searchQ = (document.getElementById('aiSearch').value || '').toLowerCase();
    var filterQ = document.getElementById('aiFilter').value;

    var filtered = _allData.filter(function(u) {
      var matchesSearch = (u.username && u.username.toLowerCase().indexOf(searchQ) > -1) ||
                          (u.email && u.email.toLowerCase().indexOf(searchQ) > -1) ||
                          (u.coachingId && u.coachingId.toLowerCase().indexOf(searchQ) > -1);
      return matchesSearch;
    });

    if (filterQ === 'cost_desc') {
      filtered.sort(function(a, b) { return parseFloat(b.totalEstimatedCost) - parseFloat(a.totalEstimatedCost); });
    } else if (filterQ === 'calls_desc') {
      filtered.sort(function(a, b) { return b.totalCalls - a.totalCalls; });
    }

    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🤖</div><div class="empty-state-text">No AI usage found matching the criteria.</div></div>';
      return;
    }

    var html = '';
    filtered.forEach(function(u) {
      var badgeClass = u.isPremium ? 'badge-premium' : 'badge-free';
      var badgeText = u.isPremium ? 'Paid Access' : 'Free User';

      html += '<div class="card" style="padding:1.25rem;margin-bottom:0;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem;margin-bottom:1rem;">' +
          '<div style="flex:1;min-width:150px;">' +
            '<h3 style="font-size:1.0625rem;font-weight:700;color:#0f172a;margin-bottom:.25rem;word-break:break-word;overflow-wrap:anywhere;">' + _escapeHtml(u.username) + '</h3>' +
            '<p class="text-secondary text-sm" style="word-break:break-word;overflow-wrap:anywhere;">' + _escapeHtml(u.email) + ' • Coaching: ' + _escapeHtml(u.coachingId) + '</p>' +
          '</div>' +
          '<div style="text-align:right;">' +
            '<div style="font-size:1.125rem;font-weight:700;color:#dc2626;">$' + parseFloat(u.totalEstimatedCost).toFixed(4) + '</div>' +
            '<span class="badge ' + badgeClass + '" style="margin-top:.25rem;">' + badgeText + '</span>' +
          '</div>' +
        '</div>' +
        '<div style="background:#f8fafc;border-radius:.75rem;padding:1rem;font-size:.8125rem;display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:1rem;">' +
          '<div><div style="color:#64748b;font-weight:600;margin-bottom:.25rem;text-transform:uppercase;font-size:.6875rem;letter-spacing:.04em;">Word Problems</div><div style="font-weight:600;color:#0f172a;">' + u.totalWP + ' calls</div></div>' +
          '<div><div style="color:#64748b;font-weight:600;margin-bottom:.25rem;text-transform:uppercase;font-size:.6875rem;letter-spacing:.04em;">Explanations</div><div style="font-weight:600;color:#0f172a;">' + u.totalExp + ' calls</div></div>' +
          '<div><div style="color:#64748b;font-weight:600;margin-bottom:.25rem;text-transform:uppercase;font-size:.6875rem;letter-spacing:.04em;">Est. Tokens</div><div style="font-weight:600;color:#0f172a;">' + u.totalEstimatedTokens.toLocaleString() + ' tokens</div></div>' +
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
