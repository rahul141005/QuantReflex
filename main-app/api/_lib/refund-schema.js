/**
 * refund-schema.js — the refund-request state machine + pure validation (ADR-143).
 *
 * Same shape and philosophy as api/_lib/report-schema.js, the repo's existing precedent for a
 * reviewed queue: everything here is PURE (no Firestore, no admin SDK, no I/O) so it is unit-testable
 * under Node, while the Vercel handlers do the I/O and call into here. Everything the client sends is
 * UNTRUSTED and validated/size-capped; status, identity and timestamps are assembled SERVER-SIDE and
 * never taken from the body.
 *
 * THE WORKFLOW (ADR-143). Manual by design — the app NEVER issues a refund automatically:
 *
 *   User request → Super Admin review → Provider refund → Provider confirmation → Canonical revocation
 *
 *                            ┌── approve ──> approved ──provider confirms──> refunded  (terminal)
 *   (create) ──> pending ────┤                   └──────provider fails─────> failed    (terminal)
 *                            ├── reject ───> rejected   (terminal)
 *                            └── user cancels > cancelled (terminal)
 *
 * THE INVARIANT THIS FILE EXISTS TO ENFORCE: approving a request changes NO entitlement. Approval only
 * authorises a human to go and issue the refund at the provider. The entitlement is revoked exactly
 * once, later, when the provider CONFIRMS the money moved — through aiService.revokePayment, the same
 * canonical path a Google-initiated or dashboard-initiated refund takes. Anything else would revoke
 * access for a refund that then failed at the gateway, leaving a paying customer with nothing.
 */
'use strict';

/* ── Statuses. The set is closed: an unknown status is never accepted from any input. ── */
var STATUS_PENDING = 'pending';
var STATUS_APPROVED = 'approved';
var STATUS_REJECTED = 'rejected';
var STATUS_REFUNDED = 'refunded';
var STATUS_FAILED = 'failed';
var STATUS_CANCELLED = 'cancelled';

var STATUSES = [STATUS_PENDING, STATUS_APPROVED, STATUS_REJECTED, STATUS_REFUNDED, STATUS_FAILED, STATUS_CANCELLED];

/* "Open" = still consuming admin attention, and the set that blocks a second request for the same
   payment. `approved` is OPEN, not terminal: the money has not moved yet. */
var OPEN_STATUSES = [STATUS_PENDING, STATUS_APPROVED];

/* The complete transition table. Anything not listed here is illegal, including every self-transition
   (re-approving an approved request must not re-stamp the reviewer) and every move out of a terminal
   state. Declared as data rather than as branching code so the state machine can be read at a glance
   and asserted exhaustively by refund-workflow.check.js. */
var TRANSITIONS = {
  pending:   [STATUS_APPROVED, STATUS_REJECTED, STATUS_CANCELLED],
  approved:  [STATUS_REFUNDED, STATUS_FAILED],
  rejected:  [],
  refunded:  [],
  failed:    [],
  cancelled: []
};

/* Who is allowed to drive each transition. The provider transitions are reached only from a
   signature-verified webhook, never from a user or admin request body. */
var ACTORS = {
  approved:  'admin',
  rejected:  'admin',
  cancelled: 'user',
  refunded:  'provider',
  failed:    'provider'
};

var MAX_REASON_LEN = 1000;
var MAX_NOTE_LEN = 1000;

function isValidStatus(s) { return STATUSES.indexOf(s) !== -1; }
function isOpenStatus(s) { return OPEN_STATUSES.indexOf(s) !== -1; }
function isTerminalStatus(s) { return isValidStatus(s) && TRANSITIONS[s].length === 0; }

/**
 * Is `from → to` legal, and may `actor` drive it?
 * @param {string} from current status
 * @param {string} to   requested status
 * @param {string} [actor] 'user' | 'admin' | 'provider'. Omit to check the transition alone.
 * @returns {{ok:boolean, reason:string}}
 */
function canTransition(from, to, actor) {
  if (!isValidStatus(from)) return { ok: false, reason: 'unknown_from_status' };
  if (!isValidStatus(to)) return { ok: false, reason: 'unknown_to_status' };
  if (TRANSITIONS[from].indexOf(to) === -1) {
    return { ok: false, reason: isTerminalStatus(from) ? 'already_final' : 'illegal_transition' };
  }
  if (actor && ACTORS[to] !== actor) return { ok: false, reason: 'wrong_actor' };
  return { ok: true, reason: 'ok' };
}

/** Trim + length-cap a free-text field from an untrusted body. Returns '' for anything non-string. */
function cleanText(v, max) {
  if (typeof v !== 'string') return '';
  var s = v.trim().replace(/\s+/g, ' ');
  var cap = max || MAX_REASON_LEN;
  return s.length > cap ? s.slice(0, cap) : s;
}

/**
 * Build the server-side refund-request document. Nothing here is taken from the client except the
 * user's `reason`; identity, payment facts, eligibility and status are all assembled by the caller
 * from trusted sources.
 *
 * `eligibilityAtRequest` is FROZEN at submit time on purpose: an admin reviewing the queue tomorrow
 * must see what was true when the user pressed the button, not what is true now — by then every
 * request would read "expired" and the audit trail would be worthless.
 */
function buildRequest(input) {
  var i = input || {};
  var nowMs = (typeof i.nowMs === 'number' && isFinite(i.nowMs)) ? i.nowMs : Date.now();
  var el = i.eligibility || {};
  return {
    uid: String(i.uid),
    paymentId: String(i.paymentId),
    provider: String(i.provider || 'razorpay'),
    orderId: i.orderId ? String(i.orderId) : null,
    plan: i.plan || null,
    amountPaise: (typeof i.amountPaise === 'number' && isFinite(i.amountPaise)) ? i.amountPaise : null,
    currency: i.currency ? String(i.currency).slice(0, 8) : null,
    capturedAtMs: (typeof i.capturedAtMs === 'number' && isFinite(i.capturedAtMs) && i.capturedAtMs > 0) ? i.capturedAtMs : null,
    capturedAtSource: i.capturedAtSource || 'unknown',
    eligibilityAtRequest: {
      state: el.state || 'unknown_capture_time',
      windowEndsAtMs: (typeof el.windowEndsAtMs === 'number') ? el.windowEndsAtMs : null,
      msRemaining: (typeof el.msRemaining === 'number') ? el.msRemaining : 0
    },
    /* Flagged when the capture time could not be established: the admin queue badges these, and a
       human decides rather than the policy guessing (ADR-143). */
    needsManualEligibilityReview: el.state === 'unknown_capture_time',
    reason: cleanText(i.reason, MAX_REASON_LEN),
    status: STATUS_PENDING,
    createdAtMs: nowMs,
    createdAt: new Date(nowMs).toISOString(),
    updatedAtMs: nowMs,
    reviewedBy: null,
    reviewedByEmail: null,
    reviewedAtMs: null,
    decisionNote: null,
    providerRefundId: null,
    providerConfirmedAtMs: null,
    outOfBand: false,
    history: [buildHistoryEntry(null, STATUS_PENDING, 'user', i.uid, null, nowMs)]
  };
}

/** One append-only audit row. Kept tiny — the queue reads many of these. */
function buildHistoryEntry(from, to, actor, actorId, note, nowMs) {
  var at = (typeof nowMs === 'number' && isFinite(nowMs)) ? nowMs : Date.now();
  return {
    from: from || null,
    to: to,
    actor: actor,
    actorId: actorId ? String(actorId).slice(0, 128) : null,
    note: note ? cleanText(note, MAX_NOTE_LEN) : null,
    atMs: at,
    at: new Date(at).toISOString()
  };
}

module.exports = {
  STATUS_PENDING: STATUS_PENDING,
  STATUS_APPROVED: STATUS_APPROVED,
  STATUS_REJECTED: STATUS_REJECTED,
  STATUS_REFUNDED: STATUS_REFUNDED,
  STATUS_FAILED: STATUS_FAILED,
  STATUS_CANCELLED: STATUS_CANCELLED,
  STATUSES: STATUSES,
  OPEN_STATUSES: OPEN_STATUSES,
  TRANSITIONS: TRANSITIONS,
  ACTORS: ACTORS,
  MAX_REASON_LEN: MAX_REASON_LEN,
  MAX_NOTE_LEN: MAX_NOTE_LEN,
  isValidStatus: isValidStatus,
  isOpenStatus: isOpenStatus,
  isTerminalStatus: isTerminalStatus,
  canTransition: canTransition,
  cleanText: cleanText,
  buildRequest: buildRequest,
  buildHistoryEntry: buildHistoryEntry
};
