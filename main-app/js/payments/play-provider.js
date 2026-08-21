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
  var _prepared = false;      /* prepare() has reached a FINAL answer — see _FINAL_FALSE below */
  var _preparing = null;      /* in-flight promise, so a double-tap cannot start two probes */

  /* ADR-169 — WHICH "no" IS PERMANENT, AND WHICH IS JUST "not yet".
     `_prepared` used to be set on EVERY completion, so the first `false` was final for the lifetime of
     the page. Measured in a browser against a fully working Play environment: with the ID token
     momentarily unavailable, prepare() answered false and then kept answering false forever, even
     after the token worked — so one network blip, or opening the paywall a moment before auth settled,
     left a Play user in reader mode until they force-quit the app. That is the same failure shape as a
     paying user being latched to free by a hiccuped startup hydration, which this codebase already
     treats as a defect.
     The memoisation itself is still right — the payment path must not change under the user
     mid-checkout — but only for answers that CANNOT change while this document is alive:
       · ready === true                          → final, and the only answer that enables a purchase
       · not_play_distribution / no_digital_goods_api / no_skus_requested
                                                 → final: isPlayDistribution() is memoised per boot,
                                                   the DGA constructor does not appear later, and the
                                                   SKU list is a constant.
     Everything else — an unreachable billing backend, a missing product an operator may publish, a
     server flag an operator may switch on, an absent ID token — is a "not yet" and is re-probed the
     next time the UI asks. Re-probing cannot make anything unsafe: it can only turn a CTA ON, the
     purchase path re-checks isReady() itself, and the server verifies every token regardless. */
  var _FINAL_FALSE = { not_play_distribution: 1, no_digital_goods_api: 1, no_skus_requested: 1 };

  /* ADR-173 — WHY THE PURCHASE CONTROL IS ABSENT, VISIBLE FROM THE DEVICE.
     Reader mode has six distinct causes and they look identical to the user: the catalogue did not
     resolve, one SKU is missing, the Digital Goods API is not exposed at all, the server flag is off,
     the ID token was unavailable, or the probe threw. `prepare()` already console.info's the reason,
     but a console line needs `chrome://inspect` and a computer — which is exactly what an operator
     testing an internal-testing build on a phone does not have. So the last reason is retained and
     surfaced through js/services/report-context.js, i.e. through the in-app bug report the app already
     has. Diagnostic only: nothing reads it to make a decision, and it can never enable a purchase. */
  var _lastReason = 'not_prepared';
  function lastReason() { return _lastReason; }

  /* ADR-176 — HAS READINESS BEEN ESTABLISHED AT ALL YET?
     Distinct from `_prepared`, which since ADR-169 means "this answer is FINAL". A retryable false —
     the server flag off, a product not yet published, the ID token not yet available — leaves
     `_prepared` false forever, so it cannot tell the UI whether a first probe has even run. The paywall
     needs that difference: before the first probe completes, "no purchase control" is PENDING, not a
     verdict, and rendering the permanent "not available in this version" copy at that moment is the
     false state this ADR exists to remove. */
  var _completedOnce = false;
  function settled() { return _completedOnce; }

  /* ADR-176 — IS A NEGATIVE ANSWER PERMANENT FOR THIS DOCUMENT?
     `_prepared` already encodes exactly that (see _FINAL_FALSE), but nothing outside this file could
     read it, so the paywall had only two renderings for "no": a spinner or the permanent
     "not available in this version" copy. A retryable no — the operator flag off, a product not yet
     published, the probe threw, auth not settled — was therefore reported with permanent copy, which
     is the false state the owner saw on the Play build. Exposed so the UI can offer a retry instead. */
  function isFinal() { return _prepared === true; }

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
  /* Resolves true / false / null, where null means "we could not even ask" — no ID token yet, because
     auth has not settled or the user is signed out. ADR-176: that is NOT the operator having switched
     Play billing off, and reporting it as `server_disabled` made an ordinary cold-start race look like
     a configuration failure. */
  function _serverEnabled() {
    return new Promise(function (resolve) {
      _getIdToken(function (idToken) {
        if (!idToken) { resolve(null); return; }
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
      _lastReason = 'no_platform_module';
      _prepared = true; _ready = false; _completedOnce = true;
      return Promise.resolve(done(false));
    }

    _preparing = Promise.resolve()
      .then(function () { return plat.canUsePlayBilling(SKUS); })
      .then(function (verdict) {
        if (!verdict || verdict.ok !== true) {
          var reason = (verdict && verdict.reason) || 'unknown';
          _lastReason = reason;
          console.info('[PaymentFlow] PLAY_NOT_USABLE | ' + reason);
          return { ready: false, final: !!_FINAL_FALSE[reason] };
        }
        /* The Digital Goods `service` handle is deliberately NOT retained: the purchase runs through
           PaymentRequest, which needs only the SKU. Holding a stale handle would invite someone to use
           it later against a catalogue that may have changed.
           Only now ask the server. Ordered this way so a web/PWA user never issues this call at all. */
        return _serverEnabled().then(function (enabled) {
          if (enabled === null) {
            _lastReason = 'awaiting_auth';
            console.info('[PaymentFlow] PLAY_AWAITING_AUTH | no id token yet — not a verdict');
            return { ready: false, final: false };
          }
          _lastReason = enabled ? 'ok' : 'server_disabled';
          if (!enabled) console.info('[PaymentFlow] PLAY_SERVER_DISABLED | reader mode');
          /* An operator can switch `config/playBilling` on, and an ID token can start working, without
             this document reloading — so a server "no" is never final. */
          return { ready: enabled === true, final: enabled === true };
        });
      })
      .catch(function (err) {
        /* Fails CLOSED. An error establishing readiness is not permission to offer a purchase — but it
           is also not evidence that Play billing is permanently unusable, so it stays re-probeable. */
        _lastReason = 'prepare_threw:' + String((err && err.message) || err).slice(0, 60);
        console.warn('[PaymentFlow] PLAY_PREPARE_FAILED | ' + ((err && err.message) || err));
        return { ready: false, final: false };
      })
      .then(function (v) {
        _ready = !!(v && v.ready === true);
        _prepared = !!(v && v.final === true);
        _completedOnce = true;
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

  root.QRPaymentsPlay = { id: 'play', isReady: isReady, prepare: prepare, purchase: purchase,
                          lastReason: lastReason, settled: settled, isFinal: isFinal };

})(typeof self !== 'undefined' ? self : this);
