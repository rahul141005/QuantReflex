/**
 * operations.js — OPERATIONS CENTER (Super Admin V2, ADR-022).
 *
 * The governance core, rebuilt as first-class panels (no more strangler wrappers around legacy
 * views). Tabbed: Diagnostics (health + emergency status + maintenance actions), Security,
 * Firestore (sizes + growth), Campaigns (broadcast + history), Exports, Cleanup (orphans + pending
 * purge), and Audit (full immutable feed). Emergency toggles are owned by the Command Center; this
 * surfaces their live state with a one-click link.
 */
var OperationsView = (function () {
  'use strict';

  function _esc(s) { return AdminUtils.escapeHtml(s); }
  function _fmt(v) { return AdminUtils.formatDateTime(v); }

  function render() {
    var c = document.getElementById('view-operations');
    if (!c) return;
    c.innerHTML =
      '<div class="view-header"><h2 class="view-title">Operations Center</h2>' +
      '<p class="view-subtitle">Diagnostics · Security · Firestore · Campaigns · Exports · Cleanup · Audit</p></div>' +
      '<div id="opsTabs"></div>';
    Tabs.mount(document.getElementById('opsTabs'), {
      tabs: [
        { id: 'diagnostics', label: 'Diagnostics', render: _tabDiagnostics },
        { id: 'security', label: 'Security', render: _tabSecurity },
        { id: 'firestore', label: 'Firestore', render: _tabFirestore },
        { id: 'campaigns', label: 'Campaigns', render: _tabCampaigns },
        { id: 'exports', label: 'Exports', render: _tabExports },
        { id: 'cleanup', label: 'Cleanup', render: _tabCleanup },
        { id: 'audit', label: 'Audit', render: _tabAudit }
      ]
    });
  }

  /* ───────── Diagnostics ───────── */
  function _tabDiagnostics(el) {
    el.innerHTML = '<div class="loading">Running diagnostics…</div>';
    Promise.all([
      API.runAudit().catch(function () { return { status: 'unknown', issues: [] }; }),
      API.getDashboard().catch(function () { return {}; }),
      API.getEmergencyConfig().catch(function () { return { config: {} }; })
    ]).then(function (r) {
      var audit = r[0] || {}, dash = r[1] || {}, emc = (r[2] && r[2].config) || {};
      var health = (dash && dash.health) || {};
      var issues = audit.issues || [];
      var hb = function (k, label) { var v = health[k]; var col = v === 'green' ? '#10b981' : (v === 'red' ? '#ef4444' : '#f59e0b'); return '<div class="stat-card"><div style="font-size:1.5rem;color:' + col + ';">●</div><div style="font-size:.72rem;font-weight:600;text-transform:uppercase;color:#64748b;">' + _esc(label) + '</div><div style="font-size:.72rem;color:#94a3b8;">' + _esc(v || '—') + '</div></div>'; };
      var emState = function (k, label) { var on = emc[k] && emc[k].enabled; return '<div class="cc-feed-row"><span>' + _esc(label) + '</span><span class="cc-em-state ' + (on ? 'on' : 'off') + '">' + (on ? 'ON' : 'off') + '</span></div>'; };

      el.innerHTML =
        '<div class="stat-grid" style="margin-bottom:1.25rem;">' + hb('firebaseAuth', 'Auth') + hb('firestore', 'Firestore') + hb('aiApi', 'AI API') + hb('webhooks', 'Webhooks') + '</div>' +
        '<div class="card" style="padding:1rem;margin-bottom:1.25rem;"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;"><div class="cc-section-title" style="margin:0;">Emergency status</div><button class="btn btn-sm btn-outline" onclick="window.location.hash=\'#command-center\';">Manage controls</button></div>' +
          emState('maintenance', 'Maintenance mode') + emState('aiKillSwitch', 'AI kill switch') + emState('paymentKillSwitch', 'Payment kill switch') + '</div>' +
        '<div class="card" style="padding:1rem;"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;"><div class="cc-section-title" style="margin:0;">Integrity scan</div>' +
          '<div class="cc-quick"><button class="btn btn-sm btn-outline" id="opAgg">Refresh metrics</button><button class="btn btn-sm btn-outline" id="opAudit">Re-scan</button></div></div>' +
          (issues.length ? issues.map(function (i) { return '<div class="cc-feed-row"><span><span class="badge ' + (i.severity === 'high' ? 'badge-archived' : 'badge-draft') + '">' + _esc(i.severity) + '</span> ' + _esc(i.message) + '</span></div>'; }).join('') : '<div class="cc-allclear" style="margin-top:.5rem;">✓ No integrity issues found.</div>') +
          '<div class="muted" style="margin-top:.5rem;font-size:.78rem;">Scanned ' + _esc(_fmt(audit.scannedAt)) + '</div></div>';

      var ag = document.getElementById('opAgg'); if (ag) ag.onclick = function () { ag.disabled = true; API.aggregateMetrics().then(function () { Toast.success('Metrics refreshed'); _tabDiagnostics(el); }).catch(function (e) { ag.disabled = false; Toast.error(AdminUtils.getReadableError(e)); }); };
      var au = document.getElementById('opAudit'); if (au) au.onclick = function () { _tabDiagnostics(el); };
    });
  }

  /* ───────── Security ───────── */
  function _tabSecurity(el) {
    el.innerHTML = '<div class="loading">Loading security posture…</div>';
    API.getSecurity().then(function (d) {
      var counts = d.counts24 || {}, posture = d.posture || {}, events = d.events || [];
      var cTile = function (label, v, warn) { return '<div class="stat-card"><div style="font-size:1.4rem;font-weight:800;color:' + (warn && v > 0 ? '#dc2626' : '#0f172a') + ';">' + (v == null ? '—' : v) + '</div><div style="font-size:.7rem;font-weight:600;text-transform:uppercase;color:#64748b;">' + _esc(label) + '</div></div>'; };
      el.innerHTML =
        '<div class="stat-grid" style="margin-bottom:1.25rem;">' +
          cTile('Failed logins 24h', counts.failed_login, true) + cTile('Payment failures 24h', counts.payment_failure, true) +
          cTile('Suspended users', posture.suspendedUsers) + cTile('Expired premium', posture.expiredPremium, true) +
        '</div>' +
        '<div class="card" style="padding:1rem;"><div class="cc-section-title">Recent security events</div>' +
          (events.length ? events.map(function (e) { return '<div class="cc-feed-row"><span><strong>' + _esc(e.type) + '</strong> ' + _esc(e.reason || '') + (e.app ? ' <span class="muted">[' + _esc(e.app) + ']</span>' : '') + '</span><span class="cc-feed-when">' + _esc(_fmt(e.createdAt)) + '</span></div>'; }).join('') : '<div class="muted">No security events recorded.</div>') + '</div>';
    }).catch(function (e) { el.innerHTML = '<div class="empty-state"><div class="empty-state-text">' + _esc(AdminUtils.getReadableError(e)) + '</div></div>'; });
  }

  /* ───────── Firestore ───────── */
  function _tabFirestore(el) {
    el.innerHTML = '<div class="loading">Measuring collections…</div>';
    API.getFirestoreOps().then(function (d) {
      var live = d.live || {}, series = d.series || [];
      var rows = Object.keys(live).map(function (k) { return '<div class="cc-feed-row"><span class="muted">' + _esc(k) + '</span><span>' + (live[k] == null ? '—' : Number(live[k]).toLocaleString()) + '</span></div>'; }).join('');
      var growth = '';
      if (series.length >= 2) {
        var first = series[0], last = series[series.length - 1];
        var fc = first.collectionCounts || {}, lc = last.collectionCounts || {};
        growth = '<div class="card" style="padding:1rem;"><div class="cc-section-title">Growth (' + _esc(first.date) + ' → ' + _esc(last.date) + ')</div>' +
          Object.keys(lc).map(function (k) { var delta = (lc[k] || 0) - (fc[k] || 0); return '<div class="cc-feed-row"><span class="muted">' + _esc(k) + '</span><span style="color:' + (delta > 0 ? '#0f172a' : '#94a3b8') + ';">' + (delta >= 0 ? '+' : '') + delta + '</span></div>'; }).join('') + '</div>';
      }
      el.innerHTML = '<div class="card" style="padding:1rem;margin-bottom:1.25rem;"><div class="cc-section-title">Live collection sizes</div>' + rows + '</div>' + growth;
    }).catch(function (e) { el.innerHTML = '<div class="empty-state"><div class="empty-state-text">' + _esc(AdminUtils.getReadableError(e)) + '</div></div>'; });
  }

  /* ───────── Campaigns (broadcast + history) ───────── */
  function _tabCampaigns(el) {
    el.innerHTML =
      '<div class="card" style="padding:1rem;margin-bottom:1.25rem;"><div class="cc-section-title">Send broadcast</div>' +
        '<div class="modal-field"><label class="modal-label">Title</label><input type="text" class="modal-input" id="nTitle" placeholder="Notification title" /></div>' +
        '<div class="modal-field"><label class="modal-label">Body</label><input type="text" class="modal-input" id="nBody" placeholder="Message" /></div>' +
        '<div class="modal-field"><label class="modal-label">Segment</label><select class="modal-select" id="nSeg"><option value="all">All users</option><option value="premium">Premium only</option></select></div>' +
        '<button class="btn btn-sm accent" id="nSend">Send broadcast</button></div>' +
      '<div id="nHist"><div class="loading">Loading campaign history…</div></div>';
    document.getElementById('nSend').onclick = function () {
      var title = document.getElementById('nTitle').value.trim();
      var body = document.getElementById('nBody').value.trim();
      var segment = document.getElementById('nSeg').value;
      if (!title || !body) { Toast.error('Title and body are required.'); return; }
      var btn = this; btn.disabled = true; btn.textContent = 'Sending…';
      Modal.show({ title: 'Send broadcast to ' + segment + '?', body: '<p class="text-sm text-secondary">This pushes a notification to all matching devices. Audited.</p>', actions: [
        { label: 'Cancel', onClick: function () { btn.disabled = false; btn.textContent = 'Send broadcast'; } },
        { label: 'Send', accent: true, autoClose: false, onClick: function () {
          API.sendBroadcast({ title: title, body: body, segment: segment }).then(function (r) { Toast.success('Sent ' + (r.sent || 0) + ' (failed ' + (r.failed || 0) + ')'); Modal.close(); btn.disabled = false; btn.textContent = 'Send broadcast'; document.getElementById('nTitle').value = ''; document.getElementById('nBody').value = ''; _loadCampaignHistory(); }).catch(function (e) { btn.disabled = false; btn.textContent = 'Send broadcast'; Toast.error(AdminUtils.getReadableError(e)); });
        } }
      ] });
    };
    _loadCampaignHistory();
  }
  function _loadCampaignHistory() {
    API.getNotificationHistory().then(function (r) {
      var cs = (r && r.campaigns) || [];
      var c = document.getElementById('nHist'); if (!c) return;
      c.innerHTML = '<div class="card" style="padding:1rem;"><div class="cc-section-title">Recent campaigns</div>' + (cs.length ? cs.map(function (x) { return '<div class="cc-feed-row"><span><strong>' + _esc(x.title) + '</strong> <span class="muted">→ ' + _esc(x.segment) + '</span> · ✓' + x.successCount + ' ✗' + x.failureCount + '</span><span class="cc-feed-when">' + _esc(_fmt(x.timestamp)) + '</span></div>'; }).join('') : '<div class="muted">No campaigns sent yet.</div>') + '</div>';
    }).catch(function () { var c = document.getElementById('nHist'); if (c) c.innerHTML = '<div class="card" style="padding:1rem;"><div class="muted">Campaign history unavailable.</div></div>'; });
  }

  /* ───────── Exports ───────── */
  function _tabExports(el) {
    var TYPES = [
      { type: 'users', label: 'All users' }, { type: 'premium', label: 'Premium users' },
      { type: 'coachings', label: 'Coachings' }, { type: 'revenue', label: 'Revenue (payments)' },
      { type: 'ai-usage', label: 'AI usage' }
    ];
    el.innerHTML = '<div class="card" style="padding:1rem;"><div class="cc-section-title">Authenticated CSV exports</div><div class="cc-quick">' +
      TYPES.map(function (t) { return '<button class="btn btn-sm btn-outline" data-exp="' + t.type + '">' + _esc(t.label) + '</button>'; }).join('') + '</div>' +
      '<div class="muted" style="margin-top:.5rem;font-size:.78rem;">Inactive-user export lives in User-360 (Inactive filter). Files download client-side; auth stays in the request, not the URL.</div></div>';
    el.querySelectorAll('[data-exp]').forEach(function (b) { b.onclick = function () { var t = b.getAttribute('data-exp'); b.disabled = true; API.exportData(t).then(function (r) { AdminUtils.downloadCsv(r.filename, r.csv); b.disabled = false; if (r.truncated) Toast.error('Export truncated to ' + r.rowCount + ' rows — refine and re-export.'); else Toast.success('Exported ' + (r.rowCount || 0) + ' rows'); }).catch(function (e) { b.disabled = false; Toast.error(AdminUtils.getReadableError(e)); }); }; });
  }

  /* ───────── Cleanup ───────── */
  function _tabCleanup(el) {
    el.innerHTML = '<div class="loading">Loading cleanup queue…</div>';
    API.getPendingPurgeList().then(function (r) {
      var pend = (r && r.data) || [];
      el.innerHTML =
        '<div class="card" style="padding:1rem;margin-bottom:1.25rem;"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;"><div><strong>Orphaned duel rooms</strong><div class="muted" style="font-size:.78rem;">Stale waiting/active rooms clogging Firestore.</div></div><button class="btn btn-sm btn-outline" id="opDuel">Run duel cleanup</button></div></div>' +
        '<div class="card" style="padding:1rem;"><div class="cc-section-title">Pending purge (' + pend.length + ')</div>' +
          (pend.length ? pend.map(function (u) { return '<div class="cc-feed-row"><span>' + _esc(u.name || u.email) + ' <span class="muted">' + _esc(u.email) + '</span></span><span class="cc-feed-when">purge after ' + _esc(AdminUtils.formatDate(u.purgeAfter)) + '</span></div>'; }).join('') : '<div class="muted">No accounts past their purge hold.</div>') +
          '<div class="muted" style="margin-top:.5rem;font-size:.78rem;">The cleanup-sweep cron purges these automatically; individual deletion is in User-360.</div></div>';
      var du = document.getElementById('opDuel'); if (du) du.onclick = function () { du.disabled = true; API.cleanupDuels().then(function (x) { Toast.success('Cleaned ' + (x.deletedCount || 0) + ' duel(s)'); du.disabled = false; }).catch(function (e) { du.disabled = false; Toast.error(AdminUtils.getReadableError(e)); }); };
    }).catch(function (e) { el.innerHTML = '<div class="empty-state"><div class="empty-state-text">' + _esc(AdminUtils.getReadableError(e)) + '</div></div>'; });
  }

  /* ───────── Audit ───────── */
  function _tabAudit(el) {
    el.innerHTML = '<div class="loading">Loading audit feed…</div>';
    API.getAuditLogs().then(function (logs) {
      var arr = Array.isArray(logs) ? logs : (logs.data || []);
      el.innerHTML = '<div class="card" style="padding:1rem;"><div class="cc-section-title">Immutable audit feed (newest ' + arr.length + ')</div>' +
        (arr.length ? arr.map(function (l) { return '<div class="cc-feed-row"><span><strong>' + _esc(l.action) + '</strong> ' + (l.target ? '→ ' + _esc(l.target) : '') + ' <span class="muted">(' + _esc(l.admin || 'System') + ')</span>' + (l.summary ? '<div class="muted" style="font-size:.76rem;">' + _esc(l.summary) + '</div>' : '') + '</span><span class="cc-feed-when">' + _esc(_fmt(l.timestamp)) + '</span></div>'; }).join('') : '<div class="muted">No audit entries.</div>') + '</div>';
    }).catch(function (e) { el.innerHTML = '<div class="empty-state"><div class="empty-state-text">' + _esc(AdminUtils.getReadableError(e)) + '</div></div>'; });
  }

  return { render: render };
})();
