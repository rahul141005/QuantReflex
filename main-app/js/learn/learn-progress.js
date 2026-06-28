/**
 * learn/learn-progress.js — per-topic learning progress, revision timing & topic bookmarks (ADR-069, Phase 4).
 *
 * localStorage-primary (the same model as the rest of Learn user data) with a best-effort push to the user's
 * Firestore doc via the EXISTING FirestoreSync.queueUpdate mechanism (same path as customTopics/bookmarks — no new
 * collection, no rule change). Powers: Continue/Recently-viewed, Completion, spaced "Due for revision"
 * (revisionIntervalDays), and topic-level bookmarks. The recency/due/recent math is factored into PURE helpers so
 * scripts/learn-progress.check.js can verify it without a DOM. No AI.
 */
var LearnProgress = (function () {
  'use strict';

  var PROGRESS_KEY = 'quant_learn_progress';   // { topicId: { viewedAt:ms, completedAt:ms|null } }
  var BOOKMARK_KEY = 'quant_learn_bookmarks';  // [ topicId ]
  var DAY = 86400000;

  function _read(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (_) { return fallback; }
  }
  function _write(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {} }
  function _now() { return Date.now(); }

  function _progress() { return _read(PROGRESS_KEY, {}) || {}; }
  function _bookmarks() { var a = _read(BOOKMARK_KEY, []); return Object.prototype.toString.call(a) === '[object Array]' ? a : []; }

  function _saveProgress(p) { _write(PROGRESS_KEY, p); if (typeof FirestoreSync !== 'undefined' && FirestoreSync.queueUpdate) { try { FirestoreSync.queueUpdate('learnProgress', p); } catch (_) {} } }
  function _saveBookmarks(b) { _write(BOOKMARK_KEY, b); if (typeof FirestoreSync !== 'undefined' && FirestoreSync.queueUpdate) { try { FirestoreSync.queueUpdate('learnTopicBookmarks', b); } catch (_) {} } }

  /* ---- progress ---- */
  function markViewed(id) {
    if (!id) return;
    var p = _progress();
    var prev = p[id] || {};
    p[id] = { viewedAt: _now(), completedAt: prev.completedAt || null };
    _saveProgress(p);
  }
  function isViewed(id) { return !!_progress()[id]; }
  function viewedAt(id) { var e = _progress()[id]; return e ? (e.viewedAt || 0) : 0; }
  function isComplete(id) { var e = _progress()[id]; return !!(e && e.completedAt); }
  function toggleComplete(id) {
    var p = _progress(); var prev = p[id] || { viewedAt: _now() };
    prev.completedAt = prev.completedAt ? null : _now();
    p[id] = prev; _saveProgress(p);
    return !!prev.completedAt;
  }
  function completedCount() { var p = _progress(); return Object.keys(p).filter(function (k) { return p[k] && p[k].completedAt; }).length; }

  /* ---- topic bookmarks ---- */
  function isBookmarked(id) { return _bookmarks().indexOf(id) !== -1; }
  function toggleBookmark(id) {
    var b = _bookmarks(); var i = b.indexOf(id);
    if (i === -1) b.push(id); else b.splice(i, 1);
    _saveBookmarks(b); return i === -1;
  }
  function bookmarkedIds() { return _bookmarks().slice(); }

  /* ---- pure helpers (recency / spaced revision) — exposed for tests ---- */
  function computeRecent(progressMap, n) {
    return Object.keys(progressMap || {})
      .filter(function (id) { return progressMap[id] && progressMap[id].viewedAt; })
      .sort(function (a, b) { return progressMap[b].viewedAt - progressMap[a].viewedAt; })
      .slice(0, n || 5);
  }
  /** topics: [{id, revisionIntervalDays}] → ids viewed at least `interval` days ago, oldest-first (most overdue). */
  function computeDue(progressMap, topics, now) {
    now = now || _now();
    /* Every Learn topic carries an explicit revisionIntervalDays (data/knowledge/*.js), so this fallback never
       fires in production; it only keeps computeDue total for ad-hoc/test inputs that omit the field. */
    var intervalOf = {}; (topics || []).forEach(function (t) { intervalOf[t.id] = t.revisionIntervalDays || 5; });
    return Object.keys(progressMap || {})
      .filter(function (id) {
        var e = progressMap[id]; if (!e || !e.viewedAt) return false;
        var iv = intervalOf[id]; if (iv == null) return false;       // unknown topic → not due
        return (now - e.viewedAt) >= iv * DAY;
      })
      .sort(function (a, b) { return progressMap[a].viewedAt - progressMap[b].viewedAt; });
  }

  function recent(n) { return computeRecent(_progress(), n); }
  function due(topics, now) { return computeDue(_progress(), topics, now); }

  var API = {
    markViewed: markViewed, isViewed: isViewed, viewedAt: viewedAt,
    isComplete: isComplete, toggleComplete: toggleComplete, completedCount: completedCount,
    isBookmarked: isBookmarked, toggleBookmark: toggleBookmark, bookmarkedIds: bookmarkedIds,
    recent: recent, due: due,
    computeRecent: computeRecent, computeDue: computeDue,
    PROGRESS_KEY: PROGRESS_KEY, BOOKMARK_KEY: BOOKMARK_KEY
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.LearnProgress = API;
  return API;
})();
