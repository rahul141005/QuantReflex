/**
 * dashboard.js — Realtime System Health Center
 */
var DashboardView = (function () {
  'use strict';

  function render() {
    var container = document.getElementById('view-dashboard');
    container.innerHTML =
      '<div class="view-header">' +
        '<h2 class="view-title">System Health & Operations</h2>' +
        '<p class="view-subtitle">Realtime ecosystem observability</p>' +
      '</div>' +
      '<div id="dashboardContent">Loading metrics...</div>';

    _loadData();
  }

  function _statCard(value, label, color) {
    var style = color ? 'border-left: 4px solid ' + color + ';' : '';
    return '<div class="stat-card" style="' + style + '"><div class="stat-value">' + value + '</div><div class="stat-label">' + label + '</div></div>';
  }

  function _healthBadge(label, status) {
    var color = status === 'green' ? '#10b981' : (status === 'yellow' ? '#f59e0b' : '#ef4444');
    return '<div style="display:flex; align-items:center; gap:8px; padding:8px; background:#1e293b; border-radius:6px; font-size:14px;">' +
      '<div style="width:10px; height:10px; border-radius:50%; background:' + color + '"></div>' +
      '<span>' + label + '</span>' +
      '</div>';
  }

  async function _loadData() {
    try {
      var data = await API.getDashboard();
      var content = document.getElementById('dashboardContent');
      if (content && data) {
        var m = data.metrics || {};
        var ai = data.ai || {};
        var h = data.health || {};

        var html = '<h3>User Lifecycle</h3>' +
          '<div class="stat-grid" style="margin-bottom:24px;">' +
          _statCard(m.totalUsers || 0, 'Total Users') +
          _statCard(m.dau || 0, 'DAU (24h)', '#3b82f6') +
          _statCard(m.mau || 0, 'MAU (30d)', '#3b82f6') +
          _statCard(m.premiumUsers || 0, 'Premium', '#f59e0b') +
          _statCard(m.premiumPlusUsers || 0, 'Premium+', '#8b5cf6') +
          '</div>';

        var tokensToday = ai.tokensToday || 0;
        var costToday = ai.costTodayUSD || 0;
        var orphanDuels = m.orphanDuels || 0;

        html += '<h3>System Operations</h3>' +
          '<div class="stat-grid" style="margin-bottom:24px;">' +
          _statCard(tokensToday > 0 ? (tokensToday / 1000).toFixed(1) + 'k' : '0', 'AI Tokens (Today)') +
          _statCard('$' + (typeof costToday === 'number' ? costToday.toFixed(2) : '0.00'), 'AI Cost (Today USD)', '#ef4444') +
          _statCard(orphanDuels, 'Orphaned Duels', orphanDuels > 0 ? '#ef4444' : '#10b981') +
          '</div>';
        
        html += '<h3>Infrastructure Health</h3>' +
          '<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:12px;">' +
          _healthBadge('Firebase Auth', h.firebaseAuth || 'green') +
          _healthBadge('Firestore', h.firestore || 'green') +
          _healthBadge('AI API (OpenAI)', h.aiApi || 'yellow') +
          _healthBadge('Webhooks', h.webhooks || 'green') +
          '</div>';

        content.innerHTML = html;
        AdminState.set({ dashboardData: data });
      }
    } catch (e) {
      console.error('[Dashboard] Load error:', e);
      var content = document.getElementById('dashboardContent');
      if (content) content.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Failed to load system health: ' + AdminUtils.getReadableError(e) + '</div></div>';
    }
  }

  return { render: render };
})();
