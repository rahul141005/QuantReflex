/**
 * playBillingService.js — the Google Play half of the hybrid payment system (ADR-145, Phase-4 WS5).
 *
 * THE ONLY MODULE THAT TALKS TO GOOGLE. Everything else — `?action=verify-play`, the RTDN endpoint,
 * reconciliation — asks this file and acts on a normalised answer, exactly as `paymentService.js` is
 * the only module that talks to Razorpay.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * ABSENCE IS A STATE, NOT A DEFAULT
 *
 * There is no Play Console application yet. That is not a gap to be filled with a plausible value —
 * it is a condition this module reports honestly and everything downstream refuses on:
 *
 *     isConfigured() === false   ⇒   verify-play 503 · RTDN 503 · reconcile no-op · client reader mode
 *
 * So there is no package name, no service-account, no fingerprint and no product price anywhere in
 * this repository. `PLAY_PACKAGE_NAME` is unset today, and while it is unset **no Play purchase can be
 * granted by any path**. A placeholder here would be worse than nothing: it would let the code look
 * finished while silently addressing a Google application that does not exist.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THE PACKAGE NAME CANNOT BE SPOOFED
 *
 * The brief asks for "package-name validation". The stronger construction is to make the question
 * un-askable: the package name is a PATH SEGMENT in the URL we build, never a field we read from the
 * client. We can therefore only ever ask Google about OUR application. A purchase token minted for a
 * different app does not resolve here — it 404s. There is no client-supplied package to validate,
 * and so no validation to get wrong.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY google-auth-library AND NOT googleapis
 *
 * `googleapis` bundles every Google API (~50 MB) and would be paid for on every serverless cold start
 * of a payment endpoint. `google-auth-library` is the token-minting half alone — and firebase-admin
 * already depends on it, so it is present in the tree regardless and declaring it costs nothing. The
 * REST calls are three lines of `fetch` (Node 22 has it globally); wrapping them in a client library
 * would add weight without adding safety. Hand-rolling the RS256 JWT exchange instead was rejected:
 * hand-written signing code in a money path is precisely what a library exists to prevent.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS MODULE DOES NOT DO
 *
 * It never grants, revokes, or writes anything. It reads Google and reports. The entitlement pipeline
 * (`aiService.activatePremium` / `revokePayment`) stays the single authority for both providers —
 * Play becomes a second way to PAY, never a second way to BE premium.
 */
'use strict';

var crypto = require('crypto');

/* ── configuration ─────────────────────────────────────────────────────────────────────────────── */

/* The Play application id (e.g. the value you register on Play Console). Absent today. It is read
   lazily on every call rather than captured at module load so a serverless instance that starts
   before the env var is set does not cache "not configured" for its whole lifetime. */
function packageName() {
  var v = process.env.PLAY_PACKAGE_NAME;
  return (typeof v === 'string' && v.trim()) ? v.trim() : null;
}

/* Service-account credentials. Defaults to the Firebase service account because the documented setup
   (PAYMENT_READINESS §F item 4) invites THAT account's email to Play Console — one identity, one
   thing to configure. `PLAY_SERVICE_ACCOUNT` overrides it if the two ever need to diverge. */
function _serviceAccountJson() {
  return process.env.PLAY_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT || null;
}

function _credentials() {
  var raw = _serviceAccountJson();
  if (!raw) return null;
  try {
    var sa = JSON.parse(raw);
    return (sa && sa.client_email && sa.private_key) ? sa : null;
  } catch (_) {
    return null;
  }
}

/**
 * Is there enough real configuration to talk to Google at all?
 *
 * Both halves are required, and neither is inferable: a package name with no credentials cannot
 * authenticate, and credentials with no package name have nothing to address. Callers MUST check this
 * and refuse — none of them may proceed on a guess.
 */
function isConfigured() {
  return packageName() !== null && _credentials() !== null;
}

/** Why not, in one token, for logs and for the super-admin readiness panel. Never shown to a user. */
function configState() {
  if (packageName() === null) return 'no_package_name';
  if (_credentials() === null) return 'no_service_account';
  return 'configured';
}

/* ── the product allowlist ─────────────────────────────────────────────────────────────────────── */

/**
 * THE SERVER-SIDE ALLOWLIST. A client sends a `productId`; only these are honoured.
 *
 * Inline-copied from `shared/constants/entitlements.js` PLAY_SKUS because `shared/` sits outside each
 * app's Vercel deploy root (ADR-099) — the same reason PLAN_CONFIG and PREMIUM_PRICE_PAISE are copied.
 * `payment-parity.check.js` asserts this copy equals the shared one, so the two cannot drift.
 *
 * The map is an IDENTITY: the Play Console product id IS the planType. That is what makes "is this a
 * product we sell?" and "which plan does it grant?" the same question, with no lookup in between to
 * get wrong.
 */
var PLAY_SKUS = {
  premium_6m: 'premium_6m',
  premium_12m: 'premium_12m'
};

/**
 * Resolve a client-supplied product id to a planType, or null.
 *
 * `null` is a hard refusal at every call site. This is the ONLY place a Play product id becomes a
 * plan, so an unknown, misspelled, retired or attacker-chosen id cannot reach the grant.
 */
function planTypeForProduct(productId) {
  if (typeof productId !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(PLAY_SKUS, productId) ? PLAY_SKUS[productId] : null;
}

/** The ids the client may offer, for `?action=play-config`. */
function skuList() { return Object.keys(PLAY_SKUS); }

var ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
var API_ROOT = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

/* ── auth ──────────────────────────────────────────────────────────────────────────────────────── */

var _authClient = null;
var _tokenCache = null;   /* { token, expMs } */

/* Injectable purely so the check suite can drive this module without a real library or network.
   Production never calls it — the default path is the real GoogleAuth below. */
var _authFactory = null;
function _setAuthFactory(fn) { _authFactory = fn; _authClient = null; _tokenCache = null; }

function _auth() {
  if (_authClient) return _authClient;
  var sa = _credentials();
  if (!sa) throw new PlayBillingError('PLAY_NOT_CONFIGURED', 'Play Billing is not configured.', false);
  if (_authFactory) { _authClient = _authFactory(sa); return _authClient; }
  /* Required lazily: a deploy that never touches a Play path should not pay for loading it, and the
     check suite must be able to run with no node_modules present at all. */
  var GoogleAuth = require('google-auth-library').GoogleAuth;
  _authClient = new GoogleAuth({ credentials: sa, scopes: [ANDROID_PUBLISHER_SCOPE] });
  return _authClient;
}

/** Cached OAuth access token. Re-minted 60s before expiry so an in-flight call cannot age out. */
async function _accessToken() {
  var now = Date.now();
  if (_tokenCache && _tokenCache.expMs - 60000 > now) return _tokenCache.token;
  var client = _auth();
  var res = await client.getAccessToken();
  var token = (res && typeof res === 'object') ? res.token : res;
  if (!token) throw new PlayBillingError('PLAY_AUTH_FAILED', 'Could not obtain a Google access token.', true);
  var expMs = (res && res.expirationTime) ? Date.parse(res.expirationTime) : (now + 45 * 60 * 1000);
  _tokenCache = { token: token, expMs: isFinite(expMs) ? expMs : now + 45 * 60 * 1000 };
  return token;
}

/* ── errors ────────────────────────────────────────────────────────────────────────────────────── */

/**
 * `retryable` is the field that matters. It decides whether a caller may return 5xx and let Google or
 * Pub/Sub try again, or must give a terminal answer. Getting it backwards is how a transient outage
 * becomes a permanently lost purchase — or a permanent error becomes an infinite retry loop.
 */
function PlayBillingError(code, message, retryable) {
  var e = new Error(message || code);
  e.name = 'PlayBillingError';
  e.code = code;
  e.retryable = retryable === true;
  return e;
}

/* ── the REST calls ────────────────────────────────────────────────────────────────────────────── */

var REQUEST_TIMEOUT_MS = 10000;

async function _call(method, url, body) {
  var token = await _accessToken();
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
  var res;
  try {
    res = await fetch(url, {
      method: method,
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
  } catch (err) {
    /* A network failure or a timeout is NOT evidence about the purchase. It is retryable, and the
       caller must not treat it as "no such purchase" — that would deny a customer who paid. */
    throw new PlayBillingError('PLAY_UNREACHABLE', 'Could not reach Google Play: ' + ((err && err.message) || err), true);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404 || res.status === 410) {
    throw new PlayBillingError('PLAY_PURCHASE_NOT_FOUND', 'Google Play does not recognise this purchase.', false);
  }
  if (res.status === 401 || res.status === 403) {
    /* Almost always a setup problem: the service account was never invited to Play Console, or the
       androidpublisher API is not enabled. Retryable, because it becomes correct the moment the
       missing permission is granted — and a purchase must not be lost while that is sorted out. */
    throw new PlayBillingError('PLAY_AUTH_FAILED', 'Google Play rejected our credentials (' + res.status + ').', true);
  }
  if (res.status >= 500) {
    throw new PlayBillingError('PLAY_UNAVAILABLE', 'Google Play returned ' + res.status + '.', true);
  }
  if (!res.ok) {
    throw new PlayBillingError('PLAY_BAD_REQUEST', 'Google Play returned ' + res.status + '.', false);
  }

  if (res.status === 204) return {};
  try {
    return await res.json();
  } catch (_) {
    /* A 200 we cannot parse is not a purchase. Retryable — a truncated body is a transport fault. */
    throw new PlayBillingError('PLAY_BAD_RESPONSE', 'Google Play returned an unparseable body.', true);
  }
}

function _encode(s) { return encodeURIComponent(String(s)); }

function _productUrl(productId, purchaseToken) {
  /* packageName() is OURS, from the environment — never from a request body. See the header. */
  return API_ROOT + '/' + _encode(packageName()) +
    '/purchases/products/' + _encode(productId) +
    '/tokens/' + _encode(purchaseToken);
}

/* Google's `purchaseState` for one-time products. Named so no call site reads a bare integer. */
var PURCHASE_STATE = { 0: 'purchased', 1: 'cancelled', 2: 'pending' };

/**
 * Fetch the authoritative state of a one-time product purchase.
 *
 * @returns {Promise<{state:'purchased'|'cancelled'|'pending'|'unknown', orderId:string|null,
 *                    purchaseTimeMillis:number|null, acknowledged:boolean, consumed:boolean,
 *                    obfuscatedExternalAccountId:string|null, regionCode:string|null,
 *                    rawPurchaseState:number|null}>}
 * @throws {PlayBillingError}
 */
async function getProductPurchase(productId, purchaseToken) {
  if (!isConfigured()) throw new PlayBillingError('PLAY_NOT_CONFIGURED', 'Play Billing is not configured.', false);
  if (!productId || !purchaseToken) throw new PlayBillingError('PLAY_BAD_REQUEST', 'productId and purchaseToken are required.', false);

  var raw = await _call('GET', _productUrl(productId, purchaseToken));

  var rawState = (typeof raw.purchaseState === 'number') ? raw.purchaseState : null;
  var timeMs = Number(raw.purchaseTimeMillis);
  return {
    /* An unrecognised purchaseState maps to 'unknown', never to 'purchased'. A future Google enum
       value must not be able to grant Premium by falling through a default. */
    state: (rawState !== null && PURCHASE_STATE[rawState]) ? PURCHASE_STATE[rawState] : 'unknown',
    rawPurchaseState: rawState,
    orderId: raw.orderId ? String(raw.orderId) : null,
    /* Google reports capture time in epoch MILLISECONDS as a string. This is the origin of the
       ADR-143 24-hour refund window for Play, exactly as Razorpay's `payment.created_at` is for the
       web — never our grant time. */
    purchaseTimeMillis: (isFinite(timeMs) && timeMs > 0) ? Math.round(timeMs) : null,
    acknowledged: raw.acknowledgementState === 1,
    consumed: raw.consumptionState === 1,
    obfuscatedExternalAccountId: (raw.obfuscatedExternalAccountId != null) ? String(raw.obfuscatedExternalAccountId) : null,
    regionCode: raw.regionCode ? String(raw.regionCode) : null
  };
}

/**
 * Acknowledge a purchase.
 *
 * NOT optional and NOT cosmetic: Google automatically REFUNDS any one-time purchase that is not
 * acknowledged within three days. A grant we forget to acknowledge becomes a customer who paid, got
 * Premium, and then had their money returned while keeping access — a real revenue leak. This is why
 * `payments/{id}.acknowledged` exists and why reconciliation sweeps for `acknowledged == false`.
 */
async function acknowledgeProductPurchase(productId, purchaseToken) {
  if (!isConfigured()) throw new PlayBillingError('PLAY_NOT_CONFIGURED', 'Play Billing is not configured.', false);
  await _call('POST', _productUrl(productId, purchaseToken) + ':acknowledge', {});
  return true;
}

/* ── ids ───────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The `payments/{id}` document id for a Play purchase.
 *
 * `gp_<sha256(purchaseToken)>` — the scheme already recorded in `firestore.rules:339`, not invented
 * here. Hashed rather than used raw because purchase tokens are long, are not guaranteed to be safe
 * as a Firestore document id, and are a bearer credential we would rather not store as a key.
 *
 * THE HASH IS THE IDEMPOTENCY KEY. The same token always maps to the same document, so
 * `activatePremium`'s existing transactional lock on that document gives us — with no new code —
 * replay protection, cross-account protection (`existing.uid !== uid` → PAYMENT_REPLAY), and refusal
 * to re-grant an already-refunded purchase.
 */
function paymentDocId(purchaseToken) {
  return 'gp_' + crypto.createHash('sha256').update(String(purchaseToken)).digest('hex');
}

module.exports = {
  isConfigured: isConfigured,
  configState: configState,
  packageName: packageName,
  getProductPurchase: getProductPurchase,
  acknowledgeProductPurchase: acknowledgeProductPurchase,
  paymentDocId: paymentDocId,
  planTypeForProduct: planTypeForProduct,
  skuList: skuList,
  PLAY_SKUS: PLAY_SKUS,
  PlayBillingError: PlayBillingError,
  PURCHASE_STATE: PURCHASE_STATE,
  /* test seam — see _setAuthFactory */
  _setAuthFactory: _setAuthFactory
};
