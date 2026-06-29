# Firestore — Users Collection (`users/{uid}`)

> The single ecosystem source of truth for user state.

---

## Collection Path

```
users/{uid}
```

Where `{uid}` is the Firebase Authentication UID.

## Root Document Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `profile` | object | `{}` | User profile (name, username, createdAt) |
| `settings` | object | (defaults) | App preferences (theme, sound, difficulty, etc.) |
| `stats` | object | (defaults) | Practice statistics (attempts, streaks, accuracy) |
| `quickLinks` | string[] | `["fractionTable", ...]` | Home screen quick link order |
| `customTopics` | array | `[]` | User-created practice topics |
| `customFormulas` | object | `{}` | User-saved formulas |
| `bookmarks` | array | `[]` | Bookmarked questions |
| `plan` | string | `'free'` | v2 tier: `'free'` \| `'premium'` (all gates resolve through this) |
| `planType` | string\|null | `null` | `'premium_6m'` \| `'premium_12m'` \| null (null for trial/admin) |
| `planExpiry` | string\|null | `null` | Premium expiry (ISO 8601); equals `trialEnd` during a trial |
| `planSource` | string\|null | `null` | `'purchase'` \| `'trial'` \| `'admin'` \| `'coaching'` \| null |
| `isTrial` | boolean | `false` | True while current premium is a trial |
| `trialEnd` | string\|null | `null` | Trial expiration (ISO 8601) |
| `planUpdatedAt` | string\|null | `null` | Last entitlement change (ISO 8601) |
| `lastPaymentId` | string\|null | `null` | Last Razorpay payment ID |
| `coachingId` | string\|null | `null` | Coaching institute affiliation |

> v2 (2026-06-11): removed `isPremium, hasPaid, isEarlyUser, isPremiumPlus, premiumPlusPlan,
> premiumPlusExpiry, premiumPlusStatus, lastPremiumPlusPaymentId`. Canonical source:
> [`docs/BIBLE/FIRESTORE_BLUEPRINT.md`](../../docs/BIBLE/FIRESTORE_BLUEPRINT.md).
| `createdAt` | string | (ISO 8601) | Document creation timestamp |
| `updatedAt` | string | (ISO 8601) | Last modification timestamp |

## Subcollections

### `users/{uid}/practiceSessions/{sessionId}`
Drill session history. Auto-ID documents.

| Field | Type | Description |
|-------|------|-------------|
| `mode` | string | Practice mode (quick, reflex, timed, focus, review) |
| `category` | string | Topic category |
| `score` | integer | Questions correct |
| `total` | integer | Total questions |
| `duration` | integer | Session duration in seconds |
| `timestamp` | string | ISO 8601 timestamp |

### `users/{uid}/performance/overall`
Derived performance metrics (dual-write from main app).

| Field | Type | Description |
|-------|------|-------------|
| `totalAttempted` | integer | Lifetime attempts |
| `totalCorrect` | integer | Lifetime correct |
| `accuracy` | integer | Percentage (0-100) |
| `avgTime` | number | Average response time in seconds |
| `bestStreak` | integer | Best consecutive correct |
| `currentStreak` | integer | Current streak |
| `dailyStreak` | integer | Consecutive days practiced |
| `updatedAt` | string | ISO 8601 |

### `users/{uid}/practice/data`
Mistake review data and saved questions.

| Field | Type | Description |
|-------|------|-------------|
| `mistakes` | array | Recent mistakes for review mode |
| `savedQuestions` | array | Bookmarked questions |
| `updatedAt` | string | ISO 8601 |

### `users/{uid}/ai/usage`
AI feature usage tracking.

| Field | Type | Description |
|-------|------|-------------|
| `wordProblemsUsedLifetime` | integer | Total word problems generated |
| `wordProblemsUsedToday` | integer | Today's word problem count |
| `explanationsUsed` | integer | AI explanation credits used |
| `updatedAt` | string | ISO 8601 |

### `users/{uid}/profile/data` — **REMOVED (ADR-071)**
This dual-write mirror was removed: nothing read it (every consumer reads the root `users.profile` map + root plan
fields). New users no longer get it; legacy docs are cleared by `firestore/migrations/2026-06-29-cleanup-legacy-orphans.js`.

## Security Rules

> **Canonical source:** [`firestore/rules/firestore.rules`](../../firestore/rules/firestore.rules)

The user collection uses **field-level entitlement protection** (Phase 1 hardened):

- **Read**: Owner only (`request.auth.uid == userId`)
- **Create**: Owner only + all entitlement fields must start at safe defaults (`false` / `null`)
- **Update**: Owner only + protected entitlement fields can only be **revoked** (set to `false` / `null` / `'expired'`), never **granted** (set to `true` / `'active'`). Entitlement grants are Admin SDK only.
- **Delete**: Denied (server-side only)
- **Subcollections**: Owner read/write (no field-level restrictions — mirrors, not sources of truth)

### Protected Fields (client can only revoke, never grant)

| Field | Client can set to |
|---|---|
| `plan` | `'free'` only |
| `planType` | `null` only |
| `planExpiry` | `null` only |
| `planSource` | `null` only |
| `isTrial` | `false` only |
| `trialEnd` | `null` only |
| `lastPaymentId` | `null` only |
| `lastPremiumPlusPaymentId` | `null` only |

## Sync Strategy

- **Main App**: Reads root doc on login → populates localStorage → queues batched writes (2s debounce)
- **Admin App**: Reads via serverless API endpoints with Firebase Admin SDK (bypasses security rules)
- **Drill Mode**: All writes deferred until drill ends to prevent per-answer write amplification

