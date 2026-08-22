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

    /* Google redirect-fallback return path: surface a mapped error on the login screen if the
       redirect flow failed. (Success needs nothing here — onAuthStateChanged handles it.) */
    try {
      if (sessionStorage.getItem('qr_google_redirect')) {
        sessionStorage.removeItem('qr_google_redirect');
        _auth.getRedirectResult().catch(function (err) {
          console.warn('[Auth] Google redirect sign-in failed:', err && err.code);
          try {
            var el = document.getElementById('loginError');
            if (el) { el.textContent = getReadableError(err); el.style.display = 'block'; }
          } catch (_) {}
        });
      }
    } catch (_) {}

    _auth.onAuthStateChanged(function (user) {
      var previousUser = _currentUser;

      /* Handle user change (logout or switch) BEFORE flipping `_currentUser` (ADR-118).
         resetSyncState() begins by flushing the outgoing user's pending writes, and that flush is
         guarded by `FirebaseApp.getUserId() === _loadedUserId` (firebase.js:47 → Auth.getUserId() →
         _currentUser). If we reassign _currentUser first, getUserId() already returns the INCOMING
         user, the guard trips, and the outgoing user's queued work is dropped instead of saved —
         reachable with no reload, because Firebase Auth persistence is shared across tabs (signing in
         as B in tab 2 fires this handler in tab 1). Resetting first keeps the outgoing identity
         current, so the flush resolves the OUTGOING user's docRef and their data is persisted; the
         cross-user guard still prevents any write landing on the incoming user. */
      /* ADR-119: an identity change is a lifecycle event, not just a variable assignment. Ordering is
         load-bearing and is asserted by session-integrity.check:
           1. beginTransition bumps the generation FIRST, so every token captured under the outgoing
              user is already invalid before any teardown/purge runs — in-flight A work becomes inert
              instead of racing the purge (and can never complete as B).
           2. runTeardown() executes the ONE registered teardown contract (Firestore listeners, duel
              listener, view listeners, timers). Previously only Auth.logout() tore the duel listener
              down, so a switch with no logout left A's room subscription live under B.
           3. resetSyncState() flushes the outgoing user's queued writes and purges their state. It
              still runs BEFORE `_currentUser = user` because the flush resolves its docRef through
              FirebaseApp.getUserId() → Auth.getUserId() → _currentUser; flipping identity first made
              the cross-user guard trip and DISCARD that data (reachable with no reload, since Firebase
              Auth persistence is shared across tabs).
           4. Only then does _currentUser advance to the incoming user.
         The teardown/purge CONDITION is deliberately unchanged from before ADR-119: it fires ONLY when
         there was a previous user. A first observer fire with no user (cold boot, signed out) must NOT
         purge — that would destroy the local pre-login/offline progress that loadFromFirestore later
         merges into the account. */
      var _leavingUser = !!previousUser && (!user || user.uid !== previousUser.uid);
      var _identityChanged = (previousUser ? previousUser.uid : null) !== (user ? user.uid : null);
      if (_identityChanged && typeof QRIdentity !== 'undefined') {
        QRIdentity.beginTransition(user ? user.uid : null);
      }
      if (_leavingUser) {
        if (typeof QRIdentity !== 'undefined') QRIdentity.runTeardown();
        if (typeof FirestoreSync !== 'undefined' && typeof FirestoreSync.resetSyncState === 'function') {
          FirestoreSync.resetSyncState();
        }
      }

      _currentUser = user;

      if (user) {
        var _afterSession = function () {
          var claimsPromise = user.getIdTokenResult(false).then(function (result) {
            /* Entitlement is resolved solely via FirestoreSync.getAccessState()/hasActivePremium();
               the old qr_premium localStorage mirror was write-only (zero readers) and a misleading
               second source of truth, so it's no longer written. We still fetch the token result here
               because callers downstream use `result` (e.g. coaching claim). */
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
        };

        /* ADR-072 (single active device): on a GENUINE new login (this device hasn't yet claimed a session for this
           uid), claim the single active session — which displaces any other device — BEFORE loading Firestore, so the
           firestore-sync session listener doesn't race our own claim. On resume (already claimed) we skip claiming;
           re-claiming would wrongly displace whoever logged in most recently, and the listener still enforces.

           Provider logins (Google) additionally run server-side provisioning FIRST: firestore.rules deny client
           creates, and Session.claim's merge-set would otherwise leave a skeleton user doc (only activeSessionId/
           activeSessionAt — no email/plan/createdAt). ensure-profile is idempotent and never blocks the login. */
        if (window.Session && typeof Session.claim === 'function' && !Session.hasClaimed(user.uid)) {
          var _isProviderUser = false;
          try {
            _isProviderUser = (user.providerData || []).some(function (p) { return p && p.providerId === 'google.com'; });
          } catch (_) {}
          var _ensure = _isProviderUser ? _ensureProfile(user) : Promise.resolve(true);
          _ensure.then(function () {
            return Session.claim(function () { return user.getIdToken(); });
          }).then(function (ok) {
            if (ok) Session.markClaimed(user.uid);
            _afterSession();
          });
        } else {
          _afterSession();
        }
      } else {
        _notifyListeners(null, null);
        _finishAuthReady(null);
      }
    });
  }

  /**
   * Is there a persisted Firebase session on this device that has NOT been applied yet?
   *
   * Firebase 10.x compat keeps the signed-in user in IndexedDB (`firebaseLocalStorageDb`, object store
   * `firebaseLocalStorage`, keys prefixed `firebase:authUser:`), so restoring a session is an
   * ASYNCHRONOUS read. Nothing the auth gate can call synchronously knows whether one is pending —
   * which is why a `null` observer emission is ambiguous: it means "signed out" OR "not restored yet",
   * and rendering the login screen on the second reading is the flash this exists to prevent.
   *
   * This asks Firebase's OWN storage rather than introducing a parallel record of who is logged in;
   * it is a hint used only to decide whether to keep the splash up a moment longer, never to grant
   * access. Entitlement and identity still come from the observer and the server, unchanged.
   *
   * Fails to `false` on every error, on a browser without `indexedDB.databases()`, and on a missing
   * database — i.e. it degrades to exactly today's behaviour (show the login screen at once). It never
   * CREATES the database: absence is read via `databases()`, so a signed-out device is untouched.
   */
  function hasPersistedSession(callback) {
    var done = false;
    function answer(v) { if (done) return; done = true; try { callback(!!v); } catch (_) {} }
    /* Bounded: a wedged IndexedDB must not hold the splash on its own — the caller's own timeout is a
       backstop, but this keeps the probe itself short. */
    setTimeout(function () { answer(false); }, 1500);
    try {
      if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') { answer(false); return; }
      indexedDB.databases().then(function (dbs) {
        var present = (dbs || []).some(function (d) { return d && d.name === 'firebaseLocalStorageDb'; });
        if (!present) { answer(false); return; }
        var req = indexedDB.open('firebaseLocalStorageDb');
        req.onerror = function () { answer(false); };
        req.onsuccess = function () {
          var db = req.result;
          try {
            if (!db.objectStoreNames.contains('firebaseLocalStorage')) { db.close(); answer(false); return; }
            var keys = db.transaction('firebaseLocalStorage', 'readonly')
                         .objectStore('firebaseLocalStorage').getAllKeys();
            keys.onsuccess = function () {
              /* Match THIS project's key, not merely the `firebase:authUser:` prefix. The record is
                 `firebase:authUser:<apiKey>:[DEFAULT]`, so a record left behind by a different Firebase
                 project — or by a previous apiKey for this one — would otherwise read as "a session is
                 restoring" and hold the splash for a user who is genuinely signed out. Falls back to the
                 prefix only if the apiKey cannot be read, which is the pre-existing behaviour. */
              var want = 'firebase:authUser:';
              try { var ak = firebase.app().options.apiKey; if (ak) want += ak + ':'; } catch (_) {}
              var found = (keys.result || []).some(function (k) { return String(k).indexOf(want) === 0; });
              db.close(); answer(found);
            };
            keys.onerror = function () { db.close(); answer(false); };
          } catch (_) { try { db.close(); } catch (_e) {} answer(false); }
        };
      }).catch(function () { answer(false); });
    } catch (_) { answer(false); }
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

  /* ADR-118: additive, not single-slot. This used to be a bare assignment, so a second caller would
     silently REPLACE the app's auth gate (app.js) and the gate would simply stop running — a failure
     with no error. The first registration keeps the primary slot (preserving today's exact ordering);
     any further listeners are appended to `_stateChangeListeners`, which the dispatcher at the top of
     this file already iterates. Duplicate registrations of the same function are ignored. */
  function onStateChange(callback) {
    if (typeof callback !== 'function') return;
    if (!_appStateChangeListener) { _appStateChangeListener = callback; return; }
    if (_appStateChangeListener === callback) return;
    if (_stateChangeListeners.indexOf(callback) === -1) _stateChangeListeners.push(callback);
  }

  function getReadableError(error) {
    if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-email') {
      return QRI18n.t('auth.errNoAccount');
    } else if (error.code === 'auth/wrong-password') {
      return QRI18n.t('auth.errWrongPassword');
    } else if (error.code === 'auth/invalid-credential') {
      return QRI18n.t('auth.errInvalidCreds');
    } else if (error.code === 'auth/too-many-requests') {
      return QRI18n.t('auth.errTooMany');
    } else if (error.code === 'auth/email-already-in-use') {
      return QRI18n.t('auth.errEmailExists');
    } else if (error.code === 'auth/weak-password') {
      return QRI18n.t('auth.errWeakPassword');
    } else if (error.code === 'auth/network-request-failed') {
      return QRI18n.t('auth.errNetwork');
    } else if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
      return QRI18n.t('auth.errCancelled');
    } else if (error.code === 'auth/popup-blocked') {
      return QRI18n.t('auth.errPopupBlocked');
    } else if (error.code === 'auth/account-exists-with-different-credential') {
      return QRI18n.t('auth.errDifferentMethod');
    } else if (error.code === 'auth/unauthorized-domain') {
      return QRI18n.t('auth.errUnauthorizedDomain');
    } else if (error.code === 'auth/operation-not-allowed') {
      return QRI18n.t('auth.errGoogleDisabled');
    }
    return error.message || QRI18n.t('auth.errAuthFailed');
  }

  /* Idempotent server-side provisioning for provider sign-ins (see onAuthStateChanged). Resolves
     true/false, never rejects — a transient failure must not block login (loadFromFirestore copes,
     and the next login retries). */
  function _ensureProfile(user) {
    return user.getIdToken().then(function (token) {
      var headers = { 'Authorization': 'Bearer ' + token };
      try { if (window.Session && Session.header) headers['X-Session-Id'] = Session.header()['X-Session-Id']; } catch (_) {}
      return fetch('/api/account?action=ensure-profile', { method: 'POST', headers: headers });
    }).then(function (resp) {
      return !!(resp && resp.ok);
    }).catch(function (err) {
      console.warn('[Auth] ensure-profile failed (login continues):', err && err.message);
      return false;
    });
  }

  /**
   * Google Sign-In — popup-first (works in installed PWAs and normal tabs); falls back to a full
   * redirect only when the popup is blocked/unsupported. Success flows through the same
   * onAuthStateChanged → ensure-profile → Session.claim path as every other login.
   */
  function loginWithGoogle(callback) {
    if (!_auth) {
      callback(QRI18n.t('auth.errServiceMissing'), null);
      return;
    }
    var provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    /* Codes that mean "this environment could not run the popup", as opposed to "the sign-in itself
       failed". Every one of them is recoverable by the redirect flow, so none may reach the user as an
       error: painting one and then navigating away is what produced the sub-second error flash before
       the user landed signed in anyway. `auth/internal-error` is included because that is what an
       Android WebView commonly reports when it refuses to open the popup window. */
    var POPUP_UNAVAILABLE = {
      'auth/popup-blocked': 1,
      'auth/operation-not-supported-in-this-environment': 1,
      'auth/internal-error': 1,
      'auth/web-storage-unsupported': 1,
      'auth/popup-closed-by-user': 0   /* listed for clarity: a real user cancellation, NOT retried */
    };

    function _viaRedirect() {
      try { sessionStorage.setItem('qr_google_redirect', '1'); } catch (_) {}
      /* Only a failure to even START the redirect is terminal and worth showing. */
      _auth.signInWithRedirect(provider).catch(function (e2) { callback(getReadableError(e2), null); });
      /* page navigates away; init() surfaces any redirect error on return */
    }

    /* Deliberately NOT branching on QRPlatform.isPlayDistribution() here. `payment-facade.check.js`
       asserts that the platform verdict is read in exactly ONE place — the payment gateway — so that
       nothing else can start routing behaviour by platform, and that invariant is worth more than the
       one failed popup this would have saved. The popup attempt below fails fast in an Android WebView
       and falls straight through to the redirect with NO error painted, which is what the user actually
       experiences; the wasted attempt is invisible. */

    _auth.signInWithPopup(provider)
      .then(function () {
        callback(null, _currentUser);
      })
      .catch(function (err) {
        if (err && POPUP_UNAVAILABLE[err.code] === 1) { _viaRedirect(); return; }
        var cancelled = err && (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request');
        if (!cancelled && typeof SecurityEvents !== 'undefined') {
          SecurityEvents.record('failed_login', { errorCode: err && err.code, reason: 'google_login_failed' });
        }
        callback(getReadableError(err), null, { cancelled: cancelled });
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
              return { ok: false, data: { error: { message: QRI18n.t('auth.errServer', { status: resp.status }) } } };
            }
          });
        }
        return resp.json().then(function (data) { return { ok: true, data: data }; });
      })
      .then(function (result) {
        if (!result.ok) {
          var errMsg = (result.data && result.data.error && result.data.error.message) || (result.data && result.data.error) || QRI18n.t('auth.errRegisterFailed');
          callback(errMsg, null);
          return Promise.resolve();
        }
        
        if (!result.data || !result.data.token) {
           throw new Error(QRI18n.t('auth.errRegisterInvalidToken'));
        }

        if (!_auth) throw new Error(QRI18n.t('auth.errServiceMissing'));
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
        var displayMsg = error && error.message ? error.message : QRI18n.t('auth.errConnection');
        if (displayMsg === 'Failed to fetch') {
           displayMsg = QRI18n.t('auth.errNetworkServer');
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
      callback(QRI18n.t('auth.errServiceMissing'), null);
      return;
    }

    _auth.signInWithEmailAndPassword(cleanEmail, password)
      .then(function() {
        callback(null, _currentUser);
      })
      .catch(function(err) {
        if (typeof SecurityEvents !== 'undefined') SecurityEvents.record('failed_login', { email: cleanEmail, errorCode: err && err.code, reason: 'login_failed' });
        callback(getReadableError(err), null);
      });
  }

  /**
   * Send a password-reset email (ADR-041). To avoid account-enumeration, a non-existent address resolves the same
   * as success ("if an account exists, we've emailed a reset link"). callback(err|null).
   */
  function resetPassword(email, callback) {
    var cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || cleanEmail.indexOf('@') < 1) { callback(QRI18n.t('auth.errEnterValidEmail')); return; }
    if (!_auth) { callback(QRI18n.t('auth.errServiceMissing')); return; }
    _auth.sendPasswordResetEmail(cleanEmail)
      .then(function () { callback(null); })
      .catch(function (err) {
        if (err && err.code === 'auth/user-not-found') { callback(null); return; } /* don't leak existence */
        callback(getReadableError(err));
      });
  }

  function logout(callback) {
    if (!_auth) {
      if (callback) callback(QRI18n.t('auth.errServiceMissing'));
      return;
    }

    /* ADR-119: run the ONE registered teardown contract rather than a hand-picked module list. This
       used to stop only the duel listener here, which is precisely how logout and account-switch drifted
       apart — the switch path stopped Firestore listeners and this path stopped the duel listener, so
       neither was complete. Running it before signOut() also means no listener can fire mid-transition.
       The observer runs it again when it sees the sign-out; hooks are idempotent, so that is harmless. */
    if (typeof QRIdentity !== 'undefined' && typeof QRIdentity.runTeardown === 'function') {
      QRIdentity.runTeardown();
    } else if (typeof DuelCore !== 'undefined' && typeof DuelCore.stopListening === 'function') {
      DuelCore.stopListening();
    }
    /* ADR-072: drop the single-device claim so the NEXT login on this device re-claims (and displaces others). */
    try { if (window.Session && Session.clearClaim) Session.clearClaim(); } catch (_) {}

    _auth.signOut()
      .then(function() {
        _currentUser = null;
        if (callback) callback(null);
      })
      .catch(function(err) {
        if (callback) callback(QRI18n.t('settings.logoutFailed', { error: err.message }));
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
    hasPersistedSession: hasPersistedSession,
    onStateChange: onStateChange,
    signup: signup,
    login: login,
    loginWithGoogle: loginWithGoogle,
    resetPassword: resetPassword,
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
