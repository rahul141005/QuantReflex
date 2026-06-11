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
 */

const crypto = require('crypto');
const aiService = require('../../services/aiService');
const paymentService = require('../../services/paymentService');

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

    /* If uid or plan is missing from notes, try to fetch from Razorpay order */
    if (!plan) {
      try {
        plan = await paymentService.fetchOrderPlan(orderId);
      } catch (fetchErr) {
        console.error('[webhook] Could not fetch order plan:', fetchErr.message);
        return res.status(200).json({ status: 'ignored', reason: 'order fetch failed' });
      }
    }

    if (!uid) {
      console.error('[PaymentFlow] PAYMENT_FAILED | webhook missing uid | orderId: ' + orderId + ' | paymentId: ' + paymentId);
      return res.status(200).json({ status: 'ok', warning: 'no uid' });
    }

    /* Validate plan is known */
    var planConfig = paymentService.getPlanConfig(plan);
    if (!planConfig) {
      console.error('[webhook] Unknown plan:', plan, 'orderId:', orderId);
      return res.status(200).json({ status: 'ignored', reason: 'unknown plan' });
    }

    /* ── Step 5: Grant entitlement (idempotent) ── */
    try {
      /* v2: single Premium tier. activatePremium uses payments/{paymentId} as a
         transactional lock, so verify + webhook both firing will not double-grant,
         and a replay from another account is rejected with PAYMENT_REPLAY. */
      await aiService.activatePremium(uid, plan, paymentId, orderId);

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
      console.error('[PaymentFlow] PAYMENT_FAILED | webhook grant failed: ' + grantErr.message);
      /* Return 500 so Razorpay retries the webhook */
      return res.status(500).json({ error: 'Grant failed — will retry' });
    }
  }

  /* ── Step 6: Handle payment.failed ── */
  if (event === 'payment.failed') {
    var failedPayment = (payload.payment && payload.payment.entity) || {};
    console.warn('[webhook] Payment failed — id:', failedPayment.id,
      'reason:', failedPayment.error_description || 'unknown',
      'code:', failedPayment.error_code || 'unknown');
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
