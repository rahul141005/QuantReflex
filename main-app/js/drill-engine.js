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
  /* Auto-advance after a correct answer (Reflex Drill). Driven by an explicit flag, NOT the display label — the old
     `mode === 'Reflex Drill'` guard silently never matched the emoji-prefixed label '🧠 Reflex Drill' (ADR-086). */
  var autoAdvance = (opts.autoAdvance === true) || mode === 'Reflex Drill' || /Reflex Drill/.test(mode);
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
    }
    var host = container.querySelector('#diSetQHost');
    var progressPct = count > 0 ? Math.round((current / count) * 100) : 0;
    /* a set question may be numeric (DI) OR multiple-choice (LR puzzle sets, ADR-079) — render the matching input */
    var isMCQ = !!(q.options && q.options.length);
    var setBadge = (diSet.category && String(diSet.category).indexOf('lr-') === 0) ? 'LR SET' : 'DI SET';
    host.innerHTML =
      '<p class="drill-progress">Question ' + (current + 1) + ' / ' + count + ' <span class="di-set-badge">' + setBadge + '</span></p>' +
      '<div class="drill-progress-bar"><div class="drill-progress-fill" style="width:' + progressPct + '%"></div></div>' +
      '<h2 class="question-text">' + _escHtml(q.question) + '</h2>' +
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
      var submit = function () { if (answered) return; checkAnswer(input.value.trim()); };
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
      '<div class="card center-content fade-in question-card-transition' + (isMCQ ? ' drill-has-mcq' : '') + '">' +
        '<div class="drill-question-scroll">' +
          '<p class="drill-progress">Question ' + (current + 1) + ' / ' + displayCount + (adaptivePill ? ' ' + adaptivePill : '') + '</p>' +
          '<div class="drill-progress-bar"><div class="drill-progress-fill" style="width:' + progressPct + '%"></div></div>' +
          (timeLimit ? '<p id="globalTimer" class="timer"></p>' : '') +
          (perQLimit ? '<p id="perQTimer" class="timer"></p>' : '') +
          /* DI (ADR-074): a question may carry a `chart` spec rendered ABOVE the stem. Reuses the same engine,
             numpad, grading + feedback as Quant — the only DI-specific surface is this one chart block. */
          (q.chart && typeof DICharts !== 'undefined' ? DICharts.render(q.chart) : '') +
          /* Visual LR (ADR-079): a generated figure (mirror/dice/cube/series…) rendered ABOVE the stem, same seam as the DI chart. */
          (q.figure && typeof LRFigures !== 'undefined' ? LRFigures.render(q.figure) : '') +
          '<h2 class="question-text">' + _escHtml(q.question) + '</h2>' +
          /* LR (ADR-075): multiple-choice questions render option buttons instead of the numeric input; everything
             else (grading, feedback, recordAnswer, Next) is reused. Quant/DI stay on the numpad path unchanged.
             Visual LR (ADR-079): when the choices are pictures, each button renders its figure (the token in
             data-opt is still what the grader compares). */
          (isMCQ
            ? '<div id="mcqOptions" class="mcq-options' + (q.optionFigures ? ' mcq-options-figures' : '') + '" role="group" aria-label="Answer options">' +
                q.options.map(function (o, _i) { var s = _escHtml(String(o)); var fig = (q.optionFigures && q.optionFigures[_i] && typeof LRFigures !== 'undefined') ? LRFigures.render(q.optionFigures[_i]) : ''; var len = String(o).length; var cls = fig ? 'mcq-option mcq-figure-option' : ('mcq-option' + (len > 14 ? (len > 48 ? ' mcq-wide mcq-para' : ' mcq-wide') : '')); return '<button class="' + cls + '" type="button" data-opt="' + s.replace(/"/g, '&quot;') + '" aria-label="Option ' + s + '">' + (fig || s) + '</button>'; }).join('') +
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

    var input = ui.answerInputEl;
    var submitBtn = ui.submitBtnEl;
    /* NOTE: input.focus() intentionally removed here —
       it triggers the native keyboard on mobile, fighting with our custom numpad.
       The input is readonly and receives input from the custom numpad buttons. */

    function submit() {
      if (answered) return;
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

  function checkAnswer(raw) {
    if (answered || _isFinished) return; /* prevent double-counting or post-finish race */
    answered = true;

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

    /* Record answer with response time and question data for mistake tracking */
    if (!isDuel) {
      recordAnswer(correct, q.category, q, elapsedRounded);
    } else if (typeof onDuelAnswerSubmit === 'function') {
      onDuelAnswerSubmit(correct, expected, elapsedRounded, q, current, function advance() {
        /* This allows the duel manager to control when to advance to the next question */
      });
    }

    /* Provide optional haptic/sound feedback */
    if (correct) {
      if (typeof triggerHaptic === 'function') triggerHaptic(50);
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
      feedback.appendChild(okHead);
      if (_steps.length) feedback.appendChild(_buildWhy(_steps, null));   /* teach the method; no concept-link on a win */
    } else {
      feedback.className = 'feedback wrong wrong-answer-card feedback-anim';
      feedback.innerHTML = '';
      var teach = document.createElement('div');
      teach.className = 'drill-teach';
      var head = document.createElement('div');
      head.className = 'drill-verdict drill-verdict-wrong';
      head.textContent = 'Not quite';
      teach.appendChild(head);
      var ansRow = document.createElement('div');
      ansRow.className = 'drill-teach-answer';
      var ansLbl = document.createElement('span');
      ansLbl.className = 'drill-teach-answer-lbl';
      ansLbl.textContent = 'Correct answer';
      var ansVal = document.createElement('span');
      ansVal.className = 'drill-teach-answer-val';
      ansVal.textContent = expected;
      ansRow.appendChild(ansLbl); ansRow.appendChild(ansVal);
      teach.appendChild(ansRow);
      if (_steps.length) {
        teach.appendChild(_buildWhy(_steps, _topic));
      } else {
        teach.appendChild(_buildAutoTip(q));
        if (_topic) teach.appendChild(_buildConceptLink(_topic));
      }
      feedback.appendChild(teach);

      var card = ui.cardEl;
      if (card) card.classList.add('feedback-shake');
      setTimeout(function () { if (card) card.classList.remove('feedback-shake'); }, 400);
    }

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

  var _PERCENTILE_KEY = ScoringService.PERCENTILE_KEY;
  var _SESSIONS_COUNT_KEY = ScoringService.SESSIONS_COUNT_KEY;

  function _computeContinuousPercentile(speedScore) {
    return ScoringService.computePercentile(speedScore);
  }

  function _getPercentileClass(pct) {
    return ScoringService.getPercentileClass(pct);
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

  function _shareTextFallback(accuracy, percentile) {
    ShareService.shareTextFallback(accuracy, percentile);
  }

  function _computeSessionInsight(accNum, wrongCats) {
    return ScoringService.computeSessionInsight(accNum, wrongCats);
  }

  function finish() {
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

    /* Speed benchmark computation */
    var speedScore = _computeSpeedScore(accNum, avgRaw);
    var percentile = _computeContinuousPercentile(speedScore);
    var percentileClass = _getPercentileClass(percentile);

    /* Session delta: compare with last stored percentile */
    var lastPct = null;
    try { lastPct = parseInt(localStorage.getItem(_PERCENTILE_KEY)); } catch (_) {}
    var deltaHtml = '';
    if (!isNaN(lastPct) && lastPct > 0) {
      var delta = percentile - lastPct;
      if (delta > 0) deltaHtml = '<span class="percentile-delta delta-up">↑ +' + delta + '% from last session</span>';
      else if (delta < 0) deltaHtml = '<span class="percentile-delta delta-down">↓ ' + delta + '% from last session</span>';
    }
    try { localStorage.setItem(_PERCENTILE_KEY, String(percentile)); } catch (_) {}

    /* New Best detection */
    var bests = _loadBestScores();
    var prevBestAcc = bests.bestAccuracy || 0;
    var prevBestScore = bests.bestSpeedScore || 0;
    var isNewBest = (accNum > prevBestAcc) || (speedScore > prevBestScore);
    if (isNewBest) {
      bests.bestAccuracy = Math.max(prevBestAcc, accNum);
      bests.bestSpeedScore = Math.max(prevBestScore, speedScore);
      _saveBestScores(bests);
    }

    /* Performance badge */
    var badgeText, badgeClass;
    if (accNum >= 90) { badgeText = '🏆 Outstanding Performance'; badgeClass = 'badge-excellent'; }
    else if (accNum >= 75) { badgeText = '💎 Strong Performance'; badgeClass = 'badge-good'; }
    else if (accNum >= 50) { badgeText = '📈 Building Momentum'; badgeClass = 'badge-practice'; }
    else { badgeText = '🌱 Growth in Progress'; badgeClass = 'badge-weak'; }

    /* Rule-based post-session insight (always visible, no AI call) */
    var _insightText = _computeSessionInsight(accNum, sessionWrongCategories);

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
      percentile: percentile,
      score: score,
      total: count,
      streak: bestSessionStreak,
      mode: mode,
      difficulty: _shareDifficulty,
      totalTime: totalTime,
      displayName: _shareDisplayName,
      topics: _shareTopics
    };

    container.innerHTML =
      '<div class="card center-content fade-in">' +
        '<h2>Session Complete</h2>' +
        (isNewBest ? '<div class="new-best-badge">🎉 New Personal Best!</div>' : '') +
        '<div class="performance-badge ' + badgeClass + '">' + badgeText + '</div>' +
        '<div class="session-insight-card">' + _escHtml(_insightText) + '</div>' +
        '<div class="results-grid">' +
          '<div class="result-item"><span class="result-value">' + score + '/' + count + '</span><span class="result-label">Score</span></div>' +
          '<div class="result-item"><span class="result-value">' + accuracy + '%</span><span class="result-label">Accuracy</span></div>' +
          '<div class="result-item"><span class="result-value">' + avg + 's</span><span class="result-label">Avg Time</span></div>' +
          '<div class="result-item"><span class="result-value">' + bestSessionStreak + '</span><span class="result-label">Best Streak</span></div>' +
          '<div class="result-item"><span class="result-value">' + totalTime + 's</span><span class="result-label">Total Time</span></div>' +
        '</div>' +
        '<div class="speed-benchmark-card" id="speedBenchmarkCard">' +
          '<div class="benchmark-header">' +
            '<span class="benchmark-icon">⚡</span>' +
            '<span class="benchmark-title">Speed Benchmark</span>' +
          '</div>' +
          '<div class="benchmark-highlight ' + percentileClass + '">' +
            '<span class="benchmark-highlight-pct">Faster than <strong>' + percentile + '%</strong> of users</span>' +
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
              '<span class="benchmark-stat-value">' + speedScore + '</span>' +
              '<span class="benchmark-stat-label">Speed Score</span>' +
            '</div>' +
          '</div>' +
          '<div class="benchmark-ai-section" id="benchmarkAiSection">' +
            '<div class="benchmark-ai-placeholder" id="benchmarkAiPlaceholder"></div>' +
          '</div>' +
        '</div>' +
        '<button class="btn-primary results-share-btn" type="button" id="shareResultBtn">🏆 Share Achievement</button>' +
        '<button class="btn-primary" id="tryAgainBtn">Challenge Again</button>' +
        '<button class="btn-secondary" id="homeBtn">Back to Home</button>' +
      '</div>';

    container.querySelector('#tryAgainBtn').addEventListener('click', function () {
      if (onFinish) {
        onFinish('practice', _finishResults);
      } else {
        Router.showView('practice');
      }
    });
    container.querySelector('#homeBtn').addEventListener('click', function () {
      if (onFinish) {
        onFinish('home', _finishResults);
      } else {
        Router.showView('home');
      }
    });
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

    /* Speed Benchmark summary — generated locally, available to all users */
    var benchmarkPlaceholder = container.querySelector('#benchmarkAiPlaceholder');
    if (benchmarkPlaceholder && typeof AIFeatures !== 'undefined' && typeof AIFeatures.fetchSpeedBenchmark === 'function') {
      AIFeatures.fetchSpeedBenchmark(accNum, parseFloat(avg), speedScore, percentile, count, mode, function (err, data) {
        if (err || !data) {
          benchmarkPlaceholder.innerHTML = '';
          return;
        }
        _renderBenchmarkAi(benchmarkPlaceholder, data);
      });
    }

    /* Post-session soft upgrade prompt — shown after 2nd session and every 5th after (free users only) */
    try {
      var _isPremiumUser = (typeof canAccessFeature === 'function') ? canAccessFeature('adaptive_training') : false;
      if (!_isPremiumUser) {
        var _sessCount = parseInt(localStorage.getItem(_SESSIONS_COUNT_KEY)) || 0;
        _sessCount++;
        localStorage.setItem(_SESSIONS_COUNT_KEY, String(_sessCount));
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

  function startGlobalTimer() {
    if (!timeLimit) return;
    var remaining = timeLimit;
    function tick() {
      var el = ui.globalTimerEl;
      if (el) el.textContent = '⏱ ' + remaining + 's';
      if (remaining <= 0) { clearInterval(overallTimer); overallTimer = null; finish(); return; }
      remaining--;
    }
    tick();
    overallTimer = setInterval(tick, 1000);
  }

  /* ---- per-question timer (for reflex drills) ---- */

  function startPerQTimer() {
    var remaining = perQLimit;
    function tick() {
      var el = ui.perQTimerEl;
      if (el) el.textContent = '⏱ ' + remaining + 's';
      if (remaining <= 0) {
        clearInterval(perQTimer);
        perQTimer = null;
        /* Auto-submit empty answer when time runs out (duel → capture-only path) */
        if (!answered && !_isFinished) { if (isDuel) captureDuelAnswer(''); else checkAnswer(''); }
        return;
      }
      remaining--;
    }
    tick();
    perQTimer = setInterval(tick, 1000);
  }

  /* ---- cleanup timers ---- */
  function cleanup() {
    if (overallTimer) { clearInterval(overallTimer); overallTimer = null; }
    if (perQTimer) { clearInterval(perQTimer); perQTimer = null; }
    /* Cancel any pending post-answer transition timers so they can't fire nextQuestion/finish after teardown. */
    if (_nextGuardTimer) { clearTimeout(_nextGuardTimer); _nextGuardTimer = null; }
    if (_autoAdvanceTimer) { clearTimeout(_autoAdvanceTimer); _autoAdvanceTimer = null; }
    if (_loadingTimer) { clearTimeout(_loadingTimer); _loadingTimer = null; }
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
    _nextReady = true; /* ensure clean guard state at session start */
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

  /* The actual deck build + session-counter reset + first render. Split out of begin() so it can run either
     synchronously (pre-built/light) or deferred one frame behind the loader (heavy generation). */
  function _beginBuild() {
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
    current = 0;
    score = 0;
    bestSessionStreak = 0;
    currentSessionStreak = 0;
    perQuestionTimes = [];
    sessionWrongCategories = {};
    overallStart = performance.now();
    startGlobalTimer();
    renderQuestion();
  }

  /* ---- public API ---- */
  return { 
    start: function() {
      if (isDuel) {
        begin();
      } else {
        renderStart();
      }
    }, 
    cleanup: cleanup 
  };
}
