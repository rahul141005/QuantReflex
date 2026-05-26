/**
 * store.js — Centralized state management for Coaching Admin Panel
 *
 * Mirrors the AdminState singleton pattern from the super-admin-app.
 * Provides a single authoritative accessor for coaching session state.
 * Includes 5-minute data cache management.
 */
var CoachingState = (function () {
  'use strict';

  var CACHE_TTL_MS = 5 * 60 * 1000; /* 5 minutes */

  var _state = {
    user: null,
    isCoachingAdmin: false,
    coachingId: null,
    coachingName: null,
    currentView: 'dashboard',
    dashboardData: null,
    dashboardFetchedAt: 0,
    studentsCache: null,
    studentsFetchedAt: 0,
    leaderboardCache: null,
    leaderboardFetchedAt: 0,
    noticesCache: null,
    noticesFetchedAt: 0,
    selectedStudent: null,
    insightsCache: null,
    insightsFetchedAt: 0
  };

  var _listeners = [];

  function get(key) {
    return key ? _state[key] : Object.assign({}, _state);
  }

  function set(updates) {
    var changed = false;
    for (var key in updates) {
      if (updates.hasOwnProperty(key) && _state[key] !== updates[key]) {
        _state[key] = updates[key];
        changed = true;
      }
    }
    if (changed) _notify();
  }

  function subscribe(fn) {
    _listeners.push(fn);
    return function () {
      _listeners = _listeners.filter(function (l) { return l !== fn; });
    };
  }

  function _notify() {
    for (var i = 0; i < _listeners.length; i++) {
      try { _listeners[i](_state); } catch (e) { console.warn('[CoachingState] listener error:', e); }
    }
  }

  /**
   * Check if cached data is still fresh.
   * @param {string} cacheKey — key in state (e.g., 'dashboardData')
   * @param {string} tsKey — timestamp key (e.g., 'dashboardFetchedAt')
   * @returns {boolean} true if cache is valid and fresh
   */
  function isCacheFresh(cacheKey, tsKey) {
    if (!_state[cacheKey]) return false;
    if (!_state[tsKey]) return false;
    return (Date.now() - _state[tsKey]) < CACHE_TTL_MS;
  }

  /**
   * Invalidate a specific cache.
   * Used when the refresh button is pressed.
   */
  function invalidateCache(cacheKey, tsKey) {
    _state[cacheKey] = null;
    _state[tsKey] = 0;
  }

  /**
   * Invalidate ALL caches (used on force refresh).
   */
  function invalidateAll() {
    _state.dashboardData = null;
    _state.dashboardFetchedAt = 0;
    _state.studentsCache = null;
    _state.studentsFetchedAt = 0;
    _state.leaderboardCache = null;
    _state.leaderboardFetchedAt = 0;
    _state.noticesCache = null;
    _state.noticesFetchedAt = 0;
    _state.insightsCache = null;
    _state.insightsFetchedAt = 0;
  }

  function reset() {
    _state = {
      user: null,
      isCoachingAdmin: false,
      coachingId: null,
      coachingName: null,
      currentView: 'dashboard',
      dashboardData: null,
      dashboardFetchedAt: 0,
      studentsCache: null,
      studentsFetchedAt: 0,
      leaderboardCache: null,
      leaderboardFetchedAt: 0,
      noticesCache: null,
      noticesFetchedAt: 0,
      selectedStudent: null,
      insightsCache: null,
      insightsFetchedAt: 0
    };
    _notify();
  }

  return {
    get: get,
    set: set,
    subscribe: subscribe,
    reset: reset,
    isCacheFresh: isCacheFresh,
    invalidateCache: invalidateCache,
    invalidateAll: invalidateAll,
    CACHE_TTL_MS: CACHE_TTL_MS
  };
})();
