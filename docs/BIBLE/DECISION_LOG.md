# QuantReflex Decision Log

**Architecture Decision Records (ADRs).** Each entry captures a decision, the context, the
options considered, and the consequences — so future readers understand *why*, not just *what*.
Newest first. Reference these IDs (`ADR-NNN`) from the CHANGELOG when a change embodies a decision.

Companion: [GOVERNANCE.md](GOVERNANCE.md) · [VERSIONS.md](VERSIONS.md) · [CHANGELOG.md](CHANGELOG.md)

---

## ADR-011 — Practice tab is a fixed app shell (single centered scroll panel) (2026-06-11)
- **Context:** The Practice screen felt unstable — the header drifted while scrolling, spacing above/
  below the mode list was asymmetric, and it read as "the whole screen scrolls." Root cause (traced in
  code): every view is wrapped in the app scroller `.container` (`flex:1; overflow-y:auto;
  padding:1.25rem 1.25rem 1rem`). Practice was *meant* to opt out via a fixed-height `#view-practice`
  shell (`overflow:hidden`) with an inner `.practice-container` scroller — but the shell height
  (`100vh − 4.5rem − safe`) exceeded `.container`'s padded content box by ~1.5rem, so `.container` ALSO
  scrolled and dragged the fixed header (a double scroll). The `4.5rem` nav subtraction also mismatched
  the real `3.75rem` nav height, adding a phantom asymmetric gap.
- **Decision:** Make Practice a true fixed app shell. (1) Introduce `--qr-nav-h: 3.75rem` as the single
  nav-height source (nav `height`, `body` padding, shell height all consume it). (2) When Practice is
  active the router sets `body.view-practice-active` and CSS neutralizes the app scroller
  (`> .container { padding-top:0; padding-bottom:0; overflow:hidden }`) so the shell owns scrolling — no
  double scroll, the header can never drift. (3) The shell respects `env(safe-area-inset-top/bottom)`.
  (4) The inner `.practice-container` gets equal top/bottom margin (`--qr-practice-gap auto`) + symmetric
  padding so the panel is visually centered between header and nav.
- **Options considered:** (a) make the practice `<header>` `position:sticky` inside `.container` and let
  the app scroller run — rejected: sticky inside a padded scroller is fragile and the padding shows above
  it; (b) shrink the shell height to fit inside `.container`'s padding — rejected: couples Practice to
  `.container`'s exact padding and leaves the asymmetric outer gaps; (c) a `:has()` selector instead of
  the JS class — viable, but a one-line router toggle is bulletproof across all WebViews.
- **Consequence:** UI-architecture refinement of the §10A scroll contract; documented there. Bible
  2.1 → 2.2 (MINOR — non-breaking; no entitlement/data/logic change). One scroller on Practice; future
  sections extend the panel without breaking layout. Other views are unaffected (the body class is
  present only while Practice is active).

## ADR-010 — Unified design system (one card language, glass + tokens) (2026-06-11)
- **Context:** The app had drifted into per-screen styling — Home felt modern while Practice/Stats/Learn
  and the premium cards looked older and inconsistent (different radii, shadows, borders, heavy purple
  accents, mixed glassmorphism). A scroll regression was also introduced when the Practice mode-list lost
  its scroll-container class during the prior section refactor.
- **Decision:** Establish ONE design system documented in [TECHNICAL_BIBLE.md §10A](TECHNICAL_BIBLE.md):
  app-wide tokens (radius 24/20/18px, hairline borders, soft navy shadows, spacing 32/24/16), a single
  glassmorphism foundation with 3 elevation levels, and a reusable **premium feature card** (AI Coach /
  Study Plan inherit Math Duel's exact styling — its "smaller siblings"). Purple demoted to a sparing
  supporting-gradient accent; primary identity is navy + electric blue + soft white + slate + gold.
- **Options considered:** keep per-screen bespoke styling (rejected — that *is* the drift); a heavier
  component framework (rejected — vanilla app, no bundler; CSS tokens + shared classes suffice).
- **Consequence:** Practice screen simplified to *action* (training modes), not a second dashboard —
  duplicate Home metrics removed. Scroll contract for `#view-practice` documented to prevent regressions.
  Bible bumped to 2.1 (new UI-architecture subsystem). Visual-only; no entitlement/data/logic change.

## ADR-009 — v2 monetization: single `plan` model, remove lifetime + Premium+ (2026-06-11)
- **Context:** v1 sold two paid tiers — ₹89 lifetime (`isPremium`/`hasPaid`) and ₹299/₹499 "Premium+"
  (`isPremiumPlus`, the only tier with AI). Confusing for users, duplicated gating logic, and split
  schema. Business decided on one paid tier.
- **Decision:** Collapse to a single **Premium** tier (₹299/6mo `premium_6m`, ₹499/12mo `premium_12m`)
  that includes everything. Canonical schema is `plan: 'free'|'premium'` + `planType`, `planExpiry`,
  `planSource`; `isTrial`/`trialEnd` retained for admin-granted custom-duration trials. All removed v1
  fields are deleted. Every gate (client, server, AI, rules, admin, coaching, functions) resolves
  through `plan`. New `aiService.activatePremium`/`resolvePlan` replace `unlockPremium(Plus)`/
  `isUserPremium(Plus)`. Single `premium` JWT claim.
- **Options considered:** (a) repurpose the `isPremium` boolean — rejected, the user wanted a literal
  `plan` field and architectural cleanliness over minimal change; (b) grandfather lifetime buyers —
  N/A, **zero production users**, so a clean pre-launch migration was chosen with no back-compat.
- **Consequence:** Breaking schema change → **v2.0** across all version tracks. Forward docs rewritten;
  historical records (this log, CHANGELOG, AUDIT) retain v1 entries. Dev-data normalized by
  `firestore/migrations/2026-06-11-v2-plan-schema.js`. Math Duel + AI are now plain premium features.

## ADR-008 — Establish `/docs/BIBLE/` as the permanent source of truth (2026-06-11)
- **Context:** Architecture knowledge was spread across code comments and ad-hoc docs; risk of
  drift and of a future session not understanding the system.
- **Decision:** Consolidate four core docs + changelog into `/docs/BIBLE/`, add DECISION_LOG,
  ROADMAP, VERSIONS, GOVERNANCE, README. Enforce a doc-first change workflow.
- **Options considered:** (a) keep docs at `/docs/` root — rejected, no governance structure;
  (b) wiki/external — rejected, must live with the code and survive offline reads.
- **Consequence:** Every change now carries a documentation + version cost; the payoff is a
  cold-readable architecture. Old `/docs/*.md` replaced with redirect stubs to avoid dual truth.

## ADR-007 — Single canonical super-admin auth wrapper (2026-06-11, audit M5)
- **Context:** Two admin wrappers existed; only `firebase-admin#withAdmin` (used by `questions.js`)
  was rate-limited. Sensitive endpoints (entitlements, payments) had none.
- **Decision:** `_lib/middleware.js#withAdminAuth` is canonical (token + `admin:true` + 30/hr,
  sets both `req.userId` and `req.adminUid`); `withAdmin` re-exports it.
- **Consequence:** All super-admin endpoints rate-limited under one implementation.

## ADR-006 — `studentCount` is the single canonical counter, function-owned (2026-06-11, audit M8)
- **Context:** Two divergent fields (`studentCount` from the Cloud Function vs `studentsCount`
  from claim-coaching/admin) produced wrong admin numbers and double-counting.
- **Decision:** `syncCoachingStudentCount` Cloud Function is the **sole writer** of `studentCount`.
  Request handlers must not increment counters. Legacy `studentsCount` removed; reconcile script
  provided.
- **Options considered:** make claim-coaching write the counter (rejected — racy, duplicates the
  function and double-counts).
- **Consequence:** One source of truth; drift repaired by a reconciliation script.

## ADR-005 — Canonical coaching active-state helper (2026-06-11, audit M4)
- **Context:** Three endpoints disagreed; claim/validate checked a `status` value never written,
  so a suspended coaching could be claimed.
- **Decision:** `isCoachingActive(data)` = `status==='active'` when present, else `isActive!==false`.
  Used by register, claim-coaching, validate-coaching.

## ADR-004 — Lifetime premium uses an idempotent, user-bound grant (2026-06-11, audit H1)
- **Context:** Lifetime `premium` granted via `safeUserUpdate` with no payment lock and no
  order→caller binding → cross-account replay of one payment.
- **Decision:** `aiService.unlockPremium` transacts on `payments/{paymentId}` (rejects different-uid
  reuse), and `verify.js` asserts `order.notes.uid === req.userId`. Mirrors the Premium+ design.

## ADR-003 — AI quota enforced transactionally, not via in-memory cache (2026-06-11, audit H2)
- **Context:** Non-transactional check-then-consume let concurrent requests bypass the cap.
- **Decision:** `consumeWordProblemQuota` runs the check+increment inside a Firestore transaction
  and returns the granted count; the endpoint serves only what was granted.

## ADR-002 — Firestore rules are the entitlement authority; claims are an optimization (pre-1.0)
- **Context:** Need fast entitlement checks without 2 Firestore reads per call.
- **Decision:** Firestore is the source of truth; JWT custom claims (`premium`, `premiumPlus`) are a
  best-effort fast path. A stale/missing claim never wrongly grants access — only delays it.
- **Updated by ADR-009 (v2):** the source of truth is now `users/{uid}.plan`, and the claim set
  collapsed to a single `{premium}` (no `premiumPlus`). The "claims are an optimization, Firestore is
  authority" principle still holds.

## ADR-001 — App isolation with inline-copied shared utilities (pre-1.0)
- **Context:** Three apps deploy independently on Vercel; no bundler.
- **Decision:** `shared/` is reference-only; utilities (`_toMillis`, `_escapeHtml`, Firebase config)
  are inline-copied per app. Changes to a shared utility must update every copy.
- **Consequence:** Some duplication accepted in exchange for zero build tooling and independent deploys.
