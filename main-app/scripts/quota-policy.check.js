/**
 * quota-policy.check.js — unit tests for the firm free daily-cap boundary decision (ADR-107, Phase 5A).
 *
 * The rule: a free user may COMPLETE their 20th question but may NOT begin #21. shouldStopForDailyQuota() is the
 * single pure decision the drill engine calls at each nextQuestion() boundary. The engine wiring (pause instead of
 * finish, session preserved, seamless upgrade resume) and the paywall resume hook are verified by contract review
 * (they need a live DOM + Razorpay) — see docs/BIBLE/DECISION_LOG.md ADR-107.
 *
 *   node scripts/quota-policy.check.js
 */
'use strict';
var QuotaPolicy = require('../js/quota-policy');
var entitlements = require('../../shared/constants/entitlements');

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

var stop = QuotaPolicy.shouldStopForDailyQuota;
var LIMIT = entitlements.FREE_TIER_LIMITS.DAILY_QUESTION_LIMIT;

console.log('Firm free daily-cap boundary (ADR-107)\n');

ok(typeof stop === 'function', 'shouldStopForDailyQuota is exported');
ok(LIMIT === 20, 'canonical DAILY_QUESTION_LIMIT is 20');

// ── the firm boundary: 19 answered → allow #20; 20 answered → refuse #21 ──
ok(stop({ isPremium: false, hasMoreInSession: true, todayAttempted: 19, limit: LIMIT }) === false,
  '19 answered → do NOT pause (the 20th is allowed to render)');
ok(stop({ isPremium: false, hasMoreInSession: true, todayAttempted: 20, limit: LIMIT }) === true,
  '20 answered → PAUSE (the 21st is refused)');
ok(stop({ isPremium: false, hasMoreInSession: true, todayAttempted: 21, limit: LIMIT }) === true,
  'over the cap → pause');

// ── premium is never capped ──
ok(stop({ isPremium: true, hasMoreInSession: true, todayAttempted: 999, limit: Infinity }) === false,
  'premium (Infinity limit) → never pauses');
ok(stop({ isPremium: true, hasMoreInSession: true, todayAttempted: 20, limit: LIMIT }) === false,
  'premium flag wins even if a finite limit is passed');

// ── only pause when the session actually has more questions queued ──
ok(stop({ isPremium: false, hasMoreInSession: false, todayAttempted: 50, limit: LIMIT }) === false,
  'no more questions in session → let finish() end it normally, do not show the quota panel');

// ── defensive input handling (a corrupt counter/limit must not falsely pause or crash) ──
ok(stop({ isPremium: false, hasMoreInSession: true, todayAttempted: -5, limit: LIMIT }) === false,
  'negative counter treated as 0 → no pause');
ok(stop({ isPremium: false, hasMoreInSession: true, todayAttempted: undefined, limit: LIMIT }) === false,
  'undefined counter treated as 0 → no pause');
ok(stop({ isPremium: false, hasMoreInSession: true, todayAttempted: 25.7, limit: LIMIT }) === true,
  'fractional over-cap counter still pauses');
ok(stop({ isPremium: false, hasMoreInSession: true, todayAttempted: 50, limit: Infinity }) === false,
  'Infinity limit (cap disabled) → never pauses');
ok(stop({ isPremium: false, hasMoreInSession: true, todayAttempted: 50, limit: 0 }) === false,
  'invalid limit (0) → never pauses (fail-open, no false lockout)');
ok(stop({ isPremium: false, hasMoreInSession: true, todayAttempted: 50 }) === false,
  'missing limit → never pauses');
ok(stop() === false && stop(null) === false, 'no args / null → never pauses (safe default)');

// ── a custom limit is honoured (proves the cap is sourced, not hard-wired) ──
ok(stop({ isPremium: false, hasMoreInSession: true, todayAttempted: 5, limit: 5 }) === true,
  'custom limit 5: 5 answered → pause');
ok(stop({ isPremium: false, hasMoreInSession: true, todayAttempted: 4, limit: 5 }) === false,
  'custom limit 5: 4 answered → no pause');

console.log('\n──────────────────────────────');
console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
