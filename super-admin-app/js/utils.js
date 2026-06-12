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
  /* Admin preferences (ADR-025): date format + timezone, read from localStorage. */
  function _pref(k, def) { try { var v = localStorage.getItem(k); return v == null ? def : v; } catch (_) { return def; } }
  function _prefTz() { var t = _pref('qrAdminTz', 'local'); return (t && t !== 'local') ? t : undefined; }

  function formatDate(value, options) {
    var d = normalizeFirestoreDate(value);
    if (!d) return 'Unknown';
    var tz = _prefTz();
    if (!options) {
      var fmt = _pref('qrAdminDateFmt', 'local');
      if (fmt === 'iso') return d.toLocaleDateString('en-CA', tz ? { timeZone: tz } : undefined);  /* YYYY-MM-DD */
      if (fmt === 'dmy') return d.toLocaleDateString('en-GB', tz ? { timeZone: tz } : undefined);  /* DD/MM/YYYY */
      options = { year: 'numeric', month: 'short', day: 'numeric' };
    }
    if (tz && !options.timeZone) options = Object.assign({}, options, { timeZone: tz });
    return d.toLocaleDateString(undefined, options);
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
    var tz = _prefTz();
    return d.toLocaleString(undefined, tz ? { timeZone: tz } : undefined);
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
  /**
   * Map a known error (by code / status / message) to operator-friendly copy (ADR-024) so a raw
   * technical string ("Too many requests…", "Failed to fetch", a 5xx body) never reaches the admin.
   * Returns null when there's no friendlier phrasing (the caller then uses the real message).
   */
  function _friendlyError(code, message, status) {
    var m = String(message == null ? '' : message);
    if (code === 'RATE_LIMIT_EXCEEDED' || status === 429 || /too many requests/i.test(m)) {
      return "You're working quickly — pause a moment, then try again.";
    }
    if ((typeof status === 'number' && status >= 500) || /failed to fetch|network\s?error|load failed/i.test(m)) {
      return "That didn't go through — please try again in a moment.";
    }
    return null;
  }

  function getReadableError(error) {
    if (!error) return 'An unknown error occurred.';

    // String
    if (typeof error === 'string') {
      return _friendlyError(null, error, null) || error || 'An unknown error occurred.';
    }

    // Error instance (carries .status/.code from api.js _fetch)
    if (error instanceof Error) {
      return _friendlyError(error.code, error.message, error.status) || error.message || 'An unexpected error occurred.';
    }

    // Object with message
    if (typeof error === 'object') {
      var friendly = _friendlyError(error.code, error.message || (error.error && error.error.message), error.status);
      if (friendly) return friendly;
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

  /**
   * Standardized polished empty-state markup (ADR-024) — icon + title + explanation + optional CTA.
   * The CTA renders a button carrying the given id so the caller can wire an onclick.
   */
  function emptyState(o) {
    o = o || {};
    return '<div class="empty-state">' +
      (o.icon ? '<div class="empty-state-icon">' + escapeHtml(o.icon) + '</div>' : '') +
      (o.title ? '<div class="empty-state-title">' + escapeHtml(o.title) + '</div>' : '') +
      (o.text ? '<div class="empty-state-text">' + escapeHtml(o.text) + '</div>' : '') +
      (o.actionLabel ? '<div class="empty-state-action"><button class="btn btn-sm accent"' + (o.actionId ? ' id="' + escapeHtml(o.actionId) + '"' : '') + '>' + escapeHtml(o.actionLabel) + '</button></div>' : '') +
    '</div>';
  }

  /**
   * Shared stat tile (ADR-026) — the single owner of the metric-tile markup that was triplicated as a
   * per-view `_tile()` across Command Center / Revenue / AI. `value` is trusted markup (a number or "$x");
   * label + sub are escaped. `colorVar` is an optional CSS color (token var) for the number.
   */
  function statTile(label, value, sub, colorVar) {
    return '<div class="stat-card"><div class="stat-num"' + (colorVar ? ' style="color:' + colorVar + ';"' : '') + '>' + value + '</div>' +
      '<div class="stat-cap">' + escapeHtml(label) + '</div>' +
      (sub ? '<div class="stat-sub">' + escapeHtml(sub) + '</div>' : '') + '</div>';
  }

  return {
    normalizeFirestoreDate: normalizeFirestoreDate,
    toMillis: toMillis,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    escapeHtml: escapeHtml,
    getReadableError: getReadableError,
    downloadCsv: downloadCsv,
    entitlementState: entitlementState,
    emptyState: emptyState,
    statTile: statTile
  };
})();
