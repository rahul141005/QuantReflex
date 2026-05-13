/**
 * store.js — Centralized state management for Admin Panel
 *
 * Mirrors the AppState singleton pattern from the main app.
 * Provides a single authoritative accessor for admin session state.
 */
var AdminState = (function () {
  'use strict';

  var _state = {
    user: null,
    isAdmin: false,
    currentView: 'dashboard',
    dashboardData: null,
    usersCache: null,
    questionsCache: null,
    selectedUser: null
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
      try { _listeners[i](_state); } catch (e) { console.warn('[AdminState] listener error:', e); }
    }
  }

  function reset() {
    _state = {
      user: null,
      isAdmin: false,
      currentView: 'dashboard',
      dashboardData: null,
      usersCache: null,
      questionsCache: null,
      selectedUser: null
    };
    _notify();
  }

  return {
    get: get,
    set: set,
    subscribe: subscribe,
    reset: reset
  };
})();
