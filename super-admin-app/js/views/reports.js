/**
 * reports.js — REPORTS TRIAGE (Super Admin, ADR-096).
 *
 * The source of truth for every user-submitted report (bugs, wrong questions/answers/explanations,
 * feedback). SplitView: a filterable/searchable master list (status chips + priority sub-filter +
 * cursor "Load more") beside a detail pane with tabs Overview | Question | Context | History | Actions.
 * All triage actions (status, assign, priority, label, note, merge-duplicate) live here. No email /
 * reply-to-reporter channel — the dashboard IS the response surface.
 */
var ReportsView = (function () {
  'use strict';

  var _split = null;
  var _rows = [], _cursor = null, _loading = false, _more = false, _pageLocal = false;
  var _statusFilter = 'open', _priorityFilter = '', _text = '', _analytics = null;

  var STATUS_CHIPS = ['all', 'open', 'investigating', 'needs_info', 'resolved', 'dismissed', 'duplicate', 'archived'];
  var STATUS_LABELS = { open: 'Open', investigating: 'Investigating', needs_info: 'Needs info', resolved: 'Resolved', dismissed: 'Dismissed', duplicate: 'Duplicate', archived: 'Archived' };
  var PRIORITIES = ['critical', 'high', 'medium', 'low'];
  var STATUSES = ['open', 'investigating', 'needs_info', 'resolved', 'dismissed', 'duplicate', 'archived'];
  /* ADR-099 taxonomy. Legacy ids (question_wrong, formatting) are retained so any report filed before the
     redesign still renders with a human label instead of a raw id. */
  var TYPE_LABELS = {
    /* Question family */
    answer_wrong: 'Wrong answer', solution_wrong: 'Wrong solution', explanation_wrong: 'Wrong explanation',
    options_wrong: 'Bad options', formula_wrong: 'Formula wrong', typo: 'Typo/wording', visual: 'Diagram/image',
    unclear: 'Confusing', difficulty_mismatch: 'Wrong difficulty', wrong_topic: 'Wrong topic',
    duplicate: 'Duplicate question', question_other: 'Question — other',
    /* QuanAI */
    ai_issue: 'QuanAI explanation',
    /* App */
    bug: 'Bug', crash: 'Crash', ui_issue: 'Looks broken', performance: 'Performance',
    /* Account */
    payment: 'Payment', account: 'Account',
    /* Ideas & catch-all */
    feature_request: 'Feature idea', feedback: 'Feedback', other: 'Other',
    /* Legacy (pre-ADR-099) */
    question_wrong: 'Wrong question', formatting: 'Formatting'
  };

  function _esc(s) { return AdminUtils.escapeHtml(s == null ? '' : String(s)); }
  function _fmtT(v) { return AdminUtils.formatDateTime(v); }
  function _typeLabel(t) { return TYPE_LABELS[t] || t || 'Report'; }
  function _err(e) { return AdminUtils.getReadableError(e); }

  function _statusBadge(s) {
    var cls = 'badge-draft';
    if (s === 'open') cls = 'badge-open';
    else if (s === 'investigating' || s === 'needs_info') cls = 'badge-progress';
    else if (s === 'resolved') cls = 'badge-active';
    else if (s === 'archived' || s === 'duplicate' || s === 'dismissed') cls = 'badge-archived';
    return '<span class="badge ' + cls + '">' + _esc(STATUS_LABELS[s] || s) + '</span>';
  }
  function _priorityPill(p) {
    return '<span class="report-prio report-prio-' + _esc(p || 'medium') + '">' + _esc((p || 'medium').charAt(0).toUpperCase() + (p || 'medium').slice(1)) + '</span>';
  }

  function render() {
    var c = document.getElementById('view-reports');
    if (!c) return;
    _split = SplitView.mount(c, {
      renderList: _renderMaster,
      renderDetail: _renderDetail,
      emptyDetail: function () { return '<div class="splitview-empty empty-state"><div class="empty-state-icon">⚑</div><div class="empty-state-text">Select a report to triage it.</div></div>'; }
    });
    _loadAnalytics();
    _loadFirst();
  }

  /* ───────── Master ───────── */
  function _renderMaster(listEl) {
    var chips = STATUS_CHIPS.map(function (ch) {
      return '<button class="chip' + (ch === _statusFilter ? ' active' : '') + '" data-chip="' + ch + '">' + (ch === 'all' ? 'All' : (STATUS_LABELS[ch] || ch)) + '</button>';
    }).join('');
    var prioOpts = ['<option value="">Any priority</option>'].concat(PRIORITIES.map(function (p) {
      return '<option value="' + p + '"' + (p === _priorityFilter ? ' selected' : '') + '>' + p.charAt(0).toUpperCase() + p.slice(1) + '</option>';
    })).join('');
    listEl.innerHTML =
      '<div class="view-header" style="margin-bottom:.4rem;"><h2 class="view-title">Reports</h2>' +
        '<p class="view-subtitle">User-submitted bugs, wrong content & feedback.</p></div>' +
      '<div id="rStats" class="report-stat-row"></div>' +
      '<div class="chip-bar" id="rChips">' + chips + '</div>' +
      '<div style="display:flex;gap:.5rem;margin:.5rem 0;">' +
        '<input type="text" class="modal-input" id="rText" placeholder="Search ID / title / email / type" aria-label="Search reports" style="flex:1;margin:0;" />' +
        '<select class="modal-input" id="rPrio" aria-label="Filter by priority" style="max-width:9rem;margin:0;">' + prioOpts + '</select>' +
      '</div>' +
      '<div id="rList"><div class="loading">Loading…</div></div>' +
      '<div id="rMore" style="margin-top:.5rem;"></div>';
    _paintStats();

    listEl.querySelector('#rChips').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-chip]') : null; if (!b) return;
      _statusFilter = b.getAttribute('data-chip');
      listEl.querySelectorAll('.chip').forEach(function (el) { el.classList.toggle('active', el.getAttribute('data-chip') === _statusFilter); });
      _loadFirst();
    });
    var txt = listEl.querySelector('#rText'); txt.value = _text;
    var _deb = null;
    txt.addEventListener('input', function (e) { _text = e.target.value; clearTimeout(_deb); _deb = setTimeout(_loadFirst, 300); });
    listEl.querySelector('#rPrio').addEventListener('change', function (e) { _priorityFilter = e.target.value; _loadFirst(); });
  }

  function _filters() {
    var f = {};
    if (_statusFilter && _statusFilter !== 'all') f.status = _statusFilter;
    if (_priorityFilter) f.priority = _priorityFilter;
    if (_text && _text.trim()) f.q = _text.trim();
    return f;
  }

  function _loadFirst() {
    _rows = []; _cursor = null; _more = false;
    var listEl = document.getElementById('rList'); if (listEl) listEl.innerHTML = '<div class="loading">Loading…</div>';
    _fetchPage(true);
  }
  function _fetchPage(reset) {
    if (_loading) return;
    _loading = true;
    API.getReports(reset ? null : _cursor, _filters()).then(function (res) {
      _loading = false;
      var got = (res && res.reports) || [];
      _rows = reset ? got : _rows.concat(got);
      _cursor = res && res.nextCursor;
      _more = !!_cursor;
      _pageLocal = !!(res && res.pageLocalSearch);
      _renderList();
    }).catch(function (e) {
      _loading = false;
      var listEl = document.getElementById('rList');
      if (listEl) listEl.innerHTML = '<div class="empty-state"><div class="empty-state-text">' + _esc(_err(e)) + '</div></div>';
    });
  }

  function _renderList() {
    var listEl = document.getElementById('rList'); if (!listEl) return;
    if (!_rows.length) {
      listEl.innerHTML = AdminUtils.emptyState({ icon: '✅', title: 'No reports', text: 'Nothing matches this filter. Try “All” or a different priority.' });
      var moreEl0 = document.getElementById('rMore'); if (moreEl0) moreEl0.innerHTML = '';
      return;
    }
    listEl.innerHTML =
      (_pageLocal ? '<div class="muted" style="font-size:.75rem;margin-bottom:.4rem;">Search matches within the loaded pages — Load more to search further.</div>' : '') +
      _rows.map(function (r) {
        var sub = _typeLabel(r.type) + (r.reporterEmail ? ' · ' + _esc(r.reporterEmail) : '') + ' · ' + _esc(_fmtT(r.createdAt));
        return '<div class="sv-row" role="button" tabindex="0" aria-label="Open report ' + _esc(r.shortId || r.id) + '" data-sv-id="' + _esc(r.id) + '" data-rid="' + _esc(r.id) + '">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
              _priorityPill(r.priority) + ' ' + _esc(r.title || _typeLabel(r.type)) + '</div>' +
            '<div style="font-size:.78rem;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><code>' + _esc(r.shortId || r.id) + '</code> · ' + sub + '</div>' +
          '</div>' + _statusBadge(r.status) + '</div>';
      }).join('');
    listEl.querySelectorAll('.sv-row').forEach(function (row) {
      function open() { _split.select(row.getAttribute('data-rid')); }
      row.addEventListener('click', open);
      row.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); open(); } });
    });
    var moreEl = document.getElementById('rMore');
    if (moreEl) {
      moreEl.innerHTML = _more ? '<button class="btn btn-sm btn-outline" id="rMoreBtn" style="width:100%;">Load more</button>' : '';
      var mb = document.getElementById('rMoreBtn');
      if (mb) mb.onclick = function () { mb.disabled = true; mb.textContent = 'Loading…'; _fetchPage(false); };
    }
  }

  /* ───────── Analytics strip ───────── */
  function _loadAnalytics() {
    API.getReportsAnalytics().then(function (a) { _analytics = a; _paintStats(); }).catch(function () { /* non-fatal */ });
  }
  function _paintStats() {
    var el = document.getElementById('rStats'); if (!el) return;
    var a = _analytics;
    if (!a) { el.innerHTML = ''; return; }
    var oldestDays = a.oldestOpenMs != null ? Math.floor(a.oldestOpenMs / (24 * 60 * 60 * 1000)) : null;
    el.innerHTML = '<div class="stat-grid report-stat-grid">' +
      AdminUtils.statTile('Open', a.openTotal != null ? a.openTotal : '—', null, 'var(--accent-warn, #f59e0b)') +
      AdminUtils.statTile('Critical', (a.byPriority && a.byPriority.critical) != null ? a.byPriority.critical : '—', null, 'var(--accent-danger, #ef4444)') +
      AdminUtils.statTile('Today', a.today != null ? a.today : '—') +
      AdminUtils.statTile('This week', a.week != null ? a.week : '—') +
      AdminUtils.statTile('Oldest open', oldestDays != null ? (oldestDays + 'd') : '—') +
      '</div>' +
      ((a.topQuestions && a.topQuestions.length) ? '<div class="report-top-q"><div class="cc-section-title">Most-reported questions</div>' +
        a.topQuestions.slice(0, 5).map(function (q) {
          return '<div class="cc-feed-row"><span style="overflow:hidden;text-overflow:ellipsis;">' + _esc((q.category || 'unknown') + (q.subtype ? '/' + q.subtype : '')) + '</span>' +
            '<span><span class="badge badge-open">' + (q.openCount || 0) + ' open</span> ' + (q.count || 0) + '×</span></div>';
        }).join('') + '</div>' : '');
  }

  /* ───────── Detail ───────── */
  function _renderDetail(detailEl, id) {
    detailEl.innerHTML = '<a href="#" class="sv-back btn btn-sm btn-outline">← Back</a><div class="loading">Loading report…</div>';
    API.getReportDetails(id).then(function (res) {
      var r = res.report;
      _patchRow(r);
      detailEl.innerHTML = '<a href="#" class="sv-back btn btn-sm btn-outline">← Back</a>' +
        '<div class="view-header" style="margin:.25rem 0 .5rem;">' +
          '<h2 class="view-title" style="font-size:1.15rem;">' + _priorityPill(r.priority) + ' ' + _esc(r.title || _typeLabel(r.type)) + ' ' + _statusBadge(r.status) + '</h2>' +
          '<p class="view-subtitle"><code>' + _esc(r.shortId || id) + '</code> · ' + _esc(_typeLabel(r.type)) + (r.source ? ' · ' + _esc(r.source) : '') + '</p></div>' +
        '<div id="rTabs"></div>';
      Tabs.mount(document.getElementById('rTabs'), {
        tabs: [
          { id: 'overview', label: 'Overview', render: function (el) { _tabOverview(el, r); } },
          { id: 'question', label: 'Question', render: function (el) { _tabQuestion(el, r, res.aggregate, res.related); } },
          { id: 'context', label: 'Context', render: function (el) { _tabContext(el, r); } },
          { id: 'history', label: 'History', render: function (el) { _tabHistory(el, res.history); } },
          { id: 'actions', label: 'Actions', render: function (el) { _tabActions(el, r); } }
        ]
      });
    }).catch(function (e) {
      detailEl.innerHTML = '<a href="#" class="sv-back btn btn-sm btn-outline">← Back</a><div class="empty-state"><div class="empty-state-text">' + _esc(_err(e)) + '</div></div>';
    });
  }

  /* keep the master row in sync after a mutate */
  function _patchRow(r) {
    for (var i = 0; i < _rows.length; i++) {
      if (_rows[i].id === r.id) {
        _rows[i].status = r.status; _rows[i].priority = r.priority;
        _rows[i].assignedTo = r.lifecycle ? r.lifecycle.assignedTo : _rows[i].assignedTo;
        _renderList();
        break;
      }
    }
  }

  function _kv(k, v) { return '<div class="cc-feed-row"><span class="muted">' + _esc(k) + '</span><span>' + (v == null || v === '' ? '—' : _esc(v)) + '</span></div>'; }

  function _tabOverview(el, r) {
    var f = r.fields || {}, life = r.lifecycle || {}, rep = r.reporter || {};
    var extra = Object.keys(f).map(function (k) { return _kv(k.charAt(0).toUpperCase() + k.slice(1), f[k]); }).join('');
    el.innerHTML = '<div class="card" style="padding:1rem;">' +
      _kv('Type', _typeLabel(r.type)) + (r.subReason ? _kv('Reason', r.subReason) : '') +
      _kv('Priority', r.priority) + _kv('Status', STATUS_LABELS[r.status] || r.status) +
      _kv('Reporter', rep.name || rep.email || rep.uid) + _kv('Email', rep.email) +
      _kv('Plan', rep.plan) + (rep.coachingId ? _kv('Coaching', rep.coachingId) : '') +
      _kv('Assigned to', life.assignedToEmail || life.assignedTo) +
      _kv('Created', _fmtT(r.createdAt)) + (life.resolvedAt ? _kv('Resolved', _fmtT(life.resolvedAt)) : '') +
      ((life.labels && life.labels.length) ? '<div class="cc-feed-row"><span class="muted">Labels</span><span>' + life.labels.map(function (l) { return '<span class="badge badge-draft">' + _esc(l) + '</span>'; }).join(' ') + '</span></div>' : '') +
      (r.description ? '<div class="report-desc"><div class="muted" style="margin:.6rem 0 .25rem;">Description</div><div class="report-desc-body">' + _esc(r.description) + '</div></div>' : '') +
      extra +
      '</div>';
  }

  /* ADR-097: AI explanation block — the exact generation config + text so an admin can tie the report to its
     source without reproducing it. */
  function _aiBlock(ai) {
    if (!ai) return '';
    return '<div class="report-ai-block">' +
      '<div class="cc-section-title">🤖 QuanAI explanation reported</div>' +
      _kv('Explanation version', ai.promptId || '—') +
      (ai.explanation ? '<div class="muted" style="margin:.5rem 0 .25rem;">Explanation shown to the user</div><pre class="report-tech-pre">' + _esc(ai.explanation) + '</pre>' : '<div class="muted">No explanation text captured.</div>') +
      '</div>';
  }

  function _tabQuestion(el, r, aggregate, related) {
    var q = r.question;
    if (!q) { el.innerHTML = '<div class="card" style="padding:1rem;">' + (r.ai ? _aiBlock(r.ai) : '<div class="muted">This report is not tied to a specific question.</div>') + '</div>'; return; }
    var opts = '';
    if (Array.isArray(q.options) && q.options.length) {
      opts = '<div class="muted" style="margin:.6rem 0 .25rem;">Options</div>' + q.options.map(function (o) {
        var isAns = String(o) === String(q.answer);
        return '<div class="cc-feed-row"><span>' + _esc(o) + '</span><span>' + (isAns ? '<span class="badge badge-active">correct</span>' : '') + (String(o) === String(q.selectedAnswer) ? ' <span class="badge badge-progress">picked</span>' : '') + '</span></div>';
      }).join('');
    }
    el.innerHTML = '<div class="card" style="padding:1rem;">' +
      _aiBlock(r.ai) +
      (aggregate ? '<div class="report-agg"><span class="badge badge-open">Reported ' + (aggregate.count || 0) + '×</span> · ' + (aggregate.openCount || 0) + ' still open</div>' : '') +
      _kv('Signature', q.signature) + _kv('Category', q.category) + (q.subtype ? _kv('Subtype', q.subtype) : '') +
      (q.difficulty ? _kv('Difficulty', q.difficulty) : '') + _kv('Mode', q.mode) +
      _kv('Q number', (q.questionNumber != null ? q.questionNumber : '?') + (q.count != null ? ' / ' + q.count : '')) +
      (q.questionText ? '<div class="report-desc"><div class="muted" style="margin:.6rem 0 .25rem;">Question</div><div class="report-desc-body">' + _esc(q.questionText) + '</div></div>' : '') +
      opts +
      _kv('Correct answer', q.answer) + _kv('User answer', (q.wasAnswered ? q.selectedAnswer : 'not answered')) +
      (q.wasCorrect != null ? _kv('Was correct', q.wasCorrect ? 'Yes' : 'No') : '') +
      (q.explanation ? '<details class="report-tech" style="margin-top:.6rem;"><summary>Explanation</summary><div class="report-desc-body" style="padding:.5rem;">' + _esc(q.explanation) + '</div></details>' : '') +
      '<details class="report-tech" style="margin-top:.6rem;"><summary>Raw question JSON</summary><pre class="report-tech-pre">' + _esc(JSON.stringify(q, null, 2)) + '</pre></details>' +
      ((related && related.length) ? '<div class="cc-section-title" style="margin-top:.75rem;">Other reports on this question (' + related.length + ')</div>' + related.map(function (o) { return '<div class="cc-feed-row"><span><code>' + _esc(o.shortId || o.id) + '</code> · ' + _esc(_typeLabel(o.type)) + '</span>' + _statusBadge(o.status) + '</div>'; }).join('') : '') +
      '</div>';
  }

  function _tabContext(el, r) {
    var ctx = r.context || {}, app = ctx.app || {}, dev = ctx.device || {}, loc = ctx.locale || {};
    var errs = ctx.recentErrors || [];
    el.innerHTML = '<div class="card" style="padding:1rem;">' +
      _kv('App version', app.version) + _kv('Source', app.source) + _kv('Target exam', app.targetExam) +
      _kv('Theme', (app.theme || '-') + ' / ' + (app.appearance || '-')) +
      _kv('Device', (dev.formFactor || '?') + (dev.platform ? ' · ' + dev.platform : '')) +
      _kv('Viewport', dev.viewport ? (dev.viewport.w + '×' + dev.viewport.h + ' @' + (dev.dpr || 1) + 'x') : '—') +
      _kv('Online', dev.online === false ? 'No' : (dev.online === true ? 'Yes' : '—')) + (dev.connection ? _kv('Connection', dev.connection) : '') +
      _kv('Locale', (loc.language || '-') + ' · ' + (loc.tz || '-')) +
      _kv('Route', ctx.route) + _kv('Session', ctx.sessionId) +
      (errs.length ? '<div class="cc-section-title" style="margin-top:.6rem;">Recent errors (' + errs.length + ')</div>' + errs.map(function (e) { return '<div class="report-err">' + _esc(e.msg) + '</div>'; }).join('') : '<div class="muted" style="margin-top:.5rem;">No recent errors captured.</div>') +
      '<details class="report-tech" style="margin-top:.6rem;"><summary>Raw context JSON</summary><pre class="report-tech-pre">' + _esc(JSON.stringify(ctx, null, 2)) + '</pre></details>' +
      '<div class="ua-line muted" style="margin-top:.5rem;font-size:.72rem;word-break:break-all;">' + _esc(dev.ua || '') + '</div>' +
      '</div>';
  }

  function _tabHistory(el, history) {
    history = history || [];
    el.innerHTML = '<div class="card" style="padding:1rem;">' + (history.length
      ? history.map(function (h) { return '<div class="cc-feed-row"><span>' + _esc(h.action) + (h.summary ? ' — ' + _esc(h.summary) : '') + ' <span class="muted">(' + _esc(h.actor) + ')</span></span><span class="cc-feed-when">' + _esc(_fmtT(h.timestamp)) + '</span></div>'; }).join('')
      : '<div class="muted">No history yet.</div>') + '</div>';
  }

  /* ───────── Actions ───────── */
  function _tabActions(el, r) {
    var id = r.id, life = r.lifecycle || {};
    var statusBtns = STATUSES.filter(function (s) { return s !== 'duplicate'; }).map(function (s) {
      return '<button class="btn btn-sm ' + (s === r.status ? 'accent' : 'btn-outline') + '" data-status="' + s + '">' + (STATUS_LABELS[s] || s) + '</button>';
    }).join('');
    var prioBtns = PRIORITIES.map(function (p) {
      return '<button class="btn btn-sm ' + (p === r.priority ? 'accent' : 'btn-outline') + '" data-prio="' + p + '">' + p.charAt(0).toUpperCase() + p.slice(1) + '</button>';
    }).join('');
    var labels = (life.labels || []).map(function (l) { return '<span class="badge badge-draft report-label-chip" data-label="' + _esc(l) + '">' + _esc(l) + ' ✕</span>'; }).join(' ');
    var notes = (life.internalNotes || []).map(function (n) {
      return '<div class="report-note"><div class="report-note-meta muted">' + _esc(n.email || n.by || 'admin') + ' · ' + _esc(_fmtT(n.at)) + '</div><div class="report-note-body">' + _esc(n.text || '') + '</div></div>';
    }).join('');

    el.innerHTML = '<div class="card" style="padding:1rem;">' +
      '<div class="cc-section-title">Status</div><div class="cc-quick" id="rStatusRow">' + statusBtns + '</div>' +
      '<div class="cc-section-title" style="margin-top:.75rem;">Priority</div><div class="cc-quick" id="rPrioRow">' + prioBtns + '</div>' +
      '<div class="cc-section-title" style="margin-top:.75rem;">Assignment</div><div class="cc-quick">' +
        '<button class="btn btn-sm btn-outline" id="rAssignMe">Assign to me</button>' +
        '<button class="btn btn-sm btn-outline" id="rUnassign">Unassign</button>' +
        '<span class="muted" style="align-self:center;">' + (life.assignedToEmail || life.assignedTo || 'Unassigned') + '</span></div>' +
      '<div class="cc-section-title" style="margin-top:.75rem;">Labels</div>' +
        '<div id="rLabels" style="margin-bottom:.4rem;">' + (labels || '<span class="muted">None</span>') + '</div>' +
        '<div style="display:flex;gap:.5rem;"><input type="text" class="modal-input" id="rLabelInput" placeholder="Add a label" style="flex:1;margin:0;" maxlength="40" /><button class="btn btn-sm btn-outline" id="rLabelAdd">Add</button></div>' +
      '<div class="cc-section-title" style="margin-top:.75rem;">Internal notes</div>' +
        (notes ? '<div id="rNotes" style="margin-bottom:.4rem;">' + notes + '</div>' : '<div class="muted" style="margin-bottom:.4rem;">No notes yet.</div>') +
        '<textarea class="modal-input" id="rNote" placeholder="Add a private note (not shown to the reporter)" style="min-height:3.5rem;"></textarea>' +
        '<button class="btn btn-sm btn-outline" id="rNoteAdd" style="margin-top:.4rem;">Add note</button>' +
      '<div class="cc-section-title" style="margin-top:.75rem;">Merge</div>' +
        '<div style="display:flex;gap:.5rem;"><input type="text" class="modal-input" id="rDupOf" placeholder="Duplicate of report id" style="flex:1;margin:0;" /><button class="btn btn-sm btn-danger" id="rMerge">Merge</button></div>' +
      '</div>';

    function refresh() { _split.select(id); }

    el.querySelector('#rStatusRow').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-status]') : null; if (!b) return;
      var s = b.getAttribute('data-status'); if (s === r.status) return;
      b.disabled = true;
      API.updateReportStatus(id, s).then(function () { Toast.success('Status → ' + (STATUS_LABELS[s] || s)); _loadAnalytics(); refresh(); }).catch(function (e2) { b.disabled = false; Toast.error(_err(e2)); });
    });
    el.querySelector('#rPrioRow').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-prio]') : null; if (!b) return;
      var p = b.getAttribute('data-prio'); if (p === r.priority) return;
      b.disabled = true;
      API.setReportPriority(id, p).then(function () { Toast.success('Priority → ' + p); _loadAnalytics(); refresh(); }).catch(function (e2) { b.disabled = false; Toast.error(_err(e2)); });
    });
    el.querySelector('#rAssignMe').onclick = function () { this.disabled = true; API.assignReport(id, 'me').then(function () { Toast.success('Assigned to you'); refresh(); }).catch(function (e2) { Toast.error(_err(e2)); }); };
    el.querySelector('#rUnassign').onclick = function () { this.disabled = true; API.assignReport(id, '').then(function () { Toast.success('Unassigned'); refresh(); }).catch(function (e2) { Toast.error(_err(e2)); }); };
    el.querySelector('#rLabelAdd').onclick = function () {
      var v = (document.getElementById('rLabelInput') || {}).value || ''; v = v.trim(); if (!v) return;
      this.disabled = true; API.labelReport(id, v, 'add').then(function () { Toast.success('Label added'); refresh(); }).catch(function (e2) { Toast.error(_err(e2)); });
    };
    el.querySelectorAll('.report-label-chip').forEach(function (chip) {
      chip.onclick = function () { var l = chip.getAttribute('data-label'); API.labelReport(id, l, 'remove').then(function () { Toast.success('Label removed'); refresh(); }).catch(function (e2) { Toast.error(_err(e2)); }); };
    });
    el.querySelector('#rNoteAdd').onclick = function () {
      var v = (document.getElementById('rNote') || {}).value || ''; v = v.trim(); if (!v) { Toast.error('Note is empty'); return; }
      this.disabled = true; var self = this;
      API.addReportNote(id, v).then(function () { Toast.success('Note added'); refresh(); }).catch(function (e2) { self.disabled = false; Toast.error(_err(e2)); });
    };
    el.querySelector('#rMerge').onclick = function () {
      var dup = (document.getElementById('rDupOf') || {}).value || ''; dup = dup.trim();
      if (!dup) { Toast.error('Enter the target report id'); return; }
      Modal.show({ title: 'Merge as duplicate?', body: '<p class="text-sm text-secondary">Marks this report as a duplicate of <code>' + _esc(dup) + '</code> and closes it. Type <strong>MERGE</strong> to confirm.</p><input type="text" class="modal-input" id="rMergeConfirm" placeholder="MERGE" />',
        actions: [{ label: 'Cancel' }, { label: 'Merge', danger: true, autoClose: false, onClick: function () {
          if ((document.getElementById('rMergeConfirm') || {}).value !== 'MERGE') { Toast.error('Type MERGE to confirm'); return; }
          API.mergeReportDuplicate(id, dup).then(function () { Toast.success('Merged'); Modal.close(); _loadAnalytics(); refresh(); }).catch(function (e2) { Toast.error(_err(e2)); });
        } }] });
    };
  }

  return { render: render };
})();
