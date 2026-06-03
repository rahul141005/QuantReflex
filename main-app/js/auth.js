/**
 * auth.js — Firebase Authentication module for Main App
 *
 * Handles standard login/signup for students.
 * Enforces NO special custom claims (except evaluating premium status).
 */
var Auth = (function () {
  'use strict';

  var _auth = null;
  var _currentUser = null;
  var _authReady = false;
  var _authReadyCallbacks = [];
  var _stateChangeListeners = [];
  var _appStateChangeListener = null;

  function init() {
    if (!FirebaseApp.isConfigured() || typeof firebase === 'undefined' || !firebase.auth) {
      return;
    }

    _auth = firebase.auth();
    _auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function (err) {
      console.warn('Auth persistence error:', err);
    });

    _auth.onAuthStateChanged(function (user) {
      var previousUser = _currentUser;
      _currentUser = user;

      // Handle user change (e.g. logout or switch)
      if (previousUser && (!user || user.uid !== previousUser.uid)) {
        if (typeof FirestoreSync !== 'undefined' && typeof FirestoreSync.resetSyncState === 'function') {
          FirestoreSync.resetSyncState();
        }
      }

      if (user) {
        var claimsPromise = user.getIdTokenResult(false).then(function (result) {
          if (result && result.claims) {
            var claims = result.claims;
            if (typeof AppState !== 'undefined') {
              AppState.setPremiumPlus(!!claims.premiumPlus);
              AppState.setPremium(!!claims.premium);
            } else {
              localStorage.setItem('qr_premium_plus', claims.premiumPlus ? 'true' : 'false');
              localStorage.setItem('qr_premium', claims.premium ? 'true' : 'false');
            }
          }
          return result;
        }).catch(function (err) {
          console.warn('[Auth] Error fetching token claims:', err);
          return null;
        });

        var firestorePromise = new Promise(function(resolve) {
          if (typeof FirestoreSync !== 'undefined' && typeof FirestoreSync.loadFromFirestore === 'function') {
            FirestoreSync.loadFromFirestore(function(success) { resolve(success); });
          } else {
            resolve(false);
          }
        });

        Promise.all([claimsPromise, firestorePromise]).then(function(results) {
          var result = results[0];
          _notifyListeners(user, result);
          _finishAuthReady(user);
        });
      } else {
        _notifyListeners(null, null);
        _finishAuthReady(null);
      }
    });
  }

  function _notifyListeners(user, tokenResult) {
    if (_appStateChangeListener) {
      try { _appStateChangeListener(user, tokenResult); } catch (e) { console.warn('Auth state listener error:', e); }
    }
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

  function onAuthReady(callback) {
    if (_authReady) {
      callback(_currentUser);
    } else {
      _authReadyCallbacks.push(callback);
    }
  }

  function onStateChange(callback) {
    _appStateChangeListener = callback;
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
          return Promise.resolve();
        }
        
        if (!result.data || !result.data.token) {
           throw new Error('Registration succeeded, but the server returned an invalid authentication token.');
        }

        if (!_auth) throw new Error('Authentication service not available.');
        return _auth.signInWithCustomToken(result.data.token)
          .then(function () {
            callback(null, _currentUser);
          })
          .catch(function (e) {
            callback(getReadableError(e), null);
          });
      })
      .catch(function (error) {
        console.error('Registration pipeline error:', error);
        var displayMsg = error && error.message ? error.message : 'A connection error occurred. Please try again.';
        if (displayMsg === 'Failed to fetch') {
           displayMsg = 'Network error. Please check your connection to the server.';
        }
        callback(displayMsg, null);
      });
  }

  function login(email, password, callback) {
    var cleanEmail = (email || '').trim().toLowerCase();
    
    if (typeof AuthValidators !== 'undefined') {
      var validationErr = AuthValidators.validateLogin(cleanEmail, password);
      if (validationErr) {
        callback(validationErr, null);
        return;
      }
    }

    if (!_auth) {
      callback('Authentication service not available.', null);
      return;
    }

    _auth.signInWithEmailAndPassword(cleanEmail, password)
      .then(function() {
        callback(null, _currentUser);
      })
      .catch(function(err) {
        callback(getReadableError(err), null);
      });
  }

  function logout(callback) {
    if (!_auth) {
      if (callback) callback('Authentication service not available.');
      return;
    }

    /* Clean up specific app modules before signing out */
    if (typeof DuelCore !== 'undefined' && typeof DuelCore.stopListening === 'function') {
      DuelCore.stopListening();
    }

    _auth.signOut()
      .then(function() {
        _currentUser = null;
        if (callback) callback(null);
      })
      .catch(function(err) {
        if (callback) callback('Logout failed: ' + err.message);
      });
  }

  function getCurrentUser() {
    return _currentUser;
  }

  function getUserId() {
    return _currentUser ? _currentUser.uid : null;
  }

  function isLoggedIn() {
    return _currentUser !== null;
  }

  function getIdToken() {
    if (!_currentUser) return Promise.reject(new Error('Not authenticated'));
    return _currentUser.getIdToken();
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
    getIdToken: getIdToken,
    validateEmail: function(e) { 
      return typeof AuthValidators !== 'undefined' ? AuthValidators.validateEmail(e) : true; 
    },
    validatePassword: function(p) { 
      return typeof AuthValidators !== 'undefined' ? AuthValidators.validatePasswordStrength(p) : { valid: true, errors: [], rules: [] }; 
    }
  };
})();
