/**
 * coachings.js — COACHING-360 (Super Admin V2, ADR-022).
 *
 * The single source of truth for a coaching institute. SplitView: a filterable master list
 * (status chips + text + the SOLE "New Coaching" create owner) and an in-flow detail pane with
 * tabs Overview | Students | Allocation | AI | Activity | Settings. All coaching management
 * actions (create, suspend/activate/delete, token reset, roster) live here — nowhere else.
 */
var CoachingsView = (function () {
  'use strict';

  var _split = null, _all = [], _filter = 'all', _text = '', _usageCache = null;
  var CHIPS = ['all', 'active', 'suspended', 'deleted'];

  function _esc(s) { return AdminUtils.escapeHtml(s); }
  function _fmt(v) { return AdminUtils.formatDate(v); }
  function _fmtT(v) { return AdminUtils.formatDateTime(v); }
  function _statusOf(c) { return c.status || (c.isActive === false ? 'suspended' : 'active'); }
  function _statusBadge(s) {
    if (s === 'deleted') return '<span class="badge badge-archived">Deleted</span>';
    if (s === 'suspended') return '<span class="badge badge-draft">Suspended</span>';
    return '<span class="badge badge-active">Active</span>';
  }

  function render() {
    var c = document.getElementById('view-coachings');
    if (!c) return;
    _split = SplitView.mount(c, {
      renderList: _renderMaster,
      renderDetail: _renderDetail,
      emptyDetail: function () { return '<div class="splitview-empty empty-state"><div class="empty-state-icon">🏢</div><div class="empty-state-text">Select a coaching to open its 360.</div></div>'; }
    });
    _load();
  }

  /* ───────── Master list ───────── */
  function _renderMaster(listEl) {
    var chips = CHIPS.map(function (ch) { return '<button class="chip' + (ch === _filter ? ' active' : '') + '" data-chip="' + ch + '">' + ch.charAt(0).toUpperCase() + ch.slice(1) + '</button>'; }).join('');
    listEl.innerHTML =
      '<div class="view-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;margin-bottom:.4rem;">' +
        '<div><h2 class="view-title">Coaching-360</h2><p class="view-subtitle">Single source of truth for every coaching.</p></div>' +
        '<button class="btn btn-sm accent" id="cNew">+ New</button></div>' +
      '<div class="chip-bar" id="cChips">' + chips + '</div>' +
      '<input type="text" class="modal-input" id="cText" placeholder="Filter by name / ID / owner" aria-label="Filter coachings by name, ID, or owner" style="margin:.5rem 0;" />' +
      '<div id="cList"><div class="loading">Loading…</div></div>';
    listEl.querySelector('#cNew').addEventListener('click', _showCreateModal);
    listEl.querySelector('#cChips').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-chip]') : null; if (!b) return;
      _filter = b.getAttribute('data-chip');
      listEl.querySelectorAll('.chip').forEach(function (el) { el.classList.toggle('active', el.getAttribute('data-chip') === _filter); });
      _renderList();
    });
    var txt = listEl.querySelector('#cText'); txt.value = _text;
    txt.addEventListener('input', function (e) { _text = e.target.value; _renderList(); });
  }

  function _load() {
    var listEl = document.getElementById('cList'); if (listEl) listEl.innerHTML = '<div class="loading">Loading…</div>';
    API.getCoachings().then(function (res) {
      _all = Array.isArray(res) ? res : (res.coachings || res.data || []);
      _renderList();
    }).catch(function (e) { if (listEl) listEl.innerHTML = '<div class="empty-state"><div class="empty-state-text">' + _esc(AdminUtils.getReadableError(e)) + '</div></div>'; });
  }

  function _matches(c) {
    var s = _statusOf(c);
    if (_filter !== 'all' && s !== _filter) return false;
    if (_text) { var q = _text.toLowerCase(); var hay = ((c.name || '') + ' ' + (c.id || c.coachingId || '') + ' ' + (c.ownerEmail || '')).toLowerCase(); if (hay.indexOf(q) === -1) return false; }
    return true;
  }

  function _renderList() {
    var listEl = document.getElementById('cList'); if (!listEl) return;
    var rows = _all.filter(_matches);
    if (!rows.length) {
      listEl.innerHTML = AdminUtils.emptyState({
        icon: '🏫', title: 'No coachings match',
        text: (_text || _filter !== 'all') ? 'No coachings match this filter. Try a different status or clear the search.' : 'No coachings yet. Use “+ New” to create the first one.'
      });
      return;
    }
    listEl.innerHTML = rows.map(function (c) {
      var id = c.id || c.coachingId;
      var name = c.name || id;
      return '<div class="sv-row" role="button" tabindex="0" aria-label="Open ' + _esc(name) + '" data-sv-id="' + _esc(id) + '" data-cid="' + _esc(id) + '">' +
        '<div style="flex:1;min-width:0;"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;">' + _esc(name) + '</div>' +
        '<div style="font-size:.78rem;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;"><code>' + _esc(id) + '</code> · ' + (c.studentCount != null ? c.studentCount : (c.studentsCount || 0)) + ' students' + (c.ownerEmail ? ' · ' + _esc(c.ownerEmail) : '') + '</div></div>' +
        _statusBadge(_statusOf(c)) + '</div>';
    }).join('');
    listEl.querySelectorAll('.sv-row').forEach(function (r) {
      function open() { _split.select(r.getAttribute('data-cid')); }
      r.addEventListener('click', open);
      r.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); open(); }
      });
    });
  }

  /* Local list-sync (ADR-024) — patch the master row from a freshly-loaded detail so a mutate needs
     only ONE network call (the detail refresh) instead of a second getCoachings. */
  function _syncRow(cid, d) {
    var r = null; for (var i = 0; i < _all.length; i++) { var id = _all[i].id || _all[i].coachingId; if (id === cid) { r = _all[i]; break; } }
    if (!r) return;
    var changed = false;
    if (d.status !== undefined && r.status !== d.status) { r.status = d.status; r.isActive = (d.status === 'active'); changed = true; }
    if (d.name !== undefined && r.name !== d.name) { r.name = d.name; changed = true; }
    if (changed) _renderList();
  }

  /* ───────── Detail (360) ───────── */
  function _renderDetail(detailEl, cid) {
    detailEl.innerHTML = '<a href="#" class="sv-back btn btn-sm btn-outline">← Back</a><div class="loading">Loading coaching…</div>';
    API.getCoachingDetails(cid).then(function (d) {
      _syncRow(cid, d);
      detailEl.innerHTML = '<a href="#" class="sv-back btn btn-sm btn-outline">← Back</a>' +
        '<div class="view-header" style="margin:.25rem 0 .5rem;"><h2 class="view-title" style="font-size:1.2rem;">' + _esc(d.name || cid) + ' ' + _statusBadge(d.status) + '</h2>' +
        '<p class="view-subtitle"><code>' + _esc(cid) + '</code>' + (d.ownerEmail ? ' · ' + _esc(d.ownerEmail) : '') + '</p></div>' +
        '<div id="cTabs"></div>';
      Tabs.mount(document.getElementById('cTabs'), {
        tabs: [
          { id: 'overview', label: 'Overview', render: function (el) { _tabOverview(el, d); } },
          { id: 'students', label: 'Students', render: function (el) { _tabStudents(el, cid); } },
          { id: 'allocation', label: 'Allocation', render: function (el) { _tabAllocation(el, d); } },
          { id: 'ai', label: 'AI', render: function (el) { _tabAI(el, cid); } },
          { id: 'activity', label: 'Activity', render: function (el) { _tabActivity(el, cid); } },
          { id: 'settings', label: 'Settings', render: function (el) { _tabSettings(el, d); } }
        ]
      });
    }).catch(function (e) { detailEl.innerHTML = '<a href="#" class="sv-back btn btn-sm btn-outline">← Back</a><div class="empty-state"><div class="empty-state-text">' + _esc(AdminUtils.getReadableError(e)) + '</div></div>'; });
  }

  function _kv(k, v) { return '<div class="cc-feed-row"><span class="muted">' + _esc(k) + '</span><span>' + (v == null || v === '' ? '—' : _esc(v)) + '</span></div>'; }

  function _tabOverview(el, d) {
    el.innerHTML = '<div class="card" style="padding:1rem;">' +
      _kv('Name', d.name) + _kv('Coaching ID', d.coachingId) + _kv('Status', d.status) + _kv('Owner', d.ownerEmail) +
      _kv('Plan', d.entitlementPlan) + _kv('Capacity', d.capacity != null ? d.capacity : 'Unlimited') +
      _kv('Students', d.studentCount != null ? d.studentCount : '—') + _kv('Premium students', d.premiumCount != null ? d.premiumCount : '—') +
      _kv('Created', _fmt(d.createdAt)) + '</div>';
  }

  function _tabStudents(el, cid) {
    el.innerHTML = '<div class="loading">Loading roster…</div>';
    API.getCoachingStudents(cid).then(function (r) {
      var ss = (r && r.students) || [];
      if (!ss.length) { el.innerHTML = '<div class="card" style="padding:1rem;"><div class="muted">No students enrolled.</div></div>'; return; }
      el.innerHTML = '<div class="card" style="padding:1rem;">' + (r.truncated ? '<div class="muted" style="margin-bottom:.5rem;">Showing first ' + ss.length + ' (truncated).</div>' : '') +
        ss.map(function (s) {
          return '<div class="cc-feed-row"><span>' + _esc(s.name) + ' <span class="muted">' + _esc(s.email) + '</span></span>' +
            '<span><span class="badge ' + (s.plan === 'premium' ? 'badge-active' : 'badge-draft') + '">' + (s.plan === 'premium' ? 'Premium' : 'Free') + '</span>' + (s.accountStatus && s.accountStatus !== 'active' ? ' <span class="badge badge-draft">' + _esc(s.accountStatus) + '</span>' : '') + '</span></div>';
        }).join('') + '</div>';
    }).catch(function (e) { el.innerHTML = '<div class="empty-state"><div class="empty-state-text">' + _esc(AdminUtils.getReadableError(e)) + '</div></div>'; });
  }

  function _tabAllocation(el, d) {
    var prem = d.premiumCount != null ? d.premiumCount : 0;
    var total = d.studentCount != null ? d.studentCount : 0;
    var share = total > 0 ? Math.round((prem / total) * 100) : 0;
    el.innerHTML = '<div class="card" style="padding:1rem;">' +
      _kv('Premium allocation', prem + ' of ' + total + ' students (' + share + '%)') +
      _kv('Entitlement plan', d.entitlementPlan) +
      '<div class="muted" style="margin-top:.5rem;font-size:.8rem;">Per-payment revenue attribution lives in the <a href="#" onclick="window.location.hash=\'#revenue\';return false;">Revenue Center</a>. Premium count here reflects students currently on an active premium plan.</div></div>';
  }

  function _tabAI(el, cid) {
    el.innerHTML = '<div class="loading">Aggregating AI spend…</div>';
    var go = function (rows) {
      var mine = rows.filter(function (u) { return u.coachingId === cid; });
      var cost = 0, calls = 0; mine.forEach(function (u) { cost += parseFloat(u.totalEstimatedCost) || 0; calls += (u.totalCalls || 0); });
      mine.sort(function (a, b) { return parseFloat(b.totalEstimatedCost) - parseFloat(a.totalEstimatedCost); });
      el.innerHTML = '<div class="card" style="padding:1rem;">' +
        _kv('AI consumers', mine.length) + _kv('Est. spend (lifetime)', '$' + cost.toFixed(4)) + _kv('Total AI calls', calls) +
        (mine.length ? '<div class="cc-section-title" style="margin-top:.75rem;">Top consumers</div>' + mine.slice(0, 8).map(function (u) { return '<div class="cc-feed-row"><span>' + _esc(u.displayName || u.email) + '</span><span>$' + parseFloat(u.totalEstimatedCost).toFixed(4) + '</span></div>'; }).join('') : '<div class="muted" style="margin-top:.5rem;">No AI usage attributed to this coaching.</div>') +
        '</div>';
    };
    if (_usageCache) { go(_usageCache); return; }
    API.getAIUsage().then(function (res) { _usageCache = (res && res.analytics) || []; go(_usageCache); })
      .catch(function (e) { el.innerHTML = '<div class="empty-state"><div class="empty-state-text">' + _esc(AdminUtils.getReadableError(e)) + '</div></div>'; });
  }

  function _tabActivity(el, cid) {
    el.innerHTML = '<div class="loading">Loading…</div>';
    API.getCoachingActivity(cid).then(function (r) {
      var ls = (r && r.actions) || [];
      el.innerHTML = '<div class="card" style="padding:1rem;">' + (ls.length ? ls.map(function (l) { return '<div class="cc-feed-row"><span>' + _esc(l.action) + ' — ' + _esc(l.summary || '') + ' <span class="muted">(' + _esc(l.actor) + ')</span></span><span class="cc-feed-when">' + _esc(_fmtT(l.timestamp)) + '</span></div>'; }).join('') : '<div class="muted">No activity recorded.</div>') + '</div>';
    }).catch(function (e) { el.innerHTML = '<div class="empty-state"><div class="empty-state-text">' + _esc(AdminUtils.getReadableError(e)) + '</div></div>'; });
  }

  function _tabSettings(el, d) {
    var cid = d.coachingId;
    var s = d.status;
    el.innerHTML = '<div class="card" style="padding:1rem;">' +
      '<div class="cc-feed-row"><span class="muted">Registration token</span><span><code id="cTok">' + _esc(d.registrationToken || '—') + '</code> <button class="btn btn-sm btn-outline" id="cTokBtn">Rotate</button></span></div>' +
      '<div class="modal-field" style="margin-top:.75rem;"><label class="modal-label">Logo URL (shown on the student join screen)</label>' +
        '<input type="url" id="cLogo" class="modal-input" placeholder="https://… (blank to remove)" value="' + _esc(d.logoUrl || '') + '" />' +
        '<button class="btn btn-sm btn-outline" id="cLogoBtn" style="margin-top:.5rem;">Save logo</button></div>' +
      '<div class="cc-quick" style="margin-top:.75rem;">' +
      (s === 'suspended' ? '<button class="btn btn-sm accent" data-mut="activate">Activate</button>' : (s !== 'deleted' ? '<button class="btn btn-sm btn-outline" data-mut="suspend">Suspend</button>' : '')) +
      (s !== 'deleted' ? '<button class="btn btn-sm btn-danger" data-mut="delete">Delete</button>' : '') +
      '</div>' +
      '<div class="muted" style="margin-top:.5rem;font-size:.8rem;">Suspend / delete cascade-revokes premium from all students.</div></div>';
    var tb = document.getElementById('cTokBtn');
    if (tb) tb.onclick = function () { tb.disabled = true; API.resetCoachingToken(cid).then(function (r) { var t = document.getElementById('cTok'); if (t) t.textContent = r.registrationToken; Toast.success('Token rotated'); }).catch(function (e) { tb.disabled = false; Toast.error(AdminUtils.getReadableError(e)); }); };
    var lb = document.getElementById('cLogoBtn');
    if (lb) lb.onclick = function () {
      var logo = (document.getElementById('cLogo') || {}).value || '';
      lb.disabled = true; lb.textContent = 'Saving…';
      API.editCoaching(cid, { logoUrl: logo.trim() }).then(function () { lb.disabled = false; lb.textContent = 'Save logo'; Toast.success('Logo updated'); })
        .catch(function (e) { lb.disabled = false; lb.textContent = 'Save logo'; Toast.error(AdminUtils.getReadableError(e)); });
    };
    el.querySelectorAll('[data-mut]').forEach(function (b) {
      b.onclick = function () {
        var act = b.getAttribute('data-mut');
        var label = act.charAt(0).toUpperCase() + act.slice(1);
        if (act === 'activate') {
          /* Non-destructive — simple confirm, no token. */
          Modal.show({ title: 'Activate coaching?', body: '<p class="text-sm text-secondary">Re-activates the coaching. (Premium previously revoked from students is NOT auto-restored.)</p>', actions: [{ label: 'Cancel' }, { label: 'Activate', accent: true, autoClose: false, onClick: function () {
            API.mutateCoaching(cid, 'activate').then(function () { Toast.success('Coaching activated'); Modal.close(); _split.select(cid); }).catch(function (e) { Toast.error(AdminUtils.getReadableError(e)); });
          } }] });
          return;
        }
        /* suspend + delete cascade-revoke premium from ALL students — type-DELETE gate + server confirm token (§10B). */
        Modal.show({
          title: label + ' coaching',
          body: '<p class="text-sm text-secondary">This <strong>cascade-revokes premium from every enrolled student</strong> and is audited. Type <strong>DELETE</strong> to confirm.</p><input type="text" class="modal-input" id="cMutConfirm" placeholder="DELETE" />',
          actions: [{ label: 'Cancel' }, { label: label, danger: true, autoClose: false, onClick: function () {
            if ((document.getElementById('cMutConfirm') || {}).value !== 'DELETE') { Toast.error('Type DELETE to confirm'); return; }
            API.mutateCoaching(cid, act, 'DELETE').then(function () { Toast.success('Coaching ' + act + 'd'); Modal.close(); _split.select(cid); }).catch(function (e) { Toast.error(AdminUtils.getReadableError(e)); });
          } }]
        });
      };
    });
  }

  /* ───────── Create (sole owner) ───────── */
  function _showCreateModal() {
    var body = document.createElement('div');
    body.innerHTML =
      '<div class="modal-field"><label class="modal-label">Coaching Name</label><input type="text" id="coachingName" class="modal-input" placeholder="e.g. Allen Academy" /></div>' +
      '<div class="modal-field"><label class="modal-label">Owner Email (optional)</label><input type="email" id="coachingEmail" class="modal-input" placeholder="admin@allen.in" /></div>' +
      '<div class="modal-field"><label class="modal-label">Capacity (optional)</label><input type="number" id="coachingCapacity" class="modal-input" placeholder="Leave blank for unlimited" /></div>' +
      '<div class="modal-field"><label class="modal-label">Logo URL (optional)</label><input type="url" id="coachingLogo" class="modal-input" placeholder="https://… (shown on the student join screen)" /></div>';
    Modal.show({ title: 'Create New Coaching', body: body, actions: [{ label: 'Cancel' }, { label: 'Create Coaching', accent: true, autoClose: false, onClick: _handleCreate }] });
  }

  async function _handleCreate(btn) {
    var name = document.getElementById('coachingName').value.trim();
    var capacity = document.getElementById('coachingCapacity').value.trim();
    var email = document.getElementById('coachingEmail').value.trim();
    var logo = document.getElementById('coachingLogo').value.trim();
    if (!name) { Toast.error('Name is required.'); return; }
    btn.disabled = true; btn.textContent = 'Creating...';
    try {
      var payload = { name: name };
      if (capacity) payload.capacity = parseInt(capacity, 10);
      if (email) payload.ownerEmail = email;
      if (logo) payload.logoUrl = logo;
      var res = await API.createCoaching(payload);
      Modal.close();
      Toast.success('Coaching created: ' + (res.coachingId || 'OK'));
      _load();
    } catch (e) { btn.disabled = false; btn.textContent = 'Create Coaching'; Toast.error(AdminUtils.getReadableError(e)); }
  }

  return { render: render };
})();
