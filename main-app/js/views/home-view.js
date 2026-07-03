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

/* ---- Quick Study Links Configuration ---- */
var QUICK_LINKS_KEY = 'quant_quick_links';
var AVAILABLE_QUICK_LINKS = [
  { id: 'fractionTable', icon: '📐', title: 'Fraction → Percentage', desc: 'Master common fraction-to-percentage conversions.', type: 'learn' },
  { id: 'tablesContainer', icon: '✖️', title: 'Multiplication Tables', desc: 'Review tables from 1 to 30.', type: 'learn' },
  { id: 'formulaSections', icon: '📝', title: 'Quant Formulas', desc: 'Percentages, ratios, averages, area, volume and more.', type: 'learn' },
  { id: 'mentalTricks', icon: '💡', title: 'Shortcut Tricks', desc: 'Mental math tricks for faster calculations.', type: 'learn' },
  { id: 'squaresSection', icon: '🔢', title: 'Squares & Cubes', desc: 'Quick reference for squares and cubes.', type: 'learn' },
  { id: 'practice', icon: '🎯', title: 'Practice Drills', desc: 'Jump into practice drills and tests.', type: 'nav' },
  { id: 'stats', icon: '📊', title: 'Stats', desc: 'View your performance statistics.', type: 'nav' },
  { id: 'bookmarksSection', icon: '⭐', title: 'Starred Formulas', desc: 'View your bookmarked formulas.', type: 'learn' }
];
var DEFAULT_QUICK_LINKS = ['fractionTable', 'tablesContainer', 'formulaSections', 'mentalTricks'];

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
      /* Deduplicate and validate */
      var seen = {};
      var unique = [];
      for (var i = 0; i < data.length && unique.length < 4; i++) {
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
    var sliced = links.slice(0, 4);
    if (typeof AppState !== 'undefined') {
      AppState.setQuickLinks(sliced);
    } else {
      localStorage.setItem(QUICK_LINKS_KEY, JSON.stringify(sliced));
    }
    if (typeof FirestoreSync !== 'undefined') {
      FirestoreSync.syncQuickLinks(sliced);
    }
  } catch (_) { /* ignore */ }
}

function renderQuickStudyLinks() {
  var container = document.getElementById('quickStudyContainer');
  if (!container) return;
  container.innerHTML = '';
  var selectedIds = loadQuickLinks();

  for (var i = 0; i < selectedIds.length; i++) {
    var linkData = null;
    for (var j = 0; j < AVAILABLE_QUICK_LINKS.length; j++) {
      if (AVAILABLE_QUICK_LINKS[j].id === selectedIds[i]) {
        linkData = AVAILABLE_QUICK_LINKS[j];
        break;
      }
    }
    if (!linkData) continue;

    var card = document.createElement('a');
    var colorClass = '';
    if (linkData.id === 'fractionTable') colorClass = ' quick-study-blue';
    else if (linkData.id === 'tablesContainer') colorClass = ' quick-study-orange';
    else if (linkData.id === 'formulaSections') colorClass = ' quick-study-purple';
    else if (linkData.id === 'mentalTricks') colorClass = ' quick-study-green';
    else if (linkData.id === 'squaresSection') colorClass = ' quick-study-purple';
    else if (linkData.id === 'practice') colorClass = ' quick-study-blue';
    else if (linkData.id === 'stats') colorClass = ' quick-study-orange';
    else if (linkData.id === 'bookmarksSection') colorClass = ' quick-study-green';
    
    card.className = 'study-card' + colorClass;

    if (linkData.type === 'learn') {
      card.href = '#learn';
      card.setAttribute('data-learn-section', linkData.id);
    } else {
      card.href = '#' + linkData.id;
    }

    card.innerHTML = '<div class="study-card-content">' +
                     '<h3>' + linkData.icon + ' ' + linkData.title + '</h3>' +
                     '<p>' + linkData.desc + '</p>' +
                     '</div><div class="study-card-arrow">→</div>';
    container.appendChild(card);
  }

  /* Re-bind click handlers for learn section links.
     ADR-092 moved most condensed reference into the Quick-Reference library — each legacy link routes to the
     content's new single home (library card via QuickRef.reveal, or a hub section). `formulaSections` had NO DOM
     target since ADR-069 replaced the old formula sections; it now honestly opens the library (the formula home). */
  var LEARN_LINK_DEST = {
    fractionTable: { qr: 'frac-pct' },
    mentalTricks: { qr: 'mult-tricks' },
    squaresSection: { qr: 'squares' },
    formulaSections: { qr: null },              /* library root */
    bookmarksSection: { hub: 'myNotesSection' } /* starred formulas live inside the My-notes card */
  };
  var studyLinks = container.querySelectorAll('[data-learn-section]');
  for (var s = 0; s < studyLinks.length; s++) {
    studyLinks[s].addEventListener('click', function (e) {
      e.preventDefault();
      var section = this.getAttribute('data-learn-section');
      var dest = LEARN_LINK_DEST[section];
      if (dest && 'qr' in dest) {
        Router.showView('learn', { path: 'quick-ref' });
        if (dest.qr) setTimeout(function () { try { if (typeof QuickRef !== 'undefined' && QuickRef.reveal) QuickRef.reveal(dest.qr); } catch (_) {} }, 120);
        return;
      }
      var targetId = (dest && dest.hub) || section;
      Router.showView('learn');
      setTimeout(function () {
        var target = document.getElementById(targetId);
        if (target) {
          var header = target.querySelector('.collapsible-header');
          if (header) {
            var content = header.nextElementSibling;
            if (content && window.getComputedStyle(content).display === 'none') {
              toggleSection(header);
            }
          }
          target.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    });
  }

  /* Bind nav-type links */
  var navLinks = container.querySelectorAll('a[href^="#"]:not([data-learn-section])');
  for (var n = 0; n < navLinks.length; n++) {
    navLinks[n].addEventListener('click', function (e) {
      e.preventDefault();
      var view = this.getAttribute('href').replace('#', '');
      Router.showView(view);
    });
  }
}

function openQuickLinksEditor() {
  var selectedIds = loadQuickLinks();

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  var modal = document.createElement('div');
  modal.className = 'modal-content';

  var html = '<h3 class="modal-title">Customize Quick Links</h3>';
  html += '<p class="secondary-text" style="margin-bottom:.75rem;">Select up to 4 quick links for your home screen.</p>';

  for (var i = 0; i < AVAILABLE_QUICK_LINKS.length; i++) {
    var link = AVAILABLE_QUICK_LINKS[i];
    var isChecked = selectedIds.indexOf(link.id) !== -1;
    html += '<label class="quick-link-option' + (isChecked ? ' selected' : '') + '">';
    html += '<input type="checkbox" value="' + link.id + '"' + (isChecked ? ' checked' : '') + ' />';
    html += '<span>' + link.icon + ' ' + link.title + '</span>';
    html += '</label>';
  }

  html += '<div class="modal-actions">';
  html += '<button class="btn-secondary modal-cancel">Cancel</button>';
  html += '<button class="btn-primary modal-save">Save</button>';
  html += '</div>';

  modal.innerHTML = html;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');

  /* Limit to 4 selections */
  var checkboxes = modal.querySelectorAll('input[type="checkbox"]');
  function updateCheckboxStates() {
    var checkedCount = 0;
    for (var c = 0; c < checkboxes.length; c++) {
      if (checkboxes[c].checked) checkedCount++;
    }
    for (var d = 0; d < checkboxes.length; d++) {
      var label = checkboxes[d].closest('.quick-link-option');
      if (checkboxes[d].checked) {
        label.classList.add('selected');
        checkboxes[d].disabled = false;
      } else {
        label.classList.remove('selected');
        checkboxes[d].disabled = checkedCount >= 4;
      }
    }
  }

  for (var k = 0; k < checkboxes.length; k++) {
    checkboxes[k].addEventListener('change', updateCheckboxStates);
  }
  updateCheckboxStates();

  function closeModal() {
    if (overlay.parentNode) document.body.removeChild(overlay);
    document.body.classList.remove('modal-open');
  }

  overlay.querySelector('.modal-cancel').addEventListener('click', closeModal);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeModal();
  });
  overlay.querySelector('.modal-save').addEventListener('click', function () {
    var newLinks = [];
    for (var m = 0; m < checkboxes.length; m++) {
      if (checkboxes[m].checked) newLinks.push(checkboxes[m].value);
    }
    if (newLinks.length === 0) newLinks = DEFAULT_QUICK_LINKS.slice();
    saveQuickLinks(newLinks);
    renderQuickStudyLinks();
    closeModal();
  });
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
      greeting = 'Good morning';
    } else if (hour < 17) {
      greeting = 'Good afternoon';
    } else {
      greeting = 'Good evening';
    }

    /* Without a name, the time greeting becomes the title — never greet the app by its own
       name, and never claim "welcome back" to a first-run user. */
    if (greetingEl) greetingEl.textContent = displayName ? greeting : 'Ready to train?';
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
              '<span class="exam-nudge-text">Preparing for an exam? Set your target to sharpen your plan.</span>' +
              '<button class="btn-primary exam-nudge-btn" type="button">Set target</button>' +
              '<button class="exam-nudge-dismiss" type="button" aria-label="Dismiss">×</button>';
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
        ctaLabel.textContent = 'Continue Training';
        ctaDesc.textContent = todayDone + ' questions done today';
      } else if (dailyStreak > 0) {
        ctaLabel.textContent = 'Keep Your Streak';
        ctaDesc.textContent = dailyStreak + '-day streak — don\'t break it!';
      } else {
        ctaLabel.textContent = 'Start Training';
        ctaDesc.textContent = '5-question daily warmup';
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
      if (pct >= 100) goalStatus.textContent = '🎉 Daily goal achieved!';
      else if (pct >= 75) goalStatus.textContent = '🔥 Almost at your goal!';
      else if (pct >= 50) goalStatus.textContent = '💪 Halfway to your goal!';
      else if (done > 0) goalStatus.textContent = 'Keep going!';
      else goalStatus.textContent = 'Start training to hit your goal';
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
      /* Color based on progress */
      if (pct >= 100) goalRingFill.style.stroke = 'var(--accent-success, #22c55e)';
      else if (pct >= 50) goalRingFill.style.stroke = 'var(--accent, #2563eb)';
      else goalRingFill.style.stroke = 'var(--accent-muted, #60a5fa)';
    }

    /* ---- Streak-at-risk banner ---- */
    _renderStreakAtRisk(p);

    /* ---- Suggested practice card ---- */
    _renderSuggestedPractice();

    /* ---- Premium badge visibility ---- */
    var isPP = (typeof canAccessFeature === 'function') && canAccessFeature('ai_coach');
    var isDuelPP = (typeof canAccessFeature === 'function') && canAccessFeature('math_duel');

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
            'Unlock AI Coach ✨' +
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
            'Create Study Plan ✨' +
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
        '<strong>' + streak + '-day streak at risk!</strong>' +
         '<span class="streak-risk-sub">Complete a session to protect your streak.</span>' +
      '</div>' +
      '<a href="#practice" class="streak-risk-btn" id="streakRiskPractice">Go</a>' +
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
        '<strong>Focus on ' + label + '</strong>' +
         '<span class="suggested-sub">Your weakest topic — targeted practice drives the fastest improvement.</span>' +
      '</div>' +
      '<button class="suggested-btn" id="suggestedPracticeBtn" type="button">Start</button>' +
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
        '<span class="quota-label">Daily Questions</span>' +
        '<span class="quota-count">' + used + ' / ' + limit + '</span>' +
      '</div>' +
      '<div class="quota-bar">' +
        '<div class="quota-fill' + (pct >= 100 ? ' quota-full' : '') + '" style="width:' + pct + '%"></div>' +
      '</div>' +
      (remaining <= 5 && remaining > 0
        ? '<span class="quota-warning">⚠️ ' + remaining + ' question' + (remaining === 1 ? '' : 's') + ' remaining today</span>'
        : '') +
      (remaining === 0
        ? '<span class="quota-warning">Daily limit reached. <a href="#" class="quota-upgrade-link" id="quotaUpgradeLink">Upgrade for unlimited</a></span>'
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
