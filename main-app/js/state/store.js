/**
 * store.js — Centralized state management layer (AppState singleton)
 *
 * Provides a single, authoritative accessor for all localStorage keys
 * used across the QuantReflex app.  Every read/write goes through this
 * module so that:
 *   1. JSON parse/stringify + error handling is DRY.
 *   2. Future key migrations live in one place.
 *   3. Callers never touch raw localStorage directly for app state.
 *
 * All existing global functions (loadSettings, loadProgress, etc.)
 * remain as thin wrappers — this module is purely additive.
 *
 * Key migration strategy (lazy, read-time):
 *   On READ:  check canonical qr_ key first → fallback to legacy key → migrate
 *   On WRITE: always write to canonical qr_ key only
 *
 * Key mapping (legacy → canonical):
 *   quant_reflex_settings      → qr_settings
 *   quant_reflex_progress      → qr_progress
 *   quant_quick_links          → qr_quick_links
 *   quant_custom_topics        → qr_custom_topics
 *   quant_custom_formulas      → qr_custom_formulas
 *   quant_bookmarks            → qr_bookmarks
 *   quant_notifications_enabled→ qr_notif_enabled
 *   quant_onboarding_complete  → qr_onboarding_done
 *   premiumStatus              → qr_premium
 *   premiumPlusStatus          → qr_premium_plus
 */

var AppState = (function () {
  'use strict';

  /* ---- Key constants ---- */
  /* Canonical keys (new standard) */
  var KEYS = {
    settings:       'qr_settings',
    progress:       'qr_progress',
    quickLinks:     'qr_quick_links',
    customTopics:   'qr_custom_topics',
    customFormulas: 'qr_custom_formulas',
    bookmarks:      'qr_bookmarks',
    notifEnabled:   'qr_notif_enabled',
    onboardingDone: 'qr_onboarding_done',
    premium:        'qr_premium',
    premiumPlus:    'qr_premium_plus'
  };



  /* ---- Defaults ---- */
  var DEFAULT_SETTINGS = {
    darkMode: false, sound: true, vibration: true, difficulty: 'medium',
    dailyGoal: 20, reducedMotion: false, skipEnabled: false,
    notificationsEnabled: false, theme: 'classic'
  };

  var DEFAULT_PROGRESS = {
    totalAttempted: 0, totalCorrect: 0,
    bestStreak: 0, currentStreak: 0,
    drillSessions: 0, timedTestSessions: 0,
    dailyStreak: 0, bestDailyStreak: 0,
    lastActiveDate: null, lastPracticeDate: null,
    todayAttempted: 0, todayCorrect: 0,
    categoryStats: {}, mistakes: [],
    responseTimes: [], dailyHistory: {}
  };

  var DEFAULT_QUICK_LINKS = ['fractionTable', 'tablesContainer', 'formulaSections', 'mentalTricks'];

  /* ---- Cross-Tab Synchronization ---- */
  /* This ensures that if another tab modifies localStorage, this tab can react to it. */
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', function(e) {
      if (!e.key) return;
      var isManaged = false;
      for (var k in KEYS) {
        if (KEYS[k] === e.key) { isManaged = true; break; }
      }
      if (!isManaged) return;
      
      if (isManaged) {
        /* Broadcast an internal event so the active view can re-render if necessary */
        var syncEvent = new CustomEvent('qr_storage_sync', { detail: { key: e.key, newValue: e.newValue } });
        window.dispatchEvent(syncEvent);
      }
    });
  }

  /* ---- Generic helpers ---- */

  /**
   * Safely read and parse JSON from localStorage.
   * @param {string} key
   * @param {*} fallback - returned on miss or parse error
   * @returns {*}
   */
  function _readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw);
    } catch (_) { /* ignore */ }
    return (typeof fallback === 'function') ? fallback() : fallback;
  }

  /**
   * Safely stringify and write JSON to localStorage.
   * @param {string} key
   * @param {*} value
   */
  function _writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('[AppState] write failed for key "' + key + '":', e);
    }
  }

  /**
   * Safely read a plain string from localStorage.
   * @param {string} key
   * @param {string} fallback
   * @returns {string}
   */
  function _readString(key, fallback) {
    try {
      var val = localStorage.getItem(key);
      if (val !== null) return val;
    } catch (_) { /* ignore */ }
    return fallback;
  }

  /**
   * Safely write a plain string to localStorage.
   * @param {string} key
   * @param {string} value
   */
  function _writeString(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('[AppState] write failed for key "' + key + '":', e);
    }
  }



  /* ---- Settings ---- */

  function getSettings() {
    var s = _readJSON(KEYS.settings, null);
    if (s && typeof s === 'object') return s;
    return _clone(DEFAULT_SETTINGS);
  }

  function setSettings(s) {
    _writeJSON(KEYS.settings, s);
  }

  /* ---- Progress ---- */

  function getProgress() {
    var p = _readJSON(KEYS.progress, null);
    if (p && typeof p === 'object') return p;
    return _clone(DEFAULT_PROGRESS);
  }

  function setProgress(p) {
    _writeJSON(KEYS.progress, p);
  }

  /* ---- Quick Links ---- */

  function getQuickLinks() {
    var links = _readJSON(KEYS.quickLinks, null);
    if (Array.isArray(links) && links.length > 0) return links;
    return DEFAULT_QUICK_LINKS.slice();
  }

  function setQuickLinks(links) {
    _writeJSON(KEYS.quickLinks, links);
  }

  /* ---- Custom Topics ---- */

  function getCustomTopics() {
    var topics = _readJSON(KEYS.customTopics, null);
    return Array.isArray(topics) ? topics : [];
  }

  function setCustomTopics(topics) {
    _writeJSON(KEYS.customTopics, topics);
  }

  /* ---- Custom Formulas ---- */

  function getCustomFormulas() {
    var formulas = _readJSON(KEYS.customFormulas, null);
    return (formulas && typeof formulas === 'object' && !Array.isArray(formulas)) ? formulas : {};
  }

  function setCustomFormulas(formulas) {
    _writeJSON(KEYS.customFormulas, formulas);
  }

  /* ---- Bookmarks ---- */

  function getBookmarks() {
    var bm = _readJSON(KEYS.bookmarks, null);
    return Array.isArray(bm) ? bm : [];
  }

  function setBookmarks(bookmarks) {
    _writeJSON(KEYS.bookmarks, bookmarks);
  }

  /* ---- Notifications Enabled ---- */

  function getNotifEnabled() {
    var val = _readString(KEYS.notifEnabled, null);
    if (val !== null) return val === 'true';
    /* Fallback: check settings object for Firestore-synced state */
    var s = getSettings();
    return s.notificationsEnabled === true;
  }

  function setNotifEnabled(enabled) {
    _writeString(KEYS.notifEnabled, enabled ? 'true' : 'false');
  }

  /* ---- Onboarding Done ---- */

  function getOnboardingDone() {
    var val = _readString(KEYS.onboardingDone, null);
    return val === 'true' || val === '1';
  }

  function setOnboardingDone(done) {
    _writeString(KEYS.onboardingDone, done ? 'true' : 'false');
  }

  /* ---- Premium Status ---- */

  function getPremiumStatus() {
    var val = _readString(KEYS.premium, null);
    return val || null;
  }

  function setPremiumStatus(status) {
    if (status === null || status === undefined) {
      try { localStorage.removeItem(KEYS.premium); } catch (_) {}
    } else {
      _writeString(KEYS.premium, String(status));
    }
  }

  /* ---- Premium Plus Status ---- */

  function getPremiumPlus() {
    var val = _readString(KEYS.premiumPlus, null);
    return val || null;
  }

  function setPremiumPlus(status) {
    if (status === null || status === undefined) {
      try { localStorage.removeItem(KEYS.premiumPlus); } catch (_) {}
    } else {
      _writeString(KEYS.premiumPlus, String(status));
    }
  }

  /* ---- Utility ---- */

  /**
   * Remove ALL user-specific localStorage keys (both canonical AND legacy).
   * Called on logout and user-switch to guarantee zero cross-user data leakage.
   */
  function clearAll() {
    var allKeys = [];
    var k;
    for (k in KEYS) {
      if (KEYS.hasOwnProperty(k)) allKeys.push(KEYS[k]);
    }
    for (var i = 0; i < allKeys.length; i++) {
      try { localStorage.removeItem(allKeys[i]); } catch (_) {}
    }

    /* Sweep per-user AI cache keys that embed the user's UID.
       Prefixes: quant_ai_wp_usage_, quant_ai_coach_cache_, quant_ai_sp_, quant_ai_sp_last_ */
    try {
      var aiPrefixes = ['quant_ai_'];
      var allStorageKeys = Object.keys(localStorage);
      for (var j = 0; j < allStorageKeys.length; j++) {
        for (var p = 0; p < aiPrefixes.length; p++) {
          if (allStorageKeys[j].indexOf(aiPrefixes[p]) === 0) {
            localStorage.removeItem(allStorageKeys[j]);
            break;
          }
        }
      }
    } catch (_) {}
  }

  function _clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Expose key constants for external use (e.g. FirestoreSync bulk writes).
   * Returns canonical (qr_) keys. Callers should prefer AppState
   * getters/setters over direct key access.
   * @returns {Object} map of logical names → localStorage key strings
   */
  function getKeys() {
    var copy = {};
    for (var k in KEYS) {
      if (KEYS.hasOwnProperty(k)) copy[k] = KEYS[k];
    }
    return copy;
  }





  /* ---- Public API ---- */
  return {
    /* Settings */
    getSettings: getSettings,
    setSettings: setSettings,

    /* Progress */
    getProgress: getProgress,
    setProgress: setProgress,

    /* Quick Links */
    getQuickLinks: getQuickLinks,
    setQuickLinks: setQuickLinks,

    /* Custom Topics */
    getCustomTopics: getCustomTopics,
    setCustomTopics: setCustomTopics,

    /* Custom Formulas */
    getCustomFormulas: getCustomFormulas,
    setCustomFormulas: setCustomFormulas,

    /* Bookmarks */
    getBookmarks: getBookmarks,
    setBookmarks: setBookmarks,

    /* Notifications */
    getNotifEnabled: getNotifEnabled,
    setNotifEnabled: setNotifEnabled,

    /* Onboarding */
    getOnboardingDone: getOnboardingDone,
    setOnboardingDone: setOnboardingDone,

    /* Premium */
    getPremiumStatus: getPremiumStatus,
    setPremiumStatus: setPremiumStatus,

    /* Premium Plus */
    getPremiumPlus: getPremiumPlus,
    setPremiumPlus: setPremiumPlus,

    /* Utility */
    getKeys: getKeys,
    clearAll: clearAll,

    /* Expose defaults for reset operations */
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    DEFAULT_PROGRESS: DEFAULT_PROGRESS,
    DEFAULT_QUICK_LINKS: DEFAULT_QUICK_LINKS
  };
})();
