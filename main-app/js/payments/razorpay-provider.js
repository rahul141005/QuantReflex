/**
 * razorpay-provider.js — the Razorpay adapter (ADR-144, Phase-4 WS4).
 *
 * THE ONLY FILE IN THE SHIPPED APP THAT MAY MENTION RAZORPAY. `payment-facade.check.js` asserts that
 * `Razorpay`, `rzp_` and `checkout.js` appear nowhere else under `js/`, so a future contributor cannot
 * quietly reintroduce a direct provider call from a view.
 *
 * This is a BEHAVIOUR-PRESERVING extraction of what used to live inside `js/paywall.js`
 * `openPremiumPayment()`. The order of operations, the `[PaymentFlow]` log lines, the settled-script
 * retry handling and the stale-attempt guard are all carried over unchanged; only two things moved:
 *
 *   · lifecycle (busy flag, slow/timeout timers, attempt id) is now the facade's, because every
 *     provider needs it identically;
 *   · outcomes are reported in the facade's normalised vocabulary instead of by calling showToast()
 *     directly, so the UI renders one set of messages whoever the provider was.
 *
 * SECURITY BOUNDARY — unchanged by this move, and stated here because this file is where a future
 * change would be tempted to break it:
 *   · the request body carries `{plan}` only — a KEY, never an amount. The server resolves the price
 *     from PLAN_CONFIG, so the client cannot influence what the user is charged.
 *   · `data.amount` from create-order is passed to the checkout sheet for DISPLAY. It is Razorpay's
 *     own echo of the server-created order; it is never sent back to us and never trusted as truth.
 *   · verification is server-side (`?action=verify`): HMAC → fetchOrder → uid binding → grant. This
 *     file never decides that a payment succeeded; it only relays what the server concluded.
 */
(function (root) {
  'use strict';

  /* Publishable key. Safe in client code by design — it identifies the merchant and cannot authorise
     a charge on its own; every payment is signed and verified server-side against the secret key. */
  var RAZORPAY_LIVE_KEY = 'rzp_live_STanzIgCpSAfL7';
  var SCRIPT_ID = 'razorpayCheckoutScript';
  var SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

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

  /**
   * Load the checkout SDK, tolerating an already-settled tag.
   *
   * ADR-117: `load`/`error` never REPLAY on an element that has already settled, so attaching
   * listeners to a settled-failed tag left the callback permanently uninvoked — the CTA sat disabled
   * on "Processing…" until the 120s safety timer. showPaywall() preloads this script, so a failed
   * preload (offline / ad-blocker / DNS) made that the normal path. Track the state on the element and
   * answer immediately; a failed tag is discarded so the tap can retry.
   */
  function _loadScript(callback) {
    if (typeof root.Razorpay !== 'undefined') { if (callback) callback(null); return; }
    var existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      var state = existing.getAttribute('data-load-state');
      if (state === 'ok') { if (callback) callback(null); return; }
      if (state === 'error') {
        try { existing.parentNode && existing.parentNode.removeChild(existing); } catch (_) {}
        /* fall through and create a fresh tag — a retry may well succeed */
      } else {
        existing.addEventListener('load', function () { if (callback) callback(null); }, { once: true });
        existing.addEventListener('error', function () { if (callback) callback('script_load_failed'); }, { once: true });
        return;
      }
    }
    var script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = function () { script.setAttribute('data-load-state', 'ok'); if (callback) callback(null); };
    script.onerror = function () { script.setAttribute('data-load-state', 'error'); if (callback) callback('script_load_failed'); };
    document.body.appendChild(script);
  }

  /** Warm the SDK while the user reads the paywall, so the tap does not pay the download cost. */
  function preload() { try { _loadScript(null); } catch (_) {} }

  /** Razorpay is always *offerable* on the web; a failed SDK load is a runtime outcome, not readiness. */
  function isReady() { return true; }

  /**
   * @param {{planType:string, userId:string, isCurrent:function}} req
   * @param {function} done  called exactly once with a normalised result
   */
  function purchase(req, done) {
    var R = _R();
    var planType = req.planType;
    var isCurrent = req.isCurrent || function () { return true; };
    var finished = false;
    function finish(result) { if (finished) return; finished = true; done(result); }

    console.info('[PaymentFlow] PAYMENT_INITIATED | plan: ' + planType + ' | uid: ' + req.userId);

    _loadScript(function (loadErr) {
      if (!isCurrent()) return;
      if (loadErr || typeof root.Razorpay === 'undefined') {
        finish({ code: R.LOAD_FAILED, provider: 'razorpay', message: _t('paywall.svcUnavailable') });
        return;
      }

      _getIdToken(function (idToken) {
        if (!isCurrent()) return;
        if (!idToken) { finish({ code: R.NOT_SIGNED_IN, provider: 'razorpay', message: _t('paywall.loginToContinue') }); return; }

        fetch('/api/payment?action=create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken, 'X-Session-Id': (root.Session ? root.Session.id() : '') },
          /* `plan` only. No amount is sent, so none can be forged. */
          body: JSON.stringify({ plan: planType })
        })
          .then(function (resp) {
            if (!isCurrent()) return null;
            if (!resp.ok) {
              return resp.json().catch(function () { return {}; }).then(function (errData) {
                finish({ code: R.ORDER_FAILED, provider: 'razorpay',
                  message: (errData && errData.error && errData.error.message) || _t('paywall.couldNotCreate') });
                return null;
              });
            }
            return resp.json();
          })
          .then(function (data) {
            if (!isCurrent() || !data) return;
            if (!data.orderId) { finish({ code: R.ORDER_FAILED, provider: 'razorpay', message: _t('paywall.couldNotCreate') }); return; }

            console.info('[PaymentFlow] ORDER_CREATED | plan: ' + planType + ' | orderId: ' + data.orderId);
            var options = {
              key: RAZORPAY_LIVE_KEY,
              order_id: data.orderId,
              amount: data.amount,          /* display only — echoed from the server-created order */
              currency: 'INR',
              name: 'QuantReflex',
              description: 'Premium · ' + planType,
              modal: { ondismiss: function () { finish({ code: R.CANCELLED, provider: 'razorpay', message: _t('paywall.cancelled') }); } },
              handler: function (response) {
                if (!isCurrent()) return;
                var paymentId = response.razorpay_payment_id;
                var rzpOrderId = response.razorpay_order_id;
                var signature = response.razorpay_signature;
                if (!paymentId || !rzpOrderId || !signature) {
                  finish({ code: R.VERIFY_FAILED, provider: 'razorpay', message: _t('paywall.verificationFailed') });
                  return;
                }
                console.info('[PaymentFlow] PAYMENT_SUCCESS | paymentId: ' + paymentId + ' | orderId: ' + rzpOrderId);

                /* A fresh token: checkout can sit open long enough for the original to age out. */
                _getIdToken(function (freshToken) {
                  fetch('/api/payment?action=verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (freshToken || idToken), 'X-Session-Id': (root.Session ? root.Session.id() : '') },
                    body: JSON.stringify({ orderId: rzpOrderId, paymentId: paymentId, signature: signature })
                  })
                    .then(function (r) {
                      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (e) { return { success: false, _serverError: (e && e.error && e.error.message) || null }; });
                      return r.json();
                    })
                    .then(function (result) {
                      if (!result || !result.success) {
                        finish({ code: R.VERIFY_FAILED, provider: 'razorpay',
                          message: (result && result._serverError) || _t('paywall.activationFailed') });
                        return;
                      }
                      console.info('[PaymentFlow] PAYMENT_VERIFIED | plan: ' + result.plan);
                      /* The server granted the entitlement. This is a report of that fact, not a grant. */
                      finish({ code: R.OK, provider: 'razorpay', plan: result.plan, expiry: result.expiry, paymentId: paymentId });
                    })
                    .catch(function () { finish({ code: R.VERIFY_FAILED, provider: 'razorpay', message: _t('paywall.activationFailed') }); });
                });
              }
            };

            try {
              var rzp = new root.Razorpay(options);
              rzp.on('payment.failed', function (resp) {
                console.error('[PaymentFlow] PAYMENT_FAILED | Razorpay error:', resp.error);
                finish({ code: R.FAILED, provider: 'razorpay', message: _t('paywall.failed') });
              });
              console.info('[PaymentFlow] RAZORPAY_OPENED');
              rzp.open();
            } catch (_) {
              finish({ code: R.LOAD_FAILED, provider: 'razorpay', message: _t('paywall.couldNotOpen') });
            }
          })
          .catch(function () {
            if (!isCurrent()) return;
            finish({ code: R.ORDER_FAILED, provider: 'razorpay', message: _t('paywall.couldNotConnect') });
          });
      });
    });
  }

  root.QRPaymentsRazorpay = { id: 'razorpay', isReady: isReady, preload: preload, purchase: purchase };

})(typeof self !== 'undefined' ? self : this);
