/**
 * learn-entitlements.js — the single source of truth (client copy) for WHICH Learn topics require Premium (ADR-109).
 *
 * shared/constants/entitlements.js → PREMIUM_LEARN is the canonical definition, but shared/ is outside each app's
 * Vercel deploy root (ADR-099) so it can't be loaded in the browser — this same-origin copy carries the values.
 * Keep the two byte-in-lockstep: scripts/entitlement-parity.check.js asserts they never drift.
 *
 * A Learn topic is Premium iff its category is a whole gated category OR its id is an explicitly gated topic:
 *   - Quant categories (whole): Commercial Math, Algebra, Modern Math, Geometry
 *   - DI (partial): Charts & Graphs + Tables & Sets  (DI Foundations stays free)
 *   - LR (partial): Critical Reasoning + Visual Reasoning  (all other LR stays free)
 *
 * Dual-exported: browser global (LearnEntitlements) + node require for the check harness.
 */
var LearnEntitlements = (function () {
  'use strict';

  var PREMIUM_CATEGORIES = ['commercial-math', 'algebra', 'modern-math', 'geometry'];
  var PREMIUM_TOPIC_IDS = [
    /* DI — Charts & Graphs + Tables & Sets (di-foundations, di-speed-math stay free) */
    'di-bar-line', 'di-pie-charts', 'di-tables-caselets', 'di-sets',
    /* LR — Critical Reasoning */
    'lr-critical-reasoning', 'lr-statement-argument', 'lr-decision-making', 'lr-cause-effect', 'lr-course-of-action',
    /* LR — Visual Reasoning */
    'lr-nonverbal-images', 'lr-figure-series'
  ];

  var _catSet = {};
  for (var i = 0; i < PREMIUM_CATEGORIES.length; i++) _catSet[PREMIUM_CATEGORIES[i]] = true;
  var _idSet = {};
  for (var j = 0; j < PREMIUM_TOPIC_IDS.length; j++) _idSet[PREMIUM_TOPIC_IDS[j]] = true;

  /**
   * Is this Learn topic Premium? Resolves the topic's category from the KnowledgeBase (browser) when available so a
   * whole gated category is caught even for topics added later; also honours the explicit topic-id list. Fails
   * SAFE: an unknown/absent topic is treated as NOT premium (so a missing-id typo can't wall off free content), but
   * the render gate additionally requires KB.has(id) before showing any page, so unknown ids fall back to the hub.
   * @param {string} topicId
   * @param {string} [categoryId] optional explicit category (avoids a KB lookup; used by the check harness)
   */
  function isPremiumLearnTopic(topicId, categoryId) {
    if (!topicId) return false;
    if (_idSet[topicId]) return true;
    var cat = categoryId;
    if (!cat && typeof KnowledgeBase !== 'undefined' && KnowledgeBase.get) {
      try { var t = KnowledgeBase.get(topicId); cat = t && t.category; } catch (_) { cat = null; }
    }
    return !!(cat && _catSet[cat]);
  }

  return {
    PREMIUM_CATEGORIES: PREMIUM_CATEGORIES,
    PREMIUM_TOPIC_IDS: PREMIUM_TOPIC_IDS,
    isPremiumLearnTopic: isPremiumLearnTopic
  };
})();

if (typeof window !== 'undefined') window.LearnEntitlements = LearnEntitlements;
if (typeof module !== 'undefined' && module.exports) module.exports = LearnEntitlements;
