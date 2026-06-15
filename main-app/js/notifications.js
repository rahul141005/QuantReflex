/**
 * notifications.js — Push notification support using Firebase Cloud Messaging
 *
 * Features:
 *   - Request notification permission
 *   - Register FCM token and store in Firestore
 *   - Schedule local motivational notifications at 7 AM, 1 PM, 7 PM
 *   - Toggle notifications on/off from settings
 */

var NotificationManager = (function () {
  var VAPID_KEY = 'BA-OmaPVMtv6bPY2MIhP8SZANG9VlRsWtk_fh2Ypybvk4YPc25lG-BPbB4mR4nKeOMKDv2fFXOsBsQqf7gVTz5Y';
  var NOTIF_KEY = 'quant_notifications_enabled';
  // ADR-066: the local motivational-message bank + per-app-open timers were removed — those reminders now come
  // from the ONE server pipeline (Inbox-first + push), so they're never missed when the app is closed.

  /**
   * Check if notifications are enabled in local storage.
   * Falls back to checking settings.notificationsEnabled for Firestore sync compatibility.
   * @returns {boolean}
   */
  function isEnabled() {
    if (typeof AppState !== 'undefined') return AppState.getNotifEnabled();
    try {
      var val = localStorage.getItem(NOTIF_KEY);
      if (val !== null) return val === 'true';
      /* Fallback: check settings object for Firestore-synced state.
         Field name is notificationsEnabled — matches settings.js default. */
      var s = (typeof AppState !== 'undefined') ? AppState.getSettings() : JSON.parse(localStorage.getItem('quant_reflex_settings') || '{}');
      return s.notificationsEnabled === true;
    } catch (_) { return false; }
  }

  /**
   * Save notification enabled state.
   * @param {boolean} enabled
   */
  function setEnabled(enabled) {
    if (typeof AppState !== 'undefined') {
      AppState.setNotifEnabled(enabled);
    } else {
      try {
        localStorage.setItem(NOTIF_KEY, enabled ? 'true' : 'false');
      } catch (_) { /* ignore */ }
    }

    /* Sync to settings in Firestore using the canonical field name.
       Must match the key used in settings.js (notificationsEnabled). */
    var settings = loadSettings();
    settings.notificationsEnabled = enabled;
    saveSettings(settings);
  }

  /**
   * Request notification permission from the browser.
   * @param {function} [callback] - receives (error, permission)
   */
  function requestPermission(callback) {
    if (!('Notification' in window)) {
      if (callback) callback('Notifications not supported in this browser');
      return;
    }

    Notification.requestPermission().then(function (permission) {
      if (permission === 'granted') {
        if (callback) callback(null, permission);
      } else {
        if (callback) callback('Permission denied');
      }
    }).catch(function (err) {
      if (callback) callback(err.message || 'Permission request failed');
    });
  }

  /**
   * Register the FCM token and store it in Firestore.
   *
   * IMPORTANT: We explicitly link Firebase Messaging to the already-registered
   * service worker via useServiceWorker(). Without this, the Messaging SDK
   * may create a separate sw registration or fail to associate the token with
   * the correct SW — causing push events to never fire on Android PWAs.
   *
   * @param {function} [callback]
   */
  function _registerToken(callback) {
    if (typeof firebase === 'undefined' || !firebase.messaging) {
      if (callback) callback('Firebase Messaging not available');
      return;
    }

    /* Ensure the service worker is registered before linking messaging */
    if (!('serviceWorker' in navigator)) {
      if (callback) callback('Service workers not supported');
      return;
    }

    navigator.serviceWorker.getRegistration('./service-worker.js')
      .then(function (registration) {
        if (!registration) {
          /* SW not yet registered — wait for it */
          return navigator.serviceWorker.ready;
        }
        return registration;
      })
      .then(function (registration) {
        try {
          var messaging = firebase.messaging();
          /* Explicitly link messaging to OUR service worker.
             Prevents Messaging from registering its own SW or using the wrong one. */
          messaging.useServiceWorker(registration);
          return messaging.getToken({ vapidKey: VAPID_KEY });
        } catch (e) {
          return Promise.reject(e);
        }
      })
      .then(function (token) {
        if (token) {
          _saveTokenToFirestore(token);
          if (callback) callback(null, token);
        } else {
          if (callback) callback('No FCM token received — check VAPID key and notification permission');
        }
      })
      .catch(function (err) {
        if (callback) callback(err.message || 'Token registration failed');
      });
  }

  /**
   * Save FCM token to Firestore user document.
   * @param {string} token
   */
  function _saveTokenToFirestore(token) {
    if (typeof FirebaseApp === 'undefined' || !FirebaseApp.isReady()) return;
    var userId = FirebaseApp.getUserId();
    if (!userId) return;
    var db = FirebaseApp.getDb();
    db.collection('users').doc(userId).set({
      fcmToken: token,
      fcmTokenUpdatedAt: new Date().toISOString()
    }, { merge: true }).catch(function (err) {
      console.warn('Failed to save FCM token:', err);
    });
  }

  // ADR-066: the client-side 7am/1pm/7pm local-timer notifications are RETIRED. They were a parallel reminder
  // system that only fired while the app happened to be open and never reached the Inbox. Every reminder now comes
  // from the ONE server pipeline (Inbox-first, then push). These remain as no-ops so external callers don't break.
  function scheduleNotifications() { /* retired (ADR-066) — reminders are server-generated, Inbox-first */ }
  function cancelScheduledNotifications() { /* retired (ADR-066) */ }

  /**
   * Enable notifications: request permission, register token, schedule.
   * FCM token registration is best-effort — local notifications still
   * work even when Firebase Messaging is unavailable.
   * @param {function} [callback] - receives (error)
   */
  function enable(callback) {
    requestPermission(function (err) {
      if (err) {
        if (callback) callback(err);
        return;
      }
      setEnabled(true);
      // ADR-066: enabling = grant permission + register the FCM token so the server pipeline can PUSH to this
      // device. The Inbox always receives regardless; there are no client timers anymore.
      _registerToken(function (tokenErr) {
        if (tokenErr) console.warn('FCM token registration failed (Inbox still delivers all notifications):', tokenErr);
      });
      if (callback) callback(null);
    });
  }

  /** Disable PUSH for this user (the Inbox still receives every notification). */
  function disable() {
    setEnabled(false);
  }

  /** On startup: if push was enabled + permitted, refresh the FCM token so server pushes keep landing. */
  function init() {
    if (isEnabled() && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      _registerToken(function () {});
    }
  }

  return {
    isEnabled: isEnabled,
    enable: enable,
    disable: disable,
    init: init,
    scheduleNotifications: scheduleNotifications,
    cancelScheduledNotifications: cancelScheduledNotifications
  };
})();
