/**
 * refundPolicy.js — THE canonical 24-hour refund-eligibility rule (ADR-143).
 *
 * Pure and dependency-free (no Firebase, no network, no clock unless you pass one), so the one piece
 * of arithmetic that decides whether a customer may ask for their money back can be unit-tested
 * directly and cannot drift. Same convention as services/entitlementLedger.js and
 * services/freeExplainPolicy.js.
 *
 * THE BUSINESS RULE
 *   A user may CREATE a refund request only within 24 hours of successful payment capture.
 *   Provider-neutral: Razorpay, Google Play and any future provider are governed identically.
 *
 * THE DISTINCTION THIS MODULE EXISTS TO PROTECT
 * Refund ELIGIBILITY and refund EXECUTION are different things, and merging them breaks the product
 * in a way that is expensive and silent:
 *
 *   ELIGIBILITY — "may the user ASK us for a refund?"        ← this module. Ours. 24 hours.
 *   EXECUTION   — "a refund HAS HAPPENED at the provider"    ← aiService.revokePayment. Theirs. Forever.
 *
 * Google can issue a refund through its own support long after our window closes, and a
 * voidedPurchasesNotification can arrive weeks later; Razorpay refunds can be issued from the
 * dashboard at any time. Those refunds are real — the money HAS gone back — so the entitlement they
 * bought must be revoked no matter how old the purchase is.
 *
 * Therefore `revokePayment` MUST NEVER consult this module as a gate. If a future change adds a
 * window check there, a day-40 Google refund would be silently ignored and the user would keep both
 * Premium and their money. `entitlement-invariants.check.js` asserts that guard never appears.
 *
 * Timestamps are MILLISECONDS. Parsing (Firestore Timestamp | ISO | number) is
 * entitlement-core.toMillis's job and is deliberately not duplicated here.
 */
'use strict';

var REFUND_WINDOW_HOURS = 24;
var REFUND_WINDOW_MS = REFUND_WINDOW_HOURS * 60 * 60 * 1000;

/* The three answers. Deliberately NOT a boolean: "we do not know when this was captured" is a real,
   common third case (every payment row written before ADR-143 lacks the field), and collapsing it
   into either true or false is a guess. Guessing `false` silently denies a legitimate customer whose
   purchase predates the feature; guessing `true` makes every historical purchase refundable forever.
   Both are wrong, so the caller is forced to handle a third state — which routes to human review.
   Same shape as ADR-141's `indeterminate_term`: when the data cannot be read, refuse to decide. */
var STATE_ELIGIBLE = 'eligible';
var STATE_EXPIRED = 'expired';
var STATE_UNKNOWN = 'unknown_capture_time';
var STATES = [STATE_ELIGIBLE, STATE_EXPIRED, STATE_UNKNOWN];

/**
 * May a refund request be created for a purchase captured at `capturedAtMs`?
 *
 * @param {number|null|undefined} capturedAtMs  the GATEWAY's capture time in ms. Never the grant time
 *        (`claimedAt`): a 'pending' row completed days after capture would otherwise be handed a
 *        fresh 24 hours, and a webhook that lands an hour late would quietly extend the window.
 * @param {number} [nowMs]  injectable clock; defaults to Date.now().
 * @returns {{state:string, windowEndsAtMs:(number|null), msRemaining:number, capturedAtMs:(number|null)}}
 *          `msRemaining` is 0 for every non-eligible state — never negative, so UI can render it
 *          directly without clamping.
 */
function eligibility(capturedAtMs, nowMs) {
  var now = (typeof nowMs === 'number' && isFinite(nowMs)) ? nowMs : Date.now();
  var captured = Number(capturedAtMs);

  if (!isFinite(captured) || captured <= 0) {
    return { state: STATE_UNKNOWN, windowEndsAtMs: null, msRemaining: 0, capturedAtMs: null };
  }

  var endsAt = captured + REFUND_WINDOW_MS;
  /* Strictly-less-than: at exactly capture + 24h the window is CLOSED. A boundary has to fall on one
     side, and closing it keeps "within 24 hours" literally true. */
  if (now < endsAt) {
    return { state: STATE_ELIGIBLE, windowEndsAtMs: endsAt, msRemaining: endsAt - now, capturedAtMs: captured };
  }
  return { state: STATE_EXPIRED, windowEndsAtMs: endsAt, msRemaining: 0, capturedAtMs: captured };
}

/**
 * Was a refund that happened at `refundedAtMs` inside our stated policy window?
 *
 * ANNOTATION ONLY — for the audit trail, the admin queue and out-of-policy alerting. This must never
 * be used to decide whether to revoke an entitlement: see the module header. A `false` here means
 * "the provider refunded outside our policy", which is a fact to record, not a reason to refuse.
 *
 * @returns {boolean|null} null when either timestamp is unusable (we cannot say either way).
 */
function isWithinWindow(capturedAtMs, refundedAtMs) {
  var captured = Number(capturedAtMs);
  if (!isFinite(captured) || captured <= 0) return null;
  var at = Number(refundedAtMs);
  if (!isFinite(at) || at <= 0) return null;
  return at < captured + REFUND_WINDOW_MS;
}

/** Age of a purchase at the moment it was refunded, in ms. null when either timestamp is unusable. */
function refundAgeMs(capturedAtMs, refundedAtMs) {
  var captured = Number(capturedAtMs);
  var at = Number(refundedAtMs);
  if (!isFinite(captured) || captured <= 0 || !isFinite(at) || at <= 0) return null;
  return at - captured;
}

module.exports = {
  REFUND_WINDOW_HOURS: REFUND_WINDOW_HOURS,
  REFUND_WINDOW_MS: REFUND_WINDOW_MS,
  STATE_ELIGIBLE: STATE_ELIGIBLE,
  STATE_EXPIRED: STATE_EXPIRED,
  STATE_UNKNOWN: STATE_UNKNOWN,
  STATES: STATES,
  eligibility: eligibility,
  isWithinWindow: isWithinWindow,
  refundAgeMs: refundAgeMs
};
