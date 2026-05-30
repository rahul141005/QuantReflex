/**
 * utils.js — Shared utilities for Coaching Admin Panel
 *
 * Reuses the same patterns from AdminUtils in super-admin-app.
 * Added coaching-specific helpers: engagement level, speed formatting, etc.
 */
var CoachingUtils = (function () {
  'use strict';

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
   * Get streak emoji based on value.
   */
  function getStreakEmoji(streak) {
    if (!streak || streak === 0) return '';
    if (streak >= 30) return '🔥';
    if (streak >= 14) return '⚡';
    if (streak >= 7) return '✨';
    if (streak >= 3) return '💪';
    return '🌱';
  }

  /**
   * Get engagement level badge.
   */
  function getEngagementBadge(level) {
    switch (level) {
      case 'active': return '<span class="badge badge-active">🔥 Active</span>';
      case 'regular': return '<span class="badge" style="background:rgba(245,158,11,0.15);color:#f59e0b;">⚡ Regular</span>';
      case 'inactive': return '<span class="badge badge-inactive">💤 Inactive</span>';
      default: return '<span class="badge" style="background:var(--bg-elevated);color:var(--text-muted);">Unknown</span>';
    }
  }

  /**
   * Centralized subscription badge display.
   * Premium+ supersedes Premium. Free users get nothing.
   * @param {boolean} isPremium
   * @param {boolean} isPremiumPlus
   * @returns {string} HTML badge or empty string
   */
  function getSubscriptionBadge(isPremium, isPremiumPlus) {
    if (isPremiumPlus) return '<span class="badge badge-premium-plus">★ Premium+</span>';
    if (isPremium) return '<span class="badge badge-premium">★ Premium</span>';
    return '';
  }

  /**
   * Calculate Consistency Score (replaces XP).
   * Weighted composite: streak contribution + volume + accuracy.
   * @param {object} opts - { streak, totalAttempted, accuracy }
   * @returns {number} Score 0–100
   */
  function getConsistencyScore(opts) {
    var streak = opts.streak || 0;
    var attempted = opts.totalAttempted || 0;
    var accuracy = opts.accuracy || 0;

    // Streak component (0–35): rewards sustained daily practice
    var streakScore = Math.min(streak / 30, 1) * 35;

    // Volume component (0–35): rewards question volume (diminishing returns)
    var volumeScore = Math.min(attempted / 500, 1) * 35;

    // Accuracy component (0–30): rewards high accuracy
    var accuracyScore = (accuracy / 100) * 30;

    return Math.round(streakScore + volumeScore + accuracyScore);
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
    escapeHtml: escapeHtml,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    getRelativeTime: getRelativeTime,
    formatAccuracy: formatAccuracy,
    formatSpeed: formatSpeed,
    getStreakEmoji: getStreakEmoji,
    getEngagementBadge: getEngagementBadge,
    getSubscriptionBadge: getSubscriptionBadge,
    getConsistencyScore: getConsistencyScore,
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
