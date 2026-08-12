/**
 * play-rtdn.js — Google Play Real-Time Developer Notifications (ADR-146, Phase-4 WS6).
 *
 * Serverless function #11 of the 12 Vercel Hobby allows. It is a SEPARATE function from
 * `api/payment/webhook.js` deliberately: that one authenticates a Razorpay HMAC over a raw body, this
 * one authenticates a Pub/Sub push. Merging two providers' authentication into one endpoint means a
 * discrimination bug can route a payload through the wrong verifier, and "which secret validated
 * this?" stops having a single answer. GOVERNANCE's Infrastructure rule says the same thing: never
 * merge across auth boundaries.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * THE PAYLOAD IS A HINT, NEVER EVIDENCE
 *
 * This handler reads exactly one thing out of the notification — the purchase token — and then asks
 * Google what is actually true about it. Nothing in the message body is trusted as a fact about a
 * purchase, ever.
 *
 * That single decision is what makes the hard cases trivial:
 *
 *   · DUPLICATE notification   → the re-fetch returns the same state; the grant is idempotent. No-op.
 *   · OUT-OF-ORDER delivery    → Pub/Sub does not guarantee ordering, so a PURCHASED can arrive after
 *                                a VOIDED. Re-fetching means we always act on CURRENT truth rather
 *                                than on the order messages happened to arrive in. A stale PURCHASED
 *                                cannot resurrect a refunded entitlement, because Google reports the
 *                                purchase as voided and `activatePremium` refuses a terminal row.
 *   · REPLAYED notification    → same as duplicate.
 *   · FORGED notification      → it can only name a token; the token's truth comes from Google.
 *
 * So there is no message-id ledger and no ordering buffer here, and that is a design choice rather
 * than an omission: correctness comes from re-deriving state, not from bookkeeping about deliveries.
 * (The Razorpay webhook has no event-id store for the same reason.)
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * HTTP STATUS IS A RETRY INSTRUCTION
 *
 * Pub/Sub redelivers on any non-2xx. So:
 *   200 — handled, or safely ignorable. Includes cases we deliberately do nothing about.
 *   401 — authentication failed. Not retryable, and it must not be: an unauthenticated caller
 *         hammering us forever is the thing we are refusing.
 *   500 — a TRANSIENT failure on our side or Google's. Retry, please: this is how a purchase
 *         survives a Firestore blip or an androidpublisher outage.
 *
 * Returning 200 on a transient failure would silently drop a real purchase or a real refund. That is
 * the most expensive mistake available here, so every non-terminal error path returns 500.
 */

const admin = require('firebase-admin');
const crypto = require('crypto');
const aiService = require('../../services/aiService');
const playBilling = require('../../services/playBillingService');
const refundRequests = require('../../services/refundRequests');   // ADR-143: the ONE refund-request writer

/* DELIBERATELY NOT flag-gated. `config/playBilling` gates whether we will TAKE money; it must never
   gate whether we ACT on a refund. An operator switching Play billing off in an emergency must not
   also stop voided-purchase notifications from revoking entitlement, or a refunded customer keeps
   Premium. This endpoint therefore imports no config flag — its only gates are authentication and
   `isConfigured()`. (An unused `isEnabled` import used to sit here and implied the opposite.) */

if (!admin.apps.length) {
  try {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    admin.initializeApp(sa ? { credential: admin.credential.cert(JSON.parse(sa)) } : undefined);
  } catch (e) {
    console.error('Firebase admin initialization failed:', e);
  }
}

/* Google's notificationType values for ONE-TIME (managed) products. Subscriptions are not sold, so
   `subscriptionNotification` is intentionally unhandled — see the dispatch below. */
var ONE_TIME_PURCHASED = 1;
var ONE_TIME_CANCELLED = 2;

function _safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch (_) { return false; }
}

/**
 * Authenticate the caller.
 *
 * Two independent mechanisms, because they fail in different ways and neither is sufficient alone:
 *
 *   1. A SHARED SECRET in the push endpoint's query string. Simple, always available, and the thing
 *      that actually stops an arbitrary internet caller. Required — an unset secret is a 500, never
 *      an open door (the same stance `RAZORPAY_WEBHOOK_SECRET` takes in the sibling webhook).
 *   2. The Pub/Sub OIDC bearer token, when `PLAY_RTDN_AUDIENCE` is configured. This is Google's own
 *      recommendation and proves the caller is genuinely Google rather than someone who learned the
 *      URL. Optional only because it cannot be configured before the Pub/Sub subscription exists;
 *      once set it is enforced.
 *
 * Verifying the OIDC token needs Google's public keys, i.e. a network call. It is therefore done via
 * the injected verifier so this stays testable and so a key-server outage is a 500 (retry) rather
 * than a silent accept.
 */
async function _authenticate(req) {
  var secret = process.env.PLAY_RTDN_SECRET;
  if (!secret) return { ok: false, status: 500, code: 'RTDN_SECRET_MISSING' };

  var provided = (req.query && req.query.key) || '';
  if (!_safeEqual(provided, secret)) return { ok: false, status: 401, code: 'UNAUTHORIZED' };

  var audience = process.env.PLAY_RTDN_AUDIENCE;
  if (audience) {
    var header = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
    var token = header.indexOf('Bearer ') === 0 ? header.substring(7) : '';
    if (!token) return { ok: false, status: 401, code: 'UNAUTHORIZED' };
    try {
      var verified = await _verifyOidc(token, audience);
      if (!verified) return { ok: false, status: 401, code: 'UNAUTHORIZED' };
    } catch (_) {
      /* Could not REACH Google's key server. That is not proof the caller is illegitimate, so retry
         rather than reject — a rejected notification is not redelivered indefinitely. */
      return { ok: false, status: 500, code: 'OIDC_VERIFY_UNAVAILABLE' };
    }
  }
  return { ok: true };
}

/* Injectable so the check suite can drive authentication without a network or a key server. */
var _oidcVerifier = null;
function _setOidcVerifier(fn) { _oidcVerifier = fn; }
async function _verifyOidc(token, audience) {
  if (_oidcVerifier) return _oidcVerifier(token, audience);
  var OAuth2Client = require('google-auth-library').OAuth2Client;
  var client = new OAuth2Client();
  var ticket = await client.verifyIdToken({ idToken: token, audience: audience });
  return !!(ticket && ticket.getPayload());
}

/** Decode the Pub/Sub envelope. Returns null for anything that is not a usable notification. */
function _decode(body) {
  try {
    var data = body && body.message && body.message.data;
    if (!data) return null;
    var json = Buffer.from(String(data), 'base64').toString('utf8');
    var parsed = JSON.parse(json);
    return (parsed && typeof parsed === 'object') ? parsed : null;
  } catch (_) {
    return null;
  }
}

/**
 * Find the QuantReflex user a purchase token belongs to.
 *
 * The notification carries no uid — Google has no idea who our users are — so the binding must come
 * from our own row, written when the client verified the purchase. When it is absent the purchase is
 * real but unattributed (the app was killed before `verify-play` returned, or the purchase happened
 * out-of-band), and we record an ORPHAN rather than guess. The existing `paymentOrphans` collection
 * and the super-admin queue that reads it already handle exactly this case for Razorpay.
 */
async function _uidForPayment(paymentId) {
  var snap = await admin.firestore().collection('payments').doc(paymentId).get();
  return snap.exists ? ((snap.data() || {}).uid || null) : null;
}

async function _recordOrphan(id, reason, extra) {
  try {
    await admin.firestore().collection('paymentOrphans').doc(id).set(Object.assign({
      reason: reason, provider: 'play', status: 'unresolved', createdAt: new Date().toISOString()
    }, extra || {}), { merge: true });
  } catch (e) {
    console.error('[PaymentFlow] PLAY_RTDN_ORPHAN_WRITE_FAILED | ' + e.message);
  }
}

/**
 * A one-time product notification. Re-fetch, then act on what Google says — NOT on the notification.
 * @returns {Promise<{status:number, body:object}>}
 */
async function _handleOneTime(note) {
  var productId = note.sku ? String(note.sku) : '';
  var purchaseToken = note.purchaseToken ? String(note.purchaseToken) : '';
  if (!productId || !purchaseToken) return { status: 200, body: { status: 'ignored', reason: 'incomplete' } };

  /* The same server-side allowlist verify-play uses. A notification naming a product we do not sell
     cannot cause a grant, whatever its notificationType says. */
  var planType = playBilling.planTypeForProduct(productId);
  if (!planType) {
    console.warn('[PaymentFlow] PLAY_RTDN_UNKNOWN_PRODUCT | ' + productId);
    return { status: 200, body: { status: 'ignored', reason: 'unknown_product' } };
  }

  var paymentId = playBilling.paymentDocId(purchaseToken);
  var purchase;
  try {
    purchase = await playBilling.getProductPurchase(productId, purchaseToken);
  } catch (err) {
    if (err && err.retryable) {
      /* Ask Pub/Sub to try again. Do NOT ack — that would lose the purchase. */
      console.error('[PaymentFlow] PLAY_RTDN_FETCH_RETRYABLE | ' + err.code);
      return { status: 500, body: { error: { code: err.code } } };
    }
    /* Google says this token is not a thing. Nothing to do, and retrying cannot change it. */
    console.warn('[PaymentFlow] PLAY_RTDN_FETCH_TERMINAL | ' + ((err && err.code) || 'unknown'));
    return { status: 200, body: { status: 'ignored', reason: (err && err.code) || 'not_found' } };
  }

  /* NOT `purchased` — pending or cancelled. Never a grant. Note this is decided by the RE-FETCH, so
     a PURCHASED notification for a purchase Google now reports as cancelled does nothing. */
  if (purchase.state !== 'purchased') {
    console.info('[PaymentFlow] PLAY_RTDN_NOT_PURCHASED | state: ' + purchase.state);
    return { status: 200, body: { status: 'ignored', state: purchase.state } };
  }

  var uid = await _uidForPayment(paymentId);
  if (!uid) {
    /* Real money, no known owner. Recorded for human resolution — never guessed at. */
    await _recordOrphan(paymentId, 'play_rtdn_no_uid', { productId: productId, orderId: purchase.orderId || null });
    console.warn('[PaymentFlow] PLAY_RTDN_ORPHAN | paymentId: ' + paymentId);
    return { status: 200, body: { status: 'orphaned' } };
  }

  try {
    await aiService.activatePremium(uid, planType, paymentId, purchase.orderId, {
      provider: 'play', capturedAtMs: purchase.purchaseTimeMillis, currency: 'INR'
    });
  } catch (err) {
    if (err instanceof aiService.AIServiceError && err.code === 'PAYMENT_REFUNDED') {
      /* An out-of-order or replayed PURCHASED landing after the refund. Refusing is the whole point
         of the terminal-status branch; ack so Google stops retrying something we will never honour. */
      console.warn('[PaymentFlow] PLAY_RTDN_GRANT_AFTER_REFUND | paymentId: ' + paymentId);
      return { status: 200, body: { status: 'refused', reason: 'refunded' } };
    }
    if (err instanceof aiService.AIServiceError && err.code === 'PAYMENT_REPLAY') {
      console.warn('[PaymentFlow] PLAY_RTDN_OWNER_MISMATCH | paymentId: ' + paymentId);
      return { status: 200, body: { status: 'refused', reason: 'owner_mismatch' } };
    }
    console.error('[PaymentFlow] PLAY_RTDN_GRANT_FAILED | ' + err.message);
    return { status: 500, body: { error: { code: 'GRANT_FAILED' } } };
  }

  /* Acknowledge. Google auto-refunds anything unacknowledged for three days, and an RTDN-driven grant
     is exactly the path where the client never got the chance to acknowledge. */
  var acknowledged = purchase.acknowledged;
  if (!acknowledged) {
    try { await playBilling.acknowledgeProductPurchase(productId, purchaseToken); acknowledged = true; }
    catch (e) { console.error('[PaymentFlow] PLAY_RTDN_ACK_FAILED | ' + e.message); }
  }
  try {
    await admin.firestore().collection('payments').doc(paymentId)
      .set({ provider: 'play', productId: productId, acknowledged: acknowledged,
             /* Needed by reconciliation — the doc id is only the token's hash. See api/payment.js. */
             purchaseToken: purchaseToken }, { merge: true });
  } catch (_) { /* reconciliation re-derives this */ }

  console.info('[PaymentFlow] PLAY_RTDN_GRANTED | uid: ' + uid + ' | plan: ' + planType + ' | acked: ' + acknowledged);
  return { status: 200, body: { status: 'granted' } };
}

/**
 * A voided purchase — Google refunded, revoked or charged back.
 *
 * ADR-143 IS EXPLICIT HERE: this runs with NO eligibility check of any kind. Our 24-hour window
 * governs whether a USER MAY REQUEST a refund; it has nothing to do with whether Google may issue
 * one. Google can refund through its own support weeks later, and when it does the entitlement must
 * go. `revokePayment` carries no window gate and is ratcheted so one cannot be added.
 */
async function _handleVoided(note) {
  var purchaseToken = note.purchaseToken ? String(note.purchaseToken) : '';
  if (!purchaseToken) return { status: 200, body: { status: 'ignored', reason: 'no_token' } };

  var paymentId = playBilling.paymentDocId(purchaseToken);
  var uid = await _uidForPayment(paymentId);

  if (!uid) {
    /* A void for a purchase we never recorded. `revokePayment` TOMBSTONES in this situation so a late
       grant is refused — but it needs a uid to do that, and we have none. Record the orphan; the
       payment row does not exist to be tombstoned. */
    await _recordOrphan('void_' + paymentId, 'play_void_no_uid', { orderId: note.orderId || null });
    console.warn('[PaymentFlow] PLAY_VOID_ORPHAN | paymentId: ' + paymentId);
    return { status: 200, body: { status: 'orphaned' } };
  }

  try {
    await aiService.revokePayment(uid, paymentId, {
      reason: 'play_voided',
      refundId: note.orderId ? String(note.orderId) : null
    });
  } catch (err) {
    /* revokePayment is idempotent, so a retry is always safe and always preferable to dropping a
       revocation on the floor. */
    console.error('[PaymentFlow] PLAY_VOID_REVOKE_FAILED | ' + err.message);
    return { status: 500, body: { error: { code: 'REVOKE_FAILED' } } };
  }

  /* Close any open QuantReflex refund request for this payment — the money HAS now moved, which is
     the only thing that may mark a request `refunded` (ADR-143: an admin approving does not). Best
     effort: the entitlement is already revoked, and failing here must not trigger a retry that would
     revoke again. */
  try {
    await refundRequests.markRefunded(paymentId, { uid: uid, refundId: note.orderId || null });
  } catch (e) {
    console.error('[PaymentFlow] PLAY_VOID_MARK_REFUNDED_FAILED | ' + e.message);
  }

  console.info('[PaymentFlow] PLAY_VOIDED | uid: ' + uid + ' | paymentId: ' + paymentId);
  return { status: 200, body: { status: 'revoked' } };
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'POST only.' } });
  }

  var auth = await _authenticate(req);
  if (!auth.ok) {
    if (auth.status === 401) console.warn('[PaymentFlow] PLAY_RTDN_UNAUTHORIZED');
    return res.status(auth.status).json({ error: { code: auth.code } });
  }

  /* Configuration is checked AFTER authentication so an unauthenticated caller learns nothing about
     our setup, and BEFORE any handling because every handler re-fetches from Google. 500 so Pub/Sub
     retries: notifications that arrive during a misconfiguration window are real purchases, and
     acking them would discard them permanently. */
  if (!playBilling.isConfigured()) {
    console.error('[PaymentFlow] PLAY_RTDN_NOT_CONFIGURED | ' + playBilling.configState());
    return res.status(500).json({ error: { code: 'PLAY_NOT_CONFIGURED' } });
  }

  var note = _decode(req.body);
  if (!note) {
    /* Malformed or undecodable. Retrying will not fix a bad body, so ack it rather than have Pub/Sub
       redeliver it forever. */
    console.warn('[PaymentFlow] PLAY_RTDN_MALFORMED');
    return res.status(200).json({ status: 'ignored', reason: 'malformed' });
  }

  /* A connectivity check Play sends when you configure the topic. It carries no purchase. */
  if (note.testNotification) {
    console.info('[PaymentFlow] PLAY_RTDN_TEST_OK');
    return res.status(200).json({ status: 'ok', test: true });
  }

  /* The package name is ours, from the environment — a notification for another application is not
     ours to act on, whatever it claims. */
  var expectedPackage = playBilling.packageName();
  if (note.packageName && expectedPackage && String(note.packageName) !== expectedPackage) {
    console.warn('[PaymentFlow] PLAY_RTDN_WRONG_PACKAGE | ' + note.packageName);
    return res.status(200).json({ status: 'ignored', reason: 'wrong_package' });
  }

  try {
    var out;
    if (note.voidedPurchaseNotification) {
      out = await _handleVoided(note.voidedPurchaseNotification);
    } else if (note.oneTimeProductNotification) {
      var t = Number(note.oneTimeProductNotification.notificationType);
      if (t === ONE_TIME_PURCHASED) {
        out = await _handleOneTime(note.oneTimeProductNotification);
      } else if (t === ONE_TIME_CANCELLED) {
        /* A CANCELLED one-time notification means the pending purchase never completed. There is
           nothing to revoke — nothing was ever granted — and the reserved `pending` row is harmless.
           Deliberately a no-op rather than a revocation, which could strip access earned elsewhere. */
        console.info('[PaymentFlow] PLAY_RTDN_ONE_TIME_CANCELLED');
        out = { status: 200, body: { status: 'ignored', reason: 'cancelled' } };
      } else {
        console.info('[PaymentFlow] PLAY_RTDN_UNKNOWN_TYPE | ' + t);
        out = { status: 200, body: { status: 'ignored', reason: 'unknown_type' } };
      }
    } else if (note.subscriptionNotification) {
      /* We sell one-time managed products only. A subscription notification means either a
         misconfigured topic or a product we do not sell — acting on it would be acting on a guess. */
      console.warn('[PaymentFlow] PLAY_RTDN_SUBSCRIPTION_IGNORED');
      out = { status: 200, body: { status: 'ignored', reason: 'subscriptions_not_sold' } };
    } else {
      out = { status: 200, body: { status: 'ignored', reason: 'no_known_notification' } };
    }
    return res.status(out.status).json(out.body);
  } catch (err) {
    /* An unexpected failure is transient by assumption: 500 so the notification is redelivered. The
       alternative — acking on an exception — silently discards real money events. */
    console.error('[PaymentFlow] PLAY_RTDN_ERROR | ' + err.message);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR' } });
  }
}

module.exports = handler;
module.exports._setOidcVerifier = _setOidcVerifier;   /* test seam */
