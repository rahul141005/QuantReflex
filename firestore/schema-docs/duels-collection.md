# Firestore — Duels Collection (`duels/{duelId}`)

> Realtime 1v1 Math Duel rooms. Premium+ gated.

---

## Collection Path

```
duels/{duelId}
```

Where `{duelId}` is a 6-character alphanumeric code (e.g., `A3K7PN`), generated client-side via `_generateDuelId()`.

## Document Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | string | (duelId) | Room code (matches document ID) |
| `createdBy` | string | — | Firebase UID of the room creator |
| `createdByName` | string | — | Display name of the creator |
| `status` | string | `'waiting'` | Room state (see State Machine below) |
| `createdAt` | Timestamp | `serverTimestamp()` | Room creation time (**Firestore Timestamp** — see exception below) |
| `duelStartedAt` | Timestamp\|null | `null` | When both players started (**Firestore Timestamp**) |
| `config` | object | — | Room configuration (see Config below) |
| `questions` | array | `[]` | Generated question objects (Quick mode) |
| `questionIds` | array | `[]` | Question bank IDs (Word Problems mode) |
| `participants` | map | `{}` | Map of `{uid: ParticipantObject}` |
| `winner` | string\|null | `null` | UID of the winner |
| `result` | string\|null | `null` | `'player1'`, `'player2'`, or `'draw'` |
| `deletedAt` | Timestamp\|null | — | Soft delete timestamp (set when status → `'deleted'`) |

## Config Object

| Field | Type | Description |
|-------|------|-------------|
| `topics` | string[] | Selected topic keys (e.g., `['squares', 'percentages']`) |
| `difficulty` | string | `'easy'`, `'medium'`, or `'hard'` |
| `questionCount` | integer | Number of questions (1–100) |
| `questionMode` | string | `'quick'` or `'wordproblems'` |
| `timerPerQuestion` | integer\|null | Seconds per question (null = no per-question timer) |
| `timerTotal` | integer\|null | Total session time in seconds (null = no total timer) |

## Participant Object

Each entry in the `participants` map:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name at time of join |
| `joinedAt` | Timestamp | When the player joined (**Firestore Timestamp**) |
| `status` | string | `'joined'`, `'finished'`, or `'disconnected'` |
| `answers` | array | Array of answer objects |
| `score` | integer | Running correct count |
| `totalTime` | integer | Cumulative answer time in milliseconds |

## Answer Object

Each entry in a participant's `answers` array:

| Field | Type | Description |
|-------|------|-------------|
| `questionIndex` | integer | 0-based question index |
| `answer` | string\|number | The user's submitted answer |
| `correct` | boolean | Whether the answer was correct |
| `timeMs` | integer | Time taken for this answer in milliseconds |

## Question Object (Quick Mode)

Each entry in the `questions` array:

| Field | Type | Description |
|-------|------|-------------|
| `text` | string | The question string |
| `answer` | string\|number | The correct answer |
| `category` | string | Topic category |
| `index` | integer | 0-based position |

## State Machine

```
waiting → ready → active → completed
   ↓        ↓       ↓
 deleted  deleted  deleted
```

| Transition | Trigger |
|---|---|
| `waiting` → `ready` | Second player joins via `joinDuel()` transaction |
| `ready` → `active` | Host calls `startDuel()`, sets `duelStartedAt` |
| `active` → `completed` | Both participants reach `status: 'finished'`, checked in `_checkDuelCompletion()` transaction |
| `any` → `deleted` | Soft delete via `deleteDuel()` |

## Winner Determination

When both players finish (`_checkDuelCompletion`):

1. **Higher score wins**
2. **Tie-breaker**: Lower `totalTime` wins
3. **Full tie**: `result = 'draw'`, `winner = null`

## Expiration

- Rooms expire after **30 minutes** (`DUEL_EXPIRY_MS = 30 * 60 * 1000`)
- Checked client-side via `_isExpired()` using `createdAt.toDate()`
- Expired rooms are not auto-deleted — they're filtered client-side

## Security Rules

> **Canonical source:** [`firestore/rules/firestore.rules`](../../firestore/rules/firestore.rules)

- **Read**: Participants always; anyone can read `'waiting'` rooms (needed for join flow)
- **Create**: Authenticated user, must be `createdBy`, `status` must be `'waiting'`, creator must be in `participants`
- **Update**: Participants only (+ users joining a waiting room). All updates validated:
  - Immutable fields: `createdBy`, `id`, `config`, `questions`, `questionIds`
  - Status: forward-only transitions enforced
  - Participants: each user can only modify their own entry
- **Delete**: Denied (use status-based soft delete)

## Timestamp Exception

This collection uses **Firestore `serverTimestamp()`** for `createdAt`, `joinedAt`, `duelStartedAt`, and `deletedAt` instead of ISO 8601 strings. This is intentional:

1. Server-generated timestamps prevent client clock manipulation of expiry checks
2. The `_isExpired()` function handles Timestamps via `.toDate().getTime()`
3. The `_toMillis()` utility in `paywall.js` and `firestore-sync.js` also handles Timestamp objects

This is a documented exception to the ecosystem-wide ISO 8601 timestamp strategy.
