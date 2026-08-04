# QuantReflex — Google Play Billing Readiness Register (ADR-139 → ADR-140)

**Status:** Implementation gate passed — **READY FOR IMPLEMENTATION** (see §A1).
**No Play Billing code has been written.**
**Architectural source of truth:** the Phase 4 blueprint in `QuantReflex-Stabilization-Plan.md`
(§1–§21). This register does not restate it; it certifies the foundation the blueprint assumes and
lists what would obstruct an integrator starting WS1.

**Verdict: the architecture is ready. One Critical live vulnerability was found and fixed; the
blueprint itself carries two Critical documentation defects that would misdirect the integrator.**

---

## A. The blueprint's central bet — VERIFIED TRUE

The whole design rests on one claim: *`activatePremium` is already provider-neutral, so Play is just a
second adapter feeding the same grant path.* Measured:

| Claim | Evidence | Verdict |
|---|---|---|
| Grant path takes no provider-specific input | `aiService.js:188` — `activatePremium(uid, planType, paymentId, orderId)` | ✅ `paymentId` is purely an idempotency key |
| No Razorpay leakage into the grant path | Only occurrence in `aiService.js` is a **comment** (`:207`) | ✅ |
| Razorpay is contained | 4 files only: `paywall.js`, `services/paymentService.js`, `api/payment.js`, `api/payment/webhook.js` — exactly the WS4/WS5 surface | ✅ zero leakage into entitlement, gating or non-paywall UI |
| Only sanctioned paths grant premium | `plan:'premium'` written only by `aiService.js:221,258` (purchase) and `super-admin/api/admin/entitlements.js` (admin/trial). Every other `planExpiry: null` write is paired with `plan:'free'` — the revoke/default direction | ✅ |
| Admin grants are finite | `entitlements.js:99,104` route through `entitlement.stackExpiry(...)` | ✅ no path writes premium + null expiry |
| One entitlement rule everywhere | All four `entitlement-core.js` mirrors byte-identical (`md5 eab2e3ee8d56`): main-app/data, super-admin/api/_lib, super-admin/js, functions — guarded by `entitlement-parity.check.js` | ✅ |
| Client cannot self-grant | `firestore.rules:88` — `plan` may only be set to `'free'`; nullable plan fields clear-only | ✅ downgrade-only |

**Conclusion:** Play Billing can be added as specified without touching entitlement resolution, the 57
gate sites, or the schema beyond the additive fields in §10.

---

## A1 · FINAL GATE (ADR-140) — verdict: **READY FOR IMPLEMENTATION**

Re-certified at the implementation gate, with the rules deploy in progress and ₹299/₹399 confirmed
canonical. One new Medium finding, fixed; no architectural blocker remains.

**F-1 · `users/{uid}/entitlementLogs` was client-writable and client-deletable — Medium · FIXED.**
`firestore.rules:194` granted the owner blanket write over `users/{uid}/{subcollection}/{doc}`,
excluding only `duelHistory`, `duelStats`, `aiEvents` and `notifications`. `entitlementLogs` — the
per-user audit trail of every grant, trial and revoke (`super-admin/api/admin/entitlements.js:140`,
read by the admin UI at `users.js:110`) — was not excluded and had no explicit match. An owner could
**erase the record of their own revoke or forge a grant entry**.

Not Critical, because it could not grant premium: plan fields are root-level, downgrade-only and
server-owned (ADR-130), and the authoritative copy always survived in the immutable root `auditLogs`
(`_lib/audit.js:40`, written alongside at `entitlements.js:172` — confirming §6's "logged to both").
But refund, chargeback and Play voided-purchase disputes are investigated through exactly this
per-user history, so a forgeable copy misleads the investigator — which is why it is closed *before*
WS2 makes it evidence. Fixed by the same carve-out pattern already used for `duelHistory`/`aiEvents`,
plus an explicit read-only match, guarded by two new `entitlement-invariants` assertions (38 → 40)
proven to fail on the pre-fix rule.

**Verified clean at this gate:**

| Area | Evidence |
|---|---|
| Pricing | 4 code sites + `PLANS` at ₹299/₹399; `index.html` and all 3 locales contain **zero** price literals; only the documented historical fallback differs |
| Provider neutrality | **108** entitlement call sites, **zero** provider-aware; `activatePremium` has no provider concept; Razorpay confined to 4 files |
| `planSource` | `'purchase'` is gateway-agnostic; only `'coaching'` is behaviourally special |
| No duplicate purchase | server-side `req.userPremium` block (`api/payment.js:38`), comment already names Google Play |
| Rules | `payments` read-only to clients; `auditLogs` write-denied; plan fields downgrade-only; every non-denied delete/write swept |
| Data model | Play needs **additive fields only** — zero migration |

---

## A2 · DEPLOYMENT STATE — the fix is NOT live · **Critical, operational**

**The P0-1 rules fix is committed but not deployed, and it is not the only one.**

`.github/workflows/firebase-deploy.yml` is `workflow_dispatch` only — there is no `push:` trigger, so
merging to `main` never deploys rules. Measured from the Actions history: the last successful
**Firebase Deploy was 2026-07-06** (`e4586d1f`). Three commits have touched `firestore/rules/` since:

| Commit | Date | What is undeployed |
|---|---|---|
| `e58b774` | 2026-07-09 | rules touched during i18n Phase G |
| `b67af6b` | 2026-08-01 | **ADR-130 part 2 — "enforce server-owned entitlement fields by construction"** |
| `9c8470b` | 2026-08-04 | **ADR-139 P0-1 — the payments-delete fix** |

So production is running rules from ~2026-07-06: the entitlement-inflation hole is **live right now**,
and ADR-130's entitlement-field hardening has never taken effect either. Committing a rules fix is not
shipping it.

**Action (before anything else):** run the *Firebase Deploy* workflow with the default targets
(`firestore,functions:cleanupExpiredDuels`), then confirm in the Firebase console that the payments
block reads `allow read` only. Everything else in this register can wait; this cannot.

## A3 · Governance gap that caused the documentation drift · **Medium**

Commit `b4481a0` (2026-07-22) lowered prices ₹349/₹499 → ₹299/₹399 across all four code sites and the
three locales — but shipped with **no ADR, no CHANGELOG entry and no Payment Version bump**, which
`PAYMENT_ARCHITECTURE.md`'s own change-control clause requires for any plan-config change. With no ADR
to propagate, four current-state docs kept quoting the old price for ~2 weeks:
`TECHNICAL_BIBLE.md:19`, `PRODUCT_AUDIT.md:110`, `ENTITLEMENT_SYSTEM.md:14` (a pricing **table**), and
the same file's resolution rule. **All corrected in this pass**, and `payment-parity.check.js` now
scans current-state docs for retired price points (25 → 26 assertions, proven to fail on a reverted
line). History files are deliberately excluded — they must stay period-accurate.

This matters for Play because the blueprint's Play Console setup reads its product prices from prose.

## A4 · No `payments` composite indexes · **Medium — RESOLVED in ADR-141 (WS2)**

> **Status 2026-08-04 (ADR-141):** declared. `firestore/indexes/firestore.indexes.json` now carries
> `payments [uid, status, claimedAt]`, `payments [status, claimedAt]` and
> `paymentOrphans [status, createdAt]`. `entitlement-invariants.check.js` asserts the first one exists,
> so it cannot be dropped silently. The WS6 `[provider, acknowledged]` reconcile index is deliberately
> **not** declared yet — the field does not exist until Play code lands (PR-2). The original finding is
> preserved below.

## A4 (original) · No `payments` composite indexes · **Medium — needed by WS2, not before**

`firestore/indexes/firestore.indexes.json` declares 32 indexes, **none on `payments`**. Nothing today
needs one (`api/account.js:157` deletes by single-field `uid`, which Firestore auto-indexes). But the
blueprint's WS2/WS6 queries do:

- §9.4 `revokePayment` — the uid's non-refunded `'paid'` docs in `claimedAt` order ⇒ `[uid, status, claimedAt]`
- §9.3 reconcile — `acknowledged:false` sweep ⇒ `[provider, acknowledged]`
- §9.3 stale-pending sweep ⇒ `[status, claimedAt]`

Declare them with WS2. A missing composite index fails at runtime *only* under the rare, high-stakes
condition (a refund) — the worst time to discover it.

## B. Blockers

### 🔴 P0-1 · `payments/{id}` was client-deletable — unbounded premium self-grant · **FIXED**

The idempotency lock could be erased by its owner, and erasing it converts a replay into a fresh,
*stacking* grant.

1. `firestore.rules` granted the owner `delete` on `payments/{paymentId}`.
2. `?action=verify` has no recency or one-time-use check — `aiService.js:208` states this outright —
   and a Razorpay order stays `status:'paid'` permanently, so an old
   `(orderId, paymentId, signature)` triple is replayable forever.
3. `activatePremium`'s only replay defence is `if (paymentDoc.exists)` (`aiService.js:201`).
4. Lock absent ⇒ the NEW-grant branch runs `stackExpiry(current expiry, days)` (`:252`), extending
   from the user's **current** expiry — a full +182/+365 days.

**Exploit:** buy once → delete the doc via the client Firestore SDK → re-POST the same triple → repeat
without limit. **Fix:** `allow read` only; `create, update, delete: if false`. The permission bought no
feature — no client code calls delete (grep-verified) and account deletion purges payments server-side
via the Admin SDK (`api/account.js:157`), which bypasses rules. Regression-guarded by two new
assertions in `entitlement-invariants.check.js` (36→38), proven to fail on the pre-fix rule.

**Why it matters doubly for Play:** the Play lock is `gp_<sha256(purchaseToken)>` and blueprint §12
asserts "same token can never grant twice". That claim was false while the doc was erasable —
`listPurchases()` re-supplies the token after a delete.

### 🔴 P0-2 · Blueprint would create Play products at the WRONG PRICE · *documentation*

§2.1, §4, §16 and the ops **Prerequisites** all say ₹349/₹499. Shipped code sells **₹299/₹399**
(`services/paymentService.js:21-22`; `shared/constants/entitlements.js:65-66`). The Prerequisites line
is an instruction a human executes in Play Console *before any code runs*; following it makes the TWA
charge ₹50–₹100 more than web for the same product, breaking §14's "same price for product coherence".
Play prices are painful to correct post-launch and existing purchasers are grandfathered.
**Action:** correct the blueprint before WS7 ops setup. No code change.

### 🔴 P0-3 · Blueprint's entitlement rule is superseded · *documentation*

§2.2 and §11 state `premium ⟺ plan==='premium' && (planExpiry==null || planExpiry>now)`, and §11 is
headed "**UNCHANGED (by design)**". Wave S1 / ADR-115 changed exactly this rule:
`data/entitlement-core.js:86` — `if (!(expiryMs > 0)) return false;` (no permanent tier; absent or
invalid expiry ⇒ NOT premium). `PAYMENT_ARCHITECTURE.md` §2/§7 carry the same stale text — **corrected
in this pass**.

An integrator following §11 verbatim would treat `planExpiry: null` as "indefinite" and silently grant
nobody premium. It also constrains §9.4's `revokePayment` ledger replay: its "revert to free" branch
must write `plan:'free'`, never a null expiry meaning indefinite.

### ✅ P1-1 · Refunded-purchase re-grant · **FIXED in ADR-141 (WS2, PR-1)**

> **Resolved 2026-08-04.** `payments/{id}.status` is now a lifecycle; a terminal status
> (`refunded`/`revoked`/`chargeback`) refuses the grant with **zero writes** and a typed
> `PAYMENT_REFUNDED`. `refund.processed` is handled, `aiService.revokePayment` + the pure
> `services/entitlementLedger.js` ship as designed, and a refund arriving before its capture writes a
> tombstone so the late grant is refused too. Proven by execution — `payment-refund.check.js` T6/T11 —
> and proven load-bearing: deleting the guard fails 6 assertions. Also closed the wider hole the
> original finding understates: the re-grant was reachable not only via a webhook retry but via
> `?action=verify`, which has no recency check, so a user could re-submit their own refunded
> `(orderId, paymentId, signature)` triple indefinitely. The original finding is preserved below.

### 🟠 P1-1 (original) · Refunded-purchase re-grant is live today · *blueprint W1/§9.4, WS2*

`activatePremium` guards only cross-uid replay; there is no `status:'refunded'` check although
`status:'paid'` is written (`aiService.js:254`). Today refunds are manual super-admin revokes, so an
admin revoke followed by a late `payment.captured` webhook retry re-grants premium. Narrow now
(bounded retries, no refund path), but the blueprint is explicit that **WS2 ships before any Play
code** — this is why. Not fixed here: the fix is `revokePayment` + the pure `entitlementLedger.js`
module, which is WS2's designed scope, not a certification patch.

### 🟠 P1-2 · Platform detection is TWA-blind · *blueprint §2.3/§6, WS1*

Three independent detectors survive — `js/app.js:28`, `js/duel-manager.js:39`,
`js/services/report-context.js:52`. A TWA matches `display-mode: standalone`, so it classifies as
`pwa-mode` **and would be offered Razorpay** — the one unrecoverable Play-policy violation. Blocks any
Play work; WS1 exists precisely for this.

### 🟡 P2-1 · Restore is still dead code · *W2, WS3*
`firestore-sync.js:1503` `refreshFromServer` — zero callers. Required for Play device-switch UX.

### 🟡 P2-2 · Ledger amount is reconstructed, not recorded · *W4*
`aiService.js:254` writes `amount` from the local price map, not the gateway-reported captured amount.
Revenue is inferred. Compounds with Play, where list prices are tax-inclusive gross.

### 🟡 P2-3 · No assetlinks plumbing · *WS7*
No `main-app/.well-known/`; `vercel.json:3` rewrite is still `/((?!api/).*)`, which would swallow
`/.well-known/assetlinks.json`.

### 🟢 P3 · Accepted / deferred, unchanged
W6 mid-session entitlement cache · W7 write-only JWT claim · W8 `usage/ai` owner-writable ·
W9 offline clock-rewind. All documented in the blueprint; none blocks Play Billing.

---

## C. Blueprint items already closed by Waves S1–S3

| Item | State |
|---|---|
| W3 webhook orphan → `paymentOrphans` | **CLOSED** — `api/payment/webhook.js:159` |
| W5 price/duration parity ×4 | **CLOSED** — `payment-parity.check.js`, in `npm test` |
| Entitlement canonicalization + no-permanent-tier | **CLOSED** — ADR-115/117 |
| Vercel function budget | **10 of 12** measured (§2.4's "8" is stale; §9.1's "10" correct). RTDN as #11 fits with one spare |
| W1 refunded-purchase re-grant | **CLOSED** — ADR-141 (PR-1/WS2); terminal `status` refuses the grant with zero writes |
| W4 gateway-reported amount | **CLOSED** — ADR-141; the row records the gateway's captured amount, tagged `amountSource` |
| §9.4 revoke + purchase ledger | **CLOSED** — ADR-141; `aiService.revokePayment` + pure `services/entitlementLedger.js` |
| A4 `payments` composite indexes | **CLOSED** — ADR-141; `[uid, status, claimedAt]` + `[status, claimedAt]`, asserted by `entitlement-invariants` |

---

## D. Sequencing recommendation

The blueprint's WS order stands, with P0-2 and P0-3 corrected in the document **first** — they are
consumed by humans (Play Console setup, and any engineer reading §11) before code exists.

`Correct blueprint (P0-2, P0-3)` → ~~`WS2 refund/ledger (P1-1)`~~ **← DONE, ADR-141 (PR-1)** →
`WS1 platform truth (P1-2)` → `WS3 restore` → `WS4 facade` → `WS5 verify-play` → `WS6 RTDN` →
`WS7 wrapper` → `WS8 rollout`.

P0-1 is already fixed and needs no workstream. **WS7/WS8 are blocked on ops, not code** — they need a
real Play Console application and a real Play App Signing certificate, so no `assetlinks.json`, no
signing fingerprint and no Play-dependent production config exists in this repo by design.

---

## E. Implementation roadmap (ADR-140)

**Prerequisites (ops, before WS5–WS7):** Play Console account · final package name · Play App Signing ·
two managed products at **₹299/₹399** (not the ₹349/₹499 the blueprint's Prerequisites still say) ·
`FIREBASE_SERVICE_ACCOUNT` invited with finance + order-management · androidpublisher API enabled ·
Pub/Sub topic (resolve the Spark-plan question first) · `GOOGLE_PLAY_PACKAGE_NAME` on Vercel.

| Order | Workstream | Why here | Risk | Rollback |
|---|---|---|---|---|
| 0 | **F-1 rules fix + deploy** | one word; must precede WS2 making the audit log dispute evidence | Low | revert rule, redeploy |
| 1 | **WS2** refund symmetry + ledger hardening | repairs the **live** P1-1 re-grant, protects both providers; blueprint mandates it before any Play code | Med | pure module + tombstone are additive; revert commit |
| 2 | **WS1** platform truth (`platform.js`) | P1-2 is policy-fatal; everything downstream keys off correct detection | Low | one new module + 3 delegations |
| 3 | **WS3** restore + live entitlement | small, independent, improves the web channel today | Low | remove the CTA |
| 4 | **WS4** client facade | behaviour-preserving Razorpay extraction; gate with px-diff + paywall certs | Med | revert to direct `openPremiumPayment` |
| 5 | **WS5** server `verify-play` | needs WS1 (detection) + WS2 (guards); folds into `payment.js`, no new function | Med | `config/playBilling` off ⇒ reader mode |
| 6 | **WS6** RTDN + reconcile | function #11 of 12; **gate on Pub/Sub availability first** | Med | degraded = reconcile-only, ≤24h refund lag |
| 7 | **WS7** TWA wrapper + assetlinks | last; needs the origin serving `.well-known` | Med | halt staged rollout, previous AAB |
| 8 | **WS8** rollout + governance | dashboards, docs, ADRs, Payment Version 3.0 | Low | — |

**Sequencing rationale.** WS2 leads because it fixes a defect that is live *today* and because its
`activatePremium` status guards protect both providers — shipping Play code first would double the
surface of a known re-grant bug. WS1 is second because showing Razorpay inside a Play-distributed
build is the one unrecoverable policy violation, and every later workstream keys off correct platform
detection.

---

## F · WS7 handoff — the real values that must be supplied after the Play Console app exists

**Nothing in this section can be created in the repository first, and none of it has been.** WS7 needs
a real Play Console application and a real Play App Signing certificate. Scaffolding it with invented
values is worse than leaving it empty: a fabricated `assetlinks.json` or placeholder fingerprint
**verifies successfully against nothing**, so the TWA silently falls back to a Chrome Custom Tab —
showing the URL bar, and (because the fallback is a normal browser tab) offering Razorpay inside what
users experience as the Play app. That is the unrecoverable policy violation, arrived at through a
file that looked correct in review. So this is a checklist, not a stub.

### Ops — must exist before any of the below can be filled in

| # | Item | Where it comes from | Consumed by |
|---|---|---|---|
| 1 | **Final package name** (e.g. `com.quantreflex.app`) — immutable once published | your decision, before first upload | `assetlinks.json`, `GOOGLE_PLAY_PACKAGE_NAME`, TWA manifest |
| 2 | **Play App Signing SHA-256 fingerprint** | Play Console → Setup → App integrity → *App signing key certificate*. **Not** your upload key — Play re-signs, so the upload key's fingerprint will fail verification | `assetlinks.json` |
| 3 | **Two managed products** (one-time, **not** subscriptions) at **₹299** and **₹399** | Play Console → Monetise → In-app products. Product ids must equal the `planType` values `premium_6m` / `premium_12m`, or WS5's server-side allowlist rejects them | Play Billing, WS5 allowlist |
| 4 | **Service-account invitation** | Play Console → Users and permissions → invite the `FIREBASE_SERVICE_ACCOUNT` email with *View financial data* + *Manage orders and subscriptions* | WS5 `androidpublisher` calls |
| 5 | **`androidpublisher` API enabled** | Google Cloud console, same project as the service account | WS5 |
| 6 | **Pub/Sub topic + push subscription** to `/api/payment/play-rtdn`, and the topic name entered in Play Console → Monetisation setup | **Resolve the Spark-plan question first** — if Pub/Sub is unavailable, WS6 degrades to reconcile-only with a ≤24h refund lag, which is a decision, not a bug | WS6 |
| 7 | **`GOOGLE_PLAY_PACKAGE_NAME`** on Vercel (all environments) | item 1 | WS5 pins it server-side so a token from another app cannot be redeemed |

### Repo work that unblocks the moment 1–2 land

- `public/.well-known/assetlinks.json` — `{relation:["delegate_permission/common.handle_all_urls"], target:{namespace:"android_app", package_name:<1>, sha256_cert_fingerprints:[<2>]}}`, plus the Vercel rewrite that serves it at the domain root **without** the SPA catch-all swallowing it. Verify with Google's Statement List Tester **before** the first internal-test upload.
- `manifest.json` → `related_applications` + `prefer_related_applications`.
- The `android/` TWA wrapper project itself.

### Two things to check that are easy to miss

- The TWA's `start_url` must carry **`?src=play`** — it is one of the three signals
  `QRPlatform.isPlayDistribution()` reads, and the only one that survives the launch referrer being
  dropped after the first in-app navigation.
- **Verify on a real device before release** that `document.body` carries `twa-mode`. Everything that
  suppresses Razorpay in the Play build keys off that class. It is one line to check and the single
  highest-value pre-release test in this list.
