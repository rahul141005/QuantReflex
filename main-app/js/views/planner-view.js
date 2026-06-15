/**
 * planner-view.js — the QuanAI Planner calendar view (ADR-046), the primary planner interface.
 *
 * Renders the current 14-day block as a calendar: per-day cells coloured by kind (study/revision/mock/
 * buffer/rest/missed) with completion state, a day detail with task checkboxes, the Exam Readiness ring,
 * the Completion Forecast, the plan rationale, and per-task explainability. Checkboxes call the planner API
 * (op:toggle), which credits coverage, runs Smart Catch-up, and recomputes readiness/forecast server-side.
 *
 * Renders into the shared companion bottom-sheet (ADR-049) — `Planner.open()` opens the sheet and fetches the
 * plan; `Planner.renderInto(modal, plan)` draws the calendar into an existing sheet (after setup). Exposes
 * window.Planner. Depends on globals: Companion (openModal, _api, clientStats, localDate), Router,
 * startDrillFromPractice.
 */
var Planner = (function () {
  var _plan = null;
  var _sel = null; // selected day ISO

  var _modal = null; // the companion bottom-sheet this planner renders into

  function esc(s) { if (s == null) return ''; var d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
  /* LOCAL date 'YYYY-MM-DD' (ADR-049) — never toISOString() (UTC). Shared with Companion so client + server agree. */
  function todayIso() {
    if (window.Companion && Companion.localDate) return Companion.localDate();
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function fmtMin(m) { m = Math.round(m || 0); return m >= 60 ? (m % 60 ? (Math.floor(m / 60) + 'h ' + (m % 60) + 'm') : (m / 60 + 'h')) : (m + 'm'); }
  function dow(iso) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(iso + 'T00:00:00Z').getUTCDay()]; }
  function dnum(iso) { return new Date(iso + 'T00:00:00Z').getUTCDate(); }

  var KIND = {
    study: { c: 'st', label: 'Study' }, revision: { c: 'rv', label: 'Revision' },
    mock: { c: 'mk', label: 'Mock' }, buffer: { c: 'bf', label: 'Recovery' },
    rest: { c: 'rs', label: 'Rest' }, missed: { c: 'ms', label: 'Missed' }
  };

  function api(op, extra) {
    var body = { op: op, clientDate: todayIso() };   // ADR-049: LOCAL date so the server anchors "today" correctly
    try { if (window.Companion && Companion.clientStats) body.clientStats = Companion.clientStats(); } catch (_) {}
    if (extra) for (var k in extra) body[k] = extra[k];
    return (window.Companion && Companion._api) ? Companion._api('planner', body) : Promise.resolve({ ok: false });
  }

  function root() { return _modal ? _modal.body : null; }

  /* ---- entry points (ADR-049: the planner is a premium bottom-sheet, not a full router view) ---- */
  function open() {
    if (!(window.Companion && Companion.openModal)) return;
    _modal = Companion.openModal('Study Planner');
    var r = root(); if (r) r.innerHTML = '<div class="planner-loading">Loading your plan…</div>';
    api('get').then(function (res) {
      if (res.ok && res.data && res.data.plan) { _plan = res.data.plan; _sel = null; render(); }
      else emptyState();
    }).catch(emptyState);
  }
  /* Render the calendar into an EXISTING companion sheet (setup/get success) — seamless, no second sheet. */
  function renderInto(modal, plan) { _modal = modal; _plan = plan; _sel = null; render(); }

  function emptyState() {
    var r = root(); if (!r) return;
    r.innerHTML =
      '<div class="planner-empty">' +
        '<div class="pe-emoji">🗓️</div>' +
        '<h2>Build your study plan</h2>' +
        '<p>Tell me your exam and how much time you have. I\'ll map the full syllabus to your strengths and schedule your next two weeks.</p>' +
        '<button class="planner-cta" type="button">Create my plan ✨</button>' +
      '</div>';
    var btn = r.querySelector('.planner-cta');
    if (btn) btn.onclick = function () { if (window.Companion && Companion.openStudyPlanner) Companion.openStudyPlanner(true); };
  }

  /* ---- readiness ring (SVG) ---- */
  function ring(score) {
    var R = 30, C = 2 * Math.PI * R, off = C * (1 - (score || 0) / 100);
    return '<svg class="pr-ring" viewBox="0 0 72 72" width="72" height="72">' +
      '<circle cx="36" cy="36" r="' + R + '" class="pr-bg"></circle>' +
      '<circle cx="36" cy="36" r="' + R + '" class="pr-fg" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"></circle>' +
      '<text x="36" y="40" class="pr-num">' + Math.round(score || 0) + '</text></svg>';
  }

  function dayTasksDone(d) { var t = d.tasks || []; return { done: t.filter(function (x) { return x.done; }).length, total: t.length }; }

  function render() {
    var r = root(); if (!r || !_plan || !_plan.block) { emptyState(); return; }
    var p = _plan, b = p.block, rd = p.readiness || { score: 0, band: 'early' }, fc = p.forecast || {};
    var today = todayIso();
    if (!_sel) {
      var t = (b.days || []).find(function (d) { return d.date === today; });
      _sel = t ? t.date : ((b.days && b.days[0]) ? b.days[0].date : today);
    }

    var bandLabel = { 'exam-ready': 'Exam ready', 'on-track': 'On track', 'building': 'Building', 'early': 'Early days' }[rd.band] || '';
    var forecastLine = fc.daysToExam != null
      ? (fc.onTrack !== false
          ? fc.daysToExam + ' days to ' + esc(p.examName || 'your exam') + ' · on track' + (fc.bufferDays != null ? ' (' + fc.bufferDays + 'd buffer)' : '')
          : fc.daysToExam + ' days to ' + esc(p.examName || 'your exam') + ' · ' + Math.abs(fc.bufferDays || 0) + 'd behind — plan rebalanced')
      : (fc.sessionsRemaining != null ? '~' + fc.sessionsRemaining + ' sessions of study remaining' : '');
    var plusLine = (fc.ifPlusMinutes && fc.ifPlusMinutes.daysSaved > 0)
      ? '+15 min/day → finish ' + fc.ifPlusMinutes.daysSaved + ' days sooner' : '';

    var cells = (b.days || []).map(function (d) {
      var k = KIND[d.kind] || KIND.study, dt = dayTasksDone(d);
      var cls = 'pd-cell k-' + k.c + (d.date === today ? ' is-today' : '') + (d.date === _sel ? ' is-sel' : '') + (dt.total && dt.done === dt.total ? ' is-complete' : '');
      var dotState = dt.total ? (dt.done === dt.total ? '✓' : (dt.done + '/' + dt.total)) : '';
      return '<button class="' + cls + '" data-date="' + d.date + '" type="button">' +
        '<span class="pd-dow">' + dow(d.date) + '</span><span class="pd-num">' + dnum(d.date) + '</span>' +
        '<span class="pd-tag">' + (dotState || (d.kind === 'rest' ? 'rest' : '')) + '</span></button>';
    }).join('');

    var selDay = (b.days || []).find(function (d) { return d.date === _sel; }) || { tasks: [], kind: 'rest' };
    var detail = renderDay(selDay, today);

    r.innerHTML =
      '<div class="planner-top">' +
        '<div class="planner-titles"><div class="planner-title">' + esc(p.examName || 'Study Planner') + '</div><div class="planner-sub">' + esc(bandLabel || 'Your study plan') + '</div></div>' +
        '<button class="planner-adjust" type="button">Adjust</button>' +
      '</div>' +
      '<div class="planner-readiness">' + ring(rd.score) +
        '<div class="pr-meta"><div class="pr-band">' + esc(bandLabel) + '</div><div class="pr-label">Exam readiness</div>' +
        (forecastLine ? '<div class="pr-forecast ' + (fc.onTrack === false ? 'is-behind' : '') + '">' + forecastLine + '</div>' : '') +
        (plusLine ? '<div class="pr-plus">' + plusLine + '</div>' : '') + '</div></div>' +
      (b.rationale ? '<div class="planner-rationale">' + esc(b.rationale) + '</div>' : '') +
      '<div class="planner-grid">' + cells + '</div>' +
      '<div class="planner-detail">' + detail + '</div>' +
      '<div class="planner-foot">' +
        (today >= b.endDate ? '<button class="planner-regen" type="button">Plan my next 2 weeks →</button>' : '') +
      '</div>';

    // wiring
    var adj = r.querySelector('.planner-adjust'); if (adj) adj.onclick = function () { if (window.Companion && Companion.openStudyPlanner) Companion.openStudyPlanner(true); };
    r.querySelectorAll('.pd-cell').forEach(function (c) { c.onclick = function () { _sel = c.getAttribute('data-date'); render(); }; });
    r.querySelectorAll('.pt-check').forEach(function (cb) {
      cb.onchange = function () { toggle(cb.getAttribute('data-date'), cb.getAttribute('data-topic'), cb.checked); };
    });
    r.querySelectorAll('.pt-drill').forEach(function (d) {
      d.onclick = function () { startDrill(d.getAttribute('data-cat'), d.getAttribute('data-label')); };
    });
    var rg = r.querySelector('.planner-regen'); if (rg) rg.onclick = regen;
  }

  function renderDay(d, today) {
    var k = KIND[d.kind] || KIND.study;
    var head = '<div class="pday-head"><span class="pday-kind k-' + k.c + '">' + (k.label || 'Study') + '</span>' +
      '<span class="pday-date">' + dow(d.date) + ' ' + dnum(d.date) + '</span></div>';
    if (!d.tasks || !d.tasks.length) {
      var msg = d.kind === 'rest' ? 'Rest day — recovery is part of the plan.' : (d.kind === 'missed' ? 'Missed — its tasks were moved into upcoming days.' : 'Nothing scheduled.');
      return head + '<div class="pday-empty">' + msg + '</div>';
    }
    var rows = d.tasks.map(function (tk) {
      var diff = tk.difficulty || 'medium';
      var drillBtn = tk.drillable
        ? '<button class="pt-drill" data-cat="' + esc(tk.drillable) + '" data-label="' + esc(tk.label) + '" type="button">⚡ Drill</button>'
        : '<span class="pt-self">your resources</span>';
      return '<div class="pt-task' + (tk.done ? ' is-done' : '') + '">' +
        '<input class="pt-check" type="checkbox" data-date="' + d.date + '" data-topic="' + esc(tk.topicId) + '"' + (tk.done ? ' checked' : '') + ' aria-label="Mark ' + esc(tk.label) + ' done" />' +
        '<div class="pt-main">' +
          '<div class="pt-title">' + (tk.kind === 'revise' ? '<span class="pt-rev">↻</span> ' : '') + esc(tk.label) + '</div>' +
          '<div class="pt-meta"><span class="pt-sec">' + esc(tk.section || '') + '</span><span class="pt-dot">·</span>' + fmtMin(tk.estMin) + '<span class="pt-dot">·</span><span class="pt-diff d-' + esc(diff) + '">' + esc(diff) + '</span></div>' +
          (tk.reason ? '<div class="pt-reason">' + esc(tk.reason) + '</div>' : '') +
        '</div>' + drillBtn +
      '</div>';
    }).join('');
    return head + '<div class="pday-tasks">' + rows + '</div>';
  }

  /* ---- actions ---- */
  function toggle(date, topicId, done) {
    // optimistic local update
    var day = (_plan.block.days || []).find(function (d) { return d.date === date; });
    var task = day && (day.tasks || []).find(function (t) { return t.topicId === topicId; });
    var prevDone = task ? task.done : !done, prevAt = task ? task.completedAt : null;
    if (task) { task.done = done; task.completedAt = done ? new Date().toISOString() : null; }
    function rollback() {
      if (task) { task.done = prevDone; task.completedAt = prevAt; }
      render();
      try { if (typeof showToast === 'function') showToast('Couldn\'t save that — check your connection.'); } catch (_) {}
    }
    api('toggle', { date: date, topicId: topicId, done: done }).then(function (res) {
      // ADR-048: the server now AWAITS the write, so a non-ok response means it really didn't save → roll back.
      if (res.ok && res.data && res.data.plan) { _plan = res.data.plan; _markAiDirty(); render(); }
      else rollback();
    }).catch(rollback);
  }

  /* ADR-053: the planner is folded into the canonical profile, so a plan change must force the next
     Coach/Insights/Explanation build to rebuild (mirrors the practice dirty-stamp). */
  function _markAiDirty() { try { localStorage.setItem('qr_ai_dirty_at', String(Date.now())); } catch (_) {} }

  function startDrill(cat, label) {
    try { if (_modal && _modal.close) _modal.close(); } catch (_) {}   // close the sheet before navigating
    try { if (window.Router && Router.showView) Router.showView('practice'); } catch (_) {}
    setTimeout(function () { try { if (typeof startDrillFromPractice === 'function') startDrillFromPractice('focus', cat || '', label || ''); } catch (_) {} }, 60);
  }

  function regen() {
    var r = root(); var foot = r && r.querySelector('.planner-foot'); if (foot) foot.innerHTML = '<div class="planner-loading">Planning your next two weeks…</div>';
    api('regen').then(function (res) {
      if (res.ok && res.data && res.data.plan) { _plan = res.data.plan; _sel = null; _markAiDirty(); render(); }
      else render();
    }).catch(render);
  }

  return { open: open, renderInto: renderInto };
})();
if (typeof window !== 'undefined') window.Planner = Planner;
