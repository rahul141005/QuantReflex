/**
 * auth.js — Firebase Authentication module for Main App
 *
 * Wraps shared AuthCore. Handles standard login/signup for students.
 * Enforces NO special custom claims (except evaluating premium status).
 */
var Auth = (function () {
  'use strict';

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
    });
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

    firebase.auth().createUserWithEmailAndPassword(email, password)
      .then(function (cred) {
        callback(null, cred.user);
      })
      .catch(function (error) {
        var msg = error.message || 'Account creation failed. Please check your connection.';
        if (error.code === 'auth/email-already-in-use') {
          msg = 'An account already exists with this email address.';
        } else if (error.code === 'auth/weak-password') {
          msg = 'Password is too weak.';
        } else if (error.code === 'auth/invalid-email') {
          msg = 'Invalid email format.';
        }
        callback(msg, null);
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
