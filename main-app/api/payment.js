/**
 * Payment domain API (ADR-017) — consolidates payment/create-order + payment/verify into ONE
 * serverless function. withAuth (JWT + entitlement). Both actions are POST.
 *   POST ?action=create-order → create a Razorpay order
 *   POST ?action=verify       → verify the signature + activate the plan
 *
 * NOTE: payment/webhook.js stays a SEPARATE function (HMAC verification + `bodyParser:false`).
 * Its path remains /api/payment/webhook so the Razorpay dashboard needs no reconfiguration.
 */

const { withAuth, methodGuard } = require('./_lib/middleware');
const aiService = require('../services/aiService');
const paymentService = require('../services/paymentService');
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
        error: { code: 'ALREADY_PREMIUM', message: 'You already have an active Premium plan. You can renew once it is close to expiring.', retryable: false }
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

    /* v2: single Premium tier — time-limited unlock (idempotent + replay-protected) */
    var expiry = await aiService.activatePremium(req.userId, trustedPlan, paymentId, orderId);

    /* Set JWT claim so the token reflects premium status on next refresh */
    try { await setEntitlementClaims(req.userId, { premium: true }); } catch (_) {}

    console.info('[PaymentFlow] PREMIUM_GRANTED | backend | uid: ' + req.userId + ' | plan: ' + trustedPlan + ' | expiry: ' + expiry);
    return res.json({ success: true, plan: trustedPlan, expiry: expiry });
  } catch (err) {
    console.error('Verify payment error:', err.message);
    if (err instanceof aiService.AIServiceError && err.code === 'PAYMENT_REPLAY') {
      return res.status(409).json({ error: { code: 'PAYMENT_REPLAY', message: err.message, retryable: false } });
    }
    _recordPaymentFailure('verify_error', req.userId);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Could not activate payment. Please contact support.', retryable: false } });
  }
}

module.exports = withAuth(async function (req, res) {
  if (methodGuard(req, res, 'POST')) return;

  var action = req.query.action || '';
  if (action === 'create-order') return _createOrder(req, res);
  if (action === 'verify') return _verify(req, res);
  return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown payment action: ' + action, retryable: false } });
});
