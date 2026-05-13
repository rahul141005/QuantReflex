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

  /* Legacy keys (for backward-compatible reads) */
  var LEGACY_KEYS = {
    settings:       'quant_reflex_settings',
    progress:       'quant_reflex_progress',
    quickLinks:     'quant_quick_links',
    customTopics:   'quant_custom_topics',
    customFormulas: 'quant_custom_formulas',
    bookmarks:      'quant_bookmarks',
    notifEnabled:   'quant_notifications_enabled',
    onboardingDone: 'quant_onboarding_complete',
    premium:        'premiumStatus',
    premiumPlus:    'premiumPlusStatus'
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

  /**
   * Read JSON from canonical key first, fallback to legacy key.
   * If found in legacy key but not canonical, auto-migrate to canonical.
   * @param {string} canonicalKey
   * @param {string} legacyKey
   * @param {*} fallback
   * @returns {*}
   */
  function _readJSONMigrating(canonicalKey, legacyKey, fallback) {
    /* Try canonical key first */
    var canonical = _readJSON(canonicalKey, null);
    if (canonical !== null) return canonical;

    /* Fallback to legacy key */
    var legacy = _readJSON(legacyKey, null);
    if (legacy !== null) {
      /* Auto-migrate: write to canonical key and delete legacy to prevent split-brain */
      _writeJSON(canonicalKey, legacy);
      try { localStorage.removeItem(legacyKey); } catch (_) {}
      return legacy;
    }

    return (typeof fallback === 'function') ? fallback() : fallback;
  }

  /**
   * Read string from canonical key first, fallback to legacy key.
   * If found in legacy key but not canonical, auto-migrate to canonical.
   * @param {string} canonicalKey
   * @param {string} legacyKey
   * @param {string} fallback
   * @returns {string}
   */
  function _readStringMigrating(canonicalKey, legacyKey, fallback) {
    var canonical = _readString(canonicalKey, null);
    if (canonical !== null) return canonical;

    var legacy = _readString(legacyKey, null);
    if (legacy !== null) {
      _writeString(canonicalKey, legacy);
      try { localStorage.removeItem(legacyKey); } catch (_) {}
      return legacy;
    }

    return fallback;
  }

  /* ---- Settings ---- */

  function getSettings() {
    var s = _readJSONMigrating(KEYS.settings, LEGACY_KEYS.settings, null);
    if (s && typeof s === 'object') return s;
    return _clone(DEFAULT_SETTINGS);
  }

  function setSettings(s) {
    _writeJSON(KEYS.settings, s);
  }

  /* ---- Progress ---- */

  function getProgress() {
    var p = _readJSONMigrating(KEYS.progress, LEGACY_KEYS.progress, null);
    if (p && typeof p === 'object') return p;
    return _clone(DEFAULT_PROGRESS);
  }

  function setProgress(p) {
    _writeJSON(KEYS.progress, p);
  }

  /* ---- Quick Links ---- */

  function getQuickLinks() {
    var links = _readJSONMigrating(KEYS.quickLinks, LEGACY_KEYS.quickLinks, null);
    if (Array.isArray(links) && links.length > 0) return links;
    return DEFAULT_QUICK_LINKS.slice();
  }

  function setQuickLinks(links) {
    _writeJSON(KEYS.quickLinks, links);
  }

  /* ---- Custom Topics ---- */

  function getCustomTopics() {
    var topics = _readJSONMigrating(KEYS.customTopics, LEGACY_KEYS.customTopics, null);
    return Array.isArray(topics) ? topics : [];
  }

  function setCustomTopics(topics) {
    _writeJSON(KEYS.customTopics, topics);
  }

  /* ---- Custom Formulas ---- */

  function getCustomFormulas() {
    var formulas = _readJSONMigrating(KEYS.customFormulas, LEGACY_KEYS.customFormulas, null);
    return (formulas && typeof formulas === 'object' && !Array.isArray(formulas)) ? formulas : {};
  }

  function setCustomFormulas(formulas) {
    _writeJSON(KEYS.customFormulas, formulas);
  }

  /* ---- Bookmarks ---- */

  function getBookmarks() {
    var bm = _readJSONMigrating(KEYS.bookmarks, LEGACY_KEYS.bookmarks, null);
    return Array.isArray(bm) ? bm : [];
  }

  function setBookmarks(bookmarks) {
    _writeJSON(KEYS.bookmarks, bookmarks);
  }

  /* ---- Notifications Enabled ---- */

  function getNotifEnabled() {
    var val = _readStringMigrating(KEYS.notifEnabled, LEGACY_KEYS.notifEnabled, null);
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
    var val = _readStringMigrating(KEYS.onboardingDone, LEGACY_KEYS.onboardingDone, null);
    return val === 'true' || val === '1';
  }

  function setOnboardingDone(done) {
    _writeString(KEYS.onboardingDone, done ? 'true' : 'false');
  }

  /* ---- Premium Status ---- */

  function getPremiumStatus() {
    var val = _readStringMigrating(KEYS.premium, LEGACY_KEYS.premium, null);
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
    var val = _readStringMigrating(KEYS.premiumPlus, LEGACY_KEYS.premiumPlus, null);
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
    for (k in LEGACY_KEYS) {
      if (LEGACY_KEYS.hasOwnProperty(k)) allKeys.push(LEGACY_KEYS[k]);
    }
    for (var i = 0; i < allKeys.length; i++) {
      try { localStorage.removeItem(allKeys[i]); } catch (_) {}
    }
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

  /**
   * Expose legacy key constants for code that still reads/writes
   * using old key names directly (e.g. Firestore sync, progress.js).
   * These will be phased out in future migration phases.
   * @returns {Object} map of logical names → legacy localStorage key strings
   */
  function getLegacyKeys() {
    var copy = {};
    for (var k in LEGACY_KEYS) {
      if (LEGACY_KEYS.hasOwnProperty(k)) copy[k] = LEGACY_KEYS[k];
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
    getLegacyKeys: getLegacyKeys,
    clearAll: clearAll,

    /* Expose defaults for reset operations */
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    DEFAULT_PROGRESS: DEFAULT_PROGRESS,
    DEFAULT_QUICK_LINKS: DEFAULT_QUICK_LINKS
  };
})();
