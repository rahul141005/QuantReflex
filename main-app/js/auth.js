/**
 * auth.js — Firebase Authentication module
 *
 * Manages user authentication using Firebase Auth with email/password.
 * Users enter a short handle (e.g. 'krishna01') which is internally
 * converted to an email (handle@quantreflex.app) for Firebase Auth.
 * The ecosystem is EMAIL-FIRST — no usernames or username collections.
 */

var Auth = (function () {
  var _auth = null;
  var _currentUser = null;
  var _authReady = false;
  var _authReadyCallbacks = [];

  var EMAIL_DOMAIN = 'quantreflex.app';

  /**
   * Convert a handle to a valid email for Firebase Auth.
   * @param {string} handle
   * @returns {string}
   */
  function _handleToEmail(handle) {
    return sanitizeHandle(handle) + '@' + EMAIL_DOMAIN;
  }

  /**
   * Sanitize handle: lowercase, trim, allow only alphanumeric and underscore.
   * @param {string} handle
   * @returns {string}
   */
  function sanitizeHandle(handle) {
    if (!handle) return '';
    return handle.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
  }

  /**
   * Validate handle and password inputs for login.
   * Uses relaxed password rules so existing users aren't locked out.
   * @param {string} handle - sanitized handle
   * @param {string} password - raw password
   * @returns {string|null} Error message or null if valid
   */
  function _validateLogin(handle, password) {
    if (!handle || handle.length < 4) {
      return 'Handle must be at least 4 characters.';
    }
    if (handle.length > 30) {
      return 'Handle must be 30 characters or less.';
    }
    if (!/[a-z]/.test(handle)) {
      return 'Handle must contain at least one letter.';
    }
    if (!/[0-9]/.test(handle)) {
      return 'Handle must contain at least one number.';
    }
    if (!password || password.length < 6) {
      return 'Password must be at least 6 characters.';
    }
    return null;
  }

  /**
   * Validate inputs for signup with strict password rules.
   * @param {string} handle - sanitized handle
   * @param {string} password - raw password
   * @returns {string|null} Error message or null if valid
   */
  function _validateSignup(handle, password) {
    /* Handle checks */
    if (!handle || handle.length < 4) {
      return 'Handle must be at least 4 characters with at least one letter and one number.';
    }
    if (handle.length > 30) {
      return 'Handle must be 30 characters or less.';
    }
    if (!/[a-z]/.test(handle) || !/[0-9]/.test(handle)) {
      return 'Handle must contain at least one letter and one number.';
    }
    /* Strict password checks */
    if (!password || password.length < 8) {
      return 'Password must be at least 8 characters with uppercase, lowercase, and a number.';
    }
    if (!/[A-Z]/.test(password)) {
      return 'Password must contain at least one uppercase letter.';
    }
    if (!/[a-z]/.test(password)) {
      return 'Password must contain at least one lowercase letter.';
    }
    if (!/[0-9]/.test(password)) {
      return 'Password must contain at least one number.';
    }
    return null;
  }

  /**
   * Initialize Firebase Auth.
   * Must be called after FirebaseApp.init().
   */
  function init() {
    if (!FirebaseApp.isConfigured() || typeof firebase === 'undefined' || !firebase.auth) {
      return;
    }

    try {
      _auth = firebase.auth();
      /* Set persistence to LOCAL — survives browser restart */
      _auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function (err) {
        console.warn('Auth persistence error:', err);
      });

      /* Listen for auth state changes */
      _auth.onAuthStateChanged(function (user) {
        var previousUser = _currentUser;
        _currentUser = user;

        if (previousUser && (!user || user.uid !== previousUser.uid)) {
          if (typeof FirestoreSync !== 'undefined') {
            FirestoreSync.resetSyncState();
          }
        }

        if (user) {
          /* Strictly enforce JWT custom claims for entitlement gating */
          /* Using false to read cached claims, preventing slow app boots. */
          user.getIdTokenResult(false).then(function(idTokenResult) {
            var claims = idTokenResult.claims || {};
            
            /* If AppState/store is available, securely sync the claims */
            if (typeof AppState !== 'undefined') {
              if (claims.premiumPlus) AppState.setPremiumPlus(true);
              else AppState.setPremiumPlus(false);
              
              if (claims.premium) AppState.setPremium(true);
              else AppState.setPremium(false);
            } else {
              /* Fallback if AppState isn't loaded yet, write directly to store */
              if (claims.premiumPlus) localStorage.setItem('qr_premium_plus', 'true');
              else localStorage.setItem('qr_premium_plus', 'false');
              
              if (claims.premium) localStorage.setItem('qr_premium', 'true');
              else localStorage.setItem('qr_premium', 'false');
            }
            
            _finishAuthReady(user);
          }).catch(function(err) {
            console.warn('[Auth] Error fetching token claims:', err);
            _finishAuthReady(user);
          });
        } else {
          _finishAuthReady(user);
        }
      });
      
      function _finishAuthReady(u) {
        _authReady = true;
        /* Fire all waiting callbacks */
        for (var i = 0; i < _authReadyCallbacks.length; i++) {
          try { _authReadyCallbacks[i](u); } catch (e) { console.warn('Auth callback error:', e); }
        }
        _authReadyCallbacks = [];
      }
    } catch (e) {
      console.warn('Auth initialization failed:', e);
    }
  }

  /**
   * Register a callback to fire when auth state is determined.
   * If auth is already ready, fires immediately.
   * @param {function} callback - receives the user object (or null)
   */
  function onAuthReady(callback) {
    if (_authReady) {
      callback(_currentUser);
    } else {
      _authReadyCallbacks.push(callback);
    }
  }

  /**
   * Sign up a new user via the atomic server-side register endpoint.
   * @param {string} handle - short handle (e.g. 'krishna01')
   * @param {string} password
   * @param {string} coachingId (optional)
   * @param {function} callback - receives (error, user)
   */
  function signup(handle, password, coachingId, callback) {
    if (typeof coachingId === 'function') {
      callback = coachingId;
      coachingId = '';
    }

    var clean = sanitizeHandle(handle);
    var err = _validateSignup(clean, password);
    if (err) {
      callback(err, null);
      return;
    }

    if (!_auth) {
      callback('Authentication service not available.', null);
      return;
    }

    var email = _handleToEmail(clean);

    fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        password: password,
        coachingId: coachingId || ''
      })
    })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.error) {
        throw new Error(data.error.message || 'Account creation failed.');
      }
      if (!data.token) {
        throw new Error('Invalid response from server.');
      }
      return _auth.signInWithCustomToken(data.token);
    })
    .then(function (cred) {
      _currentUser = cred.user;
      callback(null, cred.user);
    })
    .catch(function (error) {
      var msg = error.message || 'Account creation failed. Please check your connection.';
      callback(msg, null);
    });
  }

  /**
   * Log in an existing user.
   * @param {string} handle - short handle (e.g. 'krishna01')
   * @param {string} password
   * @param {function} callback - receives (error, user)
   */
  function login(handle, password, callback) {
    var clean = sanitizeHandle(handle);
    var err = _validateLogin(clean, password);
    if (err) {
      callback(err, null);
      return;
    }

    if (!_auth) {
      callback('Authentication service not available.', null);
      return;
    }

    var email = _handleToEmail(clean);
    _auth.signInWithEmailAndPassword(email, password)
      .then(function (cred) {
        _currentUser = cred.user;
        callback(null, cred.user);
      })
      .catch(function (error) {
        var msg = 'Login failed.';
        if (error.code === 'auth/user-not-found') {
          msg = 'No account found with this handle.';
        } else if (error.code === 'auth/wrong-password') {
          msg = 'Incorrect password.';
        } else if (error.code === 'auth/invalid-credential') {
          msg = 'Invalid handle or password.';
        } else if (error.code === 'auth/too-many-requests') {
          msg = 'Too many attempts. Please try again later.';
        }
        callback(msg, null);
      });
  }

  /**
   * Log out the current user.
   * @param {function} [callback] - optional callback receives (error)
   */
  function logout(callback) {
    if (!_auth) {
      if (callback) callback('Authentication service not available.');
      return;
    }

    if (typeof DuelCore !== 'undefined') {
      if (typeof DuelCore.stopListening === 'function') DuelCore.stopListening();
    }

    _auth.signOut()
      .then(function () {
        _currentUser = null;
        if (callback) callback(null);
      })
      .catch(function (error) {
        if (callback) callback('Logout failed: ' + error.message);
      });
  }

  /**
   * Get the current Firebase user object.
   * @returns {object|null}
   */
  function getCurrentUser() {
    return _currentUser;
  }

  /**
   * Get the current user's UID.
   * @returns {string|null}
   */
  function getUserId() {
    return _currentUser ? _currentUser.uid : null;
  }

  /**
   * Check if a user is currently logged in.
   * @returns {boolean}
   */
  function isLoggedIn() {
    return _currentUser !== null;
  }

  /**
   * Granular password validation for realtime UX feedback (signup rules).
   * Returns all applicable errors at once for checklist-style display.
   * @param {string} password - raw password
   * @returns {{ valid: boolean, errors: string[] }}
   */
  function validatePassword(password) {
    var errors = [];
    if (!password || password.length < 8) {
      errors.push('At least 8 characters.');
    }
    if (password && password.length >= 1 && !/[A-Z]/.test(password)) {
      errors.push('At least one uppercase letter.');
    }
    if (password && password.length >= 1 && !/[a-z]/.test(password)) {
      errors.push('At least one lowercase letter.');
    }
    if (password && password.length >= 1 && !/[0-9]/.test(password)) {
      errors.push('At least one number.');
    }
    return { valid: errors.length === 0, errors: errors };
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
    sanitizeHandle: sanitizeHandle,
    validatePassword: validatePassword
  };
})();
