/**
 * practice-modes.js — Practice drill mode launcher
 *
 * Extracted from app.js. Manages:
 *   - startDrillFromPractice() — mode config + launch
 *   - _startPracticeEngine() — engine instantiation
 *   - Practice view Router.onShow / onInit callbacks
 *
 * Dependencies (expected globals):
 *   Router, SoundEngine, FirestoreSync, AIFeatures,
 *   createDrillEngine, canAccessFeature, showPaywall, hasReachedDailyLimit,
 *   _activeDrillEngine, _drillSessionActive, _enterDrillSession, _exitDrillSession,
 *   _resetPracticeUiToModes, _getTimerConfig, _initTimerControls, _initAdaptiveToggle,
 *   _resetTimerSelection, _resetAdaptiveToggle, _resetCustomPracticeState,
 *   _syncCustomPracticeSelectionUi, _toggleCustomPracticeTopic, _updateCustomQuestionCountUI,
 *   _customPracticeActive, _focusModeActive, _adaptiveModeActive,
 *   _customPracticeState, _customPracticeDom, selectedTopics, showToast,
 *   _focusSelectedCategory, _focusSelectedCategoryLabel,
 *   _tryPracticeAction, _CUSTOM_DEFAULT_QUESTIONS, _CUSTOM_MIN_QUESTIONS, _CUSTOM_MAX_QUESTIONS
 */

/* ---- Practice drill starter ---- */
/* Mixed Aptitude (ADR-076, Phase 4): a balanced cross-subject sprint — the clearest "one platform" practice. Picks a
   fresh random spread each launch (Quant-heavy, mirroring a real sectional test). Falls back to null (→ Quant random)
   if the subject layer isn't present. */
function _mixedAptitudeTopics() {
  if (typeof QR_SUBJECTS === 'undefined') return null;
  function _shuf(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function _take(sid, n) { try { return _shuf(QR_SUBJECTS.subjectToCategories(sid)).slice(0, n); } catch (_) { return []; } }
  var t = [].concat(_take('quant', 4), _take('di', 2), _take('lr', 2));
  return t.length ? t : null;
}

/* ADR-080: resolve a chosen subject id to a topic pool + human label, then launch the Quick-Start session scoped to
   it. 'mixed' reuses the balanced cross-subject pool; a missing/unknown subject (or absent subject layer) falls back
   to Quant-default behaviour (no topics → the engine's Quant random), so nothing breaks. */
function _subjectScope(subjectId) {
  if (typeof QR_SUBJECTS === 'undefined') return { topics: null, label: null };
  if (subjectId === 'mixed') return { topics: _mixedAptitudeTopics(), label: 'Mixed' };
  try {
    var cats = QR_SUBJECTS.subjectToCategories(subjectId) || [];
    return { topics: cats.length ? cats : null, label: QR_SUBJECTS.label(subjectId) || null };
  } catch (_) { return { topics: null, label: null }; }
}

function _startQuickWithSubject(modeKey, subjectId) {
  var s = _subjectScope(subjectId);
  startDrillFromPractice(modeKey, null, null, { topics: s.topics, subjectLabel: s.label });
}

function _launchQuickStart(modeKey) {
  /* If the user can't practise right now (free daily limit reached), don't tease the subject picker — go straight to
     startDrillFromPractice, which surfaces the limit banner + paywall. */
  if (typeof hasReachedDailyLimit === 'function' && hasReachedDailyLimit()) { startDrillFromPractice(modeKey); return; }
  /* Honour the saved preference: if the user turned the prompt off, launch straight into the remembered subject. */
  if (typeof PracticeSubjectModal !== 'undefined' && PracticeSubjectModal.shouldAsk && PracticeSubjectModal.shouldAsk()) {
    PracticeSubjectModal.open(function (subjectId) { _startQuickWithSubject(modeKey, subjectId); });
  } else {
    var last = (typeof PracticeSubjectModal !== 'undefined' && PracticeSubjectModal.lastSubject) ? PracticeSubjectModal.lastSubject() : 'quant';
    _startQuickWithSubject(modeKey, last || 'quant');
  }
}

function startDrillFromPractice(modeKey, category, categoryLabel, opts) {
  opts = opts || {};
  if (modeKey !== 'custom') _customPracticeActive = false;
  if (modeKey === 'custom' && !canAccessFeature('custom_training')) {
    showPaywall('custom_training');
    return;
  }
  if (modeKey === 'review' && !canAccessFeature('review_mistakes')) {
    showPaywall('review_mistakes');
    return;
  }
  /* Secondary explicit guard against console UI bypass for premium modes */
  if (modeKey === 'custom' || modeKey === 'review') {
    var isPrem = (typeof hasPremiumAccess === 'function') ? hasPremiumAccess() : false;
    if (!isPrem) {
      showPaywall('premium_required');
      return;
    }
  }
  if (typeof hasReachedDailyLimit === 'function' && hasReachedDailyLimit()) {
    var modeSelectEl = document.getElementById('modeSelect');
    if (modeSelectEl) {
      var existingBanner = document.querySelector('.daily-limit-banner');
      if (!existingBanner) {
        /* ADR-095: source the number from the single limit definition (not a hardcoded "20") and bind via
           addEventListener rather than an inline onclick (CSP-friendly, consistent with the rest of the app). */
        var _freeLimit = (typeof getDailyQuestionLimit === 'function' && isFinite(getDailyQuestionLimit())) ? getDailyQuestionLimit() : 20;
        var banner = document.createElement('div');
        banner.className = 'daily-limit-banner';
        banner.innerHTML = '🔒 You\'ve reached your daily limit of ' + _freeLimit + ' free questions.<br>Upgrade to Premium for unlimited practice.' +
          '<br><button class="btn-primary" type="button">Upgrade Now</button>';
        var _upBtn = banner.querySelector('button');
        if (_upBtn) _upBtn.addEventListener('click', function () { showPaywall('settings'); });
        modeSelectEl.parentNode.insertBefore(banner, modeSelectEl);
      }
    }
    showPaywall('settings');
    return;
  }
  var modeSelect = document.getElementById('modeSelect');
  var categorySelect = document.getElementById('categorySelect');
  var customPracticeConfig = document.getElementById('customPracticeConfig');
  var drillContainer = document.getElementById('drillContainer');
  if (!modeSelect || !categorySelect || !drillContainer) return;

  var timerCfg = _getTimerConfig();
  var _canAdaptive = (typeof canAccessFeature === 'function') ? canAccessFeature('adaptive_training') : false;
  var _useAdaptive = _adaptiveModeActive && _canAdaptive && (modeKey === 'focus' || modeKey === 'custom');

  var modes = {
    quick:  { count: 5,  timeLimitSec: null, perQuestionSec: null, category: null, mode: '⚡ Quick Drill' },
    reflex: { count: 10, timeLimitSec: null, perQuestionSec: 15,   category: null, mode: '🧠 Reflex Drill', autoAdvance: true },
    timed:  { count: 10, timeLimitSec: 180,  perQuestionSec: null, category: null, mode: '⏱ Timed Test' },
    focus:  { count: 10, timeLimitSec: timerCfg.timeLimitSec, perQuestionSec: timerCfg.perQuestionSec, category: null, mode: _useAdaptive ? '🎯 Focus Training (Adaptive)' : '🎯 Focus Training', adaptive: _useAdaptive },
    custom: { count: _customPracticeState.totalQuestions, timeLimitSec: timerCfg.timeLimitSec, perQuestionSec: timerCfg.perQuestionSec, category: null, topics: selectedTopics.slice(), mode: _useAdaptive ? '📑 Custom Training (Adaptive)' : '📑 Custom Training', adaptive: _useAdaptive },
    review: { count: 10, timeLimitSec: null, perQuestionSec: null, category: null, mode: '🔄 Review Mistakes', reviewMode: true },
    mixed:  { count: 12, timeLimitSec: null, perQuestionSec: null, category: null, topics: _mixedAptitudeTopics(), mode: '🎨 Mixed Aptitude' }
  };

  var config = Object.assign({}, modes[modeKey] || modes.quick);
  if (category) {
    config.category = category;
    config.mode = '🎯 ' + (categoryLabel || category);
  }
  /* ADR-080: a Quick-Start session can be scoped to a chosen SUBJECT (Quant / DI / LR / Mixed) via the
     subject-selection modal — pass its categories as `topics` so the quick/reflex/timed pool draws from that subject
     instead of defaulting to Quant. The mode label gets a subject suffix so the drill header reads honestly. */
  if (opts.topics && opts.topics.length && !category) {
    config.topics = opts.topics.slice();
    if (opts.subjectLabel) config.mode = config.mode + ' · ' + opts.subjectLabel;
  }
  /* ADR-091: the habitual path costs one tap — the Home warmup goes straight to Question 1 (the
     interstitial shows the same four facts every day; it stays for Practice-tab launches, where the
     mode choice is a real decision). Same engine opt startSessionReview already uses. */
  if (opts.skipStartScreen === true) config.skipStartScreen = true;

  config.onFinish = function (view) {
    if (_activeDrillEngine) {
      _activeDrillEngine.cleanup();
      _activeDrillEngine = null;
    }
    /* Remove fullscreen results overlay before navigating */
    var _dc = document.getElementById('drillContainer');
    if (_dc) {
      _dc.classList.remove('drill-results-active');
      _dc.style.display = 'none';
    }
    if (_drillSessionActive && typeof FirestoreSync !== 'undefined') {
      FirestoreSync.endDrillBatch();
    }
    _exitDrillSession();
    if (view === 'practice') {
      _resetPracticeUiToModes();
    }
    Router.showView(view);
  };

  modeSelect.style.display = 'none';
  categorySelect.style.display = 'none';
  if (customPracticeConfig) customPracticeConfig.style.display = 'none';
  drillContainer.style.display = 'block';

  if (typeof AdaptiveState !== 'undefined') {
    AdaptiveState.setPattern(null);
  } else {
    window._sessionAdaptivePattern = null;
  }
  _startPracticeEngine(drillContainer, config);
}

/* ---- Sectional-timer mock (Phase D): a timed quant-section simulation of the chosen exam ----
 * Builds a weightage-true deck from the exam's drillable topics and runs it under the exam's real
 * section clock + marking scheme. Reuses the proven drill engine via _preloadedQuestions. */
function startMockFromPractice(examId) {
  if (typeof QR_MOCK === 'undefined' || typeof generateQuestions !== 'function') return;
  /* Defensive entitlement gate (PREM-5, ADR-107): Timed Mock is Premium-only. The card handler checks this before
     calling, but keeping the gate at the launcher head means ANY future caller (deep link, retry, test) is safe —
     the entitlement is enforced in one authoritative place, not only at the UI entry point. Premium users have an
     Infinity daily limit, so the 20/day cap never blocks a mock. */
  if (typeof canAccessFeature === 'function' && !canAccessFeature('timed_mocks')) {
    if (typeof showPaywall === 'function') showPaywall('timed_mocks');
    return;
  }
  if (typeof hasPremiumAccess === 'function' && !hasPremiumAccess()) {
    if (typeof showPaywall === 'function') showPaywall('premium_required');
    return;
  }
  var built = QR_MOCK.buildMockDeck(examId, function (cat, n) { return generateQuestions(n || 1, cat); });
  if (!built || !built.deck || !built.deck.length) {
    if (typeof showToast === 'function') showToast('A mock isn\'t available for this exam yet.');
    return;
  }
  var mock = built.mock;
  var drillContainer = document.getElementById('drillContainer');
  var modeSelect = document.getElementById('modeSelect');
  var categorySelect = document.getElementById('categorySelect');
  var customPracticeConfig = document.getElementById('customPracticeConfig');
  if (!drillContainer) return;

  var config = {
    count: mock.totalQuestions,
    timeLimitSec: mock.durationSec,     // the single section clock — auto-submits on zero (engine behaviour)
    perQuestionSec: null,
    category: null,
    mode: '📝 ' + mock.examName + ' Mock',
    _preloadedQuestions: built.deck,
    /* Inject the EXAM-ACCURATE score (its own marking scheme) into the results card when it renders — this is
       what makes the mock a "real marking scheme" test rather than a plain drill. (Raw attempts are persisted
       by the drill engine via savePracticeSession; feeding the planner's mock-trend is a server-side follow-up.) */
    onResults: function (summary, container) {
      if (!summary || typeof QR_MOCK === 'undefined' || !container) return;
      var scored = QR_MOCK.score(mock, { correct: summary.correct, attempted: summary.attempted }, { elapsedSec: summary.totalTimeSec });
      var negNote = mock.negPerWrong ? (' · −' + mock.negPerWrong + ' per wrong') : ' · no negative marking';
      var el = document.createElement('div');
      el.className = 'mock-score-summary';
      el.setAttribute('style', 'margin:0 0 14px;padding:12px 14px;border-radius:12px;background:rgba(0,0,0,0.05);text-align:center;');
      el.innerHTML = '<h3 style="margin:0 0 4px;">' + mock.examName + ' — exam score</h3>' +
        '<p style="margin:0;font-size:1.4em;"><strong>' + scored.score + ' / ' + scored.maxScore + '</strong>' + negNote + '</p>' +
        '<p style="margin:6px 0 0;opacity:0.8;">Attempted ' + scored.attempted + '/' + mock.totalQuestions + ' · Correct ' + scored.correct + ' · Wrong ' + scored.wrong + ' · Skipped ' + scored.skipped + '</p>' +
        (scored.secPerQ ? '<p style="margin:4px 0 0;opacity:0.8;">Pace ' + scored.secPerQ + 's/Q (budget ' + mock.secondsPerQuestion + 's)</p>' : '');
      var card = container.querySelector('.card');
      if (card) card.insertBefore(el, card.firstChild); else container.appendChild(el);
    },
    onFinish: function (view) {
      if (_activeDrillEngine) { _activeDrillEngine.cleanup(); _activeDrillEngine = null; }
      var _dc = document.getElementById('drillContainer');
      if (_dc) { _dc.classList.remove('drill-results-active'); _dc.style.display = 'none'; }
      if (_drillSessionActive && typeof FirestoreSync !== 'undefined') FirestoreSync.endDrillBatch();
      _exitDrillSession();
      if (view === 'practice') _resetPracticeUiToModes();
      Router.showView(view);
    }
  };

  if (modeSelect) modeSelect.style.display = 'none';
  if (categorySelect) categorySelect.style.display = 'none';
  if (customPracticeConfig) customPracticeConfig.style.display = 'none';
  drillContainer.style.display = 'block';
  if (typeof AdaptiveState !== 'undefined') AdaptiveState.setPattern(null); else window._sessionAdaptivePattern = null;
  _startPracticeEngine(drillContainer, config);
}

/* ---- Session review launcher: replay THIS session's missed questions from memory ---- */
/* Free for everyone by design — the wrong question objects (chart/figure specs intact) are still in
   memory when the results card offers "Review these N now", so no persistence and no premium-archive
   giveaway. The cross-session Review Mistakes mode stays premium. Skips the pre-session start screen:
   the user committed by tapping the action. */
function startSessionReview(wrongQuestions) {
  if (!Array.isArray(wrongQuestions) || !wrongQuestions.length) return;
  if (typeof hasReachedDailyLimit === 'function' && hasReachedDailyLimit()) { showPaywall('settings'); return; }
  var drillContainer = document.getElementById('drillContainer');
  if (!drillContainer) return;

  var config = {
    count: wrongQuestions.length,
    timeLimitSec: null, perQuestionSec: null, category: null,
    _preloadedQuestions: wrongQuestions,
    skipStartScreen: true,
    mode: '🔄 Session Review',
    onFinish: function (view) {
      if (_activeDrillEngine) { _activeDrillEngine.cleanup(); _activeDrillEngine = null; }
      var _dc = document.getElementById('drillContainer');
      if (_dc) { _dc.classList.remove('drill-results-active'); _dc.style.display = 'none'; }
      if (_drillSessionActive && typeof FirestoreSync !== 'undefined') FirestoreSync.endDrillBatch();
      _exitDrillSession();
      if (view === 'practice') _resetPracticeUiToModes();
      Router.showView(view);
    }
  };

  drillContainer.classList.remove('drill-results-active');
  drillContainer.style.display = 'block';
  if (typeof AdaptiveState !== 'undefined') AdaptiveState.setPattern(null); else window._sessionAdaptivePattern = null;
  _startPracticeEngine(drillContainer, config);
}

/* ---- DI Set launcher (ADR-078): one shared chart + linked questions, served by the same drill engine ---- */
function startDiSet(category) {
  if (typeof DISetEngine === 'undefined' || !DISetEngine.generateSet) {
    /* engine not loaded → degrade gracefully to a normal DI focus drill */
    return startDrillFromPractice('focus', category || 'di-bar', 'Data Interpretation');
  }
  /* The 20/day question cap also applies at launch — a set's questions count toward it, so if the user is already
     out of daily questions, don't start a new one (ADR-107). */
  if (typeof hasReachedDailyLimit === 'function' && hasReachedDailyLimit()) { showPaywall('daily_limit'); return; }
  /* Per-day SET quota (ADR-107): free users get ONE new DI set per day; Premium is unlimited. Gated on the daily
     counter + hasPremiumAccess (NOT _LOCKED_FEATURES — this is a per-day quota, not an all-or-nothing lock). */
  var _isPremiumSet = (typeof hasPremiumAccess === 'function') ? hasPremiumAccess() : false;
  if (!_isPremiumSet && typeof getSetsStartedToday === 'function' && getSetsStartedToday('di') >= 1) {
    if (typeof showPaywall === 'function') showPaywall('diset_limit');
    return;
  }
  var cats = ['di-bar', 'di-line', 'di-pie', 'di-table', 'di-caselet'];
  var cat = category || cats[Math.floor(Math.random() * cats.length)];
  var set = DISetEngine.generateSet(cat);
  if (!set || !set.questions || !set.questions.length) { if (typeof showToast === 'function') showToast('Could not build a DI set — try again.'); return; }

  var modeSelect = document.getElementById('modeSelect');
  var categorySelect = document.getElementById('categorySelect');
  var customPracticeConfig = document.getElementById('customPracticeConfig');
  var drillContainer = document.getElementById('drillContainer');
  if (!drillContainer) return;

  var label = (typeof DIEngine !== 'undefined' && DIEngine.label) ? DIEngine.label(set.category) : 'DI';
  var config = {
    count: set.questions.length,
    timeLimitSec: null, perQuestionSec: null, category: null,
    diSet: set,
    mode: '📊 ' + label + ' Set',
    onFinish: function (view) {
      if (_activeDrillEngine) { _activeDrillEngine.cleanup(); _activeDrillEngine = null; }
      var _dc = document.getElementById('drillContainer');
      if (_dc) { _dc.classList.remove('drill-results-active'); _dc.style.display = 'none'; }
      if (_drillSessionActive && typeof FirestoreSync !== 'undefined') FirestoreSync.endDrillBatch();
      _exitDrillSession();
      if (view === 'practice') _resetPracticeUiToModes();
      Router.showView(view);
    }
  };

  if (modeSelect) modeSelect.style.display = 'none';
  if (categorySelect) categorySelect.style.display = 'none';
  if (customPracticeConfig) customPracticeConfig.style.display = 'none';
  drillContainer.style.display = 'block';
  if (typeof AdaptiveState !== 'undefined') AdaptiveState.setPattern(null); else window._sessionAdaptivePattern = null;
  /* Count this granted start against today's DI-set quota (ADR-107). Only for free users — Premium is unlimited so
     the counter is irrelevant to them. Recorded here (after all validation passes) so a build failure never burns
     the day's one free set. */
  if (!_isPremiumSet && typeof recordSetStarted === 'function') recordSetStarted('di');
  _startPracticeEngine(drillContainer, config);
}

/* ---- LR Set launcher (ADR-079): one shared seating/floor scenario + linked MCQs, served by the same set-mode ---- */
function startLrSet(category) {
  if (typeof LRSetEngine === 'undefined' || !LRSetEngine.generateSet) {
    return startDrillFromPractice('focus', category || 'lr-syllogism', 'Logical Reasoning');
  }
  /* The 20/day question cap also applies at launch (ADR-107) — a set's questions count toward it. */
  if (typeof hasReachedDailyLimit === 'function' && hasReachedDailyLimit()) { showPaywall('daily_limit'); return; }
  /* Per-day SET quota (ADR-107): free users get ONE new Reasoning set per day; Premium unlimited. */
  var _isPremiumSet = (typeof hasPremiumAccess === 'function') ? hasPremiumAccess() : false;
  if (!_isPremiumSet && typeof getSetsStartedToday === 'function' && getSetsStartedToday('lr') >= 1) {
    if (typeof showPaywall === 'function') showPaywall('lrset_limit');
    return;
  }
  var cats = ['lr-seating', 'lr-puzzle'];
  var cat = category || cats[Math.floor(Math.random() * cats.length)];
  var set = LRSetEngine.generateSet(cat);
  if (!set || !set.questions || !set.questions.length) { if (typeof showToast === 'function') showToast('Could not build an LR set — try again.'); return; }

  var modeSelect = document.getElementById('modeSelect');
  var categorySelect = document.getElementById('categorySelect');
  var customPracticeConfig = document.getElementById('customPracticeConfig');
  var drillContainer = document.getElementById('drillContainer');
  if (!drillContainer) return;

  var label = (cat === 'lr-puzzle') ? 'Puzzle' : 'Seating';
  var config = {
    count: set.questions.length,
    timeLimitSec: null, perQuestionSec: null, category: null,
    diSet: set,
    mode: '🧩 ' + label + ' Set',
    onFinish: function (view) {
      if (_activeDrillEngine) { _activeDrillEngine.cleanup(); _activeDrillEngine = null; }
      var _dc = document.getElementById('drillContainer');
      if (_dc) { _dc.classList.remove('drill-results-active'); _dc.style.display = 'none'; }
      if (_drillSessionActive && typeof FirestoreSync !== 'undefined') FirestoreSync.endDrillBatch();
      _exitDrillSession();
      if (view === 'practice') _resetPracticeUiToModes();
      Router.showView(view);
    }
  };

  if (modeSelect) modeSelect.style.display = 'none';
  if (categorySelect) categorySelect.style.display = 'none';
  if (customPracticeConfig) customPracticeConfig.style.display = 'none';
  drillContainer.style.display = 'block';
  if (typeof AdaptiveState !== 'undefined') AdaptiveState.setPattern(null); else window._sessionAdaptivePattern = null;
  /* Count this granted start against today's Reasoning-set quota (ADR-107); free users only. */
  if (!_isPremiumSet && typeof recordSetStarted === 'function') recordSetStarted('lr');
  _startPracticeEngine(drillContainer, config);
}

function _startPracticeEngine(drillContainer, config) {
  if (_activeDrillEngine) {
    _activeDrillEngine.cleanup();
  }
  var engine = createDrillEngine(drillContainer, config);
  _activeDrillEngine = engine;
  engine.start();
}

/**
 * Initialize practice view — register Router callbacks.
 * Called once from app.js DOMContentLoaded.
 */
function initPracticeView() {
  Router.onShow('practice', function () {
    if (_activeDrillEngine) {
      _activeDrillEngine.cleanup();
      _activeDrillEngine = null;
    }
    if (_drillSessionActive && typeof FirestoreSync !== 'undefined') {
      FirestoreSync.endDrillBatch();
    }
    _exitDrillSession();
    /* Remove fullscreen results overlay if still present */
    var _dc = document.getElementById('drillContainer');
    if (_dc) {
      _dc.classList.remove('drill-results-active');
    }

    /* Daily quota indicator (free users only) */
    if (typeof _renderDailyQuota === 'function') {
      _renderDailyQuota((typeof loadProgress === 'function') ? loadProgress() : {});
    }

    _resetPracticeUiToModes();
  });

  Router.onInit('practice', function () {
    var modeSelect = document.getElementById('modeSelect');
    var categorySelect = document.getElementById('categorySelect');
    var customPracticeConfig = document.getElementById('customPracticeConfig');
    var drillContainer = document.getElementById('drillContainer');
    var customSlider = document.getElementById('customQuestionCount');
    var customStartBtn = document.getElementById('startCustomSessionBtn');
    _customPracticeDom.slider = customSlider;
    _customPracticeDom.value = document.getElementById('customQuestionCountValue');
    _customPracticeDom.text = document.getElementById('customQuestionCountText');
    _customPracticeDom.error = document.getElementById('customModeError');
    if (!modeSelect || !categorySelect || !drillContainer) return;

    var modeCards = modeSelect.querySelectorAll('.mode-card');
    for (var i = 0; i < modeCards.length; i++) {
      modeCards[i].addEventListener('click', function () {
        /* Word Problems is intentionally staged for a future launch — open the Coming Soon modal and do
           NOTHING else: no session, no question generation, no navigation, no analytics, no backend (ADR-031
           release scope). Intercept BEFORE the practice-action gate / sound / dispatch. */
        if (this.getAttribute('data-mode') === 'wordproblems') {
          if (typeof showComingSoon === 'function') showComingSoon({ title: 'Word Problems', blurb: 'AI-crafted, exam-style word problems that test comprehension and calculation — not just speed. We’re putting the final polish on it. Launching soon for Premium.' });
          return;
        }
        if (!_tryPracticeAction()) return;
        SoundEngine.play('settingsToggle');
        var modeKey = this.getAttribute('data-mode');
        /* NOTE: Word Problems is intercepted at the top of this handler (Coming-Soon modal + return), so it never
           reaches the dispatch below — the old live-session launcher that used to live here was unreachable dead code
           and was removed in ADR-087. */
        if (modeKey === 'custom') {
          if (!canAccessFeature('custom_training')) { showPaywall('custom_training'); return; }
          _customPracticeActive = true;
          _focusModeActive = false;
          modeSelect.style.display = 'none';
          categorySelect.style.display = 'flex';
          if (customPracticeConfig) customPracticeConfig.style.display = 'block';
          var focusStartSec2 = document.getElementById('focusStartSection');
          if (focusStartSec2) focusStartSec2.style.display = 'none';
          var catTitle2 = document.getElementById('categorySelectTitle');
          if (catTitle2) catTitle2.textContent = 'Custom Training';
          _resetTimerSelection();
          _resetAdaptiveToggle();
          _resetCustomPracticeState();
          if (typeof CategoryPicker !== 'undefined') CategoryPicker.render();   /* ADR-084: dynamic picker from source of truth */
          _syncCustomPracticeSelectionUi();
          return;
        }
        if (modeKey === 'mock') {
          /* Timed Mock is Premium-only (entitlement: timed_mocks), mirroring the custom/review gate. */
          if (!canAccessFeature('timed_mocks')) { showPaywall('timed_mocks'); return; }
          var _isPremMock = (typeof hasPremiumAccess === 'function') ? hasPremiumAccess() : false;
          if (!_isPremMock) { showPaywall('premium_required'); return; }
          var _mockExam = '';
          try { _mockExam = (typeof TargetExam !== 'undefined' && TargetExam.get()) || ''; } catch (_) {}
          if (!_mockExam) {
            if (typeof showToast === 'function') showToast('Set your target exam in Settings to take a mock.');
            if (typeof Router !== 'undefined') { try { Router.showView('settings'); } catch (_) {} }
            return;
          }
          _customPracticeActive = false;
          _focusModeActive = false;
          startMockFromPractice(_mockExam);
          return;
        }
        if (modeKey === 'diset') {
          _customPracticeActive = false;
          _focusModeActive = false;
          startDiSet();
          return;
        }
        if (modeKey === 'lrset') {
          _customPracticeActive = false;
          _focusModeActive = false;
          startLrSet();
          return;
        }
        _customPracticeActive = false;
        if (modeKey === 'focus') {
          _focusModeActive = true;
          _focusSelectedCategory = null;
          _focusSelectedCategoryLabel = null;
          modeSelect.style.display = 'none';
          categorySelect.style.display = 'flex';
          var focusStartSec = document.getElementById('focusStartSection');
          if (focusStartSec) focusStartSec.style.display = 'none';
          var catTitle = document.getElementById('categorySelectTitle');
          if (catTitle) catTitle.textContent = 'Focus Training';
          _resetTimerSelection();
          _resetAdaptiveToggle();
          if (typeof CategoryPicker !== 'undefined') CategoryPicker.render();   /* ADR-084: dynamic picker from source of truth */
          _syncCustomPracticeSelectionUi();
        } else if (modeKey === 'review') {
          if (!canAccessFeature('review_mistakes')) { showPaywall('review_mistakes'); return; }
          startDrillFromPractice('review');
        } else if (modeKey === 'quick' || modeKey === 'reflex' || modeKey === 'timed') {
          /* ADR-080: ask which subject first (unless the user opted out) — then launch the session scoped to it. */
          _launchQuickStart(modeKey);
        } else {
          startDrillFromPractice(modeKey);
        }
      });
    }

    var catBtns = categorySelect.querySelectorAll('.category-btn');
    _customPracticeDom.catBtns = catBtns;
    categorySelect.addEventListener('click', function (e) {
      var target = e.target;
      if (!target || !target.classList || !target.classList.contains('category-btn')) return;
      if (!_tryPracticeAction()) return;
      SoundEngine.play('settingsToggle');
      var cat = target.getAttribute('data-cat');
      if (!cat) return;
      if (_customPracticeActive) {
        _toggleCustomPracticeTopic(cat);
        _syncCustomPracticeSelectionUi();
        if (_customPracticeDom.error) _customPracticeDom.error.textContent = '';
        return;
      }
      if (_focusModeActive) {
        var allCatBtns = categorySelect.querySelectorAll('.category-btn');
        for (var cb = 0; cb < allCatBtns.length; cb++) allCatBtns[cb].classList.remove('selected');
        target.classList.add('selected');
        _focusSelectedCategory = cat;
        /* Prefer the explicit data-label (ADR-084) so decorations inside the button — e.g. a pin star — never leak
           into the drill's category label. */
        _focusSelectedCategoryLabel = target.getAttribute('data-label') || target.textContent;
        var focusStartSec = document.getElementById('focusStartSection');
        if (focusStartSec) focusStartSec.style.display = 'block';
        if (typeof CategoryPicker !== 'undefined' && CategoryPicker.noteRecent) CategoryPicker.noteRecent(cat);
        return;
      }
      if (typeof CategoryPicker !== 'undefined' && CategoryPicker.noteRecent) CategoryPicker.noteRecent(cat);
      startDrillFromPractice('focus', cat, target.getAttribute('data-label') || target.textContent);
    });

    var focusStartBtn = document.getElementById('startFocusSessionBtn');
    if (focusStartBtn) {
      focusStartBtn.addEventListener('click', function () {
        if (!_tryPracticeAction()) return;
        if (!_focusSelectedCategory) { showToast('Please select a category first.'); return; }
        startDrillFromPractice('focus', _focusSelectedCategory, _focusSelectedCategoryLabel);
      });
    }

    _initTimerControls();
    _initAdaptiveToggle();

    if (customSlider) {
      customSlider.addEventListener('input', function () {
        var val = parseInt(customSlider.value, 10);
        if (isNaN(val)) val = _CUSTOM_DEFAULT_QUESTIONS;
        _customPracticeState.totalQuestions = Math.max(_CUSTOM_MIN_QUESTIONS, Math.min(_CUSTOM_MAX_QUESTIONS, val));
        _updateCustomQuestionCountUI();
      });
    }

    if (customStartBtn) {
      customStartBtn.addEventListener('click', function () {
        if (!_tryPracticeAction()) return;
        if (!canAccessFeature('custom_training')) { showPaywall('custom_training'); return; }
        if (selectedTopics.length === 0) {
          if (_customPracticeDom.error) _customPracticeDom.error.textContent = 'Please select at least one topic';
          return;
        }
        startDrillFromPractice('custom');
      });
    }

    var backToModesBtn = document.getElementById('backToModes');
    if (backToModesBtn) {
      backToModesBtn.addEventListener('click', function () {
        _exitDrillSession();
        _resetPracticeUiToModes();
      });
    }
  });
}
