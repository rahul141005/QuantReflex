# Entitlement Resolution Logic (v2)

> Canonical documentation: [`docs/BIBLE/PAYMENT_ARCHITECTURE.md`](../../docs/BIBLE/PAYMENT_ARCHITECTURE.md).
> This page is a quick reference for how entitlements are interpreted across the ecosystem.

## Resolution Algorithm

**There is exactly ONE implementation (ADR-117): `main-app/data/entitlement-core.js`.** Do not
re-derive this rule anywhere. That single physical file is loaded by the main-app browser
(`window.QR_ENTITLEMENT`) *and* `require()`d by the main-app serverless API. `functions/` and
`super-admin-app/` deploy from their own roots and cannot require across the boundary, so they carry
byte-identical **generated mirrors** (`node scripts/sync-entitlement-core.js`); drift fails
`main-app/scripts/entitlement-core.check.js` in `npm test`.

```
isActivePremium(user, now):
  return user.plan === 'premium'
      && toMillis(user.planExpiry) > 0        // NO permanent tier — see below
      && clockSafeNow(user, now) <= toMillis(user.planExpiry)
```

**There is NO permanent/indefinite Premium tier.** Every legitimate grant (purchase 6m/12m, admin
6m/12m, finite trial ≤ `MAX_TRIAL_DAYS`) writes a finite expiry, so a `premium` doc with a
null/NaN/garbage expiry is illegitimate data and resolves to **NOT premium** (fail-safe) — it is not
"premium forever". `clockSafeNow` only ever moves `now` *forward*, anchored to the newest
server-written timestamp, so a rewound device clock cannot extend access.

A trial is `plan:'premium'` with `isTrial:true` and `trialEnd === planExpiry` — it passes the same
gate, which means **a trial user is an active-premium user and must never be shown a purchase flow.**

## Grant Arithmetic — never shorten

All writers compute new expiries with `entitlement.stackExpiry(currentExpiry, days)`, which extends
from the **LATER of {now, current expiry}**. A grant of any kind — purchase, renewal, admin 6m/12m,
bulk trial, or a replayed payment — can therefore never reduce an entitlement the user already holds,
regardless of how they obtained it.

## Expiry Enforcement

- Live, on read (server): `aiService.resolveUserAuth` reverts a lapsed `plan:'premium'` to free and
  **persists** it. The server is the sole writer of the expiry transition.
- Live, on read (client): `getAccessState` / `_enforcePremiumExpiry` downgrade the **local view only**
  and never write — a forward-set device clock or a stale offline cache must not be able to revoke or
  corrupt a real entitlement.
- Sweep: `enforceEntitlementExpiry` Cloud Function (every 6h), resolving with the same core.

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
