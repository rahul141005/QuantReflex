# QuantReflex Decision Log

**Architecture Decision Records (ADRs).** Each entry captures a decision, the context, the
options considered, and the consequences — so future readers understand *why*, not just *what*.
Newest first. Reference these IDs (`ADR-NNN`) from the CHANGELOG when a change embodies a decision.

Companion: [GOVERNANCE.md](GOVERNANCE.md) · [VERSIONS.md](VERSIONS.md) · [CHANGELOG.md](CHANGELOG.md)

---

## ADR-035 — Math Duel full redesign: one generator, modal setup, host/guest lobby, §10A (2026-06-14)
- **Context:** A live two-device test showed the Duel still felt "bolted on": the create screen was a long
  full-page form (the owner could not even scroll to the Create button), the lobby was one shared "debug" screen
  for host and guest, the server ran a **divergent 6-category** generator (`api/_lib/duel-questions.js` —
  addition/subtraction/division, none of which exist in the 12 authoritative Practice categories), and every duel
  screen used inline `SURFACE`/`ACCENT` indigo, not the §10A design system. The owner mandated a single-pass
  redesign so the Duel feels like **multiplayer Practice**. (The server-authoritative core of ADR-031 + the
  lifecycle hard guards of the same-day fix-pass are unchanged.)
- **Decision:**
  1. **One generator (no duel-specific generator).** `js/questions.js` is now the single source for client AND
     server: a guarded `module.exports` (no-op in the browser) + a server-safe `_difficultyOverride` (so
     `_getDifficulty` needs no DOM/AppState) + `generateQuestions(n, cat, difficulty)` + a new
     `generateMultiTopic(n, topicKeys, difficulty)` (the multi-topic splitter, which `drill-engine.js` now
     delegates to). `api/duel.js _start` `require('../js/questions.js')` and generates the chosen authoritative
     topics at the chosen difficulty. **`api/_lib/duel-questions.js` is deleted.** Grading is unaffected: the
     server `_isCorrect` already mirrors the client `checkAnswer` (whitespace-strip → exact string match → numeric
     tolerance), so string-answer categories (ratios `5:4`, fractions `1/2`, reverse-% `33.33`) grade correctly.
  2. **Setup = bottom-sheet modal over Home (no route).** `DuelUI.renderSetup` renders a `.training-card`
     overlay (`#duelSetupModal`, body-level) with a scrollable `.training-card-body` + a **sticky footer** holding
     Create — so the CTA is always reachable. It reuses the Custom Training `.custom-question-range` slider (5–50),
     the authoritative `_CATEGORY_LABELS` topics via `.category-btn`, the `.timer-select-section` (OFF / per-Q /
     total), difficulty pills, and a Skip toggle (default OFF). Word Problems is shown disabled with a "Soon" badge.
  3. **Host vs guest lobby split.** Host sees room code + Copy/WhatsApp + player slots + a Start that appears only
     when full; guest sees "Joined", read-only match settings, and "waiting for the host" — **no invite tools**.
     Capacity stays strict 2 (server `_join` → `ROOM_FULL`; client shows a polished "arena is full" card).
  4. **Single state-aware Home card + §10A everywhere.** `#homeDuelCard` mutates in place across
     idle/lobby/waiting/results (no second card, no layout jump). Waiting + results are rebuilt on §10A
     (`.results-grid`/`.stat-card`, honest speed/accuracy, Rematch → Home → setup modal). All inline indigo removed;
     the dead `.mode-card-duel` purple block deleted.
- **Consequence:** A Duel topic now produces the **same** questions as Practice end-to-end. The setup can never
  hide its CTA again. Host and guest get distinct, state-clear premium screens. One generator means one place to add
  a category. Trade-off: `questions.js` now carries a tiny dual-mode tail and is bundled into the duel serverless
  function (the same cross-dir `require` pattern middleware already uses for `aiService`).

## ADR-034 — Super-Admin first-class Independent affiliation + coaching grouping (Section 2) (2026-06-13)
- **Context:** The Super-Admin User-360 master is a flat ≤100-row page segmented client-side; there is no
  server-derived "group by coaching" view and no authoritative Independent count. The owner's requirement:
  Independent users are a **first-class affiliation type** — explicit in the data model, backfilled, authoritative,
  and queryable — not a derived/inferred estimate; Super-Admin gets **All · Coaching (grouped) · Independent** with
  exactly-reconciling counts and no fabricated numbers.
- **Decision:** (1) **Make affiliation explicit:** `register` already writes `coachingId: null` for independent
  signups; **backfill** explicit `coachingId: null` onto every legacy user doc missing the field, so Independent is
  an authoritative `where('coachingId','==',null).count()` bucket (Firestore cannot match an *absent* field — the
  backfill is what makes it first-class and queryable). (2) **Server `?action=groupTotals`** on
  `super-admin-app/api/admin/users.js` (no new file → stays 8/12): per-coaching totals read O(1) from the
  already-maintained `coachings.studentCount` (not N `count()` queries); Independent = authoritative `count()`;
  expose a reconciliation invariant `sum(coaching) + independent == total`. (3) **Client:** an affiliation axis
  (All/Coaching-grouped/Independent) **orthogonal** to the existing status/plan chips + Inactive bulk mode (both
  preserved); coaching sections expand via the existing `coachings.js students` action (surface its 300-row
  `truncated` flag). Bulk-reassign **deferred** (couples a write path to a read feature → count drift risk).
- **Options considered:** Independent by **subtraction** (`total − Σ studentCount`) — cheaper but a *derived
  estimate* subject to `studentCount` drift; **rejected** (owner: no estimates in admin). Per-coaching live
  `count()` per row — accurate but N aggregation queries on every list load; **rejected** for the list.
- **Consequences:** Authoritative, reconciling affiliation counts platform-wide; no estimates; no new functions;
  Spark-safe. One-time backfill (`firestore/diagnostics/backfill-independent-affiliation.js`, owner-authorized).
  Builds on ADR-032 (`coachingId→name` resolution + transactional `studentCount`). Firestore MINOR (explicit
  `coachingId:null` Independent model), Arch MINOR (new aggregation action).

---

## ADR-033 — Duel V2 fix-pass: design-language inheritance (drill-engine reuse) + edge-defect remediation (2026-06-13)
- **Context:** A 13-agent adversarial audit of the **shipped** Duel V2 (ADR-031) reached a verified verdict:
  **PRESERVE the architecture, do not rebuild.** It is genuinely server-authoritative (`api/duel.js` is the sole
  writer of questions/key/grading/winner/status/history; the answer key is client-unreachable; `_finalizeTxn` is
  one idempotent CAS; resolution is triple-guaranteed). No critical security hole. But it carries: a cross-cutting
  **§10A design-system bypass** (the Duel UI hand-rolls every screen with a private `SURFACE` const + an undefined
  `--color-accent` that always falls back to indigo `#6366f1` + ~80 inline styles → "feels like a separate
  mini-app"); a **governance drift** (`_finalizeTxn` header + two Bible docs claimed `activeDuelId` is cleared at
  finalize; the code intentionally does NOT — corrected in this ADR); and several edge defects (D1 high; D2/D3/D4
  med; D5/D6 low). The owner LOCKED a non-negotiable constraint: the Duel experience must **truly inherit** the
  Practice/Focus/Custom design language (not imitate it), and every duel metric must be **honest** everywhere.
- **Decision — targeted fix-pass on the preserved architecture (zero new `api/*.js` files):**
  1. **Design-language inheritance (owner-LOCKED, the centrepiece):** re-home the in-duel solving screen onto the
     existing Practice `drill-engine` in a **render+capture-only mode** — the question container, answer input,
     custom numpad, action buttons, spacing, transitions, and feedback animations become the REAL Practice
     components; the duel layer adds only multiplayer behavior. **No client grading, no client score display**
     (server-authoritative + hidden-until-results preserved; the engine's `isDuel` "Current Score" exit text is
     removed). Delete the hand-rolled parallel runner. De-indigo + tokenize every remaining duel screen: replace
     the undefined `--color-accent` indigo fallback with a documented `.duel-seg` class on the **existing blue
     gradient** `#2563eb→#1d4ed8`; inherit `.card`, `.results-grid`/`.result-item`, `.home-bento-card` (Active-Duel
     card), `--qr-*` radius tokens; collapse the duplicate exit modal to the single JS source; delete orphaned
     purple CSS (`style.css:6721-6788`).
  2. **D1 — rate-limit class:** the 20/hr AI limiter (`middleware.js:84/166`) is applied unconditionally and can
     429 a live duel mid-finish. Give `withAuth` a rate-limit *class* — a dedicated higher duel counter (~120/hr)
     with a cap still on create/finish (not a blanket bypass).
  3. **Admin V2-lifecycle correctness:** `super-admin system.js` queries a dead `waiting` status (V1) in 4 places
     and `duels-cleanup` can hard-delete a live `active` room. Replace with real V2 orphan defs (`lobby` aged-out +
     `active` past `totalDeadline`); make cleanup **non-destructive to `active`** (purge only terminal rooms) —
     `api/duel.js` stays the sole finalizer.
  4. **Per-question data + honest metrics:** `_grade` also emits `perPlayer.{uid}.perQuestion=[{index,correct,
     answered,ms}]` (renders only post-`complete`). Displayed speed switches to **sum of per-answer solve time**
     (client `clientMs`, **display-only — never feeds `duelScore`/winner**, which stay server-trusted); add a server
     `decisionBasis ∈ {accuracy,speed,draw}` so the "why" copy always matches the winner logic; early/incomplete
     attempts are labeled; a metric-correctness audit runs against the §F.6 interruption matrix.
  5. **`activeDuelId` drift correction (Bible-first):** DECISION_LOG / FIRESTORE_BLUEPRINT / the `_finalizeTxn`
     header now state the truth — it is NOT cleared at finalize (kept for the View-Results card; cleared on
     ack/abandon/cron-expire). Duels are strictly 2-player.
  6. **D2/D3 edge fixes:** `?action=leaveLobby` (non-host clears only its own `activeDuelId`); create-time
     self-heal (finalize an `active` room past `totalDeadline` inline before the create-guard blocks).
- **Consequences:** The Duel feels like native QuantReflex Practice (true component reuse), is fully on the §10A
  design system, has trustworthy metrics under every interruption path, and no live-breaking rate-limit. The
  server-authoritative model is **reinforced, not changed** (sole-writer invariant strengthened — the admin app
  loses its ability to delete live rooms). Drives a duel-history surface (DX-1, see the Duel History note) and a
  per-question data-shape **amendment to ADR-031**. Zero new functions; Spark-safe; Bible-first per phase. Arch/
  Firestore/Security MINOR as phases land.

---

## ADR-032 — Spark-safe denormalized-counter maintenance: `studentCount` in the request path + live `count()` (2026-06-13)
- **Context:** A student created with a valid `coachingId` was **correctly affiliated** (`users/{uid}.coachingId`
  set — proven with live data via `firestore/diagnostics/affiliation-audit.js`), yet Super-Admin showed the
  coaching with **0 students** (`denormalizedStudentCount=0` vs `liveStudentCount=1`, `mismatch=TRUE`). Root cause:
  `coachings/{id}.studentCount` was maintained **only** by the `syncCoachingStudentCount` `onDocumentWritten`
  trigger (`functions/index.js:360`), and the project runs on **Firebase Spark**, where Cloud Function triggers/
  schedulers **do not run** (see [quantreflex-firebase-spark] memory / ADR-031). So every coaching's counter was
  frozen at its creation value (0) forever. Three read-side defects compounded the confusion: the coaching roster
  `orderBy('stats.lastActiveMs')` (`coaching/students.js:108`) silently **drops** students whose user doc never
  initialized `stats` (register wrote none — Firestore excludes docs missing the orderBy field); the Super-Admin
  User-360 "recent duels" query (`admin/users.js:106`) used the **removed Duel-V1** `participants.${uid}` schema;
  and the Users list (`js/views/users.js:93`) rendered the **raw `coachingId` code** instead of the coaching name.
- **Decision — retire trigger-based counter maintenance (hybrid: request-path maintenance + display-time truth):**
  1. **Maintain `studentCount` in the request path**, transactionally, at every affiliation mutation — `register`
     (+1, in the create batch), `account.claim-coaching` (±1, in its existing txn), `users.reassign-coaching`
     (±1, now txn-wrapped), and the offboarding deletes `users.purge` / `account.delete` (−1, best-effort, guarded
     by coaching existence). Decrements fire **only when `coachingId` is actually removed**; suspend/archive keep
     `coachingId`, so they don't change the count — matching the live-`count()` semantics exactly.
  2. **Live `count()` is the display-time source of truth** at detail surfaces (Coaching-360 `details` already runs
     `users.where('coachingId','==',id).count()`; the `(coachingId, plan)` index for the premium count already
     exists). The maintained field backs the **list** view (1000 coachings — a `count()` per row would be wasteful)
     and is reconciled once by backfill.
  3. **Neutralize the trigger** — `syncCoachingStudentCount` now no-ops with an early `return null` so it can never
     **double-count** if the project ever moves to Blaze (request-path maintenance would then run alongside it).
  4. **Initialize `stats.lastActiveMs`/`lastActiveDate` at register** so the roster `orderBy` never excludes a new
     joiner (+ a one-time backfill for existing stat-less users).
  5. **Repoint** the User-360 duels read to `users/{uid}/duelHistory` (the canonical Duel-V2 per-user record) and
     surface it in the Activity timeline.
  6. **Resolve `coachingId → coaching name`** in the Super-Admin Users list/detail — client-side, reusing the
     already-loaded `_coachings` array (no backend N+1). The full Independent-vs-Coaching grouping is deferred to
     the Section-2 redesign; this ADR only makes the existing affiliation **read correctly**.
- **Options considered:** (a) *keep denormalizing only, fix the trigger* — impossible on Spark; rejected.
  (b) *drop the counter; always `count()`* — drift-proof but a 1000-row list would issue 1000 aggregation queries
  per load; rejected for the list, **adopted for detail**. (c) **hybrid (b-for-detail + request-path maintenance +
  one-time backfill)** — correct-by-construction, cheap, self-healing at detail; **chosen.**
- **Consequences:** Affiliation now reflects correctly across Student → Coaching → Super-Admin with **no trigger
  dependency**. The counter is eventually-correct by construction and authoritatively reconciled by `count()` where
  it matters. A tiny TOCTOU remains (a coaching deleted in the microsecond between validation and the increment
  fails that one registration) — acceptable and rare. **Security:** no rules change — affiliation writes stay
  own-scoped (student `claim-coaching`) / admin-gated (super-admin); reads unchanged. **Migration:** two one-time
  backfills (`firestore/diagnostics/backfill-student-counts.js`, `backfill-stats-lastactive.js`) — owner-authorized
  prod runs. **Supersedes** the FIRESTORE_BLUEPRINT "studentCount written only by the Cloud Function" note (audit
  M8) and reopens it as **M8b**. Firestore 2.12→2.13, Arch 2.12→2.13, Bible 2.20→2.21.

---

## ADR-031 — Duel V2: server-authoritative premium 1v1 speed challenge (full rebuild) (2026-06-13)
- **Context:** A 33-agent adversarial workflow + two red-team passes found the existing client-trust duel system
  has **critical** fairness/recovery/integrity holes: the **answer key is stored plaintext in the room doc**
  readable before start (`duel-core.js:199`); **score/winner are 100% client-written** with zero validation
  (`:353-369`, `_checkDuelCompletion`); a timeout/stop-answering **hangs the duel in `active` forever** (no
  terminal write — `drill-engine.js:600-602`); recovery is **localStorage-only** (dies on reinstall/another
  device); premium is **client-only** (rules don't check plan); every answer **rewrites the whole participants
  map** (cross-player contention); countdowns are **unsynchronised**; there is **no Active-Duel home card / no
  / no history / no share wiring**. The owner reframed Duels as a **premium-only social speed challenge**
  (NOT ranked/esports) whose job is to make students challenge friends and **solve math FASTER**.
- **Owner decisions (binding):** (1) **server-authoritative scoring** — answers validated + winner computed
  server-side; clients never grade or decide; **no answer keys in client-readable docs**; premium enforced
  server-side. (2) **Hidden-until-results** — during play the opponent shows only presence (Connected/Solving/
  Finished); all comparison revealed only on the result screen. (3) **Speed-weighted, accuracy-dominant** winner.
  (4) **Full one-pass rebuild** + end-to-end interruption audit.
- **Decision — ONE canonical model (collapsing five conflicting drafts):**
  1. **Split documents + one Vercel Admin-SDK endpoint as the sole completion authority.** `duels/{code}` holds
     room state + question **prompts (text only)** + `presence:{uid:{name,state,lastSeenAt}}` (no score/progress);
     `duels/{code}/private/key` holds the **server-only answer key** (client read/write denied);
     `duels/{code}/players/{uid}` holds each player's own answers (own-uid read/write only, opponent denied — so
     the per-answer hot path produces **zero opponent snapshot fan-out**). The new `main-app/api/duel.js`
     (action-routed, ADR-017 style; `withAuth` → `req.userPremium`) is the only writer of questions, key, grading,
     winner, `status`, and history. Clients write **only** their own `presence.{ownUid}` (room) + `players/{uid}`
     while `status==active`; rules make winner/result/answers **unforgeable**.
  2. **Winner = `correctCount×1000 + speedBonus` (`speedBonus≤300`)** — accuracy strictly dominates (one more
     correct beats any speed edge); equal accuracy separated by **server-measured** total solve time; unanswered/
     skipped = wrong so a quitter can't win on speed; exact tie ⇒ draw. Explainable in one line.
  3. **Recovery from the server, not localStorage:** `users/{uid}.activeDuelId` mirror (1 read, no index, cross-
     device) drives the **Active-Duel home card** (derived, no second flag). **Exit = finalized submission, NO
     resume:** leaving an active duel `finish`es the player (grades what was answered, locks the rest, terminal
     `presence.state=finished`, no re-entry — enforced by a `players/{uid}` write rule requiring `state=='solving'`);
     recovery only ever restores the **waiting-for-results** or **results** screen, never the solving screen. Exit
     is NOT a forfeit — performance (F.4) decides, and an early submitter with more correct answers can still win.
     `participantUids:[a,b]` + a `(participantUids array-contains, status)` index back the sweep.
  4. **Finalize = one status-CAS transaction** (`active→complete`) writing `perPlayer`+`winnerUid`+history (docId=
     duelId, idempotent) — so simultaneous-finish / cron-interleave / re-finish are idempotent. **`activeDuelId` is
     intentionally NOT cleared at finalize** (ADR-033 correction — it keeps the Home "Duel ready · View Results"
     card alive); it is cleared on result-ack, host-abandon, or cron-expire — a `complete` value never blocks a new
     create (the guard only blocks `lobby`/`active`). **Duels are strictly 2-player** (start gates on exactly 2
     present). The endpoint **sends the "opponent finished" FCM** at finalize (Admin SDK `admin.messaging()`).
  5. **Spark-correct infra (no Firebase functions run on Spark):** resolution is **lazy on `?action=state`**
     (instant for whoever is waiting); a **Vercel daily cron** (`?action=cron-sweep`, `CRON_SECRET`) only mops up
     the both-abandoned tail. Honest worst case: instant in the common cases, ≤24h only when nobody is waiting.
  6. **Premium at `create`/`join` only** (via `aiService.resolvePlan` — works for coaching-granted premium, no
     custom claim, no lockout); `finish`/`state` never re-check, so a mid-duel premium loss can't strand
     the opponent. **`totalDeadline` always set** (bounds stalling). Countdown anchored to server-stamped
     `startedAt` + a server-time offset (skew-corrected). **Question generator is server-only/secret-seeded** so a
     shared code can never let a client regenerate answers.
- **Consequence:** closes B1–B22 (all 65 confirmed findings). Additive Firestore (new subdocs + `users.activeDuelId`
  + `duelHistory`); a `/duels` rules **rewrite** (participants-only read; client writes only own presence via a
  hand-written two-level nested diff; `private`/winner/status denied; explicit `duelHistory` write-deny carve-out
  over the blanket `users/{uid}/{sub}` grant); one new Vercel function (7/12); no Firebase functions changed; no
  data migration (duels are ephemeral; `schemaVersion:2`, legacy drains in ≤ TTL). Arch/Firestore/Security MINOR
  bump. Full design + the 65-finding appendix: the plan + workflow output referenced from this ADR.

## ADR-030 — Coaching App V4: value/UI/perf pass — surface real data, premium UI, honest cold-start (2026-06-13)
- **Context:** A brutally-honest product review (9-agent audit + adversarial self-challenge) found the rebuilt
  coaching app **feels empty, low-information, and slow** — but the root cause is NOT minimalism: the backends
  already compute rich data the views **discard** (dashboard returns `strongestStudents`/`recentActivity`/
  `activeStreakUsers`/`totalQuestionsSolved` and renders none; the roster returns `streak`/`bestStreak`/
  `weakTopic` and drops them), available-today signal (week-over-week accuracy/participation) is buried behind
  "collecting" states, and ADR-029's "masked scans" were never actually masked (only `.limit()`; no `.select()`
  → the Students-screen slowness). The coaching app is a **sales tool** (owner trust / student adoption /
  retention / demonstrate math-SPEED value) — not an LMS/CRM.
- **Decision (Phase 1+2; growth features deferred):**
  1. **Stop discarding fetched data + demote vanity.** Rebuild Dashboard (Snapshot · Momentum · Action Required ·
     Coaching Wins), the Students roster (triage row: speed + streak + weak topic + attention dot), Performance
     (anchor today's speed + real WoW accuracy/participation + speed distribution + current-fastest + ONE honest
     speed-trend teaser), and Engagement (live audience counts + named at-risk list + real-name achievements; cut
     the fake `seg='all'` chips) — using data already on the render path. A card earns its place only if its data
     is live today AND it changes what the owner does.
  2. **Performance:** add Firestore field masks (`.select()`) to the heavy coaching scans (students/dashboard/
     insights) and `Promise.allSettled` the super-admin Command Center's sequential calls (the actual slowness).
  3. **"Session Improvement" cold-start bridge** (honest day-one speed proof): the student app computes
     first-half vs last-half session speed from the existing `perQuestionTimes` and persists per-session
     `firstHalfAvg`/`secondHalfAvg` (on `practiceSessions`) + a rolling `stats.avgSessionImprovementPct` (on the
     user doc, read cheaply by the coaching scan). Shown as **"Session Improvement"**, strictly separate from the
     7/30-day trends; it becomes secondary once real history accrues. No fabrication, no benchmarks.
  4. **Onboarding trust:** student join shows **"✓ Connected to <Coaching Name>"** (+ count + logo when present);
     new optional `coachings.logoUrl` (set in super-admin, rendered where present). Coaching code one-tap copyable
     in Settings.
  5. **Minimal coaching notes:** one plain-text note per student in `coachings/{coachingId}/notes/{studentUid}`
     (Admin-SDK write via a `students?action=save-note` branch — no new function; client-write denied). No CRM
     (no tags/reminders/timeline/attachments).
  6. **Premium UI:** content emoji → the inline-SVG icon set already shipped in the nav; activate the unused
     `.metric-card.accent-*` system; one stronger heading tier; uniform empty/collecting/error taxonomy +
     `.toast.info`; skeletons that match layout; `prefers-reduced-motion` + global `:focus-visible`; fix the ARIA
     tab pattern. **No** dead UI: NO dark-mode toggle, NO notification preferences (no backend for either).
- **Consequence:** the app communicates its value in <3s and loads fast, without recreating the bloat the rebuild
  removed (no acquisition/benchmark/upgrade-engine/nudge-analytics — Phase 3). Additive Firestore (session fields,
  `logoUrl`, notes subcollection); no new functions; coaching stays 5/12. Firestore 2.10→2.11, Bible 2.18→2.19.

## ADR-029 — Coaching offboarding is enforced end-to-end (suspend/delete cuts the owner) (2026-06-13)
- **Context:** A zero-compromise ecosystem audit of the Coaching App found a CRITICAL gap: super-admin
  suspend/delete (`coachings.js` mutate) only flipped `coachings/{id}.status` and cascade-revoked *students'*
  premium — it never revoked the **owner's** access. `withCoachingAuth` trusted the `coaching_admin` claim
  alone and no endpoint/rule re-checked coaching status, so a suspended/removed coaching's admin kept a valid
  JWT and full access to student PII + broadcast indefinitely. Deactivation was cosmetic.
- **Decision:** offboarding must cut the owner, immediately and durably:
  1. **super-admin `coachings.js` mutate** — on suspend/delete, also `setCustomUserClaims(adminUid, {})`
     (drop `coaching_admin`/`coachingId`) + `revokeRefreshTokens(adminUid)`; **delete** additionally
     `updateUser(adminUid, {disabled:true})`. **activate** restores the claim (+ re-enables). Best-effort
     (a missing Auth user never fails the Firestore mutation).
  2. **coaching `withCoachingAuth`** — verify the ID token with **`checkRevoked=true`** (so the revoke bites
     immediately, not after the ~1h token TTL) **and** add a **coaching-status gate**: read
     `coachings/{coachingId}.status` (60s per-instance cache) and reject `suspended`/`deleted` with
     `COACHING_INACTIVE`. The status gate is the authoritative backstop; the token revoke is the immediate cut.
- **Consequence:** suspending/deleting a coaching now ends the owner's session within one request (revoked
  token) and keeps them out (status gate + dropped claim); activate cleanly restores access. Active-state
  isolation (already sound) is unchanged. Security 2.7→2.8, Bible 2.17→2.18. Pairs with the audit's
  registration-rate-limit + token-strength hardening (same pass).

## ADR-028 — Coaching App V3: mobile-first "Speed Training Control Center" (2026-06-13)
- **Context:** A ruthless 8-agent product audit of the coaching-owner app (`coaching-admin-app`) found it is
  **a speed product that never shows speed**: the dashboard API computes `avgSpeed` from real data and the home
  screen renders none of it; the only speed-over-time chart (`_miniSparkline`) is dead code (data fetched +
  discarded); the two on-mission widgets (improving/declining students) are buried under "More"; the entire
  intervention arm is broken (every cross-view jump calls a non-existent `app.navigate` instead of
  `CoachingApp.navigateTo`); and it carries LMS/gamification scope creep (Instagram export, duel W/L,
  report-card print, a dead scheduled-notice subsystem, 6 classroom templates, fabricated "Consistency Score"
  and "Retention" metrics).
- **Decision:** rebuild it into a focused, **mobile-first** (the primary device is a phone — bottom-nav is
  retained and restyled, NOT replaced with a tablet sidebar) **Speed Training Control Center** answering five
  owner questions in <30s (practicing? · getting faster? · who needs attention? · who improves fastest? · is
  QR working?). **5 bottom-nav tabs:** Dashboard · Students · Performance · Engagement · Settings (the
  brief's "Growth" adoption metrics fold into Performance; one-owner clarity, no duplicate entry points).
  - **Notices → "Student Engagement Center"** (behavior-change engine, not a comms platform): exactly 3
    sections — Quick Broadcast (audiences all/premium/free/selected, used for motivation: speed challenges,
    targets, congratulations), Smart Nudges (auto-generated: inactive / weak-topic / low-streak /
    low-participation) + Achievement Broadcasts, Recent Notices (last 20, read-only). **Removed:** templates
    library, scheduling subsystem (also a dead feature — nothing dispatched `scheduledNotices`),
    history-management console, and all inbox/conversation/reply/chat/LMS workflows.
  - **No "Coaching Rank"** (the app is JWT-scoped to one coaching; cross-tenant comparison is governance-owned
    by super-admin). Replaced by a **Coaching Improvement Score** measured vs the coaching's OWN history
    (speed-improvement + accuracy-improvement + active-% + streak-retention). Any future platform benchmark
    must come from super-admin aggregates, be **anonymized**, and never expose competing coaching identities.
  - **Calm, de-gamered dark theme** (Linear-style, tokenized) replacing the gamer-navy + podium/medal/Instagram
    aesthetic; **re-enable pinch-zoom** (the viewport disabled it — WCAG 1.4.4); ≥44px touch targets;
    Student-360 stays a full-screen push detail (correct mobile pattern), not a split-pane.
  - **Honesty rule (ties to ADR-027):** every history-dependent metric (speed trend, improvement score, top
    improvers, conversion/retention) renders a **"collecting data — live in N days"** state, never a fabricated
    or approximated number. Metrics already backed by real dated data (participation, accuracy trend,
    questions/day, current avg speed, active/at-risk, premium/trial) are live from day one.
- **Infra:** zero new coaching serverless functions (stays **6/12**); reads the ADR-027 `coachingMetrics`
  rollup instead of the old 3× unbounded `users` full-scan; drops the ~200 KB `html2canvas` eager load.
- **Consequence:** an owner opens the app and immediately sees whether students are practicing and (as data
  accrues) getting faster, with a working intervention loop — and the product gets more valuable every week as
  history accumulates. Bible 2.16→2.17, Arch 2.9→2.10. Depends on ADR-027.

## ADR-027 — Historical Analytics Foundation: dated speed history + per-coaching daily rollup (2026-06-13)
- **Context:** The coaching owner's headline question — "are my students getting **faster**?" — had **no
  truthful answer** because there is **zero dated speed history** in the system: `stats.responseTimes` is a
  timestamp-less 200-item FIFO ring and `stats.dailyHistory` stored only `{attempted, correct}` per day (no
  times). Existing "improvement"/"weekly speed" surfaces faked the time axis (a last-200-questions slice
  relabeled as a 7-day trend; lifetime speed relabeled as "weekly speed"). The owner directive: **measure real
  improvement, never invent it** — build the data foundation now, show honest "collecting" states until it
  accrues.
- **Decision:** establish the analytics foundation as a first-class, Bible-documented milestone:
  1. **Widen `users/{uid}.stats.dailyHistory[date]`** from `{attempted, correct}` to
     `{attempted, correct, sumTimes, count}` in `main-app/js/progress.js#recordAnswer` (avgTime/day =
     `sumTimes/count`). Additive + backward-compatible (readers default the new keys to 0); the existing
     90-day prune keeps it bounded. This is the **single root unblock** for every speed-trend metric.
  2. **Populate `practiceSessions/{auto}`** — wire the exported-but-never-called
     `firestore-sync.savePracticeSession()` into the drill/timed-test completion flow so per-session
     `duration`+`date` exist (enables "sessions today" and per-session speed).
  3. **Per-coaching daily rollup `coachingMetrics/{coachingId}`** — written by the **existing super-admin daily
     cron** (it already scans everything for `metrics/{date}`), so cross-tenant aggregation stays
     super-admin-owned and the coaching app adds **zero functions**. Backs growth/retention/trends AND replaces
     the coaching app's 3× unbounded per-load roster scans.
  4. **Composite indexes** `users(coachingId, plan)`, `(coachingId, isTrial)`, `(coachingId, createdAt)` for
     coaching-scoped `count()` aggregations.
- **Honesty contract:** no backfill, no synthetic history — day rows accrue from 2026-06-13 forward; trend
  metrics stay in a "collecting data" state until ≥7/≥30 days exist. **Real improvement, measured — never
  invented.**
- **Consequence:** the Coaching App (ADR-028) becomes automatically more valuable each week as history
  accumulates, with no fabricated analytics. Firestore 2.8→2.9, Security 2.6→2.7, Arch 2.9→2.10. Recorded in
  [ROADMAP.md](ROADMAP.md) as the Historical Analytics Foundation milestone.

## ADR-026 — Super Admin accessibility + governance enforcement audit (Pass 3, 2026-06-12)
- **Context:** Pass 3 (final pass) of the ADR-024 refinement program — a from-source UX / visual / a11y /
  navigation / design-system enforcement audit run as an adversarial multi-agent review (35 candidate
  findings → **18 confirmed**). The app shipped functional but carried interaction-quality debt: clickable
  rows and a file drop-zone that only responded to mouse (no keyboard path → WCAG 2.1.1 fail); a modal whose
  `aria-labelledby` pointed at an id that was never set (dangling reference); tabs without the WAI-ARIA tab
  pattern; toasts not announced to assistive tech; raw technical error strings (`e.message`) still surfacing
  in several views despite the ADR-024 `getReadableError` layer; a metric-tile markup triplicated across three
  Centers; one latent **self-referential CSS token** (`--accent-glow: var(--accent-glow)`) introduced by a
  Pass-1b global value-sweep that broke focus rings / accent glows in **light** mode only.
- **Decision:** fix all 18 confirmed findings, no new product surface:
  - **Keyboard operability (2.1.1):** every `.sv-row` (User-360, Coaching-360), the Content drop-zone, and the
    Global-Search result items get `role="button"`/`role="option"` + `tabindex="0"` + an Enter/Space `keydown`
    handler mirroring their click. Global Search result navigation moved from inline `onclick` to a delegated
    click+keydown handler.
  - **Names/roles (4.1.2):** filter inputs (Users / Coachings / AI) and the bulk select-row checkboxes get
    `aria-label`s; the Global-Search overlay becomes a labelled `role="dialog"` with a `role="listbox"` results
    region and an `aria-label`led `type="search"` input; the active nav item carries `aria-current="page"`.
  - **Modal (4.1.2):** the `<h3 class="modal-title">` now actually sets `id="modalTitle"`, so the dialog's
    `aria-labelledby` resolves (was dangling).
  - **Tabs (APG):** the Tabs primitive was rebuilt to the full WAI-ARIA tab pattern — per-mount unique ids,
    `role=tablist/tab/tabpanel`, `aria-selected`/`aria-controls`/`aria-labelledby`, roving `tabindex`, and
    Arrow/Home/End keyboard navigation.
  - **Status messages (4.1.3):** `#toastContainer` is an `aria-live="polite"` `role="status"` region; error
    toasts set `role="alert"`.
  - **Operator-friendly errors:** the remaining raw `e.message` sites (questions ×6, command-center ×4,
    global-search) now route through `AdminUtils.getReadableError`; the Content table renders in **card mode**
    on narrow panes (`Table.build(..., { cards: true })`) instead of forcing a horizontal scroll, and its empty
    state uses the shared `AdminUtils.emptyState`.
  - **Design-system enforcement:** the triplicated per-view `_tile()` collapses to a single owner
    `AdminUtils.statTile` (backed by `.stat-num`/`.stat-cap`/`.stat-sub` classes); prominent empty lists migrate
    to `AdminUtils.emptyState`; the self-referential `--accent-glow`/`--accent-ring` token definitions are
    restored to real light-mode values; a global `:focus-visible` ring + density `.card` rules added.
- **Infra:** **zero new functions** (super-admin 8/12, main-app 6/12); no schema/security/payment change —
  pure client (JS/CSS/HTML) + Bible. Verified: `node --check` all JS, CSS braces balanced (260/260), **zero**
  hardcoded hex/rgba color literals in any view, no self-referential token definitions.
- **Consequence:** the admin surface is now keyboard-navigable end-to-end, announces state changes to assistive
  tech, never leaks raw technical errors, and has a single source of truth for stat tiles + empty states — the
  ADR-024 program's quality bar is met. UI/a11y only (MINOR). Bible 2.15→2.16, Arch 2.9 (unchanged — no
  topology change; documented in §10B).

## ADR-025 — Super Admin Settings Center + Operations enhancements (Pass 2, 2026-06-12)
- **Context:** Pass 2 of the ADR-024 refinement program. The admin app had no place to manage the admin's own
  account/session, no persisted per-admin preferences, and no platform-info surface.
- **Decision:** add an **8th domain — Settings** (`js/views/settings.js`, `view-settings`, gear nav), tabbed:
  - **Account** — email/uid/role (from `firebase.auth().currentUser`), recent admin sign-ins (from
    `system?action=security` `admin_login` events), **change password** (Firebase `reauthenticateWithCredential`
    → `updatePassword`) and **change email** (reauth → `verifyBeforeUpdateEmail`) via the client SDK.
  - **Security** — 24h failed-login / suspicious counts + posture (`system?action=security`), recent security
    events, and **"log out everywhere"** → **one new** `system?action=revoke-tokens` (POST) that revokes the
    CALLING admin's own refresh tokens (scoped to `req.userId` — an admin can sign *themselves* out, never
    others; audited `revoke_own_sessions`).
  - **Appearance** — theme light/dark/system (reuses the ADR-024 `window.AdminTheme`).
  - **Preferences (this device)** — default landing page (honored in `app.js` router), table **density** +
    **animations** (body classes `density-*`/`no-anim` applied on boot), **date format** + **timezone**
    (honored by `AdminUtils.formatDate`/`formatDateTime`). All persisted in the `qrAdmin*` localStorage
    namespace. (No per-admin notification channel exists, so that preference is intentionally omitted.)
  - **Platform** — app/Bible version, env (`location.hostname`), Firestore project (`firebase.options`),
    function count (8/12), live collection sizes (`system?action=firestore-ops`).
  - **Backup** — authenticated CSV exports (`system?action=export`) + a link to the Operations audit feed.
  - **Operations enhancement:** the Diagnostics health grid now shows 6 subsystems and **reflects the live
    emergency state** — an enabled AI / payment kill switch downgrades that subsystem tile to a red "disabled".
- **Infra:** **zero new functions** — `revoke-tokens` is a `?action=` branch on `system.js` (super-admin stays
  8/12). No schema/Firestore change (token revocation is an Auth operation, not a doc write). 100% token-themed
  (no hardcoded colors). Preferences are device-local (localStorage), not server state.
- **Consequence:** a complete admin self-service surface (credentials, session control, preferences, platform
  visibility, backup) without leaving the Vercel-Free budget. Security 2.5→2.6 (self-session revocation), Arch
  2.8→2.9, Bible 2.14→2.15.

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
  - **Pass 1b (SHIPPED) — thorough 100% dark mode:** re-tokenize the ENTIRE stylesheet + every view onto a
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
