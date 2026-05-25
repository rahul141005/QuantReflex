/**
 * api.js — Centralized API service for Admin Panel
 *
 * Wraps all fetch calls to Vercel serverless endpoints.
 * Automatically attaches Firebase JWT for server-side verification.
 */
var API = (function () {
  'use strict';

  async function _fetch(endpoint, options) {
    var token = await AdminAuth.getToken();
    var config = Object.assign({}, options || {}, {
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      }, (options && options.headers) || {})
    });

    var response = await fetch(endpoint, config);
    if (!response.ok) {
      var errData;
      try { errData = await response.json(); } catch (e) { errData = {}; }
      throw new Error(errData.error || 'Request failed (' + response.status + ')');
    }
    return response.json();
  }

  /* ---- Dashboard ---- */
  function getDashboard() {
    return _fetch('/api/admin/system?action=dashboard');
  }

  /* ---- Users & Entitlements ---- */
  function getUsers(cursor) {
    var url = '/api/admin/users?action=list';
    if (cursor) url += '&startAfter=' + encodeURIComponent(cursor);
    return _fetch(url);
  }
  
  function getUserDetails(uid) {
    return _fetch('/api/admin/users?action=details&uid=' + encodeURIComponent(uid));
  }

  function grantEntitlement(type, action, targetId, trialDays) {
    var payload = { type: type, action: action, targetId: targetId };
    if (trialDays) payload.trialDays = trialDays;
    return _fetch('/api/admin/entitlements', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  /* ---- Coachings ---- */
  function getCoachings() {
    return _fetch('/api/admin/coachings?action=list');
  }

  function createCoaching(data) {
    return _fetch('/api/admin/coachings?action=create', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  function mutateCoaching(coachingId, action) {
    return _fetch('/api/admin/coachings?action=mutate', {
      method: 'POST',
      body: JSON.stringify({ coachingId: coachingId, action: action })
    });
  }

  /* ---- Questions & AI ---- */
  function getQuestions() {
    return _fetch('/api/admin/questions?action=list');
  }

  function saveQuestion(questionData) {
    return _fetch('/api/admin/questions?action=list', {
      method: 'POST',
      body: JSON.stringify(questionData)
    });
  }

  function getAIUsage() {
    return _fetch('/api/admin/ai-usage');
  }

  function generateQuestion(topic, difficulty) {
    return _fetch('/api/admin/questions?action=generate', {
      method: 'POST',
      body: JSON.stringify({ topic: topic, difficulty: difficulty })
    });
  }

  /* ---- Notifications ---- */
  function sendBroadcast(payload) {
    return _fetch('/api/admin/notifications?action=broadcast', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  /* ---- Payments ---- */
  function getPaymentLogs() {
    return _fetch('/api/admin/payments?action=logs');
  }

  return {
    getDashboard: getDashboard,
    getUsers: getUsers,
    getUserDetails: getUserDetails,
    grantEntitlement: grantEntitlement,
    getCoachings: getCoachings,
    createCoaching: createCoaching,
    mutateCoaching: mutateCoaching,
    getQuestions: getQuestions,
    saveQuestion: saveQuestion,
    generateQuestion: generateQuestion,
    getAIUsage: getAIUsage,
    sendBroadcast: sendBroadcast,
    getPaymentLogs: getPaymentLogs,
    runAudit: function() {
      return _fetch('/api/admin/system?action=health');
    },
    getAuditLogs: function() {
      return _fetch('/api/admin/system?action=auditLogs');
    },
    cleanupDuels: function() {
      return _fetch('/api/admin/duels?action=cleanup', { method: 'POST' });
    }
  };
})();
