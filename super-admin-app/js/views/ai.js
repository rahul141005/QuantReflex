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
      
      '<div id="aiBudgetPanel"></div>' +
      '<div id="aiAnalyticsSummary" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:1rem;margin-bottom:1.5rem;"></div>' +
      
      '<div class="card" style="margin-bottom:1.5rem;">' +
        '<div style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:center;">' +
          '<div style="flex:1;min-width:200px;">' +
            '<input type="text" id="aiSearch" class="search-input" style="width:100%;margin:0;" placeholder="Search by name, email, or coaching ID..." />' +
          '</div>' +
          '<select id="aiFilter" class="modal-select" style="width:auto;min-width:180px;">' +
            '<option value="cost_desc">Sort by Cost (High → Low)</option>' +
            '<option value="calls_desc">Sort by API Calls (High → Low)</option>' +
            '<option value="flagged">Flagged (abuse) only</option>' +
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
  var _flaggedCount = 0;

  function _bindEvents() {
    var search = document.getElementById('aiSearch');
    var filter = document.getElementById('aiFilter');

    if (search) search.addEventListener('input', _renderList);
    if (filter) filter.addEventListener('change', _renderList);
  }

  async function _loadData() {
    try {
      var results = await Promise.all([API.getAIUsage(), API.getAiBudget().catch(function () { return null; })]);
      var res = results[0];
      _allData = res.analytics || [];
      _flaggedCount = res.flaggedCount || 0;
      _renderBudget(results[1]);
      _renderSummary();
      _renderList();
    } catch (err) {
      console.error(err);
      var c = document.getElementById('aiListContainer');
      if (c) c.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Failed to load AI usage analytics: ' + AdminUtils.getReadableError(err) + '</div></div>';
    }
  }

  function _renderSummary() {
    var container = document.getElementById('aiAnalyticsSummary');
    if (!container) return;

    var totalCost = 0;
    var totalTokens = 0;
    var totalUsers = _allData.length;

    _allData.forEach(function(u) {
      totalCost += parseFloat(u.totalEstimatedCost) || 0;
      totalTokens += (u.totalEstimatedTokens || 0);
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
      '</div>' +
      '<div class="card" style="padding:1.25rem;text-align:center;">' +
        '<div style="font-size:1.75rem;font-weight:800;color:' + (_flaggedCount > 0 ? '#dc2626' : '#10b981') + ';margin-bottom:.25rem;">' + _flaggedCount + '</div>' +
        '<div style="font-size:.75rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">Flagged (Abuse)</div>' +
      '</div>';
  }

  function _renderList() {
    var container = document.getElementById('aiListContainer');
    if (!container) return;

    var searchQ = (document.getElementById('aiSearch').value || '').toLowerCase();
    var filterQ = document.getElementById('aiFilter').value;

    var filtered = _allData.filter(function(u) {
      var matchesSearch = (u.displayName && u.displayName.toLowerCase().indexOf(searchQ) > -1) ||
                          (u.email && u.email.toLowerCase().indexOf(searchQ) > -1) ||
                          (u.coachingId && u.coachingId.toLowerCase().indexOf(searchQ) > -1);
      return matchesSearch;
    });

    if (filterQ === 'flagged') {
      filtered = filtered.filter(function(u){ return u.abuseFlags && u.abuseFlags.length; });
      filtered.sort(function(a, b) { return parseFloat(b.totalEstimatedCost) - parseFloat(a.totalEstimatedCost); });
    } else if (filterQ === 'cost_desc') {
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
            '<h3 style="font-size:1.0625rem;font-weight:700;color:#0f172a;margin-bottom:.25rem;word-break:break-word;overflow-wrap:anywhere;">' + _escapeHtml(u.displayName || u.email || 'Unknown') + '</h3>' +
            '<p class="text-secondary text-sm" style="word-break:break-word;overflow-wrap:anywhere;">' + _escapeHtml(u.email) + ' • Coaching: ' + _escapeHtml(u.coachingId) + '</p>' +
          '</div>' +
          '<div style="text-align:right;">' +
            '<div style="font-size:1.125rem;font-weight:700;color:#dc2626;">$' + parseFloat(u.totalEstimatedCost).toFixed(4) + '</div>' +
            '<span class="badge ' + badgeClass + '" style="margin-top:.25rem;">' + badgeText + '</span>' +
            ((u.abuseFlags && u.abuseFlags.length) ? '<div style="margin-top:.35rem;font-size:.7rem;color:#b91c1c;font-weight:700;">⚠ ' + u.abuseFlags.join(', ') + '</div>' : '') +
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
    return AdminUtils.escapeHtml(str);
  }

  function _renderBudget(b) {
    var panel = document.getElementById('aiBudgetPanel');
    if (!panel) return;
    if (!b || !b.config) { panel.innerHTML = ''; return; }
    var color = (b.status === 'over' || b.status === 'critical') ? '#dc2626' : (b.status === 'warning' ? '#f59e0b' : '#10b981');
    var pct = Math.min(100, b.usedPct || 0);
    var mtd = (b.monthToDate && b.monthToDate.costUSD) || 0;
    panel.innerHTML =
      '<div class="card" style="padding:1.25rem;margin-bottom:1.5rem;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;margin-bottom:.75rem;">' +
          '<div style="font-weight:700;color:#0f172a;">GPT Monthly Budget &nbsp;<span style="color:' + color + ';font-weight:800;text-transform:uppercase;font-size:.8rem;">' + (b.status || 'ok') + '</span></div>' +
          '<button id="aiBudgetCfgBtn" class="btn btn-sm btn-outline">Configure</button>' +
        '</div>' +
        '<div style="height:12px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin-bottom:.75rem;"><div style="height:100%;width:' + pct + '%;background:' + color + ';transition:width .3s;"></div></div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:1rem;font-size:.85rem;">' +
          '<div><div style="color:#64748b;">Spent (MTD)</div><strong>$' + mtd + ' / $' + b.config.monthlyBudgetUSD + '</strong></div>' +
          '<div><div style="color:#64748b;">Used</div><strong style="color:' + color + ';">' + b.usedPct + '%</strong></div>' +
          '<div><div style="color:#64748b;">Projected</div><strong>$' + b.projectedMonthlyUSD + '</strong></div>' +
          '<div><div style="color:#64748b;">Remaining</div><strong>$' + b.remainingUSD + '</strong></div>' +
        '</div>' +
        ((b.status === 'over' || b.status === 'critical' || b.status === 'warning') ?
          '<div style="margin-top:.75rem;color:' + color + ';font-size:.85rem;font-weight:600;">⚠ Budget ' + b.status + ' — ' + b.usedPct + '% used (warn ' + b.config.warnPct + '% / crit ' + b.config.critPct + '%).</div>' : '') +
      '</div>';
    var cfgBtn = document.getElementById('aiBudgetCfgBtn');
    if (cfgBtn) cfgBtn.addEventListener('click', function () { _showBudgetModal(b.config); });
  }

  function _showBudgetModal(cfg) {
    cfg = cfg || {};
    var body = document.createElement('div');
    body.innerHTML =
      '<div class="modal-field"><label class="modal-label">Monthly Budget (USD)</label><input type="number" class="modal-input" id="abMonthly" value="' + (cfg.monthlyBudgetUSD != null ? cfg.monthlyBudgetUSD : 25) + '" min="0" step="1" /></div>' +
      '<div class="modal-field"><label class="modal-label">Warning Threshold (%)</label><input type="number" class="modal-input" id="abWarn" value="' + (cfg.warnPct || 80) + '" min="1" max="100" /></div>' +
      '<div class="modal-field"><label class="modal-label">Critical Threshold (%)</label><input type="number" class="modal-input" id="abCrit" value="' + (cfg.critPct || 90) + '" min="1" max="100" /></div>';
    Modal.show({
      title: 'AI Budget Configuration',
      body: body,
      actions: [
        { label: 'Cancel' },
        { label: 'Save', accent: true, autoClose: false, onClick: async function (btn) {
          btn.disabled = true; btn.textContent = 'Saving...';
          try {
            await API.setAiBudget({
              monthlyBudgetUSD: parseFloat(document.getElementById('abMonthly').value),
              warnPct: parseInt(document.getElementById('abWarn').value, 10),
              critPct: parseInt(document.getElementById('abCrit').value, 10)
            });
            Toast.show('Budget updated.', 'success');
            Modal.close();
            _loadData();
          } catch (e) { btn.disabled = false; btn.textContent = 'Save'; Toast.show('Failed: ' + AdminUtils.getReadableError(e), 'error'); }
        } }
      ]
    });
  }

  return { render: render };
})();
