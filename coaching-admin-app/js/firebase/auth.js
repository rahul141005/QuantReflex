/**
 * auth.js — Firebase Auth module for Coaching Admin Panel
 *
 * Handles:
 *   - Create Account (email + password + coachingId → server registration → auto-login)
 *   - Login (email + password → verify coaching_admin claim)
 *   - Logout
 *   - Auth state persistence
 *
 * Enforces coaching_admin: true custom claim.
 * Extracts coachingId from claims and stores in CoachingState.
 */
var CoachingAuth = (function () {
  'use strict';

  var _authReadyCallbacks = [];
  var _authReady = false;

  function init() {
    var auth = FirebaseApp.getAuth();
    if (!auth) return;

    auth.onAuthStateChanged(function (user) {
      if (user) {
        _verifyCoachingAdmin(user);
      } else {
        CoachingState.set({ user: null, isCoachingAdmin: false, coachingId: null, coachingName: null });
        _fireReady(null);
        _showAuth();
      }
    });
  }

  /**
   * Verify the user has coaching_admin: true custom claim.
   * Extract coachingId from claims and load coaching info.
   */
  function _verifyCoachingAdmin(user) {
    user.getIdTokenResult(true).then(function (result) {
      if (result.claims.coaching_admin === true && result.claims.coachingId) {
        CoachingState.set({
          user: user,
          isCoachingAdmin: true,
          coachingId: result.claims.coachingId
        });
        _fireReady(user);
        _showApp();
      } else {
        _showAuthError('Access denied. Coaching admin privileges required.');
        FirebaseApp.getAuth().signOut();
      }
    }).catch(function (err) {
      console.error('Token verification failed:', err);
      _showAuthError('Authentication failed. Please try again.');
      FirebaseApp.getAuth().signOut();
    });
  }

  /**
   * Login with email and password.
   */
  function login(email, password) {
    var auth = FirebaseApp.getAuth();
    if (!auth) return;
    _hideAuthError();
    _setLoading(true);

    auth.signInWithEmailAndPassword(email, password).catch(function (error) {
      _setLoading(false);
      var msg = 'Login failed.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') msg = 'Invalid email or password.';
      if (error.code === 'auth/wrong-password') msg = 'Incorrect password.';
      if (error.code === 'auth/too-many-requests') msg = 'Too many attempts. Try again later.';
      if (error.code === 'auth/invalid-email') msg = 'Invalid email format.';
      _showAuthError(msg);
    });
  }

  /**
   * Register a new coaching admin account.
   * POSTs to /api/coaching/auth?action=register
   * On success, signs in with the returned custom token.
   */
  function register(email, password, coachingId) {
    _hideAuthError();
    _setLoading(true);

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

      // Auto-login with custom token
      var auth = FirebaseApp.getAuth();
      return auth.signInWithCustomToken(result.data.token).then(function () {
        // Store coaching name for immediate use
        if (result.data.coachingName) {
          CoachingState.set({ coachingName: result.data.coachingName });
        }
        // onAuthStateChanged will handle the rest
      });
    })
    .catch(function (err) {
      _setLoading(false);
      console.error('Registration error:', err);
      _showAuthError('Network error. Please check your connection and try again.');
    });
  }

  function logout() {
    var auth = FirebaseApp.getAuth();
    if (auth) auth.signOut();
    CoachingState.reset();
  }

  function onAuthReady(fn) {
    if (_authReady) { fn(CoachingState.get('user')); }
    else { _authReadyCallbacks.push(fn); }
  }

  function _fireReady(user) {
    _authReady = true;
    for (var i = 0; i < _authReadyCallbacks.length; i++) {
      try { _authReadyCallbacks[i](user); } catch (e) { /* ignore */ }
    }
    _authReadyCallbacks = [];
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
    var user = CoachingState.get('user');
    if (!user) return Promise.reject(new Error('Not authenticated'));
    return user.getIdToken();
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
