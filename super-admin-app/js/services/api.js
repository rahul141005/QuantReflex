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
      try { errData = await response.json(); } catch (e) { errData = null; }
      // Extract the most meaningful error message from any response shape
      var errMessage = 'Request failed (' + response.status + ')';
      if (errData) {
        if (typeof errData.error === 'string') {
          errMessage = errData.error;
        } else if (errData.error && errData.error.message) {
          errMessage = errData.error.message;
        } else if (errData.message) {
          errMessage = errData.message;
        } else {
          try {
            var s = JSON.stringify(errData);
            if (s && s !== '{}' && s !== '""') errMessage = s;
          } catch (_) {}
        }
      }
      throw new Error(errMessage);
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
  function getUserPaymentHistory(uid) { return _fetch('/api/admin/users?action=payment-history&uid=' + encodeURIComponent(uid)); }
  function getUserActivity(uid) { return _fetch('/api/admin/users?action=activity-timeline&uid=' + encodeURIComponent(uid)); }
  function getUserAdminHistory(uid) { return _fetch('/api/admin/users?action=admin-history&uid=' + encodeURIComponent(uid)); }
  function getPendingPurgeList() { return _fetch('/api/admin/users?action=pending-purge-list'); }
  function throttleUser(uid, cap) { return _fetch('/api/admin/users?action=throttle', { method: 'POST', body: JSON.stringify({ uid: uid, cap: cap }) }); }
  function reassignCoaching(uid, coachingId) { return _fetch('/api/admin/users?action=reassign-coaching', { method: 'POST', body: JSON.stringify({ uid: uid, coachingId: coachingId }) }); }
  function getCoachingDetails(coachingId) { return _fetch('/api/admin/coachings?action=details&coachingId=' + encodeURIComponent(coachingId)); }
  function getCoachingStudents(coachingId) { return _fetch('/api/admin/coachings?action=students&coachingId=' + encodeURIComponent(coachingId)); }
  function getCoachingActivity(coachingId) { return _fetch('/api/admin/coachings?action=activity&coachingId=' + encodeURIComponent(coachingId)); }
  function resetCoachingToken(coachingId) { return _fetch('/api/admin/coachings?action=reset-token', { method: 'POST', body: JSON.stringify({ coachingId: coachingId }) }); }
  function getNotificationHistory() { return _fetch('/api/admin/notifications?action=history'); }

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

  function mutateCoaching(coachingId, action, confirm) {
    var payload = { coachingId: coachingId, action: action };
    if (confirm) payload.confirm = confirm; /* required by the server for suspend/delete (cascade revoke) */
    return _fetch('/api/admin/coachings?action=mutate', {
      method: 'POST',
      body: JSON.stringify(payload)
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

  function updateQuestion(id, data) {
    return _fetch('/api/admin/questions?action=update', {
      method: 'POST',
      body: JSON.stringify(Object.assign({ id: id }, data || {}))
    });
  }

  function archiveQuestion(id) {
    return _fetch('/api/admin/questions?action=archive', {
      method: 'POST',
      body: JSON.stringify({ id: id })
    });
  }

  function deleteQuestion(id) {
    return _fetch('/api/admin/questions?action=delete', {
      method: 'POST',
      body: JSON.stringify({ id: id, confirm: 'DELETE' })
    });
  }

  function getAIUsage() {
    return _fetch('/api/admin/ai?action=usage');
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
    return _fetch('/api/admin/system?action=payments-logs');
  }

  /* ---- User Lifecycle (Phase 2) ---- */
  function userAction(action, uid, extra) {
    return _fetch('/api/admin/users?action=' + action, {
      method: 'POST',
      body: JSON.stringify(Object.assign({ uid: uid }, extra || {}))
    });
  }
  function getInactiveUsers(days, limit) {
    return _fetch('/api/admin/users?action=inactive-list&days=' + (days || 90) + '&limit=' + (limit || 200));
  }
  function bulkInactive(action, uids, extra) {
    return _fetch('/api/admin/users?action=' + action, {
      method: 'POST',
      body: JSON.stringify(Object.assign({ uids: uids }, extra || {}))
    });
  }

  /* ---- AI Budget (Phase 3) ---- */
  function getAiBudget() { return _fetch('/api/admin/ai?action=budget'); }
  function setAiBudget(cfg) { return _fetch('/api/admin/ai?action=budget', { method: 'POST', body: JSON.stringify(cfg) }); }

  /* ---- Export + Alerts (Phase 4) ---- */
  function exportData(type, params) {
    var qs = '?action=export&type=' + encodeURIComponent(type);
    if (params) Object.keys(params).forEach(function (k) { qs += '&' + k + '=' + encodeURIComponent(params[k]); });
    return _fetch('/api/admin/system' + qs);
  }
  function getInactiveExport(days) { return _fetch('/api/admin/users?action=inactive-export&days=' + (days || 90)); }
  function getAlerts() { return _fetch('/api/admin/system?action=alerts'); }
  function getSecurity() { return _fetch('/api/admin/system?action=security'); }
  function getFirestoreOps() { return _fetch('/api/admin/system?action=firestore-ops'); }
  function getRevenueIntel() { return _fetch('/api/admin/system?action=revenue-intel'); }
  function ackAlert(type, hours) { return _fetch('/api/admin/system?action=ack-alert', { method: 'POST', body: JSON.stringify({ type: type, hours: hours || 24 }) }); }
  function searchEcosystem(q) { return _fetch('/api/admin/system?action=search&q=' + encodeURIComponent(q)); }
  function aggregateMetrics() { return _fetch('/api/admin/system?action=aggregate-metrics', { method: 'POST' }); }
  function getEmergencyConfig() { return _fetch('/api/admin/system?action=config-get'); }
  function setEmergencyConfig(key, enabled, message) { return _fetch('/api/admin/system?action=config-set', { method: 'POST', body: JSON.stringify({ key: key, enabled: enabled, message: message }) }); }

  return {
    getDashboard: getDashboard,
    getUsers: getUsers,
    getUserDetails: getUserDetails,
    getUserPaymentHistory: getUserPaymentHistory,
    getUserActivity: getUserActivity,
    getUserAdminHistory: getUserAdminHistory,
    getPendingPurgeList: getPendingPurgeList,
    throttleUser: throttleUser,
    reassignCoaching: reassignCoaching,
    getCoachingDetails: getCoachingDetails,
    getCoachingStudents: getCoachingStudents,
    getCoachingActivity: getCoachingActivity,
    resetCoachingToken: resetCoachingToken,
    getNotificationHistory: getNotificationHistory,
    grantEntitlement: grantEntitlement,
    getCoachings: getCoachings,
    createCoaching: createCoaching,
    mutateCoaching: mutateCoaching,
    getQuestions: getQuestions,
    saveQuestion: saveQuestion,
    updateQuestion: updateQuestion,
    archiveQuestion: archiveQuestion,
    deleteQuestion: deleteQuestion,
    generateQuestion: generateQuestion,
    getAIUsage: getAIUsage,
    sendBroadcast: sendBroadcast,
    getPaymentLogs: getPaymentLogs,
    suspendUser: function (uid) { return userAction('suspend', uid); },
    restoreUser: function (uid) { return userAction('restore', uid); },
    archiveUser: function (uid, reason) { return userAction('archive', uid, { reason: reason }); },
    purgeUser: function (uid) { return userAction('purge', uid, { confirm: 'DELETE' }); },
    resetUserProgress: function (uid) { return userAction('reset-progress', uid); },
    getInactiveUsers: getInactiveUsers,
    bulkArchiveInactive: function (uids) { return bulkInactive('bulk-archive', uids); },
    bulkRemindInactive: function (uids) { return bulkInactive('bulk-remind', uids); },
    getAiBudget: getAiBudget,
    setAiBudget: setAiBudget,
    exportData: exportData,
    getInactiveExport: getInactiveExport,
    getAlerts: getAlerts,
    getSecurity: getSecurity,
    getFirestoreOps: getFirestoreOps,
    getRevenueIntel: getRevenueIntel,
    aggregateMetrics: aggregateMetrics,
    ackAlert: ackAlert,
    searchEcosystem: searchEcosystem,
    getEmergencyConfig: getEmergencyConfig,
    setEmergencyConfig: setEmergencyConfig,
    runAudit: function() {
      return _fetch('/api/admin/system?action=health');
    },
    getAuditLogs: function() {
      return _fetch('/api/admin/system?action=auditLogs');
    },
    cleanupDuels: function() {
      return _fetch('/api/admin/system?action=duels-cleanup', { method: 'POST' });
    }
  };
})();
