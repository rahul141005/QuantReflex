/**
 * utils.js — Centralized utility module for the Admin Panel
 *
 * Provides safe, reusable helpers that ALL admin views and services MUST use.
 * Eliminates duplicated _toMillis / _escapeHtml / error formatting across views.
 *
 * IMPORTANT: This file MUST be loaded before any view scripts in index.html.
 */
var AdminUtils = (function () {
  'use strict';

  /**
   * Safely normalize ANY timestamp format into a JavaScript Date object.
   *
   * Supports:
   *   ✅ Firestore Timestamp (has .toDate())
   *   ✅ ISO 8601 string ("2024-01-15T10:30:00.000Z")
   *   ✅ Unix milliseconds (number, e.g. 1705312200000)
   *   ✅ Unix seconds (number < 1e12, e.g. 1705312200)
   *   ✅ Date object
   *   ✅ Raw Firestore JSON object ({ _seconds, _nanoseconds })
   *   ✅ null / undefined / malformed values
   *
   * @param {*} value — Any timestamp representation
   * @returns {Date|null} — Parsed Date or null if unparseable
   */
  function normalizeFirestoreDate(value) {
    if (value == null) return null;

    // Already a Date
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }

    // Firestore Timestamp (has .toDate method)
    if (typeof value.toDate === 'function') {
      try { return value.toDate(); } catch (_) { return null; }
    }

    // Raw Firestore JSON serialized format: { _seconds: N, _nanoseconds: N }
    if (typeof value === 'object' && value._seconds != null) {
      try {
        var ms = (value._seconds * 1000) + Math.floor((value._nanoseconds || 0) / 1e6);
        var d = new Date(ms);
        return isNaN(d.getTime()) ? null : d;
      } catch (_) { return null; }
    }

    // ISO string
    if (typeof value === 'string') {
      var parsed = Date.parse(value);
      return isNaN(parsed) ? null : new Date(parsed);
    }

    // Unix timestamp (number)
    if (typeof value === 'number') {
      if (!isFinite(value)) return null;
      // Heuristic: if < 1e12, assume seconds; otherwise milliseconds
      var ms = value < 1e12 ? value * 1000 : value;
      var d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }

    return null;
  }

  /**
   * Convert any timestamp format to milliseconds for comparison.
   * Returns 0 for unparseable values (never crashes).
   *
   * @param {*} value — Any timestamp
   * @returns {number} — Milliseconds since epoch, or 0
   */
  function toMillis(value) {
    var d = normalizeFirestoreDate(value);
    return d ? d.getTime() : 0;
  }

  /**
   * Format any timestamp value into a human-readable locale string.
   * Returns 'Unknown' for unparseable values.
   *
   * @param {*} value — Any timestamp
   * @param {object} [options] — Intl.DateTimeFormat options
   * @returns {string}
   */
  function formatDate(value, options) {
    var d = normalizeFirestoreDate(value);
    if (!d) return 'Unknown';
    var defaults = { year: 'numeric', month: 'short', day: 'numeric' };
    return d.toLocaleDateString(undefined, options || defaults);
  }

  /**
   * Format any timestamp value into a full locale date+time string.
   *
   * @param {*} value — Any timestamp
   * @returns {string}
   */
  function formatDateTime(value) {
    var d = normalizeFirestoreDate(value);
    if (!d) return 'N/A';
    return d.toLocaleString();
  }

  /**
   * Escape HTML special characters to prevent XSS.
   * Single centralized implementation for all views.
   *
   * @param {*} str — Input string (coerced to String)
   * @returns {string}
   */
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }

  /**
   * Extract a human-readable error message from any error shape.
   *
   * Handles:
   *   ✅ Error instances (uses .message)
   *   ✅ Firebase error objects ({ code, message })
   *   ✅ API error responses ({ error: { message } })
   *   ✅ Plain strings
   *   ✅ [object Object] (extracts meaningful content)
   *   ✅ null / undefined
   *
   * NEVER returns:
   *   ❌ {}
   *   ❌ [object Object]
   *   ❌ Raw stack traces
   *
   * @param {*} error — Any error value
   * @returns {string} — Human-readable error message
   */
  function getReadableError(error) {
    if (!error) return 'An unknown error occurred.';

    // String
    if (typeof error === 'string') {
      return error || 'An unknown error occurred.';
    }

    // Error instance
    if (error instanceof Error) {
      return error.message || 'An unexpected error occurred.';
    }

    // Object with message
    if (typeof error === 'object') {
      // Nested error.error.message (API response format)
      if (error.error) {
        if (typeof error.error === 'string') return error.error;
        if (error.error.message) return error.error.message;
      }
      // Direct message
      if (error.message) return error.message;
      // Firebase code
      if (error.code) return 'Firebase error: ' + error.code;

      // Last resort: try to stringify, but never return {}
      try {
        var str = JSON.stringify(error);
        if (str && str !== '{}' && str !== '""') return str;
      } catch (_) {}
    }

    return 'An unexpected error occurred.';
  }

  /* Trigger a client-side CSV download from a string (keeps auth in the fetch, not the URL). */
  function downloadCsv(filename, csv) {
    try {
      var blob = new Blob([csv == null ? '' : csv], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename || 'export.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (e) { console.error('downloadCsv failed:', e); }
  }

  /**
   * Single source of truth for a user's entitlement state (ADR-022) — replaces the 4 duplicated
   * copies (users list, drawer, payments, debugger). Input: a user object with plan/planExpiry/
   * isTrial/planType. Returns { state, label, badgeClass }.
   */
  function entitlementState(u) {
    u = u || {};
    var now = Date.now();
    var expMs = u.planExpiry ? toMillis(u.planExpiry) : 0;
    var active = (u.plan === 'premium') && (!u.planExpiry || expMs > now);
    if (active && u.isTrial) return { state: 'trial', label: 'Trial', badgeClass: 'badge-draft' };
    if (active) return { state: 'premium', label: (u.planType === 'premium_12m' ? 'Premium 12m' : (u.planType === 'premium_6m' ? 'Premium 6m' : 'Premium')), badgeClass: 'badge-active' };
    if (u.plan === 'premium' && u.planExpiry && expMs <= now) return { state: 'expired', label: 'Expired', badgeClass: 'badge-archived' };
    return { state: 'free', label: 'Free', badgeClass: 'badge-draft' };
  }

  return {
    normalizeFirestoreDate: normalizeFirestoreDate,
    toMillis: toMillis,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    escapeHtml: escapeHtml,
    getReadableError: getReadableError,
    downloadCsv: downloadCsv,
    entitlementState: entitlementState
  };
})();
