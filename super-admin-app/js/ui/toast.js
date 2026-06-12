/**
 * toast.js — Lightweight toast notification system
 */
var Toast = (function () {
  'use strict';

  function show(message, type) {
    var container = document.getElementById('toastContainer');
    if (!container) return;

    var toast = document.createElement('div');
    toast.className = 'toast' + (type ? ' ' + type : '');
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status'); /* announce to AT (ADR-026, WCAG 4.1.3) */
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(function () {
      toast.classList.add('fadeout');
      setTimeout(function () { toast.remove(); }, 300);
    }, 2500);
  }

  function success(msg) { show(msg, 'success'); }
  function error(msg) { show(msg, 'error'); }

  return { show: show, success: success, error: error };
})();
