const crypto = require('crypto');
const Razorpay = require('razorpay');

var RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
var RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
if (!RAZORPAY_KEY_ID) {
  console.warn('RAZORPAY_KEY_ID not set. Payments will be unavailable.');
}
if (!RAZORPAY_KEY_SECRET) {
  console.warn('RAZORPAY_KEY_SECRET not set. Payments will be unavailable.');
}

/**
 * Plan definitions — one-time payments only, no subscriptions.
 *
 * premium:      ₹89 lifetime
 * plus_6month:  ₹299 for 6 months
 * plus_yearly:  ₹499 for 1 year
 */
var PLAN_CONFIG = {
  premium: { amountPaise: 8900, label: 'Lifetime Premium', durationDays: null },
  plus_6month: { amountPaise: 29900, label: 'Premium+ 6 Months', durationDays: 182 },
  plus_yearly: { amountPaise: 49900, label: 'Premium+ 1 Year', durationDays: 365 }
};

var razorpayInstance = null;

function _getRazorpay() {
  if (!razorpayInstance) {
    if (!RAZORPAY_KEY_ID) {
      throw new Error('RAZORPAY_KEY_ID is not configured.');
    }
    if (!RAZORPAY_KEY_SECRET) {
      throw new Error('RAZORPAY_KEY_SECRET is not configured.');
    }
    if (RAZORPAY_KEY_SECRET.startsWith('rzp_')) {
      throw new Error('RAZORPAY_KEY_SECRET contains a key_id (starts with rzp_). It must be the API key secret, not the key ID.');
    }
    razorpayInstance = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET
    });
  }
  return razorpayInstance;
}

/**
 * Create a Razorpay Order for a one-time payment.
 * @param {string} plan - One of: 'premium', 'plus_6month', 'plus_yearly'
 * @param {string} uid - Firebase UID (used in receipt for traceability)
 * @returns {{ orderId: string, plan: string, amount: number }}
 */
async function createOrder(plan, uid) {
  var config = PLAN_CONFIG[plan];
  if (!config) {
    throw new Error('Invalid plan: "' + plan + '". Must be one of: premium, plus_6month, plus_yearly.');
  }
  var rzp = _getRazorpay();
  var receipt = 'rcpt_' + (uid || 'anon').substring(0, 20) + '_' + Date.now();


  console.info('[PaymentFlow] ORDER_CREATED | backend initiation | plan: ' + plan + ' | amount: ' + config.amountPaise + ' | uid: ' + uid);
  var order = await rzp.orders.create({
    amount: config.amountPaise,
    currency: 'INR',
    receipt: receipt,
    notes: { plan: plan, product: plan === 'premium' ? 'Premium' : 'PremiumPlus', uid: uid || '' }
  });

  console.info('[PaymentFlow] ORDER_CREATED | backend success | orderId: ' + order.id + ' | status: ' + order.status);

  return {
    orderId: order.id,
    plan: plan,
    amount: config.amountPaise
  };
}

/**
 * Verify Razorpay payment signature using HMAC-SHA256.
 * Uses: razorpay_order_id + "|" + razorpay_payment_id
 * @returns {boolean}
 */
function verifyPaymentSignature(orderId, paymentId, signature) {
  if (!RAZORPAY_KEY_SECRET) return false;
  if (!orderId || !paymentId || !signature) return false;
  try {
    var body = orderId + '|' + paymentId;
    var expected = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    var isValid = crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature, 'hex')
    );

    if (isValid) {
      console.info('[PaymentFlow] SIGNATURE_VERIFIED | orderId: ' + orderId + ' | paymentId: ' + paymentId);
    } else {
      console.error('[PaymentFlow] PAYMENT_FAILED | backend signature mismatch | orderId: ' + orderId + ' | paymentId: ' + paymentId);
    }
    return isValid;
  } catch (_) {
    return false;
  }
}

/**
 * Fetch the order from Razorpay and verify it is paid.
 * Returns the plan from the order notes (server-side source of truth).
 * @param {string} orderId
 * @returns {string} plan key
 */
async function fetchOrderPlan(orderId) {
  var rzp = _getRazorpay();
  var order = await rzp.orders.fetch(orderId);
  if (!order || order.status !== 'paid') {
    throw new Error('Order not in paid state. Status: ' + (order && order.status) + ' (id: ' + orderId + ')');
  }
  var plan = order.notes && order.notes.plan;
  if (!plan || !PLAN_CONFIG[plan]) {
    throw new Error('Order plan mismatch or unknown plan: ' + plan + ' (id: ' + orderId + ')');
  }
  return plan;
}

/**
 * Get plan config (used by server to compute expiry).
 */
function getPlanConfig(plan) {
  return PLAN_CONFIG[plan] || null;
}

module.exports = { createOrder, verifyPaymentSignature, fetchOrderPlan, getPlanConfig, PLAN_CONFIG };
