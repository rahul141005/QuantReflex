# QuantReflex Firestore Blueprint

**Doc Version:** 1.12 · **Firestore Version:** 2.19 (see [VERSIONS.md](VERSIONS.md))
**Status:** Source of Truth for all Firestore collections, fields, paths, and indexes.
**Firebase project:** `quant-reflex-trainer`
**Last updated:** 2026-06-28
**Change control:** Any schema change (new/renamed field, new collection, path change, index change) follows [GOVERNANCE.md](GOVERNANCE.md), updates this document + [CHANGELOG.md](CHANGELOG.md), and bumps the Firestore Version in [VERSIONS.md](VERSIONS.md) (with a migration note if data is affected).

Companion: [TECHNICAL_BIBLE.md](TECHNICAL_BIBLE.md) · [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md) · [PAYMENT_ARCHITECTURE.md](PAYMENT_ARCHITECTURE.md)

---

## 1. Conventions

- **Timestamps:** ISO-8601 strings are the standard; `serverTimestamp()` appears on `users.updatedAt` and some server writes. All readers must normalize (number | ISO string | Firestore Timestamp | Date).
- **Authority:** the root `users/{uid}` document is the source of truth. Subcollections under it are derived mirrors unless noted "source of truth".
- **Writer legend:** `client` = Firebase client SDK (subject to rules); `admin` = Admin SDK (server, bypasses rules); `fn` = Cloud Function.

---

## 2. `users/{uid}` — root document (source of truth)

| Field | Type | Default | Writer | Notes |
|---|---|---|---|---|
| `uid` | string | — | admin | set at register |
| `email` | string | — | admin | set at register (preserves the casing entered) |
| `emailLower` | string | — | admin (register) | **lowercased `email`** — the case-insensitive Global Search key (ADR-020). Set at register; existing docs backfilled 2026-06-12 via `firestore/migrations/2026-06-12-add-emailLower.js`. |
| `profile` | map `{name, createdAt}` | `{}` | client/admin | display name |
| `settings` | map | defaults | client | theme, sound, vibration, difficulty, dailyGoal, etc. |
| `stats` | map | defaults | client | attempts, streaks, categoryStats, mistakes[], responseTimes[], **dailyHistory{}** (see note) |
| `quickLinks` | array | seeded | client | |
| `customTopics` | array | `[]` | client | |
| `customFormulas` | map | `{}` | client | |
| `bookmarks` | array | `[]` | client | |
| `learnProgress` | map | `{}` (absent until first topic view) | client | **ADR-069 Phase 4** — Learn per-topic progress: `{ <topicId>: {viewedAt:ms, completedAt:ms\|null} }`. localStorage-primary (`quant_learn_progress`), best-effort mirrored here via `FirestoreSync.queueUpdate`. Powers Continue / spaced Due-for-revision / completion. Owner-writable (not an entitlement field). |
| `learnTopicBookmarks` | array | `[]` (absent until first save) | client | **ADR-069 Phase 4** — saved Learn topic ids `[<topicId>]`. localStorage-primary (`quant_learn_bookmarks`), best-effort mirror. Distinct from `bookmarks` (legacy per-formula stars). Owner-writable. |
| `plan` | `'free'`\|`'premium'` | `'free'` | admin/fn (grant/revoke) / client (→'free' only) | **v2 canonical tier. All gates resolve through this.** |
| `planType` | `'premium_6m'`\|`'premium_12m'`\|null | `null` | admin / client(null) | purchased product; null for trial/admin grant |
| `planExpiry` | ISO string \| null | `null` | admin/fn / client(null) | premium expiry; equals `trialEnd` during a trial; null=free |
| `planSource` | `purchase`\|`trial`\|`admin`\|`coaching`\|null | `null` | admin / client(null) | how the current premium was granted |
| `isTrial` | bool | `false` | admin / client(false) | true while current premium is a trial (RETAINED) |
| `trialEnd` | ISO string \| null | `null` | admin / client(null) | trial expiry; mirrors `planExpiry` during a trial (RETAINED) |
| `planUpdatedAt` | ISO string | — | admin/fn/client | last entitlement change |
| `coachingId` | string \| null | `null` | admin / client(null) | institute affiliation |
| `fcmToken` | string \| null | — | client / fn(null on invalid) | push token |
| `lastPaymentId` | string \| null | `null` | admin / client(null) | last Razorpay receipt |
| `createdAt` | ISO string \| serverTimestamp | — | admin/client | |
| `updatedAt` | serverTimestamp \| ISO string | — | client/admin | anchors clock-skew checks |
| `accountStatus` | `'active'`\|`'suspended'`\|`'archived'` | `'active'` (absent⇒active) | admin (Admin SDK) | **user lifecycle (Phase 2).** Suspended/archived users are also **Firebase-Auth-disabled** — the real access gate (a disabled user gets no valid token). `accountStatus` is admin-authoritative visibility/cleanup state. |
| `suspendedAt` / `archivedAt` | ISO \| absent | — | admin | when suspended / soft-deleted (archived) |
| `purgeAfter` | ISO \| absent | — | admin / fn | `archivedAt + 30d` hold; the `cleanup-sweep` cron hard-purges archived users past this |
| `archiveReason` | string \| absent | — | admin | optional reason recorded at archive |
| `inactiveFlaggedAt` | ISO \| absent | — | fn (cron) | set when a still-active user has been inactive >180d (flagged for admin review) |
| `statusUpdatedAt` | ISO | — | admin | last lifecycle change |
| `aiThrottle` | map `{cap, setBy, setAt}` \| absent | — | admin (User-360 throttle) | **per-user AI daily cap (ADR-022)** — honored by main-app `aiService`: AI is blocked when the user's daily AI count exceeds `cap`. Absent = no throttle. Set/cleared via `users?action=throttle`. |

**Removed in v2** (do not reintroduce): `isPremium, hasPaid, isEarlyUser, isPremiumPlus, premiumPlusPlan, premiumPlusExpiry, premiumPlusStatus, lastPremiumPlusPaymentId`.

**Resolution rule:** `premium ⟺ plan==='premium' && (planExpiry==null || planExpiry>now)`. Expired premium/trials self-heal to free on read (server `resolvePlan`, client `getAccessState`/`_enforcePremiumExpiry`).

**Entitlement write rule (client):** clients may only DOWNGRADE — `plan`→`'free'`, and clear `planType/planExpiry/planSource/trialEnd`→null, `isTrial`→false. Grants are admin-only. Enforced by `entitlementFieldsSafe()` in rules. See [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md).

**`stats.dailyHistory` shape (Analytics Foundation, ADR-027, 2026-06-13):** a map of `dateKey (Date.toDateString())` → per-day record, **widened** from `{attempted, correct}` to **`{attempted, correct, sumTimes, count}`**. `sumTimes` accumulates that day's response times (seconds) and `count` the number of timed answers, so **per-day average solving speed = `sumTimes / count`** — the first **dated speed history** in the system (`stats.responseTimes` is a timestamp-less 200-item ring and cannot support a calendar trend). Written by `main-app/js/progress.js#recordAnswer` (capped to the last **90 days** by the existing prune); the two new keys are **additive and backward-compatible** — pre-ADR-027 day records lack them and all readers default `sumTimes/count` to `0`. This is the root substrate for every honest speed-trend metric in the Coaching App (ADR-028); 7d/30d speed trends become real only after ≥7/≥30 days of accumulation (until then the UI shows a "collecting data" state — never a fabricated number).

**`stats.lastActiveMs` (ADR-029, 2026-06-13):** sortable epoch-ms last-active, written by `progress.js` alongside the human `stats.lastActiveDate` (a `Date.toDateString()` string kept for display only). **All Firestore order/range queries use `lastActiveMs`** — the coaching roster order + keyset pagination and the super-admin inactive sweep/list/export — because `lastActiveDate` sorts lexically by weekday, not chronologically (it silently mis-ordered the roster and made the inactive `< cutoff` range never match). Backfilled for existing docs by `firestore/migrations/2026-06-13-add-lastActiveMs.js`. Skips no longer pollute speed: `progress.js#recordAnswer` excludes a skipped question's `responseTime` (passed `null`, not `0`) from `responseTimes`/`dailyHistory.sumTimes`.

**`stats.avgSessionImprovementPct` (Session Improvement bridge, ADR-030, 2026-06-13):** a rolling average (number, percent; absent until the user finishes a first eligible session) of per-session **within-session speed deltas** — `(firstHalfAvg − secondHalfAvg) / firstHalfAvg × 100`, positive = sped up. Written by `main-app/js/progress.js` on session completion when the just-finished session had **≥6 timed questions** (smoothed against the prior value, ~last-20-session weight). It exists to give the Coaching App an **honest day-one speed-improvement signal** while the calendar speed trend (`dailyHistory` avgTime) is still accumulating — the coaching user scan reads it **cheaply** off the root doc (no per-student `practiceSessions` fan-out). It is **strictly a "Session Improvement" metric**, NEVER labeled or charted as a 7/30-day trend, and becomes secondary once `dailyHistory` speed history matures. Additive/backward-compatible; readers default it to `null`/0. No backfill (real sessions only).

### 2.1 Subcollections of `users/{uid}`

| Path | Authority | Writer | Shape |
|---|---|---|---|
| `practiceSessions/{auto}` | append log | client | `{mode, category, score, total, duration, date, timestamp}` + **(ADR-030)** optional `{firstHalfAvg, secondHalfAvg, sessionImprovementPct, timedCount}` — **now actually populated (ADR-027):** the `firestore-sync.savePracticeSession()` writer was exported but had **zero call sites**, so this subcollection was effectively empty. It is now called from the drill/timed-test completion flow, giving per-session `duration` (speed) + `date` for the Coaching App's session list and "sessions today" count. **Session Improvement (ADR-030):** when the session had ≥6 timed questions, `firstHalfAvg`/`secondHalfAvg` (seconds) record the mean solve time of the first vs last half of `perQuestionTimes` and `sessionImprovementPct` the signed within-session delta — surfaced per-session on the coaching Student-360 profile, never mixed with the calendar speed trend. Absent on sessions with <6 timed questions (and on all pre-ADR-030 docs). |
| `performance/overall` | derived mirror | client | `{totalAttempted, totalCorrect, accuracy, avgTime, bestStreak, currentStreak, dailyStreak, ...}` |
| `practice/data` | derived mirror | client | `{mistakes[], savedQuestions[], updatedAt}` |
| `profile/data` | derived mirror | client | `{name, email, premium mirror flags, updatedAt}` |
| **`usage/ai`** | **AI quota + cost — SOURCE OF TRUTH** | admin (register, aiService) | `{wordProblemsUsedLifetime, wordProblemsUsedToday, wordProblemsLastDate, explanationsUsed, lastUsageDate, insightsGeneratedDate, gptTokensInput, gptTokensOutput, gptCostUSD, gptCalls, gptThrottleDate, gptThrottleCount}` — the four `gpt*` counters (`increment`-written by `aiService.trackGptCost` on every OpenAI call) are per-user token/cost telemetry (added 2026-06-11, Super Admin Phase 1). `gptThrottleDate` (UTC `YYYY-MM-DD`) + `gptThrottleCount` are the **per-user daily throttle counter** (ADR-022) — written transactionally by `aiService.enforceAiThrottle` only when the parent `users/{uid}.aiThrottle.cap` is set, and reset each UTC day. |
| `ai/usage` | **removed (audit M1, 2026-06-11)** | — | legacy orphaned client mirror; client seed deleted. Do not recreate. |
| `notifications/{id}` | per-user notices | admin/client(read) | `{title, body, type, isRead, timestamp}` |
| `entitlementLogs/{auto}` | admin audit (per-user, RETAINED for back-compat) | admin | `{type, action, adminId, timestamp, details}` — **no `uid` field** (it is the doc's parent). The **canonical platform-wide immutable audit trail is now the root `auditLogs` collection** (§3); entitlement grants write to both. |

> **Canonical AI-usage path is `users/{uid}/usage/ai`.** Do not write new logic against `ai/usage`.

---

## 3. Top-level collections

### `questions/{auto}`
`{type:'word_problem', topic, difficulty:'easy'|'medium'|'hard', question, options[], answer:number, explanation|steps, approved:bool, status:'draft'|'active'|'archived', premiumOnly:bool, createdAt:ISO, updatedAt:ISO}` — read: any authed user; write: admin only (Admin SDK). **Content Management (Phase 5, ADR-018):** edited in place via `questions?action=update` (sets `updatedAt`; fixes the prior bug where editing created a duplicate doc), soft-unpublished via `action=archive` (`status:'archived'`), or hard-deleted via `action=delete` (requires `confirm:'DELETE'`); every mutation writes one `auditLogs` row (`category:'content'`). Only `status:'active'` + `approved!==false` docs are served to students (`QuestionBankService`), so `archived` = unpublished. `updatedAt` is ISO (matches `createdAt`); absent on pre-Phase-5 docs.

### `coachings/{id}`
`{name, status:'active'|'suspended'|'deleted', isActive:bool, registrationToken, adminUid, adminEmail, studentCount, createdAt, updatedAt}` + **(ADR-030)** optional `logoUrl` — read: coaching members (claim match); write: admin only.
**`logoUrl` (ADR-030, optional):** an absolute `https://` image URL for the institute logo (no upload pipeline — a plain URL set by super-admin in Coaching-360 create/edit). Returned by `main-app/api/validate-coaching.js` so the student join screen can render **"✓ Connected to <name>"** with the logo when present, and shown in the Coaching App header/Settings **only when set**. Absent ⇒ render the name-initial avatar (no broken image, no placeholder). Validated as a length-capped `https` URL on write.
**`studentCount` (canonical; maintenance reworked for Spark — ADR-032, 2026-06-13):** denormalized counter, now
maintained **in the request path** (the `syncCoachingStudentCount` Cloud Function is **retired/no-op** because
Firestore triggers do **not** run on Spark — it was leaving every counter frozen at 0). Writers, all guarded so a
decrement only fires when `coachingId` is actually removed (suspend/archive keep it, so they don't touch the
count): `register` (+1 in the create batch), `account.claim-coaching` (±1 in its txn), `users.reassign-coaching`
(±1, txn-wrapped), `users.purge` + `account.delete` (−1, best-effort). **Source of truth for display is the live
`count()`** at detail surfaces (Coaching-360 `details` runs `users.where('coachingId','==',id).count()`); the
maintained field backs the 1000-row list view only. Reconcile existing drift once with
`firestore/diagnostics/backfill-student-counts.js`. The legacy `studentsCount` field remains removed.
**Canonical active check (audit M4, fixed 2026-06-11):** use `isCoachingActive(data)` in `main-app/api/_lib/middleware.js` — active IFF `status === 'active'` when `status` is present, else fallback `isActive !== false`. All three consumers (`register`, `claim-coaching`, `validate-coaching`) now use this helper; previously claim/validate only checked `status === 'expired'` (never written) and could let a `suspended` coaching through.

**Subcollection `coachings/{id}/notes/{studentUid}` (minimal coaching notes, ADR-030):** one **plain-text** private note per student, owned by the coaching admin. Shape: `{text (≤2000 chars), updatedAt, updatedByUid}`. **Writer:** Admin SDK only, via the coaching app's `students?action=save-note` branch (scoped to `req.coachingId`, and only for a student whose `coachingId` matches — no cross-tenant write). **Read:** server-side only, merged into the `students?action=details` (Student-360) payload — **never** a direct client read. **Client read/write denied by rules** (default-deny; the path is not whitelisted). Deliberately NOT a CRM: no tags, reminders, timeline, history, or attachments — exactly one current note per student. Deleting a student/coaching leaves the note orphaned (harmless; swept if the parent coaching is purged).

### `coachingMetrics/{coachingId}` (Analytics Foundation, ADR-027)
Per-coaching **daily rollup** powering the Coaching App's Performance/Growth analytics without an unbounded per-load roster scan. Shape: `{ coachingId, updatedAt, days: { 'YYYY-MM-DD': { avgSpeed, avgAccuracy, activeToday, activeThisWeek, totalStudents, premiumCount, trialCount, participation, attempts } } }` — `days` is a date-keyed map capped to the last **90 days** (matching `stats.dailyHistory`). **Writer:** the super-admin daily metrics cron (`super-admin-app/api/cron/sweep.js`, Admin SDK) — it already scans all users/coachings for the platform `metrics/{date}` snapshot, so it emits one `coachingMetrics/{id}` per coaching in the same pass (cross-tenant aggregation stays governance-owned by super-admin; **zero new coaching serverless functions**). **Read:** a coaching admin may read **only its own** doc (`coachingId` claim match); client writes denied (see [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md)). The coaching dashboard/performance endpoints read this O(1) doc instead of re-scanning the full `users` roster 3× per load. Day rows accrue from 2026-06-13 forward — **no backfill** (honest history only); week-over-week growth/retention and speed trends light up as rows accumulate.

### `duels/{code}` (Duel V2 — server-authoritative, ADR-031)
Premium 1v1 speed-challenge room. `{code}` is a 6-char crypto-random code. **Server-authoritative:** the
`main-app/api/duel.js` endpoint (Admin SDK) is the **only** writer of questions, status, winner, and graded
results; clients write only their own presence. Shape:
`{ schemaVersion:2, code, createdBy, createdByName, status('lobby'|'active'|'complete'|'abandoned'|'expired'),
config{topics[],difficulty,questionMode,questionCount(1–30,user-requested),timerPerQuestion?,timerTotal?},
prompts:[{index,text,category}] (TEXT ONLY — no answers; populated by the endpoint at start),
effectiveQuestionCount (server-resolved actual count — the completion gate compares against THIS),
participantUids:[uidA,uidB], presence:{uid:{name, state('joined'|'ready'|'solving'|'finished'), finishReason('completed_all'|'submitted_early'|'timed_out')?, lastSeenAt}}
(NO score, NO answeredCount — strict hidden-until-results), startedAt(server ms), totalDeadline(server ms — always
set, even with no user timer, to bound stalling), winnerUid|null, result('win'|'draw')|null,
perPlayer:{uid:{correctCount, duelScore, totalSolveMs}} (server-written at complete),
completedAt, createdAt }`.
- **Winner (server-computed):** `duelScore = correctCount×1000 + speedBonus`,
  `speedBonus = round(300 × (1 − clamp(totalSolveMs/budgetMs,0,1)))` (max 300 < 1000). Accuracy strictly dominates;
  equal accuracy separated by **server-measured** `totalSolveMs` (`finishedAt−startedAt`); unanswered/skipped =
  wrong; exact `duelScore` tie ⇒ `result:'draw'`. `presence[uid].state` is the only client-writable field-path
  (own uid only, while `status=='active'`).
- **Subcollection `duels/{code}/private/key`** (Admin-SDK only; **client read AND write denied**): the answer key
  — `{prompts:[{index,text,category}], answers:[{index,answer}]}`. Never leaves the server. **Generated by the
  unified generator (ADR-035):** `api/duel.js _start` `require('../js/questions.js')` and calls
  `generateMultiTopic`/`generateQuestions` — the SAME engine + 14 authoritative categories as Practice (the
  divergent 6-category `api/_lib/duel-questions.js` was deleted). Word-Problem mode still resolves from the
  `questions` bank. Answer shapes are unchanged (numbers + string answers like `5:4`/`1/2`, graded by `_isCorrect`).
- **Subcollection `duels/{code}/players/{uid}`** (own-uid read; **own-uid write only while `status=='active'`
  AND own `presence.state=='solving'` AND `request.time < room.totalDeadline`** (ADR-036 — answer writes are
  rejected after the timer deadline, closing the post-deadline bypass); opponent **denied**): each player's own answers —
  `{answers:{<index>:{value,clientMs}}, answeredCount}` (a map keyed by index via merge → idempotent, no array
  clobber). Written **per-answer while solving** as a durability backstop — **NOT a resume store** (exit/kill =
  finalized submission, no continue-after-exit). Once the endpoint stamps `presence.state=finished` at finalize,
  the `solving`-guard denies further answers (**no answering after the submission lock**). The opponent never
  subscribes to it (hidden-until-results + zero hot-path fan-out). The endpoint reads it at `finish` to grade.
- **State machine + transitions:** see [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md). Status is written only
  by the endpoint/cron (Admin SDK); `lobby→active` (host `start`, generates Qs+key, stamps `startedAt`/
  `totalDeadline`, freezes), `active→complete` (one status-CAS finalize txn when both `finish` or
  `now>totalDeadline`). **No data migration** — duels are ephemeral; `schemaVersion:2` new docs only; legacy docs
  drain/expire (≤ TTL). Index: `duels (participantUids array-contains, status)`.

### `users/{uid}.activeDuelId` + `users/{uid}/duelHistory/{duelId}` (Duel V2, ADR-031)
- **`users/{uid}.activeDuelId`** (string|null) — recovery mirror written by the duel endpoint (Admin SDK) on
  create/join. It is **NOT cleared at finalize** (ADR-033 correction — it deliberately stays set so the Active-Duel
  "Duel ready · View Results" home card survives until the user acks); it is cleared on **result-ack, host-abandon,
  guest-`leaveLobby` (ADR-036 — removes the guest from `participantUids`+`presence` so the room isn't bricked),
  or cron-expire**. A `complete` value never blocks a new create (the create-guard only blocks `lobby`/`active`).
  One O(1) read on app boot recovers an in-flight
  duel cross-device (reinstall/another device) and drives the **Active-Duel home card** (derived; no second flag).
- **Durable per-device acknowledgement (ADR-044):** the server mirror is the cross-device truth, but its clear is a
  best-effort network call that can fail offline/mid-close. So **Finish Duel** (`DuelCore.ackResult`) also records the
  duel code in a bounded localStorage tombstone (`qr_duel_acked`, FIFO≤30) **synchronously**. Boot recovery
  (`DuelCore.recover`) consults it: an acked code is terminal and is **never** resurfaced (it also self-heals the
  stale mirror), and `abandoned`/`expired` rooms are likewise dropped. This guarantees a finished duel can never
  resurrect after restart — even offline. (`ackResult` was historically absent from the `DuelCore` export, so the
  mirror-clear silently threw and never ran — fixed in ADR-044; the tombstone is the durability backstop.)
  Recovery restores only the **waiting-for-results** or **results** screen — **never the solving screen** (no
  resume): if the app comes back off the solving screen mid-duel, the client `finish`es (finalizes) on the synced
  answers. Client-write denied (it's under `users/{uid}` but `entitlementFieldsSafe()` / server-only — written by
  the endpoint).
- **Subcollection `users/{uid}/duelHistory/{duelId}`** — base `{opponentName, outcome('win'|'loss'|'draw'|
  'no_contest'), myScore, oppScore, mySpeed, oppSpeed, accuracy, playedAt}` **plus (ADR-068, Battle Archive) the
  denormalized facts** `{opponentUid, oppAccuracy, challengerUid, iChallenged(bool, host vs joiner), difficulty,
  questionCount, myAnswered, durationMs}`. *(Denormalized because the room doc TTLs at 30 days — history must be
  self-contained.)* **Server-written** (Admin SDK, docId=duelId → idempotent) for **both** players at completion.
  **Client read own; write DENIED** — explicit deny **overriding** the blanket `users/{uid}/{sub}/{doc}` owner-write
  grant (see SECURITY). Retained indefinitely (small); independent of room-doc cleanup. **ADR-068 removed the
  ADR-065 50-entry cap** (`DUEL_HISTORY_CAP`/`_pruneDuelHistory`) so history is COMPLETE — the Battle Archive
  paginates (`orderBy(playedAt desc).limit(15).startAfter(cursor)`) and never loads all. Indexes:
  `(outcome, playedAt desc)`, `(difficulty, playedAt desc)`, `(opponentUid, playedAt desc)`; the All tab + time-range
  use the single-field `playedAt` index.

- **Subcollection `users/{uid}/duelStats/summary`** (ADR-068, Battle Archive) — **ONE server-only aggregate doc**
  maintained **inside the same `_finalizeTxn` transaction** that writes history (pure math in
  `services/duelStats.js`). Shape:
  - `duelAggregates`: `{totalDuels, wins, losses, draws, currentStreak (win-streak; any non-win resets), bestStreak,
    totalCorrect, totalQuestions, totalAnswered, totalSolveSec, solveSamples, fastestWinSec, highestScore,
    lowestScore, lastPlayedAt, lastOutcome}` — exact avg accuracy = `totalCorrect/totalQuestions`, rolling avg solve
    = `totalSolveSec/solveSamples`. **`fastestWinSec` = the winner's OWN total solve time** (`totalSolveMs/1000`),
    not the whole-duel wall clock (which is gated by the slower player); `highestScore`/`lowestScore` are `duelScore`.
  - `rivals{opponentUid: {name, count, wins, losses, draws, streak (signed: +n you won the last n, −n you lost the
    last n, 0 after a draw), lastOutcome, fastestWinSec, closestMargin, totalMargin (signed, for avg), sumAccuracy,
    sumSolveSec, lastPlayedAt}}` — powers the rivalry banner + most-played/most-defeated (derived). Bounded map
    (≤ hundreds of opponents ≪ 1MB; future escape hatch = a `rivals` subcollection, no user impact).
  - `achievements{name: unlockedAt}` (ms) — unlock-once: `firstBlood, firstWin, tenWins, fiftyWins, hundredWins,
    streak5, streak10, perfectDuel, lightning, revenge`. (David-vs-Goliath / Comeback King deferred — need
    unstored/future-ELO signals.)
  A **no_contest** writes a history row but does NOT touch `duelStats` (not a real battle). **Client read own; write
  DENIED** (explicit carve-out overriding the blanket owner-write grant — a client can never forge stats; see
  SECURITY). Removed on account deletion (`account.js` subcollections list includes `duelStats`).

### `payments/{paymentId}`
`{uid, plan, amount, status, expiry, orderId, claimedAt}` (here `plan` = the purchased `planType`, e.g. `premium_6m`; `amount` = price in **paise** (int), `status:'paid'`) — **idempotency lock.** Written by `aiService.activatePremium` on every Premium purchase. `amount`/`status` were added 2026-06-11 (Super Admin Phase 1); **historical docs may lack `amount`**, so the revenue rollup falls back to the plan→price map (`premium_6m`=34900, `premium_12m`=49900). The lock rejects reuse of a `paymentId` by a different uid (`PAYMENT_REPLAY`). Read/delete: owner; create/update: admin only.

### AI caches
- `explanations/{contentHash}` — `{question, answer, category, concept, steps[], mistake, tip, usageCount, createdAt}`
- `aiCoachV2/{uid_coach_YYYY-M-D}` — `{today, tomorrow, thisWeek, recommendations, userId, date}`
- `aiInsightsV2/{uid_insights_YYYY-M-D}` — `{learningPattern, accuracyTrend, ..., aiSummary}`
- `aiStudyPlans/{auto}` — `{userId, examName, status:'draft'|'active'|'archived', rationale, phases[], timetable[], progress{}, createdAt}`
- `aiInsights/{id}`, `aiStudyPlans` legacy reads — owner-read, admin-write.

### AI Ecosystem — one brain (ADR-039, see [AI_INTERACTION_SYSTEM.md](AI_INTERACTION_SYSTEM.md))
- `users/{uid}.aiMemory` — **server-authoritative** durable memory map: `{v, goal, examName, examDate, confidence,
  preferredDepth, preferredStyle, dailyMinutes, knownWeakConcepts[≤8], wins[≤5], recentTopicsExplained[≤8],
  timeline[≤12]{at,feature,summary}, updatedBy, updatedAt}`. Field-capped by `aiService.updateMemory`. **Client
  write DENIED** by rules (`entitlementFieldsSafe`); owner read allowed.
- `aiContext/{uid}` — server-only 6h cache of the Student Context Engine output `{ctx, ttlExp, updatedAt}`. Default-deny.
- `aiDaily/{uid}_{feature}_{YYYY-M-D}` — server-only daily cache of coach/insights block envelopes `{uid, feature,
  date, envelope, createdAt}` (consolidates `aiCoachV2`/`aiInsightsV2`). Default-deny.
- `aiMissions/{uid}` — **REMOVED (ADR-047)** — the legacy one-shot study Mission (superseded by `aiPlanner/{uid}`).
  No longer written or read by any runtime path (`action=mission`, `missionGenerate`, `planLogic`, the mission
  interview were all deleted). Any pre-existing docs are orphaned and harmless (default-deny); the Planner
  regenerates from real analytics on first open. Do not use.
- `aiPlanner/{uid}` — **the QuanAI Planner** (ADR-046, replaces `aiMissions`): a living, adaptive, syllabus-driven
  study plan. `{v:2, uid, examId, examName, examLabel, syllabusId, examDate, dailyMinutes, daysPerWeek,
  prepLevel, preferredTime, goal, block{index, startDate, endDate, generatedAt, rationale, days[]{date, dow,
  kind:'study'|'revision'|'mock'|'buffer'|'rest'|'missed', tasks[]{topicId, label, section, estMin, priority,
  difficulty, drillable, reason, kind:'learn'|'revise'|'mock', done, completedAt, result}}}, topicState{<topicId>:
  {coveragePct, masteryEst, firstStudiedAt, lastStudiedAt, lastRevisedAt, nextRevisionDue, timesScheduled}},
  blockHistory[≤12]{index, startDate, endDate, completedTasks, scheduledTasks, adherencePct, readiness},
  readiness{score, band, parts{}}, forecast{...}, createdAt, updatedAt}`. Server-written; default-deny (client
  reads/writes via `api/ai?action=planner` ops get/setup/toggle/regen). **The exam syllabi themselves are NOT in
  Firestore** — they're bundled reference data in `main-app/data/syllabus.js` (`SYLLABUS_VERSION`), read by both
  client and server. The planner — and Coach/Insights (ADR-048) — accept a NON-AUTHORITATIVE `clientStats` floor
  (raise-only, size-capped in `api/ai.js`) so a stale `users.stats` doc can't show false-zero accuracy right
  after a live session (during the debounced `syncStats` write window).
- `users/{uid}/aiEvents/{id}` — owner **create-only, immutable** AI interaction log `{feature, type, meta, plan,
  ts, createdAt}` (`shown|opened|chip_tap|deeplink|helpful_yes|helpful_no`). Excluded from the blanket subcollection
  write grant; rolled up daily by `services/aiCron.js`.
- `systemMetrics/ai_engagement_{YYYY-MM-DD}` — admin-only daily rollup `{date, totalEvents, features{<f>:{shown,
  opened, deeplink, helpfulRate, deeplinkRate}}}` written by the shared cron (no LLM).

### System / admin-only
- `systemMetrics/ai_daily_{YYYY-MM-DD}` — `{explanations, insights, wordProblems, totalTokensInput, totalTokensOutput, estimatedCostUSD, gptCalls, updatedAt}` (admin-only). All counters are `increment`-written at point of use (`aiService.trackGlobalAIUsage` + `trackGptCost`); the four token/cost fields were added 2026-06-11 (Super Admin Phase 1) so the GPT Cost Center reads pre-aggregated daily cost without scanning.
- **`auditLogs/{auto}`** — **platform-wide immutable audit trail** (admin-only read; Admin-SDK write; client create/update/delete **denied** by rules). One doc **per admin action**: `{ts (serverTimestamp), actorUid, actorEmail, action, category ('entitlement'|'coaching'|'content'|'ai'|'user'|'system'), targetType, targetId, summary, before, after}`. Written by the shared `super-admin-app/api/_lib/audit.js#writeAuditLog` from every super-admin mutation endpoint. Append-only by design — see [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md) and [DECISION_LOG.md](DECISION_LOG.md) ADR-012.
- **`securityEvents/{auto}`** (Phase 5, ADR-018) — **append-only security / login event log.** Admin-only **read**; **create** is allowed from the client login paths of all three apps (a failed login is unauthenticated, so the create rule cannot require `request.auth`) but is **strictly shape-validated** (fixed key allowlist; `type ∈ {failed_login, suspicious_access, admin_login, payment_failure}`; `createdAt == request.time`; **SHA-256 `emailHash` only — never the raw email, never the password**; size-capped strings); **update/delete denied** (immutable). Shape: `{type, app:'main'|'super-admin'|'coaching', emailHash|null, reason|null, errorCode|null, uid|null, userAgent|null, createdAt:serverTimestamp}`. Written client-side by the inline-copied `SecurityEvents.record()` helper in each app, and server-side via the Admin SDK for `payment_failure` (`main-app payment.js` verify failures + `payment/webhook.js` `payment.failed`). Read by the Security Center (`system?action=security` — recent feed + 24h per-type `count()` + posture). Capture is best-effort (never blocks the auth flow). **Open-write caveat:** Firebase App Check is not yet enabled (drift M7) — the bounded-abuse rationale + hardening follow-up are in [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md) §6 and [DECISION_LOG.md](DECISION_LOG.md) ADR-018.
- `config/aiBudget` — admin-only AI-spend budget config: `{monthlyBudgetUSD, warnPct (default 80), critPct (default 90), updatedAt, updatedBy}`. Read/written only via `api/admin/ai?action=budget` (Admin SDK; client denied by default-deny). The GET computes month-to-date spend by summing `systemMetrics/ai_daily_{YYYY-MM-*}.estimatedCostUSD` (≤31 doc reads). (Phase 3, ADR-015.)
- **Emergency Controls config (Super Admin V2, ADR-021)** — break-glass flags: `config/maintenance {enabled, message?, updatedBy, updatedAt}`, `config/aiKillSwitch {enabled, updatedBy, updatedAt}`, `config/paymentKillSwitch {enabled, updatedBy, updatedAt}`. Written **only** via `super-admin system?action=config-set` (Admin SDK + immutable `auditLogs`). **Client-readable** (unlike `aiBudget`) so the student app enforces them: `config/maintenance` is world-readable (renders the pre-auth maintenance screen), `aiKillSwitch`/`paymentKillSwitch` readable by authenticated users; all three are client-**write-denied**. main-app honors them (`aiService` skips OpenAI, `paymentService` skips Razorpay, boot shows a maintenance screen for non-admins). See [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md) §6A.
- `notificationLogs/{id}`, `scheduledNotices/{id}` — admin-only (rules deny client).
- `metrics/{dateStr}` + `metrics/latest` — platform snapshot (admin-only), refreshed **daily** by the Vercel-Cron endpoint `super-admin-app/api/cron/sweep.js` and read **O(1)** by the admin dashboard (which additionally reads today's `systemMetrics/ai_daily_*` doc **live** so the GPT Cost Center is real-time, not frozen to the last snapshot). DAU/MAU/newToday counts use a disjoint Timestamp+ISO-string `count()` union (mixed-type `updatedAt`/`createdAt`, M9). Shape: `{date, totalUsers, premiumUsers, trialUsers, freeUsers, dau, mau, newToday, revenueTotalINR, revenueTodayINR, revenue6mCount, revenue12mCount, totalTokensInput, totalTokensOutput, estimatedCostUSD, gptCalls, collectionCounts{users,questions,duels,payments,coachings,auditLogs,securityEvents}, updatedAt}`. Counts come from Firestore **`count()` aggregation** (not document scans) so the snapshot scales to 1M+ users; `metrics/latest` mirrors the newest day for instant dashboard load. (ADR-013.) **`collectionCounts` (Phase 5, ADR-018)** records per-collection `count()` sizes each day so the Firestore-Ops view (`system?action=firestore-ops`) shows current sizes + a day-over-day growth series, and powers the Firestore-growth-spike alert — all with no on-demand scans. Absent on pre-Phase-5 metrics docs (readers tolerate its absence).

### Deprecated
- `duelInvitations/{id}` — removed; rules deny all. Do not use.

---

## 4. Indexes (`firestore/indexes/firestore.indexes.json`)

| Collection | Fields | Used by |
|---|---|---|
| questions | status, topic, difficulty | question fetch |
| questions | status, topic | |
| questions | status, difficulty | |
| questions | approved, status, type, topic, difficulty | `generateWordProblems` 5-field query |
| duels | status, createdAt | `cleanupExpiredDuels` |
| entitlementLogs | **COLLECTION_GROUP** adminId (ASC), timestamp (DESC) | Fixed audit M2 (2026-06-11): scope corrected to `COLLECTION_GROUP` (docs live in `users/{uid}/entitlementLogs`) and keyed on `adminId`+`timestamp` (fields the docs actually contain) → supports "an admin's actions newest-first across all users". Deploy with `firebase deploy --only firestore:indexes`. |
| notificationLogs | coachingId, timestamp DESC | coaching notices |
| users | coachingId, **stats.lastActiveMs** DESC | coaching roster order + keyset pagination (ADR-029 — replaced `stats.lastActiveDate`, a non-sortable toDateString). **ADR-032:** `register` now initializes `stats.lastActiveMs`/`lastActiveDate` on the user doc, so this orderBy no longer silently drops never-practiced joiners (Firestore excludes docs missing the orderBy field); existing stat-less users backfilled via `firestore/diagnostics/backfill-stats-lastactive.js`. |
| auditLogs | category (ASC), ts (DESC) | audit center filtered by category |
| auditLogs | actorUid (ASC), ts (DESC) | "an admin's actions" newest-first |
| auditLogs | targetId (ASC), ts (DESC) | all actions against one user/coaching |
| aiRequests | feature (ASC), ts (DESC) | AI cost/usage analytics by feature, newest-first (`api/ai.js` request log). |
| aiRequests | uid (ASC), ts (DESC) | per-user AI request history, newest-first. |
| users | accountStatus (ASC), purgeAfter (ASC) | cleanup-sweep cron: archived users past their hold |
| securityEvents | type (ASC), createdAt (DESC) | Security Center per-type 24h `count()` + payment-failure/login-failure spike alerts (Phase 5, ADR-018). The plain `orderBy(createdAt desc)` recent feed uses the single-field auto-index (no composite). |
| users | plan (ASC), planExpiry (ASC) | **ADR-023** — accurate active-premium accounting via `count()` range aggregations: expired-unswept (`plan=='premium' && planExpiry<now`) and expiring (`planExpiry` in `(now, now+N]`) on the dashboard / alerts / security / revenue-intel. Replaces the old `.limit(1000)` + in-memory scans. |
| users | plan (ASC), fcmToken (ASC) | **ADR-023** — premium-segment broadcast filters by `plan=='premium' && fcmToken!=null` server-side instead of reading every token-holder and filtering in memory. |
| users | coachingId (ASC), plan (ASC) | **ADR-027** — coaching-scoped premium `count()` (Growth/Adoption) without a full-roster scan. |
| users | coachingId (ASC), isTrial (ASC) | **ADR-027** — coaching-scoped trial `count()` (Growth/Adoption). |
| users | coachingId (ASC), createdAt (ASC) | **ADR-027** — coaching-scoped "new students this week" via a `createdAt` range `count()`. |
| duels | participantUids (ARRAY-CONTAINS), status (ASC) | **ADR-031** — Duel V2 reaper/sweep: find a user's in-flight rooms / abandoned-`active` rooms past deadline by a static-field composite (the per-uid `participants.<uid>` field-path query is **not** used; primary recovery is the `users.activeDuelId` mirror). |
| duelHistory | outcome (ASC), playedAt (DESC) | **ADR-068** — Battle Archive Wins/Losses/Draws filter, newest-first (per-user subcollection query; time-range stacks as a `playedAt` inequality). |
| duelHistory | difficulty (ASC), playedAt (DESC) | **ADR-068** — Battle Archive difficulty filter (Easy/Medium/Hard), newest-first. |
| duelHistory | opponentUid (ASC), playedAt (DESC) | **ADR-068** — Battle Archive rivalry view: one opponent's head-to-head history, newest-first. |

**Single-field auto-indexes** cover the v2 `users.plan == 'premium'`, `users.isTrial == true`, `users.fcmToken != null` queries (used by `enforceEntitlementExpiry`, the admin dashboard counts, and reminders). **Global Search (ADR-020)** prefix range queries on `users.email`, `users.profile.name`, `users.coachingId`, the user doc-id (`FieldPath.documentId()`), and `coachings.name` + doc-id also use single-field auto-indexes — **no new composite** is required unless a multi-field search variant is introduced. `aiStudyPlans (userId,status,createdAt)`: **verified ABSENT** in `firestore.indexes.json` (2026-06-24) and **not required** — `aiStudyPlans` is a legacy collection, superseded by `aiPlanner/{uid}` (one doc per user; the live planner needs no composite).

> **Action item (resolved 2026-06-24):** no `aiStudyPlans` composite needed — legacy collection superseded by `aiPlanner/{uid}` (doc-per-user). `entitlementLogs` index scope (M2) remains tracked.

---

## 5. Schema Drift Register (must shrink over time)

| ID | Drift | Canonical resolution | Status |
|---|---|---|---|
| M1 | `usage/ai` (server) vs `ai/usage` (client mirror) | keep `usage/ai`; remove client seed | **Resolved 2026-06-11** |
| M2 | `entitlementLogs` index scope/field mismatch | COLLECTION_GROUP + existing field | **Resolved 2026-06-11** (deploy indexes) |
| M3 | `premiumPlusPlan` legacy `yearly`/`6_months` | writes already canonical; backfill legacy docs | **Resolved 2026-06-11** — migration applied; 0 legacy docs found (data already canonical) |
| M4 | coaching `isActive` vs `status` | `isCoachingActive()` helper | **Resolved 2026-06-11** |
| M5 | duplicate admin auth wrappers | single canonical `withAdminAuth` (rate-limited) | **Resolved 2026-06-11** |
| M8 | `studentsCount` vs `studentCount` drift + double-count | canonical `studentCount`, function-only writer, reconcile script | **Resolved 2026-06-11** — reconcile applied (2 coachings corrected, legacy `studentsCount` dropped); re-run shows 0 drift. **Reopened as M8b ↓ (the "function-only writer" assumption is invalid on Spark).** |
| M8b | `studentCount` permanently stale on **Spark** — its sole writer (`syncCoachingStudentCount` trigger) never runs | request-path transactional maintenance (register/claim/reassign/purge/delete) + live `count()` at detail + trigger neutralized (ADR-032) | **Resolved 2026-06-13** — code landed; one-time backfill (`backfill-student-counts.js`) reconciles existing coachings (owner-authorized run). |
| M10 | `stats.lastActiveMs` absent on never-practiced users → roster `orderBy` silently excludes them | initialize `stats` at register + backfill (ADR-032) | **Resolved 2026-06-13** — register initializes it; `backfill-stats-lastactive.js` covers existing docs. |
| M9 | mixed timestamp types | prefer `serverTimestamp()` server-side | Open (tolerated — all readers normalize; convention documented, no churn) |
| SA1 | admin "audit" readers (`payments.js`, `system.js`) queried a **root** `entitlementLogs` never written (writes go to the per-user subcollection) → empty dashboards | repoint readers to the new root `auditLogs`; every mutation now writes there | **Resolved 2026-06-11** (Super Admin Phase 1) |
| SA2 | `system.js` AI-token metric queried `collectionGroup('usage').where('tokens'>0)` — no `tokens` field exists → always 0 | persist real token/cost via `aiService.trackGptCost`; dashboard reads `metrics/latest`/`systemMetrics` | **Resolved 2026-06-11** (Super Admin Phase 1) |

Resolutions are recorded in [CHANGELOG.md](CHANGELOG.md) as they land.
