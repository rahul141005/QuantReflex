/**
 * shared-auth.js — Unified Firebase Auth Initialization Core
 *
 * Provides a standardized wrapper around Firebase Auth initialization,
 * persistence setting, and state observation across all QuantReflex apps.
 * Specific claim enforcement (admin, coaching, student) remains in the
 * app-specific auth modules.
 */
var SharedAuth = (function () {
  'use strict';

  var _auth = null;

  /**
   * Initialize Firebase Auth and listen for state changes.
   * @param {function} onStateChange - Callback receiving (user, authInstance)
   */
  function init(onStateChange) {
    if (typeof firebase === 'undefined' || !firebase.auth) {
      console.warn('Firebase Auth SDK not loaded in SharedAuth');
      return;
    }

    _auth = firebase.auth();
    _auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function (err) {
      console.warn('Auth persistence error:', err);
    });

    _auth.onAuthStateChanged(function (user) {
      onStateChange(user, _auth);
    });
  }

  return { init: init };
})();
