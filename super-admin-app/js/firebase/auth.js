/**
 * auth.js — Firebase Auth module for Super Admin App
 *
 * Handles login/logout and enforces admin: true custom claim.
 * Hardcoded security requirement: Only quantreflex@gmail.com is permitted to login.
 */
var AdminAuth = (function () {
  'use strict';

  var _auth = null;
  var _currentUser = null;
  var _authReady = false;
  var _authReadyCallbacks = [];
  var _freshLogin = false; /* true only between an interactive login() and the next onAuthStateChanged (Phase 5) */

  function init() {
    if (typeof firebase === 'undefined' || !firebase.auth) {
      console.warn('Firebase Auth SDK not loaded');
      return;
    }

    _auth = firebase.auth();
    _auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function (err) {
      console.warn('Auth persistence error:', err);
    });

    _auth.onAuthStateChanged(function (user) {
      _currentUser = user;

      if (user) {
        if (user.email !== 'quantreflex@gmail.com') {
          if (typeof SecurityEvents !== 'undefined') SecurityEvents.record('suspicious_access', { email: user.email, uid: user.uid, reason: 'unauthorized_email_authed' });
          _showLoginError('Unauthorized email address.');
          logout();
          _finishAuthReady(user);
          return;
        }

        user.getIdTokenResult(false).then(function (tokenResult) {
          if (tokenResult && tokenResult.claims && tokenResult.claims.admin === true) {
            if (_freshLogin && typeof SecurityEvents !== 'undefined') SecurityEvents.record('admin_login', { email: user.email, uid: user.uid, reason: 'admin_login_success' });
            _freshLogin = false;
            AdminState.set({ user: user, isAdmin: true });
            _showApp();
          } else {
            if (typeof SecurityEvents !== 'undefined') SecurityEvents.record('suspicious_access', { email: user.email, uid: user.uid, reason: 'non_admin_access' });
            _showLoginError('Access denied. Admin privileges required.');
            logout();
          }
          _finishAuthReady(user);
        }).catch(function (err) {
          console.warn('[Auth] Error fetching token claims:', err);
          _showLoginError('Failed to verify admin privileges.');
          logout();
          _finishAuthReady(user);
        });
      } else {
        AdminState.set({ user: null, isAdmin: false });
        _showLogin();
        _finishAuthReady(null);
      }
    });
  }

  function _finishAuthReady(user) {
    _authReady = true;
    for (var i = 0; i < _authReadyCallbacks.length; i++) {
      try { _authReadyCallbacks[i](user); } catch (e) { console.warn('Auth callback error:', e); }
    }
    _authReadyCallbacks = [];
  }

  function login(email, password) {
    _hideLoginError();
    if (email !== 'quantreflex@gmail.com') {
      if (typeof SecurityEvents !== 'undefined') SecurityEvents.record('suspicious_access', { email: email, reason: 'unauthorized_email' });
      _showLoginError('Unauthorized email address.');
      return;
    }
    
    // Check if the password provided is strictly the permitted one
    if (password !== 'pass@iON2203') {
       if (typeof SecurityEvents !== 'undefined') SecurityEvents.record('suspicious_access', { email: email, reason: 'invalid_admin_credentials' });
       _showLoginError('Invalid credentials.');
       return;
    }

    if (!_auth) {
      _showLoginError('Authentication service not available.');
      return;
    }

    _freshLogin = true;
    _auth.signInWithEmailAndPassword(email, password).catch(function(err) {
      if (typeof SecurityEvents !== 'undefined') SecurityEvents.record('failed_login', { email: email, errorCode: err && err.code, reason: 'admin_login_failed' });
      _showLoginError(err.message);
    });
  }

  function logout() {
    if (_auth) {
      _auth.signOut().then(function() {
        _currentUser = null;
        AdminState.reset();
      }).catch(function(err) {
        _showLoginError('Logout failed: ' + err.message);
      });
    } else {
      AdminState.reset();
    }
  }

  function onAuthReady(fn) {
    if (_authReady) {
      fn(_currentUser);
    } else {
      _authReadyCallbacks.push(function(user) {
        fn(user);
      });
    }
  }

  function _showLogin() {
    var loginScreen = document.getElementById('loginScreen');
    var appShell = document.getElementById('appShell');
    if(loginScreen) loginScreen.style.display = 'flex';
    if(appShell) appShell.style.display = 'none';
  }

  function _showApp() {
    var loginScreen = document.getElementById('loginScreen');
    var appShell = document.getElementById('appShell');
    if(loginScreen) loginScreen.style.display = 'none';
    if(appShell) appShell.style.display = 'flex';
  }

  function _showLoginError(msg) {
    var el = document.getElementById('loginError');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  function _hideLoginError() {
    var el = document.getElementById('loginError');
    if (el) { el.style.display = 'none'; }
  }

  function getToken() {
    if (!_currentUser) return Promise.reject(new Error('Not authenticated'));
    return _currentUser.getIdToken();
  }

  return { init: init, login: login, logout: logout, onAuthReady: onAuthReady, getToken: getToken };
})();
