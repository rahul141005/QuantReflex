/**
 * Payment domain API (ADR-017) — consolidates payment/create-order + payment/verify into ONE
 * serverless function. withAuth (JWT + entitlement). Both actions are POST.
 *   POST ?action=create-order        → create a Razorpay order
 *   POST ?action=verify              → verify the signature + activate the plan
 *   POST ?action=refund-eligibility  → (ADR-143) may this user request a refund, and until when?
 *   POST ?action=refund-request      → (ADR-143) create a refund request (never issues a refund)
 *   POST ?action=refund-cancel       → (ADR-143) withdraw one's own pending request
 *   POST ?action=play-config         → (ADR-145) may this client offer a Play purchase at all?
 *   POST ?action=verify-play         → (ADR-145) verify a Google Play purchase token + activate
 *
 * The refund and Play actions live HERE rather than in their own functions on purpose: main-app is at
 * 10 of the 12 Vercel Hobby functions, and WS6's Play RTDN endpoint still needs #11. Folding related
 * actions into an existing domain function is the same pattern ADR-017 used for create-order/verify.
 * `verify-play` in particular is user-authenticated request/response work, identical in shape to
 * `verify` — it has no reason to be its own function and no budget to be one.
 *
 * NOTE: payment/webhook.js stays a SEPARATE function (HMAC verification + `bodyParser:false`).
 * Its path remains /api/payment/webhook so the Razorpay dashboard needs no reconfiguration.
 */

const { withAuth, methodGuard } = require('./_lib/middleware');
const aiService = require('../services/aiService');
const paymentService = require('../services/paymentService');
const refundRequests = require('../services/refundRequests');   // ADR-143
const refundPolicy = require('../services/refundPolicy');       // ADR-143: THE 24h rule
const playBilling = require('../services/playBillingService');  // ADR-145 (WS5): the Google half
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

/* ── Google Play (ADR-145, WS5) ─────────────────────────────────────────────────────────────────
   Play purchases arrive here ALREADY PAID. That single fact drives every difference from the
   Razorpay path below, and each one is deliberate:

     · `create-order` refuses an already-premium user; `verify-play` MUST NOT. The money has already
       moved through Google. Refusing would take payment and grant nothing — the worst outcome
       available. activatePremium's no-shorten stacking extends the existing term instead.

     · No amount is sent to activatePremium. `purchases.products.get` does not report what the user
       actually paid — Google is the price authority for Play — so there is no capture evidence to
       record. activatePremium falls back to the catalog price and labels it `amountSource:'catalog'`,
       which is honest, and keeps the amount-mismatch alarm from firing on every Play row.

     · The client sends a product id and a token, never a plan or a price. The product id is checked
       against the server-side allowlist; the token is checked against Google. Nothing else is trusted.

   `verify-play` never decides that a purchase succeeded. It asks Google, and reports. */

/** Both Play actions refuse in the same way, so the reasons live in one place. */
async function _playGate(res) {
  if (await isEnabled('paymentKillSwitch')) {
    res.status(503).json({ error: { code: 'PAYMENTS_DISABLED', message: 'Payments are temporarily disabled. Please try again shortly.', retryable: true } });
    return false;
  }
  /* The operator's switch. Off (the default, and the state today) means reader mode: the client shows
     the value proposition and NO purchase control. Deliberately checked before isConfigured() so an
     operator can disable Play billing even on a fully configured deployment. */
  if (!(await isEnabled('playBilling'))) {
    res.status(503).json({ error: { code: 'PLAY_BILLING_DISABLED', message: 'In-app purchases are not available in this version.', retryable: false } });
    return false;
  }
  /* No Play Console application exists yet. Absence is a state, not a default — see
     services/playBillingService.js. There is no configuration to guess at and none is invented. */
  if (!playBilling.isConfigured()) {
    console.warn('[PaymentFlow] PLAY_NOT_CONFIGURED | ' + playBilling.configState());
    res.status(503).json({ error: { code: 'PLAY_NOT_CONFIGURED', message: 'In-app purchases are not available in this version.', retryable: false } });
    return false;
  }
  return true;
}

/* ── ?action=play-config ──
   Lets the client learn whether the server will HONOUR a Play purchase before it takes one. Without
   this the app could open Google's payment sheet, charge the user, and only then discover the server
   refuses to verify — money taken for an entitlement nothing can grant. Cheap, unauthenticated-safe
   (it reveals nothing but a feature flag), and the client caches it for the session. */
async function _playConfig(req, res) {
  var enabled = false;
  try {
    enabled = (await isEnabled('playBilling')) && playBilling.isConfigured() && !(await isEnabled('paymentKillSwitch'));
  } catch (_) {
    enabled = false;   /* fail CLOSED: an unreadable flag means no purchase path, never an open one */
  }
  return res.json({ enabled: enabled, skus: enabled ? playBilling.skuList() : [] });
}

/* ── ?action=verify-play ── */
async function _verifyPlay(req, res) {
  if (!(await _playGate(res))) return;

  var body = req.body || {};
  var productId = (typeof body.productId === 'string') ? body.productId.trim() : '';
  var purchaseToken = (typeof body.purchaseToken === 'string') ? body.purchaseToken.trim() : '';

  /* Bounded before use. A purchase token is an opaque bearer string; an unbounded one is a way to
     push arbitrary length into a URL path and a log line. */
  if (!productId || !purchaseToken || productId.length > 128 || purchaseToken.length > 4096) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'productId and purchaseToken are required.', retryable: false } });
  }

  /* THE ALLOWLIST. A client cannot name a product we do not sell, so it cannot buy a ₹1 test SKU and
     be granted a ₹399 plan. This resolves product → plan; there is no other route to a planType. */
  var planType = playBilling.planTypeForProduct(productId);
  if (!planType) {
    _recordPaymentFailure('play_unknown_product', req.userId);
    return res.status(400).json({ error: { code: 'PLAN_MISMATCH', message: 'Unknown product.', retryable: false } });
  }

  var purchase;
  try {
    purchase = await playBilling.getProductPurchase(productId, purchaseToken);
  } catch (err) {
    /* A failure to REACH Google is not evidence about the purchase. Never grant optimistically, and
       never tell the client "no such purchase" — a retryable answer keeps a paid purchase recoverable
       (the client retries, and reconciliation catches it even if the client never comes back). */
    if (err && err.retryable) {
      console.error('[PaymentFlow] PLAY_VERIFY_UNAVAILABLE | ' + err.code + ' | uid: ' + req.userId);
      return res.status(503).json({ error: { code: 'PLAY_VERIFY_UNAVAILABLE', message: 'Could not confirm your purchase with Google Play. Please try again in a moment.', retryable: true } });
    }
    console.warn('[PaymentFlow] PLAY_VERIFY_REJECTED | ' + ((err && err.code) || 'unknown') + ' | uid: ' + req.userId);
    _recordPaymentFailure('play_' + ((err && err.code) || 'verify_error').toLowerCase(), req.userId);
    return res.status(400).json({ error: { code: (err && err.code) || 'PLAY_VERIFY_FAILED', message: 'This purchase could not be verified with Google Play.', retryable: false } });
  }

  var paymentId = playBilling.paymentDocId(purchaseToken);

  /* PENDING — a slow payment method (cash, some cards). The money has NOT moved. Reserve the row so
     the eventual RTDN can complete it against a known uid, and grant NOTHING. The reserved row
     carries no capture time, because there has been no capture. */
  if (purchase.state === 'pending') {
    try { await _reservePendingPlayRow(paymentId, req.userId, planType, Object.assign({ productId: productId, purchaseToken: purchaseToken }, purchase)); } catch (e) {
      console.error('[PaymentFlow] PLAY_PENDING_RESERVE_FAILED | ' + e.message);
    }
    console.info('[PaymentFlow] PLAY_PENDING | uid: ' + req.userId + ' | plan: ' + planType);
    return res.json({ success: false, pending: true, plan: planType,
      message: 'Your payment is still being processed by Google Play. Premium unlocks automatically once it completes.' });
  }

  if (purchase.state !== 'purchased') {
    /* cancelled, or an enum we do not recognise. Neither may grant. */
    console.warn('[PaymentFlow] PLAY_NOT_PURCHASED | state: ' + purchase.state + ' | uid: ' + req.userId);
    return res.status(409).json({ error: { code: 'PLAY_PURCHASE_NOT_ACTIVE', message: 'This purchase is not active.', retryable: false } });
  }

  var expiry;
  try {
    /* The SAME canonical grant both providers use. Replay, cross-account reuse and
       already-refunded all fall out of its existing transactional lock on payments/{paymentId} —
       and paymentId is the hash of the purchase token, so one token is one document forever. */
    expiry = await aiService.activatePremium(req.userId, planType, paymentId, purchase.orderId, {
      provider: 'play',
      /* Google's capture time — the ONLY origin the ADR-143 refund window may use for Play. */
      capturedAtMs: purchase.purchaseTimeMillis,
      currency: 'INR'
      /* No amountPaise: see the section header. */
    });
  } catch (err) {
    if (err instanceof aiService.AIServiceError && err.code === 'PAYMENT_REPLAY') {
      /* The token belongs to a DIFFERENT QuantReflex account. This is the cross-account reuse case:
         someone else's purchase token cannot become this user's entitlement. */
      _recordPaymentFailure('play_token_bound_elsewhere', req.userId);
      return res.status(409).json({ error: { code: 'PAYMENT_REPLAY', message: 'This purchase is already linked to another account.', retryable: false } });
    }
    if (err instanceof aiService.AIServiceError && err.code === 'PAYMENT_REFUNDED') {
      _recordPaymentFailure('play_refunded_replay', req.userId);
      return res.status(409).json({ error: { code: 'PAYMENT_REFUNDED', message: err.message, retryable: false } });
    }
    console.error('[PaymentFlow] PLAY_GRANT_FAILED | ' + err.message);
    _recordPaymentFailure('play_grant_error', req.userId);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Could not activate your purchase. Please contact support.', retryable: true } });
  }

  try { await setEntitlementClaims(req.userId, { premium: true }); } catch (_) {}

  /* ACKNOWLEDGE — after the grant, never before. Google auto-refunds anything unacknowledged within
     three days, so this is revenue-critical; but it is not fatal, because the user has already paid
     and already has access. A failure is recorded on the row and swept up by reconciliation, which
     is exactly what the `acknowledged == false` index exists for. */
  var acknowledged = purchase.acknowledged;
  if (!acknowledged) {
    try {
      await playBilling.acknowledgeProductPurchase(productId, purchaseToken);
      acknowledged = true;
    } catch (e) {
      console.error('[PaymentFlow] PLAY_ACK_FAILED | paymentId: ' + paymentId + ' | ' + e.message);
    }
  }
  try {
    await admin.firestore().collection('payments').doc(paymentId).set({
      provider: 'play', productId: productId, acknowledged: acknowledged,
      /* The token is stored because reconciliation MUST be able to re-ask Google about this purchase,
         and the doc id is only its sha256 — hashing is one-way. Without it a row whose acknowledgement
         failed could never be repaired, and Google would auto-refund it after three days.
         Disclosure is bounded: `payments` is server-write-only and owner-read-only (firestore.rules),
         so the only person who can read this token is the person Google issued it to. */
      purchaseToken: purchaseToken
    }, { merge: true });
  } catch (_) { /* the grant already happened; reconciliation will re-derive this */ }

  console.info('[PaymentFlow] PLAY_VERIFIED | uid: ' + req.userId + ' | plan: ' + planType + ' | expiry: ' + expiry + ' | acked: ' + acknowledged);
  return res.json({ success: true, plan: planType, expiry: expiry });
}

/** Reserve a `pending` row. NEVER writes an entitlement and never a capture time. */
async function _reservePendingPlayRow(paymentId, uid, planType, purchase) {
  var ref = admin.firestore().collection('payments').doc(paymentId);
  await admin.firestore().runTransaction(async function (tx) {
    var doc = await tx.get(ref);
    /* If a row already exists it is either already paid or already reserved — either way, leave it
       alone. Overwriting a `paid` row with `pending` would un-grant a live entitlement. */
    if (doc.exists) return;
    tx.set(ref, {
      uid: uid, plan: planType, provider: 'play', status: 'pending',
      productId: purchase.productId || null,
      purchaseToken: purchase.purchaseToken || null,
      orderId: purchase.orderId || null,
      /* No capturedAtMs: nothing has been captured. `capturedAtSource:'unknown'` keeps ADR-143
         honest — if this row somehow reached a refund request, the policy routes it to human review
         rather than inventing a window start. */
      capturedAtMs: null, capturedAtSource: 'unknown',
      acknowledged: false,
      claimedAt: null,
      reservedAt: new Date().toISOString()
    });
  });
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

/* ── ?action=play-reconcile (ADR-146, WS6) ───────────────────────────────────────────────────────
   THE DEGRADED MODE, and the safety net under RTDN.

   RTDN is push-based, so anything that stops it — Pub/Sub unavailable on the billing plan, a
   misconfigured topic, our endpoint down during a deploy — silently stops entitlement corrections.
   PAYMENT_READINESS records the decision for that case: reconcile-only, with a ≤24h refund lag. This
   is that reconciler, and it is NOT a second grant path.

   It sweeps `payments` where provider == 'play' AND acknowledged == false, which is precisely the set
   that can lose money: Google AUTO-REFUNDS any purchase left unacknowledged for three days. For each
   row it re-asks Google and acts on the answer:
     · still purchased → acknowledge (the retry that saves the sale)
     · voided/refunded → revoke through the canonical path
     · pending         → leave alone; nothing has been captured
   It never grants an entitlement to a row that does not already have one, so a bug here cannot
   manufacture Premium — the worst it can do is fail to fix something, which the next run retries. */
var RECONCILE_PAGE = 50;

async function _playReconcile(req, res) {
  var secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: { code: 'CRON_SECRET_MISSING', message: 'CRON_SECRET is not configured.' } });
  var header = (req.headers && req.headers['authorization']) || '';
  var provided = header.indexOf('Bearer ') === 0 ? header.substring(7) : header;
  var a = String(provided || ''), b = String(secret);
  var equal = a.length === b.length;
  if (equal) { var diff = 0; for (var i = 0; i < a.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i)); equal = diff === 0; }
  if (!equal) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid cron secret.' } });

  var result = { scanned: 0, acknowledged: 0, revoked: 0, pending: 0, failed: 0, skipped: 0 };

  /* No Play configuration ⇒ nothing to reconcile against. A no-op, reported honestly, never an error
     that would make a cron look broken when it is simply not applicable yet. */
  if (!playBilling.isConfigured()) {
    console.info('[PaymentFlow] PLAY_RECONCILE_SKIPPED | ' + playBilling.configState());
    return res.json({ success: true, skipped: 'not_configured', result: result });
  }

  try {
    var snap = await admin.firestore().collection('payments')
      .where('provider', '==', 'play').where('acknowledged', '==', false).limit(RECONCILE_PAGE).get();

    var rows = [];
    snap.forEach(function (d) { rows.push({ id: d.id, data: d.data() || {} }); });
    result.scanned = rows.length;

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var productId = row.data.productId || row.data.plan;
      var token = row.data.purchaseToken;
      /* The purchase token is what Google is asked about, and the doc id is only its HASH — hashing is
         one-way, so a row that never stored the token cannot be reconciled. Recorded and skipped
         rather than guessed at. */
      if (!token || !playBilling.planTypeForProduct(productId)) { result.skipped++; continue; }

      var purchase = null;
      try {
        purchase = await playBilling.getProductPurchase(productId, token);
      } catch (e) {
        result.failed++;                      /* transient or terminal — the next run retries */
        continue;
      }

      if (purchase.state === 'pending') { result.pending++; continue; }

      if (purchase.state !== 'purchased') {
        /* Cancelled or voided while we were not listening — this is the missed-RTDN case. */
        try {
          if (row.data.uid && row.data.status === 'paid') {
            await aiService.revokePayment(row.data.uid, row.id, { reason: 'play_reconcile_voided' });
            result.revoked++;
          }
          await admin.firestore().collection('payments').doc(row.id).set({ acknowledged: true }, { merge: true });
        } catch (e) { result.failed++; }
        continue;
      }

      try {
        if (!purchase.acknowledged) await playBilling.acknowledgeProductPurchase(productId, token);
        await admin.firestore().collection('payments').doc(row.id).set({ acknowledged: true }, { merge: true });
        result.acknowledged++;
      } catch (e) { result.failed++; }
    }

    console.info('[PaymentFlow] PLAY_RECONCILE | ' + JSON.stringify(result));
    /* Announce truncation rather than letting a full page read as "everything is fine". */
    if (result.scanned === RECONCILE_PAGE) console.warn('[PaymentFlow] PLAY_RECONCILE_PAGE_FULL | more rows remain for the next run');
    return res.json({ success: true, result: result, more: result.scanned === RECONCILE_PAGE });
  } catch (err) {
    console.error('[PaymentFlow] PLAY_RECONCILE_FAILED | ' + err.message);
    return res.status(500).json({ error: { code: 'RECONCILE_FAILED', message: 'Reconciliation failed.' }, result: result });
  }
}

var _authed = withAuth(async function (req, res) {
  if (methodGuard(req, res, 'POST')) return;

  var action = req.query.action || '';
  if (action === 'create-order') return _createOrder(req, res);
  if (action === 'verify') return _verify(req, res);
  if (action === 'refund-eligibility') return _refundEligibility(req, res);
  if (action === 'refund-request') return _refundRequest(req, res);
  if (action === 'refund-cancel') return _refundCancel(req, res);
  if (action === 'play-config') return _playConfig(req, res);
  if (action === 'verify-play') return _verifyPlay(req, res);
  return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown payment action: ' + action, retryable: false } });
});

/* `play-reconcile` is dispatched OUTSIDE withAuth because a cron has no user token — the same shape
   `api/duel.js` uses for its sweep. It authenticates on CRON_SECRET instead, so the two auth
   boundaries stay separate rather than one being weakened to admit the other. */
module.exports = function (req, res) {
  var action = (req.query && req.query.action) || '';
  if (action === 'play-reconcile') return _playReconcile(req, res);
  return _authed(req, res);
};
