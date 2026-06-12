# QuantReflex Decision Log

**Architecture Decision Records (ADRs).** Each entry captures a decision, the context, the
options considered, and the consequences — so future readers understand *why*, not just *what*.
Newest first. Reference these IDs (`ADR-NNN`) from the CHANGELOG when a change embodies a decision.

Companion: [GOVERNANCE.md](GOVERNANCE.md) · [VERSIONS.md](VERSIONS.md) · [CHANGELOG.md](CHANGELOG.md)

---

## ADR-024 — Super Admin stability + UX + dark-mode polish program (3-pass, 2026-06-12)
- **Context:** Two production operational bugs + a desktop-leaning UX. **Bug #1:** deleting a user in
  User-360 frequently showed *"Too many requests."* — root cause is NOT a loop: the per-admin rate limit was
  **30 req/hr** (`api/_lib/middleware.js`) and User-360 **double-refreshed** after every mutation
  (`_split.select(uid)` + `_load()` both refetched), so a normal session reached 30 in minutes; `api.js`
  surfaced the raw server string with no retry. **Bug #2:** the collapsed rail had no `.sidebar-footer` /
  `#logoutBtn` rule, so the full-width text "Logout" overflowed the 72px rail. Plus: sub-48px touch targets,
  bare empty/loading states, and a stylesheet built on hundreds of hardcoded hex colors (no real dark mode).
- **Decision:** a **3-pass refinement program**, each committed + verified separately (user-directed):
  - **Pass 1a (this commit) — stability + UX + tablet:** raise the admin limit **30→300/hr** (best-effort
    per-instance ceiling; the real gate is the `admin:true` claim); add a bounded **single-retry** transient
    layer in `api.js` `_fetch` (429/5xx, max 1; carries `.status`/`.code`); map known codes to **operator-
    friendly** copy in `getReadableError` (no raw "Too many requests"). Eliminate the double-refresh: **delete
    is instant + zero-fetch** (drop the row from the in-memory list, clear the detail — no getUsers), and every
    status mutation does **one** detail refresh that **locally syncs the master row** (2 calls → 1; same in
    Coaching-360). First-class **collapsed logout** (icon + label expanded, centered 48px icon collapsed).
    Touch targets: primary ≥48px, dense ≥44px. Polished **empty-state primitive** (`AdminUtils.emptyState`:
    icon+title+text+CTA) + a **loading spinner**.
  - **Pass 1b (next) — thorough 100% dark mode:** re-tokenize the ENTIRE stylesheet + every view onto a
    semantic theme-token system (surfaces, text, border, accent, and full state ramps danger/success/warning/
    info as `-bg`/`-fg`/`-border`), with a complete, *intentionally-designed* `:root[data-theme="dark"]`
    palette (not auto-inverted) and **zero hardcoded color literals left in views**. No-FOUC boot script +
    footer light/dark/system toggle, persisted via the `qrAdmin*` localStorage pattern. AA-contrast verified
    in both themes at tablet width. (Split out from 1a so a large regression-sensitive re-tokenization is its
    own verified commit, per the user's "no partial/broken dark mode" bar.)
  - **Pass 2 — Settings Center + Operations enhancements.** **Pass 3 — UX/visual/a11y/navigation enforcement
    audits.**
- **Infra:** zero new functions (super-admin 8/12, main-app 6/12); no schema/security/payment change. All
  client + the one middleware constant.
- **Consequence:** the deletion bug + "Too many requests" are eliminated at the root (raised ceiling + halved
  per-action calls + instant local delete + graceful retry/messaging); the collapsed rail is fully usable;
  tablet touch ergonomics meet the floor. Bible 2.12→2.13, Arch 2.7→2.8.

## ADR-023 — Production hardening: remove client-side admin credential + bound unbounded scans (2026-06-12)
- **Context:** A zero-compromise from-source audit of the Super Admin app found one CRITICAL and several
  scalability defects. **CRITICAL (C1):** `js/firebase/auth.js` hardcoded the admin email
  (`quantreflex@gmail.com`) AND password (`pass@iON2203`) and signed in with them — so the real Firebase
  password of the `admin:true` account was shipped in public client JS. Anyone with the deployed URL could
  sign in as the admin and receive a token that legitimately passes `withAdminAuth` → total platform takeover.
  `withAdminAuth` cannot mitigate this (the attacker authenticates *as* the real admin). **HIGH:** several
  endpoints do unbounded full-collection scans / in-memory joins that OOM (512 MB) or time out (15 s) between
  ~100k–500k users: AI usage (`ai.js` reads all `users` + all `usage/ai`), the `ai-usage` CSV export, the
  daily `payments` scan in `metrics.js`, `duels-cleanup`, the premium broadcast over-read, and the coaching
  suspend/delete cascade. Dashboard premium counts also overcount expired-but-unswept premium.
- **Decision:**
  1. **Security (C1):** remove ALL hardcoded credentials/emails from the client. `login()` calls
     `signInWithEmailAndPassword(email, password)` with the values the human types — no client password check.
     Admin authority is the **server `admin:true` claim ONLY** (`withAdminAuth`) plus the client claim re-check
     in `onAuthStateChanged`. A non-admin Firebase user who signs into the admin form is rejected at the claim
     check and logged as `suspicious_access`. **The password must be rotated in the Firebase Console** (the old
     one is published) and MFA enabled — operational actions outside the repo.
  2. **Scalability:** every admin Firestore read is **bounded** — add `.limit()` to the AI usage scans (with a
     `truncated` flag surfaced in the UI), the `ai-usage` export, the `payments` snapshot scan, `duels-cleanup`
     (+ chunked deletes ≤500), and paginate the coaching-cascade read. `coachings?action=list` gains a limit.
  3. **Accuracy:** active premium = `count(plan=='premium')` − `count(plan=='premium' && planExpiry<now)` via
     `count()` aggregations (no 1000-cap in-memory scan), needing a `(plan, planExpiry)` composite index. The
     premium broadcast filters server-side via a `(plan, fcmToken)` composite index instead of reading all
     token-holders.
- **Infra:** **zero new serverless functions** (all edits are inside existing handlers; super-admin stays
  8/12, main-app 6/12). **Two new composite indexes** (`users (plan,planExpiry)`, `users (plan,fcmToken)`).
- **Options considered:** (a) full pre-aggregation of AI cost into the daily snapshot — deferred as the
  durable fix; this pass caps the scans so they cannot OOM/timeout, which is sufficient at current scale.
  (b) keep a client email allow-list — rejected (brittle, M5; the claim is the real gate). (c) leave the
  password and rely on `withAdminAuth` — rejected; the leaked password yields a *claim-bearing* token, so the
  server gate is moot.
- **Consequence:** the credential leak is closed; admin authority is claim-only; every admin read is bounded
  so the app degrades gracefully (truncates, never OOMs) instead of failing at scale; premium analytics are
  accurate. Security 2.4→2.5, Firestore 2.7→2.8, Bible 2.11→2.12. Pre-aggregating AI cost remains a tracked
  follow-up (ROADMAP).

## ADR-022 — Super Admin V2: entity-centric 360 consolidation (2026-06-12)
- **Context:** After the V2 shell (ADR-019), 5 of 7 domains still rendered the legacy views under a strangler,
  leaving heavy duplication (governance UX audit): the user list fetched in 3 views; entitlement state recomputed
  in 4 places; coaching-create in 2 (one buggy 2-arg call); AI cost in 3; duel-cleanup / inactive-export /
  audit-feed each in 2+. The Users view grouped every user under its coaching as expanded cards (infinite vertical
  scroll) and opened a 400px overlay drawer — both tablet-hostile.
- **Decision:** Consolidate every admin workflow into **5 entity-centric Centers**, **one owner per capability**
  (GOVERNANCE): **User-360** (Users — SplitView flat filterable master with status chips + tabs
  Profile|Entitlement|Lifecycle|AI|Activity|Payments|Audit; absorbs Inactive as a filter chip + bulk-bar; **sole owner
  of per-user entitlement + lifecycle + AI throttle + coaching reassignment**; replaces the overlay drawer with the
  in-flow SplitView); **Coaching-360** (Coachings — SplitView; **sole coaching-create + management owner**;
  Overview|Students|Allocation|AI|Activity|Settings, Settings owning token-rotate + suspend/activate/delete);
  **AI Cost Center** (AI — Overview|By User|By Coaching|Abuse with **inline** throttle remediation; surfaces but does
  not re-own the AI kill switch — toggle stays on Command Center); **Revenue Center** (Revenue — Overview|Subscriptions|
  Trends|Grants; wires the previously-dead `revenue-intel`); **Operations Center** (Operations — first-class
  Diagnostics|Security|Firestore|Campaigns|Exports|Cleanup|Audit panels replacing the strangler wrappers). Command
  Center + Content unchanged. **Removed:** the grouped Users list + overlay drawer DOM; the standalone Payments /
  Inactive / Security / Firestore-ops / Exports / Notifications / System **view files** (folded into Centers — the
  corresponding `api/admin/*` handlers stay). One shared client-side **entitlement-state resolver** replaces the 4 copies.
- **Emergency ownership:** the break-glass toggles (maintenance / AI-kill / payment-kill) keep a **single write owner —
  the Command Center** (fast incident response). The AI Cost Center and Operations Center show their **read-only live
  state** with a one-click "Manage in Command Center" link — no duplicate write surface.
- **Infra:** new reads/writes are `?action=` branches on existing handlers — **zero new functions** (stays 8/12):
  users +`payment-history`/`activity-timeline`/`admin-history`/`throttle`/`reassign-coaching`/`pending-purge-list`;
  coachings +`details`/`students`/`activity`/`reset-token`; system `revenue-intel` extended (+`conversionRate`/
  `failedGrants`/`growth`/`trialUsers`); notifications +`history` (GET) alongside the existing broadcast (POST). **AI
  by-feature / by-coaching / top-consumers are derived client-side** from the existing `ai?action=usage` payload (no
  new AI actions — the usage endpoint already returns the full per-user analytics array). One new **additive** user
  field `aiThrottle {cap,setBy,setAt}` (per-user daily AI-request cap honored by main-app `api/ai.js` via
  `aiService.enforceAiThrottle`, which keeps a transactional daily counter `usage/ai.gptThrottleDate|gptThrottleCount`).
- **Options considered:** (a) keep strangler wrappers — rejected (the duplication is the problem). (b) dedicated AI
  per-coaching/top-consumer **backend** actions — rejected; the `usage` endpoint already returns every consumer, so
  aggregation is a pure client-side group-by (no extra Firestore reads, no new function surface). (c) duplicate the
  Emergency toggles onto Operations — rejected (two write owners for one capability violates the one-owner rule).
- **Consequence:** minimum-click governance (chip → row → tab → inline action), tablet-first (SplitView master/detail,
  card-mode), zero duplicate entry points, no hybrid old/new state (every legacy view file and the overlay drawer are
  gone). Implemented strangler-style then fully cut over, Center by Center. Arch 2.6→2.7, Firestore 2.6→2.7, Bible
  2.10→2.11.

## ADR-021 — Emergency Controls: maintenance mode + AI kill switch + payment kill switch (cross-app, 2026-06-12)
- **Context:** The platform had no break-glass controls. An AI cost runaway, a Razorpay incident, or a bad
  deploy could only be stopped by code changes + redeploys. Super Admin V2 (ADR-019) adds operator-grade
  governance, so it must include enforced emergency controls — not just toggles, but flags the **student app
  actually honors** before running protected operations.
- **Decision:** Three central Firestore config docs are the single source of truth:
  `config/maintenance {enabled, message?, updatedBy, updatedAt}`, `config/aiKillSwitch {enabled, …}`,
  `config/paymentKillSwitch {enabled, …}`. **Super-admin** toggles them via `system?action=config-get|config-set`
  (Admin SDK write + immutable `auditLogs`, category `system`). **main-app enforces** them: `aiService` reads
  `config/aiKillSwitch` and refuses OpenAI calls when enabled; `paymentService`/`payment.js` reads
  `config/paymentKillSwitch` and refuses to create a Razorpay order when enabled; the client checks
  `config/maintenance` on boot and shows a maintenance screen (blocking core learning) for non-admins. Flags are
  cached with a short TTL to avoid a per-request read.
- **Security (rules):** the three flags must be **client-readable** (the student app reads them to enforce) but
  **Admin-SDK-write-only**. `config/maintenance` → `allow read: if true` (must show pre-auth); `aiKillSwitch` +
  `paymentKillSwitch` → `allow read: if request.auth != null`; all three `allow write: if false`.
  `config/aiBudget` keeps NO client rule (default-deny / Admin-SDK only). The flags are non-sensitive booleans.
- **Options considered:** (a) Remote-config / env-var flags — rejected (needs redeploy; not instant; not
  audited). (b) A new `api/config` function — rejected (Vercel-Free budget; folds into `system.js` as actions).
  (c) Enforce only in super-admin (toggle without teeth) — rejected by the owner; controls must actually block.
- **Consequence:** real break-glass governance with one audited write path; zero new serverless functions
  (config actions live on `system.js`); a small main-app read-and-honor change in `aiService`/`paymentService`/
  boot. Payment track bumps (flow now gated). Documented in GOVERNANCE, SECURITY_ARCHITECTURE, TECHNICAL_BIBLE,
  FIRESTORE_BLUEPRINT.

## ADR-020 — Global Search as a scalable ecosystem governance primitive (2026-06-12)
- **Context:** The old Cmd+K fetched **all** users to the client and filtered in-browser (`app.js`) — fine at
  test scale, unusable at 100k→1M. Firestore has no native full-text search. Super Admin V2 needs one fast
  "search anything" entry point.
- **Decision:** A single server-side search action — `system?action=search&q=<prefix>` on the cross-domain
  `system` handler — is the **ecosystem search primitive**. This pass implements prefix search over **users**
  (`emailLower` — **case-insensitive**, `profile.name`, doc-id `uid`, `coachingId`) and **coachings** (doc-id, `name`) via Firestore range
  queries (`where(f,'>=',q).where(f,'<=', q + String.fromCharCode(0xf8ff))`), run in parallel, capped per group, deduped — **never a
  client fetch-all**. The action is designed to grow new `scope`s (payments, questions, AI analytics, audit)
  without a new function.
- **Options considered:** (a) keep client filter — rejected (won't scale). (b) external engine (Algolia/
  Typesense) — deferred (cost/complexity; revisit if prefix search proves insufficient). (c) a dedicated
  `api/search` function — rejected (Vercel-Free budget; lives on `system.js`).
- **Consequence:** O(prefix) reads instead of O(all-users); one new `?action=` branch (stays 8/12); single search
  surface to extend. Cross-entity fuzzy/relevance ranking is a future enhancement. Documented in GOVERNANCE,
  TECHNICAL_BIBLE, DECISION_LOG.
- **Update (2026-06-12, email normalization):** Firestore string ordering is case-sensitive, and `users.email`
  preserves the casing the user typed — so the original email prefix query missed mixed-case matches. Resolved
  by adding a normalized **`emailLower`** field (lowercased `email`), written at register, backfilled across
  existing docs, and queried by Global Search with a lowercased prefix → **case-insensitive email search**. Done
  before the user base grows to avoid a larger backfill later. (Firestore 2.5→2.6; FIRESTORE_BLUEPRINT + migration.)

## ADR-019 — Super Admin V2: tablet-first information architecture + admin design system (2026-06-12)
- **Context:** The Super Admin app is operationally sound but architecturally messy: 12 flat nav items,
  duplicated workflows (coaching-create in Users + Coachings; inactive-export in Inactive + Exports; orphan-duels
  in Dashboard + System; AI cost in Dashboard + AI), a 522-line Users grab-bag, an overlay "drawer", vanity-heavy
  Dashboard, reference docs mixed into System, and AI abuse flags with no inline remediation. It is desktop/phone-
  first: the sidebar is hidden behind a hamburger until 1024px, so the **11-inch tablet landscape** (the owner's
  primary device, Chrome PWA) wastes its width. Content max-width caps + centering waste more.
- **Decision:** Rebuild it as a **tablet-first governance OS** with a consolidated **7-domain IA** — Command
  Center · Users · Coachings · Revenue · Content · AI · Operations — and an **admin design system**: a persistent
  **collapsible left rail** visible at ≥768px (icon+label ↔ icon-only), an in-flow **master/detail SplitView**
  (replaces the overlay drawer; powers User-360 / Coaching-360), a **Tabs** primitive, **Table card-mode**
  (kills forced horizontal scroll), **focus-trapped modals**, `auto-fit` stat grids, and a corrected viewport
  (re-enable zoom). Each screen answers what-happened / what's-happening / what-needs-attention / what-action,
  with **inline remediation** (e.g. AI abuse → suspend/throttle in place) and audited destructive actions.
  Rollout is **strangler** (new shell + domains alongside old views → redirect → delete last), not big-bang.
- **Infra:** every new capability is a `?action=` branch on an existing handler — **zero new serverless
  functions** (super-admin stays 8/12; reaffirms ADR-017). Reuses existing design tokens (`css/admin-style.css`).
- **Options considered:** (a) keep the 12-view structure, restyle only — rejected (the IA *is* the problem).
  (b) framework rewrite (React/etc.) — rejected (no bundler; would break the no-build deploy + PWA + the rest of
  the codebase's conventions). (c) big-bang replacement — rejected (risk; strangler keeps the panel working
  throughout).
- **Consequence:** a coherent operating system with ~6-7 domains instead of 12 flat screens, tablet-native
  ergonomics, and a reusable admin design system documented in TECHNICAL_BIBLE §10B. A multi-phase program
  (this pass: shell + Command Center + Global Search + Emergency Controls; later: Users/Coachings/Revenue/AI/
  Content/Operations build-out). Arch + Bible bump. See ADR-020 (search) and ADR-021 (emergency controls).

## ADR-018 — Super Admin Control Center Phase 5: Security Center + Firestore-Ops + Content Management (2026-06-12)
- **Context:** Phase 5 is the final scoped installment of the Control Center program (ROADMAP): a Security
  Center (explicitly "needs new failed-login capture"), Firestore-Ops (collection sizes/growth), and Content
  Management (real CRUD over `questions`). It also unblocks the two alerts Phase 4 (ADR-016) deferred for lack
  of data: payment-failure-spike and Firestore-growth-spike. Binding constraints: Vercel Free 12-function cap
  (super-admin at 8 — must add **zero** new `api/*.js`), Firebase Spark (no Cloud Functions → no Auth-trigger
  for failed logins; cron stays once/day), and Bible-first governance.
- **Decision:**
  1. **Failed-login capture is client-side** (Spark has no auth triggers) into a new append-only
     `securityEvents` collection, written from the login error paths of all three apps via a small inline-copied
     `SecurityEvents.record()` helper. **Write-path:** a *direct* client write guarded by a hardened Firestore
     rule (fixed key allowlist, `type` allowlist, `createdAt == request.time` to block backdating, **SHA-256
     `emailHash` — never the raw email, never the password**, size-capped strings; admin-only read;
     update/delete denied). Server-observed failures (payment) are written via the Admin SDK (bypasses rules).
  2. **Zero new functions.** Security Center read = `system.js?action=security`; Firestore-Ops =
     `system.js?action=firestore-ops`; the two new alerts fold into `system.js?action=alerts`; collection-growth
     history folds into `_lib/metrics.js#computeDailySnapshot` (`collectionCounts`, persisted by the existing
     daily `cron/sweep`). Content Management extends the existing `questions` handler/view (no parallel surface).
  3. **Content Management** adds `questions?action=update|archive|delete` (fixing the silent-duplication bug
     where editing created a new doc), a shared validate/normalize helper, an `updatedAt` field, and Table
     edit/archive/delete actions. `delete` requires `confirm:'DELETE'`; every mutation writes `auditLogs`
     (`category:'content'`); soft-archive (`status:'archived'`) is preferred over hard delete.
- **Security trade-off (explicit):** the `securityEvents` create rule must allow an *unauthenticated* write
  (a failed login has `request.auth == null`). With Firebase App Check not yet enabled (tracked debt M7), this
  is an open—but shape-bounded—write surface. It is acceptable pre-launch because (a) Firebase Auth's own
  `auth/too-many-requests` throttles brute force at the platform level, so an attacker cannot generate unbounded
  *login* events; (b) the rule forbids raw PII, backdating, arbitrary shapes, and any read; (c) the Security
  Center treats the `emailHash`/`reason` as untrusted. **Enabling App Check (M7) is the documented hardening
  follow-up** and would let the rule additionally require attestation.
- **Options considered:** (a) server endpoint (per-IP rate-limited) for the failed-login write — rejected as the
  default because it adds a function and still consumes the same Spark write quota; kept as the App-Check-era
  upgrade path. (b) one aggregate counter doc per day instead of one doc per event — rejected: loses per-event
  forensic detail and hits single-doc write contention; event volume is already bounded by Firebase Auth
  throttling. (c) a separate `content` collection/view — rejected: would duplicate and drift from `questions`.
- **Consequence:** super-admin stays at **8/12** functions; one new collection (`securityEvents`) + one composite
  index; `questions` gains `updatedAt`; `metrics` gains `collectionCounts`. Additive across Firestore + Security
  tracks (MINOR). Firestore 2.3→2.4, Security 2.2→2.3, Bible 2.7→2.8. No data migration.

## ADR-017 — API Consolidation Strategy: domain-based action-routed handlers under the Vercel Free cap (2026-06-12)
- **Context:** QuantReflex deploys on Vercel Free (Hobby), which caps a deployment at **12 Serverless Functions
  per project** (every `api/*.js` = one function; `api/_lib/**` excluded). An audit found super-admin-app at
  **15** functions (over by 3 — the real reason it would not deploy) and main-app at exactly **12** (no
  headroom). Adding any endpoint would break deployment. There are **zero live users** (test data only).
- **Decision:** Restructure into **domain-based, action-routed** APIs — one file per domain dispatching on
  `?action=`/`?type=`, with a SINGLE auth wrapper per file. super-admin **15→8** (`system`, `users`, `ai`,
  `entitlements`, `coachings`, `questions`, `notifications` + one merged `cron/sweep`); main-app **12→6** (`ai`,
  `payment`, `account` + isolated `payment/webhook`, `auth/register`, `validate-coaching`). Legacy/dead
  endpoints dropped (no back-compat needed pre-launch): the deprecated `ai/word-problems` is removed (the client
  reads `questions` directly from Firestore). **Auth boundaries are inviolable:** admin↔admin and
  student↔student merges only; crons keep `CRON_SECRET`; the Razorpay webhook stays isolated (HMAC +
  `bodyParser:false`); public endpoints stay isolated. Future features must fit an existing domain API
  (enforced by GOVERNANCE Infrastructure Governance + TECHNICAL_BIBLE §3.1).
- **Options considered:** (a) keep endpoint-per-feature + upgrade to Vercel Pro — rejected (cost; the structure
  is the real problem); (b) merge across auth models to save more files — rejected (security regression / role
  leakage); (c) move admin analytics to Cloud Functions — rejected (Spark plan; not deployable).
- **Consequence:** Both apps deploy on Free with headroom (super 8, main 6, coaching 6 — all <12); lower
  maintenance; a clean growth path. Trade-off: merged in-memory rate-limit buckets are slightly tighter per
  user (acceptable / arguably more correct). Arch 2.5, Bible 2.7.

## ADR-016 — Export Center (authenticated CSV) + Alert Center (computed from existing data) (2026-06-12)
- **Context:** Admins need CSV exports (users/premium/coachings/revenue/AI-usage/inactive) and one Alert feed.
  Admin endpoints require a Bearer JWT, so a plain `<a href download>` to an API route would be unauthenticated
  (401). And several spec'd alerts (payment-failure spike, Firestore-growth spike) have no underlying data yet.
- **Decision:** Exports return **JSON `{filename, csv}`** from `api/admin/export` (+ `inactive-users?action=export`),
  fetched through the authenticated `API._fetch` (Bearer header), then turned into a client-side **Blob download**
  (`AdminUtils.downloadCsv`) — auth is preserved and no token leaks in a URL. (This also fixes the Phase-2
  inactive-export link, which had the same auth gap.) Exports are capped (≤10k–20k rows) per serverless request;
  true large-scale export is a future background job. The **Alert Center** (`api/admin/alerts`) computes alerts
  from data we already have — AI budget warning/critical/over, expired-premium count, stale duel rooms,
  archived-past-hold pending purges — rendered at the top of the Dashboard. Payment-failure and Firestore-growth
  alerts are deferred (need new instrumentation; ROADMAP).
- **Consequence:** Working authenticated exports + an actionable alert feed with zero new schema. Arch 2.4, Bible 2.6.

## ADR-015 — AI Operations Center: editable spend budget + threshold alerts + usage-based abuse flags (2026-06-12)
- **Context:** The GPT Cost Center (Phase 1) records real per-call cost, but there was no spend ceiling,
  projection, or abuse signal. The spec asks for a configurable monthly budget with warning/critical
  thresholds (80/90/100%), projected spend, and detection of excessive/suspicious AI usage.
- **Decision:** Store an editable `config/aiBudget` (`monthlyBudgetUSD` + `warnPct`/`critPct`, defaults
  25 / 80 / 90) written only via `api/admin/ai-budget` (audit-logged). The GET computes month-to-date spend
  by summing the already-pre-aggregated `systemMetrics/ai_daily_*.estimatedCostUSD` for the current month
  (≤31 cheap doc reads — no per-call scan), then derives used%, linear projected monthly spend, remaining,
  and a status (ok/warning/critical/over). **Abuse detection** is heuristic over the per-user `usage/ai`
  counters surfaced by `ai-usage` (high daily word-problem volume, heavy lifetime GPT calls, high cost,
  free-tier over-cap) — flags are advisory for admin review, not auto-enforced.
- **Options considered:** (a) hard-stop AI when over budget — rejected for Phase 3 (would break paying
  users; budget is observability + alerting first); (b) per-request rate/time-series abuse detection —
  deferred (needs per-call event logging; cumulative counters are a pragmatic first signal); (c) currency
  in INR — rejected (OpenAI bills USD and the cost data is USD; keep one unit).
- **Consequence:** Real spend governance + early-warning without new scan cost. Budget is advisory
  (alerting), not enforcing. Arch 2.3, Firestore 2.3, Bible 2.5.

## ADR-014 — User lifecycle: soft-delete → 30-day hold → purge, enforced via Firebase Auth disable (2026-06-11)
- **Context:** The Control Center needs operational user management (suspend/restore/delete/reset) and a safe
  way to reduce database clutter from long-inactive accounts — without the risk of instant, irreversible
  deletion. The spec mandates a staged flow (inactive 6mo → flagged → archive → 30-day hold → permanent
  delete) and guarded deletes (type DELETE + double-confirm).
- **Decision:** Add lifecycle state to `users/{uid}` (`accountStatus` + `suspendedAt`/`archivedAt`/`purgeAfter`/
  `archiveReason`/`inactiveFlaggedAt`). **Suspension is enforced at Firebase Auth** (`updateUser{disabled:true}`)
  — the real gate, since a disabled user gets no valid token; the Firestore field is admin-visibility/cleanup
  state. *Archive* is a reversible soft-delete (Auth-disabled + 30-day `purgeAfter` hold). *Purge* is the only
  hard delete (Auth user + Firestore doc + subcollections + related docs), requires `confirm:'DELETE'`, and is
  done either by an explicit guarded admin action or automatically by the `cleanup-sweep` Vercel-Cron once the
  hold expires. The cron also *flags* (never archives) still-active users inactive >180d for admin review.
  Every action writes an immutable `auditLogs` row (ADR-012).
- **Options considered:** (a) hard-delete on the admin action — rejected (irreversible, no recovery window);
  (b) cron auto-archives inactive users without review — rejected (a returning user would be locked out;
  flag-for-review is safer); (c) a separate `archivedUsers` collection — rejected (lifecycle on the user doc is
  simpler, and the doc is deleted at purge anyway).
- **Consequence:** Safe, reversible, fully-audited user lifecycle that scales (cron-driven purge). Suspension
  correctness does not depend on Firestore (Auth-enforced). Firestore 2.2, Arch 2.2, Security 2.2, Bible 2.4.

## ADR-013 — Vercel Cron + Firestore `count()` aggregation as the Spark-compatible analytics backbone (2026-06-11)
- **Context:** The Super Admin Control Center needs platform metrics (user counts, DAU/MAU, revenue, AI cost)
  that scale to 100k–1M users, plus scheduled rollups. Firebase is on the **Spark** plan, so Cloud Functions
  (scheduled triggers) cannot deploy; and scanning whole collections on demand from a 15s Vercel function does
  not scale.
- **Decision:** (1) Pre-aggregate — a Vercel-Cron endpoint `super-admin-app/api/cron/daily-snapshot` (gated by
  `CRON_SECRET`) computes counts via Firestore **`count()` aggregation** (server-side, not document reads),
  rolls up `payments` (bounded) for revenue, and reads the incrementally-maintained `systemMetrics/ai_daily_*`
  for AI cost — writing `metrics/{date}` + `metrics/latest` **daily** (Vercel Hobby caps cron at once/day). (2) The dashboard reads `metrics/latest`
  **O(1)**, and reads today's `systemMetrics/ai_daily_*` **live** for real-time AI cost. (3) AI token/cost is
  pre-aggregated at write time (`aiService.trackGptCost`), never scanned. Mixed-type `updatedAt`/`createdAt`
  counts use a disjoint Timestamp+string `count()` union. (4) `auditLogs` is the immutable audit backbone.
- **Options considered:** (a) Upgrade to Blaze + Cloud Functions — rejected for now (the user can't upgrade;
  Vercel Cron is plan-independent and already where the APIs live); (b) on-demand full-collection scans —
  rejected (doesn't scale; 15s timeout); (c) Firestore distributed counters on every write — heavier than a
  daily snapshot needs, kept only for the hot AI-cost path.
- **Consequence:** Analytics scale to 1M users without Blaze. Trade-off: pre-aggregated figures (revenue, DAU/MAU)
  are as fresh as the last snapshot (cron runs **daily** — Vercel Hobby caps cron frequency at once/day; Pro
  can go hourly); today's AI cost is read **live** (real-time); an on-demand recompute is also available.
  Firestore 2.1, Arch 2.1.

## ADR-012 — Operational changes flow through the Super Admin Control Center; never direct DB manipulation (2026-06-11)
- **Context:** Admins can technically edit Firestore directly in the Firebase console. Doing so bypasses
  authorization, rate limiting, validation, and — most importantly — leaves **no audit trail**. As the platform
  grows (entitlements, coaching lifecycle, user deletion, refunds), untracked manual edits become a governance
  and safety hazard.
- **Decision:** The `super-admin-app` Control Center is the **single enforcement point** for all operational
  changes. Every mutation goes through an `api/admin/*` endpoint (`withAdminAuth`) and writes one **immutable
  `auditLogs` row** via the shared `api/_lib/audit.js#writeAuditLog` (who/when/what/before/after). `auditLogs`
  is append-only (client create/update/delete denied by rules; Admin-SDK-write only). Direct console mutation
  is prohibited by policy ([GOVERNANCE.md](GOVERNANCE.md)); if a capability is missing, add the endpoint rather
  than hand-editing data. Destructive actions (revoke, delete) must record before/after and follow the
  soft-delete→hold→delete flow.
- **Options considered:** (a) Trust admins + console edits — rejected (no trail, no safety); (b) log only
  entitlement actions (status quo) — rejected (coaching/content/deletion went unlogged, and the dashboard
  reader was even pointed at a never-written root collection).
- **Consequence:** Complete, immutable operational history; enforceable approval/retention policy; the Control
  Center becomes the operating system for QuantReflex. Security 2.1, Bible 2.3.

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
