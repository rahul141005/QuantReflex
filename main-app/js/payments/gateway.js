/**
 * gateway.js — THE provider-neutral payment facade (ADR-144, Phase-4 WS4).
 *
 *   UI (paywall.js)  →  QRPayments  →  provider adapter  →  existing canonical server pipeline
 *                                      ├── razorpay-provider.js
 *                                      └── play-provider.js   (boundary only until WS5)
 *
 * WHAT THIS LAYER IS
 * Routing, lifecycle and normalisation. It decides WHICH provider is allowed to run, owns the
 * concerns every provider needs identically (one purchase in flight, a stale-callback guard, the
 * slow/timeout timers), and translates whatever the adapter reports into one small vocabulary the UI
 * can render without knowing which provider produced it.
 *
 * WHAT THIS LAYER IS NOT
 * It is NOT a place for payment validation, price arithmetic, or entitlement logic. Prices come from
 * the server (`PLAN_CONFIG`), payments are verified server-side, and entitlement is granted only by
 * `aiService.activatePremium`. Duplicating any of that here would create a second source of truth for
 * money — the exact failure WS1–WS3 exist to prevent. The facade never grants anything.
 *
 * PROVIDER SELECTION IS ASYMMETRIC, AND THAT IS THE WHOLE POINT
 * Selection reuses `QRPlatform.isPlayDistribution()`, which is a WEAK-evidence OR: any hint of a Play
 * build at all (android-app:// referrer, ?src=play, Digital Goods API present) selects the Play
 * provider. Charging for digital goods inside a Play app through anything but Play Billing is the one
 * unrecoverable Play-policy violation, so the cost of being wrong is deliberately lopsided:
 *
 *   wrong "play"     → a web user loses one payment method for that session (recoverable)
 *   wrong "razorpay" → the Play listing is removed (not recoverable)
 *
 * THEREFORE: "the Play adapter is not ready" NEVER means "fall back to Razorpay". It means there is
 * no purchase path, and the UI must show none. `canPurchase()` returning false is a complete answer,
 * not a prompt to try the other provider. `payment-facade.check.js` asserts this by construction —
 * there is no code path from a Play verdict to the Razorpay adapter.
 */
(function (root) {
  'use strict';

  var PROVIDER_RAZORPAY = 'razorpay';
  var PROVIDER_PLAY = 'play';

  /* The complete normalised vocabulary. Adapters translate provider-specific failures into these, so
     the paywall renders one set of messages regardless of who failed. Adding a provider must not add
     a code — if it needs one, the vocabulary was wrong. */
  var RESULT = {
    OK: 'OK',                                   /* verified + entitlement granted server-side */
    CANCELLED: 'CANCELLED',                     /* user dismissed the sheet — not an error */
    PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE', /* no usable provider for this platform (yet) */
    LOAD_FAILED: 'LOAD_FAILED',                 /* provider SDK could not be loaded */
    NOT_SIGNED_IN: 'NOT_SIGNED_IN',
    ORDER_FAILED: 'ORDER_FAILED',               /* server refused to open the order */
    VERIFY_FAILED: 'VERIFY_FAILED',             /* payment taken/attempted but not verified */
    FAILED: 'FAILED'                            /* provider reported a payment failure */
  };

  var PURCHASE_TIMEOUT_MS = 120000;
  var PURCHASE_SLOW_MS = 5000;

  var _busy = false, _attemptId = 0, _safetyTimer = null, _slowTimer = null;

  function _adapter(id) {
    if (id === PROVIDER_PLAY) return root.QRPaymentsPlay || null;
    if (id === PROVIDER_RAZORPAY) return root.QRPaymentsRazorpay || null;
    return null;
  }

  /**
   * Which provider owns purchases on this device? Deterministic and stable for the session, because
   * QRPlatform memoises its verdict per boot — the payment path must not change under the user
   * mid-checkout.
   * @returns {string} 'razorpay' | 'play'
   */
  function providerId() {
    var p = root.QRPlatform;
    /* Fail SAFE, not fail open: with no platform module we cannot prove this is NOT a Play build, and
       guessing Razorpay is the unrecoverable direction. Answer 'play', which resolves to no purchase
       path rather than to the wrong one. */
    if (!p || typeof p.isPlayDistribution !== 'function') return PROVIDER_PLAY;
    return p.isPlayDistribution() ? PROVIDER_PLAY : PROVIDER_RAZORPAY;
  }

  /**
   * May a purchase be offered at all right now? The UI must call this before rendering any CTA.
   * False is a complete answer — it never implies "try the other provider".
   */
  function canPurchase() {
    var a = _adapter(providerId());
    return !!(a && typeof a.isReady === 'function' && a.isReady() === true);
  }

  function _clearTimers() {
    if (_safetyTimer) { clearTimeout(_safetyTimer); _safetyTimer = null; }
    if (_slowTimer) { clearTimeout(_slowTimer); _slowTimer = null; }
  }

  function _finish(ui, result) {
    _clearTimers();
    _busy = false;
    if (ui && typeof ui.onBusy === 'function') { try { ui.onBusy(false); } catch (_) {} }
    if (ui && typeof ui.onDone === 'function') { try { ui.onDone(result); } catch (_) {} }
  }

  /**
   * Begin a purchase. The facade owns the lifecycle every provider shares; the adapter owns only the
   * provider-specific mechanics and reports back in the normalised vocabulary.
   *
   * @param {string} planType 'premium_6m' | 'premium_12m' — a KEY, never a price. The server resolves
   *        the amount from PLAN_CONFIG; nothing here can influence what the user is charged.
   * @param {string} userId
   * @param {{onBusy?:function, onSlow?:function, onDone?:function, planLabel?:string}} ui
   *        presentation callbacks, plus `planLabel` — the human plan name the UI already owns
   *        ("6 Months"). Passed through so the provider's own checkout sheet can show a name a
   *        customer recognises instead of an internal key. It is DISPLAY DATA only: the amount and
   *        the plan are resolved server-side from `planType`, so nothing here can change what is
   *        charged.
   */
  function purchase(planType, userId, ui) {
    if (_busy) return;

    var id = providerId();
    var adapter = _adapter(id);
    /* The single most important branch in this file: an unusable provider ends the attempt. There is
       deliberately no `else` reaching for a different adapter. */
    if (!adapter || typeof adapter.isReady !== 'function' || adapter.isReady() !== true) {
      _finish(ui, { code: RESULT.PROVIDER_UNAVAILABLE, provider: id });
      return;
    }

    _busy = true;
    var attempt = ++_attemptId;
    function isCurrent() { return attempt === _attemptId; }

    if (ui && typeof ui.onBusy === 'function') { try { ui.onBusy(true); } catch (_) {} }

    _clearTimers();
    _slowTimer = setTimeout(function () {
      if (isCurrent() && _busy && ui && typeof ui.onSlow === 'function') { try { ui.onSlow(); } catch (_) {} }
    }, PURCHASE_SLOW_MS);
    /* Abandoned attempt: bump the id so any late adapter callback is recognised as stale and dropped,
       then release the UI. Without this a wedged provider leaves the CTA disabled forever. */
    _safetyTimer = setTimeout(function () { ++_attemptId; _finish(ui, { code: RESULT.FAILED, provider: id, timedOut: true }); }, PURCHASE_TIMEOUT_MS);

    adapter.purchase({ planType: planType, userId: userId, isCurrent: isCurrent,
                       planLabel: (ui && ui.planLabel) || null }, function (result) {
      if (!isCurrent()) return;                 /* a stale callback must never touch the UI */
      _finish(ui, result || { code: RESULT.FAILED, provider: id });
    });
  }

  /** Warm the ACTIVE provider's SDK, if it has one. Named neutrally so the paywall never learns which
      provider it is warming — and a no-op for a provider that cannot purchase. */
  function preloadProvider() {
    if (!canPurchase()) return;
    var a = _adapter(providerId());
    if (a && typeof a.preload === 'function') { try { a.preload(); } catch (_) {} }
  }

  /**
   * Restore access. Deliberately PROVIDER-NEUTRAL and identical on every platform: entitlement lives
   * on the server, so restoring is re-reading server truth — there is nothing provider-specific to do.
   *
   * This is why Restore stays available in a Play build that cannot yet purchase: someone who bought
   * on the web must be able to unlock the Play app. It can only ever REFRESH from the server; it
   * cannot grant, and it never inspects local state to decide entitlement (ADR-142/WS3).
   */
  function restore(callback) {
    var fs = root.FirestoreSync;
    if (!fs || typeof fs.refreshFromServer !== 'function') {
      if (callback) callback(false);
      return;
    }
    fs.refreshFromServer(function (ok) { if (callback) callback(!!ok); });
  }

  root.QRPayments = {
    PROVIDER_RAZORPAY: PROVIDER_RAZORPAY,
    PROVIDER_PLAY: PROVIDER_PLAY,
    RESULT: RESULT,
    providerId: providerId,
    canPurchase: canPurchase,
    preloadProvider: preloadProvider,
    purchase: purchase,
    restore: restore
  };

})(typeof self !== 'undefined' ? self : this);
