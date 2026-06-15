/**
 * notificationModel.js — the ONE canonical notification model (ADR-066).
 *
 * Server-side (Admin SDK) is the SOLE creator of notifications; clients never create. Every notification in the
 * QuantReflex ecosystem — from any app, any reminder type — is built here so there is exactly one shape, one set
 * of categories, and one place to evolve. `buildNotification()` normalizes arbitrary input + applies per-category
 * defaults (icon, deep-link, push-eligibility) so future notification types plug in with zero new architecture.
 *
 * Inbox doc shape (written to users/{uid}/notifications/{autoId} by notificationService):
 *   title, body, type, category, priority, icon, deepLink, sender{kind,id,name}, coachingId,
 *   isRead, archived, pinned, timestamp (serverTimestamp, added by the service), expiresAt, metadata,
 *   delivery { inbox, pushAttempted, pushDelivered, pushFailed, openedAt }
 */
'use strict';

var CATEGORY = { SYSTEM: 'system', REMINDER: 'reminder', COACHING: 'coaching', SOCIAL: 'social', BILLING: 'billing', AI: 'ai' };
var PRIORITY = { LOW: 'low', NORMAL: 'normal', HIGH: 'high', URGENT: 'urgent' };
var PRIORITIES = [PRIORITY.LOW, PRIORITY.NORMAL, PRIORITY.HIGH, PRIORITY.URGENT];

// Known subtypes (free-form `type` is allowed; these document the catalogue).
var TYPE = {
  ANNOUNCEMENT: 'announcement', DIRECT_MESSAGE: 'direct_message', TOPIC_NUDGE: 'topic_nudge',
  DAILY_REMINDER: 'daily_reminder', STREAK_REMINDER: 'streak_reminder', PLANNER_REMINDER: 'planner_reminder',
  AI_NUDGE: 'ai_nudge', EXAM_REMINDER: 'exam_reminder', DUEL: 'duel',
  PREMIUM: 'premium', TRIAL: 'trial', SUBSCRIPTION: 'subscription',
  APP_UPDATE: 'app_update', MAINTENANCE: 'maintenance', SYSTEM: 'system', PROMOTION: 'promotion'
};

// Per-category presentation + push defaults. deepLink is an in-app route hash the client Router understands.
var CATEGORY_DEFAULTS = {
  system:   { icon: '🔔', deepLink: '#home',     push: true },
  reminder: { icon: '⏰', deepLink: '#practice', push: true },
  coaching: { icon: '🎓', deepLink: '#home',     push: true },
  social:   { icon: '⚔️', deepLink: '#duel',     push: true },
  billing:  { icon: '💳', deepLink: '#settings', push: true },
  ai:       { icon: '🧠', deepLink: '#coach',    push: true }
};

function _clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) : s; }

/** Normalize arbitrary input into the canonical notification object (timestamp is added by the service). */
function buildNotification(input) {
  input = input || {};
  var category = CATEGORY_DEFAULTS[input.category] ? input.category : CATEGORY.SYSTEM;
  var defs = CATEGORY_DEFAULTS[category];
  return {
    title: _clip(input.title, 140),
    body: _clip(input.body, 1000),
    type: _clip(input.type || category, 40),
    category: category,
    priority: PRIORITIES.indexOf(input.priority) >= 0 ? input.priority : PRIORITY.NORMAL,
    icon: input.icon || defs.icon,
    deepLink: input.deepLink || defs.deepLink,
    sender: (input.sender && typeof input.sender === 'object')
      ? { kind: input.sender.kind || 'system', id: input.sender.id || null, name: input.sender.name || 'QuantReflex' }
      : { kind: 'system', id: null, name: 'QuantReflex' },
    coachingId: input.coachingId || null,
    isRead: false,
    archived: false,
    pinned: false,
    expiresAt: input.expiresAt || null,
    metadata: (input.metadata && typeof input.metadata === 'object') ? input.metadata : {},
    delivery: { inbox: true, pushAttempted: false, pushDelivered: null, pushFailed: false, openedAt: null }
  };
}

/** Whether this category is eligible for a push delivery attempt (display-only categories could opt out later). */
function categoryPushEligible(category) {
  var d = CATEGORY_DEFAULTS[category]; return d ? d.push !== false : true;
}

module.exports = { CATEGORY: CATEGORY, PRIORITY: PRIORITY, TYPE: TYPE, CATEGORY_DEFAULTS: CATEGORY_DEFAULTS, buildNotification: buildNotification, categoryPushEligible: categoryPushEligible };
