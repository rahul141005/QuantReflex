/**
 * auth.js — Firebase Auth module for Admin Panel
 *
 * Handles login/logout and enforces admin: true custom claim.
 * Unauthorized users are rejected immediately.
 */
var AdminAuth = (function () {
  'use strict';

  var _authReadyCallbacks = [];
  var _authReady = false;

  function init() {
    var auth = FirebaseApp.getAuth();
    if (!auth) return;

    auth.onAuthStateChanged(function (user) {
      if (user) {
        _verifyAdmin(user);
      } else {
        AdminState.set({ user: null, isAdmin: false });
        _fireReady(null);
        _showLogin();
      }
    });
  }

  function _verifyAdmin(user) {
    user.getIdTokenResult(true).then(function (result) {
      if (result.claims.admin === true) {
        AdminState.set({ user: user, isAdmin: true });
        _fireReady(user);
        _showApp();
      } else {
        _showLoginError('Access denied. Admin privileges required.');
        FirebaseApp.getAuth().signOut();
      }
    }).catch(function (err) {
      console.error('Token verification failed:', err);
      _showLoginError('Authentication failed. Please try again.');
      FirebaseApp.getAuth().signOut();
    });
  }

  function login(email, password) {
    var auth = FirebaseApp.getAuth();
    if (!auth) return;
    _hideLoginError();
    auth.signInWithEmailAndPassword(email, password).catch(function (error) {
      var msg = 'Login failed.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') msg = 'Invalid email or password.';
      if (error.code === 'auth/wrong-password') msg = 'Incorrect password.';
      if (error.code === 'auth/too-many-requests') msg = 'Too many attempts. Try again later.';
      _showLoginError(msg);
    });
  }

  function logout() {
    var auth = FirebaseApp.getAuth();
    if (auth) auth.signOut();
    AdminState.reset();
  }

  function onAuthReady(fn) {
    if (_authReady) { fn(AdminState.get('user')); }
    else { _authReadyCallbacks.push(fn); }
  }

  function _fireReady(user) {
    _authReady = true;
    for (var i = 0; i < _authReadyCallbacks.length; i++) {
      try { _authReadyCallbacks[i](user); } catch (e) { /* ignore */ }
    }
    _authReadyCallbacks = [];
  }

  function _showLogin() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appShell').style.display = 'none';
  }

  function _showApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appShell').style.display = 'flex';
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
    var user = AdminState.get('user');
    if (!user) return Promise.reject(new Error('Not authenticated'));
    return user.getIdToken();
  }

  return { init: init, login: login, logout: logout, onAuthReady: onAuthReady, getToken: getToken };
})();
