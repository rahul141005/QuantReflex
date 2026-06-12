# QuantReflex Roadmap & Known Debt

**Forward-looking plan and the outstanding technical debt register.** This is where deferred audit
items, infra tasks, and planned features live so they are not lost. Update as items land (move to
[CHANGELOG.md](CHANGELOG.md)) or as priorities change.

Companion: [GOVERNANCE.md](GOVERNANCE.md) · [DECISION_LOG.md](DECISION_LOG.md) · [../../AUDIT-REPORT.md](../../AUDIT-REPORT.md)

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
| TEST-1 | Automated test coverage | Quality | High | No automated tests exist. Start with the payment/entitlement critical cases (AUDIT §16). |

## Deployment reminders (not code-resolvable here)

- **App code deploys via Vercel** (`main-app`, `super-admin-app`, `coaching-admin-app`) on push —
  Firebase deploy only covers rules + indexes.
- **Vercel Free (Hobby) cap = 12 Serverless Functions/project** (ADR-017). Post-consolidation counts:
  main-app **6**, super-admin **8**, coaching **6**. New features must fit an existing domain API (no new
  `api/*.js` unless unavoidable) — see [TECHNICAL_BIBLE §3.1](TECHNICAL_BIBLE.md) + GOVERNANCE Infrastructure
  Governance. Cron ≤ once/day on Hobby. If a Razorpay webhook path ever changes, reconfigure the Razorpay
  dashboard.
- **Firestore rules/indexes** deploy via `firebase deploy --only firestore[:rules|:indexes]`.
- **Cloud Functions** deploy via `firebase deploy --only functions`.

## Coaching Portal (`coaching-admin-app`)

Functional API (`auth`, `students`, `dashboard`, `leaderboard`, `notices`, `insights`) with a lean
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
