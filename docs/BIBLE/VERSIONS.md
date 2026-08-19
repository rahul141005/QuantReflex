# QuantReflex Bible — Versioning System

**This file is the authoritative version registry for the QuantReflex Bible.**
Every governed change updates the relevant version number here and records a migration note.

---

## Current Versions

| Track | Version | Meaning |
|---|---|---|
| **Bible Version** | 2.187 | The documentation set as a whole (these `/docs/BIBLE/` files). |
| **Architecture Version** | 2.82 | App topology, service boundaries, data-flow contracts. |
| **Firestore Version** | 2.35 | Collection/field/path schema + indexes. |
| **Security Version** | 2.21 | Auth model, rules, claims, abuse controls. |
| **Payment Version** | 2.17 | Razorpay flows, plan config, entitlement grant logic. |

> **2.187 (2026-08-19)** — **A failed startup hydration must be recoverable (ADR-157).**
> `loadFromFirestore` gives up after bounded retries with `_memoryCache` null — the right fail direction —
> but the live user-doc listener, the only other path that could deliver the entitlement, refused to act on
> exactly that state. A paying user whose connection hiccuped at startup was latched to free chrome and the
> 20-question wall for the whole session, recoverable only by relaunching. The listener now adopts the
> snapshot it is already holding, still subject to the ADR-115/117 expiry rule and still standing down
> during the ADR-152 purge gap.

> **2.186 (2026-08-19)** — **The TWA referrer must name OUR package, and must survive a reload
> (ADR-156).** `js/platform.js` tested `/^android-app:\/\//` — any Android app — so every visitor who
> tapped a quantreflex.app link inside WhatsApp or Gmail was classified a Play build and left with no way
> to pay, the same failure ADR-154 removed from the Digital Goods signal. And because the referrer is set
> on the launch document only while this app performs full-page reloads, the signal vanished inside the
> real Play build, where `js/payments/gateway.js` answers a false verdict by offering Razorpay — the one
> unrecoverable Play-policy violation. The referrer now matches `com.quantreflex.app` exactly and latches
> for the tab's life. Two suites had encoded the bug: every referrer fixture named a FOREIGN package.
> Payment Version → 2.17.

> **2.185 (2026-08-19)** — **A guard that exists, but not on the path that needed it (ADR-155).** Seven
> defects filed together because the correct behaviour already existed somewhere and simply was not wired
> to the path that mattered: the exit dialog never froze the session it was asking about (so a countdown
> auto-submitted a blank answer, or ran `finish()`, underneath it); force-exiting while it was open leaked
> QROverlay's scroll lock permanently; "Continue learning" never released `_activeDrillEngine`, pinning
> ADR-153's stand-down ON for the rest of the session; the mistake archive evicted the NEWEST record at the
> cap because hydration leaves the array newest-first; a Review Mistakes deck gave one slot per attempt
> rather than per question; the grader's tolerance was relative, so a ₹8,800 answer accepted ±8.8; and the
> free-cap panel cached an entitlement that can change underneath it. 20 mutations, 20 killed.

> **2.184 (2026-08-13)** — **A background repaint may not outrank the screen the user is on (ADR-151).**
> `FirestoreSync`'s own debounced write echoed back through the ADR-072 listener as a remote change
> (because `updatedAt` counted as one), firing the ADR-118 repaint ~2s after any local save. On
> `practice` that repaint runs `Router.onShow` → `_activeDrillEngine.cleanup()`, and its two stand-down
> guards only cover a session between `begin()` and `finish()` — so it destroyed the pre-session "Begin
> Challenge" screen and the results card, the two places users reported being thrown out of. `updatedAt`
> is still mirrored but no longer marks a change, and both repaint sites (including the previously
> unguarded ADR-117 hydration catch-up) now stand down on `_holdsTransientUi()`, which covers
> `_activeDrillEngine` for the whole engine lifetime. Separately, the drill engine gained a one-shot
> `onStart` hook fired from `begin()` so a free user's daily DI/Reasoning set is spent when they START
> it, not when they open the screen to look at it. Free-user set decks are clamped to the remaining
> daily questions, and the Practice-tab allowance card moved out of `home-view.js`, shows from 0
> (superseding ADR-091's cold-start rule for this card) and reports all three free limits.
> Architecture 2.81→2.82, Bible 2.183→2.184, `APP_VERSION` v278→v279.

> **2.177 (2026-08-08)** — **Provider-neutral payment facade (ADR-144, WS4).** WS1 established
> platform truth but nothing branched on it — a Play/TWA build would have offered Razorpay, the one
> unrecoverable Play-policy violation. `js/payments/` now holds a facade (`QRPayments`) plus two
> adapters; `paywall.js` becomes presentation only and `window.openPremiumPayment` is removed.
> Razorpay's API surface exists in exactly one shipped module. Provider selection is a weak-evidence
> OR on `QRPlatform.isPlayDistribution()`, and **"Play not ready" resolves to no purchase path, never
> to Razorpay** — there is no code path from a Play verdict to the Razorpay adapter. `play-provider.js`
> is a boundary with `isReady()` hard-false, deliberately NOT driven by `canUsePlayBilling()` (a
> reachable billing service is necessary but not sufficient while no server verification exists to
> grant against). Play/TWA renders the value proposition with no purchase control, no external route,
> and Restore intact. Entitlement, refund and ledger behaviour are untouched. Architecture 2.77→2.78,
> **2.181 (2026-08-12)** — **A Play purchase row is reserved before it is granted (ADR-148).** Final
> audit found `purchaseToken`/`acknowledged` written only AFTER the grant in a swallowed catch: if that
> write failed the row matched neither half of the reconcile sweep (a MISSING field does not match
> `== false`), so an unacknowledged purchase was auto-refunded by Google after three days while the
> user kept Premium. The purchased path now reserves the row first, reusing the pending path's
> reservation and `activatePremium`'s existing `completingPending` merge. A failed reservation is now
> fatal (503, retryable) rather than ignored. Payment 2.14→2.15. `play-billing` 89 → 95; the fix is
> mutation-proved (reverting it fails 5 assertions and the sweep scans 0 rows). Three dead
> declarations removed, one of which implied a refund gate that must not exist. 59 suites green.

> **2.180 (2026-08-12)** — **The Play application id becomes a code constant (ADR-147).** The Play
> Console app now exists as `com.quantreflex.app`; the id moves from an absent env var to a constant in
> `services/playBillingService.js`, ratcheted three ways (canonical value · no second literal in
> shipped code · no document naming a different id). Safe because `config/playBilling` is checked
> BEFORE `isConfigured()`, so a known package name cannot open a purchase path on its own.
> `isConfigured()` narrows to "credentials present" and explicitly does not claim Play access has been
> granted. Two live defects fixed: `app.quantreflex.com` never resolved and was in the setup guide, and
> the CORS allowlist omitted the canonical `www.quantreflex.app`. Architecture 2.80→2.81, Payment
> 2.13→2.14. `assetlinks.check` 7→16, `play-billing` 85→89, `play-rtdn` 58→60; 61 suites green.
> **External: still not live — no service-account grant, products, fingerprint or Pub/Sub topic.**

> **2.179 (2026-08-12)** — **WS6: RTDN + reconciliation (ADR-146).** `api/payment/play-rtdn.js`
> (serverless function #11 of 12) plus `?action=play-reconcile`. The notification body is a HINT: only
> the purchase token is read from it, and Google is then asked what is true — which makes duplicate,
> out-of-order, replayed and forged notifications correct by construction rather than by keeping a
> delivery ledger. HTTP status is a retry instruction (200 handled, 401 refused, 500 transient), so a
> transient failure is never acked away. Voided purchases revoke with NO eligibility check of any kind
> (ADR-143), and the no-window ratchet now follows the CALLERS of revocation, not just `revokePayment`.
> Reconciliation is the documented degraded mode and can only acknowledge or revoke — it never grants.
> New `[provider, acknowledged]` index. Architecture 2.79→2.80, Firestore 2.34→2.35, Security
> 2.20→2.21, Payment 2.12→2.13. `play-rtdn.check` 58 assertions; ten mutation runs; 59 suites green.
> **External: no Pub/Sub topic and no live notification has ever arrived — BLOCKED on Play Console.**

> **2.178 (2026-08-12)** — **WS5: server-side Google Play verification (ADR-145).** New
> `services/playBillingService.js` plus `?action=verify-play` and `?action=play-config` on the existing
> payment function (0 new functions). Absence of Play configuration is a first-class fail-safe state,
> not a hole filled with a placeholder: no package name, service account, fingerprint or Play price
> exists in the repository, and while `PLAY_PACKAGE_NAME` is unset every Play path refuses. The package
> name cannot be spoofed because it is a path segment we build, never a client field. `payments/{id}`
> gains `provider` (defaulting to 'razorpay', a fact about history rather than a guess) and
> `acknowledged`. Client `isReady()` requires the Digital Goods catalogue AND the server's consent.
> Architecture 2.78→2.79, Payment 2.11→2.12. `play-billing.check` 85 assertions; fourteen mutation
> runs; 57 suites green. **External: nothing has ever run against the real store — BLOCKED.**

> Payment 2.10→2.11. `payment-facade.check` 44 assertions; seven mutation runs; 56 suites green.
> Certification (2026-08-08) raised it to 56 assertions and corrected the suite count, which this
> line originally recorded as 54. WS5 later raised it again to 65 (ADR-145).

> **2.176 (2026-08-04)** — **24-hour refund policy + manual refund workflow (ADR-143).** A canonical
> business rule: a user may REQUEST a refund only within 24 hours of gateway capture, identically for
> Razorpay, Google Play and any future provider. The repo had no refund policy in code while the
> paywall advertised "7-Day Refund" in all three locales — copy is policy, so that mismatch was a
> commercial liability. New pure `services/refundPolicy.js` is the sole definition of the window and is
> provider-neutral by construction (it takes a timestamp; there is no provider argument to branch on).
> **Eligibility never gates execution:** Google can refund through its own support weeks later, so
> `revokePayment` honours any provider-reported refund at any age and merely annotates
> `refundWithinPolicy`/`refundAgeMs` — ratcheted at source so a window guard cannot be added by
> accident. Three eligibility states, never a boolean: legacy rows with no capture time are neither
> auto-approved nor auto-denied but badged for manual review. The clock starts at GATEWAY CAPTURE
> (new `capturedAtMs`/`capturedAtSource`), never `claimedAt`, and a correction may only move it
> earlier. New `refundRequests` collection + declared state machine
> (pending/approved/rejected/refunded/failed/cancelled); **approving changes no entitlement** — it
> authorises a human to refund at the provider, and only the provider's confirmation revokes. New
> `super-admin-app/api/admin/refunds.js` review queue with audit + user notification. Revenue is now
> gross/refunded/**net** (`revenueTotalINR` keeps its gross meaning so the historical series is not
> retroactively rewritten). Firestore 2.33 to 2.34, Payment 2.9 to 2.10. `refund-policy.check` 45,
> `refund-workflow.check` 78, `entitlement-invariants` 59 to 78, `payment-parity` 26 to 30; five
> mutation runs confirm every guard bites.

> **2.175 (2026-08-04)** — **One platform truth; Restore reachable (ADR-142, PR-2 WS1+WS3).**
> `js/platform.js` replaces three drifting installed-app detectors, none of which could tell an
> installed PWA from a Play-store TWA — a TWA satisfies the installed-app media query, would classify
> as `pwa-mode`, and a `pwa-mode` build offers Razorpay, which inside a Play app is the one
> unrecoverable policy violation. Two deliberately asymmetric predicates: `isPlayDistribution()`
> weak-OR (any hint suppresses Razorpay), `canUsePlayBilling()` strong-AND (all signals, or reader
> mode — never a Razorpay fallback). Computed per boot, never persisted, because a TWA shares Chrome's
> profile storage with ordinary browsing of this origin. `twa-mode` is additive to `pwa-mode`.
> `FirestoreSync.refreshFromServer` had zero callers and is now the paywall's Restore action — one
> button for both providers. WS3's live-entitlement half needed no work: **ADR-118 already closed
> blueprint W6.** Supersedes the ADR-124 `matchMedia`-throw divergence (one detector, fails closed).
> Architecture 2.76→2.77. `platform.check.js` 39 assertions; `report.check.js` now drives the real
> platform.js. **WS4–WS6 not started; WS7 deferred by design** — see `PAYMENT_READINESS.md` §F.
> No payment behaviour changes for any existing user: Razorpay's path is byte-identical and nothing
> yet branches on `twa-mode`.

> **2.174 (2026-08-04)** — **Refunds revoke (ADR-141, PR-1 / Phase-4 WS2).** Foundation for hybrid
> payments; **no Play code** by design, per the blueprint's §13 law that WS2 ships first. Repairs a live
> defect: `activatePremium` re-applied the entitlement unconditionally on an existing payment doc, so a
> redelivered `payment.captured` — or a re-submitted `(orderId, paymentId, signature)` triple, which
> stays cryptographically valid forever — could renew Premium off a payment that had been **refunded**.
> `payments/{id}.status` is now a lifecycle; a terminal status refuses the grant with zero writes and a
> typed `PAYMENT_REFUNDED`. `refund.processed` is handled for the first time (the grant path was
> one-way). Revocation **replays the surviving ledger** via the new pure `services/entitlementLedger.js`
> rather than subtracting days — subtraction steals a whole unrelated purchase whenever the refunded
> term had already lapsed. New `revokePayment` tombstones even when the grant never landed, refuses to
> touch an entitlement whose `planSource` is no longer `'purchase'`, may only ever shorten, and abandons
> the recompute if any surviving row is unreadable. Partial refunds retain the entitlement by stated
> policy. W4: the row records the gateway-reported amount, not the catalog price. Firestore 2.32→2.33
> (additive fields + two `payments` composite indexes + `paymentOrphans`; zero migration).
> Payment 2.8→2.9. Verified by execution: `entitlement-ledger.check` 49, `payment-refund.check` 84
> (real aiService, real webhook, real HMAC), `entitlement-invariants` 40→59, six mutation runs.

> **2.173 (2026-08-04)** — **Hybrid payment implementation gate: READY (ADR-140).** Final certification
> before Razorpay + Play Billing implementation; no Play code written. One new Medium finding, fixed: the
> blanket owner-write over user subcollections excluded duelHistory/duelStats/aiEvents/notifications but
> **not `entitlementLogs`**, so a user could erase their own revoke record or forge a grant. It could
> never grant premium (plan fields are root-level, downgrade-only, server-owned) and the immutable root
> `auditLogs` copy always survived — but refund and voided-purchase disputes are investigated through
> that per-user history, so it is closed before WS2 makes it evidence, timed to ride the deploy in
> flight. Certified by measurement: 108 entitlement call sites with zero provider-awareness,
> `activatePremium` carrying no provider concept, Razorpay confined to four files, zero price literals in
> index.html or any locale, and Play requiring additive fields only. Implementation roadmap published in
> PAYMENT_READINESS §E. entitlement-invariants 38→40.

> **2.172 (2026-08-04)** — **Pre-payment validation (ADR-139 cont.).** Three "committed ≠ shipped"
> findings. **Critical/operational:** the P0-1 rules fix is NOT deployed — the Firebase Deploy workflow is
> manual-only, the last successful run was 2026-07-06, and three rules commits have landed since,
> including ADR-130 part 2's entitlement-field enforcement. Production runs July rules, so the
> entitlement-inflation hole is live until someone runs the workflow. **Medium:** commit b4481a0 changed
> live prices with no ADR, no CHANGELOG entry and no Payment Version bump — the governance miss that let
> four current-state docs quote ₹349/₹499 for two weeks (my previous pass fixed only one of them). All
> five corrected; `payment-parity.check` now scans current-state docs for retired prices (25→26), proven
> to bite. **Medium:** no `payments` composite indexes — not needed today, required by WS2/WS6.

> **2.171 (2026-08-03)** — **Pre-payment certification (ADR-139).** Final gate before Google Play
> Billing; certification only, no Play code, no SW bump. Found and fixed a **Critical** live
> vulnerability: `payments/{id}` was client-deletable, and that doc IS the idempotency lock. Because
> `?action=verify` has no recency check and a paid Razorpay order stays paid forever, a user could buy
> once, delete the lock from the client SDK, replay the same (orderId, paymentId, signature) triple and
> land in the NEW-grant branch, where `stackExpiry` extends from their CURRENT expiry — +6/12 months per
> replay, unbounded. The permission bought no feature (no client calls it; account deletion purges via
> the Admin SDK). Now read-only, guarded by two `entitlement-invariants` assertions (36→38) proven to
> fail on the pre-fix rule. Separately, the Phase 4 blueprint would misdirect its own integrator: it
> specifies Play products at ₹349/₹499 while the app sells ₹299/₹399, and it still states
> `planExpiry == null ⇒ premium` under a heading saying "UNCHANGED" although Wave S1/ADR-115 removed the
> permanent tier — `PAYMENT_ARCHITECTURE.md` §2/§7 corrected here, the blueprint handed back. The
> architecture itself is verified sound: `activatePremium` is genuinely provider-neutral, Razorpay is
> contained to four files, and all four entitlement-core mirrors are byte-identical.

> **2.170 (2026-08-03)** — **Final production certification (ADR-138, SW v269→v270).** Release sign-off
> for the whole ADR-133→137 arc, baselined against the commit BEFORE ADR-133 (v264). The headline
> finding is about the tooling: `layout-probe` had run at [320, 390, 768, 1024] with a fixed 844px
> height, so it had never tested 360px, 412px or ANY landscape, and it omitted Auth, Onboarding, bottom
> sheets and the Inbox — every prior "0 regressions" claim was narrower than it read. The gate is now
> the permanent standard: viewports carry orientation, screens 9→13, 432→1,092 contexts, 89,904→242,268
> records, proven to bite before use. It immediately found a 37px search field in the Quick Study
> picker (ADR-133's spacing snap had pushed an already-sub-floor control further down; fixed at the
> 44px floor) and a leaking observer pair (1→11 observers, 2→12 listeners over ten rebuild cycles).
> Contrast measurement then showed ADR-136's own chevrons were the app's largest contrast regression at
> 2.07:1 in Playful Dark — the colours were the pre-token literals the design system had already
> rejected in writing, never migrated to `--qr-text-dim`. Against v264: 0 new overflow, 0 clipping, 0
> touch regressions, 0 unexplained disappearances; sub-44px controls on Home 14→0; 200% clipping in
> Settings 15→0; 61fps scrolling with blur on. Three of my own instruments were found wrong and fixed
> before conclusions were drawn. Code quality was INVENTORIED, not changed — see TECH_DEBT_INVENTORY.md.

> **2.169 (2026-08-02)** — **Adversarial re-certification of ADR-136 (ADR-137, SW v268→v269).** Two
> defects that no gate had ever asked about, because neither was a change. Playful Dark used
> `--qr-glow-accent` — teal `rgba(45,212,191,.28)` in that block — as the ENTIRE box-shadow of the
> shared card component, so Home, Practice, Learn and Quick Study all wore a neon halo; replaced with
> the elevation ladder the same theme block already declared and its own sibling surfaces already used,
> which *increases* depth (26px double-throw vs a single 12px) while leaving glass, borders and
> separation intact. CTAs keep their halo: glow is for actions, never for surfaces, now a design-lint
> assertion. Separately, Playful Professional — a PREMIUM theme — was enforced in exactly one place
> (`initSettingsView`), while the pre-paint script, the boot IIFE and the post-hydration call all
> applied it straight from saved settings; a lapsed subscription kept the premium theme on every launch
> forever. `applyTheme()` is now the single, tri-state enforcement point (unknown ≠ not-entitled, or
> every launch would strip a paying user's theme), backed by a capped fail-closed hint that gates one
> CSS class and is purged on logout. Verified by execution 12/12, sampling `<html>` per frame. Three of
> my own instruments were found lying: the new glow assertion passed while the glow was planted,
> `icon-identity` had been reading 54 of 89 `.qr-ico` rules since ADR-132, and the no-flash sampler
> never ran because `document.documentElement` is null in a Playwright init script.

> **2.168 (2026-08-02)** — **Quick Study rebuilt on Practice; dropdowns pinned (ADR-136, SW v267→v268).**
> Part 2 of the production certification: layout, usability and interaction. Quick Study's wrapping row
> of chips inside one card is now the Practice pattern at a smaller scale — the cards genuinely **are**
> `.mode-card`s, so every theme rule, the press scale and the ripple come along and can never drift;
> layout is icon + title + chevron and nothing else, because the registry has no description to show.
> The tray's `max-height` is measured from the first four cards, so 1–4 wrap tightly
> (`clientHeight === scrollHeight`, no dead space, no scrollbar) and 5+ scroll internally, with a real
> height animation and a `ResizeObserver` that self-heals a tray measured while Home was hidden. Card
> height is set by the RADIUS: 60px read as a pill in Playful (28/60), 68px reads as a card. The six
> Settings dropdowns are now pixel-identical across 42 configurations — one width, one height, one
> gutter, one arrow inset — reversing ADR-135's fluid clamp, safe because its label-wrap fix removed
> the width pressure. A bare ✏️ that had hidden behind the `data-i18n-attr` exemption for four ADRs is
> fixed and the guard tightened. Gate: 0 new overflow/clipping over 88,992 elements; every
> disappearance is the replaced Quick Study subtree; all wraps and moves confined to settings/about.
> Two limits recorded rather than claimed: the native `<select>` popup is OS-drawn, and at 320px
> "🌙 Appearance" is forced onto two lines.

> **2.167 (2026-08-02)** — **Adversarial certification (ADR-135, SW v266→v267).** The census measured
> only `css/style.css`, so its reported figures were not the shipped figures: ~84 inline styles in
> index.html add two off-token durations, a fourth easing, a fifth shadow, z-index 9999/10000 and eight
> font sizes. Five INLINE dimensions are now censused separately with ceilings at today's counts, and
> the true shipped totals are printed — **no inline style was touched**, only the measurement made
> honest. Separately, Settings labels truncated below **371px** (6 of 17 at 320px), so 360px devices
> were affected and earlier sampling had missed it; fixed by a fluid row rebalance plus letting the
> label wrap rather than ellipsise. 0 of 17 truncated across 30 configurations. A false pass was caught
> by screenshot when the metric's `> 1` threshold swallowed a sub-pixel shortfall. design-lint 16→21.

> **2.166 (2026-08-02)** — **Independent certification of ADR-133 (ADR-134, SW v265→v266).** Adversarial
> review conducted as if another engineer had written it; **it should have been rejected.** The spacing
> transform floored VERTICAL padding despite its ADR documenting nearest-rounding, costing 10
> declarations up to 4px per side and taking `.training-card-back` from 38.8 to 34px — a control already
> under the touch floor. The gate missed it because it only flagged controls *crossing* 44px; tightened,
> it reports 128 regressions on the original pair and 0 after the fix. Also removed a duplicate
> `--sp-xs/sm/md/lg` scale and 6 orphaned tokens (three created by ADR-131/133), with a new assertion
> that scans js/ and index.html — `--text-secondary` looks dead in CSS but is read by the Inbox view.
> The `gap` asymmetry is acknowledged and deliberately left, since flooring 48 gaps would tighten the app
> with no measured defect behind it. Spacing settles at 13 values; design-lint 15→16.

> **2.165 (2026-08-02)** — **Production visual certification (ADR-133, SW v264→v265).** design-lint
> censused eight axes, all at 1–12 distinct values; the axes it did NOT census had drifted — spacing to
> 60, glass blur to 9, press scale to 12. Spacing normalised to **13** values (vertical rounds, horizontal
> FLOORS so text can never be squeezed into a new line — measured, rounding produced 32 wraps), glass to
> three purposeful tiers at the lower end of each cluster, press feedback to two tokens. Six icon buttons
> raised to the 44px touch floor with invisible hit areas. The notification bell was a raw inline SVG
> rendering as a line glyph among Classic's emoji — converted and guarded. New `layout-probe` instrument
> diffs structural facts across 144 contexts / ~29,900 records: 0 new overflow, clipping, wraps or touch
> regressions. design-lint 12→15, icon-identity 12→13, all new assertions proven to fail pre-fix.

> **2.164 (2026-08-02)** — **Adversarial re-verification of the UI restoration (ADR-132, SW v263→v264).**
> Hostile re-check of ADR-131 against the live runtime with every prior report discarded. ADR-131's claims
> survived; **four defects were found.** The Practice grouping tray had been missing in **both light themes**
> (the base rule had lost its `background`; predates ADR-131 and the shallow clone cannot date it), and the
> obvious fix was **invisible** — `var(--qr-surface)` is a 6/255 delta on classic light's page, which px-diff
> scored as zero changed pixels — so a semantic `--qr-panel` token now names the tray per theme (deltas
> 22/16/14/19) with dark byte-identical. Three dead `border-color` declarations removed; the matching border
> deliberately not restored, as it would move Dark. Two icons bypassed the `--qr-ico-size` contract: the Learn
> premium badge was **0×0 invisible in Playful** (`em` against `font-size: 0`) and 2.5× oversized in Classic,
> and the locked-topic icon was silently overridden by ADR-131's own theme rule on specificity. Both fixed and
> now guarded structurally. **px-diff's determinism, broken by ADR-131, is repaired and proven** — infinite
> animations were landing on a random phase, up to 2.75% noise; the shoot-twice self-test now passes on all 32
> screens. Every census ceiling unchanged; `align-probe` still 0 offenders >1px.

> **2.163 (2026-08-02)** — **Visual identity restoration (ADR-131, SW v262→v263).** `main-app` only;
> restoration, not redesign. The two themes had become ~86% the same object: `:root` defined 205 tokens,
> `html.theme-playful` overrode 28, and **7 of those set values byte-identical to Classic**. Playful
> inherited the whole depth-and-atmosphere layer, so every elevation matched byte-for-byte and the glow /
> veil / wash tokens baked *Classic's* accent at `:root`, where no palette work under
> `html.theme-playful` could reach. The hero had lost its 3-stop opaque ramp to a 12%→3% alpha wash in
> `05d9642`, and dark mode had lost its navy ramp entirely. Classic's emoji personality is restored purely
> in CSS, with neither theme mixing icon languages (measured: Classic 95 glyphs / 0 masks, Playful 0 / 95).
> Alignment was re-tuned from measurement — `vertical-align` turned out to reach only four inline surfaces,
> and Playful's constant had been **inert all along** — taking offenders over 1px from **50 to 0** across
> 105 pairs. New `icon-identity.check.js` (10) and a design-lint theme-distinctness pair (10→12), each
> verified against the pre-fix tree. Every census ceiling unchanged. No logic, Firestore, auth, payment,
> routing, state, AI, analytics or translation change; the ADR-126/127/128 language transition re-verified.

> **2.162 (2026-08-01)** — **Final certification of Waves S1–S4 (ADR-130, SW v261→v262).** Zero-assumption
> pass with every prior report and PASS discarded. **Two live defects, both in `js/duel-archive.js` — the
> one file no runtime harness had ever opened — and both PREDATING the waves**, so neither is a wave
> regression. **F1 (HIGH)**: `_t('guide.difficulty*')` named keys that do not exist, and `QRI18n.t` returns
> the key on a miss, so `guide.difficultyMedium` was rendered onto the Battle Archive filter chips and every
> card subtitle in all three languages. Every i18n guard validated the catalogs against EACH OTHER — which
> agree perfectly — and none validated the CODE against the catalog; new `i18n.check` §4b closes that
> direction (1052 literal keys scanned, exactly 6 unresolved, all of them this defect). **F4 (HIGH)**:
> `DuelArchive.render(true)` with a null uid killed the renderer — the uid-guard was the one `_loadSummary()`
> path resolving without assigning `_summary`, so `_renderTrigger()` recursed forever; not an exception, so
> no `try/catch` could intercept it. Fixed at the call site (re-enter only when the promise produced a
> summary); a first attempt that assigned `_summary = {}` was itself wrong — it poisons the "have I loaded?"
> sentinel and would have left the archive stuck on the empty state — and the final verification pass caught
> and corrected it. **F2 (MEDIUM)**: the S1 "client never persists an entitlement
> downgrade" invariant was guarded only by regexes over deleted code's error strings; a poisoned
> localStorage buffer put `{"plan":"free",…}` into two writes with the guard removed. Now enforced by
> construction from a list derived from `revokeFields()`, at three choke points. **F3 (LOW)**: rules comment
> named deleted code; corrected, rule deliberately not tightened. Runtime: 0 raw keys and 0 page errors
> across 6 views × 3 locales + the archive; transition 529 ms with 0 stray classes anywhere afterwards; 200
> switches with 0 node growth. `npm test` exit 0, design-lint 10/10 unchanged.

> **2.161 (2026-07-31)** — **Wave S5 final production verification (ADR-129, SW v260→v261).** Cross-wave
> re-verification of Waves S1–S4 with every prior report treated as untrusted. **No code regression found in
> S1–S4** — every fix still present, none reverted or shadowed, entitlement mirrors still md5-identical,
> `js/auth.js` and `js/app.js` unchanged since S2. The failures were in governance and in the tests.
> **FAIL-1**: `I18N_CERTIFICATION.md` — the document `I18N_KNOWN_LIMITS.md` names as the certification gate —
> asserted the i18n flag was OFF while source shipped it ON, telling a reviewer localization was dark when
> every user was on the live path; corrected, and `i18n.check` §5 now pins the gate to the flag's live value
> (3 assertions, demonstrated failing on `b5b1d8c`). **FAIL-2**: four checks could not fail and two files had
> zero coverage — `session-integrity` asserted its own copies, `category-source` swallowed its skip,
> `auth-validators` executed no validators (8 → **107**), and `js/services/report-context.js` was untested, so
> the S4-MIN3 fullscreen fix was deletable with the suite green (`report.check` 674 → **715**). The new
> executed cross-user flush test surfaced a real asymmetry in `_persistPendingBuffer()` (buffer keyed on the
> current rather than the loaded identity) — verified **latent, not live**, and hardened anyway.
> **W1**: `reminderCron.js` hand-rolled a fourth expiry parser that silently dropped `{toDate}`-shaped
> expiries from the reminder bucket — now delegates to `entitlement-core.toMillis`. **W4** resolved on
> evidence (teardown mid-morph is clean). Runtime: premium/trial never reach a purchase surface, expired fails
> closed with 0 persisted keys, 300 switches leak nothing, timing 416 / 566 / 771 ms at 1× / 4× / 6×.
> `npm test` exit 0, design-lint 10/10 unchanged. Wave S5 feature work and Phase 4 payments untouched.

> **2.160 (2026-07-27)** — **Language-transition acceptance gate (ADR-128, SW v259→v260).** Four defects
> found by auditing ADR-127 with its own reports treated as untrusted. **F1**: content and nav indices both
> saturated at the stagger ceiling, so from the sixth visible section onward the nav stopped finishing last —
> reproduced at 1024×1400 (6 sections) and 1024×2000 (9); content now caps one slot lower and the invariant is
> proved arithmetically over 1…40 sections. **F2**: the reduced-motion / drill branch had no pack cap, so a
> request that neither loaded nor errored left the language silently unchanged — capped, verified committing at
> 1300 ms / 1275 ms with the pack stubbed to never resolve. **F3**: scroll and focus were captured at tap time
> and force-restored up to 1.2 s later, overriding a user who scrolled during the wait — capture moved to
> immediately before the commit. **F4**: a section the commit newly revealed still received the reveal
> animation and its floor-start fill; whether that painted was not provable, so the path was removed rather
> than argued. Timing back on target (446 / 473 / 500 ms), `npm test` **14,593/0**, design-lint 10/10 with
> `durations=3` / `easings=3` unchanged. Wave S5 and Phase 4 payments untouched.

> **2.159 (2026-07-26)** — **Language switching becomes a directional cascade (ADR-127, SW v258→v259).**
> Architecture 2.75→2.76. ADR-126 was correct but read as a refresh: the dim sat on the **view root**, so the
> whole screen went flat at once. The Translation Pass moves the fade to the active view's **visible direct
> children**, ordered by on-screen top edge, finishing on the bottom-nav labels — measured mid-exit
> `[0.50, 0.57, 0.75, 1.00]` and mid-return `[0.93, 0.84, 0.61]`. This is safe because **no view replaces its
> own direct children** (ADR-126 assumed otherwise), which also retires the opacity-compounding trap (0.379
> measured under a nominal 0.45 floor; now exactly 0.45) and the FW-W5 transform hazard. Off-screen sections
> never animate, so the wave self-scales: 3 units / 446 ms at 320 px, 4 / 477 ms at 390 px, 4 / 483 ms at
> 768 px. The transition runs **only on the visible screen, exactly once** — 0 morph classes across seven
> later navigations and 0 on cold boot. Overlay discovery deleted (its first selector, `.qr-overlay`, existed
> nowhere; the rest matched modals that cannot re-render). The pack load moved under the exit so latency is
> absorbed: the dim starts at 37 ms regardless, and a pack that never resolves is capped rather than hanging.
> No total-duration constant survives — JS reads the resolved timings off a real unit. Two pre-existing Learn
> leaks fixed: one listener stacked per switch (1 → 2 → 3 → 4 invocations) and 30 DOM nodes duplicated per
> switch (30 → 120 buttons). Frame pacing 17 ms median at 1×/4×/6× CPU, CLS 0, `npm test` **14,589/0**,
> design-lint **10/10** with `durations=3` / `easings=3` unchanged. Wave S5 and Phase 4 payments untouched.

> **2.158 (2026-07-26)** — **Premium language switching, the "Language Morph" coordinator (ADR-126, SW
> v257→v258).** Architecture 2.74→2.75. Measured before designing: the hard cut hid three real defects — the
> switch was a **double render** (~428 `applyDom` nodes plus `initSettingsView`'s 24-control `rebind`; commit
> 88 ms @1× CPU / 141 ms @4× / 196 ms @6×), **focus was destroyed** (`rebind` replaced the very `<select>`
> whose handler was on the stack; `activeElement` → `BODY`), and **scroll was reset visibly** (`showView`'s
> `scrollTop = 0` has no same-view guard and `.container` is `scroll-behavior: smooth`, so switching while
> scrolled smooth-glided the user to the top). New `js/i18n-transition.js` owns the lifecycle — last-wins
> generation counter, packs loaded before any visual change, scroll/focus captured and restored, a single
> commit pass running *under* a compositor-only dim that never goes below 0.45, staggered reveal,
> unconditional cleanup, and a polite announcement in the new language. New `Router.refreshCurrentView()`
> refreshes in place so the view's `viewSlideIn` entry animation is never replayed — a defect in my own first
> implementation, where suppressing the animation by class merely deferred the flash to cleanup
> (`minOpacity: 0`, measured). Two further self-found corrections: `data-i18n-morph="hold"` was **inert** on
> the language row (neither a morph root nor a stagger group) and moved up to the `.settings-section` with the
> opt-out also stated in CSS; and the settle keyframes **compounded** opacity with the root fade (effective
> alpha **0.379** while the root read 0.84), so they are now transform-only and the floor re-measures at
> **0.525**. Recorded honestly in ADR-126: under a root-level fade opacity composites, so `hold` buys
> stillness, not brightness — hand continuity comes from focus and scroll retention. Reduced motion (both the
> media query and `body.reduced-motion`) applies zero morph classes while still committing, restoring and
> announcing. The S4 localization correctness layer is unchanged — `setLanguages`, `applyDom` and the
> subscriber contract are untouched. `npm test` **14,573/0**; design-lint **10/10** with `durations=3` /
> `easings=3` unchanged. Wave S5 and Phase 4 payments untouched.

> **2.157 (2026-07-26)** — **Wave S4 confidence pass (ADR-125, SW v256→v257).** Architecture 2.73→2.74.
> An ultra-adversarial pass that treated ADR-124 — the previous remediation — as the prime suspect, attacked
> locale *transitions* rather than first render, and audited the project's own certification gate against the
> code. **S4-U3**: the Category Picker was the only localized JS-built surface with no `QRI18n.onChange`
> handler; since the app does not reload on a language switch and `applyDom` cannot reach innerHTML text, the
> rendered tree kept the old locale — reproduced as a visible mixed-locale state (Hindi strip labels beside
> English headers). Not reachable through the UI today, but ADR-124 is what made the surface locale-dependent
> and thus created the class; now invalidated and guarded by a new check. **S4-U1/U2**: two entries in
> `I18N_KNOWN_LIMITS.md` had stopped being true — one documented `hint` fields ADR-124 deleted, the other
> quoted `Version v223`, cited a wrong line, and argued against the very pinning ADR-124 introduced with CI
> enforcement. Both corrected per the register's own rule. Eliminated as false positives with evidence: no
> layout regression from the longer Devanagari headers (72 combinations, zero clipping), and MIN3 verified by
> an executed truth table (6/7 predicates agree; the lone divergence is a path where app.js and duel-manager
> already disagree by design). No Firestore, Security or Payment surface change. Wave S5 untouched.

> **2.156 (2026-07-26)** — **Wave S4 final verification (ADR-124, SW v255→v256).** Architecture 2.72→2.73.
> Wave S4 shipped at v248; this adversarial pass verified it from source and a live Chromium run. The
> subject modal, MIN3, DEAD1 and DEAD2 all held. **S4-V1**: the Category Picker — recorded by S4 as "a
> non-issue, already localizes all rendered strings" — took its Quant section titles from the knowledge
> registry, which stores English only, so seven headers (Numbers … Mensuration) rendered in English for
> hi/mr users on Practice, beside DI/LR headers that translated. The `learn.cat_<id>Title` translations
> already existed and are now resolved. **S4-V2**: MIN2 edited the version-fallback literal without adding
> a guard, so it could silently re-stale; `update.check` now locks it to APP_VERSION. Plus the last 🍕
> (the `fractions` Learn topic), a comment S4's own edit made false, and three dead untranslated `hint`
> fields. New `i18n.check §9` derives the quant category ids from the registry source so a new category
> fails until translated — closing the JS-innerHTML blind spot that §4 cannot see and §8 covered for only
> one component. Both new guards verified to fail on the previous HEAD. i18n assertions 14,507 → 14,546.
> No Firestore, Security or Payment surface change. Wave S5 untouched.

> **2.155 (2026-07-25)** — **Wave S3 final verification (ADR-123, SW v254→v255).** Architecture 2.71→2.72.
> A final adversarial pass, run by loading the real firestore-sync module into a vm and driving its real
> lifecycle handlers, found three reproducible defects. **S3-V1** (regression from ADR-122): once the logout
> flush writes instead of deferring, a *failing* debounced write re-queues its own older snapshot for fields
> the newer write already replaced, and the retry silently reverts theme / language / target exam / profile
> — fixed with a monotonic write sequence plus a per-field ack map. **S3-V2** (original Wave S3 defect that
> ADR-121's defer had masked): offline, every backgrounding enqueued another full-document mutation — 8
> lifecycle events produced 8 mutations at HEAD and at v248, 1 under ADR-121 — fixed by having
> flushUpdatesAsync persist-and-return only when a write is outstanding AND no caller is waiting, which
> leaves ADR-122's logout guarantee intact. **S3-V3** (pre-dates Wave S3): logout gated everything on a
> Firestore promise that never settles offline, with no timeout, wedging the app on a signed-out-looking
> screen while still signed in — now a once-only continuation plus a 3 s watchdog. Durability check
> **57 → 73 assertions**, all ten new ones verified to fail on the previous HEAD. No Firestore, Security or
> Payment surface change.

> **2.154 (2026-07-25)** — **Wave S3 release-gate remediation (ADR-122, SW v253→v254).** Architecture
> 2.70→2.71. An independent release gate on Wave S3 returned FAIL. Two findings: ADR-121's own remediation
> introduced a **data-loss regression** — `flushUpdatesAsync` deferred to an in-flight write on the reasoning
> that the durable buffer would replay, but the buffer's `baseUpdatedAt` is the last KNOWN server value while
> that write advances `updatedAt` past it, so the replay freshness guard discarded it every time; it now
> proceeds without taking the hold, preserving ownership and restoring durability. And the "39 executed
> assertions" claim was overstated — two harnesses ran local COPIES of the cleanup and deletion logic, so
> reverting the production cleanup would have left the suite green. `_applySuccessCleanup` and
> `_coachingDecrementPlan` are now module-scope and executed, the whole sync module runs in a vm so
> `flushUpdatesAsync` is driven end to end, and a guard fails the check on any re-implementation:
> **39 → 57 assertions**, with the new concurrency test verified to fail on the previous HEAD. Also: the FS3
> transaction now reads the coaching doc before updating it (a missing doc aborted the whole transaction),
> and a per-flush signature the debounced path never read was removed. No Firestore, Security or Payment
> surface change.

> **2.153 (2026-07-25)** — **Wave S3 audit remediation (ADR-121, SW v252→v253).** Architecture 2.69→2.70.
> An adversarial verification audit of the already-implemented Wave S3 found five specified requirements
> unmet. Closed: flushUpdatesAsync cleared its queue by object IDENTITY, so an answer recorded during the
> write (stats is mutated in place and re-queued as the same object) was deleted from the queue and lost
> permanently — now compared by content signature; the in-flight hold had two owners and a logout flush could
> release a debounced flush's hold — now a token only its acquirer can release; no `pagehide` handler despite
> "unexpected unload" being specified; `studentCount` drifted +1 on a retried deletion — now decremented in
> one transaction that also clears `coachingId`; and usageCache evicted stale entries only at the size cap.
> The durability check moves from 15 source pattern-matches to 39 assertions — the pattern-only
> ratchet is exactly why the flush defect shipped green. (ADR-122 later found two of those harnesses ran
> copies rather than production code, and corrected both the harnesses and this claim.) No Firestore, Security or Payment surface change.

> **2.152 (2026-07-25)** — **Release-gate fixes (ADR-120, SW v251→v252).** Architecture 2.68→2.69,
> Security 2.19→2.20. An independent black-box gate against ADR-119 returned FAIL; validation retracted
> two findings and fixed three. Closed: a queued bug report could be submitted under another account's
> credentials (flush snapshotted the queue synchronously but fetched the token per report, so a switch
> mid-batch attached the wrong bearer — reproduced deterministically, now identity-stamped and
> generation-guarded); `AppState.clearAll()` purged NOTHING when the storage registry failed to load,
> silently disabling account isolation (reachable via the SW's tolerant pre-cache + an offline session) —
> now an inline fail-closed fallback; and the identity guard APIs, which had zero production callers,
> making ADR-119's async-isolation claim false as shipped. Also: no app reveal after sign-out,
> sessionStorage inside the ownership model, redundant legacy list deleted, drift guard widened.
> Retracted: the drift-guard bypass (measured 100% coverage, 0/28 missed) and Firestore IndexedDB
> remanence (real but not in-app reachable; documented as a known limitation). Verified: npm test
> 14,507/0, account-isolation 121/0 incl. an executed report-queue switch matrix. No Firestore or Payment
> surface change.

> **2.151 (2026-07-25)** — **Account isolation hardening (Wave S2 remediation, ADR-119, SW v250→v251).**
> Architecture 2.67→2.68, Security 2.18→2.19: cross-account client-state contamination is now treated as a
> data-integrity boundary. **Retracts the 2.150 claim that the user-switch purge was sound** — an adversarial
> re-audit found 15 live user-scoped keys surviving an account switch (target exam deterministically, plus
> free-hint credits, best/speed scores, queued bug reports, AI badge state, pinned/recent categories) and a
> HIGH defect where a direct A→B switch never ran the hydration transition, so B ran in A's theme, dark mode
> and UI language and a brand-new B skipped onboarding. Storage ownership now lives in ONE registry with a
> prefix purge + explicit survivor allow-list, so an unregistered key is purged rather than inherited; a new
> identity lifecycle (`js/identity.js`) gives deterministic ownership, ONE teardown contract for
> logout/switch/deletion/displacement, and generation-scoped tokens so late work from the previous account
> cannot mutate the new one. `firebase.auth().currentUser` is no longer read outside `js/auth.js`. Flush
> residue is made durable before the attempt and buffered per uid. Verified: npm test 14,507/0, new
> behavioural `account-isolation.check` (92) which derives the key inventory from source and caught a bug in
> this pass, plus a real-Chromium purge run (0 leaked, 0 wrongly destroyed). Live two-account / two-tab /
> offline runs against a real Firebase project remain unverified — the sandbox blocks Firebase auth.

> **2.150 (2026-07-25)** — **Session integrity & user-data consistency (Wave S2, ADR-118, SW v249→v250).**
> Architecture 2.66→2.67: the ADR-072 single-device listener becomes the app's live user-state refresh path
> (same snapshot, zero extra reads), and auth-state notification is additive instead of single-slot. Closed: a
> user switch flushed the outgoing user's queued writes AFTER flipping identity, so the guard tripped and that
> data was discarded — reachable with no reload because Firebase Auth persistence is shared across tabs; a
> cross-device entitlement/coaching/profile change never reached other devices until a full relaunch; and (found
> in the same pass) the new live refresh could revert a field with an unflushed local edit, now prevented by a
> pending-update conflict rule. `Auth.onStateChange` could silently replace the app's auth gate. `settings`/`stats`
> stay excluded from live refresh by design, so language/theme/target-exam/stats still propagate on relaunch only.
> Verified: npm test 14,507/0, new behavioural `session-integrity.check` (42), design-lint 10/10, Chromium boot
> smoke clean. Live two-account / two-tab / offline flows NOT run — they require real Firebase auth, unreachable
> from the audit sandbox. No Firestore, Security or Payment surface change.

> **2.149 (2026-07-24)** — **Entitlement Architecture Hardening: ONE canonical implementation (ADR-117, SW
> v248→v249).** Architecture 2.65→2.66, Payment 2.6→2.7: the Premium rule + grant arithmetic now live in a
> single pure module (`main-app/data/entitlement-core.js`) loaded by the main-app browser AND require()'d by
> its serverless API, with byte-identical generated mirrors for `functions/` and `super-admin-app/` (separate
> deploy roots). Independent re-verification overturned 3 prior findings and escalated 1. Closed: the
> `activatePremium` replay path could move an entitlement BACKWARD (and relabel an admin grant as a purchase)
> — reachable indefinitely via `?action=verify`; coaching *suspend* blanket-revoked self-purchased premium;
> admin grants overwrote expiry blind; `trialDays` was unbounded; `setCustomUserClaims` wiped other claims;
> trial users saw an inert "Unlock Premium" CTA. Rules now structural: no permanent tier (client+server+cron),
> never-shorten for every writer, no purchase surface for any active entitlement incl. trials, server sole
> writer of the expiry transition. Verified: npm test 14,507/0, new behavioural `entitlement-core.check` (93),
> `entitlement-invariants` 22→30, live Playwright. Forward-compatible with Play Billing.

> **2.148 (2026-07-24)** — **Ultimate Production Bug Audit & Stabilization (ADR-115/116, SW v247→v248).** Payment
> 2.5→2.6. Five behavior-preserving waves off a 5-agent adversarial audit: (S1) entitlement/premium correctness —
> canonical `hasActivePremium`, no permanent tier (null-expiry ⇒ not-premium; admin grants finite-only),
> active-premium users blocked from any purchase (client + `ALREADY_PREMIUM` create-order), no-shorten stacking,
> removed the write-only `qr_premium` mirror, webhook uid recovery; (S2) session-displacement login-screen wedge
> (hydration-latch reset + `onReplaced` reload) + cold-start deep-link preservation; (S3) client premium self-heal
> is local-view-only (fixes forward-clock + stale-cache entitlement clobber), durable offline write buffer +
> no-data-loss logout flush, auth-first account deletion, bounded `usageCache`; (S4) the hardcoded-English Practice
> subject-picker fully localized (×3) + `i18n.check §8` guard, minor fixes, provably-dead-code removal. No schema/
> rules change; Phase 4 stays paused (refund revocation = WS2). npm test 14,507/0, 34 checks green (new
> `entitlement-invariants` + `firestore-durability`), live Playwright. Bible 2.147→2.148.
>
> **2.147 (2026-07-22)** — **Home & Practice UI recovery: restore FW-W4 presentation regressions (ADR-114, SW
> v246→v247).** A live app review found real visual regressions on Home + Practice from the multi-wave overhaul
> (`430cb9b` "FW-W4") while the architecture stayed sound. Four root-caused, surgical restores: Practice Advanced
> disclosure-rows → the uniform `.mode-card` wall (kills detail-text truncation, zero JS change); the orphan Home
> Explore Quick-Reference tile removed → balanced Duel + AI-Coach|Study-Planner bento; Quick Study chips forced to
> monochrome `qr-ico` line-icons (no raw 🍕/✖ emoji), v2 registry kept; decorative ✨ stripped from Explore CTA
> strings ×3 locales. Presentation-only — removes CSS, reuses tokens (design-lint 10/10 holds by construction);
> architecture (tokens/primitives/QROverlay/registry/light-default) preserved wholesale. No Firestore/Security/
> Payment change. Verified: npm test 14,340/0, payment-parity 25/0, design-lint 10/10, live Playwright light/dark ×
> phone/tablet.
>
> **2.146 (2026-07-10)** — **Phase-1 UI finalization: independent-audit closure (ADR-113, SW v242→v246).** An
> independent post-implementation audit re-verified Phase 1 and returned a short punch-list, closed here: Settings/
> Profile/timer form controls are now all programmatically labelled (aria-labelledby / `for=` / aria-label); the
> remaining structural-chrome emoji became monochrome `.qr-ico` line icons; the companion sheet folded onto
> QROverlay (gaining a focus-trap it lacked); and the dead Word-Problems client (JS + CSS + DOM lookup) was pruned
> (server `aiBrain.wordProblem` untouched). No doc-schema, Firestore, Security or Payment change. Verified: npm
> test 14,342/0, design-lint 10/10, px-diff determinism + overflow + landscape + overlay + i18n-live all green.

> **2.145 (2026-07-10)** — **Final UI Wave: 100% blueprint closure (ADR-112, SW v228→v242).** Architecture 2.64→2.65:
> two new client modules own cross-cutting concerns — `js/ui/overlay.js` (`QROverlay`: the ONE modal lifecycle
> controller — stack, ref-counted locks, focus-trap/restore, closeGuard, async confirm) now hosts 16 migrated
> modals, and `js/services/quick-links-registry.js` derives the Quick Study catalog at runtime from the mode
> list/KB registry/quick-ref sections (legacy-id alias migration). Design system fully enforced: all eight §14
> design-lint ceilings ratcheted to blueprint goals (durations 3, easings 3, radii 6, z 1, shadows 4,
> gradients 10, font-sizes 12, rawColor:var 0.55); content-art marker regions (splash + di/lr, guarded ≤3/≤200
> lines); 27 redundant theme overrides deleted under a full-DOM computed-style equality proof. Inter latin
> subset self-hosted; manifest `orientation:any` with the landscape drill split; duel silo on shared primitives.
> No Firestore/Security/Payment surface changes (paywall DOM/flows byte-preserved and re-certified).

> **2.144 (2026-07-09)** — **Internationalization Final Stabilization (ADR-111, post-audit fix batch).** The
> independent production audit's three Major + all Minor findings re-validated and fixed, plus additional defects the
> post-fix sweep surfaced. Fixed: (M1) Quick-Reference `_built` latch now drops on `QRI18n.onChange` so the library
> rebuilds localized on the next visit; (M2) all JS-rendered dynamic chrome routed through the catalogs — duel-manager
> home card/status chip/toasts/error fallback (13 new `duel.*` keys + reuses), app.js auth-reset labels
> (`auth.tabRegister`/`submitLogin`/`googleContinue`); (M3) the settings language-switch repaint now runs inside
> `QRPacks.ensure(study, cb)` so the first hi/mr switch renders localized study content. Minors: revise-flow empty
> state, duel-archive Loading…, tables.js titles + close aria, the entire My-Notes (learn-manager) chrome (20 new
> `learn.*` keys), plural `count` numeric-string coercion, dead `qr_settings` key removed, and `lang=studyLanguage`
> on the four study-content containers (drill question, Learn topic, quick-ref host, companion envelope — WCAG 3.1.2
> known-limit resolved). Additional discoveries fixed: session-manager End-Session confirm reset bypassing its
> existing `modals.*` keys; inbox empty state (`modals.inboxEmpty`); four hardcoded aria-labels (pause overlay, topic
> back-nav ×2, email-copy state). **Second adversarial pass — five whole surfaces the audits under-scoped, now fully
> localized:** the entire Battle Archive (trigger, modal, rivalry banner, personal stats, filters, cards, badges,
> achievements ×10, month abbreviations, durations — `duel.arch*`/`duel.ach*`); the Guided Revision flow (counter,
> progress chrome, done/caught-up screens with plural, study-language `lang` on the revision body — `learn.rev*`);
> the inbox category badges + relative times (`inbox.*`); the Learn locked-chapter page, Coming-soon/Premium badges,
> Quick-reference search group, strip aria-labels (`learn.locked*`/`badge*`); the Practice category picker (For-You
> strip, subject groups, LR tier titles, pin arias, topic counts — `picker.*` — **plus a label-resolution order bug:
> `_catLabel` consulted the raw English `CATEGORY_LABELS` before the localized `formatCategoryName` layer, pinning
> every picker chip to English**); My-Notes action tooltips; planner readiness aria; numpad Backspace/Submit arias
> (with an `onChange` grid-signature reset so a language switch re-resolves them). 169 new catalog keys ×3 languages
> in total, every EN value byte-identical to the removed literal (scripted proof, 107 simple keys + 14 parameterized
> compositions). Verified: npm test 14,395 green; stabilization-proof harness (M1 rebuild, M3 ensure-cb
> ordering with the real lazy packs, M2 compositions, EN identity); batch2-proof (21 DOM proofs: archive/revision/
> numpad/picker rendered in hi + EN byte-identity); cert-proofs 15/15; cert-chrome clean; Phase-G
> harnesses re-run green; repo-wide literal/aria/latch/onChange sweeps clean (0 hits). Flag remains OFF; rides SW v223.
>
> **2.143 (2026-07-09)** — **Internationalization Phase G (ADR-111).** The complete STUDY LIBRARY now renders in
> हिन्दी / मराठी at textbook quality, still feature-flagged OFF (English byte-identical): all **62 Learn KB topics**,
> the **21 Quick-Reference cards**, the **92-item authored Logical-Reasoning bank** (Critical/Statement/Cause/Course/
> Decision) and the **85 auto-tips**. Mechanism: structural DISPLAY-ONLY overlays keyed by immutable id, merged over the
> certified EN base (`KnowledgeBase.registerTranslations` / `QRQuickRefI18n` / `LRAuthoredI18n`); machine fields (ids,
> `expr`, `related`, cross-links) stay English by construction. The authored-LR overlay derives the translated answer
> BY INDEX (never authored separately), so the correct option stays correct in every language. Auto-tips ship in the
> `tips` catalog namespace (EN verbatim from the `getAutoTip` maps). Renderer chrome + bilingual search (EN ∪ translated
> `searchTerms`) localize with zero consumer call-site changes. New `scripts/learn-i18n.check.js` (§1 KB / §2 quick-ref /
> §3 authored-LR) validates congruence, forbidden-field absence, digit-multiset, Latin-leak, options-parity and
> merged-schema; all packs declared `complete` → hard coverage gates (62/62, 21/21, 92/92 hi+mr). Playwright: KB
> topic-render + bilingual search + tip reveal, quick-ref library, and authored-LR drill — all incl. the diverged
> app=en/study=hi case at 360/820, EN restore byte-identical, zero console errors. npm test green. Rides SW v223.
>
> **2.142 (2026-07-09)** — **Internationalization Phase F (ADR-111).** Every RUNTIME-GENERATED string —
> Quant stems + inline explanations, DI set stems + chart text, LR stems + option terms, and the LR-visual
> stems + explanations — now renders in the study language (हिन्दी / मराठी) as grammar-engineered, exam-book
> content, still feature-flagged OFF (English byte-identical). Architecture: the four engines separate MATH
> from SURFACE. Quant uses the pure `QRGenI18n.render(engine,key,v,slots)` model (12 packs under
> `locales/gen/`); DI/LR/LR-visual own their RNG and generate directly in the active language via rich packs
> (`registerDI/LR/LRV` + `diPack/lrPack/lrvPack`). EN identity is proven by exact-hash censuses
> (`di-census`, `lr-census` 36, `lrv-census` 30) and cross-language invariance by `gen-i18n.check` §§8–12
> (answer/option-index/subtype/figure-spec identical; digit-multiset preserved; no Latin leak; no Devanagari
> numerals). Kinship is a generic-id → native-term map with a hand-written 36-pair truth table
> (`lr-kinship.check`, en+hi+mr — Hindi splits दादा/नाना, Marathi collapses to आजोबा by design). The Mistake
> Archive was rebuilt as a durable v3 learning substrate (`js/mistake-archive.js`): versioned reproduce-exact
> records across every engine, merge-by-id offline↔cloud sync, a query/mutation API (bookmarks, SM-2 spaced
> repetition, qkey per-question grouping, export/import, `ext` namespace) certified extensible for AI coaching /
> analytics / adaptive learning. New checks: `mistake-archive.check`, `lr-kinship.check`, gen-i18n §§11–12
> (npm test at 40 scripts, all green). Comprehensive cross-engine Playwright (incl. the diverged app=en/study=hi
> case) + per-engine sweeps green at 360/820/TWA. Rides SW v223.
>
> **2.141 (2026-07-08)** — **Internationalization Phase E (ADR-111).** QuanAI now answers in the
> user's STUDY language and every deterministic server-composed string, the notification system, and
> the remaining AI client chrome (companion + 7-screen setup wizard + planner calendar) are localized
> into हिन्दी and मराठी, still feature-flagged OFF (English byte-identical). The client injects
> `body.lang` (study channel); `api/ai.js` whitelists it and threads it through `aiBrain` →
> `aiPrompts.sys()`, which appends a response-language directive for hi/mr — no prompt-version bumps,
> so the warmed explanation cache survives. New `services/aiStrings.js` (~165 keys) and
> `services/notificationStrings.js` localize server scaffolding; `reminderCron` buckets per
> (template, appLanguage); the explain cache is language-dimensioned (`_hi`/`_mr` sibling docs). New
> `scripts/ai-lang.check.js` guards the seam (npm test at 12,364 assertions; notifications.check /
> free-explain.check unchanged-green). The `syl` topic/section display layer is deferred to Phase G.
> Rides SW v223.
>
> **2.140 (2026-07-08)** — **Internationalization Phase D (ADR-111).** Every remaining static
> documentation surface — the About modal, the 16-section App Guide — and the entire Math Duel UI
> (`js/duel-ui.js`) are localized into हिन्दी and मराठी, still feature-flagged OFF. A new
> `data-i18n-html` `applyDom` mode (whitelist-sanitized `<strong>`/`<em>`/`<br>`) handles the
> emphasis-bearing long-form prose; the duel exit-modal runtime regression is fixed by single-
> sourcing it from the catalog. `docs/BIBLE/I18N_KNOWN_LIMITS.md` is created as the Phase-H
> certification's DNT/frozen-item register. i18n.check.js at 11,342 assertions; Playwright real-DOM
> green (About, Guide, duel; `<strong>` survival, feature-name consistency, no overflow, EN restore,
> 6 ms switch latency at 4× CPU throttle). Rides SW v223.

> **2.139 (2026-07-08)** — **Internationalization Phase C (ADR-111).** The practice core — drill
> engine (chrome, verdicts, quota, results, insights), report sheet (taxonomy display layer over
> the byte-locked canonical labels; server errors localized by stable code incl. the free-explain
> `reason` sub-code), share cards + share sheet, Word-Problems setup, local speed benchmark, and
> all remaining system/duel/learn toasts — is localized into हिन्दी and मराठी, still feature-flagged
> OFF. Auto-tip translations ride Phase G (tc plumbing live); LR-visual explanations ride Phase F;
> planner-view/Companion chrome ride Phase E. i18n.check.js at 7,926 assertions; Playwright
> Phase-C harness green (report sheet, share modal, plurals, overflow, EN restore). Rides SW v223.

> **2.138 (2026-07-08)** — **ADR-111 Final Localization Certification gate.** Governance-only: the
> i18n feature flag is now formally gated behind an independent, adversarial certification with
> zero critical findings — zero untranslated strings on every user-visible surface, zero
> correctness/layout/typography defects, full switch-matrix + settings-independence + persistence
> proofs, in en/hi/mr on phone and tablet. Binding exit criteria recorded in ADR-111.

> **2.137 (2026-07-07)** — **Internationalization Phase B (ADR-111).** The complete app chrome —
> Settings, Auth, modals, Home, Stats, Practice, Paywall, Onboarding, Coming-soon, Learn hub/topic
> chrome, all 70 category names and 3 subject names — is localized into हिन्दी and मराठी through the
> ADR-111 catalogs (~700 keys × 3 languages), still feature-flagged OFF. Lockstep files stay
> byte-identical (validators and report labels localize at display time). i18n.check.js now runs
> 5,238 assertions; Playwright verifies hi/mr rendering, overflow, plurals and EN restore. Rides
> unreleased SW `v223`.

> **2.136 (2026-07-07)** — **Internationalization Phase A (ADR-111).** The app gains a localization
> layer for English + हिन्दी + मराठी, feature-flagged OFF until every phase passes three-language QA
> (users see zero change; English behavior byte-identical, proven by check + Playwright). New:
> `js/i18n.js` two-channel core (App language for UI chrome via `t()`, Study language for
> questions/Learn/AI via `tc()` — the ADR-111 user decision), `locales/{en,hi,mr}.js` catalogs,
> `docs/BIBLE/GLOSSARY_I18N.md` (researched Arihant/R.S. Aggarwal/MPSC terminology — the single
> source of truth for every Hindi/Marathi term), two Settings language selects (hidden behind the
> flag), a pre-paint `<html lang>` head script, bundled Noto Sans Devanagari with a Devanagari
> letter-spacing guard, and `scripts/i18n.check.js` (186 assertions) in `npm test`. Architecture
> 2.63→2.64 (new localization layer + boot step). Rides unreleased SW `v223`.

> **2.135 (2026-07-07)** — **About + App Guide certification fixes (ADR-110 addendum).** A two-auditor,
> possible-interruption certification verified every planned redesign item implemented, then fixed what it found:
> the Guide's wrong password-reset location (it's on the sign-in screen, not Settings), the misfiled Focus-timer
> line (moved to Focus Training), the unstyled closing quote (missing inner `<p>` — the style rule was dead),
> 255 lines of dead old-Guide premium-tier CSS left by the rewrite, Playful-theme icon coherence
> (Premium/Privacy → lock; Version emoji → 🔄), and 36px touch targets for TOC chips + the close button.
> In-browser certification: 12-combination rendering matrix, TOC scroll, sticky hero, focus management,
> reduced-motion — all pass with zero console errors. Rides unreleased SW `v223`.

> **2.134 (2026-07-07)** — **About modal + App Guide complete redesign (ADR-110).** Both info modals rewritten from
> a repository audit: the Guide becomes a 16-section manual with TOC navigation documenting ALL practice modes (four
> were missing), the firm daily limit, the exact premium Learn sections, DI/LR set mechanics, QuanAI limits,
> reporting, updates, offline truth, and accessibility; About gets a premium product-identity rewrite, a live
> update-status line, a Settings-matching contact card, and a privacy note — with the stale roadmap and all in-modal
> pricing removed (the paywall owns pricing). Shared info-modal shell gains dialog a11y + focus management, a fixed
> title hierarchy, `.info-premium-chip`, and `qrIco` section icons. Verified by suite + Playwright + a 19-point
> scripted fact check. Rides unreleased SW `v223`.

> **2.133 (2026-07-07)** — **Premium entitlement final certification (ADR-109 addendum #2).** Two fresh agents
> re-verified the addendum-#1 fix diff (all five fixes hold, zero regressions; upgrade telemetry attribution proven
> never stale) and swept the integrated seams. Fixed the one new defect: the day-change reset only fired on a COLD
> progress cache, so a tab open across local midnight kept yesterday's daily counters until reload (revenue-
> conservative but wrongly limiting day-2 users; the cache is now date-aware and drops itself when `lastActiveDate`
> ≠ today). Polish: the revise done-screen counts real "Revised ✓" clicks; the parity check's KB regex is
> word-anchored. Documented intended behaviors: multi-tab/multi-device can exceed the 20/day cap (explicit instance
> of the accepted client-cap trade-off); the onboarding warm-up consumes 1 of 20; cross-tab premium refreshes on
> reload. Rides unreleased SW `v223`.

> **2.132 (2026-07-07)** — **Premium Phase 6 certification fixes (ADR-109 addendum).** Three-agent adversarial
> certification: core enforcement sound; fixed the revise-flow gated-content leak for lapsed-premium users (CERT-1,
> found independently twice — due queue + hub count now filter locked topics), made the Learn upgrade land back on
> the paid-for chapter via the existing one-shot resume hook (CERT-2), hardened the learn-entitlements wiring in the
> parity check + one-time missing-module error with the narrow offline residual documented (CERT-3), de-duplicated
> `gate_shown` under the paywall debounce (CERT-4), made hub/strip lock badges track live entitlement both ways
> (CERT-5), extended the parity check to validate gated ids against real knowledge data — 16→34 assertions (CERT-6),
> and removed the dead `isPremiumFeature`/`isFeatureAllowed` helpers (CERT-7). Rides unreleased SW `v223`.

> **2.131 (2026-07-07)** — **Premium Phase 6: feature gating + free-plan hardening (ADR-109).** Gate Learn topics by
> section (whole Commercial-Math/Algebra/Modern-Math/Geometry; DI Charts/Tables/Sets; LR Critical/Visual Reasoning) +
> make Mixed Aptitude Premium, behind ONE **fail-closed** entitlement checkpoint (`paywall.requirePremium`); converted
> the pre-existing fail-OPEN gate idioms to fail-closed. Learn shows a polished locked topic page at the single render
> chokepoint + lock badges on hub cards; Practice gates Mixed at both the card and the launcher head (closes the
> companion deep-link bypass). Quick Start / Focus / DI-LR sets stay free; the ADR-107 20/day master cap is unchanged
> (verified). Entitlement telemetry reuses the AIAnalytics sink. New `js/learn-entitlements.js` ↔ shared `PREMIUM_LEARN`
> + `scripts/entitlement-parity.check.js` lockstep guard; `entitlements.js` gained MIXED_APTITUDE/LEARN_PREMIUM and the
> long-missing TIMED_MOCKS. Main-app SW **v222→v223**. No Firestore rules/schema change (analytics reuse `aiEvents`).

> **2.130 / Security 2.18 / Payment 2.5 (2026-07-07)** — **Phase-1–5 final certification fixes (ADR-108).** A
> four-agent independent audit returned PASS WITH MINOR ITEMS; all real issues fixed. Firm-cap: the quota "See results"
> finish collapses `count=current` (was reporting/persisting the wrong denominator), `showView` clears any pending
> resume hook, and the daily-cap paths open the precise `daily_limit` paywall. **Security:** the coaching-admin app
> loaded `../shared/validation/auth-validators.js` (served index.html in prod → signup validation silently skipped) —
> now a same-origin copy (coaching SW **v3→v4**), with a dead copy removed from super-admin and a new
> `auth-validators.check` lockstep guard; the `_clockSafeNow` rewound-clock guard was inert (no server timestamp
> reached the client) and is now anchored to `planUpdatedAt`/`updatedAt`. **Payment:** `activatePremium` stacks an
> early renewal on `max(now, currentExpiry)+days` instead of resetting. Settings paywalls use their specific context
> keys; `report-schema.json` prose corrected. Main-app rides unreleased `v222`; no Firestore schema change.

> **2.129 / Firestore 2.32 (2026-07-07)** — **Phase-5 paid/free consistency + firm free limits (ADR-107).** The final
> roadmap phase. The **20/day question cap is now firm mid-session**: a free user completes their 20th question but
> cannot begin #21 — the drill engine **pauses** (a quota-reached panel), preserving all progress/analytics, and an
> immediate upgrade **resumes the same session** via a one-shot hook in the payment-success path (new pure
> `js/quota-policy.js` + `scripts/quota-policy.check.js`). **DI/LR Sets** stay free but are gated to **one of each per
> day** for free users (Premium unlimited) via new client counters **`stats.diSetsToday`/`stats.lrSetsToday`** (the
> Firestore bump — two mirrored today-counters, reset daily like `todayAttempted`). Consistency: a defensive mock gate
> (PREM-5), premium probes normalized to `hasPremiumAccess()` (PREM-6), a lockstep-guarded `FREE_DAILY_QUESTION_LIMIT`
> named const + `scripts/daily-limit.check.js` (PREM-7), seven added paywall context lines (PREM-8), and the dropped
> onboarding "Goals above 20 require Premium" note (ONB-4). Client-only cap is a documented trade-off (PREM-4). No
> rules/index change; rides unreleased `v222`.

> **2.128 / Firestore 2.31 (2026-07-07)** — **Phase-1–3 certification fixes + Phase-4 (ADR-106).** Certification
> found the free-explain gate reused `explanationsUsed` (shared with premium telemetry), starving lapsed-premium users
> of their 5 free — split onto a dedicated **`usage/ai.freeExplanationsUsed`** field (the Firestore bump); also a
> limit cross-check, a trimmed + value-locked admin CSS port, and minor doc/UX fixes. Phase 4: onboarding is now
> **resumable** (not locked out on abandon) with a global Back + named-constant nav (ONB-1), teaches the practice loop
> incl. DI/LR (ONB-2/3), and a Stats-spotlight a11y fix; the App Guide gains a Quant/DI/LR "Question Types" section
> (GID-1); every DI/LR Learn topic gains a difficulty-mapped `revisionIntervalDays` (LRN-2). New
> `scripts/onboarding.check.js`. No Firestore rules/index change; rides unreleased `v222`. ONB-4 → Phase 5.

> **2.127 / Arch 2.63 (2026-07-07)** — **Phase-3 exam-grade visuals + REP-1 (ADR-105).** DI charts gained a value
> scale + gridlines (VIS-1), axis titles (VIS-2), and one theme-tuned CSS-variable series palette that ends the
> single-series rainbow and fixes dark mode (VIS-3/4); LR figures got normalized stroke tokens (VIS-5), larger caps
> (VIS-6), and an opaque option-letter badge (VIS-7). **REP-1:** the two pure renderers were promoted to canonical
> **`shared/ui/{di-charts,lr-figures}.js`** with byte-identical app copies (new `scripts/sync-visual-renderers.js` +
> `visual-renderers.check.js`, the ADR-099/102 pattern), so the **super-admin Reports detail** now re-renders a
> student's reported chart/figure instead of raw JSON (specs were already stored — no main-app capture change).
> Super-admin SW `v13→v14`; chart/figure CSS ported to `admin-style.css`. Also closed a Phase-1 residual: `_explain`'s
> 400 path now refunds the free credit. Main-app rides unreleased `v222` (no re-bump). No Firestore/rules change.

> **2.126 (2026-07-07)** — **Phase-1 verification hardening + Phase-2 dead-code prune (ADR-104).** Adversarial
> re-review of Phase 1 (ADR-103): added `refundFreeExplain` so a pre-generation server error can't burn a free
> credit, and a proactive Explain-button lock at exhaustion; extended `free-explain.check.js` to 26 assertions. The
> `ai_explain` paywall-copy reword was declined (shared key across three exhaustion sources) → Phase 5. Phase-2
> "clean up behind the scenes": removed dead ids (`#masterySection`/`#timeSection`), a never-read `onShare` noop, and
> a duplicated custom-practice default; **retained** the scaffold seam (documented). No schema/rules change; rides
> unreleased `v222` (no SW/version re-bump).

> **2.125 / Firestore 2.30 (2026-07-07)** — **Free-tier AI-explanation allowance (5 lifetime) + Phase-1 polish
> (ADR-103).** The upgrade screen's "free AI explanations" promise is now honoured: free accounts get **5 real QuanAI
> "Explain" calls, lifetime**, server-enforced (closes audit PREM-1). The count reuses the existing
> `users/{uid}/usage/ai.explanationsUsed` field — **no new schema**; the Firestore bump records that this field is now
> the *enforced free-explain meter*, not just telemetry. The limit + pure grant decision live in the dependency-free
> `services/freeExplainPolicy.js` (single source of truth, unit-tested via `scripts/free-explain.check.js`);
> `aiService.consumeFreeExplain` wraps it in a race-safe Firestore transaction; `api/ai.js` gates strictly on
> `action==='explain'` after throttle/budget so no other AI action leaks and no blocked request burns a credit;
> `trackExplanationUsage` gated to premium-only to avoid double-counting. Client: `canOpenExplain()` lets a free user
> reach the server (drill + duel Explain buttons), which is the true gate; a subtle "N free left" note + session 🔒
> hint on exhaustion. Bundled Phase-1 polish is copy/CSS/doc only (fade-in stagger, audience wording, runtime-sourced
> version line, stale-comment corrections). `APP_VERSION` v221→**v222** + `QR_APP_VERSION` lockstep. No Firestore
> rules/index change (doc + field pre-exist, server-write-only).

> **2.124 / Arch 2.62 (2026-07-06)** — **Unified in-app Update System across all three apps (ADR-102).**
> The "update available → Update App" experience now exists in the **main app, Super-Admin, and Coaching-Admin**,
> implemented ONCE behind a shared, behavior-preserving module. New canonical **`shared/update/update-manager.js`**
> (`QRUpdateManager`) owns all the mechanics (registration, detection, version-scoped dedup, skip-waiting, cache
> purge, one-shot reload, race/loop handling) and exposes only state + actions; each app renders its own themed
> toast + Update button. Because `shared/` is outside every deploy root (the ADR-099 P0), each app loads a
> **byte-identical local copy** (`scripts/sync-update-manager.js` regenerates them; `scripts/update.check.js`, wired
> into `npm test`, fails on drift or SW↔`window.*_APP_VERSION` version skew). The main-app refactor is
> **behavior-preserving** (same toast/copy/click→Settings, always-present button). The admin `sw.js` files gain an
> `APP_VERSION`-derived cache, a `GET_VERSION` handshake, and network-first JS/CSS + nav fallback, while
> **deliberately keeping no `skipWaiting()` on install** (admins must not swap SW mid-session); each shows an Update
> button **only when an update is available**. Correctness: version-scoped dedup, **no `controllerchange` listener**
> (no reload loop), cache-purge-before-reload (no stale/partial state), flag consumed once, first-install silent.
> `vercel.json` adds `no-cache` + `Service-Worker-Allowed` for `/sw.js` in both admin apps. No Firestore
> rules/index/schema change; no new infra. SW: main v220→v221, super-admin cache v12→v13, coaching cache v2→v3.
> Verified: `npm test` + `update.check` (32), Node module harness (18), Playwright presentation/browser-parse (18).
>
> **2.123 / Firestore 2.29 (2026-07-06)** — **Reporting final hardening pass: from-scratch adversarial re-audit + confirmed fixes (ADR-101).**
> A fresh, distrust-everything re-verification of the whole reporting system. Design confirmed sound (AI reporting
> complete across all three surfaces; escaping clean; write race-safe; six-surface enum lockstep holds); fixed every
> confirmed defect: **[data loss]** the server now captures the LR **`figure`** in the question snapshot (**Firestore
> 2.29** — a `visual` report no longer stores no picture); **[schema invariant]** the `ai`/`learn` bundles are now
> strictly **source-gated** (a fabricated bundle on a `bug`/`typo` is stripped server-side); **[impossible reason]**
> `visual` gains `figureOnly` and is dropped from the in-drill grid when the question has no visual (twin of the
> `mcqOnly` gate); **[false success]** Contact copy runs the execCommand fallback on clipboard reject and never toasts
> a false success; **[moderation]** Learn topics are searchable, a per-type analytics breakdown + dashboard family
> strip, the page-local-search banner shows only with a text query, duel reports drop the mislabelled answer-type
> line, an unknown-type family badge has a neutral default; **[never-lose]** the offline queue treats 401/409 as
> retryable; scaffold Learn topics now expose the report action. No taxonomy/type/source change (values still
> index-agnostic) → **no new index, no rules change**. report.check.js → 675; Playwright → 83; full suite + real-app
> boot smoke green. No new infra (Vercel-Hobby intact). SW v219→v220.
>
> **2.122 / Firestore 2.28 (2026-07-06)** — **Reporting production sign-off: Learn reports · MCQ-vs-typed · Contact card · admin moderation (ADR-100).**
> The final sign-off for the reporting feature. **(1) Learn topic reporting** — a purpose-built `source:'learn'` flow
> opened from a quiet end-of-chapter affordance; a new `learn_issue` type in a new `learn` group with its own
> sub-reasons (no AI reason — Learn has no AI surface); the chapter is attached as a top-level **`learn` field**
> `{topicId,title,category,subject,difficulty,examFrequency,route}` (**Firestore 2.28**). **(2) MCQ-vs-typed** — the
> in-drill reason grid now drops "Bad options" for typed/numeric questions (new `mcqOnly` flag), the question snapshot
> gains **`isMCQ`/`answerFormat`**, and the UI/admin never say "options" for a typed question. **(3) Contact card** —
> a premium "Contact QuantReflex / quantreflex@gmail.com" support card in Settings (mailto + copy-to-clipboard).
> **(4) Super-Admin moderation** — per-type icon + family badge on every list row, a grouped type filter, and a Learn
> topic detail block + Answer-type line. Values remain index-agnostic → **no new index, no rules change**.
> report.check.js → 595; Playwright → 77; full suite + real-app boot smoke green. No new infra (Vercel-Hobby intact).
> SW v218→v219.
>
> **2.121 / Firestore 2.27 (2026-07-06)** — **Reporting: final verification pass — fixes (ADR-099).**
> A fresh adversarial re-audit (3 independent agents + owner review) of the entire reporting system. Design
> confirmed sound; fixed every real defect: **[HIGH]** the in-drill report now PAUSES the session so a Timed/Reflex
> run can't end / auto-mark / auto-advance under the sheet ("your session is safe" now true); **[HIGH]** duel-review
> AI reports no longer lose the question text/signature (`snapshotQuestion` accepts `questionText`); **[HIGH]** the
> substance guard gates on materialized content, not the spoofable client `source` (closes empty/junk-report
> bypasses); **[MED]** deterministic report doc id + in-transaction existence check kills the concurrent
> double-file / aggregate double-count race; **[MED]** super-admin now labels sub-reasons (were raw ids); **[MED]**
> Playful icon masks + rating ARIA + button roles + touch targets + a dirty-form dismiss guard; **[LOW]** own rate
> bucket, queue keeps the newest at the cap, full AI-explanation capture, escaped reports drop the stale question.
> No taxonomy/schema change (Firestore 2.27 unchanged); no rules/index deploy. report.check.js → 541; Playwright
> → 64; all prior suites + real-app boot smoke green. SW v217→v218.
>
> **2.120 / Firestore 2.27 (2026-07-06)** — **Reporting: P0 taxonomy-load fix + premium bottom-sheet redesign (ADR-099).**
> The "Report a problem" sheet was rendering EMPTY in production — a load bug, not weak design: the modal's taxonomy
> was loaded from `../shared/constants/report-types.js`, but `shared/` sits outside the main-app deploy root, so the
> SPA catch-all rewrite returned index.html → SyntaxError → `window.ReportTypes` undefined → empty grid (reporting
> unusable since ADR-096; the same bug silently disabled `AuthValidators`). Fixed by serving both from the app origin
> (new `js/ui/report-taxonomy.js` + `js/utils/auth-validators.js`) + a defensive fallback so an empty grid can't recur.
> The report modal is redesigned as a **companion-style bottom sheet** (grabber, drag-to-dismiss, responsive→centred,
> dark/reduced-motion/safe-area): Settings = a guided category chooser; in-drill = a contextual question header + a
> 12-reason grid; AI = a purpose-built QuanAI reason grid. The type taxonomy is **enriched** — question family split
> into 12 top-level reasons (per-reason triage counts), a new `ui_issue` app type, and `ai_issue` in its own `ai`
> group (**Firestore 2.27** — `classification.type` value-set change; values are index-agnostic so **no new index and
> no rules change**). report.check.js → 518 assertions (4-surface browser↔shared↔server↔super-admin lockstep);
> Playwright → 54 (loads via the local taxonomy path, proving the grid renders). All prior suites green. No new infra
> (Vercel-Hobby intact). SW v216→v217.
>
> **2.119 / Firestore 2.26 (2026-07-06)** — **QuanAI identity: no LLM leakage in reporting + final-pass hardening (ADR-098).**
> Final independent verification pass. Enforced the **QuanAI product-identity** rule (users must never learn the
> underlying LLM): ADR-097 had surfaced the raw model + `provider:'openai'` in the explain envelope, the report
> modal UI, and the report payload/localStorage — all removed. The report `ai` object is now `{explanation, promptId}`
> where `promptId` (`explain.base@3`) is a QuanAI-owned version id that reveals nothing; the real model stays only in
> server-side `aiRequests` telemetry (**Firestore 2.26** — `reports.ai` shape change). Also fixed the low-severity
> items two independent re-audits found: duel-review explanations are now reportable with context; "oldest open"
> analytics spans all open statuses; an `archived` filter chip; scalar answer/option size caps; openCount-failure
> logging; typed-input restore on terminal-error re-render; and a lockstep guard over the Super-Admin view label maps.
> report.check.js → 254 assertions; Playwright → 52 (both include QuanAI no-leak guards). All prior suites green.
> No new infra / no rules or index change (Vercel-Hobby intact). SW v215→v216.
>
> **2.118 / Firestore 2.25 (2026-07-06)** — **AI-explanation reporting + reporting adversarial hardening (ADR-097).**
> A code-first adversarial re-verification of ADR-096. Closed the headline gap — users can now **report an AI
> explanation from the explanation itself** (a ⚑ in the Companion explain sheet), auto-capturing the full question
> snapshot + the AI explanation text + model + prompt version; the model is now surfaced in the explain envelope
> meta (`aiBrain.js`, one field) and reports gain a top-level `ai{}` field + a `context.app.source:'ai_explain'`
> value (**Firestore 2.25**; no rules/index change — the field needs neither). Fixed the audit's findings:
> a **HIGH** data-loss bug where the Super-Admin list pagination skipped matching reports under an in-memory filter;
> `_str` deleting newlines/tabs from multi-line free text; rating-only feedback being rejected; internal notes never
> rendered; the offline queue's dead fatal-drop; and rate-limit-before-dedupe. report.check.js → 226 assertions
> (incl. tri-surface enum lockstep); Playwright sweep → 47 (AI-report payload, z-index layering, rating-only,
> multi-line). All prior suites green. No email / no attachments (ADR-096 holds). SW v214→v215.
>
> **2.117 / Arch 2.61 / Firestore 2.24 / Security 2.17 (2026-07-06)** — **Ultimate Reporting System (ADR-096).**
> A complete user-reporting ecosystem across the main app and the Super-Admin app: a premium "Report a Problem" modal
> (Settings + a fast in-drill ⚑ button that auto-scopes to the current question), a server-authoritative Firestore
> model, an offline-safe queue that never loses a report, and a full Super-Admin Reports triage section (dashboard,
> filter/search master list, detail tabs, status/assign/priority/label/note/merge-duplicate, "reported N times"
> aggregation). Per owner directive it uses **no email / notification service** (the Super-Admin dashboard is the
> source of truth) and **no screenshots in v1** (maximized auto-context — app version, device/runtime, locale, route,
> recent errors, and a full question snapshot — replaces them); both are clean, migration-free future seams. New:
> `reports/{id}` + `questionReports/{signature}` (both server-write-only, all-deny client rules) + 7 reports composite
> indexes → **Firestore 2.24**; `/api/report` (withAuth, 15/hr·60/day report cap, server-assembled doc + dedupe) and
> `/api/admin/reports` (withAdminAuth, audited) → **Security 2.17**. 212 report.check.js assertions + a 35-assertion
> Playwright browser sweep green; all prior suites green. SW v213→v214 (window.QR_APP_VERSION in lockstep). Owner
> deploys `firebase deploy --only firestore:rules,firestore:indexes`; no email/attachment provisioning needed.
>
> **2.116 / Arch 2.60 (2026-07-03)** — **RC verification: pause regression fix + backlog execution (ADR-095).**
> Evidence-based re-verification of the ADR-094 fixes (cross-checked by an independent adversarial review): C1/H2
> confirmed correct; one regression the review caught — the new physical-keyboard handler firing under the pause
> overlay — fixed. The hard-tier de-dilution was then finished across ~14 more Quant categories (incl. simple-interest,
> whose guaranteed-clean fallback still injected the easy `si` key, and time-and-work, which gained a real hard
> archetype), so "difficulty earned by reasoning" holds app-wide and the check's downgrade guard is meaningful
> everywhere. Backlog executed: stats premium cards unlock on in-session upgrade; string-archetype recompute coverage
> (+857 checks); theme-aware Home goal ring; 44px category buttons + AA dark tertiary text; dead-code + inline-handler
> cleanups; SW network-first timeout for lie-fi; and the long-documented localStorage legacy→canonical migration now
> actually implemented. All 26 suites green. No schema/security change. SW v211.
>
> **2.115 / Arch 2.60 (2026-07-03)** — **Full-repository audit: submission bug + Critical/High remediation (ADR-094).**
> A three-lens audit (architecture / product-education-a11y / bug-hunt), each finding code-verified. The reported P0
> ("cannot submit answers") did not reproduce on the mainline pipeline; the one real submission defect — review mode
> re-queuing a wrong MCQ mistake without its `options`, so it re-rendered as an un-typeable numpad — was fixed
> (full-clone re-queue). Highs: physical-keyboard numeric entry added to the numpad (accessibility/desktop) without
> breaking the mobile no-native-keyboard invariant; authored-LR tier fallback made tier-aware (Easy never silently
> serves Hard) and thin banks deepened (77→92 items); Quant hard tiers de-diluted (percentages/ratios/averages/
> multiplication) so difficulty is earned by reasoning, not number size, with `TIER_KEYS` in lockstep. All 26 check
> suites green (quant 112,990 assertions / 0 mismatches). Medium/Low findings recorded as a backlog in ADR-094. No
> schema/security change. SW v210.
>
> **2.114 / Arch 2.60 (2026-07-03)** — **Visual question ecosystem redesign + Quant recalibration (ADR-093).**
> LRFigures v2 grows the figure vocabulary from 5 to 12 primitive kinds (shapes/compositions/lattice line figures/
> paper folding/cube nets/three-face dice/3×3 matrices); lr-visual-engine v2 rebuilds all six visual categories on
> real exam archetypes and adds four new ones (`lr-odd-fig`, `lr-paper`, `lr-pattern`, `lr-embedded`) — every
> archetype independently recomputed by the check harness (chirality, fold-reflection, die-pair and segment-subset
> proofs). The drill gains a visual presentation stage (compact instruction stems, framed figure panel, A–D
> lettered picture options); DI lead-ins de-robotized. Quant: 12 new/replacement archetypes fix every
> hard-is-just-bigger-numbers tier (cubes/TSD/fractions/pipes/PnC/quadratic/series + the averages hard fallback)
> and a wording pass adds natural exam phrasing to the single-literal families under the numeric-token-order rule.
> No schema/security change. SW v208.
>
> **2.113 / Arch 2.59 (2026-07-03)** — **Learn reimagined (ADR-092).** First-principles Learn redesign around
> Study / Revise / Look-up: hub becomes a short router ("Up next" recommended chapter, "Revise today" card,
> Continue/Needs-practice/Saved strips, Quick-Reference entry + hub times tables, browse, collapsed "My notes");
> new **Guided Revision flow** at `#learn/revise` (`js/learn/revise-flow.js` — due topics as sequenced recall over
> the existing revision blocks, `markViewed` re-arms the spaced interval); the Quick-Reference library is the ONE
> home for condensed reference (grids extended to 1–50/1–30, full fraction table; static hub duplicates deleted);
> one unified search over topics + cards (`LearnSearch.queryCards`, `QuickRef.reveal`); topic pages become a
> single reading spine (honest back link, aside → end-of-chapter footer, quieter pills, lede overview). No schema
> or security change (all Learn state stays in the existing localStorage keys / FirestoreSync fields). SW v207.
>
> **2.112 / Arch 2.58 / Firestore 2.23 (2026-07-02)** — **Product Excellence Pass (ADR-091).** The remaining audit
> items, independently re-evaluated: M11 + M3 closed as already-solved, M4 rejected as wrong (exact-equivalence
> grading needs printed DI values), M6/N-series deferred. Shipped: correct-answer chime + quiet streak chip + shake
> removal (reinforcement now favors success); honest "⏱ Time's up" timeout verdict (amber, no failure sound); the
> numpad yields to the explanation after answering; 1-tap Home warmup (`skipStartScreen` reuse); cold-start dashes
> instead of zeros (streak badge/accuracy/quota); **Appearance System/Light/Dark** with lazy legacy migration + live
> OS-scheme listener (Firestore 2.22→2.23 — `settings.appearance`, no migration); calm-until-urgent timers with
> tabular numerals; ≥768px tablet drill layout (640px surfaces, 3-col results); legacy token aliases in `:root`;
> 44px pause/exit targets + pause in set-mode; system-ui-first font stack; results-heading focus ring suppressed.
> SW v205→v206.
>
> **2.111 / Arch 2.57 / Firestore 2.22 / Security 2.16 (2026-07-02)** — **Critical launch-readiness resolution
> (ADR-090).** The 7 Critical audit findings, independently re-evaluated then implemented. Target-exam identity: new
> `TargetExam` accessor (canonical synced `settings.targetExam` + `targetTier`, `qr_active_exam` mirror), onboarding
> tier→exam step, Settings row, hero chip (Firestore 2.21→2.22 — two new settings-map fields, no migration).
> Fabricated "Faster than N% of users" percentile deleted everywhere → honest Speed Score + self-trend
> (`qr_last_speed_score`). Session Complete: one verdict slot (PB needs ≥3 prior sessions; neutral <50% verdict),
> ≥3-attempt topic cards, free session-scoped "Review these N now" (in-memory `_preloadedQuestions` replay; amends
> ADR-089 forward-only). QR icon system: one `qr-ico` markup, playful renders `--qri-*` CSS masks (~36 glyphs);
> `updateNavigationIcons` deleted; 8.3MB `appicons/tab` assets removed; `--qr-grad-a/b` + `--qr-shadow-playful`
> tokens. Google Sign-In (Security 2.15→2.16): popup-first client flow + idempotent authed
> `POST /api/account?action=ensure-profile` (register-shaped seed; fixes the claimSession skeleton-doc bug; replaces
> the rules-denied client `_createDefaultDocument` write); provider-aware delete re-auth; Profile-modal bind-once
> coaching claim; `scripts/ensure-profile.check.js`. Copy coherence (goal 20/10–100, "Stats", "Today's Goal", honest
> exit dialog, 4-tier catalog copy). Paywall price-first + 7-day-refund trust row + support email; "5 free to try".
> All 26 checks green; Playwright-verified across themes. SW v204→v205.
>
> **2.110 / Arch 2.56 (2026-07-02)** — **Final UI cleanup (ADR-089).** Production polish, not a redesign. Results
> screen is now forward-only: removed the Practice-My-Mistakes shortcut, Practice-Again/Retry, and Increase-Difficulty
> buttons + the dead restart machinery they were the only callers of; the actions are Continue Learning (primary,
> full-width, always) over Back to Practice (secondary), with Share always shown. Removed the Stats "Performance
> Insights" and "Exam Readiness" sections and their exclusive `statMath` derivations (`comparativeInsights`,
> `examReadiness`, `_hardAccuracy`, `_CONF_FACTOR`) + CSS + check assertions. Fixed the results topic cards to
> two-line-clamp long names (equal-height, no clip/overflow at 320/768/landscape) and renamed the Settings toggle to
> "Ask Subject". Kept in full: Review My Mistakes (mode/entitlement/paywall/routes), the shared `performance_insights`
> entitlement + marketing, all shared `statMath` helpers, the planner readiness subsystem, and the drill
> session-insight card. Harness 25/25 green; 80-assertion Playwright sweep across 4 themes × 320/768. SW v203→v204.
>
> **2.109 / Arch 2.56 (2026-07-02)** — **Drill hardening round 2 (ADR-088).** Re-ran the assume-nothing quality-gate;
> re-verified ADR-086/087 correct from code, then fixed a regression (Practice-Mistakes count), a latent bug (0-answer
> speed-score inflation), a11y gaps (progressbar role, results focus/announce, pause aria-modal, MCQ aria-label escape),
> a dead duel branch, and the `.session-upgrade-banner` unstyled in Light/Playful. Completed the Playful theme across
> the older results/feedback components (buttons, benchmark card, badges, pills, MCQ, insight/auto-explain/wrong-answer,
> feedback text) via a token-driven `body.theme-playful` block — Classic/Dark byte-identical, all 11 new pairs WCAG AA.
> SW v202→v203.
>
> **2.108 / Arch 2.56 (2026-07-02)** — **Drill Engine final verification + hardening + Playful identity (ADR-087).**
> A no-assumptions quality-gate on ADR-086 (3 independent audits + code re-reads + full harness). Fixed three
> browser-reproduced correctness bugs — Reflex double-advance/skip (D1), pause-during-auto-advance strand (D2), review
> Retry count inflation (D4) — plus `finish()` idempotency, a visibility-listener leak, dead code (unreachable
> Word-Problems launcher, `_shareTextFallback`, redundant Reflex literal), the `13.5↔13.75rem` numpad drift (now one
> `--qr-numpad-h` token), a duplicate `.results-share-btn`, and wired the orphaned `mock-engine.check` (npm test now 25
> checks). Completed the **Playful theme** into a full token identity (accent/text/bg/status/focus) and tokenized the
> drill components that still hardcoded colour — Classic + Dark byte-identical (computed-verified), only Playful
> re-themed, all pairs WCAG AA. SW v201→v202.
>
> **2.107 / Arch 2.56 (2026-07-01)** — **Complete Drill Engine redesign (ADR-086).** The drill journey — start →
> loading → question loop → teaching feedback → completion dashboard → next actions — redesigned as one premium product
> across all three themes. New `js/answer-format.js` registry is the single source of truth the grader, the spec-driven
> adaptive keypad, and a ~35k-assertion coverage check (`scripts/answer-format.check.js`) all consume, so keyboard
> completeness is code-enforced (fixed the un-typeable `"3/8"`, dropped the dead `%`). Added a premium start screen +
> honest loading state, first-class MCQ-in-dock, a teaching correction panel, the revived Reflex auto-advance
> (`opts.autoAdvance`), a performance dashboard with context-aware next actions, pause/resume with backgrounding
> auto-pause, and graceful failure on every path. All driven by a new semantic design-token system (no new hues) that
> makes light/dark/theme-playful first-class from one implementation. No generator/answer changes (harness stays
> 0-mismatch). SW v190→v200.
>
> **2.106 / Arch 2.55 (2026-07-01)** — **Dragon-Boss whole-app production audit (ADR-085).** A no-assumptions sweep of
> the entire main-app (runtime, PWA/SW, security, dead-code, docs) with every agent claim re-verified against code.
> Verified-clean on PWA/security/code-health; rejected 5 false "critical" claims. Two real fixes: (1) drill-engine
> Reflex auto-advance + next-guard `setTimeout`s are now stored and cancelled in `cleanup()` (browser-proven: no stray
> advance after exit); (2) documentation rot — README's fictitious per-page HTML rewritten to the real SPA layout, and
> stale "14/12 Quant categories" corrected to 36 across README + 4 code comments. SW v189→v190.
>
> **2.105 / Arch 2.55 (2026-07-01)** — **Quant Gold Audit (ADR-084) — Batch 9: final production-audit fixes.** An
> independent strict audit (3 parallel sweeps + 32,400-question stress) found and fixed three items: pipes-cisterns
> easy variety (3→18 distinct stems via a wider clean pool), a stale 14-item test whitelist in
> `knowledge-base.check.js` (now derived from the source of truth), and leftover unused exports in
> `generative-helpers.js` (NAMES/ITEMS/item/sample removed; 21→17 keys). Harness 113,001/0; full npm test green; DI/LR
> regression clean. SW v188→v189.
>
> **2.104 / Arch 2.55 (2026-07-01)** — **Quant Gold Audit (ADR-084) COMPLETE — Batch 8: global validation + ship
> verdict.** Whole-engine acceptance: full npm test green (harness 112,993/0), 4,320-question stress (0 dirty / 0
> throws / 24 names), browser at 360/390/768/1280px light+dark (picker + Quick-Reference, 0 errors, no overflow).
> Ship verdict: **GO** — coverage complete AND discoverable, DI/LR bar held, no regressions/new deps/dead code.
> Docs-only (no SW bump).
>
> **2.103 / Arch 2.55 (2026-07-01)** — **Quant Gold Audit (ADR-084) — Batch 3: premium Quick-Reference library.** A new
> curated revision library at the Learn sub-route `#learn/quick-ref` (opened from a hub entry chip): 21 cards across 5
> sections — formulas, comparison tables and standard values students re-read before mocks — in collapsible/searchable
> sections with per-card Learn/Practice cross-links. New `js/quick-reference/{quick-ref-data,quick-ref-renderer}.js`
> reuse `BlockRenderers.table` + `.math-grid` + `.collapsible-*` + dark-mode; content is free (no new Firestore/paywall).
> New `scripts/quick-ref.check.js` guards cross-links (382/0). Browser-verified 360/768px light+dark, 0 errors. SW
> v187→v188.
>
> **2.102 / Arch 2.54 (2026-07-01)** — **Quant Gold Audit (ADR-084) — Batch 7: dead-code cleanup.** Removed the unused
> `_round1()` from questions.js and eight never-called exports (`mcq`, `nearMissDistractors`, `frac`, `commaGroup`,
> `pluralize`, `gcdArr`, `lcmArr`, and `factorize` from the public API only — still used internally by `numFactors`)
> from generative-helpers.js. Each re-grepped across main-app/api/scripts before removal; QRGen surface 29→21 keys;
> dual-export + duel Node path intact; full npm test green. SW v186→v187.
>
> **2.101 / Arch 2.54 (2026-07-01)** — **Quant Gold Audit (ADR-084) — Batch 6: Learn consistency + high-value tables.**
> Added the missing "How toppers handle these" exam block to 5 chapters (multiplication, fractions, squares, cubes,
> permutation-combination) and scannable comparison tables to 3 formula-dense chapters (progressions AP-vs-GP,
> set-theory regions, statistics-basics measures), plus a few searchTerms. Pure content — learn-content/render + full
> npm test all green. SW v185→v186.
>
> **2.100 / Arch 2.54 (2026-07-01)** — **Quant Gold Audit (ADR-084) — Batch 5: archetype + explanation + difficulty
> polish.** Added a genuine 2nd easy archetype to the four single-archetype easy tiers (logarithms `solveLog`,
> partnership `shareRatio`, ages `presentAge`, simple-interest `amount`), enriched six terse explanations to
> method→working→shortcut/trap depth, and unified the logarithms base set to include the common log (base 10). Every
> new numeric archetype is independently recomputed by the harness (112,993/0). SW v184→v185.
>
> **2.99 / Arch 2.54 (2026-07-01)** — **Quant Gold Audit (ADR-084) — Batch 4: generator scenario/name diversity.**
> Wired the previously-unused shared `NAMES`/`ITEMS`/`twoNames()` pools + expanded context pools into the word-problem
> generators (partnership, ages, ratios, mixtures, trigonometry, set-theory) so drills stop feeling templated. Names/
> items carry no digits → recompute byte-identical (harness 113,050/0). SW v183→v184.
>
> **2.98 / Arch 2.54 (2026-07-01)** — **Quant Gold Audit (ADR-084) — Batch 2b: picker personalization + favourites.**
> A "For You" strip (Recommended · Continue · Recently practised · Pinned) built from existing signals (exam-relevance,
> LearnProgress, localStorage — no new Firestore), a per-row ☆/★ pin toggle, and a subtle 🔥 on most-asked topics.
> `practice-modes` reads `data-label` so button decorations never leak into the drill label. SW v182→v183.
>
> **2.97 / Arch 2.54 (2026-07-01)** — **Quant Gold Audit (ADR-084) — Batch 2a: dynamic category picker.** The Practice
> "Choose Category" grid now renders from the single source of truth (`js/ui/category-picker.js`) instead of static
> HTML frozen at 14 Quant categories — all 36 appear, grouped into collapsible sections with topic counts and a live
> search (DI + LR too). Same `.category-btn[data-cat]` click contract → focus/custom flows unchanged. SW v181→v182.
>
> **2.96 / Arch 2.53 (2026-07-01)** — **Quant Gold Audit (ADR-084) — Batch 1: zero stale category lists.** Category
> display now derives from the single source of truth (`services/quantTopics.js`): `formatCategoryName` (app.js),
> planner `drillName`, and duel `_categoryEntries` no longer hold frozen 14-item snapshots, so all 36 categories render
> real names in results/stats/planner/duel. New `scripts/category-source.check.js` enforces generator↔label parity.
> SW v180→v181.
>
> **2.95 / Arch 2.53 (2026-07-01)** — **Quant Master Overhaul — Phases 4 & 5: calibration + global validation
> (ADR-083 COMPLETE).** Whole-engine acceptance sweep: **36 Quant drill categories**, each with a generator AND a Learn
> chapter, **zero orphan content** (script-verified). Recompute harness **113,039 assertions / 0 mismatches** across all
> categories × 3 tiers; a 4,320-question cross-topic stress run found 0 dirty answers, longest stem 146 chars. Real
> browser boots clean and the longest stem + quantity-comparison MCQ render with no overflow at 360px. exam-relevance
> covers all 62 published Learn topics; full `npm test` green. The Quant engine now matches the DI/LR production bar.
>
> **2.94 / Arch 2.53 (2026-07-01)** — **Quant Master Overhaul — Phase 3 COMPLETE (batch G-b): quantity-comparison
> (ADR-083).** The final new topic — **quantity-comparison**, the one genuinely-MCQ Quant format (Banking/CET). The
> generator computes two Quantities from varied sub-problems (%, product, linear solve, average, square) and returns the
> correct relation (I > II / I < II / I = II) via the drill engine's existing `q.options` MCQ path — no UI work; Quant
> stays numeric-entry everywhere else. Learn chapter + exam-relevance added. **Phase 3 (complete coverage) is now done:
> 36 Quant drill categories, 36 Quant Learn chapters, zero orphan content, 113,039 harness assertions / 0 mismatches.**
> Learn graph 61→62 topics; subjects roster 35→36. SW v179→v180.
>
> **2.93 / Arch 2.53 (2026-07-01)** — **Quant Master Overhaul — Phase 3 (batch G-a): close the last drill-only orphans
> (ADR-083).** Gold-standard Learn chapters for the four foundational speed-calc drills that had no Learn content —
> **multiplication**, **fractions**, **squares**, **cubes** (mental-math tricks, ends-in-5 squaring, cube-root last-digit
> map, fraction⇄percent table). With these, **every Quant drill now has a Learn chapter and every Quant Learn chapter
> has a drill — zero orphan content** (verified programmatically). exam-relevance metadata added (orders 32–35); numbers
> category 3→7 topics; Learn graph 57→61 topics. SW v178→v179.
>
> **2.92 / Arch 2.53 (2026-07-01)** — **Quant Master Overhaul — Phase 3 (batch F-b): complete Modern-Math (ADR-083).**
> Two NEW topics finish the Modern-Math category (now 4) — **set-theory** (two-set union/only/neither/both + three-set
> inclusion–exclusion) and **statistics-basics** (median / mode / range / mean of a data set) — each with an archetype
> generator (integer answers, Venn/data-set wording) AND a full Learn chapter, plus exam-relevance metadata. Harness
> recomputes each independently (inclusion–exclusion, sort-and-pick) — **109,447 assertions, 0 mismatches**; Learn graph
> 55→57 topics; subjects roster 33→35. Modern-Math now has zero orphans. SW v177→v178.
>
> **2.91 / Arch 2.53 (2026-07-01)** — **Quant Master Overhaul — Phase 3 (batch F-a): close the Modern-Math practice
> orphans (ADR-083).** New drill generators for the two existing drill-less Modern-Math Learn chapters —
> **permutation-combination** (factorial / arrangement / nPr / nCr / committee / handshakes, ASCII "7P3"/"8C3" notation)
> and **probability** (single-draw / complement / all-heads coins / multiples-in-a-range, clean decimal answers) —
> `drillCategory` set on both so every Modern-Math chapter now has a drill. Harness recomputes each archetype through an
> independent factorial/nCr path — **103,145 assertions, 0 mismatches**; subjects roster 31→33. SW v176→v177.
>
> **2.90 / Arch 2.53 (2026-07-01)** — **Quant Master Overhaul — Phase 3 (batch E-b): trigonometry + surface-area
> (ADR-083).** Two more topics — **trigonometry** (standard-angle evaluation / complementary angles / Pythagorean
> identities / 45° heights-and-distances — answers kept to the clean set {0, ½, 1} or integer angles/heights) and
> **surface-area** (cube TSA·LSA / cuboid TSA / cylinder CSA·TSA / sphere SA, under Mensuration) — generator + Learn
> chapter + harness each. **Also backfilled exam-relevance metadata for all 10 new ADR-083 algebra/geometry topics**
> (statmath.check now loads the algebra + geometry knowledge files, so every published topic is exam-weighted). Harness
> **96,837 assertions, 0 mismatches**; Learn graph 53→55 topics; subjects roster 29→31. Geometry now covers ratios &
> mensuration surface-area; heights-and-distances ships inside the trigonometry drill/chapter rather than as a thin
> standalone. SW v175→v176.
>
> **2.89 / Arch 2.53 (2026-07-01)** — **Quant Master Overhaul — Phase 3 (batch E-a): open the Geometry category
> (ADR-083).** New `geometry` Learn category (order 45) plus two gold-standard, diagram-free topics — **geometry-basics**
> (angle relations / triangle angle-sum & isosceles / Pythagoras via triples / polygon angles) and
> **coordinate-geometry-basics** (distance / midpoint / slope / section formula) — each with an archetype generator
> (earned difficulty + premium explanations) AND a full Learn chapter. Coordinates are kept non-negative so the
> sign-stripping recompute harness stays exact; slope is the one allowed-negative answer. Harness independently
> recomputes every archetype (Pythagoras, distance, section formula) — **90,515 assertions, 0 mismatches**; Learn graph
> 51→53 topics; subjects roster 27→29. SW v174→v175.
>
> **2.88 / Arch 2.53 (2026-07-01)** — **Quant Master Overhaul — Phase 3 (batch D-b): complete the Algebra category
> (ADR-083).** Three more gold-standard algebra topics — **logarithms** (evaluate / product-rule / power-rule /
> solve-for-x), **progressions** (AP nth-term & sum, GP nth-term & sum) and **inequalities-modulus** (smallest-integer
> solution / |x−a|=b / integer-count in a range) — each with an archetype generator (earned difficulty + premium
> explanations, ASCII-clean stems, ordinal wording) AND a full Learn chapter. Algebra now has all six planned topics.
> Harness recomputes every archetype independently (modular log, series formulas, band-counting) — **84,201 assertions,
> 0 mismatches**; Learn graph 48→51 topics; subjects roster 24→27. SW v173→v174.
>
> **2.87 / Arch 2.53 (2026-07-01)** — **Quant Master Overhaul — Phase 3 (batch D-a): Algebra category + first three
> algebra topics (ADR-083).** New `algebra` Learn category (order 35) plus three gold-standard, production-grade topics —
> **linear-equations** (one-variable solve / bracket / two-variable system), **quadratic-equations** (Vieta sum·product /
> discriminant / larger·smaller root, sign-clean x²−Bx+C form), **surds-indices** (power eval / fractional exponent /
> index law / solve-the-exponent) — each with an archetype generator (earned difficulty + premium explanations) AND a
> full Learn chapter (overview/concept/formula/trick/example/exam/trap/memory/revision), cross-linked both ways.
> Harness recomputes every archetype independently (Cramer's rule, Vieta, modular log) — **74,751 assertions,
> 0 mismatches**; Learn graph 45→48 topics; subjects roster 21→24. SW v172→v173.
>
> **2.86 / Arch 2.53 (2026-07-01)** — **Quant Master Overhaul — Phase 3 (batch C): number-properties drill
> (ADR-083).** New gold-standard `number-properties` generator (archetypes: HCF · LCM · unit-digit-via-cyclicity ·
> number-of-factors), wired into the category map + quantTopics + the number-system Learn topic's `drillCategory` —
> closing the last existing-Learn orphan. Harness independently recomputes every archetype (modular exponentiation +
> trial-division divisor count as independent code paths): **65,279 assertions, 0 mismatches**; subjects roster 20→21.
> SW v171→v172.
>
> **2.85 / Arch 2.53 (2026-07-01)** — **Quant Master Overhaul — Phase 3 (batch B): arithmetic practice orphans
> (ADR-083).** New gold-standard generators for ages (ratio-sum / age-difference / father-son), mixtures-alligations
> (alligation-ratio / mean-price / alligation-quantity) and pipes-and-cisterns (two-inlets / inlet-outlet net-fill),
> retiring pipes' `drillComingSoon`. `drillCategory` set on all three Learn topics (parity); harness recomputes the
> numeric archetypes (62,155 assertions, 0 mismatches); subjects roster 17→20. SW v170→v171.
>
> **2.84 / Arch 2.53 (2026-07-01)** — **Quant Master Overhaul — Phase 3 (batch A): commercial-math practice orphans
> (ADR-083).** New gold-standard generators for simple-interest, compound-interest and partnership, wired into the
> category map + quantTopics + the Learn topics' `drillCategory` for Learn↔Practice parity. Harness recomputes all
> three (52,956 assertions, 0 mismatches); subjects roster 14→17. Preceded by an independent Phase 1–2 regression
> audit (clean) + two prep fixes (suppress redundant auto-tip when a written explanation exists; drop dead `PI`). SW
> v169→v170.
>
> **2.83 / Arch 2.53 (2026-07-01)** — **Quant Engine Master Overhaul — Phase 2: overhaul the remaining 9 generators
> (ADR-083).** fractions, multiplication, ratios, averages, profit-loss, time-speed-distance, time-and-work,
> simplification and number-series now use the same per-tier archetype pools, earned difficulty, premium explanations
> and exam-authentic word-problem wording as the Phase-1 five. All 14 Quant generators are now at the DI/LR bar. The
> harness recomputes every category — **43,503 assertions, 5,638 answers independently recomputed, 0 mismatches**; Node
> duel path green. SW v168→v169.
>
> **2.82 / Arch 2.53 (2026-07-01)** — **Quant Engine Master Overhaul — Phase 1 foundation (ADR-083).** Bring the
> original Quant engine to the DI/LR bar. New shared `js/utils/generative-helpers.js` + an archetype framework in
> `questions.js` (per-tier `{k,skill,build}` pools, earned difficulty that never downgrades, premium teaching
> explanations, `subtype:'diff:key'`). Refactored squares/cubes/area/volume/percentages; new `quant-engine.check.js`
> (into npm test) recomputes answers independently — 27,917 assertions, 0 recompute mismatches. Node duel path intact.
> Phases 2–5 (remaining generators + full topic coverage + calibration + global validation) follow under ADR-083. SW
> v167→v168.
>
> **2.81 / Arch 2.53 (2026-06-30)** — **Final verification & excellence pass (ADR-082 addendum).** A 3-agent audit
> confirmed ADR-082 fully correct with zero regressions and the 45-topic library 100% spine-consistent (an audit
> agent's "missing formula/trick" claims were false on inspection). Real fixes: `tables.js` guards all 5
> `SoundEngine.play()` calls via `_sfx()` and drops the dead `renderMultiplicationTables()`. Surgical content (additive
> optional blocks): a base-comparison table on profit-loss, exam-strategy blocks on time-and-work + blood-relations.
> No new chapters/colours/deps/Firestore/gamification. learn-content 425 green; verified light+dark via Playwright.
> SW v166→v167.
>
> **2.80 / Arch 2.53 (2026-06-30)** — **Learn UX polish (ADR-082).** (1) **Settings fix:** the "Ask Subject Before
> Quick Start" row no longer clips its toggle on narrow phones (`.settings-label{min-width:0}` — the flexbox-overflow
> fix; subtitle wraps in-column). (2) **Squares 1²–50² / Cubes 1³–30³** reference grids extended. (3) **Learn subject
> filter:** a sticky All · Quant · DI · LR pill row that switches subjects instantly and remembers the last choice
> (`qr_learn_filter`); subtle "x read" progress on each subject header. (4) **Search aliases:** ap/gp/progression,
> p&c, tsd, family tree now resolve. No new Learn chapters (library stays 45), no new colours/deps/Firestore, no
> gamification. learn-content 425 green; verified light+dark via Playwright. SW v165→v166.
>
> **2.79 / Arch 2.53 (2026-06-30)** — **Final craftsmanship verification pass (ADR-081 addendum).** A 3-agent read-only
> audit found the ADR-080/081 work mostly correct, then fixed the real misses: an **icon-distinctness** bug (six topic
> icons duplicated their parent **category** glyph — the earlier check only compared topics to topics) resolved by
> broadening the 5 Quant category icons (🔟 ➗ 🏷️ 🃏 📏) and giving `di-bar-line` 📊→📉, so all 52 topic+category glyphs
> are now unique; tightened the two longest concept bodies; reordered the `practice-subject-modal.js` script before its
> caller; deleted dead `.category-stat-row`/`.cat-accuracy` CSS; and added four scripts missing from the SW precache
> (offline-robustness). No new colours/deps/Firestore; full suite green. SW v164→v165.
>
> **2.78 / Arch 2.53 (2026-06-30)** — **Learn experience & UI refinement (ADR-081).** Make the Learn tab read like a
> premium textbook and unify Quant/DI/LR. (1) **Reading experience** (one renderer change, all 45 pages): every section
> is headed by its real name — a concept by its own title, a table by its caption, others by richer labels (Key
> Formulae · Common Mistakes · Exam Strategy · Key Takeaways…); the sticky pills are a true table of contents; a new
> optional `exam` 📌 callout carries exam strategy. (2) **Icons:** a distinct, meaningful emoji for every one of the 45
> topics (LR was all 📘, DI had none). (3) **Comparison tables** on syllogisms, mirror/water/dice, perm-vs-comb,
> SI-vs-CI, bar/line/pie. (4) **Callout parity:** every LR topic now has both Shortcuts + Common-Mistakes. (5) **Cleanups:**
> removed the Practice "EXAM-STYLE" rail/eyebrow and shortened the Settings ask-subject row. No new colours/deps/Firestore;
> learn-content + learn-render checks green; rendered light + dark with no overflow. SW v163→v164.
>
> **2.77 / Arch 2.53 (2026-06-30)** — **Practice · Learn · Stats UX craftsmanship pass (ADR-080).** Make the three
> tabs feel like one premium platform, not modules — same blue identity, no new colors/animations, no gamification.
> (1) **Data foundation:** recorder enriched with per-category time/last-practiced + difficulty mix + a day-reset
> today tally (additive, no migration); a new **exam-relevance metadata layer** (`QR_EXAMREL`, all 45 topics) +
> six pure `statMath` derivations (time invested, mastery detail, comparative insights, per-exam readiness, weakest
> topics, next recommendation) — confidence-damped, with a 537-assertion check in `npm test`. (2) **Practice:**
> re-sectioned (Quick Start / Subject Sets / Advanced), a Battle-Archives-style **subject picker** before quick
> sessions (remembered + "don't ask again"), dead top-space removed. (3) **Learn:** subject sections that breathe,
> LR/DI presentational sub-groups, ONE contextual badge per card ("⭐ For <exam>" / "🔥 Most Asked"). (4) **Stats:**
> rebuilt to answer "Am I becoming better at aptitude?" — Today · Momentum · Subject Mastery · Performance Insights ·
> Exam Readiness · Time Invested · Study Next · QuanAI Recommends; honest empty states, never fabricated. No new deps,
> no new Firestore I/O. SW v161→v162.
>
> **2.76 / Arch 2.53 (2026-06-30)** — **LR content-excellence pass (ADR-079 follow-up).** Quality-over-quantity on the
> content itself, not the engine ("300 outstanding questions over 3000 generic ones"). (1) **Validator hardening** —
> `lr-authored.check` now gates duplicate stems, duplicate stem+option sets, and *exploitable-length give-aways* (the
> correct answer must not be >35% longer than every distractor); this caught ~11 lazy dismissive distractors, rewritten
> into believable full statements arising from real reasoning mistakes. (2) **Authored expansion by value** — premium CR
> subtypes (evaluate/complete/method/parallel) + 4 medium decision dilemmas; bank **64 → 77 items** (medium-decision
> pool 6 → 10). Premium items carry an `inspiredBy` exam-pattern tag — original, never mislabelled as official PYQs.
> (3) **Generative authenticity** — wider word/name/noun pools (coding 20→62, names 12→32, nouns 16→40), more
> odd-one-out groups & verbal analogies, varied human scene-setting on direction/ranking stems (all correctness-safe;
> the harness recomputes every token). (4) **Clock easy variety** — one form (angle at H:00) → five exam forms; a
> 40-draw variety probe 11/40 → ~32/40. (5) **Ring safeguard** — never re-serve the immediately-previous authored item.
> (6) **UI** — long statement options wrap defensively and left-align as prose (`mcq-para`). A near-term variety metric
> was added to the stress harness. Derived-only, no migration, no deps. Full `npm test` green; stress 51,003 Qs + 39,600
> figures, 0 defects / 0 low-variety tiers / 0 ring failures. SW v160→v161.
>
> **2.75 / Arch 2.53 (2026-06-30)** — **LR final production audit & stabilization (ADR-079 hardening).** A
> trust-nothing audit (3 adversarial agents) confirmed the LR overhaul production-grade — green tests, 0 new Firestore
> I/O, all 25 categories integrated/labelled/tipped/gated, docs counts exact, all 57 authored items defensible — and
> drove targeted fixes: (1) **visual difficulty now earned by reasoning** — `lr-dice` (was flat) → opposite /
> five-hidden-sum / two-dice tiers; `lr-mirror`/`lr-water` → 1→2→3-glyph strings (a real mirror reverses glyph order);
> `lr-fseries` → constant→alternating; `lr-fanalogy` hard → an unambiguous glyph reflection (rotation-vs-reflection
> arrow analogy rejected as ambiguous — correctness outranks a difficulty label). (2) **Learn gap closed** — +3 topics
> (Input-Output, Cause & Effect, Course of Action) so every drillable single-question LR category has teaching
> (42 → 45 published). (3) **Authored easy-tier balance** — +7 easy items (57 → 64). (4) **Dead code** — 4 unused
> public exports removed. Derived-only, no migration, no deps. `lr-figures.check` recompute updated for every new visual
> form; stress 51,004 questions + 39,600 figures, 0 defects. SW v159→v160.
>
> **2.74 / Arch 2.53 (2026-06-30)** — **Logical Reasoning Excellence: hybrid generative + authored + visual
> (ADR-079).** LR grew from 7 flat-difficulty generators to a **25-category hybrid platform** across a Foundation →
> Core → Advanced → Verbal/Critical → Visual syllabus. (1) **Generative core** rebuilt around earned-difficulty
> archetype pools — a generative blood-relation kinship solver + coded relations, position/reverse ciphers, direction
> turns, ranking interchange, verbal/letter odd-one-out & analogy, extended-Boolean syllogisms; **new generatable
> topics**: letter/alphanumeric series, coded inequalities (transitive-closure verdict incl. Either-Or), calendars
> (Zeller), clocks (angle/mirror), machine input-output. (2) **LR puzzle SET engine** (`js/lr-set-engine.js`) — a
> constraint generator + brute-force solver guarantees a UNIQUE arrangement, then asks 3–6 linked MCQs; reuses the
> drill set-mode (now MCQ-capable). (3) **Authored hybrid subsystem** (`data/lr-authored/*` + `js/lr-authored-engine.js`)
> — a real schema/validator + 57 premium Critical-Reasoning / Statement / Cause-Effect / Course-of-Action / Decision
> items with teaching explanations, served through the same pipeline; a new drill explanation-display seam; LR/authored
> questions now bookmarkable in Review. (4) **Generative visual engine** (`js/ui/lr-figures.js` + `js/lr-visual-engine.js`)
> — DPI-independent SVG figures for mirror/water/dice/cube/figure-series/figure-analogy, with picture-answer options.
> All categories auto-roll-up under subject `lr`; teaching tips for every LR category; 10 new Learn topics (32 → 42).
> **No Firestore migration, no new deps.** New check harnesses (lr-set-engine / lr-authored / lr-figures) + the existing
> lr-engine check independently recompute/model-check/validate; stress 51,002 questions + 39,600 figures, **0 defects**.
> SW v158→v159.
>
> **2.73 / Arch 2.52 (2026-06-30)** — **DI Engine validation & excellence pass (ADR-078 hardening).** A
> trust-nothing re-audit (3 adversarial agents) confirmed the engine sound (0 correctness/edge/dead-code defects, set-
> mode DOM path traced and verified, docs/Learn/tips/Firestore all clean) and drove targeted improvements: (1)
> **Difficulty calibration** — the single-question multi-series hard pool no longer emits bare cross-series add/subtract
> (genuinely medium); it now emits only earned cross-series reasoning (percent-difference, ratio, series contribution,
> grand-total share, trend comparison). (2) **Dataset realism** — theme pools expanded ~12 → ~40 domains (agriculture,
> telecom, energy, healthcare, trade, tourism, census, e-commerce, rainfall, railways, banking, insurance, funds…) with
> optional per-theme realistic value ranges, and caselet contexts 6 → 16 with banking/government narratives. (3)
> **Horizontal bar charts** — a back-compatible single-series `_hbar` render path (common in Banking/SSC), emitted on a
> fraction of `di-bar` charts; renderer architecture preserved. (4) **Wording** — exam-faculty phrasing (diff/ratio/
> pctMore, explicit caselet second group, crisper cross-series questions, "to 1 decimal place"). (5) **Fixed** the
> session-summary category for DI sets (was 'mixed'). Derived-only analytics, **no Firestore migration, no new deps**.
> di-engine.check 2400 samples + di-set 4337 set-questions 100% recomputed (0 mismatches); stress 8000 charts (489
> horizontal) + 158 distinct titles, 0 defects. SW v157→v158. Bible 2.72→2.73, Arch 2.51→2.52.

> **2.72 / Arch 2.51 (2026-06-30)** — **DI Engine Overhaul: exam-accurate, multi-series, set-based (ADR-078).**
> Grounded in a sourced exam-syllabus study (CAT/XAT, IBPS/SBI/RRB, SSC, Insurance). Four pillars: (1) **Earned
> difficulty** — `di-engine.js` is rebuilt around an explicit archetype→tier table; the dishonest `hard:read`
> fallback is gone (a tier now constructs a clean in-tier question by design), the mislabeled single-% `project` is
> retired, and data is realistic (no longer all multiples of 10; time-series trend with continuity). (2) **Diversity**
> — new archetypes (rank, missing-value/reverse, ratio, contribution, weighted average, growth/overall %, "by how
> much") plus authentic **cross-series** questions (combined, cross-diff, ratio-across-series, trend-compare,
> series-share). (3) **Multi-series renderer** — `di-charts.js` gains a back-compatible `series[]`/`stacked` model
> (grouped & stacked bars, multi-line, multi-column tables) via shared lean SVG helpers; single-series specs render
> byte-identically. (4) **DI Sets** — NEW `di-set-engine.js` generates one shared dataset/chart with 3–6 progressive,
> distinct-skill questions; presentation REUSES the drill engine via a guarded `diSet` set-mode (persistent shared
> context, per-question swap, cached dataset) with zero change to the single-question path; new **📊 DI Set** practice
> mode. DI wrong-answer auto-tip is fixed (was a generic fallback) with per-chart + per-archetype teaching tips; new
> Learn topic "DI Sets & Multi-Series Charts" (DI 5→6 topics, total 31→32). Analytics stay **derived-only** (set
> answers ride existing `categoryStats` di-* keys) — **no Firestore migration, no new deps**. New `di-set-engine.check`
> + extended `di-engine.check` (2400 samples, 100% independently recomputed) + `di-charts.check` (multi-series);
> stress: 6400 charts + 8771 set questions rendered, 0 defects. SW v156→v157. Bible 2.71→2.72, Arch 2.50→2.51.

> **2.71 / Arch 2.50 (2026-06-30)** — **ADR-077 craftsmanship verification & production sign-off.** Independent
> re-audit of the polish commit (assume-it's-wrong): all 8 changes verified correct against the live code; version
> coherence, precache, dead-code, Firestore/listeners/deps and the ~38k-assertion suite all clean. Two minor fixes
> applied: (1) `Companion.showLoading`'s rotation interval now self-terminates via a `document.body.contains` guard
> when its node leaves the DOM (sheet closed mid-load) — fixes a self-bounding detached-node write at the source for
> all callers (Coach/Insights/Planner), zero behavioural change while open; (2) synced the stale `TECHNICAL_BIBLE.md`
> header (Arch 2.47→2.49, date). One bug-hunt "finding" (a stale MCQ `.pressed` leak) was investigated and **rejected
> with proof** — the document-level `pointerup`/`pointercancel` release always clears live `.pressed`, so it cannot
> stick. SW v155→v156. Bible 2.70→2.71, Arch 2.49→2.50.

> **2.70 / Arch 2.49 (2026-06-30)** — **QuantReflex V2 Final Craftsmanship Pass (ADR-077): refinement, not redesign.**
> A focused premium-polish pass grounded in three read-only craftsmanship audits (design-system · interactions/motion ·
> Learn/QuanAI/IA/a11y) — identity and architecture preserved, no new features, no new design language. (1) **MCQ feel**:
> press-down `.pressed` parity with the numpad (delegated pointer listeners that toggle a visual class only — never
> grade), plus token-aligned generous sizing (`var(--qr-btn-radius)`, `.6rem` gap, 1rem text, taller targets) + a
> tablet max-width so options read as a tidy pair. (2) **Accessibility**: QuanAI bottom-sheet gains Escape-to-close +
> focus-into-dialog + focus-restore on each new turn; the Practice category picker wraps each subject in a labelled
> `role="group"`; onboarding goal buttons expose `aria-pressed`; the Stats sparkline gains `role="img"`. (3) **QuanAI**:
> consistent multi-line rendering (`\n`→`<br>`) across `say`/`callout` blocks; Planner open now uses the same staged
> shimmer the Coach/Insights use (perceived-performance parity) via a newly-exported `Companion.showLoading`. (4)
> **Copy**: one "Speed Aptitude powered by QuanAI" voice — onboarding intro/Learn lines and the About mission evolved
> from Quant-only to the three-subject spine, keeping the QuantReflex name and Quant as the strongest pillar. Audit
> items that conflicted with project constraints were deliberately declined (no ~2,260-color tokenisation; no rewrite
> of the V1 category-grid spacing). SW v154→v155. Bible 2.69→2.70, Arch 2.48→2.49.

> **2.69 / Arch 2.48 (2026-06-30)** — **QuantReflex V2 Phase 4.5: integration verification & stabilization audit.**
> A whole-repo, cross-subject re-read of Phases 1–4 as if written by someone else (3 read-only audit agents + direct
> re-reads of `drill-engine.js`, `di-charts.js`, `practice-modes.js`, the MCQ/DI CSS, `app.js` label resolver, and
> every `data/knowledge/*` `drillCategory`). **No functional regressions found.** The audit's "MAJOR" candidates
> (MCQ→numeric numpad loss, input/skip stuck disabled, DI chart overflow, Mixed-mode quant-only fallback, double-tap
> race, narrow Learn drillCategory) were all **false positives** — artefacts of not realising `renderQuestion()`
> rebuilds the entire container per question and that engines load synchronously before any click-time path runs.
> Verified one shared seam carries every cross-subject path (drill render, label resolution, `subjectRollup`
> analytics, serialized QuanAI context, grouped Learn hub, Mixed Aptitude). The only real defect was a stale
> `ARCHITECTURE.md` header (ADR-070/SW v143 → refreshed to ADR-076/SW v154). Docs-only change — **no client code
> touched, so no SW bump**. Bible 2.68→2.69, Arch 2.47→2.48.

> **2.68 / Arch 2.47 (2026-06-30)** — **QuantReflex V2 Phase 4: Unified Aptitude Intelligence (ADR-076).** The final
> V2 phase — integration & polish, no new subjects. The keystone is `statMath.subjectRollup(stats, subjectCats)` (+
> `weakestSubject`) in the ONE derivation layer (pure, map passed in) so client Analytics and server QuanAI compute the
> identical per-subject picture and can never disagree — **derived on read, no Firestore migration**. QuanAI is now
> cross-subject: `studentProfile.serialize` emits a `SUBJECTS: Quant·DI·LR` line + a "coach across subjects"
> instruction (one shared context → Coach/Insights/Planner/Chat connect subjects), and the persona is unified to "Speed
> Aptitude mentor". Stats gains an "aptitude by subject" breakdown (overall→subject→category, reusing the category bar
> styling). New one-tap **Mixed Aptitude** practice mode (balanced cross-subject sprint via generateMultiTopic).
> Identity copy moved to "Speed Aptitude". Pre-flight + final regression audits fixed one live id-leak (post-session
> insight) and aligned the Stats subject-breakdown thresholds with the category list. SW v152→v154. Bible 2.67→2.68,
> Arch 2.46→2.47.

> **2.67 / Arch 2.46 (2026-06-30)** — **QuantReflex V2 Phase 3: generative Logical Reasoning engine + MCQ (ADR-075).**
> Completes the Quant → DI → LR spine. `js/lr-engine.js` procedurally generates 7 topics (Coding-Decoding, Blood
> Relations, Direction Sense, Ranking, Odd One Out, Analogies, Syllogisms) with genuine easy/medium/hard — numeric
> (numpad) where natural, multiple-choice otherwise. The only new infra is **MCQ input** in the drill engine
> (conditional on `q.options`; numeric Quant/DI untouched). Syllogism correctness is re-verified by an independent
> 256-region set-logic model-checker. LR self-registers into the Practice pipeline (out of the random pool + duels),
> joins the `lr` subject, the grouped picker, and Learn (`data/knowledge/lr.js`, 7 gold-standard topics). QuanAI/Stats
> label LR via the engine; LR rides `categoryStats` → **no Firestore migration** (stays 2.21). New `lr-engine.check`
> (15512 assertions, incl. odd-one-out uniqueness); Learn 24→31 topics. SW v149→v152 (v151 colour-blind MCQ ✓/✗;
> v152 independent-audit fixes — odd-one-out single-misfit uniqueness + MCQ null-guard). Bible 2.66→2.67, Arch 2.45→2.46.

> **2.66 / Arch 2.45 (2026-06-30)** — **QuantReflex V2 Phase 2: Data Interpretation engine (ADR-074).** The first new
> Speed-Aptitude subject, filling the Phase-1 seam. DI is **generative** (no static banks): `js/di-engine.js`
> synthesizes a dataset and asks a calculation for 5 families (bar/line/pie/table/caselet), with genuine easy/medium/
> hard and **always-numeric, always-clean** answers, so the existing numpad + grader work unchanged. It self-registers
> into `questions.js` (same Practice pipeline; out of the random Quant pool + out of duels). A dependency-free SVG/HTML
> renderer (`js/ui/di-charts.js`) draws the chart above the stem (one drill-engine hook). DI joins the `di` subject
> (`data/subjects.js`), the Practice picker (grouped, no new tab), and Learn (`data/knowledge/di.js` — 5 gold-standard
> topics; the hub now groups by subject). QuanAI/Stats label DI categories via the engine and ground Explain with the
> chart data; DI flows through `categoryStats` so analytics need no redesign. **No Firestore migration** (categoryStats
> just gains `di-*` keys; subject still derived → Firestore stays 2.21). New `di-engine`/`di-charts` checks; Learn
> 19→24 topics. SW v147→v149. Bible 2.65→2.66, Arch 2.44→2.45.

> **2.65 / Arch 2.44 (2026-06-30)** — **QuantReflex V2 Phase 1: derived Speed-Aptitude subject layer + Learn
> integration (ADR-073).** Foundation for the Quant → Data Interpretation → generatable Logical Reasoning spine. Makes
> the architecture subject-first **internally** with **zero user-visible change** (only Quant has content today).
> New `data/subjects.js` is the ONE subject registry + derived subject↔category map; **subject is DERIVED on read from
> `categoryStats`** — no `subjectStats` field, **no Firestore migration** (hence Firestore stays 2.21). Quant's category
> set is resolved from `quantTopics.CATEGORY_LABELS` (no duplicated list); `quantTopics.js` became dual-export so the
> browser can derive it too. The Learn registry gained `subject` + `bySubject`/`categoriesBySubject`; all 5 Learn
> categories tag `subject:'quant'`. Only Quant is declared — DI/LR join with their generators in Phases 2-3 (no
> placeholder code). New `scripts/subjects.check.js` + extended `learn-content.check.js`; full suite green. SW v146→v147.
> Bible 2.64→2.65, Arch 2.43→2.44.

> **2.64 / Arch 2.43 / Firestore 2.21 / Security 2.15 (2026-06-29)** — **Final security lockdown: single-active-device
> sessions + auth hardening (ADR-072).** A final pre-launch security audit (3 adversarial agents) verified the two
> hard goals already hold — **Premium cannot be forged** (server-authoritative entitlement + HMAC-verified payments +
> downgrade-only rules + admin-only grant) and **no secret is client-reachable** (all server-only `env`, no git leak,
> no source maps, SW caches static only). The genuine gaps are closed: **(1) single active device (newest-login-wins)**
> — a server-written `users/{uid}.activeSessionId` (Admin-SDK only; rules deny client writes), a per-device
> `X-Session-Id` sent on every authed request, `withAuth` 409s `SESSION_REPLACED` on mismatch (folded into the
> existing entitlement read → no extra Firestore read), plus a client root-doc listener + 409 handler that sign the
> displaced device out gracefully; a new `api/session.js?action=claim` (skipSession) lets a fresh device claim. **(2)
> token revocation** — `verifyIdToken(token, true)` in main-app + super-admin (was missing; coaching-admin already
> did it) so disable/delete propagates immediately. **(3)** capped the one uncapped chat input. **Declined** (noted as
> recommendations): Firebase App Check + refund-webhook auto-revoke. SW v145→v146. Bible 2.63→2.64, Arch 2.42→2.43,
> Firestore 2.20→2.21, Security 2.14→2.15.

> **2.63 / Firestore 2.20 (2026-06-29)** — **Ecosystem Firestore audit + targeted hardening (ADR-071).** A full
> senior-Firebase-architect audit of all three apps verified the architecture is production-grade (all 26 indexes
> used, every collection ruled + default-deny, server-authoritative entitlements/duels/AI-memory, no leaked
> listeners, intentional layered caches). Three small, verified improvements shipped: **(1) `aiDaily` TTL** — the
> per-day Coach/Insights cache (`{uid}_{feature}_{date}`) now stamps `expiresAt: now+48h` and the super-admin
> `cron/sweep` prunes expired docs (mirrors the `aiRequests` pattern), bounding the one unbounded accumulator; **(2)
> removed the unread `users/{uid}/profile/data` dual-write** — a documented derived mirror with **zero readers** in
> any of the three apps (every consumer reads the root `users.profile` map); the defensive account-deletion delete is
> kept; **(3)** a dry-run-first, operator-run cleanup migration `firestore/migrations/2026-06-29-cleanup-legacy-
> orphans.js` for the verified-orphaned legacy collections (`aiMissions`/`aiCoachV2`/`aiInsightsV2`/`duelInvitations`)
> + stale `aiDaily` + legacy `profile/data` docs (`usage/wordProblems` is intentionally left — it self-migrates via
> `aiService._loadUsage`). **Consciously declined** a permanent
> Super-Admin orphan-scanner/collection-delete UI (the orphan set is fixed; ongoing cleanup is already automated; an
> always-on delete surface is disproportionate risk at 2–3k users — ADR-071). No rules/index/schema-redesign change,
> no UX-affecting read change, no new deps. SW v144→v145. Bible 2.62→2.63, Firestore 2.19→2.20, Architecture
> unchanged (2.42).

> **2.62 (2026-06-28)** — **QuanAI production-readiness hardening (ADR-070 follow-up; no new feature/contract).** A
> full 13-phase verification (three independent adversarial audits) found the QuanAI ecosystem production-ready — zero
> code defects, all suites green, branding/docs accurate. This pass implements only the genuine hardening items it
> surfaced: **(1) Start-over confirm-dialog a11y** — default focus moved from the destructive button to **Cancel** (a
> stray Enter can't trigger the irreversible reset), focus **returns to the opener** on close, `aria-describedby`
> announces the deleted/kept lists, and the background is scroll-locked via the existing `body.modal-open` rule;
> **(2) `aiBrain.plannerReset` fail-fast** — a failed plan delete now returns `{ok:false}` *before* clearing the
> exam-config memory mirror, so a transient Firestore error can't leave Coach/Insights exam-blind while the plan still
> exists (clean client retry); **(3)** a `planner-brain.check.js` assertion covering that delete-failure path; **(4)**
> a stale TECHNICAL_BIBLE "Last updated" date. Two audit flags were verified **false positives** (the `op:reset` doc
> entry already exists; reset already returns `ok:false` on delete failure). SW v143→v144. **Client a11y + one-line
> server guard + test + docs; no prompt/cache/schema change, no new deps.** Bible 2.61→2.62, Architecture unchanged
> (2.42 — no new op/contract).

> **2.61 / Arch 2.42 (2026-06-28)** — **QuanAI cohesion pass: Planner Start Over + perceived-performance + natural
> branding (ADR-070; focused, no prompt/cache rewrites).** A full read-only audit confirmed the QuanAI stack is
> already mature/optimized, so this is a focused pass on the real gaps. **Planner Start Over:** three distinct,
> non-overlapping actions — **Adjust** (reopen wizard, preserve plan), **Rebuild my plan** (the single regen workflow,
> `op:regen`, now a persistent footer action), and a NEW fully-destructive **Start over** (`op:reset` →
> `aiBrain.plannerReset`) behind an explicit confirm that lists exactly what is deleted (plan, exam config, setup
> answers, planner task progress) vs. kept (practice history/accuracy/streaks + durable learning memory). Reset
> deletes `aiPlanner/{uid}` and clears only the mirrored exam-config `aiMemory` fields, so Coach/Insights degrade to
> exam-agnostic coaching (ADR-057 "never dumber"). **Perceived performance:** every AI surface opens with a
> personalized "QuanAI is thinking" state from the student's real local accuracy/streak (reuse-only — no fetch, no
> logic duplication, no streaming/prefetch). **Branding:** QuanAI surfaced naturally (App Guide AI section, About,
> three AI paywall lock messages, planner empty state, thinking states); generic CTAs kept; `QuanAI` casing unchanged
> (ADR-043). **Cleanup:** stale `studentContext.js` comment refs → `studentProfile.js`. `planner-brain.check.js` +
> a `plannerReset` assertion. SW v142→v143. **No prompt/cache-architecture change, no new deps, no Firestore schema
> change.** Bible 2.60→2.61, Architecture 2.41→2.42 (new planner contract op).

> **2.60 (2026-06-28)** — **Cross-app modal cohesion + grep-verified CSS cleanup (CSS-only, no new deps).** Unified
> the last "feels like a different app" outlier: the **About / App-Guide info modal** stopped sliding in from the
> right as a side panel and now **centers + scale-ins** like every other modal (paywall, table, Battle Archive,
> coming-soon) — `.info-modal-overlay` flex-centers; `.info-modal-content` becomes a centered card
> (`width:min(560px,100%)`, 92vh + internal scroll, `var(--qr-card-radius)`, reuses the shared `paywallScaleIn`
> keyframe); the right-slide `infoModalSlideIn`/`infoModalSlideOut` keyframes are removed. `settings.js`
> `openInfoModal`'s one show line changes `block`→`flex` so the overlay flex-centers the card on open (the inline
> `display:none` default + the `.closing`/Escape/sound close logic are unchanged). **Focus-ring consistency:** the lone inset
> `.collapsible-header:focus-visible` ring (`outline-offset:-2px`) matches the ~30 others at `+2px`. **Cleanup
> (zero behavior change, grep-verified 0 consumers):** removed 4 unused custom properties (`--qr-accent-soft`,
> `--sp-xl`, `--sp-2xl`, `--qr-card-gap`) and the shadowed duplicate `@keyframes duelPulse` (the later
> opacity+scale definition already won globally for all three consumers). SW v141→v142. **Client UI only (CSS + a
> one-line display-value change in `settings.js`); no control-flow/logic, Firestore/Security/Payment, routing, or
> gating change; reduced-motion + a11y preserved.** Bible
> 2.59→2.60 (Arch unchanged — no topology/contract change).

> **2.59 / Arch 2.41 (2026-06-28)** — **Premium UI polish: Battle Archive → centered modal + Learn hub hierarchy
> (reuse-only, no new deps).** **Battle Archive (ADR-068 follow-up):** the inline expandable section inside the Home
> duel card becomes a compact **"⚔️ Battle Archive · N" trigger** that opens a **centered premium modal** — a
> presentation-only refactor of `js/duel-archive.js` (`_toggle`/`_renderExpanded` → `_openModal`/`_closeModal`/
> `_loadAndPaint`; data/cache/filter/pagination layer + its 45-assertion math test untouched). The modal reuses the
> proven paywall shell (dim+blur, `paywallScaleIn`/`paywallFadeIn`/`paywallFadeOut` keyframes — not duplicated),
> `body.modal-open` scroll-lock, Escape/overlay-click close, focus-to-title on open + return-to-trigger on close;
> `width:min(760px,100%)`, 90vh, sticky glass header — scales phone→desktop. **Learn hub hierarchy:** one calm header
> language — a subtle blue accent bar on category titles + a new `.kx-hub-head` (Quick Reference / Your Topics) with
> a single faint top hairline + breathing room, so the major groups read as distinct without dividers-everywhere.
> **Shared cleanup:** canonical `--qr-accent` / `--qr-accent-soft` tokens (used by the new code; existing hard-coded
> `#2563eb` left as-is). SW v140→v141. **Client UI only; no Firestore/Security/Payment/gating change; reduced-motion
> + a11y preserved.** Bible 2.58→2.59, Arch 2.40→2.41.

> **2.58 (2026-06-28)** — **Verification-pass copy-accuracy fixes (no pricing change).** Made the user-facing copy
> tell the truth: **Word Problems** is now consistently presented as **"Coming soon"** wherever it appeared as a live
> feature — About modal (Platform Features + Premium), App Guide (Practice Modes + Premium AI features + FAQ) — and
> **removed from the paywall** (the "AI Word Problems · 5 lifetime / 30 per day" comparison row dropped; the value
> card swapped to the live **Review Mistakes**) so the paywall only sells features that work today. Also softened the
> **Speed Benchmark** copy in About + Guide: it's a per-session speed score that tracks your own improvement, not a
> live ranking "against other users" (the percentile is computed locally), per "no exaggeration." SW v139→v140.
> **Client copy only; no pricing/Firestore/Security change.** Bible 2.57→2.58.

> **2.57 / Payment 2.4 (2026-06-28)** — **Pricing ₹599→₹499 (12-month) + About/Guide/ecosystem refresh.**
> **Pricing:** the 12-month Premium drops **₹599 → ₹499** (6-month ₹349 unchanged) across every current-state
> location, UI↔server synced: the **charge path** `paymentService.PLAN_CONFIG.premium_12m.amountPaise` 59900→**49900**,
> the canonical `entitlements.PRICING.PREMIUM_12M`, the revenue maps `aiService`/`metrics.PREMIUM_PRICE_PAISE`, the
> display `paywall.PLANS` (≈₹42/mo, **"Save 28%"**), `index.html` About/FAQ text, and the payment/entitlement docs.
> No test asserts the amount; durations/plan-keys/gates/Razorpay-flow unchanged. **About modal** rewritten to today's
> product — the Learn **Knowledge Engine** (19 topics / 5 categories, search, saved, revision, practise-this),
> responsive + offline, and the **three-app ecosystem** (Student app ↔ coaching ID ↔ platform), version 2.0.0→2.1.0.
> **App Guide** Learn section fully rewritten (hub→topic pages, search, save, continue/due, quick-revision, practise,
> mark-complete) — removed the retired "Learn Vault"/"Jump Navigation" wording — plus a navigation/gestures note.
> Light paywall polish (AA contrast on the save/per-month text). SW v138→v139. **Client + pricing-config only; no
> Firestore/Security change; sized for ~2–3k users (no new deps).** Bible 2.56→2.57, Payment 2.3→2.4.

> **2.56 / Arch 2.40 (2026-06-28)** — **Learn content completion — the curated scope is now 19/19 gold (ADR-069),
> NO AI.** Authored the **last 5 scaffold topics to full gold-standard depth** and flipped them to `published`:
> **Number Series, Problems on Ages, Mixtures & Alligations, Partnership, Permutation & Combination** (10–11 sections
> each: overview · concepts · formulas · speed trick · traps · 2 worked examples · memory hook · revision). Every
> formula + worked example hand-verified AND independently re-computed by a second agent — **zero math errors**. So
> the shipped 5-category Learn scope has **no scaffolds / no "coming soon" left** (the scaffold capability stays in
> code for future categories). `number-series` gets a real "Practise this" (it has a dedicated drill); the other 4
> keep `drillCategory:null` (no misleading practice — same principle as the Pipes fix). Content-quality gate now
> validates all 19 published (`learn-content.check` 161→196). Plus a restrained premium touch: a one-time
> reduced-motion-guarded staggered entrance on the ≤5 hub category sections (`kx-rise`). SW v137→v138.
> **Content/client-only; no Firestore/Security/Payment change; Arch unchanged (same engine, more data); NO AI.**
> Bible 2.55→2.56.

> **2.55 / Arch 2.40 (2026-06-28)** — **Learn ship-readiness fixes (ADR-069), NO AI** — 5 real issues from a final
> adversarial production audit (the audit also confirmed the system otherwise sound, and several flagged items were
> consciously rejected as non-issues/anti-patterns). **(1) Focus management** — `renderLearnRoute` now moves
> keyboard/SR focus to the topic `<h1>` (added `tabindex="-1"`) on topic open and to the Learn heading
> (`#learnHeading`, `tabindex="-1"`) on hub return, via `.focus({preventScroll:true})` (WCAG 2.4.3; no mouse-user
> ring/scroll-jump). **(2) Glass `@supports` fallback** — `.kx-section-nav` gets a near-opaque background where
> `backdrop-filter` is unsupported, so page content no longer bleeds through the sticky nav. **(3) Contrast** — faint
> `#64748b` secondary labels (`.kx-cat-count/blurb`, `.kx-search-cat`, `.kx-status-scaffold`, `.kx-action-soon`)
> darkened to `#475569` for AA (dark `.kx-action-soon` → `#cbd5e1`). **(4) Hub strip de-dup** — "Continue learning"
> now excludes ids already in "Due for revision" (Saved stays authoritative) so a topic never shows twice. **(5) Hub
> scroll restoration** — returning from a topic restores the prior hub scroll position. SW v136→v137. **Client-only;
> no Firestore/Security/Payment change; NO AI.** Bible 2.54→2.55, Arch 2.39→2.40.

> **2.54 / Arch 2.39 (2026-06-28)** — **Learn premium UX polish + 4 critical bug fixes (ADR-069), NO AI.**
> **(1) Horizontal pill swipe switched the bottom-nav tab** — `swipe-nav.js` listened globally with no scroll-
> container awareness; now its `touchstart` denylist also exempts `[data-no-swipe], .kx-section-nav, .kx-resume-row,
> .kx-table-scroll`, so scrolling those rows never changes tabs (vertical/page swipe unaffected). **(2) Section-nav
> "dark strip"** — the opaque sticky band is now subtle glass (translucent page-bg + `backdrop-filter: blur(10px)`,
> the same language as `.card`) so it blends into the page and the pills are the focus. **(3) "Save" was dead UI** —
> topic bookmarks persisted but were never surfaced; the hub now shows a **"★ Saved"** strip (reusing the
> Continue/Due strip pattern from `LearnProgress.bookmarkedIds()`) and saving toasts. **(4) Pipes & Cisterns launched
> Time & Work questions** — its `drillCategory` reuse is removed (`null`); a non-interactive **"Practice coming
> soon"** chip (`drillComingSoon`) shows instead of wrong content. Plus: scaffold "Coming soon" cards restyled to
> read as *planned* (dashed inviting surface, not dimmed); bounded token-based polish (card hover/press elevation,
> resume-strip edge-fade mask, glassy section pills, search focus, fast reduced-motion-guarded micro-interactions).
> SW v135→v136. **Client-only; no Firestore/Security/Payment change; NO AI in Learn.** Bible 2.53→2.54, Arch
> 2.38→2.39.

> **2.53 / Arch 2.38 (2026-06-28)** — **Learn final-review polish (ADR-069), NO AI.** Two client-only elevations from
> the final production review. **(1) Accessibility semantics on the topic page:** section labels now render as `<h2>`
> and every block head (concept/formula/trick/trap/memory/example) as `<h3>` for a correct `h1→h2→h3` outline;
> breadcrumb → `<nav aria-label="Breadcrumb">`, in-page section nav → `<nav aria-label="On this page">`, related/
> prev-next/back → `<aside>`; the active scroll-spy pill gets `aria-current="true"`; `#learnSearchResults` is an
> `aria-live="polite"` region so result counts announce. Zero visual change (all `.kx-*` styling is class-based; two
> head classes gained a `margin-top:0` reset). **(2) Landscape-tablet layout:** the reading-column + sticky side-rail
> now activates at **≥960px** (was ≥1100), with a new 900px container step and hub 3-col at ≥960 — landscape iPads /
> large foldables get a true two-column reading+rail instead of a stacked single column; phones + portrait tablets
> (<960) unchanged. SW v134→v135. **Client-only a11y + responsive polish; no Firestore/Security/Payment change; NO AI
> in Learn.** Bible 2.52→2.53, Arch 2.37→2.38.

> **2.52 / Arch 2.37 (2026-06-28)** — **Learn Knowledge Engine — Phase 5 (polish + cleanup, NO AI) — ADR-069
> COMPLETE.** Pruned all now-inert legacy Learn CSS — `.learn-jump-*` (nav/btn/active + dark + theme-playful + both
> theme-playful.dark-mode variants, plus its tokens in the two tap-delay/ripple selector lists and `app.js`
> RIPPLE_SELECTORS), `.learn-group-*`, `mark.search-highlight`, and the residual `.learn-searchable` marker class
> (removed from the 5 Quick-Reference reference cards + `learn-manager.js`) — **21 dead rule-sets removed**, CSS 3109→
> 3092 braces, zero remaining references. Micro-polish: badge type .62→.66rem, `.kx-crumb` lifted to a 2.25rem touch
> target, a reduced-motion-guarded `kx-fade-in` topic-page entrance. Performance: render-on-route + a once-built
> search index already minimize DOM/work, so **lazy per-category loading was deliberately not added** (premature for
> 19 small precached topics). SW v133→v134. Final independent multi-agent production audit passed. **Client-only
> cleanup/polish; no Firestore/Security/Payment change; NO AI in Learn.** Bible 2.51→2.52, Arch 2.36→2.37.

> **2.51 / Arch 2.36 / Firestore 2.19 (2026-06-28)** — **Learn Knowledge Engine — Phase 4 (integrations, NO AI)
> (ADR-069):** adds a localStorage-primary progress module (`js/learn/learn-progress.js`, dual-exported; pure
> recency/spaced-due helpers under a new 32-assertion `learn-progress.check`) with a best-effort Firestore mirror via
> the **existing** `FirestoreSync.queueUpdate` path — two new owner-writable user-doc fields **`learnProgress`** +
> **`learnTopicBookmarks`** (same denylist-safe path as customTopics/bookmarks: **no new collection, no rule
> change**, hydrated on login, cleared on user switch). Topic pages gain an **action bar** (Practise this → existing
> focus-drill via `drillCategory`; Quick-revision **cheat-sheet projection** = filtered view over authored
> revision/formula/trick/trap blocks; Mark-complete; Save); the hub gains **Continue learning** + spaced **Due for
> revision** strips + live completion ticks. Every applicable topic now carries a **validated `syllabusTopicId`**
> referencing `data/syllabus.js` (data-level Planner link; `learn-content.check` now 162). SW v132→v133.
> **Security/Payment unchanged** (`entitlementFieldsSafe()` already permits owner writes to non-entitlement fields).
> Bible 2.50→2.51, Arch 2.35→2.36, Firestore 2.18→2.19.

> **2.50 / Arch 2.35 (2026-06-28)** — **Learn Knowledge Engine — Phase 3 (ADR-069):** authored **14 gold-standard
> topics** (overview · concepts · formulas · tricks · traps · worked examples · memory · revision) across a new
> **5-category taxonomy** (Numbers · Arithmetic · Commercial Math · Modern Math · Mensuration): Number System,
> Simplification, Percentages, Ratio & Proportion, Averages, Time & Work, Pipes & Cisterns, Time-Speed-Distance,
> Profit & Loss, Simple/Compound Interest, Probability, Area, Volume — plus 5 honest "coming soon" scaffolds.
> Original exam-grade content (cheat sheets = organisation inspiration only; every formula/example hand-verified). A
> content-quality gate in `learn-content.check` (now 144) enforces gold-standard depth on every published topic. SW
> v131→v132. **Content/client-only; topic ids preserved (deep links + bookmarks intact); no Firestore/Security/
> Payment change; NO AI in Learn.** The cheat-sheet projection view + formula explorer land in P4 (revision mode);
> the blocks are already authored. Bible 2.49→2.50 (Arch unchanged — same engine, more data).

> **2.49 / Arch 2.35 (2026-06-28)** — **Learn Knowledge Engine — Phase 2 (ADR-069):** the Learn tab is cut over to
> the engine — a deep-linkable **hub → topic-page** knowledge graph with a reusable responsive design system.
> Reintroduces the (now tested) block renderers (`js/knowledge/blocks.js`); rewrites `js/views/learn-view.js` as a
> render-on-route controller (hub with category→topic cards + preserved Quick-Reference tables/bookmarks/custom
> topics; `#learn/<id>` topic pages with breadcrumbs, sticky scroll-spy section nav, typed blocks, related, prev/
> next); wires `learn-search.js` to the box (deep-linking results); adds the `.kx-*` responsive system (scoped to
> `body.view-learn-active`, lifting the 480px cap on tablet/desktop). Retires `js/formulas.js` (content fully
> migrated) + the legacy DOM-scan search/jump-nav. New `learn-render.check` (13) + `learn-browser.check` (10) in
> `npm test`. SW v129→v130. **Client-only; no Firestore/Security/Payment change; backwards-compatible; NO AI in
> Learn.** Arch 2.34→2.35, Bible 2.48→2.49.

> **2.48 / Arch 2.34 (2026-06-28)** — **Learn Knowledge Engine — Phase 1 (ADR-069):** foundation for rebuilding the
> Learn tab into a deep-linkable hub→topic knowledge graph of reusable **knowledge objects** (not static HTML). Adds
> the pure schema (`js/knowledge/schema.js`), in-memory registry (`registry.js`, incl. duplicate-id detection), a
> weighted search index (`learn/learn-search.js`), the first data modules
> (`data/knowledge/{categories,arithmetic,mensuration}.js` — faithful migration of the 8 legacy formula topics),
> `#learn/<topic>` deep-link routing + a `view-learn-active` shell hook, and a 35-assertion validator
> (`scripts/learn-content.check.js`) in `npm test`. **Pure additive client engine — the existing Learn page is
> untouched and working; no Firestore/Security/Payment change; NO AI in Learn.** SW v128→v129. The block renderers
> (`blocks.js`) + hub/topic UI + responsive `.kx-*` CSS land in Phase 2 (a renderer with no caller/test doesn't
> ship early).

> **2.47 / Arch 2.33 / Firestore 2.18 / Security 2.14 (2026-06-28)** — **Battle Archive (ADR-068):** a Premium-only,
> expandable duel-history section below the Home Duel card — complete paginated history + head-to-head rivalry stats
> + lifetime personal stats + auto achievements, as a read-only client layer over server-maintained truth. Schema:
> extended `users/{uid}/duelHistory` (denormalized opponentUid/oppAccuracy/challengerUid/iChallenged/difficulty/
> questionCount/myAnswered/durationMs; removed the ADR-065 50-cap) + a new server-only aggregate doc
> `users/{uid}/duelStats/summary` (`duelAggregates`+`rivals{}`+`achievements{}`) maintained inside the existing
> `_finalizeTxn` transaction (pure `services/duelStats.js`); +3 `duelHistory` composite indexes; new `duelStats`
> deny rule + account-deletion. **Zero new serverless functions** (main-app 8/12). Premium-only & hidden for free.
> Migration: none (pre-launch, zero users — forward-only).

> **2.46 / Arch 2.32 / Firestore 2.17 / Security 2.13 (2026-06-24)** — Deep bible↔code drift reconciliation: a
> 3-app audit synced the living bibles to the actual code where they'd drifted from features added after the docs
> were last touched — TECHNICAL_BIBLE §3 main-app API row (real 6 AI actions + `duel`/`notify`) + §3.1 counts
> (main-app 8, coaching 5; removed non-existent `leaderboard`); SECURITY admin rate limit 30→300/hr; FIRESTORE
> `aiRequests` composite indexes added to §4; AI envelope feature `plan`→`planner`. Payment verified clean
> (unchanged). Migration: none (doc-only).

> **2.45 / Arch 2.31 / Firestore 2.16 (2026-06-24)** — Documentation-consistency reconciliation (ADR-067/ADR-032):
> synced the living docs + every per-doc version header + the README footer to the as-built ADR-067 catalog
> (17 exams in 4 tiers, 14 drillable categories, 50 topics) and to this registry; fixed the TECHNICAL_BIBLE §6
> `syncCoachingStudentCount` contradiction (request-path maintenance, ADR-032), the ROADMAP TEST-1 "no tests"
> claim, and the now-verified-absent `aiStudyPlans` index note. Security/Payment headers corrected to current
> (2.12 / 2.3); no content change to those tracks. Migration: none (doc-only).

> **2.44 / Arch 2.30 (2026-06-24)** — Focused speed-maths catalog rebuild + Timed Mock (ADR-067): catalog
> curated 26→17 exams in 4 tiers, per-exam `tier`/`pattern`/`book` metadata + BOOKS registry, tier-aware
> readiness weighting, two new drill categories, and the Premium Timed Mock. `SYLLABUS_VERSION` 2→3 (bundled
> data, not a Firestore-collection change, so Firestore track unchanged). Pre-launch, no migration.

> **2.0 (2026-06-11)** — v2 monetization (ADR-009): single `plan` model, lifetime + Premium+ removed.
> Breaking schema change (MAJOR) across every track. The 1.0 baseline (also 2026-06-11) incorporated
> audit fixes C1–M8. See [CHANGELOG.md](CHANGELOG.md) and [DECISION_LOG.md](DECISION_LOG.md).

---

## Semantics — when to increment

Each track uses `MAJOR.MINOR`:

- **MINOR** (`1.0 → 1.1`): additive or corrective change that does **not** break existing
  readers/writers. New optional field, new endpoint, new index, clarified contract, bug fix.
- **MAJOR** (`1.x → 2.0`): **breaking** contract change. Renamed/removed field still read by
  some app, changed auth requirement, changed payment/entitlement semantics, removed endpoint,
  incompatible schema migration. A MAJOR bump REQUIRES a migration note (below) and a
  cross-app compatibility review in the change-impact report.

**Bible Version** bumps when ANY track bumps (take the highest change: a MAJOR in any track →
Bible MAJOR). It also bumps MINOR for structural/governance changes to the docs themselves.

Each governed doc carries its own `Doc Version` in its header; that tracks edits to that single
file and moves independently of the system-level tracks above.

---

## How a change updates this file (governance step G)

1. Decide which track(s) the change touches (Architecture / Firestore / Security / Payment).
2. Increment those tracks per the semantics above; bump Bible Version accordingly.
3. Add a row to **Version History** and, for any MAJOR, a **Migration Note**.
4. Reference the CHANGELOG entry and (if a decision was made) the DECISION_LOG entry.

---

## Version History

| Date | Bible | Arch | Firestore | Security | Payment | Summary |
|---|---|---|---|---|---|---|
| 2026-06-28 | 2.59 | 2.41 | 2.19 | 2.14 | 2.4 | **Premium UI polish — Battle Archive modal + Learn hub hierarchy (reuse-only):** Battle Archive (ADR-068) inline expandable section → compact trigger that opens a **centered premium modal** (presentation-only refactor of duel-archive.js; reuses the paywall dim/scale/scroll shell + keyframes; data/cache/math layer + 45-assertion test untouched; Escape/overlay-click/focus). Learn hub: subtle blue accent-bar header language + new `.kx-hub-head` (Quick Reference / Your Topics) with one calm top hairline + breathing room so major groups read distinctly (no dividers-everywhere). Added `--qr-accent`/`--qr-accent-soft` tokens (new code only). SW v140→v141. Client UI only; no Firestore/Security/Payment/gating change; reduced-motion + a11y preserved. Bible 2.58→2.59, Arch 2.40→2.41. |
| 2026-06-28 | 2.58 | 2.40 | 2.19 | 2.14 | 2.4 | **Verification-pass copy fixes:** Word Problems now consistently "Coming soon" in About/Guide and **removed from the paywall** (compare row dropped; value card → live "Review Mistakes") so the paywall sells only live features; Speed Benchmark copy softened (per-session self-improvement score, not a live "against other users" ranking — percentile is computed locally). SW v139→v140. Client copy only; no pricing/Firestore/Security change. Bible 2.57→2.58. |
| 2026-06-28 | 2.57 | 2.40 | 2.19 | 2.14 | 2.4 | **Pricing ₹599→₹499 (12mo) + About/Guide/ecosystem refresh:** 12-month Premium **₹599→₹499** (6mo ₹349 unchanged) synced UI↔server — charge path `paymentService.amountPaise` 59900→49900, `entitlements.PRICING`, revenue maps `aiService`/`metrics`, display `paywall.PLANS` (≈₹42/mo, "Save 28%"), `index.html` + payment/entitlement docs (zero `₹599`/59900 left in current-state files; no test asserts it). About modal rewritten to today's product (Learn Knowledge Engine, responsive+offline, the 3-app ecosystem, v2.0.0→2.1.0); App Guide Learn section fully rewritten (hub→topics/search/save/revision/practise; removed "Learn Vault"/"Jump Navigation") + gestures note. Light paywall AA-contrast polish. SW v138→v139. Client + pricing-config only; no Firestore/Security change; ~2–3k-user sizing (no new deps). Bible 2.56→2.57, Payment 2.3→2.4. |
| 2026-06-28 | 2.56 | 2.40 | 2.19 | 2.14 | 2.3 | **Learn content completion — 19/19 gold (ADR-069), NO AI:** authored the last 5 scaffolds (Number Series, Ages, Mixtures & Alligations, Partnership, Permutation & Combination) to gold-standard depth (10–11 sections each) and flipped to `published`; every formula/example hand- + agent-verified (zero math errors). No scaffolds/"coming soon" remain in the shipped 5-category scope. `number-series` gets a real Practise button; the other 4 keep `drillCategory:null` (no misleading practice). Content gate now validates 19 published (`learn-content.check` 161→196). Restrained premium touch: one-time reduced-motion-guarded `kx-rise` stagger on the ≤5 hub category sections. SW v137→v138. Content/client-only; Arch unchanged (same engine, more data); no Firestore/Security/Payment change. Bible 2.55→2.56. |
| 2026-06-28 | 2.55 | 2.40 | 2.19 | 2.14 | 2.3 | **Learn ship-readiness fixes (ADR-069), NO AI:** 5 real issues from a final adversarial audit (rest confirmed sound; several flagged items consciously rejected as non-issues). (1) route-change focus management → topic `<h1>` / `#learnHeading` (both `tabindex="-1"`, `focus({preventScroll:true})`) — WCAG 2.4.3; (2) `.kx-section-nav` `@supports` fallback to near-opaque where `backdrop-filter` unsupported (no content bleed); (3) faint `#64748b` labels (`.kx-cat-count/blurb`, `.kx-search-cat`, `.kx-status-scaffold`, `.kx-action-soon`) darkened to `#475569` for AA; (4) hub "Continue" excludes "Due" ids (no duplicate cards; Saved authoritative); (5) hub scroll position restored on Back from a topic. SW v136→v137. Client-only; no Firestore/Security/Payment change. Bible 2.54→2.55, Arch 2.39→2.40. |
| 2026-06-28 | 2.54 | 2.39 | 2.19 | 2.14 | 2.3 | **Learn premium UX polish + 4 bug fixes (ADR-069), NO AI:** (1) horizontal pill/strip swipe no longer switches the bottom-nav tab — `swipe-nav.js` denylist now exempts `[data-no-swipe], .kx-section-nav, .kx-resume-row, .kx-table-scroll`; (2) sticky section-nav is now subtle glass (blur + translucent page-bg) instead of a dark strip; (3) "Save" is real — hub shows a "★ Saved" strip from `LearnProgress.bookmarkedIds()` + save toast; (4) Pipes & Cisterns `drillCategory:null` + non-interactive "Practice coming soon" chip (`drillComingSoon`) instead of launching Time & Work questions. Scaffold "Coming soon" cards restyled (dashed/inviting, not dimmed); bounded token-based polish (card hover/press, resume edge-fade mask, glassy pills, search focus), all reduced-motion-guarded. SW v135→v136. Client-only; no Firestore/Security/Payment change. Bible 2.53→2.54, Arch 2.38→2.39. |
| 2026-06-28 | 2.53 | 2.38 | 2.19 | 2.14 | 2.3 | **Learn final-review polish (ADR-069), NO AI:** client-only a11y + responsive elevations from the final production review. **A11y semantics:** topic-page section labels → `<h2>`, block heads (concept/formula/trick/trap/memory/example) → `<h3>` (clean `h1→h2→h3` outline); breadcrumb/section-nav → `<nav aria-label>`, related/prev-next/back → `<aside>`; active scroll-spy pill gets `aria-current`; `#learnSearchResults` is an `aria-live="polite"` region. Zero visual change (class-based styling; two head classes gained a `margin-top:0` reset). **Landscape-tablet layout:** reading-column + sticky side-rail now activates at **≥960px** (was 1100) via a new 900px container step + hub 3-col @960 — landscape iPads/foldables get a true two-column reading+rail; phones + portrait tablets (<960) unchanged. SW v134→v135. No Firestore/Security/Payment change. Bible 2.52→2.53, Arch 2.37→2.38. |
| 2026-06-28 | 2.52 | 2.37 | 2.19 | 2.14 | 2.3 | **Learn Knowledge Engine — Phase 5 (polish + cleanup, NO AI) — ADR-069 COMPLETE:** pruned all now-inert legacy Learn CSS (`.learn-jump-*` nav/btn/active across base/dark/theme-playful/theme-playful.dark-mode + both tap-delay/ripple selector lists + `app.js` RIPPLE_SELECTORS; `.learn-group-*`; `mark.search-highlight`; residual `.learn-searchable` marker removed from 5 reference cards + `learn-manager.js`) — **21 dead rule-sets gone**, CSS 3109→3092 braces, zero remaining refs. Polish: badge .62→.66rem, `.kx-crumb` 2.25rem touch target, reduced-motion-guarded `kx-fade-in` topic entrance. Perf: lazy per-category load deliberately NOT added (render-on-route + once-built search index already minimal for 19 precached topics). SW v133→v134. Final independent production audit passed. **Client-only cleanup/polish; no Firestore/Security/Payment change; NO AI.** Bible 2.51→2.52, Arch 2.36→2.37. |
| 2026-06-28 | 2.51 | 2.36 | 2.19 | 2.14 | 2.3 | **Learn Knowledge Engine — Phase 4 (integrations, NO AI) (ADR-069):** localStorage-primary progress module (`js/learn/learn-progress.js`, dual-exported; pure recency/spaced-due helpers under a new 32-assertion `learn-progress.check`) with best-effort Firestore mirror via the **existing** `FirestoreSync.queueUpdate` — two new owner-writable user-doc fields **`learnProgress`** (`{topicId:{viewedAt,completedAt}}`) + **`learnTopicBookmarks`** (`[topicId]`), same denylist-safe path as customTopics/bookmarks (**no new collection/rule**; hydrated on login, cleared on user switch). Topic **action bar** (Practise this → focus-drill via `drillCategory`; Quick-revision **cheat-sheet projection** = filtered view over authored revision/formula/trick/trap blocks; Mark-complete; Save); hub **Continue learning** + spaced **Due for revision** strips + live completion ticks. Every applicable topic gains a **validated `syllabusTopicId`** → `data/syllabus.js` (data-level Planner link; `learn-content.check` 144→162). SW v132→v133. **Security/Payment unchanged** (`entitlementFieldsSafe()` already permits owner non-entitlement writes). Bible 2.50→2.51, Arch 2.35→2.36, Firestore 2.18→2.19. |
| 2026-06-28 | 2.50 | 2.35 | 2.18 | 2.14 | 2.3 | **Learn Knowledge Engine — Phase 3 (ADR-069):** authored **14 gold-standard topics** (overview/concepts/formulas/tricks/traps/worked-examples/memory/revision) across a **5-category taxonomy** (Numbers · Arithmetic · Commercial Math · Modern Math · Mensuration) — Number System, Simplification, Percentages, Ratio, Averages, Time & Work, Pipes & Cisterns, TSD, Profit & Loss, Simple/Compound Interest, Probability, Area, Volume — + 5 honest scaffolds. Original exam-grade content (cheat sheets = organisation inspiration; every formula/example hand-verified). `data/knowledge/{numbers,commercial,modern}.js` added (+ arithmetic/mensuration enriched, categories.js expanded). Content-quality gate in `learn-content.check` (144) enforces gold-standard depth. SW v131→v132. **Content/client-only; topic ids preserved; no Firestore/Security/Payment change; NO AI.** Cheat-sheet projection view + formula explorer = P4. Bible 2.49→2.50 (Arch unchanged). |
| 2026-06-28 | 2.49 | 2.35 | 2.18 | 2.14 | 2.3 | **Learn Knowledge Engine — Phase 2 (ADR-069):** Learn cut over to a deep-linkable **hub → topic-page** knowledge graph + reusable responsive design system. Reintroduces tested block renderers (`js/knowledge/blocks.js`); `js/views/learn-view.js` rewritten as a render-on-route controller (hub: category→topic cards + preserved Quick-Reference tables/bookmarks/custom topics; `#learn/<id>` topic pages: breadcrumbs, sticky scroll-spy section nav, typed blocks, related, prev/next, back); `learn-search.js` wired to the box (deep-linking results). New `.kx-*` responsive system scoped to `body.view-learn-active` (lifts the 480px cap on tablet/desktop). Retires `js/formulas.js` (content migrated) + legacy DOM-scan search/jump-nav. New `learn-render.check` (13) + `learn-browser.check` (10) in `npm test`. SW v129→v130. **Client-only; no Firestore/Security/Payment change; backwards-compatible; NO AI in Learn.** Arch 2.34→2.35, Bible 2.48→2.49. |
| 2026-06-28 | 2.48 | 2.34 | 2.18 | 2.14 | 2.3 | **Learn Knowledge Engine — Phase 1 (ADR-069):** foundation for rebuilding Learn into a deep-linkable hub→topic knowledge graph of reusable **knowledge objects**. New pure engine — `js/knowledge/schema.js` (topic/block schema + validators, dual-exported), `registry.js` (in-memory KnowledgeBase + integrity validator with duplicate-id detection), `js/learn/learn-search.js` (weighted symbol/synonym index) — plus data modules `data/knowledge/{categories,arithmetic,mensuration}.js` (faithful migration of the 8 legacy `formulas.js` topics, no filler). `router.js` gains `#learn/<topic>` deep links (single-segment hashes unchanged) + a `view-learn-active` shell hook. New `scripts/learn-content.check.js` (35) in `npm test`. SW v128→v129. **Pure additive client engine; existing Learn page untouched/working; no Firestore/Security/Payment change; NO AI in Learn.** Block renderers (`blocks.js`) + hub/topic UI + responsive `.kx-*` CSS = Phase 2. Arch 2.33→2.34, Bible 2.47→2.48. |
| 2026-06-28 | 2.47 | 2.33 | 2.18 | 2.14 | 2.3 | **Battle Archive — Premium duel history + rivalry/personal stats + achievements (ADR-068):** an expandable, Premium-only section below the Home Duel card (HIDDEN for free users, not greyed), built as a read-only client layer (`js/duel-archive.js`) over **server-maintained** truth — the client never computes outcomes/aggregates. **Schema:** `users/{uid}/duelHistory` extended with denormalized `opponentUid/oppAccuracy/challengerUid/iChallenged/difficulty/questionCount/myAnswered/durationMs` (room docs TTL at 30d) + the ADR-065 50-cap (`DUEL_HISTORY_CAP`/`_pruneDuelHistory`) **removed** → complete + paginated; new server-only aggregate `users/{uid}/duelStats/summary` (`duelAggregates`+`rivals{}`+`achievements{}`) maintained inside the existing `_finalizeTxn` transaction via the pure `services/duelStats.js`; +3 `duelHistory` composite indexes `(outcome|difficulty|opponentUid, playedAt desc)`. **Rules:** `duelStats` owner-read / client-write-DENIED (mirrors duelHistory) + `account.js` deletion includes `duelStats`. **Zero new serverless functions** (main-app stays 8/12) — the Archive is reads + the existing duel write path. SW v127→v128 (+`js/duel-archive.js` precache). New `scripts/duel-archive.check.js` (45 assertions) in `npm test`. Pre-launch, **no migration**. Firestore 2.17→2.18, Arch 2.32→2.33, Security 2.13→2.14, Bible 2.46→2.47. _(2026-06-28 follow-up: post-implementation audit hardening — client-only filter/pagination/fastest-win fixes, no version-track bump; see CHANGELOG + DECISION_LOG ADR-068.)_ |
| 2026-06-24 | 2.46 | 2.32 | 2.17 | 2.13 | 2.3 | **Deep bible↔code drift reconciliation:** synced the living bibles to actual code (3-app audit). TECHNICAL_BIBLE §3 main-app API row → real AI actions (explain/coach/insights/chat/planner/wordproblems) + added `duel`/`notify`; §3.1 counts main-app 6→8, coaching 6→5 (removed non-existent `leaderboard`). SECURITY admin rate limit 30→**300/hr** (`middleware.js` `ADMIN_MAX_REQUESTS_PER_HOUR=300`). FIRESTORE §4 added the two `aiRequests` composite indexes. AI_INTERACTION envelope feature `plan`→`planner` (+ chat / ai_study_plan naming note). Payment verified clean. Doc-only; no code/rules/index/data change. `npm test` 4098 + mock-engine 100 green. Bible 2.45→2.46, Arch 2.31→2.32, Firestore 2.16→2.17, Security 2.12→2.13. |
| 2026-06-24 | 2.45 | 2.31 | 2.16 | 2.12 | 2.3 | **Documentation-consistency reconciliation (ADR-067/ADR-032):** synced the living docs + every per-doc version header + the README footer to the as-built ADR-067 catalog (17 exams in 4 tiers, 14 drillable categories, 50 topics, `SYLLABUS_VERSION` 3) and to this registry. Fixed: `AI_INTERACTION_SYSTEM` §6 (26→17 exams, 104→50 topics, 12→14 cats — resolves the §1-vs-§6 contradiction); `FIRESTORE_BLUEPRINT` "12→14 authoritative categories" + the verified-absent `aiStudyPlans` composite note (legacy collection; live planner is `aiPlanner/{uid}`, doc-per-user); `TECHNICAL_BIBLE` §6 `syncCoachingStudentCount` (retired/no-op, request-path maintenance — ADR-032); `ROADMAP` TEST-1 ("no automated tests" → the real ~4,098-assertion suite, re-statused Partial). Operational items (ADR-023 admin password rotation/MFA, App Check/M7) surfaced only — already tracked. **Doc-only; no code/rules/index/data change.** Verified: `npm test` (4098) + `mock-engine.check` (100) green. Bible 2.44→2.45, Arch 2.30→2.31, Firestore 2.15→2.16. |
| 2026-06-24 | 2.44 | 2.30 | 2.15 | 2.12 | 2.3 | **Focused speed-maths catalog rebuild + Timed Mock (ADR-067):** catalog curated 26→17 exams in 4 tiers (MBA/Banking/Foundation/Government), per-exam `tier`/`pattern`/`book` metadata + BOOKS registry (R.S. Aggarwal default; Arihant for MAH-CET), tier-aware readiness weighting, two new drill categories (Simplification, Number Series), categories-first onboarding, exam-mechanics coaching, and the Premium Timed Mock (`timed_mocks`). `SYLLABUS_VERSION` 2→3 (bundled data — Firestore track unchanged). New check `scripts/mock-engine.check.js`. SW v126→v127. Bible 2.43→2.44, Arch 2.29→2.30. |
| 2026-06-15 | 2.43 | 2.29 | 2.15 | 2.12 | 2.3 | **AI never discards the student's real data on a Firestore read hiccup (ADR-054):** Coach/Insights said "I haven't seen you solve yet" for a user with 11 attempted/63.6% in Analytics. Root cause: the server builds the profile from Firestore via firebase-admin and the client's authoritative stats are a floor — but the read-failure `catch` returned `_coldContext(uid,{})`, **discarding the floor** and hardcoding `totalAttempted:0`, so a read error (e.g. bad `FIREBASE_SERVICE_ACCOUNT`) made the AI cold despite real data. Fix: `studentProfile.build()` degrades to empty server stats and falls through to the **same `_floorStats(clientStats)` path** on a read error (invariant: a positive client floor can never yield a cold profile); deleted the dead `_coldContext`; added a server tripwire log; and `firestore-sync.queueUpdate` now **buffers instead of dropping** pre-ready writes with a `_flushPending()` on load. No model/schema/rules change. `node --check`; `npm test` 209 + 78 (simulated admin read-failure stays warm). SW v114→v115. Arch 2.28→2.29, Bible 2.42→2.43. |
| 2026-06-15 | 2.42 | 2.28 | 2.15 | 2.12 | 2.3 | **One canonical Student Intelligence Profile + one derivation layer (ADR-053):** QuanAI felt like four features pretending to know the student; the audit found the persona/orchestrator/renderer/APIs/prompts/engines were already unified, so the fix was surgical (no rewrite). **One derivation layer** (`data/statMath.js`, new dual-export, client `<script>` + server `require`): the ONLY implementation of mastery/tiers, weakest/strongest, accuracy (overall + 7d/30d), speed, today, streak — consumed by BOTH the server profile and the client (`progress.js`/`stats-view.js`), so Analytics and QuanAI can't disagree. **One materialized profile**: `studentContext.js`→`studentProfile.js`, `buildContext`→`build`; `build()` folds the planner in (`profile.planner`; `aiBrain._plannerData` deleted) + materializes `recommendation`/`tier` (`aiBrain._tier` deleted)/`masteryByCat`. **Every feature on the profile** incl. Explanation (now `build()` not a bespoke read). Deleted the client mastery loops + `MASTERY_MIN_ATTEMPTS`. Preserved persona/orchestrator/renderer/APIs/prompts/engines. No model/schema/rules change; one LLM call per feature. `node --check`; `npm test` 209 + 70. SW v113→v114. Arch 2.27→2.28, Bible 2.41→2.42. |
| 2026-06-15 | 2.41 | 2.27 | 2.15 | 2.12 | 2.3 | **Remove the "I don't know you yet" cold-start gate (ADR-052):** Analytics knew the student while Coach/Insights said "I don't know you yet — give me 10 questions." The audit confirmed the data plumbing was already one fresh source of truth (the `clientStats` floor + dirty-stamp rebuild; no stale cache, no refresh/second session); the fault was a single hard gate. **No cold-start gate** (`studentContext.js`): deleted the `buildContext` early-return + `COLD_START_ATTEMPTS`/`COACH_MIN_TODAY`; `buildContext` always returns the real canonical profile from whatever data exists; `accuracy` null (not 0) with no data; `coldStart` is a framing flag only; `_coldContext` kept only as the read-failure fallback. **Coach/Insights always render** (`aiBrain.js`): removed the `isColdStart` locks; data richness (`_tier`) decides how rich, never whether it works; `tier 0` (0–5) → deterministic helpful early read (`_coachLowData`/`_insightsLowData`, no LLM, cost-flat), `tier ≥ 1` → existing LLM dashboard — a 6–19-question student now gets real coaching. **One data-state rule**: aligned the client weak/strong floor (`progress.js` `≥10`→`≥3` `MASTERY_MIN_ATTEMPTS`); removed the no-op `<5` lock (`stats-view.js`) + dead `showInsufficientDataModal` shim (`ai-features.js`). Copy reframed (no "I don't know you / 10 questions / unlock"). Paywall unchanged (out of scope). No model/schema/rules change; one LLM call per feature. `node --check`; `npm test` 209 + 62. SW v112→v113. Arch 2.26→2.27, Bible 2.40→2.41. |
| 2026-06-15 | 2.40 | 2.26 | 2.15 | 2.12 | 2.3 | **One source of truth + Explanation as a premium learning document (ADR-051):** final sign-off audit (4 from-first-principles passes) confirmed the system is architecturally clean (zero dead prompts/exports/files, zero duplicate calls/reads, zero legacy refs); fixed two "one brain" gaps. **One freshness source:** the `clientStats` floor was dropped by `plannerGet` (server discarded what the client already sent at companion-ui.js:438), `chatTurn`, and `wordProblem` → threaded `_sanitizeClientStats`→`buildContext({clientStats})` into all three (client `sendTurn`/drill payloads now send it) so no feature disagrees with the Coach dashboard after a drill. **One mastery source (no drift):** exported `studentContext._deriveMastery` + `masteryForCat(stats,cat)` as THE canonical weak/strong resolver; Explanation now reads its category's mastery from the same function Coach/Insights/Planner use, retiring the ad-hoc "asked-to-explain-before" heuristic. **Explanation = premium learning document:** always-visible concept → steps → Common mistakes (2–3, personalized) → Faster method → Exam Insight (deterministic from the bundled syllabus) → Mastery Status (canonical "{acc}% over {n}", never invented) → Recommended next step; chips now extend rather than reveal. `explain.base@5` (`mistake`→`mistakes[]`, `tip`→`shortcut`; busts the shared cache). One LLM call per feature preserved; personalized sections deterministic. No model/schema/rules change. `node --check`; `npm test` 209 + 48. SW v111→v112. Arch 2.25→2.26, Bible 2.39→2.40. |
| 2026-06-15 | 2.39 | 2.25 | 2.15 | 2.12 | 2.3 | **Coach + Insights as living dashboards (ADR-050):** turned both from "paragraph + button" into animated, multi-section dashboards from one AI brain — reuse-not-rewrite (same `studentContext`, one LLM call per feature, same caches, same `aiPlanner` read; cost unchanged). **Assembly:** `_plannerNote`→`_plannerData(uid, clientDate)` returns `{note, readiness, forecast, todayTasks, adherencePct}`; `coachToday`→`_coachDashboard` (greeting → readiness **ring** → win → worry → metric cluster → plan **progress** → days-to-exam callout → today's mission → motivation → conversational chips); `insights`→`_insightsDashboard` (patterns intro → biggest-lever → metrics → pattern cards → weakness → planner prediction → action missions). `_detectPatterns` surfaces the previously-dead behavioural flags (careless/speedRegression/plateau/inconsistent/burnout). **Tiers** (`_tier`, 0–4) gate WHICH sections show, never WHETHER computed. **Cold start = curious onboarding** (`_coachOnboard`/`_insightsOnboard`), zero "practice to unlock / go practice / warm up" copy (grep-gated). **Closed two dead loops:** `serialize()` surfaces `recentTopicsExplained`; Coach writes `aiMemory.wins` via `addWin`. **New blocks** `ring` (reuses `.pr-ring`) + `progress` (wires `.cb-progress*`); `renderEnvelope` staggers children (`--bi`), both in the reduced-motion guard. `coach.daily@5`, `insights.analyze@6` (flag-reactive; deterministic fallback fills every field). Duplicated `fmtMin` kept separate on purpose (different output strings, per ADR-047). No model/schema/rules change. `node --check`; `npm test` 209 + 37. SW v110→v111. Arch 2.24→2.25, Bible 2.38→2.39. |
| 2026-06-14 | 2.38 | 2.24 | 2.15 | 2.12 | 2.3 | **QuanAI product polish — one premium AI, correct dates, modal planner (ADR-049):** root-caused the remaining correctness/UX issues. **Coach/Insights cold-start despite data:** the `aiDaily` envelope cache was bypassed only on `force`, not `clientStats`, pinning a stale cold envelope all day → now `!force && !clientStats`. **Timezone:** "today" was UTC on client+server so at 3am in a +offset zone the planner anchored to yesterday (and selection felt stuck); the client now sends its LOCAL `clientDate` and the server anchors on `clientDate || _todayIso()` everywhere. **Premium modal:** the full-page `#view-planner` becomes the companion bottom-sheet (blur/slide-up/rounded/dismiss + grabber & drag-to-dismiss) via `Planner.renderInto`; fixes the broken scroll (single `.companion-scroll`), adds safe-area + small-screen breakpoints + micro-polish. **Consistency:** one "Study Planner" vocabulary; removed dead router mount + orphaned CSS. **One AI:** shared `_plannerNote` grounds Coach AND Insights in the live planner (tasks + readiness); `insights.analyze@5`. No model/schema/rules change. `node --check`; `npm test` 209 + 25. SW v109→v110. Arch 2.23→2.24, Bible 2.37→2.38. |
| 2026-06-14 | 2.37 | 2.23 | 2.15 | 2.12 | 2.3 | **Final pre-production hardening of QuanAI (ADR-048):** a full architecture audit confirmed the system is clean (zero orphans/dead-helpers/dead-prompts; ADR-047 cleanup complete). Remaining verified fixes: **planner writes awaited** (setup/toggle/regen + auto-catch-up were fire-and-forget → a checked task could silently revert; now awaited via `_writePlanner`, failures → 503 retryable, calendar rolls back the optimistic checkbox); **Coach/Insights clientStats floor** (extended the ADR-046 accuracy-floor beyond the planner so a drill finished during the `syncStats` debounce isn't missed); **uniform exam-awareness** (`planner.narrate@2` + `explain.followup@2` now inject the exam via `sys(role, examName)`; narrate seed gains `daysToExam`); **`NO_AUTH` UX** (renderError shows a sign-in-again message, no retry loop); **dead-code removal** (`aiService.generateWordProblems`/`_shuffleInPlace`/`checkWordProblemQuota`). No model/schema/rules change. `node --check`; `npm test` 209 + 23. SW v108→v109. Arch 2.22→2.23, Bible 2.36→2.37. |
| 2026-06-14 | 2.36 | 2.22 | 2.15 | 2.12 | 2.3 | **Post-merge forensic remediation — one authoritative planner + restore dropped UX (ADR-047):** a 3-agent forensic audit of the merged `main` found the merge silently dropped a cluster of the Planner branch's non-conflicting UX improvements and left two competing planners. **R1 restored 6 regressions:** the live `today` count-signal (`_deriveToday`) — Coach/Insights/Planner stopped reading `undefined`/`NaN`; the two-gate "coach-don't-gate" cold-start; `serialize()` leads with TODAY; cold coach uses its computed `coldMsg`; Explain "Drill this" → in-place `chipDrill`; Explain honors `preferredDepth`. **R2 removed the legacy Mission entirely** (`missionGet/Generate/Today`, `_missionEnvelope`, `plan.generate`, `action=mission`, `openMission`/`runInterview`, `plan_regen`, `services/planLogic.js`, `quantTopics.nearestCategory`; Coach reads only `aiPlanner`; dropped dead `today.cats`/`weekCats`/`_toMillis`) — grep proves zero runtime refs. **R3 consolidated** byte-identical `round`/`clamp`/`todayIso` → `services/aiMath.js`. Tests repointed (`npm test` → planner harnesses, 209+22). Fixed an AI_INTERACTION_SYSTEM §0 "90s vs 6h" merge artifact. No model/rules/index change. SW v107→v108. Arch 2.21→2.22, Firestore note: `aiMissions` removed, Bible 2.35→2.36. |
| 2026-06-14 | 2.35 | 2.21 | 2.15 | 2.12 | 2.3 | **QuanAI Planner — living, adaptive, syllabus-driven study planner (ADR-046):** replaces the one-shot Mission. **Bundled syllabus DB** (`data/syllabus.js`, not Firestore): 26 exams → 5 real syllabi, 104 topics with importance/frequency/difficulty/prereqs/revision-cadence/est-minutes; the 12 drillable cats are **signals, not limits** — every topic is scheduled (drillable → in-app drill + analytics, others → "your resources"), and a weighted `signals[]` map infers readiness even for non-drillable topics (**never "no data"**). **Deterministic engine** (`signals.js`/`readiness.js`/`plannerEngine.js`): per-topic readiness, a 0..100 Exam Readiness Score, a dynamic Completion Forecast (buffer/pace/"+15 min/day"), and a 14-day scheduler with prereq cascade-unlock, revision interleaving, adaptive difficulty, adaptive buffer/mock days, and Smart Catch-up; the LLM (`planner.narrate@1`) only narrates, never schedules. **Doc** `aiPlanner/{uid}` v2 + API `action=planner` (get/setup/toggle/regen). **Accuracy bug fixed** via a fenced, raise-only `clientStats` floor in `studentContext` (stale `users.stats` no longer shows false-zero after a live session). **UI:** companion setup wizard (searchable exam, calendar date, study slider to 8h, days/week, prep level, preferred time) + `#view-planner` calendar (readiness ring, forecast, day cells, task checkboxes, per-task explainability). gpt-4o-mini unchanged; no rules/index change (catch-all default-deny covers `aiPlanner`). Validated by 209 engine + 19 brain logic assertions. SW v106→v107. Arch 2.20→2.21, Firestore 2.14→2.15, Bible 2.34→2.35. |
| 2026-06-14 | 2.34 | 2.20 | 2.14 | 2.12 | 2.3 | **QuanAI production audit — exam-aware persona, freshness, plan grounding, version-honesty (ADR-045):** deep production-readiness audit of Coach/Insights/Explain/Study-Planner ([AUDIT-REPORT-QUANAI.md](../../AUDIT-REPORT-QUANAI.md)). **One universal exam-aware persona** — `sys(role, examName)` drops the hardcoded "CAT coach"; adapts to the student's real exam (wrapped as data); interview gains free-text "Other…". **Version-honesty** — `meta.promptId` derived from registry version, `explanations` cache version-keyed, fallback envelopes never cached. **Freshness** — `force` threaded through `buildContext`; a finished drill stamps `qr_ai_dirty_at` so each surface force-refreshes once (+manual "↻"). **Plan grounding** — free-text plan topics mapped to real drillable categories (`quantTopics.nearestCategory`), phase durations feasibility-normalized, daily drill driven by the plan's own weekly focus. New deterministic modules `quantTopics.js`+`planLogic.js`; `scripts/test-ai.js` (16 tests, `npm test`). No model/schema/rules change. Arch 2.19→2.20, Bible 2.33→2.34. |
| 2026-06-14 | 2.33 | 2.19 | 2.14 | 2.12 | 2.3 | **Fix stale-duel resurrection (ADR-044):** a duel finished long ago kept reappearing as "Results ready" on Home after every restart. **Root cause:** `DuelCore.ackResult` was never in the `DuelCore` export, so `duel-manager`'s Finish-Duel call threw a swallowed `TypeError` → the recovery mirror `users.activeDuelId` was **never cleared** → boot recovery resurrected the completed duel each launch. **Fix:** export `ackResult`; it now writes a durable bounded localStorage tombstone (`qr_duel_acked`, FIFO≤30) **synchronously** before the best-effort server clear, so a finished duel can't resurrect even offline; `DuelCore.recover()` never returns a tombstoned code (self-heals the stale mirror) and drops abandoned/expired rooms; un-acked `complete` still surfaces for the opponent (per-user). Validated by a 16-scenario harness against the real `duel-core.js`. Client + SW only — no schema/rules/index/endpoint change. SW v104→v105. Arch 2.18→2.19, Bible 2.32→2.33. |
| 2026-06-14 | 2.32 | 2.18 | 2.14 | 2.12 | 2.3 | **AI persona rename "Reflex" → "QuanAI" (ADR-043):** display-name branding migration only — no personality, data, routing, analytics, or cache change. The ADR-039-centralized `PERSONA` constant flips `'Reflex'`→`'QuanAI'` in `services/aiPrompts.js` (all five system prompts via `sys()`) + `js/companion-ui.js` (AI-modal badge + throttle copy), re-branding the whole AI surface from two lines. **Bug fixed:** `aiBrain.js` cold-start coach used unexported `ctxEngine.PERSONA` (rendered "undefined") → now `prompts.PERSONA`. Personality unchanged (audited `sys()` voice kept). NOT renamed: QuantReflex brand, "Reflex Drill" mode, `quant_reflex_*` keys, "Reflex Master" badge. AI_INTERACTION_SYSTEM.md updated; ADR-039 record kept as history. SW v103→v104. Bible 2.31→2.32. |
| 2026-06-14 | 2.31 | 2.18 | 2.14 | 2.12 | 2.3 | **Premium pricing ₹349/₹599 + Word Problems "Coming Soon" polish (ADR-042):** pre-launch polish. **Pricing** raised ₹299/₹499 → **₹349 (34900 paise) / ₹599 (59900 paise)** across every current-state location, UI↔backend synced: charge path `paymentService.PLAN_CONFIG.amountPaise`, constant `entitlements.PRICING`, revenue maps `aiService`/`metrics.PREMIUM_PRICE_PAISE` (updated — no production data to preserve), display `paywall.PLANS` (≈₹58/mo & ≈₹50/mo, "Save 14%"), `index.html` FAQ/About. Durations (182/365), plan keys, entitlement gates **unchanged**. **Word Problems** restored from dead UI to intentional "Coming Soon": Practice card un-hidden (always visible + badge → `showComingSoon`); Duel pill un-`disabled` (a disabled button never fired) → animates select→fade-back-to-Quick-Math→modal. Dead `.timer-pill.is-soon` CSS removed; pill transition extended. Historical ₹299/₹499 entries left intact. SW v102→v103. Bible 2.30→2.31, Payment 2.2→2.3. |
| 2026-06-14 | 2.30 | 2.18 | 2.14 | 2.12 | 2.2 | **Launch-readiness pass for the first 1–2k users (ADR-041):** post-audit hardening (correctness/UX/security; hyperscale → ROADMAP §Scale-debt). **Forgot-password** (`Auth.resetPassword` + login link). **Plan server-authoritative on client** — `_normalizeMonetization` no longer writes entitlement defaults to Firestore (was clobbering fresh grants). **Suspend write-guard** — user-update rule requires `accountStatus=='active'` (closes practice-after-suspend). **Destructive admin friction** — typed ARCHIVE/RESET + typed STOP-PAYMENTS/STOP-AI kill switches. **Coaching broadcast** two-tap confirm. **Metric honesty** — AI $ marked estimates, WP placeholder hidden. Verified-already-correct (audit overclaims): duel listener teardown, register error differentiation, premium-count expired-exclusion, 2-player duels, debounced writes. AI re-validated (no new code). node --check ×7; rules 58/58; CSS 2458/2458; duel-sim 47/47. SW v101→v102. Bible 2.29→2.30. |
| 2026-06-14 | 2.29 | 2.18 | 2.14 | 2.12 | 2.2 | **AI Ecosystem adversarial-audit remediation (ADR-040):** a 3-agent adversarial trace found the ADR-039 AI *looked* built but was **non-functional in production** — two P0 bugs neither catchable by static checks. **P0a:** every `aiPrompts.js` schema used `maxLength`/`minItems`/`maxItems`, which OpenAI Structured-Outputs `strict:true` **400s** → every model call silently fell to its deterministic fallback (no real AI output); removed the keywords, brevity now via prompt + server-side `_clip`. **P0b:** `companion-ui.deepLink` silently no-op'd from Home-tab modals (the advice→action loop was dead); now `Router.showView('practice')` + deferred launch. **P1:** `serialize()` now feeds the dormant `sessionImprovementPct` + recent sessions + name; deleted unused `mastery.trend`/`topWeakCats`/`bestStreak`; failed calls bill tokens; Coach reads `aiMissions`; retry re-runs the right action; chat history dedup; dead `quiz`/`progress` blocks removed (→ roadmap). **P2:** ~1,500 lines of dead code purged (`aiService.js` −511, `ai-features.js` −967 incl. the legacy study-plan wizard). Verify: schema grep 0; 0 removed-fn callers; duel-sim 47/47; CSS 2454/2454; rules 58/58. SW v100→v101. Patch on ADR-039; Bible 2.28→2.29. |
| 2026-06-14 | 2.28 | 2.18 | 2.14 | 2.12 | 2.2 | **AI Ecosystem — one brain, five experiences, gpt-4o-mini only (ADR-039):** every AI feature redesigned to leverage the per-student data ChatGPT can't have, on the single production model — intelligence from architecture not model size. **Foundation** (`services/`): Student Context Engine (`studentContext.js`, server-authoritative trends/mastery/flags from the unused goldmine, pure arithmetic, 6h `aiContext` cache, cold-start skips the LLM), single-model seam (`llmProvider.js`, injection sanitize + strict json_schema + retries), versioned prompt registry (`aiPrompts.js`, model writes only small language objects), assembler (`aiBrain.js`, builds AIResponse block envelopes from real data + memory, deterministic fallbacks); `aiService` gains server-authoritative `aiMemory` get/update + the **enforced** `enforceAiBudget` cost breaker. **API** (`api/ai.js` rewrite): client sends action only (no trusted stats); actions explain/coach/insights/chat/mission/wordproblems. **Client**: `companion-ui.js` (one renderer + conversation + chip deep-links + chip-driven Mission interview), `ai-analytics.js` (lazy `aiEvents`), `ai-features.js` re-pointed, AI CSS component system. **Five features, one brain** via shared context + `aiMemory`: Explain (interactive), Coach (flag-driven mentor), Insights (→ missions), Study Plan → living **Mission** (`aiMissions`, replaces `aiStudyPlans`), Word Problems (context-aware, future-ready). **Spark/Vercel**: AI daily rollup piggybacks the SINGLE cron inside the duel sweep (guarded) → `systemMetrics/ai_engagement_{date}`; ZERO new functions. **Rules**: `aiMemory` client-write denied, `aiEvents` owner create-only/immutable, `aiContext`/`aiDaily`/`aiMissions` server-only. New canonical doc `AI_INTERACTION_SYSTEM.md`. Arch 2.17→2.18, Firestore 2.13→2.14, Security 2.11→2.12, Bible 2.27→2.28. |
| 2026-06-14 | 2.27 | 2.17 | 2.13 | 2.11 | 2.2 | **Math Duel production polish (ADR-038):** the working lifecycle (ADR-035→037) made production-grade. **PWA-only lock** — `_pwaOk()` gates every duel entry before premium (`openSetup`/`_openJoinWith`/deep-link/`_resumeActiveDuel`); a browser sees a premium install gate (`DuelUI.renderInstallGate`), never gameplay; recovery in a browser shows only the passive Home card. **Result screen** perceptually centered with ALL data kept: fixed-height crown slot on both columns, subtle winner avatar ring, restrained score, **three equal `.rs-row`** stat rows (Correct·Accuracy·Speed) — and a latent bug fixed (dead V1 `.duel-result-actions{flex-direction:column}` was stacking the live Share/Finish row). **Premium share card** rewrite (`_generateDuelCard`: frosted player blocks w/ gradient avatars + accuracy + **speed**, VS badge, gold winner ring; old code's ignored `_roundRect` fill-arg meant score boxes never drew). **Answering screen** rhythm unified across Practice/Focus/Drills/Tests/**Duels** (`--drill-card-gap` + `--drill-submit-gap`; duel card bottom now includes submit-gap), one 1/3·2/3 skip design, 66/33 duel header, countdown pop. **−~495 lines** of dead/duplicate legacy duel CSS purged. SW v98→v99. Additive client + CSS only (no schema/rules/index). Arch 2.16→2.17, Bible 2.26→2.27. |
| 2026-06-13 | 2.23 | 2.14 | 2.13 | 2.10 | 2.2 | **Sections 2–10 program — P0 (gate + live-breaking fixes; ADR-033 + ADR-034):** P0-a governance gate (below) **plus the two P0 code fixes that shipped with it** — **P0-b:** `withAuth` gains a rate-limit **class**, with the duel endpoint on its own **120/hr** bucket (`_lib/middleware.js`) so a live duel can't 429 mid-finish or drain the 20/hr AI bucket; **P0-c:** the super-admin orphan/health/alert probes + `duels-cleanup` (`system.js`) stop querying the dead V1 `waiting` status — probes now flag only NON-LIVE rooms (`lobby`/`abandoned`/`expired`) and cleanup is **non-destructive to `active`** (purges only non-live rooms past retention; `api/duel.js` stays the sole finalizer). Arch 2.13→2.14.<br>**P0-a gate (ADR-033 + ADR-034):** a 13-agent adversarial audit verdict — **preserve, don't rebuild** Duel V2 — opens a targeted fix-pass + the owner-LOCKED design-language inheritance (true Practice `drill-engine` component reuse, not imitation) and a first-class **Independent** affiliation for Super-Admin. This row is the **doc-only gate**: authored ADR-033 (Duel fix-pass: drill-engine reuse + de-indigo §10A inheritance, D1 rate-limit class, admin V2-lifecycle correctness, per-question data + honest metrics, leaveLobby/self-heal) and ADR-034 (backfilled, authoritative, queryable Independent + coaching grouping), and **corrected the `activeDuelId` drift** (DECISION_LOG.md:92 + FIRESTORE_BLUEPRINT.md:143 + the `_finalizeTxn` header claimed it's cleared at finalize; the shipped code intentionally does NOT — now reconciled, + strictly-2-player note). Zero new functions; Spark-safe; server-authoritative model reinforced. Arch/Firestore/Security bump per phase as code lands (P0-b/c, P1, P2). Bible 2.21→2.22. |
| 2026-06-13 | 2.21 | 2.13 | 2.13 | 2.10 | 2.2 | **Coaching-affiliation data correctness on Spark (Section 1, ADR-032):** a student created with a valid `coachingId` was correctly affiliated (`users/{uid}.coachingId` set — proven with live data) yet Super-Admin showed the coaching with **0 students**. Root cause: `coachings/{id}.studentCount` was maintained **only** by the `syncCoachingStudentCount` `onDocumentWritten` trigger, which **does not run on Spark** — freezing every counter at 0. Fix (root, not symptom): `studentCount` maintenance moved **into the request path** — `register` (+1, in its batch), `account.claim-coaching` + `users.reassign-coaching` (±1, transactional), `users.purge` + `account.delete` (−1, best-effort); decrement only when `coachingId` is actually removed (suspend/archive keep it). Detail surfaces already use live `count()` as truth (the `(coachingId,plan)` index already exists). Trigger **neutralized** (no-op early return → can't double-count on a future Blaze move). Compounding read defects fixed: `register` now initializes `stats.lastActiveMs`/`lastActiveDate` so the coaching roster `orderBy` no longer drops never-practiced joiners; User-360 "recent duels" repointed from the dead Duel-V1 `participants.${uid}` query to `users/{uid}/duelHistory` (+ shown in Activity); Super-Admin Users resolves `coachingId → name` (client-side) instead of the raw code. No new fields/indexes; no rules change; no new functions. Two one-time backfills (owner-authorized). Firestore 2.12→2.13, Arch 2.12→2.13, Bible 2.20→2.21. |
| 2026-06-13 | 2.20 | 2.12 | 2.12 | 2.10 | 2.2 | **Duel V2 — server-authoritative premium 1v1 speed challenge (ADR-031, full rebuild):** a 33-agent adversarial workflow + 2 red-team passes found 65 confirmed problems in the client-trust duel system — plaintext answer key in the room doc, 100% client-written score/winner, active-forever hangs on timeout, localStorage-only recovery, client-only premium, whole-map writes per answer, unsynchronised countdowns, no Active-Duel card/resume/history/share. Rebuilt to the owner's 4 decisions: **server-authoritative scoring** (new Vercel `api/duel.js`, Admin SDK, the ONLY writer of questions/answer-key/grading/winner/status; premium via `aiService.resolvePlan`), **hidden-until-results** (opponent shows only presence), **speed-weighted accuracy-dominant** winner (`correctCount×1000 + speedBonus≤300`), **full one-pass rebuild**. ONE canonical model: split docs — `duels/{code}` (prompts text-only + presence), `duels/{code}/private/key` (server-only answers), `duels/{code}/players/{uid}` (own answers, opponent denied → zero hot-path fan-out); `users.activeDuelId` recovery mirror + Active-Duel home card; `users/{uid}/duelHistory/{id}` (server-written). Finalize = one status-CAS txn (idempotent) + endpoint-sent "opponent finished" FCM. **Spark-correct:** no Firebase functions (they don't run on Spark) — lazy finalize-on-`state` + Vercel daily-cron backstop. `/duels` rules **rewrite** (participants-only read; client writes only own `presence` via a two-level nested diff; private/winner/status denied; explicit `duelHistory` write-deny over the blanket `users/{uid}/{sub}` grant). No data migration (ephemeral, `schemaVersion:2`). One new Vercel function (7/12); index `duels(participantUids array-contains, status)`. Bible 2.19→2.20, Arch 2.11→2.12, Firestore 2.11→2.12, Security 2.9→2.10. |
| 2026-06-13 | 2.19 | 2.11 | 2.11 | 2.9 | 2.2 | **Coaching App V4 — value / premium-UI / performance pass (ADR-030):** a brutally-honest product review found the rebuilt coaching app *feels empty, low-information, and slow* — root cause: the backends compute rich data the views **discard** + the ADR-029 "masked scans" were never actually masked. **Performance:** real Firestore field masks (`.select()`) on the heavy coaching scans (students/dashboard/insights) + `Promise.allSettled` on the super-admin Command Center waterfall (the actual slowness). **Value:** Dashboard/Students/Performance/Engagement rebuilt to surface already-fetched-but-discarded data (`strongestStudents`/`recentActivity`/`streak`/`weakTopic`/`totalQuestionsSolved`) + demote vanity; honest available-today signal (WoW accuracy/participation) promoted. **Session Improvement (cold-start speed bridge):** student app computes first-half vs last-half session speed from the existing `perQuestionTimes` (≥6 timed Qs) → per-session `practiceSessions.{firstHalfAvg,secondHalfAvg,sessionImprovementPct}` + a rolling `users.stats.avgSessionImprovementPct` (read cheaply by the coaching scan); strictly a "Session Improvement" metric, never a 7/30-day trend. **Onboarding trust:** student join shows "✓ Connected to <Coaching Name>" (+ optional new `coachings.logoUrl`, set in super-admin); coaching code one-tap copyable in Settings. **Minimal coaching notes:** one plain-text note per student in `coachings/{id}/notes/{uid}` (Admin-SDK via `students?action=save-note` — no new function; client read/write denied). **Premium UI:** content emoji→inline-SVG, `.metric-card.accent-*` activated, heading tier, uniform empty/collecting/error taxonomy, `prefers-reduced-motion` + `:focus-visible`, ARIA tab fix. No new functions (coaching 5/12); additive Firestore + cross-app data-flow + a notes-deny rule. Bible 2.18→2.19, Arch 2.10→2.11, Firestore 2.10→2.11, Security 2.8→2.9. |
| 2026-06-13 | 2.18 | 2.10 | 2.10 | 2.8 | 2.2 | **Coaching ecosystem audit remediation (ADR-029):** fixed the audit's CRITICAL + HIGH findings. **Security:** suspend/delete a coaching now revokes the owner's tokens + drops their `coaching_admin` claim (delete also disables Auth), `withCoachingAuth` verifies with `checkRevoked` + a coaching-status gate, register endpoint rate-limited + crypto-strong token. **Data integrity:** Skip no longer records a 0-second solve (speed un-polluted); new sortable `users.stats.lastActiveMs` replaces the non-sortable `toDateString` in all order/range queries (coaching roster + super-admin inactive sweep/list/export, which previously never matched) — index updated, backfill migration added. **Scale:** dashboard/insights/notices scans bounded (5000) + the rollup cron parallelized (bounded concurrency); trial users no longer double-counted as premium; offboarded students excluded from coaching counts/lists. **Join UX:** validate-coaching surfaces the institute name ("Joined: …") + status; Smart-Nudge chips actually target inactive/low-streak; notices report true in-app reach; settings/profile/notices error+retry; badge/keyboard/affordance a11y. Security 2.7→2.8, Firestore 2.9→2.10, Bible 2.17→2.18. |
| 2026-06-13 | 2.17 | 2.10 | 2.9 | 2.7 | 2.2 | **Coaching App V3 — Analytics Foundation + mobile-first redesign (ADR-027/028):** establishes the first **dated speed history** — `users.stats.dailyHistory[date]` widened to `{attempted,correct,sumTimes,count}` (avgTime/day) in `main-app/js/progress.js`; `practiceSessions` now actually written (`savePracticeSession` wired); new per-coaching daily rollup `coachingMetrics/{id}` (written by the existing super-admin cron — **zero new functions**); 3 composite `users(coachingId,·)` indexes. Coaching App rebuilt as a mobile-first 5-tab "Speed Training Control Center" (Dashboard/Students/Performance/Engagement/Settings), Notices→Engagement Center, no Coaching Rank (→ Coaching Improvement Score vs own history), de-gamered dark theme + re-enabled zoom, broken `app.navigate` intervention arm fixed. **Honesty rule:** history-dependent metrics show "collecting data — live in N days", never fabricated/approximated trends; no backfill. Additive Firestore (MINOR), new `coachingMetrics` read rule (Security MINOR), cross-app data-flow (Arch MINOR). |
| 2026-06-12 | 2.16 | 2.9 | 2.8 | 2.6 | 2.2 | **Super Admin accessibility + governance enforcement — Pass 3 (ADR-026):** final pass of the ADR-024 program — an adversarial multi-agent UX/visual/a11y/navigation audit (35 candidates → 18 confirmed fixes). Keyboard-operable `.sv-row` / drop-zone / search results (`role`+`tabindex`+Enter/Space, WCAG 2.1.1); `aria-label`s on filter inputs + bulk checkboxes; labelled Global-Search `role="dialog"`/`listbox`/`type=search`; active nav `aria-current="page"`; fixed the dangling modal `aria-labelledby` (`#modalTitle` now set); rebuilt Tabs to the full WAI-ARIA tab pattern (roving tabindex + Arrow/Home/End); `aria-live` toast region (+ `role="alert"` on errors); remaining raw `e.message` sites (questions/command-center/global-search) routed through `getReadableError`; Content table card-mode on narrow panes; triplicated `_tile()` collapsed to one `AdminUtils.statTile`; restored the self-referential `--accent-glow`/`--accent-ring` light-mode token values; global `:focus-visible` ring. Zero new functions (8/12); client + Bible only; no schema change. UI/a11y (MINOR). |
| 2026-06-12 | 2.15 | 2.9 | 2.8 | 2.6 | 2.2 | **Super Admin Settings Center — Pass 2 (ADR-025):** new 8th domain (Settings) — Account (change password/email via Firebase SDK reauth) · Security (login history + **log out everywhere** via the one new `system?action=revoke-tokens`, self-scoped + audited) · Appearance (theme) · Preferences (landing/density/animations/date-format/timezone, device-local) · Platform info · Backup (CSV exports). Operations Diagnostics health grid reflects live kill-switch state. Zero new functions (8/12); no schema change. Security 2.5→2.6 (self-session revocation). |
| 2026-06-12 | 2.14 | 2.8 | 2.8 | 2.5 | 2.2 | **Super Admin thorough dark mode — Pass 1b (ADR-024):** 100% design-system-driven theming — re-tokenized the entire stylesheet + every view onto a semantic theme-token system with an intentionally-designed `[data-theme="dark"]` palette; zero hardcoded UI color literals remain (grep-verified). No-FOUC boot script + footer light/dark/system toggle persisted to `qrAdminTheme`. CSS/JS/HTML only; zero new functions. UI (MINOR). |
| 2026-06-12 | 2.13 | 2.8 | 2.8 | 2.5 | 2.2 | **Super Admin stability + UX polish — Pass 1a (ADR-024):** fixed the "Too many requests" user-delete bug at the root (admin rate limit 30→300/hr; bounded single-retry + operator-friendly errors in the API client; User-360/Coaching-360 delete now instant + zero-fetch, status mutations 2 calls→1 via local row-sync); fixed the collapsed-rail logout (first-class icon button); tablet touch targets (primary ≥48px / dense ≥44px); polished empty-state primitive + loading spinner. Zero new functions. UI/UX + one middleware constant (MINOR). The thorough 100% dark mode lands in Pass 1b. |
| 2026-06-12 | 2.12 | 2.7 | 2.8 | 2.5 | 2.2 | **Production-hardening audit remediation (ADR-023):** removed the hardcoded admin email+password from `super-admin-app/js/firebase/auth.js` (CRITICAL — admin authority is now the server `admin:true` claim only; **password must be rotated in Firebase Console + MFA enabled**). Bounded every unbounded admin scan (AI usage, `ai-usage` export, daily `payments` snapshot, `duels-cleanup`, premium broadcast, coaching cascade) so they truncate/paginate instead of OOM/timeout. Accurate active-premium via `count()` aggregations. **Two new composite indexes** `users (plan,planExpiry)` + `users (plan,fcmToken)`. Zero new functions (8/12 super-admin, 6/12 main). Additive Firestore + Security hardening (MINOR). |
| 2026-06-11 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | Initial authoritative Bible established under `/docs/BIBLE/`. Baseline includes audit fixes C1–M8 (see CHANGELOG). |
| 2026-06-11 | 2.0 | 2.0 | 2.0 | 2.0 | 2.0 | **v2 monetization (ADR-009):** single `plan` model; ₹89 lifetime + Premium+ removed; one Premium tier (₹299/6mo, ₹499/12mo) + custom-duration trials. Breaking schema. |
| 2026-06-11 | 2.1 | 2.0 | 2.0 | 2.0 | 2.0 | **Design-system consolidation (ADR-010):** unified card tokens/glass/elevation + premium-feature card + typography/CTA hierarchy documented in TECHNICAL_BIBLE §10A. UI-only (MINOR). |
| 2026-06-11 | 2.2 | 2.0 | 2.0 | 2.0 | 2.0 | **Practice fixed-shell layout (ADR-011):** `--qr-nav-h` nav-height token, app-scroller (`.container`) neutralization for Practice, fixed header + centered single scroll panel, safe-area top/bottom. UI-architecture (MINOR). |
| 2026-06-11 | 2.3 | 2.1 | 2.1 | 2.1 | 2.1 | **Super Admin Control Center — Phase 1 (ADR-012, ADR-013):** unified immutable `auditLogs` (every admin action); GPT token/cost instrumentation (`usage/ai` + `systemMetrics`); revenue accounting (`payments.amount`); pre-aggregated `metrics/latest` via Vercel Cron + Firestore `count()`. Additive (MINOR) across all four engineering tracks; **no data migration** (historical revenue via price-map fallback). |
| 2026-06-11 | 2.4 | 2.2 | 2.2 | 2.2 | 2.1 | **Super Admin Control Center — Phase 2 (ADR-014):** user lifecycle (suspend/restore/archive/purge/reset, Firebase-Auth-disable-enforced), Inactive User Center, soft-delete→30-day-hold→purge cleanup workflow + `cleanup-sweep` cron. Additive (MINOR); no data migration. |
| 2026-06-12 | 2.5 | 2.3 | 2.3 | 2.2 | 2.1 | **Super Admin Control Center — Phase 3 (ADR-015):** AI Operations Center — editable `config/aiBudget` (monthly budget + warn/crit thresholds), month-to-date spend + projection + status from pre-aggregated `systemMetrics`, usage-based abuse flags. Additive (MINOR). |
| 2026-06-12 | 2.6 | 2.4 | 2.3 | 2.2 | 2.1 | **Super Admin Control Center — Phase 4 (ADR-016):** Export Center (authenticated CSV via JSON+Blob; fixes the P2 inactive-export auth gap) + Alert Center (AI budget / expired-premium / stale duels / pending purges, on the Dashboard). Additive (MINOR). |
| 2026-06-12 | 2.7 | 2.5 | 2.3 | 2.2 | 2.1 | **API Consolidation (ADR-017):** domain-based action-routed handlers under the Vercel Free 12-function cap — super-admin 15→8, main-app 12→6 (dead `ai/word-problems` dropped); auth boundaries preserved. Infra-only (MINOR); no schema/data change. |
| 2026-06-12 | 2.11 | 2.7 | 2.7 | 2.4 | 2.2 | **Super Admin V2 — entity-centric 360 consolidation (ADR-022):** all admin workflows consolidated into 5 Centers (User-360, Coaching-360, AI Cost Center, Revenue Center, Operations Center), one owner per capability; SplitView master/detail replaces the overlay drawer + grouped Users list; Inactive merges into a Users filter chip; duplicate pages/metrics/filters/actions removed. New `?action=` branches on existing handlers (users +6, coachings +4, notifications +1 GET, system `revenue-intel` extended) + additive `users.aiThrottle` field + `usage/ai.gptThrottle*` counters — **zero new functions** (super-admin 8/12, main-app 6/12). Per-user AI throttle **enforced end-to-end** (main-app `api/ai.js` → `aiService.enforceAiThrottle`). **Final consolidation:** legacy view files (payments/inactive/security/firestore-ops/exports/notifications/system) + the overlay User-360 drawer DOM **deleted** — no hybrid old/new state remains. Additive (MINOR); no data migration. |
| 2026-06-12 | 2.10 | 2.6 | 2.6 | 2.4 | 2.2 | **Email normalization (ADR-020 update):** new `users.emailLower` (lowercased `email`) written at register + backfilled (`firestore/migrations/2026-06-12-add-emailLower.js`); Global Search email matching is now **case-insensitive** (`orderBy('emailLower')` with a lowercased prefix). Additive Firestore (MINOR); backfill migration (non-breaking); no API/function change. |
| 2026-06-12 | 2.9 | 2.6 | 2.5 | 2.4 | 2.2 | **Super Admin V2 — tablet-first governance rebuild (ADR-019/020/021):** 7-domain IA + admin design system (collapsible rail ≥768px, in-flow SplitView 360, Tabs, Table card-mode, focus-trap modals, `auto-fit` grids, viewport zoom re-enabled) [TECHNICAL_BIBLE §10B]; **Global Search** ecosystem primitive (server-side prefix on users+coachings, `system?action=search`, no client fetch-all); **Emergency Controls** (maintenance / AI-kill / payment-kill `config/*` docs + audited `config-set` + main-app enforcement in aiService/paymentService/boot). Foundation + Command Center pass. Additive (MINOR) across all tracks; **zero new serverless functions** (5 new `system` actions: search/config-get/config-set/revenue-intel/ack-alert); Payment track moves (flow now gated by kill switch); no data migration. |
| 2026-06-12 | 2.8 | 2.5 | 2.4 | 2.3 | 2.1 | **Super Admin Control Center — Phase 5 (ADR-018):** Security Center (new append-only `securityEvents` collection — client-side failed-login/suspicious/admin-login capture with SHA-256 emailHash; admin-read, immutable; + composite index) read via `system?action=security`; Firestore-Ops (`metrics.collectionCounts` daily growth + `system?action=firestore-ops`); Content Management (`questions` CRUD — `update`/`archive`/`delete` + new `updatedAt` field, fixes edit-duplication); unblocked payment-failure-spike + Firestore-growth-spike alerts. Additive Firestore + Security (MINOR); **zero new serverless functions**; no data migration. |

---

## Migration Notes

Migration notes are required for every MAJOR bump and for any change that requires a data
migration script. Format: what changed, who is affected, the migration action, rollback.

### 2026-06-28 — Battle Archive: duelHistory fields + duelStats/summary + indexes (non-breaking, MINOR, ADR-068)
- **What changed:** additive `users/{uid}/duelHistory` fields (`opponentUid, oppAccuracy, challengerUid,
  iChallenged, difficulty, questionCount, myAnswered, durationMs`); a new server-only aggregate doc
  `users/{uid}/duelStats/summary` (`{duelAggregates, rivals{}, achievements{}}`) maintained inside the existing
  `_finalizeTxn` transaction; +3 composite indexes on `duelHistory`; a new `duelStats` deny rule. The ADR-065
  `duelHistory` 50-entry cap (`DUEL_HISTORY_CAP`/`_pruneDuelHistory`) was **removed** (history is now complete +
  paginated).
- **Who is affected:** additive only. Pre-ADR-068 history rows lack the new fields; the Archive defaults them
  (`difficulty`/`opponentUid` absent → that row just doesn't match the difficulty/rivalry filters; `durationMs`/
  `myAnswered` default to 0/—). `duelStats/summary` is absent until a user's first duel finishes; readers default
  the whole view to zeros (empty state). No field renamed/removed; no reader breaks. **Zero users → nothing to
  backfill.**
- **Migration action:** **none — forward-only by design** (pre-launch, zero users). New duels write the extended
  history + the summary. Deploy the 3 new indexes + the updated rules first:
  `firebase deploy --only firestore:indexes,firestore:rules`. (Filtered Archive queries return nothing until the
  indexes finish building.)
- **Rollback:** all schema additions are additive and ignored by older readers; to revert, stop writing them and
  restore the cap/prune (no data cleanup required). The `duelStats` subcollection is server-only, so removing the
  feature leaves orphaned summary docs that are never read.

### 2026-06-13 — Duel V2: new schema, no data migration (ephemeral hard-cutover, ADR-031)
- **What changed:** `duels/{code}` gets a new server-authoritative shape (`schemaVersion:2`, prompts text-only,
  `presence`, `participantUids`, server-written winner/`perPlayer`); new subcollections `duels/{code}/private/key`
  (server-only answers) + `duels/{code}/players/{uid}` (own answers); new `users.activeDuelId` + `users/{uid}/
  duelHistory/{duelId}`. The `/duels` security rules are **rewritten**; one index added.
- **Who is affected:** duels are **ephemeral** (expire within the TTL). No production user state depends on an
  in-flight duel surviving a deploy.
- **Migration action:** **none — hard cutover.** Deploy rules + the new client/endpoint together; legacy in-flight
  `duels` docs (old shape) simply drain/expire — the new client only reads/writes `schemaVersion:2`. No backfill.
  Deploy the new index (`firebase deploy --only firestore:indexes`) and rules
  (`firebase deploy --only firestore:rules`). Set `CRON_SECRET` for the Vercel daily duel-sweep.
- **Rollback:** revert the commit set + redeploy the prior rules; old duels are gone (ephemeral) so there is
  nothing to restore.

### 2026-06-13 — Coaching V4: session-improvement + logoUrl + notes (non-breaking, MINOR, ADR-030)
- **What changed:** three additive schema items — `users.stats.avgSessionImprovementPct` (rolling within-session
  speed-delta %) + optional `practiceSessions.{firstHalfAvg,secondHalfAvg,sessionImprovementPct,timedCount}`
  (the "Session Improvement" bridge); optional `coachings.logoUrl` (institute logo URL); and a new
  `coachings/{id}/notes/{studentUid}` subcollection (one plain-text coaching note per student, Admin-SDK only).
- **Who is affected:** additive only. Existing user docs lack `avgSessionImprovementPct` until a ≥6-question
  session completes; all readers default it to `null`/0. Pre-ADR-030 `practiceSessions` lack the half-avg fields
  (readers treat them as "no session-improvement data"). `logoUrl`/notes are absent until set. No field renamed
  or removed; no reader breaks.
- **Migration action:** **none — no backfill by design** (honest data only). `avgSessionImprovementPct` accrues
  from 2026-06-13 forward as students finish timed sessions; `logoUrl`/notes are set on demand. Deploy the
  updated rules (`firebase deploy --only firestore:rules`) for the explicit `notes` deny. **No new index**
  (the note is read by doc id; `avgSessionImprovementPct` is read off already-scanned user docs, not queried).
- **Rollback:** all three are additive and ignored by older readers; to revert, stop writing them (no data
  cleanup required). The notes subcollection is server-only, so removing the feature leaves orphaned notes that
  are never read.

### 2026-06-13 — `stats.lastActiveMs` backfill (non-breaking, MINOR, ADR-029)
- **What changed:** added a sortable epoch-ms `users.stats.lastActiveMs` (written by `progress.js` going
  forward) because `stats.lastActiveDate` (a `toDateString`) sorts lexically by weekday, breaking the coaching
  roster order/pagination and making the super-admin inactive `< cutoff` range query never match.
- **Who is affected:** additive — existing docs lack the field until backfilled; the coaching roster + inactive
  queries (which now `orderBy/where` on `lastActiveMs`) skip un-backfilled docs until the migration runs.
  In-memory readers still use `lastActiveDate` (tolerant). No field renamed/removed.
- **Migration action:** **run `firestore/migrations/2026-06-13-add-lastActiveMs.js` (dry-run, then `--apply`)**
  — idempotent; sets `lastActiveMs = Date.parse(lastActiveDate)` (fallback `updatedAt`) where missing. Deploy
  the updated index + rules first (`firebase deploy --only firestore:indexes,firestore:rules`).
- **Rollback:** the field is additive; to revert, switch the queries back to `lastActiveDate` (not recommended —
  it never sorted correctly). No data cleanup needed.

### 2026-06-13 — Analytics Foundation: `dailyHistory` widening + `coachingMetrics` (non-breaking, MINOR, ADR-027)
- **What changed:** `users/{uid}.stats.dailyHistory[date]` gains `{sumTimes, count}` alongside the existing
  `{attempted, correct}` (per-day avg speed = `sumTimes/count`); new per-coaching daily rollup collection
  `coachingMetrics/{coachingId}`; 3 composite `users(coachingId,·)` indexes; `practiceSessions` now written.
- **Who is affected:** additive only. Existing day records lack `sumTimes/count`; **all readers default them
  to 0**, so no reader breaks. No field is renamed or removed.
- **Migration action:** **none — no backfill by design** (honesty rule: real history only). New keys accrue
  from 2026-06-13 forward as students practice; `coachingMetrics` rows accrue as the daily cron runs. Deploy
  the 3 new indexes (`firebase deploy --only firestore:indexes`) and the updated rules
  (`firebase deploy --only firestore:rules`). Speed-trend UI stays in a "collecting data" state until ≥7/≥30
  days exist.
- **Rollback:** the new keys/collection are additive and ignored by older readers; to revert, stop writing
  them (no data cleanup required).

### 2026-06-11 — v2.0 MAJOR (monetization, ADR-009)
- **What changed (breaking):** entitlement schema replaced. New canonical fields on `users/{uid}`:
  `plan ('free'|'premium')`, `planType ('premium_6m'|'premium_12m'|null)`, `planExpiry`, `planSource`,
  `planUpdatedAt` (+ retained `isTrial`, `trialEnd`). **Removed:** `isPremium, hasPaid, isEarlyUser,
  isPremiumPlus, premiumPlusPlan, premiumPlusExpiry, premiumPlusStatus, lastPremiumPlusPaymentId`.
  Plan keys `premium`/`plus_6month`/`plus_yearly` → `premium_6m`/`premium_12m`. JWT claim
  `{premium, premiumPlus}` → `{premium}`. `req.userPremiumPlus` removed.
- **Who is affected:** all three apps, functions, rules, and every user doc. **Zero production users**
  → no grandfathering; pre-launch normalization only.
- **Migration action:** run `firestore/migrations/2026-06-11-v2-plan-schema.js` (dry-run, then
  `--apply`) to normalize any dev/test docs and delete removed fields. Deploy rules
  (`firebase deploy --only firestore:rules`). Deploy app code via Vercel and functions via
  `firebase deploy --only functions`.
- **Rollback:** revert the v2 commit set and redeploy; the migration is forward-only (re-deriving v1
  dual-tier state from `plan` is not supported — restore from backup if needed). Acceptable because
  there are no production users.
- **Supersedes:** `2026-06-11-normalize-premiumPlusPlan.js` (historical; the `premiumPlusPlan` field
  it normalized no longer exists).

### 2026-06-12 — `emailLower` backfill (non-breaking, MINOR)
- **What changed:** added `users.emailLower` (lowercased `email`) so Global Search can match email
  case-insensitively. Written at register going forward; the search email sub-query now uses `emailLower`.
- **Who is affected:** existing `users` docs lack the field until backfilled; until then, email search falls back
  to a miss for those docs (uid / name / coachingId still match) — no functional breakage.
- **Migration action:** run `firestore/migrations/2026-06-12-add-emailLower.js` (dry-run, then `--apply`). It
  pages all users and sets `emailLower = (email||'').toLowerCase()` where missing or stale (batched ≤400/commit).
  Idempotent and safe to re-run. No rules/index change (single-field auto-index covers the prefix query).
- **Status:** ✅ **Applied 2026-06-12** to `quant-reflex-trainer` — scanned 12, updated 12, alreadyOk 0, noEmail 0;
  re-run confirms idempotent (updated 0 / alreadyOk 12). Firestore rules + indexes also (re)deployed the same day
  (`firebase deploy --only firestore:rules,firestore:indexes` — rules compiled + released, indexes deployed, no
  index deletions).
- **Rollback:** none needed; the field is additive and unused by older readers. To remove, delete the field via
  a follow-up script — but there is no reason to.

### 2026-06-11 — Baseline (no MAJOR; recorded for completeness)
- **Firestore data migrations shipped (not schema-breaking):**
  - `firestore/migrations/2026-06-11-normalize-premiumPlusPlan.js` — normalizes legacy
    `premiumPlusPlan` values (`yearly`/`6_months` → `plus_*`). Applied; 0 legacy docs found.
  - `firestore/migrations/2026-06-11-reconcile-studentCount.js` — recomputes canonical
    `coachings.studentCount`, drops legacy `studentsCount`. Applied; 2 coachings corrected.
- **Index change (deployed):** `entitlementLogs` index → `COLLECTION_GROUP` (`adminId`,`timestamp`);
  old `COLLECTION` (`uid`,`timestamp`) index deleted via `--force`.
- **Rollback:** re-add the old index to `firestore.indexes.json` and redeploy; the migrations are
  idempotent and safe to re-run.
