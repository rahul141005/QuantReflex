/**
 * drill-engine.js — Core drill / test engine (SPA compatible)
 *
 * Manages: question display, answer checking, per-question timer,
 *          scoring, streak tracking, and results summary.
 *
 * Modes:
 *   - Quick Drill:    5 questions, no timer
 *   - Reflex Drill:  10 questions, per-question timer (15s)
 *   - Timed Test:    10 questions, 180s overall limit
 *   - Focus Training: 10 questions from a specific category
 *   - Review Mistakes: review previously wrong questions
 *
 * Usage:
 *   var engine = createDrillEngine(container, { count, timeLimitSec, perQuestionSec, category, mode });
 *   engine.start();
 */

/**
 * Create a drill engine bound to the given container element.
 *
 * @param {HTMLElement} container  - wrapper element on the page
 * @param {object}      opts
 * @param {number}      opts.count           - number of questions (default 10)
 * @param {number|null} opts.timeLimitSec    - overall time limit in seconds (null = unlimited)
 * @param {number|null} opts.perQuestionSec  - per-question time limit in seconds (null = unlimited)
 * @param {string|null} opts.category        - question category filter (null = all)
 * @param {string[]|null} opts.topics        - optional custom mode topic list
 * @param {string}      opts.mode            - drill mode label for display
 * @param {boolean}     opts.reviewMode      - if true, use mistake review questions
 * @param {function}    opts.onFinish        - callback when drill finishes (for SPA navigation)
 * @returns {object} engine with .start() and .cleanup() methods
 */
function createDrillEngine(container, opts) {
  var count = opts.count || 10;
  var timeLimit = opts.timeLimitSec || null;
  var perQLimit = opts.perQuestionSec || null;
  var category = opts.category || null;
  var topics = Array.isArray(opts.topics) ? opts.topics : null;
  var mode = opts.mode || 'Drill';
  /* Auto-advance after a correct answer (Reflex Drill). Driven by the explicit flag (set in practice-modes.js), with a
     label regex as a safety net — the old bare `mode === 'Reflex Drill'` literal never matched the emoji-prefixed
     '🧠 Reflex Drill' and is subsumed by the regex, so it was dropped (ADR-086 fix, ADR-087 cleanup). */
  var autoAdvance = (opts.autoAdvance === true) || /Reflex Drill/.test(mode);
  var reviewMode = opts.reviewMode || false;
  var onFinish = opts.onFinish || null;
  var onResults = opts.onResults || null;   // optional: host hook to augment the results card (e.g. mock scoring)
  var preloadedQuestions = opts._preloadedQuestions || null;
  var adaptiveMode = opts.adaptive === true;
  var diSet = opts.diSet || null;            /* DI Sets (ADR-078): one shared chart/context + N linked questions */
  var _setShellBuilt = false;                /* set mode renders the shared context ONCE, then swaps only the Q block */
  
  /* ---- Duel Context Extensions (ADR-033: true component reuse, capture-only) ---- */
  var isDuel = opts.isDuel === true;
  var duelHeaderHTML = opts.duelHeaderHTML || '';
  var onDuelAnswerSubmit = opts.onDuelAnswerSubmit || null;
  var onDuelRender = opts.onDuelRender || null;   /* (container, index, total) after each duel question render */
  var duelAllowSkip = opts.duelAllowSkip === true;   /* host-set: Skip is OFF by default in a duel (ADR-033) */

  /* ---- Adaptive controller state ---- */
  var _adaptiveHistory = [];   /* [{correct, timeSec}] last N answers */
  var _adaptiveDifficulty = 'medium';
  var _ADAPTIVE_WINDOW = 4;    /* rolling 4-answer window for fast in-session adaptation */

  function _computeAdaptiveDifficulty() {
    if (_adaptiveHistory.length < 2) return _adaptiveDifficulty;
    var window = _adaptiveHistory.slice(-_ADAPTIVE_WINDOW);
    var correct = 0;
    var totalTime = 0;
    for (var i = 0; i < window.length; i++) {
      if (window[i].correct) correct++;
      totalTime += window[i].timeSec;
    }
    var acc = correct / window.length;
    var avgTime = totalTime / window.length;
    if (acc > 0.8 && avgTime < 12) return 'hard';
    if (acc >= 0.5) return 'medium';
    return 'easy';
  }

  function _setAdaptiveOverride(diff) {
    _adaptiveDifficulty = diff;
    if (typeof AdaptiveState !== 'undefined') {
      AdaptiveState.setDifficulty(diff);
    } else {
      window._adaptiveOverrideDifficulty = diff;
    }
  }

  function _clearAdaptiveOverride() {
    if (typeof AdaptiveState !== 'undefined') {
      AdaptiveState.clearDifficulty();
    } else {
      window._adaptiveOverrideDifficulty = null;
    }
  }

  var questions = [];
  var current = 0;
  var score = 0;
  var bestSessionStreak = 0;
  var currentSessionStreak = 0;
  var perQuestionTimes = [];
  var sessionWrongCategories = {}; /* category → wrong count for insight engine */
  var sessionCategoryStats = {};   /* ADR-086 P6: category → {correct,total} for the strongest/weakest topic breakdown */
  var sessionWrongQuestions = [];  /* full question objects missed this session (charts/figures intact) → "Review these now" replay */
  var qStart = 0;
  var overallStart = 0;
  var overallTimer = null;
  var perQTimer = null;
  /* Post-answer transition timers (engine-scoped so cleanup() can cancel them). Both are plain setTimeout ids: the
     350ms guard that re-enables Next, and the 600ms Reflex auto-advance. Left uncancelled they would fire nextQuestion/
     finish into a torn-down engine if the user exits within the window (stray session-record on a hidden view). */
  var _nextGuardTimer = null;
  var _autoAdvanceTimer = null;
  var _loadingTimer = null; /* ADR-086 P5: defer-to-next-frame handle for the honest loading state (cancelled on teardown) */
  /* ADR-086 P7 — pause/resume: countdowns are kept at engine scope (not trapped in the tick closures) so pause can
     freeze them and resume can restart from the exact second. Timing anchors (qStart/overallStart) are shifted forward
     by the paused duration on resume so a pause never counts against response or total time. */
  var _globalRemaining = null;
  var _perQRemaining = null;
  var _paused = false;
  var _pauseStart = 0;
  var _visHandler = null; /* visibilitychange auto-pause handler (installed for non-duel sessions, removed on cleanup) */
  var answered = false; /* prevents double-counting */
  var _nextReady = true; /* debounce guard — false for 350ms after answer confirmed, prevents carry-over taps */
  var beginStarted = false; /* prevents duplicate START on rapid taps */
  var _isFinished = false; /* prevents timer/checkAnswer race after finish() */
  var _finishResults = null; /* session summary passed to onFinish (used by mock mode for exam-accurate scoring) */
  var reviewOriginalCount = 0; /* track original count for review mode cap */
  var ui = {
    globalTimerEl: null,
    perQTimerEl: null,
    answerInputEl: null,
    submitBtnEl: null,
    feedbackEl: null,
    cardEl: null
  };

  /* ---- render helpers ---- */

  /* ADR-086 P5 — split a display mode label ('⚡ Quick Drill · Mixed') into a leading emoji badge + a clean title,
     so the start screen can present them separately. A leading token with no ASCII letter/digit is treated as the icon;
     otherwise a mode-appropriate default is used. Presentation only — `mode` itself is never mutated. */
  function _startBadge() {
    var parts = String(mode).trim().split(/\s+/);
    if (parts.length > 1 && !/[a-z0-9]/i.test(parts[0])) {
      return { icon: parts[0], title: parts.slice(1).join(' ') };
    }
    return { icon: reviewMode ? '🔄' : diSet ? '📊' : '🎯', title: mode };
  }

  function _startTitleCase(s) { s = String(s || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  /* Read the persisted difficulty preference through whichever settings accessor is present (mirrors begin()'s
     guarded lookup). Adaptive sessions report 'Adaptive' since the level moves in-session. */
  function _startDifficulty() {
    if (adaptiveMode) return 'Adaptive';
    var s = {};
    try {
      if (typeof AppState !== 'undefined' && AppState.getSettings) s = AppState.getSettings() || {};
      else if (typeof loadSettings === 'function') s = loadSettings() || {};
      else s = JSON.parse(localStorage.getItem('quant_reflex_settings') || '{}');
    } catch (_) { s = {}; }
    return _startTitleCase(s.difficulty || 'medium');
  }

  function _fmtDurLabel(sec) {
    if (!sec || sec < 60) return Math.max(1, Math.round(sec || 0)) + 's';
    var m = sec / 60;
    return (m < 10 ? (Math.round(m * 10) / 10) : Math.round(m)) + ' min';
  }

  /* Honest estimate: a hard overall limit is the cap; a per-question limit bounds it; otherwise ~22s/question is a
     realistic typical pace (used only for a soft "≈" estimate, never a countdown). */
  function _estDurationSec() {
    if (timeLimit) return timeLimit;
    if (perQLimit) return count * perQLimit;
    return count * 22;
  }

  function _startStats() {
    var est = _estDurationSec();
    var timer;
    if (timeLimit) timer = { icon: '⏱', val: _fmtDurLabel(timeLimit), lbl: 'Total limit' };
    else if (perQLimit) timer = { icon: '⚡', val: perQLimit + 's', lbl: 'Per question' };
    else timer = { icon: '🕊️', val: 'Relaxed', lbl: 'No timer' };
    return [
      { icon: '📝', val: String(count), lbl: count === 1 ? 'Question' : 'Questions' },
      { icon: '⏳', val: (timeLimit ? '≤ ' : '≈ ') + _fmtDurLabel(est), lbl: 'Est. time' },
      { icon: '📊', val: _startDifficulty(), lbl: 'Difficulty' },
      timer
    ];
  }

  function _startContext() {
    if (reviewMode) return 'A focused pass over questions you\'ve missed before.';
    if (diSet) return 'One shared context · linked questions — read once, answer all.';
    if (topics && topics.length > 1) return 'Spanning ' + topics.length + ' topics for a mixed workout.';
    if (adaptiveMode) return 'Difficulty adapts to you as you go — stay sharp.';
    return 'Ranked on accuracy and speed. Answer at your own pace.';
  }

  function renderStart() {
    var badge = _startBadge();
    var stats = _startStats();
    var statHTML = stats.map(function (s) {
      return '<div class="drill-start-stat">' +
        '<span class="ds-ico" aria-hidden="true">' + s.icon + '</span>' +
        '<span class="ds-val">' + _escHtml(s.val) + '</span>' +
        '<span class="ds-lbl">' + _escHtml(s.lbl) + '</span>' +
      '</div>';
    }).join('');

    container.innerHTML =
      '<div class="card center-content drill-start">' +
        '<div class="drill-start-badge" aria-hidden="true">' + badge.icon + '</div>' +
        '<h2 class="drill-start-title">' + _escHtml(badge.title) + '</h2>' +
        '<p class="drill-start-sub">' + _escHtml(_startContext()) + '</p>' +
        '<div class="drill-start-stats">' + statHTML + '</div>' +
        '<button id="startBtn" class="btn-primary drill-start-cta">Begin Challenge</button>' +
        '<button id="startBackBtn" class="btn-secondary drill-start-back">← Back to Modes</button>' +
      '</div>';
    hideCustomNumpad();
    _exitDrillSession();
    container.querySelector('#startBtn').addEventListener('click', begin);
    container.querySelector('#startBackBtn').addEventListener('click', function () {
      cleanup();
      _exitDrillSession();
      if (typeof FirestoreSync !== 'undefined') {
        FirestoreSync.endDrillBatch();
      }
      if (onFinish) {
        onFinish('practice');
      } else {
        Router.showView('practice');
      }
    });
  }

  function _escHtml(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

  function _adaptiveDiffLabel(diff) {
    if (diff === 'hard') return '<span class="adaptive-mode-pill adaptive-pill-hard">Hard ▲</span>';
    if (diff === 'easy') return '<span class="adaptive-mode-pill adaptive-pill-easy">Easy ▼</span>';
    return '<span class="adaptive-mode-pill adaptive-pill-medium">Medium ●</span>';
  }

  /* DI Sets (ADR-078): the shared chart/caselet context is rendered ONCE in a persistent region; each question swaps
     only the stem/input/feedback below it. Fully isolated from the single-question path below (guarded in
     renderQuestion), and it REUSES the shared checkAnswer / nextQuestion / recordAnswer / numpad / results / exit — so
     scoring, feedback, analytics and exit behave identically. The dataset/chart live on `diSet` (cached, never
     regenerated mid-set). */
  function _renderSetQuestion() {
    answered = false;
    _nextReady = true;
    var q = questions[current];
    if (!_setShellBuilt) {
      var ctxHTML = (diSet.chart && typeof DICharts !== 'undefined')
        ? DICharts.render(diSet.chart)
        : (diSet.context ? '<div class="di-caselet-context">' + _escHtml(diSet.context) + '</div>' : '');
      container.innerHTML =
        '<button class="session-exit drill-exit-btn" id="drillExitBtn" aria-label="Exit session" title="Exit session">✕</button>' +
        '<button class="session-pause drill-pause-btn" id="drillPauseBtn" aria-label="Pause session" title="Pause">⏸</button>' +
        '<div class="card center-content fade-in question-card-transition">' +
          '<div class="drill-question-scroll">' +
            '<div class="di-set-context">' + ctxHTML + '</div>' +
            '<div id="diSetQHost"></div>' +
          '</div>' +
        '</div>' +
        '<div class="drill-actions"><button id="submitBtn" class="btn-primary">Submit</button></div>';
      _setShellBuilt = true;
      var _x = container.querySelector('#drillExitBtn');
      if (_x) _x.addEventListener('click', function () {
        function performExit() { cleanup(); _exitDrillSession(); if (typeof FirestoreSync !== 'undefined') FirestoreSync.endDrillBatch(); if (onFinish) onFinish('practice'); else Router.showView('practice'); }
        if (typeof showExitSessionDialog === 'function') showExitSessionDialog(performExit); else performExit();
      });
      /* ADR-091: sets are the LONGEST sessions and still time per-question stats — pause belongs
         here too. pauseSession() is mode-agnostic (freezes the qStart anchor sets rely on). */
      var _p = container.querySelector('#drillPauseBtn');
      if (_p) _p.addEventListener('click', function () { pauseSession(); });
    }
    var host = container.querySelector('#diSetQHost');
    var progressPct = count > 0 ? Math.min(100, Math.round((current / count) * 100)) : 0;
    /* a set question may be numeric (DI) OR multiple-choice (LR puzzle sets, ADR-079) — render the matching input */
    var isMCQ = !!(q.options && q.options.length);
    var setBadge = (diSet.category && String(diSet.category).indexOf('lr-') === 0) ? 'LR SET' : 'DI SET';
    host.innerHTML =
      '<p class="drill-progress">Question ' + (current + 1) + ' / ' + count + ' <span class="di-set-badge">' + setBadge + '</span></p>' +
      '<div class="drill-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + count + '" aria-valuenow="' + (current + 1) + '" aria-label="Question ' + (current + 1) + ' of ' + count + '"><div class="drill-progress-fill" style="width:' + progressPct + '%"></div></div>' +
      /* set stems sit under a shared chart/caselet — they are instructions, never headlines (ADR-093) */
      '<h2 class="question-text question-text-compact">' + _escHtml(q.question) + '</h2>' +
      (isMCQ
        ? '<div id="mcqOptions" class="mcq-options" role="group" aria-label="Answer options">' +
            q.options.map(function (o) { var s = _escHtml(String(o)); var len = String(o).length; var wide = len > 14 ? (len > 48 ? ' mcq-wide mcq-para' : ' mcq-wide') : ''; return '<button class="mcq-option' + wide + '" type="button" data-opt="' + s.replace(/"/g, '&quot;') + '">' + s + '</button>'; }).join('') +
          '</div>'
        : '<input id="answerInput" class="input" type="text" inputmode="none" autocomplete="off" placeholder="Your answer" maxlength="15" readonly />') +
      '<div id="feedback" class="feedback" aria-live="polite"></div>';
    /* fresh actions each question (checkAnswer mutates them into Next / disables skip). */
    var actions = container.querySelector('.drill-actions');
    actions.className = 'drill-actions';
    actions.innerHTML = '<button id="submitBtn" class="btn-primary">Submit</button>';
    ui.globalTimerEl = null; ui.perQTimerEl = null;
    ui.answerInputEl = host.querySelector('#answerInput');
    ui.submitBtnEl = container.querySelector('#submitBtn');
    ui.feedbackEl = host.querySelector('#feedback');
    ui.cardEl = container.querySelector('.card');
    var submitBtn = ui.submitBtnEl;
    if (isMCQ) {
      /* tap-to-answer (no numpad, no Submit) — same as the single-question LR path */
      if (typeof hideCustomNumpad === 'function') hideCustomNumpad();
      if (submitBtn) submitBtn.style.display = 'none';
      var _mh = host.querySelector('#mcqOptions'), _os = _mh ? _mh.querySelectorAll('.mcq-option') : [];
      for (var _oi = 0; _oi < _os.length; _oi++) {
        _os[_oi].addEventListener('click', function () { if (answered) return; this.classList.add('selected'); checkAnswer(this.getAttribute('data-opt')); });
      }
    } else {
      var input = ui.answerInputEl;
      var submit = function () { if (answered) return; if (!input.value.trim()) return; checkAnswer(input.value.trim()); }; /* sets never run in duels — empty submits ignored (ADR-091 review) */
      submitBtn.addEventListener('click', submit);
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    }
    var _sk = typeof loadSettings === 'function' ? loadSettings() : {};
    var _ska = (typeof canAccessFeature === 'function') ? canAccessFeature('skip_question') : true;
    if (_ska && _sk.skipEnabled && _sk.difficulty !== 'hard') {
      var skipBtn = document.createElement('button'); skipBtn.className = 'btn skip-btn'; skipBtn.textContent = 'Skip →';
      skipBtn.addEventListener('click', function () { if (answered) return; answered = true; recordAnswer(false, q.category, q, null); nextQuestion(); });
      actions.classList.add('has-skip'); actions.insertBefore(skipBtn, submitBtn);
    }
    qStart = performance.now();
    if (!isMCQ && typeof showCustomNumpad === 'function') showCustomNumpad(ui.answerInputEl, function () { if (!answered) checkAnswer(ui.answerInputEl.value.trim()); }, _numpadOptsFor(q));
  }

  /* Adaptive-keypad options for a question, from the shared answer-format registry (ADR-086): the exact keys its
     answer can contain + the invalid-sequence guard. Undefined (→ legacy keypad) if the registry is unavailable. */
  function _numpadOptsFor(q) {
    try {
      if (typeof QRAnswerFormat !== 'undefined' && QRAnswerFormat.answerFormat) {
        var f = QRAnswerFormat.answerFormat(q);
        if (f && f.kind === 'numeric') return { keys: f.keys, validate: f.validateKeystroke };
      }
    } catch (e) {}
    return undefined;
  }

  /* ── Teaching-panel helpers (ADR-086 P4) ── */
  /* Split an explanation string into readable steps on the authored separators (→ ; and newlines) — never on '. '
     so decimals/abbreviations stay intact. Returns [] when there's nothing to show. */
  function _explainSteps(text) {
    if (!text) return [];
    var parts = String(text).trim().split(/\s*→\s*|\s*;\s+|\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
    return parts.length ? parts : [String(text).trim()];
  }
  /* drill category → the Learn chapter that teaches it (memoised scan of the registry). */
  var _drillTopicCache = null;
  function _learnTopicForDrill(cat) {
    if (!cat) return null;
    try {
      if (typeof KnowledgeBase === 'undefined' || !KnowledgeBase.all) return null;
      if (!_drillTopicCache) {
        _drillTopicCache = {};
        KnowledgeBase.all().forEach(function (t) { if (t.drillCategory && !_drillTopicCache[t.drillCategory]) _drillTopicCache[t.drillCategory] = { id: t.id, title: t.title }; });
      }
      return _drillTopicCache[cat] || null;
    } catch (e) { return null; }
  }
  /* A subtle "Review <chapter> →" link that cleanly exits the session into the Learn chapter (deliberate study action). */
  function _buildConceptLink(topic) {
    var a = document.createElement('button');
    a.type = 'button';
    a.className = 'drill-teach-concept';
    a.textContent = '📖 Review ' + topic.title;
    a.addEventListener('click', function () {
      try { cleanup(); } catch (_) {}
      try { _exitDrillSession(); } catch (_) {}
      try { if (typeof FirestoreSync !== 'undefined' && FirestoreSync.endDrillBatch) FirestoreSync.endDrillBatch(); } catch (_) {}
      try { if (typeof Router !== 'undefined' && Router.showView) Router.showView('learn', { path: topic.id }); } catch (_) {}
    });
    return a;
  }
  /* The "Why" block: formatted explanation steps (+ optional concept link). */
  function _buildWhy(steps, topic) {
    var wrap = document.createElement('div');
    wrap.className = 'drill-teach-why';
    var head = document.createElement('div');
    head.className = 'drill-teach-why-head';
    head.textContent = 'Why';
    wrap.appendChild(head);
    var list = document.createElement('div');
    list.className = 'drill-teach-steps';
    steps.forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'drill-teach-step';
      row.textContent = s;
      list.appendChild(row);
    });
    wrap.appendChild(list);
    if (topic) wrap.appendChild(_buildConceptLink(topic));
    return wrap;
  }
  /* Rule-based auto-tip element (premium / explain-credits / paywall-lock preserved) — used only when a question ships
     no written explanation. Returns an element (or null if nothing to show). */
  function _buildAutoTip(q) {
    var el = document.createElement('div');
    var _isPremium = (typeof canAccessFeature === 'function') ? canAccessFeature('adaptive_training') : false;
    if (_isPremium) {
      el.className = 'auto-explain-tip'; el.textContent = _getAutoTip(q.category, q.subtype);
    } else {
      var _credits = _getExplainCredits();
      if (_credits > 0) {
        _decrementExplainCredits();
        el.className = 'auto-explain-tip'; el.textContent = _getAutoTip(q.category, q.subtype);
      } else {
        el.className = 'auto-explain-tip auto-explain-locked';
        el.innerHTML = '🔒 <a class="auto-explain-unlock" href="#">Unlock unlimited explanations</a>';
        var _lockLink = el.querySelector('.auto-explain-unlock');
        if (_lockLink) _lockLink.addEventListener('click', function (e) { e.preventDefault(); if (typeof showPaywall === 'function') showPaywall('ai_explain'); });
      }
    }
    return el;
  }

  function renderQuestion() {
    if (diSet) { _renderSetQuestion(); return; }
    answered = false;
    _nextReady = true; /* reset debounce for each new question */
    var q = questions[current];
    var isMCQ = !!(q.options && q.options.length);   /* LR (ADR-075): a question may be multiple-choice */
    /* Use original count for progress display in review mode to avoid
       confusing jumps when wrong answers add questions to the queue.
       If current question exceeds original count (re-queued mistakes),
       show actual count instead. */
    var displayCount = reviewMode && reviewOriginalCount > 0
      ? (current >= reviewOriginalCount ? count : reviewOriginalCount)
      : count;
    var progressPct = displayCount > 0 ? Math.min(100, Math.round(((current) / displayCount) * 100)) : 0;
    var adaptivePill = adaptiveMode ? _adaptiveDiffLabel(_adaptiveDifficulty) : '';
    container.innerHTML =
      (isDuel ? duelHeaderHTML : '') +
      (!isDuel ? '<button class="session-exit drill-exit-btn" id="drillExitBtn" aria-label="Exit session" title="Exit session">✕</button>' : '') +
      (!isDuel ? '<button class="session-pause drill-pause-btn" id="drillPauseBtn" aria-label="Pause session" title="Pause">⏸</button>' : '') +
      '<div class="card center-content fade-in question-card-transition' + (isMCQ ? ' drill-has-mcq' : '') + '">' +
        '<div class="drill-question-scroll">' +
          '<p class="drill-progress">Question ' + (current + 1) + ' / ' + displayCount + (adaptivePill ? ' ' + adaptivePill : '') + '</p>' +
          '<div class="drill-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + displayCount + '" aria-valuenow="' + (current + 1) + '" aria-label="Question ' + (current + 1) + ' of ' + displayCount + '"><div class="drill-progress-fill" style="width:' + progressPct + '%"></div></div>' +
          (timeLimit ? '<p id="globalTimer" class="timer"></p>' : '') +
          (perQLimit ? '<p id="perQTimer" class="timer"></p>' : '') +
          /* DI (ADR-074): a question may carry a `chart` spec rendered ABOVE the stem. Reuses the same engine,
             numpad, grading + feedback as Quant — the only DI-specific surface is this one chart block. */
          (q.chart && typeof DICharts !== 'undefined' ? DICharts.render(q.chart) : '') +
          /* Visual LR (ADR-079/093): a generated figure rendered on a framed stage ABOVE the stem — the figure,
             not the instruction, is the hero of a visual question. */
          (q.figure && typeof LRFigures !== 'undefined' ? '<div class="q-figure-stage">' + LRFigures.render(q.figure) + '</div>' : '') +
          /* ADR-093: visual/long questions read as an instruction, not a headline — the display size is for
             short math expressions ("24 × 18"); anything carrying a chart/figure or a real sentence goes compact. */
          '<h2 class="question-text' + ((q.chart || q.figure || q.optionFigures || String(q.question).length > 90) ? ' question-text-compact' : '') + '">' + _escHtml(q.question) + '</h2>' +
          /* LR (ADR-075): multiple-choice questions render option buttons instead of the numeric input; everything
             else (grading, feedback, recordAnswer, Next) is reused. Quant/DI stay on the numpad path unchanged.
             Visual LR (ADR-079/093): when the choices are pictures, each button renders its figure with an A–D
             badge (the token in data-opt is still what the grader compares). */
          (isMCQ
            ? '<div id="mcqOptions" class="mcq-options' + (q.optionFigures ? ' mcq-options-figures' : '') + '" role="group" aria-label="Answer options">' +
                q.options.map(function (o, _i) {
                  var s = _escHtml(String(o));
                  var hasFig = q.optionFigures && q.optionFigures[_i] && typeof LRFigures !== 'undefined';
                  if (hasFig) {
                    var letter = String.fromCharCode(65 + _i);
                    var alab = 'Option ' + letter + ': ' + LRFigures.describe(q.optionFigures[_i]);
                    return '<button class="mcq-option mcq-figure-option" type="button" data-opt="' + s.replace(/"/g, '&quot;') + '" aria-label="' + _escHtml(alab).replace(/"/g, '&quot;') + '">' +
                      '<span class="mcq-opt-letter" aria-hidden="true">' + letter + '</span>' + LRFigures.render(q.optionFigures[_i]) + '</button>';
                  }
                  var len = String(o).length;
                  var cls = 'mcq-option' + (len > 14 ? (len > 48 ? ' mcq-wide mcq-para' : ' mcq-wide') : '');
                  return '<button class="' + cls + '" type="button" data-opt="' + s.replace(/"/g, '&quot;') + '" aria-label="Option ' + s.replace(/"/g, '&quot;') + '">' + s + '</button>';
                }).join('') +
              '</div>'
            : '<input id="answerInput" class="input" type="text" inputmode="none" autocomplete="off" placeholder="Your answer" maxlength="15" readonly />'
          ) +
          '<div id="feedback" class="feedback" aria-live="polite"></div>' +
        '</div>' +
      '</div>' +
      '<div class="drill-actions">' +
        '<button id="submitBtn" class="btn-primary">Submit</button>' +
      '</div>';
    ui.globalTimerEl = container.querySelector('#globalTimer');
    ui.perQTimerEl = container.querySelector('#perQTimer');
    /* Paint the running global countdown immediately (it's started once in _beginBuild, before this element exists,
       so without this it would read blank for the first second of the session). */
    if (ui.globalTimerEl && _globalRemaining != null) ui.globalTimerEl.textContent = '⏱ ' + _globalRemaining + 's';
    ui.answerInputEl = container.querySelector('#answerInput');
    ui.submitBtnEl = container.querySelector('#submitBtn');
    ui.feedbackEl = container.querySelector('#feedback');
    ui.cardEl = container.querySelector('.card');

    /* Exit button handler (NON-duel only — the button is rendered only when !isDuel; the duel's Submit & Leave
       lives in the manager-controlled duel header). Guarded so the absent button in duel mode can't throw. Uses
       the custom in-app dialog because native confirm() can end sessions prematurely. */
    var _drillExitBtn = container.querySelector('#drillExitBtn');
    if (_drillExitBtn) {
      _drillExitBtn.addEventListener('click', function () {
        function performExit() {
          cleanup();
          _exitDrillSession();
          /* End Firestore batch that was started in begin() */
          if (typeof FirestoreSync !== 'undefined') {
            FirestoreSync.endDrillBatch();
          }
          if (onFinish) {
            onFinish('practice');
          } else {
            Router.showView('practice');
          }
        }

        if (typeof showExitSessionDialog === 'function') {
          showExitSessionDialog(performExit);
        } else {
          console.error('[DrillEngine] showExitSessionDialog missing. Exiting automatically.');
          performExit();
        }
      });
    }

    /* Pause button (ADR-086 P7) — freezes timers + shows the resume overlay. Guarded so its absence can't throw. */
    var _drillPauseBtn = container.querySelector('#drillPauseBtn');
    if (_drillPauseBtn) {
      _drillPauseBtn.addEventListener('click', function () { pauseSession(); });
    }

    var input = ui.answerInputEl;
    var submitBtn = ui.submitBtnEl;
    /* NOTE: input.focus() intentionally removed here —
       it triggers the native keyboard on mobile, fighting with our custom numpad.
       The input is readonly and receives input from the custom numpad buttons. */

    function submit() {
      if (answered) return;
      /* Practice: ignore empty submissions (ADR-091 review) — a stray Submit tap must never burn
         the question with a failure verdict + sound; deliberate give-up paths are Skip or the
         timer. Duels keep empty submits: locking in blank is a legitimate "move on" play there. */
      if (!isDuel && !input.value.trim()) return;
      if (isDuel) captureDuelAnswer(input.value.trim());   /* capture-only: no client grading (ADR-033) */
      else checkAnswer(input.value.trim());
    }
    if (!isMCQ) {
      submitBtn.addEventListener('click', submit);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
      });
    }

    /* Skip button (same `.btn.skip-btn` styling either way — true reuse).
       Duel: ALWAYS available (a skip = blank wrong answer that advances) via the capture-only path.
       Practice: gated on the skip setting + difficulty. */
    if (isDuel) {
      if (duelAllowSkip) {   /* default OFF — only when the host enabled "Allow Skip Questions" */
        var dSkipBtn = document.createElement('button');
        dSkipBtn.className = 'btn skip-btn';
        dSkipBtn.textContent = 'Skip →';
        dSkipBtn.addEventListener('click', function () { if (!answered) captureDuelAnswer(''); });
        var dActionsDiv = container.querySelector('.drill-actions');
        if (dActionsDiv) { dActionsDiv.classList.add('has-skip'); dActionsDiv.insertBefore(dSkipBtn, submitBtn); }
      }
    } else {
      var _skipSettings = typeof loadSettings === 'function' ? loadSettings() : {};
      var _skipFeatureAccess = (typeof canAccessFeature === 'function') ? canAccessFeature('skip_question') : true;
      if (_skipFeatureAccess && _skipSettings.skipEnabled && _skipSettings.difficulty !== 'hard') {
        var skipBtn = document.createElement('button');
        skipBtn.className = 'btn skip-btn';
        skipBtn.textContent = 'Skip →';
        skipBtn.addEventListener('click', function () {
          if (answered) return;
          answered = true;
          if (perQTimer) { clearInterval(perQTimer); perQTimer = null; }
          /* Skip: pass null (not 0) so the response-time is EXCLUDED from speed (a skip is not a 0-second
             solve — recording 0 deflated the coaching North-Star avgSpeed). progress.js's typeof-number
             guard drops null. ADR-027/028. */
          recordAnswer(false, q.category, q, null);
          nextQuestion();
        });
        var actionsDiv = container.querySelector('.drill-actions');
        if (actionsDiv) {
          actionsDiv.classList.add('has-skip');
          actionsDiv.insertBefore(skipBtn, submitBtn);
        }
      }
    }

    qStart = performance.now();

    if (isMCQ) {
      /* LR (ADR-075): answer via option buttons — suppress the numpad and hide Submit (a tap IS the submit). */
      if (typeof hideCustomNumpad === 'function') hideCustomNumpad();
      if (ui.submitBtnEl) ui.submitBtnEl.style.display = 'none';
      var _mcqHost = container.querySelector('#mcqOptions');
      var _opts = _mcqHost ? _mcqHost.querySelectorAll('.mcq-option') : [];
      for (var _oi = 0; _oi < _opts.length; _oi++) {
        _opts[_oi].addEventListener('click', function () {
          if (answered) return;
          this.classList.add('selected');
          var _v = this.getAttribute('data-opt');
          if (isDuel) captureDuelAnswer(_v); else checkAnswer(_v);
        });
      }
    } else {
      /* Show custom numpad (the SAME component as Practice — true reuse, ADR-033), adapted to THIS answer's format
         (ADR-086): only the keys this question's answer can contain, with invalid-sequence guarding. */
      showCustomNumpad(input, function() { submit(); }, _numpadOptsFor(q));
    }

    /* Per-question timer */
    if (perQLimit) {
      startPerQTimer();
    }

    /* Duel: let the manager (re)inject the live opponent presence chip + bind the header Exit, after each
       render (the engine re-renders the whole container per question). */
    if (isDuel && typeof onDuelRender === 'function') {
      try { onDuelRender(container, current, count); } catch (_) {}
    }
  }

  /**
   * Grade the submitted answer and render the feedback state.
   * @param {string} raw - the submitted answer ('' on timer expiry)
   * @param {object} [opts] - { timedOut: true } when the per-question timer expired: a pacing
   *   failure, not a knowledge failure — same grading/stats, but a distinct calm verdict
   *   ("Time's up", amber) with no failure sound.
   */
  function checkAnswer(raw, opts) {
    if (answered || _isFinished) return; /* prevent double-counting or post-finish race */
    answered = true;
    var timedOut = !!(opts && opts.timedOut);

    if (perQTimer) { clearInterval(perQTimer); perQTimer = null; }

    var elapsed = ((performance.now() - qStart) / 1000);
    var elapsedRounded = parseFloat(elapsed.toFixed(1));
    perQuestionTimes.push(elapsedRounded);

    var q = questions[current];
    var expected = String(q.answer);

    /* Normalize both values for comparison via the shared answer-format registry (ADR-086 — one source of truth for
       keyboard, grader and coverage checks): strip whitespace, then numeric-equivalence ("57.0" == "57") with a small
       rounding tolerance = max(0.01, 0.1% of |expected|) so 1–2-dp approximations are accepted. Guarded fallback keeps
       grading working even if the registry global is unavailable. */
    var _normalize = (typeof QRAnswerFormat !== 'undefined' && QRAnswerFormat.normalize)
      ? QRAnswerFormat.normalize
      : function (s) { return String(s == null ? '' : s).replace(/\s+/g, ''); };
    var normalizedRaw = _normalize(raw);
    var normalizedExpected = _normalize(expected);
    var correct = false;

    if (normalizedRaw === normalizedExpected) {
      correct = true;
    } else if (normalizedRaw !== '' && !isNaN(normalizedRaw) && !isNaN(normalizedExpected)) {
      var rawNum = parseFloat(normalizedRaw);
      var expNum = parseFloat(normalizedExpected);
      if (rawNum === expNum) {
        correct = true;
      } else {
        /* Tolerance: allow rounding differences up to 0.01 for decimal answers */
        var tolerance = Math.abs(expNum) > 0 ? Math.max(0.01, Math.abs(expNum) * 0.001) : 0.01;
        if (Math.abs(rawNum - expNum) <= tolerance) {
          correct = true;
        }
      }
    }

    /* LR MCQ (ADR-075): reveal the correct option + mark the wrong pick, lock further taps. */
    var _mcqHost = container.querySelector('#mcqOptions');
    if (_mcqHost) {
      var _o = _mcqHost.querySelectorAll('.mcq-option');
      for (var _k = 0; _k < _o.length; _k++) {
        _o[_k].disabled = true;
        var _ov = _o[_k].getAttribute('data-opt');
        if (_ov === expected) _o[_k].classList.add('mcq-correct');
        else if (_o[_k].classList.contains('selected')) _o[_k].classList.add('mcq-wrong');
      }
    }

    /* Track for adaptive controller */
    if (adaptiveMode && !isDuel) {
      _adaptiveHistory.push({ correct: correct, timeSec: elapsedRounded });
    }

    if (correct) {
      score++;
      currentSessionStreak++;
      if (currentSessionStreak > bestSessionStreak) bestSessionStreak = currentSessionStreak;
    } else {
      currentSessionStreak = 0;
      /* Track wrong-answer categories for post-session insight */
      var _wCat = q.category || 'unknown';
      sessionWrongCategories[_wCat] = (sessionWrongCategories[_wCat] || 0) + 1;
      /* Keep the full question object (chart/figure specs included) so the results card can offer an
         immediate in-memory replay — no persistence, free for everyone (session-scoped only). */
      if (!isDuel) sessionWrongQuestions.push(q);
      /* In review mode, re-queue incorrect questions at the end so users
         cycle through remaining mistakes before seeing the same one again.
         Only re-queue if this exact question isn't already waiting in the
         remaining queue, to prevent duplicates. Cap at 2x original count. */
      if (reviewMode && count < reviewOriginalCount * 2) {
        var isDuplicate = false;
        for (var ri = current + 1; ri < questions.length; ri++) {
          if (questions[ri].question === q.question && String(questions[ri].answer) === String(q.answer)) {
            isDuplicate = true;
            break;
          }
        }
        if (!isDuplicate) {
          questions.push({ question: q.question, answer: q.answer, category: q.category, subtype: q.subtype });
          count++;
        }
      }
    }

    /* ADR-086 P6: per-category session tally (correct/total) → the results dashboard derives strongest & weakest
       topic from this. Every answered question counts (right or wrong), keyed by the same category used for analytics. */
    var _statCat = q.category || 'unknown';
    var _cStat = sessionCategoryStats[_statCat] || (sessionCategoryStats[_statCat] = { correct: 0, total: 0 });
    _cStat.total++;
    if (correct) _cStat.correct++;

    /* Record answer with response time and question data for mistake tracking. (Duel never reaches checkAnswer — it
       routes through captureDuelAnswer for capture-only submission — so the old duel arm here was unreachable dead
       code with a mismatched signature; removed in ADR-088.) */
    if (!isDuel) {
      recordAnswer(correct, q.category, q, elapsedRounded);
    }

    /* Haptic/sound feedback — reinforcement favors success: a bright chime on correct, and the
       failure sound only on a genuine wrong submission (a timeout gets a single soft pulse). */
    if (correct) {
      SoundEngine.play('correctAnswer');
      if (typeof triggerHaptic === 'function') triggerHaptic(50);
    } else if (timedOut) {
      if (typeof triggerHaptic === 'function') triggerHaptic(40);
    } else {
      SoundEngine.play('wrongAnswer');
      if (typeof triggerHaptic === 'function') triggerHaptic([40, 30, 40]);
    }

    var feedback = ui.feedbackEl;
    /* ADR-086 P4 — the answer state teaches, not just informs. Correct → a crisp verdict + (if shipped) the "Why".
       Wrong → a structured teaching panel: verdict · correct-answer chip · Why (formatted explanation steps + a Learn
       concept link) OR the rule-based auto-tip (premium/credits/paywall preserved) when no written explanation. */
    var _steps = _explainSteps(q.explanation);
    var _topic = _learnTopicForDrill(q.category);

    if (correct) {
      feedback.className = 'feedback correct feedback-anim';
      feedback.innerHTML = '';
      var okHead = document.createElement('div');
      okHead.className = 'drill-verdict drill-verdict-ok';
      okHead.textContent = '✓ Correct';
      /* Quiet momentum acknowledgment: from 3-in-a-row the verdict carries the run. No confetti —
         a serious trainer notices your rhythm without performing for you. */
      if (currentSessionStreak >= 3 && !isDuel) {
        var streakChip = document.createElement('span');
        streakChip.className = 'drill-streak-chip';
        streakChip.textContent = '🔥 ' + currentSessionStreak + ' in a row';
        okHead.appendChild(streakChip);
      }
      feedback.appendChild(okHead);
      if (_steps.length) feedback.appendChild(_buildWhy(_steps, null));   /* teach the method; no concept-link on a win */
    } else {
      feedback.className = 'feedback wrong wrong-answer-card feedback-anim';
      feedback.innerHTML = '';
      var teach = document.createElement('div');
      teach.className = 'drill-teach';
      var head = document.createElement('div');
      head.className = 'drill-verdict drill-verdict-wrong' + (timedOut ? ' drill-verdict-timeout' : '');
      head.textContent = timedOut ? '⏱ Time’s up' : 'Not quite';
      teach.appendChild(head);
      var ansRow = document.createElement('div');
      ansRow.className = 'drill-teach-answer';
      var ansLbl = document.createElement('span');
      ansLbl.className = 'drill-teach-answer-lbl';
      ansLbl.textContent = 'Correct answer';
      var ansVal = document.createElement('span');
      ansVal.className = 'drill-teach-answer-val';
      /* picture options grade by position token ("1".."4") — surface the exam-style letter instead (ADR-093) */
      ansVal.textContent = (q.optionFigures && /^[1-9]$/.test(String(expected))) ? 'Option ' + String.fromCharCode(64 + parseInt(expected, 10)) : expected;
      ansRow.appendChild(ansLbl); ansRow.appendChild(ansVal);
      teach.appendChild(ansRow);
      if (_steps.length) {
        teach.appendChild(_buildWhy(_steps, _topic));
      } else {
        teach.appendChild(_buildAutoTip(q));
        if (_topic) teach.appendChild(_buildConceptLink(_topic));
      }
      feedback.appendChild(teach);
      /* No card shake: the sound + red teaching panel already carry the verdict. Shake + sound +
         red was triple punishment — and anxiety, not information (removed with ADR-091). */
    }

    /* The learning moment gets the screen: once answered, the keypad is dead weight, so it slides
       away and the existing MCQ layout rules give the card + explanation the full height. Kept
       visible during Reflex auto-advance (600ms) to avoid a slide-down/up bounce at pace;
       nextQuestion()'s re-render restores it. */
    if (!(autoAdvance && correct)) hideCustomNumpad();

    if (typeof AIFeatures !== 'undefined' && (!correct || reviewMode)) {
      var explainBtn = document.createElement('button');
      explainBtn.className = 'drill-explain-btn';
      var _canExplain = (typeof canAccessFeature === 'function') ? canAccessFeature('ai_explain') : true;
      explainBtn.textContent = _canExplain ? '🧠 Explain' : '🧠 Explain 🔒';
      explainBtn.addEventListener('click', function () {
        if (typeof canAccessFeature === 'function' && !canAccessFeature('ai_explain')) {
          if (typeof showPaywall === 'function') showPaywall('ai_explain');
          return;
        }
        /* DI (ADR-074): the chart pixels aren't sent to the AI, so prepend a compact text summary of the data to
           the question — the explanation is then grounded in the actual numbers, not just "the chart above". */
        var _explainQ = (q.aiContext ? q.aiContext + ' ' : '') + q.question;
        try { if (q.chart && typeof DICharts !== 'undefined' && DICharts.describe) { var _d = DICharts.describe(q.chart); if (_d) _explainQ = _d + ' ' + q.question; } } catch (_) {}
        try { if (q.figure && typeof LRFigures !== 'undefined' && LRFigures.describe) { var _df = LRFigures.describe(q.figure); if (_df) _explainQ = 'Figure: ' + _df + '. ' + q.question; } } catch (_) {}
        /* picture options (ADR-093): describe each lettered option too, so the AI can reason about the choices
           (odd-figure-out has no prompt figure at all — the options ARE the question). */
        try {
          if (q.optionFigures && typeof LRFigures !== 'undefined' && LRFigures.describe) {
            var _opts = q.optionFigures.map(function (f, i) { return String.fromCharCode(65 + i) + ') ' + LRFigures.describe(f); }).join('; ');
            if (_opts) _explainQ += ' Options: ' + _opts + '.';
          }
        } catch (_) {}
        AIFeatures.showExplanationModal(_explainQ, expected, q.category);
      });
      feedback.parentNode.insertBefore(explainBtn, feedback.nextSibling);
    }

    var actionsDiv = container.querySelector('.drill-actions');
    if (actionsDiv) {
      var existingSkip = actionsDiv.querySelector('.skip-btn');
      if (existingSkip) {
        if (correct) {
          existingSkip.parentNode.removeChild(existingSkip);
          actionsDiv.classList.remove('has-skip');
        } else {
          existingSkip.disabled = true;
          existingSkip.classList.add('skip-btn-disabled');
        }
      }
    }

    /* Replace submit with next */
    var submitBtn = ui.submitBtnEl;
    submitBtn.style.display = '';   /* MCQ hid it pre-answer; reveal it now as the Next button (no-op for numeric) */
    submitBtn.textContent = current + 1 < count ? 'Next →' : 'View Results';
    /* Block next-question for 350ms to prevent carry-over numpad taps */
    _nextReady = false;
    _nextGuardTimer = setTimeout(function () {
      _nextReady = true;
      /* Pulse the Next button after the guard clears to draw attention */
      submitBtn.classList.add('next-btn-pulse');
      setTimeout(function () { submitBtn.classList.remove('next-btn-pulse'); }, 600);
    }, 350);

    /* Auto-advance logic for quick reflex modes */
    if (!isDuel && autoAdvance && correct) {
      _nextReady = false;
      _autoAdvanceTimer = setTimeout(nextQuestion, 600);
    }
    
    submitBtn.onclick = function () {
      if (!_nextReady) return; /* guard against carry-over taps */
      nextQuestion();
    };

    /* Focus next button for keyboard navigation */
    submitBtn.focus();

    /* MCQ (ADR-075) has no #answerInput — guard the disable so it doesn't throw on every option answer. */
    if (ui.answerInputEl) ui.answerInputEl.disabled = true;

    /* Correct-answer micro-interaction: flash card green */
    if (correct) {
      var card = ui.cardEl;
      if (card) {
        card.classList.add('correct-flash');
        setTimeout(function () { if (card) card.classList.remove('correct-flash'); }, 450);
      }
    }
  }

  /* Duel capture-only answer (ADR-033): server-authoritative + hidden-until-results. The client has NO answer
     key, so there is NO grading, NO correct/wrong feedback, NO running score, NO answer reveal. We capture the
     raw input + elapsed ms, hand it to the duel manager (which persists it to the player's OWN doc — the server
     grades at finalize), then advance with the SAME animated transition Practice uses. */
  function captureDuelAnswer(raw) {
    if (answered || _isFinished) return;
    answered = true;
    if (perQTimer) { clearInterval(perQTimer); perQTimer = null; }
    var elapsed = (performance.now() - qStart) / 1000;
    var elapsedRounded = parseFloat(elapsed.toFixed(1));
    perQuestionTimes.push(elapsedRounded);
    var q = questions[current];
    if (typeof onDuelAnswerSubmit === 'function') {
      try { onDuelAnswerSubmit(raw, Math.round(elapsed * 1000), current, q); } catch (_) {}
    }
    nextQuestion();
  }

  function nextQuestion() {
    /* Guard against carry-over taps during transition debounce */
    if (!_nextReady) return;
    _nextReady = false; /* Immediately lock to prevent double-advance */
    /* Cancel any pending post-answer transition timers (ADR-087 D1): in Reflex mode the 350ms next-guard re-enables
       the Next button while the 600ms auto-advance is still pending, so a manual tap in that window would advance and
       then the timer would advance AGAIN — silently skipping a question. Clearing both here makes advance idempotent. */
    if (_autoAdvanceTimer) { clearTimeout(_autoAdvanceTimer); _autoAdvanceTimer = null; }
    if (_nextGuardTimer) { clearTimeout(_nextGuardTimer); _nextGuardTimer = null; }
    current++;
    if (current < count) {
      /* Adaptive: recompute difficulty and generate a fresh question for next slot */
      if (adaptiveMode && !preloadedQuestions && !reviewMode) {
        var newDiff = _computeAdaptiveDifficulty();
        _setAdaptiveOverride(newDiff);
        var nextCat = category;
        if (!nextCat && topics && topics.length) {
          nextCat = topics[current % topics.length];
        }
        var fresh = generateQuestions(1, nextCat || null);
        if (fresh && fresh.length > 0) questions[current] = fresh[0];
        _clearAdaptiveOverride();
      }
      renderQuestion();
    } else {
      if (adaptiveMode) _clearAdaptiveOverride();
      finish();
    }
  }

  /* ---- Scoring, share, and insight — delegated to extracted services ---- */
  /* See js/services/scoring-service.js and js/services/share-service.js */

  function _computeSpeedScore(accNum, avgTimeSec) {
    return ScoringService.computeSpeedScore(accNum, avgTimeSec);
  }

  /* Session Improvement (ADR-030): first-half vs last-half mean solve time within ONE session.
     Returns null for <6 timed answers (halves too small to be meaningful). For odd N the middle
     answer is dropped so the two halves are equal-sized. improvementPct > 0 ⟺ the student sped up. */
  function _computeSessionImprovement(times) {
    if (!Array.isArray(times) || times.length < 6) return null;
    var n = times.length;
    var half = Math.floor(n / 2);
    var first = times.slice(0, half);
    var second = times.slice(n - half); // last `half` items; for odd n this skips the middle
    var mean = function (arr) { return arr.reduce(function (a, b) { return a + b; }, 0) / arr.length; };
    var firstHalfAvg = parseFloat(mean(first).toFixed(2));
    var secondHalfAvg = parseFloat(mean(second).toFixed(2));
    if (!(firstHalfAvg > 0)) return null; // guard divide-by-zero / degenerate timing
    var improvementPct = parseFloat((((firstHalfAvg - secondHalfAvg) / firstHalfAvg) * 100).toFixed(1));
    return { firstHalfAvg: firstHalfAvg, secondHalfAvg: secondHalfAvg, improvementPct: improvementPct };
  }

  var _SESSIONS_COUNT_KEY = ScoringService.SESSIONS_COUNT_KEY;

  function _getSpeedScoreClass(score) {
    return ScoringService.getSpeedScoreClass(score);
  }

  function _loadBestScores() {
    return ScoringService.loadBestScores();
  }

  function _saveBestScores(obj) {
    ScoringService.saveBestScores(obj);
  }

  function _getExplainCredits() {
    return ScoringService.getExplainCredits();
  }

  function _decrementExplainCredits() {
    ScoringService.decrementExplainCredits();
  }

  function _getAutoTip(cat, subtype) {
    return ScoringService.getAutoTip(cat, subtype);
  }

  function _shareAsImage(shareData) {
    ShareService.shareAsImage(shareData);
  }

  function _computeSessionInsight(accNum, wrongCats) {
    return ScoringService.computeSessionInsight(accNum, wrongCats);
  }

  /* Exit cleanly into a Learn chapter (deliberate study action after a session). Mirrors _buildConceptLink's teardown. */
  function _continueLearning(topic) {
    try { cleanup(); } catch (_) {}
    try { _exitDrillSession(); } catch (_) {}
    try { if (typeof FirestoreSync !== 'undefined' && FirestoreSync.endDrillBatch) FirestoreSync.endDrillBatch(); } catch (_) {}
    try {
      if (typeof Router !== 'undefined' && Router.showView) {
        if (topic && topic.id) Router.showView('learn', { path: topic.id });
        else Router.showView('learn');
      }
    } catch (_) {}
  }

  function finish() {
    if (_isFinished) return; /* ADR-087: idempotent — guards a global-timer-expiry vs last-question race re-running recording/results */
    _isFinished = true;
    cleanup();
    _exitDrillSession();
    if (adaptiveMode) _clearAdaptiveOverride();
    SoundEngine.play('drillEnd');
    /* Haptic feedback on drill completion */
    if (typeof triggerHaptic === 'function') triggerHaptic([50, 50, 100]);

    /* Record session type */
    if (!isDuel) {
      if (timeLimit) {
        recordTimedTestSession();
      } else {
        recordDrillSession();
      }
    }

    /* End Firestore write batching — flush all queued updates */
    if (typeof FirestoreSync !== 'undefined' && !isDuel) {
      FirestoreSync.endDrillBatch();
    }
    
    if (isDuel) {
      if (onFinish) onFinish('duel_ended');
      return; /* Duel UI takes over from here */
    }

    var totalTime = ((performance.now() - overallStart) / 1000).toFixed(1);
    var avgRaw = perQuestionTimes.length
      ? (perQuestionTimes.reduce(function (a, b) { return a + b; }, 0) / perQuestionTimes.length)
      : 0;
    var avg = avgRaw.toFixed(1);
    var accuracy = ((score / count) * 100).toFixed(0);
    var accNum = parseFloat(accuracy);
    /* Session summary for onFinish consumers (mock mode re-scores with the exam's marking scheme). */
    _finishResults = { correct: score, attempted: perQuestionTimes.length, total: count, totalTimeSec: parseFloat(totalTime) };

    /* Session Improvement (ADR-030) — honest within-session speed delta from the per-question times we
       already collected (skips are excluded, so these are genuine solves). First-half vs last-half mean
       solve time; positive pct = the student sped up over the session. Requires ≥6 timed answers so the
       halves are meaningful; otherwise left null. This is the day-one speed-proof signal the Coaching App
       shows while the multi-day calendar speed trend is still accumulating — NEVER charted as a 7/30-day
       trend. */
    var _sessImp = _computeSessionImprovement(perQuestionTimes);

    /* Persist this session to the practiceSessions subcollection (Analytics Foundation, ADR-027) so the
       Coaching App gets per-session duration + date ("sessions today" + per-session speed). Non-duel only
       (the duel path returned above). Best-effort — never blocks the results UI. */
    if (typeof FirestoreSync !== 'undefined' && FirestoreSync.savePracticeSession) {
      try {
        FirestoreSync.savePracticeSession({
          mode: timeLimit ? 'timed' : 'drill',
          category: (diSet ? diSet.category : category) || (topics && topics.length ? (topics.length > 1 ? 'mixed' : topics[0]) : 'mixed'),
          score: score,
          total: count,
          duration: parseFloat(totalTime),
          date: new Date().toDateString(),
          /* Session Improvement fields (ADR-030) — present only when ≥6 timed answers. */
          firstHalfAvg: _sessImp ? _sessImp.firstHalfAvg : null,
          secondHalfAvg: _sessImp ? _sessImp.secondHalfAvg : null,
          sessionImprovementPct: _sessImp ? _sessImp.improvementPct : null,
          timedCount: perQuestionTimes.length
        });
      } catch (_) { /* ignore */ }
    }

    /* Mark QuanAI's cached context stale (ADR-045): the student just practiced, so the next time they open
       Coach / Insights / Study Plan each forces ONE fresh server-side context instead of repeating cached
       advice. Timestamp lets each AI surface refresh independently (companion-ui compares against its own
       last-seen stamp). Cheap, best-effort localStorage write. */
    try { localStorage.setItem('qr_ai_dirty_at', String(Date.now())); } catch (_) { /* ignore */ }

    /* Roll the within-session improvement into the user's stats so the coaching roster scan reads it
       cheaply off the root doc (no per-student practiceSessions fan-out). Best-effort. recordSessionImprovement
       is a global from progress.js (same plain-<script> namespace as recordAnswer). */
    if (_sessImp && typeof recordSessionImprovement === 'function') {
      try { recordSessionImprovement(_sessImp.improvementPct); } catch (_) { /* ignore */ }
    }

    /* Speed benchmark computation. Guard the degenerate 0-answer session (e.g. a timed test that expires with nothing
       attempted): avgRaw is 0, which computeSpeedScore would read as "maximally fast" and inflate the score.
       An unanswered session has no speed signal, so score it 0 (ADR-088 A2). */
    var _attempted = perQuestionTimes.length;
    var speedScore = _attempted ? _computeSpeedScore(accNum, avgRaw) : 0;
    var speedBandClass = _getSpeedScoreClass(speedScore);

    /* One session counter for everyone — powers both the verdict baseline below and the
       free-tier upgrade cadence at the end of finish(). (It used to increment only for free
       users inside the upgrade branch, which made it unusable as a baseline.) */
    var _sessCount = 0;
    try {
      _sessCount = (parseInt(localStorage.getItem(_SESSIONS_COUNT_KEY)) || 0) + 1;
      localStorage.setItem(_SESSIONS_COUNT_KEY, String(_sessCount));
    } catch (_) {}

    /* Self-trend: this Speed Score vs the user's own last session — the only comparison the product
       can honestly make. (The old "Faster than N% of users" percentile was simulated — speed score
       scaled plus random jitter, no cohort — and was removed on principle.) */
    var lastSpeed = ScoringService.loadLastSpeedScore();
    var deltaHtml = '';
    if (_attempted && lastSpeed !== null && lastSpeed > 0) {
      var delta = speedScore - lastSpeed;
      if (delta > 0) deltaHtml = '<span class="percentile-delta delta-up">↑ +' + delta + ' vs your last session</span>';
      else if (delta < 0) deltaHtml = '<span class="percentile-delta delta-down">↓ ' + delta + ' vs your last session</span>';
    }
    if (_attempted) ScoringService.saveLastSpeedScore(speedScore);

    /* Personal bests — always recorded; celebrated only against a real baseline (≥3 prior sessions),
       so a first session can never claim a "personal best" over nothing. */
    var bests = _loadBestScores();
    var prevBestAcc = bests.bestAccuracy || 0;
    var prevBestScore = bests.bestSpeedScore || 0;
    var improvedBest = _attempted > 0 && ((accNum > prevBestAcc) || (speedScore > prevBestScore));
    if (improvedBest) {
      bests.bestAccuracy = Math.max(prevBestAcc, accNum);
      bests.bestSpeedScore = Math.max(prevBestScore, speedScore);
      _saveBestScores(bests);
    }
    var isNewBest = improvedBest && _sessCount >= 4;

    /* ONE verdict slot: personal best OR the accuracy band — never both stacked. Below 50% the
       verdict is neutral and honest; no celebration copy dressed in failure colors. */
    var badgeText, badgeClass;
    if (isNewBest) { badgeText = '🎉 New Personal Best'; badgeClass = 'badge-excellent'; }
    else if (accNum >= 90) { badgeText = '🏆 Outstanding Performance'; badgeClass = 'badge-excellent'; }
    else if (accNum >= 75) { badgeText = '💎 Strong Performance'; badgeClass = 'badge-good'; }
    else if (accNum >= 50) { badgeText = '📈 Building Momentum'; badgeClass = 'badge-practice'; }
    else { badgeText = '🔎 Needs Review'; badgeClass = 'badge-review'; }

    /* Rule-based post-session insight (always visible, no AI call) */
    var _insightText = _computeSessionInsight(accNum, sessionWrongCategories);

    /* ── ADR-086 P6 dashboard signals ──────────────────────────────────────────────────────────────────────
       Strongest & weakest topic from the per-category session tally; a "mistakes to review" count; the within-
       session speed trend (already computed as _sessImp); and a personal-bests reference. Every block is
       conditional — a single-category or all-correct session simply omits the parts that don't apply. */
    function _catLabelFor(c) { return (typeof formatCategoryName === 'function') ? formatCategoryName(c) : String(c || ''); }
    var _catArr = Object.keys(sessionCategoryStats).map(function (c) {
      var st = sessionCategoryStats[c];
      return { cat: c, acc: st.total ? st.correct / st.total : 0, total: st.total, correct: st.correct };
    });
    var _strongest = null, _weakest = null;
    if (_catArr.length >= 2) {
      var _sortedCats = _catArr.slice().sort(function (a, b) { return (b.acc - a.acc) || (b.total - a.total); });
      _strongest = _sortedCats[0];
      _weakest = _sortedCats[_sortedCats.length - 1];
      /* If every category scored identically, a strong/weak split is meaningless — suppress it. */
      if (_strongest.acc === _weakest.acc) { _strongest = null; _weakest = null; }
      /* n<3 attempts in a category is noise, not signal — never crown a "strongest topic" off 1/1. */
      if (_strongest && (_strongest.total < 3 || _weakest.total < 3)) { _strongest = null; _weakest = null; }
    }

    /* Continue-Learning target: the weakest topic's chapter, else the practiced category's, else any missed category. */
    var _learnTopic = _weakest ? _learnTopicForDrill(_weakest.cat) : null;
    if (!_learnTopic && category) _learnTopic = _learnTopicForDrill(category);
    if (!_learnTopic) {
      var _wcs = Object.keys(sessionWrongCategories);
      for (var _wi = 0; _wi < _wcs.length && !_learnTopic; _wi++) _learnTopic = _learnTopicForDrill(_wcs[_wi]);
    }

    /* Topic breakdown block (strongest + focus-next) */
    var _topicHTML = '';
    if (_strongest && _weakest) {
      _topicHTML =
        '<div class="drill-topics">' +
          '<div class="drill-topic drill-topic-strong">' +
            '<span class="dt-ico" aria-hidden="true">💪</span>' +
            '<span class="dt-body">' +
              '<span class="dt-lbl">Strongest</span>' +
              '<span class="dt-name">' + _escHtml(_catLabelFor(_strongest.cat)) + '</span>' +
              '<span class="dt-acc">' + Math.round(_strongest.acc * 100) + '% · ' + _strongest.correct + '/' + _strongest.total + '</span>' +
            '</span>' +
          '</div>' +
          '<div class="drill-topic drill-topic-weak">' +
            '<span class="dt-ico" aria-hidden="true">🎯</span>' +
            '<span class="dt-body">' +
              '<span class="dt-lbl">Focus next</span>' +
              '<span class="dt-name">' + _escHtml(_catLabelFor(_weakest.cat)) + '</span>' +
              '<span class="dt-acc">' + Math.round(_weakest.acc * 100) + '% · ' + _weakest.correct + '/' + _weakest.total + '</span>' +
            '</span>' +
          '</div>' +
        '</div>';
    }

    /* One insight chip: the within-session speed trend (real, per-question times). The old
       mistakes-to-review chip became the primary CTA below, and the cryptic "Best N% · N spd"
       chip is gone — bests live in the Speed Score card in plain words. */
    var _chips = [];
    if (_sessImp && Math.abs(_sessImp.improvementPct) >= 1) {
      var _up = _sessImp.improvementPct > 0;
      _chips.push('<span class="drill-chip ' + (_up ? 'chip-up' : 'chip-down') + '">' +
        (_up ? '⚡ ' : '🐢 ') + (_up ? '+' : '') + _sessImp.improvementPct + '% ' + (_up ? 'faster' : 'slower') + ' by the end</span>');
    }
    var _chipsHTML = _chips.length ? '<div class="drill-chips">' + _chips.join('') + '</div>' : '';

    /* Activate fullscreen scrollable results mode on the container */
    container.classList.add('drill-results-active');

    /* Resolve user display name for share card */
    var _shareDisplayName = '';
    try {
      if (typeof FirestoreSync !== 'undefined' && FirestoreSync._getCache) {
        var _cache = FirestoreSync._getCache();
        if (_cache && _cache.profile && _cache.profile.name) {
          _shareDisplayName = String(_cache.profile.name).trim();
        }
      }
    } catch (_) {}

    /* Resolve topics for share card */
    var _shareTopics = [];
    if (topics && topics.length) {
      for (var ti = 0; ti < Math.min(topics.length, 6); ti++) {
        var _tLabel = (typeof formatCategoryName === 'function') ? formatCategoryName(topics[ti]) : topics[ti];
        _shareTopics.push(_tLabel);
      }
    } else if (category) {
      var _cLabel = (typeof formatCategoryName === 'function') ? formatCategoryName(category) : category;
      _shareTopics.push(_cLabel);
    }

    /* Resolve difficulty label */
    var _shareDifficulty = 'medium';
    try {
      var _sett = (typeof loadSettings === 'function') ? loadSettings() : {};
      _shareDifficulty = _sett.difficulty || 'medium';
    } catch (_) {}

    /* Build share data object for the new ShareService API */
    var _shareData = {
      accuracy: accuracy,
      avgTime: avg,
      speedScore: speedScore,
      score: score,
      total: count,
      streak: bestSessionStreak,
      mode: mode,
      difficulty: _shareDifficulty,
      totalTime: totalTime,
      displayName: _shareDisplayName,
      topics: _shareTopics
    };

    /* Next actions (ADR-089 amended): forward-only stays the default, but when THIS session produced
       mistakes the single most valuable forward action is replaying them while they're fresh — the wrong
       question objects (charts/figures included) are still in memory, so this is free for everyone and
       session-scoped (the cross-session mistake archive remains premium). Set-mode sessions are excluded:
       their questions depend on a shared scenario that a fragment replay would lose. */
    var _reviewCount = sessionWrongQuestions.length;
    var _canReviewNow = _reviewCount > 0 && !diSet && typeof startSessionReview === 'function';
    var _nextHTML =
      '<div class="drill-next">' +
        (_canReviewNow
          ? '<button class="btn-primary drill-next-primary" type="button" id="actReviewNow">🔄 Review these ' + _reviewCount + ' now</button>'
          : '') +
        '<button class="' + (_canReviewNow ? 'btn-secondary drill-next-secondary' : 'btn-primary drill-next-primary') + '" type="button" id="actLearn">📖 Continue Learning</button>' +
        '<button class="btn-secondary drill-next-secondary" type="button" id="actPractice">🏠 Back to Practice</button>' +
      '</div>';

    container.innerHTML =
      '<div class="card center-content fade-in" role="status" aria-live="polite">' +
        '<h2 tabindex="-1" id="drillResultsHeading">Session Complete</h2>' +
        '<div class="performance-badge ' + badgeClass + '">' + badgeText + '</div>' +
        '<div class="session-insight-card">' + _escHtml(_insightText) + '</div>' +
        _chipsHTML +
        '<div class="results-grid">' +
          '<div class="result-item"><span class="result-value">' + score + '/' + count + '</span><span class="result-label">Score</span></div>' +
          '<div class="result-item"><span class="result-value">' + accuracy + '%</span><span class="result-label">Accuracy</span></div>' +
          '<div class="result-item"><span class="result-value">' + avg + 's</span><span class="result-label">Avg Time</span></div>' +
          '<div class="result-item"><span class="result-value">' + bestSessionStreak + '</span><span class="result-label">Best Streak</span></div>' +
          '<div class="result-item"><span class="result-value">' + totalTime + 's</span><span class="result-label">Total Time</span></div>' +
        '</div>' +
        _topicHTML +
        '<div class="speed-benchmark-card" id="speedBenchmarkCard">' +
          '<div class="benchmark-header">' +
            '<span class="benchmark-icon">⚡</span>' +
            '<span class="benchmark-title">Speed Score</span>' +
          '</div>' +
          '<div class="benchmark-highlight ' + speedBandClass + '">' +
            '<span class="benchmark-highlight-pct"><strong>' + speedScore + '</strong> / 100</span>' +
            deltaHtml +
          '</div>' +
          '<div class="benchmark-stats-row">' +
            '<div class="benchmark-stat-block">' +
              '<span class="benchmark-stat-value">' + accuracy + '%</span>' +
              '<span class="benchmark-stat-label">Accuracy</span>' +
            '</div>' +
            '<div class="benchmark-stat-block">' +
              '<span class="benchmark-stat-value">' + avg + 's</span>' +
              '<span class="benchmark-stat-label">Avg Time</span>' +
            '</div>' +
            '<div class="benchmark-stat-block">' +
              '<span class="benchmark-stat-value">' + (bests.bestSpeedScore || speedScore) + '</span>' +
              '<span class="benchmark-stat-label">Your Best</span>' +
            '</div>' +
          '</div>' +
          '<div class="benchmark-ai-section" id="benchmarkAiSection">' +
            '<div class="benchmark-ai-placeholder" id="benchmarkAiPlaceholder"></div>' +
          '</div>' +
        '</div>' +
        '<button class="btn-primary results-share-btn" type="button" id="shareResultBtn">🏆 Share Achievement</button>' +
        _nextHTML +
      '</div>';

    /* Land screen-reader + keyboard focus on the results heading (ADR-088 A6): finish() replaces the whole container,
       so without this focus would be orphaned on a detached node and SR users wouldn't be told the session ended. */
    try { var _rh = container.querySelector('#drillResultsHeading'); if (_rh) _rh.focus(); } catch (_) {}

    /* Next-action wiring (ADR-089): Continue Learning (primary) + Back to Practice (secondary). */
    var _backToPractice = function () {
      if (onFinish) onFinish('practice', _finishResults);
      else Router.showView('practice');
    };
    var _elReviewNow = container.querySelector('#actReviewNow');
    if (_elReviewNow) {
      var _reviewDeck = sessionWrongQuestions.slice();
      _elReviewNow.addEventListener('click', function () {
        startSessionReview(_reviewDeck);
      });
    }
    var _elLearn = container.querySelector('#actLearn');
    if (_elLearn) _elLearn.addEventListener('click', function () { _continueLearning(_learnTopic); });
    var _elPractice = container.querySelector('#actPractice');
    if (_elPractice) _elPractice.addEventListener('click', _backToPractice);
    /* Share button — opens premium share card preview */
    var shareBtn = container.querySelector('#shareResultBtn');
    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        _shareAsImage(_shareData);
      });
    }

    /* Host hook: let the caller augment the results card once it's in the DOM (mock mode injects the
       exam-accurate, negative-marking score here). Additive + guarded — never blocks the normal results. */
    if (typeof onResults === 'function') { try { onResults(_finishResults, container); } catch (_e) { } }

    /* Speed Score summary — generated locally, available to all users */
    var benchmarkPlaceholder = container.querySelector('#benchmarkAiPlaceholder');
    if (benchmarkPlaceholder && typeof AIFeatures !== 'undefined' && typeof AIFeatures.fetchSpeedBenchmark === 'function') {
      AIFeatures.fetchSpeedBenchmark(accNum, parseFloat(avg), speedScore, null, count, mode, function (err, data) {
        if (err || !data) {
          benchmarkPlaceholder.innerHTML = '';
          return;
        }
        _renderBenchmarkAi(benchmarkPlaceholder, data);
      });
    }

    /* Post-session soft upgrade prompt — shown after 2nd session and every 5th after (free users only).
       Uses the session counter incremented once above (for everyone). */
    try {
      var _isPremiumUser = (typeof canAccessFeature === 'function') ? canAccessFeature('adaptive_training') : false;
      if (!_isPremiumUser) {
        var _shouldPrompt = (_sessCount === 2) || (_sessCount > 2 && (_sessCount - 2) % 5 === 0);
        if (_shouldPrompt) {
          setTimeout(function () {
            var _resultsCard = container.querySelector('.card');
            if (!_resultsCard) return;
            var _existing = container.querySelector('.session-upgrade-banner');
            if (_existing) return;
            var _banner = document.createElement('div');
            _banner.className = 'session-upgrade-banner';
            _banner.innerHTML =
              '<span class="session-upgrade-text">Ready for the next level? Unlock your full potential.</span>' +
              '<button class="session-upgrade-btn" type="button">Go Premium</button>' +
              '<button class="session-upgrade-dismiss" type="button" aria-label="Dismiss">×</button>';
            _banner.querySelector('.session-upgrade-btn').addEventListener('click', function () {
              if (typeof showPaywall === 'function') showPaywall('upgrade');
            });
            _banner.querySelector('.session-upgrade-dismiss').addEventListener('click', function () {
              if (_banner.parentNode) _banner.parentNode.removeChild(_banner);
            });
            _resultsCard.appendChild(_banner);
          }, 900);
        }
      }
    } catch (_) {}
  }

  function _renderBenchmarkAi(el, data) {
    if (!el || !data) return;
    el.innerHTML =
      '<div class="benchmark-ai-result">' +
        '<span class="benchmark-level">' + _escHtml(data.level || '') + '</span>' +
        '<p class="benchmark-summary">' + _escHtml(data.summary || '') + '</p>' +
        '<p class="benchmark-suggestion"><span class="benchmark-tip-label">Tip:</span> ' + _escHtml(data.suggestion || '') + '</p>' +
      '</div>';
  }

  /* ---- global timer (for timed tests) ---- */

  function _globalTick() {
    var el = ui.globalTimerEl;
    if (el) {
      el.textContent = '⏱ ' + _globalRemaining + 's';
      /* Urgency state (ADR-091): calm until the clock actually matters */
      el.classList.toggle('timer-low', _globalRemaining <= 10);
    }
    if (_globalRemaining <= 0) { clearInterval(overallTimer); overallTimer = null; finish(); return; }
    _globalRemaining--;
  }
  function startGlobalTimer() {
    if (!timeLimit) return;
    _globalRemaining = timeLimit;
    _globalTick();
    overallTimer = setInterval(_globalTick, 1000);
  }

  /* ---- per-question timer (for reflex drills) ---- */

  function _perQTick() {
    var el = ui.perQTimerEl;
    if (el) {
      el.textContent = '⏱ ' + _perQRemaining + 's';
      /* Urgency state (ADR-091): calm until the clock actually matters */
      el.classList.toggle('timer-low', _perQRemaining <= 5);
    }
    if (_perQRemaining <= 0) {
      clearInterval(perQTimer);
      perQTimer = null;
      /* Auto-submit empty answer when time runs out (duel → capture-only path). The practice path
         flags the timeout so feedback reads "Time's up" (pacing) instead of "Not quite" (knowledge). */
      if (!answered && !_isFinished) { if (isDuel) captureDuelAnswer(''); else checkAnswer('', { timedOut: true }); }
      return;
    }
    _perQRemaining--;
  }
  function startPerQTimer() {
    _perQRemaining = perQLimit;
    /* Don't start ticking while paused (ADR-087 D2): if a render happens under the pause overlay, resumeSession() will
       start the countdown when the user actually resumes. */
    if (_paused) return;
    _perQTick();
    perQTimer = setInterval(_perQTick, 1000);
  }

  /* ---- pause / resume (ADR-086 P7) ---- */

  function pauseSession() {
    if (isDuel || _paused || _isFinished) return;   /* never pause a live duel */
    _paused = true;
    _pauseStart = performance.now();
    if (overallTimer) { clearInterval(overallTimer); overallTimer = null; }
    if (perQTimer) { clearInterval(perQTimer); perQTimer = null; }
    /* Also cancel the reflex post-answer transition timers (ADR-087 D2): pausing inside the 350–600ms auto-advance
       window would otherwise let _autoAdvanceTimer fire nextQuestion UNDER the overlay — re-rendering (wiping the
       overlay) and starting a fresh per-question timer while _paused stays true. Cancel them; since the answer is
       already recorded, re-enable Next so the user simply advances manually after resuming. */
    if (_autoAdvanceTimer) { clearTimeout(_autoAdvanceTimer); _autoAdvanceTimer = null; }
    if (_nextGuardTimer) { clearTimeout(_nextGuardTimer); _nextGuardTimer = null; if (answered) _nextReady = true; }
    _showPauseOverlay();
  }

  function resumeSession() {
    if (!_paused) return;
    _paused = false;
    var pausedMs = performance.now() - _pauseStart;
    /* Shift the timing anchors so the paused span is excluded from response + total time. */
    if (qStart) qStart += pausedMs;
    if (overallStart) overallStart += pausedMs;
    _hidePauseOverlay();
    if (_isFinished) return;
    /* Restart each frozen countdown with an immediate tick (mirrors startGlobalTimer/startPerQTimer) so the visible
       number updates the instant you resume, not a second later. Global (timed test) runs through feedback too; the
       per-question countdown only while the question is unanswered. */
    if (timeLimit && !overallTimer && _globalRemaining != null) {
      _globalTick();
      if (!_isFinished && !overallTimer) overallTimer = setInterval(_globalTick, 1000);
    }
    if (perQLimit && !perQTimer && !answered && _perQRemaining != null) {
      _perQTick();
      if (!_isFinished && !answered && !perQTimer) perQTimer = setInterval(_perQTick, 1000);
    }
  }

  function _showPauseOverlay() {
    if (container.querySelector('#drillPauseOverlay')) return;
    var ov = document.createElement('div');
    ov.id = 'drillPauseOverlay';
    ov.className = 'drill-pause-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Session paused');
    ov.innerHTML =
      '<div class="drill-pause-card">' +
        '<div class="drill-pause-icon" aria-hidden="true">⏸</div>' +
        '<h2 class="drill-pause-title">Paused</h2>' +
        '<p class="drill-pause-sub">Your timer is frozen. Resume when you\'re ready.</p>' +
        '<button class="btn-primary" type="button" id="drillResumeBtn">Resume</button>' +
      '</div>';
    /* Escape resumes — the overlay is modal, so a keyboard user isn't trapped. */
    ov.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { ev.preventDefault(); resumeSession(); } });
    container.appendChild(ov);
    var rb = ov.querySelector('#drillResumeBtn');
    if (rb) { rb.addEventListener('click', resumeSession); try { rb.focus(); } catch (_) {} }
  }

  function _hidePauseOverlay() {
    var ov = container.querySelector('#drillPauseOverlay');
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
  }

  /* Auto-pause when the tab is backgrounded mid-question so time-away never counts against the user. Deliberately does
     NOT auto-resume on return — the student resumes consciously. Not installed for duels (real-time multiplayer). */
  function _installVisibilityGuard() {
    if (isDuel || _visHandler) return;
    _visHandler = function () {
      if (typeof document !== 'undefined' && document.hidden && !_paused && !_isFinished) pauseSession();
    };
    try { document.addEventListener('visibilitychange', _visHandler); } catch (_) {}
  }
  function _removeVisibilityGuard() {
    if (_visHandler) { try { document.removeEventListener('visibilitychange', _visHandler); } catch (_) {} _visHandler = null; }
  }

  /* ---- cleanup timers ---- */
  function cleanup() {
    if (overallTimer) { clearInterval(overallTimer); overallTimer = null; }
    if (perQTimer) { clearInterval(perQTimer); perQTimer = null; }
    /* Cancel any pending post-answer transition timers so they can't fire nextQuestion/finish after teardown. */
    if (_nextGuardTimer) { clearTimeout(_nextGuardTimer); _nextGuardTimer = null; }
    if (_autoAdvanceTimer) { clearTimeout(_autoAdvanceTimer); _autoAdvanceTimer = null; }
    if (_loadingTimer) { clearTimeout(_loadingTimer); _loadingTimer = null; }
    /* ADR-086 P7: tear down the visibility auto-pause listener + clear any pause latch so a torn-down engine leaves no
       global handler behind and a fresh session never inherits a stale paused state. */
    _removeVisibilityGuard();
    _paused = false;
    _nextReady = true; /* reset guard on cleanup */
    beginStarted = false;
    if (adaptiveMode) _clearAdaptiveOverride();
    /* Clear session pattern so non-adaptive sessions don't inherit stale hints */
    if (typeof AdaptiveState !== 'undefined') {
      AdaptiveState.setPattern(null);
    } else {
      window._sessionAdaptivePattern = null;
    }
  }

  /* ---- begin drill ---- */

  /* Delegates to the single shared multi-topic generator in questions.js (the same one api/duel.js uses), so
     Custom Training and Duel produce identical question sets. Client omits difficulty → uses settings. */
  function _generateCustomTopicQuestions(totalCount, topicKeys) {
    return generateMultiTopic(totalCount, topicKeys);
  }

  function begin() {
    if (beginStarted) return;
    beginStarted = true;
    _isFinished = false; /* a restart (Retry / Practice Mistakes / Increase Difficulty) reuses this engine — clear the finished latch */
    _paused = false; /* clear any stale pause latch on (re)start */
    _nextReady = true; /* ensure clean guard state at session start */
    _installVisibilityGuard(); /* ADR-086 P7: auto-pause on backgrounding (non-duel) */
    /* Reset anti-repetition tracker so new session gets fresh questions */
    if (typeof resetRecentQuestions === 'function') resetRecentQuestions();
    /* Mark session as active and hide nav for immersive experience */
    _enterDrillSession();

    /* Begin Firestore write batching during drill (NON-duel only — duel answers go straight to the player's
       own doc via DuelCore.writeAnswer, never the practice drill batch; ADR-033). */
    if (typeof FirestoreSync !== 'undefined' && !isDuel) {
      FirestoreSync.beginDrillBatch();
    }

    /* Set initial adaptive difficulty based on session settings */
    if (adaptiveMode) {
      try {
        var _s = (typeof AppState !== 'undefined') ? AppState.getSettings() : JSON.parse(localStorage.getItem('quant_reflex_settings') || '{}');
        _setAdaptiveOverride(_s.difficulty || 'medium');
      } catch (_) { _setAdaptiveOverride('medium'); }
    }

    /* Honest loading state (ADR-086 P5): pre-built decks (DI/LR sets, mock/word-problem preloads, duel) are already in
       memory — build synchronously, no loader flash. Client-side generation of a full deck (Reflex/Timed/Focus/Custom/
       Mixed/Review) is fast but not free; render an elegant loader into the immersive shell FIRST so the tap feels
       instant and the session UI appears, then yield one frame and build. No fake progress — the loader shows only
       while real work is pending, then Q1 replaces it. */
    var _heavyGen = !isDuel && !diSet && !(preloadedQuestions && preloadedQuestions.length > 0) &&
      (count >= 8 || (topics && topics.length >= 3) || reviewMode);
    if (_heavyGen) {
      _renderLoading();
      _loadingTimer = setTimeout(function () {
        _loadingTimer = null;
        if (_isFinished) return; /* torn down during the yield */
        _beginBuild();
      }, 0);
    } else {
      _beginBuild();
    }
  }

  /* Elegant, honest loading state shown between Begin and Q1 while a deck is generated. Subtle animation, no fake
     progress bar. Rendered inside the active immersive session shell (begin() has already called _enterDrillSession). */
  function _renderLoading() {
    var badge = _startBadge();
    container.innerHTML =
      '<div class="card center-content drill-loading" role="status" aria-live="polite">' +
        '<div class="drill-loading-orb" aria-hidden="true"><span></span><span></span><span></span></div>' +
        '<h2 class="drill-loading-title">' + _escHtml(badge.title) + '</h2>' +
        '<p class="drill-loading-sub">Preparing your questions…</p>' +
      '</div>';
  }

  /* Graceful generation-failure card (ADR-086 P7): shown when a deck can't be built. Offers Retry (rebuild in place)
     and a clean exit. The session shell is already active, so this renders inside it. */
  function _renderGenError() {
    container.classList.remove('drill-results-active');
    _removeVisibilityGuard(); /* ADR-087: no live session behind this card — don't leave a stray auto-pause listener */
    container.innerHTML =
      '<div class="card center-content drill-error">' +
        '<div class="drill-error-icon" aria-hidden="true">⚠️</div>' +
        '<h2>Couldn\'t build this session</h2>' +
        '<p class="secondary-text">Something went wrong preparing your questions. Please try again.</p>' +
        '<button class="btn-primary" type="button" id="drillGenRetry">Try Again</button>' +
        '<button class="btn-secondary" type="button" id="drillGenBack">← Back to Practice</button>' +
      '</div>';
    var _rt = container.querySelector('#drillGenRetry');
    if (_rt) _rt.addEventListener('click', function () { beginStarted = false; answered = false; begin(); });
    var _bk = container.querySelector('#drillGenBack');
    if (_bk) _bk.addEventListener('click', function () {
      try { cleanup(); } catch (_) {}
      _exitDrillSession();
      if (typeof FirestoreSync !== 'undefined' && FirestoreSync.endDrillBatch) FirestoreSync.endDrillBatch();
      if (onFinish) onFinish('practice'); else if (typeof Router !== 'undefined') Router.showView('practice');
    });
  }

  /* The actual deck build + session-counter reset + first render. Split out of begin() so it can run either
     synchronously (pre-built/light) or deferred one frame behind the loader (heavy generation). */
  function _beginBuild() {
    /* ADR-086 P7 — generation is wrapped so any generator throw (or an empty non-review deck) surfaces a graceful
       error card with Retry instead of a blank/frozen session. Offline is a non-issue (generation is fully client-side)
       but a corrupt input or missing generator would otherwise crash here. */
    try {
      if (diSet) {
        /* DI Set: map the shared-context set into the drill question shape. Each question carries the SET's category
           (so analytics attribute to di-bar/di-line/… exactly like single questions) and the shared chart (so AI
           Explain grounds on the same data); caselet sets carry the worded context for grounding. */
        questions = diSet.questions.map(function (sq) {
          return { question: sq.question, answer: sq.answer, category: diSet.category, subtype: sq.subtype, chart: diSet.chart || null, aiContext: diSet.context || null };
        });
        count = questions.length;
      } else if (preloadedQuestions && preloadedQuestions.length > 0) {
        questions = preloadedQuestions;
        count = questions.length;
      } else if (reviewMode) {
        questions = generateMistakeReviewQuestions(count);
        if (questions.length === 0) {
          _exitDrillSession();
          _removeVisibilityGuard(); /* ADR-087: terminal card, no live session — drop the auto-pause listener */
          if (typeof FirestoreSync !== 'undefined') {
            FirestoreSync.endDrillBatch();
          }
          container.innerHTML =
            '<div class="card center-content">' +
              '<h2>All Caught Up!</h2>' +
              '<p class="secondary-text">Impressive — you\'ve mastered all your previous mistakes.</p>' +
              '<button class="btn-primary" id="backToPractice">Continue Training</button>' +
            '</div>';
          container.querySelector('#backToPractice').addEventListener('click', function () {
            Router.showView('practice');
          });
          return;
        }
        count = questions.length;
        reviewOriginalCount = count;
      } else if (topics && topics.length) {
        questions = _generateCustomTopicQuestions(count, topics);
      } else {
        questions = generateQuestions(count, category);
      }
    } catch (_genErr) {
      _renderGenError();
      return;
    }
    if (!questions || !questions.length) { _renderGenError(); return; }
    current = 0;
    score = 0;
    bestSessionStreak = 0;
    currentSessionStreak = 0;
    perQuestionTimes = [];
    sessionWrongCategories = {};
    sessionCategoryStats = {};
    sessionWrongQuestions = [];
    overallStart = performance.now();
    startGlobalTimer();
    renderQuestion();
  }

  /* ---- public API ---- */
  return {
    start: function() {
      /* Duels and explicit relaunches (e.g. "Review these N now" from a results card) skip the
         pre-session start screen — the user already committed by tapping a specific action. */
      if (isDuel || opts.skipStartScreen === true) {
        begin();
      } else {
        renderStart();
      }
    },
    cleanup: cleanup
  };
}
