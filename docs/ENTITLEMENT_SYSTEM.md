# Entitlement System

> How premium access works across the QuantReflex ecosystem.

---

## Tiers

| Tier | Price | Duration | Features |
|------|-------|----------|----------|
| **Free** | ₹0 | Forever | 20 daily questions, 5 AI credits |
| **Premium** | ₹89 | Lifetime | Unlimited practice, all modes, no daily limit |
| **Premium+** | ₹299/₹499 | 6mo/1yr | Everything in Premium + AI Coach, Study Plans |

## Firestore Fields

```json
{
  "isPremium": false,
  "hasPaid": false,
  "isTrial": false,
  "trialEnd": null,
  "isPremiumPlus": false,
  "premiumPlusPlan": null,
  "premiumPlusExpiry": null,
  "premiumPlusStatus": null,
  "isEarlyUser": false,
  "coachingId": null
}
```

## Resolution Algorithm

```
1. isPremiumPlus && premiumPlusExpiry > now  → PREMIUM+ (active)
2. isPremium || hasPaid                      → PREMIUM (lifetime)
3. isTrial && trialEnd > now                 → TRIAL (active)
4. Otherwise                                 → FREE
```

## Grant Precedence

| Action | Premium Fields | Trial Fields | Plus Fields |
|--------|---------------|--------------|-------------|
| Grant Trial | Unchanged | Set | Unchanged |
| Grant Premium | Set | Cleared | Unchanged |
| Grant Premium+ | Unchanged | Cleared | Set |
| Revoke All | Cleared | Cleared | Cleared |

**Critical**: Granting Trial to a Premium/Premium+ user is **skipped** (never downgrade).

## Expiry Enforcement

Both are enforced on Main App load:

- **Trial**: `_enforceTrialExpiry()` — sets `isPremium=false, isTrial=false`
- **Premium+**: `_enforcePremiumPlusExpiry()` — sets `isPremiumPlus=false, premiumPlusStatus='expired'`

## Payment Flow

```
Client → /api/payment/create-order → Razorpay Order
Client → Razorpay Checkout UI → Payment
Client → /api/payment/verify → Server validates signature
Server → Firestore write (isPremium=true / isPremiumPlus=true)
Client → FirestoreSync.unlockPremium() → UI update
```

## Feature Gating

### Premium Features
`custom_training`, `review_mistakes`, `add_formula`, `add_topic`, `performance_insights`, `category_accuracy`, `hard_mode`, `skip_question`, `advanced_theme`, `daily_goal_limit`, `focus_timer`, `table_modal`, `adaptive_training`

### Premium+ Features (AI)
`ai_explain`, `ai_coach`, `ai_study_plan`

## Admin Entitlement API

```
POST /api/admin/entitlements
Body: { type, action, targetId, trialDays }

type: 'individual' | 'bulk'
action: 'trial' | 'premium' | 'premium_plus_6m' | 'premium_plus_1y' | 'revoke'
targetId: uid (individual) or coachingId (bulk)
```
