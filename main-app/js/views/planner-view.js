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
  /* Guarded i18n (ADR-111): resolve at render, never at parse. `_t` for chrome, `_dow` for the localized
     weekday-abbreviation CSV. Server-data labels (examName, verdict, section/task/focus labels, rationale,
     whyNow, reason, scoreImpact) render VERBATIM — they are produced by the strategy engine / LLM. */
  function _t(key, params) { return (typeof QRI18n !== 'undefined') ? QRI18n.t(key, params) : key; }
  /* LOCAL date 'YYYY-MM-DD' (ADR-049) — never toISOString() (UTC). Shared with Companion so client + server agree. */
  function todayIso() {
    if (window.Companion && Companion.localDate) return Companion.localDate();
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function fmtMin(m) { m = Math.round(m || 0); return m >= 60 ? (m % 60 ? (Math.floor(m / 60) + 'h ' + (m % 60) + 'm') : (m / 60 + 'h')) : (m + 'm'); }
  function dow(iso) { return (_t('planner.dowAbbrevs').split(','))[new Date(iso + 'T00:00:00Z').getUTCDay()]; }
  function dnum(iso) { return new Date(iso + 'T00:00:00Z').getUTCDate(); }

  /* kind → {css class, catalog key}; the display label resolves lazily via _t(k.k). */
  var KIND = {
    study: { c: 'st', k: 'planner.kind_study' }, revision: { c: 'rv', k: 'planner.kind_revision' },
    mock: { c: 'mk', k: 'planner.kind_mock' }, buffer: { c: 'bf', k: 'planner.kind_buffer' },
    rest: { c: 'rs', k: 'planner.kind_rest' }, missed: { c: 'ms', k: 'planner.kind_missed' }
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
    _modal = Companion.openModal(_t('ai.titlePlanner'));
    var r = root();
    /* Reuse QuanAI's staged shimmer (personalized "reviewing your…" lead + rotating stages) so opening the plan reads
       as the mentor actively rebuilding it — same premium loading the Coach/Insights surfaces use, not a flat line. */
    var stop = (r && Companion.showLoading)
      ? Companion.showLoading(r, [_t('planner.stageOpen1'), _t('planner.stageOpen2'), _t('planner.stageOpen3')])
      : (function () { if (r) r.innerHTML = '<div class="planner-loading">' + esc(_t('planner.loadingPlan')) + '</div>'; return function () {}; })();
    api('get').then(function (res) {
      stop();
      if (res.ok && res.data && res.data.plan) { _plan = res.data.plan; _sel = null; render(); }
      else emptyState();
    }).catch(function () { stop(); emptyState(); });
  }
  /* Render the calendar into an EXISTING companion sheet (setup/get success) — seamless, no second sheet. */
  function renderInto(modal, plan) { _modal = modal; _plan = plan; _sel = null; render(); }

  function emptyState() {
    var r = root(); if (!r) return;
    r.innerHTML =
      '<div class="planner-empty">' +
        '<div class="pe-emoji">🗓️</div>' +
        '<h2>' + esc(_t('planner.emptyTitle')) + '</h2>' +
        '<p>' + esc(_t('planner.emptyBody')) + '</p>' +
        '<button class="planner-cta" type="button">' + esc(_t('ai.wizCreatePlan')) + '</button>' +
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
  function bandLabel(score) { return _t(score >= 80 ? 'planner.band_ready' : score >= 60 ? 'planner.band_track' : score >= 40 ? 'planner.band_building' : 'planner.band_early'); }
  // ADR-059 display helpers — weightage band, session type, and the friendly drill-category name.
  function wbLabel(w) { return _t(({ 'very-high': 'planner.wb_veryhigh', 'high': 'planner.wb_high', 'medium': 'planner.wb_medium', 'low': 'planner.wb_low' })[w] || 'planner.wb_medium'); }
  function sessionLabel(st, kind) { return _t(({ 'first-learning': 'planner.session_first', 'practice': 'planner.session_practice', 'revision': 'planner.session_revision', 'mock': 'planner.session_mock' })[st] || (kind === 'revise' ? 'planner.session_revision' : 'planner.session_first')); }
  // Category labels come from the SINGLE source of truth via formatCategoryName (services/quantTopics.js +
  // DI/LR engines), so new drill categories never render as a raw key here (ADR-084).
  function drillName(c) { return (typeof formatCategoryName === 'function') ? formatCategoryName(c) : c; }
  // ADR-062: a human time estimate — "≈50 min" / "≈3.7 hours" (never a bare "3.7h").
  function estLabel(mins) {
    mins = Number(mins) || 0;
    if (mins < 60) return _t('planner.estMin', { n: Math.round(mins) });
    var h = mins / 60;
    var val = (h >= 10 ? Math.round(h) : Math.round(h * 10) / 10);
    return _t(h < 1.05 ? 'planner.estHour' : 'planner.estHours', { n: val });
  }

  /* ADR-057: the STRATEGY dashboard — readiness + verdict, the milestone path, focus-with-why, recovery, triage.
     The strategy is the product; the schedule below is just its projection. Falls back to a basic readiness panel
     for legacy docs without a strategy. */
  function renderStrategy(s, p) {
    var pr = s.progress || {};
    var bd = s.readinessBreakdown;
    var html = '<div class="planner-readiness' + (bd ? ' is-tappable' : '') + '"' + (bd ? ' data-readiness="1" role="button" tabindex="0" aria-label="' + esc(_t('planner.readinessAria')) + '"' : '') + '>' + ring(s.readinessScore) +
      '<div class="pr-meta">' +
        '<div class="pr-band">' + esc(bandLabel(s.readinessScore)) + '</div>' +
        '<div class="pr-label">' + esc(_t('planner.readinessLabel')) + ' <span class="pr-sub">' + esc(_t('planner.readinessSub')) + '</span></div>' +
        '<div class="pr-projected">' + esc(_t('planner.projected', { p: (s.projectedScore != null ? s.projectedScore : '—'), t: (s.targetScore || '—') })) + (s.achievable ? ' ✓' : '') + '</div>' +
        (s.daysToExam != null ? '<div class="pr-forecast ' + (pr.onTrack === false ? 'is-behind' : '') + '">' + esc(_t('planner.forecastDays', { days: s.daysToExam, exam: (s.examName || _t('planner.forecastExamFallback')) })) + (pr.adherencePct != null ? esc(_t('planner.forecastDone', { pct: pr.adherencePct })) : '') + '</div>' : '') +
        (bd ? '<div class="pr-why">' + esc(_t('planner.whyTap', { score: s.readinessScore })) + '</div>' : '') +
      '</div></div>';
    // ADR-062: the "why this number" breakdown — no black box. Hidden until tapped.
    if (bd) {
      html += '<div class="planner-readiness-detail" data-readiness-detail hidden>' +
        (bd.summary ? '<div class="prd-summary">' + esc(bd.summary) + '</div>' : '') +
        '<div class="prd-factors">' + (bd.factors || []).map(function (f) {
          return '<div class="prd-row"><span class="prd-flabel">' + esc(f.label) + '</span>' +
            '<span class="prd-bar"><span style="width:' + Math.max(0, Math.min(100, f.pct)) + '%"></span></span>' +
            '<span class="prd-fpct">' + f.pct + '%</span></div>';
        }).join('') + '</div>' +
        '<div class="prd-note">' + esc(_t('planner.breakdownNote')) + '</div>' +
      '</div>';
    }
    if (s.verdict) html += '<div class="planner-verdict">' + esc(s.verdict) + '</div>';

    if (s.recovery && s.recovery.topics && s.recovery.topics.length) {
      var rt = s.recovery.topics[0];
      html += '<div class="planner-recovery"><div class="prc-text">' + _t('planner.recoveryText', { topics: '<strong>' + esc(s.recovery.topics.map(function (t) { return t.label; }).join(', ')) + '</strong>' }) +
        (rt.drillable ? esc(_t('planner.recoveryDrills', { name: drillName(rt.drillable) })) : '') + '.</div></div>';
    }

    // THE PATH = real syllabus SECTIONS with progress, expandable to their real topics (ADR-059).
    html += '<div class="planner-section-title">' + esc(_t('planner.pathTitle', { exam: (s.examName || _t('planner.pathExamFallback')) })) + '</div><div class="planner-sections">' +
      (s.sections || []).map(function (sec) {
        var pct = Math.max(0, Math.min(100, sec.progressPct || 0));
        var mins = (sec.topics || []).reduce(function (a, t) { return a + (Number(t.durationMin) || 0); }, 0);
        var topicsHtml = (sec.topics || []).map(function (t) {
          return '<div class="psec-topic"><span class="psec-tlabel">' + esc(t.label) + '</span>' +
            '<span class="psec-tmeta">' + wbLabel(t.weightage) + (t.roi != null ? ' · ROI ' + t.roi : '') + '</span></div>';
        }).join('');
        return '<div class="psec is-' + (sec.status || 'upcoming') + '">' +
          '<div class="psec-head" data-sec="' + esc(sec.name) + '">' +
            '<div class="psec-title">' + esc(sec.name) + (sec.status === 'active' ? ' <span class="pm-now">' + esc(_t('planner.now')) + '</span>' : '') + '</div>' +
            '<div class="psec-meta">' + esc(_t('planner.secTopics', { n: sec.topicCount, count: sec.topicCount }) + (mins > 0 ? _t('planner.secStudySuffix', { est: estLabel(mins) }) : '') + _t('planner.secWeightSuffix', { wb: wbLabel(sec.weightage) })) + '</div>' +
            '<div class="pm-bar" title="' + esc(_t('planner.secBarTitle')) + '"><span style="width:' + pct + '%"></span></div>' +
            '<div class="psec-progresslabel">' + esc(_t('planner.ready', { pct: pct })) + '</div>' +
          '</div>' +
          '<div class="psec-topics">' + topicsHtml + '</div>' +
        '</div>';
      }).join('') + '</div>';

    // FOCUS NEXT — what to do now, WHY, ROI + priority. Drills are surfaced as a suggestion, never a button here.
    if (s.focus && s.focus.length) {
      html += '<div class="planner-section-title">' + esc(_t('planner.focusTitle')) + '</div><div class="planner-focus">' +
        s.focus.slice(0, 4).map(function (t) {
          var pri = t.roi != null ? Math.round(t.roi * 10) / 10 : null;
          return '<div class="pf"><div class="pf-head"><div class="pf-label">' + esc(t.label) + '</div>' +
            (pri != null ? '<span class="pf-pri">' + esc(_t('planner.pri', { pri: pri })) + '</span>' : '') + '</div>' +
            '<div class="pf-tags">' + esc(wbLabel(t.weightage) + (t.pyqFreq != null ? _t('planner.pfAppears', { p: Math.round(t.pyqFreq * 100) }) : '') + (t.durationMin ? _t('planner.pfMin', { m: t.durationMin }) : '')) + '</div>' +
            (t.whyNow ? '<div class="pf-why">' + esc(t.whyNow) + '</div>' : '') +
            (t.unlocks && t.unlocks.length ? '<div class="pf-unlocks">' + esc(_t('planner.unlocks', { list: t.unlocks.slice(0, 3).join(', ') })) + '</div>' : '') +
            (t.scoreImpact ? '<div class="pf-impact">' + esc(t.scoreImpact) + '</div>' : '') +
            (t.drillable ? '<div class="pf-suggest">' + esc(_t('planner.practiceAvail')) + '</div>' : '') + '</div>';
        }).join('') + '</div>';
    }

    if (s.skip && s.skip.length) {
      html += '<div class="planner-triage"><strong>' + esc(_t('planner.parkedLabel')) + '</strong> ' + esc(s.skip.slice(0, 4).map(function (t) { return t.label; }).join(', ')) +
        (s.marksAtRisk ? esc(_t('planner.parkedRisk', { m: s.marksAtRisk })) : '') + '</div>';
    }
    return html;
  }

  /* Legacy readiness panel for docs predating the strategy (ADR-057 graceful fallback). */
  function legacyReadiness(p) {
    var rd = p.readiness || { score: 0, band: 'early' }, fc = p.forecast || {};
    var line = fc.daysToExam != null ? (esc(_t('planner.forecastDays', { days: fc.daysToExam, exam: (p.examName || _t('planner.forecastExamFallback')) })) + esc(fc.onTrack === false ? _t('planner.legacyBehind') : _t('planner.legacyOnTrack'))) : '';
    return '<div class="planner-readiness">' + ring(rd.score) + '<div class="pr-meta"><div class="pr-band">' + esc(bandLabel(rd.score)) +
      '</div><div class="pr-label">' + esc(_t('planner.readinessLabel')) + '</div>' + (line ? '<div class="pr-forecast">' + line + '</div>' : '') + '</div></div>';
  }

  function render() {
    var r = root(); if (!r || !_plan || !_plan.block) { emptyState(); return; }
    var p = _plan, b = p.block, s = p.strategy;
    var today = todayIso();
    if (!_sel) {
      var t = (b.days || []).find(function (d) { return d.date === today; });
      _sel = t ? t.date : ((b.days && b.days[0]) ? b.days[0].date : today);
    }

    var cells = (b.days || []).map(function (d) {
      var k = KIND[d.kind] || KIND.study, dt = dayTasksDone(d);
      var cls = 'pd-cell k-' + k.c + (d.date === today ? ' is-today' : '') + (d.date === _sel ? ' is-sel' : '') + (dt.total && dt.done === dt.total ? ' is-complete' : '');
      var dotState = dt.total ? (dt.done === dt.total ? '✓' : (dt.done + '/' + dt.total)) : '';
      return '<button class="' + cls + '" data-date="' + d.date + '" type="button">' +
        '<span class="pd-dow">' + dow(d.date) + '</span><span class="pd-num">' + dnum(d.date) + '</span>' +
        '<span class="pd-tag">' + (dotState || (d.kind === 'rest' ? esc(_t('planner.cellRest')) : '')) + '</span></button>';
    }).join('');

    var selDay = (b.days || []).find(function (d) { return d.date === _sel; }) || { tasks: [], kind: 'rest' };
    var detail = renderDay(selDay, today);

    r.innerHTML =
      '<div class="planner-top">' +
        '<div class="planner-titles"><div class="planner-title">' + esc(p.examName || _t('ai.titlePlanner')) + '</div><div class="planner-sub">' + esc(s ? _t('planner.subStrategy') : _t('planner.subPlan')) + '</div></div>' +
        '<button class="planner-adjust" type="button">' + esc(_t('planner.adjust')) + '</button>' +
      '</div>' +
      (s ? renderStrategy(s, p) : legacyReadiness(p)) +
      '<div class="planner-section-title planner-sched-title">' + esc(_t('planner.scheduleTitle')) + '</div>' +
      (b.rationale ? '<div class="planner-rationale">' + esc(b.rationale) + '</div>' : '') +
      '<div class="planner-grid">' + cells + '</div>' +
      '<div class="planner-detail">' + detail + '</div>' +
      '<div class="planner-foot">' +
        '<button class="planner-regen" type="button">' + esc(_t('planner.rebuild')) + '</button>' +
        (today >= b.endDate ? '<div class="planner-foot-hint">' + esc(_t('planner.blockComplete')) + '</div>' : '') +
        '<button class="planner-startover" type="button">' + esc(_t('planner.startOver')) + '</button>' +
      '</div>';

    // wiring
    var adj = r.querySelector('.planner-adjust'); if (adj) adj.onclick = function () { if (window.Companion && Companion.openStudyPlanner) Companion.openStudyPlanner(true); };
    r.querySelectorAll('.pd-cell').forEach(function (c) { c.onclick = function () { _sel = c.getAttribute('data-date'); render(); }; });
    r.querySelectorAll('.pt-check').forEach(function (cb) {
      cb.onchange = function () { toggle(cb.getAttribute('data-date'), cb.getAttribute('data-topic'), cb.checked); };
    });
    // ADR-059: sections expand to reveal their real topics (the path is the strategy; no drill navigation here).
    r.querySelectorAll('.psec-head').forEach(function (h) { h.onclick = function () { h.parentNode.classList.toggle('is-open'); }; });
    // ADR-062: tap the readiness ring to reveal the plain-language "why this number" breakdown.
    var rdy = r.querySelector('[data-readiness]'), rdyDetail = r.querySelector('[data-readiness-detail]');
    if (rdy && rdyDetail) {
      var toggleRdy = function () { var open = rdyDetail.hasAttribute('hidden'); if (open) rdyDetail.removeAttribute('hidden'); else rdyDetail.setAttribute('hidden', ''); rdy.classList.toggle('is-expanded', open); };
      rdy.onclick = toggleRdy;
      rdy.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleRdy(); } };
    }
    var rg = r.querySelector('.planner-regen'); if (rg) rg.onclick = regen;
    var so = r.querySelector('.planner-startover'); if (so) so.onclick = startOver;
  }

  function renderDay(d, today) {
    var k = KIND[d.kind] || KIND.study;
    var head = '<div class="pday-head"><span class="pday-kind k-' + k.c + '">' + esc(_t(k.k || 'planner.kind_study')) + '</span>' +
      '<span class="pday-date">' + dow(d.date) + ' ' + dnum(d.date) + '</span></div>';
    if (!d.tasks || !d.tasks.length) {
      var msg = d.kind === 'rest' ? _t('planner.dayRest') : (d.kind === 'missed' ? _t('planner.dayMissed') : _t('planner.dayNothing'));
      return head + '<div class="pday-empty">' + esc(msg) + '</div>';
    }
    // ADR-059: a real coaching study block — Topic — duration (Session Type) + reason. Drills are surfaced as a
    // SUGGESTION, never a button (Planner plans; Drills execute). Completion is tracked with the checkbox.
    var rows = d.tasks.map(function (tk) {
      var diff = tk.difficulty || 'medium';
      var st = sessionLabel(tk.sessionType, tk.kind);
      var suggest = tk.drillable
        ? '<div class="pt-suggest">' + _t('planner.drillSuggest', { name: '<strong>' + esc(drillName(tk.drillable)) + '</strong>' }) + '</div>'
        : '<div class="pt-suggest pt-ext">' + esc(_t('planner.studyFromBooks')) + '</div>';
      return '<div class="pt-task' + (tk.done ? ' is-done' : '') + '">' +
        '<input class="pt-check" type="checkbox" data-date="' + d.date + '" data-topic="' + esc(tk.topicId) + '"' + (tk.done ? ' checked' : '') + ' aria-label="' + esc(_t('planner.markDone', { label: tk.label })) + '" />' +
        '<div class="pt-main">' +
          '<div class="pt-title">' + esc(tk.label) + ' <span class="pt-st pt-st-' + (tk.sessionType || 'first-learning') + '">' + st + '</span></div>' +
          '<div class="pt-meta"><span class="pt-sec">' + esc(tk.section || '') + '</span><span class="pt-dot">·</span>' + fmtMin(tk.estMin) +
            (tk.weightage ? '<span class="pt-dot">·</span>' + wbLabel(tk.weightage) : '') + '<span class="pt-dot">·</span><span class="pt-diff d-' + esc(diff) + '">' + esc(diff) + '</span></div>' +
          (tk.reason ? '<div class="pt-reason">' + esc(tk.reason) + '</div>' : '') +
          (tk.unlocks && tk.unlocks.length ? '<div class="pt-unlocks">' + esc(_t('planner.unlocks', { list: tk.unlocks.slice(0, 3).join(', ') })) + '</div>' : '') +
          suggest +
        '</div>' +
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
      try { if (typeof showToast === 'function') showToast(_t('planner.toggleFail')); } catch (_) {}
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
    var r = root(); var foot = r && r.querySelector('.planner-foot'); if (foot) foot.innerHTML = '<div class="planner-loading">' + esc(_t('planner.regenLoading')) + '</div>';
    api('regen').then(function (res) {
      if (res.ok && res.data && res.data.plan) { _plan = res.data.plan; _sel = null; _markAiDirty(); render(); }
      else render();
    }).catch(render);
  }

  /* Start Over — a fully destructive reset. We make the consequences explicit BEFORE the user confirms (no silent
     data loss): the plan + exam config + setup answers are deleted, while practice stats stay safe. On confirm the
     server deletes the plan and clears the exam mirror; we drop the active-exam cache, mark AI dirty (so Coach/
     Insights rebuild exam-agnostic), and reopen the setup wizard fresh. */
  function startOver() {
    /* FW-W2: the shared QROverlay.confirm owns the shell (lock, Esc, focus trap+restore, buttons);
       the explicit delete/keep lists stay as the dialog body. The async onConfirm keeps the dialog
       up in a loading state while the server resets; a failure re-enables the buttons (reject) so
       the user can retry or cancel. Initial focus lands on the SAFE action — never the destructive
       button — so a stray Enter can't trigger the reset. */
    var handle = QROverlay.confirm({
      title: esc(_t('planner.soTitle')),
      body:
        '<p class="qr-confirm-lead">' + esc(_t('planner.soLead')) + '</p>' +
        '<div class="qr-confirm-list-label">' + esc(_t('planner.soDelLabel')) + '</div>' +
        '<ul class="qr-confirm-list is-del">' +
          '<li>' + esc(_t('planner.soDel1')) + '</li>' +
          '<li>' + esc(_t('planner.soDel2')) + '</li>' +
          '<li>' + esc(_t('planner.soDel3')) + '</li>' +
          '<li>' + esc(_t('planner.soDel4')) + '</li>' +
        '</ul>' +
        '<div class="qr-confirm-list-label">' + esc(_t('planner.soKeepLabel')) + '</div>' +
        '<ul class="qr-confirm-list is-keep">' +
          '<li>' + esc(_t('planner.soKeep1')) + '</li>' +
        '</ul>' +
        '<p class="qr-confirm-note">' + esc(_t('planner.soNote')) + '</p>',
      danger: true,
      confirmText: esc(_t('planner.soConfirm')),
      cancelText: esc(_t('planner.soCancel')),
      initialFocus: '[data-act="cancel"]',
      onConfirm: function () {
        var btn = handle.el.querySelector('[data-act="confirm"]');
        if (btn) btn.textContent = _t('planner.soConfirming');
        return api('reset').then(function (res) {
          if (!(res && res.ok && res.data && res.data.ok)) throw new Error('reset_failed');
          try { if (typeof TargetExam !== 'undefined') TargetExam.clear(); else localStorage.removeItem('qr_active_exam'); } catch (_) {}
          _markAiDirty(); _plan = null; _sel = null;
          /* Reopen the setup wizard AFTER the confirm has started closing (macrotask), matching the
             old close-then-open ordering. */
          setTimeout(function () { if (window.Companion && Companion.openStudyPlanner) Companion.openStudyPlanner(true); }, 0);
        }).catch(function (e) {
          if (btn) btn.textContent = _t('planner.soConfirm');
          try { if (typeof showToast === 'function') showToast(_t('planner.soFail')); } catch (_) {}
          throw e;   // reject → QROverlay re-enables the buttons
        });
      }
    });
  }

  return { open: open, renderInto: renderInto };
})();
if (typeof window !== 'undefined') window.Planner = Planner;
