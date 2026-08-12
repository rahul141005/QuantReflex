const OpenAI = require('openai');
const admin = require('firebase-admin');
const pricing = require('./aiPricing');   // SINGLE source of truth for model pricing + cost math
const freeExplainPolicy = require('./freeExplainPolicy');   // ADR-103: pure free-explain allowance decision
const entitlement = require('../data/entitlement-core');    // ADR-117: THE canonical entitlement rule + grant arithmetic
                                                            // (same physical module the browser loads as window.QR_ENTITLEMENT)
const ledger = require('./entitlementLedger');              // ADR-141: pure refund/replay algebra (WS2)
const refundPolicy = require('./refundPolicy');             // ADR-143: THE canonical 24h refund-ELIGIBILITY rule.
                                                            // Used here for ANNOTATION ONLY — never as a gate.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY not set. AI features will be unavailable.');
}

if (!admin.apps.length) {
  var firebaseConfig = { projectId: 'quant-reflex-trainer' };
  var serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountJson) {
    try {
      var serviceAccount = JSON.parse(serviceAccountJson);
      firebaseConfig.credential = admin.credential.cert(serviceAccount);
    } catch (parseErr) {
      console.error('FIREBASE_SERVICE_ACCOUNT is not valid JSON:', parseErr.message);
    }
  } else {
    console.warn('FIREBASE_SERVICE_ACCOUNT not set. Firestore and Auth will not work.');
  }
  admin.initializeApp(firebaseConfig);
}
var db = admin.firestore();

var openaiClient = null;
var AI_MODEL = 'gpt-4o-mini';

function getClient() {
  if (!openaiClient && OPENAI_API_KEY) {
    openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  }
  return openaiClient;
}

class AIServiceError extends Error {
  constructor(code, message, retryable) {
    super(message);
    this.name = 'AIServiceError';
    this.code = code;
    this.retryable = retryable || false;
  }
}

// (ADR-045) Removed an unused, drifted CATEGORY_LABELS copy here — the canonical topic map lives in
// services/quantTopics.js and is the single source of truth.

async function verifyIdToken(idToken) {
  try {
    // checkRevoked=true (ADR-072): a revoked/disabled/deleted account is rejected immediately rather than staying
    // valid until the ~1h ID-token expiry. Matches the coaching-admin pattern.
    var decoded = await admin.auth().verifyIdToken(idToken, true);
    return decoded;
  } catch (err) {
    return null;
  }
}

/**
 * Resolve a user's entitlement (v2). The ONLY server entitlement check.
 *
 *   premium ⟺ plan === 'premium' && planExpiry is a real FUTURE timestamp
 *
 * (ADR-117) The rule itself lives in `data/entitlement-core.js` — the same module the browser
 * loads — so client, server and cron can never drift. There is NO permanent tier: a null/invalid
 * expiry resolves to NOT premium and is self-healed away.
 *
 * Self-heals: a lapsed premium/trial is written back to 'free' on read, so dashboards and gates
 * stay consistent even if the sweep function lags.
 *
 * @returns {'free'|'premium'}
 */
/**
 * Resolve a user's entitlement + active session in ONE Firestore read (ADR-072). Returns
 *   { plan:'free'|'premium', premium:boolean, activeSessionId:string|null }.
 * Self-heals an expired premium/trial to 'free' on read (same as before). `resolvePlan`/`isUserPremium` are thin
 * wrappers so existing callers are unchanged; the auth middleware uses this one to also enforce single-device.
 */
async function resolveUserAuth(uid) {
  try {
    var doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return { plan: 'free', premium: false, activeSessionId: null };
    var data = doc.data();
    var activeSessionId = (typeof data.activeSessionId === 'string' && data.activeSessionId) ? data.activeSessionId : null;
    if (data.plan !== 'premium') return { plan: 'free', premium: false, activeSessionId: activeSessionId };
    var expiryMs = entitlement.toMillis(data.planExpiry);
    /* No permanent tier (ADR-115/117): active premium requires a real FUTURE expiry. The decision is
       the canonical `entitlement.isActivePremium` — byte-identical to the client's. A null/invalid
       expiry is illegitimate data and resolves to NOT-premium; both it and a genuine lapse self-heal
       to free, but only a genuine past-date expiry sends the one-time "expired" notice (a null-expiry
       doc never had a real term, so notifying "expired" would mislead). */
    if (!entitlement.isActivePremium(data)) {
      var genuineExpiry = expiryMs > 0;
      try {
        var _revoke = entitlement.revokeFields();
        _revoke.planUpdatedAt = new Date().toISOString();
        await safeUserUpdate(uid, _revoke, 'resolvePlan:expiry');
        /* ADR-117: the JWT `premium` claim is a MIRROR of the Firestore entitlement, never a source
           of truth. It was previously set true on every grant and cleared by nothing, leaving a
           permanently stale `true` that any future fast-path would wrongly trust. Clear it here, on
           the one code path every lapse funnels through. Best-effort — never blocks the resolution. */
        try { require('./claimsService').setEntitlementClaims(uid, { premium: false }); } catch (_) {}
        // ADR-066: notify the user their Premium expired — through the ONE pipeline (Inbox + best-effort push).
        // Fires exactly once, on a genuine premium→free expiry transition. Fire-and-forget so it never delays the check.
        if (genuineExpiry) {
          try {
            require('./notificationService').notify(db, admin.messaging(), {
              recipients: { uids: [uid] },
              notification: { title: 'Your Premium has expired', body: 'Renew to keep your AI Coach, Planner, Insights and Math Duels.', type: 'premium', category: 'billing', deepLink: '#settings' },
              logSegment: 'billing'
            }).catch(function () {});
          } catch (_) {}
        }
      } catch (expiryErr) {
        console.error('[aiService:resolveUserAuth] expiry self-heal failed (uid: ' + uid + '):', expiryErr.message);
      }
      return { plan: 'free', premium: false, activeSessionId: activeSessionId };
    }
    return { plan: 'premium', premium: true, activeSessionId: activeSessionId };
  } catch (err) {
    console.error('[aiService:resolveUserAuth] lookup failed (uid: ' + uid + '):', err.message);
    throw new AIServiceError('ENTITLEMENT_ERROR', 'Unable to verify access status. Please try again.', true);
  }
}

async function resolvePlan(uid) {
  return (await resolveUserAuth(uid)).plan;
}

async function isUserPremium(uid) {
  return (await resolveUserAuth(uid)).premium;
}

/**
 * Claim the single active session for a user (ADR-072). Server-only (Admin SDK) write of `activeSessionId` — a
 * client can never write this field (Firestore rules deny it), so it can't forge or steal another device's session.
 */
async function claimSession(uid, sessionId) {
  var sid = (typeof sessionId === 'string') ? sessionId.trim().slice(0, 64) : '';
  if (!uid || !sid) throw new AIServiceError('BAD_SESSION', 'A valid session id is required.', false);
  await db.collection('users').doc(uid).set({
    activeSessionId: sid,
    activeSessionAt: new Date().toISOString()
  }, { merge: true });
  return sid;
}

/* ADR-117: kept as a thin alias so any future caller lands on the canonical parser rather than
   hand-rolling a fourth one. The implementation is data/entitlement-core.js#toMillis. */
function _toExpiryMillis(value) { return entitlement.toMillis(value); }

async function safeUserUpdate(uid, data, caller) {
  if (!uid) {
    console.error('[aiService:safeUserUpdate] called without uid from ' + (caller || 'unknown'));
    return;
  }
  var payload = Object.assign({}, data);
  payload.updatedAt = new Date().toISOString();
  try {
    await db.collection('users').doc(uid).set(payload, { merge: true });

  } catch (err) {
    console.error('[aiService:safeUserUpdate] FAILED from ' + (caller || 'unknown') + ' (uid: ' + uid + '):', err.message);
    throw err;
  }
}

var PREMIUM_DURATION_DAYS = { premium_6m: 182, premium_12m: 365 };
var PREMIUM_PRICE_PAISE = { premium_6m: 29900, premium_12m: 39900 }; /* canonical plan→price (paise) — revenue accounting */

/**
 * ADR-141 (WS2): the payment-doc lifecycle. `payments/{paymentId}` is not just an idempotency lock —
 * its `status` is the ledger row that decides whether money is still owed as entitlement.
 *
 *   (absent) ──grant──> 'paid' ──refund──> 'refunded'   ← TERMINAL, never re-granted
 *        │                  └──partial──> 'partially_refunded'  (entitlement stands; flagged for review)
 *        └──RTDN/orphan──> 'pending' ──grant──> 'paid'
 *   (absent) ──refund-before-grant──> 'refunded' (tombstone)  ← the late grant then lands on TERMINAL
 *
 * A status not in this set is treated as 'paid' (defensive: an unknown future status must not silently
 * become re-grantable). */
var PAYMENT_STATUS_TERMINAL = { refunded: true, revoked: true, chargeback: true };

/** Read the gateway-reported captured amount out of the provider payload (W4). Returns null when the
    caller could not supply one — the local price map is then the recorded fallback, clearly labelled.
    ZERO counts as "no evidence", not as "captured ₹0": Razorpay's `order.amount_paid` can still read 0
    when `?action=verify` fetches the order moments after checkout, and recording that would both write
    a false amount onto the ledger row and fire a bogus mismatch alert. Neither plan is free, so a
    genuine zero capture does not exist here. */
function _reportedPaise(gateway) {
  if (!gateway) return null;
  var v = Number(gateway.amountPaise);
  return (isFinite(v) && v > 0) ? Math.round(v) : null;
}

/** Read the gateway-reported CAPTURE TIME out of the provider payload (ADR-143). This — never
    `claimedAt` — is the origin of the 24-hour refund window: a 'pending' row completed days after the
    money moved would otherwise be handed a fresh 24 hours, and a webhook landing an hour late would
    quietly extend it. Returns null when the caller has no gateway timestamp to offer. */
function _capturedAtMs(gateway) {
  if (!gateway) return null;
  var v = Number(gateway.capturedAtMs);
  return (isFinite(v) && v > 0) ? Math.round(v) : null;
}

/** Which provider took the money (ADR-145). Defaults to 'razorpay', and that default is a FACT about
    history rather than a guess: every payment row written before WS5 is a Razorpay row, because no
    other provider existed to write one. Contrast `capturedAtSource:'unknown'`, where absence is
    genuinely unknowable and must never be filled in. Only a value we recognise is accepted, so a
    malformed caller cannot invent a third provider that no refund or reconcile path knows how to
    execute against. */
var KNOWN_PROVIDERS = { razorpay: true, play: true };
function _provider(gateway) {
  var p = gateway && gateway.provider;
  return (typeof p === 'string' && KNOWN_PROVIDERS[p]) ? p : 'razorpay';
}

/**
 * Activate the single Premium plan from a verified payment (v2).
 *
 * Idempotent + replay-protected: uses payments/{paymentId} as a transactional
 * lock so one payment cannot be replayed across accounts, and records an audit
 * row. Sets the canonical plan fields; clears any trial.
 *
 * @param {string} uid
 * @param {string} planType - 'premium_6m' | 'premium_12m'
 * @param {string|number} paymentId
 * @param {string} [orderId]
 * @param {{amountPaise?:number, currency?:string}} [gateway] gateway-reported capture facts (W4).
 *        When omitted the local price map is recorded instead, tagged `amountSource:'catalog'`.
 * @returns {string} planExpiry (ISO 8601)
 * @throws {AIServiceError} PAYMENT_REPLAY — the payment belongs to another account.
 * @throws {AIServiceError} PAYMENT_REFUNDED — the payment was refunded; the grant is refused and
 *         NOTHING is written (see PAYMENT_STATUS_TERMINAL).
 */
async function activatePremium(uid, planType, paymentId, orderId, gateway) {
  var days = PREMIUM_DURATION_DAYS[planType] || 182;
  var expiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  var paymentRef = db.collection('payments').doc(String(paymentId));
  var userRef = db.collection('users').doc(uid);
  var finalExpiry = expiry;

  var reportedPaise = _reportedPaise(gateway);
  var capturedAtMs = _capturedAtMs(gateway);
  var provider = _provider(gateway);
  var expectedPaise = PREMIUM_PRICE_PAISE[planType] || 0;
  /* W4: an amount that disagrees with the catalog still gets the entitlement — the money was already
     captured, and refusing here would take payment without giving access. It is recorded and flagged
     instead, so revenue reconciliation and the fraud alert both see it. */
  var amountMismatch = (reportedPaise !== null && expectedPaise > 0 && reportedPaise !== expectedPaise);
  var outcome = 'granted';

  await db.runTransaction(async function (tx) {
    /* Firestore RETRIES this callback on contention, so every value it publishes to the enclosing
       scope must be reset here. Without this, an attempt that hit the refuse branch and then lost the
       commit race would leave `outcome` set, and the successful attempt would still throw
       PAYMENT_REFUNDED over a grant it had just written. */
    outcome = 'granted';
    finalExpiry = expiry;
    /* All reads MUST precede all writes in a Firestore transaction. */
    var paymentDoc = await tx.get(paymentRef);
    var userDoc = await tx.get(userRef);
    var ud0 = (userDoc.exists ? userDoc.data() : null) || {};
    var existing = paymentDoc.exists ? paymentDoc.data() : null;
    var completingPending = false;

    if (existing) {
      if (existing.uid !== uid) {
        console.error('[aiService:activatePremium] PAYMENT_REPLAY detected (uid: ' + uid + ', paymentId: ' + paymentId + ', existingUid: ' + existing.uid + ')');
        throw new AIServiceError('PAYMENT_REPLAY', 'Payment already used by another account.', false);
      }
      var status = existing.status || 'paid';

      /* ADR-141 (WS2, the defect this workstream exists to close): a REFUNDED payment must never grant
         again. Razorpay redelivers `payment.captured` on its own schedule, `?action=verify` has no
         recency check, and Play's RTDN stream can replay an old PURCHASED notification after a voided
         purchase — so a captured-event retry arriving after a refund was, until now, a free premium
         renewal for anyone who bought and then charged back. Refuse with ZERO writes: not even the
         user patch below, because re-writing planExpiry from `existing.expiry` would restore exactly
         the entitlement the refund removed. The refusal is raised as a typed PAYMENT_REFUNDED after
         the transaction commits (see below) so no caller can mistake it for success — but it is a
         PERMANENT state, not a transient failure, so the webhook must ack 200 rather than let the
         gateway retry it forever. */
      if (PAYMENT_STATUS_TERMINAL[status]) {
        outcome = 'refused_' + status;
        return;
      }

      if (status !== 'pending') {
        /* Same-uid replay (verify + webhook both fire, or a late Razorpay redelivery, or the user
           re-submits an old (orderId,paymentId,signature) triple — `?action=verify` has no recency
           check, so this branch is reachable indefinitely).
           ADR-117 (audit B1): this used to write `existing.expiry` UNCONDITIONALLY, which moved a
           user's entitlement BACKWARD whenever they had since gained a longer one (e.g. an admin
           12-month grant after a 6-month purchase) — the next resolveUserAuth then self-healed them
           to FREE, silently destroying paid access. A replay must be a no-op for a user who is
           already at-or-beyond the expiry this payment granted: keep the LATER of the two, and never
           downgrade planType/planSource away from a stronger existing grant. */
        var currentMs = entitlement.toMillis(ud0.planExpiry);
        var grantedMs = entitlement.toMillis(existing.expiry || expiry);
        var keepCurrent = ud0.plan === 'premium' && currentMs > grantedMs;
        finalExpiry = keepCurrent ? ud0.planExpiry : (existing.expiry || expiry);
        var replayPatch = {
          plan: 'premium',
          planExpiry: finalExpiry,
          isTrial: false,
          trialEnd: null,
          lastPaymentId: String(paymentId),
          planUpdatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        /* Preserve the provenance of a stronger existing grant (an admin grant must not be relabelled
           'purchase' by a stale webhook); otherwise record this payment as the source. */
        if (!keepCurrent) {
          replayPatch.planType = existing.plan || planType;
          replayPatch.planSource = 'purchase';
        }
        tx.set(userRef, replayPatch, { merge: true });

        /* ADR-143: back-fill the gateway capture time. `?action=verify` runs before we hold the
           payment entity, so it records no capture time; the webhook always follows and carries the
           authoritative `payment.created_at`. Applied here so the refund window gets its true origin
           rather than staying `unknown_capture_time` forever.
           STRICTLY EARLIER-ONLY. A correction may only ever move the capture time BACK, never
           forward: a late or replayed webhook that moved it forward would silently extend the
           customer's 24-hour window, which is the one direction this must never fail in. */
        if (capturedAtMs !== null) {
          var existingCaptured = Number(existing.capturedAtMs);
          var hasExisting = isFinite(existingCaptured) && existingCaptured > 0;
          if (!hasExisting || capturedAtMs < existingCaptured) {
            tx.set(paymentRef, { capturedAtMs: capturedAtMs, capturedAtSource: 'gateway' }, { merge: true });
          }
        }
        /* ADR-145: back-fill `provider` on a row written before the field existed. Only ever ADDED,
           never overwritten — a row that already names its provider is the authority. Absence is
           safely readable as 'razorpay' because Play could not have written a row before WS5. */
        if (!existing.provider) {
          tx.set(paymentRef, { provider: provider }, { merge: true });
        }
        outcome = 'replay';
        return;
      }

      /* status === 'pending': a row was reserved before the money was confirmed (a Play RTDN that
         carries no uid, an orphan reconciliation). Fall through to the normal grant — the ONLY
         difference is that the doc is merged rather than created, since tx.create would abort. */
      completingPending = true;
      outcome = 'completed_pending';
    }
    /* No-shorten renewal (ADR-107 + audit S1-ENT2): a new grant must NEVER reduce an existing active
       entitlement, regardless of how it was obtained (purchase / admin / coaching / trial). The new
       term extends from the LATER of {now, current expiry}. Previously this only stacked for
       planSource==='purchase', so a purchase landing on top of a longer admin/coaching grant
       overwrote it with a shorter now+days expiry — a paying user could lose months of access.
       (A premium doc with a null/invalid expiry is not a valid active grant under the no-permanent-
       tier rule, so it does not extend — base stays `now`.) The client + create-order block prevent a
       purchase while premium is active; this server guard is the defense-in-depth backstop.
       ADR-117: the arithmetic now lives in the canonical core (`stackExpiry`), shared by every
       writer — and it uses the tolerant `toMillis` parser rather than `Date.parse`, which returned
       NaN (silently discarding the user's remaining term) for a Firestore Timestamp or numeric
       expiry. */
    finalExpiry = entitlement.stackExpiry(
      (ud0.plan === 'premium') ? ud0.planExpiry : null,
      days
    );
    /* ADR-149 (audit G-1) — SNAPSHOT THE ENTITLEMENT THIS PAYMENT IS STACKING ON TOP OF, when that
       entitlement is not a purchase.
       The write two blocks below sets `planSource:'purchase'`. That single field is the only evidence
       that the days underneath came from somewhere else, and overwriting it is what makes a later
       refund destructive: `revokePayment` refuses to touch an entitlement whose planSource is not
       'purchase', but it reads the CURRENT value — which this write is about to replace. It then
       recomputes the expiry from the `payments` ledger alone, and `entitlementLedger` has no
       representation of an admin/coaching/trial grant, so a refund of THIS payment would revoke
       months it never sold.
       Grant time is the only moment the displaced state is still knowable, so it is recorded here, on
       the row, inside the same transaction as the grant. Rows written before this existed simply have
       no `priorGrant` and behave exactly as they did. */
    var displacedGrant = null;
    if (entitlement.isActivePremium(ud0) && ud0.planSource && ud0.planSource !== 'purchase') {
      displacedGrant = {
        planExpiry: ud0.planExpiry,
        planType: ud0.planType || null,
        planSource: ud0.planSource,
        isTrial: ud0.isTrial === true,
        trialEnd: ud0.trialEnd || null
      };
    }
    var paymentDoc2 = {
      uid: uid,
      plan: planType,
      /* W4: prefer what the GATEWAY says it captured over what our own price map says it should have
         cost. The local map is a catalog, not evidence — it drifts the moment a price changes, and a
         refund/reconciliation that trusts it would refund an amount that was never charged. */
      amount: (reportedPaise !== null) ? reportedPaise : expectedPaise,
      amountSource: (reportedPaise !== null) ? 'gateway' : 'catalog',
      /* ADR-141: the term length is recorded on the row itself so the refund replay never has to
         re-derive it from a plan id that may since have been retired from PREMIUM_DURATION_DAYS. */
      days: days,
      /* ADR-143: the gateway's capture time is the ONLY origin the refund window may use. Recorded
         separately from `claimedAt` (our grant time) because the two genuinely differ — webhook lag,
         a retried delivery, or a 'pending' row completed later. `capturedAtSource:'unknown'` means
         the refund policy must return `unknown_capture_time` and route to human review rather than
         silently falling back to `claimedAt`, which would hand out a fresh window. */
      capturedAtMs: capturedAtMs,
      capturedAtSource: (capturedAtMs !== null) ? 'gateway' : 'unknown',
      /* ADR-145: which provider took the money. Read by the refund request builder (which already
         expected this field and defaulted to 'razorpay' before anything wrote it), by the Super Admin
         review queue, and by Play reconciliation — a refund cannot be EXECUTED without knowing where
         to execute it. */
      provider: provider,
      status: 'paid',
      expiry: finalExpiry,
      claimedAt: new Date().toISOString()
    };
    if (gateway && gateway.currency) paymentDoc2.currency = String(gateway.currency).slice(0, 8);
    if (displacedGrant) paymentDoc2.priorGrant = displacedGrant;
    if (amountMismatch) { paymentDoc2.amountExpected = expectedPaise; paymentDoc2.amountMismatch = true; }
    if (orderId) paymentDoc2.orderId = String(orderId);
    if (completingPending) tx.set(paymentRef, paymentDoc2, { merge: true });
    else tx.create(paymentRef, paymentDoc2);
    tx.set(userRef, {
      plan: 'premium',
      planType: planType,
      planExpiry: finalExpiry,
      planSource: 'purchase',
      isTrial: false,
      trialEnd: null,
      lastPaymentId: String(paymentId),
      planUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  });

  if (outcome.indexOf('refused_') === 0) {
    /* Signalled as a typed error rather than a falsy return so no caller can mistake a refused grant
       for a successful one. The transaction wrote NOTHING, and the securityEvent is recorded here —
       outside the transaction — so a Firestore contention retry cannot duplicate it. Callers on the
       webhook path must ack 200 (the gateway would otherwise retry forever); the interactive verify
       path surfaces it to the user. */
    console.warn('[PaymentFlow] GRANT_REFUSED | ' + outcome + ' | uid: ' + uid + ' | paymentId: ' + paymentId);
    _recordEntitlementSecurityEvent('grant_after_refund', uid, paymentId, outcome);
    throw new AIServiceError('PAYMENT_REFUNDED', 'This payment was refunded and cannot be redeemed.', false);
  }
  if (amountMismatch) {
    console.warn('[PaymentFlow] AMOUNT_MISMATCH | uid: ' + uid + ' | paymentId: ' + paymentId +
      ' | reported: ' + reportedPaise + ' | expected: ' + expectedPaise);
    _recordEntitlementSecurityEvent('payment_amount_mismatch', uid, paymentId,
      'reported:' + reportedPaise + ' expected:' + expectedPaise);
  }

  return finalExpiry;
}

/* Best-effort, never-throwing securityEvents row for the entitlement anomalies WS2 introduces. Shaped
   like the existing payment_failure writer in api/payment/webhook.js so the Phase-5 alerting queries
   need no change. Deliberately fire-and-forget: an audit write must not fail a money-path request. */
function _recordEntitlementSecurityEvent(type, uid, paymentId, reason) {
  try {
    db.collection('securityEvents').add({
      type: String(type), app: 'main', emailHash: null,
      reason: String(reason || '').slice(0, 120),
      errorCode: null,
      paymentId: paymentId ? String(paymentId).slice(0, 128) : null,
      uid: uid ? String(uid).slice(0, 128) : null, userAgent: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }).catch(function () {});
  } catch (_) { /* non-fatal */ }
}

/**
 * Revoke the entitlement a refunded/voided payment granted (ADR-141, Phase-4 WS2 §9.4).
 *
 * The counterpart to activatePremium, and the ONE revoke path both providers use: Razorpay's
 * `refund.processed` webhook and (in PR-2) Play's `voidedPurchaseNotification` both land here.
 *
 * THREE THINGS THIS DOES THAT A NAIVE IMPLEMENTATION DOES NOT:
 *
 * 1. TOMBSTONES EVEN WHEN THERE IS NO GRANT TO REMOVE. A refund can legitimately arrive before the
 *    grant — the capture webhook is retried on the gateway's schedule and can be minutes late, and
 *    Play voids purchases that were never acknowledged. Writing `status:'refunded'` on a doc that does
 *    not exist yet means the late grant hits activatePremium's TERMINAL branch and is refused. Without
 *    the tombstone the refund is simply undone seconds later, silently.
 *
 * 2. REPLAYS THE SURVIVING LEDGER instead of subtracting days. See services/entitlementLedger.js for
 *    the counter-example — subtraction steals a whole unrelated purchase whenever the refunded term
 *    had already lapsed.
 *
 * 3. REFUSES TO TOUCH AN ENTITLEMENT IT DOES NOT OWN. If the user's `planSource` is no longer
 *    'purchase' — an admin grant, a coaching grant or a trial landed after the purchase — the doc is
 *    still tombstoned (so the money is correctly recorded as returned) but the user's fields are left
 *    exactly as they are. Recomputing them from the purchase ledger would delete a grant this refund
 *    has no authority over. The skip is logged for manual review rather than silently swallowed.
 *
 * @param {string} uid
 * @param {string|number} paymentId
 * @param {{reason?:string, refundId?:string, plan?:string}} [opts]
 * @returns {Promise<{status:string, tombstoned:boolean, revoked:boolean, planExpiry:(string|null), skipped:(string|null)}>}
 */
async function revokePayment(uid, paymentId, opts) {
  if (!uid || !paymentId) throw new AIServiceError('BAD_REQUEST', 'revokePayment requires uid and paymentId.', false);
  var o = opts || {};
  var now = Date.now();
  var nowIso = new Date(now).toISOString();
  var paymentRef = db.collection('payments').doc(String(paymentId));
  var userRef = db.collection('users').doc(uid);
  var out = { status: 'refunded', tombstoned: false, revoked: false, planExpiry: null, skipped: null, outOfPolicy: false, restoredPriorGrant: null };
  var outOfPolicy = false;

  await db.runTransaction(async function (tx) {
    /* Reset on every attempt — see the same note in activatePremium. A retried transaction must not
       inherit a `skipped` reason (or a `revoked` verdict) from an attempt that never committed. */
    out.tombstoned = false; out.revoked = false; out.planExpiry = null; out.skipped = null;
    out.restoredPriorGrant = null;
    outOfPolicy = false;
    /* All reads first. The ledger query is EQUALITY-ONLY and deliberately carries no orderBy: an
       orderBy('claimedAt') would silently DROP any historical row that predates the field, and a
       dropped row shortens a legitimate entitlement. entitlementLedger.recomputeExpiry sorts. */
    var paymentDoc = await tx.get(paymentRef);
    var userDoc = await tx.get(userRef);
    var ledgerSnap = await tx.get(
      /* ADR-149: `partially_refunded` rows belong in the replay too. A partial refund deliberately
         does NOT shorten the term — revokePayment's own status guard treats `partially_refunded` as a
         live grant it may still act on — but the ledger query excluded them, so a later FULL refund
         of a different purchase replayed a ledger that had silently dropped one. The result was the
         opposite of the stated policy: the entitlement the partial refund preserved got revoked. */
      db.collection('payments').where('uid', '==', uid).where('status', 'in', ['paid', 'partially_refunded'])
    );

    var ud0 = (userDoc.exists ? userDoc.data() : null) || {};
    var existing = paymentDoc.exists ? paymentDoc.data() : null;

    if (existing && existing.uid && existing.uid !== uid) {
      /* Refunding someone else's payment would revoke the wrong account. Refuse loudly. */
      console.error('[aiService:revokePayment] OWNER MISMATCH (uid: ' + uid + ', paymentId: ' + paymentId + ', docUid: ' + existing.uid + ')');
      throw new AIServiceError('PAYMENT_OWNER_MISMATCH', 'Payment belongs to a different account.', false);
    }

    var tomb = {
      uid: uid,
      status: 'refunded',
      refundedAt: nowIso,
      refundedAtMs: now,
      refundReason: String(o.reason || 'refund').slice(0, 120)
    };
    if (o.refundId) tomb.refundId = String(o.refundId).slice(0, 128);

    /* ADR-143 — ANNOTATION ONLY. Record whether this refund fell inside our stated 24-hour policy so
       the audit trail, the admin queue and out-of-policy alerting can see it.
       THIS IS NOT A GATE, AND MUST NEVER BECOME ONE. Google can refund through its own support long
       after our window closes, a voidedPurchasesNotification can arrive weeks later, and a Razorpay
       dashboard refund can be issued at any time. Those refunds are REAL — the money has already gone
       back — so the entitlement must be revoked however old the purchase is. A window check here
       would silently ignore a day-40 Google refund and leave the user holding both Premium and their
       money, inverting everything ADR-141 fixed. `entitlement-invariants.check.js` asserts no such
       guard ever appears in this function. */
    if (existing) {
      tomb.refundWithinPolicy = refundPolicy.isWithinWindow(existing.capturedAtMs, now);
      tomb.refundAgeMs = refundPolicy.refundAgeMs(existing.capturedAtMs, now);
      if (tomb.refundWithinPolicy === false) outOfPolicy = true;
    }
    if (!existing) {
      /* Refund-before-grant: there is no row yet, so this one is purely a tombstone. `plan`/`days` are
         recorded when the caller knows them, but the row must NEVER read as 'paid' — a tombstone that
         accidentally looked like a purchase would be replayed into the ledger as free entitlement. */
      tomb.tombstone = true;
      tomb.plan = o.plan || null;
      tomb.amount = 0;
      tomb.amountSource = 'tombstone';
      tomb.claimedAt = null;
      tomb.expiry = null;
    }
    tx.set(paymentRef, tomb, { merge: true });
    out.tombstoned = !existing;

    if (!existing) { out.skipped = 'no_grant'; return; }

    var prevStatus = existing.status || 'paid';
    if (prevStatus !== 'paid' && prevStatus !== 'partially_refunded') {
      /* Already refunded/revoked — a duplicate refund webhook. The tombstone re-write above is
         harmless and idempotent; recomputing the ledger a second time is not (the row is already
         excluded, so a second pass would be a no-op today but would compound if the ledger ever
         gained history-dependent fields). Stop here. */
      out.skipped = 'status:' + prevStatus;
      return;
    }

    if (ud0.plan !== 'premium') { out.skipped = 'not_premium'; return; }
    if (ud0.planSource !== 'purchase') {
      /* Point 3 above: an admin/coaching/trial grant now owns this entitlement. Record the refund,
         change nothing else, and surface it. */
      out.skipped = 'planSource:' + (ud0.planSource || 'unknown');
      return;
    }

    /* Replay every SURVIVING paid purchase. The refunded row is still 'paid' in this snapshot (our
       write above is not visible to our own read), so exclude it by id. */
    var entries = [];
    var indeterminate = null;
    ledgerSnap.forEach(function (d) {
      if (d.id === String(paymentId)) return;
      var v = d.data() || {};
      if (v.uid !== uid) return;                       /* defensive: query already filters */
      var pdays = Number(v.days);
      /* Rows written before ADR-141 have no `days` — recover the term from the plan id. */
      if (!isFinite(pdays) || pdays <= 0) pdays = Number(PREMIUM_DURATION_DAYS[v.plan]) || 0;
      var claimedAtMs = entitlement.toMillis(v.claimedAt);
      if (!(pdays > 0) || !(claimedAtMs > 0)) { indeterminate = indeterminate || d.id; return; }
      /* ADR-149: this row's own record of what it stacked on, so the replay credits the coverage it
         actually sold rather than restarting its term at claimedAt. */
      entries.push({ claimedAtMs: claimedAtMs, days: pdays,
                     baselineMs: entitlement.toMillis(v.priorGrant && v.priorGrant.planExpiry) });
    });

    if (indeterminate) {
      /* A surviving PAID purchase we cannot place in time or whose term we cannot determine (an
         unmappable/retired plan id, a corrupt claimedAt). entitlementLedger would drop it, and a
         dropped row makes the replay come out SHORT — i.e. it would silently take away access the
         user paid for. Refuse to recompute at all: the refund is still recorded, the entitlement is
         left alone, and a human is told. Erring toward keeping access is the only safe direction when
         the ledger is not fully readable. */
      out.skipped = 'indeterminate_term:' + indeterminate;
      return;
    }

    /* ADR-149 (audit G-1) — THE FLOOR THIS REFUND MAY NOT GO BELOW.
       The replay above reconstructs only what PURCHASES are owed. If this purchase (or an earlier
       surviving one) was stacked on top of an admin grant, a coaching grant or a trial, those days
       are invisible to the ledger and would be revoked along with the purchase — destroying an
       entitlement this refund has no authority over. `priorGrant` is the snapshot activatePremium
       took at the moment that entitlement was displaced; a row that carries none contributes no
       floor, so pre-ADR-149 rows behave exactly as before. Lapsed snapshots are ignored: they were
       already worth nothing when the refund arrived. */
    var floor = null;
    function _considerPriorGrant(row) {
      var pg = row && row.priorGrant;
      if (!pg) return;
      var ms = entitlement.toMillis(pg.planExpiry);
      if (!(ms > now)) return;
      if (!floor || ms > floor.ms) floor = { ms: ms, snap: pg };
    }
    _considerPriorGrant(existing);
    ledgerSnap.forEach(function (d) { if (d.id !== String(paymentId)) _considerPriorGrant(d.data() || {}); });

    var newExpiryMs = ledger.recomputeExpiry(entries, now);
    var replayMs = (newExpiryMs !== null && ledger.isStillPremium(newExpiryMs, now)) ? newExpiryMs : 0;
    var floorMs = floor ? floor.ms : 0;
    var owedMs = Math.max(replayMs, floorMs);
    var patch;
    if (owedMs > now) {
      /* A revoke may only ever SHORTEN. If the stored expiry is already earlier than what is owed
         (an admin trimmed it, or a legacy row is missing from the ledger), keep the stored one —
         a refund must never hand out access. */
      var curMs = entitlement.toMillis(ud0.planExpiry);
      var finalMs = (curMs > 0 && curMs < owedMs) ? curMs : owedMs;
      patch = { plan: 'premium', planExpiry: new Date(finalMs).toISOString() };
      if (floor && floorMs >= replayMs) {
        /* What survives is the displaced grant, not a purchase. Its provenance has to come back with
           it: leaving planSource:'purchase' would tell the NEXT refund that it owns days no purchase
           ever bought — which is precisely the bug this closes, one refund later. */
        patch.planType = floor.snap.planType || null;
        patch.planSource = floor.snap.planSource;
        patch.isTrial = floor.snap.isTrial === true;
        patch.trialEnd = floor.snap.trialEnd || null;
        out.restoredPriorGrant = floor.snap.planSource;
      }
      out.planExpiry = patch.planExpiry;
      out.revoked = false;
    } else {
      /* Nothing survives, or what survives has already lapsed → back to free. Note recomputeExpiry
         returning null means "revert to free", NOT "indefinite": under ADR-115 a premium doc with a
         null expiry resolves to NOT premium, so plan MUST be written to 'free' alongside it. */
      patch = entitlement.revokeFields();
      out.revoked = true;
    }
    patch.planUpdatedAt = nowIso;
    patch.updatedAt = nowIso;
    tx.set(userRef, patch, { merge: true });

    /* Server-owned audit trail (ADR-140 closed this subcollection to client writes). Same shape as the
       super-admin entitlement writer so one query reads every entitlement change, however it arose. */
    tx.set(userRef.collection('entitlementLogs').doc(), {
      type: 'payment',
      action: 'revoke',
      source: String(o.reason || 'refund').slice(0, 40),
      paymentId: String(paymentId),
      adminId: null,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      details: patch
    });
  });

  out.outOfPolicy = outOfPolicy;
  if (outOfPolicy) {
    /* Visibility, not enforcement: the revocation above already happened. Surfaced so finance can see
       provider-initiated refunds that fell outside the policy we advertise (expected for Google
       support refunds; worth a look for Razorpay dashboard ones). */
    console.warn('[PaymentFlow] REFUND_OUT_OF_POLICY | uid: ' + uid + ' | paymentId: ' + paymentId +
      ' | refunded outside the ' + refundPolicy.REFUND_WINDOW_HOURS + 'h window — entitlement revoked anyway');
    _recordEntitlementSecurityEvent('refund_out_of_policy', uid, paymentId,
      'refunded after ' + refundPolicy.REFUND_WINDOW_HOURS + 'h window');
  }

  if (out.skipped === 'no_grant') {
    /* Not an anomaly: the refund simply beat the capture webhook. The tombstone is the whole point. */
    console.info('[PaymentFlow] REFUND_TOMBSTONE | uid: ' + uid + ' | paymentId: ' + paymentId +
      ' | no grant to revoke — a late capture will now be refused');
  } else if (out.skipped) {
    console.warn('[PaymentFlow] REVOKE_SKIPPED | ' + out.skipped + ' | uid: ' + uid + ' | paymentId: ' + paymentId);
    _recordEntitlementSecurityEvent('refund_revoke_skipped', uid, paymentId, out.skipped);
  } else {
    console.info('[PaymentFlow] PREMIUM_REVOKED | uid: ' + uid + ' | paymentId: ' + paymentId +
      ' | revoked: ' + out.revoked + ' | expiry: ' + (out.planExpiry || 'none') + ' | tombstone: ' + out.tombstoned +
      (out.restoredPriorGrant ? ' | restored prior ' + out.restoredPriorGrant + ' grant' : ''));
  }

  /* Mirror the entitlement into the JWT claim. Non-fatal: Firestore is the source of truth, and a
     stale `premium:true` claim is re-checked against Firestore by every gate (ADR-117). */
  if (out.revoked) {
    try {
      var claimsService = require('./claimsService');
      await claimsService.setEntitlementClaims(uid, { premium: false });
    } catch (claimErr) {
      console.warn('[aiService:revokePayment] claim clear failed (non-fatal):', claimErr.message);
    }
  }

  return out;
}

var WP_FREE_LIMIT = 5;
var WP_PREMIUM_DAILY = 30;
/* ADR-103: free-tier lifetime allowance for the real QuanAI "Explain" feature. The value + pure grant decision
   live in the dependency-free services/freeExplainPolicy.js (single source of truth, unit-tested there). */
var FREE_EXPLAIN_LIMIT = freeExplainPolicy.FREE_EXPLAIN_LIMIT;
var MAX_QUESTION_LENGTH = 300;
/* Per-uid usage cache for display/pre-check reads only. The authoritative caps
   (consumeWordProblemQuota / consumeFreeExplain) always read fresh inside a Firestore transaction,
   so this cache can never cause an over-grant. S3-FS4: bound it on a warm serverless instance with a
   short TTL (so a stale cross-request read self-corrects) and a size cap (so it can't grow unbounded
   across many uids). */
var usageCache = {};
var usageCacheTs = {};
var USAGE_CACHE_TTL_MS = 60000;
var USAGE_CACHE_MAX = 500;

function _cacheUsage(uid, data) {
  usageCache[uid] = data;
  var now = Date.now();
  usageCacheTs[uid] = now;
  /* ADR-121 (FS4): evict entries past the TTL on every write. Eviction used to happen ONLY when the size
     cap was exceeded, so a warm instance serving fewer than USAGE_CACHE_MAX uids retained expired entries
     for the life of the instance. They were never served (the TTL is re-checked on read in _loadUsage),
     so this is memory hygiene rather than correctness — but "automatically evict stale entries" is the
     stated requirement, and an unbounded-in-time map on a long-lived serverless instance is exactly the
     shape this item exists to prevent. */
  var stale = Object.keys(usageCache);
  for (var s = 0; s < stale.length; s++) {
    var k = stale[s];
    if (k !== uid && (now - (usageCacheTs[k] || 0)) >= USAGE_CACHE_TTL_MS) {
      delete usageCache[k];
      delete usageCacheTs[k];
    }
  }
  var uids = Object.keys(usageCache);
  if (uids.length > USAGE_CACHE_MAX) {
    uids.sort(function (a, b) { return (usageCacheTs[a] || 0) - (usageCacheTs[b] || 0); });
    var evict = uids.length - USAGE_CACHE_MAX;
    for (var i = 0; i < evict; i++) { delete usageCache[uids[i]]; delete usageCacheTs[uids[i]]; }
  }
  return data;
}

async function _loadUsage(uid) {
  if (usageCache[uid] && (Date.now() - (usageCacheTs[uid] || 0) < USAGE_CACHE_TTL_MS)) return usageCache[uid];
  try {
    var doc = await db.collection('users').doc(uid).collection('usage').doc('ai').get();
    if (doc.exists) {
      return _cacheUsage(uid, _normalizeUsageDoc(doc.data()));
    }
  } catch (err) {
    console.warn('Usage read failed:', err.message);
  }
  try {
    var legacyDoc = await db.collection('users').doc(uid).collection('usage').doc('wordProblems').get();
    if (legacyDoc.exists) {
      var legacy = legacyDoc.data();
      var migrated = {
        wordProblemsUsedLifetime: legacy.wordProblemsUsedLifetime || 0,
        wordProblemsUsedToday: legacy.wordProblemsUsedToday || 0,
        wordProblemsLastDate: legacy.lastUsedDate || null,
        lastUsageDate: legacy.lastUsedDate || null,
        explanationsUsed: 0,
        freeExplanationsUsed: 0,
        insightsGeneratedDate: null
      };
      _cacheUsage(uid, migrated);
      db.collection('users').doc(uid).collection('usage').doc('ai').set(migrated, { merge: true }).catch(function (e) { console.warn('Legacy migration write failed:', e.message); });
      return migrated;
    }
  } catch (legacyErr) {
    console.warn('Legacy usage read failed:', legacyErr.message);
  }
  var fresh = {
    wordProblemsUsedLifetime: 0,
    wordProblemsUsedToday: 0,
    wordProblemsLastDate: null,
    lastUsageDate: null,
    explanationsUsed: 0,
    freeExplanationsUsed: 0,
    insightsGeneratedDate: null
  };
  return _cacheUsage(uid, fresh);
}

function _normalizeUsageDoc(data) {
  if (data.lastUsedDate && !data.lastUsageDate) {
    data.lastUsageDate = data.lastUsedDate;
  }
  if (data.lastUsedDate && !data.wordProblemsLastDate) {
    data.wordProblemsLastDate = data.lastUsedDate;
  }
  delete data.lastUsedDate;
  if (data.wordProblemsUsedLifetime === undefined) data.wordProblemsUsedLifetime = 0;
  if (data.wordProblemsUsedToday === undefined) data.wordProblemsUsedToday = 0;
  if (data.explanationsUsed === undefined) data.explanationsUsed = 0;
  if (data.freeExplanationsUsed === undefined) data.freeExplanationsUsed = 0;
  return data;
}

async function _saveUsage(uid) {
  var entry = usageCache[uid];
  if (!entry) return;
  try {
    await db.collection('users').doc(uid).collection('usage').doc('ai').set(entry, { merge: true });
  } catch (err) {
    console.error('[aiService:_saveUsage] write failed (uid: ' + uid + '):', err.message);
    throw err;
  }
}

async function trackGlobalAIUsage(metricName, count) {
  try {
    var today = new Date().toISOString().split('T')[0];
    var metricRef = db.collection('systemMetrics').doc('ai_daily_' + today);
    var updates = {};
    updates[metricName] = admin.firestore.FieldValue.increment(count || 1);
    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await metricRef.set(updates, { merge: true });
  } catch (err) {
    console.warn('[aiService:trackGlobalAIUsage] write failed:', err.message);
  }
}

/* AI telemetry (Command Center, Phase 1) — config/aiTelemetry.logRequests gates the per-request log; 60s cache. */
var _telemetryFlag = { exp: 0, logRequests: true };
async function _shouldLogRequests() {
  var now = Date.now();
  if (_telemetryFlag.exp > now) return _telemetryFlag.logRequests;
  var on = true;
  try { var c = await db.collection('config').doc('aiTelemetry').get(); if (c.exists && c.data().logRequests === false) on = false; }
  catch (_) { on = true; }
  _telemetryFlag = { exp: now + 60000, logRequests: on };
  return on;
}

/**
 * Record ONE AI request to the unified telemetry (AI Command Center). The single sink for cost/token/latency/cache/
 * error accounting — every LLM call (and every cache hit) flows through here. Never throws; telemetry must never
 * break generation. Cost is derived from aiPricing (the one pricing source).
 *
 * @param {string|null} uid
 * @param {{feature, promptId?, version?, model?, usage?:{prompt_tokens,completion_tokens}, latencyMs?, attempts?,
 *          status?:'ok'|'error'|'cache_hit', cacheHit?:boolean, errorCode?}} opts
 *
 * Writes: (a) global `systemMetrics/ai_daily_{date}` — legacy top-level totals (back-compat) PLUS nested
 * byFeature/byModel + latency/error/cache counters (all via FieldValue.increment, deep-merged, no scans);
 * (b) per-user `users/{uid}/usage/ai` (only on real billable token usage); (c) one bounded `aiRequests` doc.
 */
async function recordAiRequest(uid, opts) {
  try {
    opts = opts || {};
    var feature = String(opts.feature || 'unknown').slice(0, 24);
    var model = opts.model || pricing.DEFAULT_MODEL;
    var usage = opts.usage || {};
    var inT = usage.prompt_tokens || 0;
    var outT = usage.completion_tokens || 0;
    var cachedT = usage.cached_tokens || 0;           // OpenAI prompt-cache hit portion (billed at half)
    var cost = pricing.costOf(model, inT, outT, cachedT);
    var status = opts.status || 'ok';
    var cacheHit = !!opts.cacheHit;
    var isError = status === 'error';
    var lat = Number(opts.latencyMs) || 0;
    var inc = admin.firestore.FieldValue.increment;
    var today = new Date().toISOString().split('T')[0];

    // (a) GLOBAL daily rollup. gptCalls = billable LLM attempts (ok+error, NOT cache) — preserves legacy meaning;
    //     requests = ALL telemetry events; nested byFeature/byModel use deep-merged nested increments.
    var byFeature = {}; byFeature[feature] = {
      requests: inc(1), inTok: inc(inT), outTok: inc(outT), costUSD: inc(cost),
      errors: inc(isError ? 1 : 0), cacheHits: inc(cacheHit ? 1 : 0), latSumMs: inc(lat), latCount: inc(lat > 0 ? 1 : 0)
    };
    var byModel = {}; byModel[model] = { requests: inc(1), inTok: inc(inT), outTok: inc(outT), costUSD: inc(cost) };
    await db.collection('systemMetrics').doc('ai_daily_' + today).set({
      totalTokensInput: inc(inT), totalTokensOutput: inc(outT), estimatedCostUSD: inc(cost),
      gptCalls: inc(cacheHit ? 0 : 1), requests: inc(1), errors: inc(isError ? 1 : 0), cacheHits: inc(cacheHit ? 1 : 0),
      latSumMs: inc(lat), latCount: inc(lat > 0 ? 1 : 0),
      byFeature: byFeature, byModel: byModel,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // (b) PER-USER counters — only on real billable token usage (cache hits carry 0 tokens → skip).
    if (uid && (inT > 0 || outT > 0)) {
      await db.collection('users').doc(uid).collection('usage').doc('ai').set({
        gptTokensInput: inc(inT), gptTokensOutput: inc(outT), gptCostUSD: inc(cost), gptCalls: inc(1)
      }, { merge: true });
    }

    // (c) PER-REQUEST log (Phase-3 Explorer data, captured now) — bounded; the daily cron prunes >30d via expiresAt.
    if (await _shouldLogRequests()) {
      await db.collection('aiRequests').add({
        ts: admin.firestore.FieldValue.serverTimestamp(),
        uid: uid || null, feature: feature, model: model,
        promptId: opts.promptId || null, version: (opts.version != null ? opts.version : null),
        inTokens: inT, outTokens: outT, cachedTokens: cachedT, costUSD: cost, latencyMs: lat,
        status: status, cacheHit: cacheHit, retries: Math.max(0, (Number(opts.attempts) || 1) - 1),
        errorCode: opts.errorCode || null,
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
      });
    }
  } catch (err) {
    console.warn('[aiService:recordAiRequest] telemetry write failed:', err.message);
  }
}

/**
 * Back-compat shim — prefer recordAiRequest(). Kept so any straggler caller keeps accounting correctly.
 * `rates` is ignored: pricing is centralized in aiPricing. Records as feature 'unknown', default model.
 */
async function trackGptCost(uid, usage, opts) {
  if (!usage) return;
  var o = (opts && typeof opts === 'object' && (opts.feature || opts.model)) ? opts : {};
  return recordAiRequest(uid, {
    feature: o.feature || 'unknown', model: o.model || pricing.DEFAULT_MODEL, usage: usage,
    latencyMs: o.latencyMs, attempts: o.attempts, status: o.status || 'ok',
    cacheHit: o.cacheHit, promptId: o.promptId, version: o.version, errorCode: o.errorCode
  });
}

/**
 * Atomically consume word-problem quota (audit H2).
 *
 * Previously this did a non-transactional read-modify-write against an
 * in-memory cache, so N concurrent requests on one warm serverless instance
 * could all pass the quota gate before any write landed. This now performs
 * the limit check AND the increment inside a single Firestore transaction,
 * so the cap (WP_FREE_LIMIT lifetime / WP_PREMIUM_DAILY per day) holds under
 * concurrency. Returns the number actually granted (0 if the cap is hit).
 *
 * @returns {number} count actually consumed
 */
async function consumeWordProblemQuota(uid, isPremium, count) {
  var usageRef = db.collection('users').doc(uid).collection('usage').doc('ai');
  var now = new Date();
  var today = now.toDateString();

  var granted = await db.runTransaction(async function (tx) {
    var doc = await tx.get(usageRef);
    var data = doc.exists ? _normalizeUsageDoc(doc.data()) : {
      wordProblemsUsedLifetime: 0, wordProblemsUsedToday: 0,
      wordProblemsLastDate: null, lastUsageDate: null, explanationsUsed: 0
    };

    var allow;
    if (isPremium) {
      var lastDate = data.wordProblemsLastDate ? new Date(data.wordProblemsLastDate).toDateString() : null;
      if (lastDate !== today) data.wordProblemsUsedToday = 0;
      allow = Math.max(0, Math.min(count, WP_PREMIUM_DAILY - (data.wordProblemsUsedToday || 0)));
      data.wordProblemsUsedToday = (data.wordProblemsUsedToday || 0) + allow;
    } else {
      allow = Math.max(0, Math.min(count, WP_FREE_LIMIT - (data.wordProblemsUsedLifetime || 0)));
      data.wordProblemsUsedLifetime = (data.wordProblemsUsedLifetime || 0) + allow;
    }

    if (allow <= 0) return 0;

    data.wordProblemsLastDate = now.toISOString();
    data.lastUsageDate = now.toISOString();
    tx.set(usageRef, data, { merge: true });
    return allow;
  });

  /* Keep the in-memory cache coherent with the authoritative write */
  if (usageCache[uid]) {
    if (isPremium) usageCache[uid].wordProblemsUsedToday = (usageCache[uid].wordProblemsUsedToday || 0) + granted;
    else usageCache[uid].wordProblemsUsedLifetime = (usageCache[uid].wordProblemsUsedLifetime || 0) + granted;
    usageCache[uid].wordProblemsLastDate = now.toISOString();
    usageCache[uid].lastUsageDate = now.toISOString();
  }

  if (granted > 0) await trackGlobalAIUsage('wordProblems', granted);
  return granted;
}

/* ADR-062: refund a previously-consumed word-problem unit when generation FAILS, so a failed call never burns
   the student's quota. Transactional; clamps at 0; best-effort (never throws into the caller). */
async function refundWordProblemQuota(uid, isPremium, count) {
  count = count || 1;
  var usageRef = db.collection('users').doc(uid).collection('usage').doc('ai');
  try {
    await db.runTransaction(async function (tx) {
      var doc = await tx.get(usageRef);
      if (!doc.exists) return;
      var data = _normalizeUsageDoc(doc.data());
      if (isPremium) data.wordProblemsUsedToday = Math.max(0, (data.wordProblemsUsedToday || 0) - count);
      else data.wordProblemsUsedLifetime = Math.max(0, (data.wordProblemsUsedLifetime || 0) - count);
      tx.set(usageRef, data, { merge: true });
    });
    if (usageCache[uid]) {
      if (isPremium) usageCache[uid].wordProblemsUsedToday = Math.max(0, (usageCache[uid].wordProblemsUsedToday || 0) - count);
      else usageCache[uid].wordProblemsUsedLifetime = Math.max(0, (usageCache[uid].wordProblemsUsedLifetime || 0) - count);
    }
    await trackGlobalAIUsage('wordProblems', -count);
  } catch (e) { console.warn('[aiService] wordProblem refund failed:', e.message); }
}

/**
 * ADR-103 (field corrected ADR-106): atomically consume one free-tier AI-explanation credit.
 *
 * Free accounts get FREE_EXPLAIN_LIMIT (5) real QuanAI explanations, lifetime, counted on a DEDICATED field —
 * users/{uid}/usage/ai.freeExplanationsUsed. This is deliberately SEPARATE from `explanationsUsed` (which premium
 * users increment as unbounded telemetry via trackExplanationUsage): sharing one field meant an expired-premium user
 * who had generated >5 explanations lapsed to free and was instantly denied all 5 (ADR-106 fix). Mirrors the proven
 * consumeWordProblemQuota transaction: read + limit-check + increment in ONE Firestore transaction, so concurrent
 * taps can never over-grant past the cap. Premium users are metered elsewhere and must NEVER reach this path.
 *
 * @returns {Promise<{ ok:boolean, remaining:number }>}
 */
async function consumeFreeExplain(uid) {
  var usageRef = db.collection('users').doc(uid).collection('usage').doc('ai');
  var now = new Date();

  var result = await db.runTransaction(async function (tx) {
    var doc = await tx.get(usageRef);
    var data = doc.exists ? _normalizeUsageDoc(doc.data()) : { freeExplanationsUsed: 0 };
    var decision = freeExplainPolicy.freeExplainDecision(data.freeExplanationsUsed || 0, FREE_EXPLAIN_LIMIT);
    if (!decision.ok) return decision;
    data.freeExplanationsUsed = (data.freeExplanationsUsed || 0) + 1;
    data.lastUsageDate = now.toISOString();
    tx.set(usageRef, data, { merge: true });
    return decision;
  });

  /* Keep the in-memory cache coherent with the authoritative write. */
  if (result.ok && usageCache[uid]) {
    usageCache[uid].freeExplanationsUsed = (usageCache[uid].freeExplanationsUsed || 0) + 1;
    usageCache[uid].lastUsageDate = now.toISOString();
  }
  if (result.ok) await trackGlobalAIUsage('explanations', 1);
  return result;
}

/* ADR-103 (verification-pass follow-up): refund one free-explain credit when a consumed request ultimately delivered
   NO content — e.g. a throw before/around generation (ctxEngine.build, an unexpected exception) that surfaces as a
   500. explainBase's own generation catch returns a usable fallback envelope (content), so that path keeps the credit
   and never triggers a refund. Transactional decrement, clamps at 0, best-effort (never throws into the caller),
   cache-coherent — mirrors refundWordProblemQuota. */
async function refundFreeExplain(uid) {
  var usageRef = db.collection('users').doc(uid).collection('usage').doc('ai');
  try {
    await db.runTransaction(async function (tx) {
      var doc = await tx.get(usageRef);
      if (!doc.exists) return;
      var data = _normalizeUsageDoc(doc.data());
      data.freeExplanationsUsed = freeExplainPolicy.freeExplainRefund(data.freeExplanationsUsed || 0);
      tx.set(usageRef, data, { merge: true });
    });
    if (usageCache[uid]) usageCache[uid].freeExplanationsUsed = freeExplainPolicy.freeExplainRefund(usageCache[uid].freeExplanationsUsed || 0);
    await trackGlobalAIUsage('explanations', -1);
  } catch (e) { console.warn('[aiService] freeExplain refund failed:', e.message); }
}

/**
 * Enforce a per-user daily AI-request cap set by a super-admin (ADR-022).
 *
 * Reads `users/{uid}.aiThrottle.cap` (set via the AI Cost Center / User-360 throttle control).
 * If a positive cap is present, atomically checks+increments a daily counter on the usage doc
 * (`gptThrottleDate` / `gptThrottleCount`, reset each UTC day) and throws AI_THROTTLED once the
 * cap is reached. No throttle doc → no-op (zero added cost for the overwhelming majority of users).
 * Counts AI requests at the gate (blunt abuse-control instrument by design).
 */
async function enforceAiThrottle(uid) {
  if (!uid) return;
  var userDoc;
  try {
    userDoc = await db.collection('users').doc(uid).get();
  } catch (err) {
    console.warn('[aiService:enforceAiThrottle] user read failed (uid: ' + uid + '):', err.message);
    return; /* fail open — a glitch must not block a non-throttled user */
  }
  var thr = userDoc.exists ? userDoc.data().aiThrottle : null;
  var cap = thr && typeof thr.cap === 'number' ? thr.cap : 0;
  if (!cap || cap <= 0) return; /* not throttled */

  var usageRef = db.collection('users').doc(uid).collection('usage').doc('ai');
  var today = new Date().toISOString().split('T')[0];
  await db.runTransaction(async function (tx) {
    var doc = await tx.get(usageRef);
    var data = doc.exists ? doc.data() : {};
    var count = (data.gptThrottleDate === today) ? (data.gptThrottleCount || 0) : 0;
    if (count >= cap) {
      throw new AIServiceError('AI_THROTTLED', 'Your AI usage has been rate-limited by an administrator (' + cap + '/day). Please try again tomorrow.', false);
    }
    tx.set(usageRef, { gptThrottleDate: today, gptThrottleCount: count + 1 }, { merge: true });
  });
}

async function trackExplanationUsage(uid) {
  var entry = await _loadUsage(uid);
  entry.explanationsUsed = (entry.explanationsUsed || 0) + 1;
  entry.lastUsageDate = new Date().toISOString();
  _cacheUsage(uid, entry);
  await _saveUsage(uid);
  await trackGlobalAIUsage('explanations', 1);
}

async function trackInsightsUsage(uid) {
  var entry = await _loadUsage(uid);
  var today = new Date();
  var dateKey = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
  entry.insightsGeneratedDate = dateKey;
  entry.lastUsageDate = today.toISOString();
  _cacheUsage(uid, entry);
  await _saveUsage(uid);
  await trackGlobalAIUsage('insights', 1);
}

/* ════════════════════════════════════════════════════════════════════════════════════════
   AI BRAIN INFRA (ADR-039) — durable per-student memory + enforced cost breaker.
   Memory is the cross-feature shared brain (AI_INTERACTION_SYSTEM §4); server-authoritative,
   field-capped, client writes denied by rules. The budget breaker makes the existing cost
   telemetry load-bearing (mirrors config-flags.js: 30s-TTL, fail-open on read error).
   ════════════════════════════════════════════════════════════════════════════════════════ */

function _capStr(s, n) { return typeof s === 'string' ? s.slice(0, n) : ''; }

/** Read the durable AI memory map for a user (or null). */
async function getMemory(uid) {
  try {
    var d = await db.collection('users').doc(uid).select('aiMemory').get();
    return (d.exists && d.data().aiMemory) || null;
  } catch (e) { console.warn('[aiService:getMemory] failed (uid ' + uid + '):', e.message); return null; }
}

/**
 * Merge-patch the AI memory (server-authoritative). Accepts targeted ops so callers never overwrite
 * the whole object. All strings/arrays are capped server-side so memory can never bloat prompt cost.
 * Never throws (memory updates are best-effort, like trackGptCost).
 */
async function updateMemory(uid, patch, source) {
  if (!uid || !patch) return;
  try {
    var ref = db.collection('users').doc(uid);
    await db.runTransaction(async function (tx) {
      var doc = await tx.get(ref);
      var mem = (doc.exists && doc.data().aiMemory) || { v: 1 };
      if (patch.goal != null) mem.goal = _capStr(patch.goal, 120);
      if (patch.examName != null) mem.examName = _capStr(patch.examName, 80);
      if (patch.examDate != null) mem.examDate = _capStr(patch.examDate, 10);
      if (patch.confidence != null) mem.confidence = _capStr(patch.confidence, 12);
      if (patch.preferredDepth != null) mem.preferredDepth = _capStr(patch.preferredDepth, 12);
      if (patch.preferredStyle != null) mem.preferredStyle = _capStr(patch.preferredStyle, 12);
      if (patch.dailyMinutes != null) mem.dailyMinutes = Math.max(0, Math.min(600, parseInt(patch.dailyMinutes) || 0));
      if (patch.addWeakConcepts) {
        var set = {}; (mem.knownWeakConcepts || []).concat(patch.addWeakConcepts).forEach(function (c) { if (c) set[String(c).slice(0, 40)] = true; });
        mem.knownWeakConcepts = Object.keys(set).slice(0, 8);
      }
      if (patch.addWin) { mem.wins = (mem.wins || []); mem.wins.push(_capStr(patch.addWin, 100)); mem.wins = mem.wins.slice(-5); }
      if (patch.addExplainedTopic) {
        var s2 = {}; (mem.recentTopicsExplained || []).concat([patch.addExplainedTopic]).forEach(function (c) { if (c) s2[String(c).slice(0, 40)] = true; });
        mem.recentTopicsExplained = Object.keys(s2).slice(-8);
      }
      if (patch.timelineEntry) {
        mem.timeline = (mem.timeline || []);
        mem.timeline.push({ at: new Date().toISOString(), feature: _capStr(patch.timelineEntry.feature, 16), summary: _capStr(patch.timelineEntry.summary, 120) });
        mem.timeline = mem.timeline.slice(-12);
      }
      mem.v = 1; mem.updatedBy = source || 'system'; mem.updatedAt = new Date().toISOString();
      tx.set(ref, { aiMemory: mem }, { merge: true });
    });
  } catch (e) { console.warn('[aiService:updateMemory] failed (uid ' + uid + '):', e.message); }
}

var _budgetCache = { exp: 0, blocked: false };

/**
 * Enforced daily AI-cost breaker. config/aiBudget.monthlyBudgetUSD → a daily cap (monthly/30); compared to
 * today's systemMetrics/ai_daily_{date}.estimatedCostUSD. Over cap → throws AI_BUDGET_EXCEEDED (retryable).
 * 30s-TTL cache (≈0 cost). Fails OPEN on read error. No budget set → never blocks.
 */
async function enforceAiBudget() {
  var now = Date.now();
  if (_budgetCache.exp > now) {
    if (_budgetCache.blocked) throw new AIServiceError('AI_BUDGET_EXCEEDED', 'AI is resting for today — please try again later.', true);
    return;
  }
  var blocked = false;
  try {
    var cfg = await db.collection('config').doc('aiBudget').get();
    var monthly = cfg.exists ? (Number(cfg.data().monthlyBudgetUSD) || 0) : 0;
    if (monthly > 0) {
      var dailyCap = monthly / 30;
      var today = new Date().toISOString().split('T')[0];
      var m = await db.collection('systemMetrics').doc('ai_daily_' + today).get();
      var spent = m.exists ? (Number(m.data().estimatedCostUSD) || 0) : 0;
      if (spent >= dailyCap) blocked = true;
    }
  } catch (e) {
    _budgetCache = { exp: now + 30000, blocked: false }; /* fail open */
    return;
  }
  _budgetCache = { exp: now + 30000, blocked: blocked };
  if (blocked) throw new AIServiceError('AI_BUDGET_EXCEEDED', 'AI is resting for today — please try again later.', true);
}

module.exports = { verifyIdToken, resolvePlan, resolveUserAuth, isUserPremium, claimSession, activatePremium, revokePayment, consumeWordProblemQuota, refundWordProblemQuota, consumeFreeExplain, refundFreeExplain, FREE_EXPLAIN_LIMIT, enforceAiThrottle, trackExplanationUsage, trackInsightsUsage, trackGptCost, recordAiRequest, trackGlobalAIUsage, getMemory, updateMemory, enforceAiBudget, safeUserUpdate, AIServiceError };
