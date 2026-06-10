/**
 * POST /api/payment/verify
 * Verify Razorpay payment signature and activate the plan.
 * Accepts: { orderId, paymentId, signature }
 * Returns: { success, plan, type?, expiry? }
 */

const { withAuth, formatError, methodGuard } = require('../_lib/middleware');
const aiService = require('../../services/aiService');
const paymentService = require('../../services/paymentService');
const { setEntitlementClaims } = require('../../services/claimsService');

module.exports = withAuth(async function (req, res) {
  if (methodGuard(req, res, 'POST')) return;

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
      return res.status(400).json({
        error: { code: 'SIGNATURE_INVALID', message: 'Payment verification failed. Please contact support.', retryable: false }
      });
    }

    /* Fetch order from Razorpay to get server-trusted plan + owner (notes.uid) */
    var order = await paymentService.fetchOrder(orderId);
    var trustedPlan = order.notes && order.notes.plan;
    if (!trustedPlan || !paymentService.getPlanConfig(trustedPlan)) {
      console.error('Order plan mismatch or unknown plan for order:', orderId);
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
    res.json({ success: true, plan: trustedPlan, expiry: expiry });
  } catch (err) {
    console.error('Verify payment error:', err.message);
    if (err instanceof aiService.AIServiceError && err.code === 'PAYMENT_REPLAY') {
      return res.status(409).json({ error: { code: 'PAYMENT_REPLAY', message: err.message, retryable: false } });
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Could not activate payment. Please contact support.', retryable: false } });
  }
});
