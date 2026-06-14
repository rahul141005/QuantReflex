/**
 * ai-analytics.js — lazy, batched AI event logger (ADR-039 / AI_INTERACTION_SYSTEM §9).
 *
 * Every AI surface emits events (shown/opened/chip_tap/deeplink/helpful_yes/helpful_no). They're queued in
 * memory and flushed lazily (on page-hide / batch threshold) to users/{uid}/aiEvents — owner-write, immutable
 * (rules). No Cloud Function trigger (Spark-safe); the shared daily cron rolls these up into engagement metrics
 * so the team can finally see which AI feature drives premium conversion / retention. Best-effort: never throws,
 * never blocks the UI.
 */
var AIAnalytics = (function () {
  var _queue = [];

  function _uid() {
    try { var u = (typeof Auth !== 'undefined' && Auth.getCurrentUser) ? Auth.getCurrentUser() : null; return (u && u.uid) || null; } catch (_) { return null; }
  }
  function _plan() {
    try { if (typeof FirestoreSync !== 'undefined' && FirestoreSync.getAccessState) { var s = FirestoreSync.getAccessState(); if (s && s.plan) return s.plan; } } catch (_) {}
    return 'free';
  }

  function log(feature, type, meta) {
    _queue.push({ feature: String(feature || 'ai').slice(0, 16), type: String(type || '').slice(0, 24), meta: meta || {}, ts: Date.now() });
    if (_queue.length >= 12) flush();
  }

  function flush() {
    if (!_queue.length) return;
    var uid = _uid(); if (!uid) return;
    if (typeof firebase === 'undefined' || !firebase.firestore) { _queue = []; return; }
    var batch = _queue.splice(0, 25);
    try {
      var col = firebase.firestore().collection('users').doc(uid).collection('aiEvents');
      var plan = _plan();
      batch.forEach(function (e) {
        col.add({ feature: e.feature, type: e.type, meta: e.meta, plan: plan, ts: e.ts, createdAt: firebase.firestore.FieldValue.serverTimestamp() })
          .catch(function () {});
      });
    } catch (_) { /* best-effort */ }
  }

  try {
    window.addEventListener('pagehide', flush);
    window.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
  } catch (_) {}

  return { log: log, flush: flush };
})();
if (typeof window !== 'undefined') window.AIAnalytics = AIAnalytics;
