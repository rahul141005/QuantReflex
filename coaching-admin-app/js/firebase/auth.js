/**
 * auth.js — Firebase Auth module for Coaching Admin Panel
 *
 * Wraps shared AuthCore. Handles:
 *   - Create Account (email + password + coachingId → server registration → auto-login)
 *   - Login
 *   - Logout
 * Enforces coaching_admin: true custom claim.
 */
var CoachingAuth = (function () {
  'use strict';

  function init() {
    AuthCore.init(function(user, tokenResult) {
      if (user) {
        if (tokenResult && tokenResult.claims && tokenResult.claims.coaching_admin === true && tokenResult.claims.coachingId) {
          CoachingState.set({
            user: user,
            isCoachingAdmin: true,
            coachingId: tokenResult.claims.coachingId
          });
          _showApp();
        } else {
          _showAuthError('Access denied. Coaching admin privileges required.');
          AuthCore.logout();
        }
      } else {
        CoachingState.set({ user: null, isCoachingAdmin: false, coachingId: null, coachingName: null });
        _showAuth();
      }
    });
  }

  function login(email, password) {
    _hideAuthError();
    _setLoading(true);

    AuthCore.login(email, password).catch(function(err) {
      _setLoading(false);
      _showAuthError(err.message);
    });
  }

  function register(email, password, coachingId) {
    _hideAuthError();
    _setLoading(true);
    
    // AuthValidators is global via script tag
    if (typeof AuthValidators !== 'undefined') {
      var err = AuthValidators.validateSignup(email, password);
      if (err) {
        _setLoading(false);
        _showAuthError(err);
        return;
      }
    }

    fetch('/api/coaching/auth?action=register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password, coachingId: coachingId })
    })
    .then(function (resp) { return resp.json().then(function (data) { return { ok: resp.ok, data: data }; }); })
    .then(function (result) {
      if (!result.ok) {
        _setLoading(false);
        var errMsg = (result.data.error && result.data.error.message) || result.data.error || 'Registration failed.';
        _showAuthError(errMsg);
        return;
      }

      AuthCore.signInWithCustomToken(result.data.token).then(function () {
        if (result.data.coachingName) {
          CoachingState.set({ coachingName: result.data.coachingName });
        }
      }).catch(function(e) {
         _setLoading(false);
         _showAuthError(AuthCore.getReadableError(e));
      });
    })
    .catch(function (err) {
      _setLoading(false);
      console.error('Registration error:', err);
      _showAuthError('Network error. Please check your connection and try again.');
    });
  }

  function logout() {
    AuthCore.logout();
    CoachingState.reset();
  }

  function onAuthReady(fn) {
    AuthCore.onAuthReady(function() {
      fn(CoachingState.get('user'));
    });
  }

  function _showAuth() {
    var el = document.getElementById('authScreen');
    var app = document.getElementById('appShell');
    if (el) el.style.display = 'flex';
    if (app) app.style.display = 'none';
    _setLoading(false);
  }

  function _showApp() {
    var el = document.getElementById('authScreen');
    var app = document.getElementById('appShell');
    if (el) el.style.display = 'none';
    if (app) app.style.display = 'flex';
    _setLoading(false);
  }

  function _showAuthError(msg) {
    var el = document.getElementById('authError');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  function _hideAuthError() {
    var el = document.getElementById('authError');
    if (el) { el.style.display = 'none'; }
  }

  function _setLoading(loading) {
    var btn = document.getElementById('authSubmitBtn');
    if (btn) {
      btn.disabled = loading;
      btn.textContent = loading ? 'Please wait…' : (document.getElementById('authScreen')?.querySelector('.auth-tab.active')?.dataset?.mode === 'register' ? 'Create Account' : 'Sign In');
    }
  }

  function getToken() {
    return AuthCore.getIdToken();
  }

  return {
    init: init,
    login: login,
    register: register,
    logout: logout,
    onAuthReady: onAuthReady,
    getToken: getToken
  };
})();
