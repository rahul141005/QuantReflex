# QuantReflex Bible — Versioning System

**This file is the authoritative version registry for the QuantReflex Bible.**
Every governed change updates the relevant version number here and records a migration note.

---

## Current Versions

| Track | Version | Meaning |
|---|---|---|
| **Bible Version** | 2.11 | The documentation set as a whole (these `/docs/BIBLE/` files). |
| **Architecture Version** | 2.7 | App topology, service boundaries, data-flow contracts. |
| **Firestore Version** | 2.7 | Collection/field/path schema + indexes. |
| **Security Version** | 2.4 | Auth model, rules, claims, abuse controls. |
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
| 2026-06-11 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | Initial authoritative Bible established under `/docs/BIBLE/`. Baseline includes audit fixes C1–M8 (see CHANGELOG). |
| 2026-06-11 | 2.0 | 2.0 | 2.0 | 2.0 | 2.0 | **v2 monetization (ADR-009):** single `plan` model; ₹89 lifetime + Premium+ removed; one Premium tier (₹299/6mo, ₹499/12mo) + custom-duration trials. Breaking schema. |
| 2026-06-11 | 2.1 | 2.0 | 2.0 | 2.0 | 2.0 | **Design-system consolidation (ADR-010):** unified card tokens/glass/elevation + premium-feature card + typography/CTA hierarchy documented in TECHNICAL_BIBLE §10A. UI-only (MINOR). |
| 2026-06-11 | 2.2 | 2.0 | 2.0 | 2.0 | 2.0 | **Practice fixed-shell layout (ADR-011):** `--qr-nav-h` nav-height token, app-scroller (`.container`) neutralization for Practice, fixed header + centered single scroll panel, safe-area top/bottom. UI-architecture (MINOR). |
| 2026-06-11 | 2.3 | 2.1 | 2.1 | 2.1 | 2.1 | **Super Admin Control Center — Phase 1 (ADR-012, ADR-013):** unified immutable `auditLogs` (every admin action); GPT token/cost instrumentation (`usage/ai` + `systemMetrics`); revenue accounting (`payments.amount`); pre-aggregated `metrics/latest` via Vercel Cron + Firestore `count()`. Additive (MINOR) across all four engineering tracks; **no data migration** (historical revenue via price-map fallback). |
| 2026-06-11 | 2.4 | 2.2 | 2.2 | 2.2 | 2.1 | **Super Admin Control Center — Phase 2 (ADR-014):** user lifecycle (suspend/restore/archive/purge/reset, Firebase-Auth-disable-enforced), Inactive User Center, soft-delete→30-day-hold→purge cleanup workflow + `cleanup-sweep` cron. Additive (MINOR); no data migration. |
| 2026-06-12 | 2.5 | 2.3 | 2.3 | 2.2 | 2.1 | **Super Admin Control Center — Phase 3 (ADR-015):** AI Operations Center — editable `config/aiBudget` (monthly budget + warn/crit thresholds), month-to-date spend + projection + status from pre-aggregated `systemMetrics`, usage-based abuse flags. Additive (MINOR). |
| 2026-06-12 | 2.6 | 2.4 | 2.3 | 2.2 | 2.1 | **Super Admin Control Center — Phase 4 (ADR-016):** Export Center (authenticated CSV via JSON+Blob; fixes the P2 inactive-export auth gap) + Alert Center (AI budget / expired-premium / stale duels / pending purges, on the Dashboard). Additive (MINOR). |
| 2026-06-12 | 2.7 | 2.5 | 2.3 | 2.2 | 2.1 | **API Consolidation (ADR-017):** domain-based action-routed handlers under the Vercel Free 12-function cap — super-admin 15→8, main-app 12→6 (dead `ai/word-problems` dropped); auth boundaries preserved. Infra-only (MINOR); no schema/data change. |
| 2026-06-12 | 2.11 | 2.7 | 2.7 | 2.4 | 2.2 | **Super Admin V2 — entity-centric 360 consolidation (ADR-022):** consolidate all admin workflows into 5 Centers (User-360, Coaching-360, AI Cost Center, Revenue Center, Operations Center), one owner per capability; SplitView master/detail replaces the overlay drawer + grouped Users list; Inactive merges into a Users filter; duplicate pages/metrics/filters/actions removed. New `?action=` branches on existing handlers (users/coachings/ai/system/notifications) + additive `users.aiThrottle` field — **zero new functions** (8/12). Additive (MINOR); no data migration. Shipped Center-by-Center. |
| 2026-06-12 | 2.10 | 2.6 | 2.6 | 2.4 | 2.2 | **Email normalization (ADR-020 update):** new `users.emailLower` (lowercased `email`) written at register + backfilled (`firestore/migrations/2026-06-12-add-emailLower.js`); Global Search email matching is now **case-insensitive** (`orderBy('emailLower')` with a lowercased prefix). Additive Firestore (MINOR); backfill migration (non-breaking); no API/function change. |
| 2026-06-12 | 2.9 | 2.6 | 2.5 | 2.4 | 2.2 | **Super Admin V2 — tablet-first governance rebuild (ADR-019/020/021):** 7-domain IA + admin design system (collapsible rail ≥768px, in-flow SplitView 360, Tabs, Table card-mode, focus-trap modals, `auto-fit` grids, viewport zoom re-enabled) [TECHNICAL_BIBLE §10B]; **Global Search** ecosystem primitive (server-side prefix on users+coachings, `system?action=search`, no client fetch-all); **Emergency Controls** (maintenance / AI-kill / payment-kill `config/*` docs + audited `config-set` + main-app enforcement in aiService/paymentService/boot). Foundation + Command Center pass. Additive (MINOR) across all tracks; **zero new serverless functions** (5 new `system` actions: search/config-get/config-set/revenue-intel/ack-alert); Payment track moves (flow now gated by kill switch); no data migration. |
| 2026-06-12 | 2.8 | 2.5 | 2.4 | 2.3 | 2.1 | **Super Admin Control Center — Phase 5 (ADR-018):** Security Center (new append-only `securityEvents` collection — client-side failed-login/suspicious/admin-login capture with SHA-256 emailHash; admin-read, immutable; + composite index) read via `system?action=security`; Firestore-Ops (`metrics.collectionCounts` daily growth + `system?action=firestore-ops`); Content Management (`questions` CRUD — `update`/`archive`/`delete` + new `updatedAt` field, fixes edit-duplication); unblocked payment-failure-spike + Firestore-growth-spike alerts. Additive Firestore + Security (MINOR); **zero new serverless functions**; no data migration. |

---

## Migration Notes

Migration notes are required for every MAJOR bump and for any change that requires a data
migration script. Format: what changed, who is affected, the migration action, rollback.

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
