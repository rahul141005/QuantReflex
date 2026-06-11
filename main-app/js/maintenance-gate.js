/**
 * maintenance-gate.js — Emergency maintenance mode (ADR-021).
 *
 * Reads config/maintenance (world-readable by rule). If enabled AND the current user is not an
 * admin, overlays a full-screen maintenance message and blocks core learning. Admins pass through
 * so they can still operate. Fails OPEN (a read error never locks anyone out). Best-effort, client
 * side — the server-side AI/payment kill switches are the hard enforcement.
 */
(function () {
  'use strict';

  function _showMaintenance(message) {
    if (document.getElementById('qrMaintenanceScreen')) return;
    var el = document.createElement('div');
    el.id = 'qrMaintenanceScreen';
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0f172a;color:#e2e8f0;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;' +
      'padding:2rem;font-family:system-ui,-apple-system,sans-serif;';
    el.innerHTML =
      '<div style="font-size:3rem;margin-bottom:1rem;">🛠️</div>' +
      '<h1 style="font-size:1.5rem;margin:0 0 .5rem;">Under maintenance</h1>' +
      '<p style="max-width:32rem;color:#94a3b8;line-height:1.5;"></p>';
    el.querySelector('p').textContent = message || 'QuantReflex is briefly down for maintenance. Please check back shortly.';
    document.body.appendChild(el);
  }

  function _check() {
    try {
      if (typeof firebase === 'undefined' || !firebase.firestore) return;
      var db = (typeof FirebaseApp !== 'undefined' && FirebaseApp.getDb) ? FirebaseApp.getDb() : firebase.firestore();
      db.collection('config').doc('maintenance').get().then(function (snap) {
        if (!snap.exists || !snap.data().enabled) return;
        var msg = snap.data().message;
        var u = (firebase.auth && firebase.auth().currentUser) || null;
        if (u && u.getIdTokenResult) {
          u.getIdTokenResult().then(function (t) {
            if (!(t && t.claims && t.claims.admin)) _showMaintenance(msg);
          }).catch(function () { _showMaintenance(msg); });
        } else {
          _showMaintenance(msg);
        }
      }).catch(function () { /* fail open */ });
    } catch (_) { /* fail open */ }
  }

  /* Run after Firebase has had a moment to initialize + restore the auth session. */
  function _schedule() { setTimeout(_check, 900); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _schedule);
  else _schedule();
})();
