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
  var _cmd = null, _credits = null, _openai = null, _days = 30;

  function _esc(s) { return AdminUtils.escapeHtml(s); }
  function _cost(u) { return parseFloat(u.totalEstimatedCost) || 0; }

  function render() {
    var c = document.getElementById('view-ai');
    if (!c) return;
    c.innerHTML =
      '<div class="view-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.75rem;">' +
        '<div><h2 class="view-title">AI Command Center</h2><p class="view-subtitle">Live spend, tokens, latency, cache, feature &amp; model economics, top consumers, and abuse — from tracked telemetry. $ figures are token-based <strong>estimates</strong> (single pricing source: aiPricing). Reconcile against OpenAI.</p></div>' +
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
      API.getEmergencyConfig().catch(function () { return null; }),
      API.getAiCommand(_days).catch(function () { return null; }),
      API.getAiCredits().catch(function () { return null; }),
      API.getOpenAiUsage(_days).catch(function () { return null; })
    ]).then(function (r) {
      _data = (r[0] && r[0].analytics) || [];
      _flagged = (r[0] && r[0].flaggedCount) || 0;
      _budget = r[1];
      _kill = (r[2] && r[2].config && r[2].config.aiKillSwitch) || null;
      _truncated = !!(r[0] && r[0].truncated);
      _cmd = r[3]; _credits = r[4]; _openai = r[5];
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

  function _money(v) { return '$' + (Number(v) || 0).toFixed(2); }
  function _money4(v) { return '$' + (Number(v) || 0).toFixed(4); }
  function _num(v) { return (Number(v) || 0).toLocaleString(); }
  function _ms(v) { v = Number(v) || 0; return v >= 1000 ? (v / 1000).toFixed(2) + 's' : Math.round(v) + 'ms'; }
  var FEAT_LABEL = { coach: 'AI Coach', insights: 'Insights', explain: 'Explanations', chat: 'Chat', planner: 'Planner', wordproblems: 'Word Problems', admin_questiongen: 'Admin Q-Gen', unknown: 'Other' };

  function _tabOverview(el) {
    if (!_cmd || !_cmd.kpis) {
      // Telemetry rollups unavailable (e.g. before the first AI call after deploy) — show the legacy lifetime view.
      var lc = 0; _data.forEach(function (u) { lc += _cost(u); });
      el.innerHTML = '<div class="card" style="padding:1rem;margin-bottom:1rem;"><div class="cc-section-title">Overview</div>' +
        '<div class="muted">Telemetry rollups are not available yet — they populate as AI requests flow through the new pipeline. Lifetime tracked spend so far: <strong>' + _money(lc) + '</strong> across ' + _data.length + ' consumers.</div></div>' +
        '<div id="aiBudgetPanel"></div>';
      _renderBudget(document.getElementById('aiBudgetPanel'), _budget);
      return;
    }
    var k = _cmd.kpis;
    var healthColor = k.healthScore >= 80 ? 'var(--success-primary)' : k.healthScore >= 55 ? 'var(--warn-primary)' : 'var(--danger-hover)';

    // ── KPI grid ──
    var html = '<div class="stat-grid" style="margin-bottom:1.1rem;">' +
      _tile('Spend today', _money(k.costToday), 'yesterday ' + _money(k.costYesterday), 'var(--accent-ai)') +
      _tile('Spend 7d', _money(k.cost7d), 'burn ' + _money4(k.burnRatePerDayUSD) + '/day', 'var(--accent-ai)') +
      _tile('Spend 30d', _money(k.cost30d), 'projected ' + _money(k.projectedMonthlyUSD) + '/mo', 'var(--accent-ai)') +
      _tile('Lifetime spend', _money(k.lifetimeCost), _num(k.lifetimeRequests) + ' requests', 'var(--text-strong)') +
      _tile('AI health', k.healthScore + '/100', 'success ' + k.successRate + '% · cache ' + k.cacheHitRate + '%', healthColor) +
      _tile('Avg latency', _ms(k.avgLatencyMs), 'over ' + _num(k.totalRequests) + ' reqs (' + _cmd.days + 'd)', 'var(--accent-primary)') +
      _tile('Avg cost / call', _money4(k.avgCostPerRequestUSD), _num(k.billableCalls) + ' billable calls', 'var(--text-strong)') +
      _tile('Tokens (' + _cmd.days + 'd)', _num(k.totalTokens), _num(k.inputTokens) + ' in · ' + _num(k.outputTokens) + ' out', 'var(--text-strong)') +
      _tile('Error rate', k.errorRate + '%', _num(k.errors) + ' errors', k.errorRate > 2 ? 'var(--danger-hover)' : 'var(--success-primary)') +
      _tile('Cache hit rate', k.cacheHitRate + '%', _num(k.cacheHits) + ' hits', 'var(--success-primary)') +
    '</div>';

    // ── Credits + spend trend (two columns) ──
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem;margin-bottom:1.1rem;">';
    html += _creditsCard();
    var series = (_cmd.series || []).map(function (p) { return p.cost; });
    html += '<div class="card" style="padding:1rem;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;"><div class="cc-section-title" style="margin:0;">Daily spend (' + _cmd.days + 'd)</div><span class="muted" style="font-size:.78rem;">peak ' + _money(Math.max.apply(null, series.length ? series : [0])) + '</span></div>' +
      (series.length > 1 ? AdminUtils.sparkline(series, { width: 320, height: 56, color: 'var(--accent-ai)' }) : '<div class="muted">Not enough days of data yet.</div>') + '</div>';
    html += '</div>';

    // ── Kill-switch + budget ──
    var killBadge = _kill && _kill.enabled ? '<span class="badge badge-archived">AI KILL-SWITCH ON</span>' : '<span class="badge badge-active">AI online</span>';
    html += '<div class="card" style="padding:1rem;margin-bottom:1.1rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;">' +
      '<div><strong>AI kill switch</strong> ' + killBadge + (_kill && _kill.updatedBy ? '<div class="muted" style="font-size:.78rem;">last by ' + _esc(_kill.updatedBy) + '</div>' : '') + '</div>' +
      '<button class="btn btn-sm btn-outline" onclick="window.location.hash=\'#command-center\';">Manage in Command Center</button></div>';
    html += '<div id="aiBudgetPanel"></div>';

    // ── By feature ──
    html += '<div class="card" style="padding:1rem;margin-bottom:1.1rem;"><div class="cc-section-title">By feature (' + _cmd.days + 'd)' +
      (k.topFeature ? ' <span class="muted" style="font-weight:400;">· priciest: ' + _esc(FEAT_LABEL[k.topFeature] || k.topFeature) + '</span>' : '') + '</div>' + _breakdownTable(_cmd.byFeature, true) + '</div>';
    // ── By model ──
    html += '<div class="card" style="padding:1rem;margin-bottom:1.1rem;"><div class="cc-section-title">By model (' + _cmd.days + 'd)</div>' + _breakdownTable(_cmd.byModel, false) + '</div>';

    // ── OpenAI reconciliation ──
    html += _openaiCard(k);

    el.innerHTML = html;
    _renderBudget(document.getElementById('aiBudgetPanel'), _budget);
    var setBtn = document.getElementById('aiCreditsBtn'); if (setBtn) setBtn.onclick = _showCreditsModal;
  }

  function _breakdownTable(map, isFeature) {
    map = map || {};
    var keys = Object.keys(map).sort(function (a, b) { return (map[b].costUSD || 0) - (map[a].costUSD || 0); });
    if (!keys.length) return '<div class="muted">No usage in this window yet.</div>';
    var rows = keys.map(function (key) {
      var m = map[key], lat = m.latCount ? Math.round(m.latSumMs / m.latCount) : null;
      var label = isFeature ? (FEAT_LABEL[key] || key) : key;
      return '<tr><td>' + _esc(label) + '</td><td style="text-align:right;">' + _num(m.requests) + '</td>' +
        '<td style="text-align:right;">' + _num((m.inTok || 0) + (m.outTok || 0)) + '</td>' +
        '<td style="text-align:right;font-weight:700;color:var(--accent-ai);">' + _money4(m.costUSD) + '</td>' +
        (isFeature ? '<td style="text-align:right;">' + (lat != null ? _ms(lat) : '—') + '</td><td style="text-align:right;">' + _num(m.cacheHits || 0) + '</td><td style="text-align:right;">' + _num(m.errors || 0) + '</td>' : '') + '</tr>';
    }).join('');
    var head = isFeature
      ? '<tr><th>Feature</th><th style="text-align:right;">Requests</th><th style="text-align:right;">Tokens</th><th style="text-align:right;">Cost</th><th style="text-align:right;">Avg lat</th><th style="text-align:right;">Cache</th><th style="text-align:right;">Errors</th></tr>'
      : '<tr><th>Model</th><th style="text-align:right;">Requests</th><th style="text-align:right;">Tokens</th><th style="text-align:right;">Cost</th></tr>';
    return '<table class="data-table"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table>';
  }

  function _creditsCard() {
    var c = _credits || {};
    var rem = Number(c.estimatedRemainingUSD || 0);
    var remColor = rem <= 0 ? 'var(--danger-hover)' : rem < 10 ? 'var(--warn-primary)' : 'var(--success-primary)';
    return '<div class="card" style="padding:1rem;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;"><div class="cc-section-title" style="margin:0;">OpenAI credits</div>' +
      '<button class="btn btn-sm btn-outline" id="aiCreditsBtn">Set balance</button></div>' +
      '<div style="font-size:1.6rem;font-weight:800;color:' + remColor + ';">' + _money(rem) + '<span style="font-size:.8rem;font-weight:500;color:var(--text-secondary);"> est. remaining</span></div>' +
      '<div class="muted" style="font-size:.8rem;margin-top:.25rem;">Starting ' + _money(c.startingBalanceUSD || 0) + (c.setAt ? ' (set ' + _esc(String(c.setAt).split('T')[0]) + ')' : '') + ' − tracked spend ' + _money(c.spentSinceUSD || 0) + '</div>' +
      '<div class="muted" style="font-size:.72rem;margin-top:.35rem;">Estimate — OpenAI has no balance API. <a href="' + (c.billingUrl || 'https://platform.openai.com/usage') + '" target="_blank" rel="noopener">Verify on OpenAI ↗</a></div></div>';
  }

  function _openaiCard(k) {
    var o = _openai || {};
    var inner;
    if (!o.configured) {
      inner = '<div class="muted">Not connected. Set <code>OPENAI_ADMIN_KEY</code> (an OpenAI <em>org admin</em> key) to pull official usage/cost for reconciliation. Tracked estimates are shown above meanwhile.</div>';
    } else if (o.ok === false) {
      inner = '<div class="muted">Connected, but the OpenAI usage call failed: ' + _esc(o.error || 'unknown') + '.</div>';
    } else {
      var tracked = Number(k.cost30d || 0), actual = Number(o.totalUSD || 0);
      var deltaPct = actual > 0 ? Math.round(((tracked - actual) / actual) * 100) : 0;
      inner = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1rem;">' +
        '<div><div class="muted" style="font-size:.78rem;">OpenAI actual (' + (o.days || 30) + 'd)</div><strong style="font-size:1.1rem;">' + _money(actual) + '</strong></div>' +
        '<div><div class="muted" style="font-size:.78rem;">Tracked estimate (30d)</div><strong style="font-size:1.1rem;">' + _money(tracked) + '</strong></div>' +
        '<div><div class="muted" style="font-size:.78rem;">Delta</div><strong style="font-size:1.1rem;color:' + (Math.abs(deltaPct) <= 10 ? 'var(--success-primary)' : 'var(--warn-primary)') + ';">' + (deltaPct >= 0 ? '+' : '') + deltaPct + '%</strong></div></div>';
    }
    return '<div class="card" style="padding:1rem;margin-bottom:1.1rem;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;"><div class="cc-section-title" style="margin:0;">OpenAI reconciliation</div>' +
      '<a class="btn btn-sm btn-outline" href="' + ((o && o.billingUrl) || 'https://platform.openai.com/usage') + '" target="_blank" rel="noopener">Open OpenAI usage ↗</a></div>' + inner + '</div>';
  }

  function _showCreditsModal() {
    var cur = (_credits && _credits.startingBalanceUSD) || 0;
    Modal.show({ title: 'Set OpenAI starting balance', body: '<div class="modal-field"><label class="modal-label">Current balance (USD) — enter this whenever you top up</label><input type="number" class="modal-input" id="aiCredBal" value="' + cur + '" min="0" step="0.01" /></div><div class="muted" style="font-size:.78rem;">Remaining is then estimated as this balance minus spend tracked from now on.</div>',
      actions: [{ label: 'Cancel' }, { label: 'Save', accent: true, autoClose: false, onClick: function (btn) {
        btn.disabled = true; btn.textContent = 'Saving…';
        API.setAiCredits(parseFloat((document.getElementById('aiCredBal') || {}).value) || 0)
          .then(function () { Toast.success('Starting balance set.'); Modal.close(); _load(); })
          .catch(function (e) { btn.disabled = false; btn.textContent = 'Save'; Toast.error(AdminUtils.getReadableError(e)); });
      } }] });
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
