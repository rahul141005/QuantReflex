# QuantReflex Changelog

All notable code + documentation changes. Format: dated entries, newest first. Each code change references its audit finding / ADR ID and the affected file:line, lists the documentation kept in sync, and (per [GOVERNANCE.md](GOVERNANCE.md)) any version bump.

Source-of-truth docs: [README.md](README.md) · [TECHNICAL_BIBLE.md](TECHNICAL_BIBLE.md) · [FIRESTORE_BLUEPRINT.md](FIRESTORE_BLUEPRINT.md) · [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md) · [PAYMENT_ARCHITECTURE.md](PAYMENT_ARCHITECTURE.md) · [VERSIONS.md](VERSIONS.md) · [DECISION_LOG.md](DECISION_LOG.md)

---

## 2026-06-14 — Math Duel release-blocking audit + full remediation (ADR-036)

A 20-phase adversarial audit found **68 verified issues (2C/7H/24M/35L)**; **all 68 are now fixed or documented as
accepted-risk** across `main-app/{js/router.js, js/duel-manager.js, js/duel-core.js, js/duel-ui.js, api/duel.js,
service-worker.js, css/style.css}`, `super-admin-app/api/admin/system.js`, and `firestore/rules/firestore.rules`.

- **Keystone (C):** the duel realtime listener was torn down on every internal re-render (`Router._cleanupOverlays`
  on `showView('duel')`) → sync died after one snapshot. Now gated to nav-AWAY only + `DuelManager.suspend()`.
- **Back-button (C):** hardware Back during solving silently left an un-submitted duel → `DuelManager.handleBackNav()`
  + router popstate hook.
- **Highs:** `suspend()` stops leaked timers; new server **`leaveLobby`** action; `await setPresence` + answer
  retry; resilient recurring waiting poll; **rule blocks post-deadline answer writes**; countdown beacon
  `solving`-only; multi-device freshness gate.
- **Mediums/lows:** word-problem top-up + blank skip; start opponent-liveness + lobby heartbeat; clamped `clientMs`;
  forged-index ignored; presence can't arm `solving` in lobby; single-flight countdown; recursive cron delete;
  honest result copy; canonical SW deep-link cache key; touch targets / dark contrast / safe-area.
- **Simulation:** new `main-app/scripts/duel-sim.js` exercises the REAL server scoring/state-machine fns + the
  generator across every scenario — **47/47 green** (run `node main-app/scripts/duel-sim.js`).
- **Docs:** [ADR-036](DECISION_LOG.md), [VERSIONS.md](VERSIONS.md) (Bible 2.25, Security 2.11, Architecture 2.16),
  [FIRESTORE_BLUEPRINT.md](FIRESTORE_BLUEPRINT.md), [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md). SW v94→v96.
  Firestore rules redeployed (deadline + presence-arming guards). Pending: owner two-device validation.

## 2026-06-14 — Math Duel full redesign + lifecycle hard guards (ADR-035; ADR-031/033 reaffirmed)

**Lifecycle hard guards (P0, commit `8ba0e15`).** A two-device test produced a fake result from a never-played
duel (0-vs-0 with a declared winner + fabricated speed) and a stuck `activeDuelId` that blocked new duels. Fixes in
`api/duel.js`: `_grade` derives `totalSolveMs` from the **sum of real per-answer client times** (never wall-clock)
and gives **zero** speed bonus when 0 answered; `_decideWinner` returns `no_contest` when both answered 0;
`_finalizeTxn` marks a both-zero room **`abandoned`** (no winner/metrics) and clears both mirrors; `_create`
**self-heals** a terminal/stale `activeDuelId` (finalizes an active-past-deadline room, clears complete/abandoned/
missing) so a user is never locked out. Client: `renderResults` speed shows "No data" when 0 answered;
abandoned/no_contest → a clean message + reset; the waiting/deadline poll routes through the state machine.

**Full redesign (ADR-035).**
- **One generator** — `js/questions.js` is now the single source for client + server (guarded `module.exports`,
  server-safe `_difficultyOverride`, `generateMultiTopic`). `api/duel.js` `_start` requires it; the divergent
  6-category `api/_lib/duel-questions.js` is **deleted**. A Duel topic now generates the same 12 authoritative
  categories as Practice; string-answer cats grade via the existing `_isCorrect` (already mirrors `checkAnswer`).
- **Setup = bottom-sheet modal** (`#duelSetupModal`, `js/duel-ui.js renderSetup`) reusing the Custom Training
  slider (5–50) / `_CATEGORY_LABELS` topics / timer section / difficulty pills / Skip toggle, with a **sticky
  Create footer** (fixes the can't-scroll-to-Create bug). Word Problems disabled with a "Soon" badge.
- **Host/guest lobby split** (`renderLobby` → host vs guest), strict 2-player + a polished "arena is full" card on
  `ROOM_FULL`. **Home card** (`#homeDuelCard`) reflects lobby/waiting/results in place (no layout jump).
- **Waiting + results redesign** on §10A (`.results-grid`/`.stat-card`, honest speed/accuracy, Rematch → Home →
  setup modal). All inline indigo removed; dead `.mode-card-duel` purple deleted; SW cache `v92`→`v94`.
- **Files:** `js/questions.js`, `js/drill-engine.js`, `api/duel.js`, `api/_lib/duel-questions.js` (deleted),
  `js/duel-ui.js`, `js/duel-manager.js`, `index.html`, `css/style.css`, `service-worker.js`.
- **Docs:** [ADR-035](DECISION_LOG.md), [FIRESTORE_BLUEPRINT.md](FIRESTORE_BLUEPRINT.md) (generator note),
  [VERSIONS.md](VERSIONS.md) (Bible 2.24, Architecture 2.15).
- **Verify:** `node --check` all touched JS; CSS braces balanced; Node generator-parity test (12 cats incl.
  ratios/fractions/time-and-work). Pending: two-device live playthrough.

## 2026-06-13 — Sections 2–10 program: P1-a (part 1) — Duel solving = true Practice drill-engine reuse (ADR-033)

The owner-LOCKED design-language inheritance, keystone first: the in-duel **solving screen now literally runs on
the Practice `drill-engine`** (not a look-alike). The hand-rolled, inline-styled answerless runner in
`duel-manager.js` (~80 lines) is deleted; the duel calls `createDrillEngine(..., { isDuel:true })`, so the question
container, answer input, **custom numpad**, action buttons, spacing, transitions and feedback animations ARE the
Practice components. The duel layer adds only the multiplayer header (opponent presence chip + Exit).

- **drill-engine.js** — completed the previously-vestigial (and crash-prone) `isDuel` path as a clean
  **capture-only** mode: NO client grading, NO correct/wrong feedback, NO running score, NO answer reveal
  (server-authoritative + hidden-until-results preserved — the client has no answer key). New `captureDuelAnswer`
  emits `{raw, elapsedMs}` via `onDuelAnswerSubmit` and advances with the same animated transition; a new
  `onDuelRender` hook lets the manager (re)inject the live opponent chip + bind Exit each render; the missing-exit-
  button crash is guarded; the duel batch/score paths are skipped. Practice path byte-unchanged.
- **duel-manager.js** — `_startSolving` mounts the engine into `#duelActive`; opponent chip + Submit-&-Leave kept
  via the header + `onDuelRender`. **De-indigo:** Active-Duel home card → `.home-bento-card` + amber duel squircle
  (matches the static `#homeDuelCard`; keyboard-operable role/tabindex/Enter-Space); countdown overlay tokenized.
- **style.css** — new §10A duel classes (`.duel-solve-header`, `.duel-opp-chip/-dot`, `.duel-countdown-*`,
  `.duel-active-card-*`); the Practice **fixed-shell** (ADR-011) is mirrored onto `#duelActive` (6 container-keyed
  rules) so the duel solving layout is identical to Practice. `--color-accent` indigo fallback removed from the
  manager.
- Impacted systems: Student App (main-app). Schema/API delta: none. Security review: no change
  (server-authoritative reinforced — the client still never grades).
- **Remaining in P1-a (part 2, not yet landed):** de-indigo `duel-ui.js` (setup/config sheet, lobby, waiting,
  results, exit modal); delete the dead `.mode-card-duel`/`.duel-setup-card` purple CSS (grep-confirmed 0 JS refs);
  remove the dead static exit-modal body in `index.html`. **Verification needed:** the duel solving-screen layout
  in `#duelActive` must be confirmed by a live two-account playthrough (can't render headless) per the plan.
- Version bumps: deferred to P1-a completion (part 2).

---

## 2026-06-13 — Sections 2–10 program: P0 — gate + live-breaking fixes (ADR-033 + ADR-034)

A 13-agent adversarial audit (audit → independent verify → synthesize) of the shipped Duel V2 + the Super-Admin
user view produced a verified verdict: **preserve the Duel architecture, don't rebuild** (it is genuinely
server-authoritative; issues are edge defects, not structural). This entry is the **Bible-first gate** for the
multi-phase fix-pass that follows — docs land before any code.

- **ADR-033 (Duel V2 fix-pass)** authored: drill-engine **component reuse** for the solving screen (owner-LOCKED
  §10A inheritance — true Practice reuse, render+capture only, no client grading/score), de-indigo every duel
  screen (undefined `--color-accent` indigo fallback → blue-gradient `.duel-seg`), D1 rate-limit class, admin
  V2-lifecycle correctness (dead-`waiting` queries + non-destructive cleanup), per-question data shape + honest
  metrics (`clientMs` display-only; server `decisionBasis`), `leaveLobby`/create-time self-heal.
- **ADR-034 (Section 2)** authored: **first-class Independent affiliation** — backfilled explicit `coachingId:null`,
  authoritative `count()` bucket, `?action=groupTotals` (O(1) per-coaching via `studentCount` + reconciliation),
  All/Coaching-grouped/Independent UI axis. No estimates.
- **`activeDuelId` drift corrected (D4):** `DECISION_LOG.md:92`, `FIRESTORE_BLUEPRINT.md:143`, and the
  `_finalizeTxn` header (`main-app/api/duel.js:171`) claimed the mirror is cleared at finalize; the shipped code
  intentionally does NOT (it keeps the "View Results" card alive — `duel.js:229-231`). All three now state the
  truth (cleared on ack/abandon/cron-expire); added the strictly-2-player note.
- **P0-b code (D1 rate-limit class):** `withAuth(handler, { rateLimitClass: 'duel' })` → a dedicated **120/hr**
  duel bucket in `main-app/api/_lib/middleware.js` (separate counter key from the 20/hr AI bucket); `api/duel.js`
  opts in. A live duel can no longer 429 mid-finish or drain a user's AI budget. Back-compatible (default callers
  unchanged).
- **P0-c code (admin V2-lifecycle):** `super-admin-app/api/admin/system.js` orphan/health/alert probes +
  `duels-cleanup` no longer query the dead V1 `waiting` status. Probes flag only **non-live** rooms
  (`lobby`/`abandoned`/`expired`); cleanup is **non-destructive to `active`** (purges `lobby`>24h /
  `abandoned`+`expired`>1h / `complete`>7d only) so `api/duel.js` stays the sole finalizer (a deleted `active` room
  would destroy `private/key` + player docs and skip the `duelHistory` write).
- Impacted systems: Student App (duel rate-limit) · Admin (`system.js` lifecycle) · APIs · Firestore.
- Schema/API delta: `withAuth` gains a back-compatible opts arg; no schema/endpoint change. Security review:
  rate-limit class is defense-in-depth; admin cleanup can no longer delete live rooms (strictly safer).
- Version bumps: Bible 2.21→2.23, Arch 2.13→2.14 (P0-b/c code). Firestore/Security bump in later phases.
- Verification: drift cites independently spot-checked against source; `node --check` passes on middleware.js,
  duel.js, and system.js.

---

## 2026-06-13 — Coaching-affiliation data correctness on Spark (Section 1, ADR-032)

A brutally-honest repository audit, item 1: a student created with a **valid `coachingId`** was correctly
affiliated (proven with live data — `users/{uid}.coachingId` set) yet Super-Admin showed the coaching with **0
students**. Root cause traced end-to-end: `coachings/{id}.studentCount` was maintained **only** by the
`syncCoachingStudentCount` `onDocumentWritten` trigger, which **does not run on Firebase Spark** — so every
counter was frozen at its creation value. Fixed at the root, not the symptom.

### fix(ADR-032): Spark-safe studentCount + affiliation reflects correctly across all three apps
- Requested change: investigate + fix the coaching-affiliation bug properly (no symptom patches); prove data
  correctness with code-level evidence before the larger redesign.
- Impacted systems: Student App · Admin · Coaching (reads) · Firestore · APIs · (Functions, retired)
- **studentCount maintenance moved into the request path** (trigger retired): `register` increments in its create
  batch; `account.claim-coaching` and `users.reassign-coaching` adjust ±1 transactionally (reassign now
  txn-wrapped, reads old+new before writing); `users.purge` (`_lib/user-lifecycle.js`) and `account.delete`
  decrement best-effort before deleting the user doc. Decrement fires only when `coachingId` is actually removed —
  suspend/archive keep it, matching live-`count()` semantics. Detail surfaces (Coaching-360) already use live
  `count()` as truth; the `(coachingId, plan)` index it needs already exists.
- **`syncCoachingStudentCount` neutralized** (`functions/index.js`) — early `return null` so it can never
  double-count if the project ever moves to Blaze.
- **`stats.lastActiveMs`/`lastActiveDate` initialized at register** so the coaching roster `orderBy('stats.
  lastActiveMs')` never silently drops a never-practiced joiner.
- **User-360 "recent duels"** repointed from the dead Duel-V1 `duels.where('participants.${uid}.status')` query to
  `users/{uid}/duelHistory` (the canonical Duel-V2 record), and surfaced in the Activity timeline.
- **Super-Admin Users list/detail** now resolves `coachingId → coaching name` (client-side, reusing the loaded
  `_coachings`) instead of showing the raw code; Profile tab shows the current coaching by name.
- Schema delta: `users.stats.{lastActiveMs,lastActiveDate}` now set at creation; `coachings.studentCount` writer
  contract changed (request-path, not trigger). No new fields, paths, or indexes.
- API delta: none (same endpoints/actions; internal write logic only).
- Security review: **no change** — affiliation writes stay own-scoped (`claim-coaching`) / admin-gated; reads
  unchanged; no rules touched.
- Cross-app compatibility: Student writes the count on join; Coaching App + Super-Admin read it (list) or derive
  it live (detail) — confirmed consistent with the live `count()` semantics.
- Version bumps: Firestore 2.12→2.13, Architecture 2.12→2.13, Bible 2.20→2.21.
- Migration: two one-time backfills (`firestore/diagnostics/backfill-student-counts.js`,
  `backfill-stats-lastactive.js`) — read-then-write, **owner-authorized prod runs**; the audit script
  (`affiliation-audit.js`) verifies `mismatch=FALSE` after.
- Verification: `node --check` on every touched JS; read-only `affiliation-audit.js` before/after trace; grep proof
  that no `participants.${uid}` reader remains and increment/decrement exists at each mutation site.

---

## 2026-06-13 — Duel V2: server-authoritative premium 1v1 speed challenge — full rebuild (ADR-031)

A 33-agent adversarial workflow + two red-team passes found **65 confirmed problems** in the client-trust duel
system (plaintext answer key in the room doc; 100% client-written score/winner; active-forever hang on timeout;
localStorage-only recovery; client-only premium; whole-`participants`-map write per answer; unsynchronised
countdowns; no Active-Duel card / history / share). Rebuilt from first principles to the owner's four binding
decisions, with **exit = finalized submission (no resume/rejoin)**: leaving an active duel grades what was
answered and locks the rest — not a forfeit (performance decides; an early submitter with more correct can win).

- **Server-authoritative scoring (the spine):** new Vercel `main-app/api/duel.js` (action-routed, Admin SDK,
  `withAuth`→`req.userPremium`) is the **only** writer of questions, the answer key, grading, the winner, `status`,
  and history. Clients never grade or decide. Answer key lives in a **server-only** `duels/{code}/private/key`
  subdoc (client read/write denied) → the plaintext-answer-key leak (B3) and winner/score forgery (B2/B13) are
  structurally closed.
- **Split documents, hidden-until-results:** `duels/{code}` carries prompts (text-only) + `presence` (state only,
  no score/progress); each player's answers live in `duels/{code}/players/{uid}` (own-uid only, opponent denied),
  so the per-answer hot path has **zero opponent snapshot fan-out** (B8/B16) and the opponent sees only
  Connected/Solving/Finished.
- **Speed-weighted, accuracy-dominant winner** (`duelScore = correctCount×1000 + speedBonus≤300`, server-measured
  time) — quitter/timeout can't win on speed (B10/B13); explainable in one line.
- **Recovery from the server:** `users.activeDuelId` mirror (cross-device, no index) drives a derived
  **Active-Duel home card** that restores only the **waiting/results** screen — never solving (B5/B6). Finalize is **one status-CAS transaction** (idempotent simultaneous-finish /
  re-finish) that writes winner+`perPlayer`+history (docId=duelId) + clears both mirrors, then sends the
  **"opponent finished" FCM** from the endpoint (Admin SDK).
- **Spark-correct infra:** the project is on **Spark**, so `functions/index.js`'s scheduled jobs/triggers don't
  run — the redesign touches **no Firebase functions**. Stuck/abandoned duels resolve via **lazy finalize-on-
  `?action=state`** (instant for whoever's waiting) + a **Vercel daily cron** backstop (`?action=cron-sweep`,
  `CRON_SECRET`). `totalDeadline` is always set (bounds stalling); the countdown is anchored to server `startedAt`
  with a server-time offset (B9).
- **Rules rewrite (`/duels`):** participants-only read (removes the world-readable waiting-room answer-harvest
  path, B4); client update allowed **only** for own `presence.{uid}.{state,lastSeenAt}` while `status==active`
  (hand-written two-level nested diff); create/delete/private/winner/status client-denied; an explicit
  `duelHistory` write-deny **overrides** the blanket `users/{uid}/{sub}` owner-write grant. Premium enforced at
  the endpoint via `aiService.resolvePlan` (works for coaching-granted premium — no custom claim, no lockout).
- **Release scope — Word Problems staged as "Coming Soon":** the (feature-complete-ish) Word Problems mode is
  held back from this release but **kept visible** as an intentionally-staged upcoming premium feature. A shared
  `js/ui/coming-soon.js` modal opens on tap and triggers **nothing else** (no session, question generation,
  navigation, analytics, or backend call). Applied in two places: the Practice mode card (`mode-card-soon` +
  "Coming soon" pill, intercepted before the practice-action gate) and the Duel **create** flow's new "Question
  type" selector (Quick Math selectable; Word Problems shows a "Soon" tag and is not selectable). The duel backend
  still supports `questionMode:'wordproblems'`, but the create UI only ever sends `quick`.
- **Docs:** ADR-031; FIRESTORE_BLUEPRINT (`duels/{code}` v2 shape, `private/key`, `players/{uid}`,
  `users.activeDuelId`, `duelHistory`, `participantUids` index); SECURITY (rules table + carve-out); VERSIONS
  (Bible 2.19→2.20, Arch/Firestore/Security MINOR) + ephemeral hard-cutover migration note. **No data migration**
  (`schemaVersion:2`). One new Vercel function (7/12).

## 2026-06-13 — Coaching App V4: value / premium-UI / performance pass (ADR-030)

A brutally-honest product review found the rebuilt coaching app *feels empty, low-information, and slow* — the
root cause being **discarded backend data** + the never-actually-applied ADR-029 field masks, not over-minimalism.
Scope = Phase 1+2 (surface what exists, premium UI, fix the slowness); growth features deferred to Phase 3.

- **PERF — real field masks (the missing ADR-029 fix):** added Firestore `.select()` to the heavy coaching scans
  — `coaching/students.js` `_handleList` (drops the 200-element `responseTimes` ring + 90-key `dailyHistory` map
  from the list payload, the Students-screen slowness), `coaching/dashboard.js` + `coaching/insights.js`
  (the two unmasked per-render scans). Super-admin `system.js` Command Center `_loadData` 4 sequential awaits →
  `Promise.allSettled`; `ai.js` `_usage` double scan parallelized + masked; `system.js` global search `.select()`.
- **VALUE — stop discarding fetched data:** Dashboard (Snapshot · Momentum · Action Required · Coaching Wins),
  Students roster (triage row: speed + `streak` + `weakTopic` + attention dot), Performance, and Engagement now
  render data already on the response path but previously dropped (`strongestStudents`, `recentActivity`,
  `activeStreakUsers`, `totalQuestionsSolved`, `streak`, `weakTopic`); vanity demoted; honest available-today
  signal (WoW accuracy/participation) promoted out of the "collecting" states.
- **Session Improvement (honest day-one speed proof):** `main-app/js/drill-engine.js`#finish + `progress.js`
  compute first-half vs last-half session speed from the existing `perQuestionTimes` (≥6 timed Qs) → per-session
  `practiceSessions.{firstHalfAvg,secondHalfAvg,sessionImprovementPct,timedCount}` + a rolling
  `users.stats.avgSessionImprovementPct` (read cheaply off the coaching user scan). Labeled strictly "Session
  Improvement"; never mixed with the 7/30-day calendar trend; becomes secondary once `dailyHistory` matures.
- **Onboarding trust:** `main-app/js/app.js` join shows "✓ Connected to <Coaching Name>" (+ count + logo);
  new optional `coachings.logoUrl` set in super-admin (`api/admin/coachings.js` + `js/views/coachings.js`),
  returned by `validate-coaching.js`, rendered where present. Coaching code one-tap copyable in Settings.
- **Minimal coaching notes:** one plain-text note per student at `coachings/{id}/notes/{studentUid}`, written via
  a new `students?action=save-note` branch + read on `students?action=details` (both Admin SDK — **no new
  function**, coaching stays 5/12); client read/write denied by an explicit rule.
- **Premium UI + a11y:** content emoji → the inline-SVG icon set; activated the unused `.metric-card.accent-*`
  bar; one stronger heading tier; uniform empty/collecting/error taxonomy + `.toast.info`; layout-matched
  skeletons; global `@media (prefers-reduced-motion)` + `:focus-visible`; fixed the ARIA tab pattern. **No** dead
  UI (no dark-mode toggle, no notification prefs).
- **Docs:** ADR-030; FIRESTORE_BLUEPRINT (session fields, `logoUrl`, `notes` subcollection), SECURITY (notes
  deny), `firestore.rules` (explicit `notes` deny), VERSIONS (Bible 2.18→2.19, Arch 2.10→2.11, Firestore
  2.10→2.11, Security 2.8→2.9) + migration note, TECHNICAL_BIBLE §10B (coaching design-system additions).

## 2026-06-13 — Coaching ecosystem audit remediation (ADR-029)

Fixed the production-readiness audit's findings (1 critical, 10 high, the actionable mediums/lows). Across the
student / coaching / super-admin apps + Firebase.

- **CRITICAL — offboarding now cuts the owner:** super-admin `coachings.js` suspend/delete drops the owner's
  `coaching_admin` claim + `revokeRefreshTokens` (delete also disables Auth); activate restores it. Coaching
  `withCoachingAuth` verifies with `checkRevoked=true` + a cached `coachings/{id}.status` gate
  (`COACHING_INACTIVE`). [SECURITY §4.0A]
- **HIGH — register hardening:** per-IP rate limit on the pre-auth `coaching auth?action=register`; one-time
  token is now `crypto.randomBytes(15)` (~120 bits), not `Math.random()`.
- **HIGH — speed integrity:** Skip records `null` (not `0`) response-time (`drill-engine.js`) so a skip is no
  longer a 0-second solve deflating the coaching avg speed.
- **HIGH — `lastActiveMs`:** new sortable epoch field (`progress.js`) replaces the non-sortable `toDateString`
  in every order/range query — coaching roster order+cursor (`students.js`) and the super-admin inactive
  sweep/list/export (`sweep.js`, `users.js`), which previously **never matched** so no one was ever flagged
  inactive. Index `users(coachingId, stats.lastActiveMs DESC)`; backfill migration; ROADMAP DEBT-3 resolved.
- **HIGH — scale:** `dashboard.js`/`insights.js`/`notices.js` roster scans bounded to 5000 (+`rosterTruncated`
  flag); `writeCoachingRollups` parallelized (bounded concurrency of 10).
- **MED — correctness:** trial users no longer double-counted as premium (rollup + dashboard = paid-only);
  offboarded (`accountStatus!=='active'`) students excluded from coaching counts/lists/aggregates; notices
  report **true in-app reach** (`reached`), not just FCM push successes; zero-match send shows "no students
  matched" instead of a false "Sent."; Smart-Nudge chips actually target `inactive`/`lowstreak` (server filters).
- **MED/LOW — UX:** join screen shows **"Joined: <Coaching Name>" + student count** (+ suspended/deleted
  messaging) — `validate-coaching` already returned the name (`app.js` was discarding it); `.badge-draft` CSS
  (trial badge was invisible); settings/profile/notices error+retry states; dashboard participation Δ (Q5),
  weak-topics empty state, "showing N of M" at-risk, speed-hero+weak-topic keyboard handlers + cursor
  affordance; students search caret no longer jumps to end.
- **Bible:** DECISION_LOG (ADR-029), SECURITY (§4.0A, 2.8), FIRESTORE_BLUEPRINT (`lastActiveMs` + index, 2.10),
  ROADMAP (DEBT-3 done), VERSIONS (Bible 2.18 + row + migration note), this entry. **Deploy:** `firebase deploy
  --only firestore:indexes,firestore:rules` + run `2026-06-13-add-lastActiveMs.js --apply`. **Verified:**
  `node --check` all touched JS (3 apps); CSS balanced; coaching 5/12 functions.

---

## 2026-06-13 — Coaching App V3: mobile-first "Speed Training Control Center" (Phase 1+2, ADR-028)

Rebuilds `coaching-admin-app` around the speed mission (depends on the ADR-027 foundation). **Mobile-first**
(bottom-nav kept + restyled — NOT tabletized), de-gamered calm dark theme, pinch-zoom re-enabled.

- **IA → 5 bottom-nav tabs:** Dashboard · Students · Performance · Engagement · Settings (the brief's "Growth"
  folds into Performance). `index.html` + `app.js` router remapped; `html2canvas` dropped.
- **Speed is the headline** everywhere; **honesty rule** enforced — every history-dependent metric (speed
  trend, Coaching Improvement Score, top improvers, conversion/retention) renders `CoachingUtils.collectingCard`
  ("collecting data — live in N days"), never a fabricated number. Participation/accuracy trends + current avg
  speed are real from day one.
- **Views:** Dashboard (speed hero + at-risk queue + weak topics + premium), Students (roster → full-screen
  Student-360 with a REAL speed curve from dated `dailyHistory`), Performance (new), Engagement (new — replaces
  Notices: Quick Broadcast / Smart Nudges + Achievements / Recent-20), Settings (new — replaces More).
- **Fixes:** broken `app.navigate` intervention arm → `CoachingApp.navigateTo`; signup contract drift
  (`coachingId` → `registrationToken`); vanity removed (Consistency Score, duel W/L, `window.print` report,
  Instagram export, podium); `insights` trimmed to real accuracy+participation trends (dropped the
  last-200-question heuristic + always-zero `avgPracticeTime` + dashboard dups); `notices` drops the dead
  scheduling subsystem + adds audience `segment`; `students` details drops duels/`speedTrend`. Coaching
  functions **6 → 5** (`leaderboard.js` deleted); retired views deleted; SW cache `v1 → v2`.
- **Adversarial review pass (15 agents, 11/11 confirmed findings fixed):** roster keyset-pagination cursor now
  uses the raw indexed `lastActiveDate` (ISO cursor sorted below all rows → empty page 2 / silent 50-cap);
  `nextCursor` gated on `hasMore`; dashboard "Need attention" shows the true `inactiveCount` (was capped at 10);
  profile "Topics needing attention" relabels to "Topic performance" when none are weak; profile/perf
  "collecting" countdowns keyed to real speed-days; Engagement chip audience honored; `coachingMetrics` cache
  keys added to store defaults/reset/invalidateAll; dead `performanceCache`/`leaderboardCache` keys removed.
  Tracked debt: `stats.lastActiveDate` is a non-sortable `toDateString` (ROADMAP DEBT-3 — mitigated, proper fix
  needs a migration).
- **Bible:** DECISION_LOG (ADR-028), VERSIONS (row), ROADMAP (DEBT-3), this entry. **Verified:** `node --check`
  all JS; CSS balanced (327); zero `app.navigate`/`getConsistencyScore`/`getLeaderboard`/slice-heuristic; 5/12
  functions.

---

## 2026-06-13 — Coaching App V3: Analytics Foundation (Phase 0, ADR-027) — Bible-first

Foundational analytics milestone: establish the first **real dated speed history** so the Coaching App's
"are students getting faster?" promise can be answered truthfully (never fabricated). **Docs land before
code** per [GOVERNANCE.md](GOVERNANCE.md); the schema/instrumentation code follows in the same phase.

- **Schema (FIRESTORE_BLUEPRINT §2, §3, §4):**
  - `users.stats.dailyHistory[date]` widened `{attempted, correct}` → **`{attempted, correct, sumTimes, count}`**
    (per-day avg speed = `sumTimes/count`). Additive + backward-compatible (readers default new keys to 0);
    existing 90-day prune keeps it bounded. Written by `main-app/js/progress.js#recordAnswer`.
  - `practiceSessions/{auto}` documented as **now actually populated** (the exported-but-uncalled
    `firestore-sync.savePracticeSession()` is wired into the drill/timed-test completion flow).
  - New **`coachingMetrics/{coachingId}`** per-coaching daily rollup (date-keyed, 90-day cap) — written by the
    existing super-admin daily cron (zero new coaching functions); read O(1) by the coaching app instead of a
    3× unbounded roster scan.
  - 3 composite indexes: `users(coachingId, plan)`, `(coachingId, isTrial)`, `(coachingId, createdAt)`.
- **Security (SECURITY_ARCHITECTURE §3 rules table):** a coaching admin may read **only its own**
  `coachingMetrics/{coachingId}` (claim match); client writes denied (Admin-SDK/cron only).
- **Honesty contract:** no backfill, no synthetic trends — day rows accrue from 2026-06-13 forward;
  history-dependent UI shows a "collecting data — live in N days" state until ≥7/≥30 days exist.
- **Bible:** FIRESTORE_BLUEPRINT (Doc 1.6, Firestore 2.9), SECURITY_ARCHITECTURE (Security 2.7),
  DECISION_LOG (ADR-027 foundation + ADR-028 Coaching V3 redesign), ROADMAP (Historical Analytics Foundation
  milestone), VERSIONS (Bible 2.17 / Arch 2.10 / Firestore 2.9 / Security 2.7 + history row + migration note),
  this entry. **Deploy:** `firebase deploy --only firestore:indexes,firestore:rules` (3 new composites build
  async; new `coachingMetrics` read rule).

---

## 2026-06-12 — Super Admin accessibility + governance enforcement — Pass 3 (ADR-026)

Final pass of the ADR-024 refinement program. An adversarial multi-agent UX / visual / a11y / navigation /
design-system audit surfaced 35 candidates; **18 were confirmed** and fixed. Pure client (JS/CSS/HTML) + Bible
— **zero new functions** (super-admin 8/12), no schema/security/payment change.

- **Keyboard operability (WCAG 2.1.1):**
  - `.sv-row` in User-360 (`js/views/users.js`) and Coaching-360 (`js/views/coachings.js`) → `role="button"`,
    `tabindex="0"`, `aria-label`, and a shared click + Enter/Space `keydown` handler.
  - Content drop-zone (`js/views/questions.js`) → `role="button"`, `tabindex="0"`, descriptive `aria-label`,
    Enter/Space opens the file picker.
  - Global-Search results (`js/app.js`) → `role="option"`, `tabindex="0"`, `aria-label`; navigation moved off
    inline `onclick` to a delegated click + keydown handler.
- **Names / roles / state (4.1.2):** filter inputs in Users/Coachings/AI + the bulk select checkboxes get
  `aria-label`s; the Global-Search overlay (`index.html`) becomes a labelled `role="dialog"` with a
  `role="listbox"` results region and an `aria-label`led `type="search"` input; the active nav item gets
  `aria-current="page"` (`app.js` router). `modal.js` now sets `title.id = 'modalTitle'` so the dialog's
  `aria-labelledby` resolves (was dangling).
- **Tabs WAI-ARIA pattern (`js/ui/tabs.js`):** rebuilt to per-mount unique ids, `role=tablist/tab/tabpanel`,
  `aria-selected`/`aria-controls`/`aria-labelledby`, roving `tabindex`, Arrow/Home/End keyboard nav.
- **Status messages (4.1.3):** `#toastContainer` is `role="status" aria-live="polite"` (`index.html`); error
  toasts add `role="alert"` (`js/ui/toast.js`).
- **Operator-friendly errors:** remaining raw `e.message` sites now route through `AdminUtils.getReadableError`
  — `questions.js` (×6: batch import, load, generate, archive, delete, save), `command-center.js` (×4: ack
  alert, cleanup duels, aggregate metrics, emergency toggle), `app.js` Global Search. The Content table renders
  in **card mode** on narrow panes (`Table.build(columns, questions, _rowActions, { cards: true })`) instead of
  forcing a horizontal scroll, and its empty state uses `AdminUtils.emptyState`.
- **Design-system enforcement:** the triplicated per-view `_tile()` (command-center / revenue / ai) collapses to
  one owner `AdminUtils.statTile(label,value,sub,colorVar)` (backed by `.stat-num`/`.stat-cap`/`.stat-sub`);
  prominent empty lists migrate to `AdminUtils.emptyState`. **Latent bug fixed:** the self-referential
  `--accent-glow: var(--accent-glow)` / `--accent-ring: var(--accent-ring)` token definitions (introduced by a
  Pass-1b global value-sweep, broke focus rings/accent glows in **light** mode only) restored to real values; a
  global `:focus-visible` ring + density `.card` rules added.
- **Bible:** DECISION_LOG (ADR-026), TECHNICAL_BIBLE §10B (accessibility contract + Tabs/empty-state/statTile
  primitives; Doc Version 1.6), VERSIONS (Bible 2.15→**2.16** + row), this entry.
- **Verification:** `node --check` all JS (pass); CSS braces balanced (260/260); **zero** hardcoded hex/rgba
  color literals in any view (grep-proven); no self-referential token definitions; function count 8/12.

---

## 2026-06-12 — Super Admin Settings Center + Operations enhancements — Pass 2 (ADR-025)

- **New 8th domain — Settings** (`js/views/settings.js`, `view-settings`, gear nav, routed in `app.js`):
  Account (email/uid/role; change password via reauth+`updatePassword`; change email via
  reauth+`verifyBeforeUpdateEmail`; recent admin sign-ins) · Security (24h failed-login/suspicious counts +
  posture + events; **log out everywhere**) · Appearance (theme, reuses `window.AdminTheme`) · Preferences
  (default landing page, table density, animations, date format, timezone — device-local) · Platform
  (version/env/Firestore project/function count/collection sizes) · Backup (authenticated CSV exports).
- **API delta (ZERO new functions — super-admin 8/12):** `system?action=revoke-tokens` (POST) revokes the
  calling admin's own refresh tokens (`req.userId` only; audited `revoke_own_sessions`). Client `revokeMyTokens`.
- **Preference plumbing:** `app.js` honors `qrAdminLanding` (default landing) + applies `qrAdminDensity`/
  `qrAdminAnims` body classes on boot + exposes `window.AdminTheme`; `AdminUtils.formatDate`/`formatDateTime`
  honor `qrAdminDateFmt` + `qrAdminTz`; CSS adds `.settings-*`, `.seg`, `body.density-*`, `body.no-anim`.
- **Operations enhancement:** the Diagnostics health grid now shows 6 subsystems and reflects the live
  emergency state — an enabled AI/payment kill switch downgrades that subsystem tile to red "disabled".
- **Bible:** DECISION_LOG (ADR-025), TECHNICAL_BIBLE §3 (settings domain + `revoke-tokens`), VERSIONS
  (Bible 2.15 / Arch 2.9 / Security 2.6 + row), this entry. No schema/Firestore change.
- **Verification:** `node --check` all touched JS (pass); CSS balance (254); settings fully wired
  (container/nav/script/DOMAINS/global); function count 8/12; zero hardcoded colors in settings.js. SW v10→v11.

---

## 2026-06-12 — Super Admin thorough dark mode — Pass 1b (ADR-024)

100% design-system-driven theming. The entire stylesheet **and** every view were re-tokenized onto a
semantic theme-token system; an intentionally-designed dark palette flips via `[data-theme="dark"]`.
**No hardcoded UI color literals remain** in the stylesheet component rules, the views, `app.js`, or
`index.html` (verified by grep — the only `#` left are the `<meta theme-color>` hint and the `&#039;`
entity).

- **New token structure (`css/admin-style.css` `:root`):** surfaces (`--bg-app`/`--bg-surface`/
  `--bg-surface-2`/`--bg-inset`), text (`--text-strong`/`--text`/`--text-mid`/`--text-muted`/`--text-faint`/
  `--on-accent`), lines (`--border-color`/`--border-strong`), accent (`--accent-primary`/`-hover`/`-bright`/
  `-soft`/`--accent-ai`), neutral button (`--btn-bg`), full **state ramps** danger/success/warning each as
  `*-primary`/`*-bg`/`*-fg`/`*-border` (+ `--premium-*`, `--neutral-*`), `--overlay`, and theme-independent
  `--toast-*`. Legacy names (`--bg-primary`/`--text-primary`/…) are aliased to the canonical tokens so old
  rules follow automatically. Radius/shadow/motion tokens retained.
- **Dark palette (`:root[data-theme="dark"]`):** deep-slate surfaces (`#0b1220`→`#1d2940`), AA-contrast text
  (`#f1f5f9`/`#e2e8f0`/`#94a3b8`), brighter accent (`#3b82f6`), and muted-but-legible state ramps (e.g.
  `--success-fg #6ee7b7` on `--success-bg #0f2a22`). Designed, not auto-inverted.
- **Colors removed (every category now themed):** body/cards/sidebar/login surfaces; all text shades; borders;
  buttons (neutral/accent/danger/outline); badges (premium/free/active/draft/archived); tables; modals +
  inputs/selects; toasts; empty/loading states; chips/pills; the Command-Center alert severities + all-clear +
  emergency panel + toggle slider; stat-tile numbers; progress bars; status dots; warning/success banners;
  the global-search overlay + results. View inline `#hex` → `var(--token)` across all 7 views + app.js
  (73 + 9 literals); stylesheet literals → tokens via declaration-scoped sweeps + targeted edits.
- **Theme application:** a no-FOUC inline boot script in `index.html` resolves + sets `data-theme` **before**
  the stylesheet paints; `js/app.js#_bindTheme` wires a footer **light → dark → system** toggle, persists to
  `qrAdminTheme` (the established `qrAdmin*` pattern), and live-updates on OS-preference change in system mode.
  `color-scheme` is set per theme for native controls/scrollbars.
- **Screens verified (both themes, reasoned contrast — live auth-gated app not runnable here):** Command
  Center, User-360, Coaching-360, AI Cost Center, Revenue Center, Operations, Content, login, modals, toasts,
  empty/loading/error, collapsed + expanded rail. Adversarial review workflow run for AA-contrast + semantic-
  mapping + missed-color + regression checks.
- **Remaining limitations:** the `<meta name="theme-color">` browser-chrome hint stays light (cosmetic, not UI
  content); the `modal-select` dropdown-arrow data-uri keeps a fixed muted stroke (legible in both themes).
- **Infra:** CSS/JS/HTML only; zero new functions; no schema/security/payment change.
- **Adversarial AA-contrast review → 15 confirmed findings, all fixed:** retuned light `--text-muted #5e6e82`
  / `--text-faint #566275` and dark `--text-faint #8a96a9` (were below 4.5:1 on their surfaces); introduced a
  dedicated `--accent-solid`/`-2` for white-on-blue fills (`.btn.accent`, `.chip.active`, logos — dark
  `#3b82f6` only gave 3.68:1 with white); darkened `--toast-success #047857`; tokenized the last hardcoded
  surfaces/overlays that survived the sweep (`.login-card`, `.mobile-header` → `--bg-surface`;
  `.sidebar-overlay`/`.modal-overlay` → `--overlay` — these were white/slate-pinned in dark); added
  `--accent-glow`/`--accent-ring` (focus rings + brand glows now track the accent per theme); dark dropdown-arrow
  override; pointed `.btn` at `--btn-fg`; recolored per-consumer/per-coaching AI spend from danger-red to the
  cost token (`--accent-ai`). Every fix re-verified by independent WCAG computation.
- **Verification:** `node --check` all touched JS (pass); CSS brace balance (238); grep proves zero hardcoded
  UI colors in views/app/index; all 57 referenced tokens defined; theme toggle + persistence wired; function
  counts unchanged (8/12, 6/12). Bible: ADR-024 (1b shipped), TECHNICAL_BIBLE §10B (theme tokens), VERSIONS 2.14.

---

## 2026-06-12 — Super Admin stability + UX polish — Pass 1a (ADR-024)

- **Requested change:** a dedicated stability/UX/tablet refinement pass, delivered in 3 controlled phases.
  Pass 1a (this commit) = the two CRITICAL bugs + error/loading/empty states + tablet touch targets + the
  render/query/performance fixes. Pass 1b (next) = the thorough 100% dark mode. (Passes 2–3 follow.)
- **Bug #1 — "Too many requests" on user delete (root-caused, not patched):** cumulative rate-limit
  exhaustion, not a loop. Fixes: `api/_lib/middleware.js` admin limit **30→300/hr**; `js/services/api.js`
  `_fetch` gains a **single bounded retry** on 429/5xx (carries `.status`/`.code`); `js/utils.js`
  `getReadableError` maps `RATE_LIMIT_EXCEEDED`/5xx/network to operator-friendly copy. `js/views/users.js`:
  **delete is now instant + zero-fetch** (drop the in-memory row + clear detail, no getUsers) and every status
  mutation does **one** detail refresh that locally syncs the master row (**2 calls → 1**); same in
  `js/views/coachings.js`. Net: delete 2→0 reads, each mutation 2→1.
- **Bug #2 — collapsed sidebar logout:** `index.html` logout is now an icon+label row; `admin-style.css` adds
  `body.rail-collapsed .sidebar-footer`/`#logoutBtn` rules → a centered 48px icon button that never clips or
  overflows the 72px rail.
- **Tablet touch targets:** primary controls (`.btn`/`.nav-item`/`.tab-btn`) → ≥48px; dense controls
  (`.btn-sm`/`.chip`/`.modal-close`/`.action-btn`/`.sv-row .uCheck`) → ≥44/40px.
- **Empty/loading states:** polished `.empty-state` (icon+title+text+CTA) + `AdminUtils.emptyState()` helper;
  `.loading` now shows a spinner.
- **Performance/leak audit:** confirmed no `setInterval`/`onSnapshot` leaks (only a one-shot `setTimeout` in
  questions.js); the read reductions above are the perf win.
- **Infra:** ZERO new functions (super-admin 8/12, main-app 6/12); no schema/security/payment change.
- **Bible:** DECISION_LOG (ADR-024, 3-pass program), VERSIONS (Bible 2.13 / Arch 2.8 + row), this entry.
- **Verification:** `node --check` all touched JS (pass); CSS brace balance (236); logout markup confirmed.
  **Deferred to Pass 1b:** the full dark-mode token system + view color refactor + both-theme contrast report.

---

## 2026-06-12 — Production-hardening audit remediation (ADR-023)

- **Requested change:** a zero-compromise, from-source audit of the Super Admin app (the highest-authority
  system) — find every security/scalability/governance defect before production. The audit found 1 CRITICAL +
  7 HIGH + 5 MEDIUM/LOW; this entry is the remediation.
- **CRITICAL — admin credential leak (C1):** `js/firebase/auth.js` hardcoded the admin email
  (`quantreflex@gmail.com`) AND password (`pass@iON2203`) and signed in with them, so the real Firebase
  password of the `admin:true` account shipped in public client JS → anyone could obtain a claim-bearing admin
  token (`withAdminAuth` could not defend against it). **Fixed:** removed all client-side credential/email
  checks; `login()` uses the typed password; admin authority is the server `admin:true` claim only.
  **Operational follow-up (NOT code):** rotate the Firebase password + enable MFA.
- **HIGH — bounded every unbounded scan (no more OOM/timeout at scale):** AI usage (`ai.js` — capped the
  `users` + `usage/ai` full scans to 5000, `truncated` flag + UI banner); `ai-usage` CSV export (`system.js` —
  added `.limit(10000)`); daily `payments` snapshot (`metrics.js` — 50k cap + `revenueTruncated`);
  `duels-cleanup` (`system.js` — `.limit(500)` so the single delete batch is within Firestore's 500-write
  limit, `more` flag); premium broadcast (`notifications.js` — server-side `plan` filter via the new
  `(plan,fcmToken)` index + 10k cap, removed the dead no-op segment branch + in-memory filter); coaching
  suspend/delete cascade (`coachings.js` — paginated revoke in pages of 400, resumable).
- **Accuracy (H4/M3):** active premium = `count(plan=='premium')` − `count(plan=='premium' && planExpiry<now)`
  via `count()` aggregations on the new `(plan,planExpiry)` index — dashboard now excludes expired-unswept
  premium (new `expiredPremium` figure); alerts/security/revenue-intel expiry checks converted from
  `.limit(1000)` in-memory scans to accurate `count()` (incl. `expiring7d/30d` range counts).
- **MEDIUM/LOW:** `coachings?action=list` capped at 1000; export responses carry a `truncated` flag (toasts in
  Operations + Revenue); `.btn-sm` + `.modal-close` raised to ≥40px tablet touch targets. (CORS `*` left as-is
  with Bearer auth — documented LOW; `duelInvitations` explicit deny kept intentionally over the catch-all.)
- **Schema/indexes:** NEW additive `metrics.{expiredPremium via dashboard, revenueTruncated}`,
  `usage/ai.gptThrottle*` (pre-existing); **two new composite indexes** `users (plan,planExpiry)` +
  `users (plan,fcmToken)` in `firestore/indexes/firestore.indexes.json`.
- **API delta:** ZERO new functions — super-admin **8/12**, main-app **6/12** unchanged.
- **Bible docs:** DECISION_LOG (ADR-023), SECURITY_ARCHITECTURE (§5.2 credential-free admin auth),
  FIRESTORE_BLUEPRINT (2 indexes), VERSIONS (Bible 2.12 / Firestore 2.8 / Security 2.5 + history row), ROADMAP
  (AI-cost pre-aggregation follow-up), this CHANGELOG.
- **Verification:** `node --check` all touched JS (pass); indexes JSON valid (15); CSS balanced (227); no
  credential strings remain; function counts unchanged. **Deploy:** `firebase deploy --only
  firestore:rules,firestore:indexes` (the two new composites build async). **Tracked follow-up:** durable
  per-user/per-coaching AI-cost pre-aggregation (replaces the 5000-cap) + day-bucketed revenue counter.

---

## 2026-06-12 — Super Admin V2: entity-centric 360 consolidation (ADR-022) — full Center migration + final cutover

- **Requested change:** Proceed straight through all five Centers; complete the entire migration; then a mandatory
  final consolidation pass removing every obsolete screen, drawer, duplicate table/action, and transitional
  component. *Goal: a governance-first command platform, not a hybrid old/new admin.*
- **Impacted systems:** Admin (all 5 Centers rebuilt as first-class views) · APIs (new read branches) · main-app
  (AI throttle enforcement) · Firestore (additive counters).
- **Centers shipped (all SplitView/Tabs, tablet-first):**
  - **User-360** (`js/views/users.js`) — flat filterable master (status chips) + Profile|Entitlement|Lifecycle|AI|
    Activity|Payments|Audit; Inactive is a chip + bulk-bar; sole owner of per-user entitlement/lifecycle/throttle/
    coaching-reassign. Replaces the grouped list + overlay drawer.
  - **Coaching-360** (`js/views/coachings.js`) — master + Overview|Students|Allocation|AI|Activity|Settings; **sole**
    coaching create/manage owner (token rotate, suspend/activate/delete).
  - **AI Cost Center** (`js/views/ai.js`) — Overview|By User|By Coaching|Abuse; inline throttle; AI-kill state shown
    read-only (link to Command Center). By-coaching/feature/top-consumer aggregations derived client-side.
  - **Revenue Center** (NEW `js/views/revenue.js`, `RevenueCenter`) — Overview|Subscriptions|Trends|Grants; wires
    `revenue-intel` (now incl. `conversionRate`/`failedGrants`/`growth`/`trialUsers`); revenue CSV export.
  - **Operations Center** (`js/views/operations.js`) — first-class Diagnostics|Security|Firestore|Campaigns|Exports|
    Cleanup|Audit panels (no more strangler wrappers); campaigns = broadcast + history.
- **API delta (ZERO new functions — super-admin 8/12, main-app 6/12):** coachings +`activity`; notifications
  +`history` (GET, alongside broadcast POST); system `revenue-intel` extended. main-app `api/ai.js` now calls
  `aiService.enforceAiThrottle` (per-user daily AI cap; transactional `usage/ai.gptThrottleDate|gptThrottleCount`).
- **Final consolidation (cutover):** DELETED legacy view files `js/views/{payments,inactive,system,security,
  firestore-ops,exports,notifications}.js`; REMOVED the `#userDrawer*` overlay DOM + their `<script>` tags from
  `index.html`; repointed the `revenue` domain in `app.js` (`view-payments`/`PaymentsView` → `view-revenue`/
  `RevenueCenter`). The corresponding `api/admin/*` handlers are retained (data sources for the Centers).
- **CSS:** added `.chip/.chip-bar/.sv-row/.bulk-bar` (entity-360 master list) to `admin-style.css`.
- **Bible docs updated:** DECISION_LOG (ADR-022 reconciled to as-built), TECHNICAL_BIBLE (§3 action inventory +
  §3.1 zero-function note), FIRESTORE_BLUEPRINT (`usage/ai.gptThrottle*`), GOVERNANCE (one-owner map + Emergency
  single-write-owner + throttle), VERSIONS (2.11 row amended), CHANGELOG (this entry), ROADMAP.
- **Audits (final pass):** render (every domain mounts its Center; no dangling `view-payments`/`*View`/`UserDrawer`
  refs), tablet UX (SplitView master/detail + Tabs + card-mode; no overlay drawer), governance (one owner per
  capability; Emergency single write-owner), Vercel-Free deployment (function counts unchanged: super-admin **8/12**,
  main-app **6/12**).
- **Post-audit fixes (5-dimension adversarial workflow; 3 confirmed of 23 raw):** (1) **§10B server confirm-guard** —
  `coachings?action=mutate` now requires `confirm:'DELETE'` for `suspend`/`delete` (both cascade-revoke premium from
  every student), returning 400 `CONFIRM_REQUIRED` otherwise — mirrors the users.js purge guard; (2) **type-`DELETE`
  UI gate** — Coaching-360 Settings replaces the one-click suspend/delete with a type-`DELETE` double-confirm (activate
  stays one-click, non-destructive); (3) **touch target** — the Inactive bulk checkbox (`.sv-row .uCheck`) sized to
  22px (was the ~13px native default, below the tablet floor). Stale `sw.js` precache list realigned to the V2 script
  set (cache v8→v9; deleted view files removed).
- **Verification:** `node --check` on all changed/created JS files (pass); function-count enumeration (super-admin
  **8/12**, main-app **6/12**); reference sweep for deleted views (clean); CSS brace balance (226/226). **Migration:** none.

---

## 2026-06-12 — Super Admin V2: entity-centric 360 consolidation (ADR-022) — backend foundation + shared resolver

- **Requested change:** Freeze features; consolidate ALL admin workflows into entity-centric 360 views (User-360,
  Coaching-360, AI Cost Center, Revenue Center, Operations Center); remove duplicate pages/metrics/filters/actions;
  tablet-first + minimum-click governance.
- **Impacted systems:** Admin (UI + IA) · APIs (new read/write branches) · Firestore (additive field).
- **Bible docs updated (FIRST):** DECISION_LOG (ADR-022), FIRESTORE_BLUEPRINT (`users.aiThrottle`; Firestore 2.7),
  VERSIONS (Bible 2.11 / Arch 2.7 / Firestore 2.7 + history row).
- **Schema delta:** NEW additive `users.aiThrottle {cap,setBy,setAt}` (per-user AI cap). No new index/migration.
- **API delta (ZERO new functions — super-admin stays 8/12):** new `?action=` branches on existing handlers —
  users +`payment-history`/`activity-timeline`/`admin-history`/`throttle`/`pending-purge-list`; coachings +`details`/
  `students`/`reset-token`; (ai/system/notifications branches land with their Centers). UI groundwork: a shared
  client-side entitlement-state resolver (`AdminUtils.entitlementState`) replacing the 4× duplicated logic + matching
  `api.js` client methods. The 5 Center UIs (User-360 → Coaching-360 → AI Cost Center → Revenue Center → Operations
  Center) and the removals (overlay drawer, grouped Users list, standalone Payments/Inactive/Security/Firestore-ops/
  Exports/Notifications views) land in focused follow-up commits.
- **Security review:** all new actions `withAdminAuth`; mutations (throttle/lifecycle/entitlement) audited; no
  auth-boundary change.
- **Version bumps:** Architecture 2.6→2.7, Firestore 2.6→2.7, Bible 2.10→2.11 (additive/MINOR).
- **Migration:** none. **Verification:** `node --check`; function counts (super 8 / main 6); render smoke;
  adversarial review.
- Remaining Centers (Coaching-360, AI Cost Center, Revenue Center, Operations Center) + main-app throttle
  enforcement land in follow-up commits. See [DECISION_LOG.md](DECISION_LOG.md) ADR-022.

---

## 2026-06-12 — Email normalization: `users.emailLower` + case-insensitive Global Search (ADR-020 update)

- **Requested change:** Normalize email before the user base grows — add `emailLower` to every user doc,
  backfill existing records, write all future emails normalized, and migrate Global Search to query `emailLower`.
- **Impacted systems:** Firestore schema · main-app (register write-path) · Admin (Global Search).
- **Bible docs updated (FIRST):** FIRESTORE_BLUEPRINT (`users.emailLower` field; Firestore Version 2.6),
  DECISION_LOG (ADR-020 update — search queries `emailLower`, case-insensitive), VERSIONS (Bible 2.10 / Firestore
  2.6 + history row + migration note).
- **Schema delta:** NEW `users.emailLower` (lowercased `email`). Single-field auto-index covers the prefix query
  (no new composite). **Backfill migration** `firestore/migrations/2026-06-12-add-emailLower.js`.
- **API delta:** none (no new function). `main-app/api/auth/register.js` now writes `emailLower` on the root user
  doc. `super-admin system?action=search` email sub-query now does `orderBy('emailLower')` with a lowercased
  prefix → **case-insensitive email search**; uid / name / coachingId unchanged.
- **Security review:** `emailLower` is non-sensitive (derived from `email`, both admin-written at register; root
  `email`/`emailLower` are not client-mutated). No rules change. Search stays `withAdminAuth`.
- **Version bumps:** Firestore 2.5→2.6, Bible 2.9→2.10 (additive/MINOR). Others unchanged.
- **Migration:** run `firestore/migrations/2026-06-12-add-emailLower.js` (dry-run → `--apply`). Idempotent.
- **Verification:** `node --check`; function counts unchanged (super 8 / main 6); search returns case-insensitive
  email matches after backfill.
- See [DECISION_LOG.md](DECISION_LOG.md) ADR-020.

---

## 2026-06-12 — Super Admin V2: tablet-first governance rebuild — foundation + Command Center (ADR-019/020/021)

- **Requested change:** Redesign super-admin into a tablet-first governance operating system (11" Android tablet,
  Chrome PWA, landscape): consolidated IA, persistent rail, split-view 360s, a Command Center, a scalable Global
  Search, and end-to-end Emergency Controls. First pass = foundation (shell + admin design system) + Command
  Center + Global Search + Emergency Controls; remaining domains follow.
- **Impacted systems:** Admin (UI + IA) · Security (config rules) · main-app (kill-switch/maintenance enforcement)
  · APIs · Firestore.
- **Bible docs updated (FIRST):** DECISION_LOG (ADR-019 IA+design-system, ADR-020 Global Search, ADR-021 Emergency
  Controls), TECHNICAL_BIBLE (§3 nav+actions, §3.1 reaffirm 8/12, new §10B admin design system), GOVERNANCE
  (Super Admin V2 governance: one-owner-per-capability, search primitive, emergency procedure), SECURITY_ARCHITECTURE
  (§6A Emergency Controls + config rules + search auth; Security 2.4), FIRESTORE_BLUEPRINT (the three `config/*`
  flags + search index note; Firestore 2.5), VERSIONS (Bible 2.9 / Arch 2.6 / Firestore 2.5 / Security 2.4 /
  Payment 2.2 + history), ROADMAP.
- **Schema delta:** NEW `config/maintenance`, `config/aiKillSwitch`, `config/paymentKillSwitch` (client-readable
  break-glass flags; Admin-SDK write only). No new index (Global Search uses single-field auto-indexes). No data
  migration.
- **API delta (ZERO new functions — super-admin stays 8/12):** `system.js` += `search`, `config-get`, `config-set`,
  `revenue-intel`, `ack-alert`. main-app enforcement adds NO function (reads `config/*` in
  aiService/paymentService/boot). New admin UI: tablet-first shell (rail / SplitView / Tabs / Table card-mode /
  focus-trap), Command Center view, rebuilt server-side Global Search (Cmd+K), Emergency Controls panel.
- **Security review:** config flags are client-**readable** but Admin-SDK-write-only (rules); `maintenance`
  world-readable (pre-auth screen), kill switches authed-read; `aiBudget` stays Admin-only. `config-set` audited
  (category `system`). Global Search is `withAdminAuth`, server-side prefix only (no client fetch-all). Kill
  switches only block, never widen access.
- **Version bumps:** Bible 2.8→2.9, Arch 2.5→2.6, Firestore 2.4→2.5, Security 2.3→2.4, Payment 2.1→2.2 (flow gated).
- **Migration:** none. **Deploy step:** `firebase deploy --only firestore:rules,firestore:indexes` (config read rules).
- **Verification:** `node --check`; function counts (super 8 / main 6); rules + indexes valid; Preview render (rail
  at tablet width, Command Center, Cmd+K hits server search); enforcement trace (AI / payment / maintenance kills);
  adversarial review.
- See [DECISION_LOG.md](DECISION_LOG.md) ADR-019/020/021.

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
