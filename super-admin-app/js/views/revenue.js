/**
 * revenue.js — REVENUE CENTER (Super Admin V2, ADR-022).
 *
 * Revenue intelligence, not a payment ledger. Tabbed: Overview (revenue totals, conversion, growth),
 * Subscriptions (active / expiring / entitlement anomalies), Trends (the daily revenue + premium-base
 * series), and Grants (entitlement grant history + CSV export). Replaces the old PaymentsView binding
 * for the `revenue` domain. Raw per-payment CSV is available via Export.
 */
var RevenueCenter = (function () {
  'use strict';

  var _intel = null, _dash = null;

  function _esc(s) { return AdminUtils.escapeHtml(s); }
  function _fmt(v) { return AdminUtils.formatDate(v); }
  function _inr(n) { return '₹' + (n != null ? Number(n).toLocaleString() : '0'); }

  function render() {
    var c = document.getElementById('view-revenue');
    if (!c) return;
    c.innerHTML =
      '<div class="view-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.75rem;">' +
        '<div><h2 class="view-title">Revenue Center</h2><p class="view-subtitle">Revenue intelligence — trends, conversion, subscriptions, and grant history.</p></div>' +
        '<button class="btn btn-sm btn-outline" id="revRefresh">Refresh</button></div>' +
      '<div id="revBody"><div class="loading">Loading revenue intelligence…</div></div>';
    var b = document.getElementById('revRefresh'); if (b) b.onclick = _load;
    _load();
  }

  function _load() {
    var body = document.getElementById('revBody'); if (body) body.innerHTML = '<div class="loading">Loading revenue intelligence…</div>';
    Promise.all([
      API.getRevenueIntel().catch(function () { return {}; }),
      API.getDashboard().catch(function () { return {}; })
    ]).then(function (r) { _intel = r[0] || {}; _dash = r[1] || {}; _mount(); })
      .catch(function (e) { var body = document.getElementById('revBody'); if (body) body.innerHTML = '<div class="empty-state"><div class="empty-state-text">' + _esc(AdminUtils.getReadableError(e)) + '</div></div>'; });
  }

  function _mount() {
    var body = document.getElementById('revBody'); if (!body) return;
    body.innerHTML = '<div id="revTabs"></div>';
    Tabs.mount(document.getElementById('revTabs'), {
      tabs: [
        { id: 'overview', label: 'Overview', render: _tabOverview },
        { id: 'subs', label: 'Subscriptions', render: _tabSubs },
        { id: 'trends', label: 'Trends', render: _tabTrends },
        { id: 'grants', label: 'Grants', render: _tabGrants }
      ]
    });
  }

  function _tile(label, value, sub, color) {
    return '<div class="stat-card"><div style="font-size:1.5rem;font-weight:800;color:' + (color || '#0f172a') + ';">' + value + '</div>' +
      '<div style="font-size:.72rem;font-weight:600;text-transform:uppercase;color:#64748b;letter-spacing:.03em;">' + _esc(label) + '</div>' +
      (sub ? '<div style="font-size:.72rem;color:#94a3b8;margin-top:.15rem;">' + _esc(sub) + '</div>' : '') + '</div>';
  }

  function _growth(p) { if (p == null) return '—'; var c = p >= 0 ? '#059669' : '#dc2626'; return '<span style="color:' + c + ';font-weight:700;">' + (p >= 0 ? '+' : '') + p + '%</span>'; }

  function _tabOverview(el) {
    var m = (_dash && _dash.metrics) || {};
    var g = _intel.growth || {};
    el.innerHTML = '<div class="stat-grid" style="margin-bottom:1.25rem;">' +
      _tile('Revenue total', _inr(m.revenueTotalINR), _inr(m.revenueTodayINR) + ' today', '#059669') +
      _tile('Active premium', (_intel.premiumUsers != null ? _intel.premiumUsers : (m.premiumUsers || 0)), (_intel.trialUsers || m.trialUsers || 0) + ' on trial', '#2563eb') +
      _tile('Conversion', (_intel.conversionRate != null ? _intel.conversionRate : 0) + '%', 'premium share of base', '#7c3aed') +
      _tile('Expiring ≤7d', (_intel.expiring7d != null ? _intel.expiring7d : 0), (_intel.expiring30d || 0) + ' within 30d', (_intel.expiring7d > 0 ? '#f59e0b' : '#10b981')) +
    '</div>' +
    '<div class="card" style="padding:1rem;"><div class="cc-section-title">Plan mix &amp; growth (' + (g.windowDays || 0) + 'd window)</div>' +
      '<div class="cc-feed-row"><span>6-month plans sold</span><span>' + (m.revenue6mCount || 0) + '</span></div>' +
      '<div class="cc-feed-row"><span>12-month plans sold</span><span>' + (m.revenue12mCount || 0) + '</span></div>' +
      '<div class="cc-feed-row"><span>Revenue growth</span><span>' + _growth(g.revenuePct) + '</span></div>' +
      '<div class="cc-feed-row"><span>Premium-base growth</span><span>' + _growth(g.premiumPct) + '</span></div>' +
      '<div class="cc-feed-row"><span>Failed grants (30d)</span><span>' + (_intel.failedGrants != null ? _intel.failedGrants : '—') + '</span></div>' +
    '</div>';
  }

  function _tabSubs(el) {
    var m = (_dash && _dash.metrics) || {};
    el.innerHTML = '<div class="card" style="padding:1rem;">' +
      '<div class="cc-feed-row"><span class="muted">Active premium</span><span>' + (_intel.premiumUsers || m.premiumUsers || 0) + '</span></div>' +
      '<div class="cc-feed-row"><span class="muted">On trial</span><span>' + (_intel.trialUsers || m.trialUsers || 0) + '</span></div>' +
      '<div class="cc-feed-row"><span class="muted">Free users</span><span>' + (m.freeUsers != null ? m.freeUsers : '—') + '</span></div>' +
      '<div class="cc-feed-row"><span class="muted">Expiring within 7 days</span><span style="font-weight:700;color:' + (_intel.expiring7d > 0 ? '#f59e0b' : '#0f172a') + ';">' + (_intel.expiring7d || 0) + '</span></div>' +
      '<div class="cc-feed-row"><span class="muted">Expiring within 30 days</span><span>' + (_intel.expiring30d || 0) + '</span></div>' +
      '<div class="muted" style="margin-top:.5rem;font-size:.8rem;">Entitlement anomalies (premium flag with an expired timestamp) surface as alerts on the <a href="#" onclick="window.location.hash=\'#command-center\';return false;">Command Center</a> and can be swept from <a href="#" onclick="window.location.hash=\'#operations\';return false;">Operations</a>.</div>' +
    '</div>';
  }

  function _tabTrends(el) {
    var trend = _intel.trend || [];
    if (!trend.length) { el.innerHTML = '<div class="card" style="padding:1rem;"><div class="muted">No trend history yet — daily snapshots accrue over time.</div></div>'; return; }
    var maxRev = Math.max.apply(null, trend.map(function (t) { return t.revenueTotalINR || 0; }).concat([1]));
    el.innerHTML = '<div class="card" style="padding:1rem;"><div class="cc-section-title">Daily revenue &amp; premium base</div>' +
      trend.map(function (t) {
        var w = Math.round(((t.revenueTotalINR || 0) / maxRev) * 100);
        return '<div style="margin-bottom:.5rem;"><div style="display:flex;justify-content:space-between;font-size:.78rem;"><span class="muted">' + _esc(t.date) + '</span><span>' + _inr(t.revenueTotalINR) + ' · ' + (t.premiumUsers || 0) + ' premium</span></div>' +
          '<div style="height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;"><div style="height:100%;width:' + w + '%;background:#059669;"></div></div></div>';
      }).join('') + '</div>';
  }

  function _tabGrants(el) {
    el.innerHTML = '<div style="display:flex;justify-content:flex-end;margin-bottom:.6rem;"><button class="btn btn-sm btn-outline" id="revExport">Export revenue CSV</button></div><div id="revGrantList"><div class="loading">Loading grant history…</div></div>';
    document.getElementById('revExport').onclick = function () { var b = this; b.disabled = true; API.exportData('revenue').then(function (r) { AdminUtils.downloadCsv(r.filename, r.csv); b.disabled = false; if (r.truncated) Toast.error('Export truncated to ' + r.rowCount + ' rows.'); }).catch(function (e) { b.disabled = false; Toast.error(AdminUtils.getReadableError(e)); }); };
    API.getPaymentLogs().then(function (logs) {
      var arr = Array.isArray(logs) ? logs : (logs.data || []);
      var c = document.getElementById('revGrantList');
      c.innerHTML = '<div class="card" style="padding:1rem;">' + (arr.length ? arr.map(function (l) {
        return '<div class="cc-feed-row"><span>' + _esc(l.action) + ' → <code>' + _esc(l.uid || '—') + '</code> <span class="muted">(' + _esc(l.adminEmail || l.adminUid || 'System') + ')</span></span><span class="cc-feed-when">' + _esc(_fmt(l.timestamp)) + '</span></div>';
      }).join('') : '<div class="muted">No entitlement grants recorded.</div>') + '</div>';
    }).catch(function (e) { var c = document.getElementById('revGrantList'); if (c) c.innerHTML = '<div class="empty-state"><div class="empty-state-text">' + _esc(AdminUtils.getReadableError(e)) + '</div></div>'; });
  }

  return { render: render };
})();
