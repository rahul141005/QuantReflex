/**
 * entitlement-core.js — THE canonical Premium entitlement implementation (ADR-117).
 *
 * Pure, dependency-free, dual-export (same pattern as data/statMath.js): the browser gets
 * `window.QR_ENTITLEMENT` via a <script> tag, Node `require()` gets the identical object.
 * `data/` and `services/` are both inside the main-app deploy root, so ONE physical file serves
 * the client AND the serverless API. `functions/` and `super-admin-app/` deploy from their own
 * roots and CANNOT require across the boundary, so they receive byte-identical generated mirrors
 * (scripts/sync-entitlement-core.js) guarded by a parity check — the same convention already used
 * for update-manager and the visual renderers.
 *
 * THE RULE (single source of truth for every reader in the product):
 *   premium ⟺ plan === 'premium' AND planExpiry parses to a real, FUTURE timestamp.
 *
 * There is NO permanent/indefinite tier. Every legitimate grant (purchase 6m/12m, admin 6m/12m,
 * finite trial) writes a finite expiry, so a `premium` doc with a null/NaN/garbage expiry is
 * illegitimate data and resolves to NOT-premium (fail-safe) rather than granting forever.
 *
 * THE WRITE RULE (single source of truth for every writer):
 *   a new grant NEVER shortens an existing active entitlement — it extends from the LATER of
 *   {now, current expiry}, regardless of how the current entitlement was obtained.
 */
(function (root) {
  'use strict';

  var DAY_MS = 24 * 60 * 60 * 1000;
  var PLAN_PREMIUM = 'premium';
  var PLAN_FREE = 'free';
  /* Device-clock rewind tolerance: if the clock is more than this far behind the newest server
     stamp on the doc, trust the server stamp instead (ADR-108). */
  var CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;
  /* Admin trials are a courtesy, not a tier — bound them so no "finite" grant becomes de-facto
     permanent (a 36500-day trial would satisfy "has an expiry" while defeating the no-permanent
     -tier rule and permanently blocking purchase via ALREADY_PREMIUM). */
  var MAX_TRIAL_DAYS = 90;

  /**
   * Tolerant timestamp parser. Faithful superset of the three parsers this replaces
   * (paywall._toMillis, aiService._toExpiryMillis, firestore-sync._toMillis).
   * EVERY unparseable / absent / nonsensical input resolves to 0 — i.e. "not a valid expiry",
   * which the rule below treats as NOT premium. Never throws.
   */
  function toMillis(value) {
    if (!value) return 0;                                  /* null, undefined, '', 0, false, NaN */
    if (typeof value === 'number') return isFinite(value) ? value : 0;   /* Infinity is not an expiry */
    if (value instanceof Date) { var dt = value.getTime(); return isNaN(dt) ? 0 : dt; }
    if (typeof value === 'string') { var p = Date.parse(value); return isNaN(p) ? 0 : p; }
    if (typeof value === 'object') {
      /* Firestore Timestamp exposes both; toMillis() is the cheaper/native one. */
      if (typeof value.toMillis === 'function') {
        try { var m = value.toMillis(); return (typeof m === 'number' && isFinite(m)) ? m : 0; } catch (_) { return 0; }
      }
      if (typeof value.toDate === 'function') {
        try { var d = value.toDate(); var t = (d && typeof d.getTime === 'function') ? d.getTime() : 0; return isNaN(t) ? 0 : t; } catch (_) { return 0; }
      }
    }
    return 0;
  }

  /**
   * Clock-safe "now". A device clock set BACKWARD must not extend access, so if it is more than
   * CLOCK_SKEW_TOLERANCE_MS behind the newest server-written stamp on the doc, snap forward to that
   * stamp. Only ever moves `now` FORWARD, so a legitimate clock is never penalised. On the server
   * this is a no-op (the clock is authoritative and never behind its own writes).
   *
   * A clock set FORWARD is deliberately NOT corrected here — it can make a live entitlement look
   * expired locally, which is safe because the client never persists that conclusion (the server
   * remains the sole writer of the expiry transition).
   */
  function clockSafeNow(user, nowMs) {
    var now = (typeof nowMs === 'number' && isFinite(nowMs)) ? nowMs : Date.now();
    if (!user) return now;
    var lastUpdateMs = Math.max(toMillis(user.planUpdatedAt), toMillis(user.updatedAt), toMillis(user.createdAt));
    if (lastUpdateMs > 0 && now < lastUpdateMs - CLOCK_SKEW_TOLERANCE_MS) return lastUpdateMs;
    return now;
  }

  /**
   * THE entitlement decision. Every gate, badge, API guard and admin surface resolves through this.
   * @param {object} user  the users/{uid} document (or an equivalent access-state projection)
   * @param {number} [nowMs] injectable clock for tests / server use
   */
  function isActivePremium(user, nowMs) {
    if (!user || user.plan !== PLAN_PREMIUM) return false;
    var expiryMs = toMillis(user.planExpiry);
    if (!(expiryMs > 0)) return false;         /* no permanent tier: absent/invalid expiry ⇒ not premium */
    return clockSafeNow(user, nowMs) <= expiryMs;
  }

  /**
   * THE grant arithmetic. Returns the ISO expiry for adding `days` of entitlement on top of
   * whatever the user already has — extending from the LATER of {now, current expiry} so a grant
   * can never shorten an active entitlement (purchase over an admin grant, bulk trial over a paid
   * term, renewal before lapse, …). An expired/absent/invalid current expiry restarts from now.
   * @throws {RangeError} on a non-positive / non-finite duration — a bad duration must fail loudly
   *         rather than silently granting nothing.
   */
  function stackExpiry(currentExpiryLike, days, nowMs) {
    var d = Number(days);
    if (!isFinite(d) || d <= 0) throw new RangeError('entitlement.stackExpiry: days must be a positive finite number, got ' + days);
    var now = (typeof nowMs === 'number' && isFinite(nowMs)) ? nowMs : Date.now();
    var current = toMillis(currentExpiryLike);
    var base = (current > now) ? current : now;
    return new Date(base + d * DAY_MS).toISOString();
  }

  /** Days remaining (ceil, never negative) — for "Trial — N days left" style copy. */
  function daysRemaining(user, nowMs) {
    var expiryMs = toMillis(user && user.planExpiry);
    if (!(expiryMs > 0)) return 0;
    var diff = expiryMs - clockSafeNow(user, nowMs);
    return diff > 0 ? Math.ceil(diff / DAY_MS) : 0;
  }

  /**
   * THE canonical revocation field-set. Returned fresh each call so callers can never mutate a
   * shared object. Callers add their own `planUpdatedAt`/`updatedAt` (the timestamp type differs
   * between the Admin SDK and the client SDK).
   */
  function revokeFields() {
    return {
      plan: PLAN_FREE,
      planType: null,
      planExpiry: null,
      planSource: null,
      isTrial: false,
      trialEnd: null
    };
  }

  /**
   * THE canonical set of ROOT user-document fields the CLIENT must never persist (ADR-130 — closing the
   * S1-ENT3 invariant by construction rather than by convention).
   *
   * Wave S1 removed the two client write paths that could downgrade a live entitlement, because a stale
   * offline cache or a forward device clock could otherwise clobber a fresh server grant — permanent,
   * silent premium loss. Removal is not enforcement: `queueUpdate()` wrote whatever field name it was
   * handed, `_replayPendingBuffer()` restores fields from USER-WRITABLE localStorage, and the Firestore
   * rules deliberately ALLOW a client plan→'free' write (they were authored while the client still
   * self-healed), so nothing downstream would have refused one either. The invariant rested entirely on
   * nobody ever writing one line.
   *
   * DERIVED from revokeFields() so a future entitlement field is denied the moment it is declared there —
   * the list can never drift from the revocation set — plus the two server-written provenance fields that
   * have no revokeFields() counterpart. Verified safe: no legitimate client path writes any of these (the
   * client's own activatePremium is memory-only); the sole exception is the brand-new-user document seed,
   * which never goes through the queue.
   */
  var SERVER_OWNED_EXTRA = ['planUpdatedAt', 'lastPaymentId'];

  function clientImmutableFields() {
    var out = [], revoked = revokeFields(), k;
    for (k in revoked) { if (Object.prototype.hasOwnProperty.call(revoked, k)) out.push(k); }
    for (var i = 0; i < SERVER_OWNED_EXTRA.length; i++) {
      if (out.indexOf(SERVER_OWNED_EXTRA[i]) === -1) out.push(SERVER_OWNED_EXTRA[i]);
    }
    return out;
  }

  /** True when `name` is a ROOT field the client may never write. Root-only on purpose: a nested
      `settings.plan` is app state, not entitlement state, and must pass through untouched. */
  function isClientImmutableField(name) {
    return clientImmutableFields().indexOf(String(name)) !== -1;
  }

  var API = {
    DAY_MS: DAY_MS,
    PLAN_PREMIUM: PLAN_PREMIUM,
    PLAN_FREE: PLAN_FREE,
    CLOCK_SKEW_TOLERANCE_MS: CLOCK_SKEW_TOLERANCE_MS,
    MAX_TRIAL_DAYS: MAX_TRIAL_DAYS,
    toMillis: toMillis,
    clockSafeNow: clockSafeNow,
    isActivePremium: isActivePremium,
    stackExpiry: stackExpiry,
    daysRemaining: daysRemaining,
    revokeFields: revokeFields,
    clientImmutableFields: clientImmutableFields,
    isClientImmutableField: isClientImmutableField
  };

  /* Dual-mode export (same pattern as data/statMath.js): <script> on the client exposes
     window.QR_ENTITLEMENT; Node require()'d on the server gets the same object. */
  root.QR_ENTITLEMENT = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }

})(typeof self !== 'undefined' ? self : this);
