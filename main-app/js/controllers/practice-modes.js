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

function startDrillFromPractice(modeKey, category, categoryLabel) {
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
        var banner = document.createElement('div');
        banner.className = 'daily-limit-banner';
        banner.innerHTML = '🔒 You\'ve reached your daily limit of 20 free questions.<br>Upgrade to Premium for unlimited practice.' +
          '<br><button class="btn-primary" onclick="showPaywall(\'settings\')">Upgrade Now</button>';
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
    reflex: { count: 10, timeLimitSec: null, perQuestionSec: 15,   category: null, mode: '🧠 Reflex Drill' },
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

/* ---- DI Set launcher (ADR-078): one shared chart + linked questions, served by the same drill engine ---- */
function startDiSet(category) {
  if (typeof DISetEngine === 'undefined' || !DISetEngine.generateSet) {
    /* engine not loaded → degrade gracefully to a normal DI focus drill */
    return startDrillFromPractice('focus', category || 'di-bar', 'Data Interpretation');
  }
  if (typeof hasReachedDailyLimit === 'function' && hasReachedDailyLimit()) { showPaywall('settings'); return; }
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
  _startPracticeEngine(drillContainer, config);
}

/* ---- LR Set launcher (ADR-079): one shared seating/floor scenario + linked MCQs, served by the same set-mode ---- */
function startLrSet(category) {
  if (typeof LRSetEngine === 'undefined' || !LRSetEngine.generateSet) {
    return startDrillFromPractice('focus', category || 'lr-syllogism', 'Logical Reasoning');
  }
  if (typeof hasReachedDailyLimit === 'function' && hasReachedDailyLimit()) { showPaywall('settings'); return; }
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
        if (modeKey === 'wordproblems') {
          _customPracticeActive = false;
          _focusModeActive = false;
          modeSelect.style.display = 'none';
          var wpSetup = document.getElementById('wordProblemsSetup');
          if (wpSetup && typeof AIFeatures !== 'undefined') {
            wpSetup.style.display = 'flex';
            AIFeatures.renderWordProblemsSetup(wpSetup, function (questions, cat, diff, wpTimerCfg) {
              wpSetup.style.display = 'none';
              var dc = document.getElementById('drillContainer');
              if (!dc) return;
              dc.style.display = 'block';
              var _tCfg = wpTimerCfg || { timeLimitSec: null, perQuestionSec: null };
              var cfg = {
                count: questions.length,
                timeLimitSec: _tCfg.timeLimitSec,
                perQuestionSec: _tCfg.perQuestionSec,
                category: cat,
                mode: '🤖 Word Problems (' + diff + ')',
                onFinish: function (view) {
                  if (_activeDrillEngine) { _activeDrillEngine.cleanup(); _activeDrillEngine = null; }
                  /* Remove fullscreen results overlay */
                  var _dc = document.getElementById('drillContainer');
                  if (_dc) { _dc.classList.remove('drill-results-active'); _dc.style.display = 'none'; }
                  if (_drillSessionActive && typeof FirestoreSync !== 'undefined') { FirestoreSync.endDrillBatch(); }
                  _exitDrillSession();
                  if (view === 'practice') _resetPracticeUiToModes();
                  Router.showView(view);
                }
              };
              cfg._preloadedQuestions = questions;
              _startPracticeEngine(dc, cfg);
            });
          }
          return;
        }
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
          _syncCustomPracticeSelectionUi();
          return;
        }
        if (modeKey === 'mock') {
          /* Timed Mock is Premium-only (entitlement: timed_mocks), mirroring the custom/review gate. */
          if (!canAccessFeature('timed_mocks')) { showPaywall('timed_mocks'); return; }
          var _isPremMock = (typeof hasPremiumAccess === 'function') ? hasPremiumAccess() : false;
          if (!_isPremMock) { showPaywall('premium_required'); return; }
          var _mockExam = '';
          try { _mockExam = localStorage.getItem('qr_active_exam') || ''; } catch (_) {}
          if (!_mockExam) {
            if (typeof showToast === 'function') showToast('Set up your study plan first to take a mock.');
            if (typeof Companion !== 'undefined' && Companion.openStudyPlanner) { try { Companion.openStudyPlanner(true); } catch (_) {} }
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
          _syncCustomPracticeSelectionUi();
        } else if (modeKey === 'review') {
          if (!canAccessFeature('review_mistakes')) { showPaywall('review_mistakes'); return; }
          startDrillFromPractice('review');
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
        _focusSelectedCategoryLabel = target.textContent;
        var focusStartSec = document.getElementById('focusStartSection');
        if (focusStartSec) focusStartSec.style.display = 'block';
        return;
      }
      startDrillFromPractice('focus', cat, target.textContent);
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
