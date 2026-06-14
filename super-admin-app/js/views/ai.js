/**
 * ai.js — AI COST CENTER (Super Admin V2, ADR-022).
 *
 * The operational AI command center. One screen, tabbed: Overview (total spend, budget, kill-switch
 * visibility, feature breakdown, lifetime economics), By User (top consumers + inline throttle),
 * By Coaching (spend grouped by coaching), and Abuse (flagged consumers). All AI cost governance
 * lives here; the AI kill-switch toggle stays on the Command Center (this shows its live state).
 */
var AIAnalyticsView = (function () {
  'use strict';

  var _data = [], _flagged = 0, _budget = null, _kill = null, _truncated = false;

  function _esc(s) { return AdminUtils.escapeHtml(s); }
  function _cost(u) { return parseFloat(u.totalEstimatedCost) || 0; }

  function render() {
    var c = document.getElementById('view-ai');
    if (!c) return;
    c.innerHTML =
      '<div class="view-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.75rem;">' +
        '<div><h2 class="view-title">AI Cost Center</h2><p class="view-subtitle">GPT spend, feature economics, top consumers, and abuse. All $ figures are token-based <strong>estimates</strong> — reconcile against the OpenAI invoice.</p></div>' +
        '<button class="btn btn-sm btn-outline" id="aiRefresh">Refresh</button></div>' +
      '<div id="aiBody"><div class="loading">Calculating operational AI costs…</div></div>';
    var b = document.getElementById('aiRefresh'); if (b) b.onclick = _load;
    _load();
  }

  function _load() {
    var body = document.getElementById('aiBody'); if (body) body.innerHTML = '<div class="loading">Calculating operational AI costs…</div>';
    Promise.all([
      API.getAIUsage(),
      API.getAiBudget().catch(function () { return null; }),
      API.getEmergencyConfig().catch(function () { return null; })
    ]).then(function (r) {
      _data = (r[0] && r[0].analytics) || [];
      _flagged = (r[0] && r[0].flaggedCount) || 0;
      _budget = r[1];
      _kill = (r[2] && r[2].config && r[2].config.aiKillSwitch) || null;
      _truncated = !!(r[0] && r[0].truncated);
      _mount();
    }).catch(function (e) {
      var body = document.getElementById('aiBody');
      if (body) body.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Failed to load AI cost data: ' + _esc(AdminUtils.getReadableError(e)) + '</div></div>';
    });
  }

  function _mount() {
    var body = document.getElementById('aiBody'); if (!body) return;
    var banner = _truncated
      ? '<div class="cc-emergency" style="background:var(--warn-bg);border-color:var(--warn-border);margin-bottom:1rem;padding:.75rem 1rem;"><strong>⚠ Showing a capped sample.</strong> AI cost data is truncated to the first 5,000 records for performance; totals below are a lower bound. (Pre-aggregation is tracked in the roadmap.)</div>'
      : '';
    body.innerHTML = banner + '<div id="aiTabs"></div>';
    Tabs.mount(document.getElementById('aiTabs'), {
      tabs: [
        { id: 'overview', label: 'Overview', render: _tabOverview },
        { id: 'users', label: 'By User', render: _tabUsers },
        { id: 'coaching', label: 'By Coaching', render: _tabCoaching },
        { id: 'abuse', label: 'Abuse (' + _flagged + ')', render: _tabAbuse }
      ]
    });
  }

  /* Delegates to the single shared stat tile (ADR-026); `color` maps to the optional colorVar. */
  function _tile(label, value, sub, color) {
    return AdminUtils.statTile(label, value, sub, color);
  }

  function _tabOverview(el) {
    var lifetimeCost = 0, lifetimeTokens = 0, totalWP = 0, totalExp = 0;
    _data.forEach(function (u) { lifetimeCost += _cost(u); lifetimeTokens += (u.totalEstimatedTokens || 0); totalWP += (u.totalWP || 0); totalExp += (u.totalExp || 0); });
    /* Feature economics — same heuristic the backend uses for fallback estimation (ADR-015). */
    var COST_PER_TOKEN = 0.375 / 1000000;
    var wpCost = totalWP * 1400 * COST_PER_TOKEN;
    var expCost = totalExp * 700 * COST_PER_TOKEN;
    var mtd = (_budget && _budget.monthToDate && _budget.monthToDate.costUSD) || 0;

    var killBadge = _kill && _kill.enabled
      ? '<span class="badge badge-archived">AI KILL-SWITCH ON</span>'
      : '<span class="badge badge-active">AI online</span>';

    var html = '<div class="stat-grid" style="margin-bottom:1.25rem;">' +
      _tile('Spend (MTD)', '$' + Number(mtd).toFixed(2), (_budget && _budget.config ? 'of $' + _budget.config.monthlyBudgetUSD + ' budget' : 'budget n/a'), 'var(--accent-ai)') +
      _tile('Lifetime spend', '$' + lifetimeCost.toFixed(2), lifetimeTokens.toLocaleString() + ' tokens', 'var(--text-strong)') +
      _tile('AI consumers', _data.length, '', 'var(--accent-primary)') +
      _tile('Flagged (abuse)', _flagged, '', _flagged > 0 ? 'var(--danger-hover)' : 'var(--success-primary)') +
    '</div>';

    /* Kill-switch visibility (toggle lives on the Command Center). */
    html += '<div class="card" style="padding:1rem;margin-bottom:1.25rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;">' +
      '<div><strong>AI kill switch</strong> ' + killBadge + (_kill && _kill.updatedBy ? '<div class="muted" style="font-size:.78rem;">last by ' + _esc(_kill.updatedBy) + '</div>' : '') + '</div>' +
      '<button class="btn btn-sm btn-outline" onclick="window.location.hash=\'#command-center\';">Manage in Command Center</button></div>';

    html += '<div id="aiBudgetPanel"></div>';

    html += '<div class="card" style="padding:1rem;"><div class="cc-section-title">Feature economics (estimated)</div>' +
      '<div class="cc-feed-row"><span>Word Problems</span><span>' + totalWP + ' calls · $' + wpCost.toFixed(2) + '</span></div>' +
      '<div class="cc-feed-row"><span>Explanations</span><span>' + totalExp + ' calls · $' + expCost.toFixed(2) + '</span></div>' +
      '</div>';

    el.innerHTML = html;
    _renderBudget(document.getElementById('aiBudgetPanel'), _budget);
  }

  function _row(u) {
    var prem = u.isPremium ? '<span class="badge badge-active">Paid</span>' : '<span class="badge badge-draft">Free</span>';
    var flags = (u.abuseFlags && u.abuseFlags.length) ? '<div style="font-size:.7rem;color:var(--danger-fg);font-weight:700;">⚠ ' + _esc(u.abuseFlags.join(', ')) + '</div>' : '';
    return '<div class="card" style="padding:.85rem 1rem;margin-bottom:.5rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;">' +
      '<div style="flex:1;min-width:160px;"><div style="font-weight:600;word-break:break-word;">' + _esc(u.displayName || u.email || u.uid) + ' ' + prem + '</div>' +
      '<div class="muted" style="font-size:.78rem;">' + _esc(u.email) + ' · ' + _esc(u.coachingId || 'Independent') + ' · ' + (u.totalCalls || 0) + ' calls</div>' + flags + '</div>' +
      '<div style="text-align:right;"><div style="font-weight:700;color:var(--accent-ai);">$' + _cost(u).toFixed(4) + '</div>' +
      '<button class="btn btn-sm btn-outline" data-throttle="' + _esc(u.uid) + '">Throttle</button></div></div>';
  }

  function _wireThrottle(el) {
    el.querySelectorAll('[data-throttle]').forEach(function (b) {
      b.onclick = function () {
        var uid = b.getAttribute('data-throttle');
        Modal.show({ title: 'Throttle AI for user', body: '<label class="modal-label">Daily call cap (0 clears)</label><input type="number" class="modal-input" id="aiCap" value="20" min="0" max="10000" />', actions: [{ label: 'Cancel' }, { label: 'Apply', accent: true, autoClose: false, onClick: function () { var cap = parseInt((document.getElementById('aiCap') || {}).value, 10) || 0; API.throttleUser(uid, cap).then(function () { Toast.success(cap > 0 ? 'Throttled to ' + cap + '/day' : 'Throttle cleared'); Modal.close(); }).catch(function (e) { Toast.error(AdminUtils.getReadableError(e)); }); } }] });
      };
    });
  }

  function _tabUsers(el) {
    var rows = _data.slice().sort(function (a, b) { return _cost(b) - _cost(a); });
    el.innerHTML = '<input type="text" class="modal-input" id="aiUserFilter" placeholder="Filter by name / email / coaching" aria-label="Filter AI users by name, email, or coaching" style="margin-bottom:.6rem;" /><div id="aiUserList"></div>';
    var render = function () {
      var q = (document.getElementById('aiUserFilter').value || '').toLowerCase();
      var list = rows.filter(function (u) { return !q || ((u.displayName || '') + ' ' + (u.email || '') + ' ' + (u.coachingId || '')).toLowerCase().indexOf(q) > -1; });
      var c = document.getElementById('aiUserList');
      c.innerHTML = list.length ? list.slice(0, 100).map(_row).join('') : '<div class="empty-state"><div class="empty-state-text">No consumers match.</div></div>';
      _wireThrottle(c);
    };
    document.getElementById('aiUserFilter').addEventListener('input', render);
    render();
  }

  function _tabCoaching(el) {
    var groups = {};
    _data.forEach(function (u) { var k = u.coachingId || 'Independent'; if (!groups[k]) groups[k] = { coaching: k, cost: 0, calls: 0, users: 0 }; groups[k].cost += _cost(u); groups[k].calls += (u.totalCalls || 0); groups[k].users += 1; });
    var arr = Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return b.cost - a.cost; });
    el.innerHTML = '<div class="card" style="padding:1rem;">' + (arr.length ? arr.map(function (g) {
      return '<div class="cc-feed-row"><span><strong>' + _esc(g.coaching) + '</strong> <span class="muted">' + g.users + ' consumers · ' + g.calls + ' calls</span></span><span style="font-weight:700;color:var(--accent-ai);">$' + g.cost.toFixed(4) + '</span></div>';
    }).join('') : '<div class="muted">No AI usage yet.</div>') + '</div>';
  }

  function _tabAbuse(el) {
    var flagged = _data.filter(function (u) { return u.abuseFlags && u.abuseFlags.length; }).sort(function (a, b) { return _cost(b) - _cost(a); });
    el.innerHTML = flagged.length ? '<div id="aiAbuseList">' + flagged.map(_row).join('') + '</div>' : '<div class="empty-state"><div class="empty-state-icon">✓</div><div class="empty-state-text">No abuse flags — all consumers within thresholds.</div></div>';
    var c = document.getElementById('aiAbuseList'); if (c) _wireThrottle(c);
  }

  /* Budget panel (unchanged economics, ADR-015) */
  function _renderBudget(panel, b) {
    if (!panel) return;
    if (!b || !b.config) { panel.innerHTML = ''; return; }
    var color = (b.status === 'over' || b.status === 'critical') ? 'var(--danger-hover)' : (b.status === 'warning' ? 'var(--warn-primary)' : 'var(--success-primary)');
    var pct = Math.min(100, b.usedPct || 0);
    var mtd = (b.monthToDate && b.monthToDate.costUSD) || 0;
    panel.innerHTML =
      '<div class="card" style="padding:1.25rem;margin-bottom:1.25rem;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;margin-bottom:.75rem;">' +
          '<div style="font-weight:700;color:var(--text-strong);">GPT Monthly Budget &nbsp;<span style="color:' + color + ';font-weight:800;text-transform:uppercase;font-size:.8rem;">' + (b.status || 'ok') + '</span></div>' +
          '<button id="aiBudgetCfgBtn" class="btn btn-sm btn-outline">Configure</button></div>' +
        '<div style="height:12px;background:var(--border-color);border-radius:6px;overflow:hidden;margin-bottom:.75rem;"><div style="height:100%;width:' + pct + '%;background:' + color + ';transition:width .3s;"></div></div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:1rem;font-size:.85rem;">' +
          '<div><div style="color:var(--text-secondary);">Spent (MTD)</div><strong>$' + mtd + ' / $' + b.config.monthlyBudgetUSD + '</strong></div>' +
          '<div><div style="color:var(--text-secondary);">Used</div><strong style="color:' + color + ';">' + b.usedPct + '%</strong></div>' +
          '<div><div style="color:var(--text-secondary);">Projected</div><strong>$' + b.projectedMonthlyUSD + '</strong></div>' +
          '<div><div style="color:var(--text-secondary);">Remaining</div><strong>$' + b.remainingUSD + '</strong></div></div></div>';
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
    Modal.show({ title: 'AI Budget Configuration', body: body, actions: [{ label: 'Cancel' }, { label: 'Save', accent: true, autoClose: false, onClick: function (btn) {
      btn.disabled = true; btn.textContent = 'Saving...';
      API.setAiBudget({ monthlyBudgetUSD: parseFloat(document.getElementById('abMonthly').value), warnPct: parseInt(document.getElementById('abWarn').value, 10), critPct: parseInt(document.getElementById('abCrit').value, 10) })
        .then(function () { Toast.success('Budget updated.'); Modal.close(); _load(); })
        .catch(function (e) { btn.disabled = false; btn.textContent = 'Save'; Toast.error(AdminUtils.getReadableError(e)); });
    } }] });
  }

  return { render: render };
})();
