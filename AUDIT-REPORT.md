# QuantReflex — Absolute Maximum Production Audit

**Audit date:** 2026-06-11
**Scope:** Full monorepo (`main-app`, `super-admin-app`, `coaching-admin-app`, `functions`, `firestore`, `shared`)
**Method:** Read-only source inspection. Every finding cites an exact file path and location. Claims that could not be confirmed in code are marked `UNVERIFIED`.
**Verdict at a glance:** Architecturally sound and security-conscious, but **NOT launch-ready as-is** — one revenue-blocking bug breaks all Premium+ purchases, and several scaling/consistency defects will surface between 1k–100k users.

> **Evidence-integrity note.** Dynamic behaviour (live Firestore state, Razorpay responses, deployed rules) was not executed. Findings are derived from static code reading. Where a claim depends on runtime/config state I could not see, it is labelled `UNVERIFIED`.

---

## 1. Executive Summary

QuantReflex is a vanilla-JS + Firebase + Vercel monorepo for a mental-math/aptitude SaaS. The engineering is unusually disciplined for its stage: zero-trust Firestore rules, server-authoritative entitlements, HMAC-verified payments with a webhook safety net, and a clean app-isolation model.

However, the audit found **one CRITICAL revenue-blocking defect** and a cluster of high-severity scaling/consistency issues:

| # | Severity | One-line | Evidence |
|---|----------|----------|----------|
| C1 | 🔴 CRITICAL | **All Premium+ checkouts throw before Razorpay opens** — `description` is an undefined variable | [paywall.js:549](main-app/js/paywall.js:549) |
| C2 | 🔴 CRITICAL | **Bulk entitlement grant fails for any coaching >250 students** — Firestore 500-op batch limit exceeded (2 writes/user) | [entitlements.js:49-102](super-admin-app/api/admin/entitlements.js:49) |
| H1 | 🟠 HIGH | Lifetime `premium` (₹89) has **no idempotency/replay protection** and is not bound to the paying user | [verify.js:40-55](main-app/api/payment/verify.js:40) |
| H2 | 🟠 HIGH | Free AI quota (`WP_FREE_LIMIT=5`) is **bypassable via concurrent requests** (non-transactional check-then-consume) | [aiService.js:198-307](main-app/services/aiService.js:198) |
| H3 | 🟠 HIGH | `/api/auth/register` is **public with no rate limit + CORS `*`** → account-creation/spam abuse | [register.js:17-30](main-app/api/auth/register.js:17) |
| M1 | 🟡 MED | **AI-usage schema drift** — server writes `usage/ai`, client seeds `ai/usage`; the two never reconcile | [register.js:102](main-app/api/auth/register.js:102) vs [firestore-sync.js:398](main-app/js/firestore-sync.js:398) |
| M2 | 🟡 MED | `entitlementLogs` index is **mismatched** (wrong scope + field that docs don't contain) | [firestore.indexes.json:47-54](firestore/indexes/firestore.indexes.json:47) |

**Launch Readiness Score: 62 / 100** (see §21). C1 alone blocks launch of the highest-value tier; it is a one-line fix.

---

## 2. Repository Blueprint

```
QuantReflex/
├── main-app/            Student PWA (vanilla JS SPA) → quantreflex.app
│   ├── js/              35 client modules (layered load order, see index.html)
│   ├── api/             Vercel serverless: ai/, payment/, auth/, account/, claim-coaching, notifications
│   └── services/        aiService, paymentService, claimsService (server-side, Admin SDK + OpenAI + Razorpay)
├── super-admin-app/     Admin panel → dev.quantreflex.app
│   └── api/admin/       users, entitlements, coachings, questions, payments, ai-usage, duels, notifications, system
├── coaching-admin-app/  Coaching panel → admin.quantreflex.app (functional API, lean UI)
│   └── api/coaching/    auth, students, dashboard, leaderboard, notices, insights
├── functions/           Firebase scheduled + trigger functions (Node 24)
├── firestore/           rules/firestore.rules, indexes/firestore.indexes.json, schema-docs/
├── shared/              Reference-only contracts (NOT bundled; inline-copied per app)
└── scripts/             PowerShell structure/import validators
```

**Dependency model.** Each app is an independent Vercel deployment rooted at its own directory; there is no bundler, so `shared/` cannot be imported at runtime — utilities (`_toMillis`, `_escapeHtml`, Firebase config) are **inline-copied** into each app. All apps and functions target a single Firebase project: `quant-reflex-trainer`.

**Dead / legacy / duplicated code (evidence):**
- `duelInvitations` collection — explicitly **deprecated**, rules deny all access. [firestore.rules:270-275](firestore/rules/firestore.rules:270)
- `generateWordProblems` — comment says "DEPRECATED: No longer calls OpenAI" but still exported and used as the question source. [aiService.js:329-409](main-app/services/aiService.js:329)
- `FirestoreSync.updateCoachingId` is **defined twice** in the same returned object literal — the second definition (delegating to `claimCoaching`) silently wins; the first (queueing a direct field write) is dead. [firestore-sync.js:1055](main-app/js/firestore-sync.js:1055) and [firestore-sync.js:1255](main-app/js/firestore-sync.js:1255)
- `_toMillis` reimplemented ≥3 times with subtly different branch order (paywall, firestore-sync, aiService `_toExpiryMillis`, coaching middleware `toMillis`). Duplication is by-design (no bundler) but is drift-prone.

---

## 3. Feature Inventory

| Feature | Key files | Collections | Auth | Pay | AI | Status |
|---|---|---|---|---|---|---|
| Practice drills | drill-engine.js, questions.js | users, questions | ✓ | Free=20/day | — | WORKING |
| Adaptive/Custom training | adaptive-state.js, practice-modes.js | users | ✓ | Premium | — | WORKING |
| Review mistakes | practice/data subcol | users/*/practice | ✓ | Premium | — | WORKING |
| Stats / analytics | stats-view.js, performance/overall | users/*/performance | ✓ | Premium | — | WORKING |
| Math Duel | duel-core/manager/ui.js | duels | ✓ | Premium+ | — | WORKING (UNVERIFIED at concurrency) |
| AI explanation | api/ai/explain.js | explanations | ✓ | Premium+ | ✓ | WORKING |
| AI coach / insights | api/ai/insights.js | aiCoachV2, aiInsightsV2 | ✓ | Premium+ | ✓ | WORKING |
| AI study plan | api/ai/study-plan.js | aiStudyPlans | ✓ | Premium+ | ✓ | WORKING |
| Premium purchase (₹89) | paywall.js, payment/* | users, payments | ✓ | ✓ | — | WORKING |
| **Premium+ purchase (₹299/₹499)** | paywall.js, payment/* | users, payments | ✓ | ✓ | — | **BROKEN (C1)** |
| Coaching enrollment | claim-coaching.js, register.js | users, coachings | ✓ | — | — | WORKING |
| Admin entitlement grant | admin/entitlements.js | users, entitlementLogs | admin | — | — | PARTIAL (C2: breaks >250 bulk) |
| Push reminders | functions/index.js | users.fcmToken | — | — | — | WORKING |
| Coaching dashboards | coaching-admin-app/api | users, coachings | coaching_admin | — | — | WORKING (UNVERIFIED UI depth) |

---

## 4. Firestore Blueprint (reconstructed from code)

```
users/{uid}                     ← root, source of truth
  uid, email, profile{name,createdAt}, settings{...}, stats{...}
  quickLinks[], customTopics[], customFormulas{}, bookmarks[]
  isPremium, hasPaid, isTrial, trialEnd, isEarlyUser
  isPremiumPlus, premiumPlusPlan, premiumPlusExpiry, premiumPlusStatus
  coachingId, fcmToken, lastPaymentId, lastPremiumPlusPaymentId
  createdAt, updatedAt
  ├─ practiceSessions/{auto}     drill history (append)
  ├─ performance/overall         derived accuracy/streaks (client dual-write)
  ├─ practice/data               mistakes[], savedQuestions[]
  ├─ profile/data                name, email, premium mirror
  ├─ usage/ai                    AI quota — SERVER source of truth (register + aiService)
  ├─ ai/usage                    AI quota — CLIENT mirror (firestore-sync seed)  ⚠ DRIFT (M1)
  ├─ notifications/{id}          per-user notices
  └─ entitlementLogs/{auto}      admin audit (no uid field) ⚠ index mismatch (M2)

questions/{auto}    type, topic, difficulty, question, options[], answer, explanation/steps, approved, status, premiumOnly
coachings/{id}      name, status, isActive, registrationToken, adminUid, adminEmail, studentCount, createdAt, updatedAt
duels/{id}          status(state machine), createdBy, participants{}, config, questions, questionIds, targetUid, createdAt
payments/{paymentId} uid, plan, expiry, orderId, claimedAt   ← idempotency lock (Premium+ ONLY)
explanations/{hash}  cached AI explanation, usageCount
aiCoachV2/{uid_coach_date}, aiInsightsV2/{uid_insights_date}, aiStudyPlans/{auto}
systemMetrics/ai_daily_{YYYY-MM-DD}   global AI counters
notificationLogs, scheduledNotices    admin-only (rules deny client)
duelInvitations    DEPRECATED (rules deny all)
```

**Timestamp strategy.** Standard is ISO-8601 strings (`new Date().toISOString()`), but the codebase is **mixed**: `register.js` and some functions use `FieldValue.serverTimestamp()`, `firestore-sync._flushUpdates` uses `serverTimestamp()` for `updatedAt`, while `safeUserUpdate`/`unlockPremiumPlus` use ISO strings. Every consumer defensively normalizes (`_toMillis` handles number/string/Timestamp/Date), so this is tolerated but is latent fragility. [aiService.js:86-100](main-app/services/aiService.js:86), [firestore-sync.js:415-427](main-app/js/firestore-sync.js:415)

---

## 5. Cross-App Consistency Report

**Entitlement fields — CONSISTENT.** `isPremium / hasPaid / isTrial / trialEnd / isPremiumPlus / premiumPlusPlan / premiumPlusExpiry / premiumPlusStatus` are written and read with identical names across main-app sync, payment services, admin entitlements, and the expiry function. No `premiumStatus` vs `isPremium` style drift was found (contrary to the hypothetical in the brief).

**Confirmed mismatches:**

1. **M1 — AI usage path divergence.** Server quota logic reads/writes `users/{uid}/usage/ai` ([aiService.js:203](main-app/services/aiService.js:203), [register.js:102](main-app/api/auth/register.js:102)), but the client seeds `users/{uid}/ai/usage` ([firestore-sync.js:398-403](main-app/js/firestore-sync.js:398)). The header comment even calls `ai/usage` a "mirror" of `usage/ai` ([firestore-sync.js:23](main-app/js/firestore-sync.js:23)). The mirror is never read by anything → orphaned writes + confusion risk. **Impact:** wasted writes, two divergent "AI usage" docs per user, debugging hazard. **Fix:** remove the `ai/usage` client seed, or have the client read/display from `usage/ai`.

2. **`premiumPlusPlan` legacy value drift.** Admin API has historically stored `'yearly'` / `'6_months'`, while the rest of the system expects `'plus_yearly'` / `'plus_6month'`. The client compensates at read time ([firestore-sync.js:1101-1105](main-app/js/firestore-sync.js:1101)). **Impact:** any consumer that does NOT apply this normalization (e.g. an admin report) will misclassify plans. **Fix:** normalize on write in `admin/entitlements.js` (it already writes canonical values at [entitlements.js:84](super-admin-app/api/admin/entitlements.js:84), so backfill legacy docs).

3. **`coachings` active-flag ambiguity.** `register.js` checks `cData.isActive === false || cData.status === 'suspended' || cData.status === 'deleted'` ([register.js:54](main-app/api/auth/register.js:54)) — i.e. it relies on BOTH an `isActive` boolean and a `status` string. If admin tooling sets only one, a "suspended" coaching could still accept signups. **Fix:** pick one canonical field (`status`) and derive the other.

4. **Admin middleware naming inconsistency.** `super-admin-app/api/admin/entitlements.js` uses `withAdminAuth` (sets `req.userId`) from `_lib/middleware`, while `_lib/firebase-admin.js` exposes `withAdmin` (sets `req.adminUid`). Two admin-auth wrappers coexist. Not a security hole, but a maintenance trap. [entitlements.js:1](super-admin-app/api/admin/entitlements.js:1), [firebase-admin.js:62-99](super-admin-app/api/_lib/firebase-admin.js:62)

---

## 6. Firebase Audit

- **Client init** is duplicated (by design) across the three apps' `js/firebase*.js`, all pointing at `quant-reflex-trainer`. Main-app enables offline persistence with `synchronizeTabs: true`. No duplicate-`initializeApp` crash risk (all guard on `admin.apps.length` / Firebase auto-singleton).
- **Admin SDK init** is repeated in many serverless files; each guards `if (!admin.apps.length)`. `aiService.js:9-23` parses `FIREBASE_SERVICE_ACCOUNT`; `firebase-admin.js`/`register.js`/coaching middleware do the same. Consistent and safe, but credential parsing is copy-pasted 6+ times.
- **App Check: NOT configured (UNVERIFIED in console).** No `firebase.appCheck()` usage anywhere in client code. This means the public Firebase config + Firestore client SDK is callable by any script that has a valid user token — rules are the only gate (they are strong; see §13). Recommend enabling App Check before 100k scale to blunt automated abuse.
- **Hosting/Functions/Messaging/Analytics:** Functions deploy via Firebase (Node 24, `maxInstances:10`). FCM used in `dailyPracticeReminder`. No Remote Config / no Storage rules file found (no Storage usage detected → acceptable).

---

## 7. Authentication Audit

- **Signup** is server-side via `/api/auth/register` (Admin `createUser` + atomic batch + custom token). Client `create` on `users/{uid}` is denied by rules ([firestore.rules:191](firestore/rules/firestore.rules:191)). Good.
- **Password policy:** min length 8, email regex only ([register.js:36-42](main-app/api/auth/register.js:36)). No complexity/breached-password check (acceptable; Firebase doesn't enforce more).
- **Role detection:** `admin:true`, `coaching_admin:true`+`coachingId` custom claims; students have none. Verified in all three middlewares. Claims are server-set only ([claimsService.js](main-app/services/claimsService.js)).
- **Entitlement claims propagation:** custom claims (`premium`, `premiumPlus`) take up to 1h unless force-refreshed. The client force-refreshes the token after payment ([paywall.js:372-373](main-app/js/paywall.js:372)). Firestore remains source of truth, so a stale claim does not grant access incorrectly — it only delays it. Good.
- **Session reset on logout/user-switch:** `resetSyncState()` + `AppState.clearAll()` + `qr_last_uid` guard prevent cross-user data leakage ([firestore-sync.js:186-218, 249-257](main-app/js/firestore-sync.js:186)). Strong.

**Findings:**
- **H3 — register endpoint is unauthenticated, un-rate-limited, CORS `*`.** [register.js:17-30](main-app/api/auth/register.js:17). An attacker can script unlimited account creation (each costs a Firebase Auth user + 2 Firestore writes). **Impact:** Auth user-pool pollution, Firestore cost, potential quota exhaustion. **Fix:** add per-IP rate limiting / hCaptcha / App Check on this route.
- **Password reset / multi-device / session recovery:** handled by Firebase Auth defaults; no custom code found → relies on Firebase (acceptable). `UNVERIFIED` whether a password-reset email template is configured in console.

---

## 8. Payment System Audit

**Flow:** client `create-order` → Razorpay UI → `verify` (signature + server-fetch order `paid` status + plan from order notes) → Admin-SDK entitlement write; **webhook** is an independent safety net (raw-body HMAC, idempotent). This is a **correct, well-designed** payment architecture.

Strengths:
- Signature verified with constant-time `crypto.timingSafeEqual` ([paymentService.js:94](main-app/services/paymentService.js:94), [webhook.js:94](main-app/api/payment/webhook.js:94)).
- Plan is taken from the **server-fetched order**, not client input ([verify.js:37](main-app/api/payment/verify.js:37), [paymentService.fetchOrderPlan:116](main-app/services/paymentService.js:116)).
- Webhook uses raw body (bodyParser disabled) and returns 500 to trigger Razorpay retry on transient failure ([webhook.js:196-220](main-app/api/payment/webhook.js:196)).
- Premium+ unlock is **transactional + idempotent** with cross-account replay protection ([aiService.unlockPremiumPlus:149-156](main-app/services/aiService.js:149)).

Findings:
- **C1 (CRITICAL, see §1/§9) — Premium+ purchase is broken client-side** before it ever reaches this backend.
- **H1 — Lifetime `premium` path lacks idempotency and user-binding.** In `verify.js`, the `premium` branch calls `safeUserUpdate(req.userId, …)` with **no `payments/{paymentId}` lock** ([verify.js:40-55](main-app/api/payment/verify.js:40)); likewise the webhook `premium` branch ([webhook.js:159-166](main-app/api/payment/webhook.js:159)). Two consequences:
  1. **Replay:** the same `(orderId, paymentId, signature)` triple can be POSTed by a *different* authenticated user (Bearer token = whoever calls) and will grant lifetime premium to that account too, since nothing checks `order.notes.uid === req.userId` and no payment doc is recorded. One ₹89 payment → premium on N accounts.
  2. **No audit row** for lifetime purchases in `payments/` (only Premium+ writes there), weakening reconciliation.
  **Fix:** write/transact a `payments/{paymentId}` doc for the `premium` plan too, reject if it exists for a different uid, and assert `order.notes.uid === req.userId` in `verify.js`.
- **Expiry timing:** Premium+ expiry is enforced live on every entitlement read (`isUserPremiumPlus` revokes on access, [aiService.js:124-131](main-app/services/aiService.js:124)) AND by the 6-hour function — so the "6-hour gap" only affects admin-dashboard counts, not access. Good.
- **`UNVERIFIED`:** webhook is only a safety net if the Razorpay webhook is actually configured to point at `/api/payment/webhook` with the matching `RAZORPAY_WEBHOOK_SECRET`. Confirm in Razorpay dashboard.

---

## 9. Premium Security Audit

**Server enforcement is genuine.** Every AI endpoint resolves `req.userPremium/req.userPremiumPlus` server-side from Firestore via `withAuth` ([middleware.js:175-184](main-app/api/_lib/middleware.js:175)); rules block client self-grants ([firestore.rules:65-111](firestore/rules/firestore.rules:65)). A user editing localStorage or `_memoryCache` only changes **UI**, not server authorization — verified: `unlockPremium`/`unlockPremiumPlus` on the client only mutate the in-memory cache and explicitly do **not** write entitlements ([firestore-sync.js:1129-1162](main-app/js/firestore-sync.js:1129)).

**Bypass surface tested (static):**
| Vector | Result |
|---|---|
| localStorage / `_memoryCache` edit | UI-only; server re-checks Firestore. **No bypass.** |
| Firestore client write `isPremium:true` | Denied by `entitlementFieldsSafe()`. **No bypass.** |
| Replay Premium+ payment | Blocked by transaction + payment-doc uid check. **No bypass.** |
| **Replay lifetime `premium` payment across accounts** | **Bypass (H1)** — no payment-doc lock on this tier. |
| Route/state manipulation to reach AI | Server returns 402/403 via entitlement check. **No bypass.** |

**C1 (CRITICAL):** `openPremiumPlusPayment` builds its Razorpay `options` with `description: description` at [paywall.js:549](main-app/js/paywall.js:549), but **no `description` variable is declared anywhere in that function** (the lifetime path uses the literal `'Lifetime Premium Access'`, [paywall.js:325](main-app/js/paywall.js:325), but the Plus path was never given one). In non-strict module scope this throws a `ReferenceError` while evaluating the object literal inside the `create-order` `.then()`, which is caught by the surrounding `.catch` at [paywall.js:643](main-app/js/paywall.js:643), surfacing "Could not create payment. Check your network and retry." **Every Premium+ (₹299/₹499) checkout fails before the Razorpay sheet opens.** The higher-value tier currently cannot be sold. **Fix:** add `var description = plan === 'plus_yearly' ? 'Premium+ 1 Year' : 'Premium+ 6 Months';` near the top of `openPremiumPlusPayment`.

---

## 10. AI Infrastructure Audit

- **Provider:** OpenAI `gpt-4o-mini`, key server-side only (`process.env.OPENAI_API_KEY`) ([aiService.js:1-34](main-app/services/aiService.js:1)). No client exposure. Good.
- **Caching:** explanations cached by content hash; coach/insights cached per-user-per-day; study plans persisted. Strong cost control. ([aiService.js:411-636](main-app/services/aiService.js:411))
- **Structured output:** coach/insights/study-plan use strict `json_schema`; explanation uses `_callAndParse` with a numeric self-consistency check (rejects if computed≠expected) and 2 retries. Robust. ([aiService.js:433-448, 638-674](main-app/services/aiService.js:433))
- **Rate limiting:** 20 req/hr/user, **per serverless instance, in-memory** ([middleware.js:81-116](main-app/api/_lib/middleware.js:81)). Not global — a user hitting multiple warm instances exceeds 20/hr. Defense-in-depth only (acknowledged in comments).

**Findings:**
- **H2 — Free AI quota race (TOCTOU).** `usageCache` is a module-level object; `checkWordProblemQuota` reads it and `consumeWordProblemQuota` increments-then-saves, **non-atomically** ([aiService.js:198-307](main-app/services/aiService.js:198)). N concurrent requests on one warm instance all read `wordProblemsUsedLifetime=0` and pass the `WP_FREE_LIMIT=5` gate before any save. **Impact:** free users can exceed the 5-explanation lifetime cap → uncontrolled OpenAI spend. **Fix:** enforce the quota with a Firestore transaction/`FieldValue.increment` and read-after-write, not an in-memory cache.
- **Memory growth:** `usageCache` is never evicted ([aiService.js:198](main-app/services/aiService.js:198)) — unbounded on long-lived instances. Low severity (Vercel recycles instances).
- **`_normalizeUsageDoc` mutates its input and `delete`s `lastUsedDate`** ([aiService.js:242-254](main-app/services/aiService.js:242)) — cosmetic, but mutating Firestore-returned data is a smell.

---

## 11. UI Quality Audit

The client is a hand-rolled vanilla SPA with layered script loading and explicit empty/loading/error handling in the paywall and views. A full per-screen visual audit requires running the app (out of scope for this static pass) — those items are `UNVERIFIED`. Code-level findings:

- **C1 manifests as a UX dead-end:** Premium+ button → spinner → generic network-error toast, with no path to success. High user-facing severity.
- **Paywall modal** has thorough guard logic (debounce, closing-animation retry, ESC handler, busy-state) — well done ([paywall.js:653-872](main-app/js/paywall.js:653)).
- **Toast-based error surfacing** is consistent (`showToast`), but several failure paths show the same generic "Could not create payment" string, masking root causes (this is exactly why C1 was hard to notice in production).
- `UNVERIFIED`: spacing/alignment/responsiveness/touch-targets/skeletons across all screens — needs a live render pass (recommend the `/run` or preview tooling).

---

## 12. State Management Audit

- **Single source of truth:** `AppState` (localStorage canonical `qr_*` keys) + `FirestoreSync._memoryCache`. Debounced 2s batch writes; drill-mode defers writes; server timestamp used for `updatedAt` to resist clock manipulation ([firestore-sync.js:626-723](main-app/js/firestore-sync.js:626)). Mature design.
- **Listener lifecycle:** only one realtime listener (`listenForNotifications`, limit 50, [firestore-sync.js:1195](main-app/js/firestore-sync.js:1195)). `UNVERIFIED` whether its unsubscribe is called on view teardown — if not, repeated view entry could leak listeners. Recommend confirming the caller stores and calls the returned unsubscribe.
- **Race protections:** `_syncGeneration` guards against cross-user write leakage after logout; `_flushInFlight` prevents overlapping flushes; retry with backoff and user-facing "changes may not be saved" toast. Strong.
- **Duplicate method definition** (`updateCoachingId`) — see §2; harmless but indicates the object literal is large enough to hide bugs.

---

## 13. Security Audit

**Firestore rules are strong (zero-trust).** Owner-only user docs, field-level entitlement lock (client can only revoke), read-only questions/coachings, owner-read/server-write payments & AI, default-deny ([firestore.rules](firestore/rules/firestore.rules)). Duel rules enforce immutables, a forward-only state machine, and own-entry-only participant edits.

| Sev | Finding | Evidence |
|---|---|---|
| HIGH | `register` public + no rate limit + CORS `*` (account-creation abuse) | [register.js:17-30](main-app/api/auth/register.js:17) |
| HIGH | Lifetime premium replayable across accounts (no payment-doc lock) | [verify.js:40-55](main-app/api/payment/verify.js:40) |
| MED | In-memory rate limits are per-instance, not global (AI + admin) | [middleware.js:81](main-app/api/_lib/middleware.js:81), [firebase-admin.js:32](super-admin-app/api/_lib/firebase-admin.js:32) |
| MED | App Check not enabled → only token+rules gate the public client SDK | (no appCheck usage found) |
| LOW | Any authenticated user can read **any** `waiting`/`waiting_for_acceptance` duel doc (participants, questionIds) | [firestore.rules:243-247](firestore/rules/firestore.rules:243) |
| LOW | Admin `withAdmin` sets CORS `Access-Control-Allow-Origin: *` (admin token still required) | [firebase-admin.js:66](super-admin-app/api/_lib/firebase-admin.js:66) |
| INFO | Razorpay **live** key id hardcoded in client (`rzp_live_…`) — public by design, but pins a live key in VCS | [paywall.js:6](main-app/js/paywall.js:6) |

**Secrets:** No server secrets committed. `.gitignore` excludes `.env*`/service accounts. Client Firebase config & Razorpay key-id are public by design. **Clean.**

---

## 14. PWA Audit

- Manifests present for all three apps (standalone, maskable icons, theme colors). Service workers exist (`main-app/service-worker.js`, `super-admin-app/sw.js` `qr-admin-cache-v8`, `coaching-admin-app/sw.js`).
- Admin SW: cache-first assets, network-only for `/api/`, skips cross-origin, cleans old caches, version-bumped per deploy ([super-admin-app/sw.js], per exploration). Sound pattern.
- `vercel.json` sets `no-cache` on `service-worker.js` and `/api/*` — correct for SW update delivery.
- **Risk:** SW cache versioning is **manual** (hand-bumped `v8`). If a deploy ships new assets without bumping the cache name, clients can serve stale JS — and a stale `paywall.js` is exactly how a fix for C1 could fail to reach users. **Fix:** derive the cache version from the build/commit hash. `UNVERIFIED`: offline/install/update behaviour not runtime-tested.

---

## 15. Scalability Audit

| Users | Outlook | Bottlenecks |
|---|---|---|
| 100 | ✅ Fine | None. |
| 1,000 | ✅ Fine | Per-instance rate limits weak but tolerable. |
| 10,000 | ⚠️ Watch | **C2:** any coaching with >250 students breaks bulk grant. `enforceEntitlementExpiry` (200/page) fine. Per-user 2-read entitlement on every AI call adds up. |
| 100,000 | ⚠️ Action needed | Admin list endpoints (`users`) need pagination/index discipline (`UNVERIFIED` — not fully read). `dailyPracticeReminder` caps at 5,000 tokens/run ([functions/index.js:278](functions/index.js:278)) → **silently skips users beyond 5,000** (no log of the drop). Global AI rate limit needed. App Check needed. |

**Specific scaling defects:**
- **C2 — bulk entitlement batch overflow.** [entitlements.js:49-102](super-admin-app/api/admin/entitlements.js:49): one `db.batch()` accumulates `update + entitlementLogs.set` per user (2 ops). Firestore caps a batch at **500 operations**, so **>250 matched users throws and aborts the whole grant**. Also the bulk query has no `.limit()` and loads all matched users into memory. **Fix:** chunk into ≤200-user batches and commit sequentially.
- **`dailyPracticeReminder` silent cap.** Caps at 5,000 tokens and `break`s with no log of how many users were skipped ([functions/index.js:277-279](functions/index.js:277)). At 100k users, most get no reminder and ops won't know. **Fix:** loop in pages without the hard cap (or log the truncation).
- **Denormalized `studentCount`** can drift if `syncCoachingStudentCount` fails (errors are caught and logged, not retried, [functions/index.js:371-388](functions/index.js:371)); no reconciliation job exists. **Fix:** periodic recount job.

---

## 16. Test Coverage Audit — Top Manual Test Cases (severity-ordered)

No automated tests exist in the repo (only PowerShell structure validators). The full "Top 100" would pad with low-value cases; the **highest-severity 25** that actually gate launch:

1. Premium+ 6-month checkout completes end-to-end (currently fails — C1). 🔴
2. Premium+ 1-year checkout completes end-to-end. 🔴
3. Lifetime ₹89 checkout completes and grants premium. 🔴
4. Replay the same paymentId with a *second* account's token → must be rejected (H1). 🔴
5. Bulk-grant premium to a coaching with >250 students → must succeed (C2). 🔴
6. Free user requests 6+ AI explanations rapidly/concurrently → 6th must be blocked (H2). 🟠
7. Edit `isPremium:true` from browser console via client SDK → must be denied by rules. 🟠
8. Premium+ expiry: set expiry in past → access revoked on next AI call. 🟠
9. Webhook fires after client `verify` already granted → no double effect, replay:true. 🟠
10. Webhook with bad signature → 401, no grant. 🟠
11. Register with existing email → 409. 🟠
12. Register flood (100 rapid calls) → rate-limited (currently NOT — H3). 🟠
13. Trial expiry with device clock rewound 1 day → still treated as expired (clock-safe). 🟠
14. Logout then login as different user → no stale stats/premium leak. 🟠
15. Duel state machine: attempt `completed → active` → denied by rules. 🟡
16. Duel: non-participant modifies another participant's entry → denied. 🟡
17. Coaching signup against `suspended` coaching → rejected (verify isActive vs status, §5.3). 🟡
18. AI study plan continuation: previously covered topics not repeated. 🟡
19. Offline → reconnect: pending sync flushes without data loss. 🟡
20. Concurrent two-tab edits (persistence synchronizeTabs) → no corruption. 🟡
21. Admin grant logs an `entitlementLogs` row that is actually queryable (M2 index). 🟡
22. Daily reminder with >5,000 token users → all targeted or truncation logged. 🟡
23. `coachingId` change → `studentCount` increments/decrements correctly. 🟡
24. Explanation cache hit returns identical payload and bumps usageCount. 🟢
25. Notification listener unsubscribes on view teardown (no leak). 🟢

---

## 17. Top Critical Findings (all that exist with hard evidence)

> Per the agreed methodology, counts are **honest, not padded to 50**. Two true CRITICALs were found.

1. **C1 — Premium+ checkout broken** (`description` undefined). [paywall.js:549](main-app/js/paywall.js:549). Fix: declare `description`. **One line. Highest priority.**
2. **C2 — Bulk entitlement grant aborts >250 students** (batch 500-op limit). [entitlements.js:49-102](super-admin-app/api/admin/entitlements.js:49). Fix: chunked batches.

---

## 18. Top High-Priority Findings

1. **H1** — Lifetime premium replayable + not user-bound. [verify.js:40-55](main-app/api/payment/verify.js:40), [webhook.js:159-166](main-app/api/payment/webhook.js:159).
2. **H2** — Free AI quota TOCTOU bypass. [aiService.js:198-307](main-app/services/aiService.js:198).
3. **H3** — `/api/auth/register` public, no rate limit, CORS `*`. [register.js:17-30](main-app/api/auth/register.js:17).
4. **H4** — `dailyPracticeReminder` silently drops users beyond 5,000. [functions/index.js:277-279](functions/index.js:277).
5. **H5** — SW cache version is manually bumped; a missed bump serves stale JS (could mask the C1 fix). [super-admin-app/sw.js] + [main-app/service-worker.js].

---

## 19. Top Medium-Priority Findings

1. **M1** — AI usage path drift `usage/ai` vs `ai/usage`. [register.js:102](main-app/api/auth/register.js:102), [firestore-sync.js:398](main-app/js/firestore-sync.js:398).
2. **M2** — `entitlementLogs` index mismatched: defined as COLLECTION scope on `uid`+`timestamp`, but docs are written to the **subcollection** `users/{uid}/entitlementLogs` with **no `uid` field** ([entitlements.js:90-97](super-admin-app/api/admin/entitlements.js:90)); needs `COLLECTION_GROUP` scope and a field the docs contain. [firestore.indexes.json:47-54](firestore/indexes/firestore.indexes.json:47).
3. **M3** — `premiumPlusPlan` legacy values (`yearly`/`6_months`) require client-side compensation. [firestore-sync.js:1101-1105](main-app/js/firestore-sync.js:1101).
4. **M4** — Coaching active-state uses both `isActive` and `status`. [register.js:54](main-app/api/auth/register.js:54).
5. **M5** — Two admin-auth wrappers (`withAdmin` vs `withAdminAuth`) with different req fields. [firebase-admin.js:62](super-admin-app/api/_lib/firebase-admin.js:62), [entitlements.js:1](super-admin-app/api/admin/entitlements.js:1).
6. **M6** — In-memory rate limits are per-instance (AI 20/hr, admin 30/hr) — not a true global cap. [middleware.js:81](main-app/api/_lib/middleware.js:81).
7. **M7** — App Check not enabled; client SDK guarded only by token + rules.
8. **M8** — No reconciliation for denormalized `coachings.studentCount`. [functions/index.js:355-390](functions/index.js:355).
9. **M9** — Mixed timestamp types (serverTimestamp vs ISO string) tolerated only by defensive normalizers. [firestore-sync.js:667](main-app/js/firestore-sync.js:667) vs [aiService.js:108](main-app/services/aiService.js:108).

---

## 20. Top 20 Highest-ROI Fixes (effort → impact)

| # | Fix | Effort | Impact |
|---|---|---|---|
| 1 | Declare `description` in `openPremiumPlusPayment` (C1) | 1 line | Unblocks entire Premium+ revenue tier |
| 2 | Chunk bulk-entitlement into ≤200/batch (C2) | ~15 LOC | Admin bulk grant works at scale |
| 3 | Add payment-doc lock + `order.notes.uid===req.userId` to lifetime premium (H1) | ~20 LOC | Closes free-premium replay |
| 4 | Firestore-transactional AI quota (H2) | ~30 LOC | Stops free-tier OpenAI cost leak |
| 5 | Rate-limit/App-Check `register` (H3) | small | Stops account-spam abuse |
| 6 | Derive SW cache name from build hash (H5) | small | Guarantees fix delivery |
| 7 | Remove `dailyPracticeReminder` 5k cap or log truncation (H4) | small | All users get reminders |
| 8 | Delete orphaned `ai/usage` client seed (M1) | small | Schema clarity, fewer writes |
| 9 | Fix `entitlementLogs` index → COLLECTION_GROUP (M2) | config | Admin audit queries work |
| 10 | Backfill/normalize `premiumPlusPlan` legacy values (M3) | small | Removes read-time compensation |
| 11 | Canonicalize coaching active flag to `status` (M4) | small | No accidental signups to suspended |
| 12 | Consolidate to one admin-auth wrapper (M5) | small | Maintainability |
| 13 | Enable App Check (M7) | config | Blunts automated abuse |
| 14 | Add `coachings.studentCount` recount job (M8) | ~30 LOC | Accurate dashboards |
| 15 | Global (Firestore/Redis) rate limiting (M6) | medium | Real abuse ceiling |
| 16 | Add basic e2e payment tests (cases 1–4) | medium | Prevents C1-class regressions |
| 17 | Centralize `_toMillis` into the build (or lint copies) | medium | Kills drift |
| 18 | Remove dead `updateCoachingId` duplicate + deprecated code | small | Clarity |
| 19 | Standardize timestamps on serverTimestamp at write (M9) | medium | Removes latent fragility |
| 20 | Tighten duel `waiting` read rule to participants/target only | small | Closes minor info leak |

---

## 21. Launch Readiness Score

### **62 / 100 — NOT ready to launch to 100,000 users as-is, but close.**

| Dimension | Score | Notes |
|---|---|---|
| Architecture & isolation | 9/10 | Clean, disciplined monorepo. |
| Security & Firestore rules | 8/10 | Strong zero-trust rules; gaps are register abuse + per-instance limits + no App Check. |
| Payment correctness | 4/10 | Backend excellent; **C1 breaks Premium+**, **H1 replay** on lifetime. |
| Premium enforcement | 8/10 | Genuinely server-side; one replay hole. |
| AI infrastructure | 7/10 | Great caching; free-quota race (H2). |
| Data consistency | 6/10 | Entitlements consistent; AI-usage + plan-value + index drift. |
| Scalability | 5/10 | C2 + reminder cap + denormalization drift bite at 10k–100k. |
| State management | 8/10 | Mature sync layer. |
| Testing | 2/10 | No automated tests. |
| PWA / delivery | 6/10 | Works; manual cache versioning is risky. |

**Gating items before any launch:** C1, C2, H1, H2, H3. The first is a one-line fix; the rest are each <1 day. With those resolved and a smoke-test of the 5 critical payment/entitlement cases, a realistic re-score is **~85/100**.

---

### Appendix — Files inspected in full
`firestore/rules/firestore.rules`, `firestore/indexes/firestore.indexes.json`, `functions/index.js`,
`main-app/services/{aiService,paymentService,claimsService}.js`,
`main-app/api/payment/{create-order,verify,webhook}.js`, `main-app/api/auth/register.js`, `main-app/api/_lib/middleware.js`,
`main-app/js/{paywall,firestore-sync}.js`,
`super-admin-app/api/admin/entitlements.js`, `super-admin-app/api/_lib/firebase-admin.js`,
`coaching-admin-app/api/_lib/middleware.js`.
Plus architecture-level exploration of all three apps, `shared/`, and docs. Items marked `UNVERIFIED` require runtime/console inspection not performed in this read-only pass.
