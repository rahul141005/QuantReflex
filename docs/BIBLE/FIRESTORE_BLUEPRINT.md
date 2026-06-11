# QuantReflex Firestore Blueprint

**Doc Version:** 1.1 · **Firestore Version:** 2.1 (see [VERSIONS.md](VERSIONS.md))
**Status:** Source of Truth for all Firestore collections, fields, paths, and indexes.
**Firebase project:** `quant-reflex-trainer`
**Last updated:** 2026-06-11
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
| `email` | string | — | admin | set at register |
| `profile` | map `{name, createdAt}` | `{}` | client/admin | display name |
| `settings` | map | defaults | client | theme, sound, vibration, difficulty, dailyGoal, etc. |
| `stats` | map | defaults | client | attempts, streaks, categoryStats, mistakes[], responseTimes[], dailyHistory{} |
| `quickLinks` | array | seeded | client | |
| `customTopics` | array | `[]` | client | |
| `customFormulas` | map | `{}` | client | |
| `bookmarks` | array | `[]` | client | |
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

**Removed in v2** (do not reintroduce): `isPremium, hasPaid, isEarlyUser, isPremiumPlus, premiumPlusPlan, premiumPlusExpiry, premiumPlusStatus, lastPremiumPlusPaymentId`.

**Resolution rule:** `premium ⟺ plan==='premium' && (planExpiry==null || planExpiry>now)`. Expired premium/trials self-heal to free on read (server `resolvePlan`, client `getAccessState`/`_enforcePremiumExpiry`).

**Entitlement write rule (client):** clients may only DOWNGRADE — `plan`→`'free'`, and clear `planType/planExpiry/planSource/trialEnd`→null, `isTrial`→false. Grants are admin-only. Enforced by `entitlementFieldsSafe()` in rules. See [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md).

### 2.1 Subcollections of `users/{uid}`

| Path | Authority | Writer | Shape |
|---|---|---|---|
| `practiceSessions/{auto}` | append log | client | `{mode, category, score, total, duration, date, timestamp}` |
| `performance/overall` | derived mirror | client | `{totalAttempted, totalCorrect, accuracy, avgTime, bestStreak, currentStreak, dailyStreak, ...}` |
| `practice/data` | derived mirror | client | `{mistakes[], savedQuestions[], updatedAt}` |
| `profile/data` | derived mirror | client | `{name, email, premium mirror flags, updatedAt}` |
| **`usage/ai`** | **AI quota + cost — SOURCE OF TRUTH** | admin (register, aiService) | `{wordProblemsUsedLifetime, wordProblemsUsedToday, wordProblemsLastDate, explanationsUsed, lastUsageDate, insightsGeneratedDate, gptTokensInput, gptTokensOutput, gptCostUSD, gptCalls}` — the four `gpt*` counters (`increment`-written by `aiService.trackGptCost` on every OpenAI call) are per-user token/cost telemetry (added 2026-06-11, Super Admin Phase 1). |
| `ai/usage` | **removed (audit M1, 2026-06-11)** | — | legacy orphaned client mirror; client seed deleted. Do not recreate. |
| `notifications/{id}` | per-user notices | admin/client(read) | `{title, body, type, isRead, timestamp}` |
| `entitlementLogs/{auto}` | admin audit (per-user, RETAINED for back-compat) | admin | `{type, action, adminId, timestamp, details}` — **no `uid` field** (it is the doc's parent). The **canonical platform-wide immutable audit trail is now the root `auditLogs` collection** (§3); entitlement grants write to both. |

> **Canonical AI-usage path is `users/{uid}/usage/ai`.** Do not write new logic against `ai/usage`.

---

## 3. Top-level collections

### `questions/{auto}`
`{type:'word_problem', topic, difficulty:'easy'|'medium'|'hard', question, options[], answer:number, explanation|steps, approved:bool, status:'draft'|'active'|'archived', premiumOnly:bool}` — read: any authed user; write: admin only.

### `coachings/{id}`
`{name, status:'active'|'suspended'|'deleted', isActive:bool, registrationToken, adminUid, adminEmail, studentCount, createdAt, updatedAt}` — read: coaching members (claim match); write: admin only.
**`studentCount` (canonical, audit M8 fixed 2026-06-11):** denormalized counter written **only** by the `syncCoachingStudentCount` Cloud Function. The legacy `studentsCount` field (initialized by admin create, incremented by claim-coaching) is **removed**; all writers/readers now use `studentCount`. Reconcile drift with `firestore/migrations/2026-06-11-reconcile-studentCount.js`.
**Canonical active check (audit M4, fixed 2026-06-11):** use `isCoachingActive(data)` in `main-app/api/_lib/middleware.js` — active IFF `status === 'active'` when `status` is present, else fallback `isActive !== false`. All three consumers (`register`, `claim-coaching`, `validate-coaching`) now use this helper; previously claim/validate only checked `status === 'expired'` (never written) and could let a `suspended` coaching through.

### `duels/{id}`
`{status(state machine), createdBy, participants{uid→entry}, config, questions, questionIds, targetUid?, createdAt, expiredAt?}`. State machine and participant rules in [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md).

### `payments/{paymentId}`
`{uid, plan, amount, status, expiry, orderId, claimedAt}` (here `plan` = the purchased `planType`, e.g. `premium_6m`; `amount` = price in **paise** (int), `status:'paid'`) — **idempotency lock.** Written by `aiService.activatePremium` on every Premium purchase. `amount`/`status` were added 2026-06-11 (Super Admin Phase 1); **historical docs may lack `amount`**, so the revenue rollup falls back to the plan→price map (`premium_6m`=29900, `premium_12m`=49900). The lock rejects reuse of a `paymentId` by a different uid (`PAYMENT_REPLAY`). Read/delete: owner; create/update: admin only.

### AI caches
- `explanations/{contentHash}` — `{question, answer, category, concept, steps[], mistake, tip, usageCount, createdAt}`
- `aiCoachV2/{uid_coach_YYYY-M-D}` — `{today, tomorrow, thisWeek, recommendations, userId, date}`
- `aiInsightsV2/{uid_insights_YYYY-M-D}` — `{learningPattern, accuracyTrend, ..., aiSummary}`
- `aiStudyPlans/{auto}` — `{userId, examName, status:'draft'|'active'|'archived', rationale, phases[], timetable[], progress{}, createdAt}`
- `aiInsights/{id}`, `aiStudyPlans` legacy reads — owner-read, admin-write.

### System / admin-only
- `systemMetrics/ai_daily_{YYYY-MM-DD}` — `{explanations, insights, wordProblems, totalTokensInput, totalTokensOutput, estimatedCostUSD, gptCalls, updatedAt}` (admin-only). All counters are `increment`-written at point of use (`aiService.trackGlobalAIUsage` + `trackGptCost`); the four token/cost fields were added 2026-06-11 (Super Admin Phase 1) so the GPT Cost Center reads pre-aggregated daily cost without scanning.
- **`auditLogs/{auto}`** — **platform-wide immutable audit trail** (admin-only read; Admin-SDK write; client create/update/delete **denied** by rules). One doc **per admin action**: `{ts (serverTimestamp), actorUid, actorEmail, action, category ('entitlement'|'coaching'|'content'|'ai'|'user'|'system'), targetType, targetId, summary, before, after}`. Written by the shared `super-admin-app/api/_lib/audit.js#writeAuditLog` from every super-admin mutation endpoint. Append-only by design — see [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md) and [DECISION_LOG.md](DECISION_LOG.md) ADR-012.
- `config/aiBudget` — admin-only AI-spend budget config: `{monthlyBudgetUSD, warnPct (default 80), critPct (default 90), updatedAt, updatedBy}`. Read/written only via `api/admin/ai-budget` (Admin SDK; client denied by default-deny). The GET computes month-to-date spend by summing `systemMetrics/ai_daily_{YYYY-MM-*}.estimatedCostUSD` (≤31 doc reads). (Phase 3, ADR-015.)
- `notificationLogs/{id}`, `scheduledNotices/{id}` — admin-only (rules deny client).
- `metrics/{dateStr}` + `metrics/latest` — platform snapshot (admin-only), refreshed **daily** by the Vercel-Cron endpoint `super-admin-app/api/cron/daily-snapshot.js` and read **O(1)** by the admin dashboard (which additionally reads today's `systemMetrics/ai_daily_*` doc **live** so the GPT Cost Center is real-time, not frozen to the last snapshot). DAU/MAU/newToday counts use a disjoint Timestamp+ISO-string `count()` union (mixed-type `updatedAt`/`createdAt`, M9). Shape: `{date, totalUsers, premiumUsers, trialUsers, freeUsers, dau, mau, newToday, revenueTotalINR, revenueTodayINR, revenue6mCount, revenue12mCount, totalTokensInput, totalTokensOutput, estimatedCostUSD, gptCalls, updatedAt}`. Counts come from Firestore **`count()` aggregation** (not document scans) so the snapshot scales to 1M+ users; `metrics/latest` mirrors the newest day for instant dashboard load. (ADR-013.)

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
| users | coachingId, stats.lastActiveDate DESC | coaching dashboards |
| auditLogs | category (ASC), ts (DESC) | audit center filtered by category |
| auditLogs | actorUid (ASC), ts (DESC) | "an admin's actions" newest-first |
| auditLogs | targetId (ASC), ts (DESC) | all actions against one user/coaching |
| users | accountStatus (ASC), purgeAfter (ASC) | cleanup-sweep cron: archived users past their hold |

**Single-field auto-indexes** cover the v2 `users.plan == 'premium'`, `users.isTrial == true`, `users.fcmToken != null` queries (used by `enforceEntitlementExpiry`, the admin dashboard counts, and reminders). `aiStudyPlans (userId,status,createdAt)` requires a composite — `UNVERIFIED` whether present; `getActiveStudyPlan` orders by `createdAt` with two equality filters and will require `userId,status,createdAt`.

> **Action item (tracked):** add composite index for `aiStudyPlans (userId ASC, status ASC, createdAt DESC)` if not auto-created; fix `entitlementLogs` index scope (M2).

---

## 5. Schema Drift Register (must shrink over time)

| ID | Drift | Canonical resolution | Status |
|---|---|---|---|
| M1 | `usage/ai` (server) vs `ai/usage` (client mirror) | keep `usage/ai`; remove client seed | **Resolved 2026-06-11** |
| M2 | `entitlementLogs` index scope/field mismatch | COLLECTION_GROUP + existing field | **Resolved 2026-06-11** (deploy indexes) |
| M3 | `premiumPlusPlan` legacy `yearly`/`6_months` | writes already canonical; backfill legacy docs | **Resolved 2026-06-11** — migration applied; 0 legacy docs found (data already canonical) |
| M4 | coaching `isActive` vs `status` | `isCoachingActive()` helper | **Resolved 2026-06-11** |
| M5 | duplicate admin auth wrappers | single canonical `withAdminAuth` (rate-limited) | **Resolved 2026-06-11** |
| M8 | `studentsCount` vs `studentCount` drift + double-count | canonical `studentCount`, function-only writer, reconcile script | **Resolved 2026-06-11** — reconcile applied (2 coachings corrected, legacy `studentsCount` dropped); re-run shows 0 drift |
| M9 | mixed timestamp types | prefer `serverTimestamp()` server-side | Open (tolerated — all readers normalize; convention documented, no churn) |
| SA1 | admin "audit" readers (`payments.js`, `system.js`) queried a **root** `entitlementLogs` never written (writes go to the per-user subcollection) → empty dashboards | repoint readers to the new root `auditLogs`; every mutation now writes there | **Resolved 2026-06-11** (Super Admin Phase 1) |
| SA2 | `system.js` AI-token metric queried `collectionGroup('usage').where('tokens'>0)` — no `tokens` field exists → always 0 | persist real token/cost via `aiService.trackGptCost`; dashboard reads `metrics/latest`/`systemMetrics` | **Resolved 2026-06-11** (Super Admin Phase 1) |

Resolutions are recorded in [CHANGELOG.md](CHANGELOG.md) as they land.
