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
| `isPremium` | boolean | `false` | Lifetime premium access granted |
| `isTrial` | boolean | `false` | Active trial status |
| `trialEnd` | string\|null | `null` | Trial expiration (ISO 8601) |
| `hasPaid` | boolean | `false` | Has completed a Razorpay payment |
| `isEarlyUser` | boolean | `false` | Legacy — always false for new users |
| `isPremiumPlus` | boolean | `false` | Premium+ subscription active |
| `premiumPlusPlan` | string\|null | `null` | `'plus_half_yearly'` or `'plus_yearly'` |
| `premiumPlusExpiry` | string\|null | `null` | Subscription expiration (ISO 8601) |
| `premiumPlusStatus` | string\|null | `null` | `'active'` or `'expired'` |
| `lastPaymentId` | string\|null | `null` | Last Razorpay payment ID (Premium) |
| `lastPremiumPlusPaymentId` | string\|null | `null` | Last Razorpay payment ID (Premium+) |
| `coachingId` | string\|null | `null` | Coaching institute affiliation |
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

### `users/{uid}/profile/data`
Structured profile (dual-write for admin queries).

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name |
| `email` | string | Account email |
| `isPremium` | boolean | Premium status |
| `isTrial` | boolean | Trial status |
| `isPremiumPlus` | boolean | Premium+ status |
| `updatedAt` | string | ISO 8601 |

## Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      match /{subcollection}/{document} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

## Sync Strategy

- **Main App**: Reads root doc on login → populates localStorage → queues batched writes (2s debounce)
- **Admin App**: Reads via serverless API endpoints with Firebase Admin SDK (bypasses security rules)
- **Drill Mode**: All writes deferred until drill ends to prevent per-answer write amplification
