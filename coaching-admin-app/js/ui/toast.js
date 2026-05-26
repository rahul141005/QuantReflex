/**
 * toast.js — Toast notification system for Coaching Admin
 *
 * Mobile-optimized, top-center positioning.
 * Auto-dismisses after configurable duration.
 */
var Toast = (function () {
  'use strict';

  function show(message, duration, type) {
    var container = document.getElementById('toastContainer');
    if (!container) return;

    var toast = document.createElement('div');
    toast.className = 'toast' + (type ? ' ' + type : '');
    toast.textContent = message;

    container.appendChild(toast);

    var dur = duration || 3000;
    setTimeout(function () {
      toast.classList.add('toast-exit');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 200);
    }, dur);
  }

  function success(msg, dur) { show(msg, dur || 3000, 'success'); }
  function error(msg, dur) { show(msg, dur || 4000, 'error'); }

  return { show: show, success: success, error: error };
})();
