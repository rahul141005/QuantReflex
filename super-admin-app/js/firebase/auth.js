/**
 * auth.js — Firebase Auth module for Super Admin App
 *
 * Wraps shared AuthCore. Handles login/logout and enforces admin: true custom claim.
 * Hardcoded security requirement: Only quantreflex@gmail.com is permitted to login.
 */
var AdminAuth = (function () {
  'use strict';

  function init() {
    AuthCore.init(function(user, tokenResult) {
      if (user) {
        if (user.email !== 'quantreflex@gmail.com') {
          _showLoginError('Unauthorized email address.');
          AuthCore.logout();
          return;
        }

        if (tokenResult && tokenResult.claims && tokenResult.claims.admin === true) {
          AdminState.set({ user: user, isAdmin: true });
          _showApp();
        } else {
          _showLoginError('Access denied. Admin privileges required.');
          AuthCore.logout();
        }
      } else {
        AdminState.set({ user: null, isAdmin: false });
        _showLogin();
      }
    });
  }

  function login(email, password) {
    _hideLoginError();
    if (email !== 'quantreflex@gmail.com') {
      _showLoginError('Unauthorized email address.');
      return;
    }
    
    // Check if the password provided is strictly the permitted one
    if (password !== 'pass@iON2203') {
       _showLoginError('Invalid credentials.');
       return;
    }

    AuthCore.login(email, password).catch(function(err) {
      _showLoginError(err.message);
    });
  }

  function logout() {
    AuthCore.logout();
    AdminState.reset();
  }

  function onAuthReady(fn) {
    AuthCore.onAuthReady(function() {
      fn(AdminState.get('user'));
    });
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
    return AuthCore.getIdToken();
  }

  return { init: init, login: login, logout: logout, onAuthReady: onAuthReady, getToken: getToken };
})();
