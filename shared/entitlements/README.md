# Entitlement Resolution Logic (v2)

> Canonical documentation: [`docs/BIBLE/PAYMENT_ARCHITECTURE.md`](../../docs/BIBLE/PAYMENT_ARCHITECTURE.md).
> This page is a quick reference for how entitlements are interpreted across the ecosystem.

## Resolution Algorithm

Main App, Admin App, Coaching App, and Cloud Functions MUST interpret entitlements identically:

```
function isPremium(user):
  return user.plan === 'premium'
      && (user.planExpiry == null || parse(user.planExpiry) > now)
  // otherwise → FREE
```

A trial is `plan:'premium'` with `isTrial:true` and `trialEnd === planExpiry` — it passes the same gate.

## Expiry Enforcement

- Live, on read: `aiService.resolvePlan` (server) and `getAccessState`/`_enforcePremiumExpiry` (client)
  revert an expired `plan:'premium'` to free and persist it.
- Sweep: `enforceEntitlementExpiry` Cloud Function (every 6h).

## Grant Precedence Rules

| Action | Effect |
|--------|--------|
| Grant Premium (6m/12m) | plan:premium, planType, planExpiry, isTrial:false |
| Grant Trial (custom days) | plan:premium, planExpiry, planSource:'trial', isTrial:true, trialEnd |
| Revoke | plan:free; clear all plan/trial fields |

## Timestamp Format

ALL expiry timestamps use ISO 8601: `new Date(now + durationMs).toISOString()`.

## Feature Gating

Every gated feature requires `plan === 'premium'` — there is no AI-only sub-tier. Free tier: 20 daily
questions, 5 lifetime-total AI explanation credits.
