/**
 * dashboard.js — Dashboard view
 */
var DashboardView = (function () {
  'use strict';

  function render() {
    var container = document.getElementById('view-dashboard');
    container.innerHTML =
      '<div class="view-header">' +
        '<h2 class="view-title">Dashboard</h2>' +
        '<p class="view-subtitle">QuantReflex ecosystem overview</p>' +
      '</div>' +
      '<div class="stat-grid" id="dashboardStats">' +
        _statCard('–', 'Total Users') +
        _statCard('–', 'Premium') +
        _statCard('–', 'Premium+') +
        _statCard('–', 'AI Tokens') +
      '</div>';

    _loadData();
  }

  function _statCard(value, label) {
    return '<div class="stat-card"><div class="stat-value">' + value + '</div><div class="stat-label">' + label + '</div></div>';
  }

  async function _loadData() {
    try {
      var data = await API.getDashboard();
      var grid = document.getElementById('dashboardStats');
      if (grid && data) {
        grid.innerHTML =
          _statCard(data.totalUsers || 0, 'Total Users') +
          _statCard(data.premiumUsers || 0, 'Premium') +
          _statCard(data.premiumPlusUsers || 0, 'Premium+') +
          _statCard(data.aiTokens || 0, 'AI Tokens');
        AdminState.set({ dashboardData: data });
      }
    } catch (e) {
      console.error('[Dashboard] Load error:', e);
    }
  }

  return { render: render };
})();
