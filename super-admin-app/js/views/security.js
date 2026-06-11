/**
 * security.js — Security Center (Phase 5, ADR-018)
 *
 * Read-only view over the append-only `securityEvents` collection: 24h per-type
 * counters, account-posture signals, and a recent-events feed. Capture is best-effort
 * and client-side (Firebase Spark has no Auth-trigger Cloud Functions). The attempted
 * email is shown only as a truncated SHA-256 hash — never raw.
 */
var SecurityView = (function () {
  'use strict';

  var TILE = 'flex:1;min-width:120px;padding:1rem;border:1px solid var(--border-color,#e2e8f0);border-radius:.75rem;background:var(--bg-surface,#fff);text-align:center;';

  function render() {
    var c = document.getElementById('view-security');
    if (!c) return;
    c.innerHTML =
      '<div class="view-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.75rem;">' +
        '<div><h2 class="view-title">Security Center</h2>' +
        '<p class="view-subtitle">Login security events (last 24h) + recent activity. Capture is best-effort and client-side.</p></div>' +
        '<button class="btn btn-sm btn-outline" id="secRefreshBtn">Refresh</button>' +
      '</div>' +
      '<div id="secBody"><div class="loading">Loading security signals…</div></div>';
    var btn = document.getElementById('secRefreshBtn');
    if (btn) btn.onclick = _loadData;
    _loadData();
  }

  function _tile(label, value, color) {
    return '<div style="' + TILE + '"><div style="font-size:1.6rem;font-weight:800;color:' + (color || '#0f172a') + ';">' + value + '</div>' +
      '<div style="font-size:.7rem;font-weight:600;text-transform:uppercase;color:#64748b;letter-spacing:.03em;">' + label + '</div></div>';
  }

  function _num(v) { return (v === null || v === undefined) ? '—' : v; }

  function _fmt(iso) {
    if (!iso) return '—';
    if (typeof AdminUtils !== 'undefined' && AdminUtils.formatDateTime) { try { return AdminUtils.formatDateTime(iso); } catch (_) {} }
    return String(iso);
  }

  async function _loadData() {
    var body = document.getElementById('secBody');
    if (!body) return;
    body.innerHTML = '<div class="loading">Loading security signals…</div>';
    try {
      var res = await API.getSecurity();
      var c24 = res.counts24 || {};
      var posture = res.posture || {};
      var events = res.events || [];

      var counters =
        '<div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:1rem;">' +
          _tile('Failed Logins (24h)', _num(c24.failed_login), '#dc2626') +
          _tile('Suspicious (24h)', _num(c24.suspicious_access), '#d97706') +
          _tile('Admin Logins (24h)', _num(c24.admin_login), '#059669') +
          _tile('Payment Failures (24h)', _num(c24.payment_failure), '#dc2626') +
        '</div>';

      var postureRow =
        '<div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:1.25rem;">' +
          _tile('Suspended Users', _num(posture.suspendedUsers), '#d97706') +
          _tile('Archived Users', _num(posture.archivedUsers), '#64748b') +
          _tile('Expired Premium', _num(posture.expiredPremium), '#dc2626') +
        '</div>';

      var rows = events.map(function (e) {
        var sev = (e.type === 'failed_login' || e.type === 'payment_failure') ? '#dc2626' : (e.type === 'suspicious_access' ? '#d97706' : '#059669');
        var subject = e.emailHash ? (e.emailHash.slice(0, 12) + '…') : (e.uid ? (e.uid.slice(0, 10) + '…') : '—');
        return '<tr>' +
          '<td><span class="badge" style="background:' + sev + '1a;color:' + sev + ';">' + AdminUtils.escapeHtml(e.type || '') + '</span></td>' +
          '<td>' + AdminUtils.escapeHtml(e.app || '') + '</td>' +
          '<td>' + AdminUtils.escapeHtml(e.reason || '') + '</td>' +
          '<td>' + AdminUtils.escapeHtml(e.errorCode || '') + '</td>' +
          '<td><code style="font-size:.7rem;">' + AdminUtils.escapeHtml(subject) + '</code></td>' +
          '<td>' + AdminUtils.escapeHtml(_fmt(e.createdAt)) + '</td>' +
        '</tr>';
      }).join('');

      var table = events.length
        ? '<div class="table-wrap"><table class="data-table"><thead><tr><th>Type</th><th>App</th><th>Reason</th><th>Code</th><th>Subject</th><th>When</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<div class="empty-state"><div class="empty-state-icon">🛡️</div><div class="empty-state-text">No security events recorded yet.</div></div>';

      body.innerHTML = counters + postureRow +
        '<div class="card" style="padding:1rem;"><h3 style="margin:0 0 .75rem;font-size:1rem;">Recent events (newest 50)</h3>' + table + '</div>';
    } catch (e) {
      body.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">Error: ' + AdminUtils.escapeHtml(AdminUtils.getReadableError(e)) + '</div></div>';
    }
  }

  return { render: render };
})();
