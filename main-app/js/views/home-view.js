/**
 * home-view.js — Home view rendering and Quick Study Links
 *
 * Extracted from app.js. Manages:
 *   - Quick Study Links configuration, persistence, rendering
 *   - Quick Links editor modal
 *   - Home view stats, greeting, daily goal card
 *   - Home view Router.onShow callback registration
 *
 * Dependencies (expected globals):
 *   AppState, Router, SoundEngine, FirestoreSync,
 *   loadProgress, loadSettings, loadQuickLinks (self-defined),
 *   formatCategoryName, toggleSection, showToast,
 *   canAccessFeature, showPaywall, AIFeatures
 */

/* ---- Quick Study Links (v2, FW-W4) ----
   The catalog now lives in QuickLinksRegistry (derived at runtime from the Quick-Ref library,
   the practice mode list, the Learn knowledge base and the feature surfaces). Stored ids keep
   the same key (`qr_quick_links` via AppState); legacy ids from the old 8-shortcut system are
   preserved on disk and mapped through the registry's alias table at read time — a user's
   selection survives the migration without a write. The old max-4 cap is gone. */
var QUICK_LINKS_KEY = 'quant_quick_links';
var DEFAULT_QUICK_LINKS = ['fractionTable', 'tablesContainer', 'formulaSections', 'mentalTricks'];
var QUICK_LINKS_SOFT_MAX = 12;   /* advisory only — the picker hints, never blocks */

function loadQuickLinks() {
  try {
    var raw = (typeof AppState !== 'undefined') ? null : localStorage.getItem(QUICK_LINKS_KEY);
    var data;
    if (typeof AppState !== 'undefined') {
      data = AppState.getQuickLinks();
    } else if (raw) {
      data = JSON.parse(raw);
    }
    if (Array.isArray(data) && data.length > 0) {
      var seen = {};
      var unique = [];
      for (var i = 0; i < data.length; i++) {
        if (typeof data[i] === 'string' && !seen[data[i]]) {
          seen[data[i]] = true;
          unique.push(data[i]);
        }
      }
      return unique.length > 0 ? unique : DEFAULT_QUICK_LINKS.slice();
    }
  } catch (_) { /* ignore */ }
  return DEFAULT_QUICK_LINKS.slice();
}

function saveQuickLinks(links) {
  try {
    var list = links.slice();
    if (typeof AppState !== 'undefined') {
      AppState.setQuickLinks(list);
    } else {
      localStorage.setItem(QUICK_LINKS_KEY, JSON.stringify(list));
    }
    if (typeof FirestoreSync !== 'undefined') {
      FirestoreSync.syncQuickLinks(list);
    }
  } catch (_) { /* ignore */ }
}

function _qlEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

function _qlChipInner(entry) {
  var icon = entry.ico
    ? '<span class="qr-ico" data-ico="' + _qlEsc(entry.ico) + '" aria-hidden="true"></span>'
    : (entry.emoji ? '<span class="qs-chip-emoji" aria-hidden="true">' + entry.emoji + '</span>' : '');
  return icon + '<span class="qs-chip-label">' + _qlEsc(entry.label()) + '</span>';
}

function renderQuickStudyLinks() {
  var container = document.getElementById('quickStudyContainer');
  if (!container) return;
  container.innerHTML = '';
  if (typeof QuickLinksRegistry === 'undefined') return;

  /* Chips wrap naturally, so any number of shortcuts stays tidy on phones and tablets. Tapping a
     locked entry still runs go() — the destination's own premium gate shows the right paywall. */
  var entries = QuickLinksRegistry.resolve(loadQuickLinks());
  var wrap = document.createElement('div');
  wrap.className = 'qr-card quick-study-card';
  entries.forEach(function (entry) {
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'qr-chip qs-chip';
    chip.innerHTML = _qlChipInner(entry);
    chip.addEventListener('click', function () {
      try { if (typeof SoundEngine !== 'undefined') SoundEngine.play('settingsToggle'); } catch (_) {}
      try { entry.go(); } catch (_) {}
    });
    wrap.appendChild(chip);
  });
  container.appendChild(wrap);
}

/* Quick Study picker v2 (FW-W4) — a categorized, searchable .qr-sheet over the full registry.
   Reference is expanded by default (simple for new users); Practice / Learn topics / Features are
   collapsed (the whole app for power users). Learn topics carry their KB category as subheaders
   and a lock chip when premium-gated. Selection is unlimited; a soft hint appears above ~12. */
function openQuickLinksEditor() {
  if (typeof QuickLinksRegistry === 'undefined' || typeof QROverlay === 'undefined') return;

  var storedIds = loadQuickLinks();
  /* Selection state starts as the RESOLVED ids (legacy ids mapped forward) in stored order. */
  var selected = QuickLinksRegistry.resolve(storedIds).map(function (e) { return e.id; });
  var catalog = QuickLinksRegistry.catalog();

  function _row(entry) {
    var checked = selected.indexOf(entry.id) !== -1;
    return '<label class="qr-row qs-pick-row" data-qlid="' + _qlEsc(entry.id) + '" data-label="' + _qlEsc(entry.label().toLowerCase()) + '">' +
      '<span class="qs-pick-main">' + _qlChipInner(entry) +
        (entry.locked() ? '<span class="qs-pick-lock qr-chip"><span class="qr-ico" data-ico="lock" aria-hidden="true"></span>' + _qlEsc(QRI18n.t('home.proBadge')) + '</span>' : '') +
      '</span>' +
      '<input type="checkbox" value="' + _qlEsc(entry.id) + '"' + (checked ? ' checked' : '') + ' />' +
    '</label>';
  }

  var sectionsHtml = QuickLinksRegistry.CATEGORIES.map(function (cat, idx) {
    var entries = catalog.filter(function (e) { return e.category === cat.id; });
    if (!entries.length) return '';
    var body;
    if (cat.id === 'learn') {
      /* subheaders per KB category, in KB order */
      var groups = {}, order = [];
      entries.forEach(function (e) {
        var k = e.subcat || 'other';
        if (!groups[k]) { groups[k] = []; order.push(k); }
        groups[k].push(e);
      });
      body = order.map(function (k) {
        var lbl = QRI18n.t('learn.cat_' + k + 'Title');
        if (lbl === 'learn.cat_' + k + 'Title') lbl = k;
        return '<div class="qs-pick-subhead">' + _qlEsc(lbl) + '</div>' + groups[k].map(_row).join('');
      }).join('');
    } else {
      body = entries.map(_row).join('');
    }
    var open = idx === 0;   /* Reference expanded by default */
    return '<section class="qs-pick-section' + (open ? ' is-open' : '') + '" data-cat="' + cat.id + '">' +
      '<button type="button" class="qs-pick-header" aria-expanded="' + open + '">' +
        '<span>' + _qlEsc(QRI18n.t(cat.labelKey)) + '</span>' +
        '<span class="qs-pick-count" data-role="count"></span>' +
        '<span class="qs-pick-caret" aria-hidden="true">▾</span>' +
      '</button>' +
      '<div class="qs-pick-list"' + (open ? '' : ' hidden') + '>' + body + '</div>' +
    '</section>';
  }).join('');

  var overlay = document.createElement('div');
  overlay.className = 'qr-sheet qs-picker-overlay';
  overlay.innerHTML =
    '<div class="qr-sheet-card qs-picker" role="dialog" aria-modal="true" aria-labelledby="qsPickerTitle">' +
      '<div class="qr-sheet-grabber" aria-hidden="true"></div>' +
      '<div class="qs-picker-head">' +
        '<h3 class="qs-picker-title" id="qsPickerTitle" tabindex="-1">' + QRI18n.t('home.customizeQuickLinks') + '</h3>' +
        '<span class="qs-picker-selcount" id="qsPickerSelCount"></span>' +
      '</div>' +
      '<div class="qs-picker-search"><input type="search" class="qr-input" id="qsPickerSearch" autocomplete="off" ' +
        'placeholder="' + _qlEsc(QRI18n.t('home.qlSearchPh')) + '" aria-label="' + _qlEsc(QRI18n.t('home.qlSearchPh')) + '" /></div>' +
      '<div class="qs-picker-body">' + sectionsHtml +
        '<p class="qs-picker-empty secondary-text" id="qsPickerEmpty" hidden>' + QRI18n.t('home.qlNoMatches') + '</p>' +
      '</div>' +
      '<p class="qs-picker-hint secondary-text" id="qsPickerHint" hidden>' + QRI18n.t('home.qlSoftMaxHint') + '</p>' +
      '<div class="qs-picker-actions">' +
        '<button type="button" class="qr-btn qr-btn-secondary" data-act="cancel">' + QRI18n.t('modals.cancel') + '</button>' +
        '<button type="button" class="qr-btn qr-btn-primary" data-act="save">' + QRI18n.t('modals.save') + '</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  var handle = QROverlay.open(overlay, {
    dialogEl: overlay.querySelector('.qs-picker'),
    removeOnClose: true,
    closingClass: 'closing',
    closeMs: 200,
    initialFocus: '#qsPickerSearch',
    sound: 'settingsToggle'
  });

  function _syncCounts() {
    selected = Array.prototype.map.call(
      overlay.querySelectorAll('input[type="checkbox"]:checked'),
      function (cb) { return cb.value; }
    );
    var selEl = overlay.querySelector('#qsPickerSelCount');
    if (selEl) selEl.textContent = QRI18n.t('home.qlSelectedCount', { count: selected.length });
    var hint = overlay.querySelector('#qsPickerHint');
    if (hint) hint.hidden = selected.length <= QUICK_LINKS_SOFT_MAX;
    overlay.querySelectorAll('.qs-pick-section').forEach(function (sec) {
      var n = sec.querySelectorAll('input[type="checkbox"]:checked').length;
      var c = sec.querySelector('[data-role="count"]');
      if (c) c.textContent = n ? String(n) : '';
    });
  }

  overlay.addEventListener('change', function (e) {
    if (e.target && e.target.type === 'checkbox') {
      var row = e.target.closest('.qs-pick-row');
      if (row) row.classList.toggle('is-selected', e.target.checked);
      _syncCounts();
    }
  });
  overlay.querySelectorAll('input[type="checkbox"]:checked').forEach(function (cb) {
    var row = cb.closest('.qs-pick-row');
    if (row) row.classList.add('is-selected');
  });

  overlay.querySelectorAll('.qs-pick-header').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var sec = btn.closest('.qs-pick-section');
      var list = sec.querySelector('.qs-pick-list');
      var open = list.hidden;
      list.hidden = !open;
      sec.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
  });

  /* Live search across ALL categories — matching rows show, sections with matches expand,
     an empty query restores the default collapsed state. */
  var searchInput = overlay.querySelector('#qsPickerSearch');
  searchInput.addEventListener('input', function () {
    var q = searchInput.value.trim().toLowerCase();
    var any = false;
    overlay.querySelectorAll('.qs-pick-section').forEach(function (sec, idx) {
      var list = sec.querySelector('.qs-pick-list');
      var matches = 0;
      sec.querySelectorAll('.qs-pick-row').forEach(function (row) {
        var hit = !q || row.getAttribute('data-label').indexOf(q) !== -1;
        row.hidden = !hit;
        if (hit) matches++;
      });
      sec.querySelectorAll('.qs-pick-subhead').forEach(function (sh) { sh.hidden = !!q; });
      if (q) {
        sec.hidden = matches === 0;
        list.hidden = matches === 0;
        sec.classList.toggle('is-open', matches > 0);
      } else {
        sec.hidden = false;
        var open = idx === 0;
        list.hidden = !open;
        sec.classList.toggle('is-open', open);
      }
      var btn = sec.querySelector('.qs-pick-header');
      if (btn) btn.setAttribute('aria-expanded', String(!list.hidden));
      if (matches) any = true;
    });
    var empty = overlay.querySelector('#qsPickerEmpty');
    if (empty) empty.hidden = any;
  });

  overlay.querySelector('[data-act="cancel"]').addEventListener('click', function () { handle.close(); });
  overlay.querySelector('[data-act="save"]').addEventListener('click', function () {
    var newLinks = selected.slice();
    if (newLinks.length === 0) newLinks = DEFAULT_QUICK_LINKS.slice();
    saveQuickLinks(newLinks);
    renderQuickStudyLinks();
    handle.close();
  });

  _syncCounts();
}

/**
 * Initialize home view rendering.
 * Called once from app.js DOMContentLoaded to register Router.onShow.
 */
function initHomeView() {
  /* ---- HOME VIEW: render stats on every show ---- */
  Router.onShow('home', function () {
    var p = loadProgress();
    var accuracy = p.totalAttempted ? ((p.totalCorrect / p.totalAttempted) * 100).toFixed(0) : '0';

    /* ---- Dynamic greeting & Profile ---- */
    var greetingEl = document.getElementById('homeGreeting');
    var userNameEl = document.getElementById('homeUserName');
    var initialEl = document.getElementById('heroProfileInitial');

    var displayName = '';
    try {
      if (typeof FirestoreSync !== 'undefined' && FirestoreSync._getCache) {
        var cache = FirestoreSync._getCache();
        if (cache && cache.profile && cache.profile.name) {
          displayName = String(cache.profile.name).trim();
        }
      }
    } catch (_) {}

    var hour = new Date().getHours();
    var greeting;
    if (hour < 12) {
      greeting = QRI18n.t('home.goodMorning');
    } else if (hour < 17) {
      greeting = QRI18n.t('home.goodAfternoon');
    } else {
      greeting = QRI18n.t('home.goodEvening');
    }

    /* Without a name, the time greeting becomes the title — never greet the app by its own
       name, and never claim "welcome back" to a first-run user. */
    if (greetingEl) greetingEl.textContent = displayName ? greeting : QRI18n.t('home.readyToTrain');
    if (userNameEl) userNameEl.textContent = displayName || greeting;
    if (initialEl) initialEl.textContent = displayName ? displayName.charAt(0).toUpperCase() : 'Q';

    /* ---- Target exam chip (canonical identity from TargetExam) ---- */
    var examChip = document.getElementById('heroExamChip');
    if (examChip) {
      var examLabel = (typeof TargetExam !== 'undefined') ? TargetExam.label() : '';
      if (examLabel) {
        examChip.textContent = '🎯 ' + examLabel;
        examChip.style.display = '';
        examChip.onclick = function () { if (typeof Router !== 'undefined') Router.showView('settings'); };
      } else {
        examChip.style.display = 'none';
      }
    }

    /* ---- One-time nudge for users onboarded before target exams existed ---- */
    try {
      var s0 = loadSettings();
      if (s0.onboardingCompleted && typeof TargetExam !== 'undefined' && !TargetExam.get() &&
          !localStorage.getItem('qr_exam_nudge_dismissed')) {
        var nudge = document.getElementById('examNudgeBanner');
        if (!nudge) {
          var goalCard = document.getElementById('dailyGoalCard');
          if (goalCard && goalCard.parentNode) {
            nudge = document.createElement('div');
            nudge.id = 'examNudgeBanner';
            nudge.className = 'card exam-nudge-banner';
            nudge.innerHTML =
              '<span class="exam-nudge-text">' + QRI18n.t('home.examNudge') + '</span>' +
              '<button class="btn-primary exam-nudge-btn" type="button">' + QRI18n.t('home.setTarget') + '</button>' +
              '<button class="exam-nudge-dismiss" type="button" aria-label="' + QRI18n.t('home.dismissAria') + '">×</button>';
            nudge.querySelector('.exam-nudge-btn').addEventListener('click', function () {
              if (typeof Router !== 'undefined') Router.showView('settings');
            });
            nudge.querySelector('.exam-nudge-dismiss').addEventListener('click', function () {
              try { localStorage.setItem('qr_exam_nudge_dismissed', '1'); } catch (_) {}
              if (nudge.parentNode) nudge.parentNode.removeChild(nudge);
            });
            goalCard.parentNode.insertBefore(nudge, goalCard);
          }
        }
      } else {
        var staleNudge = document.getElementById('examNudgeBanner');
        if (staleNudge && staleNudge.parentNode) staleNudge.parentNode.removeChild(staleNudge);
      }
    } catch (_) {}

    /* ---- Streak badge ---- */
    var streakCount = document.getElementById('homeStreakCount');
    var streakBadge = document.getElementById('homeStreakBadge');
    var dailyStreak = parseInt(p.dailyStreak) || 0;
    if (streakCount) streakCount.textContent = dailyStreak;
    if (streakBadge) {
      /* Cold-start honesty (ADR-091): a "🔥 0" badge tells a new user they're nothing — the
         streak appears the day it exists. */
      streakBadge.style.display = dailyStreak > 0 ? '' : 'none';
      streakBadge.classList.toggle('streak-active', dailyStreak > 0);
    }

    /* ---- Progress stat pills ----
       Cold-start honesty (ADR-091): before any attempt there IS no accuracy or best — an em dash,
       not a zero. "0 TODAY" stays: today's count is an honest nudge, not a judgment. */
    var todayEl = document.getElementById('homeTodayCount');
    var accEl = document.getElementById('homeAccuracy');
    var bestEl = document.getElementById('homeBestStreak');
    if (todayEl) todayEl.textContent = p.todayAttempted || 0;
    if (accEl) accEl.textContent = p.totalAttempted ? accuracy + '%' : '—';
    if (bestEl) bestEl.textContent = p.bestStreak || '—';

    /* ---- Dynamic CTA text ---- */
    var ctaLabel = document.getElementById('homeCTALabel');
    var ctaDesc = document.getElementById('homeCTADesc');
    if (ctaLabel && ctaDesc) {
      var todayDone = parseInt(p.todayAttempted) || 0;
      if (todayDone > 0) {
        ctaLabel.textContent = QRI18n.t('home.continueTraining');
        ctaDesc.textContent = QRI18n.t('home.questionsDoneToday', { count: todayDone });
      } else if (dailyStreak > 0) {
        ctaLabel.textContent = QRI18n.t('home.keepYourStreak');
        ctaDesc.textContent = QRI18n.t('home.streakDontBreak', { count: dailyStreak });
      } else {
        ctaLabel.textContent = QRI18n.t('home.ctaStart');
        ctaDesc.textContent = QRI18n.t('home.ctaWarmup');
      }
    }

    /* ---- Daily goal circular ring ---- */
    var settings = loadSettings();
    var goal = settings.dailyGoal || 20;
    var done = p.todayAttempted || 0;
    var pct = Math.min(100, Math.round((done / goal) * 100));
    var goalDone = document.getElementById('goalDone');
    var goalTarget = document.getElementById('goalTarget');
    var goalStatus = document.getElementById('goalStatus');
    var goalPct = document.getElementById('goalPct');
    var goalRingFill = document.getElementById('goalRingFill');

    if (goalDone) goalDone.textContent = done;
    if (goalTarget) goalTarget.textContent = goal;
    if (goalPct) goalPct.textContent = pct + '%';
    if (goalStatus) {
      if (pct >= 100) goalStatus.textContent = QRI18n.t('home.goalAchieved');
      else if (pct >= 75) goalStatus.textContent = QRI18n.t('home.goalAlmost');
      else if (pct >= 50) goalStatus.textContent = QRI18n.t('home.goalHalfway');
      else if (done > 0) goalStatus.textContent = QRI18n.t('home.goalKeepGoing');
      else goalStatus.textContent = QRI18n.t('home.goalStart');
    }

    /* Animate circular ring fill */
    if (goalRingFill) {
      var circumference = 2 * Math.PI * 52; /* r=52 */
      var offset = circumference - (pct / 100) * circumference;
      goalRingFill.style.strokeDasharray = circumference.toFixed(2);
      /* Animate from fully offset to calculated offset */
      goalRingFill.style.strokeDashoffset = circumference.toFixed(2);
      requestAnimationFrame(function () {
        goalRingFill.style.transition = 'stroke-dashoffset 0.8s ease-out';
        goalRingFill.style.strokeDashoffset = offset.toFixed(2);
      });
      /* Colour by progress via the THEME tokens (ADR-095): --accent/--accent-success/--accent-muted were never defined
         anywhere, so this hero ring always rendered the hard-coded blue/green and ignored Dark/Playful. --qr-accent and
         --qr-success ARE theme-aware — goal-met turns the ring success-green, otherwise the brand accent (the arc
         length already conveys how far along the day is). */
      goalRingFill.style.stroke = (pct >= 100) ? 'var(--qr-success, #16a34a)' : 'var(--qr-accent, #2563eb)';
    }

    /* ---- Streak-at-risk banner ---- */
    _renderStreakAtRisk(p);

    /* ---- Suggested practice card ---- */
    _renderSuggestedPractice();

    /* ---- Premium badge visibility ---- */
    /* PREM-6 (ADR-107): the Coach card, Study-Plan card, and timetable badge are all plain Premium gates, so they
       derive from ONE premium check (hasPremiumAccess) rather than one feature key ('ai_coach') standing in for the
       whole group — which previously read inconsistently against the Study-Plan CTA's own 'ai_study_plan' key.
       Behaviour is identical under the single tier; the per-CTA showPaywall keys stay feature-specific for context. */
    var isPP = (typeof hasPremiumAccess === 'function') && hasPremiumAccess();
    var isDuelPP = (typeof hasPremiumAccess === 'function') && hasPremiumAccess();

    var duelBadge = document.getElementById('duelPremiumBadge');
    var coachBadge = document.getElementById('coachPremiumBadge');
    var timetableBadge = document.getElementById('timetablePremiumBadge');
    if (duelBadge) duelBadge.style.display = isDuelPP ? 'none' : '';
    if (coachBadge) coachBadge.style.display = isPP ? 'none' : '';
    if (timetableBadge) timetableBadge.style.display = isPP ? 'none' : '';

    /* ---- Battle Archive (ADR-068) — Premium-only; HIDDEN for free users (not greyed/blurred) ---- */
    if (typeof DuelArchive !== 'undefined' && DuelArchive.render) DuelArchive.render(isDuelPP);

    /* ---- AI Coach card (inside bento) ---- */
    var coachContainer = document.getElementById('aiCoachContainer');
    if (coachContainer && typeof AIFeatures !== 'undefined') {
      if (isPP) {
        AIFeatures.renderAICoachCard('aiCoachContainer', p);
      } else {
        coachContainer.innerHTML =
          '<button class="home-bento-action-btn" type="button" id="coachUnlockBtn">' +
            QRI18n.t('home.unlockAiCoach') +
          '</button>';
        var coachUnlockBtn = document.getElementById('coachUnlockBtn');
        if (coachUnlockBtn) {
          coachUnlockBtn.addEventListener('click', function () {
            if (typeof showPaywall === 'function') showPaywall('ai_coach');
          });
        }
      }
    }

    /* ---- AI Study Plan card (inside bento) ---- */
    var spContainer = document.getElementById('aiStudyPlanContainer');
    if (spContainer) {
      if (isPP && typeof AIFeatures !== 'undefined' && typeof AIFeatures.renderStudyPlanCard === 'function') {
        AIFeatures.renderStudyPlanCard('aiStudyPlanContainer');
      } else {
        spContainer.innerHTML =
          '<button class="home-bento-action-btn" type="button" id="timetableUnlockBtn">' +
            QRI18n.t('home.createStudyPlan') +
          '</button>';
        var timetableUnlockBtn = document.getElementById('timetableUnlockBtn');
        if (timetableUnlockBtn) {
          timetableUnlockBtn.addEventListener('click', function () {
            if (typeof showPaywall === 'function') showPaywall('ai_study_plan');
          });
        }
      }
    }

    /* Render customizable quick study links */
    renderQuickStudyLinks();
  });

  /* ---- HOME VIEW: warmup/CTA handler ---- */
  var warmupBtn = document.getElementById('startWarmup');
  if (warmupBtn) {
    warmupBtn.addEventListener('click', function (e) {
      e.preventDefault();
      if (!_tryPracticeAction()) return;
      SoundEngine.play('settingsToggle');
      Router.showView('practice');
      /* 1-tap daily loop (ADR-091): the warmup CTA lands directly on Question 1 — no interstitial. */
      startDrillFromPractice('quick', null, null, { skipStartScreen: true });
    });
  }

  /* Edit quick links button */
  var editBtn = document.getElementById('editQuickLinks');
  if (editBtn) {
    editBtn.addEventListener('click', function () {
      openQuickLinksEditor();
    });
  }

  /* ---- Quick Reference explore tile (FW-W4) ---- */
  var quickRefTile = document.getElementById('homeBentoQuickRef');
  if (quickRefTile) {
    var _openQuickRefLib = function () {
      SoundEngine.play('settingsToggle');
      Router.showView('learn', { path: 'quick-ref' });
    };
    quickRefTile.addEventListener('click', _openQuickRefLib);
    quickRefTile.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _openQuickRefLib(); }
    });
  }

  /* ---- Duel Hub buttons (navigate to dedicated duel view) ---- */
  var duelCreateBtn = document.getElementById('homeDuelCreate');
  if (duelCreateBtn) {
    duelCreateBtn.addEventListener('click', function () {
      if (typeof DuelManager !== 'undefined') DuelManager.openSetup();
    });
  }
  var duelJoinBtn = document.getElementById('homeDuelJoin');
  if (duelJoinBtn) {
    duelJoinBtn.addEventListener('click', function () {
      if (typeof DuelManager !== 'undefined') DuelManager.openJoinDuel();
    });
  }

  /* Active-Duel card (Duel V2, ADR-031) — derived from the user's recovery mirror; shows the
     waiting-for-opponent / result-ready state on Home so a finished duel is always reachable. */
  if (typeof DuelManager !== 'undefined' && DuelManager.refreshActiveCard) DuelManager.refreshActiveCard();
}

/* ---- Batch 3: Streak-at-risk banner ---- */

/**
 * Show a subtle banner if user has an active daily streak (>= 2 days)
 * but hasn't practiced today. Helps with retention.
 */
function _renderStreakAtRisk(progress) {
  var container = document.getElementById('streakAtRiskBanner');
  if (!container) return;
  container.innerHTML = '';
  container.style.display = 'none';

  var streak = parseInt(progress.dailyStreak) || 0;
  if (streak < 2) return; /* Only warn if streak is meaningful */

  var todayDone = parseInt(progress.todayAttempted) || 0;
  if (todayDone > 0) return; /* Already practiced today */

  container.style.display = '';
  container.innerHTML =
    '<div class="streak-risk-card">' +
      '<span class="streak-risk-icon">🔥</span>' +
      '<div class="streak-risk-content">' +
        '<strong>' + QRI18n.t('home.streakAtRisk', { count: streak }) + '</strong>' +
         '<span class="streak-risk-sub">' + QRI18n.t('home.streakProtect') + '</span>' +
      '</div>' +
      '<a href="#practice" class="streak-risk-btn" id="streakRiskPractice">' + QRI18n.t('home.go') + '</a>' +
    '</div>';

  var goBtn = container.querySelector('#streakRiskPractice');
  if (goBtn) {
    goBtn.addEventListener('click', function (e) {
      e.preventDefault();
      Router.showView('practice');
    });
  }
}

/* ---- Batch 3: Suggested practice card ---- */

/**
 * Show a one-tap "Practice your weakest: [category]" card
 * based on getWeakestCategory() from progress.js.
 */
function _renderSuggestedPractice() {
  var container = document.getElementById('suggestedPracticeCard');
  if (!container) return;
  container.innerHTML = '';
  container.style.display = 'none';

  if (typeof getWeakestCategory !== 'function') return;
  var weakest = getWeakestCategory();
  if (!weakest) return; /* No category with >= 10 attempts */

  var label = (typeof formatCategoryName === 'function')
    ? formatCategoryName(weakest)
    : weakest;

  container.style.display = '';
  container.innerHTML =
    '<div class="suggested-practice-card">' +
      '<span class="suggested-icon">🎯</span>' +
      '<div class="suggested-content">' +
        '<strong>' + QRI18n.t('home.focusOn', { label: label }) + '</strong>' +
         '<span class="suggested-sub">' + QRI18n.t('home.weakestTopicSub') + '</span>' +
      '</div>' +
      '<button class="suggested-btn" id="suggestedPracticeBtn" type="button">' + QRI18n.t('home.start') + '</button>' +
    '</div>';

  var startBtn = container.querySelector('#suggestedPracticeBtn');
  if (startBtn) {
    startBtn.addEventListener('click', function () {
      if (typeof _tryPracticeAction === 'function' && !_tryPracticeAction()) return;
      Router.showView('practice');
      if (typeof startDrillFromPractice === 'function') {
        startDrillFromPractice('focus', weakest, label);
      }
    });
  }
}

/* ---- Batch 3: Daily quota indicator (free users) ---- */

/**
 * Show "X / 20 questions today" for free users who have a daily cap.
 * Hidden for premium/paid/trial users.
 */
function _renderDailyQuota(progress) {
  var container = document.getElementById('dailyQuotaIndicator');
  if (!container) return;
  container.innerHTML = '';
  container.style.display = 'none';

  if (typeof getDailyQuestionLimit !== 'function') return;
  var limit = getDailyQuestionLimit();
  if (limit === Infinity) return; /* Premium user — no cap */

  var used = parseInt(progress.todayAttempted) || 0;
  if (used === 0) return; /* Cold-start (ADR-091): the cap appears once it's meaningful — never "0/20" before the first question */
  var remaining = Math.max(0, limit - used);
  var pct = Math.min(100, Math.round((used / limit) * 100));

  container.style.display = '';
  container.innerHTML =
    '<div class="daily-quota-card">' +
      '<div class="quota-header">' +
        '<span class="quota-label">' + QRI18n.t('home.dailyQuestions') + '</span>' +
        '<span class="quota-count">' + used + ' / ' + limit + '</span>' +
      '</div>' +
      '<div class="quota-bar">' +
        '<div class="quota-fill' + (pct >= 100 ? ' quota-full' : '') + '" style="width:' + pct + '%"></div>' +
      '</div>' +
      (remaining <= 5 && remaining > 0
        ? '<span class="quota-warning">' + QRI18n.t('home.questionsRemaining', { count: remaining }) + '</span>'
        : '') +
      (remaining === 0
        ? '<span class="quota-warning">' + QRI18n.t('home.dailyLimitReached') + ' <a href="#" class="quota-upgrade-link" id="quotaUpgradeLink">' + QRI18n.t('home.upgradeForUnlimited') + '</a></span>'
        : '') +
    '</div>';

  var upgradeLink = container.querySelector('#quotaUpgradeLink');
  if (upgradeLink) {
    upgradeLink.addEventListener('click', function (e) {
      e.preventDefault();
      if (typeof showPaywall === 'function') showPaywall('daily_limit');
    });
  }
}
