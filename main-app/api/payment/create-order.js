/**
 * POST /api/payment/create-order
 * Create a Razorpay order for one-time payment.
 * Accepts: { plan: 'premium_6m' | 'premium_12m' }
 * Returns: { orderId, plan, amount }
 */

const { withAuth, methodGuard } = require('../_lib/middleware');
const paymentService = require('../../services/paymentService');

module.exports = withAuth(async function (req, res) {
  if (methodGuard(req, res, 'POST')) return;

  try {
    var body = req.body || {};
    var plan = body.plan;
    if (!plan || !paymentService.PLAN_CONFIG[plan]) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Invalid plan. Must be one of: premium_6m, premium_12m.', retryable: false }
      });
    }

    var order = await paymentService.createOrder(plan, req.userId);
    console.log('Order created for user', req.userId, ':', order.orderId, 'plan:', plan);
    res.json(order);
  } catch (err) {
    console.error('Create order error:', err.message, err.statusCode || '', JSON.stringify(err.error || ''));
    var userMsg = 'Could not create payment. Please try again.';
    if (err.statusCode && err.error && err.error.description) {
      userMsg = err.error.description;
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: userMsg, retryable: true } });
  }
});
