/**
 * event-registry.js — Centralized event listener management
 * Prevents memory leaks and orphaned listeners across the PWA lifecycle.
 */

var EventRegistry = (function () {
  'use strict';

  var _listeners = {}; // viewId -> Array of cleanup functions

  function _initView(viewId) {
    if (!_listeners[viewId]) {
      _listeners[viewId] = [];
    }
  }

  /**
   * Registers a standard DOM event listener.
   * @param {string} viewId 
   * @param {Element|Window|Document} element 
   * @param {string} event 
   * @param {Function} handler 
   * @param {Object|boolean} options 
   */
  function addDOMListener(viewId, element, event, handler, options) {
    if (!element) return;
    _initView(viewId);
    element.addEventListener(event, handler, options);
    _listeners[viewId].push(function () {
      element.removeEventListener(event, handler, options);
    });
  }

  /**
   * Registers a Firebase onSnapshot listener (or any function that returns an unsubscribe callable).
   * @param {string} viewId 
   * @param {Function} unsubscribeFn 
   */
  function addFirebaseListener(viewId, unsubscribeFn) {
    if (typeof unsubscribeFn !== 'function') return;
    _initView(viewId);
    _listeners[viewId].push(unsubscribeFn);
  }

  /**
   * Cleans up all registered listeners for a specific view.
   * @param {string} viewId 
   */
  function clearViewListeners(viewId) {
    if (_listeners[viewId]) {
      _listeners[viewId].forEach(function (cleanup) {
        try { cleanup(); } catch (e) { console.error('[EventRegistry] Cleanup error:', e); }
      });
      _listeners[viewId] = [];
    }
  }

  return {
    addDOMListener: addDOMListener,
    addFirebaseListener: addFirebaseListener,
    clearViewListeners: clearViewListeners
  };
})();
