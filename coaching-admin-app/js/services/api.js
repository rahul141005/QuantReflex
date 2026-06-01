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
      return resp.json().then(function (data) {
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
    return _fetch('/api/coaching/students?action=list').then(function (data) {
      CoachingState.set({ studentsCache: data, studentsFetchedAt: Date.now() });
      return data;
    });
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
   * Get leaderboard.
   * @param {string} [period] — daily|weekly|monthly|allTime
   * @param {string} [metric] — accuracy|speed|streak|questions|consistency
   * @param {boolean} [forceRefresh]
   * @returns {Promise<object>}
   */
  function getLeaderboard(period, metric, forceRefresh) {
    var p = period || 'weekly';
    var m = metric || 'accuracy';
    /* Cache key includes params so different combos aren't mixed */
    var cacheKey = p + '_' + m;
    var cached = CoachingState.get('leaderboardCache');
    if (!forceRefresh && cached && cached._cacheKey === cacheKey &&
        CoachingState.isCacheFresh('leaderboardCache', 'leaderboardFetchedAt')) {
      return Promise.resolve(cached);
    }
    return _fetch('/api/coaching/leaderboard?period=' + p + '&metric=' + m).then(function (data) {
      data._cacheKey = cacheKey;
      CoachingState.set({ leaderboardCache: data, leaderboardFetchedAt: Date.now() });
      return data;
    });
  }

  /**
   * Send a notice to coaching students.
   * @param {string} title
   * @param {string} body
   * @param {string} [scheduledFor] — ISO date string for scheduled delivery
   * @param {string} [targetUid] — Send specifically to this student
   * @param {string} [targetTopic] — Send specifically to students struggling in this topic
   * @returns {Promise<object>}
   */
  function sendNotice(title, body, scheduledFor, targetUid, targetTopic) {
    var payload = { title: title, body: body };
    if (scheduledFor) payload.scheduledFor = scheduledFor;
    if (targetUid) payload.targetUid = targetUid;
    if (targetTopic) payload.targetTopic = targetTopic;
    return _fetch('/api/coaching/notices?action=send', {
      method: 'POST',
      body: JSON.stringify(payload)
    }).then(function (data) {
      /* Invalidate notices cache so history refreshes */
      CoachingState.invalidateCache('noticesCache', 'noticesFetchedAt');
      return data;
    });
  }

  /**
   * Get notice history.
   * @param {boolean} [forceRefresh]
   * @returns {Promise<object>}
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

  /**
   * Get coaching insights.
   * @param {boolean} [forceRefresh]
   * @returns {Promise<object>}
   */
  function getInsights(forceRefresh) {
    if (!forceRefresh && CoachingState.isCacheFresh('insightsCache', 'insightsFetchedAt')) {
      return Promise.resolve(CoachingState.get('insightsCache'));
    }
    return _fetch('/api/coaching/insights').then(function (data) {
      CoachingState.set({ insightsCache: data, insightsFetchedAt: Date.now() });
      return data;
    });
  }

  /**
   * Get pending scheduled notices.
   * @returns {Promise<object>}
   */
  function getScheduledNotices() {
    return _fetch('/api/coaching/notices?action=scheduled');
  }

  /**
   * Cancel a pending scheduled notice.
   * @param {string} noticeId
   * @returns {Promise<object>}
   */
  function cancelScheduledNotice(noticeId) {
    return _fetch('/api/coaching/notices?action=cancel-scheduled', {
      method: 'POST',
      body: JSON.stringify({ noticeId: noticeId })
    });
  }

  return {
    getDashboard: getDashboard,
    getStudents: getStudents,
    getStudentDetails: getStudentDetails,
    getLeaderboard: getLeaderboard,
    sendNotice: sendNotice,
    getNoticeHistory: getNoticeHistory,
    getScheduledNotices: getScheduledNotices,
    cancelScheduledNotice: cancelScheduledNotice,
    getInsights: getInsights
  };
})();
