/**
 * api.js — Centralized API service for Admin Panel
 *
 * Wraps all fetch calls to Vercel serverless endpoints.
 * Automatically attaches Firebase JWT for server-side verification.
 */
var API = (function () {
  'use strict';

  function _delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  async function _attempt(endpoint, options) {
    var token = await AdminAuth.getToken();
    var config = Object.assign({}, options || {}, {
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      }, (options && options.headers) || {})
    });

    var response = await fetch(endpoint, config);
    if (response.ok) return response.json();

    var errData;
    try { errData = await response.json(); } catch (e) { errData = null; }
    // Extract the most meaningful message AND the error code from any response shape.
    var errMessage = 'Request failed (' + response.status + ')';
    var errCode = null;
    if (errData) {
      if (errData.error && typeof errData.error === 'object') {
        errMessage = errData.error.message || errMessage;
        errCode = errData.error.code || null;
      } else if (typeof errData.error === 'string') {
        errMessage = errData.error;
      } else if (errData.message) {
        errMessage = errData.message;
      } else {
        try { var s = JSON.stringify(errData); if (s && s !== '{}' && s !== '""') errMessage = s; } catch (_) {}
      }
    }
    var err = new Error(errMessage);
    err.status = response.status;
    err.code = errCode;
    throw err;
  }

  /**
   * One automatic retry on transient failures (ADR-024) — bounded to a single retry, no storms.
   * 429 (request rejected pre-processing) is always safe to retry; 5xx is retried only for GET
   * (idempotent reads) so a mutation that may have partially applied is never silently re-sent.
   * The thrown Error carries `.status` + `.code` so AdminUtils.getReadableError can map it to
   * operator-friendly copy.
   */
  async function _fetch(endpoint, options) {
    try {
      return await _attempt(endpoint, options);
    } catch (err) {
      var isGet = !options || !options.method || String(options.method).toUpperCase() === 'GET';
      var retryable = err && (err.status === 429 || (isGet && err.status >= 500 && err.status <= 599));
      if (retryable) { await _delay(1200); return await _attempt(endpoint, options); }
      throw err;
    }
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

  /* Edit operational fields (name / capacity / logoUrl) — ADR-030. */
  function editCoaching(coachingId, data) {
    return _fetch('/api/admin/coachings?action=edit', {
      method: 'POST',
      body: JSON.stringify(Object.assign({ coachingId: coachingId }, data || {}))
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

  /* ---- AI Command Center (telemetry rollups, credits, OpenAI reconciliation) ---- */
  function getAiCommand(days) { return _fetch('/api/admin/ai?action=command&days=' + (days || 30)); }
  function getAiCredits() { return _fetch('/api/admin/ai?action=credits'); }
  function setAiCredits(startingBalanceUSD) { return _fetch('/api/admin/ai?action=credits', { method: 'POST', body: JSON.stringify({ startingBalanceUSD: startingBalanceUSD }) }); }
  function getOpenAiUsage(days) { return _fetch('/api/admin/ai?action=openai-usage&days=' + (days || 30)); }

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
  function revokeMyTokens() { return _fetch('/api/admin/system?action=revoke-tokens', { method: 'POST' }); }

  /* ---- Reports (ADR-096) ---- */
  function getReports(cursor, filters) {
    var url = '/api/admin/reports?action=list';
    filters = filters || {};
    if (cursor) url += '&startAfter=' + encodeURIComponent(cursor);
    if (filters.status) url += '&status=' + encodeURIComponent(filters.status);
    if (filters.type) url += '&type=' + encodeURIComponent(filters.type);
    if (filters.priority) url += '&priority=' + encodeURIComponent(filters.priority);
    if (filters.q) url += '&q=' + encodeURIComponent(filters.q);
    return _fetch(url);
  }
  function getReportDetails(id) { return _fetch('/api/admin/reports?action=details&id=' + encodeURIComponent(id)); }
  function getReportsAnalytics() { return _fetch('/api/admin/reports?action=analytics'); }

  /* Refund review (ADR-143). The refund REQUEST queue — approve/reject only. Issuing the actual
     refund happens in the provider's own dashboard; entitlement is revoked later by the provider
     webhook, never by these calls. */
  function getRefunds(status, limit) {
    var url = '/api/admin/refunds?action=list';
    if (status && status !== 'all') url += '&status=' + encodeURIComponent(status);
    if (limit) url += '&limit=' + encodeURIComponent(limit);
    return _fetch(url);
  }
  function getRefundDetails(id) { return _fetch('/api/admin/refunds?action=details&id=' + encodeURIComponent(id)); }
  function getRefundsAnalytics() { return _fetch('/api/admin/refunds?action=analytics'); }
  function decideRefund(id, decision, note) {
    return _fetch('/api/admin/refunds?action=decide', { method: 'POST', body: JSON.stringify({ id: id, decision: decision, note: note || '' }) });
  }
  function updateReportStatus(id, status) { return _fetch('/api/admin/reports?action=update-status', { method: 'POST', body: JSON.stringify({ id: id, status: status }) }); }
  function assignReport(id, assignTo, assignToEmail) { return _fetch('/api/admin/reports?action=assign', { method: 'POST', body: JSON.stringify({ id: id, assignTo: assignTo, assignToEmail: assignToEmail }) }); }
  function setReportPriority(id, priority) { return _fetch('/api/admin/reports?action=priority', { method: 'POST', body: JSON.stringify({ id: id, priority: priority }) }); }
  function labelReport(id, label, op) { return _fetch('/api/admin/reports?action=label', { method: 'POST', body: JSON.stringify({ id: id, label: label, op: op || 'add' }) }); }
  function addReportNote(id, text) { return _fetch('/api/admin/reports?action=note', { method: 'POST', body: JSON.stringify({ id: id, text: text }) }); }
  function mergeReportDuplicate(id, duplicateOf) { return _fetch('/api/admin/reports?action=merge-duplicate', { method: 'POST', body: JSON.stringify({ id: id, duplicateOf: duplicateOf, confirm: 'MERGE' }) }); }

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
    editCoaching: editCoaching,
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
    getAiCommand: getAiCommand,
    getAiCredits: getAiCredits,
    setAiCredits: setAiCredits,
    getOpenAiUsage: getOpenAiUsage,
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
    revokeMyTokens: revokeMyTokens,
    runAudit: function() {
      return _fetch('/api/admin/system?action=health');
    },
    getAuditLogs: function() {
      return _fetch('/api/admin/system?action=auditLogs');
    },
    cleanupDuels: function() {
      return _fetch('/api/admin/system?action=duels-cleanup', { method: 'POST' });
    },
    getReports: getReports,
    getReportDetails: getReportDetails,
    getReportsAnalytics: getReportsAnalytics,
    getRefunds: getRefunds,
    getRefundDetails: getRefundDetails,
    getRefundsAnalytics: getRefundsAnalytics,
    decideRefund: decideRefund,
    updateReportStatus: updateReportStatus,
    assignReport: assignReport,
    setReportPriority: setReportPriority,
    labelReport: labelReport,
    addReportNote: addReportNote,
    mergeReportDuplicate: mergeReportDuplicate
  };
})();
