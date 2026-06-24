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
  function bandLabel(score) { return score >= 80 ? 'Exam ready' : score >= 60 ? 'On track' : score >= 40 ? 'Building' : 'Early days'; }
  // ADR-059 display helpers — weightage band, session type, and the friendly drill-category name.
  function wbLabel(w) { return ({ 'very-high': 'Very High', 'high': 'High', 'medium': 'Medium', 'low': 'Low' })[w] || 'Medium'; }
  function sessionLabel(st, kind) { return ({ 'first-learning': 'First Learning', 'practice': 'Practice', 'revision': 'Revision', 'mock': 'Mock' })[st] || (kind === 'revise' ? 'Revision' : 'First Learning'); }
  // Canonical labels live in services/quantTopics.js CATEGORY_LABELS — keep new categories in sync here too.
  var DRILL_NAMES = { squares: 'Squares & Roots', cubes: 'Cubes & Roots', area: 'Area', volume: 'Volume', fractions: 'Fractions', percentages: 'Percentages', multiplication: 'Multiplication', ratios: 'Ratios', averages: 'Averages', 'profit-loss': 'Profit & Loss', 'time-speed-distance': 'Time, Speed & Distance', 'time-and-work': 'Time & Work', simplification: 'Simplification', 'number-series': 'Number Series' };
  function drillName(c) { return DRILL_NAMES[c] || c; }
  // ADR-062: a human time estimate — "≈50 min" / "≈3.7 hours" (never a bare "3.7h").
  function estLabel(mins) {
    mins = Number(mins) || 0;
    if (mins < 60) return '≈' + Math.round(mins) + ' min';
    var h = mins / 60;
    return '≈' + (h >= 10 ? Math.round(h) : Math.round(h * 10) / 10) + (h < 1.05 ? ' hour' : ' hours');
  }

  /* ADR-057: the STRATEGY dashboard — readiness + verdict, the milestone path, focus-with-why, recovery, triage.
     The strategy is the product; the schedule below is just its projection. Falls back to a basic readiness panel
     for legacy docs without a strategy. */
  function renderStrategy(s, p) {
    var pr = s.progress || {};
    var bd = s.readinessBreakdown;
    var html = '<div class="planner-readiness' + (bd ? ' is-tappable' : '') + '"' + (bd ? ' data-readiness="1" role="button" tabindex="0" aria-label="See how exam readiness is calculated"' : '') + '>' + ring(s.readinessScore) +
      '<div class="pr-meta">' +
        '<div class="pr-band">' + esc(bandLabel(s.readinessScore)) + '</div>' +
        '<div class="pr-label">Exam readiness <span class="pr-sub">· coverage + accuracy + consistency</span></div>' +
        '<div class="pr-projected">Projected ' + (s.projectedScore != null ? s.projectedScore : '—') + '/100 · target ' + (s.targetScore || '—') + (s.achievable ? ' ✓' : '') + '</div>' +
        (s.daysToExam != null ? '<div class="pr-forecast ' + (pr.onTrack === false ? 'is-behind' : '') + '">' + s.daysToExam + ' days to ' + esc(s.examName || 'your exam') + (pr.adherencePct != null ? ' · ' + pr.adherencePct + '% done' : '') + '</div>' : '') +
        (bd ? '<div class="pr-why">Tap to see why it\'s ' + s.readinessScore + '</div>' : '') +
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
        '<div class="prd-note">Exam readiness is a weighted blend of these seven signals — coverage counts most, then accuracy and consistency.</div>' +
      '</div>';
    }
    if (s.verdict) html += '<div class="planner-verdict">' + esc(s.verdict) + '</div>';

    if (s.recovery && s.recovery.topics && s.recovery.topics.length) {
      var rt = s.recovery.topics[0];
      html += '<div class="planner-recovery"><div class="prc-text">⚠ Recent accuracy slipped on <strong>' + esc(s.recovery.topics.map(function (t) { return t.label; }).join(', ')) + '</strong> — a short recovery session is scheduled before new work' +
        (rt.drillable ? ' (Drills: ' + esc(drillName(rt.drillable)) + ')' : '') + '.</div></div>';
    }

    // THE PATH = real syllabus SECTIONS with progress, expandable to their real topics (ADR-059).
    html += '<div class="planner-section-title">Your path to ' + esc(s.examName || 'the exam') + '</div><div class="planner-sections">' +
      (s.sections || []).map(function (sec) {
        var pct = Math.max(0, Math.min(100, sec.progressPct || 0));
        var mins = (sec.topics || []).reduce(function (a, t) { return a + (Number(t.durationMin) || 0); }, 0);
        var topicsHtml = (sec.topics || []).map(function (t) {
          return '<div class="psec-topic"><span class="psec-tlabel">' + esc(t.label) + '</span>' +
            '<span class="psec-tmeta">' + wbLabel(t.weightage) + (t.roi != null ? ' · ROI ' + t.roi : '') + '</span></div>';
        }).join('');
        return '<div class="psec is-' + (sec.status || 'upcoming') + '">' +
          '<div class="psec-head" data-sec="' + esc(sec.name) + '">' +
            '<div class="psec-title">' + esc(sec.name) + (sec.status === 'active' ? ' <span class="pm-now">now</span>' : '') + '</div>' +
            '<div class="psec-meta">' + sec.topicCount + ' topics' + (mins > 0 ? ' · ' + estLabel(mins) + ' of study' : '') + ' · ' + wbLabel(sec.weightage) + ' weightage</div>' +
            '<div class="pm-bar" title="How ready you are across this section"><span style="width:' + pct + '%"></span></div>' +
            '<div class="psec-progresslabel">' + pct + '% ready</div>' +
          '</div>' +
          '<div class="psec-topics">' + topicsHtml + '</div>' +
        '</div>';
      }).join('') + '</div>';

    // FOCUS NEXT — what to do now, WHY, ROI + priority. Drills are surfaced as a suggestion, never a button here.
    if (s.focus && s.focus.length) {
      html += '<div class="planner-section-title">Focus next</div><div class="planner-focus">' +
        s.focus.slice(0, 4).map(function (t) {
          var pri = t.roi != null ? Math.round(t.roi * 10) / 10 : null;
          return '<div class="pf"><div class="pf-head"><div class="pf-label">' + esc(t.label) + '</div>' +
            (pri != null ? '<span class="pf-pri">' + pri + '/10</span>' : '') + '</div>' +
            '<div class="pf-tags">' + wbLabel(t.weightage) + (t.pyqFreq != null ? ' · appears ~' + Math.round(t.pyqFreq * 100) + '% of papers' : '') + (t.durationMin ? ' · ~' + t.durationMin + ' min' : '') + '</div>' +
            (t.whyNow ? '<div class="pf-why">' + esc(t.whyNow) + '</div>' : '') +
            (t.unlocks && t.unlocks.length ? '<div class="pf-unlocks">Unlocks ' + esc(t.unlocks.slice(0, 3).join(', ')) + '</div>' : '') +
            (t.scoreImpact ? '<div class="pf-impact">' + esc(t.scoreImpact) + '</div>' : '') +
            (t.drillable ? '<div class="pf-suggest">💡 Practice available in Drills after you study this</div>' : '') + '</div>';
        }).join('') + '</div>';
    }

    if (s.skip && s.skip.length) {
      html += '<div class="planner-triage"><strong>Parked for time:</strong> ' + esc(s.skip.slice(0, 4).map(function (t) { return t.label; }).join(', ')) +
        (s.marksAtRisk ? ' · ~' + s.marksAtRisk + ' pts at risk' : '') + '</div>';
    }
    return html;
  }

  /* Legacy readiness panel for docs predating the strategy (ADR-057 graceful fallback). */
  function legacyReadiness(p) {
    var rd = p.readiness || { score: 0, band: 'early' }, fc = p.forecast || {};
    var line = fc.daysToExam != null ? fc.daysToExam + ' days to ' + esc(p.examName || 'your exam') + (fc.onTrack === false ? ' · behind' : ' · on track') : '';
    return '<div class="planner-readiness">' + ring(rd.score) + '<div class="pr-meta"><div class="pr-band">' + esc(bandLabel(rd.score)) +
      '</div><div class="pr-label">Exam readiness</div>' + (line ? '<div class="pr-forecast">' + line + '</div>' : '') + '</div></div>';
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
        '<span class="pd-tag">' + (dotState || (d.kind === 'rest' ? 'rest' : '')) + '</span></button>';
    }).join('');

    var selDay = (b.days || []).find(function (d) { return d.date === _sel; }) || { tasks: [], kind: 'rest' };
    var detail = renderDay(selDay, today);

    r.innerHTML =
      '<div class="planner-top">' +
        '<div class="planner-titles"><div class="planner-title">' + esc(p.examName || 'Study Planner') + '</div><div class="planner-sub">' + esc(s ? 'Your strategy to maximise marks' : 'Your study plan') + '</div></div>' +
        '<button class="planner-adjust" type="button">Adjust</button>' +
      '</div>' +
      (s ? renderStrategy(s, p) : legacyReadiness(p)) +
      '<div class="planner-section-title planner-sched-title">Your schedule</div>' +
      (b.rationale ? '<div class="planner-rationale">' + esc(b.rationale) + '</div>' : '') +
      '<div class="planner-grid">' + cells + '</div>' +
      '<div class="planner-detail">' + detail + '</div>' +
      '<div class="planner-foot">' +
        (today >= b.endDate ? '<button class="planner-regen" type="button">Rebuild my plan →</button>' : '') +
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
  }

  function renderDay(d, today) {
    var k = KIND[d.kind] || KIND.study;
    var head = '<div class="pday-head"><span class="pday-kind k-' + k.c + '">' + (k.label || 'Study') + '</span>' +
      '<span class="pday-date">' + dow(d.date) + ' ' + dnum(d.date) + '</span></div>';
    if (!d.tasks || !d.tasks.length) {
      var msg = d.kind === 'rest' ? 'Rest day — recovery is part of the plan.' : (d.kind === 'missed' ? 'Missed — its tasks were moved into upcoming days.' : 'Nothing scheduled.');
      return head + '<div class="pday-empty">' + msg + '</div>';
    }
    // ADR-059: a real coaching study block — Topic — duration (Session Type) + reason. Drills are surfaced as a
    // SUGGESTION, never a button (Planner plans; Drills execute). Completion is tracked with the checkbox.
    var rows = d.tasks.map(function (tk) {
      var diff = tk.difficulty || 'medium';
      var st = sessionLabel(tk.sessionType, tk.kind);
      var suggest = tk.drillable
        ? '<div class="pt-suggest">💡 Drill suggestion: <strong>' + esc(drillName(tk.drillable)) + '</strong> (practise after studying)</div>'
        : '<div class="pt-suggest pt-ext">📖 Study from your books / notes — no in-app drill for this topic</div>';
      return '<div class="pt-task' + (tk.done ? ' is-done' : '') + '">' +
        '<input class="pt-check" type="checkbox" data-date="' + d.date + '" data-topic="' + esc(tk.topicId) + '"' + (tk.done ? ' checked' : '') + ' aria-label="Mark ' + esc(tk.label) + ' done" />' +
        '<div class="pt-main">' +
          '<div class="pt-title">' + esc(tk.label) + ' <span class="pt-st pt-st-' + (tk.sessionType || 'first-learning') + '">' + st + '</span></div>' +
          '<div class="pt-meta"><span class="pt-sec">' + esc(tk.section || '') + '</span><span class="pt-dot">·</span>' + fmtMin(tk.estMin) +
            (tk.weightage ? '<span class="pt-dot">·</span>' + wbLabel(tk.weightage) : '') + '<span class="pt-dot">·</span><span class="pt-diff d-' + esc(diff) + '">' + esc(diff) + '</span></div>' +
          (tk.reason ? '<div class="pt-reason">' + esc(tk.reason) + '</div>' : '') +
          (tk.unlocks && tk.unlocks.length ? '<div class="pt-unlocks">Unlocks ' + esc(tk.unlocks.slice(0, 3).join(', ')) + '</div>' : '') +
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
