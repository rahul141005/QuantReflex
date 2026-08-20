/**
 * platform.js — THE single source of platform truth (ADR-142, Phase-4 WS1).
 *
 * Pure + dependency-free, loaded before app.js, exposed as `window.QRPlatform`. It replaces three
 * independently-drifting `display-mode: standalone` detectors (js/app.js, js/duel-manager.js,
 * js/services/report-context.js), which all answered the same question — "is this an installed app?" —
 * and none of which could tell an installed PWA from a Play-store TWA.
 *
 * WHY THAT DISTINCTION IS THE WHOLE POINT
 * A Trusted Web Activity renders this exact origin inside Chrome. It matches
 * `display-mode: standalone`, so every existing detector classifies it as `pwa-mode` — and a
 * `pwa-mode` build offers Razorpay. Charging for digital goods inside a Play app through anything but
 * Play Billing is the one unrecoverable Play-policy violation: it gets the listing removed, and no
 * amount of client-side repair afterwards undoes that. So the two questions this module answers are
 * deliberately ASYMMETRIC:
 *
 *   isPlayDistribution()  — WEAK evidence, OR-ed.  Any hint at all ⇒ treat as a Play build and
 *                           SUPPRESS Razorpay. A false positive costs a web user one payment method
 *                           (recoverable). A false negative costs the listing (not recoverable).
 *
 *   canUsePlayBilling()   — STRONG evidence, AND-ed. Everything must line up before we offer to take
 *                           money through Play. Anything less ⇒ reader mode (no purchase UI at all).
 *
 * The gap between them is intentional: a build that looks like Play but cannot actually transact shows
 * NEITHER payment path. That is the correct, policy-safe failure mode — never "fall back to Razorpay".
 *
 * COMPUTED PER BOOT, NEVER PERSISTED
 * A TWA shares Chrome's profile storage with ordinary browsing of the same origin. A cached
 * `isTwa: true` flag would therefore leak into a normal browser tab and permanently hide Razorpay from
 * a web user — and a cached `false` would expose Razorpay inside the Play build. Neither is acceptable,
 * so nothing here is ever written to localStorage. Evaluated once per page load and memoised in memory
 * only, which is also what keeps the answer stable across a session (matchMedia can change mid-session
 * when a PWA window is resized; the payment path must not change under the user's feet mid-checkout).
 */
(function (root) {
  'use strict';

  var doc = root.document;

  function _safe(fn, fallback) {
    try { var v = fn(); return (v === undefined) ? fallback : v; } catch (_) { return fallback; }
  }

  /* ── installed-app detection (the behaviour the three old detectors shared, verbatim) ─────────── */

  function _detectStandalone() {
    return _safe(function () {
      if (root.matchMedia && (
        root.matchMedia('(display-mode: standalone)').matches ||
        root.matchMedia('(display-mode: fullscreen)').matches
      )) return true;
      /* iOS Safari's pre-standard flag. Kept for parity with the detectors this replaces. */
      if (root.navigator && root.navigator.standalone === true) return true;
      return false;
    }, false);
  }

  /* ── Play-distribution evidence (each weak on its own; OR-ed) ─────────────────────────────────── */

  /* The Android application id this origin is asset-linked to. Kept in sync with the canonical definition in
     services/playBillingService.js (CANONICAL_PACKAGE_NAME) and with .well-known/assetlinks.json by
     scripts/platform.check.js — this module stays dependency-free by design, so it cannot import it. */
  var TWA_PACKAGE = 'com.quantreflex.app';

  /* The shared per-tab latch. SESSION scope, deliberately not the storage-registry: registry keys are
     user-scoped and purged on logout, whereas this describes the CONTAINER, which does not change when the
     user signs out. Both Play markers below latch through it, so whichever one the build actually raises
     survives the full-page navigations this app performs. */
  var _SRC_KEY = 'qr_src_play';

  /* 1. The TWA launch referrer. Chrome sets `android-app://<package>` on the document that the Android app
        launched.

        ADR-156 — IT MUST BE **OUR** PACKAGE, AND IT MUST BE LATCHED. Neither was true, and each omission
        produced one of the two failures this module exists to prevent:

        (a) FALSE POSITIVE — the old test was `/^android-app:\/\//`, i.e. ANY Android app. Chrome sets that
            referrer whenever a link is opened from an app that supplies one, so every visitor who tapped a
            quantreflex.app link inside WhatsApp, Gmail or Instagram arrived as `android-app://com.whatsapp`,
            was classified a Play build, and — the Play adapter being deliberately not ready — was shown "no
            purchase path" with no way to pay. That is exactly the revenue-losing failure ADR-154 removed from
            the Digital Goods signal, still live through this one. Link-sharing is how this audience arrives,
            so it was not an edge case. Matching our own package closes it completely: no other app can put
            `android-app://com.quantreflex.app` in the referrer.

        (b) FALSE NEGATIVE — the referrer is set on the LAUNCH document only, and this app performs full-page
            navigations (js/settings.js reloads on several settings changes; `location.href = pathname` on
            another). After any of them the signal vanished. With manifest start_url `/` — carrying no
            `?src=play` for _srcSignal() to latch — isPlayDistribution() then flipped to false INSIDE the real
            Play build, and js/payments/gateway.js:77 answers that by offering Razorpay. Charging for digital
            goods through Razorpay inside a Play app is the one unrecoverable Play-policy violation in this
            program. Latching into the same sessionStorage key `?src=play` uses fixes it: SESSION scope, so it
            still dies with the tab and can never leak into ordinary browsing of this origin.

        The two markers stay independent — a real TWA raises this one, and raises `?src=play` too when the
        build sets that launch URL — so either alone is sufficient and neither can be forged by a web page. */
  function _referrerSignal() {
    return _safe(function () {
      var ref = String(doc && doc.referrer || '');
      if (new RegExp('^android-app://' + TWA_PACKAGE.replace(/\./g, '\\.') + '(?:/|$)', 'i').test(ref)) {
        _safe(function () { root.sessionStorage.setItem(_SRC_KEY, '1'); });
        return true;
      }
      return _safe(function () { return root.sessionStorage.getItem(_SRC_KEY) === '1'; }, false);
    }, false);
  }

  /* 2. An explicit build marker. The TWA's start_url carries `?src=play`, and because that survives
        only until the first navigation it is latched into sessionStorage — SESSION scope, not local:
        it must die with the tab so it can never leak into ordinary browsing of this origin later.
        (Deliberately not routed through the storage-registry: registry keys are user-scoped and
        purged on logout, whereas this describes the CONTAINER, which does not change when the user
        signs out.) */
  function _srcSignal() {
    return _safe(function () {
      var q = String(root.location && root.location.search || '');
      if (/[?&]src=play\b/i.test(q)) {
        _safe(function () { root.sessionStorage.setItem(_SRC_KEY, '1'); });
        return true;
      }
      return _safe(function () { return root.sessionStorage.getItem(_SRC_KEY) === '1'; }, false);
    }, false);
  }

  /* 3. The Digital Goods API. Only Chrome-in-a-TWA exposes it, and only when the app was installed
        through a store. Presence of the constructor is weak evidence (it does not prove the Play
        backend resolves); actually resolving it is the STRONG signal used by canUsePlayBilling. */
  function _dgaPresent() {
    return _safe(function () { return typeof root.getDigitalGoodsService === 'function'; }, false);
  }

  var PLAY_BILLING_SERVICE_URL = 'https://play.google.com/billing';

  /* ── memoised, per-boot ───────────────────────────────────────────────────────────────────────── */

  var _standalone = null, _playDist = null;

  function isStandalone() {
    if (_standalone === null) _standalone = _detectStandalone();
    return _standalone;
  }

  /**
   * Weak-evidence OR. True if ANY signal suggests this document is running inside the Play build.
   * Callers must read this as "do not offer Razorpay", not as "Play Billing works".
   */
  function isPlayDistribution() {
    if (_playDist === null) {
      /* ADR-154 — DGA PRESENCE IS NOT EVIDENCE OF PLAY DISTRIBUTION, AND USING IT COST REAL REVENUE.
         `getDigitalGoodsService` is exposed by Chrome on Android in ORDINARY BROWSER TABS, not only
         inside a TWA. So every Android web visitor tripped this signal, was classified as a Play
         build, and — because the Play adapter is deliberately not ready — was shown "Purchasing isn't
         available in this version of the app yet" with no way to pay. Desktop Chrome does not expose
         the API, which is why the same page offered "Start Premium" there and nowhere else. On an
         Indian exam-prep audience that is most of the traffic.
         The two remaining signals are DELIBERATE MARKERS a browser cannot fake into existence: an
         `android-app://` referrer, and the `?src=play` start_url parameter the TWA manifest carries
         (latched into sessionStorage for the tab's life). A real TWA raises BOTH, independently — the
         DGA check was only ever the redundant third, and it is the only one that produces false
         positives. It is kept below for canUsePlayBilling(), where "is the API even present" is the
         right question; it just no longer decides WHICH STORE the user belongs to.
         ADR-144's fail-safe direction is unchanged: if either real marker is present we still answer
         Play, which resolves to no purchase path rather than to Razorpay inside a Play app. */
      /* ADR-168 — EVALUATE BOTH, NEVER SHORT-CIRCUIT. `a || b` stops at the first true, and both of
         these signals LATCH as a side effect of being read. A real TWA launch document carries BOTH
         markers, so `||` meant the referrer answered first and `_srcSignal()` never ran — the
         `?src=play` latch was therefore never written on precisely the build that carries it, and the
         next full-page navigation (js/settings.js reloads on several settings changes, js/session.js
         on logout/expiry) lost every marker at once. That is the shipped v283 behaviour, reproduced
         in a browser against the deployed bytes: launch answered `play`, one reload answered
         `razorpay` — Razorpay inside a Play app, the one unrecoverable Play-policy violation.
         ADR-156 fixed it from the other end by latching the referrer too, which makes the two writes
         independent again. This line stops the fix from depending on that: read BOTH signals so BOTH
         latch, and the verdict no longer turns on which one is tested first. */
      var _refSig = _referrerSignal();
      var _srcSig = _srcSignal();
      _playDist = _refSig || _srcSig;
    }
    return _playDist;
  }

  /** The runtime container, for the body/documentElement class and for bug-report context. */
  function mode() {
    if (isPlayDistribution()) return 'twa-mode';
    return isStandalone() ? 'pwa-mode' : 'web-mode';
  }

  /** Installed-app surfaces (Math Duel's ADR-038 gate) treat a TWA as installed — it is one. */
  function isInstalledApp() { return isStandalone() || isPlayDistribution(); }

  /**
   * Strong-evidence AND. Resolves the Digital Goods service against the Play billing backend and
   * confirms both SKUs are actually purchasable. Async because every part of it is.
   *
   * Returns {ok, reason, service, details[]}. `ok:false` means READER MODE — show no purchase UI at
   * all. It must NEVER be read as permission to fall back to Razorpay: isPlayDistribution() has
   * already said this is a Play build, and that verdict does not soften because billing is unavailable.
   *
   * @param {string[]} skus product ids that must all resolve (supplied by the caller so this module
   *        stays free of product knowledge — the server-side allowlist remains the authority).
   */
  function canUsePlayBilling(skus) {
    var wanted = (skus && skus.length) ? skus.slice() : [];
    if (!isPlayDistribution()) return Promise.resolve({ ok: false, reason: 'not_play_distribution', details: [] });
    if (!_dgaPresent()) return Promise.resolve({ ok: false, reason: 'no_digital_goods_api', details: [] });
    if (!wanted.length) return Promise.resolve({ ok: false, reason: 'no_skus_requested', details: [] });

    return Promise.resolve()
      .then(function () { return root.getDigitalGoodsService(PLAY_BILLING_SERVICE_URL); })
      .then(function (service) {
        if (!service || typeof service.getDetails !== 'function') {
          return { ok: false, reason: 'service_unavailable', details: [] };
        }
        return Promise.resolve(service.getDetails(wanted)).then(function (details) {
          var list = details || [];
          var found = {};
          for (var i = 0; i < list.length; i++) { if (list[i] && list[i].itemId) found[list[i].itemId] = true; }
          for (var j = 0; j < wanted.length; j++) {
            if (!found[wanted[j]]) {
              /* A partially-configured Play Console is the dangerous middle state: one product live,
                 the other not. Offering a half-catalogue would let a user buy the plan we happened to
                 configure rather than the one they chose. All or nothing. */
              return { ok: false, reason: 'sku_missing:' + wanted[j], service: service, details: list };
            }
          }
          return { ok: true, reason: 'ok', service: service, details: list };
        });
      })
      .catch(function (err) {
        /* Fails CLOSED. An unreachable billing backend must not degrade into "no Play build here". */
        return { ok: false, reason: 'error:' + String((err && err.message) || err).slice(0, 80), details: [] };
      });
  }

  /** Apply the container class. Exactly one of web-mode / pwa-mode / twa-mode, on both elements. */
  function applyModeClasses() {
    var m = mode();
    _safe(function () {
      var all = ['web-mode', 'pwa-mode', 'twa-mode'];
      [doc.documentElement, doc.body].forEach(function (el) {
        if (!el) return;
        for (var i = 0; i < all.length; i++) el.classList.remove(all[i]);
        el.classList.add(m);
        /* A TWA is also an installed app: keep `pwa-mode` alongside it so the ~40 existing CSS rules
           and the Duel install gate keep working unchanged. `twa-mode` is purely additive. */
        if (m === 'twa-mode') el.classList.add('pwa-mode');
      });
    });
    return m;
  }

  var API = {
    PLAY_BILLING_SERVICE_URL: PLAY_BILLING_SERVICE_URL,
    isStandalone: isStandalone,
    isPlayDistribution: isPlayDistribution,
    isInstalledApp: isInstalledApp,
    canUsePlayBilling: canUsePlayBilling,
    mode: mode,
    applyModeClasses: applyModeClasses
  };

  root.QRPlatform = API;
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }

})(typeof self !== 'undefined' ? self : this);
