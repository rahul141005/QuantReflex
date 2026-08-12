/**
 * entitlementLedger.js — the pure purchase-ledger algebra (ADR-141, Phase-4 WS2 §9.4).
 *
 * Dependency-free in the sense that matters (no Firebase, no network, no clock unless you pass one), so
 * the arithmetic that decides how much Premium a user is owed can be unit-tested directly and stays the
 * single source of truth. `aiService.revokePayment` wraps this in a Firestore transaction; the webhook's
 * refund path and Play's voided-purchase path both reach it through that one wrapper.
 *
 * Repo precedent: services/freeExplainPolicy.js.
 *
 * WHY A REPLAY AND NOT A SUBTRACTION
 * The obvious way to undo a refunded purchase is to subtract its days from `planExpiry`. That is wrong,
 * and wrong in the direction that silently steals paid access. Counter-example, using real durations:
 *
 *   P1  bought 1 Jan, 182 days  → covers 1 Jan … 2 Jul
 *   P2  bought 1 Oct (P1 long lapsed), 182 days → covers 1 Oct … 1 Apr
 *   planExpiry today = 1 Apr
 *
 *   Refund P1. Naive subtraction: 1 Apr − 182 = 1 Oct — the user loses the ENTIRE second purchase they
 *   still legitimately own. Correct answer: P1 contributed nothing to the current expiry (it had already
 *   lapsed when P2 was bought), so the expiry must stay 1 Apr.
 *
 * The only way to get that right in general is to discard the refunded row and REPLAY what remains:
 *
 *   running = 0
 *   for each surviving 'paid' purchase, oldest claimedAt first:
 *       running = max(claimedAt, running) + days
 *
 * `max(claimedAt, running)` is the whole trick: a purchase made while the previous term was still alive
 * stacks on top of it; one made after a lapse restarts from its own purchase date. This is the same
 * never-shorten rule `entitlement-core.stackExpiry` applies at grant time, run over history.
 *
 * Timestamps arrive as MILLISECONDS. Parsing (Firestore Timestamp | ISO | number | {_seconds}) is the
 * canonical core's job — `entitlement-core.toMillis` — and is deliberately NOT duplicated here.
 */
'use strict';

var DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One step of the replay: where does a term bought at `claimedAtMs` end, given everything before it?
 * @param {number} claimedAtMs  when this purchase was claimed
 * @param {number} runningMs    the expiry accumulated by all earlier surviving purchases (0 if none)
 * @param {number} days         this purchase's duration
 * @returns {number} the new running expiry, in ms
 * @throws {RangeError} on a non-positive / non-finite duration — a bad duration must fail loudly rather
 *         than silently contribute nothing (mirrors entitlement-core.stackExpiry).
 */
function stackFrom(claimedAtMs, runningMs, days) {
  var d = Number(days);
  if (!isFinite(d) || d <= 0) {
    throw new RangeError('entitlementLedger.stackFrom: days must be a positive finite number, got ' + days);
  }
  var claimed = Number(claimedAtMs);
  var running = Number(runningMs);
  if (!isFinite(claimed) || claimed <= 0) claimed = 0;
  if (!isFinite(running) || running <= 0) running = 0;
  return Math.max(claimed, running) + d * DAY_MS;
}

/**
 * Replay the surviving ledger to the expiry the user is actually owed.
 *
 * @param {Array<{claimedAtMs:number, days:number}>} entries  surviving 'paid' purchases. Order does not
 *        matter — they are sorted here, so a caller cannot break the algebra by querying without an
 *        orderBy (which is exactly what happens when a composite index is missing).
 * @param {number} [nowMs]  unused by the arithmetic; accepted so callers can pass a frozen clock in
 *        tests without the signature changing later.
 * @returns {number|null}  the recomputed expiry in ms, or null when nothing survives — null means
 *          "revert to free", NOT "indefinite". A premium doc with a null expiry resolves to NOT premium
 *          (ADR-115, no permanent tier), so the caller must write plan:'free' alongside it.
 */
function recomputeExpiry(entries, nowMs) {
  if (!entries || !entries.length) return null;
  var rows = [];
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    if (!e) continue;
    var c = Number(e.claimedAtMs);
    var d = Number(e.days);
    /* A row we cannot place in time or whose duration is nonsense is dropped rather than guessed at:
       silently inventing a claimedAt would let a corrupt row extend a real entitlement. */
    if (!isFinite(c) || c <= 0 || !isFinite(d) || d <= 0) continue;
    /* ADR-149: a purchase made while a NON-purchase grant was live did not start its term at
       `claimedAt` — it stacked on top of that grant, and the customer was sold coverage ABOVE it.
       `baselineMs` is that grant's expiry, recorded on the payment row at grant time (`priorGrant`).
       It only ever moves a row's start FORWARD, and only for rows that actually carry the evidence,
       so a ledger of ordinary purchases replays exactly as it always did. Without it the replay
       under-counts such a purchase by however long the underlying grant had left — i.e. it silently
       takes away access the customer paid for. */
    var b = Number(e.baselineMs);
    rows.push({ claimedAtMs: c, days: d, baselineMs: (isFinite(b) && b > 0) ? b : 0 });
  }
  if (!rows.length) return null;
  rows.sort(function (a, b) { return a.claimedAtMs - b.claimedAtMs; });

  var running = 0;
  for (var j = 0; j < rows.length; j++) {
    running = stackFrom(Math.max(rows[j].claimedAtMs, rows[j].baselineMs), running, rows[j].days);
  }
  return running;
}

/**
 * Does the recomputed ledger still leave the user premium at `nowMs`?
 * Convenience for the revoke path, which must choose between writing a shorter expiry and reverting to
 * free. Kept here so the "expired ⇒ free" boundary is decided by the same module that computed it.
 */
function isStillPremium(expiryMs, nowMs) {
  var e = Number(expiryMs);
  var n = (typeof nowMs === 'number' && isFinite(nowMs)) ? nowMs : Date.now();
  return isFinite(e) && e > 0 && e > n;
}

module.exports = {
  DAY_MS: DAY_MS,
  stackFrom: stackFrom,
  recomputeExpiry: recomputeExpiry,
  isStillPremium: isStillPremium
};
