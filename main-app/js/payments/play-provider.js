/**
 * play-provider.js — the Google Play Billing adapter (ADR-145, Phase-4 WS5).
 *
 * Speaks the same normalised vocabulary as the Razorpay adapter, so the paywall needs no
 * Play-specific handling and no Play vocabulary leaks into the UI.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * `isReady()` IS FALSE UNTIL PROVEN OTHERWISE, AND IT IS FALSE TODAY
 *
 * It is synchronous (the facade asks it mid-render), but every fact it depends on is asynchronous.
 * So it reports a MEMOISED verdict that starts `false` and is only ever set by `prepare()`. A UI that
 * never calls `prepare()` therefore shows no purchase control — the failure mode is reader mode, which
 * is the safe one.
 *
 * `prepare()` requires BOTH, AND-ed:
 *
 *   1. `QRPlatform.canUsePlayBilling(SKUS)` — the Digital Goods service resolves AND every product
 *      comes back. Strong evidence, client side.
 *   2. `POST ?action=verify-play`'s sibling `?action=play-config` reporting `enabled:true` — the
 *      SERVER will honour a purchase: Play billing is switched on, `PLAY_PACKAGE_NAME` is set, and
 *      the payment kill switch is off.
 *
 * Why both. (1) alone means Google would take the money and our server would then refuse to verify it
 * — a charge with no entitlement, and the worst outcome available. (2) alone means the server is
 * willing but this device cannot actually complete a purchase. Neither is sufficient; the conjunction
 * is. Today (2) is false on every deployment because the operator switch `config/playBilling` is off
 * and the service account has no Play API grant yet, so no purchase control renders anywhere.
 *
 * WHAT "NOT READY" MEANS — unchanged from WS4, and the point of the whole workstream:
 * the facade answers `PROVIDER_UNAVAILABLE`, the paywall renders the value proposition with NO
 * purchase control, and there is no code path from here to the Razorpay adapter. Not a fallback, not
 * a retry, not a redirect to a website. "Play is not ready" resolves to *no purchase*, never to *a
 * different provider*.
 *
 * RESTORE IS UNAFFECTED. It is provider-neutral and server-routed, so someone who bought Premium on
 * the web can unlock the Play build even while purchasing here is impossible.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * THE SERVER GRANTS, NOT THIS FILE
 *
 * `purchase()` obtains a purchase token from Google and hands it to the server. It never inspects the
 * token, never decides a purchase succeeded, and never touches entitlement state. The server asks
 * Google directly (`androidpublisher`) and its answer is the only one that counts — exactly as the
 * Razorpay adapter relays `?action=verify` rather than trusting the checkout callback.
 */
(function (root) {
  'use strict';

  /* Product ids. Inline-copied from shared/constants/entitlements.js PLAY_SKUS, like every other
     shared constant (ADR-099: shared/ is outside the deploy root). The SERVER allowlist in
     services/playBillingService.js remains the authority — this copy only decides which products to
     ask the Play catalogue about. */
  var SKUS = ['premium_6m', 'premium_12m'];

  var PAYMENT_METHOD = 'https://play.google.com/billing';

  /* The memoised verdict. `null` = never established; the facade reads `isReady()` which treats
     anything other than an explicit true as false. */
  var _ready = false;
  var _service = null;
  var _prepared = false;      /* prepare() has completed at least once */
  var _preparing = null;      /* in-flight promise, so a double-tap cannot start two probes */

  function _R() { return root.QRPayments ? root.QRPayments.RESULT : {}; }
  function _t(key) { return (typeof root.QRI18n !== 'undefined') ? root.QRI18n.t(key) : key; }

  function _getIdToken(callback) {
    if (typeof root.Auth !== 'undefined' && typeof root.Auth.getCurrentUser === 'function') {
      var u = root.Auth.getCurrentUser();
      if (u && typeof u.getIdToken === 'function') {
        u.getIdToken().then(function (tok) { callback(tok); }).catch(function () { callback(null); });
        return;
      }
    }
    callback(null);
  }

  /** Ask the server whether it will honour a Play purchase at all. Fails CLOSED on any error. */
  function _serverEnabled() {
    return new Promise(function (resolve) {
      _getIdToken(function (idToken) {
        if (!idToken) { resolve(false); return; }
        var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken };
        if (root.Session && typeof root.Session.id === 'function') headers['X-Session-Id'] = root.Session.id();
        fetch('/api/payment?action=play-config', { method: 'POST', headers: headers, body: '{}' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { resolve(!!(d && d.enabled === true)); })
          .catch(function () { resolve(false); });
      });
    });
  }

  /**
   * Establish readiness. Safe to call repeatedly; the result is memoised for the session because the
   * payment path must not change under the user mid-checkout.
   * @param {function(boolean)} [callback]
   */
  function prepare(callback) {
    function done(v) { if (typeof callback === 'function') { try { callback(v); } catch (_) {} } return v; }
    if (_prepared) return Promise.resolve(done(_ready));
    if (_preparing) return _preparing.then(done);

    var plat = root.QRPlatform;
    if (!plat || typeof plat.canUsePlayBilling !== 'function') {
      /* No platform module ⇒ we cannot prove Play billing is usable ⇒ it is not. */
      _prepared = true; _ready = false;
      return Promise.resolve(done(false));
    }

    _preparing = Promise.resolve()
      .then(function () { return plat.canUsePlayBilling(SKUS); })
      .then(function (verdict) {
        if (!verdict || verdict.ok !== true) {
          console.info('[PaymentFlow] PLAY_NOT_USABLE | ' + ((verdict && verdict.reason) || 'unknown'));
          return false;
        }
        _service = verdict.service || null;
        /* Only now ask the server. Ordered this way so a web/PWA user never issues this call at all. */
        return _serverEnabled().then(function (enabled) {
          if (!enabled) console.info('[PaymentFlow] PLAY_SERVER_DISABLED | reader mode');
          return enabled;
        });
      })
      .catch(function (err) {
        /* Fails CLOSED. An error establishing readiness is not permission to offer a purchase. */
        console.warn('[PaymentFlow] PLAY_PREPARE_FAILED | ' + ((err && err.message) || err));
        return false;
      })
      .then(function (v) {
        _ready = (v === true);
        _prepared = true;
        _preparing = null;
        return _ready;
      });

    return _preparing.then(done);
  }

  /**
   * Can Play Billing take money right now?
   *
   * Synchronous by contract, and deliberately NOT a live probe: it reports what `prepare()` proved.
   * Before `prepare()` resolves this is false, so the CTA is absent rather than present-and-broken.
   */
  function isReady() { return _ready === true; }

  /**
   * Run the Play purchase, then hand the token to the server.
   *
   * @param {{planType:string, userId:string, isCurrent:function, planLabel?:string}} req
   * @param {function} done called exactly once with a normalised result
   */
  function purchase(req, done) {
    var R = _R();
    var planType = req.planType;
    var isCurrent = req.isCurrent || function () { return true; };
    var finished = false;
    function finish(result) { if (finished) return; finished = true; done(result); }

    /* Belt-and-braces: the facade checks isReady() first, so reaching here unready means something
       bypassed it. Refuse — and refuse to Play, never to another provider. */
    if (!isReady()) {
      finish({ code: R.PROVIDER_UNAVAILABLE || 'PROVIDER_UNAVAILABLE', provider: 'play' });
      return;
    }
    if (SKUS.indexOf(planType) === -1) {
      /* The plan key IS the Play product id (an identity map, server-enforced). An unknown key here
         means the UI and the catalogue disagree; buying "something close" is not an option. */
      finish({ code: R.FAILED || 'FAILED', provider: 'play', message: _t('paywall.failed') });
      return;
    }
    if (typeof root.PaymentRequest !== 'function') {
      finish({ code: R.LOAD_FAILED || 'LOAD_FAILED', provider: 'play', message: _t('paywall.svcUnavailable') });
      return;
    }

    console.info('[PaymentFlow] PAYMENT_INITIATED | provider: play | plan: ' + planType + ' | uid: ' + req.userId);

    var purchaseToken = null;
    Promise.resolve()
      .then(function () {
        /* Google renders its own sheet and owns the price. We name the product; we never name an
           amount — there is no client-side figure that could disagree with the store. */
        var request = new root.PaymentRequest(
          [{ supportedMethods: PAYMENT_METHOD, data: { sku: planType } }],
          { total: { label: req.planLabel || planType, amount: { currency: 'INR', value: '0' } } }
        );
        return request.show();
      })
      .then(function (response) {
        if (!isCurrent()) { try { response.complete('fail'); } catch (_) {} return null; }
        purchaseToken = response && response.details && response.details.purchaseToken;
        if (!purchaseToken) {
          try { response.complete('fail'); } catch (_) {}
          finish({ code: R.VERIFY_FAILED || 'VERIFY_FAILED', provider: 'play', message: _t('paywall.verificationFailed') });
          return null;
        }
        console.info('[PaymentFlow] PLAY_PURCHASE_TOKEN_RECEIVED | plan: ' + planType);
        /* Tell Google the transaction is complete only after OUR server has verified it, so a sheet
           that closes "successful" always corresponds to an entitlement we actually granted. */
        return _verifyWithServer(planType, purchaseToken).then(function (outcome) {
          try { response.complete(outcome.ok ? 'success' : 'fail'); } catch (_) {}
          return outcome;
        });
      })
      .then(function (outcome) {
        if (!outcome || !isCurrent()) return;
        if (outcome.ok) {
          console.info('[PaymentFlow] PAYMENT_VERIFIED | provider: play | plan: ' + outcome.plan);
          finish({ code: R.OK, provider: 'play', plan: outcome.plan, expiry: outcome.expiry, paymentId: null });
          return;
        }
        if (outcome.pending) {
          /* Money has NOT moved. Reported as a distinct, non-error outcome so the UI can say
             "we'll unlock it when Google confirms" rather than "payment failed". */
          finish({ code: R.FAILED, provider: 'play', pending: true,
            message: outcome.message || _t('paywall.playPending') });
          return;
        }
        finish({ code: R.VERIFY_FAILED, provider: 'play', message: outcome.message || _t('paywall.activationFailed') });
      })
      .catch(function (err) {
        if (!isCurrent()) return;
        var name = (err && err.name) || '';
        if (name === 'AbortError' || /cancel/i.test(String((err && err.message) || ''))) {
          finish({ code: R.CANCELLED, provider: 'play', message: _t('paywall.cancelled') });
          return;
        }
        console.error('[PaymentFlow] PLAY_PURCHASE_FAILED |', err);
        finish({ code: R.FAILED, provider: 'play', message: _t('paywall.failed') });
      });
  }

  /** Hand the token to the server. Its verdict is the only one that grants anything. */
  function _verifyWithServer(planType, purchaseToken) {
    return new Promise(function (resolve) {
      _getIdToken(function (idToken) {
        if (!idToken) { resolve({ ok: false, message: _t('paywall.loginToContinue') }); return; }
        var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken };
        if (root.Session && typeof root.Session.id === 'function') headers['X-Session-Id'] = root.Session.id();
        fetch('/api/payment?action=verify-play', {
          method: 'POST', headers: headers,
          /* productId, not a plan or a price. The server maps it through its own allowlist. */
          body: JSON.stringify({ productId: planType, purchaseToken: purchaseToken })
        })
          .then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, body: d }; });
          })
          .then(function (res) {
            var b = res.body || {};
            if (b.success === true) { resolve({ ok: true, plan: b.plan, expiry: b.expiry }); return; }
            if (b.pending === true) { resolve({ ok: false, pending: true, message: b.message }); return; }
            resolve({ ok: false, message: (b.error && b.error.message) || _t('paywall.activationFailed') });
          })
          .catch(function () { resolve({ ok: false, message: _t('paywall.couldNotConnect') }); });
      });
    });
  }

  root.QRPaymentsPlay = { id: 'play', isReady: isReady, prepare: prepare, purchase: purchase };

})(typeof self !== 'undefined' ? self : this);
