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
    return _fetch('/api/admin/dashboard');
  }

  /* ---- Users & Entitlements ---- */
  function getUsers() {
    return _fetch('/api/admin/users');
  }

  function togglePremium(uid, isPremium) {
    return _fetch('/api/admin/users-premium', {
      method: 'POST',
      body: JSON.stringify({ uid: uid, isPremium: isPremium })
    });
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
    return _fetch('/api/admin/coachings');
  }

  function createCoaching(coachingId, name) {
    return _fetch('/api/admin/coachings', {
      method: 'POST',
      body: JSON.stringify({ coachingId, name })
    });
  }

  /* ---- Questions & AI ---- */
  function getQuestions() {
    return _fetch('/api/admin/questions');
  }

  function saveQuestion(questionData) {
    return _fetch('/api/admin/questions', {
      method: 'POST',
      body: JSON.stringify(questionData)
    });
  }

  function getAIUsage() {
    return _fetch('/api/admin/ai-usage');
  }

  function generateQuestion(topic, difficulty) {
    return _fetch('/api/admin/generate-question', {
      method: 'POST',
      body: JSON.stringify({ topic, difficulty })
    });
  }

  return {
    getDashboard: getDashboard,
    getUsers: getUsers,
    togglePremium: togglePremium,
    grantEntitlement: grantEntitlement,
    getCoachings: getCoachings,
    createCoaching: createCoaching,
    getQuestions: getQuestions,
    saveQuestion: saveQuestion,
    generateQuestion: generateQuestion,
    getAIUsage: getAIUsage
  };
})();
