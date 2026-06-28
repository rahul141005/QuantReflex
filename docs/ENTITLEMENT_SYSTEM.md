# Entitlement System (v2)

> How premium access works across the QuantReflex ecosystem.
> **Canonical source:** [`docs/BIBLE/PAYMENT_ARCHITECTURE.md`](BIBLE/PAYMENT_ARCHITECTURE.md) and
> [`docs/BIBLE/FIRESTORE_BLUEPRINT.md`](BIBLE/FIRESTORE_BLUEPRINT.md). This page is a quick reference.

---

## Tiers

| Tier | Price | Duration | Features |
|------|-------|----------|----------|
| **Free** | ₹0 | Forever | 20 daily questions, 5 AI explanation credits |
| **Premium** | ₹349 / ₹499 | 6 months / 12 months | Everything — unlimited practice, all modes, full AI suite, Math Duel |

One paid tier. A **trial** is an admin-granted, custom-duration Premium (`isTrial:true`).

## Firestore Fields (`users/{uid}`)

```json
{
  "plan": "free",            // 'free' | 'premium'
  "planType": null,          // 'premium_6m' | 'premium_12m' | null
  "planExpiry": null,        // ISO string | null
  "planSource": null,        // 'purchase' | 'trial' | 'admin' | 'coaching' | null
  "isTrial": false,
  "trialEnd": null,
  "planUpdatedAt": null,
  "lastPaymentId": null,
  "coachingId": null
}
```

## Resolution Algorithm

```
premium ⟺ plan === 'premium' && (planExpiry == null || planExpiry > now)
otherwise → free
```

Expired premium/trials self-heal to free on read (server `aiService.resolvePlan`, client
`getAccessState`/`_enforcePremiumExpiry`) and via the `enforceEntitlementExpiry` function.

## Expiry Enforcement

- **Live:** `resolvePlan` reverts an expired `plan:'premium'` to free on any access.
- **Sweep:** `enforceEntitlementExpiry` (every 6h) reverts expired premium docs.

## Payment Flow

```
Client → /api/payment?action=create-order { plan: premium_6m | premium_12m } → Razorpay Order
Client → Razorpay Checkout UI → Payment
Client → /api/payment?action=verify → server validates signature + binds order to caller
Server → aiService.activatePremium() → Firestore write (plan='premium', planType, planExpiry)
Client → FirestoreSync.activatePremium() → UI update
```

## Feature Gating

Every gated feature requires `plan === 'premium'` (no AI-only sub-tier):
`custom_training, review_mistakes, add_formula, add_topic, performance_insights, category_accuracy,
hard_mode, skip_question, advanced_theme, daily_goal_limit, focus_timer, table_modal,
adaptive_training, math_duel, timed_mocks, ai_explain, ai_coach, ai_study_plan`.

`timed_mocks` (ADR-067) gates the Timed Mock — a full quant-section simulation of the student's exam under its
real clock + marking scheme.

## Admin Entitlement API

```
POST /api/admin/entitlements
Body: { type, action, targetId, trialDays }

type: 'individual' | 'bulk'
action: 'premium_6m' | 'premium_12m' | 'trial' | 'revoke'   (trialDays required for 'trial')
targetId: uid (individual) or coachingId (bulk)
```
