/**
 * quota-policy.js — the pure "should this free session pause for the daily cap?" decision (ADR-107, Phase 5A).
 *
 * The firm 20/day rule: a free user may COMPLETE their 20th question but may NOT begin #21. The drill engine
 * advances one question at a time through nextQuestion(); this module answers the single boundary question at that
 * point — "given the counter after the just-answered question, do we pause before rendering the next slot?" —
 * without touching scoring, session state, or the DOM, so it is unit-testable in isolation.
 *
 * Contract:
 *   - Premium never pauses (unlimited).
 *   - We only pause when the session actually HAS more questions queued (hasMoreInSession); an exhausted deck
 *     ends normally through finish(), not the quota panel.
 *   - The counter (todayAttempted) already includes the question the user just answered, so `>= limit` is the
 *     firm boundary: 20 answered ⇒ the 21st is refused.
 */

var QuotaPolicy = (function () {
  'use strict';

  /**
   * @param {Object} args
   * @param {boolean} args.isPremium         current premium entitlement (from hasPremiumAccess())
   * @param {boolean} args.hasMoreInSession  true when the session still has an un-rendered question queued
   * @param {number}  args.todayAttempted    questions answered today (already includes the one just answered)
   * @param {number}  args.limit             the free daily cap (Infinity for premium / disabled)
   * @returns {boolean}  true ⇒ pause the session with the quota-reached flow instead of rendering the next question
   */
  function shouldStopForDailyQuota(args) {
    var a = args || {};
    if (a.isPremium) return false;
    if (!a.hasMoreInSession) return false;
    var limit = a.limit;
    if (typeof limit !== 'number' || !isFinite(limit) || limit <= 0) return false;
    var attempted = (typeof a.todayAttempted === 'number' && a.todayAttempted > 0) ? a.todayAttempted : 0;
    return attempted >= limit;
  }

  return { shouldStopForDailyQuota: shouldStopForDailyQuota };
})();

/* Dual export: browser global (var QuotaPolicy) + node require for the check harness. The IIFE touches no DOM at
   load, so requiring it under node is safe. */
if (typeof module !== 'undefined' && module.exports) module.exports = QuotaPolicy;
