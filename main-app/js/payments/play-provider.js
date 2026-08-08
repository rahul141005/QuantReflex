/**
 * play-provider.js — the Google Play Billing adapter BOUNDARY (ADR-144, Phase-4 WS4).
 *
 * THIS IS NOT AN IMPLEMENTATION, AND DELIBERATELY SO.
 *
 * Real Play purchasing needs a Play Console application, two managed products, server-side
 * verification against androidpublisher, and RTDN — none of which exist yet. That work is WS5/WS6.
 * Writing a speculative version here would be worse than writing nothing:
 *
 *   · it would guess at API shapes we have not verified against a real store, and guesses in a
 *     payment path are how money goes missing;
 *   · a half-real adapter can report `isReady() === true` and then fail mid-flow, which is exactly the
 *     state where a UI is tempted to "just fall back" to the other provider — the one unrecoverable
 *     Play-policy violation;
 *   · it would make the abstraction *look* finished, which is the failure mode the certification audit
 *     already caught once (an API shipped with no caller, and the docs called it done).
 *
 * So this file does one honest thing: it declares the seam, and refuses.
 *
 * WHAT "REFUSES" MEANS
 * `isReady()` returns false. The facade therefore reports `canPurchase() === false` and answers any
 * purchase attempt with `PROVIDER_UNAVAILABLE`. The paywall renders the value proposition with NO
 * purchase control at all. There is no code path from here to the Razorpay adapter — not a fallback,
 * not a retry, not a redirect to a website. "Play is not ready" resolves to *no purchase*, never to
 * *a different provider*.
 *
 * RESTORE IS UNAFFECTED — and that matters. Restore is provider-neutral (it re-reads server truth via
 * `QRPayments.restore`), so a user who bought Premium on the web can still unlock the Play build
 * today. It refreshes an existing entitlement through the canonical path; it can never grant one.
 *
 * WHAT WS5 CHANGES HERE — and nothing outside this file
 *   1. `isReady()` → `QRPlatform.canUsePlayBilling([...])` resolving true (strong-evidence AND: the
 *      Digital Goods service resolves AND every SKU comes back).
 *   2. `purchase()` → run the Play purchase flow, then hand the resulting purchase token to the
 *      server for verification (`?action=verify-play`), and report the server's verdict back in the
 *      SAME normalised vocabulary this file already speaks.
 *
 * The entitlement itself is granted by the existing canonical server pipeline in both cases. Play
 * becomes a second way to *pay*, never a second way to *be premium*.
 */
(function (root) {
  'use strict';

  /**
   * Can Play Billing take money right now? **No, and not until WS5.**
   *
   * Note what this does NOT do: it does not consult `QRPlatform.canUsePlayBilling()`. That predicate
   * answers "is the Play billing service reachable and are the SKUs configured" — a necessary
   * condition, but not a sufficient one while there is no server-side verification to grant against.
   * Returning true on the strength of a resolvable service alone would let a user complete a Play
   * purchase that nothing could verify or honour. Hard-false is the only truthful answer today.
   */
  function isReady() { return false; }

  /**
   * Always refuses, in the facade's normalised vocabulary so the UI needs no Play-specific handling.
   * Called only if something bypassed `isReady()` — the facade checks first — so this is the
   * belt-and-braces half of the same guarantee.
   */
  function purchase(req, done) {
    var R = root.QRPayments ? root.QRPayments.RESULT : {};
    console.warn('[PaymentFlow] PURCHASE_REFUSED | Play Billing is not implemented yet (WS5) — no fallback provider is offered by design');
    done({
      code: R.PROVIDER_UNAVAILABLE || 'PROVIDER_UNAVAILABLE',
      provider: 'play',
      /* No `message`: the paywall renders provider-neutral copy for this state. A provider-specific
         string here would leak Play vocabulary into a UI that must stay neutral. */
      pendingWorkstream: 'WS5'
    });
  }

  root.QRPaymentsPlay = { id: 'play', isReady: isReady, purchase: purchase };

})(typeof self !== 'undefined' ? self : this);
