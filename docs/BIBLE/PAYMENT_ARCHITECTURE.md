# QuantReflex Payment Architecture

**Doc Version:** 2.3 · **Payment Version:** 2.4 (see [VERSIONS.md](VERSIONS.md))
**Status:** Source of Truth for payments, plans, entitlement grants, and idempotency.
**Gateway:** Razorpay (one-time Orders API — no subscriptions/auto-renewal).
**Last updated:** 2026-06-24
**Change control:** Any change to payment flow, plan config, entitlement grant logic, or
signature/idempotency handling follows [GOVERNANCE.md](GOVERNANCE.md), updates this document +
[CHANGELOG.md](CHANGELOG.md), and bumps the Payment Version in [VERSIONS.md](VERSIONS.md).

Companion: [README.md](README.md) · [TECHNICAL_BIBLE.md](TECHNICAL_BIBLE.md) · [FIRESTORE_BLUEPRINT.md](FIRESTORE_BLUEPRINT.md) · [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md)

---

## 1. Plans (canonical — `paymentService.PLAN_CONFIG`)

| Plan key | Price | Duration | Grants |
|---|---|---|---|
| `premium_6m` | ₹299 (29900 paise) | 182 days | `plan:'premium'` |
| `premium_12m` | ₹399 (39900 paise) | 365 days | `plan:'premium'` |

**One Premium tier, two durations.** There is no lifetime plan and no second "plus" tier — Premium
includes everything (all training features + the full AI suite + Math Duel). 12-month is the default
selection in the paywall and carries the **BEST VALUE** badge (≈₹42/mo vs ≈₹58/mo — "Save 28%").

## 2. Entitlement model (v2)

Access resolves entirely through `plan` on `users/{uid}`:
```
premium ⟺ plan === 'premium' && planExpiry parses to a real, FUTURE timestamp
```
> **Corrected in ADR-139.** This section previously read
> `plan === 'premium' && (planExpiry == null || planExpiry > now)` — i.e. a null expiry granted
> premium indefinitely. **Wave S1 / ADR-115 removed the permanent tier**: an absent, null or
> unparseable expiry now resolves to **NOT premium**, fail-safe
> (`main-app/data/entitlement-core.js:86` — `if (!(expiryMs > 0)) return false;`). Every legitimate
> grant (purchase 6m/12m, admin 6m/12m, finite trial) writes a finite expiry, so a `premium` doc
> without one is illegitimate data rather than a licence. The stale text mattered because it is what
> a Play Billing integrator would read: writing `planExpiry: null` to mean "active" would silently
> grant nobody premium. `planExpiry: null` remains correct **only** paired with `plan:'free'` — the
> revoke/default direction (`revokeFields()`).
Fields: `plan`, `planType`, `planExpiry`, `planSource`, `isTrial`, `trialEnd`, `planUpdatedAt`,
`lastPaymentId` (see [FIRESTORE_BLUEPRINT.md](FIRESTORE_BLUEPRINT.md)). A **trial** is `plan:'premium'`
with `planSource:'trial'`, `isTrial:true`, `trialEnd === planExpiry` — so it passes the same gate as a
paid plan. Expiry self-heals to free on read (server `aiService.resolvePlan`, client
`getAccessState`/`_enforcePremiumExpiry`) and is swept by the `enforceEntitlementExpiry` function.

Free tier: 20 questions/day, 5 lifetime-total AI explanation credits.

## 3. Purchase Flow (happy path)

```
Client (paywall.js)
  openPremiumPayment(planType)                         planType ∈ {premium_6m, premium_12m}
   └─ POST /api/payment?action=create-order { plan: planType }     (withAuth)
        paymentService.createOrder → Razorpay order (notes:{plan,uid})
   └─ Razorpay checkout sheet (client, RAZORPAY_LIVE_KEY)
   └─ POST /api/payment?action=verify { orderId, paymentId, signature }  (withAuth)
        1. paymentService.verifyPaymentSignature   (HMAC-SHA256, timingSafeEqual)
        2. paymentService.fetchOrder(orderId)       → asserts status==='paid'; reads notes.plan + notes.uid
        3. assert order.notes.uid === req.userId    → else 403 PAYMENT_OWNER_MISMATCH
        4. aiService.activatePremium(uid, planType, paymentId, orderId)
        5. claimsService.setEntitlementClaims(uid, { premium: true })
   └─ client force-refreshes ID token; FirestoreSync.activatePremium updates the local cache (display only)
```

## 4. Webhook (safety net) — `POST /api/payment/webhook`

Razorpay calls server-to-server regardless of client state. Raw body HMAC verified via
`RAZORPAY_WEBHOOK_SECRET`. `payment.captured` → `aiService.activatePremium(uid, plan, paymentId,
orderId)` (uid/plan from order notes, refetched if missing) + single `{premium:true}` claim. Returns
**500** on transient grant failure (Razorpay retries), **200** on replay/ignored events.

## 5. Idempotency & Replay Protection

`activatePremium` runs a Firestore **transaction** on `payments/{paymentId}`:
- if the lock exists for the **same** uid (verify + webhook both fire) → re-apply safely;
- if it exists for a **different** uid → throw `PAYMENT_REPLAY` (blocks cross-account reuse);
- else create the lock + grant. `verify.js` additionally binds the order to the caller
  (`order.notes.uid === req.userId`).

## 6. Admin grants (super-admin app, owner-only)

`super-admin-app/api/admin/entitlements.js` actions (write via Admin SDK, audit-logged to **both**
`users/{uid}/entitlementLogs` (per-user) **and** the root immutable `auditLogs` (platform-wide; see
[SECURITY_ARCHITECTURE.md §5.2](SECURITY_ARCHITECTURE.md)), chunked ≤200/batch):

| Action | Effect |
|---|---|
| `premium_6m` / `premium_12m` | plan:premium, planType, planExpiry=+182/+365d, planSource:'admin', isTrial:false |
| `trial` (custom `trialDays`) | plan:premium, planType:null, planExpiry=+trialDays, planSource:'trial', isTrial:true, trialEnd=+trialDays |
| `revoke` | plan:free + all plan/trial fields nulled/false |

UI: `super-admin-app/js/views/users.js` (individual + bulk) — Grant Premium (6/12 Months), a
trial-days input + Grant Trial, and Revoke.

## 7. Expiry Enforcement

- **Live (authoritative):** `resolvePlan` reverts expired premium/trials to free on any access.
- **Sweep:** `enforceEntitlementExpiry` (every 6h) reverts `plan:'premium'` docs whose `planExpiry`
  is past → free. **ADR-139 correction:** this line previously read "`planExpiry:null` (indefinite
  admin grant) is never auto-expired". There is no indefinite grant — admin actions are 6m/12m/trial/
  revoke only (`entitlement-invariants.check.js` asserts it), and a null expiry resolves to NOT
  premium rather than to a permanent licence, so nothing needs sweeping.
- **Clock-skew defense:** client uses `serverTimestamp()`-anchored `updatedAt`; a device clock >5 min
  behind server uses server time, preventing both rewind-exploits and false lockouts.

## 8. Client Entry Points (`paywall.js`)

| Function | Notes |
|---|---|
| `showPaywall(featureType)` | product-grade modal: hero, value cards, FREE/PREMIUM comparison matrix, 6m/12m selector (12m default + BEST VALUE), CTA "Start Premium", trust builders, footer. |
| `openPremiumPayment(planType, userId)` | single payment function; guards against double-submit, safety timeout, slow-payment text, attempt-id for stale callbacks. |

Trust builders use honest wording for one-time orders (✓ Secure Payments · ✓ Instant Activation ·
✓ No Auto-Renewal · ✓ Restore Access · ✓ Trusted by Students) — "Restore Access" re-syncs entitlement
from the server.

## 9. Env Vars

`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `FIREBASE_SERVICE_ACCOUNT`
(server-only). Client uses the live **key-id** only. See [SECURITY_ARCHITECTURE.md §7](SECURITY_ARCHITECTURE.md).

## 10. History
v1 had a ₹89 lifetime tier (`isPremium`) + a ₹299/₹499 "Premium+" tier (`isPremiumPlus`). v2
(2026-06-11) removed lifetime and collapsed to the single Premium tier above. See
[DECISION_LOG.md](DECISION_LOG.md) ADR-009 and the v2 migration `firestore/migrations/2026-06-11-v2-plan-schema.js`.

## 11. Revenue Accounting (Super Admin Phase 1, 2026-06-11)

Every Premium grant writes `payments/{paymentId}` with `amount` (price in **paise**, int) and `status:'paid'`.
The revenue rollup (the Vercel-Cron `daily-snapshot` + the admin dashboard) **sums `amount`**; for
**historical** docs written before this change (no `amount`), it falls back to the canonical plan→price map —
`premium_6m`=34900, `premium_12m`=49900 paise. Revenue is reported in **INR** (`paise / 100`). Refunds /
chargebacks are **not** tracked yet (no Razorpay refund webhook wired) — `status` is always `'paid'` today; a
later phase adds refund reconciliation. There is no recurring billing (one-time Orders API), so "revenue" in a
window = the sum of one-time captures in that window.
