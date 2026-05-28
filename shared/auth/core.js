/**
 * core.js — Shared Firebase Auth Core
 *
 * Provides a unified Firebase Authentication wrapper for the entire ecosystem.
 * Handles persistence, token caching, login, logout, and standardized error parsing.
 * Leaves app-specific claims verification and UI routing to the app's individual wrapper.
 */

var AuthCore = (function () {
  'use strict';

  var _auth = null;
  var _currentUser = null;
  var _authReady = false;
  var _authReadyCallbacks = [];
  var _stateChangeListeners = [];

  /**
   * Initializes Firebase Auth and sets up the ecosystem-wide persistence
   * and base observer.
   * @param {function} onStateChange - App-specific callback fired on every state change.
   *                                   Receives (user, result_from_getIdTokenResult).
   */
  function init(onStateChange) {
    if (_auth) {
      if (onStateChange && _stateChangeListeners.indexOf(onStateChange) === -1) {
        _stateChangeListeners.push(onStateChange);
      }
      return;
    }

    if (!FirebaseApp.isConfigured() || typeof firebase === 'undefined' || !firebase.auth) {
      return;
    }

    if (onStateChange) {
      _stateChangeListeners.push(onStateChange);
    }

    try {
      _auth = firebase.auth();
      /* Set persistence to LOCAL — survives browser restart */
      _auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function (err) {
        console.warn('Auth persistence error:', err);
      });

      _auth.onAuthStateChanged(function (user) {
        var previousUser = _currentUser;
        _currentUser = user;

        if (previousUser && (!user || user.uid !== previousUser.uid)) {
          /* Inform FirestoreSync or AppState to reset if they exist in context */
          if (typeof FirestoreSync !== 'undefined' && typeof FirestoreSync.resetSyncState === 'function') {
            FirestoreSync.resetSyncState();
          }
        }

        if (user) {
          /* Using false to read cached claims, preventing slow app boots. */
          user.getIdTokenResult(false).then(function (result) {
            _notifyListeners(user, result);
            _finishAuthReady(user);
          }).catch(function (err) {
            console.warn('[AuthCore] Error fetching token claims:', err);
            _notifyListeners(user, null);
            _finishAuthReady(user);
          });
        } else {
          _notifyListeners(null, null);
          _finishAuthReady(null);
        }
      });
    } catch (e) {
      console.warn('Auth initialization failed:', e);
    }
  }

  function _notifyListeners(user, tokenResult) {
    for (var i = 0; i < _stateChangeListeners.length; i++) {
      try { _stateChangeListeners[i](user, tokenResult); } catch (e) { console.warn('Auth state listener error:', e); }
    }
  }

  function _finishAuthReady(user) {
    _authReady = true;
    for (var i = 0; i < _authReadyCallbacks.length; i++) {
      try { _authReadyCallbacks[i](user); } catch (e) { console.warn('Auth callback error:', e); }
    }
    _authReadyCallbacks = [];
  }

  /**
   * Register a callback to fire exactly once when auth state is first determined.
   */
  function onAuthReady(callback) {
    if (_authReady) {
      callback(_currentUser);
    } else {
      _authReadyCallbacks.push(callback);
    }
  }

  /**
   * Maps Firebase Error Codes to readable strings.
   */
  function getReadableError(error) {
    if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-email') {
      return 'No account found with this email.';
    } else if (error.code === 'auth/wrong-password') {
      return 'Incorrect password.';
    } else if (error.code === 'auth/invalid-credential') {
      return 'Invalid email or password.';
    } else if (error.code === 'auth/too-many-requests') {
      return 'Too many attempts. Please try again later.';
    } else if (error.code === 'auth/email-already-in-use') {
      return 'An account already exists with this email address.';
    } else if (error.code === 'auth/weak-password') {
      return 'Password is too weak.';
    } else if (error.code === 'auth/network-request-failed') {
      return 'Network unavailable. Please check your connection.';
    }
    return error.message || 'Authentication failed.';
  }

  /**
   * Standard login method.
   */
  function login(email, password) {
    var cleanEmail = (email || '').trim().toLowerCase();
    
    // AuthValidators is global if included via script tag
    if (typeof AuthValidators !== 'undefined') {
      var err = AuthValidators.validateLogin(cleanEmail, password);
      if (err) return Promise.reject(new Error(err));
    }

    if (!_auth) return Promise.reject(new Error('Authentication service not available.'));

    return _auth.signInWithEmailAndPassword(cleanEmail, password).catch(function (error) {
      throw new Error(getReadableError(error));
    });
  }

  /**
   * Standard logout method.
   */
  function logout() {
    if (!_auth) return Promise.reject(new Error('Authentication service not available.'));

    /* Custom hook for ecosystem components that need cleanup before signOut */
    if (typeof DuelCore !== 'undefined' && typeof DuelCore.stopListening === 'function') {
      DuelCore.stopListening();
    }

    return _auth.signOut().then(function () {
      _currentUser = null;
    }).catch(function (error) {
      throw new Error('Logout failed: ' + error.message);
    });
  }

  /**
   * Sign in using a custom token minted by a backend (used during registration flows).
   */
  function signInWithCustomToken(token) {
    if (!_auth) return Promise.reject(new Error('Authentication service not available.'));
    return _auth.signInWithCustomToken(token);
  }

  /**
   * Returns current user.
   */
  function getCurrentUser() {
    return _currentUser;
  }

  /**
   * Get raw ID Token string for Vercel backend calls.
   */
  function getIdToken() {
    if (!_currentUser) return Promise.reject(new Error('Not authenticated'));
    return _currentUser.getIdToken();
  }

  return {
    init: init,
    onAuthReady: onAuthReady,
    login: login,
    logout: logout,
    signInWithCustomToken: signInWithCustomToken,
    getCurrentUser: getCurrentUser,
    getIdToken: getIdToken,
    getReadableError: getReadableError
  };
})();
