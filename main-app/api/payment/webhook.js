/**
 * POST /api/payment/webhook
 *
 * Razorpay webhook handler — processes payment events server-to-server.
 *
 * WHY THIS EXISTS:
 * The normal payment flow is:
 *   User pays → Razorpay confirms → Client calls /api/payment?action=verify → Server grants Premium
 *
 * But if the user's phone loses internet, or the browser tab closes, or the
 * Vercel function times out — the client never calls /api/payment?action=verify.
 * The user pays but never gets Premium. No recovery.
 *
 * This webhook is the SAFETY NET. Razorpay calls it directly (server-to-server)
 * regardless of what happens on the user's device. Even if /api/payment?action=verify
 * fails, this webhook will grant the entitlement.
 *
 * SECURITY:
 * - Verified via HMAC-SHA256 signature using RAZORPAY_WEBHOOK_SECRET
 * - Raw body is used for signature computation (not re-serialized JSON)
 *
 * IDEMPOTENCY:
 * - Uses payments/{paymentId} Firestore document as a lock
 * - If the document already exists, entitlement is re-applied (safe replay)
 * - Both /api/payment?action=verify AND this webhook can fire — no double-granting
 *
 * REFUNDS (ADR-141, WS2):
 * - `refund.processed` is the symmetric counterpart of `payment.captured`. Without it the grant path
 *   was one-way: money could be returned to the customer while the entitlement it bought stayed live
 *   until its natural expiry, and a redelivered `payment.captured` would then renew it indefinitely.
 * - FULL refund → aiService.revokePayment (tombstone + ledger replay).
 * - PARTIAL refund → the row is marked 'partially_refunded' and the entitlement STANDS. This is a
 *   stated policy, not an omission: there is no defensible way to convert "40% of the money back"
 *   into a number of days, and silently shortening a paying customer's term is the worse error. It is
 *   written to securityEvents so a human decides.
 */

const crypto = require('crypto');
const aiService = require('../../services/aiService');
const paymentService = require('../../services/paymentService');
const refundRequests = require('../../services/refundRequests');   // ADR-143: the ONE refund-request writer
const admin = require('firebase-admin');

/**
 * Read the raw request body as a string.
 * We MUST use the raw body for HMAC signature verification.
 * If we use JSON.stringify(req.body), key ordering may differ
 * from what Razorpay signed, causing signature mismatch.
 */
function _getRawBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on('data', function (chunk) { chunks.push(chunk); });
    req.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', function (err) { reject(err); });
  });
}

async function handler(req, res) {
  /* Only accept POST */
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  /* ── Step 1: Get raw body for signature verification ── */
  var rawBody;
  try {
    rawBody = await _getRawBody(req);
  } catch (readErr) {
    console.error('[PaymentFlow] PAYMENT_FAILED | webhook read failed: ' + readErr.message);
    return res.status(500).json({ error: 'Failed to read body' });
  }

  if (!rawBody || rawBody.length === 0) {
    console.warn('[webhook] Empty body received');
    return res.status(400).json({ error: 'Empty body' });
  }

  /* ── Step 2: Verify webhook signature ── */
  var webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[webhook] RAZORPAY_WEBHOOK_SECRET not configured in environment');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  var signature = req.headers['x-razorpay-signature'];
  if (!signature) {
    console.warn('[webhook] Missing x-razorpay-signature header');
    return res.status(401).json({ error: 'Missing signature' });
  }

  var expectedSignature;
  try {
    expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');
  } catch (hmacErr) {
    console.error('[webhook] HMAC computation failed:', hmacErr.message);
    return res.status(500).json({ error: 'Signature computation failed' });
  }

  var isValid = false;
  try {
    isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(signature, 'hex')
    );
  } catch (_) {
    isValid = false;
  }

  if (!isValid) {
    console.warn('[webhook] Invalid signature — possible tampering or wrong secret');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  /* ── Step 3: Parse the event ── */
  var body;
  try {
    body = JSON.parse(rawBody);
  } catch (parseErr) {
    console.error('[webhook] Body is not valid JSON:', parseErr.message);
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  var event = body.event;
  var payload = body.payload || {};

  console.log('[webhook] Received event:', event);

  /* ── Step 4: Handle payment.captured ── */
  if (event === 'payment.captured') {
    var payment = (payload.payment && payload.payment.entity) || {};
    var paymentId = payment.id;
    var orderId = payment.order_id;
    var notes = payment.notes || {};
    var uid = notes.uid;
    var plan = notes.plan;

    if (!paymentId || !orderId) {
      console.error('[webhook] payment.captured missing paymentId or orderId');
      return res.status(200).json({ status: 'ignored', reason: 'missing fields' });
    }

    /* Razorpay copies order notes onto the payment entity inconsistently, so if EITHER uid or plan is
       missing from payment.notes, recover BOTH from the order — the server-side source of truth.
       (Previously only `plan` had this fallback; a missing `uid` silently acked success and stranded
       the captured payment forever — audit S1-ENT7.) */
    if (!uid || !plan) {
      try {
        var order = await paymentService.fetchOrder(orderId);
        var onotes = (order && order.notes) || {};
        if (!plan) plan = onotes.plan;
        if (!uid) uid = onotes.uid;
      } catch (fetchErr) {
        /* ADR-149: this used to ack 200 — telling Razorpay "handled" for a CAPTURED payment we had
           failed to attribute. A Razorpay outage or timeout here is transient, and 200 is a permanent
           answer: the event is never redelivered, the customer is charged, and nothing is granted or
           even recorded. 500 asks for a retry, which is safe because activatePremium is idempotent on
           payments/{paymentId} — the same reasoning the refund path already applies. An orphan row is
           written first so the payment is visible to a human even if every retry fails. */
        console.error('[webhook] Could not fetch order for uid/plan recovery:', fetchErr.message);
        try {
          await admin.firestore().collection('paymentOrphans').doc(String(paymentId)).set({
            provider: 'razorpay', paymentId: String(paymentId), orderId: String(orderId),
            plan: plan || null, reason: 'order_fetch_failed', status: 'unresolved',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        } catch (orphanErr) {
          console.error('[webhook] Failed to write paymentOrphans record:', orphanErr.message);
        }
        return res.status(500).json({ error: { code: 'ORDER_LOOKUP_FAILED', retryable: true } });
      }
    }

    if (!uid) {
      /* Captured money we cannot attribute to a user. Record an orphan for manual reconciliation
         instead of silently acking success (which strands the payment). Server-only collection
         (Admin SDK bypasses rules); best-effort so the ack still returns 200 and Razorpay won't retry
         a fundamentally un-attributable event. */
      console.error('[PaymentFlow] PAYMENT_ORPHAN | webhook missing uid after order lookup | orderId: ' + orderId + ' | paymentId: ' + paymentId);
      try {
        await admin.firestore().collection('paymentOrphans').doc(String(paymentId)).set({
          provider: 'razorpay', paymentId: String(paymentId), orderId: String(orderId),
          plan: plan || null, reason: 'no_uid', status: 'unresolved',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (orphanErr) {
        console.error('[webhook] Failed to write paymentOrphans record:', orphanErr.message);
      }
      return res.status(200).json({ status: 'ok', warning: 'no uid — orphan recorded' });
    }

    /* Validate plan is known */
    var planConfig = paymentService.getPlanConfig(plan);
    if (!planConfig) {
      /* ADR-149: 200 is correct — a retry cannot make an unknown plan known — but recording nothing
         was not. Captured money against an unrecognised plan is exactly the case a human must see,
         and the sibling no-uid branch above already writes an orphan for the same reason. */
      console.error('[webhook] Unknown plan:', plan, 'orderId:', orderId);
      try {
        await admin.firestore().collection('paymentOrphans').doc(String(paymentId)).set({
          provider: 'razorpay', paymentId: String(paymentId), orderId: String(orderId),
          uid: uid || null, plan: plan || null, reason: 'unknown_plan', status: 'unresolved',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (orphanErr) {
        console.error('[webhook] Failed to write paymentOrphans record:', orphanErr.message);
      }
      return res.status(200).json({ status: 'ignored', reason: 'unknown plan' });
    }

    /* ── Step 5: Grant entitlement (idempotent) ── */
    try {
      /* v2: single Premium tier. activatePremium uses payments/{paymentId} as a
         transactional lock, so verify + webhook both firing will not double-grant,
         and a replay from another account is rejected with PAYMENT_REPLAY. */
      /* W4 (ADR-141): hand the grant the amount RAZORPAY says it captured, not our local price map.
         `payment.amount` is in paise and is the authoritative capture figure. */
      await aiService.activatePremium(uid, plan, paymentId, orderId, {
        amountPaise: Number(payment.amount),
        currency: payment.currency || 'INR',
        /* ADR-143: Razorpay reports `created_at` in EPOCH SECONDS. This is the authoritative capture
           time and therefore the origin of the 24-hour refund window. `?action=verify` cannot supply
           it (it never holds the payment entity), so this webhook is what back-fills it. */
        capturedAtMs: Number(payment.created_at) > 0 ? Number(payment.created_at) * 1000 : null
      });

      /* Set JWT custom claim so token reflects entitlement immediately */
      try {
        var claimsService = require('../../services/claimsService');
        await claimsService.setEntitlementClaims(uid, { premium: true });
      } catch (claimsErr) {
        /* Non-fatal: Firestore entitlement is the source of truth */
        console.warn('[webhook] Claims update failed (non-fatal):', claimsErr.message);
      }

      console.info('[PaymentFlow] PREMIUM_GRANTED | webhook fallback | uid: ' + uid + ' | plan: ' + plan + ' | paymentId: ' + paymentId);
      return res.status(200).json({ status: 'ok', granted: true });

    } catch (grantErr) {
      if (grantErr.code === 'PAYMENT_REPLAY') {
        /* Payment already processed — this is fine, it's idempotent */
        console.log('[webhook] Payment already processed (replay) — uid:', uid, 'paymentId:', paymentId);
        return res.status(200).json({ status: 'ok', replay: true });
      }
      if (grantErr.code === 'PAYMENT_REFUNDED') {
        /* ADR-141: a `payment.captured` redelivery arriving AFTER the refund. Nothing was granted and
           nothing will be. ACK 200 — a 500 would make Razorpay retry this forever, and the outcome
           can never change. Already recorded to securityEvents by revokePayment's counterpart. */
        console.warn('[webhook] Captured event for a refunded payment — refused. uid:', uid, 'paymentId:', paymentId);
        return res.status(200).json({ status: 'ok', refused: 'refunded' });
      }
      console.error('[PaymentFlow] PAYMENT_FAILED | webhook grant failed: ' + grantErr.message);
      /* Return 500 so Razorpay retries the webhook */
      return res.status(500).json({ error: 'Grant failed — will retry' });
    }
  }

  /* ── Step 6: Handle refund.processed (ADR-141, WS2) ── */
  if (event === 'refund.processed') {
    var refund = (payload.refund && payload.refund.entity) || {};
    var refPayment = (payload.payment && payload.payment.entity) || {};
    var refPaymentId = refund.payment_id || refPayment.id;

    if (!refPaymentId) {
      console.error('[webhook] refund.processed missing payment_id');
      return res.status(200).json({ status: 'ignored', reason: 'missing payment_id' });
    }

    /* FULL vs PARTIAL. Prefer the payment entity's running `amount_refunded` — it accounts for several
       partial refunds that together add up to the whole capture, which comparing this single refund
       against the capture would miss. Fall back to this refund's own amount when the payment entity is
       absent from the payload. If we cannot establish the capture amount at all, treat it as PARTIAL:
       the conservative direction, since a wrong "full" would strip a paying customer's access. */
    var capturedPaise = Number(refPayment.amount);
    var refundedPaise = Number(refPayment.amount_refunded);
    if (!isFinite(refundedPaise) || refundedPaise <= 0) refundedPaise = Number(refund.amount);
    var isFullRefund = isFinite(capturedPaise) && capturedPaise > 0 &&
                       isFinite(refundedPaise) && refundedPaise >= capturedPaise;

    /* Whose entitlement is this? Three sources, most-trusted first. The payments doc is checked last
       but is the only one that survives a Razorpay notes/order lookup failure, and the only one
       available for a payment made through a flow that never wrote notes. */
    var rUid = (refPayment.notes && refPayment.notes.uid) || (refund.notes && refund.notes.uid) || null;
    var rPlan = (refPayment.notes && refPayment.notes.plan) || null;
    if (!rUid && refPayment.order_id) {
      try {
        var rOrder = await paymentService.fetchOrder(refPayment.order_id);
        var rNotes = (rOrder && rOrder.notes) || {};
        rUid = rUid || rNotes.uid;
        rPlan = rPlan || rNotes.plan;
      } catch (rFetchErr) {
        console.warn('[webhook] refund order lookup failed:', rFetchErr.message);
      }
    }
    if (!rUid) {
      try {
        var pDoc = await admin.firestore().collection('payments').doc(String(refPaymentId)).get();
        if (pDoc.exists) { rUid = pDoc.data().uid || null; rPlan = rPlan || pDoc.data().plan || null; }
      } catch (pReadErr) {
        console.warn('[webhook] refund payments-doc lookup failed:', pReadErr.message);
      }
    }

    if (!rUid) {
      /* A refund we cannot attribute. Record an orphan rather than acking silently — the entitlement
         it should have revoked is still live and a human has to close the loop. Returning 200 is
         correct: retrying will not make the uid appear. */
      console.error('[PaymentFlow] REFUND_ORPHAN | cannot attribute refund | paymentId: ' + refPaymentId + ' | refundId: ' + (refund.id || 'n/a'));
      try {
        await admin.firestore().collection('paymentOrphans').doc('refund_' + String(refPaymentId)).set({
          provider: 'razorpay', paymentId: String(refPaymentId), refundId: refund.id ? String(refund.id) : null,
          plan: rPlan || null, reason: 'refund_no_uid', status: 'unresolved',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (rOrphanErr) {
        console.error('[webhook] Failed to write refund orphan:', rOrphanErr.message);
      }
      return res.status(200).json({ status: 'ok', warning: 'no uid — refund orphan recorded' });
    }

    if (!isFullRefund) {
      /* Documented policy: mark and escalate, do not revoke.
         The mark is applied ONLY to an existing row. Creating one here would invent a half-formed
         ledger entry — no `plan`, no `days`, no `claimedAt` — and a later full refund of a DIFFERENT
         payment would then replay a ledger that silently omits this purchase, shortening the user.
         (A partial refund that precedes its own capture should not be possible; if it happens, an
         orphan for a human beats a fabricated row.) */
      try {
        var partialRef = admin.firestore().collection('payments').doc(String(refPaymentId));
        var partialDoc = await partialRef.get();
        if (!partialDoc.exists) {
          console.error('[PaymentFlow] REFUND_ORPHAN | partial refund with no captured payment row | paymentId: ' + refPaymentId);
          await admin.firestore().collection('paymentOrphans').doc('refund_' + String(refPaymentId)).set({
            provider: 'razorpay', paymentId: String(refPaymentId), refundId: refund.id ? String(refund.id) : null,
            uid: String(rUid), plan: rPlan || null, reason: 'partial_refund_before_capture', status: 'unresolved',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
          return res.status(200).json({ status: 'ok', partial: true, warning: 'no captured row — orphan recorded' });
        }
        await partialRef.set({
          uid: rUid,
          status: 'partially_refunded',
          amountRefunded: isFinite(refundedPaise) ? refundedPaise : null,
          refundedAt: new Date().toISOString(),
          refundId: refund.id ? String(refund.id) : null
        }, { merge: true });
        admin.firestore().collection('securityEvents').add({
          type: 'payment_partial_refund', app: 'main', emailHash: null,
          reason: ('razorpay:partial ' + refundedPaise + '/' + capturedPaise).slice(0, 120),
          errorCode: null, paymentId: String(refPaymentId).slice(0, 128),
          uid: String(rUid).slice(0, 128), userAgent: null,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        }).catch(function () {});
      } catch (partialErr) {
        console.error('[PaymentFlow] PAYMENT_FAILED | partial-refund mark failed: ' + partialErr.message);
        return res.status(500).json({ error: 'Partial refund mark failed — will retry' });
      }
      console.warn('[PaymentFlow] PARTIAL_REFUND | uid: ' + rUid + ' | paymentId: ' + refPaymentId + ' | entitlement retained for manual review');
      return res.status(200).json({ status: 'ok', partial: true });
    }

    try {
      var revokeResult = await aiService.revokePayment(rUid, refPaymentId, {
        reason: 'razorpay_refund',
        refundId: refund.id ? String(refund.id) : undefined,
        plan: rPlan || undefined
      });
      /* ADR-143: close the refund-request loop. The entitlement is already revoked above — this only
         moves the REQUEST record to its terminal state so the admin queue and the user's status view
         agree with reality.
         A missing request is completely normal and must never be treated as an error: Google support
         refunds, Razorpay dashboard refunds and voided purchases all arrive with no request behind
         them. Those are recorded `outOfBand` and the revocation stands. Best-effort — the ack must
         not fail because a bookkeeping write did. */
      var reqOutcome = 'none';
      try {
        reqOutcome = await refundRequests.markRefunded(refPaymentId, {
          uid: rUid,
          refundId: refund.id ? String(refund.id) : null,
          amountRefundedPaise: isFinite(refundedPaise) ? refundedPaise : null
        });
      } catch (linkErr) {
        console.error('[webhook] refund-request link failed (non-fatal, entitlement already revoked):', linkErr.message);
      }

      console.info('[PaymentFlow] REFUND_PROCESSED | uid: ' + rUid + ' | paymentId: ' + refPaymentId +
        ' | revoked: ' + revokeResult.revoked + ' | skipped: ' + (revokeResult.skipped || 'none') +
        ' | request: ' + reqOutcome + ' | withinPolicy: ' + (revokeResult.outOfPolicy ? 'no' : 'yes'));
      return res.status(200).json({
        status: 'ok', revoked: revokeResult.revoked, skipped: revokeResult.skipped, request: reqOutcome
      });
    } catch (revokeErr) {
      console.error('[PaymentFlow] PAYMENT_FAILED | refund revoke failed: ' + revokeErr.message);
      /* 500 so Razorpay retries — revokePayment is idempotent, so a retry is safe. */
      return res.status(500).json({ error: 'Revoke failed — will retry' });
    }
  }

  /* ── Step 7: Handle payment.failed ── */
  if (event === 'payment.failed') {
    var failedPayment = (payload.payment && payload.payment.entity) || {};
    console.warn('[webhook] Payment failed — id:', failedPayment.id,
      'reason:', failedPayment.error_description || 'unknown',
      'code:', failedPayment.error_code || 'unknown');
    /* Capture a security event for the payment-failure-spike alert (Phase 5, ADR-018).
       This runs AFTER HMAC signature verification — it does not touch the verification path. */
    try {
      var fpUid = (failedPayment.notes && failedPayment.notes.uid) || null;
      admin.firestore().collection('securityEvents').add({
        type: 'payment_failure', app: 'main', emailHash: null,
        reason: ('razorpay:' + (failedPayment.error_code || 'failed')).slice(0, 120),
        errorCode: failedPayment.error_code ? String(failedPayment.error_code).slice(0, 60) : null,
        uid: fpUid ? String(fpUid).slice(0, 128) : null, userAgent: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      }).catch(function () {});
    } catch (_) { /* non-fatal */ }
    /* Log but don't take action — user stays on current tier */
    return res.status(200).json({ status: 'ok', event: 'payment.failed' });
  }

  /* Unknown event — acknowledge to prevent Razorpay retries */
  console.log('[webhook] Ignoring unhandled event:', event);
  return res.status(200).json({ status: 'ignored', event: event });
}

module.exports = handler;

/* Disable Vercel's automatic body parser.
   We need the raw body for accurate HMAC signature verification. */
module.exports.config = {
  api: {
    bodyParser: false
  }
};
