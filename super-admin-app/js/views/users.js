/**
 * users.js — USER-360 (Super Admin V2, ADR-022).
 *
 * The single source of truth for any user. SplitView: a flat, filterable master list
 * (status chips, NOT grouped-by-coaching; the Inactive chip becomes a bulk-action mode that
 * absorbs the old Inactive view) + an in-flow detail pane (replaces the overlay drawer) with
 * tabs Profile | Entitlement | Lifecycle | AI | Activity | Payments | Audit. EVERY user action
 * lives here — grant/revoke, trial, lifecycle (suspend/restore/archive/reset/delete), AI throttle,
 * and coaching reassignment. No user action exists outside User-360.
 */
var UsersView = (function () {
  'use strict';

  var _split = null, _all = [], _cursor = null, _filter = 'all', _text = '', _coachings = [], _bulk = {};
  var CHIPS = ['all', 'free', 'premium', 'trial', 'inactive', 'suspended', 'archived'];

  function _esc(s) { return AdminUtils.escapeHtml(s); }
  function _fmt(v) { return AdminUtils.formatDate(v); }
  function _fmtT(v) { return AdminUtils.formatDateTime(v); }
  function _entBadge(u) { var e = AdminUtils.entitlementState(u); return '<span class="badge ' + e.badgeClass + '">' + _esc(e.label) + '</span>'; }
  function _statusBadge(s) { s = s || 'active'; if (s === 'active') return ''; return ' <span class="badge ' + (s === 'suspended' ? 'badge-archived' : 'badge-draft') + '">' + _esc(s) + '</span>'; }
  /* Resolve a coachingId → coaching name (ADR-032) so affiliation reads as the institute name, not a raw code.
     Reuses the already-loaded _coachings (API.getCoachings on render). Unknown/deleted coaching → show the raw id. */
  function _coachingName(id) {
    if (!id) return null;
    for (var i = 0; i < _coachings.length; i++) { var c = _coachings[i]; if ((c.id || c.coachingId) === id) return c.name || id; }
    return id;
  }

  function render() {
    var c = document.getElementById('view-users');
    if (!c) return;
    _split = SplitView.mount(c, {
      renderList: _renderMaster,
      renderDetail: _renderDetail,
      emptyDetail: function () { return '<div class="splitview-empty empty-state"><div class="empty-state-icon">👤</div><div class="empty-state-text">Select a user to open their 360.</div></div>'; }
    });
    if (!_coachings.length) { API.getCoachings().then(function (l) { _coachings = l || []; if (document.getElementById('uList')) _renderList(); }).catch(function () { }); }
    _load();
  }

  /* ───────── Master list ───────── */
  function _renderMaster(listEl) {
    var chips = CHIPS.map(function (ch) { return '<button class="chip' + (ch === _filter ? ' active' : '') + '" data-chip="' + ch + '">' + ch.charAt(0).toUpperCase() + ch.slice(1) + '</button>'; }).join('');
    listEl.innerHTML =
      '<div class="view-header" style="margin-bottom:.4rem;"><h2 class="view-title">User-360</h2><p class="view-subtitle">Single source of truth for every user.</p></div>' +
      '<div class="chip-bar" id="uChips">' + chips + '</div>' +
      '<input type="text" class="modal-input" id="uText" placeholder="Filter loaded users (name / email)" aria-label="Filter loaded users by name or email" style="margin:.5rem 0;" />' +
      '<div id="uBulk"></div>' +
      '<div id="uList"><div class="loading">Loading…</div></div>' +
      '<div id="uMore" style="margin-top:.5rem;"></div>';
    listEl.querySelector('#uChips').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-chip]') : null;
      if (!b) return;
      _filter = b.getAttribute('data-chip'); _bulk = {}; _text = '';
      listEl.querySelectorAll('.chip').forEach(function (el) { el.classList.toggle('active', el.getAttribute('data-chip') === _filter); });
      var t = listEl.querySelector('#uText'); if (t) t.value = '';
      _load();
    });
    var txt = listEl.querySelector('#uText'); txt.value = _text;
    txt.addEventListener('input', function (e) { _text = e.target.value; _renderList(); });
  }

  function _load() {
    var listEl = document.getElementById('uList'); if (listEl) listEl.innerHTML = '<div class="loading">Loading…</div>';
    var moreEl = document.getElementById('uMore'); if (moreEl) moreEl.innerHTML = '';
    if (_filter === 'inactive') {
      API.getInactiveUsers(90, 300).then(function (res) { _all = (res && res.data) || []; _cursor = null; _renderBulkBar(); _renderList(); })
        .catch(function (e) { if (listEl) listEl.innerHTML = '<div class="empty-state"><div class="empty-state-text">' + _esc(AdminUtils.getReadableError(e)) + '</div></div>'; });
    } else {
      _renderBulkBar();
      API.getUsers().then(function (res) { _all = (res && (res.data || res.users)) || []; _cursor = (res && res.nextCursor) || null; _renderList(); })
        .catch(function (e) { if (listEl) listEl.innerHTML = '<div class="empty-state"><div class="empty-state-text">' + _esc(AdminUtils.getReadableError(e)) + '</div></div>'; });
    }
  }

  function _matches(u) {
    if (_text) { var q = _text.toLowerCase(); var hay = ((u.displayName || '') + ' ' + (u.email || '')).toLowerCase(); if (hay.indexOf(q) === -1) return false; }
    if (_filter === 'all' || _filter === 'inactive') return true;
    if (_filter === 'suspended') return (u.accountStatus === 'suspended');
    if (_filter === 'archived') return (u.accountStatus === 'archived');
    return AdminUtils.entitlementState(u).state === _filter; /* free / premium / trial */
  }

  function _renderList() {
    var listEl = document.getElementById('uList'); if (!listEl) return;
    var rows = _all.filter(_matches);
    if (!rows.length) {
      listEl.innerHTML = AdminUtils.emptyState({
        icon: '👤', title: 'No users match',
        text: (_text || _filter !== 'all') ? 'No loaded users match this filter. Try a different segment or clear the search.' : 'No users have been loaded yet.'
      });
    } else {
      var bulk = (_filter === 'inactive');
      listEl.innerHTML = rows.map(function (u) {
        var name = u.displayName || u.email || u.uid;
        return '<div class="sv-row" role="button" tabindex="0" aria-label="Open ' + _esc(name) + '" data-sv-id="' + _esc(u.uid) + '" data-uid="' + _esc(u.uid) + '">' +
          (bulk ? '<input type="checkbox" class="uCheck" aria-label="Select ' + _esc(name) + '" data-uid="' + _esc(u.uid) + '" ' + (_bulk[u.uid] ? 'checked' : '') + ' onclick="event.stopPropagation();" /> ' : '') +
          '<div style="flex:1;min-width:0;"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;">' + _esc(name) + _statusBadge(u.accountStatus) + '</div>' +
          '<div style="font-size:.78rem;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;">' + _esc(u.email || '') + (u.coachingId ? ' · ' + _esc(_coachingName(u.coachingId)) : '') + (u.lastActive ? ' · last ' + _fmt(u.lastActive) : '') + '</div></div>' +
          _entBadge(u) + '</div>';
      }).join('');
      listEl.querySelectorAll('.sv-row').forEach(function (r) {
        function open() { _split.select(r.getAttribute('data-uid')); }
        r.addEventListener('click', open);
        r.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); open(); }
        });
      });
      listEl.querySelectorAll('.uCheck').forEach(function (cb) { cb.addEventListener('change', function () { _bulk[cb.getAttribute('data-uid')] = cb.checked; _renderBulkBar(); }); });
    }
    var moreEl = document.getElementById('uMore');
    if (moreEl) moreEl.innerHTML = (_cursor && _filter !== 'inactive') ? '<button class="btn btn-sm btn-outline" id="uMoreBtn">Load more</button>' : '';
    var mb = document.getElementById('uMoreBtn');
    if (mb) mb.onclick = function () { mb.disabled = true; API.getUsers(_cursor).then(function (res) { _all = _all.concat((res && (res.data || res.users)) || []); _cursor = (res && res.nextCursor) || null; _renderList(); }).catch(function () { mb.disabled = false; }); };
  }

  function _renderBulkBar() {
    var el = document.getElementById('uBulk'); if (!el) return;
    if (_filter !== 'inactive') { el.innerHTML = ''; return; }
    var ids = Object.keys(_bulk).filter(function (k) { return _bulk[k]; });
    el.innerHTML = '<div class="bulk-bar"><span>' + ids.length + ' selected (inactive ≥90d)</span>' +
      '<button class="btn btn-sm btn-outline" id="uArch"' + (ids.length ? '' : ' disabled') + '>Archive</button>' +
      '<button class="btn btn-sm btn-outline" id="uRemind"' + (ids.length ? '' : ' disabled') + '>Remind</button>' +
      '<button class="btn btn-sm btn-outline" id="uExp">Export CSV</button></div>';
    var arch = document.getElementById('uArch'); if (arch) arch.onclick = function () { _confirmBulk(ids); };
    var rem = document.getElementById('uRemind'); if (rem) rem.onclick = function () { API.bulkRemindInactive(ids).then(function (r) { Toast.success('Reminded ' + (r.sent || 0)); }).catch(function (e) { Toast.error(AdminUtils.getReadableError(e)); }); };
    var exp = document.getElementById('uExp'); if (exp) exp.onclick = function () { API.getInactiveExport(90).then(function (r) { AdminUtils.downloadCsv(r.filename, r.csv); }).catch(function (e) { Toast.error(AdminUtils.getReadableError(e)); }); };
  }
  function _confirmBulk(ids) {
    Modal.show({ title: 'Archive ' + ids.length + ' user(s)?', body: '<p class="text-sm text-secondary">Each will be Auth-disabled and scheduled for purge after the hold. Audited.</p>', actions: [{ label: 'Cancel' }, { label: 'Archive', danger: true, autoClose: false, onClick: function () { API.bulkArchiveInactive(ids).then(function (r) { Toast.success('Archived ' + (r.archived || 0)); Modal.close(); _bulk = {}; _load(); }).catch(function (e) { Toast.error(AdminUtils.getReadableError(e)); }); } }] });
  }

  /* Local list-sync (ADR-024) — keep the master row in step with mutations WITHOUT a second getUsers
     refetch. _syncRow patches the row from a freshly-loaded detail (re-renders only if something
     actually changed); _removeRow drops a deleted user instantly. This is what turns every mutation
     from 2 network calls into 1, and delete from 1 into 0. */
  function _syncRow(uid, p) {
    var r = null; for (var i = 0; i < _all.length; i++) { if (_all[i].uid === uid) { r = _all[i]; break; } }
    if (!r) return;
    var next = { displayName: p.displayName, email: p.email, coachingId: p.coachingId, plan: p.plan, planType: p.planType, planExpiry: p.planExpiry, isTrial: p.isTrial, accountStatus: p.accountStatus };
    var changed = false;
    Object.keys(next).forEach(function (k) { if (next[k] !== undefined && r[k] !== next[k]) { r[k] = next[k]; changed = true; } });
    if (changed) _renderList();
  }
  function _removeRow(uid) { _all = _all.filter(function (u) { return u.uid !== uid; }); _renderList(); }

  /* ───────── Detail (360) ───────── */
  function _renderDetail(detailEl, uid) {
    detailEl.innerHTML = '<a href="#" class="sv-back btn btn-sm btn-outline">← Back</a><div class="loading">Loading user…</div>';
    API.getUserDetails(uid).then(function (d) {
      var p = d.profile || {};
      _syncRow(uid, p);
      detailEl.innerHTML = '<a href="#" class="sv-back btn btn-sm btn-outline">← Back</a>' +
        '<div class="view-header" style="margin:.25rem 0 .5rem;"><h2 class="view-title" style="font-size:1.2rem;">' + _esc(p.displayName || p.email || uid) + ' ' + _entBadge(p) + _statusBadge(p.accountStatus) + '</h2>' +
        '<p class="view-subtitle">' + _esc(p.email || '') + ' · <code>' + _esc(uid) + '</code></p></div>' +
        '<div id="uTabs"></div>';
      Tabs.mount(document.getElementById('uTabs'), {
        tabs: [
          { id: 'profile', label: 'Profile', render: function (el) { _tabProfile(el, uid, p); } },
          { id: 'entitlement', label: 'Entitlement', render: function (el) { _tabEntitlement(el, uid, p); } },
          { id: 'lifecycle', label: 'Lifecycle', render: function (el) { _tabLifecycle(el, uid, p); } },
          { id: 'ai', label: 'AI', render: function (el) { _tabAI(el, uid, d); } },
          { id: 'activity', label: 'Activity', render: function (el) { _tabActivity(el, uid); } },
          { id: 'payments', label: 'Payments', render: function (el) { _tabPayments(el, uid); } },
          { id: 'audit', label: 'Audit', render: function (el) { _tabAudit(el, uid); } }
        ]
      });
    }).catch(function (e) { detailEl.innerHTML = '<a href="#" class="sv-back btn btn-sm btn-outline">← Back</a><div class="empty-state"><div class="empty-state-text">' + _esc(AdminUtils.getReadableError(e)) + '</div></div>'; });
  }

  function _kv(k, v) { return '<div class="cc-feed-row"><span class="muted">' + _esc(k) + '</span><span>' + (v == null || v === '' ? '—' : _esc(v)) + '</span></div>'; }

  function _tabProfile(el, uid, p) {
    var opts = '<option value="">— Independent —</option>' + _coachings.map(function (c) { var id = c.id || c.coachingId; return '<option value="' + _esc(id) + '"' + (p.coachingId === id ? ' selected' : '') + '>' + _esc((c.name || id) + ' (' + id + ')') + '</option>'; }).join('');
    el.innerHTML = '<div class="card" style="padding:1rem;">' +
      _kv('Name', p.displayName) + _kv('Email', p.email) + _kv('UID', uid) +
      _kv('Plan', AdminUtils.entitlementState(p).label) + _kv('Plan source', p.planSource) + _kv('Account status', p.accountStatus || 'active') + _kv('Joined', _fmt(p.createdAt)) +
      _kv('Coaching', _coachingName(p.coachingId) || 'Independent') +
      '<div style="margin-top:.75rem;"><label class="modal-label">Coaching affiliation</label><div style="display:flex;gap:.5rem;"><select class="modal-select" id="uReassign" style="flex:1;">' + opts + '</select><button class="btn btn-sm accent" id="uReassignBtn">Reassign</button></div></div></div>';
    document.getElementById('uReassignBtn').onclick = function () {
      var cid = document.getElementById('uReassign').value;
      API.reassignCoaching(uid, cid).then(function () { Toast.success('Coaching reassigned'); _split.select(uid); }).catch(function (e) { Toast.error(AdminUtils.getReadableError(e)); });
    };
  }

  function _tabEntitlement(el, uid, p) {
    var e = AdminUtils.entitlementState(p);
    el.innerHTML = '<div class="card" style="padding:1rem;">' +
      _kv('Current', e.label) + _kv('Plan type', p.planType) + _kv('Expiry', _fmt(p.planExpiry)) + _kv('Trial?', p.isTrial ? 'yes (ends ' + _fmt(p.trialEnd) + ')' : 'no') +
      '<div class="cc-quick" style="margin-top:.75rem;">' +
      '<button class="btn btn-sm accent" data-ent="premium_6m">Grant 6m</button>' +
      '<button class="btn btn-sm accent" data-ent="premium_12m">Grant 12m</button>' +
      '<button class="btn btn-sm btn-outline" data-ent="trial">Grant trial…</button>' +
      '<button class="btn btn-sm btn-danger" data-ent="revoke">Revoke</button>' +
      '</div></div>';
    el.querySelectorAll('[data-ent]').forEach(function (b) {
      b.onclick = function () {
        var act = b.getAttribute('data-ent');
        if (act === 'trial') {
          Modal.show({ title: 'Grant trial', body: '<label class="modal-label">Days</label><input type="number" class="modal-input" id="uTrialDays" value="7" min="1" max="365" />', actions: [{ label: 'Cancel' }, { label: 'Grant', accent: true, autoClose: false, onClick: function () { var days = parseInt((document.getElementById('uTrialDays') || {}).value, 10) || 7; API.grantEntitlement('individual', 'trial', uid, days).then(function () { Toast.success('Trial granted'); Modal.close(); _split.select(uid); }).catch(function (er) { Toast.error(AdminUtils.getReadableError(er)); }); } }] });
          return;
        }
        b.disabled = true;
        API.grantEntitlement('individual', act, uid).then(function () { Toast.success(act === 'revoke' ? 'Revoked' : 'Granted'); _split.select(uid); }).catch(function (er) { b.disabled = false; Toast.error(AdminUtils.getReadableError(er)); });
      };
    });
  }

  function _tabLifecycle(el, uid, p) {
    var s = p.accountStatus || 'active';
    el.innerHTML = '<div class="card" style="padding:1rem;">' + _kv('Status', s) + _kv('Suspended', _fmt(p.suspendedAt)) + _kv('Archived', _fmt(p.archivedAt)) + _kv('Purge after', _fmt(p.purgeAfter)) +
      '<div class="cc-quick" style="margin-top:.75rem;">' +
      ((s === 'suspended' || s === 'archived') ? '<button class="btn btn-sm accent" data-lc="restore">Restore</button>' : '<button class="btn btn-sm btn-outline" data-lc="suspend">Suspend</button>') +
      (s !== 'archived' ? '<button class="btn btn-sm btn-outline" data-lc="archive">Archive</button>' : '') +
      '<button class="btn btn-sm btn-outline" data-lc="reset">Reset progress</button>' +
      '<button class="btn btn-sm btn-danger" data-lc="delete">Delete account</button>' +
      '</div></div>';
    el.querySelectorAll('[data-lc]').forEach(function (b) {
      b.onclick = function () {
        var lc = b.getAttribute('data-lc');
        if (lc === 'delete') { return _confirmDelete(uid); }
        var fn = lc === 'suspend' ? API.suspendUser : lc === 'restore' ? API.restoreUser : lc === 'archive' ? function (u) { return API.archiveUser(u, 'admin'); } : API.resetUserProgress;
        b.disabled = true;
        fn(uid).then(function () { Toast.success(lc + ' done'); _split.select(uid); }).catch(function (e) { b.disabled = false; Toast.error(AdminUtils.getReadableError(e)); });
      };
    });
  }
  function _confirmDelete(uid) {
    Modal.show({ title: 'Permanently delete account', body: '<p class="text-sm text-secondary">This deletes the Auth account + all Firestore data. Irreversible. Type <strong>DELETE</strong> to confirm.</p><input type="text" class="modal-input" id="uDel" placeholder="DELETE" />', actions: [{ label: 'Cancel' }, { label: 'Delete', danger: true, autoClose: false, onClick: function () { if ((document.getElementById('uDel') || {}).value !== 'DELETE') { Toast.error('Type DELETE'); return; } API.purgeUser(uid).then(function () { Toast.success('Account deleted'); Modal.close(); _removeRow(uid); _split.clear(); }).catch(function (e) { Toast.error(AdminUtils.getReadableError(e)); }); } }] });
  }

  function _tabAI(el, uid, d) {
    var a = d.aiUsage || {};
    var cost = a.gptCostUSD != null ? Number(a.gptCostUSD).toFixed(4) : '0';
    var thr = (d.profile && d.profile.aiThrottle) || null;
    el.innerHTML = '<div class="card" style="padding:1rem;">' +
      _kv('GPT cost (lifetime)', '$' + cost) + _kv('GPT calls', a.gptCalls || 0) + _kv('Tokens in/out', (a.gptTokensInput || 0) + ' / ' + (a.gptTokensOutput || 0)) + _kv('Word problems', a.wordProblemsUsedLifetime || 0) + _kv('Explanations', a.explanationsUsed || 0) +
      _kv('Throttle', thr ? thr.cap + '/day (by ' + (thr.setBy || '?') + ')' : 'none') +
      '<div style="display:flex;gap:.5rem;margin-top:.75rem;"><input type="number" class="modal-input" id="uCap" placeholder="daily cap (0 = clear)" style="flex:1;" value="' + (thr ? thr.cap : '') + '" /><button class="btn btn-sm accent" id="uThrBtn">Set throttle</button></div></div>';
    document.getElementById('uThrBtn').onclick = function () { var cap = parseInt((document.getElementById('uCap') || {}).value, 10) || 0; API.throttleUser(uid, cap).then(function () { Toast.success(cap > 0 ? 'Throttled to ' + cap + '/day' : 'Throttle cleared'); _split.select(uid); }).catch(function (e) { Toast.error(AdminUtils.getReadableError(e)); }); };
  }

  function _tabActivity(el, uid) {
    el.innerHTML = '<div class="loading">Loading…</div>';
    API.getUserActivity(uid).then(function (r) {
      var t = (r && r.timeline) || [];
      el.innerHTML = '<div class="card" style="padding:1rem;">' + (t.length ? t.map(function (ev) { return '<div class="cc-feed-row"><span>' + _esc(ev.type) + ' · ' + _esc(ev.detail || '') + '</span><span class="cc-feed-when">' + _esc(_fmtT(ev.at)) + '</span></div>'; }).join('') : '<div class="muted">No recent activity.</div>') + '</div>';
    }).catch(function (e) { el.innerHTML = '<div class="empty-state"><div class="empty-state-text">' + _esc(AdminUtils.getReadableError(e)) + '</div></div>'; });
  }

  function _tabPayments(el, uid) {
    el.innerHTML = '<div class="loading">Loading…</div>';
    API.getUserPaymentHistory(uid).then(function (r) {
      var ps = (r && r.payments) || [];
      el.innerHTML = '<div class="card" style="padding:1rem;">' + (ps.length ? ps.map(function (p) { return '<div class="cc-feed-row"><span>' + _esc(p.plan || '?') + ' · ₹' + (p.amountINR != null ? p.amountINR : '?') + ' · ' + _esc(p.status || '') + '</span><span class="cc-feed-when">' + _esc(_fmt(p.claimedAt)) + '</span></div>'; }).join('') : '<div class="muted">No payments.</div>') + '</div>';
    }).catch(function (e) { el.innerHTML = '<div class="empty-state"><div class="empty-state-text">' + _esc(AdminUtils.getReadableError(e)) + '</div></div>'; });
  }

  function _tabAudit(el, uid) {
    el.innerHTML = '<div class="loading">Loading…</div>';
    API.getUserAdminHistory(uid).then(function (r) {
      var ls = (r && r.actions) || [];
      el.innerHTML = '<div class="card" style="padding:1rem;">' + (ls.length ? ls.map(function (l) { return '<div class="cc-feed-row"><span>' + _esc(l.action) + ' — ' + _esc(l.summary || '') + ' <span class="muted">(' + _esc(l.actor) + ')</span></span><span class="cc-feed-when">' + _esc(_fmtT(l.timestamp)) + '</span></div>'; }).join('') : '<div class="muted">No admin actions on this user.</div>') + '</div>';
    }).catch(function (e) { el.innerHTML = '<div class="empty-state"><div class="empty-state-text">' + _esc(AdminUtils.getReadableError(e)) + '</div></div>'; });
  }

  return { render: render };
})();
