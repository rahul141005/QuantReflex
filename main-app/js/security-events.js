/**
 * security-events.js — client-side security/login event capture (Phase 5, ADR-018).
 *
 * Firebase Spark has no Auth-trigger Cloud Functions, so login security events
 * (failed logins, suspicious access, admin logins) are captured here and written
 * to the append-only `securityEvents` Firestore collection. Writes are BEST-EFFORT
 * and must never block or break the auth flow. The collection's rule validates the
 * shape (key allowlist, type allowlist, server-clock createdAt, capped strings).
 *
 * Privacy: the attempted email is SHA-256 HASHED (never stored raw); the password is
 * never captured. See docs/BIBLE/SECURITY_ARCHITECTURE.md §6 (SEC1) + DECISION_LOG ADR-018.
 *
 * Inline-copied into each app per the no-bundler convention — only APP differs.
 */
var SecurityEvents = (function () {
  'use strict';

  var APP = 'main'; /* 'main' | 'super-admin' | 'coaching' */

  function _hashEmail(email) {
    try {
      if (!email || typeof email !== 'string') return Promise.resolve(null);
      var norm = email.trim().toLowerCase();
      if (!norm) return Promise.resolve(null);
      if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest && typeof TextEncoder !== 'undefined') {
        var data = new TextEncoder().encode(norm);
        return crypto.subtle.digest('SHA-256', data).then(function (buf) {
          var bytes = Array.prototype.slice.call(new Uint8Array(buf));
          return bytes.map(function (b) { return ('00' + b.toString(16)).slice(-2); }).join('');
        }).catch(function () { return null; });
      }
      return Promise.resolve(null);
    } catch (_) { return Promise.resolve(null); }
  }

  /**
   * Record a security event. type ∈ {failed_login, suspicious_access, admin_login}.
   * details: { email?, reason?, errorCode?, uid? }. NEVER pass a password.
   */
  function record(type, details) {
    try {
      details = details || {};
      var db = (typeof FirebaseApp !== 'undefined' && FirebaseApp.getDb) ? FirebaseApp.getDb() : null;
      var ts = (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue)
        ? firebase.firestore.FieldValue.serverTimestamp() : null;
      if (!db || !ts) return; /* best-effort: needs Firestore + serverTimestamp (rule requires createdAt == request.time) */
      _hashEmail(details.email).then(function (emailHash) {
        var doc = {
          type: type,
          app: APP,
          emailHash: emailHash || null,
          reason: details.reason ? String(details.reason).slice(0, 120) : null,
          errorCode: details.errorCode ? String(details.errorCode).slice(0, 60) : null,
          uid: details.uid ? String(details.uid).slice(0, 128) : null,
          userAgent: (typeof navigator !== 'undefined' && navigator.userAgent) ? String(navigator.userAgent).slice(0, 300) : null,
          createdAt: ts
        };
        db.collection('securityEvents').add(doc).catch(function (e) {
          if (typeof console !== 'undefined') console.warn('[SecurityEvents] write failed:', e && e.message);
        });
      });
    } catch (_) { /* never break the auth flow */ }
  }

  return { record: record };
})();
