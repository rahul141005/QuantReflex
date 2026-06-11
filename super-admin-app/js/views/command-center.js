/**
 * command-center.js — Command Center (Super Admin V2, ADR-019).
 *
 * The operational home: what needs attention (alerts with Acknowledge + Drill-down), a health +
 * revenue + AI snapshot, a live activity feed, quick actions, and the Emergency Controls panel
 * (maintenance / AI-kill / payment-kill, audited via system?action=config-set — ADR-021).
 */
var CommandCenterView = (function () {
  'use strict';

  function _esc(s) { return (typeof AdminUtils !== 'undefined' && AdminUtils.escapeHtml) ? AdminUtils.escapeHtml(s) : String(s == null ? '' : s); }
  function _fmt(iso) { if (!iso) return '—'; if (typeof AdminUtils !== 'undefined' && AdminUtils.formatDateTime) { try { return AdminUtils.formatDateTime(iso); } catch (_) {} } return String(iso); }

  /* alert type → drill-down domain hash */
  var DRILL = {
    ai_budget: '#ai', expired_premium: '#users', orphan_duels: '#operations',
    pending_purge: '#operations', firestore_growth: '#operations',
    payment_failures: '#operations', login_failures: '#operations'
  };
  var EM_LABELS = { maintenance: 'Maintenance mode', aiKillSwitch: 'AI kill switch', paymentKillSwitch: 'Payment kill switch' };

  function render() {
    var c = document.getElementById('view-command-center');
    if (!c) return;
    c.innerHTML =
      '<div class="view-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.75rem;">' +
        '<div><h2 class="view-title">Command Center</h2><p class="view-subtitle">Platform health, alerts, activity, and emergency controls.</p></div>' +
        '<button class="btn btn-sm btn-outline" id="ccRefresh">Refresh</button>' +
      '</div>' +
      '<div id="ccBody"><div class="loading">Loading…</div></div>';
    var b = document.getElementById('ccRefresh'); if (b) b.onclick = _loadData;
    _loadData();
  }

  function _tile(label, value, sub, color) {
    return '<div class="stat-card">' +
      '<div style="font-size:1.5rem;font-weight:800;color:' + (color || '#0f172a') + ';">' + value + '</div>' +
      '<div style="font-size:.72rem;font-weight:600;text-transform:uppercase;color:#64748b;letter-spacing:.03em;">' + _esc(label) + '</div>' +
      (sub ? '<div style="font-size:.72rem;color:#94a3b8;margin-top:.15rem;">' + _esc(sub) + '</div>' : '') +
    '</div>';
  }

  async function _loadData() {
    var body = document.getElementById('ccBody');
    if (!body) return;
    body.innerHTML = '<div class="loading">Loading…</div>';
    var dash = {}, alertsRes = {}, feed = [], emc = {};
    try { dash = await API.getDashboard(); } catch (_) {}
    try { alertsRes = await API.getAlerts(); } catch (_) {}
    try { feed = await API.getAuditLogs(); } catch (_) {}
    try { emc = await API.getEmergencyConfig(); } catch (_) {}

    var alerts = (alertsRes && alertsRes.alerts) || [];
    var metrics = (dash && dash.metrics) || {};
    var ai = (dash && dash.ai) || {};
    var health = (dash && dash.health) || {};
    var cfg = (emc && emc.config) || {};

    /* Attention */
    var attn = '<div class="cc-section"><div class="cc-section-title">Needs attention</div>';
    if (!alerts.length) {
      attn += '<div class="cc-allclear">✓ All clear — no active alerts.</div>';
    } else {
      attn += '<div class="cc-alerts">' + alerts.map(function (a) {
        var sev = a.severity === 'critical' ? 'critical' : (a.severity === 'warning' ? 'warning' : 'info');
        var drill = DRILL[a.type];
        return '<div class="cc-alert sev-' + sev + '"><div class="cc-sev"></div><div class="cc-body">' +
          '<div class="cc-msg">' + _esc(a.message || a.type) + '</div>' +
          '<div class="cc-acts">' +
            (drill ? '<button class="btn btn-sm btn-outline" data-drill="' + _esc(drill) + '">Drill down</button>' : '') +
            '<button class="btn btn-sm btn-outline" data-ack="' + _esc(a.type) + '">Acknowledge 24h</button>' +
          '</div></div></div>';
      }).join('') + '</div>';
    }
    attn += '</div>';

    /* Snapshot */
    var hBadge = function (k, label) { var v = health[k]; var col = v === 'green' ? '#10b981' : (v === 'red' ? '#ef4444' : '#f59e0b'); return _tile(label, '●', v || '—', col); };
    var summary = '<div class="cc-section"><div class="cc-section-title">Snapshot</div><div class="stat-grid">' +
      _tile('Total users', (metrics.totalUsers != null ? metrics.totalUsers : '—'), (metrics.premiumUsers || 0) + ' premium', '#0f172a') +
      _tile('New today', (metrics.newToday != null ? metrics.newToday : '—'), 'DAU ' + (metrics.dau || 0), '#2563eb') +
      _tile('AI cost today', '$' + (ai.costUSD != null ? ai.costUSD : '0'), (ai.gptCalls || 0) + ' calls', '#7c3aed') +
      _tile('Revenue total', '₹' + (metrics.revenueTotalINR || 0), '₹' + (metrics.revenueTodayINR || 0) + ' today', '#059669') +
      hBadge('firestore', 'Firestore') + hBadge('aiApi', 'AI API') +
    '</div></div>';

    /* Activity feed */
    var rows = (feed || []).slice(0, 15).map(function (l) {
      return '<div class="cc-feed-row"><span>' + _esc(l.admin || 'System') + ' · ' + _esc(l.action || '') + (l.target ? ' → ' + _esc(l.target) : '') + '</span>' +
        '<span class="cc-feed-when">' + _esc(_fmt(l.timestamp)) + '</span></div>';
    }).join('') || '<div class="muted" style="padding:.5rem 0;">No recent activity.</div>';
    var feedHtml = '<div class="cc-section"><div class="cc-section-title">Recent activity</div><div class="card cc-feed" style="padding:1rem;">' + rows + '</div></div>';

    /* Quick actions */
    var quick = '<div class="cc-section"><div class="cc-section-title">Quick actions</div><div class="cc-quick">' +
      '<button class="btn btn-sm btn-outline" id="ccCleanup">Run duel cleanup</button>' +
      '<button class="btn btn-sm btn-outline" id="ccAggregate">Refresh metrics</button>' +
      '<button class="btn btn-sm btn-outline" onclick="window.location.hash=\'#operations\'">Open Operations</button>' +
    '</div></div>';

    /* Emergency Controls */
    var emRow = function (key, desc) {
      var on = cfg[key] && cfg[key].enabled;
      var meta = (cfg[key] && cfg[key].updatedBy) ? ('by ' + _esc(cfg[key].updatedBy) + ' · ' + _fmt(cfg[key].updatedAt)) : 'never changed';
      return '<div class="cc-em-row"><div>' +
        '<div style="font-weight:600;">' + _esc(EM_LABELS[key]) + '</div>' +
        '<div class="cc-em-meta">' + _esc(desc) + ' — <span class="cc-em-state ' + (on ? 'on' : 'off') + '">' + (on ? 'ON' : 'off') + '</span> · ' + meta + '</div>' +
        '</div><label class="qr-switch"><input type="checkbox" data-em="' + key + '" ' + (on ? 'checked' : '') + ' /><span class="qr-slider"></span></label></div>';
    };
    var emergency = '<div class="cc-section"><div class="cc-section-title">Emergency controls</div><div class="cc-emergency">' +
      '<h3>⚠ Break-glass controls</h3><p class="cc-em-sub">Honored by the student app immediately. Every toggle is audited.</p>' +
      emRow('maintenance', 'Blocks core learning for non-admins') +
      emRow('aiKillSwitch', 'Stops all OpenAI calls') +
      emRow('paymentKillSwitch', 'Stops new Razorpay orders') +
    '</div></div>';

    body.innerHTML = attn + summary + feedHtml + quick + emergency;

    /* wire */
    body.querySelectorAll('[data-drill]').forEach(function (btn) {
      btn.onclick = function () { if (typeof GlobalSearch !== 'undefined' && GlobalSearch.close) GlobalSearch.close(); window.location.hash = btn.getAttribute('data-drill'); };
    });
    body.querySelectorAll('[data-ack]').forEach(function (btn) {
      btn.onclick = function () {
        var t = btn.getAttribute('data-ack'); btn.disabled = true;
        API.ackAlert(t, 24).then(function () { Toast.success('Alert acknowledged'); _loadData(); })
          .catch(function (e) { btn.disabled = false; Toast.error('Failed: ' + (e && e.message ? e.message : 'error')); });
      };
    });
    var cu = document.getElementById('ccCleanup');
    if (cu) cu.onclick = function () { cu.disabled = true; API.cleanupDuels().then(function (r) { Toast.success('Cleaned ' + (r.deletedCount || 0) + ' duel(s)'); _loadData(); }).catch(function (e) { cu.disabled = false; Toast.error('Failed: ' + (e && e.message ? e.message : 'error')); }); };
    var ag = document.getElementById('ccAggregate');
    if (ag) ag.onclick = function () { ag.disabled = true; API.aggregateMetrics().then(function () { Toast.success('Metrics refreshed'); _loadData(); }).catch(function (e) { ag.disabled = false; Toast.error('Failed: ' + (e && e.message ? e.message : 'error')); }); };
    body.querySelectorAll('[data-em]').forEach(function (inp) {
      inp.onchange = function () { _toggleEmergency(inp.getAttribute('data-em'), inp.checked, inp); };
    });
  }

  function _toggleEmergency(key, enabled, inp) {
    Modal.show({
      title: (enabled ? 'Enable ' : 'Disable ') + (EM_LABELS[key] || key),
      body: '<p class="text-sm text-secondary">' + (enabled ? 'This will immediately affect the student app.' : 'This will restore normal operation.') + ' The action is audited.</p>',
      actions: [
        { label: 'Cancel', onClick: function () { inp.checked = !enabled; } },
        { label: enabled ? 'Enable' : 'Disable', accent: !enabled, danger: enabled, autoClose: false, onClick: function () {
          API.setEmergencyConfig(key, enabled).then(function () { Toast.success((EM_LABELS[key] || key) + ' ' + (enabled ? 'ENABLED' : 'disabled')); Modal.close(); _loadData(); })
            .catch(function (e) { inp.checked = !enabled; Toast.error('Failed: ' + (e && e.message ? e.message : 'error')); });
        } }
      ]
    });
  }

  return { render: render };
})();
