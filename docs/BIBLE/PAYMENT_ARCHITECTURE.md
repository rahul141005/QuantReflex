# QuantReflex Payment Architecture

**Doc Version:** 2.3 · **Payment Version:** 2.11 (see [VERSIONS.md](VERSIONS.md))
**Status:** Source of Truth for payments, plans, entitlement grants, and idempotency.
**Gateway:** Razorpay (one-time Orders API — no subscriptions/auto-renewal).
**Last updated:** 2026-08-08
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

**ADR-144 (WS4): the client is provider-neutral.** The UI holds no payment mechanics — it calls the
facade, which selects a provider and normalises the outcome:

```
paywall.js  →  QRPayments (js/payments/gateway.js)  →  provider adapter  →  server pipeline
                                                       ├── razorpay-provider.js   (web / PWA)
                                                       └── play-provider.js       (Play / TWA — WS5)
```

Provider selection reads `QRPlatform.isPlayDistribution()`, a **weak-evidence OR**: any Play signal
selects the Play provider. **"Play not ready" resolves to NO purchase path — never to Razorpay.** In a
Play build today the paywall renders the value proposition with **no purchase control at all**, no
external route, and Restore still available. `payment-facade.check.js` proves Play mode never
constructs Razorpay, never loads checkout.js and never calls create-order.

`js/payments/razorpay-provider.js` is the only shipped file with a Razorpay API surface. Restore is
provider-neutral (server truth) and routed through `QRPayments.restore`.

```
Client (paywall.js → QRPayments → razorpay-provider.js)
  QRPayments.purchase(planType)                        planType ∈ {premium_6m, premium_12m}
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
`RAZORPAY_WEBHOOK_SECRET`. Handled events:

| Event | Effect |
|---|---|
| `payment.captured` | `aiService.activatePremium(uid, plan, paymentId, orderId, {amountPaise, currency})` (uid/plan from order notes, refetched if missing) + single `{premium:true}` claim. Unattributable → `paymentOrphans` row, 200. |
| `refund.processed` (ADR-141) | Full → `aiService.revokePayment`. Partial (or an unreadable capture total) → mark `'partially_refunded'`, entitlement retained, `securityEvents`. uid resolved from payment notes → order notes → the `payments` row; unattributable → `paymentOrphans`, 200. |
| `payment.failed` | Logged + `securityEvents` row for the failure-spike alert. No entitlement change. |

Returns **500** on transient grant/revoke failure (Razorpay retries; both are idempotent), **200** on
replay, refusal (`PAYMENT_REFUNDED` — permanent, retrying can never change it) and ignored events.

## 5. Idempotency, Replay Protection & the Payment Lifecycle (ADR-141)

`payments/{paymentId}` is **not just an idempotency lock** — its `status` is the ledger row that
decides whether money is still owed as entitlement:

```
(absent) ──grant──> 'paid' ──full refund──> 'refunded'   ← TERMINAL, never re-granted
     │                  └──partial refund──> 'partially_refunded'   (entitlement STANDS, flagged)
     └──RTDN / orphan──> 'pending' ──grant──> 'paid'
(absent) ──refund before capture──> 'refunded' (tombstone)  ← the late grant then lands on TERMINAL
```

`activatePremium` runs a Firestore **transaction** on that doc:
- different uid → throw `PAYMENT_REPLAY` (blocks cross-account reuse) — checked **first**, so a
  refunded payment cannot be stolen either;
- terminal status (`refunded`/`revoked`/`chargeback`) → refuse with **zero writes** and throw
  `PAYMENT_REFUNDED`. Razorpay redelivers `payment.captured` on its own schedule and `?action=verify`
  has no recency check (a valid signature triple stays valid forever), so without this a customer
  could buy, charge back and keep renewing. The webhook **acks 200** — the state is permanent, and a
  500 would retry forever;
- `'pending'` → complete the grant, merging the existing doc;
- same uid, `'paid'`/`'partially_refunded'` (verify + webhook both fire) → re-apply safely, never
  shortening a stronger later grant (ADR-117 B1);
- absent → create the row + grant. `verify.js` additionally binds the order to the caller
  (`order.notes.uid === req.userId`).

**Row fields** (all additive, zero migration): `uid`, `plan`, `days` (term length, so a refund never
re-derives it from a retired plan id), `amount` + `amountSource:'gateway'|'catalog'` (+
`amountExpected`/`amountMismatch` when they disagree), `currency`, `status`, `expiry`, `claimedAt`,
`orderId`; on revocation `refundedAt`, `refundedAtMs`, `refundReason`, `refundId`, `tombstone`,
`refundWithinPolicy`, `refundAgeMs`; plus **ADR-143** `capturedAtMs` + `capturedAtSource` — the
gateway capture time, which is the only origin the 24-hour refund window may use.

## 5.1 Refund policy — 24 hours, provider-neutral (ADR-143)

**A user may request a refund only within 24 hours of successful payment capture.** The same rule
governs Razorpay, Google Play and any future provider. Advertised as "24-Hour Refund" in all three
locales, and `payment-parity.check.js` fails the build if code, copy or a current-state doc ever states
a different window.

### Eligibility is not execution

| | Question | Governed by | Time limit |
|---|---|---|---|
| **Eligibility** | May the user *create a refund request*? | our policy (`services/refundPolicy.js`) | 24h from **gateway capture** |
| **Execution** | A refund *happened at the provider* — revoke | the provider | **none, ever** |

Google refunds through its own support long after our window closes; `voidedPurchasesNotification` can
arrive weeks later; a Razorpay dashboard refund can be issued any time. The money has already gone
back, so `aiService.revokePayment` honours it **whatever the purchase's age** and merely annotates
`refundWithinPolicy` / `refundAgeMs` and raises a `refund_out_of_policy` securityEvent.
**`revokePayment` must never gain a window check** — `entitlement-invariants.check.js` asserts it
cannot.

### The clock starts at gateway capture

`payments/{id}.capturedAtMs` (+ `capturedAtSource`), from Razorpay's `payment.created_at` (epoch
**seconds** to ms) and, later, Play's `purchaseTimeMillis`. Never `claimedAt`: a `'pending'` row
completed days after the money moved would otherwise be handed a fresh 24 hours. `?action=verify`
cannot supply it, so the webhook back-fills, and **only ever moves it earlier**, because a correction
that moved it forward would silently extend the customer's window.

Three states, never a boolean: `eligible`, `expired`, `unknown_capture_time`. Rows written before
ADR-143 have no capture time; they are **neither** auto-approved nor auto-denied but badged for manual
review in the admin queue.

### The workflow, manual by design

```
User request -> Super Admin review -> Provider refund -> Provider confirmation -> Canonical revocation
```

The app **never issues a refund automatically.**

- **User** (`api/payment.js` `?action=refund-eligibility|refund-request|refund-cancel` — folded in, no
  new Vercel function; main-app stays at 10 of 12). Eligibility is recomputed **server-side from the
  stored capture time on every call**; the client's opinion is display state only. One open request
  per payment.
- **Super Admin** (`super-admin-app/api/admin/refunds.js` — list / details / analytics / decide).
  Every decision writes `auditLogs` (category `refund`) and notifies the user through the one ADR-066
  pipeline.
- **Approval changes NO entitlement.** It authorises a human to issue the refund at the provider. If
  approval revoked access directly and the refund then failed at the gateway, the customer would have
  neither their money nor their Premium.
- **Provider confirmation** (`refund.processed`, later Play's voided-purchase RTDN) calls
  `revokePayment` and *then* closes the request. A refund with no request behind it — Google support,
  Razorpay dashboard — is recorded `outOfBand` and **revoked exactly the same**.

States: `pending`, `approved`, `rejected`, `refunded`, `failed`, `cancelled`. `approved` is **open, not
terminal**. `pending -> refunded` is not a legal transition (a refund passes through review), and only
the *provider* actor may mark a request refunded.

## 5.2 Refund mechanics (ADR-141)

`refund.processed` → `api/payment/webhook.js`. **Full** refund (`amount_refunded >= amount`, which
also catches several partials summing to the capture) → `aiService.revokePayment`. **Partial**, or an
unreadable capture total → mark `'partially_refunded'`, **entitlement retained**, `securityEvents` for
a human. Stated policy: there is no defensible conversion from "40% of the money back" into days, and
shortening a paying customer's term is the worse error.

`revokePayment(uid, paymentId)` is the **one revoke path both providers use** (Play's
`voidedPurchaseNotification` will call it, not reimplement it). Inside one transaction it:

1. **Tombstones even when there is no grant to remove** — a refund can precede its capture; without
   the tombstone the refund is silently undone seconds later by the late grant.
2. **Replays the surviving ledger** — never subtracts days. `services/entitlementLedger.js` (pure, no
   Firebase, no ambient clock) recomputes `running = max(claimedAt, running) + days` over the
   surviving `'paid'` rows, oldest first. Subtraction is wrong in the direction that steals paid
   access: P1 bought 1 Jan (182d, lapsed 2 Jul) + P2 bought 1 Oct (182d → 1 Apr); refunding P1 by
   subtraction gives 1 Oct, destroying the entire second purchase. The correct answer is 1 Apr.
   The ledger query carries **no `orderBy`** — it would drop legacy rows lacking the field, shortening
   a real entitlement; `recomputeExpiry` sorts internally.
3. **Never touches an entitlement it does not own** — if `planSource` is no longer `'purchase'` (an
   admin/coaching/trial grant landed since), the row is still tombstoned but user fields are left
   alone. It **may only ever shorten**, and if any *surviving* row is unreadable (retired plan id,
   corrupt `claimedAt`) the recompute is abandoned entirely rather than run over a short ledger.
   Every skip → `securityEvents`, never swallowed.

Reverting to free writes the canonical `entitlement-core.revokeFields()` set, logs to
`users/{uid}/entitlementLogs` (server-owned since ADR-140) and clears the `{premium}` JWT claim.

**Indexes:** `payments [uid, status, claimedAt]` + `[status, claimedAt]`. A missing composite index
would fail *only during a refund* — the worst possible moment to discover it.

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
`premium_6m`=34900, `premium_12m`=49900 paise. Revenue is reported in **INR** (`paise / 100`).

**ADR-141 correction:** this paragraph previously read "Refunds / chargebacks are **not** tracked yet
(no Razorpay refund webhook wired) — `status` is always `'paid'` today". That is no longer true.
`refund.processed` is handled, and `status` now takes `'paid'`, `'partially_refunded'`, `'refunded'` or
`'pending'` (§5).

### Metric definitions (ADR-143) — stated here so reporting cannot silently drift from policy

| Metric | Definition |
|---|---|
| **Gross** (`revenueGrossINR`) | Every captured payment, whatever happened to it afterwards. Never decreases. |
| **Refunded** (`revenueRefundedINR`) | Money given back. A **full** refund subtracts the whole `amount`; a **partial** subtracts only `amountRefunded`, because the rest of that sale is still real revenue. |
| **Net** (`revenueNetINR`) | `gross − refunded`. **Realised revenue — the headline figure** in the Super Admin revenue view. |
| `revenueTotalINR` | **Gross**, unchanged. Kept deliberately: the daily snapshots form a historical series, and redefining an existing field would silently rewrite what every past row meant. |
| `refundedCount` / `partialRefundCount` | Counts behind the refunded figure. |

Refunds are attributed to the day of the **sale**, not the day of the refund, so today's net stays
consistent with today's gross — otherwise refunding an old sale would push today's net below zero for
reasons invisible in today's row. Tombstones (a refund that arrived before its capture) are excluded
from gross entirely rather than counted and then subtracted: no money was ever recognised for them.
`amountSource` distinguishes gateway-reported evidence from the catalog fallback.

There is no recurring billing (one-time Orders API), so "revenue" in a
window = the sum of one-time captures in that window.
