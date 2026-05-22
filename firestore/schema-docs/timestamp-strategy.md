# Timestamp Strategy

> ALL timestamps in the QuantReflex ecosystem use ISO 8601 strings.

---

## Canonical Format

```javascript
new Date().toISOString()
// → "2026-05-13T06:30:00.000Z"
```

## Rules

1. **ALWAYS** use `new Date().toISOString()` for creating timestamps
2. **NEVER** use raw `Date.now()` (milliseconds) as a stored timestamp
3. **NEVER** use Firestore `Timestamp` objects
4. **NEVER** use custom date format strings (e.g., `"May 13, 2026"`)

## Parsing for Comparison

```javascript
// Convert ISO string to milliseconds for comparison
var millis = Date.parse(isoString);  // number
var isExpired = Date.now() > millis;

// Or use _toMillis() helper (duplicated in paywall.js and firestore-sync.js)
function _toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') {
    var parsed = Date.parse(ts);
    return isNaN(parsed) ? 0 : parsed;
  }
  if (typeof ts.toDate === 'function') {
    try { return ts.toDate().getTime(); } catch (_) { return 0; }
  }
  if (ts instanceof Date) return ts.getTime();
  return 0;
}
```

## Why ISO 8601?

1. **Human-readable** in Firestore console
2. **String-sortable** (lexicographic order = chronological order)
3. **Cross-platform** (parseable in any language)
4. **Timezone-safe** (always UTC with 'Z' suffix)
5. **No precision loss** (millisecond precision preserved)

## Fields Using Timestamps

| Field | Location | Purpose |
|-------|----------|---------|
| `createdAt` | `users/{uid}` | Account creation |
| `updatedAt` | `users/{uid}` | Last sync |
| `trialEnd` | `users/{uid}` | Trial expiration |
| `premiumPlusExpiry` | `users/{uid}` | Premium+ expiration |
| `timestamp` | `practiceSessions/{id}` | Session timestamp |
| `updatedAt` | All subcollections | Subcollection sync time |

## Admin Panel Compliance

The Super Admin entitlements endpoint uses:
```javascript
const trialEnd = new Date(now + durationDays * 24 * 60 * 60 * 1000).toISOString();
const expiry = new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
```

This matches the Main App's expectation for ISO string timestamps.

## Exception: Duels Collection

The `duels` collection uses **Firestore `serverTimestamp()`** (Timestamp objects) for `createdAt`, `joinedAt`, `duelStartedAt`, and `deletedAt`. This is an **intentional exception**:

1. **Tamper resistance**: Server-generated timestamps prevent client clock manipulation of duel expiry checks
2. **Atomicity**: `serverTimestamp()` is resolved at write time, ensuring consistent ordering in transactions
3. **Compatibility**: The `_toMillis()` helper (in `paywall.js` and `firestore-sync.js`) handles Timestamp objects via `.toDate().getTime()`

All other collections and subcollections follow the ISO 8601 string strategy.

