/**
 * companion-ui.js — the AI Interaction Design System renderer (ADR-039).
 *
 * ONE renderer for the whole AI ecosystem. Transforms an AIResponse block envelope (server: aiBrain.js) into
 * DOM components, drives the turn-by-turn conversation (chips → chat turns), handles deep-links into real
 * drills, staged loading, errors, and analytics. Every feature (Explain/Coach/Insights/Study Plan/Word
 * Problems) opens through here, so they look and behave like one intelligent tutor — never separate GPT tools.
 *
 * Self-contained: own modal, own authenticated fetch, own state. Exposes window.Companion.
 */
var Companion = (function () {
  var PERSONA = 'QuanAI';
  var _state = null; // { feature, topic, history:[], modal }

  /* ---------- utils ---------- */
  function esc(s) { if (typeof s !== 'string') return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  function log(feature, type, meta) { try { if (window.AIAnalytics && AIAnalytics.log) AIAnalytics.log(feature, type, meta || {}); } catch (_) {} }
  /* Flatten an explanation envelope (say + steps) to plain text, so Explain follow-ups can be ANCHORED to the
     exact question + the last explanation the student is looking at (ADR-045 — kills the Trapezium→Rectangle drift). */
  function explanationText(env) {
    var parts = [];
    (env && env.blocks || []).forEach(function (b) {
      if (b.type === 'say' && b.text) parts.push(b.text);
      else if (b.type === 'steps' && Array.isArray(b.items)) parts.push(b.items.join(' '));
    });
    return parts.join(' ').slice(0, 900);
  }

  /* ---------- freshness signal (ADR-045) ----------
     drill-engine stamps qr_ai_dirty_at = Date.now() whenever a practice session is recorded. Each AI surface
     (coach / insights / plan) independently forces ONE fresh server context after a practice burst by comparing
     that stamp to its own last-seen stamp — so all three reflect the practice the student just did, instead of
     repeating advice from the 6h context cache / per-day envelope cache. Per-feature so refreshing one surface
     doesn't rob the others; bounded (one forced rebuild per feature per practice burst). */
  var DIRTY_KEY = 'qr_ai_dirty_at';
  function dirtyAt() { try { return parseInt(localStorage.getItem(DIRTY_KEY), 10) || 0; } catch (_) { return 0; } }
  function seenAt(feature) { try { return parseInt(localStorage.getItem('qr_ai_seen_' + feature), 10) || 0; } catch (_) { return 0; } }
  function markSeen(feature, ts) { try { localStorage.setItem('qr_ai_seen_' + feature, String(ts || dirtyAt())); } catch (_) {} }
  function shouldForce(feature) { return dirtyAt() > seenAt(feature); }

  function _token() {
    return new Promise(function (resolve) {
      try {
        var u = (typeof Auth !== 'undefined' && Auth.getCurrentUser) ? Auth.getCurrentUser() : null;
        if (u && u.getIdToken) { u.getIdToken().then(resolve).catch(function () { resolve(null); }); return; }
      } catch (_) {}
      resolve(null);
    });
  }
  function api(action, body) {
    return _token().then(function (token) {
      if (!token) return { ok: false, code: 'NO_AUTH' };
      return fetch('/api/ai?action=' + encodeURIComponent(action), {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(body || {})
      }).then(function (r) {
        return r.json().then(function (j) {
          if (r.ok) return { ok: true, data: j };
          return { ok: false, code: (j.error && j.error.code) || 'ERR', message: (j.error && j.error.message) || '', status: r.status };
        }).catch(function () { return { ok: false, code: 'PARSE' }; });
      }).catch(function () { return { ok: false, code: 'NETWORK' }; });
    });
  }

  /* ---------- planner helpers (ADR-046) ---------- */
  /* Snapshot the live local progress so the planner API can floor the (often stale) Firestore stats doc — this
     is what fixes the "no accuracy" bug right after a fresh session. Non-authoritative; the server only raises. */
  function clientStats() {
    try {
      var p = (typeof loadProgress === 'function') ? loadProgress() : null;
      if (!p) return null;
      return { totalAttempted: p.totalAttempted || 0, totalCorrect: p.totalCorrect || 0,
        todayAttempted: p.todayAttempted || 0, todayCorrect: p.todayCorrect || 0, dailyStreak: p.dailyStreak || 0,
        categoryStats: p.categoryStats || {}, dailyHistory: p.dailyHistory || {} };
    } catch (_) { return null; }
  }
  function plannerExams() {
    try { if (window.QR_SYLLABUS && QR_SYLLABUS.EXAMS) return QR_SYLLABUS.EXAMS; } catch (_) {}
    return [{ id: 'cat', name: 'CAT', aliases: [] }, { id: 'gmat', name: 'GMAT', aliases: [] },
      { id: 'bankpo', name: 'Bank PO', aliases: [] }, { id: 'ssccgl', name: 'SSC CGL', aliases: [] }, { id: 'other', name: 'Other', aliases: [] }];
  }
  function searchExams(q) {
    q = (q || '').trim().toLowerCase();
    var list = plannerExams(); if (!q) return list;
    return list.filter(function (e) { return e.name.toLowerCase().indexOf(q) >= 0 || (e.aliases || []).some(function (al) { return al.toLowerCase().indexOf(q) >= 0; }); });
  }
  function fmtMin(m) { return m >= 60 ? (m % 60 ? (Math.floor(m / 60) + 'h ' + (m % 60) + 'm') : (m / 60 + 'h')) : (m + ' min'); }

  /* ---------- modal ---------- */
  function openModal(title) {
    var prior = document.getElementById('companionOverlay'); if (prior && prior.parentNode) prior.parentNode.removeChild(prior);
    var overlay = el(
      '<div id="companionOverlay" class="companion-overlay" role="dialog" aria-modal="true" aria-label="' + esc(title || PERSONA) + '">' +
        '<div class="companion-sheet">' +
          '<div class="companion-head"><span class="companion-badge">' + esc(PERSONA) + '</span>' +
            '<span class="companion-title">' + esc(title || '') + '</span>' +
            '<button class="companion-refresh" type="button" aria-label="Refresh" title="Refresh" style="display:none">↻</button>' +
            '<button class="companion-close" type="button" aria-label="Close">✕</button></div>' +
          '<div class="companion-scroll"></div>' +
        '</div></div>');
    document.body.appendChild(overlay);
    function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); _state = null; }
    overlay.querySelector('.companion-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    return { overlay: overlay, body: overlay.querySelector('.companion-scroll'), close: close,
      refreshBtn: overlay.querySelector('.companion-refresh') };
  }

  /* Show the header refresh control and bind it to re-run the surface with a forced, fresh context. */
  function wireRefresh(modal, fn) {
    if (!modal || !modal.refreshBtn) return;
    modal.refreshBtn.style.display = '';
    modal.refreshBtn.addEventListener('click', function () { fn(); });
  }

  /* ---------- staged loading ---------- */
  function showLoading(bodyEl, stages) {
    stages = stages || ['Reading your recent sessions…', 'Spotting patterns…'];
    bodyEl.innerHTML =
      '<div class="companion-loading">' +
        '<div class="companion-skel sk1"></div><div class="companion-skel sk2"></div><div class="companion-skel sk3"></div>' +
        '<div class="companion-loadmsg">' + esc(stages[0]) + '</div>' +
      '</div>';
    var msg = bodyEl.querySelector('.companion-loadmsg'), i = 0;
    var timer = setInterval(function () { i = (i + 1) % stages.length; if (msg) msg.textContent = stages[i]; else clearInterval(timer); }, 1100);
    return function () { clearInterval(timer); };
  }

  /* ---------- block rendering ---------- */
  function blockHTML(b) {
    switch (b.type) {
      case 'say': return '<div class="cb-say">' + esc(b.text) + '</div>';
      case 'card': return '<div class="cb-card accent-' + esc(b.accent || 'slate') + '">' + (b.icon ? '<span class="cb-card-icon">' + esc(b.icon) + '</span>' : '') +
        '<div class="cb-card-main"><div class="cb-card-title">' + esc(b.title) + '</div><div class="cb-card-body">' + esc(b.body).replace(/\n/g, '<br>') + '</div></div></div>';
      case 'metric': return '<div class="cb-metric ' + (b.good ? 'is-good' : 'is-bad') + '"><span class="cb-metric-label">' + esc(b.label) + '</span>' +
        '<span class="cb-metric-val">' + esc(b.value) + ' <span class="cb-metric-trend tr-' + esc(b.trend) + '">' + (b.trend === 'up' ? '▲' : b.trend === 'down' ? '▼' : '–') + '</span></span></div>';
      case 'steps':
        var items = (b.items || []).map(function (s, i) { return '<li><span class="cb-step-n">' + (i + 1) + '</span>' + esc(s) + '</li>'; }).join('');
        return '<div class="cb-steps">' + (b.title ? '<div class="cb-steps-title">' + esc(b.title) + '</div>' : '') + '<ol>' + items + '</ol></div>';
      case 'mission': return '<div class="cb-mission" data-mode="' + esc(b.deepLink.mode) + '" data-cat="' + esc(b.deepLink.category) + '" data-label="' + esc(b.deepLink.label) + '">' +
        '<div class="cb-mission-main"><div class="cb-mission-title">' + esc(b.title) + '</div>' + (b.why ? '<div class="cb-mission-why">' + esc(b.why) + '</div>' : '') + '</div>' +
        '<div class="cb-mission-go">▶</div></div>';
      case 'timeline':
        var days = (b.days || []).map(function (d) { return '<li class="' + (d.done ? 'done' : '') + '"><span class="cb-tl-dot"></span><div><b>' + esc(d.label) + '</b>' + ((d.items || []).length ? '<span class="cb-tl-sub">' + esc((d.items || []).join(' · ')) + '</span>' : '') + '</div></li>'; }).join('');
        return '<ul class="cb-timeline">' + days + '</ul>';
      case 'celebrate': return '<div class="cb-celebrate">🎉 ' + esc(b.text) + '</div>';
      case 'callout': return '<div class="cb-callout tone-' + esc(b.tone || 'info') + '">' + esc(b.text) + '</div>';
      default: return '';
    }
  }

  function chipHTML(c, idx) {
    return '<button class="companion-chip kind-' + esc(c.kind) + '" data-idx="' + idx + '" type="button">' + (c.icon ? esc(c.icon) + ' ' : '') + esc(c.label) + '</button>';
  }

  /* Render an envelope: append its blocks to the thread, replace the chip row. */
  function renderEnvelope(bodyEl, env, append) {
    var blocksHTML = (env.blocks || []).map(blockHTML).join('');
    var turn = el('<div class="companion-turn' + (append ? ' is-new' : '') + '">' + blocksHTML + '</div>');
    if (!append) bodyEl.innerHTML = '';
    // remove any prior chip row
    var oldChips = bodyEl.querySelector('.companion-chips'); if (oldChips) oldChips.parentNode.removeChild(oldChips);
    bodyEl.appendChild(turn);

    var chips = env.chips || [];
    if (chips.length) {
      var row = el('<div class="companion-chips">' + chips.map(chipHTML).join('') + '</div>');
      bodyEl.appendChild(row);
      row.querySelectorAll('.companion-chip').forEach(function (btn) {
        btn.addEventListener('click', function () { onChip(chips[parseInt(btn.getAttribute('data-idx'), 10)], env); });
      });
    }
    // wire mission blocks (tap whole card = deeplink)
    turn.querySelectorAll('.cb-mission').forEach(function (m) {
      m.addEventListener('click', function () { deepLink(m.getAttribute('data-mode'), m.getAttribute('data-cat'), m.getAttribute('data-label')); });
    });
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  /* ---------- chip handling ---------- */
  function deepLink(mode, category, label) {
    log(_state ? _state.feature : 'ai', 'deeplink', { mode: mode, category: category });
    if (_state && _state.modal) _state.modal.close();
    // ADR-040 fix: switch to the Practice view FIRST so its DOM (#drillContainer/#modeSelect …) is present and
    // VISIBLE, THEN launch on the next tick. Without the view switch, startDrillFromPractice early-returns or
    // renders the drill into a hidden view — a silent no-op (the core advice→action loop was broken).
    try { if (typeof Router !== 'undefined' && Router.showView) Router.showView('practice'); } catch (_) {}
    setTimeout(function () {
      try { if (typeof startDrillFromPractice === 'function') startDrillFromPractice(mode, category || '', label || ''); } catch (_) {}
    }, 60);
  }

  /* ---------- in-place micro-drill (ADR-045): 5 adaptive questions INSIDE the modal, then back to the conversation.
     "Drill this" must NEVER navigate to the Practice page or lose the explanation. Reuses the shared question
     generator (global generateQuestions from questions.js); no Firestore session, no nav, no context loss. ---------- */
  var _DIFFS = ['easy', 'medium', 'hard'];
  function _bumpDiff(d, dir) { var i = _DIFFS.indexOf(d); if (i < 0) i = 1; return _DIFFS[Math.max(0, Math.min(2, i + dir))]; }
  function _answerMatches(userVal, answer) {
    if (userVal == null) return false;
    var u = String(userVal).trim().toLowerCase(); if (!u) return false;
    var a = String(answer).trim().toLowerCase();
    if (u === a) return true;
    var un = parseFloat(u.replace(/,/g, '')), an = parseFloat(a.replace(/,/g, ''));
    return (!isNaN(un) && !isNaN(an) && Math.abs(un - an) < 1e-6);
  }
  function startMicroDrill(category, label) {
    if (!_state) return;
    var feature = _state.feature, body = _state.body;
    // Generator missing? Fall back to the old navigation so the CTA is never dead.
    if (typeof generateQuestions !== 'function') { deepLink('focus', category, label); return; }
    log(feature, 'microdrill_start', { category: category });
    var oldChips = body.querySelector('.companion-chips'); if (oldChips) oldChips.parentNode.removeChild(oldChips);
    var wrap = el('<div class="companion-turn is-new"><div class="companion-quiz"></div></div>');
    body.appendChild(wrap); body.scrollTop = body.scrollHeight;
    var host = wrap.querySelector('.companion-quiz');
    var total = 5, idx = 0, correct = 0, results = [];
    var diff = (_state.explainCtx && _state.explainCtx.difficulty) || 'medium';

    function renderQ() {
      if (idx >= total) return finish();
      var qs = generateQuestions(1, category || null, diff) || [];
      var q = qs[0]; if (!q || q.question == null) { total = idx; return finish(); }
      var startMs = Date.now();
      host.innerHTML =
        '<div class="cq-head">Quick drill · ' + (idx + 1) + '/' + total + ' · ' + esc(label || 'practice') + '</div>' +
        '<div class="cq-q">' + esc(String(q.question)) + '</div>' +
        '<form class="cq-form"><input class="cq-input" type="text" inputmode="decimal" autocomplete="off" placeholder="Your answer" /><button class="cq-go" type="submit">Check</button></form>' +
        '<div class="cq-fb"></div>';
      var form = host.querySelector('.cq-form'), input = host.querySelector('.cq-input'), fb = host.querySelector('.cq-fb');
      try { input.focus(); } catch (_) {}
      form.onsubmit = function (e) {
        e.preventDefault();
        if (input.disabled) return;
        var good = _answerMatches(input.value, q.answer), ms = Date.now() - startMs;
        results.push({ correct: good, ms: ms }); if (good) correct++;
        diff = _bumpDiff(diff, good ? 1 : -1);
        input.disabled = true; var go = host.querySelector('.cq-go'); if (go) go.disabled = true;
        fb.className = 'cq-fb ' + (good ? 'good' : 'bad');
        fb.textContent = good ? ('Correct · ' + (ms / 1000).toFixed(1) + 's') : ('Answer: ' + q.answer);
        idx++;
        setTimeout(renderQ, good ? 700 : 1300);
      };
    }

    function finish() {
      var n = results.length || total;
      var avgMs = results.length ? Math.round(results.reduce(function (s, r) { return s + r.ms; }, 0) / results.length) : 0;
      host.innerHTML = '<div class="cq-result">Drill done · <strong>' + correct + '/' + n + '</strong>' + (avgMs ? (' · ~' + (avgMs / 1000).toFixed(1) + 's/Q') : '') + '</div>';
      log(feature, 'microdrill_done', { score: correct, total: n });
      var missed = results.map(function (r, i) { return r.correct ? null : ('Q' + (i + 1)); }).filter(Boolean);
      var summary = 'The student just did a ' + n + '-question micro-drill on ' + (label || category) + ' and scored ' + correct + '/' + n
        + (missed.length ? (', missing ' + missed.join(', ')) : '') + (avgMs ? (', averaging ' + (avgMs / 1000).toFixed(1) + 's per question') : '')
        + '. React in ONE short, specific line and give the single best next step. Stay on THIS concept.';
      var typing = el('<div class="companion-turn"><div class="companion-typing"><i></i><i></i><i></i></div></div>');
      body.appendChild(typing); body.scrollTop = body.scrollHeight;
      var payload = { feature: feature, topic: _state.topic, userTurn: 'drill_result', drill: summary, history: _state.history.slice(-4) };
      if (_state.explainCtx) { payload.question = _state.explainCtx.question; payload.lastExplanation = _state.explainCtx.lastExplanation; }
      api('chat', payload).then(function (res) {
        if (typing.parentNode) typing.parentNode.removeChild(typing);
        var env = res && res.ok && res.data ? res.data.response : null;
        if (!env) { renderEnvelope(body, { blocks: [], chips: _explainChips(category, label) }, true); return; }
        (env.blocks || []).forEach(function (b) { if (b.type === 'say') _state.history.push({ role: 'ai', content: b.text }); });
        renderEnvelope(body, env, true);
      });
    }
    renderQ();
  }
  /* Standard Explain chip row — used to restore the conversation if the post-drill reaction can't be fetched. */
  function _explainChips(category, label) {
    return [{ label: 'Got it ✓', value: 'helpful_yes', kind: 'reply' }, { label: 'Another like this', value: 'explain_another', kind: 'reply' },
      { label: 'Drill this', kind: 'drill', icon: '⚡', drill: { category: category, label: label } }];
  }

  function onChip(chip, env) {
    if (!chip) return;
    if (chip.kind === 'drill' && chip.drill) { startMicroDrill(chip.drill.category, chip.drill.label); return; }   // in-place, never navigates (ADR-045)
    if (chip.kind === 'deeplink' && chip.deepLink) { deepLink(chip.deepLink.mode, chip.deepLink.category, chip.deepLink.label); return; }
    if (chip.kind === 'dismiss') { log(_state ? _state.feature : 'ai', 'dismiss', {}); if (_state && _state.modal) _state.modal.close(); return; }
    // reply → conversational turn
    var value = chip.value || '';
    log(_state ? _state.feature : 'ai', value === 'helpful_yes' || value === 'helpful_no' ? value : 'chip_tap', { chip: chip.label });
    // QuanAI Planner chips (ADR-046) — these don't go through a chat turn.
    if (value === 'planner_setup') { if (_state && _state.modal) _state.modal.close(); openStudyPlanner(true); return; }
    if (value === 'planner_open_calendar') {
      if (_state && _state.modal) _state.modal.close();
      if (window.Planner && Planner.open) Planner.open(); else openStudyPlanner(false);
      return;
    }
    sendTurn(value, chip.label);
  }

  function sendTurn(value, label) {
    if (!_state) return;
    var body = _state.body;
    // optimistic: show the student's tap as a turn
    if (label && value !== 'helpful_yes' && value !== 'helpful_no') {
      var old = body.querySelector('.companion-chips'); if (old) old.parentNode.removeChild(old);
      body.appendChild(el('<div class="companion-userturn">' + esc(label) + '</div>'));
    }
    var typing = el('<div class="companion-turn"><div class="companion-typing"><i></i><i></i><i></i></div></div>');
    body.appendChild(typing); body.scrollTop = body.scrollHeight;
    // ADR-040: capture history BEFORE recording the current turn, so it isn't double-counted (it's also sent as userTurn).
    var histPayload = _state.history.slice(-6);
    _state.history.push({ role: 'user', content: label || value });
    var payload = { feature: _state.feature, topic: _state.topic, userTurn: value, history: histPayload };
    // Anchor Explain follow-ups to the original question + the explanation on screen (ADR-045).
    if (_state.explainCtx) { payload.question = _state.explainCtx.question; payload.lastExplanation = _state.explainCtx.lastExplanation; }
    api('chat', payload).then(function (res) {
      if (typing.parentNode) typing.parentNode.removeChild(typing);
      if (!res.ok) { renderError(body, res, function () { sendTurn(value, label); }); return; }
      var env = res.data.response;
      (env.blocks || []).forEach(function (b) { if (b.type === 'say') _state.history.push({ role: 'ai', content: b.text }); });
      // Keep the anchor fresh: the latest reworked explanation becomes the basis for the next follow-up.
      if (_state.explainCtx) { var t = explanationText(env); if (t) _state.explainCtx.lastExplanation = t; }
      renderEnvelope(body, env, true);
    });
  }

  function renderError(bodyEl, res, onRetry) {
    var msg = res.code === 'AI_BUDGET_EXCEEDED' || res.code === 'AI_THROTTLED'
      ? PERSONA + ' is resting for a bit — please try again shortly.'
      : res.code === 'PREMIUM_REQUIRED' ? 'This is a Premium feature.'
      : res.code === 'NO_AUTH' ? 'You\'ve been signed out — refresh the app and sign in again.'
      : 'I couldn\'t respond just now. Tap retry.';
    // Auth failure and premium gating aren't transient — don't offer a retry that will just loop.
    var canRetry = res.code !== 'PREMIUM_REQUIRED' && res.code !== 'NO_AUTH' && typeof onRetry === 'function';
    var row = el('<div class="companion-turn"><div class="cb-callout tone-warn">' + esc(msg) + '</div>' +
      (canRetry ? '<div class="companion-chips"><button class="companion-chip kind-reply" type="button">Retry</button></div>' : '') + '</div>');
    bodyEl.appendChild(row);
    var btn = row.querySelector('.companion-chip');
    if (btn) btn.addEventListener('click', function () { onRetry(); });
    if (res.code === 'PREMIUM_REQUIRED') { try { if (typeof showPaywall === 'function') showPaywall('ai_coach'); } catch (_) {} }
  }

  /* ---------- feature openers ---------- */
  function openFeature(o) {
    var m = openModal(o.title);
    _state = { feature: o.feature, topic: o.topic || '', history: [], body: m.body, modal: m };
    // Explain anchor: remember the exact question so every follow-up turn deepens THIS problem (ADR-045).
    if (o.feature === 'explain') _state.explainCtx = { question: (o.body && o.body.question) || '', lastExplanation: '' };
    log(o.feature, 'opened', {});
    // Force a fresh context when the student practiced since this feature last refreshed, or tapped refresh.
    var force = !!o.force || (o.autoForce && shouldForce(o.feature));
    var stamp = dirtyAt();
    var reqBody = {}; for (var k in (o.body || {})) reqBody[k] = o.body[k];
    if (force) reqBody.force = true;
    // ADR-048: send the live local stats floor so Coach/Insights aren't stale during the syncStats debounce.
    if (o.withClientStats) reqBody.clientStats = clientStats();
    if (o.autoForce) wireRefresh(m, function () { openFeature(_assign(o, { force: true })); });
    var stop = showLoading(m.body, o.stages);
    // ADR-040: on initial-load failure, Retry re-invokes the ORIGINAL feature action (not a generic chat turn).
    var reopen = function () { openFeature(o); };
    api(o.action, reqBody).then(function (res) {
      stop();
      if (!res.ok) { m.body.innerHTML = ''; renderError(m.body, res, reopen); return; }
      var env = res.data.response;
      if (!env) { m.body.innerHTML = ''; renderError(m.body, { code: 'ERR' }, reopen); return; }
      if (force) markSeen(o.feature, stamp);
      if (_state.explainCtx) _state.explainCtx.lastExplanation = explanationText(env);
      log(o.feature, 'shown', { promptId: env.meta && env.meta.promptId, refreshed: !!force });
      renderEnvelope(m.body, env, false);
    });
  }
  function _assign(a, b) { var o = {}; var k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }

  function openExplain(question, answer, category) {
    openFeature({ feature: 'explain', title: 'Explain', topic: category, action: 'explain',
      body: { question: question, answer: answer, category: category }, stages: ['Working through it…', 'Finding the cleanest way…'] });
  }
  function openCoach() { openFeature({ feature: 'coach', title: 'Your Coach', action: 'coach', autoForce: true, withClientStats: true, stages: ['Reviewing your week…', 'Picking your next move…'] }); }
  function openInsights() { openFeature({ feature: 'insights', title: 'Insights', action: 'insights', autoForce: true, withClientStats: true, stages: ['Reading your trends…', 'Finding your biggest lever…'] }); }

  /* ---------- QuanAI Planner (ADR-046): setup wizard → server builds the 14-day block → calendar/envelope ---------- */
  var PREP_LEVELS = [['scratch', 'Starting from scratch'], ['revision', 'Need revision'], ['average', 'Average'], ['confident', 'Fairly confident'], ['ready', 'Almost exam ready']];
  var PREF_TIMES = [['morning', '🌅 Morning'], ['afternoon', '☀️ Afternoon'], ['evening', '🌆 Evening'], ['night', '🌙 Night']];

  function openStudyPlanner(forceSetup) {
    var m = openModal('Study Planner');
    _state = { feature: 'planner', topic: '', history: [], body: m.body, modal: m };
    log('planner', 'opened', {});
    if (forceSetup) return runPlannerSetup(m);
    var stop = showLoading(m.body, ['Loading your plan…']);
    api('planner', { op: 'get' }).then(function (res) {
      stop();
      if (res.ok && res.data && res.data.plan && res.data.response) {
        log('planner', 'shown', {});
        // Prefer the full calendar view if it's loaded (P5); otherwise show the companion summary.
        if (window.Planner && Planner.openCalendar) { m.close(); Planner.openCalendar(res.data.plan); return; }
        renderEnvelope(m.body, res.data.response, false);
        return;
      }
      runPlannerSetup(m);
    });
  }

  function runPlannerSetup(m) {
    var body = m.body;
    var a = { examId: '', examName: '', examDate: '', dailyMinutes: 45, daysPerWeek: 5, prepLevel: '', preferredTime: '', _examQ: '' };
    var screens = ['exam', 'date', 'time', 'days', 'prep', 'pref'];
    var si = 0;

    function dots() { return '<div class="ps-dots">' + screens.map(function (_, i) { return '<span class="' + (i === si ? 'on' : (i < si ? 'done' : '')) + '"></span>'; }).join('') + '</div>'; }
    function frame(inner, opts) {
      opts = opts || {};
      body.innerHTML = '<div class="companion-turn ps-screen">' + dots() + inner +
        '<div class="ps-nav">' + (si > 0 ? '<button class="companion-chip kind-reply ps-back" type="button">← Back</button>' : '<span></span>') +
        '<button class="companion-chip kind-deeplink ps-next" type="button"' + (opts.nextDisabled ? ' disabled' : '') + '>' + esc(opts.nextLabel || 'Next →') + '</button>' +
        '</div></div>';
      var back = body.querySelector('.ps-back'); if (back) back.onclick = function () { si = Math.max(0, si - 1); render(); };
      var next = body.querySelector('.ps-next'); if (next) next.onclick = function () { if (opts.onNext && opts.onNext() === false) return; si++; render(); };
    }

    function screenExam() {
      var inner = '<div class="cb-say">Which exam are you preparing for?</div>' +
        '<input class="ps-search" type="text" placeholder="Search exams…" value="' + esc(a._examQ) + '" />' +
        '<div class="ps-list">' + searchExams(a._examQ).map(function (e) { return '<button class="ps-opt' + (a.examId === e.id ? ' sel' : '') + '" data-id="' + esc(e.id) + '" data-name="' + esc(e.name) + '" type="button">' + esc(e.name) + '</button>'; }).join('') + '</div>' +
        (a.examId === 'other' ? '<input class="ps-custom" type="text" placeholder="Name your exam or goal" value="' + esc(a.examName || '') + '" />' : '');
      frame(inner, { nextDisabled: !a.examId, onNext: function () { if (a.examId === 'other') { var c = body.querySelector('.ps-custom'); a.examName = (c && c.value.trim()) || 'Custom'; } } });
      var search = body.querySelector('.ps-search');
      if (search) search.oninput = function () { a._examQ = search.value; var pos = search.selectionStart; screenExam(); var s2 = body.querySelector('.ps-search'); if (s2) { s2.focus(); try { s2.setSelectionRange(pos, pos); } catch (_) {} } };
      body.querySelectorAll('.ps-opt').forEach(function (b) { b.onclick = function () { a.examId = b.getAttribute('data-id'); a.examName = b.getAttribute('data-name'); screenExam(); }; });
      var custom = body.querySelector('.ps-custom'); if (custom) custom.oninput = function () { a.examName = custom.value; };
    }
    function screenDate() {
      var days = a.examDate ? Math.max(0, Math.ceil((Date.parse(a.examDate + 'T00:00:00Z') - Date.now()) / 86400000)) : null;
      var min = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      var inner = '<div class="cb-say">When\'s your exam?</div>' +
        '<input class="ps-date" type="date" min="' + min + '" value="' + esc(a.examDate || '') + '" />' +
        '<div class="ps-hint">' + (days != null ? (days + ' days to prepare') : 'Pick your exam date — or skip if you\'re not sure yet') + '</div>';
      frame(inner, { nextLabel: a.examDate ? 'Next →' : 'Skip →' });
      var dt = body.querySelector('.ps-date'); if (dt) dt.onchange = function () { a.examDate = dt.value; screenDate(); };
    }
    function screenTime() {
      var inner = '<div class="cb-say">How long can you study each day?</div>' +
        '<div class="ps-bigval"><strong>' + fmtMin(a.dailyMinutes) + '</strong></div>' +
        '<input class="ps-range" type="range" min="15" max="480" step="15" value="' + a.dailyMinutes + '" />' +
        '<div class="ps-presets">' + [30, 60, 120, 180, 240].map(function (p) { return '<button class="ps-chip' + (a.dailyMinutes === p ? ' sel' : '') + '" data-v="' + p + '" type="button">' + fmtMin(p) + '</button>'; }).join('') + '</div>';
      frame(inner, {});
      var r = body.querySelector('.ps-range');
      if (r) r.oninput = function () { a.dailyMinutes = parseInt(r.value, 10); var bv = body.querySelector('.ps-bigval strong'); if (bv) bv.textContent = fmtMin(a.dailyMinutes); body.querySelectorAll('.ps-chip').forEach(function (c) { c.classList.toggle('sel', parseInt(c.getAttribute('data-v'), 10) === a.dailyMinutes); }); };
      body.querySelectorAll('.ps-chip').forEach(function (c) { c.onclick = function () { a.dailyMinutes = parseInt(c.getAttribute('data-v'), 10); screenTime(); }; });
    }
    function screenDays() {
      var inner = '<div class="cb-say">How many days a week will you study?</div>' +
        '<div class="ps-week">' + [1, 2, 3, 4, 5, 6, 7].map(function (d) { return '<button class="ps-day' + (a.daysPerWeek === d ? ' sel' : '') + '" data-d="' + d + '" type="button">' + d + '</button>'; }).join('') + '</div>' +
        '<div class="ps-hint">' + a.daysPerWeek + ' day' + (a.daysPerWeek > 1 ? 's' : '') + ' a week</div>';
      frame(inner, {});
      body.querySelectorAll('.ps-day').forEach(function (b) { b.onclick = function () { a.daysPerWeek = parseInt(b.getAttribute('data-d'), 10); screenDays(); }; });
    }
    function screenPrep() {
      var inner = '<div class="cb-say">Where are you right now?</div>' +
        '<div class="ps-stack">' + PREP_LEVELS.map(function (p) { return '<button class="ps-opt big' + (a.prepLevel === p[0] ? ' sel' : '') + '" data-v="' + p[0] + '" type="button">' + esc(p[1]) + '</button>'; }).join('') + '</div>';
      frame(inner, { nextDisabled: !a.prepLevel });
      body.querySelectorAll('.ps-opt').forEach(function (b) { b.onclick = function () { a.prepLevel = b.getAttribute('data-v'); screenPrep(); }; });
    }
    function screenPref() {
      var inner = '<div class="cb-say">When do you prefer to study? <span class="ps-sub">(optional)</span></div>' +
        '<div class="ps-grid">' + PREF_TIMES.map(function (p) { return '<button class="ps-opt' + (a.preferredTime === p[0] ? ' sel' : '') + '" data-v="' + p[0] + '" type="button">' + esc(p[1]) + '</button>'; }).join('') + '</div>';
      frame(inner, { nextLabel: 'Create my plan ✨' });
      body.querySelectorAll('.ps-opt').forEach(function (b) { b.onclick = function () { var v = b.getAttribute('data-v'); a.preferredTime = (a.preferredTime === v ? '' : v); screenPref(); }; });
    }

    function render() {
      if (si >= screens.length) return submit();
      var s = screens[si];
      if (s === 'exam') return screenExam();
      if (s === 'date') return screenDate();
      if (s === 'time') return screenTime();
      if (s === 'days') return screenDays();
      if (s === 'prep') return screenPrep();
      return screenPref();
    }
    function submit() {
      var stop = showLoading(body, ['Mapping the syllabus to your strengths…', 'Weighting by exam frequency…', 'Scheduling your next 14 days…']);
      api('planner', { op: 'setup', examId: a.examId, examName: a.examName, examDate: a.examDate, dailyMinutes: a.dailyMinutes, daysPerWeek: a.daysPerWeek, prepLevel: a.prepLevel, preferredTime: a.preferredTime, clientStats: clientStats() }).then(function (res) {
        stop();
        if (res.ok && res.data && res.data.response) {
          log('planner', 'setup_done', { examId: a.examId });
          if (window.Planner && Planner.openCalendar && res.data.plan) { m.close(); Planner.openCalendar(res.data.plan); return; }
          renderEnvelope(body, res.data.response, false);
        } else { renderError(body, res, function () { submit(); }); }
      });
    }
    render();
  }

  return { openExplain: openExplain, openCoach: openCoach, openInsights: openInsights,
    openStudyPlanner: openStudyPlanner, renderEnvelope: renderEnvelope, clientStats: clientStats, openModal: openModal, _api: api };
})();
if (typeof window !== 'undefined') window.Companion = Companion;
