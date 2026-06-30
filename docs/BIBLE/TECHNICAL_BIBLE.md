# QuantReflex Technical Bible

**Doc Version:** 1.26 · **Architecture Version:** 2.52 (see [VERSIONS.md](VERSIONS.md))
**Status:** Source of Truth — authoritative. Code and this document must remain synchronized.
**Last updated:** 2026-06-30
**Change control:** Every change follows the mandatory workflow in [GOVERNANCE.md](GOVERNANCE.md) — Bible-first, impact report, implement, verify, changelog, version bump. See also [§13 Change Control](#13-change-control).

Companion documents (start at [README.md](README.md)):
- [FIRESTORE_BLUEPRINT.md](FIRESTORE_BLUEPRINT.md) — collection/field schema source of truth
- [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md) — auth, rules, secrets
- [PAYMENT_ARCHITECTURE.md](PAYMENT_ARCHITECTURE.md) — Razorpay flows, entitlements
- [GOVERNANCE.md](GOVERNANCE.md) — mandatory change workflow · [VERSIONS.md](VERSIONS.md) — version registry
- [DECISION_LOG.md](DECISION_LOG.md) — ADRs · [ROADMAP.md](ROADMAP.md) — plan + debt · [CHANGELOG.md](CHANGELOG.md) — every change

---

## 1. What QuantReflex Is

A mental-math / quantitative-aptitude training SaaS for competitive-exam aspirants. The catalog is curated (ADR-067) to **17 exams in 4 user-facing tiers** — **MBA** (CAT, XAT, SNAP, NMAT, CMAT, MAH CET, MAT, ATMA), **Banking** (IBPS PO/Clerk, SBI PO, RBI Assistant), **Foundation**, and **Government** (SSC CGL/CHSL/MTS, RRB NTPC) — the exams where fast, no-calculator calculation drives rank. The app drills **14 categories** (`services/quantTopics.js`) — these constitute the **Quant** subject of a **Speed-Aptitude subject layer** (ADR-073/074, V2): a derived lens above category that lets the product grow along the generative-speed spine **Quant → Data Interpretation → generatable Logical Reasoning** without bolting subjects on later. Subject is **derived on read** from `categoryStats` (no stored rollup, no migration). **Quant, Data Interpretation and Logical Reasoning all ship today** — DI (ADR-074) is a generative subject of 5 chart/table families (`di-*`, `js/di-engine.js`); LR (ADR-075) is a generative subject of 7 reasoning families (`lr-coding`/`lr-blood`/`lr-direction`/`lr-ranking`/`lr-odd`/`lr-analogy`/`lr-syllogism`, `js/lr-engine.js`) answered on the numpad or via a new **multiple-choice** drill input. All three reuse the same drill engine, scoring, analytics, Learn and QuanAI; LR's Syllogisms are verified by an independent set-logic model-checker. **Cross-subject intelligence (ADR-076, Phase 4):** `statMath.subjectRollup` derives one per-subject view from `categoryStats` (no storage) that BOTH the Stats "aptitude by subject" breakdown and QuanAI's coaching read — so the platform coaches Quant/DI/LR as one (a percentages gap is named as the cause of slow DI). One-tap **Mixed Aptitude** practice draws a balanced cross-subject sprint. Monetized (v2) as **Free** (20 questions/day) → **Premium** (₹349/6mo or ₹499/12mo — includes everything: all training features, the full AI suite, Math Duel, and Timed Mocks). One paid tier; trials are time-limited Premium grants.

### 1A. Data Interpretation engine v2 (ADR-078) — exam-accurate, multi-series, set-based

The DI subject was overhauled to exam-grade depth, grounded in a sourced syllabus study (CAT/XAT, IBPS/SBI/RRB, SSC,
Insurance). **Verified topic relevance** (drives what the engine emphasizes):

| Chart / form | CAT·XAT | Banking | SSC·Railways | Insurance |
|---|---|---|---|---|
| Tables · simple bar · single pie | Very High | Very High | Very High | Very High |
| Line graph | High | High | Medium | High |
| Grouped / stacked bar · multi-line | High | High | Low–Med | High |
| Caselet · missing-data | Med–High | High | Low | Medium |
| Cross-chart / multi-set | Very High | Medium | Low | Low |
| Radar · bubble · area | Low → **out of scope** | Low | Low | Low |

**Engine architecture (`js/di-engine.js`, `js/ui/di-charts.js`, `js/di-set-engine.js`):**
- **Earned difficulty** — an explicit archetype→tier table; a tier constructs a clean in-tier question by design (the
  old `hard:read` fallback is impossible), so every difficulty label is earned. Realistic data (not all ×10; trended
  time-series). Archetypes span read/rank/total/diff/avg/share/missing/ratio/contribution/%-change plus **cross-series**
  (combined, cross-diff, ratio-across-series, trend-compare, series-share).
- **Multi-series renderer** — `di-charts.js` adds a back-compatible `series[]`/`stacked` model (grouped & stacked bars,
  multi-line, multi-column tables) plus a single-series **horizontal bar** (`spec.horizontal` → `_hbar`) via shared SVG
  helpers; single-series specs render byte-identically. ~40 realistic dataset domains (with per-theme value ranges)
  keep questions feeling faculty-written, not templated.
- **DI sets** — `di-set-engine.js` produces one shared dataset/chart + 3–6 progressive, distinct-skill questions;
  presentation reuses the drill engine through a guarded `diSet` set-mode (shared context rendered once, per-question
  swap, cached dataset). Surfaced as the **📊 DI Set** practice mode.
- **Teaching** — per-chart + per-archetype DI auto-tips (`scoring-service.getAutoTip`); Learn topic "DI Sets &
  Multi-Series Charts". **Analytics stay derived** (set answers ride `categoryStats` di-* keys; no migration).

## 2. Tech Stack (canonical)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Vanilla HTML/CSS/JS SPA | No React/Vue/bundler. Layered `<script>` load order. |
| Hosting | Vercel (3 separate projects) | Static assets + serverless `/api/*`. |
| Auth | Firebase Authentication | Email/Password + Google. Custom claims for roles. |
| Database | Cloud Firestore | Single project `quant-reflex-trainer`. ISO-8601 timestamp standard. |
| Server logic | Vercel serverless (Node) + Firebase Cloud Functions (Node 24) | Admin SDK = trust boundary. |
| Payments | Razorpay (one-time orders, no subscriptions) | HMAC-SHA256 verification + webhook. |
| AI | OpenAI `gpt-4o-mini` | Server-side key only. Firestore-cached. |
| Push | Firebase Cloud Messaging | Daily reminder function. |

**Firebase project (all apps & functions):** `quant-reflex-trainer`.

## 3. Applications (canonical boundaries)

| App | Deploy target | Audience | Auth gate | Server APIs |
|---|---|---|---|---|
| `main-app/` | quantreflex.app | Students | Firebase user (no special claim) | `ai` (action=explain\|coach\|insights\|chat\|planner\|wordproblems), `payment` (action=create-order\|verify) + `payment/webhook` (HMAC, no JWT), `account` (action=delete\|notifications-list\|notifications-markRead\|claim-coaching), `duel` (action-routed duel lifecycle), `notify` (internal server-to-server, secret-gated — ADR-066), `auth/register` (public), `validate-coaching` (public) |
| `super-admin-app/` | dev.quantreflex.app | Platform admins | `admin:true` claim | `admin/*` domain APIs: `system` (dashboard\|health\|alerts\|auditLogs\|payments-logs\|export\|aggregate-metrics\|duels-cleanup\|security\|firestore-ops\|search\|config-get\|config-set\|revenue-intel\|ack-alert\|revoke-tokens), `users` (list\|details\|lifecycle\|inactive-list\|inactive-export\|bulk-archive\|bulk-remind\|payment-history\|activity-timeline\|admin-history\|pending-purge-list\|throttle\|reassign-coaching), `ai` (usage\|budget), `entitlements`, `coachings` (list\|create\|mutate\|details\|students\|activity\|reset-token), `questions` (list\|create\|update\|archive\|delete\|generate\|import), `notifications` (broadcast POST \| history GET) + `cron/sweep` (Vercel Cron, `CRON_SECRET`-gated). **V2 UI (ADR-019)** is a tablet-first nav: **Command Center · Users · Coachings · Revenue · Content · AI · Operations · Settings** (Settings added in ADR-025; Global Search = Cmd+K shell affordance). **ADR-022** consolidated each domain into a first-class **entity-360 / Center** (User-360, Coaching-360, AI Cost Center, Revenue Center, Operations Center) — one owner per capability, no legacy/strangler view files remain. |
| `coaching-admin-app/` | admin.quantreflex.app | Coaching admins | `coaching_admin:true` + `coachingId` claims | `coaching/*` (auth, students, dashboard, notices, insights) |
| `functions/` | Firebase | (scheduled/triggers) | n/a (Admin SDK) | `cleanupExpiredDuels`, `enforceEntitlementExpiry`, `dailyPracticeReminder`, ~~`syncCoachingStudentCount`~~ (**retired/no-op — ADR-032**; `studentCount` is maintained in the request path since triggers don't run on Spark). All four are **dormant on Spark** — not deployed; see §3.1/§6. |

**Isolation rule:** apps deploy independently from their own root directory. There is **no bundler**, so runtime `import ../shared/` is impossible. Shared logic (`_toMillis`, `_escapeHtml`, Firebase config, entitlement constants) is **inline-copied** into each app; `shared/` is the canonical reference only. When you change a shared utility, update every inline copy and note it in the changelog.

### 3.1 Infrastructure Constraints (Vercel Free / Hobby) — ADR-017

QuantReflex deploys on the **Vercel Free (Hobby) plan**. This is an official architecture constraint:
- **A deployment may contain at most 12 Serverless Functions per project.** Every `.js` file directly under an
  app's `api/` tree is one function; files under `api/_lib/**` are **private (excluded)**. Cron endpoints count.
- **Cron jobs run at most once per day on Hobby** — a sub-daily schedule fails the whole deployment.
- **Cloud Functions are NOT deployed** (Firebase Spark) — scheduled work runs on **Vercel Cron**.

**Mandatory consequences (enforced by [GOVERNANCE.md](GOVERNANCE.md) + ADR-017):**
- **Minimize API count.** Do NOT add a new `api/*.js` file unless unavoidable; reuse/extend an existing domain
  endpoint first.
- **Favor domain-based, action-routed handlers** — one file per domain dispatching on `?action=` (and `?type=`),
  with a **single auth wrapper per file**. New features must fit an existing domain API.
- **One auth model per handler** (never mix in one file): admin → `withAdminAuth`; student → `withAuth`; crons →
  `CRON_SECRET`; the Razorpay webhook stays isolated (HMAC + `bodyParser:false`); public endpoints
  (`auth/register`, `validate-coaching`) stay isolated.
- **Current counts (post-consolidation, ADR-017):** main-app **8**, super-admin **8**, coaching **5** — all under
  the 12-function cap with headroom. **Super Admin V2 (ADR-019/020/021)** adds `search`, `config-get`,
  `config-set`, `revenue-intel`, `ack-alert` as new `?action=` branches on `system.js` — **no new function**
  (stays 8/12). Global Search and Emergency-Control config endpoints deliberately ride existing handlers.
- **ADR-022 (entity-360 consolidation) adds ZERO functions** (super-admin stays **8/12**): all new reads/writes are
  `?action=` branches on existing handlers (users +6, coachings +4, notifications +1 GET, system `revenue-intel`
  extended), and AI by-coaching / top-consumer / by-feature aggregations are derived **client-side** from the
  existing `ai?action=usage` payload (no new AI actions). The per-user AI throttle (`users?action=throttle`) is
  honored by main-app **without a new function** — `api/ai.js` calls `aiService.enforceAiThrottle` inside the
  existing AI handler (still main-app **8/12**).

## 4. main-app Client Architecture

### 4.1 Layered script load order (must be preserved — `index.html`)
```
1 State          state/store.js (AppState)
2 Infrastructure firebase.js → auth.js → firestore-sync.js
3 Services        services/{adaptive-state,scoring-service,share-service,question-bank-service}.js
4 Data            progress.js, questions.js
5 References      tables.js, learn-manager.js, knowledge/{schema,registry,blocks}.js, learn/{learn-search,learn-progress}.js (ADR-069)
6 Settings        settings.js  (provides showToast)
7 Engine          drill-engine.js
8 Navigation      router.js
9 Features        paywall.js, ai-features.js, session-manager.js
10 Controllers     controllers/{practice-config,practice-modes}.js
11 UI             ui/{numpad,swipe-nav}.js
12 Views           views/{home,learn,stats,inbox}-view.js
13 Bootstrap       app.js  (MUST be last)
Deferred           notifications.js, onboarding.js
```

### 4.2 State model (canonical)
- **Source of truth (client):** `AppState` (localStorage, canonical `qr_*` keys; legacy `quant_reflex_*` keys are fallback-read only) and `FirestoreSync._memoryCache` (in-memory copy of the user doc).
- **Server is final authority.** Client entitlement flags are display-only; the server re-checks Firestore on every protected call. Client code must never treat a local flag as authorization.
- **Sync:** `FirestoreSync.queueUpdate` debounces writes (2000ms). During drills, writes defer until `endDrillBatch()`. `updatedAt` on the main doc is written with `serverTimestamp()` to anchor clock-skew checks.
- **User-switch safety:** `resetSyncState()` + `AppState.clearAll()` + `qr_last_uid` guard prevent cross-user leakage. `_syncGeneration` discards in-flight writes after a user switch.

### 4.3 Premium gating (client)
`paywall.js` exposes `canAccess(feature)`, `hasPremiumAccess()`, `getDailyQuestionLimit()`. v2: **every** gated feature (incl. AI features and `math_duel`) requires `plan==='premium'` — there is no AI-only sub-tier. See [PAYMENT_ARCHITECTURE.md](PAYMENT_ARCHITECTURE.md).

## 5. Server (Vercel serverless) Architecture

- **Trust boundary:** the Firebase **Admin SDK** bypasses Firestore rules. All entitlement grants, account creation, payment processing, and admin mutations run server-side with Admin SDK.
- **Auth middleware (`main-app/api/_lib/middleware.js`):** `withAuth` verifies the Firebase ID token, resolves the single `req.userPremium` from Firestore (`aiService.isUserPremium`→`resolvePlan`), applies a per-instance in-memory rate limit (default **20/hr** AI bucket; callers may pass `{ rateLimitClass: 'duel' }` for a separate **120/hr** bucket so a live duel never 429s mid-finish or eats the AI budget — ADR-033/D1). `withAdminAuth` additionally requires `decoded.admin===true`.
- **Admin middleware (`super-admin-app/api/_lib/`):** **canonical wrapper is `middleware.js#withAdminAuth`** (token + `admin:true` claim + per-admin rate limit 300/hr; sets both `req.userId` and `req.adminUid`). `firebase-admin.js#withAdmin` is now a thin re-export of it (audit M5, fixed 2026-06-11). All admin endpoints are rate-limited.
- **Coaching middleware (`coaching-admin-app/api/_lib/middleware.js`):** `withCoachingAuth` requires `coaching_admin===true` AND a `coachingId` claim, attaches `req.coachingId` for data scoping.

### 5.1 Services (`main-app/services/`)
- `aiService.js` — Admin SDK + OpenAI. Entitlement: `resolvePlan`/`isUserPremium` (self-healing), `activatePremium` (transactional/idempotent grant), `safeUserUpdate`; AI generation + Firestore caching; AI usage quota.
- `paymentService.js` — Razorpay client, `createOrder`, `verifyPaymentSignature` (constant-time), `fetchOrder`/`fetchOrderPlan` (server-trusted plan + uid), `getPlanConfig`, `PLAN_CONFIG` (`premium_6m`/`premium_12m`).
- `claimsService.js` — `setEntitlementClaims(uid, {premium})` (single custom JWT claim; non-fatal optimization; Firestore `plan` is source of truth).

### 5.2 Super Admin Architecture (operational control plane)
The `super-admin-app` is the **operational control plane** for the platform — all entitlement, coaching,
content, and analytics operations flow through it, never direct Firestore-console edits (ADR-012). It is a
vanilla-JS SPA (`js/views/*` over `js/ui/{modal,table,toast}.js`, `js/services/api.js` auto-JWT,
`js/state/store.js`) calling `api/admin/*` endpoints, every one wrapped by `withAdminAuth`
(token + `admin:true` + 300/hr).
- **Immutable audit trail:** every mutation endpoint calls the shared `api/_lib/audit.js#writeAuditLog`,
  appending one `auditLogs` row (`{ts, actorUid, actorEmail, action, category, targetType, targetId, summary,
  before, after}`). Append-only; admin-read-only. See [SECURITY_ARCHITECTURE.md §5.2](SECURITY_ARCHITECTURE.md).
- **Pre-aggregated analytics (scales to 1M):** the dashboard reads a single pre-aggregated `metrics/latest`
  doc (O(1)) instead of scanning collections. A Vercel-Cron endpoint `api/cron/daily-snapshot` recomputes
  `metrics/{date}` + `metrics/latest` **daily** (Vercel Hobby caps cron at once/day) using Firestore **`count()` aggregation** for user counts and a
  bounded `payments` rollup for revenue; AI token/cost is pre-aggregated incrementally at write time
  (`aiService.trackGptCost` → `systemMetrics/ai_daily_*`). See [FIRESTORE_BLUEPRINT.md](FIRESTORE_BLUEPRINT.md)
  and ADR-013.
- **Spark-compatible:** because Firebase is on the Spark plan (Cloud Functions don't deploy), all scheduled
  admin work runs on **Vercel Cron** (independent of the Firebase plan), not Cloud Functions.

## 6. Cloud Functions (`functions/index.js`)

| Function | Trigger | Purpose | Scale guards |
|---|---|---|---|
| `cleanupExpiredDuels` | every 60 min | Soft-expire stale waiting/ready duels >30 min | `.limit(400)`, batch |
| `enforceEntitlementExpiry` | every 6 h | Revert expired premium (`plan:'premium'` + `planExpiry`<now → `plan:'free'`) | paginate 200, stop >5000 |
| `dailyPracticeReminder` | 07:00 IST | FCM reminder, prune invalid tokens | paginate 500, **caps 5000 tokens/run** |
| `syncCoachingStudentCount` | onWrite `users/{uid}` | **Retired/no-op (ADR-032)** — dormant on Spark; `studentCount` is maintained in the request path instead | n/a |

> `studentCount` is the **canonical** denormalized counter, maintained **in the request path** (register / claim-coaching / reassign-coaching / purge / delete — transactional ±1, decrement only when `coachingId` is actually removed) with live `count()` at detail surfaces. The `syncCoachingStudentCount` `onDocumentWritten` trigger is **retired/no-op (ADR-032)** because triggers don't run on Spark. Drift was repaired once by `firestore/migrations/2026-06-11-reconcile-studentCount.js` + `firestore/diagnostics/backfill-student-counts.js` (claim-coaching's divergent `studentsCount` was removed, audit M8).

> Note: premium access is also reverted **live** on read (`resolvePlan` self-heals on access), so the 6-hour function only affects dashboard counts, not access correctness.

> **Deployment reality (Spark plan):** these Cloud Functions are **not deployed** — the project is on the Firebase Spark plan and scheduled functions require Blaze. Access correctness does not depend on them (self-heal on read). Scheduled **admin analytics** instead run on **Vercel Cron** (`super-admin-app/api/cron/*`), independent of the Firebase plan — see §5.2 and ADR-013.

## 7. AI Subsystem

- Model `gpt-4o-mini`, key server-side (`OPENAI_API_KEY`).
- Caching: `explanations` (content hash), `aiCoachV2`/`aiInsightsV2` (per-user-per-day), `aiStudyPlans` (persisted).
- Structured output via strict `json_schema`; explanation path self-checks numeric answer and retries twice.
- Global counters in `systemMetrics/ai_daily_{date}` — request counts (`wordProblems, explanations, insights`) **plus** real GPT telemetry (`totalTokensInput, totalTokensOutput, estimatedCostUSD, gptCalls`) written by `aiService.trackGptCost` on every OpenAI call; mirrored per-user on `users/{uid}/usage/ai` (`gpt*`). Powers the Super Admin GPT Cost Center.
- Quota: free = 5 lifetime word-problem credits; premium = 25/day. Stored in `users/{uid}/usage/ai` (server source of truth). Consumption is **atomic** (Firestore transaction in `consumeWordProblemQuota`, audit H2 fixed 2026-06-11) — returns the count actually granted so the cap holds under concurrency.

## 8. Data Flow Summaries

**Practice answer →** drill-engine updates stats → `AppState`/`FirestoreSync` (deferred during drill) → on `endDrillBatch`: main doc + `performance/overall` + `practice/data` written.

**Payment →** see [PAYMENT_ARCHITECTURE.md](PAYMENT_ARCHITECTURE.md).

**AI request →** client → `/api/ai/*` (`withAuth`) → entitlement + quota check → cache lookup → OpenAI on miss → cache write → response.

## 9. Environments & Secrets

Server env vars (Vercel, never committed): `OPENAI_API_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `FIREBASE_SERVICE_ACCOUNT`. Public-by-design: Firebase web config, Razorpay key-id. See [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md).

## 10. Conventions

- **Timestamps:** ISO-8601 strings are the documented standard; `serverTimestamp()` is used for main-doc `updatedAt` and some server writes. All readers normalize via a `_toMillis`-style helper. New writes SHOULD prefer `serverTimestamp()` where a server context exists.
- **Entitlement field names (canonical, v2):** `plan, planType, planExpiry, planSource, isTrial, trialEnd, planUpdatedAt, lastPaymentId, coachingId`. Do not introduce synonyms or reintroduce the removed v1 fields.
- **Plan keys (canonical):** `premium_6m`, `premium_12m`. Tier values: `free`, `premium`.

## 10A. Design System (UI) — single source of truth

The student app (`main-app`) uses **one** design language. Build every screen from these tokens and
card levels — do not hand-style new surfaces. Identity: **professional, academic, focused, premium** —
deep navy + electric blue + soft white + muted slate, gold as a sparing accent. **Not** gaming/neon/crypto.

### Design tokens (`css/style.css` `:root`)
| Token | Value | Use |
|---|---|---|
| `--qr-card-radius` | `1.5rem` (24px) | large cards (home-bento, `.card`, study-card, mode-card) |
| `--qr-card-radius-sm` | `1.25rem` (20px) | small cards (stat-card, today/metric tiles, feature cells) |
| `--qr-btn-radius` | `1.125rem` (18px) | buttons / CTAs |
| `--qr-card-border-light` | `1px solid rgba(15,23,42,0.06)` | hairline border (light) |
| `--qr-card-border-dark` | `1px solid rgba(255,255,255,0.08)` | hairline border on navy (dark) |
| `--qr-shadow-light` / `--qr-shadow-dark` | soft **navy** shadow | depth — **no neon/purple glow** |
| `--sp-md` / `--sp-lg` / `--sp-xl` | 16 / 24 / 32px | related items / between cards / between major sections |

### Glassmorphism foundation
One philosophy for every card: dark-navy glass surface (`rgba(30,41,59,…)` dark / translucent white
light, `backdrop-filter: blur(10px)`), **1px subtle border** (the tokens above), **soft depth shadow,
no glow**. No card invents its own surface, blur, or glow.

### Card elevation levels
- **L1 — Informational** (stats, progress, training summaries): flat glass, hairline border, minimal shadow.
- **L2 — Interactive** (Quick Drill, Math Duel, Quick Study, mode cards): glass + standard `--qr-shadow-*`, `:active { scale(.98) }`.
- **L3 — Primary CTA** (Start Premium, selected plan, Continue Training): strongest emphasis — blue gradient fill + elevated shadow.

### Premium feature card (reusable)
AI Coach, Study Plan, and all future premium upsell widgets use the **same** card as Math Duel
(`.home-bento-card`) — they are Math Duel's smaller siblings, not bespoke designs. No special purple
border/glow. Implemented via `.home-twin-card` (icon → title → PRO badge → short description → CTA),
height kept compact (feature card, not dashboard widget).

### Battle Archive (ADR-068) — Premium duel history + rivalry/personal stats + achievements
A **Premium-only**, expandable section appended *inside* `#homeDuelCard` (after `#homeDuelActions`) — it
**extends** the Duel card, never redesigns the page. Rendered/hidden by `DuelArchive.render(isPremium)` from
`home-view.js`: for free users the section is simply **not shown** (`display:none`, empty) — never greyed or
blurred, and the card layout is intact without it. New client module **`js/duel-archive.js`** (read-only layer)
reads the server-maintained truth — `users/{uid}/duelHistory` (paginated, newest-first) + the
`users/{uid}/duelStats/summary` aggregate — and renders a rivalry banner, personal-stats strip, filter chips +
search, a paginated battle list (each card **expands in place** — no navigation, architecture-ready for a future
`#duel-replay`), and an achievements grid. Aggregates are maintained **server-side** in the duel endpoint's
`_finalizeTxn` transaction via the pure `services/duelStats.js` (the client never computes outcomes/stats);
auto-refresh rides the existing `DuelManager._showResults` completion moment (no new listener). **Zero new
serverless functions** (main-app stays **8/12** — the Archive is reads + the existing `duel` write path). Spark
profile: ≈2 reads on open (summary + page 1), +1 read/page on scroll, indexed filters (no scans). See
[FIRESTORE_BLUEPRINT](FIRESTORE_BLUEPRINT.md) + [DECISION_LOG ADR-068](DECISION_LOG.md).

### Learn Knowledge Engine (ADR-069) — knowledge objects, hub→topic graph
The Learn tab is being rebuilt (phased) from a single static scroll page into a **knowledge-object engine**: every
concept is a reusable data object, not hard-coded HTML. **NO AI surfaces exist in Learn** (deliberate).
- **Schema** `js/knowledge/schema.js` (pure, dual-exported) — a topic = `{id(slug), title, icon, category,
  difficulty, examFrequency, status, drillCategory, syllabusTopicId, related[], revisionIntervalDays, searchTerms[],
  sections[]}`; `sections` are ordered **typed blocks** (overview·concept·formula·trick·trap·example·table·memory·
  revision·related). New content kind = new block type + renderer, never a schema rewrite.
- **Registry** `js/knowledge/registry.js` — in-memory KnowledgeBase (get/all/categories/byCategory/related/siblings
  + integrity validator). **Data** `data/knowledge/<category>.js` self-registers (idempotent).
- **Renderers** `js/knowledge/blocks.js` — one DOM renderer per block type; `table`→existing `.math-table`,
  `formula`→existing `.formula-block` (identity + the loved tables preserved); richer blocks use `.kx-*`.
  HTML-escaped. Tested via a DOM stub + browser-path harness.
- **Search** `js/learn/learn-search.js` — weighted in-memory index over the registry (symbol/synonym aware); it is
  the live Learn search (results deep-link to topic pages). The legacy `performLearnSearch` DOM-scan was removed.
- **View** `js/views/learn-view.js` — render-on-route controller: `Router.onShow('learn', params)` →
  `renderLearnRoute(params)`; no path → the **hub** (category → topic cards + preserved Quick-Reference tables +
  bookmarks + custom topics), a path (`#learn/<id>`) → a **topic page** (breadcrumbs · sticky section nav with
  IntersectionObserver scroll-spy · typed blocks · related chips · prev/next · back). In-Learn navigation routes
  through `Router.showView('learn', {path})` for real back/forward. Responsive `.kx-*` design system
  (phone/tablet/desktop) is scoped to `body.view-learn-active` and reusable by other sections. `formulas.js` retired.
- **Routing** — `router.js` parses `#learn/<topicId>` deep links (single-segment hashes unchanged; backwards
  compatible) + toggles a `view-learn-active` body class so the 480px cap is lifted **only** for Learn (mirrors the
  `view-practice-active` hook). **Validation** `scripts/learn-content.check.js` (in `npm test`).
- **Content** `data/knowledge/{categories,numbers,arithmetic,commercial,modern,mensuration}.js` — a 5-category
  taxonomy (Numbers · Arithmetic · Commercial Math · Modern Math · Mensuration) with **19 gold-standard topics, all
  published** (overview · concepts · formulas · tricks · traps · examples · memory · revision); the curated scope has
  **no scaffolds left** (the `scaffold` status remains a supported state for future categories). A content-quality
  gate in `scripts/learn-content.check.js` enforces gold-standard depth on every published topic (196 assertions).
- **Progress & integrations (P4)** `js/learn/learn-progress.js` (dual-exported) — localStorage-primary per-topic
  `{viewedAt, completedAt}` + topic bookmarks, best-effort mirrored to two owner-writable user-doc fields
  (`learnProgress`, `learnTopicBookmarks`) via the **existing** `FirestoreSync.queueUpdate` (same path as
  customTopics/bookmarks: no new collection/rule; hydrated on login, cleared on user switch). Pure
  `computeRecent`/`computeDue` (spaced revision via `revisionIntervalDays`) unit-tested in `learn-progress.check`.
  Drives the topic **action bar** (Practise this → focus-drill via `drillCategory`; Quick-revision **cheat-sheet
  projection** = `#learnTopic.kx-revision-only` filtered view over the authored revision/formula/trick/trap blocks;
  Mark-complete; Save) and the hub **Continue / Due-for-revision** strips + completion ticks.
- **Reuse, not duplication:** cheat-sheet/revision are projections of the same `sections`; Practice links via
  `drillCategory` (`services/quantTopics.js`), Planner via a validated `syllabusTopicId` (`data/syllabus.js`, the
  data-level Planner link — the knowledge graph references the syllabus graph). Delivered per ADR-069 across 5 phases
  (P1 engine + P2 hub/topic UI + responsive design system + P3 gold-standard content + P4 progress/revision/Practice/
  Planner-link + P5 polish & legacy-CSS cleanup) — **all shipped, no AI in Learn**. Function count unaffected
  (client-only).

### Typography hierarchy (never mix scales arbitrarily)
1. **Section header** — `home-section-title` (uppercase-ish, 700, blue) — highest.
2. **Card title** — `home-bento-title` / `.card h3` (800) — second.
3. **Supporting text** — `home-bento-desc` / `.secondary-text` (muted slate) — third.

### CTA hierarchy
Primary = filled blue gradient (`btn-primary`, `.pw-cta`). Secondary = outline/ghost (`btn-secondary`).
Tertiary = text link. **Purple is a supporting gradient accent only** — never a dominant CTA/border/surface color.

### Practice-screen scroll contract (fixed app shell — ADR-011)
The Practice screen is a **fixed app shell**: a fixed header, a fixed bottom nav, and exactly **one**
scroll panel centered between them. All in `css/style.css` unless noted:
- **`--qr-nav-h: 3.75rem`** is the single source of truth for the bottom-nav height — consumed by
  `.bottom-nav` `height`, `body` `padding-bottom`, and the Practice shell height. **Never hardcode the
  nav height** (the old `4.5rem` vs `3.75rem` split caused a phantom gap).
- **`#view-practice.spa-view-active`** is a fixed-height `overflow:hidden` flex column:
  `height: calc(var(--vh,1vh)*100 − var(--qr-nav-h) − env(safe-area-inset-bottom))` with
  `padding-top: env(safe-area-inset-top)` (clears notch / status bar). Its `<header>` is
  `flex:0 0 auto` — the fixed band, never scrolls.
- The **only** scroller is **`.practice-container`** (the active content slot — `#modeSelect`,
  `categorySelect`, `drillContainer`): `flex:1; min-height:0; overflow-y:auto`, with **equal top/bottom
  margin** (`var(--qr-practice-gap) auto`) so the panel sits visually centered between header and nav,
  symmetric internal `padding`, and `border-radius: var(--qr-card-radius)` so the glass panel reads as a
  soft container consistent with Home — not a sharp rectangle.
- **Container neutralization (critical):** every view is wrapped in the app scroller `.container`
  (`overflow-y:auto`, padded). Practice MUST disable it or the shell overshoots the padded content box
  and `.container` *also* scrolls — a **double scroll that drags the header**. `router.js` toggles
  `body.view-practice-active`, and `body.view-practice-active > .container { padding-top:0;
  padding-bottom:0; overflow:hidden }` hands scroll control entirely to the Practice shell.

Any element swapped into the scroll slot MUST carry the scroll properties or it will clip. Adding new
practice sections is safe — they extend the single panel. (Root-cause history: the `.container`
padded-overshoot double-scroll — see [DECISION_LOG.md](DECISION_LOG.md) ADR-011 and the CHANGELOG.)

## 10B. Super Admin Design System (tablet-first) — ADR-019 (theming ADR-024, settings ADR-025, accessibility ADR-026)

`super-admin-app` is a **separate** design language from the student app (own `css/admin-style.css`, own
tokens — slate/blue SaaS, not the navy/glass student identity). It is a **tablet-first governance OS**:
primary device is an **11-inch Android tablet, Chrome PWA, landscape, touch**. Build admin screens from this
system; do not hand-style new surfaces.

**Semantic theme tokens + dark mode (ADR-024).** The admin app is **100% design-system-driven** — every UI
color resolves to a token in `css/admin-style.css :root`; **no hardcoded hex in component rules or views.**
Token groups: surfaces (`--bg-app`/`--bg-surface`/`--bg-surface-2`/`--bg-inset`), text (`--text-strong`/
`--text`/`--text-mid`/`--text-muted`/`--text-faint`/`--on-accent`), lines (`--border-color`/`--border-strong`),
accent (`--accent-primary`/`-hover`/`-bright`/`-soft`/`--accent-ai`), neutral button (`--btn-bg`), **state
ramps** danger/success/warning each as `*-primary`/`*-bg`/`*-fg`/`*-border` (+ `--premium-*`, `--neutral-*`),
`--overlay`, theme-independent `--toast-*`, and `--rail-w`/`--rail-w-collapsed`. Legacy aliases
(`--bg-primary`/`--text-primary`/…) follow the canonical tokens. **Dark mode** = a designed (not auto-inverted)
`:root[data-theme="dark"]` override of every token; applied no-FOUC by an inline boot script in `index.html`
(set BEFORE the stylesheet paints) and toggled light/dark/system via the sidebar footer, persisted to
`qrAdminTheme`. **Rule: build new admin surfaces from these tokens — never a raw hex.** Touch targets: primary
≥48px, dense ≥44px. Shared content primitives (single owners — do not re-implement): empty lists →
`AdminUtils.emptyState({icon,title,text,actionLabel})`; metric tiles → `AdminUtils.statTile(label,value,sub,colorVar)`
(`.stat-num`/`.stat-cap`/`.stat-sub`); a `.loading` spinner for pending panes.

**Accessibility contract (ADR-026).** The admin app meets WCAG 2.1 AA on the patterns it ships:
- **Keyboard operability (2.1.1):** any element that acts as a control but is not a native `<button>`/`<a>`
  (clickable `.sv-row`, the Content drop-zone, Global-Search result items) MUST carry `role="button"`/`"option"`,
  `tabindex="0"`, and a `keydown` handler that fires the same action on **Enter and Space** (preventDefault on
  Space). New clickable rows follow this or they fail audit.
- **Names/roles (4.1.2):** icon-only and placeholder-only controls get an `aria-label`; filter inputs and bulk
  checkboxes are labelled; the active nav item carries `aria-current="page"`; modals set `aria-labelledby` to a
  real title `id` (`#modalTitle`) or `aria-label` when titleless.
- **Status messages (4.1.3):** the toast region is `role="status" aria-live="polite"`; error toasts escalate to
  `role="alert"`. Never convey state by color alone.
- **Focus visibility (2.4.7):** a global `:focus-visible` ring (`outline: 2px solid var(--accent-primary)`) is
  never removed; rows/inputs inherit it.

**Information architecture (7 domains):** Command Center · Users · Coachings · Revenue · Content · AI ·
Operations. One owner per capability (no duplicate entry points). Global Search (Cmd+K) is a shell affordance.
The legacy 12-view scaffolding is retired **strangler-style** (new shell + domains alongside old views →
redirect → delete last), never big-bang.

**Shell & layout contract:**
- **Persistent collapsible left rail at ≥768px.** The rail is `position:sticky; height:100dvh`, always visible
  in tablet landscape (NOT hidden behind a hamburger — the old <1024px defect). `body.rail-collapsed` swaps
  `--rail-w`→`--rail-w-collapsed` and hides labels (icon-only); the state persists (localStorage + `AdminState`).
  `.main-content { margin-left: var(--rail-w) }` (or collapsed). Below 768px the rail returns to the slide-in
  drawer + mobile header.
- **No content max-width cap on split/dashboard screens** — full-bleed two-column instead of centering a 720px
  column. Keep a reading cap only on single-column forms.
- **`stat-grid: repeat(auto-fit, minmax(190px, 1fr))`** — density follows width; no hardcoded 2/3/4 columns.
- **Viewport (`index.html`):** `width=device-width, initial-scale=1, viewport-fit=cover` — **zoom enabled**
  (no `maximum-scale`/`user-scalable=no`; a11y).
- **Touch targets ≥44px** for nav/buttons, ≥40px hit area for inline row actions.

**Reusable primitives (`js/ui/`):**
- **`SplitView` (`split.js`)** — master-list + **in-flow** detail pane (`grid-template-columns: minmax(320px,38%)
  1fr` at ≥768px; below, list full-width and selecting pushes a full-screen detail with Back). This is the
  canonical **360 pattern** — it **replaces the old overlay drawer**. Detail state is deep-linkable
  (`#domain/:id`).
- **`Tabs` (`tabs.js`)** — segmented control implementing the **full WAI-ARIA tab pattern** (ADR-026): per-mount
  unique ids, `role=tablist/tab/tabpanel`, `aria-selected`/`aria-controls`/`aria-labelledby`, roving `tabindex`,
  and Arrow/Home/End keyboard navigation; ≥48px targets. Used for Operations sub-tabs and Revenue/AI inner tabs.
- **`Table` (`table.js`)** — `Table.build(columns, data, actionsRenderer, opts)`; below `opts.cardBreakpoint`
  each row renders as a label/value **card** (no forced horizontal scroll). All cell output is escaped.
- **`Modal` (`modal.js`)** — focus-trap (Tab cycles inside, first field focused, Esc closes, focus restored);
  bottom-sheet on small screens, centered ≥768px.

**Governance UX (every screen):** answers **what happened** (audit/history) · **what's happening** (live
counts/feed) · **what needs attention** (alerts on top) · **what action** (inline buttons — no navigate-away;
e.g. AI abuse → suspend/throttle in place). Destructive actions: type-`DELETE` + double-confirm + server
`confirm:'DELETE'` + immutable `auditLogs`. Command Center alerts support **Acknowledge** (`system?action=ack-alert`,
audited, suppress N hours) + **Drill-down** deep-links.

**Emergency Controls (ADR-021)** live in the Command Center: maintenance / AI-kill / payment-kill toggles write
central `config/*` docs (`system?action=config-set`, audited); the student app reads and **honors** them
(`aiService` skips OpenAI, `paymentService` skips Razorpay, boot shows a maintenance screen for non-admins).
See [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md) for the config rules.

## 10C. Coaching Admin Design System (mobile-first) — ADR-028 (value/UI/perf ADR-030)

`coaching-admin-app` is a **third, separate** design language (own `css/coaching-style.css`, own tokens — a
calm, de-gamered dark theme; NOT the student navy/glass, NOT the admin slate/blue). It is a **mobile-first sales
tool**: primary device is a **phone**, **bottom-nav 5 tabs** (Dashboard · Students · Performance · Engagement ·
Settings), and detail screens **push full-screen** (NOT a split-pane/sidebar — that's the tablet admin pattern).
Its job is owner trust + demonstrating QuantReflex's math-**speed** value; it must NOT grow into an
LMS/CRM/analytics suite. Build coaching surfaces from this system; do not hand-style new ones.

**Product contract (ADR-030 — the "value" guarantee).** Every card must earn its place: (a) its data is on the
render path **today**, and (b) it changes what the owner **does** (triage / nudge / celebrate / decide). The
recurring failure mode is **discarding fetched data** — the backend computes `strongestStudents`,
`recentActivity`, `activeStreakUsers`, `totalQuestionsSolved`, per-student `streak`/`weakTopic`, and the view
must render them, not drop them. Conversely, never fabricate: a metric that needs history it doesn't have yet
shows a single honest **`.collecting`** state ("live in N days"), never an approximated/last-200-question number.
Vanity (e.g. a standalone Premium-count hero) is demoted below actionable signal.

**Honesty taxonomy (one set, used everywhere):** `.collecting` (real data accruing — show the countdown),
`.empty-state` + inline SVG (genuinely empty — e.g. no students yet), and one error+retry component. Toasts:
success / error / **`.toast.info`**. Skeletons **match the real layout** (hero + rows) to avoid CLS. Never two
different "no data" treatments on one screen.

**Premium-UI levers (ADR-030):**
- **Inline SVG, not emoji.** Content glyphs use the thin-stroke inline-SVG icon set already shipped in the bottom
  nav (`CoachingUtils.icon(name)` / the nav set) — **no content emoji** (🟢📈⚠️🎯🔥) in shipped views.
- **`.metric-card.accent-*` color system** (speed / accuracy / activity / attention) is **active** — the metric
  grid is color-coded by meaning, one restrained accent per tile, not flat grey.
- **Heading tier:** `.section-title` (~1.06rem, the stronger tier) for top sections + optional one-line subtitle;
  `.section-label` stays for sub-groups.
- **Real-data density** is restored from previously-dead CSS where the data is live: a compact Coaching-Health
  strip and a best-in-coaching Wins strip (current fastest / longest streaks) — real, not vanity.

**Reusable primitives (`js/utils.js` `CoachingUtils`, single owners — do not re-implement):** `sparkline`,
`deltaBadge`, `collectingCard`, `getInitial`, `escapeHtml`, `icon`, `Toast`. Reuse the `coachingMetrics/{id}`
daily rollup for trend reads (no per-load full-roster re-scan).

**Performance contract (ADR-030).** The heavy `users`-roster scans (`coaching/students.js` list,
`coaching/dashboard.js`, `coaching/insights.js`) MUST use a Firestore field mask (`.select(...)`) so the
200-element `stats.responseTimes` ring and the 90-key `stats.dailyHistory` map are **never** shipped to a
list/aggregate that doesn't need them (`.limit()` bounds row count but not payload — both are required). New
coaching scans follow this or they regress the Students-screen load.

**Accessibility:** global `@media (prefers-reduced-motion: reduce)`; a shared `:focus-visible` ring on every
control (`.nav-tab`/`.btn`/`.seg button`/`.pill`/`.more-item`); the tab shell uses a correct ARIA pattern
(`aria-selected` + `role=tabpanel`, or `role=navigation` for the bottom nav). Thumb-reach: primary daily CTAs are
not flush-right out of reach; list rows are tappable to their primary action.

**Session Improvement (ADR-030) — display rule.** The within-session speed-delta
(`users.stats.avgSessionImprovementPct` / per-session `firstHalfAvg→secondHalfAvg`) is always labeled **"Session
Improvement"** and rendered in its own card. It is the honest **cold-start** speed signal; it is **never** merged
into, or charted alongside, the 7/30-day calendar speed trend, and it becomes secondary once that trend matures.

## 11. Known Deprecated / Dead Code (do not extend)
- `duelInvitations` collection (rules deny all).
- `generateWordProblems` OpenAI path (now reads curated `questions`).
- Duplicate `FirestoreSync.updateCoachingId` (second definition wins).

## 12. Open Architectural Debts (tracked)
See the founding audit ([../../AUDIT-REPORT.md](../../AUDIT-REPORT.md)) and the live debt register in [ROADMAP.md](ROADMAP.md). Resolution status for each finding is in [CHANGELOG.md](CHANGELOG.md).

## 13. Change Control

**The authoritative, mandatory workflow is defined in [GOVERNANCE.md](GOVERNANCE.md).** Summary — a change is "synchronized" only when, in the same change set:
1. Code is modified.
2. Any affected section of this Bible is updated (Bible-first, before code).
3. Schema changes are reflected in [FIRESTORE_BLUEPRINT.md](FIRESTORE_BLUEPRINT.md).
4. Security/payment changes are reflected in their respective documents.
5. A Change Impact Report + dated entry is added to [CHANGELOG.md](CHANGELOG.md) (referencing finding/ADR IDs and file:line).
6. Affected version tracks are bumped in [VERSIONS.md](VERSIONS.md), with migration notes for breaking/data changes.

Version semantics (MAJOR/MINOR) and the full Definition of Done are in [GOVERNANCE.md](GOVERNANCE.md) and [VERSIONS.md](VERSIONS.md).
