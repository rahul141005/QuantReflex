/**
 * settings.js — User settings management
 *
 * Manages: dark mode, sound, vibration, difficulty, reduced motion,
 *          skip questions, notifications, profile, account deletion.
 * Stores settings in localStorage and syncs to Firestore.
 */

var SETTINGS_KEY = 'quant_reflex_settings';
var _logoutInFlight = false;

function loadSettings() {
  if (typeof AppState !== 'undefined') return AppState.getSettings();
  try {
    var raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) { /* ignore */ }
  return {
    darkMode: false, sound: true, vibration: true, difficulty: 'medium',
    dailyGoal: 20, reducedMotion: false, skipEnabled: false, notificationsEnabled: false,
    theme: 'classic', practiceAskSubject: true, practiceLastSubject: 'quant',
    appLanguage: 'en', studyLanguage: 'en'
  };
}

function saveSettings(s) {
  try {
    if (typeof AppState !== 'undefined') {
      AppState.setSettings(s);
    } else {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    }
    if (typeof FirestoreSync !== 'undefined') {
      FirestoreSync.syncSettings(s);
    }
  } catch (e) {
    console.warn('Failed to save settings:', e);
  }
}

/**
 * Apply a theme by class name.
 * Removes all theme classes and applies the selected one.
 * @param {string} theme - 'classic' or 'playful'
 */
function applyTheme(theme) {
  document.body.classList.remove('theme-playful');
  if (theme === 'playful') {
    document.body.classList.add('theme-playful');
  }
  /* Icons are theme-driven purely in CSS (QR icon system) — toggling the body class is enough. */
}

/* ---- Appearance: System / Light / Dark (ADR-091) ----
   ONE resolver owns the light/dark decision. `settings.appearance` is canonical
   ('system' | 'light' | 'dark'); when absent, the legacy boolean migrates lazily:
   darkMode:true → 'dark' (an explicit choice stays), darkMode:false → 'system'
   (overwhelmingly "never touched" — and System is the honest default). All 981
   dark-mode CSS rules keep keying off body.dark-mode; only JS resolves the OS
   preference, so there is no duplicated stylesheet. */
function appearanceMode(s) {
  return s.appearance || (s.darkMode ? 'dark' : 'system');
}

function resolveDarkMode(s) {
  var mode = appearanceMode(s || {});
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (_) { return false; }
}

function applyAppearance(s) {
  document.body.classList.toggle('dark-mode', resolveDarkMode(s || loadSettings()));
}

/* Follow live OS scheme changes while in System mode (e.g. sunset auto-dark). */
(function () {
  try {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function () {
      var s = loadSettings();
      if (appearanceMode(s) === 'system') applyAppearance(s);
    };
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange);
    else if (typeof mq.addListener === 'function') mq.addListener(onChange); /* older Safari */
  } catch (_) { /* matchMedia unavailable — fixed light default */ }
})();

function getDifficulty() {
  return loadSettings().difficulty || 'medium';
}

/**
 * Show a toast notification.
 * @param {string} message - text to display
 * @param {number} [duration=3000] - ms before auto-dismiss
 */
function showToast(message, duration) {
  var container = document.getElementById('toastContainer');
  if (!container) return;
  var toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  /* Trigger enter animation */
  requestAnimationFrame(function () {
    toast.classList.add('toast-visible');
  });
  setTimeout(function () {
    toast.classList.remove('toast-visible');
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, duration || 3000);
}

/**
 * Initialize settings view controls.
 * Called when settings view is shown.
 */
function initSettingsView() {
  var settings = loadSettings();
  var accessState = (typeof FirestoreSync !== 'undefined' && typeof FirestoreSync.getAccessState === 'function')
    ? FirestoreSync.getAccessState()
    : {};
  var isPremiumUser = accessState && accessState.plan === 'premium';
  var isTrialUser = accessState && accessState.isTrial === true;

  var appearanceSelect = document.getElementById('appearanceSelect');
  var soundToggle = document.getElementById('soundToggle');
  var vibrationToggle = document.getElementById('vibrationToggle');
  var difficultySelect = document.getElementById('difficultySelect');

  if (!appearanceSelect) return;

  /* Remove old listeners by cloning */
  function rebind(el, event, handler) {
    if (!el) return null;
    var newEl = el.cloneNode(true);
    el.parentNode.replaceChild(newEl, el);
    newEl.addEventListener(event, handler);
    return newEl;
  }

  /* Appearance select (ADR-091): writes the canonical mode + keeps settings.darkMode as the
     derived resolved boolean so every legacy reader (incl. the synced settings blob the coaching
     app sees) stays correct. */
  appearanceSelect = rebind(appearanceSelect, 'change', function () {
    settings.appearance = this.value;
    settings.darkMode = resolveDarkMode(settings);
    applyAppearance(settings);
    saveSettings(settings);
    SoundEngine.play('settingsToggle');
    if (typeof triggerHaptic === 'function') triggerHaptic(15);
  });
  appearanceSelect.value = appearanceMode(settings);

  /* Language rows (ADR-111): hidden until the i18n feature flag (or qr_i18n_preview) is on.
     App language drives UI chrome; Study language follows it until the user explicitly picks a
     different one (linked-defaults rule — a CAT aspirant can study in English with a Hindi app). */
  var langBlock = document.getElementById('languageSettingsBlock');
  if (langBlock && typeof QRI18n !== 'undefined' && QRI18n.isOn()) {
    langBlock.style.display = '';
    function _applyLanguageChange() {
      QRI18n.init(settings);
      saveSettings(settings);
      SoundEngine.play('settingsToggle');
      if (typeof triggerHaptic === 'function') triggerHaptic(15);
      showToast(QRI18n.t('settings.languageUpdated'));
    }
    var appLanguageSelect = rebind(document.getElementById('appLanguageSelect'), 'change', function () {
      settings.appLanguage = this.value;
      if (!settings.studyLanguageDiverged) {
        settings.studyLanguage = this.value;
        var st = document.getElementById('studyLanguageSelect');
        if (st) st.value = this.value;
      }
      _applyLanguageChange();
    });
    if (appLanguageSelect) appLanguageSelect.value = settings.appLanguage || 'en';
    var studyLanguageSelect = rebind(document.getElementById('studyLanguageSelect'), 'change', function () {
      settings.studyLanguage = this.value;
      settings.studyLanguageDiverged = this.value !== (settings.appLanguage || 'en');
      _applyLanguageChange();
    });
    if (studyLanguageSelect) studyLanguageSelect.value = settings.studyLanguage || settings.appLanguage || 'en';
  }

  /* Theme selector */
  var themeSelect = document.getElementById('themeSelect');
  if (themeSelect) {
    themeSelect = rebind(themeSelect, 'change', function () {
      if (this.value !== 'classic' && !canAccessFeature('advanced_theme')) {
        this.value = settings.theme || 'classic';
        showPaywall('advanced_theme');
        return;
      }
      settings.theme = this.value;
      applyTheme(this.value);
      saveSettings(settings);
      SoundEngine.play('settingsToggle');
    });
    if ((settings.theme || 'classic') !== 'classic' && !canAccessFeature('advanced_theme')) {
      settings.theme = 'classic';
      applyTheme('classic');
      saveSettings(settings);
    }
    themeSelect.value = settings.theme || 'classic';
  }

  soundToggle = rebind(soundToggle, 'change', function () {
    settings.sound = this.checked;
    saveSettings(settings);
    /* Only play confirmation sound when enabling sound */
    if (this.checked) {
      SoundEngine.play('settingsToggle');
    }
    if (typeof triggerHaptic === 'function') triggerHaptic(15);
  });
  soundToggle.checked = settings.sound !== false;

  vibrationToggle = rebind(vibrationToggle, 'change', function () {
    settings.vibration = this.checked;
    saveSettings(settings);
    SoundEngine.play('settingsToggle');
    /* Provide feedback vibration when turning on; skip check since user is toggling this */
    if (this.checked && typeof navigator.vibrate === 'function') navigator.vibrate(15);
  });
  vibrationToggle.checked = settings.vibration !== false;

  /* Reduced Motion toggle */
  var reducedMotionToggle = document.getElementById('reducedMotionToggle');
  if (reducedMotionToggle) {
    reducedMotionToggle = rebind(reducedMotionToggle, 'change', function () {
      settings.reducedMotion = this.checked;
      document.body.classList.toggle('reduced-motion', this.checked);
      saveSettings(settings);
      SoundEngine.play('settingsToggle');
    });
    reducedMotionToggle.checked = !!settings.reducedMotion;
  }

  /* Skip Question toggle */
  var skipToggle = document.getElementById('skipToggle');
  if (skipToggle) {
    skipToggle = rebind(skipToggle, 'change', function () {
      var toggle = this;
      if (toggle.checked && !canAccessFeature('skip_question')) {
        toggle.checked = false;
        settings.skipEnabled = false;
        saveSettings(settings);
        showPaywall('skip_question');
        return;
      }
      if (toggle.checked && settings.difficulty === 'hard') {
        /* Revert toggle immediately */
        toggle.checked = false;
        showToast(QRI18n.t('settings.skipHardToast'));
        return;
      }
      settings.skipEnabled = toggle.checked;
      saveSettings(settings);
      SoundEngine.play('settingsToggle');
    });
    skipToggle.checked = !!(settings.skipEnabled && settings.difficulty !== 'hard');
  }

  /* ADR-080: ask which subject before a Quick-Start session. Default ON (practiceAskSubject !== false). */
  var askSubjectToggle = document.getElementById('askSubjectToggle');
  if (askSubjectToggle) {
    askSubjectToggle = rebind(askSubjectToggle, 'change', function () {
      settings.practiceAskSubject = this.checked;
      saveSettings(settings);
      SoundEngine.play('settingsToggle');
      if (typeof triggerHaptic === 'function') triggerHaptic(15);
    });
    askSubjectToggle.checked = settings.practiceAskSubject !== false;
  }

  /* Target exam select — options from the QR_SYLLABUS catalog grouped by tier; canonical write via TargetExam. */
  var targetExamSelect = document.getElementById('targetExamSelect');
  if (targetExamSelect && typeof QR_SYLLABUS !== 'undefined' && typeof TargetExam !== 'undefined') {
    if (targetExamSelect.options.length <= 1) {
      (QR_SYLLABUS.TIERS || []).forEach(function (tier) {
        var group = document.createElement('optgroup');
        group.label = tier.label;
        (QR_SYLLABUS.examsByTier(tier.id) || []).forEach(function (ex) {
          var opt = document.createElement('option');
          opt.value = ex.id;
          opt.textContent = ex.name;
          group.appendChild(opt);
        });
        if (group.children.length) targetExamSelect.appendChild(group);
      });
    }
    targetExamSelect = rebind(targetExamSelect, 'change', function () {
      TargetExam.set(this.value || null);
      settings = loadSettings(); /* TargetExam.set wrote settings — refresh the local copy so later saves don't clobber it */
      SoundEngine.play('settingsToggle');
      if (this.value) showToast(QRI18n.t('settings.targetSetToast', { label: TargetExam.label(this.value) || this.value }));
    });
    targetExamSelect.value = TargetExam.get() || '';
  }

  difficultySelect = rebind(difficultySelect, 'change', function () {
    if (this.value === 'hard' && !canAccessFeature('hard_mode')) {
      this.value = settings.difficulty || 'medium';
      showPaywall('hard_mode');
      return;
    }
    settings.difficulty = this.value;
    /* If switching to Hard, disable skip */
    if (this.value === 'hard' && settings.skipEnabled) {
      settings.skipEnabled = false;
      var st = document.getElementById('skipToggle');
      if (st) st.checked = false;
      showToast(QRI18n.t('settings.skipHardToast'));
    }
    saveSettings(settings);
    SoundEngine.play('settingsToggle');
  });
  difficultySelect.value = settings.difficulty || 'medium';

  /* Daily goal input */
  var dailyGoalInput = document.getElementById('dailyGoalInput');
  if (dailyGoalInput) {
    dailyGoalInput = rebind(dailyGoalInput, 'change', function () {
      var val = parseInt(this.value);
      if (val >= 10 && val <= 100) {
        if (val > 20 && !canAccessFeature('daily_goal_limit')) {
          this.value = String(settings.dailyGoal || 20);
          showPaywall('daily_goal_limit');
          return;
        }
        settings.dailyGoal = val;
        saveSettings(settings);
      }
    });
    if ((settings.dailyGoal || 20) > 20 && !canAccessFeature('daily_goal_limit')) {
      settings.dailyGoal = 20;
      saveSettings(settings);
    }
    dailyGoalInput.value = settings.dailyGoal || 20;
  }

  /* Notifications toggle */
  var notifToggle = document.getElementById('notificationsToggle');
  if (notifToggle) {
    var notifEnabled = typeof NotificationManager !== 'undefined' && NotificationManager.isEnabled();
    notifToggle = rebind(notifToggle, 'change', function () {
      var toggle = this;
      if (typeof NotificationManager === 'undefined') return;
      if (toggle.checked) {
        NotificationManager.enable(function (err) {
          if (err) {
            toggle.checked = false;
            console.warn('Notifications could not be enabled:', err);
          }
        });
      } else {
        NotificationManager.disable();
      }
      SoundEngine.play('settingsToggle');
    });
    notifToggle.checked = notifEnabled;
  }

  /* Report a Problem (ADR-096) — opens the reporting modal (full type set from Settings). */
  var reportBtn = document.getElementById('openReportProblem');
  if (reportBtn) {
    rebind(reportBtn, 'click', function () {
      if (typeof ReportModal !== 'undefined' && ReportModal.open) ReportModal.open({ source: 'settings' });
    });
  }

  /* Contact card (ADR-100) — the email is a real mailto: anchor (keyboard + semantics for free); the copy button
     writes the address to the clipboard with a toast + brief "copied" state. Idempotent via rebind (Settings re-inits).
     ADR-110: generalized to wire BOTH copy buttons (Settings card + the About modal's contact card) identically. */
  var CONTACT_EMAIL = 'quantreflex@gmail.com';
  function _wireEmailCopy(btnId) {
    var copyBtn = document.getElementById(btnId);
    if (!copyBtn) return;
    /* Legacy synchronous copy — returns true only if it actually copied (so we never claim false success). */
    function _execCopy() {
      try {
        var ta = document.createElement('textarea'); ta.value = CONTACT_EMAIL;
        ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        var okc = document.execCommand('copy'); document.body.removeChild(ta); return !!okc;
      } catch (_) { return false; }
    }
    function _copied() {
      try { if (typeof showToast === 'function') showToast(QRI18n.t('settings.emailCopied')); } catch (_) {}
      var b = document.getElementById(btnId);
      if (b) { b.classList.add('is-copied'); b.setAttribute('aria-label', 'Email copied'); setTimeout(function () { var bb = document.getElementById(btnId); if (bb) { bb.classList.remove('is-copied'); bb.setAttribute('aria-label', 'Copy email address'); } }, 1600); }
    }
    /* Copy failed on every path — don't fake success; point the user at the address they can still tap to email. */
    function _copyFailed() { try { if (typeof showToast === 'function') showToast(QRI18n.t('settings.emailCopyFailed', { email: CONTACT_EMAIL })); } catch (_) {} }
    rebind(copyBtn, 'click', function () {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          /* On async rejection (denied permission / insecure context) fall back to execCommand; only THEN report. */
          navigator.clipboard.writeText(CONTACT_EMAIL).then(_copied, function () { if (_execCopy()) _copied(); else _copyFailed(); });
        } else { if (_execCopy()) _copied(); else _copyFailed(); }
      } catch (_) { if (_execCopy()) _copied(); else _copyFailed(); }
    });
  }
  _wireEmailCopy('contactEmailCopy');
  _wireEmailCopy('aboutContactEmailCopy');

  /* App Guide button — opens modal */
  var appGuideBtn = document.getElementById('openAppGuide');
  if (appGuideBtn) {
    rebind(appGuideBtn, 'click', function () {
      openInfoModal('appGuideModal');
    });
  }

  /* About button — opens modal */
  var aboutBtn = document.getElementById('openAbout');
  if (aboutBtn) {
    rebind(aboutBtn, 'click', function () {
      updateAboutUserStatus();
      openInfoModal('aboutModal');
    });
  }

  /* Clear Data button — opens modal */
  var clearDataBtn = document.getElementById('clearDataBtn');
  if (clearDataBtn) {
    rebind(clearDataBtn, 'click', function () {
      openClearDataModal();
    });
  }

  /* Profile button — opens profile modal */
  var profileBtn = document.getElementById('openProfileModal');
  if (profileBtn) {
    rebind(profileBtn, 'click', function () {
      openProfileModal();
    });
  }

  /* Logout button */
  var logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    rebind(logoutBtn, 'click', function () {
      if (_logoutInFlight) return;
      if (typeof Auth !== 'undefined') {
        _logoutInFlight = true;
        this.disabled = true;

        /* Hide the authenticated UI immediately to prevent stale visual flashes */
        if (typeof Router !== 'undefined' && typeof Router.teardown === 'function') {
          Router.teardown();
        }
        document.body.classList.remove('auth-resolved');
        var container = document.querySelector('.container');
        var authScreen = document.getElementById('authScreen');
        var bottomNav = document.querySelector('.bottom-nav');
        if (container) container.style.display = 'none';
        if (bottomNav) bottomNav.style.display = 'none';
        if (authScreen) authScreen.style.display = 'flex';

        /* Flush pending Firestore writes and clear local state BEFORE
           signing out, while the user context is still valid */
        if (typeof FirestoreSync !== 'undefined' && typeof FirestoreSync.flushUpdatesAsync === 'function') {
          FirestoreSync.flushUpdatesAsync(function() {
            FirestoreSync.resetSyncState();
            Auth.logout(function (err) {
              _logoutInFlight = false;
              if (err) {
                var lb = document.getElementById('logoutBtn');
                if (lb) lb.disabled = false;
                alert(QRI18n.t('settings.logoutFailed', { error: err }));
                window.location.reload(); /* Force reload to recover state */
              } else {
                window.location.reload();
              }
            });
          });
          return;
        } else if (typeof FirestoreSync !== 'undefined') {
          FirestoreSync.resetSyncState();
        }
        Auth.logout(function (err) {
          _logoutInFlight = false;
          if (err) {
            var lb = document.getElementById('logoutBtn');
            if (lb) lb.disabled = false;
            alert(QRI18n.t('settings.logoutFailed', { error: err }));
          } else {
            /* Reload page for clean state — auth persistence keeps
               the user logged out, and all JS state is reset */
            window.location.reload();
          }
        });
      }
    });
  }

  /* Delete Account button */
  var deleteBtn = document.getElementById('deleteAccountBtn');
  if (deleteBtn) {
    rebind(deleteBtn, 'click', function () {
      openDeleteAccountModal();
    });
  }

  var updateAppBtn = document.getElementById('updateAppBtn');
  if (updateAppBtn) {
    rebind(updateAppBtn, 'click', function () {
      updateAppBtn.disabled = true;
      var labelEl = updateAppBtn.querySelector('.settings-btn-label');
      if (labelEl) {
        labelEl.textContent = QRI18n.t('settings.updatingApp');
      } else {
        updateAppBtn.textContent = QRI18n.t('settings.updatingApp');
      }
      if (typeof showToast === 'function') showToast(QRI18n.t('settings.updatingAppToast'));
      /* ADR-102: the shared QRUpdateManager owns cache-purge + skip-waiting + the one-shot reload
         (identical sequence to before). This handler is now pure presentation + the action call. */
      if (typeof QRUpdateManager !== 'undefined') {
        QRUpdateManager.applyUpdate();
      } else {
        try { localStorage.setItem('qr_appUpdating', 'true'); } catch (_) {}
        window.location.href = window.location.pathname;
      }
    });
  }

  var trialUpgradeSection = document.getElementById('trialUpgradeSection');
  if (trialUpgradeSection) {
    trialUpgradeSection.style.display = (!isPremiumUser || isTrialUser) ? 'block' : 'none';
  }
  var trialUpgradeBtn = document.getElementById('trialUpgradeBtn');
  if (trialUpgradeBtn) {
    rebind(trialUpgradeBtn, 'click', function () {
      showPaywall('upgrade');
    });
  }

  /* PWA install button */
  var installCard = document.getElementById('installCard');
  var installBtn = document.getElementById('installBtn');
  if (installCard && installBtn && window._deferredPrompt) {
    installCard.style.display = 'block';
    rebind(installBtn, 'click', function () {
      window._deferredPrompt.prompt();
      window._deferredPrompt.userChoice.then(function () {
        window._deferredPrompt = null;
        installCard.style.display = 'none';
      });
    });
  }

  /* Apply reduced motion on load */
  document.body.classList.toggle('reduced-motion', !!settings.reducedMotion);
  updateAboutUserStatus();
}

function updateAboutUserStatus() {
  var statusEl = document.getElementById('aboutUserStatusMessage');
  var settingsStatusEl = document.getElementById('settingsUserStatusMessage');
  /* ADR-103: source the displayed version from the single build tag (QR_APP_VERSION) so it can never
     drift from the shipped build (the old hard-coded "Version 2.1.0" was disconnected from it). */
  try {
    var _verEl = document.getElementById('aboutVersionLine');
    if (_verEl && typeof window !== 'undefined' && window.QR_APP_VERSION) {
      _verEl.textContent = QRI18n.t('settings.versionLine', { version: window.QR_APP_VERSION });
    }
  } catch (_) {}
  /* ADR-110: live update status in About. isUpdateAvailable() is the shared UpdateManager's synchronous flag —
     true only when a genuinely newer service worker is installed and waiting. */
  try {
    var _updEl = document.getElementById('aboutUpdateStatus');
    if (_updEl) {
      var _updAvail = (typeof QRUpdateManager !== 'undefined' && QRUpdateManager.isUpdateAvailable)
        ? QRUpdateManager.isUpdateAvailable() : false;
      _updEl.textContent = _updAvail
        ? QRI18n.t('settings.updateReadyLine')
        : QRI18n.t('settings.upToDateLine');
    }
  } catch (_) {}
  var accessState = (typeof FirestoreSync !== 'undefined' && typeof FirestoreSync.getAccessState === 'function')
    ? (FirestoreSync.getAccessState() || {})
    : {};
  function _fmtDate(value) {
    var ms = 0;
    if (typeof value === 'number') ms = value;
    else if (typeof value === 'string') ms = new Date(value).getTime();
    else if (value && typeof value.toDate === 'function') { try { ms = value.toDate().getTime(); } catch (_) {} }
    if (!ms || isNaN(ms)) return '';
    return new Intl.DateTimeFormat((typeof QRI18n !== 'undefined') ? QRI18n.localeTag() : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ms));
  }

  var message = QRI18n.t('settings.planFree');
  if (accessState.plan === 'premium') {
    if (accessState.isTrial === true) {
      /* Trial — N days left */
      var trialDaysLabel = '';
      if (accessState.trialDays != null && accessState.trialDays > 0) {
        trialDaysLabel = QRI18n.t('settings.trialDaysLeft', { count: accessState.trialDays });
      } else {
        var tStr = _fmtDate(accessState.trialEnd);
        if (tStr) trialDaysLabel = QRI18n.t('settings.trialExpires', { date: tStr });
      }
      message = QRI18n.t('settings.planTrial') + trialDaysLabel;
    } else {
      var planLabel = accessState.planType === 'premium_12m' ? QRI18n.t('settings.plan12m')
                    : accessState.planType === 'premium_6m' ? QRI18n.t('settings.plan6m') : '';
      var expStr = _fmtDate(accessState.planExpiry);
      message = QRI18n.t('settings.planPremium') + (planLabel ? ' (' + planLabel + ')' : '') + (expStr ? QRI18n.t('settings.planExpiresFrag', { date: expStr }) : '');
    }
  }
  if (statusEl) {
    statusEl.textContent = message;
  }
  if (settingsStatusEl) {
    settingsStatusEl.textContent = message;
  }
}

/**
 * Open the Clear Data modal with options.
 */
function openClearDataModal() {
  var modal = document.getElementById('clearDataModal');
  if (!modal) return;
  /* Prevent duplicate overlays */
  var confirmModal = document.getElementById('clearConfirmModal');
  if (confirmModal) confirmModal.style.display = 'none';

  modal.style.display = 'flex';
  document.body.classList.add('modal-open');

  var cancelBtn = document.getElementById('clearDataCancel');
  var optionBtns = modal.querySelectorAll('.clear-option-btn');

  /* Cancel */
  function closeModal() {
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
  }
  cancelBtn.onclick = closeModal;
  modal.onclick = function (e) {
    if (e.target === modal) closeModal();
  };

  /* Option handlers */
  for (var i = 0; i < optionBtns.length; i++) {
    optionBtns[i].onclick = function () {
      var type = this.getAttribute('data-clear');
      closeModal();
      openClearConfirmModal(type);
    };
  }
}

/**
 * Open a confirmation dialog before clearing data.
 * @param {string} type - 'stats', 'streaks', 'formulas', or 'all'
 */
function openClearConfirmModal(type) {
  var modal = document.getElementById('clearConfirmModal');
  var textEl = document.getElementById('clearConfirmText');
  var cancelBtn = document.getElementById('clearConfirmCancel');
  var okBtn = document.getElementById('clearConfirmOk');
  if (!modal || !textEl) return;

  var messages = {
    stats: QRI18n.t('settings.clearStatsConfirm'),
    streaks: QRI18n.t('settings.clearStreaksConfirm'),
    formulas: QRI18n.t('settings.clearFormulasConfirm'),
    all: QRI18n.t('settings.clearAllConfirm')
  };
  textEl.textContent = messages[type] || QRI18n.t('settings.confirmFallback');
  modal.style.display = 'flex';
  document.body.classList.add('modal-open');

  function closeModal() {
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
  }
  cancelBtn.onclick = closeModal;
  modal.onclick = function (e) {
    if (e.target === modal) closeModal();
  };

  okBtn.onclick = function () {
    closeModal();
    if (type === 'streaks') {
      /* Handle streaks clearing through the proper AppState chain */
      try {
        var progress = loadProgress();
        progress.currentStreak = 0;
        progress.bestStreak = 0;
        progress.dailyStreak = 0;
        progress.bestDailyStreak = 0;
        progress.lastPracticeDate = null;
        saveProgress(progress);
      } catch (_) {}
      showToast(QRI18n.t('settings.streaksReset'));
      if (typeof Router !== 'undefined') {
        Router.showView('settings');
      }
      return;
    }

    if (typeof FirestoreSync !== 'undefined') {
      FirestoreSync.clearUserData(type, function (err) {
        if (err) {
          alert(QRI18n.t('settings.clearFailed', { error: err }));
        } else {
          if (type === 'stats') {
            /* Stats only — re-render settings view without reload */
            showToast(QRI18n.t('settings.statsReset'));
            if (typeof Router !== 'undefined') {
              Router.showView('settings');
            }
          } else {
            /* Formulas or all — reload page for clean DOM state.
               Auth persistence keeps the user logged in. */
            showToast(QRI18n.t('settings.dataCleared'));
            setTimeout(function () { window.location.reload(); }, 500);
          }
        }
      });
    } else {
      /* Fallback: clear local data only */
      if (type === 'stats') {
        resetProgress();
      } else if (type === 'formulas') {
        if (typeof AppState !== 'undefined') {
          AppState.setCustomFormulas({});
          AppState.setCustomTopics([]);
          AppState.setBookmarks([]);
        }
      } else if (type === 'all') {
        resetProgress();
        var defaultSettings = {
          darkMode: false, sound: true, vibration: true, difficulty: 'medium',
          dailyGoal: 20, reducedMotion: false, skipEnabled: false, notificationsEnabled: false,
          theme: 'classic'
        };
        /* Write to canonical AppState keys — single source of truth */
        if (typeof AppState !== 'undefined') {
          AppState.setSettings(defaultSettings);
          AppState.setCustomFormulas({});
          AppState.setCustomTopics([]);
          AppState.setBookmarks([]);
          AppState.setQuickLinks(['fractionTable', 'tablesContainer', 'formulaSections', 'mentalTricks']);
          AppState.setNotifEnabled(false);
        }
        if (typeof NotificationManager !== 'undefined') {
          NotificationManager.cancelScheduledNotifications();
        }
      }
      if (type === 'stats') {
        showToast(QRI18n.t('settings.statsReset'));
        if (typeof Router !== 'undefined') {
          Router.showView('settings');
        }
      } else {
        showToast(QRI18n.t('settings.dataCleared'));
        setTimeout(function () { window.location.reload(); }, 500);
      }
    }
  };
}

/**
 * Normalise any stored date (Firestore Timestamp | ISO string | epoch ms) to a valid Date, or null.
 * Guards against Invalid Date so callers never render "Invalid Date"/null/undefined.
 */
function _toDate(v) {
  if (v == null) return null;
  var d = null;
  try {
    if (typeof v === 'object') {
      if (typeof v.toDate === 'function') d = v.toDate();              // Firestore Timestamp (compat SDK)
      else if (typeof v.seconds === 'number') d = new Date(v.seconds * 1000); // raw {seconds,nanoseconds}
    } else if (typeof v === 'number') {
      d = new Date(v);                                                 // epoch ms
    } else if (typeof v === 'string') {
      d = new Date(v);                                                 // ISO string
    }
  } catch (_) { return null; }
  return (d && !isNaN(d.getTime())) ? d : null;
}

/**
 * Open the profile modal showing user details.
 */
function openProfileModal() {
  var modal = document.getElementById('profileModal');
  if (!modal) return;
  modal.style.display = 'flex';
  document.body.classList.add('modal-open');

  var nameInput = document.getElementById('profileName');
  var handleInput = document.getElementById('profileHandle');
  var bannerEl = document.getElementById('profileBanner');
  var cancelBtn = document.getElementById('profileCancel');
  var saveBtn = document.getElementById('profileSave');

  /* Populate fields from Firestore cache or localStorage */
  var profile = {};
  var coachingId = null;
  try {
    if (typeof FirestoreSync !== 'undefined' && FirestoreSync._getCache) {
      var cache = FirestoreSync._getCache();
      if (cache && cache.profile) profile = cache.profile;
      if (cache && cache.coachingId) coachingId = cache.coachingId;
    }
  } catch (_) {}

  if (nameInput) nameInput.value = profile.name || '';
  if (handleInput) {
    /* Show handle (email prefix) — read-only */
    var handleStr = '';
    try {
      var currentUser = (typeof Auth !== 'undefined' && Auth.getCurrentUser()) ? Auth.getCurrentUser() : null;
      if (currentUser && currentUser.email) handleStr = '@' + currentUser.email.split('@')[0];
    } catch (_) {}
    handleInput.value = handleStr;
  }

  /* Coaching ID: bound → read-only display; unbound → editable ONCE (bind-once, server-enforced).
     This surfaces the existing claim-coaching path for Google sign-ups (no coaching field at signup)
     and for email users who skipped it. */
  var coachingIdInput = document.getElementById('profileCoachingId');
  var coachingHelper = document.getElementById('profileCoachingHelper');
  if (coachingIdInput) {
    if (coachingId) {
      coachingIdInput.value = coachingId;
      coachingIdInput.readOnly = true;
      coachingIdInput.disabled = true;
      if (coachingHelper) coachingHelper.style.display = 'none';
    } else {
      coachingIdInput.value = '';
      coachingIdInput.readOnly = false;
      coachingIdInput.disabled = false;
      coachingIdInput.placeholder = QRI18n.t('settings.coachingPlaceholder');
      coachingIdInput.maxLength = 50;
      if (coachingHelper) coachingHelper.style.display = '';
    }
  }

  /* Profile banner: "{Name} started mathing on {Date}".
     Resolve the start date robustly so it NEVER renders "unknown date": onboarding completion (the day the user
     started here) → client profile.createdAt → server-side root createdAt (a Firestore Timestamp). Each source may
     be a Firestore Timestamp, an ISO string, or epoch ms — _toDate() normalises all of them. */
  if (bannerEl) {
    var displayName = profile.name || QRI18n.t('settings.profileYou');
    var startSettings = {};
    try { if (typeof AppState !== 'undefined' && AppState.getSettings) startSettings = AppState.getSettings() || {}; } catch (_) {}
    var joinedDate = _toDate(startSettings.onboardingCompletedAt) || _toDate(profile.createdAt) || _toDate(cache && cache.createdAt);
    if (joinedDate) {
      var dateStr = joinedDate.toLocaleDateString((typeof QRI18n !== 'undefined') ? QRI18n.localeTag() : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      bannerEl.textContent = QRI18n.t('settings.profileJoined', { name: displayName, date: dateStr });
    } else {
      // No reliable date anywhere — use a graceful, dateless line rather than "an unknown date".
      bannerEl.textContent = QRI18n.t('settings.profileSharpening', { name: displayName });
    }
  }

  function closeModal() {
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
  }

  cancelBtn.onclick = closeModal;
  modal.onclick = function (e) {
    if (e.target === modal) closeModal();
  };

  saveBtn.onclick = function () {
    var newName = nameInput ? nameInput.value.trim() : '';

    /* Update name in Firestore */
    if (newName && typeof FirestoreSync !== 'undefined') {
      FirestoreSync.updateProfileName(newName);
      showToast(QRI18n.t('settings.profileSaved'));
    }

    /* One-time coaching claim (only when unbound and a code was typed) */
    var codeVal = (coachingIdInput && !coachingIdInput.disabled) ? coachingIdInput.value.trim().toUpperCase() : '';
    if (codeVal && typeof FirestoreSync !== 'undefined' && FirestoreSync.claimCoaching) {
      FirestoreSync.claimCoaching(codeVal, function (err) {
        if (err) {
          showToast(err.message || QRI18n.t('settings.coachingJoinFailed'));
        } else {
          showToast(QRI18n.t('settings.coachingJoined', { code: codeVal }));
        }
      });
    }

    closeModal();
  };
}

/**
 * Open the delete account confirmation modal.
 * Uses server-side API for safe, complete data deletion.
 */
function openDeleteAccountModal() {
  var modal = document.getElementById('deleteAccountModal');
  if (!modal) return;
  modal.style.display = 'flex';
  document.body.classList.add('modal-open');

  var cancelBtn = document.getElementById('deleteAccountCancel');
  var confirmBtn = document.getElementById('deleteAccountConfirm');
  var passInput = document.getElementById('deleteAccountPassword');
  var errDiv = document.getElementById('deleteAccountError');

  if (passInput) passInput.value = '';
  if (errDiv) errDiv.style.display = 'none';

  /* Provider-aware re-auth: a Google-only user has no password — show the popup-confirm note
     instead of the password field, and re-authenticate via the provider on confirm. */
  var _delUser = (typeof Auth !== 'undefined') ? Auth.getCurrentUser() : null;
  var _hasPasswordProvider = !!(_delUser && (_delUser.providerData || []).some(function (p) { return p && p.providerId === 'password'; }));
  var passLabel = document.getElementById('deleteAccountPasswordLabel');
  var providerNote = document.getElementById('deleteAccountProviderNote');
  if (passInput) passInput.style.display = _hasPasswordProvider ? '' : 'none';
  if (passLabel) passLabel.style.display = _hasPasswordProvider ? '' : 'none';
  if (providerNote) providerNote.style.display = _hasPasswordProvider ? 'none' : '';

  function closeModal() {
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
  }

  function _setDeleteLoading(loading) {
    if (confirmBtn) {
      confirmBtn.disabled = loading;
      confirmBtn.textContent = loading ? QRI18n.t('settings.deleting') : QRI18n.t('settings.deleteForever');
      if (loading) confirmBtn.classList.add('btn-loading');
      else confirmBtn.classList.remove('btn-loading');
    }
    if (cancelBtn) cancelBtn.disabled = loading;
    if (passInput) passInput.disabled = loading;
  }

  /* Map Firebase/server error codes to user-friendly messages */
  function _getDeleteErrorMessage(err) {
    if (!err) return QRI18n.t('settings.deleteFailed');
    var msg = err.message || err;
    if (typeof msg === 'string') {
      if (msg.indexOf('auth/requires-recent-login') !== -1) {
        return QRI18n.t('settings.deleteReauth');
      }
      if (msg.indexOf('auth/popup-closed-by-user') !== -1 || msg.indexOf('auth/cancelled-popup-request') !== -1) {
        return QRI18n.t('settings.deleteCancelled');
      }
      if (msg.indexOf('auth/user-mismatch') !== -1) {
        return QRI18n.t('settings.deleteMismatch');
      }
      if (msg.indexOf('auth/popup-blocked') !== -1) {
        return QRI18n.t('settings.deletePopupBlocked');
      }
      if (msg.indexOf('UNAUTHORIZED') !== -1 || msg.indexOf('token') !== -1) {
        return QRI18n.t('settings.deleteSessionExpired');
      }
      if (msg.indexOf('DELETION_FAILED') !== -1) {
        return QRI18n.t('settings.deletePartial');
      }
      if (msg.indexOf('network') !== -1 || msg.indexOf('fetch') !== -1 || msg.indexOf('Failed to fetch') !== -1) {
        return QRI18n.t('settings.deleteNetwork');
      }
    }
    return QRI18n.t('settings.deleteUnable');
  }

  cancelBtn.onclick = closeModal;
  modal.onclick = function (e) {
    if (e.target === modal) closeModal();
  };

  confirmBtn.onclick = function () {
    var passInput = document.getElementById('deleteAccountPassword');
    var errDiv = document.getElementById('deleteAccountError');
    var password = passInput ? passInput.value.trim() : '';

    if (_hasPasswordProvider && passInput && !password) {
      if (errDiv) { errDiv.textContent = QRI18n.t('settings.deletePasswordRequired'); errDiv.style.display = 'block'; }
      return;
    }

    if (typeof Auth === 'undefined' || !Auth.getCurrentUser()) {
      showToast(QRI18n.t('settings.signInToManage'));
      closeModal();
      return;
    }

    _setDeleteLoading(true);
    if (errDiv) errDiv.style.display = 'none';

    var user = Auth.getCurrentUser();
    var reauthPromise;
    if (_hasPasswordProvider) {
      var credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
      reauthPromise = user.reauthenticateWithCredential(credential);
    } else {
      reauthPromise = user.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider());
    }

    reauthPromise.then(function() {
      return Auth.getIdToken();
    }).then(function (idToken) {
      return fetch('/api/account?action=delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + idToken,
          'X-Session-Id': (window.Session ? Session.id() : '')
        }
      });
    }).then(function (resp) {
      return resp.json().then(function (data) {
        return { ok: resp.ok, status: resp.status, data: data };
      });
    }).then(function (result) {
      _setDeleteLoading(false);

      if (!result.ok || !result.data.success) {
        var serverMsg = (result.data && result.data.error && result.data.error.message)
          ? result.data.error.message
          : null;
        if (errDiv) { 
          errDiv.textContent = _getDeleteErrorMessage({ message: serverMsg || 'DELETION_FAILED' });
          errDiv.style.display = 'block';
        }
        return;
      }

      /* Server confirmed complete deletion — clear all local data */
      try {
        if (typeof AppState !== 'undefined' && typeof AppState.clearAll === 'function') {
          AppState.clearAll();
        }
        localStorage.removeItem('quant_reflex_user');
        localStorage.removeItem('quant_reflex_settings');
      } catch (_) {}

      closeModal();
      showToast(QRI18n.t('settings.accountDeleted'));

      setTimeout(function () {
        window.location.reload();
      }, 1500);

    }).catch(function (err) {
      _setDeleteLoading(false);
      console.error('[Settings] Account deletion error:', err);
      if (errDiv) { 
        errDiv.textContent = _getDeleteErrorMessage(err);
        errDiv.style.display = 'block';
      }
    });
  };
}

/**
 * Open a full-screen info modal (App Guide or About).
 * @param {string} modalId - DOM id of the modal overlay
 */
function openInfoModal(modalId) {
  var modal = document.getElementById(modalId);
  if (!modal) return;
  modal.style.display = 'flex';   /* overlay flex-centers the card (matches .info-modal-overlay) */
  modal.classList.remove('closing');
  document.body.classList.add('modal-open');
  SoundEngine.play('tableModal');

  var closeBtn = modal.querySelector('.info-modal-close');

  /* ADR-110 a11y: remember what opened us, move focus to the modal title (tabindex="-1"), and hand focus back on
     close — so keyboard/SR users land inside the dialog and aren't stranded on a hidden trigger afterwards. */
  var _trigger = (document.activeElement && document.activeElement !== document.body) ? document.activeElement : null;
  var _title = modal.querySelector('.info-modal-title');
  if (_title && _title.focus) { try { _title.focus({ preventScroll: true }); } catch (_) { try { _title.focus(); } catch (_2) {} } }

  function closeModal() {
    modal.classList.add('closing');
    SoundEngine.play('tableModal');
    document.removeEventListener('keydown', _infoModalEscapeHandler);
    _infoModalEscapeHandler = null;
    setTimeout(function () {
      modal.style.display = 'none';
      modal.classList.remove('closing');
      document.body.classList.remove('modal-open');
      if (_trigger && _trigger.focus && document.contains(_trigger)) { try { _trigger.focus({ preventScroll: true }); } catch (_) {} }
    }, 200);
  }

  /* Store handler reference on module scope for cleanup by _closeAllInfoModals */
  _infoModalEscapeHandler = function (e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  };

  if (closeBtn) closeBtn.onclick = closeModal;
  modal.onclick = function (e) {
    /* ADR-110: TOC chips (App Guide) scroll their target section within .info-modal-scroll. Delegated here so the
       chips need no per-chip wiring; honours reduced motion (instant jump instead of smooth scroll). */
    var chip = e.target && e.target.closest ? e.target.closest('.info-toc-chip') : null;
    if (chip && modal.contains(chip)) {
      var targetEl = document.getElementById(chip.getAttribute('data-target') || '');
      if (targetEl) {
        var _instant = document.body.classList.contains('reduced-motion') ||
          (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        try { targetEl.scrollIntoView({ behavior: _instant ? 'auto' : 'smooth', block: 'start' }); }
        catch (_) { targetEl.scrollIntoView(); }
      }
      return;
    }
    if (e.target === modal) closeModal();
  };
  document.addEventListener('keydown', _infoModalEscapeHandler);
}

/* Reference to the active info modal Escape handler for cleanup */
var _infoModalEscapeHandler = null;
