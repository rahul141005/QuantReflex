/**
 * refundRequests.js — the ONE writer for `refundRequests/{id}` (ADR-143).
 *
 * Provider-neutral by construction: nothing in here knows what Razorpay or Google Play is. A provider
 * EXECUTES a refund; eligibility and review live here, shared by all of them. A future provider adds
 * a caller, never a second copy of this workflow.
 *
 * THE WORKFLOW — manual by design; the app never issues a refund automatically:
 *   User request → Super Admin review → Provider refund → Provider confirmation → Canonical revocation
 *
 * THE INVARIANT: approving a request changes NO entitlement. Approval only authorises a human to go
 * and issue the refund at the provider. The entitlement is revoked exactly once, later, by
 * `aiService.revokePayment`, when the provider CONFIRMS the money actually moved. Revoking on
 * approval would strip access from a paying customer whose refund then failed at the gateway.
 * This module deliberately does not require aiService at all, so that coupling cannot appear by
 * accident — the dependency runs one way only.
 *
 * Every state change goes through `_transition`, which consults the single transition table in
 * api/_lib/refund-schema.js inside a Firestore transaction — so two admins clicking Approve and
 * Reject at the same moment cannot both win.
 */
'use strict';

const admin = require('firebase-admin');
const schema = require('../api/_lib/refund-schema');
const refundPolicy = require('./refundPolicy');
const entitlement = require('../data/entitlement-core');

function _db() { return admin.firestore(); }
const COLLECTION = 'refundRequests';

/**
 * The eligibility answer for one payment row. The 24-hour clock runs from the GATEWAY capture time
 * only — never `claimedAt` — so a grant that landed late cannot hand out a fresh window.
 * @returns {{state:string, windowEndsAtMs:(number|null), msRemaining:number}}
 */
function eligibilityFor(paymentData, nowMs) {
  var p = paymentData || {};
  /* toMillis tolerates Timestamp | ISO | number; a legacy row simply has nothing here, which the
     policy answers as `unknown_capture_time` rather than guessing. */
  var capturedAtMs = (typeof p.capturedAtMs === 'number' && isFinite(p.capturedAtMs) && p.capturedAtMs > 0)
    ? p.capturedAtMs
    : entitlement.toMillis(p.capturedAt);
  return refundPolicy.eligibility(capturedAtMs > 0 ? capturedAtMs : null, nowMs);
}

/** The caller's open request for a payment, if any. Open = pending | approved (money not yet moved). */
async function findOpenForPayment(uid, paymentId) {
  var snap = await _db().collection(COLLECTION)
    .where('uid', '==', uid)
    .where('paymentId', '==', String(paymentId))
    .get();
  var found = null;
  snap.forEach(function (d) {
    var v = d.data() || {};
    if (schema.isOpenStatus(v.status)) found = Object.assign({ id: d.id }, v);
  });
  return found;
}

/**
 * Create a refund request. The caller MUST have already resolved the payment row and recomputed
 * eligibility server-side — this function never trusts a client-supplied verdict.
 *
 * @throws {Error} code 'REFUND_WINDOW_EXPIRED' | 'REFUND_REQUEST_EXISTS'
 */
async function create(input) {
  var uid = String(input.uid);
  var paymentId = String(input.paymentId);
  var el = input.eligibility;

  /* THE GATE. `expired` is a hard refusal — this is the whole business rule.
     `unknown_capture_time` is deliberately NOT refused: every payment row written before ADR-143
     lacks a capture time, and silently denying a real customer because of missing historical data is
     the wrong failure. It is created, badged, and a human decides. */
  if (el.state === refundPolicy.STATE_EXPIRED) {
    var err = new Error('The 24-hour refund window for this purchase has closed.');
    err.code = 'REFUND_WINDOW_EXPIRED';
    throw err;
  }

  var existing = await findOpenForPayment(uid, paymentId);
  if (existing) {
    var dup = new Error('A refund request for this payment is already open.');
    dup.code = 'REFUND_REQUEST_EXISTS';
    dup.requestId = existing.id;
    throw dup;
  }

  var doc = schema.buildRequest(input);
  var ref = await _db().collection(COLLECTION).add(doc);
  console.info('[PaymentFlow] REFUND_REQUESTED | uid: ' + uid + ' | paymentId: ' + paymentId +
    ' | id: ' + ref.id + ' | eligibility: ' + doc.eligibilityAtRequest.state);
  return Object.assign({ id: ref.id }, doc);
}

/**
 * Move a request to `to`, transactionally, refusing anything the state machine disallows.
 * @param {{actor:string, actorId?:string, actorEmail?:string, note?:string, patch?:object}} opts
 * @returns {Promise<{id:string, from:string, to:string, doc:object}>}
 * @throws {Error} code 'REFUND_REQUEST_NOT_FOUND' | 'REFUND_TRANSITION_INVALID'
 */
async function _transition(requestId, to, opts) {
  var o = opts || {};
  var ref = _db().collection(COLLECTION).doc(String(requestId));
  var result = null;

  await _db().runTransaction(async function (tx) {
    result = null;                       /* reset per attempt — Firestore retries on contention */
    var snap = await tx.get(ref);
    if (!snap.exists) {
      var missing = new Error('Refund request not found.');
      missing.code = 'REFUND_REQUEST_NOT_FOUND';
      throw missing;
    }
    var cur = snap.data() || {};
    var from = cur.status;

    /* Read inside the transaction so a concurrent decision cannot be overwritten: whichever admin
       commits first wins, and the second gets REFUND_TRANSITION_INVALID rather than silently
       clobbering the recorded decision. */
    var verdict = schema.canTransition(from, to, o.actor);
    if (!verdict.ok) {
      var bad = new Error('Cannot move a ' + from + ' refund request to ' + to + ' (' + verdict.reason + ').');
      bad.code = 'REFUND_TRANSITION_INVALID';
      bad.reason = verdict.reason;
      bad.currentStatus = from;
      throw bad;
    }

    var nowMs = Date.now();
    var patch = Object.assign({}, o.patch || {}, {
      status: to,
      updatedAtMs: nowMs,
      history: admin.firestore.FieldValue.arrayUnion(
        schema.buildHistoryEntry(from, to, o.actor, o.actorId, o.note, nowMs)
      )
    });
    if (o.actor === 'admin') {
      patch.reviewedBy = o.actorId || null;
      patch.reviewedByEmail = o.actorEmail || null;
      patch.reviewedAtMs = nowMs;
      patch.decisionNote = o.note ? schema.cleanText(o.note, schema.MAX_NOTE_LEN) : null;
    }
    tx.set(ref, patch, { merge: true });
    result = { id: String(requestId), from: from, to: to, doc: Object.assign({}, cur, patch) };
  });

  return result;
}

/**
 * Admin approves. Deliberately writes NO entitlement change — see the module header. All this does is
 * authorise a human to go and issue the refund at the provider; the entitlement is revoked later,
 * when the provider confirms.
 */
function approve(requestId, adminUid, adminEmail, note) {
  return _transition(requestId, schema.STATUS_APPROVED, {
    actor: 'admin', actorId: adminUid, actorEmail: adminEmail, note: note
  });
}

/** Admin rejects. Entitlement is untouched by definition — nothing was ever revoked. */
function reject(requestId, adminUid, adminEmail, note) {
  return _transition(requestId, schema.STATUS_REJECTED, {
    actor: 'admin', actorId: adminUid, actorEmail: adminEmail, note: note
  });
}

/** The user withdraws their own still-pending request. */
function cancel(requestId, uid) {
  return _transition(requestId, schema.STATUS_CANCELLED, { actor: 'user', actorId: uid });
}

/** The provider reported the refund could not be completed. Entitlement stays exactly as it is. */
function markFailed(requestId, note) {
  return _transition(requestId, schema.STATUS_FAILED, { actor: 'provider', note: note || null });
}

/**
 * The provider CONFIRMED the money moved. Called from the refund webhook AFTER
 * `aiService.revokePayment` has already run — this is bookkeeping, not enforcement.
 *
 * Returns a short outcome string rather than throwing, because the webhook must ack 200 regardless:
 *   'none'         — no request existed (Google support / dashboard / voided purchase). Expected.
 *   'refunded'     — an open request was closed.
 *   'already:<st>' — the request was already terminal (duplicate webhook delivery). Idempotent.
 */
async function markRefunded(paymentId, opts) {
  var o = opts || {};
  var q = _db().collection(COLLECTION).where('paymentId', '==', String(paymentId));
  if (o.uid) q = q.where('uid', '==', String(o.uid));
  var snap = await q.get();

  var target = null, terminalSeen = null;
  snap.forEach(function (d) {
    var v = d.data() || {};
    if (schema.isOpenStatus(v.status)) { if (!target) target = d.id; }
    else if (!terminalSeen) terminalSeen = v.status;
  });

  if (!target) return terminalSeen ? ('already:' + terminalSeen) : 'none';

  try {
    await _transition(target, schema.STATUS_REFUNDED, {
      actor: 'provider',
      note: o.refundId ? ('provider refund ' + o.refundId) : 'provider confirmed refund',
      patch: {
        providerRefundId: o.refundId || null,
        providerConfirmedAtMs: Date.now(),
        amountRefundedPaise: (typeof o.amountRefundedPaise === 'number') ? o.amountRefundedPaise : null
      }
    });
    return 'refunded';
  } catch (e) {
    /* A still-PENDING request when the provider refunds is legal in reality but not a legal single
       transition (pending → refunded is deliberately absent so a refund normally passes through
       review). It happens when Google or the Razorpay dashboard refunds before anyone reviewed the
       request. Record it honestly as an auto-approval followed by the confirmation, flagged
       `outOfBand`, rather than silently dropping the linkage. */
    if (e.code === 'REFUND_TRANSITION_INVALID' && e.currentStatus === schema.STATUS_PENDING) {
      await _transition(target, schema.STATUS_APPROVED, {
        actor: 'admin', actorId: null, actorEmail: null,
        note: 'auto-approved: the provider refunded before review'
      });
      await _transition(target, schema.STATUS_REFUNDED, {
        actor: 'provider', note: 'provider confirmed refund',
        patch: { providerRefundId: o.refundId || null, providerConfirmedAtMs: Date.now(), outOfBand: true }
      });
      return 'refunded';
    }
    throw e;
  }
}

module.exports = {
  COLLECTION: COLLECTION,
  eligibilityFor: eligibilityFor,
  findOpenForPayment: findOpenForPayment,
  create: create,
  approve: approve,
  reject: reject,
  cancel: cancel,
  markFailed: markFailed,
  markRefunded: markRefunded
};
