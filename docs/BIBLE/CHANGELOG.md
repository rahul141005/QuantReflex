# QuantReflex Changelog

All notable code + documentation changes. Format: dated entries, newest first. Each code change references its audit finding / ADR ID and the affected file:line, lists the documentation kept in sync, and (per [GOVERNANCE.md](GOVERNANCE.md)) any version bump.

Source-of-truth docs: [README.md](README.md) · [TECHNICAL_BIBLE.md](TECHNICAL_BIBLE.md) · [FIRESTORE_BLUEPRINT.md](FIRESTORE_BLUEPRINT.md) · [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md) · [PAYMENT_ARCHITECTURE.md](PAYMENT_ARCHITECTURE.md) · [VERSIONS.md](VERSIONS.md) · [DECISION_LOG.md](DECISION_LOG.md)

---

## 2026-06-12 — Super Admin Control Center, Phase 5: Security Center + Firestore-Ops + Content Management (ADR-018)

- **Requested change:** Deliver the final Control Center phase — a Security Center (with new failed-login
  capture), Firestore-Ops (collection sizes/growth), and Content Management — and unblock the two alerts Phase 4
  deferred (payment-failure-spike, Firestore-growth-spike).
- **Impacted systems:** Admin · Security · Content · all three client apps (login capture) · APIs · Firestore.
- **Bible docs updated (FIRST):** DECISION_LOG (ADR-018), FIRESTORE_BLUEPRINT (`securityEvents` collection +
  composite index + `metrics.collectionCounts` + `questions.updatedAt`; Firestore Version 2.4),
  SECURITY_ARCHITECTURE (rules-table row + §6 SEC1 + write-path rationale; Security Version 2.3), TECHNICAL_BIBLE
  §3 (new actions), VERSIONS (Bible 2.8 / Firestore 2.4 / Security 2.3 + history row), ROADMAP (Phase 5 → done),
  `firestore/schema-docs/questions-collection.md`.
- **Schema delta:** NEW `securityEvents/{auto}` (append-only; admin-read; hardened unauthenticated create). NEW
  `questions.updatedAt` (ISO). NEW `metrics.collectionCounts{users,questions,duels,payments,coachings,auditLogs,securityEvents}`.
  NEW composite index `securityEvents (type ASC, createdAt DESC)`. No data migration (all additive; absent fields
  tolerated on pre-Phase-5 docs).
- **API delta (ZERO new serverless functions — super-admin stays 8/12):** `system?action=security` +
  `system?action=firestore-ops` (GET); +3 alerts in `system?action=alerts` (`firestore_growth`,
  `payment_failures`, `login_failures`); `questions?action=update|archive|delete` (and `list` gains
  topic/status/difficulty filtering); `_lib/metrics.js#computeDailySnapshot` gains `collectionCounts` (persisted
  by the existing daily `cron/sweep`). Client capture: new inline-copied `SecurityEvents.record()` helper in each
  app wired into login error/success paths; server-side `payment_failure` writes in `main-app payment.js` +
  `payment/webhook.js` (Admin SDK).
- **Security review:** the `securityEvents` create rule (`validSecurityEvent()`) allows an *unauthenticated*
  write (failed logins have `request.auth == null`) but is shape-bounded — key allowlist, `type` allowlist,
  `createdAt == request.time`, **SHA-256 `emailHash` only (no raw email, no password)**, size caps; admin-only
  read; update/delete denied. Abuse is bounded by Firebase Auth's own `auth/too-many-requests` throttle; App
  Check (M7) is the documented hardening follow-up. No auth-boundary changes; content mutations stay behind
  `withAdmin` + immutable `auditLogs`; the webhook capture is added AFTER signature verification and does not
  touch the HMAC/`bodyParser:false` isolation. The Content-Management view escapes all question fields
  (`AdminUtils.escapeHtml`) so imported/AI-generated content cannot inject markup into the admin panel
  (adversarial-review hardening). Partial question edits revalidate answer∈options against the merged doc.
- **Version bumps:** Firestore 2.3→2.4, Security 2.2→2.3, Bible 2.7→2.8 (all MINOR/additive). Architecture +
  Payment unchanged.
- **Migration:** none. **Deploy step:** `firebase deploy --only firestore:rules,firestore:indexes` (so
  `securityEvents` is writable + the composite index exists); app code redeploys via Vercel on push.
- **Verification:** `node --check` all changed handlers + client JS; super-admin function count stays 8/12;
  rules + indexes valid; adversarial review (security/rules, governance/Bible-sync, wiring, cross-app-compat);
  render smoke of the new views.
- See [DECISION_LOG.md](DECISION_LOG.md) ADR-018.

---

## 2026-06-12 — API Consolidation for Vercel Free Plan (ADR-017)

- **Requested change:** QuantReflex is on Vercel Free (12 functions/project). super-admin (15) exceeds the cap
  and won't deploy; main-app (12) is at the cap. Consolidate into domain-based action-routed APIs (no live
  users → no back-compat) so super-admin deploys + a future-proof structure.
- **Impacted systems:** Student App · Admin · APIs · Infra. No Firestore / security-model / payment change.
- **Bible docs updated (FIRST):** TECHNICAL_BIBLE (§3.1 Infrastructure Constraints + §3 endpoint rewrite),
  GOVERNANCE (Infrastructure Governance), DECISION_LOG (ADR-017), VERSIONS (Bible 2.7; Arch 2.5), ROADMAP.
- **super-admin 15→8:** `system` absorbs alerts/duels/export/payments-logs; `users` absorbs inactive-users
  (inactive-list/inactive-export/bulk-archive/bulk-remind); new `ai` (usage+budget); `cron/sweep` merges
  daily-snapshot+cleanup-sweep. Deleted: alerts, duels, export, payments, inactive-users, ai-usage, ai-budget,
  cron/daily-snapshot, cron/cleanup-sweep. `js/services/api.js` repointed; vercel crons→1.
- **main-app 12→6:** new `ai` (explain/insights/study-plan), `payment` (create-order/verify), `account`
  (delete/notifications-list/notifications-markRead/claim-coaching). `payment/webhook` (HMAC, bodyParser:false),
  `auth/register` + `validate-coaching` (public) stay isolated. Dropped dead `ai/word-problems` (client reads
  `questions` from Firestore). Client callers repointed (ai-features/paywall/settings/firestore-sync); vercel
  function globs flattened.
- **Security review:** NO handler mixes auth models (admin↔admin, student↔student only); crons keep CRON_SECRET;
  webhook keeps HMAC + isolation; public endpoints isolated; per-action method/premium guards preserved; no role
  leakage. Minor: merged AI actions share one per-user in-memory rate-limit bucket (slightly tighter).
- **Version bumps:** Architecture 2.4→2.5; Bible 2.6→2.7 (MINOR). Firestore/Security/Payment unchanged.
- **Migration:** none (Razorpay webhook path unchanged → no dashboard reconfig).
- **Verification:** `node --check` all; function counts (super 8 / main 6); Preview render of all super-admin
  views + route-resolution; main-app flow trace; cron auth; adversarial review.
- See [DECISION_LOG.md](DECISION_LOG.md) ADR-017.

---

## 2026-06-12 — Super Admin Control Center, Phase 4: Export Center + Alert Center (ADR-016)

- **Requested change:** CSV export tools + a centralized Alert feed.
- **Impacted systems:** Admin · Analytics · APIs.
- **Bible docs updated (FIRST):** TECHNICAL_BIBLE §3 (export/alerts endpoints), DECISION_LOG (ADR-016),
  VERSIONS (Bible 2.6; Arch 2.4), ROADMAP (Phase 4 done).
- **Schema delta:** none (both computed from existing data).
- **API delta:** new `api/admin/export` (GET `?type=users|premium|coachings|revenue|ai-usage` → JSON
  `{filename, csv}`, ≤10–20k rows); new `api/admin/alerts` (GET → computed AI-budget / expired-premium /
  stale-duel / pending-purge alerts); `inactive-users?action=export` now returns JSON `{filename,csv}` (was raw
  — fixes the auth gap). New Export Center view (+nav) downloads via authenticated fetch + `AdminUtils.downloadCsv`
  (Blob); Dashboard shows an Alerts banner.
- **Security review:** exports/alerts admin-only (withAdminAuth); CSV fetched with the Bearer header then
  downloaded client-side (no token in URL). Deferred: payment-failure / Firestore-growth alerts (need new data).
- **Version bumps:** Architecture 2.3→2.4; Bible 2.5→2.6 (MINOR). Firestore/Security/Payment unchanged.
- **Migration:** none.
- **Verification:** `node --check` all P4 JS; live render (Export view + Dashboard alerts banner).
- See [DECISION_LOG.md](DECISION_LOG.md) ADR-016.

---

## 2026-06-12 — Super Admin Control Center, Phase 3: AI Operations Center (ADR-015)

- **Requested change:** GPT budget tracking (configurable monthly budget + warn/critical thresholds,
  projected spend, remaining) + AI abuse detection.
- **Impacted systems:** Admin · Firestore · Analytics · AI · APIs.
- **Bible docs updated (FIRST):** FIRESTORE_BLUEPRINT (`config/aiBudget`), TECHNICAL_BIBLE §3 (ai-budget
  endpoint), DECISION_LOG (ADR-015), VERSIONS (Bible 2.5; Arch/FS 2.3), ROADMAP (Phase 3 done).
- **Schema delta:** +`config/aiBudget` `{monthlyBudgetUSD, warnPct, critPct, updatedAt, updatedBy}` (admin-only).
- **API delta:** new `api/admin/ai-budget` (GET computes month-to-date spend from `systemMetrics/ai_daily_*`
  + used%/projected/remaining/status; POST updates config, audit-logged). `ai-usage` now returns per-user
  `abuseFlags` + `flaggedCount`. AI Analytics view gains a budget panel (configurable) + flagged-user badges.
- **Security review:** budget config admin-SDK-write only (client denied by default-deny); config change
  audit-logged (category `system`). Budget is **advisory** (alerting), not request-blocking.
- **Version bumps:** Architecture/Firestore 2.2→2.3; Bible 2.4→2.5 (MINOR). Security/Payment unchanged.
- **Migration:** none (config defaults applied when absent).
- **Verification:** `node --check` all P3 JS; budget math fixtures; live AI-view render (budget panel + flags).
- See [DECISION_LOG.md](DECISION_LOG.md) ADR-015.

---

## 2026-06-11 — Super Admin Control Center, Phase 2: User Lifecycle + Cleanup (ADR-014)

- **Requested change:** operational user management + safe inactive-account cleanup — suspend / restore /
  archive / purge / reset-progress, an Inactive User Center, and the staged soft-delete→hold→purge workflow.
- **Impacted systems:** Admin · Firestore · Security · APIs.
- **Bible docs updated (FIRST):** FIRESTORE_BLUEPRINT (users lifecycle fields), SECURITY (§5.3
  destructive-action mechanism), GOVERNANCE (Account Deletion now implemented), TECHNICAL_BIBLE (§3 endpoints),
  DECISION_LOG (ADR-014), VERSIONS (Bible 2.4; Arch/FS/Sec 2.2), ROADMAP (Phase 2 done).
- **Schema delta:** +`users.{accountStatus, suspendedAt, archivedAt, purgeAfter, archiveReason,
  inactiveFlaggedAt, statusUpdatedAt}`. All additive/optional (absent `accountStatus` ⇒ active).
- **API delta:** super-admin `api/admin/users.js` POST actions (suspend/restore/archive/purge/reset);
  new `api/admin/inactive-users.js` (list by inactivity window + bulk archive/remind/export-CSV); new
  `api/cron/cleanup-sweep.js` (`CRON_SECRET`; flag inactive>180d + purge archived-past-hold); shared
  `api/_lib/user-lifecycle.js` (`purgeUser`/`resetProgress`). Suspend/archive disable the Firebase Auth user.
- **Security review:** suspension enforced at Firebase Auth (disabled user → no token); purge requires
  `confirm:'DELETE'`; every action audit-logged (category `user`). `accountStatus` is admin-authoritative.
- **Version bumps:** Firestore/Arch/Security 2.1→2.2; Bible 2.3→2.4 (MINOR). Payment unchanged.
- **Migration:** none (new optional fields).
- **Verification:** `node --check` all P2 JS; logic fixtures (hold math, inactivity cutoff); render check.
- See [DECISION_LOG.md](DECISION_LOG.md) ADR-014.

---

## 2026-06-11 — Super Admin Control Center, Phase 1: Data + Revenue + Audit (ADR-012, ADR-013)

- **Requested change:** elevate the super-admin app into an operational control center. Phase 1 delivers the
  data/governance foundation — GPT token/cost instrumentation, a revenue dashboard, and one immutable
  platform-wide audit log; plus full Bible/governance docs + ADRs. (Later phases — user lifecycle/cleanup, AI
  budget/abuse, exports/alerts, security/firestore-ops — scoped in ROADMAP.)
- **Impacted systems:** Student App (AI-cost write) · Admin · Firestore · Rules · Payments · Entitlements ·
  Analytics · AI · APIs.
- **Bible docs updated (FIRST):** FIRESTORE_BLUEPRINT (auditLogs + `usage/ai.gpt*` + systemMetrics token/cost +
  `metrics/latest` shape + `payments.amount` + 3 auditLogs indexes + drift SA1/SA2); SECURITY (§5.2 Admin
  Permissions & Audit Logging, §5.3 Destructive-Action Protection, §5.4 Cron Authorization, auditLogs rule
  row); PAYMENT (§11 Revenue Accounting); TECHNICAL_BIBLE (§5.2 Super Admin Architecture, §6 Spark/Vercel-Cron
  callout, §7 AI counters); GOVERNANCE (Operational Rules + Data Retention + Account Deletion policy);
  DECISION_LOG (ADR-012, ADR-013); VERSIONS; ROADMAP.
- **Schema delta:** +`auditLogs/{auto}` (immutable); +`usage/ai.{gptTokensInput,gptTokensOutput,gptCostUSD,gptCalls}`;
  +`systemMetrics/ai_daily_*.{totalTokensInput,totalTokensOutput,estimatedCostUSD,gptCalls}`;
  +`payments.{amount,status}`; +`metrics/{date}`+`metrics/latest` concrete shape; +3 `auditLogs` composites. All additive.
- **API delta:** +`super-admin-app/api/_lib/audit.js#writeAuditLog`; +`super-admin-app/api/cron/daily-snapshot`
  (GET, `CRON_SECRET`); `withAdminAuth` now sets `req.adminEmail`; `system.js?action=auditLogs` + `payments.js`
  readers repointed to `auditLogs`; dashboard payload extended with revenue + real AI cost.
- **Security review:** `auditLogs` admin-read-only + client write denied (immutable); cron gated by `CRON_SECRET`
  (constant-time), not `withAdminAuth`. No change to user-facing auth.
- **Cross-app compatibility:** student app writes the new `usage/ai`/`systemMetrics` counters + `payments.amount`;
  super-admin reads them; `count()` aggregation (firebase-admin 13.10) drives the cron.
- **Version bumps:** Arch/Firestore/Security/Payment 2.0→2.1; Bible 2.2→2.3 (all MINOR).
- **Migration:** none (historical payments without `amount` use the plan→price fallback).
- **Verification:** `node --check` all touched + 2 new JS; firestore rules/indexes parse; revenue/cost math
  fixtures; cron 401/200; Preview-MCP dashboard render. Deploy at rollout: `firebase deploy --only
  firestore:rules,firestore:indexes`; set Vercel `CRON_SECRET`. Cloud Functions stay undeployed (Spark).
- **Adversarial review hardening (29-agent workflow, 8 confirmed findings fixed):** AI-cost staleness — the
  dashboard now reads today's `systemMetrics/ai_daily_*` **live** (the snapshot cron stays **daily** — Vercel
  Hobby caps cron at once/day; live AI read means daily revenue/DAU is fine); the
  mixed-type DAU/MAU/newToday undercount fixed with a disjoint Timestamp+ISO-string `count()` union in
  `metrics.js`; `ai-usage.js` now prefers the real per-user `gpt*` telemetry over heuristics; and
  `notifications.js` + the destructive `duels.js` cleanup now write `auditLogs` rows (every admin mutation logged).
- See [DECISION_LOG.md](DECISION_LOG.md) ADR-012, ADR-013.

---

## 2026-06-11 — Practice scroll panel: softer corners (visual refinement)

- **Requested change:** the outer Practice scroll container looked too rectangular versus the rest of the
  app. Soften its corners to match Home — subtle, not pill/bubble. Only the outer container *shape*; glass,
  blur, border, shadow, spacing, layout, and inner cards unchanged.
- **Change:** `.practice-container` gains `border-radius: var(--qr-card-radius)` (24px — the same soft
  radius Home cards use). One declaration; no new token and no version bump (cosmetic refinement of the
  ADR-011 panel; `TECHNICAL_BIBLE §10A` scroll-contract note added, doc version → 1.2).
- **Verification:** CSS brace-balanced; computed radius confirmed; scroll / corner-clip / fixed-header /
  fixed-nav behavior unchanged (cards stay inset by the panel padding, so no corner clipping).

---

## 2026-06-11 — Practice tab: fixed app shell + centered scroll panel (ADR-011)

- **Requested change:** Practice must behave like a modern app section — fixed header, fixed bottom nav,
  and ONE dedicated scroll area between them with equal top/bottom spacing; safe-area-aware; responsive;
  future-proof. Layout-architecture change, not a visual tweak. Bible-first per Governance.
- **Impacted systems:** Student App · UI Architecture · Design System · Technical Bible. (No
  entitlement/payment/Firestore/API/logic change; no new colors/shadows/glass.)
- **Docs updated FIRST:** TECHNICAL_BIBLE §10A scroll contract rewritten; ADR-011; VERSIONS (Bible → 2.2);
  ROADMAP.
- **🔴 Root cause — double scroll dragging the header:** every view is wrapped in the app scroller
  `.container` (`overflow-y:auto`, padded). The Practice shell height (`100vh − 4.5rem − safe`) exceeded
  `.container`'s padded content box by ~1.5rem, so `.container` *also* scrolled and dragged the fixed
  header. Fixed by neutralizing `.container` when Practice is active.
- **Nav-height token:** added `--qr-nav-h: 3.75rem` (real `.bottom-nav` height); `.bottom-nav`, `body`
  padding-bottom, and the Practice shell height now all consume it (was a `4.5rem`/`3.75rem` split).
- **Container neutralization:** `router.js` toggles `body.view-practice-active`;
  `body.view-practice-active > .container { padding-top:0; padding-bottom:0; overflow:hidden }` hands
  scroll control to the Practice shell — no nested/double scroll.
- **Fixed shell + safe areas:** `#view-practice.spa-view-active` height
  `calc(var(--vh)*100 − var(--qr-nav-h) − env(safe-area-inset-bottom))`, `padding-top:
  env(safe-area-inset-top)`; `<header>` is `flex:0 0 auto` (fixed band).
- **Centered scroll panel:** `.practice-container` → `flex:1; min-height:0; overflow-y:auto` with EQUAL
  top/bottom margin (`var(--qr-practice-gap) auto`) + symmetric `padding:.9rem`; removed the duplicate
  `.practice-container` centering rule; cleaned `overflow:visible; overflow-y:auto` →
  `overflow-x:hidden; overflow-y:auto`. `.practice-section` first/last vertical margins zeroed (panel
  padding owns the inset).
- **Verification:** `node --check` on router.js; CSS brace-balanced (depth 0); viewport math confirmed
  (`practice height + nav = 100vh`; `.container` no longer overflows when Practice is active). **Live
  device pass (small / large / tablet, notch) pending user eyeball.**
- See [DECISION_LOG.md](DECISION_LOG.md) ADR-011.

---

## 2026-06-11 — App-wide design-system consolidation (ADR-010)

- **Requested change:** make the student app feel built from one design system; fix the Practice scroll
  bug; simplify Practice to "action, not dashboard"; make AI Coach/Study Plan match Math Duel; remove
  dominant purple; unify glassmorphism + tokens. Bible-first per Governance.
- **Impacted systems:** Student App · Technical Bible · Design System · UI Architecture · UX/Navigation ·
  Premium Experience. (No entitlement/payment/Firestore/API/logic change.)
- **Docs updated FIRST:** `TECHNICAL_BIBLE.md §10A Design System` (tokens, glass foundation, 3 elevation
  levels, premium-feature card, typography + CTA hierarchy, Practice scroll contract); ADR-010; ROADMAP;
  VERSIONS (Bible → 2.1).
- **🔴 Bug fix — Practice tab could not scroll:** `#view-practice` is a fixed-height `overflow:hidden`
  flex column; its scroll region is the active content slot. The prior section refactor removed
  `.practice-container` (the scroll container) from `#modeSelect`, clipping content below the fold.
  Restored the class → full vertical scrolling. Documented the scroll contract in the Bible.
- **Practice simplified:** removed the duplicate Today's-Progress metrics strip (Questions/Accuracy/
  Streak already live on Home); Practice now focuses on training modes (Quick Start / Advanced Modes),
  32px section rhythm. Free-tier daily-quota indicator retained (functional limit).
- **Premium feature cards:** AI Coach + Study Plan now inherit `.home-bento-card` verbatim (Math Duel's
  siblings) — removed the bespoke gradient/purple border + tall fixed-height stack; compact Duel-style
  header; identical CTA; Study Plan icon de-purpled to blue. ~25% shorter.
- **Design tokens:** added `--qr-card-radius-sm` (20px) + `--qr-btn-radius` (18px) to the existing
  24px/navy-shadow/hairline-border system; applied to stat tiles + CTAs. De-purpled `.home-bento-action-btn`
  and `.pw-cta` (indigo→blue).
- **Verification:** `node --check` passes on all touched JS; dead twin classes + today-strip fully removed;
  `#modeSelect` scroll container confirmed. **Recheck pass (post-implementation):** removed one duplicate
  `body.dark-mode .pw-plan--active` rule (kept the fuller box-shadow variant) and a pre-existing orphan/dead
  CSS block in the duel-results styles (malformed since `5a86ed8` — declarations with no selector + a stray
  `}`, parser-discarded, never rendered). `style.css` is now fully brace-balanced (depth 0, no negative dips,
  max nesting 2); zero visual change. **Live device pass (4 tabs + paywall) pending user eyeball** — see note.
- See [DECISION_LOG.md](DECISION_LOG.md) ADR-010.

---

## 2026-06-11 — v2 verification-audit fixes + production deploy

Independent verification audit of the v2 migration found and fixed:
- **fix(migration idempotency) 🔴** — `2026-06-11-v2-plan-schema.js` was not idempotent: `_targetState`
  derived only from v1 fields, so an already-migrated `plan:'premium'` doc (v1 fields deleted) was
  mis-targeted back to `free`. A second `--apply` would have wiped premium users. Added `_isAlreadyV2`
  guard so migrated docs are never touched. Verified: re-run reports `changed=0`.
- **fix(doc drift M1–M4)** — TECHNICAL_BIBLE §5.1 (aiService function list), ROADMAP DEBT-1 (obsolete),
  firestore.rules comment (renamed expiry fns), DECISION_LOG ADR-002 (single `{premium}` claim note).
- **fix(pre-existing, unrelated to v2)** — `share-service.js` stray `}` (file failed to parse);
  `coaching/insights.js` duplicate `const dailyHistory`. Both now parse; **entire repo passes `node --check`**.
- **chore(LOW)** — removed dead `.badge-premium-plus` CSS (admin + coaching); paywall "Restore Access"
  now uses new `FirestoreSync.refreshFromServer` (re-reads entitlement without wiping localStorage).
- **deploy** — `firebase deploy --only firestore:rules` (v2 rules live → `plan` protected, closes the
  self-grant window); ran `2026-06-11-v2-plan-schema.js --apply` against prod: 11 users normalized
  (2 active Premium+ → `premium/premium_12m` with expiry preserved, 9 → `free`, all legacy fields
  deleted). Direct read-back confirmed. **Vercel app + `functions` deploy still pending (your CI).**

---

## 2026-06-11 — v2 monetization: single `plan` model (ADR-009) 🔶 MAJOR / breaking

- **Requested change:** remove the ₹89 lifetime tier and the "Premium+" name; collapse to one Premium
  tier (₹299/6mo, ₹499/12mo) that includes everything; super-admin keeps Premium + custom-duration
  trial grants; retain `isTrial`/`trialEnd`. Zero production users → clean rewrite, no back-compat.
- **Impacted systems:** Student App · Admin Dashboard · Coaching Portal · Firestore Schema · Security
  Rules · Payments · Entitlements · Analytics · AI Services · APIs (all of them).
- **Schema delta:** new `plan, planType, planExpiry, planSource, planUpdatedAt` (+ retained `isTrial,
  trialEnd`); removed `isPremium, hasPaid, isEarlyUser, isPremiumPlus, premiumPlusPlan,
  premiumPlusExpiry, premiumPlusStatus, lastPremiumPlusPaymentId`. Plan keys → `premium_6m`/`premium_12m`.
- **API delta:** `aiService.activatePremium`/`resolvePlan`/`isUserPremium` replace
  `unlockPremium(Plus)`/`isUserPremium(Plus)`; AI gates → `req.userPremium`; `create-order`/`verify`/
  `webhook` single grant path; admin `entitlements` actions → `premium_6m|premium_12m|trial|revoke`;
  admin/coaching APIs return `plan`/`isTrial`. `claimsService` → single `{premium}` claim.
- **Security review:** `entitlementFieldsSafe` rewritten (client may only downgrade `plan`→'free' and
  clear plan/trial fields). Deployed rules compile clean.
- **Cross-app compatibility:** verified — every reader/writer (main-app, super-admin, coaching, functions)
  resolves through `plan`; reference sweep shows ZERO `isPremiumPlus/plus_*/₹89/Premium+/hasPaid` in
  live code (only historical CHANGELOG/ADR/AUDIT + migration scripts retain mentions; AI-usage
  `wordProblemsUsedLifetime` counter is unrelated and retained).
- **UI:** full product-grade paywall redesign (hero, value cards, FREE/PREMIUM comparison matrix,
  6m/12m selector with 12m default + BEST VALUE, "Start Premium" CTA, trust builders, footer; new
  `.pw-*` CSS with dark-mode + responsive; ~370 lines of dead legacy `.paywall-*` CSS removed). Guide,
  FAQ, settings plan label (Trial countdown / Premium expiry), and home badges updated.
- **Version bumps:** Bible/Architecture/Firestore/Security/Payment → **2.0** (MAJOR). Migration note in
  [VERSIONS.md](VERSIONS.md).
- **Migration:** `firestore/migrations/2026-06-11-v2-plan-schema.js` (dry-run default; `--apply` to
  normalize dev/test docs + delete removed fields). Supersedes `2026-06-11-normalize-premiumPlusPlan.js`.
- **Verification:** `node --check` on every changed JS (60+ files) passes; rules compile; reference
  sweep clean; migration script `node --check` passes. See [DECISION_LOG.md](DECISION_LOG.md) ADR-009.

---

## 2026-06-11 — Bible governance system established (ADR-008)

### docs: create `/docs/BIBLE/` source-of-truth set + versioning + governance
- Requested change: formalize the Bible as the permanent, governed source of truth.
- Impacted systems: Documentation/governance only (no code, schema, or runtime change).
- Created `/docs/BIBLE/`: `README.md`, `TECHNICAL_BIBLE.md`, `FIRESTORE_BLUEPRINT.md`,
  `SECURITY_ARCHITECTURE.md`, `PAYMENT_ARCHITECTURE.md`, `CHANGELOG.md`, `DECISION_LOG.md`,
  `ROADMAP.md`, plus `GOVERNANCE.md` (mandatory workflow) and `VERSIONS.md` (version registry).
- Migrated the four core docs + changelog from `/docs/` (content preserved); old `/docs/*.md`
  replaced with redirect stubs to avoid dual sources of truth.
- Established the versioning system: Bible / Architecture / Firestore / Security / Payment, all at
  1.0 baseline; defined MAJOR/MINOR semantics and migration-note requirement.
- Version bumps: Bible 1.0 (initial); all tracks 1.0 baseline.
- Verification: cross-doc links rewritten to underscore names; UTF-8 preserved; stubs point to new home.
- See [DECISION_LOG.md](DECISION_LOG.md) ADR-008.

---

## 2026-06-11 — rules cleanup

### chore: remove dead `entitlementCreateSafe()` helper
- **File:** `firestore/rules/firestore.rules`.
- Removed the unreachable create-time entitlement helper (client `create` is denied; accounts are server-only via `/api/auth/register`). Clears both rules-compiler warnings ("Unused function" + "Invalid variable name: request"). No behavioral change.
- Redeployed rules to `quant-reflex-trainer` — compiled clean, no warnings.

---

## 2026-06-11 — production deploy + data migrations (executed)

- **Deployed Firestore rules** to `quant-reflex-trainer` (`firebase deploy --only firestore:rules`).
- **Deployed Firestore indexes** incl. corrected `entitlementLogs` COLLECTION_GROUP index; old orphaned index removed via `--force` (M2 live).
- **Ran data migrations** (GOOGLE_APPLICATION_CREDENTIALS service-account):
  - `normalize-premiumPlusPlan --apply` → 11 users, 0 legacy values (no change needed). M3 closed.
  - `reconcile-studentCount --apply` → 2 coachings corrected (`QRE6OAMANJ` 0→1, `QRYOIN9IBW` unset→0 + dropped legacy `studentsCount`); re-run confirms 0 drift. M8 closed.
- Migration scripts hardened to accept `GOOGLE_APPLICATION_CREDENTIALS` (ADC) in addition to `FIREBASE_SERVICE_ACCOUNT`.
- **Note:** app code fixes (C1, C2, H1–H3, M1, M4, M5, student-count) still deploy via Vercel on next push — Firebase deploy only covered rules+indexes.

---

## 2026-06-11 — remaining bugs (student-count drift, M5, M8) + debt triage

### fix(BUG): coaching student-count field drift + double-count 🟠 HIGH
- **Files:** `main-app/api/claim-coaching.js`, `super-admin-app/api/admin/coachings.js`, `super-admin-app/js/views/coachings.js`, `super-admin-app/js/views/system.js`.
- **Root cause:** two divergent fields — the Cloud Function maintained `studentCount` (read by the coaching dashboard), while admin-create + claim-coaching wrote `studentsCount` (read by super-admin UI). claim-coaching's manual writes also double-counted against the function.
- **Change:** canonical field is `studentCount` (Cloud Function = sole writer). Removed claim-coaching's manual counter writes; admin-create now seeds `studentCount`; super-admin views read `studentCount` (with `studentsCount` fallback for un-reconciled docs).
- **Docs synced:** TECHNICAL-BIBLE §6, FIRESTORE-BLUEPRINT (coachings).

### fix(M5): single canonical super-admin auth wrapper + rate limit 🟡 MED (security)
- **Files:** `super-admin-app/api/_lib/middleware.js`, `super-admin-app/api/_lib/firebase-admin.js`.
- **Root cause:** two admin wrappers existed; only `firebase-admin#withAdmin` (used by `questions.js`) was rate-limited — the sensitive endpoints (`entitlements`, `payments`, `coachings`, …) using `withAdminAuth` had **no** rate limit.
- **Change:** `withAdminAuth` now enforces a per-admin 30/hr limit and sets both `req.userId` and `req.adminUid`; `withAdmin` re-exports it. All super-admin endpoints are now rate-limited under one implementation.
- **Docs synced:** TECHNICAL-BIBLE §5, SECURITY-ARCHITECTURE §5.

### chore(M8): student-count reconciliation script 🟡 MED
- **File:** `firestore/migrations/2026-06-11-reconcile-studentCount.js` (new) — recomputes `studentCount` from users, drops legacy `studentsCount`. Dry-run default; `--apply` to write.

### triage(M6/M7/M9): infrastructure/debt — not code defects
- **M6** global rate limiting → per-instance limits now uniform; a hard global cap needs a shared counter/App Check (infra).
- **M7** Firebase App Check → console + SDK-init task (infra), cannot be resolved in repo logic alone.
- **M9** mixed timestamp types → tolerated (all readers normalize); documented as convention, no mass edit to avoid churn/risk.
- **Docs synced:** SECURITY-ARCHITECTURE §6, FIRESTORE-BLUEPRINT (drift register).

---

## 2026-06-11 — medium-severity cleanups (M1–M4)

### fix(M1): remove orphaned `ai/usage` client mirror 🟡 MED
- **File:** `main-app/js/firestore-sync.js` (`_createDefaultDocument` seed + header comment).
- **Root cause:** client seeded `users/{uid}/ai/usage` which nothing reads; server quota truth is `users/{uid}/usage/ai`.
- **Change:** deleted the client `ai/usage` seed; kept `practice/data` seed; updated header doc.
- **Docs synced:** FIRESTORE-BLUEPRINT (subcollections + drift register).

### fix(M2): correct `entitlementLogs` index 🟡 MED
- **File:** `firestore/indexes/firestore.indexes.json`.
- **Root cause:** index was COLLECTION-scope on `uid`+`timestamp`, but docs live in subcollection `users/{uid}/entitlementLogs` with no `uid` field.
- **Change:** `COLLECTION_GROUP` scope on `adminId`+`timestamp`. **Deploy:** `firebase deploy --only firestore:indexes`.
- **Docs synced:** FIRESTORE-BLUEPRINT (indexes + drift register).

### fix(M3): canonical `premiumPlusPlan` + backfill migration 🟡 MED
- **Files:** `firestore/migrations/2026-06-11-normalize-premiumPlusPlan.js` (new).
- **Status:** write paths already emit canonical `plus_6month`/`plus_yearly`; legacy `yearly`/`6_months` exist only in old data. Added an idempotent, dry-run-by-default backfill script. Client read-normalization retained as tolerance until backfill runs.
- **Action required:** run the migration with `--apply` against production, then the client compensation can be removed in a later change.
- **Docs synced:** FIRESTORE-BLUEPRINT (drift register), PAYMENT-ARCHITECTURE §1.

### fix(M4): single canonical coaching active-state check 🟡 MED
- **Files:** `main-app/api/_lib/middleware.js` (new `isCoachingActive`), `main-app/api/auth/register.js`, `main-app/api/claim-coaching.js`, `main-app/api/validate-coaching.js`.
- **Root cause:** three endpoints disagreed — claim/validate only checked `status==='expired'` (never written), so a `suspended`/`deleted` coaching could be claimed/validated.
- **Change:** all three now use `isCoachingActive(data)` (`status==='active'`, else `isActive!==false`).
- **Docs synced:** SECURITY-ARCHITECTURE §3, FIRESTORE-BLUEPRINT (coachings).

---

## 2026-06-11

### fix(C1): repair Premium+ checkout — declare `description` 🔴 CRITICAL
- **File:** `main-app/js/paywall.js` (`openPremiumPlusPayment`, ~line 543).
- **Root cause:** Razorpay `options.description` referenced an undeclared `description` variable → `ReferenceError` swallowed by the create-order `.catch`, so every Premium+ (₹299/₹499) checkout failed before the sheet opened.
- **Change:** declare `var description = plan === 'plus_yearly' ? 'Premium+ – 1 Year' : 'Premium+ – 6 Months';`.
- **Docs synced:** PAYMENT-ARCHITECTURE §7/§8.

### fix(C2): chunk bulk entitlement grants to respect Firestore batch limit 🔴 CRITICAL
- **File:** `super-admin-app/api/admin/entitlements.js`.
- **Root cause:** one `db.batch()` accumulated 2 writes/user (update + audit log); Firestore caps batches at 500 ops, so bulk grant aborted for any coaching with >250 students.
- **Change:** extracted `buildUpdates()`; commit in sequential chunks of ≤200 users (≤400 ops).
- **Docs synced:** FIRESTORE-BLUEPRINT (entitlementLogs note), AUDIT C2.

### fix(H1): idempotent, user-bound lifetime premium grant 🟠 HIGH
- **Files:** `main-app/services/aiService.js` (new `unlockPremium`), `main-app/services/paymentService.js` (new `fetchOrder`), `main-app/api/payment/verify.js`, `main-app/api/payment/webhook.js`.
- **Root cause:** lifetime `premium` granted via `safeUserUpdate` with no `payments/{paymentId}` lock and no order→caller binding → cross-account replay of one payment.
- **Change:** `unlockPremium` transacts on `payments/{paymentId}` (rejects different-uid reuse with `PAYMENT_REPLAY`, writes audit row, `expiry:null`); `verify.js` asserts `order.notes.uid === req.userId` (`403 PAYMENT_OWNER_MISMATCH`).
- **Docs synced:** PAYMENT-ARCHITECTURE §5/§8, FIRESTORE-BLUEPRINT `payments`.

### fix(H2): atomic AI word-problem quota 🟠 HIGH
- **Files:** `main-app/services/aiService.js` (`consumeWordProblemQuota`), `main-app/api/ai/word-problems.js`.
- **Root cause:** non-transactional in-memory check-then-consume let concurrent requests bypass the cap.
- **Change:** consumption runs inside a Firestore transaction against `usage/ai`, enforces cap atomically, returns granted count; endpoint serves only the granted slice and 429s at 0.
- **Docs synced:** TECHNICAL-BIBLE §7, SECURITY-ARCHITECTURE §6.

### fix(H3): rate-limit public register endpoint 🟠 HIGH
- **File:** `main-app/api/auth/register.js`.
- **Root cause:** unauthenticated, un-rate-limited account creation (CORS `*`) → scripted abuse.
- **Change:** per-IP in-memory limiter (10/hr/IP) via `x-forwarded-for`; returns 429 on exceed. Noted as per-instance defense-in-depth; hard cap requires App Check/captcha.
- **Docs synced:** SECURITY-ARCHITECTURE §6.

### docs: establish source-of-truth documentation v1.0
- Added Technical Bible v1.0, Firestore Blueprint v1.0, Security Architecture v1.0, Payment Architecture v1.0.
- Basis: full read-only audit ([../AUDIT-REPORT.md](../../AUDIT-REPORT.md)).
- Documentation generated BEFORE any code change, per change-control policy.
