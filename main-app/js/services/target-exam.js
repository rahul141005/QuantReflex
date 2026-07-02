/**
 * target-exam.js — the ONE canonical accessor for the student's target exam.
 *
 * Before this module there were two disconnected notions of "exam":
 *   - localStorage['qr_active_exam']  (written only by the premium Planner, local-only)
 *   - AppState settings               (synced to Firestore, had no exam field)
 * Every consumer (Timed Mock, Learn badges, Stats readiness, category picker)
 * read the local-only key, so a user who never opened the Planner had no exam
 * identity and the value never followed them across devices.
 *
 * Canonical storage is settings.targetExam (auto-synced — FirestoreSync writes
 * the whole settings object, no per-key whitelist). qr_active_exam is kept as a
 * local mirror so nothing that still reads it breaks, and as the migration
 * source for users who set an exam via the Planner before this module existed.
 *
 * All ids are QR_SYLLABUS exam ids ('cat', 'ibpsclerk', …) — the same id space
 * used by QR_EXAMREL.EXAM_TRACK and the mock engine.
 */
var TargetExam = (function () {
  'use strict';

  var LEGACY_KEY = 'qr_active_exam';

  function _isValid(id) {
    if (!id) return false;
    try {
      if (typeof QR_SYLLABUS !== 'undefined' && typeof QR_SYLLABUS.getExam === 'function') {
        var ex = QR_SYLLABUS.getExam(id);
        return !!ex && !ex.hidden;
      }
    } catch (_) {}
    /* Syllabus not loaded yet — accept the raw id rather than dropping it. */
    return typeof id === 'string' && id.length > 0;
  }

  function _settings() {
    try {
      if (typeof AppState !== 'undefined') return AppState.getSettings() || {};
      return JSON.parse(localStorage.getItem('qr_settings') || '{}');
    } catch (_) { return {}; }
  }

  /** The current target exam id, or null. Canonical field first, legacy mirror as migration fallback. */
  function get() {
    var s = _settings();
    if (_isValid(s.targetExam)) return s.targetExam;
    try {
      var legacy = localStorage.getItem(LEGACY_KEY);
      if (_isValid(legacy)) return legacy;
    } catch (_) {}
    return null;
  }

  /** Set (or clear with null) the target exam. Persists to synced settings and mirrors the legacy key. */
  function set(examId) {
    var id = _isValid(examId) ? examId : null;
    try {
      var s = _settings();
      if (id) {
        s.targetExam = id;
        try {
          if (typeof QR_SYLLABUS !== 'undefined' && QR_SYLLABUS.getExam(id)) {
            s.targetTier = QR_SYLLABUS.getExam(id).tier || null;
          }
        } catch (_) {}
      } else {
        delete s.targetExam;
        delete s.targetTier;
      }
      /* saveSettings (settings.js) = AppState + FirestoreSync in one call; fall back to AppState alone pre-boot. */
      if (typeof saveSettings === 'function') saveSettings(s);
      else if (typeof AppState !== 'undefined') AppState.setSettings(s);
    } catch (_) {}
    try {
      if (id) localStorage.setItem(LEGACY_KEY, id);
      else localStorage.removeItem(LEGACY_KEY);
    } catch (_) {}
    return id;
  }

  function clear() { return set(null); }

  /** Display name for the current (or given) exam id, or ''. */
  function label(examId) {
    var id = examId || get();
    if (!id) return '';
    try {
      var ex = (typeof QR_SYLLABUS !== 'undefined') ? QR_SYLLABUS.getExam(id) : null;
      return (ex && ex.name) || '';
    } catch (_) { return ''; }
  }

  return { get: get, set: set, clear: clear, label: label };
})();
