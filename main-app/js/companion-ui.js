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
  var PERSONA = 'Reflex';
  var _state = null; // { feature, topic, history:[], modal }

  /* ---------- utils ---------- */
  function esc(s) { if (typeof s !== 'string') return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  function log(feature, type, meta) { try { if (window.AIAnalytics && AIAnalytics.log) AIAnalytics.log(feature, type, meta || {}); } catch (_) {} }

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

  /* ---------- modal ---------- */
  function openModal(title) {
    var prior = document.getElementById('companionOverlay'); if (prior && prior.parentNode) prior.parentNode.removeChild(prior);
    var overlay = el(
      '<div id="companionOverlay" class="companion-overlay" role="dialog" aria-modal="true" aria-label="' + esc(title || PERSONA) + '">' +
        '<div class="companion-sheet">' +
          '<div class="companion-head"><span class="companion-badge">' + esc(PERSONA) + '</span>' +
            '<span class="companion-title">' + esc(title || '') + '</span>' +
            '<button class="companion-close" type="button" aria-label="Close">✕</button></div>' +
          '<div class="companion-scroll"></div>' +
        '</div></div>');
    document.body.appendChild(overlay);
    function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); _state = null; }
    overlay.querySelector('.companion-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    return { overlay: overlay, body: overlay.querySelector('.companion-scroll'), close: close };
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
      case 'progress': return '<div class="cb-progress"><div class="cb-progress-top"><span>' + esc(b.label) + '</span><span>' + Math.round(b.pct || 0) + '%</span></div>' +
        '<div class="cb-progress-bar"><i style="width:' + Math.max(0, Math.min(100, b.pct || 0)) + '%"></i></div>' + (b.caption ? '<div class="cb-progress-cap">' + esc(b.caption) + '</div>' : '') + '</div>';
      case 'steps':
        var items = (b.items || []).map(function (s, i) { return '<li><span class="cb-step-n">' + (i + 1) + '</span>' + esc(s) + '</li>'; }).join('');
        return '<div class="cb-steps">' + (b.title ? '<div class="cb-steps-title">' + esc(b.title) + '</div>' : '') + '<ol>' + items + '</ol></div>';
      case 'mission': return '<div class="cb-mission" data-mode="' + esc(b.deepLink.mode) + '" data-cat="' + esc(b.deepLink.category) + '" data-label="' + esc(b.deepLink.label) + '">' +
        '<div class="cb-mission-main"><div class="cb-mission-title">' + esc(b.title) + '</div>' + (b.why ? '<div class="cb-mission-why">' + esc(b.why) + '</div>' : '') + '</div>' +
        '<div class="cb-mission-go">▶</div></div>';
      case 'quiz': return '<div class="cb-card accent-blue"><div class="cb-card-main"><div class="cb-card-title">Try it</div><div class="cb-card-body">' + esc(b.question) + '</div></div></div>';
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
    try { if (typeof startDrillFromPractice === 'function') { startDrillFromPractice(mode, category || '', label || ''); return; } } catch (_) {}
    try { if (typeof Router !== 'undefined' && Router.showView) Router.showView('practice'); } catch (_) {}
  }

  function onChip(chip, env) {
    if (!chip) return;
    if (chip.kind === 'deeplink' && chip.deepLink) { deepLink(chip.deepLink.mode, chip.deepLink.category, chip.deepLink.label); return; }
    if (chip.kind === 'dismiss') { log(_state ? _state.feature : 'ai', 'dismiss', {}); if (_state && _state.modal) _state.modal.close(); return; }
    // reply → conversational turn
    var value = chip.value || '';
    log(_state ? _state.feature : 'ai', value === 'helpful_yes' || value === 'helpful_no' ? value : 'chip_tap', { chip: chip.label });
    if (value === 'plan_regen') { Companion.openMission(true); return; }
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
    _state.history.push({ role: 'user', content: label || value });
    api('chat', { feature: _state.feature, topic: _state.topic, userTurn: value, history: _state.history.slice(-6) }).then(function (res) {
      if (typing.parentNode) typing.parentNode.removeChild(typing);
      if (!res.ok) { renderError(body, res); return; }
      var env = res.data.response;
      (env.blocks || []).forEach(function (b) { if (b.type === 'say') _state.history.push({ role: 'ai', content: b.text }); });
      renderEnvelope(body, env, true);
    });
  }

  function renderError(bodyEl, res) {
    var msg = res.code === 'AI_BUDGET_EXCEEDED' || res.code === 'AI_THROTTLED'
      ? PERSONA + ' is resting for a bit — please try again shortly.'
      : res.code === 'PREMIUM_REQUIRED' ? 'This is a Premium feature.'
      : 'I couldn\'t respond just now. Tap retry.';
    var row = el('<div class="companion-turn"><div class="cb-callout tone-warn">' + esc(msg) + '</div>' +
      '<div class="companion-chips"><button class="companion-chip kind-reply" type="button">Retry</button></div></div>');
    bodyEl.appendChild(row);
    var btn = row.querySelector('.companion-chip');
    if (btn) btn.addEventListener('click', function () { if (_state) { sendTurn('retry', null); } });
    if (res.code === 'PREMIUM_REQUIRED') { try { if (typeof showPaywall === 'function') showPaywall('ai_coach'); } catch (_) {} }
  }

  /* ---------- feature openers ---------- */
  function openFeature(o) {
    var m = openModal(o.title);
    _state = { feature: o.feature, topic: o.topic || '', history: [], body: m.body, modal: m };
    log(o.feature, 'opened', {});
    var stop = showLoading(m.body, o.stages);
    api(o.action, o.body || {}).then(function (res) {
      stop();
      if (!res.ok) { m.body.innerHTML = ''; renderError(m.body, res); return; }
      var env = res.data.response;
      if (!env) { m.body.innerHTML = ''; renderError(m.body, { code: 'ERR' }); return; }
      log(o.feature, 'shown', { promptId: env.meta && env.meta.promptId });
      renderEnvelope(m.body, env, false);
    });
  }

  function openExplain(question, answer, category) {
    openFeature({ feature: 'explain', title: 'Explain', topic: category, action: 'explain',
      body: { question: question, answer: answer, category: category }, stages: ['Working through it…', 'Finding the cleanest way…'] });
  }
  function openCoach() { openFeature({ feature: 'coach', title: 'Your Coach', action: 'coach', stages: ['Reviewing your week…', 'Picking your next move…'] }); }
  function openInsights() { openFeature({ feature: 'insights', title: 'Insights', action: 'insights', stages: ['Reading your trends…', 'Finding your biggest lever…'] }); }
  function openWordProblem(category, difficulty) { openFeature({ feature: 'wordproblems', title: 'Word Problem', topic: category, action: 'wordproblems', body: { category: category, difficulty: difficulty } }); }

  /* Mission: get existing → render, else run a chip-driven interview, then generate. */
  function openMission(forceRegen) {
    var m = openModal('Your Mission');
    _state = { feature: 'plan', topic: '', history: [], body: m.body, modal: m };
    log('plan', 'opened', {});
    if (forceRegen) { return runInterview(m); }
    var stop = showLoading(m.body, ['Loading your plan…']);
    api('mission', { op: 'get' }).then(function (res) {
      stop();
      if (res.ok && res.data && res.data.plan && res.data.response) { log('plan', 'shown', {}); renderEnvelope(m.body, res.data.response, false); return; }
      runInterview(m);
    });
  }

  function runInterview(m) {
    var answers = {};
    var steps = [
      { q: 'Which exam are you preparing for?', opts: [['CAT', 'CAT'], ['GMAT', 'GMAT'], ['Bank PO', 'Bank PO'], ['SSC', 'SSC'], ['Other', 'CAT']], key: 'examName' },
      { q: 'When\'s the exam?', opts: [['~1 month', 30], ['~2 months', 60], ['~3 months', 90], ['~6 months', 180]], key: 'days' },
      { q: 'How long can you study daily?', opts: [['15 min', 15], ['30 min', 30], ['45 min', 45], ['60 min', 60]], key: 'dailyMinutes' },
      { q: 'How confident do you feel right now?', opts: [['Low', 'low'], ['Okay', 'medium'], ['Strong', 'high']], key: 'confidence' }
    ];
    var idx = 0;
    function ask() {
      if (idx >= steps.length) return finish();
      var s = steps[idx];
      m.body.innerHTML = '<div class="companion-turn"><div class="cb-say">' + esc(s.q) + '</div>' +
        '<div class="companion-chips">' + s.opts.map(function (o, i) { return '<button class="companion-chip kind-reply" data-i="' + i + '" type="button">' + esc(o[0]) + '</button>'; }).join('') + '</div></div>';
      m.body.querySelectorAll('.companion-chip').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var o = s.opts[parseInt(btn.getAttribute('data-i'), 10)];
          answers[s.key] = o[1]; idx++; ask();
        });
      });
    }
    function finish() {
      var stop = showLoading(m.body, ['Designing your mission…', 'Weighting your weak topics…']);
      var examDate = '';
      if (answers.days) { var d = new Date(Date.now() + answers.days * 86400000); examDate = d.toISOString().slice(0, 10); }
      api('mission', { op: 'generate', examName: answers.examName || 'CAT', examDate: examDate, dailyMinutes: answers.dailyMinutes || 45, confidence: answers.confidence || 'medium', goal: '' }).then(function (res) {
        stop();
        if (res.ok && res.data && res.data.response) { log('plan', 'generated', {}); renderEnvelope(m.body, res.data.response, false); }
        else renderError(m.body, res);
      });
    }
    ask();
  }

  return { openExplain: openExplain, openCoach: openCoach, openInsights: openInsights, openMission: openMission, openWordProblem: openWordProblem, renderEnvelope: renderEnvelope, _api: api };
})();
if (typeof window !== 'undefined') window.Companion = Companion;
