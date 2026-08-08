/**
 * Payment domain API (ADR-017) — consolidates payment/create-order + payment/verify into ONE
 * serverless function. withAuth (JWT + entitlement). Both actions are POST.
 *   POST ?action=create-order        → create a Razorpay order
 *   POST ?action=verify              → verify the signature + activate the plan
 *   POST ?action=refund-eligibility  → (ADR-143) may this user request a refund, and until when?
 *   POST ?action=refund-request      → (ADR-143) create a refund request (never issues a refund)
 *   POST ?action=refund-cancel       → (ADR-143) withdraw one's own pending request
 *
 * The refund actions live HERE rather than in their own function on purpose: main-app is at 10 of the
 * 12 Vercel Hobby functions, and WS6's Play RTDN endpoint still needs #11. Folding related actions
 * into an existing domain function is the same pattern ADR-017 used for create-order/verify.
 *
 * NOTE: payment/webhook.js stays a SEPARATE function (HMAC verification + `bodyParser:false`).
 * Its path remains /api/payment/webhook so the Razorpay dashboard needs no reconfiguration.
 */

const { withAuth, methodGuard } = require('./_lib/middleware');
const aiService = require('../services/aiService');
const paymentService = require('../services/paymentService');
const refundRequests = require('../services/refundRequests');   // ADR-143
const refundPolicy = require('../services/refundPolicy');       // ADR-143: THE 24h rule
const { setEntitlementClaims } = require('../services/claimsService');
const admin = require('firebase-admin');
const { isEnabled } = require('./_lib/config-flags');

/* Best-effort server-side security event for the payment-failure-spike alert (Phase 5, ADR-018).
   Admin SDK bypasses Firestore rules. Fire-and-forget — never blocks the payment path. */
function _recordPaymentFailure(reason, uid) {
  try {
    admin.firestore().collection('securityEvents').add({
      type: 'payment_failure', app: 'main', emailHash: null,
      reason: reason ? String(reason).slice(0, 120) : null, errorCode: null,
      uid: uid ? String(uid).slice(0, 128) : null, userAgent: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }).catch(function () {});
  } catch (_) { /* never block the payment path */ }
}

/* ── ?action=create-order ── */
async function _createOrder(req, res) {
  try {
    /* Emergency payment kill switch (ADR-021) — never create a Razorpay order while enabled. */
    if (await isEnabled('paymentKillSwitch')) {
      return res.status(503).json({ error: { code: 'PAYMENTS_DISABLED', message: 'Payments are temporarily disabled. Please try again shortly.', retryable: true } });
    }
    /* No overlapping plans (audit S1-ENT2): a user with an active Premium entitlement — from ANY
       source (Razorpay / Google Play / admin grant / trial) — cannot start another purchase until it
       expires. req.userPremium is the server-resolved, expiry-checked entitlement (resolveUserAuth,
       which also self-heals expired plans). This blocks a duplicate charge BEFORE any Razorpay order
       is created; the client hides the purchase UI for premium users, and this is the authoritative
       backstop. */
    if (req.userPremium) {
      return res.status(409).json({
        error: { code: 'ALREADY_PREMIUM', message: 'You already have an active Premium plan. You can purchase again after it expires.', retryable: false }
      });
    }
    var body = req.body || {};
    var plan = body.plan;
    if (!plan || !paymentService.PLAN_CONFIG[plan]) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Invalid plan. Must be one of: premium_6m, premium_12m.', retryable: false }
      });
    }

    var order = await paymentService.createOrder(plan, req.userId);
    console.log('Order created for user', req.userId, ':', order.orderId, 'plan:', plan);
    return res.json(order);
  } catch (err) {
    console.error('Create order error:', err.message, err.statusCode || '', JSON.stringify(err.error || ''));
    var userMsg = 'Could not create payment. Please try again.';
    if (err.statusCode && err.error && err.error.description) {
      userMsg = err.error.description;
    }
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: userMsg, retryable: true } });
  }
}

/* ── ?action=verify ── */
async function _verify(req, res) {
  try {
    var body = req.body || {};
    var orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
    var paymentId = typeof body.paymentId === 'string' ? body.paymentId.trim() : '';
    var signature = typeof body.signature === 'string' ? body.signature.trim() : '';

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Missing required fields: orderId, paymentId, signature.', retryable: false }
      });
    }

    var valid = paymentService.verifyPaymentSignature(orderId, paymentId, signature);
    if (!valid) {
      console.error('Payment signature verification failed for order:', orderId);
      _recordPaymentFailure('signature_invalid', req.userId);
      return res.status(400).json({
        error: { code: 'SIGNATURE_INVALID', message: 'Payment verification failed. Please contact support.', retryable: false }
      });
    }

    /* Fetch order from Razorpay to get server-trusted plan + owner (notes.uid) */
    var order = await paymentService.fetchOrder(orderId);
    var trustedPlan = order.notes && order.notes.plan;
    if (!trustedPlan || !paymentService.getPlanConfig(trustedPlan)) {
      console.error('Order plan mismatch or unknown plan for order:', orderId);
      _recordPaymentFailure('plan_mismatch', req.userId);
      return res.status(400).json({
        error: { code: 'PLAN_MISMATCH', message: 'Payment verification failed. Please contact support.', retryable: false }
      });
    }

    /* audit H1: bind the order to the authenticated caller. The order notes
       carry the uid that created it; reject if a different account tries to
       claim someone else's payment. */
    var orderUid = order.notes && order.notes.uid;
    if (orderUid && orderUid !== req.userId) {
      console.error('[PaymentFlow] PAYMENT_FAILED | order owner mismatch | orderUid: ' + orderUid + ' | caller: ' + req.userId + ' | orderId: ' + orderId);
      _recordPaymentFailure('owner_mismatch', req.userId);
      return res.status(403).json({
        error: { code: 'PAYMENT_OWNER_MISMATCH', message: 'This payment belongs to a different account.', retryable: false }
      });
    }

    console.info('[PaymentFlow] PAYMENT_VERIFIED | backend | uid: ' + req.userId + ' | plan: ' + trustedPlan + ' | paymentId: ' + paymentId);

    /* v2: single Premium tier — time-limited unlock (idempotent + replay-protected)
       W4 (ADR-141): `order.amount_paid` is Razorpay's own record of what was actually captured against
       this order, so the payment row stores evidence rather than our catalog price. It can still read
       0 if we fetch the order before Razorpay has settled the capture onto it, so fall back to the
       order total; activatePremium treats a 0 as "no evidence" and records the catalog price instead.
       The webhook (payment.entity.amount) is the authoritative figure either way and lands later. */
    var expiry = await aiService.activatePremium(req.userId, trustedPlan, paymentId, orderId, {
      amountPaise: Number(order.amount_paid) > 0 ? Number(order.amount_paid) : Number(order.amount),
      currency: order.currency || 'INR'
    });

    /* Set JWT claim so the token reflects premium status on next refresh */
    try { await setEntitlementClaims(req.userId, { premium: true }); } catch (_) {}

    console.info('[PaymentFlow] PREMIUM_GRANTED | backend | uid: ' + req.userId + ' | plan: ' + trustedPlan + ' | expiry: ' + expiry);
    return res.json({ success: true, plan: trustedPlan, expiry: expiry });
  } catch (err) {
    console.error('Verify payment error:', err.message);
    if (err instanceof aiService.AIServiceError && err.code === 'PAYMENT_REPLAY') {
      return res.status(409).json({ error: { code: 'PAYMENT_REPLAY', message: err.message, retryable: false } });
    }
    /* ADR-141: re-submitting a refunded (orderId, paymentId, signature) triple. The signature is still
       cryptographically valid forever — the refund, not the signature, is what makes it unredeemable. */
    if (err instanceof aiService.AIServiceError && err.code === 'PAYMENT_REFUNDED') {
      _recordPaymentFailure('refunded_replay', req.userId);
      return res.status(409).json({ error: { code: 'PAYMENT_REFUNDED', message: err.message, retryable: false } });
    }
    _recordPaymentFailure('verify_error', req.userId);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Could not activate payment. Please contact support.', retryable: false } });
  }
}

/* ── Refunds (ADR-143) ──────────────────────────────────────────────────────────────────────────
   The app NEVER issues a refund. These actions only create and read a REQUEST, which a Super Admin
   reviews; the entitlement is revoked later, and only when the provider confirms the money moved.

   The 24-hour window is recomputed here from the STORED gateway capture time on every call. The
   client's opinion about its own eligibility is never trusted — it is display state, and a request
   that arrives one second after the window closes must be refused by the server regardless of what
   the UI believed when it rendered. */

/** The user's most recent payment row. Refunds are always about a specific purchase. */
async function _latestPaymentFor(uid) {
  var snap = await admin.firestore().collection('payments').where('uid', '==', uid).get();
  var best = null;
  snap.forEach(function (d) {
    var v = d.data() || {};
    /* Tombstones (a refund that beat its capture) are not purchases and can never be refunded. */
    if (v.tombstone === true) return;
    var at = (typeof v.capturedAtMs === 'number' && v.capturedAtMs > 0)
      ? v.capturedAtMs : Date.parse(v.claimedAt || '') || 0;
    if (!best || at > best.sortAt) best = { id: d.id, data: v, sortAt: at };
  });
  return best;
}

function _paymentSummary(p) {
  return {
    paymentId: p.id,
    provider: p.data.provider || 'razorpay',
    plan: p.data.plan || null,
    amountPaise: (typeof p.data.amount === 'number') ? p.data.amount : null,
    currency: p.data.currency || 'INR',
    status: p.data.status || 'paid',
    capturedAtMs: (typeof p.data.capturedAtMs === 'number') ? p.data.capturedAtMs : null,
    claimedAt: p.data.claimedAt || null
  };
}

/* ── ?action=refund-eligibility ── */
async function _refundEligibility(req, res) {
  try {
    var p = await _latestPaymentFor(req.userId);
    if (!p) {
      return res.json({
        state: 'no_purchase', windowHours: refundPolicy.REFUND_WINDOW_HOURS,
        windowEndsAtMs: null, msRemaining: 0, payment: null, openRequest: null
      });
    }
    var el = refundRequests.eligibilityFor(p.data);
    var open = await refundRequests.findOpenForPayment(req.userId, p.id);
    return res.json({
      state: el.state,
      windowHours: refundPolicy.REFUND_WINDOW_HOURS,
      windowEndsAtMs: el.windowEndsAtMs,
      msRemaining: el.msRemaining,
      /* Already refunded / partially refunded purchases are not requestable again. */
      alreadyRefunded: p.data.status === 'refunded' || p.data.status === 'partially_refunded',
      payment: _paymentSummary(p),
      openRequest: open ? { id: open.id, status: open.status, createdAtMs: open.createdAtMs } : null
    });
  } catch (err) {
    console.error('Refund eligibility error:', err.message);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Could not check refund eligibility.', retryable: true } });
  }
}

/* ── ?action=refund-request ── */
async function _refundRequest(req, res) {
  try {
    var body = req.body || {};
    var p = await _latestPaymentFor(req.userId);
    if (!p) {
      return res.status(404).json({ error: { code: 'NO_PURCHASE', message: 'No purchase found on this account.', retryable: false } });
    }
    /* If a specific payment was named, it must be the caller's own. Falling back to "their latest"
       silently would let a stale client request a refund for the wrong purchase. */
    if (body.paymentId && String(body.paymentId) !== p.id) {
      return res.status(400).json({ error: { code: 'PAYMENT_MISMATCH', message: 'That purchase is not the one available for refund.', retryable: false } });
    }
    if (p.data.status === 'refunded' || p.data.status === 'partially_refunded') {
      return res.status(409).json({ error: { code: 'ALREADY_REFUNDED', message: 'This purchase has already been refunded.', retryable: false } });
    }

    var el = refundRequests.eligibilityFor(p.data);
    var created = await refundRequests.create({
      uid: req.userId,
      paymentId: p.id,
      provider: p.data.provider || 'razorpay',
      orderId: p.data.orderId || null,
      plan: p.data.plan || null,
      amountPaise: (typeof p.data.amount === 'number') ? p.data.amount : null,
      currency: p.data.currency || 'INR',
      capturedAtMs: (typeof p.data.capturedAtMs === 'number') ? p.data.capturedAtMs : null,
      capturedAtSource: p.data.capturedAtSource || 'unknown',
      eligibility: el,
      reason: body.reason
    });
    return res.json({
      success: true, requestId: created.id, status: created.status,
      needsManualReview: created.needsManualEligibilityReview === true
    });
  } catch (err) {
    if (err.code === 'REFUND_WINDOW_EXPIRED') {
      return res.status(403).json({ error: { code: 'REFUND_WINDOW_EXPIRED', message: err.message, retryable: false } });
    }
    if (err.code === 'REFUND_REQUEST_EXISTS') {
      return res.status(409).json({ error: { code: 'REFUND_REQUEST_EXISTS', message: err.message, retryable: false }, requestId: err.requestId });
    }
    console.error('Refund request error:', err.message);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Could not submit your refund request.', retryable: true } });
  }
}

/* ── ?action=refund-cancel ── */
async function _refundCancel(req, res) {
  try {
    var body = req.body || {};
    var id = typeof body.requestId === 'string' ? body.requestId.trim() : '';
    if (!id) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'requestId is required.', retryable: false } });

    /* Ownership is checked before the transition so one user can never cancel another's request. */
    var doc = await admin.firestore().collection(refundRequests.COLLECTION).doc(id).get();
    if (!doc.exists || doc.data().uid !== req.userId) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Refund request not found.', retryable: false } });
    }
    var out = await refundRequests.cancel(id, req.userId);
    return res.json({ success: true, status: out.to });
  } catch (err) {
    if (err.code === 'REFUND_TRANSITION_INVALID') {
      return res.status(409).json({ error: { code: 'REFUND_TRANSITION_INVALID', message: err.message, retryable: false } });
    }
    console.error('Refund cancel error:', err.message);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Could not cancel the request.', retryable: true } });
  }
}

module.exports = withAuth(async function (req, res) {
  if (methodGuard(req, res, 'POST')) return;

  var action = req.query.action || '';
  if (action === 'create-order') return _createOrder(req, res);
  if (action === 'verify') return _verify(req, res);
  if (action === 'refund-eligibility') return _refundEligibility(req, res);
  if (action === 'refund-request') return _refundRequest(req, res);
  if (action === 'refund-cancel') return _refundCancel(req, res);
  return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown payment action: ' + action, retryable: false } });
});
