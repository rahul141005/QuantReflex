# QuantReflex Roadmap & Known Debt

**Forward-looking plan and the outstanding technical debt register.** This is where deferred audit
items, infra tasks, and planned features live so they are not lost. Update as items land (move to
[CHANGELOG.md](CHANGELOG.md)) or as priorities change.

Companion: [GOVERNANCE.md](GOVERNANCE.md) · [DECISION_LOG.md](DECISION_LOG.md) · [../../AUDIT-REPORT.md](../../AUDIT-REPORT.md)

---

## 🚧 In progress — Learn Knowledge Engine (ADR-069)
Rebuilding the Learn tab into the **knowledge backbone** of QuantReflex: a deep-linkable hub→topic knowledge graph
built from reusable **knowledge objects** (not static HTML), a responsive design system reusable app-wide, and
quality-first content. **No AI in Learn (by design).** Phased, each phase backwards-compatible + audit-gated.
- **Phase 1 — Foundation ✅ (2026-06-28):** engine (`js/knowledge/schema.js`, `registry.js`), search
  (`js/learn/learn-search.js`), data modules (`data/knowledge/*` — 8 legacy topics migrated), `#learn/<topic>`
  deep-link routing + `view-learn-active` shell hook, validator (`scripts/learn-content.check.js`). Old Learn page
  untouched.
- **Phase 2 — Learn experience ✅ (2026-06-28):** block renderers (`js/knowledge/blocks.js`), hub page + topic pages
  (breadcrumbs, sticky scroll-spy section nav, related, prev/next, back), render-on-route controller
  (`js/views/learn-view.js`), registry-backed search, responsive `.kx-*` design system (phone/tablet/desktop). Cut
  `#view-learn` over; retired `formulas.js` + legacy DOM-scan search/jump-nav. Tables/custom topics/bookmarks/premium
  preserved. **Known follow-ups for P5 polish:** prune now-inert legacy Learn CSS (`.learn-jump-*`, `.learn-group-*`,
  `.search-highlight`) + the residual `learn-searchable` class on reference cards.
- **Phase 3 — Premium content ✅ (2026-06-28):** authored **14 gold-standard topics** across a 5-category taxonomy
  (Numbers · Arithmetic · Commercial Math · Modern Math · Mensuration) — full depth (overview/concepts/formulas/
  tricks/traps/examples/memory/revision); 5 honest scaffolds. Content-quality gate enforces depth on every published
  topic. (The cheat-sheet projection view + formula explorer moved to P4, alongside revision mode — the blocks are
  authored.)
- **Phase 4 — Integrations (no AI) ✅ (2026-06-28):** progress module (`js/learn/learn-progress.js`, localStorage-
  primary + best-effort Firestore mirror; spaced-revision helpers under `learn-progress.check`, 32 assertions); topic
  **action bar** (Practise this → focus-drill via `drillCategory`; **Quick-revision cheat-sheet projection** = a
  filtered view over the authored revision/formula/trick/trap blocks; Mark-complete; Save); hub **Continue learning**
  + spaced **Due for revision** strips + live completion ticks; **data-level Planner link** (every applicable topic
  now carries a validated `syllabusTopicId` → `data/syllabus.js`; content-check 144→162). First Learn server hooks:
  two owner-writable user-doc fields (`learnProgress`, `learnTopicBookmarks`) — same path as customTopics/bookmarks,
  no new collection/rule. SW v132→v133. **No AI surface in Learn** (the Planner is AI-driven, so only the data link is
  established — no AI-adjacent button is added inside Learn).
- **Phase 5 — Polish:** performance (lazy per-category load if warranted), animation/responsive tuning, final
  production audit. **Carry-over polish:** prune inert legacy Learn CSS (`.learn-jump-*`/`.learn-group-*`/
  `.search-highlight`) + the residual `learn-searchable` class on reference cards; optional section-nav scroll-fade
  hint + a hub category jump-nav if the 5-category hub feels long on phones. (`js/formulas.js` already retired in P2.)
- **Designed-for, additive (no future rewrite):** videos, flashcards, diagrams, notes, offline content, learning
  analytics, topic streaks — each a new block `type` + renderer or a progress hook.

## 🛠 Scale-debt deferred at launch (ADR-041, 2026-06-14) — intentional, not forgotten

Deferred during the first-1–2k-users launch pass because they only bite at 10k+ users or are non-blocking for the
first cohort. Each is safe to defer; revisit at the trigger noted.

| Item | Why deferred (safe at 1–2k) | Revisit trigger |
|---|---|---|
| **Failed-grants N+1 scan** (super-admin Revenue → every user's `entitlementLogs`, on-demand) | Rarely-opened admin tab; thousands of reads is trivially cheap at this scale | >5k users OR the tab feels slow → maintain a top-level `failedGrants` append collection |
| **Coaching roster full-text search** (falls back to a ≤1000-doc fetch + client filter) | Coachings are small at launch; the fallback is correct, just not indexed | Any coaching >1k students → Algolia/Typesense or a prefix-index |
| **Pre-aggregate coaching dashboard metrics** (activeToday/avgAccuracy via 5000-cap roster scan per refresh) | One bounded scan per refresh is cheap for small rosters | Coachings approaching the 5000 cap → write per-coaching daily rollups in the cron |
| **Refund / chargeback webhook** (`payments.status` stays `paid`; premium not auto-reverted) | Zero payments yet; a refund is handled today by a manual super-admin **revoke** | First real refunds / before scaling paid marketing → Razorpay refund webhook + `status:'refunded'` + auto-revert |
| **Field-mask the coaching detail read** (full user doc incl. 300-item `responseTimes`) | A few KB extra per profile open; negligible | If detail reads dominate cost |
| **Startup skeleton-first render** (boot blocks on `loadFromFirestore`, 2–3s on slow nets) | Acceptable first-paint at launch | If onboarding drop-off correlates with load time |
| **Display-name edit + results per-category breakdown** | Features, not blockers; current flows are coherent | Product polish sprint |
| **App Check, shared-package extraction, design-token unification across the 3 apps** | Maintainability/brand, not user-facing; disjoint audiences | Pre-Series-A hardening / before a 4th app |
| **DAU/newToday "as of 00:05 UTC" relabel + improver-list min-sample gate** | Coaching/admin-facing only; values are directionally correct and show sample size | When the metrics drive real decisions |

---

## ⭐ Historical Analytics Foundation (milestone — established 2026-06-13, ADR-027)

**The principle: measure real improvement, never invent it.** QuantReflex's central promise is not "students
are practicing" — it is "students are getting **faster**." That claim can only be made from **real dated
history**, which did not exist before this milestone (`responseTimes` was a timestamp-less ring; `dailyHistory`
stored no times). This milestone lays the permanent substrate so **all future coaching analytics are built on
real historical performance data** — never fabricated, estimated, inferred, or backfilled.

**Landed (foundation):**
- `users.stats.dailyHistory[date]` now records `{attempted, correct, sumTimes, count}` → per-day avg speed,
  accuracy, and participation (90-day rolling window) — the first dated speed history in the system.
- `practiceSessions/{auto}` is now actually written (per-session duration + date).
- `coachingMetrics/{coachingId}` daily rollup (written by the existing super-admin cron) → per-coaching avg
  speed / accuracy / active / premium / trial / participation per day; backs trends without per-load scans.
- Composite `users(coachingId, plan|isTrial|createdAt)` indexes for coaching-scoped `count()`.

**Lights up automatically as history accrues (no further code):**
- 7-day speed trend → real after 7 days; 30-day speed trend → after 30 days (UI shows "collecting data —
  available in N days" until then).
- Coaching Improvement Score (speed Δ + accuracy Δ + active-% + streak-retention vs the coaching's OWN past).
- Real "Top/Bottom improvers" (dated speed delta, not the old last-200-question heuristic).
- Week-over-week growth + retention (from `coachingMetrics` day rows).

**Governance:** no backfill, no synthetic trends. History-dependent metrics MUST render an honest "collecting"
state until the data exists. Any future **platform** benchmark (e.g. "faster than 68% of students") must be
super-admin-owned and **anonymized** — never expose competing coaching identities (ADR-028).

---

## Design system (established 2026-06-11 — ADR-010)
The app-wide UI design system is now documented in [TECHNICAL_BIBLE.md §10A](TECHNICAL_BIBLE.md):
tokens (24/20/18px radii, hairline borders, soft navy shadows, 32/24/16 spacing), one glassmorphism
foundation + 3 elevation levels, the reusable premium-feature card, and typography/CTA hierarchy.
**Delivered this pass:** Practice scroll-bug fix, Practice simplification (action-focused), AI Coach +
Study Plan unified with Math Duel, de-purpling, stat/CTA token alignment.
**Remaining UX follow-ups (low priority):** audit Learn sub-element radii (`.table-card`, `.math-grid-item`)
and Settings/Session-Results screens against the tokens; optional "Recent Sessions" strip on Practice
(needs a session feed). Track new screens against §10A rather than hand-styling.

**Practice layout hardened (2026-06-11 — ADR-011):** Practice is now a fixed app shell — `--qr-nav-h`
nav-height token, app-scroller (`.container`) neutralization (eliminates the double-scroll that dragged
the header), fixed header + a single centered scroll panel with equal top/bottom spacing, and
`env(safe-area-inset-top/bottom)` handling. See the §10A scroll contract. Follow-up (low priority):
consider extending the same safe-area-top treatment to the other views for full notch consistency.

## Open technical debt (from the 2026-06-11 audit)

| ID | Item | Type | Priority | Notes |
|---|---|---|---|---|
| M6 | Global rate limiting | Infra | High before 100k | Current limiters are per serverless instance. Needs a shared counter (Firestore/Redis) or App Check to be a true global cap. |
| M7 | Firebase App Check | Infra/console | High before 100k | Not enabled. Requires console config + client SDK init across the three apps. Blunts automated abuse of the public client SDK. |
| M9 | Timestamp standardization | Cleanup | Low | Mixed `serverTimestamp()` / ISO strings; all readers normalize via `_toMillis`. Prefer `serverTimestamp()` server-side on new writes; no mass rewrite planned. |
| LOW-1 | Duel `waiting` room read scope | Security | Low | Any authed user can read a waiting duel doc (needed for join). Tighten only if duel content becomes sensitive. |
| DEBT-1 | ~~Retire client read-time `premiumPlusPlan` normalization~~ | — | Done | Removed in the v2 monetization rewrite (ADR-009); `getAccessState` no longer normalizes legacy plan values. |
| DEBT-2 | Reconciliation cadence for `coachings.studentCount` | Ops | Medium | The reconcile script is manual. Consider a scheduled function if drift recurs. |
| TEST-1 | Automated test coverage | Quality | Med | **Partial** — `main-app` `npm test` runs 7 deterministic validators (knowledge-base 3654, planner-engine 238, planner-brain 97, intelligence-consistency 79, notifications 18, ai-cost 12, duel-archive 45 ≈ **4,143 assertions**), plus `scripts/mock-engine.check.js` (100) and `scripts/duel-sim.js` (needs `firebase-admin`). **Gap:** payment/entitlement critical-path tests (AUDIT §16) + wire `mock-engine.check` into `npm test`. |
| DEBT-4 | Duel replay needs its own document | Feature/Data | Low | **By design (ADR-068).** Per-question replay data lives only in `duels/{code}/players/{uid}` which is hard-deleted at the 30-day room TTL — so `duelHistory` (permanent, denormalized) cannot replay an old duel. When a Replay screen is built, write a separate `duelReplays/{code}` doc at finalize (additive, no migration; old duels simply have no replay). The Battle Archive UI already expands in place, ready to host it. |
| DEBT-5 | Duel competitive layer (ELO / seasons / leaderboards) | Feature | Low | **Designed-for, not built (ADR-068).** All additive on the existing schema: ELO → a rating field on `duelStats/summary`; seasons → a `season` key on `duelHistory` rows; leaderboards → a separate **public** aggregate collection (`duelStats` is owner-read-only by design, so it can't back a cross-user board). No migration of existing data required. |
| DEBT-3 | ~~`stats.lastActiveDate` is a non-sortable `toDateString`~~ | — | **Done (ADR-029)** | Fixed: `main-app/js/progress.js` now writes a sortable `stats.lastActiveMs`; the coaching roster order/cursor + the super-admin inactive sweep/list/export all query `lastActiveMs`; index `users(coachingId, stats.lastActiveMs DESC)` added; backfilled by `firestore/migrations/2026-06-13-add-lastActiveMs.js`. `lastActiveDate` retained for display only. |

## Deployment reminders (not code-resolvable here)

- **App code deploys via Vercel** (`main-app`, `super-admin-app`, `coaching-admin-app`) on push —
  Firebase deploy only covers rules + indexes.
- **Vercel Free (Hobby) cap = 12 Serverless Functions/project** (ADR-017). Post-consolidation counts:
  main-app **8**, super-admin **8**, coaching **5**. New features must fit an existing domain API (no new
  `api/*.js` unless unavoidable) — see [TECHNICAL_BIBLE §3.1](TECHNICAL_BIBLE.md) + GOVERNANCE Infrastructure
  Governance. Cron ≤ once/day on Hobby. If a Razorpay webhook path ever changes, reconfigure the Razorpay
  dashboard.
- **Firestore rules/indexes** deploy via `firebase deploy --only firestore[:rules|:indexes]`.
- **Cloud Functions** deploy via `firebase deploy --only functions`.

## Coaching Portal (`coaching-admin-app`)

Functional API (`auth`, `students`, `dashboard`, `notices`, `insights`) with a lean
UI. Future build-out should follow the governance workflow and keep `coachingId`-claim scoping for
all reads. Document any new collections/fields in [FIRESTORE_BLUEPRINT.md](FIRESTORE_BLUEPRINT.md).

## Planned / candidate features

_(Add product features here as they are scoped. Each must pass through the
[GOVERNANCE.md](GOVERNANCE.md) workflow: Bible-first, impact report, implement, verify, changelog,
version bump.)_

- **Super Admin Control Center (multi-phase program)** — elevate `super-admin-app` into the platform's
  operating system. **Phase 1 ✅ (2026-06-11, ADR-012/013):** GPT token/cost instrumentation, revenue dashboard
  from `payments`, one immutable `auditLogs` (every admin action), pre-aggregated `metrics/latest` via Vercel
  Cron + Firestore `count()`. **Phase 2 ✅ (2026-06-11, ADR-014):** user lifecycle
  (suspend/restore/archive/purge/reset-progress, Firebase-Auth-disable-enforced) + Inactive User Center + safe
  archive→30-day-hold→permanent-delete workflow + `cleanup-sweep` cron + Auth-user removal. **Phase 3 ✅ (2026-06-12, ADR-015):** AI Operations Center — editable `config/aiBudget` (monthly budget +
  warn/critical thresholds), month-to-date spend + linear projection + status, usage-based AI abuse flags. **Phase 4 ✅ (2026-06-12, ADR-016):** Export Center (authenticated CSV — users/premium/coachings/revenue/
  AI-usage/inactive) + Alert Center (AI budget / expired-premium / stale duels / pending purges) on the
  Dashboard. **Phase 5 ✅ (2026-06-12, ADR-018):** Security Center (client-side failed-login / suspicious-access /
  admin-login capture → append-only `securityEvents`; 24h counters + posture + recent feed) + Firestore-Ops
  (per-collection `count()` sizes + daily growth series from `metrics.collectionCounts`) + Content Management
  (`questions` CRUD — update/archive/delete, fixes the edit-duplication bug, adds `updatedAt`, all audited).
  Unblocked the two Phase-4 deferred alerts (payment-failure-spike + Firestore-growth-spike) into the Alert
  Center. Each phase is Bible-first + governed; targets 100k→1M scale via pre-aggregation, no Blaze dependency.
  **Hardening follow-up (tracked, M7):** enable Firebase App Check to attest the unauthenticated `securityEvents`
  capture write — see SECURITY_ARCHITECTURE §6.
- **Super Admin V2 — tablet-first governance rebuild (ADR-019/020/021)** — turns the operational app into a
  tablet-first governance OS (11" Android tablet, Chrome PWA, landscape): 7-domain IA (Command Center · Users ·
  Coachings · Revenue · Content · AI · Operations), an admin design system (collapsible rail, in-flow SplitView
  360s, Tabs, Table card-mode, focus-trap modals — TECHNICAL_BIBLE §10B), a Global Search ecosystem primitive
  (server-side prefix, `system?action=search`), and end-to-end Emergency Controls (maintenance / AI-kill /
  payment-kill enforced in main-app). All within the Vercel-Free 8/12 budget (5 new `system` actions, zero new
  functions; strangler rollout). **Pass 1 (2026-06-12):** Phase 0 governance docs + Phase 1 tablet-first shell +
  Phase 2 Command Center + Global Search + Emergency Controls.
- **Super Admin V2 — entity-centric 360 consolidation ✅ COMPLETE (2026-06-12, ADR-022)** — the full Center
  migration shipped and the legacy scaffolding is retired: **User-360**, **Coaching-360**, **AI Cost Center**,
  **Revenue Center**, and **Operations Center** are first-class views (SplitView master/detail + Tabs, one owner per
  capability). Inactive merged into a Users filter chip; the overlay drawer + grouped list removed; per-user AI
  throttle enforced end-to-end in main-app. **Final consolidation pass** deleted all 7 legacy view files + the drawer
  DOM — **no hybrid old/new state remains**. Zero new functions (super-admin 8/12, main-app 6/12). This closes the
  Super Admin V2 program; future admin work extends an existing Center, never adds a parallel screen.
- **Production-hardening audit remediation ✅ (2026-06-12, ADR-023)** — closed the CRITICAL client-side admin
  credential leak (admin auth is now the server `admin:true` claim only; **operational: rotate the Firebase
  password + enable MFA**) and bounded every unbounded admin Firestore scan (AI usage, exports, daily payments
  snapshot, duels-cleanup, premium broadcast, coaching cascade) so they truncate/paginate instead of OOM/timeout.
  Accurate active-premium via `count()` aggregations + two new composite indexes. **Tracked follow-up (before
  ~100k users):** durable per-user/per-coaching **AI-cost pre-aggregation** into the daily snapshot (replaces the
  interim 5000-row cap on `ai?action=usage`) and a **day-bucketed incremental revenue counter** (replaces the
  full `payments` scan in `metrics.js`). Until then the capped endpoints degrade gracefully (surface `truncated`).
