# QuantReflex — Google Play Billing Readiness Register (ADR-139)

**Status:** Pre-implementation certification. **No Play Billing code was written.**
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

### 🟠 P1-1 · Refunded-purchase re-grant is live today · *blueprint W1/§9.4, WS2*

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

---

## D. Sequencing recommendation

The blueprint's WS order stands, with P0-2 and P0-3 corrected in the document **first** — they are
consumed by humans (Play Console setup, and any engineer reading §11) before code exists.

`Correct blueprint (P0-2, P0-3)` → `WS2 refund/ledger (P1-1)` → `WS1 platform truth (P1-2)` →
`WS3 restore` → `WS4 facade` → `WS5 verify-play` → `WS6 RTDN` → `WS7 wrapper` → `WS8 rollout`.

P0-1 is already fixed and needs no workstream.
