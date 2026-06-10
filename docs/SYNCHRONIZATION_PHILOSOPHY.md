# Synchronization Philosophy

> How data flows and stays consistent across the QuantReflex ecosystem.

---

## Core Principle

> **Firestore is the single ecosystem source of truth.** All apps read from and write to the same Firestore database. Local state (localStorage, in-memory caches) is a performance optimization, not an authority.

## Data Flow Architecture

```
┌──────────────┐    Firestore     ┌──────────────────┐
│   Main App   │ ◄──── sync ────► │  Cloud Firestore │
│  (Student)   │    (debounced)   │                  │
│              │                  │  users/{uid}     │
│  localStorage│                  │  questions/{id}  │
│  + AppState  │                  │  coachings/{id}  │
└──────────────┘                  └──────────────────┘
                                         ▲
                                         │ Admin SDK
                                         │ (server-side)
                                  ┌──────┴──────────┐
                                  │  Super Admin     │
                                  │  /api/admin/*    │
                                  └─────────────────┘
```

## Main App Sync Strategy

### Read Path
1. User logs in → `FirestoreSync.loadFromFirestore()`
2. Reads `users/{uid}` document
3. Normalizes monetization fields (`_normalizeMonetization`)
4. Fills missing defaults (`_validateAndFillDefaults`)
5. Enforces premium/trial expiry (`_enforcePremiumExpiry`)
6. Writes to localStorage + AppState
7. App UI reads from AppState (fast, synchronous)

### Write Path
1. User action → `AppState.set*()` → localStorage
2. `FirestoreSync.queueUpdate()` adds to pending updates
3. Debounce timer (2000ms) batches updates
4. Single `docRef.set(snapshot, { merge: true })` write
5. Subcollection dual-writes (performance, practice, profile)

### Drill Mode Optimization
- During active drills, all Firestore writes are **deferred**
- Prevents per-answer write amplification
- Flushed once when drill ends

### Retry Strategy
- Failed writes retry up to 2 times (5s delay)
- After max retries, data is re-queued for next user action
- User notified via toast if data may not be saved

## Admin App Sync Strategy

### Read Path
1. Admin logs in → Firebase Auth (email/password)
2. Verifies `admin: true` custom claim
3. API calls to `/api/admin/*` endpoints
4. Server reads from Firestore via Admin SDK (no security rule restrictions)

### Write Path
1. Admin action (e.g., grant entitlement)
2. API call with Firebase JWT
3. Server verifies JWT + admin claim
4. Server writes directly to Firestore via Admin SDK
5. Changes reflected in Main App on next sync/load

## Cross-App Consistency

### Entitlements
- **Write authority**: Server-side only (payment verify endpoint, admin entitlements endpoint)
- **Read authority**: Both apps read, Main App normalizes on load
- **Expiry enforcement**: Main App enforces on every load

### Questions
- **Write authority**: Admin App only (via `/api/admin/questions*`)
- **Read authority**: Main App reads via `QuestionBankService` (30-min cache)

### Timestamps
- **Format**: ISO 8601 strings everywhere
- **Generation**: `new Date().toISOString()` on both client and server
- **Comparison**: `Date.parse(isoString)` for millisecond comparison

## Anti-Patterns to Avoid

1. ❌ **Never** write entitlement fields from the client-side Main App (except local cache)
2. ❌ **Never** allow two apps to write to the same field simultaneously
3. ❌ **Never** use different timestamp formats across apps
4. ❌ **Never** read from localStorage as the source of truth for entitlements
5. ❌ **Never** cache entitlement state across sessions (always re-read from Firestore)
