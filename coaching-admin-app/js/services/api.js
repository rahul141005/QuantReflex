/**
 * api.js — API client for Coaching Admin Panel
 *
 * All requests go through authenticated Vercel serverless endpoints.
 * Automatically attaches JWT bearer token.
 * Uses CoachingState cache to avoid redundant fetches.
 */
var CoachingAPI = (function () {
  'use strict';

  /**
   * Authenticated fetch wrapper.
   * @param {string} url
   * @param {object} [options]
   * @returns {Promise<object>}
   */
  function _fetch(url, options) {
    return CoachingAuth.getToken().then(function (token) {
      var opts = Object.assign({
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        }
      }, options || {});
      return fetch(url, opts);
    }).then(function (resp) {
      return resp.json().catch(function () {
        throw new Error('Received an invalid response from the server.');
      }).then(function (data) {
        if (!resp.ok) {
          var errMsg = (data.error && data.error.message) || data.error || 'Request failed';
          throw new Error(errMsg);
        }
        return data;
      });
    });
  }

  /**
   * Get dashboard metrics.
   * @param {boolean} [forceRefresh] — bypass cache
   * @returns {Promise<object>}
   */
  function getDashboard(forceRefresh) {
    if (!forceRefresh && CoachingState.isCacheFresh('dashboardData', 'dashboardFetchedAt')) {
      return Promise.resolve(CoachingState.get('dashboardData'));
    }
    return _fetch('/api/coaching/dashboard').then(function (data) {
      CoachingState.set({ dashboardData: data, dashboardFetchedAt: Date.now() });
      return data;
    });
  }

  /**
   * Get student list.
   * @param {boolean} [forceRefresh]
   * @returns {Promise<object>}
   */
  function getStudents(forceRefresh) {
    if (!forceRefresh && CoachingState.isCacheFresh('studentsCache', 'studentsFetchedAt')) {
      return Promise.resolve(CoachingState.get('studentsCache'));
    }
    return _fetch('/api/coaching/students?action=list&limit=50').then(function (data) {
      CoachingState.set({ studentsCache: data, studentsFetchedAt: Date.now() });
      return data;
    });
  }

  /**
   * Get paginated student list.
   * @param {string} cursor
   * @returns {Promise<object>}
   */
  function getStudentsPaginated(cursor) {
    if (!cursor) return Promise.resolve({ students: [] });
    return _fetch('/api/coaching/students?action=list&limit=50&cursor=' + encodeURIComponent(cursor));
  }

  /**
   * Get detailed student profile.
   * @param {string} uid
   * @returns {Promise<object>}
   */
  function getStudentDetails(uid) {
    return _fetch('/api/coaching/students?action=details&uid=' + encodeURIComponent(uid));
  }

  /**
   * Save (or clear, when text is empty) the one plain-text coaching note for a student (ADR-030).
   * @param {string} uid
   * @param {string} text
   */
  function saveNote(uid, text) {
    return _fetch('/api/coaching/students?action=save-note', {
      method: 'POST',
      body: JSON.stringify({ uid: uid, text: text || '' })
    });
  }

  /**
   * Get the coaching's PERFORMANCE data (server-computed from real dated dailyHistory):
   * accuracy trend + participation trend (live today), improving/declining are NOT returned here
   * (the old slice heuristic was removed — real improvers come from coachingMetrics history).
   * @param {boolean} [forceRefresh]
   */
  function getPerformance(forceRefresh) {
    if (!forceRefresh && CoachingState.isCacheFresh('insightsCache', 'insightsFetchedAt')) {
      return Promise.resolve(CoachingState.get('insightsCache'));
    }
    return _fetch('/api/coaching/insights').then(function (data) {
      CoachingState.set({ insightsCache: data, insightsFetchedAt: Date.now() });
      return data;
    });
  }

  /**
   * Read this coaching's per-day rollup (coachingMetrics/{coachingId}, ADR-027) DIRECTLY via the
   * Firebase client SDK — the security rule allows a coaching admin to read only its own doc, so no
   * serverless function is needed. Returns { days: { 'YYYY-MM-DD': {avgSpeed, avgAccuracy, ...} } } or
   * { days: {} } when no rollups have accrued yet (the daily cron writes them from 2026-06-13 forward).
   * @param {boolean} [forceRefresh]
   */
  function getCoachingMetrics(forceRefresh) {
    if (!forceRefresh && CoachingState.isCacheFresh('coachingMetricsCache', 'coachingMetricsFetchedAt')) {
      return Promise.resolve(CoachingState.get('coachingMetricsCache'));
    }
    var coachingId = CoachingState.get('coachingId');
    if (!coachingId || typeof firebase === 'undefined' || !firebase.firestore) {
      return Promise.resolve({ days: {} });
    }
    return firebase.firestore().collection('coachingMetrics').doc(coachingId).get()
      .then(function (snap) {
        var data = snap.exists ? (snap.data() || {}) : {};
        if (!data.days) data.days = {};
        CoachingState.set({ coachingMetricsCache: data, coachingMetricsFetchedAt: Date.now() });
        return data;
      })
      .catch(function () { return { days: {} }; });   // missing/denied → honest empty (collecting state)
  }

  /**
   * Send an engagement notice. Audience-aware (ADR-028 Engagement Center). NO scheduling (removed).
   * @param {object} opts - { title, body, segment?: 'all'|'premium'|'free', targetUid?, targetTopic? }
   */
  function sendNotice(opts) {
    opts = opts || {};
    var payload = { title: opts.title, body: opts.body };
    if (opts.segment && opts.segment !== 'all') payload.segment = opts.segment;
    if (opts.targetUid) payload.targetUid = opts.targetUid;
    if (opts.targetTopic) payload.targetTopic = opts.targetTopic;
    return _fetch('/api/coaching/notices?action=send', {
      method: 'POST',
      body: JSON.stringify(payload)
    }).then(function (data) {
      CoachingState.invalidateCache('noticesCache', 'noticesFetchedAt');
      return data;
    });
  }

  /**
   * Recent notices (last 20) — a read-only log, not a management console.
   * @param {boolean} [forceRefresh]
   */
  function getNoticeHistory(forceRefresh) {
    if (!forceRefresh && CoachingState.isCacheFresh('noticesCache', 'noticesFetchedAt')) {
      return Promise.resolve(CoachingState.get('noticesCache'));
    }
    return _fetch('/api/coaching/notices?action=history').then(function (data) {
      CoachingState.set({ noticesCache: data, noticesFetchedAt: Date.now() });
      return data;
    });
  }

  return {
    getDashboard: getDashboard,
    getStudents: getStudents,
    getStudentsPaginated: getStudentsPaginated,
    getStudentDetails: getStudentDetails,
    saveNote: saveNote,
    getPerformance: getPerformance,
    getCoachingMetrics: getCoachingMetrics,
    sendNotice: sendNotice,
    getNoticeHistory: getNoticeHistory
  };
})();
