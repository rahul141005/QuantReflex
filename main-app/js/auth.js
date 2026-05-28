/**
 * auth.js — Firebase Authentication module for Main App
 *
 * Wraps shared AuthCore. Handles standard login/signup for students.
 * Enforces NO special custom claims (except evaluating premium status).
 */
var Auth = (function () {
  'use strict';

  var _appStateChangeListener = null;

  function init() {
    AuthCore.init(function(user, tokenResult) {
      if (user && tokenResult && tokenResult.claims) {
        /* Sync premium claims to AppState */
        var claims = tokenResult.claims;
        if (typeof AppState !== 'undefined') {
          AppState.setPremiumPlus(!!claims.premiumPlus);
          AppState.setPremium(!!claims.premium);
        } else {
          localStorage.setItem('qr_premium_plus', claims.premiumPlus ? 'true' : 'false');
          localStorage.setItem('qr_premium', claims.premium ? 'true' : 'false');
        }
      }
      if (_appStateChangeListener) {
        _appStateChangeListener(user, tokenResult);
      }
    });
  }

  function onStateChange(callback) {
    _appStateChangeListener = callback;
  }

  function signup(email, password, coachingId, callback) {
    if (typeof coachingId === 'function') {
      callback = coachingId;
      coachingId = '';
    }
    
    if (typeof AuthValidators !== 'undefined') {
      var err = AuthValidators.validateSignup(email, password);
      if (err) {
        callback(err, null);
        return;
      }
    }

    fetch('/api/auth/register', {
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
          var errMsg = (result.data && result.data.error && result.data.error.message) || (result.data && result.data.error) || 'Registration failed.';
          callback(errMsg, null);
          return Promise.resolve(); // Return a resolved promise to safely exit the chain
        }
        
        if (!result.data || !result.data.token) {
           throw new Error('Registration succeeded, but the server returned an invalid authentication token.');
        }

        return AuthCore.signInWithCustomToken(result.data.token)
          .then(function () {
            callback(null, AuthCore.getCurrentUser());
          })
          .catch(function (e) {
            callback(AuthCore.getReadableError(e), null);
          });
      })
      .catch(function (error) {
        console.error('Registration pipeline error:', error);
        // Do not mask the error with generic "Network error" if it's a specific issue.
        var displayMsg = error && error.message ? error.message : 'A connection error occurred. Please try again.';
        if (displayMsg === 'Failed to fetch') {
           displayMsg = 'Network error. Please check your connection to the server.';
        }
        callback(displayMsg, null);
      });
  }

  function login(email, password, callback) {
    AuthCore.login(email, password)
      .then(function() {
        callback(null, AuthCore.getCurrentUser());
      })
      .catch(function(err) {
        callback(err.message, null);
      });
  }

  function logout(callback) {
    AuthCore.logout()
      .then(function() {
        if (callback) callback(null);
      })
      .catch(function(err) {
        if (callback) callback(err.message);
      });
  }

  function getCurrentUser() {
    return AuthCore.getCurrentUser();
  }

  function getUserId() {
    var u = AuthCore.getCurrentUser();
    return u ? u.uid : null;
  }

  function isLoggedIn() {
    return AuthCore.getCurrentUser() !== null;
  }

  function onAuthReady(callback) {
    AuthCore.onAuthReady(callback);
  }

  return {
    init: init,
    onAuthReady: onAuthReady,
    onStateChange: onStateChange,
    signup: signup,
    login: login,
    logout: logout,
    getCurrentUser: getCurrentUser,
    getUserId: getUserId,
    isLoggedIn: isLoggedIn,
    // Expose validation methods from AuthValidators to maintain backwards compatibility
    validateEmail: function(e) { return AuthValidators.validateEmail(e); },
    validatePassword: function(p) { return AuthValidators.validatePasswordStrength(p); }
  };
})();
