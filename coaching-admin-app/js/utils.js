/**
 * utils.js — Shared utilities for Coaching Admin Panel
 *
 * Reuses the same patterns from AdminUtils in super-admin-app.
 * Added coaching-specific helpers: engagement level, speed formatting, etc.
 */
var CoachingUtils = (function () {
  'use strict';

  /**
   * Inline thin-stroke SVG icon (ADR-030 premium-UI lever) — same Feather-style language as the bottom nav
   * (24×24, fill:none, stroke:currentColor, width 2). Replaces content emoji. Color follows `currentColor`,
   * so set it on the parent. `size` defaults to 18.
   * @param {string} name
   * @param {number} [size]
   */
  var _ICONS = {
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',                 // speed
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>', // accuracy
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', // active
    alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', // attention
    trophy: '<path d="M6 9a6 6 0 0 0 12 0V3H6z"/><path d="M6 5H3v2a3 3 0 0 0 3 3"/><path d="M18 5h3v2a3 3 0 0 1-3 3"/><line x1="9" y1="21" x2="15" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>', // wins
    flame: '<path d="M12 2s4 4 4 8a4 4 0 0 1-8 0c0-1 .5-2 1-3 .5 2 2 2 2 2 .5-1.5-1-4 1-7z"/><path d="M12 22a6 6 0 0 0 6-6c0-2-1-3.5-2-5 0 2-1.5 3-1.5 3C14 11 12 8 12 8s-2 3-2.5 6c0 0-1.5-1-1.5-3-1 1.5-2 3-2 5a6 6 0 0 0 6 6z"/>', // streak
    trending: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>', // momentum
    check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>', // ok
    clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>', // collecting/time
    activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',   // reps / activity
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>'
  };
  function icon(name, size) {
    var p = _ICONS[name];
    if (!p) return '';
    var s = size || 18;
    return '<svg class="ic" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      p + '</svg>';
  }

  /**
   * Escape HTML to prevent XSS.
   */
  function escapeHtml(str) {
    if (!str) return '';
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(str).replace(/[&<>"']/g, function (m) { return map[m]; });
  }

  /**
   * Format a date string for display.
   */
  function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
      var d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (_) { return '—'; }
  }

  /**
   * Format a date string with time.
   */
  function formatDateTime(dateStr) {
    if (!dateStr) return '—';
    try {
      var d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    } catch (_) { return '—'; }
  }

  /**
   * Get relative time string (e.g., "2h ago", "3d ago").
   */
  function getRelativeTime(dateStr) {
    if (!dateStr) return 'Never';
    try {
      var d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'Never';
      var now = Date.now();
      var diff = now - d.getTime();
      if (diff < 0) return 'Just now';
      if (diff < 60000) return 'Just now';
      if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
      if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
      if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
      if (diff < 2592000000) return Math.floor(diff / 604800000) + 'w ago';
      return formatDate(dateStr);
    } catch (_) { return 'Never'; }
  }

  /**
   * Format accuracy percentage.
   */
  function formatAccuracy(val) {
    if (val === null || val === undefined) return '—';
    return val + '%';
  }

  /**
   * Format speed in seconds.
   */
  function formatSpeed(val) {
    if (!val || val === 999) return '—';
    return val.toFixed(1) + 's';
  }


  /**
   * Get engagement level badge.
   */
  function getEngagementBadge(level) {
    switch (level) {
      case 'active': return '<span class="badge badge-active">Active</span>';
      case 'regular': return '<span class="badge" style="background:rgba(245,158,11,0.15);color:#f59e0b;">Regular</span>';
      case 'inactive': return '<span class="badge badge-inactive">Inactive</span>';
      default: return '<span class="badge" style="background:var(--bg-elevated);color:var(--text-muted);">Unknown</span>';
    }
  }

  /**
   * Centralized subscription badge display (v2: single Premium tier).
   * @param {string} plan - 'free' | 'premium'
   * @param {boolean} [isTrial] - true if the premium is a trial
   * @returns {string} HTML badge or empty string
   */
  function getSubscriptionBadge(plan, isTrial) {
    if (plan === 'premium') {
      if (isTrial) return '<span class="badge badge-draft">★ Trial</span>';
      return '<span class="badge badge-premium">★ Premium</span>';
    }
    return '';
  }

  /**
   * Honest "collecting data" card (ADR-027/028) — shown wherever a history-dependent metric
   * (speed trend, improvement score, conversion/retention) does not yet have enough days of real
   * data. NEVER renders a fabricated number — only an explanation + countdown.
   * @param {string} title - what is being collected
   * @param {number} have - days of real history accrued so far
   * @param {number} need - days required (e.g. 7 or 30)
   */
  function collectingCard(title, have, need) {
    have = have || 0; need = need || 7;
    var remaining = Math.max(0, need - have);
    var pct = Math.min(100, Math.round((have / need) * 100));
    var sub = remaining === 0
      ? 'Enough data — pull to refresh to view.'
      : 'Collecting real speed data — available in ' + remaining + ' day' + (remaining === 1 ? '' : 's') + '.';
    return '<div class="collecting"><div class="collecting-title">' + icon('clock', 16) + ' ' + escapeHtml(title) + '</div>' +
      '<div class="collecting-sub">' + sub + '</div>' +
      '<div class="collecting-bar"><span style="width:' + pct + '%"></span></div></div>';
  }

  /**
   * Render an inline SVG sparkline from a numeric series. Returns '' for <2 points.
   * @param {number[]} values
   * @param {object} [opts] - { invert: lower-is-better (e.g. speed), color }
   */
  function sparkline(values, opts) {
    opts = opts || {};
    var vals = (values || []).filter(function (v) { return typeof v === 'number' && isFinite(v); });
    if (vals.length < 2) return '';
    var w = 280, h = 44, pad = 4;
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    var range = (max - min) || 1;
    var stepX = (w - pad * 2) / (vals.length - 1);
    var pts = vals.map(function (v, i) {
      var x = pad + i * stepX;
      var norm = (v - min) / range;          // 0..1
      if (opts.invert) norm = 1 - norm;      // lower plotted higher (speed: faster = up)
      var y = pad + (1 - norm) * (h - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    var color = opts.color || 'var(--accent-primary)';
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  /** Signed-percent delta with an up/down arrow; `goodWhenNegative` flips color (speed: lower=better). */
  function deltaBadge(pct, goodWhenNegative) {
    if (pct === null || pct === undefined || !isFinite(pct)) return '';
    var rounded = Math.round(pct);
    if (rounded === 0) return '<span class="muted">±0%</span>';
    var positive = rounded > 0;
    var good = goodWhenNegative ? !positive : positive;
    var cls = good ? 'delta-up' : 'delta-down';
    var arrow = positive ? '↑' : '↓';
    return '<span class="' + cls + '">' + arrow + ' ' + Math.abs(rounded) + '%</span>';
  }

  /**
   * Get initial letter for avatar.
   */
  function getInitial(name) {
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
  }

  /**
   * Get accuracy color class.
   */
  function getAccuracyColor(accuracy) {
    if (accuracy >= 80) return 'emerald';
    if (accuracy >= 50) return 'amber';
    return 'red';
  }

  /**
   * Get readable error message.
   */
  function getReadableError(err) {
    if (!err) return 'An unknown error occurred.';
    if (typeof err === 'string') return err;
    if (err.message) return err.message;
    return 'An unexpected error occurred.';
  }

  /**
   * Create skeleton HTML for loading states.
   */
  function skeletonCard(count) {
    var html = '';
    for (var i = 0; i < (count || 3); i++) {
      html += '<div class="skeleton skeleton-card"></div>';
    }
    return html;
  }

  function skeletonMetrics() {
    return '<div class="metrics-grid">' +
      '<div class="skeleton skeleton-metric"></div>' +
      '<div class="skeleton skeleton-metric"></div>' +
      '<div class="skeleton skeleton-metric"></div>' +
      '<div class="skeleton skeleton-metric"></div>' +
      '</div>';
  }

  /**
   * Format a number with commas.
   */
  function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return Number(num).toLocaleString('en-IN');
  }

  /**
   * Capitalize first letter.
   */
  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  /**
   * Truncate text.
   */
  function truncate(str, len) {
    if (!str) return '';
    if (str.length <= len) return str;
    return str.substring(0, len) + '…';
  }

  return {
    icon: icon,
    escapeHtml: escapeHtml,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    getRelativeTime: getRelativeTime,
    formatAccuracy: formatAccuracy,
    formatSpeed: formatSpeed,
    getEngagementBadge: getEngagementBadge,
    getSubscriptionBadge: getSubscriptionBadge,
    collectingCard: collectingCard,
    sparkline: sparkline,
    deltaBadge: deltaBadge,
    getInitial: getInitial,
    getAccuracyColor: getAccuracyColor,
    getReadableError: getReadableError,
    skeletonCard: skeletonCard,
    skeletonMetrics: skeletonMetrics,
    formatNumber: formatNumber,
    capitalize: capitalize,
    truncate: truncate
  };
})();
