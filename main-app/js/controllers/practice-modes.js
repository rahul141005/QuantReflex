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
    review: { count: 10, timeLimitSec: null, perQuestionSec: null, category: null, mode: '🔄 Review Mistakes', reviewMode: true }
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

    /* Today's Progress strip (all users) */
    var _todayStrip = document.getElementById('practiceTodayStrip');
    if (_todayStrip) {
      var _tp = (typeof loadProgress === 'function') ? (loadProgress() || {}) : {};
      var _ta = _tp.todayAttempted || 0;
      var _tc = _tp.todayCorrect || 0;
      var _acc = _ta > 0 ? Math.round((_tc / _ta) * 100) : 0;
      var _streak = _tp.dailyStreak || 0;
      _todayStrip.innerHTML =
        '<div class="practice-today-item"><span class="practice-today-value">' + _ta + '</span><span class="practice-today-label">Questions</span></div>' +
        '<div class="practice-today-item"><span class="practice-today-value">' + _acc + '%</span><span class="practice-today-label">Accuracy</span></div>' +
        '<div class="practice-today-item"><span class="practice-today-value">' + _streak + ' 🔥</span><span class="practice-today-label">Day Streak</span></div>';
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
