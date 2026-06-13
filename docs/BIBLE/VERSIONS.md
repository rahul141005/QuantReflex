# QuantReflex Bible — Versioning System

**This file is the authoritative version registry for the QuantReflex Bible.**
Every governed change updates the relevant version number here and records a migration note.

---

## Current Versions

| Track | Version | Meaning |
|---|---|---|
| **Bible Version** | 2.24 | The documentation set as a whole (these `/docs/BIBLE/` files). |
| **Architecture Version** | 2.15 | App topology, service boundaries, data-flow contracts. |
| **Firestore Version** | 2.13 | Collection/field/path schema + indexes. |
| **Security Version** | 2.10 | Auth model, rules, claims, abuse controls. |
| **Payment Version** | 2.2 | Razorpay flows, plan config, entitlement grant logic. |

> **2.0 (2026-06-11)** — v2 monetization (ADR-009): single `plan` model, lifetime + Premium+ removed.
> Breaking schema change (MAJOR) across every track. The 1.0 baseline (also 2026-06-11) incorporated
> audit fixes C1–M8. See [CHANGELOG.md](CHANGELOG.md) and [DECISION_LOG.md](DECISION_LOG.md).

---

## Semantics — when to increment

Each track uses `MAJOR.MINOR`:

- **MINOR** (`1.0 → 1.1`): additive or corrective change that does **not** break existing
  readers/writers. New optional field, new endpoint, new index, clarified contract, bug fix.
- **MAJOR** (`1.x → 2.0`): **breaking** contract change. Renamed/removed field still read by
  some app, changed auth requirement, changed payment/entitlement semantics, removed endpoint,
  incompatible schema migration. A MAJOR bump REQUIRES a migration note (below) and a
  cross-app compatibility review in the change-impact report.

**Bible Version** bumps when ANY track bumps (take the highest change: a MAJOR in any track →
Bible MAJOR). It also bumps MINOR for structural/governance changes to the docs themselves.

Each governed doc carries its own `Doc Version` in its header; that tracks edits to that single
file and moves independently of the system-level tracks above.

---

## How a change updates this file (governance step G)

1. Decide which track(s) the change touches (Architecture / Firestore / Security / Payment).
2. Increment those tracks per the semantics above; bump Bible Version accordingly.
3. Add a row to **Version History** and, for any MAJOR, a **Migration Note**.
4. Reference the CHANGELOG entry and (if a decision was made) the DECISION_LOG entry.

---

## Version History

| Date | Bible | Arch | Firestore | Security | Payment | Summary |
|---|---|---|---|---|---|---|
| 2026-06-13 | 2.23 | 2.14 | 2.13 | 2.10 | 2.2 | **Sections 2–10 program — P0 (gate + live-breaking fixes; ADR-033 + ADR-034):** P0-a governance gate (below) **plus the two P0 code fixes that shipped with it** — **P0-b:** `withAuth` gains a rate-limit **class**, with the duel endpoint on its own **120/hr** bucket (`_lib/middleware.js`) so a live duel can't 429 mid-finish or drain the 20/hr AI bucket; **P0-c:** the super-admin orphan/health/alert probes + `duels-cleanup` (`system.js`) stop querying the dead V1 `waiting` status — probes now flag only NON-LIVE rooms (`lobby`/`abandoned`/`expired`) and cleanup is **non-destructive to `active`** (purges only non-live rooms past retention; `api/duel.js` stays the sole finalizer). Arch 2.13→2.14.<br>**P0-a gate (ADR-033 + ADR-034):** a 13-agent adversarial audit verdict — **preserve, don't rebuild** Duel V2 — opens a targeted fix-pass + the owner-LOCKED design-language inheritance (true Practice `drill-engine` component reuse, not imitation) and a first-class **Independent** affiliation for Super-Admin. This row is the **doc-only gate**: authored ADR-033 (Duel fix-pass: drill-engine reuse + de-indigo §10A inheritance, D1 rate-limit class, admin V2-lifecycle correctness, per-question data + honest metrics, leaveLobby/self-heal) and ADR-034 (backfilled, authoritative, queryable Independent + coaching grouping), and **corrected the `activeDuelId` drift** (DECISION_LOG.md:92 + FIRESTORE_BLUEPRINT.md:143 + the `_finalizeTxn` header claimed it's cleared at finalize; the shipped code intentionally does NOT — now reconciled, + strictly-2-player note). Zero new functions; Spark-safe; server-authoritative model reinforced. Arch/Firestore/Security bump per phase as code lands (P0-b/c, P1, P2). Bible 2.21→2.22. |
| 2026-06-13 | 2.21 | 2.13 | 2.13 | 2.10 | 2.2 | **Coaching-affiliation data correctness on Spark (Section 1, ADR-032):** a student created with a valid `coachingId` was correctly affiliated (`users/{uid}.coachingId` set — proven with live data) yet Super-Admin showed the coaching with **0 students**. Root cause: `coachings/{id}.studentCount` was maintained **only** by the `syncCoachingStudentCount` `onDocumentWritten` trigger, which **does not run on Spark** — freezing every counter at 0. Fix (root, not symptom): `studentCount` maintenance moved **into the request path** — `register` (+1, in its batch), `account.claim-coaching` + `users.reassign-coaching` (±1, transactional), `users.purge` + `account.delete` (−1, best-effort); decrement only when `coachingId` is actually removed (suspend/archive keep it). Detail surfaces already use live `count()` as truth (the `(coachingId,plan)` index already exists). Trigger **neutralized** (no-op early return → can't double-count on a future Blaze move). Compounding read defects fixed: `register` now initializes `stats.lastActiveMs`/`lastActiveDate` so the coaching roster `orderBy` no longer drops never-practiced joiners; User-360 "recent duels" repointed from the dead Duel-V1 `participants.${uid}` query to `users/{uid}/duelHistory` (+ shown in Activity); Super-Admin Users resolves `coachingId → name` (client-side) instead of the raw code. No new fields/indexes; no rules change; no new functions. Two one-time backfills (owner-authorized). Firestore 2.12→2.13, Arch 2.12→2.13, Bible 2.20→2.21. |
| 2026-06-13 | 2.20 | 2.12 | 2.12 | 2.10 | 2.2 | **Duel V2 — server-authoritative premium 1v1 speed challenge (ADR-031, full rebuild):** a 33-agent adversarial workflow + 2 red-team passes found 65 confirmed problems in the client-trust duel system — plaintext answer key in the room doc, 100% client-written score/winner, active-forever hangs on timeout, localStorage-only recovery, client-only premium, whole-map writes per answer, unsynchronised countdowns, no Active-Duel card/resume/history/share. Rebuilt to the owner's 4 decisions: **server-authoritative scoring** (new Vercel `api/duel.js`, Admin SDK, the ONLY writer of questions/answer-key/grading/winner/status; premium via `aiService.resolvePlan`), **hidden-until-results** (opponent shows only presence), **speed-weighted accuracy-dominant** winner (`correctCount×1000 + speedBonus≤300`), **full one-pass rebuild**. ONE canonical model: split docs — `duels/{code}` (prompts text-only + presence), `duels/{code}/private/key` (server-only answers), `duels/{code}/players/{uid}` (own answers, opponent denied → zero hot-path fan-out); `users.activeDuelId` recovery mirror + Active-Duel home card; `users/{uid}/duelHistory/{id}` (server-written). Finalize = one status-CAS txn (idempotent) + endpoint-sent "opponent finished" FCM. **Spark-correct:** no Firebase functions (they don't run on Spark) — lazy finalize-on-`state` + Vercel daily-cron backstop. `/duels` rules **rewrite** (participants-only read; client writes only own `presence` via a two-level nested diff; private/winner/status denied; explicit `duelHistory` write-deny over the blanket `users/{uid}/{sub}` grant). No data migration (ephemeral, `schemaVersion:2`). One new Vercel function (7/12); index `duels(participantUids array-contains, status)`. Bible 2.19→2.20, Arch 2.11→2.12, Firestore 2.11→2.12, Security 2.9→2.10. |
| 2026-06-13 | 2.19 | 2.11 | 2.11 | 2.9 | 2.2 | **Coaching App V4 — value / premium-UI / performance pass (ADR-030):** a brutally-honest product review found the rebuilt coaching app *feels empty, low-information, and slow* — root cause: the backends compute rich data the views **discard** + the ADR-029 "masked scans" were never actually masked. **Performance:** real Firestore field masks (`.select()`) on the heavy coaching scans (students/dashboard/insights) + `Promise.allSettled` on the super-admin Command Center waterfall (the actual slowness). **Value:** Dashboard/Students/Performance/Engagement rebuilt to surface already-fetched-but-discarded data (`strongestStudents`/`recentActivity`/`streak`/`weakTopic`/`totalQuestionsSolved`) + demote vanity; honest available-today signal (WoW accuracy/participation) promoted. **Session Improvement (cold-start speed bridge):** student app computes first-half vs last-half session speed from the existing `perQuestionTimes` (≥6 timed Qs) → per-session `practiceSessions.{firstHalfAvg,secondHalfAvg,sessionImprovementPct}` + a rolling `users.stats.avgSessionImprovementPct` (read cheaply by the coaching scan); strictly a "Session Improvement" metric, never a 7/30-day trend. **Onboarding trust:** student join shows "✓ Connected to <Coaching Name>" (+ optional new `coachings.logoUrl`, set in super-admin); coaching code one-tap copyable in Settings. **Minimal coaching notes:** one plain-text note per student in `coachings/{id}/notes/{uid}` (Admin-SDK via `students?action=save-note` — no new function; client read/write denied). **Premium UI:** content emoji→inline-SVG, `.metric-card.accent-*` activated, heading tier, uniform empty/collecting/error taxonomy, `prefers-reduced-motion` + `:focus-visible`, ARIA tab fix. No new functions (coaching 5/12); additive Firestore + cross-app data-flow + a notes-deny rule. Bible 2.18→2.19, Arch 2.10→2.11, Firestore 2.10→2.11, Security 2.8→2.9. |
| 2026-06-13 | 2.18 | 2.10 | 2.10 | 2.8 | 2.2 | **Coaching ecosystem audit remediation (ADR-029):** fixed the audit's CRITICAL + HIGH findings. **Security:** suspend/delete a coaching now revokes the owner's tokens + drops their `coaching_admin` claim (delete also disables Auth), `withCoachingAuth` verifies with `checkRevoked` + a coaching-status gate, register endpoint rate-limited + crypto-strong token. **Data integrity:** Skip no longer records a 0-second solve (speed un-polluted); new sortable `users.stats.lastActiveMs` replaces the non-sortable `toDateString` in all order/range queries (coaching roster + super-admin inactive sweep/list/export, which previously never matched) — index updated, backfill migration added. **Scale:** dashboard/insights/notices scans bounded (5000) + the rollup cron parallelized (bounded concurrency); trial users no longer double-counted as premium; offboarded students excluded from coaching counts/lists. **Join UX:** validate-coaching surfaces the institute name ("Joined: …") + status; Smart-Nudge chips actually target inactive/low-streak; notices report true in-app reach; settings/profile/notices error+retry; badge/keyboard/affordance a11y. Security 2.7→2.8, Firestore 2.9→2.10, Bible 2.17→2.18. |
| 2026-06-13 | 2.17 | 2.10 | 2.9 | 2.7 | 2.2 | **Coaching App V3 — Analytics Foundation + mobile-first redesign (ADR-027/028):** establishes the first **dated speed history** — `users.stats.dailyHistory[date]` widened to `{attempted,correct,sumTimes,count}` (avgTime/day) in `main-app/js/progress.js`; `practiceSessions` now actually written (`savePracticeSession` wired); new per-coaching daily rollup `coachingMetrics/{id}` (written by the existing super-admin cron — **zero new functions**); 3 composite `users(coachingId,·)` indexes. Coaching App rebuilt as a mobile-first 5-tab "Speed Training Control Center" (Dashboard/Students/Performance/Engagement/Settings), Notices→Engagement Center, no Coaching Rank (→ Coaching Improvement Score vs own history), de-gamered dark theme + re-enabled zoom, broken `app.navigate` intervention arm fixed. **Honesty rule:** history-dependent metrics show "collecting data — live in N days", never fabricated/approximated trends; no backfill. Additive Firestore (MINOR), new `coachingMetrics` read rule (Security MINOR), cross-app data-flow (Arch MINOR). |
| 2026-06-12 | 2.16 | 2.9 | 2.8 | 2.6 | 2.2 | **Super Admin accessibility + governance enforcement — Pass 3 (ADR-026):** final pass of the ADR-024 program — an adversarial multi-agent UX/visual/a11y/navigation audit (35 candidates → 18 confirmed fixes). Keyboard-operable `.sv-row` / drop-zone / search results (`role`+`tabindex`+Enter/Space, WCAG 2.1.1); `aria-label`s on filter inputs + bulk checkboxes; labelled Global-Search `role="dialog"`/`listbox`/`type=search`; active nav `aria-current="page"`; fixed the dangling modal `aria-labelledby` (`#modalTitle` now set); rebuilt Tabs to the full WAI-ARIA tab pattern (roving tabindex + Arrow/Home/End); `aria-live` toast region (+ `role="alert"` on errors); remaining raw `e.message` sites (questions/command-center/global-search) routed through `getReadableError`; Content table card-mode on narrow panes; triplicated `_tile()` collapsed to one `AdminUtils.statTile`; restored the self-referential `--accent-glow`/`--accent-ring` light-mode token values; global `:focus-visible` ring. Zero new functions (8/12); client + Bible only; no schema change. UI/a11y (MINOR). |
| 2026-06-12 | 2.15 | 2.9 | 2.8 | 2.6 | 2.2 | **Super Admin Settings Center — Pass 2 (ADR-025):** new 8th domain (Settings) — Account (change password/email via Firebase SDK reauth) · Security (login history + **log out everywhere** via the one new `system?action=revoke-tokens`, self-scoped + audited) · Appearance (theme) · Preferences (landing/density/animations/date-format/timezone, device-local) · Platform info · Backup (CSV exports). Operations Diagnostics health grid reflects live kill-switch state. Zero new functions (8/12); no schema change. Security 2.5→2.6 (self-session revocation). |
| 2026-06-12 | 2.14 | 2.8 | 2.8 | 2.5 | 2.2 | **Super Admin thorough dark mode — Pass 1b (ADR-024):** 100% design-system-driven theming — re-tokenized the entire stylesheet + every view onto a semantic theme-token system with an intentionally-designed `[data-theme="dark"]` palette; zero hardcoded UI color literals remain (grep-verified). No-FOUC boot script + footer light/dark/system toggle persisted to `qrAdminTheme`. CSS/JS/HTML only; zero new functions. UI (MINOR). |
| 2026-06-12 | 2.13 | 2.8 | 2.8 | 2.5 | 2.2 | **Super Admin stability + UX polish — Pass 1a (ADR-024):** fixed the "Too many requests" user-delete bug at the root (admin rate limit 30→300/hr; bounded single-retry + operator-friendly errors in the API client; User-360/Coaching-360 delete now instant + zero-fetch, status mutations 2 calls→1 via local row-sync); fixed the collapsed-rail logout (first-class icon button); tablet touch targets (primary ≥48px / dense ≥44px); polished empty-state primitive + loading spinner. Zero new functions. UI/UX + one middleware constant (MINOR). The thorough 100% dark mode lands in Pass 1b. |
| 2026-06-12 | 2.12 | 2.7 | 2.8 | 2.5 | 2.2 | **Production-hardening audit remediation (ADR-023):** removed the hardcoded admin email+password from `super-admin-app/js/firebase/auth.js` (CRITICAL — admin authority is now the server `admin:true` claim only; **password must be rotated in Firebase Console + MFA enabled**). Bounded every unbounded admin scan (AI usage, `ai-usage` export, daily `payments` snapshot, `duels-cleanup`, premium broadcast, coaching cascade) so they truncate/paginate instead of OOM/timeout. Accurate active-premium via `count()` aggregations. **Two new composite indexes** `users (plan,planExpiry)` + `users (plan,fcmToken)`. Zero new functions (8/12 super-admin, 6/12 main). Additive Firestore + Security hardening (MINOR). |
| 2026-06-11 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | Initial authoritative Bible established under `/docs/BIBLE/`. Baseline includes audit fixes C1–M8 (see CHANGELOG). |
| 2026-06-11 | 2.0 | 2.0 | 2.0 | 2.0 | 2.0 | **v2 monetization (ADR-009):** single `plan` model; ₹89 lifetime + Premium+ removed; one Premium tier (₹299/6mo, ₹499/12mo) + custom-duration trials. Breaking schema. |
| 2026-06-11 | 2.1 | 2.0 | 2.0 | 2.0 | 2.0 | **Design-system consolidation (ADR-010):** unified card tokens/glass/elevation + premium-feature card + typography/CTA hierarchy documented in TECHNICAL_BIBLE §10A. UI-only (MINOR). |
| 2026-06-11 | 2.2 | 2.0 | 2.0 | 2.0 | 2.0 | **Practice fixed-shell layout (ADR-011):** `--qr-nav-h` nav-height token, app-scroller (`.container`) neutralization for Practice, fixed header + centered single scroll panel, safe-area top/bottom. UI-architecture (MINOR). |
| 2026-06-11 | 2.3 | 2.1 | 2.1 | 2.1 | 2.1 | **Super Admin Control Center — Phase 1 (ADR-012, ADR-013):** unified immutable `auditLogs` (every admin action); GPT token/cost instrumentation (`usage/ai` + `systemMetrics`); revenue accounting (`payments.amount`); pre-aggregated `metrics/latest` via Vercel Cron + Firestore `count()`. Additive (MINOR) across all four engineering tracks; **no data migration** (historical revenue via price-map fallback). |
| 2026-06-11 | 2.4 | 2.2 | 2.2 | 2.2 | 2.1 | **Super Admin Control Center — Phase 2 (ADR-014):** user lifecycle (suspend/restore/archive/purge/reset, Firebase-Auth-disable-enforced), Inactive User Center, soft-delete→30-day-hold→purge cleanup workflow + `cleanup-sweep` cron. Additive (MINOR); no data migration. |
| 2026-06-12 | 2.5 | 2.3 | 2.3 | 2.2 | 2.1 | **Super Admin Control Center — Phase 3 (ADR-015):** AI Operations Center — editable `config/aiBudget` (monthly budget + warn/crit thresholds), month-to-date spend + projection + status from pre-aggregated `systemMetrics`, usage-based abuse flags. Additive (MINOR). |
| 2026-06-12 | 2.6 | 2.4 | 2.3 | 2.2 | 2.1 | **Super Admin Control Center — Phase 4 (ADR-016):** Export Center (authenticated CSV via JSON+Blob; fixes the P2 inactive-export auth gap) + Alert Center (AI budget / expired-premium / stale duels / pending purges, on the Dashboard). Additive (MINOR). |
| 2026-06-12 | 2.7 | 2.5 | 2.3 | 2.2 | 2.1 | **API Consolidation (ADR-017):** domain-based action-routed handlers under the Vercel Free 12-function cap — super-admin 15→8, main-app 12→6 (dead `ai/word-problems` dropped); auth boundaries preserved. Infra-only (MINOR); no schema/data change. |
| 2026-06-12 | 2.11 | 2.7 | 2.7 | 2.4 | 2.2 | **Super Admin V2 — entity-centric 360 consolidation (ADR-022):** all admin workflows consolidated into 5 Centers (User-360, Coaching-360, AI Cost Center, Revenue Center, Operations Center), one owner per capability; SplitView master/detail replaces the overlay drawer + grouped Users list; Inactive merges into a Users filter chip; duplicate pages/metrics/filters/actions removed. New `?action=` branches on existing handlers (users +6, coachings +4, notifications +1 GET, system `revenue-intel` extended) + additive `users.aiThrottle` field + `usage/ai.gptThrottle*` counters — **zero new functions** (super-admin 8/12, main-app 6/12). Per-user AI throttle **enforced end-to-end** (main-app `api/ai.js` → `aiService.enforceAiThrottle`). **Final consolidation:** legacy view files (payments/inactive/security/firestore-ops/exports/notifications/system) + the overlay User-360 drawer DOM **deleted** — no hybrid old/new state remains. Additive (MINOR); no data migration. |
| 2026-06-12 | 2.10 | 2.6 | 2.6 | 2.4 | 2.2 | **Email normalization (ADR-020 update):** new `users.emailLower` (lowercased `email`) written at register + backfilled (`firestore/migrations/2026-06-12-add-emailLower.js`); Global Search email matching is now **case-insensitive** (`orderBy('emailLower')` with a lowercased prefix). Additive Firestore (MINOR); backfill migration (non-breaking); no API/function change. |
| 2026-06-12 | 2.9 | 2.6 | 2.5 | 2.4 | 2.2 | **Super Admin V2 — tablet-first governance rebuild (ADR-019/020/021):** 7-domain IA + admin design system (collapsible rail ≥768px, in-flow SplitView 360, Tabs, Table card-mode, focus-trap modals, `auto-fit` grids, viewport zoom re-enabled) [TECHNICAL_BIBLE §10B]; **Global Search** ecosystem primitive (server-side prefix on users+coachings, `system?action=search`, no client fetch-all); **Emergency Controls** (maintenance / AI-kill / payment-kill `config/*` docs + audited `config-set` + main-app enforcement in aiService/paymentService/boot). Foundation + Command Center pass. Additive (MINOR) across all tracks; **zero new serverless functions** (5 new `system` actions: search/config-get/config-set/revenue-intel/ack-alert); Payment track moves (flow now gated by kill switch); no data migration. |
| 2026-06-12 | 2.8 | 2.5 | 2.4 | 2.3 | 2.1 | **Super Admin Control Center — Phase 5 (ADR-018):** Security Center (new append-only `securityEvents` collection — client-side failed-login/suspicious/admin-login capture with SHA-256 emailHash; admin-read, immutable; + composite index) read via `system?action=security`; Firestore-Ops (`metrics.collectionCounts` daily growth + `system?action=firestore-ops`); Content Management (`questions` CRUD — `update`/`archive`/`delete` + new `updatedAt` field, fixes edit-duplication); unblocked payment-failure-spike + Firestore-growth-spike alerts. Additive Firestore + Security (MINOR); **zero new serverless functions**; no data migration. |

---

## Migration Notes

Migration notes are required for every MAJOR bump and for any change that requires a data
migration script. Format: what changed, who is affected, the migration action, rollback.

### 2026-06-13 — Duel V2: new schema, no data migration (ephemeral hard-cutover, ADR-031)
- **What changed:** `duels/{code}` gets a new server-authoritative shape (`schemaVersion:2`, prompts text-only,
  `presence`, `participantUids`, server-written winner/`perPlayer`); new subcollections `duels/{code}/private/key`
  (server-only answers) + `duels/{code}/players/{uid}` (own answers); new `users.activeDuelId` + `users/{uid}/
  duelHistory/{duelId}`. The `/duels` security rules are **rewritten**; one index added.
- **Who is affected:** duels are **ephemeral** (expire within the TTL). No production user state depends on an
  in-flight duel surviving a deploy.
- **Migration action:** **none — hard cutover.** Deploy rules + the new client/endpoint together; legacy in-flight
  `duels` docs (old shape) simply drain/expire — the new client only reads/writes `schemaVersion:2`. No backfill.
  Deploy the new index (`firebase deploy --only firestore:indexes`) and rules
  (`firebase deploy --only firestore:rules`). Set `CRON_SECRET` for the Vercel daily duel-sweep.
- **Rollback:** revert the commit set + redeploy the prior rules; old duels are gone (ephemeral) so there is
  nothing to restore.

### 2026-06-13 — Coaching V4: session-improvement + logoUrl + notes (non-breaking, MINOR, ADR-030)
- **What changed:** three additive schema items — `users.stats.avgSessionImprovementPct` (rolling within-session
  speed-delta %) + optional `practiceSessions.{firstHalfAvg,secondHalfAvg,sessionImprovementPct,timedCount}`
  (the "Session Improvement" bridge); optional `coachings.logoUrl` (institute logo URL); and a new
  `coachings/{id}/notes/{studentUid}` subcollection (one plain-text coaching note per student, Admin-SDK only).
- **Who is affected:** additive only. Existing user docs lack `avgSessionImprovementPct` until a ≥6-question
  session completes; all readers default it to `null`/0. Pre-ADR-030 `practiceSessions` lack the half-avg fields
  (readers treat them as "no session-improvement data"). `logoUrl`/notes are absent until set. No field renamed
  or removed; no reader breaks.
- **Migration action:** **none — no backfill by design** (honest data only). `avgSessionImprovementPct` accrues
  from 2026-06-13 forward as students finish timed sessions; `logoUrl`/notes are set on demand. Deploy the
  updated rules (`firebase deploy --only firestore:rules`) for the explicit `notes` deny. **No new index**
  (the note is read by doc id; `avgSessionImprovementPct` is read off already-scanned user docs, not queried).
- **Rollback:** all three are additive and ignored by older readers; to revert, stop writing them (no data
  cleanup required). The notes subcollection is server-only, so removing the feature leaves orphaned notes that
  are never read.

### 2026-06-13 — `stats.lastActiveMs` backfill (non-breaking, MINOR, ADR-029)
- **What changed:** added a sortable epoch-ms `users.stats.lastActiveMs` (written by `progress.js` going
  forward) because `stats.lastActiveDate` (a `toDateString`) sorts lexically by weekday, breaking the coaching
  roster order/pagination and making the super-admin inactive `< cutoff` range query never match.
- **Who is affected:** additive — existing docs lack the field until backfilled; the coaching roster + inactive
  queries (which now `orderBy/where` on `lastActiveMs`) skip un-backfilled docs until the migration runs.
  In-memory readers still use `lastActiveDate` (tolerant). No field renamed/removed.
- **Migration action:** **run `firestore/migrations/2026-06-13-add-lastActiveMs.js` (dry-run, then `--apply`)**
  — idempotent; sets `lastActiveMs = Date.parse(lastActiveDate)` (fallback `updatedAt`) where missing. Deploy
  the updated index + rules first (`firebase deploy --only firestore:indexes,firestore:rules`).
- **Rollback:** the field is additive; to revert, switch the queries back to `lastActiveDate` (not recommended —
  it never sorted correctly). No data cleanup needed.

### 2026-06-13 — Analytics Foundation: `dailyHistory` widening + `coachingMetrics` (non-breaking, MINOR, ADR-027)
- **What changed:** `users/{uid}.stats.dailyHistory[date]` gains `{sumTimes, count}` alongside the existing
  `{attempted, correct}` (per-day avg speed = `sumTimes/count`); new per-coaching daily rollup collection
  `coachingMetrics/{coachingId}`; 3 composite `users(coachingId,·)` indexes; `practiceSessions` now written.
- **Who is affected:** additive only. Existing day records lack `sumTimes/count`; **all readers default them
  to 0**, so no reader breaks. No field is renamed or removed.
- **Migration action:** **none — no backfill by design** (honesty rule: real history only). New keys accrue
  from 2026-06-13 forward as students practice; `coachingMetrics` rows accrue as the daily cron runs. Deploy
  the 3 new indexes (`firebase deploy --only firestore:indexes`) and the updated rules
  (`firebase deploy --only firestore:rules`). Speed-trend UI stays in a "collecting data" state until ≥7/≥30
  days exist.
- **Rollback:** the new keys/collection are additive and ignored by older readers; to revert, stop writing
  them (no data cleanup required).

### 2026-06-11 — v2.0 MAJOR (monetization, ADR-009)
- **What changed (breaking):** entitlement schema replaced. New canonical fields on `users/{uid}`:
  `plan ('free'|'premium')`, `planType ('premium_6m'|'premium_12m'|null)`, `planExpiry`, `planSource`,
  `planUpdatedAt` (+ retained `isTrial`, `trialEnd`). **Removed:** `isPremium, hasPaid, isEarlyUser,
  isPremiumPlus, premiumPlusPlan, premiumPlusExpiry, premiumPlusStatus, lastPremiumPlusPaymentId`.
  Plan keys `premium`/`plus_6month`/`plus_yearly` → `premium_6m`/`premium_12m`. JWT claim
  `{premium, premiumPlus}` → `{premium}`. `req.userPremiumPlus` removed.
- **Who is affected:** all three apps, functions, rules, and every user doc. **Zero production users**
  → no grandfathering; pre-launch normalization only.
- **Migration action:** run `firestore/migrations/2026-06-11-v2-plan-schema.js` (dry-run, then
  `--apply`) to normalize any dev/test docs and delete removed fields. Deploy rules
  (`firebase deploy --only firestore:rules`). Deploy app code via Vercel and functions via
  `firebase deploy --only functions`.
- **Rollback:** revert the v2 commit set and redeploy; the migration is forward-only (re-deriving v1
  dual-tier state from `plan` is not supported — restore from backup if needed). Acceptable because
  there are no production users.
- **Supersedes:** `2026-06-11-normalize-premiumPlusPlan.js` (historical; the `premiumPlusPlan` field
  it normalized no longer exists).

### 2026-06-12 — `emailLower` backfill (non-breaking, MINOR)
- **What changed:** added `users.emailLower` (lowercased `email`) so Global Search can match email
  case-insensitively. Written at register going forward; the search email sub-query now uses `emailLower`.
- **Who is affected:** existing `users` docs lack the field until backfilled; until then, email search falls back
  to a miss for those docs (uid / name / coachingId still match) — no functional breakage.
- **Migration action:** run `firestore/migrations/2026-06-12-add-emailLower.js` (dry-run, then `--apply`). It
  pages all users and sets `emailLower = (email||'').toLowerCase()` where missing or stale (batched ≤400/commit).
  Idempotent and safe to re-run. No rules/index change (single-field auto-index covers the prefix query).
- **Status:** ✅ **Applied 2026-06-12** to `quant-reflex-trainer` — scanned 12, updated 12, alreadyOk 0, noEmail 0;
  re-run confirms idempotent (updated 0 / alreadyOk 12). Firestore rules + indexes also (re)deployed the same day
  (`firebase deploy --only firestore:rules,firestore:indexes` — rules compiled + released, indexes deployed, no
  index deletions).
- **Rollback:** none needed; the field is additive and unused by older readers. To remove, delete the field via
  a follow-up script — but there is no reason to.

### 2026-06-11 — Baseline (no MAJOR; recorded for completeness)
- **Firestore data migrations shipped (not schema-breaking):**
  - `firestore/migrations/2026-06-11-normalize-premiumPlusPlan.js` — normalizes legacy
    `premiumPlusPlan` values (`yearly`/`6_months` → `plus_*`). Applied; 0 legacy docs found.
  - `firestore/migrations/2026-06-11-reconcile-studentCount.js` — recomputes canonical
    `coachings.studentCount`, drops legacy `studentsCount`. Applied; 2 coachings corrected.
- **Index change (deployed):** `entitlementLogs` index → `COLLECTION_GROUP` (`adminId`,`timestamp`);
  old `COLLECTION` (`uid`,`timestamp`) index deleted via `--force`.
- **Rollback:** re-add the old index to `firestore.indexes.json` and redeploy; the migrations are
  idempotent and safe to re-run.
