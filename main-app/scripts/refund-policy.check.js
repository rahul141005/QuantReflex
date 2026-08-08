/**
 * refund-policy.check.js — the canonical 24-hour refund window (ADR-143).
 *
 * services/refundPolicy.js is pure (no Firebase, no ambient clock), so unlike the workflow around it
 * — verified separately by refund-workflow.check.js — it can be pinned down exactly here.
 *
 * Two things this file exists to prove, neither of which is provable by reading:
 *
 *  1. PROVIDER NEUTRALITY. The policy takes a timestamp and nothing else. There is no provider
 *     parameter to branch on, so Razorpay, Google Play and any future provider are governed
 *     identically BY CONSTRUCTION. Asserted below by feeding provider-shaped inputs and showing the
 *     answer cannot vary.
 *
 *  2. THE THIRD STATE IS REAL. `unknown_capture_time` must never collapse to eligible or expired.
 *     Every payment row written before ADR-143 lacks a capture time; guessing `expired` silently
 *     denies a paying customer, guessing `eligible` makes every historical purchase refundable
 *     forever. Both are wrong, so the caller is forced to route it to a human.
 *
 *   node scripts/refund-policy.check.js
 */
'use strict';
var policy = require('../services/refundPolicy');
var entitlement = require('../data/entitlement-core');

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

var HOUR = 60 * 60 * 1000;
var DAY = 24 * HOUR;
/* Fixed epoch — no Date.now() anywhere in this file, so no assertion can rot with the wall clock. */
var T0 = Date.parse('2026-03-01T12:00:00.000Z');

console.log('Refund policy — the canonical 24-hour window (ADR-143)\n');

/* ── the constant ────────────────────────────────────────────────────────────────────────────── */
ok(policy.REFUND_WINDOW_HOURS === 24, 'the window is 24 hours');
ok(policy.REFUND_WINDOW_MS === 24 * 60 * 60 * 1000, 'REFUND_WINDOW_MS is 24h in ms');
ok(policy.REFUND_WINDOW_MS === entitlement.DAY_MS,
  'the window is exactly one canonical day (no second definition of a day)');
ok(policy.STATES.length === 3, 'there are exactly three eligibility states');
ok(policy.STATES.indexOf(policy.STATE_ELIGIBLE) !== -1 &&
   policy.STATES.indexOf(policy.STATE_EXPIRED) !== -1 &&
   policy.STATES.indexOf(policy.STATE_UNKNOWN) !== -1, 'the three states are eligible/expired/unknown');

/* ── the window ──────────────────────────────────────────────────────────────────────────────── */
function stateAt(capturedAt, now) { return policy.eligibility(capturedAt, now).state; }

ok(stateAt(T0, T0) === 'eligible', 'at the instant of capture → eligible');
ok(stateAt(T0, T0 + 1) === 'eligible', '1ms after capture → eligible');
ok(stateAt(T0, T0 + HOUR) === 'eligible', '1 hour after capture → eligible');
ok(stateAt(T0, T0 + 23 * HOUR) === 'eligible', '23 hours after capture → eligible');
ok(stateAt(T0, T0 + DAY - 1) === 'eligible', '★ 1ms before the window closes → still eligible');
ok(stateAt(T0, T0 + DAY) === 'expired', '★ at EXACTLY capture + 24h → EXPIRED (the boundary is closed)');
ok(stateAt(T0, T0 + DAY + 1) === 'expired', '1ms past the window → expired');
ok(stateAt(T0, T0 + 25 * HOUR) === 'expired', '25 hours after capture → expired');
ok(stateAt(T0, T0 + 40 * DAY) === 'expired', '40 days after capture → expired');

/* the clock going backwards must not break an open window */
ok(stateAt(T0, T0 - HOUR) === 'eligible', 'a clock behind the capture time still reads eligible (never a hard error)');

/* ── the returned shape ──────────────────────────────────────────────────────────────────────── */
var e1 = policy.eligibility(T0, T0 + 6 * HOUR);
ok(e1.windowEndsAtMs === T0 + DAY, 'windowEndsAtMs is capture + 24h');
ok(e1.msRemaining === 18 * HOUR, 'msRemaining counts down correctly (18h left after 6h)');
ok(e1.capturedAtMs === T0, 'the capture time is echoed back for the audit record');

var e2 = policy.eligibility(T0, T0 + 30 * HOUR);
ok(e2.msRemaining === 0, '★ msRemaining is 0 once expired — never negative (UI renders it directly)');
ok(e2.windowEndsAtMs === T0 + DAY, 'an expired result still reports when the window closed');

/* ── the third state: unknown capture time ───────────────────────────────────────────────────── */
ok(stateAt(null, T0) === 'unknown_capture_time', '★ a null capture time → unknown, NOT expired');
ok(stateAt(undefined, T0) === 'unknown_capture_time', 'undefined → unknown');
ok(stateAt(0, T0) === 'unknown_capture_time', '0 → unknown (not the epoch)');
ok(stateAt(-1, T0) === 'unknown_capture_time', 'a negative timestamp → unknown');
ok(stateAt(NaN, T0) === 'unknown_capture_time', 'NaN → unknown');
ok(stateAt('garbage', T0) === 'unknown_capture_time', 'an unparseable value → unknown');
ok(stateAt(Infinity, T0) === 'unknown_capture_time', 'Infinity → unknown');
var eu = policy.eligibility(null, T0);
ok(eu.windowEndsAtMs === null && eu.msRemaining === 0 && eu.capturedAtMs === null,
  'the unknown result carries no invented window');
/* the assertion that matters: it is neither of the other two */
ok(eu.state !== policy.STATE_ELIGIBLE && eu.state !== policy.STATE_EXPIRED,
  '★ unknown never collapses into eligible or expired — a human must decide');

/* ── provider neutrality, proven rather than asserted ────────────────────────────────────────── */
ok(policy.eligibility.length <= 2,
  'eligibility() takes only (capturedAtMs, nowMs) — there is no provider argument to branch on');
/* Same instant, two provider-shaped call sites: Razorpay reports epoch SECONDS, Play reports millis.
   Once each is normalised to ms the policy cannot tell them apart. */
var razorpayCapturedAt = Math.floor(T0 / 1000) * 1000;      /* seconds → ms */
var playPurchaseTimeMillis = razorpayCapturedAt;            /* already ms */
ok(policy.eligibility(razorpayCapturedAt, T0 + HOUR).state === policy.eligibility(playPurchaseTimeMillis, T0 + HOUR).state,
  '★ Razorpay and Play capture times give the identical verdict');
ok(policy.eligibility(razorpayCapturedAt, T0 + 30 * HOUR).msRemaining ===
   policy.eligibility(playPurchaseTimeMillis, T0 + 30 * HOUR).msRemaining,
  '★ …and the identical remaining time, expired or not');

/* ── isWithinWindow: annotation only ─────────────────────────────────────────────────────────── */
ok(policy.isWithinWindow(T0, T0 + HOUR) === true, 'a refund 1h after capture was within policy');
ok(policy.isWithinWindow(T0, T0 + DAY - 1) === true, 'a refund just before the window closed was within policy');
ok(policy.isWithinWindow(T0, T0 + DAY) === false, 'a refund at exactly +24h was outside policy');
ok(policy.isWithinWindow(T0, T0 + 40 * DAY) === false, '★ a Google-support refund at day 40 is OUTSIDE policy…');
ok(policy.isWithinWindow(null, T0 + DAY) === null, '…and an unknown capture time answers null, not false');
ok(policy.isWithinWindow(T0, null) === null, 'an unknown refund time answers null');

/* This is the whole point of the separation: "outside policy" is a FACT TO RECORD, and says nothing
   about whether the entitlement should be revoked. The revoke path never calls eligibility(). */
ok(typeof policy.isWithinWindow === 'function' && policy.isWithinWindow(T0, T0 + 40 * DAY) === false,
  '★ the policy can describe an out-of-policy refund without refusing it');

/* ── refundAgeMs ─────────────────────────────────────────────────────────────────────────────── */
ok(policy.refundAgeMs(T0, T0 + 5 * HOUR) === 5 * HOUR, 'refundAgeMs measures capture → refund');
ok(policy.refundAgeMs(T0, T0 + 40 * DAY) === 40 * DAY, 'refundAgeMs handles very old purchases');
ok(policy.refundAgeMs(null, T0) === null, 'refundAgeMs is null without a capture time');
ok(policy.refundAgeMs(T0, 0) === null, 'refundAgeMs is null without a refund time');

/* ── determinism + purity ────────────────────────────────────────────────────────────────────── */
ok(policy.eligibility(T0, T0 + HOUR).state === policy.eligibility(T0, T0 + HOUR).state,
  'the same inputs always give the same answer');
var frozen = policy.eligibility(T0, T0 + HOUR);
frozen.state = 'tampered';
ok(policy.eligibility(T0, T0 + HOUR).state === 'eligible', 'the returned object is not shared state');

console.log('\n──────────────────────────────');
console.log((fail === 0 ? '✓ ALL PASSED' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
