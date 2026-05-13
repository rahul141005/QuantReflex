# Entitlement Resolution Logic

> Canonical documentation for how entitlements are interpreted across the ecosystem.

## Resolution Algorithm

Both the Main App and Admin App MUST interpret entitlements identically:

```
function resolveEntitlement(user):
  1. If isPremiumPlus === true AND premiumPlusExpiry > now:
     → PREMIUM_PLUS (active)
  
  2. If isPremium === true OR hasPaid === true:
     → PREMIUM (lifetime)
  
  3. If isTrial === true AND trialEnd > now:
     → TRIAL (active)
  
  4. Otherwise:
     → FREE
```

## Expiry Enforcement

- Trial expiry: checked on app load via `_enforceTrialExpiry()`
- Premium+ expiry: checked on app load via `_enforcePremiumPlusExpiry()`
- Both write back to Firestore to persist the revocation

## Grant Precedence Rules

| Action | Effect on Existing State |
|--------|------------------------|
| Grant Trial | Skipped if already Premium or Premium+ |
| Grant Premium | Clears isTrial, trialEnd |
| Grant Premium+ | Clears isTrial, trialEnd |
| Revoke | Clears ALL entitlement fields |

## Timestamp Format

ALL expiry timestamps use ISO 8601:
```
new Date(now + durationMs).toISOString()
// "2026-11-13T06:00:00.000Z"
```

## Feature Gating

- Premium features: `canAccess(feature)` checks `isPremium || hasPaid || (isTrial && !expired)`
- AI features: `canAccess(feature)` checks `isPremiumPlus === true` only
- Free tier: 20 daily questions, 5 lifetime AI explanation credits
