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
          _statCard(m.trialUsers || 0, 'Trials', '#8b5cf6') +
          '</div>';

        var orphanDuels = m.orphanDuels || 0;
        var costUSD = parseFloat(ai.costUSD || 0) || 0;
        var tokensTotal = (ai.tokensInput || 0) + (ai.tokensOutput || 0);
        var gptCalls = ai.gptCalls || 0;

        html += '<h3>Revenue</h3>' +
          '<div class="stat-grid" style="margin-bottom:24px;">' +
          _statCard('₹' + (m.revenueTotalINR || 0).toLocaleString('en-IN'), 'Revenue (Lifetime)', '#10b981') +
          _statCard('₹' + (m.revenueTodayINR || 0).toLocaleString('en-IN'), 'Revenue (Today)', '#10b981') +
          _statCard(m.revenue6mCount || 0, '6-Month Plans', '#3b82f6') +
          _statCard(m.revenue12mCount || 0, '12-Month Plans', '#3b82f6') +
          _statCard(m.newToday || 0, 'New Signups (Today)', '#8b5cf6') +
          '</div>';

        html += '<h3>AI Cost (GPT)</h3>' +
          '<div class="stat-grid" style="margin-bottom:24px;">' +
          _statCard('$' + costUSD.toFixed(4), 'Est. Cost (Today USD)', '#ef4444') +
          _statCard(tokensTotal > 0 ? (tokensTotal / 1000).toFixed(1) + 'k' : '0', 'Tokens (Today)') +
          _statCard(gptCalls, 'GPT Calls (Today)') +
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
