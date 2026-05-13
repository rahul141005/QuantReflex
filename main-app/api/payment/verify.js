/**
 * POST /api/payment/verify
 * Verify Razorpay payment signature and activate the plan.
 * Accepts: { orderId, paymentId, signature }
 * Returns: { success, plan, type?, expiry? }
 */

const { withAuth, formatError, methodGuard } = require('../_lib/middleware');
const aiService = require('../../services/aiService');
const paymentService = require('../../services/paymentService');

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

    /* Fetch order from Razorpay to get server-trusted plan */
    var trustedPlan = await paymentService.fetchOrderPlan(orderId);
    console.log('Payment verified for user', req.userId, '- plan:', trustedPlan, 'paymentId:', paymentId);

    if (trustedPlan === 'premium') {
      /* Premium: lifetime unlock via Firestore */
      await aiService.safeUserUpdate(req.userId, {
        isPremium: true,
        hasPaid: true,
        isTrial: false,
        trialEnd: null,
        lastPaymentId: String(paymentId),
        updatedAt: new Date().toISOString()
      }, 'payment/verify:premium');
      res.json({ success: true, plan: 'premium', type: 'lifetime' });
    } else {
      /* Premium+: time-limited unlock */
      var expiry = await aiService.unlockPremiumPlus(req.userId, trustedPlan, paymentId, orderId);
      res.json({ success: true, plan: trustedPlan, expiry: expiry });
    }
  } catch (err) {
    console.error('Verify payment error:', err.message);
    if (err instanceof aiService.AIServiceError && err.code === 'PAYMENT_REPLAY') {
      return res.status(409).json({ error: { code: 'PAYMENT_REPLAY', message: err.message, retryable: false } });
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Could not activate payment. Please contact support.', retryable: false } });
  }
});
