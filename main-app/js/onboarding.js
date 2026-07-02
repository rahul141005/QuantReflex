/**
 * onboarding.js — Premium onboarding experience
 *
 * Manages a seven-screen onboarding flow:
 *   1. Introduction (name — optional)
 *   2. Target Exam (tier → exam, skippable)
 *   3. Learn & Drill
 *   4. Stats
 *   5. Daily Goal Selection
 *   6. Ready to Train
 *   7. First Question (up to 3 attempts with guided retry)
 *
 * Display logic:
 *   - Shows only when `onboardingCompleted` is false in settings.
 *   - Stores `dailyGoal` in quant_reflex_settings; target exam via TargetExam.
 *   - Sets `onboardingCompleted = true` on completion.
 *
 * Skip behavior:
 *   - Skip jumps to the Daily Goal screen.
 *   - After selecting a goal, skips remaining screens and goes to Home.
 *
 * Analytics:
 *   - Records each onboarding question attempt via recordAnswer().
 */

var Onboarding = (function () {
  var SETTINGS_KEY = 'quant_reflex_settings';
  var _overlay = null;
  var _currentScreen = 0;
  var _skipped = false;
  var _selectedGoal = 20;
  var _displayName = '';
  var _selectedExam = '';         /* QR_SYLLABUS exam id chosen on the exam screen ('' = not chosen) */
  var _selectedTierId = '';       /* tier the user tapped (drives the exam-stage list) */
  var _examStage = 'tier';        /* 'tier' | 'exam' — two-stage picker inside one screen */
  var _onComplete = null;
  var _questionAttempt = 0;       /* 0-based: tracks which attempt (0, 1, 2) */
  var _isShowing = false;         /* re-entry guard: true while onboarding is visible */
  var _currentQuestion = null;    /* current question object {text, answer} */

  /* Numpad re-show tracking — prevents duplicate listener stacking */
  var _numpadBoundInput = null;
  var _numpadFocusHandler = null;
  var _numpadClickHandler = null;
  var _numpadTouchHandler = null;
  var _numpadPointerdownHandler = null;
  var _numpadVisibilityHandler = null;
  var _numpadPageshowHandler = null;
  var _numpadEnsuring = false; /* re-entry guard for ensureNumpadVisibleForActiveInput */

  /** Escape HTML special characters to prevent XSS when inserting user text */
  function _escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Simple easy questions for the first question screen — very easy only.
     Each question has a real category so analytics are accurate.
     No addition or subtraction — only question types users will practice.
     INTENTIONAL narrowed subset (ADR-084): onboarding shows only trivial mental-math categories, deliberately NOT the
     full Quant set in services/quantTopics.js. Not a stale list. */
  var EASY_QUESTIONS = [
    { text: '12 × 5 = ?', answer: 60, category: 'multiplication' },
    { text: '8 × 7 = ?', answer: 56, category: 'multiplication' },
    { text: '15 × 4 = ?', answer: 60, category: 'multiplication' },
    { text: '9 × 6 = ?', answer: 54, category: 'multiplication' },
    { text: '11 × 3 = ?', answer: 33, category: 'multiplication' },
    { text: '25 × 2 = ?', answer: 50, category: 'multiplication' },
    { text: '6 × 4 = ?', answer: 24, category: 'multiplication' },
    { text: '5 × 9 = ?', answer: 45, category: 'multiplication' },
    { text: '3 × 8 = ?', answer: 24, category: 'multiplication' },
    { text: '7 × 5 = ?', answer: 35, category: 'multiplication' },
    { text: '50% of 40 = ?', answer: 20, category: 'percentages' },
    { text: '10% of 90 = ?', answer: 9, category: 'percentages' },
    { text: '25% of 80 = ?', answer: 20, category: 'percentages' },
    { text: '5² = ?', answer: 25, category: 'squares' },
    { text: '7² = ?', answer: 49, category: 'squares' },
    { text: '2³ = ?', answer: 8, category: 'cubes' }
  ];

  /**
   * Pick a random easy question, avoiding the current one.
   */
  function _pickNewQuestion() {
    var pool = EASY_QUESTIONS;
    if (_currentQuestion && pool.length > 1) {
      pool = pool.filter(function (q) { return q.text !== _currentQuestion.text; });
    }
    _currentQuestion = pool[Math.floor(Math.random() * pool.length)];
    return _currentQuestion;
  }

  /**
   * Check if onboarding should be shown.
   * Returns false if already showing (re-entry guard).
   * @returns {boolean}
   */
  function shouldShow() {
    /* Prevent double-show from race conditions */
    if (_isShowing) return false;
    if (typeof AppState !== 'undefined') {
      var s = AppState.getSettings();
      return !s.onboardingCompleted;
    }
    try {
      var settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return !settings.onboardingCompleted;
    } catch (_) {
      return true;
    }
  }

  /**
   * Mark onboarding as started — writes onboardingCompleted=true IMMEDIATELY
   * to both AppState and localStorage so that any concurrent shouldShow()
   * calls return false. This prevents the race condition where auth callbacks
   * trigger onboarding twice.
   */
  function _markStarted() {
    try {
      if (typeof AppState !== 'undefined') {
        var s = AppState.getSettings();
        s.onboardingCompleted = true;
        AppState.setSettings(s);
      }
      var raw = localStorage.getItem(SETTINGS_KEY);
      var settings = raw ? JSON.parse(raw) : {};
      settings.onboardingCompleted = true;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (_) { /* ignore */ }
  }

  /**
   * Mark onboarding as completed and save the daily goal.
   */
  function _markCompleted() {
    try {
      // Stamp the day the user started (ISO) once, so the Profile can say "started mathing on <date>" reliably —
      // independent of the server account-creation timestamp. Set only if not already present (idempotent).
      var startedAt = new Date().toISOString();
      var settings;
      if (typeof AppState !== 'undefined') {
        settings = AppState.getSettings();
        settings.onboardingCompleted = true;
        if (!settings.onboardingCompletedAt) settings.onboardingCompletedAt = startedAt;
        settings.dailyGoal = _selectedGoal;
        AppState.setSettings(settings);
      } else {
        settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        settings.onboardingCompleted = true;
        if (!settings.onboardingCompletedAt) settings.onboardingCompletedAt = startedAt;
        settings.dailyGoal = _selectedGoal;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      }
      if (typeof FirestoreSync !== 'undefined') {
        FirestoreSync.syncSettings(settings);
        /* Save user name to Firestore profile */
        if (_displayName) {
          FirestoreSync.updateProfileName(_displayName);
        }
      }
      /* Persist the target exam through the canonical accessor (synced settings + legacy mirror).
         Runs after syncSettings so the exam write is the final settings state. */
      if (_selectedExam && typeof TargetExam !== 'undefined') {
        TargetExam.set(_selectedExam);
      }
    } catch (_) { /* ignore */ }
  }

  /**
   * Save only the daily goal without completing onboarding.
   */
  function _saveDailyGoal() {
    try {
      if (typeof AppState !== 'undefined') {
        var settings = AppState.getSettings();
        settings.dailyGoal = _selectedGoal;
        AppState.setSettings(settings);
      } else {
        var s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        s.dailyGoal = _selectedGoal;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
      }
    } catch (_) { /* ignore */ }
  }

  /**
   * Build and show the onboarding overlay.
   * @param {function} onComplete - Called when onboarding finishes
   */
  function show(onComplete) {
    /* Re-entry guard — bail if already showing */
    if (_isShowing) return;
    _isShowing = true;

    /* Write onboardingCompleted=true IMMEDIATELY to prevent race conditions.
       The daily goal and profile name are written later in _markCompleted(). */
    _markStarted();

    _onComplete = onComplete;
    _currentScreen = 0;
    _skipped = false;
    _selectedGoal = 20;
    _selectedExam = '';
    _selectedTierId = '';
    _examStage = 'tier';
    _questionAttempt = 0;
    _currentQuestion = null;

    _overlay = document.getElementById('onboardingOverlay');
    if (!_overlay) { _isShowing = false; return; }

    _overlay.style.display = 'flex';
    _renderScreen(0);
  }

  /**
   * Navigate to a specific screen index.
   */
  function _goToScreen(index) {
    _currentScreen = index;
    _renderScreen(index);
  }

  /**
   * Show/hide the bottom nav for Screen 3 guidance.
   * When visible, only the Stats tab is shown and highlighted.
   * Nav links are display-only (no click navigation) during onboarding.
   */
  function _showStatsNavGuide() {
    var bottomNav = document.querySelector('.bottom-nav');
    if (!bottomNav) return;
    var links = bottomNav.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      var view = links[i].getAttribute('data-view');
      if (view === 'stats') {
        links[i].style.display = '';
        links[i].classList.add('active');
      } else {
        links[i].style.display = 'none';
      }
    }
    bottomNav.style.display = 'flex';
    bottomNav.style.zIndex = '10001';
    /* Prevent actual navigation — visual guide only */
    bottomNav.style.pointerEvents = 'none';
  }

  /**
   * Restore the bottom nav to its normal state after Screen 3.
   * Only resets the styles added by _showStatsNavGuide (zIndex, pointerEvents,
   * per-link display/active) — does NOT touch the nav's own display property
   * since onboarding runs before the main app is revealed.
   */
  function _hideStatsNavGuide() {
    var bottomNav = document.querySelector('.bottom-nav');
    if (!bottomNav) return;
    var links = bottomNav.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      links[i].style.display = '';
      links[i].classList.remove('active');
    }
    bottomNav.style.zIndex = '';
    bottomNav.style.pointerEvents = '';
    /* Hide the nav again — it was temporarily shown for Screen 3 guidance.
       The main app's _revealMainApp() will unhide it when onboarding completes. */
    bottomNav.style.display = 'none';
  }

  /**
   * Render the current screen inside the overlay.
   */
  function _renderScreen(index) {
    var card = _overlay.querySelector('.onboarding-card');
    if (!card) return;

    /* Clean up stats-screen nav guide if leaving it (stats is screen index 3) */
    if (_currentScreen !== 3 || index !== 3) {
      _hideStatsNavGuide();
    }

    /* Slide-out animation */
    card.classList.remove('onboarding-card-enter');
    card.classList.add('onboarding-card-exit');

    setTimeout(function () {
      var content = '';
      var totalScreens = _skipped ? 5 : 7;
      var dotIndex = index;

      switch (index) {
        case 0:
          content = _screen1();
          dotIndex = 0;
          break;
        case 1:
          content = _screenExam();
          dotIndex = 1;
          break;
        case 2:
          content = _screen2();
          dotIndex = 2;
          break;
        case 3:
          content = _screen3();
          dotIndex = 3;
          break;
        case 4:
          content = _screen4();
          dotIndex = 4;
          break;
        case 5:
          content = _screen5();
          dotIndex = 5;
          break;
        case 6:
          content = _screen6();
          dotIndex = 6;
          break;
      }

      /* Update progress dots */
      var dotsHtml = '<div class="onboarding-dots">';
      for (var i = 0; i < totalScreens; i++) {
        var activeClass = i === dotIndex ? ' onboarding-dot-active' : '';
        var completedClass = i < dotIndex ? ' onboarding-dot-completed' : '';
        dotsHtml += '<span class="onboarding-dot' + activeClass + completedClass + '"></span>';
      }
      dotsHtml += '</div>';

      card.innerHTML = content + dotsHtml;
      card.classList.remove('onboarding-card-exit');
      card.classList.add('onboarding-card-enter');

      /* Bind event handlers for this screen */
      _bindScreenHandlers(index);

      /* Show Stats nav guide on the stats screen */
      if (index === 3) {
        _showStatsNavGuide();
      }
    }, 180);
  }

  /* ---- Screen Content Generators ---- */

  function _screen1() {
    return '<div class="onboarding-visual">' +
      '<div class="onboarding-icon-anim">' +
      '<span class="onboarding-icon-main">🧠</span>' +
      '<span class="onboarding-icon-sparkle onboarding-sparkle-1">⚡</span>' +
      '<span class="onboarding-icon-sparkle onboarding-sparkle-2">✨</span>' +
      '</div></div>' +
      '<h2 class="onboarding-title">Sharpen Your Edge. Master Speed Aptitude.</h2>' +
      '<p class="onboarding-desc">Build elite reflexes across quant, data interpretation, and logical reasoning — through precision drills, QuanAI coaching, and competitive challenges.</p>' +
      '<div class="onboarding-name-field">' +
      '<label class="onboarding-name-label">What\'s your name?</label>' +
      '<input type="text" class="input onboarding-name-input" id="obNameInput" placeholder="Enter your name" maxlength="50" value="' + _escapeHtml(_displayName) + '" />' +
      '</div>' +
      '<div class="onboarding-actions">' +
      '<button class="btn-primary onboarding-next-btn" id="obNext">Next</button>' +
      '<button class="btn onboarding-skip-btn" id="obSkip">Skip</button>' +
      '</div>';
  }

  /* Target-exam screen — two stages inside one screen: tier cards, then that tier's exams.
     Data comes from QR_SYLLABUS (the one catalog the Planner also uses); a minimal fallback keeps
     onboarding functional if the catalog script ever fails to load. */
  function _tiers() {
    try {
      if (typeof QR_SYLLABUS !== 'undefined' && QR_SYLLABUS.TIERS && QR_SYLLABUS.TIERS.length) return QR_SYLLABUS.TIERS;
    } catch (_) {}
    return [
      { id: 'mba', label: 'MBA Entrance', blurb: 'CAT, XAT, SNAP, NMAT, CMAT, MAH CET', def: 'mbacet' },
      { id: 'banking', label: 'Banking', blurb: 'IBPS, SBI & more', def: 'ibpsclerk' },
      { id: 'government', label: 'Government Aptitude', blurb: 'SSC & Railways', def: 'ssccgl' },
      { id: 'foundation', label: 'Foundation', blurb: 'Build your calculation speed from scratch', def: 'foundation' }
    ];
  }

  function _tierExams(tierId) {
    try {
      if (typeof QR_SYLLABUS !== 'undefined' && typeof QR_SYLLABUS.examsByTier === 'function') {
        return QR_SYLLABUS.examsByTier(tierId) || [];
      }
    } catch (_) {}
    return [];
  }

  function _screenExam() {
    var html = '<div class="onboarding-visual"><span class="onboarding-goal-icon">🎯</span></div>';
    if (_examStage === 'exam' && _selectedTierId) {
      var tier = null;
      var tiers = _tiers();
      for (var t = 0; t < tiers.length; t++) if (tiers[t].id === _selectedTierId) tier = tiers[t];
      var exams = _tierExams(_selectedTierId);
      html += '<h2 class="onboarding-title">' + _escapeHtml(tier ? tier.label : 'Pick your exam') + '</h2>' +
        '<p class="onboarding-desc">Pick your exam — drills, mocks and study focus follow it.</p>' +
        '<div class="onboarding-goal-options onboarding-exam-list">';
      for (var i = 0; i < exams.length; i++) {
        var active = exams[i].id === _selectedExam;
        html += '<button class="onboarding-goal-btn onboarding-exam-btn' + (active ? ' onboarding-goal-active' : '') + '"' +
          ' data-exam="' + _escapeHtml(exams[i].id) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' +
          _escapeHtml(exams[i].name) + '</button>';
      }
      html += '</div>' +
        '<div class="onboarding-actions">' +
        '<button class="btn onboarding-skip-btn" id="obExamBack">← All exams</button>' +
        '</div>';
      return html;
    }
    html += '<h2 class="onboarding-title">What are you preparing for?</h2>' +
      '<p class="onboarding-desc">Your target shapes what you drill, mock and revise. You can change it anytime in Settings.</p>' +
      '<div class="onboarding-goal-options onboarding-exam-list">';
    var list = _tiers();
    for (var j = 0; j < list.length; j++) {
      html += '<button class="onboarding-goal-btn onboarding-tier-btn" data-tier="' + _escapeHtml(list[j].id) + '">' +
        '<span class="onboarding-tier-label">' + _escapeHtml(list[j].label) + '</span>' +
        '<span class="onboarding-tier-blurb">' + _escapeHtml(list[j].blurb || '') + '</span>' +
        '</button>';
    }
    html += '</div>' +
      '<p class="onboarding-note">Not sure yet? <a href="#" id="obExamFoundation">Start with Foundation</a></p>' +
      '<div class="onboarding-actions">' +
      '<button class="btn onboarding-skip-btn" id="obExamLater">Choose later</button>' +
      '</div>';
    return html;
  }

  function _screen2() {
    return '<div class="onboarding-visual">' +
      '<div class="onboarding-split-preview">' +
      '<div class="onboarding-preview-card"><span class="onboarding-preview-icon">📖</span><span class="onboarding-preview-label">Learn</span></div>' +
      '<div class="onboarding-preview-card"><span class="onboarding-preview-icon">🎯</span><span class="onboarding-preview-label">Drill</span></div>' +
      '</div></div>' +
      '<h2 class="onboarding-title">Learn Smarter. Practice Faster.</h2>' +
      '<p class="onboarding-desc">Use the Learn tab to master tables, formulas, charts, and reasoning shortcuts. Then jump into drills to train your speed.</p>' +
      '<p class="onboarding-hint">💡 Triple tap any table to open a larger full-screen view.</p>' +
      '<div class="onboarding-actions">' +
      '<button class="btn-primary onboarding-next-btn" id="obNext">Next</button>' +
      '<button class="btn onboarding-skip-btn" id="obSkip">Skip</button>' +
      '</div>';
  }

  function _screen3() {
    return '<div class="onboarding-visual">' +
      '<div class="onboarding-stats-preview">' +
      '<div class="onboarding-stat-item"><span class="onboarding-stat-val">92%</span><span class="onboarding-stat-label">Accuracy</span></div>' +
      '<div class="onboarding-stat-item"><span class="onboarding-stat-val">1.8s</span><span class="onboarding-stat-label">Avg Time</span></div>' +
      '<div class="onboarding-stat-item"><span class="onboarding-stat-val">5</span><span class="onboarding-stat-label">Streak</span></div>' +
      '</div></div>' +
      '<h2 class="onboarding-title">Measure Your Growth</h2>' +
      '<p class="onboarding-desc">Track accuracy, speed, and category performance — your analytics dashboard shows exactly where to focus next.</p>' +
      '<p class="onboarding-hint">💡 Your weakest topics are automatically identified so you never waste time guessing.</p>' +
      '<div class="onboarding-actions">' +
      '<button class="btn-primary onboarding-next-btn" id="obNext">Next</button>' +
      '<button class="btn onboarding-skip-btn" id="obSkip">Skip</button>' +
      '</div>';
  }

  function _screen4() {
    return '<div class="onboarding-visual">' +
      '<span class="onboarding-goal-icon">🎯</span>' +
      '</div>' +
      '<h2 class="onboarding-title">Set Your Daily Training Goal</h2>' +
      '<div class="onboarding-goal-options">' +
      '<button class="onboarding-goal-btn ' + (_selectedGoal === 10 ? ' onboarding-goal-active' : '') + '" data-goal="10" aria-pressed="' + (_selectedGoal === 10 ? 'true' : 'false') + '">10 questions</button>' +
      '<button class="onboarding-goal-btn ' + (_selectedGoal === 20 ? ' onboarding-goal-active' : '') + '" data-goal="20" aria-pressed="' + (_selectedGoal === 20 ? 'true' : 'false') + '">20 questions</button>' +
      '</div>' +
      '<p class="onboarding-note">You can change this anytime from the Settings tab.<br>Goals above 20 require Premium.</p>' +
      '<div class="onboarding-actions">' +
      '<button class="btn-primary onboarding-next-btn" id="obNext">Continue</button>' +
      '</div>';
  }

  function _screen5() {
    var safeName = _escapeHtml(_displayName);
    var title = safeName
      ? safeName + ', ready to begin?'
      : 'Ready to Begin?';
    return '<div class="onboarding-visual">' +
      '<div class="onboarding-icon-anim">' +
      '<span class="onboarding-icon-main">🚀</span>' +
      '<span class="onboarding-icon-sparkle onboarding-sparkle-1">💪</span>' +
      '<span class="onboarding-icon-sparkle onboarding-sparkle-2">🔥</span>' +
      '</div></div>' +
      '<h2 class="onboarding-title">' + title + '</h2>' +
      '<p class="onboarding-desc">Your training plan is set. Let\'s see what you can do.</p>' +
      '<div class="onboarding-actions">' +
      '<button class="btn-primary onboarding-next-btn" id="obNext">Let\'s Go</button>' +
      '</div>';
  }

  function _screen6() {
    var q = _pickNewQuestion();
    var attemptLabel = _questionAttempt === 0 ? 'Your first question' :
                       _questionAttempt === 1 ? 'Try this one' :
                       'One more try';
    return '<div class="onboarding-question-screen" data-answer="' + q.answer + '">' +
      '<p class="onboarding-q-label">' + attemptLabel + '</p>' +
      '<h2 class="onboarding-q-text">' + q.text + '</h2>' +
      '<input type="text" class="input onboarding-q-input" id="obAnswer" readonly placeholder="Tap numpad to answer" autocomplete="off" />' +
      '<div class="onboarding-q-feedback" id="obFeedback"></div>' +
      '</div>';
  }

  /* ---- Event Binding ---- */

  function _bindScreenHandlers(index) {
    var nextBtn = document.getElementById('obNext');
    var skipBtn = document.getElementById('obSkip');

    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        if (typeof triggerHaptic === 'function') triggerHaptic(10);
        if (typeof SoundEngine !== 'undefined') SoundEngine.play('settingsToggle');

        /* Capture name from Screen 1 — optional; empty is fine (the app greets without it) */
        if (index === 0) {
          var nameInput = document.getElementById('obNameInput');
          if (nameInput) _displayName = nameInput.value.trim();
        }

        if (index === 4) {
          /* Save daily goal */
          _saveDailyGoal();

          if (_skipped) {
            /* Skip mode: after goal selection, go straight to home */
            _finish();
            return;
          }
        }

        if (index < 6) {
          _goToScreen(index + 1);
        }
      });
    }

    if (skipBtn) {
      skipBtn.addEventListener('click', function () {
        if (typeof triggerHaptic === 'function') triggerHaptic(10);
        if (index === 0) {
          var nameInput = document.getElementById('obNameInput');
          if (nameInput) _displayName = nameInput.value.trim();
        }
        _skipped = true;
        _goToScreen(4);
      });
    }

    /* Exam screen (index 1): tier → exam two-stage picker */
    if (index === 1) {
      var tierBtns = _overlay.querySelectorAll('.onboarding-tier-btn');
      for (var tb = 0; tb < tierBtns.length; tb++) {
        tierBtns[tb].addEventListener('click', function () {
          if (typeof triggerHaptic === 'function') triggerHaptic(8);
          _selectedTierId = this.getAttribute('data-tier') || '';
          _examStage = 'exam';
          _renderScreen(1);
        });
      }
      var examBtns = _overlay.querySelectorAll('.onboarding-exam-btn');
      for (var eb = 0; eb < examBtns.length; eb++) {
        examBtns[eb].addEventListener('click', function () {
          if (typeof triggerHaptic === 'function') triggerHaptic(10);
          if (typeof SoundEngine !== 'undefined') SoundEngine.play('settingsToggle');
          _selectedExam = this.getAttribute('data-exam') || '';
          _examStage = 'tier';
          _goToScreen(2);
        });
      }
      var foundationLink = document.getElementById('obExamFoundation');
      if (foundationLink) {
        foundationLink.addEventListener('click', function (e) {
          e.preventDefault();
          if (typeof triggerHaptic === 'function') triggerHaptic(10);
          _selectedExam = 'foundation';
          _goToScreen(2);
        });
      }
      var laterBtn = document.getElementById('obExamLater');
      if (laterBtn) {
        laterBtn.addEventListener('click', function () {
          if (typeof triggerHaptic === 'function') triggerHaptic(10);
          _selectedExam = '';
          _goToScreen(2);
        });
      }
      var backBtn = document.getElementById('obExamBack');
      if (backBtn) {
        backBtn.addEventListener('click', function () {
          _examStage = 'tier';
          _renderScreen(1);
        });
      }
    }

    /* Goal selection buttons */
    var goalBtns = _overlay.querySelectorAll('.onboarding-goal-btn');
    for (var i = 0; i < goalBtns.length; i++) {
      goalBtns[i].addEventListener('click', function () {
        if (typeof triggerHaptic === 'function') triggerHaptic(8);
        /* Deselect all */
        for (var j = 0; j < goalBtns.length; j++) {
          goalBtns[j].classList.remove('onboarding-goal-active');
          goalBtns[j].setAttribute('aria-pressed', 'false');
        }
        this.classList.add('onboarding-goal-active');
        this.setAttribute('aria-pressed', 'true');
        _selectedGoal = parseInt(this.getAttribute('data-goal'), 10);
      });
    }

    /* Final screen: show numpad for the first question */
    if (index === 6) {
      var answerInput = document.getElementById('obAnswer');
      if (answerInput) {
        _showOnboardingNumpad(answerInput);
      }
    }
  }

  /**
   * Show the custom numpad for the onboarding first question.
   * Attaches re-show listeners so tapping/focusing the input after a back
   * swipe or navigation event reliably brings the numpad back.
   */
  function _showOnboardingNumpad(inputEl) {
    if (typeof showCustomNumpad !== 'function') return;
    /* Remove any previously bound listeners before re-binding */
    _removeNumpadListeners();
    /* Raise numpad above onboarding overlay */
    var numpad = document.getElementById('customNumpad');
    if (numpad) numpad.style.zIndex = '10001';
    if (numpad) numpad.style.bottom = 'env(safe-area-inset-bottom, 0px)';
    /* Allow clicks to pass through overlay to the numpad */
    if (_overlay) _overlay.style.pointerEvents = 'none';
    var card = _overlay ? _overlay.querySelector('.onboarding-card') : null;
    if (card) card.style.pointerEvents = 'auto';
    showCustomNumpad(inputEl, function () {
      _checkOnboardingAnswer();
    });

    /* Track which input is active so the re-show guard knows its target */
    _numpadBoundInput = inputEl;

    /* Re-show numpad whenever the input is interacted with */
    _numpadFocusHandler = function () { ensureNumpadVisibleForActiveInput(); };
    _numpadClickHandler = function () { ensureNumpadVisibleForActiveInput(); };
    _numpadTouchHandler = function () { ensureNumpadVisibleForActiveInput(); };
    _numpadPointerdownHandler = function () { ensureNumpadVisibleForActiveInput(); };
    inputEl.addEventListener('focus', _numpadFocusHandler);
    inputEl.addEventListener('click', _numpadClickHandler);
    inputEl.addEventListener('touchstart', _numpadTouchHandler, { passive: true });
    inputEl.addEventListener('pointerdown', _numpadPointerdownHandler);

    /* Re-show numpad when the page becomes visible again (back-swipe / tab switch) */
    _numpadVisibilityHandler = function () {
      if (!document.hidden) ensureNumpadVisibleForActiveInput();
    };
    _numpadPageshowHandler = function () { ensureNumpadVisibleForActiveInput(); };
    document.addEventListener('visibilitychange', _numpadVisibilityHandler);
    window.addEventListener('pageshow', _numpadPageshowHandler);
  }

  /**
   * Restore numpad visibility for the active onboarding input when it has
   * been hidden by navigation/swipe without user intent.
   * Re-entry guard prevents infinite loops if re-showing triggers another event.
   */
  function ensureNumpadVisibleForActiveInput() {
    if (_numpadEnsuring) return;
    if (!_numpadBoundInput) return;
    if (!_overlay || _overlay.style.display === 'none') return;
    var numpad = document.getElementById('customNumpad');
    if (numpad && !numpad.classList.contains('visible')) {
      _numpadEnsuring = true;
      _showOnboardingNumpad(_numpadBoundInput);
      _numpadEnsuring = false;
    }
  }

  /**
   * Remove all numpad re-show listeners attached by _showOnboardingNumpad.
   */
  function _removeNumpadListeners() {
    if (_numpadBoundInput) {
      if (_numpadFocusHandler) _numpadBoundInput.removeEventListener('focus', _numpadFocusHandler);
      if (_numpadClickHandler) _numpadBoundInput.removeEventListener('click', _numpadClickHandler);
      if (_numpadTouchHandler) _numpadBoundInput.removeEventListener('touchstart', _numpadTouchHandler);
      if (_numpadPointerdownHandler) _numpadBoundInput.removeEventListener('pointerdown', _numpadPointerdownHandler);
    }
    if (_numpadVisibilityHandler) document.removeEventListener('visibilitychange', _numpadVisibilityHandler);
    if (_numpadPageshowHandler) window.removeEventListener('pageshow', _numpadPageshowHandler);
    _numpadBoundInput = null;
    _numpadFocusHandler = null;
    _numpadClickHandler = null;
    _numpadTouchHandler = null;
    _numpadPointerdownHandler = null;
    _numpadVisibilityHandler = null;
    _numpadPageshowHandler = null;
    _numpadEnsuring = false;
  }

  /**
   * Check the answer to the onboarding question.
   * Supports up to 3 attempts with guided retry.
   */
  function _checkOnboardingAnswer() {
    var inputEl = document.getElementById('obAnswer');
    var feedback = document.getElementById('obFeedback');
    var qScreen = _overlay.querySelector('.onboarding-question-screen');
    if (!inputEl || !feedback || !qScreen) return;

    var correctAnswer = parseInt(qScreen.getAttribute('data-answer'), 10);
    var userAnswer = inputEl.value.trim();

    if (userAnswer === '') return;

    var isCorrect = parseInt(userAnswer, 10) === correctAnswer;

    /* Record in analytics via progress.js — use the question's actual category */
    if (typeof recordAnswer === 'function') {
      var questionText = qScreen.querySelector('.onboarding-q-text');
      var actualCategory = _currentQuestion ? _currentQuestion.category : 'multiplication';
      var qData = {
        question: questionText ? questionText.textContent : '',
        answer: correctAnswer,
        category: actualCategory
      };
      recordAnswer(isCorrect, 'onboarding', isCorrect ? null : qData);
    }

    if (isCorrect) {
      /* Correct! */
      inputEl.disabled = true;
      if (typeof triggerHaptic === 'function') triggerHaptic(50);
      if (typeof SoundEngine !== 'undefined') SoundEngine.play('drillEnd');
      feedback.innerHTML = '<span class="onboarding-success">🎉 Perfect! You\'re all set to begin.</span>';
      feedback.style.display = 'block';

      /* Auto-complete after a short delay */
      setTimeout(function () {
        _finish();
      }, 1200);
    } else {
      /* Wrong answer — guided retry system */
      _questionAttempt++;

      if (_questionAttempt < 3) {
        /* Attempts 1 or 2: show supportive message, then present new question */
        if (typeof triggerHaptic === 'function') triggerHaptic([40, 30, 40]);
        var msg = _questionAttempt === 1
          ? 'Not quite — here\'s another one.'
          : 'Getting warmer. One more chance.';
        feedback.innerHTML = '<span class="onboarding-retry-msg">' + msg + '</span>';
        feedback.style.display = 'block';

        /* After a brief delay, show the next question */
        setTimeout(function () {
          _renderQuestionRetry();
        }, 1200);
      } else {
        /* 3rd wrong answer: reassuring message, redirect to Learn tab */
        inputEl.disabled = true;
        if (typeof triggerHaptic === 'function') triggerHaptic([40, 30, 40]);
        feedback.innerHTML = '<span class="onboarding-retry-msg">That\'s okay — everyone starts somewhere. Let\'s build your foundation.</span>';
        feedback.style.display = 'block';

        setTimeout(function () {
          _finishToPractice();
        }, 1800);
      }
    }
  }

  /**
   * Re-render screen 6 with a new question for retry attempts.
   * Keeps the numpad open.
   */
  function _renderQuestionRetry() {
    var card = _overlay.querySelector('.onboarding-card');
    if (!card) return;

    /* Build new question content */
    var q = _pickNewQuestion();
    var attemptLabel = _questionAttempt === 1 ? 'Try this one' : 'One more try';

    var content = '<div class="onboarding-question-screen" data-answer="' + q.answer + '">' +
      '<p class="onboarding-q-label">' + attemptLabel + '</p>' +
      '<h2 class="onboarding-q-text">' + q.text + '</h2>' +
      '<input type="text" class="input onboarding-q-input" id="obAnswer" readonly placeholder="Tap numpad to answer" autocomplete="off" />' +
      '<div class="onboarding-q-feedback" id="obFeedback"></div>' +
      '</div>';

    /* Keep progress dots */
    var dotsHtml = '<div class="onboarding-dots">';
    var totalScreens = 7;
    for (var i = 0; i < totalScreens; i++) {
      var activeClass = i === 6 ? ' onboarding-dot-active' : '';
      var completedClass = i < 6 ? ' onboarding-dot-completed' : '';
      dotsHtml += '<span class="onboarding-dot' + activeClass + completedClass + '"></span>';
    }
    dotsHtml += '</div>';

    /* Slide animation for new question */
    card.classList.remove('onboarding-card-enter');
    card.classList.add('onboarding-card-exit');

    setTimeout(function () {
      card.innerHTML = content + dotsHtml;
      card.classList.remove('onboarding-card-exit');
      card.classList.add('onboarding-card-enter');

      /* Re-bind numpad to new input */
      var newInput = document.getElementById('obAnswer');
      if (newInput) {
        _showOnboardingNumpad(newInput);
      }
    }, 180);
  }

  /**
   * Complete onboarding and clean up.
   * Navigates to Home tab.
   */
  function _finish() {
    _markCompleted();
    _cleanupNumpad();
    _hideStatsNavGuide();

    /* Fade out the overlay */
    if (_overlay) {
      _overlay.classList.add('onboarding-exit');
      setTimeout(function () {
        _overlay.style.display = 'none';
        _overlay.classList.remove('onboarding-exit');
      }, 300);
    }

    _isShowing = false;
    if (_onComplete) _onComplete();
  }

  /**
   * Complete onboarding and redirect to Learn tab.
   * Used when user fails all 3 attempts — guides them to study material first.
   */
  function _finishToPractice() {
    _markCompleted();
    _cleanupNumpad();
    _hideStatsNavGuide();

    /* Fade out the overlay */
    if (_overlay) {
      _overlay.classList.add('onboarding-exit');
      setTimeout(function () {
        _overlay.style.display = 'none';
        _overlay.classList.remove('onboarding-exit');
      }, 300);
    }

    _isShowing = false;
    /* Reveal the main app first (via the onComplete callback),
       then navigate to Learn tab so user can study first */
    if (_onComplete) _onComplete();
    if (typeof Router !== 'undefined') {
      Router.showView('learn');
    }
  }

  /**
   * Clean up numpad overrides, listeners, and hide it.
   */
  function _cleanupNumpad() {
    _removeNumpadListeners();
    var numpad = document.getElementById('customNumpad');
    if (numpad) { numpad.style.zIndex = ''; numpad.style.bottom = ''; }
    if (_overlay) _overlay.style.pointerEvents = '';
    var card = _overlay ? _overlay.querySelector('.onboarding-card') : null;
    if (card) card.style.pointerEvents = '';
    document.body.classList.remove('onboarding-numpad-active');
    hideCustomNumpad();
  }

  return {
    shouldShow: shouldShow,
    show: show,
    forceCleanup: _cleanupNumpad
  };
})();
