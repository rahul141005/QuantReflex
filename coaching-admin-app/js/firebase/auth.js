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

  var _auth = null;
  var _currentUser = null;
  var _authReady = false;
  var _authReadyCallbacks = [];

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
        user.getIdTokenResult(false).then(function (tokenResult) {
          if (tokenResult && tokenResult.claims && tokenResult.claims.coaching_admin === true && tokenResult.claims.coachingId) {
            CoachingState.set({
              user: user,
              isCoachingAdmin: true,
              coachingId: tokenResult.claims.coachingId
            });
            _showApp();
          } else {
            _showAuthError('Access denied. Coaching admin privileges required.');
            logout();
          }
          _finishAuthReady(user);
        }).catch(function (err) {
          console.warn('[Auth] Error fetching token claims:', err);
          _showAuthError('Failed to verify coaching privileges.');
          logout();
          _finishAuthReady(user);
        });
      } else {
        CoachingState.set({ user: null, isCoachingAdmin: false, coachingId: null, coachingName: null });
        _showAuth();
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

  function login(email, password) {
    _hideAuthError();
    _setLoading(true);

    if (!_auth) {
      _setLoading(false);
      _showAuthError('Authentication service not available.');
      return;
    }

    _auth.signInWithEmailAndPassword((email || '').trim().toLowerCase(), password)
      .catch(function(err) {
        _setLoading(false);
        _showAuthError(getReadableError(err));
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
    .then(function (resp) {
      if (!resp.ok) {
        return resp.text().then(function(text) {
          try {
            var data = JSON.parse(text);
            return { ok: false, data: data };
          } catch (e) {
            return { ok: false, data: { error: { message: 'Server error (' + resp.status + '). Please try again later.' } } };
          }
        });
      }
      return resp.json().then(function (data) { return { ok: true, data: data }; });
    })
    .then(function (result) {
      if (!result.ok) {
        _setLoading(false);
        var errMsg = (result.data && result.data.error && result.data.error.message) || (result.data && result.data.error) || 'Registration failed.';
        _showAuthError(errMsg);
        return Promise.resolve(); // Safe exit
      }
      
      if (!result.data || !result.data.token) {
        throw new Error('Registration succeeded, but the server returned an invalid authentication token.');
      }

      if (!_auth) throw new Error('Authentication service not available.');

      return _auth.signInWithCustomToken(result.data.token).then(function () {
        if (result.data.coachingName) {
          CoachingState.set({ coachingName: result.data.coachingName });
        }
      }).catch(function(e) {
         _setLoading(false);
         _showAuthError(getReadableError(e));
      });
    })
    .catch(function (error) {
      _setLoading(false);
      console.error('Registration pipeline error:', error);
      var displayMsg = error && error.message ? error.message : 'A connection error occurred. Please try again.';
      if (displayMsg === 'Failed to fetch') {
         displayMsg = 'Network error. Please check your connection to the server.';
      }
      _showAuthError(displayMsg);
    });
  }

  function logout() {
    if (_auth) {
      _auth.signOut().then(function() {
        _currentUser = null;
        CoachingState.reset();
      }).catch(function(err) {
        _showAuthError('Logout failed: ' + err.message);
      });
    } else {
      CoachingState.reset();
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
    if (!_currentUser) return Promise.reject(new Error('Not authenticated'));
    return _currentUser.getIdToken();
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
