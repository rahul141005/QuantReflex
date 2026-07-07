# QuantReflex Decision Log

**Architecture Decision Records (ADRs).** Each entry captures a decision, the context, the
options considered, and the consequences — so future readers understand *why*, not just *what*.
Newest first. Reference these IDs (`ADR-NNN`) from the CHANGELOG when a change embodies a decision.

Companion: [GOVERNANCE.md](GOVERNANCE.md) · [VERSIONS.md](VERSIONS.md) · [CHANGELOG.md](CHANGELOG.md)

---

## ADR-104 — Phase-1 verification hardening + Phase-2 dead-code prune (2026-07-07)
- **Context.** An independent adversarial re-review of Phase 1 (ADR-103) before starting Phase 2. Phase 1 held up —
  every roadmap objective was confirmed delivered (stagger to the 12th section + cap, runtime version line,
  reconciled Guide audience, `exam-relevance.js` "Quant 1–36" = exactly 36 entries, the `learn-progress.js` fallback
  comment accurate since only the 7 Quant data files set `revisionIntervalDays`, no reachable guest/Explain
  regression because the app is login-gated, governance + tests green). The review surfaced **three** genuine gaps in
  the free-explain feature and cleared the way for the Phase-2 cleanup. `v222` is unreleased, so all of this rides the
  same `v222` (no re-bump; the `update.check` SW↔`QR_APP_VERSION` lockstep stays satisfied).
- **Verification-pass fixes (free-explain hardening).**
  - **Refund on empty failure (correctness).** `aiBrain.explainBase` guards only LLM generation (its catch returns a
    usable fallback envelope = content, so that path rightly keeps the credit), but `ctxEngine.build(uid)` + setup run
    *outside* any try/catch — a throw there surfaces as a 500 with the free credit already consumed and nothing shown.
    Added `aiService.refundFreeExplain(uid)` (transactional `explanationsUsed = max(0, n-1)`, clamp-at-0,
    cache-coherent, best-effort — mirrors `refundWordProblemQuota`) and wired it into the `api/ai.js` dispatch `catch`
    to fire **only** when `req.freeExplain` was granted. The clamp is a pure `freeExplainPolicy.freeExplainRefund`
    (single-sourced, unit-tested). Net: a transient server error never silently burns one of a user's 5.
  - **Proactive lock after the 5th (UX).** When the server echoes `freeExplain.remaining === 0`, `companion-ui`
    flips the session exhausted flag so the Explain button shows 🔒 on its next render instead of wasting a 6th tap
    that the server would 403.
  - **`ai_explain` paywall copy — investigated, deliberately NOT changed (→ Phase 5).** The reword was unsafe: the
    `ai_explain` paywall key is shared by **three** exhaustion sources — the real QuanAI Explain (drill/duel/
    companion), the local rule-based auto-tip (`drill-engine.js` `_buildAutoTip`, `qr_explain_credits`), and the
    word-problems free-limit (`ai-features.js`). A 5-free-explanations line would misdescribe the other two. The
    specific "used all 5" message is already surfaced at the explain source (companion) and the word-problem source
    (its own error text), so nothing is user-facing-wrong. The shared-key mismatch is an entitlement-key cleanup
    deferred to Phase 5 ("tidy the paid/free system").
  - Tests: `scripts/free-explain.check.js` extended with refund assertions (give back exactly one, clamp at 0,
    consume-then-refund round-trips) — 26 assertions, green.
- **Phase-2 — "Clean up behind the scenes" (dead-code prune).** Each removal grep-proven dead first, then re-verified
  by `npm test` + a Playwright DOM-integrity smoke.
  - **ARC-1 — dead HTML ids.** `#masterySection` / `#timeSection` (`index.html`) were referenced nowhere in JS/CSS
    (unlike `weakestSection` / `recommendationSection`, which are entitlement-toggled via `_toggleSection`). Removed
    just the two dead ids; the `.analytics-section` wrappers and their live children (`#statsMastery` / `#statsTime`,
    populated by `stats-view.js`) are untouched. Smoke confirmed the sections still render and the ids are gone.
  - **ARC-3 — small dead ends.** Removed the never-read `onShare: function(){}` passed to `DuelUI.renderResults`
    (`duel-manager.js`); consolidated the duplicated custom-practice default (`practice-config.js` seeded
    `totalQuestions` with a literal `20` beside `_CUSTOM_DEFAULT_QUESTIONS = 20`) so the constant is the single source
    (reordered so the state seeds from it). **Kept** `api/ai?action=wordproblems` (intentional future-ready infra with
    live quota plumbing; paid-system-adjacent → Phase 5).
  - **LRN-1 — scaffold subsystem: RETAINED, not pruned.** The `status === 'scaffold'` paths in `learn-view.js`
    (+ `schema.js` `STATUSES`) are dormant (all 62 topics `published`), but scaffold is a deliberate, low-cost
    extensibility seam — the honest way to stage future "coming soon" topics — and the content-quality gate depends on
    the `published`/`scaffold` split. Pruning it would remove a capability that makes *later work safer* (the opposite
    of Phase 2's intent); the audit explicitly sanctions keeping it with a note. Added concise "retained seam" comments
    at `schema.js` `STATUSES` and the primary `learn-view.js` scaffold site; **no behavior change**.
  - **Already done / consciously declined.** The ADR-092 legacy-Learn CSS follow-ups (`.learn-jump-*`,
    `.learn-group-*`, `.search-highlight`, `learn-searchable`) grep to **0 matches** — pruned in a prior pass, nothing
    to do. **ARC-2** (`_renderDailyQuota` misfiled but functionally correct) and **ARC-5** (`answer-format.js` path
    nit) are left as-is — moving working, loaded/required code is pure churn/regression risk for zero behavior change.
- **Consequences.** The "5 free" promise is now fair under transient failure and doesn't waste a tap at exhaustion;
  the codebase sheds genuinely-dead ids/keys and de-duplicates a constant while preserving a useful extensibility seam.
  No schema/rules/index change; no version re-bump (unreleased `v222`).

---

## ADR-103 — Free-tier AI-explanation allowance (5 lifetime) + Phase-1 polish (2026-07-07)
- **Context (from the product audit → Phase-1 roadmap).** The upgrade screen has long promised free users a taste of
  the real QuanAI "Explain" feature, and the codebase even carried a `FREE_TIER_LIMITS.AI_EXPLANATION_CREDITS = 5`
  constant — but it was **dead**: `api/ai.js` 403'd **every** AI action for any non-premium user before the action was
  even read, so free users actually got **zero** explanations. The promise and the product disagreed. The user's
  explicit instruction was to *keep* the promise and *honour* it — grant the 5, don't delete the copy. Bundled with a
  batch of safe Phase-1 polish (fade-in stagger, audience wording, single-sourced version line, stale-comment fixes).
- **Decision — grant 5 free lifetime "explain" calls, server-authoritative.** Every free account may use the real
  Explain feature **5 times, lifetime**; the 6th returns the upgrade prompt. Premium stays unlimited. Enforced on the
  server so clearing browser storage can't reset it.
  - **Reuse the existing meter, no new schema.** The count lives on the field admin dashboards already read —
    `users/{uid}/usage/ai.explanationsUsed` (seeded 0 at register). The limit (5) + the pure grant decision live in a
    new dependency-free module **`services/freeExplainPolicy.js`** (`freeExplainDecision(used, limit)` →
    `{ ok, remaining }`), the single source of truth, unit-tested in isolation. It mirrors the canonical
    `shared/constants/entitlements.js` value; a serverless fn can't `require('../shared/...')` at runtime (ADR-099 /
    `report-schema.js`), so the number is declared in the policy module and kept in lockstep.
  - **Race-safe consume.** `aiService.consumeFreeExplain(uid)` wraps the decision in a Firestore **transaction**
    (mirrors the proven `consumeWordProblemQuota` / `enforceAiThrottle`): read `explanationsUsed`, deny at ≥5, else
    increment and return the remaining count — so concurrent taps can never over-grant past 5.
  - **Gate re-order (`api/ai.js`).** Was `kill-switch → premium-403 → throttle → budget → dispatch`. Now
    `kill-switch → throttle → budget → entitlement → dispatch`, where entitlement is: premium → proceed; else
    `action === 'explain'` → consume a credit (or 403 `PREMIUM_REQUIRED`); else → 403. Throttle + budget run **before**
    the credit is spent, so a throttled/over-budget request never burns one. The free path is guarded on the **exact
    string `'explain'`**, so coach/insights/chat/planner/wordproblems stay fully premium — no cost leak.
  - **Counter de-dup (the top risk).** `trackExplanationUsage` (fire-and-forget telemetry) also incremented
    `explanationsUsed` for everyone; left alone it would burn a free user's 5 down twice as fast. Fixed by gating that
    call to **premium only** — free users are metered by the transactional consume, premium by telemetry. One writer
    per user type; the field stays an accurate total.
  - **No refund path (deliberate, Phase-1 scope).** `aiBrain.explainBase` catches its own LLM failure and returns a
    graceful fallback envelope (the correct answer + a retry affordance) rather than throwing, so a consumed credit
    **always** buys usable content. A manual retry after a rare generation failure spends another credit — an accepted
    minor edge; a `refundFreeExplain` mirroring `refundWordProblemQuota` is a possible future nicety.
  - **Client (the gate change is local).** The drill Explain button (`drill-engine.js`) and the duel-review Explain
    (`duel-manager.js`) previously called `canAccessFeature('ai_explain')` and opened the paywall without ever calling
    the API. They now use a new `canOpenExplain()` (premium → allowed; free → allowed until the server reports
    exhaustion), so a free user actually reaches the server, which is the true gate. `ai_explain` in
    `_LOCKED_FEATURES` is **left flipped on** — the change is scoped to these two buttons so no other surface is
    affected. `companion-ui` shows a subtle "N free explanations left" note from the echoed `freeExplain.remaining`,
    and on a `PREMIUM_REQUIRED` for explain it surfaces the server's friendly "used all 5" message, flips a
    session-only exhausted flag (button shows 🔒 for the rest of the session), and opens the paywall.
- **Verification.** New `scripts/free-explain.check.js` (wired into `npm test`, 19 assertions) locks the pure
  decision: grants #1–#5, denies #6, never over-grants across a lifetime, honours a custom limit, handles corrupt
  input. The transaction wrapper + gate ordering + de-dup + strict `'explain'` guard are contract-reviewed (need a
  live Firestore/Vercel runtime, like prior server-path changes). Full suite green. `APP_VERSION` v221→**v222** +
  `QR_APP_VERSION` lockstep (client JS changed). No Firestore rules/index change — the `usage/ai` doc + field already
  exist and are already server-write-only.
- **Phase-1 polish (same ship, copy/CSS/doc only — no logic).** Fade-in stagger extended past the 6th section on the
  About modal + App Guide (`style.css`, with a `nth-child(n+13)` safety cap); App Guide "Built for" audience
  reconciled with the About modal + onboarding (MBA/Banking/Government/Foundation, not School/NTSE); the About version
  line now reads from `QR_APP_VERSION` at runtime so it can't drift; corrected genuinely-stale current-state comments
  (`categories.js`, `exam-relevance.js` "Quant 1–36", `learn-progress.js` revision-interval fallback), the
  coaching-admin README status ("Functional API … with a lean UI"), a present-state note on `ROADMAP.md`, and two
  curly-quote stragglers in the App Guide.
- **Consequences.** The promise on the upgrade screen is now true; the dead constant is load-bearing; the free→paid
  funnel gets a real, bounded taste of QuanAI with a server-enforced cap that survives storage clears. Deferred (per
  the user's upcoming Premium/paywall work): a cross-session exhausted-button hint.
- **Verification-pass follow-ups (2026-07-07, see ADR-104):** an adversarial re-review added a refund path
  (`refundFreeExplain`) so a pre-generation server error can't burn a credit, and a proactive session-lock when the
  5th is spent. The `ai_explain` paywall-copy reword was investigated and deliberately declined (shared key) → Phase 5.

---

## ADR-102 — Unified in-app Update System across all three apps (2026-07-06)
- **Context:** only the **main app** had an in-app "update available → Update App" experience. The **Super-Admin**
  and **Coaching-Admin** PWAs each shipped a service worker (`sw.js`) but registered it bare — no update detection,
  no affordance, no way for an admin to pull the latest build without a manual hard-refresh, so an admin could sit
  on a stale cached bundle indefinitely. This pass gives all three apps the **same** update experience and unifies
  the mechanics behind **one shared, behavior-preserving module**.
- **Decision — one shared engine, per-app presentation.** New canonical **`shared/update/update-manager.js`**
  (`QRUpdateManager`) owns 100% of the mechanics — SW registration, update detection, version checking,
  skip-waiting, cache purge, the one-shot reload, race/loop avoidance, dedup + post-reload state — and exposes only
  **state + actions** (`init({swUrl, appKey, onUpdateAvailable, onUpdated})`, `isUpdateAvailable()`, `applyUpdate()`).
  Each app supplies ONLY its presentation (its themed toast + Update button), so the UX is native to each app while
  the flow/wording/mechanics are identical.
- **Cross-root copy pattern (reuses the ADR-099 fix).** `shared/` is outside every app's Vercel deploy root, so a
  cross-root `../shared/*.js` load returns `index.html` in production (the ADR-099 P0). The single implementation is
  therefore the canonical file **plus a byte-identical app-local copy** in each app
  (`main-app/js/services/update-manager.js`, `super-admin-app/js/ui/update-manager.js`,
  `coaching-admin-app/js/ui/update-manager.js`), regenerated by `scripts/sync-update-manager.js` and kept honest by
  `scripts/update.check.js` (wired into `npm test`) — the same single-source-of-truth-with-lockstep-check idiom as
  `report-taxonomy.js`.
- **Behavior-preserving main-app refactor.** `app.js`'s inline SW-registration + `_showUpdateToast` dedup + the
  post-reload success block, and `settings.js`'s `#updateAppBtn` cache-purge/skip-waiting/reload sequence, were
  replaced by calls into `QRUpdateManager`; the main app's toast DOM/copy/click→Settings and always-present Update
  button are unchanged. Proven identical by a Node behavioral harness before the switch. SW gains a `GET_VERSION`
  handshake; `APP_VERSION` v220→**v221** + `QR_APP_VERSION` lockstep.
- **Admin adoption (native-themed, identical flow).** Both `sw.js` files gain an `APP_VERSION`-derived `CACHE_NAME`
  (`qr-admin-cache-v13`, `qr-coach-cache-v3`), the `GET_VERSION` handshake, and the main-app **network-first JS/CSS
  (3s timeout) + cache-first assets + cached-`index.html` nav fallback** fetch strategy (was cache-first — this is
  what prevents stale admin assets). They **deliberately keep no `skipWaiting()` on install** (an admin panel must
  not swap its SW mid-session; the waiting-worker also makes the conditional button meaningful) — a documented,
  check-enforced per-app policy invisible to the user-facing flow. Each app registers via `QRUpdateManager.init`,
  renders a themed `.update-toast` (identical copy "🚀 New version available. Update from Settings", `role=status`,
  click → Settings, respects `.no-anim` / `prefers-reduced-motion`), and shows an **Update App button ONLY when an
  update is available** (Super-Admin: an Update card above the Settings tabs; Coaching: an Update card in the
  Settings view) — nothing is shown otherwise. `vercel.json` adds `Cache-Control: no-cache` +
  `Service-Worker-Allowed: /` for `/sw.js` (prompt update pickup). Also fixed a pre-existing gap: the super-admin SW
  now pre-caches `reports.js` (added in ADR-100 but never listed).
- **Correctness (from the SW-lifecycle pressure-test):** **version-scoped dedup** — the toast key is
  `<appKey>_update_v<newVersion>_<yyyymmdd>` (the incoming worker's version is obtained via a `GET_VERSION`
  MessageChannel round-trip; the page's own `QR_*_APP_VERSION` is the OLD version), so a genuinely new version
  always surfaces (incl. a second same-day deploy) while the same pending version never spams within a day and
  re-nudges the next day. **No `controllerchange` listener** anywhere (the reload is one explicit
  `location.href = location.pathname` navigation → no auto-reload trigger → no infinite loop). `applyUpdate` deletes
  **all** caches first, so the reloaded page fetches everything fresh regardless of which worker controls it (no
  stale/partial state). The `appUpdating` flag is consumed exactly once and dedup keys are swept on the post-update
  load. First-ever install (no controller) shows nothing.
- **Verification:** `npm test` green incl. the new `update.check` (32 assertions: byte-identical copies, SW
  `APP_VERSION` ↔ `window.*_APP_VERSION` lockstep per app, `CACHE_NAME` derivation, `GET_VERSION`/`SKIP_WAITING`
  handshake, `QRUpdateManager.init` registration with no bare `serviceWorker.register`, admin no-skipWaiting policy).
  A Node behavioral harness (18 assertions) proves detection/first-install-suppression/dedup/applyUpdate/post-reload/
  no-controllerchange; a Playwright harness (18 assertions) proves the native `.update-toast` renders with identical
  copy + themed styling against each admin app's real stylesheet and the module parses + exposes its API in a real
  browser. `node --check` all touched JS; both `vercel.json` valid. Real SW activation / Vercel headers / separate
  deploys can't run headless — built to contract + the correctness walkthrough + code review.
- **No new infra / no Firestore rules/index/schema change** (Vercel-Hobby + Spark intact). SW versions: main
  v220→v221, super-admin cache v12→v13, coaching cache v2→v3.
- **Adversarial verification-pass fixes (same changeset):** three independent audits confirmed the system
  sound and surfaced a small set of real defects, all fixed: (1) a Settings-filed *question* report wrongly
  hid "Bad options"/"Diagram or image" — the mcqOnly/figureOnly gating now applies only when a live question
  is attached; (2) **D1** — on a `GET_VERSION` timeout the module always toasts and never writes a shared
  version-less dedup key (a genuinely new version can't be suppressed by an earlier same-day timeout); (3)
  **D2** — a newer version replacing the waiting worker in a long session re-notifies (dedup is per distinct
  incoming version, not once-per-load); (4) **O2** — both admin SWs return an explicit 503 instead of
  `respondWith(undefined)` for an uncached+offline asset/nav fallback; (5) **O4** — `update.check` now
  verifies the real `QRUpdateManager.init` call in `app.js`, not a comment; (6) the legacy unprefixed
  `appUpdating` flag is consumed once on the v220→v221 upgrade so the success toast isn't missed. Separately,
  the **Settings Contact card was redesigned** as a standalone premium card adopting the About modal's
  `.info-block` design language (radius/shadow/border/padding/dark-mode matched — 16 computed-style assertions
  in light+dark) while keeping its avatar + tap-to-email + tap-to-copy affordances.

## ADR-101 — Reporting final hardening pass: from-scratch adversarial re-audit + confirmed fixes (2026-07-06)
- **Context:** a fresh, from-scratch adversarial verification of the *entire* reporting system (three independent
  audits — client/Learn/MCQ/Contact, backend/schema/lockstep, super-admin/AI-completeness) run under the standing
  order to *distrust every prior pass and try to disprove correctness*. The feature is fundamentally sound
  (AI-explanation reporting is complete across all three surfaces — drill wrong-answer, drill review, duel review;
  XSS escaping is clean; the deterministic-`clientKey` write is race-safe; the six-surface enum lockstep holds), but
  the audit surfaced one genuine **data-loss** bug, one **schema-invariant / junk-report** hole, a lingering
  **"impossible reason offered"** assumption (the twin of the MCQ one), a **false "topic" search affordance**, a
  **broken clipboard-reject** path, and several polish/hardening gaps. Every item was verified against code before
  fixing. No new features; no Firestore rules/index change (all `classification.type` values remain index-agnostic).
- **A · Correctness / data integrity.**
  - **A1 — Server dropped the LR `figure` (data loss).** `report-context.js snapshotQuestion` captured `q.figure`,
    but the server `sanitizeQuestion` whitelisted only `chart`/`optionFigures` — so a **visual LR** report (the
    reason that most needs the picture) stored no figure. Fixed: `sanitizeQuestion` now captures `figure`
    (byte-cap-guarded alongside `chart`/`aiContext`).
  - **A2 — Fabricated `ai`/`learn` bundle defeated the substance guard + violated the schema invariant.**
    `sanitizeAi`/`sanitizeLearn` ran unconditionally, so `{type:'bug', learn:{topicId:'x'}}` was accepted (non-empty)
    and a `bug` doc stored a `learn` bundle. Fixed: `ai` is gated to `source==='ai_explain'` and `learn` to
    `source==='learn'` (null otherwise) — mirrors the existing `question` source-gating.
  - **A3 — `visual` reason offered where impossible (twin of the MCQ assumption).** ADR-100 gated `options_wrong`
    with `mcqOnly`, but "Diagram or image" (`visual`) still showed for pure-text/numeric questions with no chart/
    figure/optionFigures. Fixed: added `figureOnly:true` to `visual` (shared + browser taxonomy); the in-drill grid
    now drops `figureOnly` reasons when the live question carries no visual (`_hasVisual`, mirrors the `mcqOnly` gate).
  - **A4 — Contact copy showed a false success on async clipboard rejection.** `navigator.clipboard.writeText(...)
    .then(done, done)` toasted "✅ Email copied" even on a denied-permission reject and never tried the `execCommand`
    fallback. Fixed: on reject, run the `execCommand` fallback and only toast success when a copy path *actually*
    succeeded (`_execCopy`/`_copied`/`_copyFailed`).
- **B · Super-Admin moderation.**
  - **B5 — Learn topics weren't searchable** though the placeholder promised "topic". The light row shape omitted
    `learn`. Fixed: `_shapeRow` includes a compact `learn:{topicId,title}`; the text filter also matches
    `learn.title`/`learn.topicId`.
  - **B6 — no per-type analytics breakdown.** Added `byType` counts (a `count()`-aggregation loop over an inline
    lockstep-checked `TYPES` list — same O(1) pattern as byStatus/byPriority), rolled up to a compact per-family
    strip in the dashboard.
  - **B7 — `pageLocalSearch` banner misled** on a pure type/priority filter with no text. Fixed: shown only when a
    text query is active.
  - **B8 — duel-review AI report mislabelled answer type** (no options → `isMCQ:false` → "Typed answer" for an MCQ
    duel question). Fixed: omit the Answer-type line for duel-sourced reports rather than assert a guessed mode.
  - **B9 — `.report-fam-other` had no CSS** (the `_typeFamily` default) → a future/unknown type rendered unstyled.
    Fixed: neutral default rule.
- **C · Hardening / cleanup.**
  - **C10 — offline queue could drop a valid report on 401/409.** A transient token-reject (401) or session-replaced
    (409) during a flush was treated as terminal. Fixed: 401/409 are retryable (kept + retried after re-auth) —
    closes the last gap in "never lose a report".
  - **C11 — `report.check.js` blind spots** hardened so ADR-100's drift classes can't recur: assert the super-admin
    `TYPE_META` + `FAMILY_LABELS` + `TYPE_FILTER_GROUPS` + inline `TYPES` list cover every taxonomy type (not just
    `TYPE_LABELS`/`SUBREASON_LABELS`); JSON-schema `learn`/`ai` object property sets match the sanitiser outputs;
    `visual.figureOnly` (shared⇄browser); `sanitizeQuestion` keeps `figure`; the `ai`/`learn` bundle is stripped on a
    non-matching source; a fabricated bundle no longer satisfies the substance guard. Replaced the vacuous `ok(...,
    true)` assertions. → **675** assertions.
  - **C12 — dead code:** removed the unused `earliestFuture` reduce in `report-queue.js flush()`.
  - **C13 — Learn report on scaffold ("coming soon") topic pages.** The report line lived only in the chapter
    footer, which scaffold pages skip. Fixed: extracted `_reportTopicLine` and surfaced it on scaffold pages too, so
    "every topic page exposes a report action" holds.
- **Deliberately NOT changed (documented):** the minimal `_FALLBACK_TYPES` stays small (last-ditch net if the
  taxonomy 404s); `answerFormat` remains best-effort (explicit name, else `QRAnswerFormat` kind — documented
  dual-space); no per-topic Learn aggregation (question-only by design).
- **Verification:** full `npm test` green; `report.check.js` **675/0**; Playwright sweep **83/0** (adds: MCQ-no-figure
  shows 11 reasons with `visual` hidden + `options_wrong` shown; a figure MCQ shows all 12 + `figure` round-trips into
  the payload; typed shows 10; all prior ADR-099/100 cases). `node --check` all touched JS; JSON schema valid; boot
  smoke clean. Vercel/Firestore/Super-Admin runtime paths reviewed to contract (can't execute here), documented.
- **No new infra / no rules or index deploy** (Vercel-Hobby intact). SW v219→v220. **Governance:** FIRESTORE_BLUEPRINT
  (`question.figure` now captured; `ai`/`learn` strictly source-gated); CHANGELOG; VERSIONS (Bible + Firestore).

## ADR-100 — Reporting production sign-off: Learn reports · MCQ-vs-typed · Contact card · admin moderation (2026-07-06)
- **Context:** the final production sign-off for the reporting feature (ADR-096→099). Five owner-requested gaps,
  each grounded in a fresh code audit. No regressions to the ADR-099 experience; no Firestore rules/index change.
- **1 — Learn topic reporting (new `source:'learn'`).** Learn chapters had only a "Practise this" CTA. A deliberate,
  low-emphasis **"Spotted a problem in this chapter? Report it"** line now closes the end-of-chapter reading spine
  (`learn-view.js` `_buildChapterFoot`; `.kx-report-line` — secondary to the filled Practise primary, always
  discoverable). It opens a **purpose-built** Learn flow (a sibling of the AI flow, not the generic chooser): a new
  `learn_issue` type in its own `learn` group with sub-reasons (concept · formula · explanation · typo · formatting ·
  visual · outdated · other — no AI reason, since **Learn ships no AI surface**), a chapter context banner, and 2-tap
  submit. The chapter is attached as a top-level **`learn` field** `{topicId, title, category, subject, difficulty,
  examFrequency, route}` (symmetric with `ai`); there is no Learn content version in the knowledge schema, so none is
  captured (the app version lives in `context.app.version`). No `questionSignature` for Learn (no per-topic aggregate
  in v1 — `questionReports` stays question-only). `learn_issue` is index-agnostic → no new index/rules.
- **2 — MCQ vs typed-answer correctness.** MCQ was inferred only from `!!(q.options && q.options.length)`, but the
  in-drill grid offered **"Bad options"** for every question — wrong for typed/numeric (fraction/ratio/decimal/
  negative) questions. Added an `mcqOnly` flag to `options_wrong` and the grid now **drops MCQ-only reasons for typed
  questions** (data-driven, not a hardcoded id). The snapshot now carries a reliable **`isMCQ` + `answerFormat`**
  marker (server derives `isMCQ` from options if absent — defense-in-depth), the in-drill context header shows a
  "Multiple choice" / "Typed answer" chip, and Super-Admin shows an **Answer type** line — so the UI never says
  "options" for a typed question.
- **3 — Settings Contact card.** A premium support card in the Feedback section: "Contact QuantReflex" +
  `quantreflex@gmail.com`, a mail avatar, tap-to-email (real `mailto:` anchor — keyboard/semantics for free) and a
  copy button (clipboard idiom + `showToast('✅ Email copied')` + a brief copied state). Dark/light, 48px targets,
  new `mail`/`copy` qr-ico masks for Playful.
- **4 — Super-Admin moderation dashboard.** The list row now shows a **per-type icon + family badge** (Question 📝 ·
  QuanAI 🤖 · Learn 📚 · App 🐞 · Account 💳 · Idea 💡) + the specific reason, so a moderator distinguishes report
  kinds at a glance; a grouped **type/category filter** `<select>` (sends the existing API `type` param) joins the
  status chips + priority + search (now also matching topic titles). Detail view adds a first-class **Learn topic
  block** (no more empty "not tied to a question" state for Learn) and the **Answer type** line; `_shapeRow` exposes
  the `learn` field; `SUBREASON_LABELS` + `TYPE_LABELS` cover the new type + sub-reasons.
- **Verification:** `report.check.js` → **595** assertions (adds `learn` to VALID_GROUPS, `learn_issue` 4-surface
  lockstep, `mcqOnly`, `sanitizeLearn`, `isMCQ`/`answerFormat` capture, JSON `learn` object + source enum, a typed
  fraction round-trip). Playwright sweep → **77** (adds: typed question hides "Bad options" + keeps answer/solution,
  "Typed answer" chip, isMCQ=false + fraction in the payload; MCQ still offers options + "Multiple choice"; the Learn
  flow reason grid, topic bundle in the payload, no question/ai, no AI reason). All prior ADR-099 cases + full suite
  green; real-app boot smoke confirms `learn_issue` in the taxonomy + AuthValidators load from origin.
- **No new infra / no rules or index deploy** (Vercel-Hobby intact). SW v218→v219. **Governance:** FIRESTORE_BLUEPRINT
  (`learn` field + `learn_issue` type + `source:'learn'` + question `isMCQ`/`answerFormat`); CHANGELOG; VERSIONS
  (Bible + Firestore — new type + field).

## ADR-099 — Reporting: P0 taxonomy-load fix + premium bottom-sheet redesign (2026-07-06)
- **Context:** the owner's screenshots showed the "Report a problem" sheet rendering with an **empty body** (title +
  one sentence, no options). An independent code trace proved this was **not weak design — it was a production load
  bug.** The modal reads its type list from `window.ReportTypes`, defined only in `shared/constants/report-types.js`,
  loaded via `<script src="../shared/constants/report-types.js">`. But **the main app deploys rooted at `main-app/`**
  (its own `vercel.json`); `shared/` is a SIBLING *outside* that deploy root, so `/shared/constants/report-types.js`
  matched the SPA catch-all rewrite `"/((?!api/).*)" → "/index.html"` and returned **HTML** → `Uncaught SyntaxError`
  → `window.ReportTypes` undefined → `_types()` returned `[]` → **empty grid, no fallback.** Reporting had therefore
  been effectively unusable in production since ADR-096 (the earlier Playwright harness masked it by loading a *local*
  copy). The **same bug** hit `../shared/validation/auth-validators.js` but degraded *silently* (auth.js guards
  `typeof AuthValidators !== 'undefined'`), so client-side email/password validation was quietly skipped in prod too —
  a second latent bug fixed this pass.
- **P0 fix — serve the taxonomy from the main-app origin.**
  - New **`main-app/js/ui/report-taxonomy.js`** — the browser taxonomy (dual-export `window.ReportTypes`), a
    byte-for-byte copy of the canonical `shared/constants/report-types.js` enum data, served same-origin so it can
    never 404. `index.html` now loads it (and the old broken `../shared` tag is gone).
  - New **`main-app/js/utils/auth-validators.js`** — local copy; `index.html` repointed off `../shared/…`. Restores
    client-side auth validation.
  - `report-modal.js` `_types()`/`_groups()` gain a **defensive fallback** (a built-in core set + a one-time
    `console.warn`) so an empty grid can never recur silently, even if the taxonomy fails to load.
  - `report.check.js` now enforces a **4-surface lockstep**: browser taxonomy ↔ shared spec ↔ server inline copy ↔
    Super-Admin label maps. Both new files added to `service-worker.js` ASSETS.
- **Enriched taxonomy (index-safe).** Question-family reasons stay **top-level `type` values** (so
  `questionReports.topReasons` keeps a per-reason count) — enriched, each with an icon + one-line helper:
  `answer_wrong · solution_wrong · explanation_wrong · options_wrong · formula_wrong · typo · visual · unclear ·
  difficulty_mismatch · wrong_topic · duplicate · question_other` (12; replaces the vague `question_wrong`/`formatting`).
  App: `bug · crash · ui_issue · performance`. **New `ai` group** for `ai_issue` (its own reason set: wrong_answer ·
  flawed_reasoning · hallucination · incomplete · confusing · formatting · other). Account: `payment · account`.
  Ideas: `feature_request · feedback · other`. Every type is just a new `classification.type` string — the existing
  `(classification.type, createdAtMs)` composite index is value-agnostic, so **no new index and no rules change**.
  Legacy ids (`question_wrong`, `formatting`) retained in the Super-Admin label map so pre-ADR-099 rows still label.
- **Premium redesign — a companion-style bottom sheet.** The report modal was a generic centred glass box; it's now
  a **sibling of the QuanAI explanation sheet**: `.report-sheet-overlay` (z-index 700, backdrop blur) → `.report-sheet`
  (grabber, drag-to-dismiss >90px, `rptRise`, responsive→centred ≥600px, dark + reduced-motion + safe-area aware).
  Every entry point shares the shell but is purpose-scoped:
  - **Settings** opens a **guided chooser** (5 rich category rows: icon + title + one-line helper) → the scoped reason
    grid → an optional detail step. No more bare grid.
  - **In-drill** opens straight to a **contextual question header** (auto-built chips: Question N/count · topic ·
    difficulty · session type + a question preview — the user types nothing) above the 12-reason grid, with a quiet
    "Not about this question →" escape to the full chooser, and reassurance copy ("Your session is safe — sending this
    won't end your drill").
  - **AI** opens a **purpose-built QuanAI reason grid** + a read-only "what's attached" line (question + explanation +
    QuanAI version — never a provider/model, per ADR-098).
  - Substance guard hardened: a question report filed from **Settings** (no live question attached) now requires a
    note (server + client), so it can't be an empty row. Terminal-error re-renders still restore typed text.
  - The in-drill **⚑** button now renders via `qrIco('flag','⚑')` (a new `flag` mask so Playful paints it, not a dot).
  - Full states retained/restyled: rise/drag/Escape/backdrop close, sending, success (QuanAI-voice reassurance +
    reference id + "Back to practice"/"Done"), offline ("Saved — it'll send itself…"), inline retry, focus-trap + aria.
- **Verification:** `report.check.js` → **518** assertions (adds the 4-surface lockstep, new-taxonomy validity, the
  Settings-question substance guard, legacy-id removal). A rebuilt Playwright sweep → **54** assertions loading via the
  **local** taxonomy path (proves the grid renders), driving all three flows + payloads, the QuanAI no-leak guard, the
  offline queue, the defensive fallback, Escape/backdrop, responsive centring, and z-index layering. A real-app boot
  smoke confirmed `window.ReportTypes` **and** `AuthValidators` now load from the app origin. All prior suites green.
- **No new infra, no rules/index deploy needed** (Vercel-Hobby architecture intact). SW v216→v217 (`QR_APP_VERSION`
  in lockstep). **Governance:** FIRESTORE_BLUEPRINT (enriched `classification.type` list; browser taxonomy is now
  main-app-local); CHANGELOG; VERSIONS (Bible + Firestore — type value-set change).
- **Final verification pass (fresh adversarial re-audit — 3 independent agents + owner review).** Confirmed the
  design is sound and fixed every real defect found; no taxonomy/schema change (SW v217→v218 for the client fixes):
  - **[HIGH] In-drill report didn't pause the session clock** → a Timed/Reflex/Mock run kept ticking under the
    sheet: the global timer could `finish()` (END the test) and the per-question timer could `checkAnswer('',{timedOut})`
    (auto-mark wrong + auto-advance) while the user typed a report — falsifying "your session is safe."
    Fix: `_openReport` now silently freezes the session (`pauseSession(silent)` — no overlay/focus-steal) when a
    timer/auto-advance is live, and resumes via an `onClose` hook when the sheet closes.
  - **[HIGH] Duel-review AI reports lost the question text + signature** — the duel explain ctx passes
    `{questionText}` but `snapshotQuestion` read only `q.question`, so a reported duel explanation had a null
    question (no admin context, no aggregation). Fix: `snapshotQuestion` accepts `question` **or** `questionText`.
  - **[HIGH] Substance guard was bypassable via the spoofable client `source`** — `{type:'feedback',
    source:'ai_explain'}` (or `{type:'answer_wrong', source:'drill'}`) with nothing attached slipped through as an
    empty/junk row. Fix: the guard now gates on MATERIALIZED content (a real question snapshot / a real `ai`
    bundle), never on the declared source.
  - **[MED] Concurrent same-`clientKey` submits could double-file** (the pre-query dedupe is a non-atomic TOCTOU).
    Fix: the report doc id is now DETERMINISTIC (`ck-<uid>-<clientKey>`) with an in-transaction existence check, so
    a concurrent double-submit collapses into one row (and can't double-count `questionReports`); also closes the
    query-fail-open dedupe gap.
  - **[MED] Super-admin rendered `subReason` as a raw snake_case id** (the key AI-triage field). Fix: added
    `SUBREASON_LABELS`; `report.check` now asserts label coverage for every subReason (and the JSON-schema
    `classification.type` enum — a previously-unchecked 5th surface).
  - **[MED] Playful theme:** the report sheet's `close`/`back`/`send`/`check`/`robot` icons degraded to neutral
    dots (unbound qr-ico names). Fix: bound the masks (`robot`→`bot`) + sized the success ✅.
  - **[MED] Rating stars** exposed multiple `aria-checked` radios in one group → now exactly one; **reason/group
    rows** dropped `role="listitem"` on `<button>` (was hiding the button affordance from AT); touch targets bumped.
  - **[MED] Backdrop-tap / over-drag discarded a typed-into form** with no confirmation → both now no-op when the
    form is dirty (explicit ✕/Cancel/Escape still close).
  - **[LOW]** escaped drill→app reports no longer staple the irrelevant question snapshot; the offline queue keeps
    the NEWEST at the cap (was dropping the just-added report); reports get their own middleware rate bucket (can't
    429 the user's AI calls); a reported AI explanation now captures the FULL text (was capped at the 900-char AI
    anchor); the empty-report toast no longer mentions a rating a type doesn't have.
  - Verification: `report.check.js` → **541** assertions; Playwright sweep → **64** (adds the onClose/resume hook,
    escape-path question suppression, dirty-form backdrop guard, rating ARIA, button roles). All prior suites green;
    real-app boot smoke confirms `ReportTypes` + `AuthValidators` load from the app origin. SW v217→v218.

## ADR-098 — QuanAI product identity: no LLM/provider leakage in reporting (+ final-pass hardening) (2026-07-06)
- **Context:** a final independent verification pass introduced a hard product requirement — **QuanAI is the
  product identity; users must never learn which underlying LLM powers explanations.** No provider name
  ("openai") or model id ("gpt-4o-mini") may appear in the client UI, any client-reachable response, or any
  user-inspectable report payload (POST body / localStorage). Server-side telemetry is exempt. This **directly
  implicated ADR-097**, which (to capture generation config for admin debugging) had surfaced the raw model +
  `provider:'openai'` in the explain envelope `meta` (client-reachable via `/api/ai`), displayed "AI model:
  gpt-4o-mini" in the report modal's tech-preview UI, and carried it in the report POST body → localStorage →
  Firestore. An independent leak sweep traced the full 10-site chain.
- **Fix — one QuanAI-owned identifier, no provider/model client-side.** The safe identifier already existed:
  `promptId` = `explain.base@<version>` (a QuanAI prompt/version id that reveals nothing about the provider).
  - `services/aiBrain.js`: reverted the ADR-097 additions — the explain envelope `meta` no longer carries
    `model`/`provider` (removed `usedModel`, the cache-hit read, and the `model` cache-doc write). The real model
    stays ONLY in pre-existing server-side `recordAiRequest`→`aiRequests` telemetry.
  - `js/companion-ui.js`: the report `ai` bundle is `{ explanation, promptId }` (dropped model + the hardcoded
    `provider:'openai'`); `explainCtx` no longer holds a model.
  - `js/ui/report-modal.js`: scope-banner + tech-preview show the **QuanAI explanation version** (promptId), never
    a model; and `_submit` **whitelists** the outgoing `ai` bundle to `{explanation, promptId}` so no caller can
    ever leak a model/provider into the POST body or the offline queue.
  - `api/_lib/report-schema.js` `sanitizeAi`: keeps only `{ explanation, promptId }` — a hand-crafted client body
    sending `model`/`provider` is ignored, so it can never persist to Firestore or reach the Super-Admin view.
  - `super-admin-app/js/views/reports.js`: the AI block shows "Explanation version" (promptId), not Model/Provider.
  - Hygiene: scrubbed provider names from three **view-source-reachable** client-JS comments (companion-ui,
    ai-features, question-bank-service: "GPT"/"OpenAI" → "AI"). All other AI envelopes (coach/insights/planner/chat)
    were already clean.
  - **No new infra, no extra reads, no index/rules change** — a minimal revert; Vercel-Hobby architecture intact.
- **Final-pass audit fixes** (two independent agents confirmed the ADR-096/097 work is otherwise sound):
  - **AI reporting completeness — duel review.** `duel-manager.js` opens the same explanation sheet from post-match
    review; it now passes a minimal `reportCtx` (question text/answer/category + `isDuel`) so a report from a duel
    explanation also carries the item. AI-explanation reporting is now complete everywhere explanations appear.
  - **Analytics "oldest open"** now spans all open statuses (open/investigating/needs_info), matching `openTotal`
    (was strictly `status=='open'`, understating the backlog).
  - **`archived` filter chip** added to the Super-Admin list (it was settable but not filterable).
  - **`sanitizeQuestion` hardening** — `answer`/`selectedAnswer`/`options` scalars are now length-capped
    (`_capScalar`) so a crafted oversized value can't defeat the question byte-cap.
  - **`_adjustOpenCount`** now logs on failure instead of silently swallowing (openCount-drift observability).
  - **Report modal** now restores typed text + sub-reason + rating on a terminal-error re-render (no lost input).
  - **Lockstep test** extended to guard the Super-Admin VIEW's `TYPE_LABELS`/`STATUS_LABELS` (a new type/status can
    no longer silently render as a raw id).
- **Verification:** `scripts/report.check.js` → **254** assertions (adds QuanAI no-leak: `sanitizeAi` never returns
  model/provider, whole serialized payload has no gpt/openai token; + view-label coverage). Playwright browser
  sweep → **52** (adds: tech-preview shows the QuanAI version and no model even when handed a leaky bundle; POST
  body + offline localStorage carry no gpt/openai; promptId retained). All prior suites green. SW v215→v216.
- **Governance:** FIRESTORE_BLUEPRINT `reports.ai` amended to `{explanation, promptId}` (provider/model
  intentionally not captured); CHANGELOG; VERSIONS (Bible + Firestore).

## ADR-097 — AI-explanation reporting + reporting-system adversarial hardening (2026-07-06)
- **Context:** a fresh, code-first adversarial re-verification of the ADR-096 reporting system. The headline gap:
  **users could not report an AI-generated explanation from the explanation itself.** AI explanations render only
  in the Companion bottom-sheet (`companion-ui.js`), whose only chrome was refresh/close; `ReportModal.open` was
  reachable solely from Settings and the in-drill ⚑. The `ai_issue` type existed but was Settings-only and attached
  no AI content — the explanation text, model, and prompt version were never captured. (An adversarial check
  disproved the separate worry that Timed-Test/Mock lacked the ⚑ button — both reuse `createDrillEngine`, so it's
  present; only Duel omits it, by design.)
- **AI-explanation reporting (the fix).** A first-class **"Report this explanation"** ⚑ button now sits in the
  explain sheet header (`companion-ui.js` `openModal`, gated to `feature==='explain'`). It opens the report modal
  pre-scoped to the AI issue type and auto-captures, with zero extra taps: the **full question snapshot**
  (questionId/category/subtype/difficulty/correct answer/the user's answer/drill config — threaded from the drill
  engine's explain button as `{question, session}`), the **full AI explanation text**, the **model**, and the
  **prompt version** (`promptId`). **Server (one field):** `aiBrain.js#explainBase` now includes `model` (+
  `provider`) in the explain envelope `meta` (the model was already in scope for telemetry; also persisted in the
  explanation cache so cache hits expose it too) — `env.meta.promptId` already carried the prompt version. The
  report doc gains a top-level `ai:{explanation,promptId,model,provider}` field; a new `context.app.source`
  value `'ai_explain'`. Reporting an explanation is **2-tap** (pick a sub-reason → send) — no free text required,
  because the attached AI content is the substance. The Super-Admin Question tab renders an **AI explanation block**
  (model · provider · prompt version · full text) so an admin sees the exact generation config without reproducing
  it. Scope: the explanation only (not Coach/Insights/Planner). Still **NO email / NO attachments** (ADR-096 holds).
- **Confirmed bug fixes from the audit.**
  - **HIGH — Super-Admin list pagination dropped matching reports.** With an in-memory refinement active (text
    search, or `type` combined with `status`/`priority`) the "Load more" cursor pointed at the last *fetched* doc,
    so matches between the shown page and the fetch-window end were skipped forever. Fixed: cursor is now the last
    *displayed* row's id (re-scan resumes right after it, losing nothing); `hasMore = fullWindow || matched>limit`;
    a full window with zero shown rows advances from the last fetched id so scanning continues.
  - **`_str` deleted newlines/tabs** — the control-char strip `[\x00-\x1f\x7f]` collapsed multi-line
    description/repro/question/explanation into run-on text. Now preserves `\t\n\r`.
  - **Rating-only feedback was rejected** — a 5-star submit with no text was blocked (client + server). A present
    `fields.rating` now counts as content.
  - **Internal notes were written but never displayed** — the Actions tab now renders the note thread.
  - **Offline queue's `fatal` NO_AUTH drop** — unreachable, and would have violated "never lose a report"; a missing
    token is now treated as a transient failure (kept + retried).
  - **Rate-limit ran before dedupe** — an idempotent offline retry could be spuriously 429'd; dedupe (clientKey /
    type+signature) now runs first so a retry is recognized immediately.
  - Minor: star-rating state cleared on type-switch; the page-local-search banner persists across mutations; dropped
    a dead `reasonKey` local.
- **Verification:** `scripts/report.check.js` → **226** assertions (adds ai-bundle sanitize, `ai_explain` source +
  2-tap acceptance, rating-only, newline preservation, and a **tri-surface** enum lockstep incl. the super-admin
  copy). A Playwright browser sweep → **47** assertions (adds: the ai_explain payload carries the AI bundle +
  question snapshot and no forged uid/plan; the report overlay layers above a z-index:600 companion sheet;
  rating-only submits; multi-line survives). All prior suites green. **Honest scope:** the Vercel endpoints / real
  Firestore / the live Super-Admin UI still can't run here — built to contract + code-reviewed; the Firestore/UI-only
  fixes verified by reading.
- **Layering:** `.report-modal-overlay` raised to `z-index:700` (above the companion sheet's 600). **Governance:**
  FIRESTORE_BLUEPRINT (`reports.ai` + `source:'ai_explain'`), CHANGELOG, VERSIONS (Bible + Firestore). No rules or
  index change — the `ai` field needs neither. SW v214→v215 (`QR_APP_VERSION` in lockstep).

## ADR-096 — Ultimate Reporting System (bug reports, wrong questions/answers, feedback) (2026-07-06)
- **Context:** QuantReflex had no way for users to report a bug, a wrong question/answer/explanation, or send
  feedback, and no admin surface to triage such reports. This builds the full ecosystem: a premium in-app submission
  experience (Settings **Report a Problem** + a fast in-drill **⚑** button that auto-knows the current question),
  a scalable server-authoritative Firestore model, and a complete Super-Admin **Reports** section (dashboard,
  filterable/searchable master list, detail with Overview/Question/Context/History/Actions tabs, status/assign/
  priority/label/note/merge-duplicate actions, "reported N times" aggregation).
- **Owner directives (binding, incorporated with no options):**
  1. **NO email / external notification of any kind.** No mail transports, providers, SMTP, Resend/SendGrid/Nodemailer,
     env vars, mail abstractions, or placeholder email code. Reports are **fully self-contained in Firestore**; the
     **Super-Admin Reports dashboard is the source of truth** and every report appears there the instant the write
     commits. The system is fully functional with zero external services. **Future seam (no code now):** the single
     request-path handler (`/api/report` create) carries one comment marking where a future notify hook could be added.
  2. **NO screenshots / attachments in v1.** No Firebase Storage, inline images, thumbnails, compression, file input,
     or attachment subcollection. Instead we **maximize automatically-collected diagnostics** so a report reproduces
     the issue without any upload (app version, theme/appearance/target-exam, full device/runtime fingerprint, locale,
     route, recent JS errors, and — for in-drill reports — a complete question snapshot: generator identity, options,
     correct answer, explanation, exact drill config, and what the user had selected). **Future seam:** Firestore is
     schemaless, so a `reports/{id}/attachments/*` subcollection (or a `question.figures[]` field) can be added later
     with **zero breaking migration** — documented in `shared/schemas/report-schema.json`, implemented as nothing now.
  - Reporting is **free for all users** (never paywalled).
- **Hard constraints that shaped the design:**
  - **Spark plan → NO Cloud Functions triggers/schedules run.** All post-write work (the per-uid rate-limit + dedupe,
    and the `questionReports` aggregate) happens **synchronously in the request-path handler** — never a trigger.
  - **Admin SDK bypasses Firestore rules.** `reports`/`questionReports` are **server-write-only** (client all-deny,
    matching `coachings`/`auditLogs`); creation is only via `POST /api/report` (main-app, `withAuth`), triage only via
    `/api/admin/reports` (super-admin, `withAdminAuth`). Reporter identity + priority + status + `shortId` are assembled
    **server-side** — never trusted from the body.
  - **Cross-app server code is not shared** (separate Vercel deploys bundle per app root). The canonical enums live in
    `shared/constants/report-types.js` (browser + check); the main-app handler keeps a validated INLINE copy in
    `api/_lib/report-schema.js` and the super-admin handler inlines the status/priority enums; `scripts/report.check.js`
    asserts the main-app copy stays in **lockstep** with the shared constants.
- **Data model:** `reports/{autoId}` — `{id, shortId (QR-XXXX), createdAt/createdAtMs/updatedAt, questionSignature,
  reporter{uid,email,name,plan,coachingId}, classification{type,subReason,title,description,priority,fields},
  lifecycle{status,assignedTo,resolvedAt/By,duplicateOf,labels[],internalNotes[]}, context{app,device,locale,route,
  sessionId,recentErrors[],submittedAtMs}, question{…snapshot…|null}}`. `questionReports/{signature}` — the
  "reported N times" rollup `{count, openCount, firstAtMs, lastAtMs, sampleReportId, topReasons{}, category, subtype}`,
  maintained transactionally in the create path (`FieldValue`-free explicit increment so first-seen fields write once).
  16 types (question-family question_wrong/answer_wrong/options_wrong/explanation_wrong/typo/formatting/visual — all
  in-drill; app bug/crash/performance/ai_issue; account payment/account; other feature_request/feedback/other).
- **Offline safety:** `ReportQueue` (localStorage `qr_report_queue`) — a failed/offline POST is queued and flushed on
  `online` + boot with capped backoff; a client-generated `clientKey` idempotency key collapses a retry/double-submit
  into ONE row server-side (`findDuplicate`). Reports are never lost.
- **Verification:** `scripts/report.check.js` (212 assertions — enum lockstep, type cross-consistency, validation
  accept/reject + normalization, signature stability + 2000-item collision sweep, rate-limit + dedupe decisions,
  shortId format, context/question sanitizers + byte caps) wired into `npm test`; all prior suites green. A Playwright
  browser sweep (35 assertions) drove the modal from both entry points and asserted the POST payload carries the
  maximized auto-context + full question snapshot and **never** a client-forged uid/plan, the offline queue path, the
  success state, and Escape/aria behaviour. **Honest scope:** the Vercel endpoints, real Firestore writes, and the
  Super-Admin UI end-to-end cannot be exercised here (no Vercel runtime / admin claim / Firestore) — those are built
  to the documented contracts + reviewed against the conventions. No email/attachment paths exist to test — by design.
- **Governance:** rules (`reports`/`questionReports` all-deny) + composite indexes added; FIRESTORE_BLUEPRINT +
  SECURITY_ARCHITECTURE updated; SW v213→v214 (`window.QR_APP_VERSION` bumped in lockstep). Bible/Firestore/Security
  versions bumped. Owner deploys `firebase deploy --only firestore:rules,firestore:indexes` and grants the `admin`
  claim to view Reports; no email/attachment provisioning is required.

## ADR-095 — RC verification: pause regression fix + backlog execution (2026-07-03)
- **Context:** a release-candidate verification pass over the ADR-094 Critical/High fixes — evidence-based, not
  trust-based. Every fix was re-read from scratch and cross-validated by an independent adversarial review whose only
  goal was to disprove correctness. Result: **C1 (review re-queue) and H2 (authored-LR) verified correct** (shallow
  clone proven safe — nothing mutates `q.options` in place; all 15 new authored answers independently re-checked). But
  two real findings surfaced, then the Medium/Low backlog was executed.
- **F1 — regression introduced by ADR-094's H1, now fixed.** The new physical-keyboard handler fired **under the
  pause overlay**: `pauseSession()` sets `_paused` but never nulls `_numpadInput`/disables the input, so Enter graded
  the frozen answer (inflating elapsed time) and, in Reflex Drill, could schedule `nextQuestion` under the overlay —
  re-opening the ADR-087 D2 stuck state. The on-screen numpad is safe because the overlay (`z-index:200`; `.container`
  makes no stacking context) covers and pointer-blocks it, but keyboard events bypass that visual guard. Fix: the
  handler bails when `#drillPauseOverlay` is present (`js/ui/numpad.js`).
- **P1 — H3-extended (hard-tier de-dilution finished).** ADR-094 fixed 4 categories; the adversarial review + my own
  `TIER_KEYS` scan found the same "difficulty from number size, not reasoning" pattern in ~14 more — including
  `simple-interest` whose PRIMARY.hard still emitted the easy `si` key (the very bug ADR-094 claimed to kill), and
  `time-and-work` whose hard tier had **no unique hard archetype at all**. De-diluted: squares, simple-interest
  (PRIMARY repointed to find-rate), profit-loss, compound-interest, ages (PRIMARY repointed to a clean father-son),
  mixtures, number-properties, progressions, surface-area, trigonometry, quadratic, number-series, simplification,
  probability. Added a genuine hard archetype `inverseTogether` (given the combined time and one worker's solo time,
  find the other) for time-and-work, with its own recompute branch. `TIER_KEYS` updated in lockstep; the once-toothless
  "no earned-tier downgrade" guard is now meaningful across the board.
- **Backlog executed (re-prioritized):** P2 stats-view fingerprint now includes entitlement (premium cards unlock
  immediately after an in-session upgrade, not on the next answer); P3 added independent value-based recompute for the
  string-valued Quant archetypes (fractions fracToPct/pctToFrac/addFrac, ratios pctRatio/combine, mixtures
  alligationRatio) — +857 answers now cross-checked, so a bad table entry/broken conversion fails CI; P4 the Home
  daily-goal ring now uses the theme-aware `--qr-accent`/`--qr-success` (the referenced `--accent*` tokens were never
  defined, so it was theme-blind); P5 easy wins (category buttons →44px with no selection reflow; dark tertiary text
  contrast ≥AA; removed the dead duplicate `updateCoachingId`; accuracy zero-guard; limit-banner sourced from
  `getDailyQuestionLimit()` + `addEventListener` not inline `onclick`; `CACHE_NAME` derived from `APP_VERSION`);
  P6 a network-first fetch timeout so "lie-fi" falls back to cache instead of stalling first paint; P7 the documented
  localStorage legacy→canonical migration is now actually implemented centrally in the read helpers.
- **On review, NOT changed:** the word-problems `WP_MAX_QUESTIONS_PREMIUM` (25/session) vs `WP_PREMIUM_DAILY_LIMIT`
  (30/day) "mismatch" is two different axes and internally consistent — no fix needed.
- **Verification:** all 26 suites green (quant 113,909 assertions / 15,676 recomputed / 0 mismatches); Playwright —
  pause+keyboard inert then restored, review 2nd-encounter renders MCQ, keyboard entry works, all 15 de-diluted hard
  tiers emit only retained archetypes and grade in the real UI, stats unlock on entitlement flip, ring theme-aware.
  SW v210→v211.
- **Still deferred (documented):** drill chrome emoji→qr-ico (broad surface); Guided-Revision retrieval gate (UX
  behaviour change worth its own review); the `skipWaiting` vs update-toast model (needs a product decision); CSS
  split of the 430 KB stylesheet.
- **Follow-up (final RC pass, same day):** an independent re-review found the F1 keyboard guard was **incomplete** —
  it yielded only under the pause overlay, but the identical bypass still existed under the **exit-session dialog**
  (`#exitSessionModal`, which sets `body.modal-open` and is reachable mid-question): pressing Enter with it open graded
  the frozen answer and could advance the drill under the modal. Generalised the guard to bail under the pause overlay
  **or** any `body.modal-open` modal (`js/ui/numpad.js`), covering the exit dialog and any future blocking modal.
  Verified (Playwright): digits/Enter inert under both the pause overlay and the exit dialog, keyboard restored on
  resume/cancel. The AI-explain modal was confirmed already-safe (`hideCustomNumpad` nulls the input before it opens).
  Two other re-review findings were judged not worth changing: the legacy-migration shape concern (consumers already
  self-heal missing fields via `if (!p.x) p.x = …`, and a default-merge would introduce nested-reference aliasing),
  and the value-based recompute tolerance (generators reduce ratios; the net catches gross errors). SW v211→v212.
  Extending the same reasoning, the MCQ path had the identical class of gap — option `<button>`s stay focusable under
  an overlay, so keyboard Enter/Space (a synthetic click) could grade while paused / with the exit dialog open
  (confirmed via Playwright). Added a shared `_blockedByOverlay()` guard to both MCQ click handlers (single + set
  paths) in `js/drill-engine.js`; normal mouse/tap selection is unaffected (verified across all 10 visual categories).
  Net: no answer can be graded under any blocking overlay — via numpad, physical keyboard, or MCQ. SW v212→v213.

## ADR-094 — Full-repository audit: submission bug + Critical/High remediation (2026-07-03)
- **Context:** the owner commissioned a complete, first-principles repository audit, triggered by a P0 report that
  "users cannot submit answers in any drill or test session." The audit ran as three independent, evidence-based
  investigations (architecture/reliability, product/UX/education/design/accessibility, bug-hunt/engines/submission),
  each finding cross-checked against the code.
- **P0 disposition — the universal claim does NOT reproduce.** The drill-engine diff since the last-known-good commit
  is rendering-only; live reproduction graded correctly through every surface (numpad ↵, Enter, Submit, MCQ/figure
  tap), every mode (focus/quick/endurance/warmup/mock) and all question types. The apparent failures during
  investigation were harness artifacts (invalid category keys falling back to quant; the 20-question free daily limit
  tripping after ~20 submissions in one browser context). All three investigations independently debunked the
  hypothesised races/leaks (finish/checkAnswer is `_isFinished`-guarded and idempotent; listeners are GC'd by the
  full innerHTML rewrite; timers are cleared in cleanup; JSON.parse is centrally guarded).
- **Decision — fix the one real submission bug + the High-severity quality gaps; document Medium/Low as a backlog:**
  - **C1 (Critical — the real submission defect):** review mode re-queued a wrong MCQ mistake as a 4-field subset
    `{question, answer, category, subtype}`, dropping `options`. On its second encounter `isMCQ` (which needs
    `q.options`) was false, so a text-MCQ item (e.g. quantity-comparison, "Quantity I > Quantity II") re-rendered as a
    numeric numpad — its correct answer un-typeable. This is the defect whose symptom ("a keypad appears but I can't
    enter the answer") plausibly seeded the P0. Fix: re-queue a full clone (`Object.assign({}, q)`). `drill-engine.js`.
  - **H1 (keyboard/AT answer entry):** the answer input is readonly + never focused (a deliberate mobile invariant so
    the native keyboard never fights the custom numpad), which left keyboard-only, switch and desktop users unable to
    type numeric answers. Added a global keydown IN the numpad module that mirrors the click logic exactly (same
    `validateKeystroke`, 15-char cap, submit callback), auto-scoped by `_numpadInput` (null on MCQ + post-answer), gated
    to the format's allowed keys, never calling focus(). `js/ui/numpad.js`.
  - **H2 (authored-LR difficulty honesty + depth):** the engine's tier fallback (`sub.length ? sub : pool`) dumped the
    whole mixed-difficulty bank when a tier was thin, so picking Easy could silently serve Hard; and thin tiers
    (Decision had ONE easy item) caused heavy repetition. Fix: a tier-aware `_tierPool` that prefers the exact tier,
    then the nearest EASIER neighbour before a harder one; plus a content pass raising Statement/Cause/Course to 4
    easy / 5 hard and Decision to 4 easy (77 → 92 approved items, all through `lr-authored.check`). Answer keys of the
    new Course items were diversified (the bank skewed heavily to "Only I follows").
  - **H3 (Quant hard-tier de-dilution):** several hard pools re-included their own easy/medium archetypes (only the
    number range differed), so the ADR-083/093 "difficulty is earned" contract was only half true — and the check's
    "no earned-tier downgrade" guard was toothless because the shared keys made its `easyOnly` set empty. Fix:
    percentages hard = {pctChange, successive, netTrap}; ratios hard drops the easy `divide`; averages hard = {weighted,
    newMember}; multiplication moves the non-scaling `mentalSquare` down to medium (its true level) and keeps hard as
    magnitude-scaled multiply/divide/threeFactor. `_PCT_PRIMARY.hard` repointed from `directOf` (easy) to the
    always-clean `netTrap` so the guaranteed-clean fallback can't inject an easy key at hard. `TIER_KEYS` updated in
    lockstep; the downgrade guard is now meaningful and green.
- **Verification:** `node --check` on all touched files; full `npm test` — all 26 suites green (quant-engine 112,990
  assertions / 14,756 recomputed / 0 mismatches; lr-authored 3,641; lr-figures 138). Playwright: C1 review 2nd-encounter
  now renders MCQ with options; keyboard entry types "42" + Enter grades, MCQ ignores digits, numpad tap + Backspace
  intact; fresh-context sweep of all 10 visual categories + authored-LR tiers all pass. SW `qr-cache` v209→v210.
- **Documented backlog (Medium/Low, not this pass):** unimplemented localStorage legacy→canonical migration
  (`store.js`); duplicate `updateCoachingId` key (`firestore-sync.js`); `skipWaiting` vs the in-app update toast;
  network-first-without-timeout on the 430 KB single stylesheet; stats-view fingerprint omitting entitlement (locked
  cards after in-session upgrade); undefined `--accent*` tokens on the Home goal ring; raw-emoji drill chrome vs the
  qr-ico rule; "Guided Revision" being re-reading not retrieval; category-button touch targets < 44px; dark-mode
  tertiary-text contrast; weak recompute coverage for string-valued Quant archetypes (fractions/ratios/mixtures);
  moving `../shared/auth-validators.js` under the app root for offline consistency.

## ADR-093 — Visual question ecosystem redesign + Quant recalibration (2026-07-03)
- **Context:** the owner mandated a product-level audit of every visual-based question engine and a
  difficulty/wording audit of the Quant corpus — "do not optimize around preserving the current implementation."
  The audit found the visual system was the weakest in the app: 6 categories over exactly 5 SVG primitives
  (letter glyphs, arrows, a one-face die, an iso cube, a "?"), ~14 archetypes, a 9-character glyph pool, no
  anti-repetition and no explanations. Mirror/Water only flipped letters; Series/Analogy only rotated arrows;
  paper folding, embedded figures, odd-figure-out and matrix completion — SSC/Banking non-verbal staples — did
  not exist. Presentation was backwards (huge display-size stems dwarfing tiny figures, options below the fold,
  robotic "Study the chart and answer:" prefixes). Quant (ADR-083) was architecturally sound but miscalibrated
  in spots and single-phrased in ~18 of 36 families.
- **Decision — one figure language, real archetypes, earned difficulty, a presentation stage:**
  - **LRFigures v2** (`js/ui/lr-figures.js`): the vocabulary grows to an exam-grade set — parametric `shape`
    (10 forms × none/solid/half fills via unique-id clipPaths), `compo` (outer + anchored inner elements on an
    8-anchor cycle), `seg` line figures on a 0..3 lattice (canonical, exactly comparable), `paper` (folded sheet
    with creases/holes and unfolded results), `net` (cross cube net), `die3` (three visible faces), `grid3`
    (3×3 matrix). All kinds accept `flip`/`rot` so transformations are spec-level and check-verifiable. Old kinds
    kept; class-based dark-mode extended.
  - **lr-visual-engine v2** (10 categories): mirror/water rebuilt (single glyph + composed figures at easy,
    character clusters — the authentic SSC archetype — + two-marker compos at medium, CHIRAL line figures at hard
    where the trap is rotation-vs-reflection, chirality proven by lattice math); dice gains cube-net folding and
    the classic two-positions-of-a-die deduction (non-standard pairing, solvable-by-construction); painted cube
    gains at-least-one and CUBOID counting; series/analogy move from arrows to compositions (position cycling,
    count progression, shading alternation, and DOUBLE-rule hard tiers with half-applied-rule traps); NEW
    `lr-odd-fig` (count/form/3-rotations-+-1-reflection), NEW `lr-paper` (v/h/diagonal/two-fold punching), NEW
    `lr-pattern` (3×3 matrices with row+column rules), NEW `lr-embedded` (segment-subset embedding with provable
    distractors — a distractor host can never contain the motif). Every question ships an explanation; an
    anti-repetition ring varies forms/glyphs; distractors encode documented exam traps, never noise.
  - **Presentation stage** (drill-engine + CSS): stems with a figure/chart (or >90 chars) render as a compact
    instruction (`question-text-compact`), not a 2rem headline; prompt figures sit on a framed `.q-figure-stage`
    consistent with `.di-chart`; picture options carry A–D badges (and the teach panel says "Option C" instead of
    a raw token); DI single-question lead-ins rotate naturally (bare question / "Based on the chart, …" /
    "From the chart shown: …") — safe because the DI check recomputes from chart data, not stem prefixes.
  - **Quant recalibration** (36 families audited): cubes hard = 5-digit cube roots + a³−b³ (was: medium with
    bigger numbers); TSD medium + km/h↔m/s, hard = average-speed/relative-speed/train-crossing (was: easy reads
    re-labelled); fractions hard = fraction-of-fraction + lowest-terms addition (was ≡ medium); pipes hard =
    inverse-fill + three-pipe net rate; PnC hard + circular and at-least-one-via-complement; quadratic hard +
    root-relation (Vieta reconstruction); series hard + n²±k and interleaved APs; the averages hard PRIMARY
    fallback (average of five equal numbers) replaced with a weighted two-group build. Wording pass: 2-3 natural
    exam phrasings added to every single-literal family (area, volume, SI, CI, surface-area, geometry,
    progressions…) with scenario nouns and named actors — under the hard rule that numeric token order is
    preserved (the check harness recomputes positionally) and no digits enter the phrasing.
- **Verification:** `lr-figures.check.js` rewritten — renderer structural contracts for every primitive plus a
  10×3×150 engine sweep whose recompute re-derives every archetype with independent math (own lattice/anchor
  transforms, fold re-unfolding, die-pair deduction, segment-subset tests); zero mismatches. Quant: 113k
  assertions, 14.8k answers independently recomputed, zero mismatches; answer-format (`fractions:addFrac` → '/')
  and all 26 suites green. Playwright screenshots reviewed for every category in light+dark.
- **Consequence:** visual reasoning goes from a demo (letters and arrows) to an exam-representative product
  surface with 10 categories and ~34 verified archetypes; hard finally means harder reasoning everywhere; the
  question card treats figures as the hero. SW v208.
- **Final audit pass (same day):** a mandated self-audit ran repetition/balance metrics (200 samples per
  category-tier) plus rendered-output screenshot review and found five real defects, all fixed: the fanalogy
  medium `reflect` archetype was dead (its rotation distractor always collided with the corner-anchor
  reflection, so distinctness never passed — 0/200 generated; now ~40%); constant stems in the four rebuilt
  figure families (phrasing pick-pools added); narrow cube-size/paper-hole variety (widened to pools);
  embedded distractor hosts could theoretically re-absorb the motif (forbid-list added); and marker dots
  vanished against solid/half fills (knockout dots with contrasting fill+stroke, dark-mode aware). AI-explain
  prompts for figure MCQs now include `describe()` of each lettered option. Re-verified: lr-figures.check
  138/0, all 26 suites green. SW v209.

## ADR-092 — Learn reimagined: study spine, guided revision, one reference home (2026-07-03)
- **Context:** the owner mandated a first-principles redesign of the Learn tab (not incremental polish). Analysis
  found three product generations layered on one endless page — the ADR-069 knowledge base (62 chapters), the
  ADR-084 Quick-Reference library, and the legacy layer (static tables + custom topics/starred formulas) — with
  squares/cubes/fraction↔percent/multiplication-tricks each duplicated in 2–3 places, two half-coverage search
  boxes, a topic-page breadcrumb whose category crumb lied (both crumbs went to the hub), a desktop aside that
  hid prev/next, spaced revision that only re-opened the full chapter (passive re-reading), and no drill→learn
  loop (weak areas lived only in Stats).
- **Owner decisions (asked & answered):** (1) the Quick-Reference library becomes the ONE home for condensed
  reference — except the interactive Multiplication Tables, which stay on the hub as a first-class revision
  shortcut; (2) build a first-class **Guided Revision** flow (sequenced active recall over due topics using the
  existing quick-revision content), NOT a generic flashcard engine; (3) custom topics + starred formulas fold
  into one collapsed "My notes" section.
- **Design thesis:** Learn serves three jobs — *Study* (guided progression), *Revise* (daily spaced recall +
  reference), *Look up* (one search over everything). The hub is now a short router around those jobs; the topic
  page is one reading spine with an end-of-chapter loop; revision is an active habit.
- **Shipped:**
  - **Hub restructure (index.html + learn-view.js):** "Up next" hero (ONE recommended chapter — first
    not-completed by `QR_EXAMREL.order()`, subject-filter-aware, target-exam-focus preferred, with a why-line);
    "Revise today · N due" card (only when due); strips become Continue / **Needs practice** (new — the SAME
    `QR_STATMATH.weakestTopics` derivation Stats uses, mapped via `drillCategory`, with accuracy chips) / Saved;
    Quick-Reference entry + hub Multiplication Tables; "All topics" browse (categories gain a quiet "· N read";
    topic cards de-badged to difficulty + at most one contextual badge — frequency stays on topic pages);
    collapsed "My notes" merging custom topics + starred formulas (paywall untouched). REMOVED from the hub:
    static Fraction→%, Squares, Cubes, Mental-Math cards (library absorbed them — supersets, incl. grids 1–50 /
    1–30 and the full 34-row fraction table) and the old "Due for revision" strip (the Revise card replaced it).
  - **Guided Revision flow (`js/learn/revise-flow.js`, `#learn/revise`):** due topics (oldest-first, capped 10)
    presented one at a time as their revision projection (formula/trick/trap/revision blocks via the same
    `BlockRenderers`); progress bar + "Revising · i of N"; "Revised ✓ · Next" re-arms the spaced interval via
    `LearnProgress.markViewed` (no new storage); "Read full chapter →" escape hatch; caught-up + completion
    screens. Every entry is a fresh pass over what is still due — leaving mid-flow loses nothing. No sounds, no
    confetti: a serious trainer.
  - **Unified search:** `LearnSearch.queryCards()` indexes the library cards; the ONE Learn search box returns
    grouped Topics + Quick-reference results; a card tap opens the library and `QuickRef.reveal(cardId)` expands,
    scrolls and flashes the card. `query()`'s topic-only contract (and its checks) untouched.
  - **Topic page = one reading spine:** breadcrumb → single honest "← Learn" back link; the ≥960px aside grid is
    gone (single centred 720px column at every width); a designed **end-of-chapter footer** carries the moment of
    finish (Mark complete + Practise side-by-side, state-synced with the top bar) then Next-up card, related
    chips, and a quiet Previous link; section pills visually quieter; the overview renders as a proper lede.
- **Options considered:** flashcard engine (rejected by owner — generic, content-quality risk ×62 topics);
  keeping the static hub tables (rejected — three homes for the same numbers is historical accident, not design);
  removing custom topics (rejected — orphans user data + a paywalled feature).
- **Consequence:** every condensed reference exists in exactly one place; the hub's initial DOM shrank (~120
  static nodes gone); revision has a habit loop; Learn and Stats can never disagree about weak areas. SW v207.

## ADR-091 — Product Excellence Pass: remaining audit items, independently re-evaluated (2026-07-02)
- **Context:** after ADR-090 closed the audit's Critical set, the owner mandated a pass over the *remaining*
  recommendations — explicitly re-evaluated against the current codebase rather than mechanically implemented
  (owner exclusions: H5/H9/H10/H11/M1/M8; AI-explanation limits stay 5-lifetime).
- **Re-evaluation outcomes (the honest part):**
  - **Already solved, closed with no change:** M11 (MCQ ✓/✗ glyphs — `.mcq-correct/.mcq-wrong ::after` existed all
    along) and M3 (the Settings Skip toggle was already entitlement-gated with a paywall AND hard-mode-gated with a
    toast; the drill-side 3-way check is defense-in-depth, not "invisible logic" — V1 overstated it).
  - **Rejected — V1 was wrong:** M4 (hide DI chart value labels at hard). Grading is exact-equivalence
    (tolerance 0.1%); without printed values a student can only estimate off a bar — the question becomes
    *unanswerable*, not harder. Would need gridline-precise charts + a new tolerance model; cost/benefit fails.
  - **Deferred:** M6 i18n scaffold (horizontal refactor, zero user value until translations exist) and
    N2/N3/N5/N6 (features, not polish — bloat for this pass).
- **Shipped (12 items):**
  - **H1 Reinforcement rebalance:** new synthesized `sounds/correctanswer.wav` (soft two-note A5→D6 chime, ~15KB,
    in-repo Python/`wave`) plays on correct; a quiet `🔥 N in a row` chip joins "✓ Correct" from 3-in-a-row
    (`currentSessionStreak`, non-duel); the 400ms wrong-answer card shake is REMOVED (shake + failure sound + red
    panel was triple punishment — anxiety, not information; `.feedback-shake` CSS deleted as now-dead).
  - **H2 Honest timeout:** `checkAnswer(raw, opts)` gains `opts.timedOut`; `_perQTick` expiry passes it. Verdict
    reads "⏱ Time's up" in amber (`--qr-warn`, `.drill-verdict-timeout`) with a single soft haptic and NO failure
    sound — a pacing verdict, not a knowledge verdict. Grading/stats identical (unattempted-wrong as before).
  - **H3 Numpad yields to the learning moment:** on answer (except Reflex auto-advance, to avoid a slide bounce at
    pace) `hideCustomNumpad()` — dropping `body.numpad-active` collapses the reserved band via the EXISTING MCQ
    layout rules, so the card + explanation get the full height; `nextQuestion()`'s re-render restores the pad.
  - **H4 1-tap warmup:** the Home CTA passes `skipStartScreen: true` through `startDrillFromPractice`'s opts
    (reuses the ADR-090 session-review mechanism) — the daily loop lands directly on Question 1. Practice-tab
    launches keep the interstitial (real decisions live there).
  - **H6 Cold-start honesty:** the streak badge hides until a streak exists (no more "🔥 0"); hero Accuracy/Best
    show "—" until there are attempts; the Practice quota bar appears only after the first question of the day.
  - **H7 Appearance: System / Light / Dark:** `resolveDarkMode(s)` in settings.js is the ONE owner of the decision
    — canonical `settings.appearance`, lazy legacy migration (`darkMode:true→'dark'`, `false→'system'`; nothing
    added to DEFAULT_SETTINGS so backfill can't clobber it), `settings.darkMode` maintained as the derived mirror
    for every legacy reader. Both apply sites (pre-paint + post-hydration in app.js) route through the resolver;
    a `matchMedia('(prefers-color-scheme: dark)')` listener follows live OS changes while in System. The Settings
    toggle became a three-option `.theme-select` row. All 981 `body.dark-mode` CSS rules untouched.
  - **H8 Timer urgency:** `.timer` was PERMANENTLY red — constant alarm, zero signal. Now calm (`--qr-text-dim`,
    tabular numerals) with `.timer-low` (danger + 1Hz opacity pulse, reduced-motion-neutralized automatically)
    toggled at ≤5s per-question / ≤10s total.
  - **M5 Tablet drill layout:** at ≥768px the drill card, keypad and in-session actions center-constrain to 640px
    (keypad gets top radii; show/hide transforms carry the translateX pair); results grid goes 3-column.
  - **M7 Root-cause token aliases:** the undefined legacy names (`--text-primary/-secondary`, `--accent-primary`,
    `--bg-surface`, `--bg-elevated`, `--border-color` — used by inbox + two index.html inline styles, previously
    silently falling back) are aliased ONCE in `:root` to the `--qr-*` system; var indirection means dark/playful
    re-declarations flow through automatically.
  - **M10 Pause everywhere:** pause/exit grew to 44px targets with a visible `--qr-surface-2` circle; set-mode
    (DI/LR — the longest sessions, still timing per-question stats) gains the pause button (`pauseSession()` is
    mode-agnostic).
  - **N1-lite typography + focus polish:** body stack reordered mobile-first (`system-ui` before `'Segoe UI'`);
    `tabular-nums` on question text, timers and result values; the loud UA focus ring on the programmatically-
    focused results heading suppressed (SR focus behavior unchanged).
- **Consequences:** success is now the rewarded event; timeouts stop reading as failures; the explanation owns the
  screen; the daily loop is one tap; new users aren't greeted by zeros; night users get dark automatically; time
  pressure is visible exactly when real; tablets get a real layout. SW v205→v206.

## ADR-090 — Critical launch-readiness resolution: exam identity, honest metrics, verdict hierarchy, two-personality themes, Google Sign-In (2026-07-02)
- **Context:** the product/UX audit (`AUDIT-REPORT-PRODUCT-UX.md`) identified 7 Critical launch blockers. Each was
  independently re-evaluated before implementation (owner mandate: best product > consistency with the report); one was
  revised per an explicit owner design directive (themes), the rest upheld with sharpened implementations.
- **C1 Target-exam identity (`js/services/target-exam.js`):** there were two disconnected notions of "exam" —
  `qr_active_exam` (local-only, Planner-written) and synced settings (no exam field). ONE accessor now owns it:
  `TargetExam.get/set/clear/label` — canonical `settings.targetExam` (+`targetTier`, auto-synced; FirestoreSync writes
  the whole settings object) with `qr_active_exam` kept as a local mirror/migration source. All 4 readers (Timed Mock,
  Learn badges, Stats readiness, category picker) and both Planner writers go through it. Onboarding gained a
  **tier→exam step** (screen 2 of now-7; data from `QR_SYLLABUS.TIERS/examsByTier`; skippable; "Not sure? Foundation");
  the name question became optional (it hard-blocked progress). Surfaces: Home hero exam chip, Settings "Target Exam"
  row (optgroups by tier), one-time dismissible Home nudge for pre-existing users, and Timed Mock no longer dead-ends
  into "set up your study plan first".
- **C2 Honest metrics:** `computePercentile` ("Faster than N% of users") was a SIMULATED value — speed score × 0.92 ±
  random jitter, no cohort. Deleted on principle (the product never shows a comparison it cannot support). The results
  card is now a **Speed Score** card (real 0-100 metric, band-classed) with a self-trend delta vs the user's own last
  session (`qr_last_speed_score`) and "Your Best". Swept every consumer: results markup, PB chip, share card + share
  text, `_generateLocalBenchmark` copy ("climb the rankings" → self-referential), stored `qr_last_percentile` retired.
- **C3 Session Complete = one verdict · one insight · one action:** the screen stacked contradictory verdicts (verified
  live: "New Personal Best!" + "Growth in Progress" in danger-red + "Tough session" on a 20% first session). Now: ONE
  verdict slot (PB requires ≥3 prior sessions AND an actual improvement — `qr_sessions_count` increment hoisted out of
  the free-only upgrade branch so it counts for everyone; <50% verdict is a neutral "Needs Review", never celebration
  copy in failure colors); topic strongest/focus-next cards require ≥3 attempts per category (no more "Strongest:
  Trigonometry 1/1"); insight strings de-duplicated against the verdict and only recommend offered actions.
  **"Review these N now"** (free, session-scoped): wrong question objects (chart/figure specs intact) are collected
  in-memory during the session and replayed via the existing `_preloadedQuestions` mechanism + a new
  `skipStartScreen` engine opt (launcher `startSessionReview` in practice-modes.js) — no persistence, no premium-archive
  giveaway (cross-session Review Mistakes stays premium); set-mode sessions excluded (fragments lose their shared
  scenario). This deliberately amends ADR-089's forward-only rule: the app must never *recommend* an action it doesn't
  offer. The separate "try 5 easier questions" CTA from the plan was dropped during implementation — session review IS
  the contextual retry, and a second retry button would violate the one-action principle.
- **C4 Two-personality theme system (owner directive — QR icon system):** Classic Blue stays expressive (emoji as
  personality); Playful Professional is the premium design language. One markup for every chrome icon —
  `<span class="qr-ico" data-ico="name" aria-hidden="true">🌙</span>` (`qrIco()` string-builder in app.js) — with the
  swap done ENTIRELY in CSS: playful collapses the emoji (`font-size:0`) and paints a monochrome SVG
  `mask-image`/`currentColor` glyph from `--qri-*` data-URI tokens (~36 glyphs, ~18KB), so theme switches are instantly
  correct on static AND generated markup with zero JS re-render (rejected: extending the JS img-swap — per-generator
  drift; an `Icon.render()` helper — provably stale on static markup). `updateNavigationIcons()` deleted; nav/headers
  are now static `qr-ico` spans. The five `appicons/tab/*.svg` "icons" were AI-exported SVGs wrapping embedded PNGs —
  **8.3MB total, all SW-precached** — deleted (−8.3MB install payload). Playful polish: `--qr-grad-a/b` +
  `--qr-shadow-playful` tokens replace hardcoded gradient/shadow literals; bento squircles become soft neutral tiles
  with accent-tinted mask icons. Rule recorded: *chrome/affordance icons → `qr-ico`; expressive/celebration copy →
  emoji in both themes.* Unbound `data-ico` names degrade to a neutral dot glyph.
- **C5 Google Sign-In:** popup-first (`prompt:'select_account'`), redirect fallback only on popup-blocked (flagged via
  sessionStorage; `getRedirectResult` surfaces errors on return). **Latent bug found & fixed:** server `claimSession`
  merge-sets `users/{uid}` and thereby CREATES a skeleton doc, while rules deny client creates — a Google first-login
  would have produced a permanently malformed doc (no email/plan/createdAt; broken rosters + admin search). New
  idempotent **`POST /api/account?action=ensure-profile`** (withAuth, zero new Vercel functions) seeds the exact
  register.js shape (only missing fields; never clobbers coachingId or the session skeleton; `usage/ai` via `.create()`
  so quota is never reset) — provider logins chain ensure-profile → `Session.claim` → hydration, so ADR-072
  single-device enforcement is identical for all login methods. The dead client-side `_createDefaultDocument` Firestore
  write (rules-denied since ADR-041) was replaced with ensure-profile + re-get for every account type. Delete-account
  re-auth branches on provider (`reauthenticateWithPopup` for Google-only users; password field hidden). The dormant
  bind-once `claim-coaching` action is now surfaced in the Profile modal (editable only while unbound) — covers Google
  sign-ups AND email users who skipped the field. Console prerequisites + two caveats (cross-site `authDomain` redirect
  reliability; unverified-password unlink on same-email Google login) documented in `FIREBASE_SETUP.md`. Contract
  test: `scripts/ensure-profile.check.js` (15 assertions).
- **C6 Copy/default coherence:** daily goal = 20 default / 10–100 range everywhere (was 10/20 vs 50 vs 20 in four
  places); "Stats" is the single name (tab + header + App Guide; was "Analytics" on the screen); greeting no longer
  falls back to the app's own name ("Good afternoon, QuantReflex"); "Daily Training Ring" → "Today's Goal";
  manifest + meta + About aligned to the 4-tier ADR-067 catalog (GMAT/GRE/NTSE/Olympiad/school removed); exit dialog
  tells the truth ("Answered questions are saved — this session just won't get a summary." — per-answer writes are
  batched during the drill, so "your progress will be lost" was false).
- **C7 Paywall trust (owner decisions: 7-day refund YES; AI explanations stay 5 lifetime, copy reworded):** structure
  reordered to price-first — hero → context accent → **plans + CTA** → trimmed 8-row compare table (was: 2 screens of
  duplicate chips + 13 rows before the price); value-chips section deleted (duplicated the table); trust row =
  Secure Payments · **7-Day Refund** · Instant Activation; footer gains `quantreflex@gmail.com`; CTA note + About carry
  the refund promise; "AI explanations: 5 total" → "5 free to try"; "Advanced Themes" → "Premium theme" (honest after
  C4); paywall secondary copy contrast fixed (#94a3b8 → #64748b, AA on the money screen).
- **Consequences:** exam identity is now a free-tier primitive (personalization can build on `TargetExam`); every
  number the product shows is real; the results screen has a single emotional through-line and a pedagogical action;
  the premium theme is visibly premium and the icon architecture cannot drift; Google reduces signup friction with
  server-authoritative provisioning; the paywall makes a checkable promise. SW v204→v205.

## ADR-089 — Final UI cleanup: forward-only results actions + remove two Stats sections (2026-07-02)
- **Context:** a production polish pass (explicitly *not* a redesign) to remove the last of the UX debt: the results
  screen carried five backward-looking actions, two Stats sections had outlived their usefulness, and the results
  topic cards clipped long topic names with an ellipsis. Three independent read-only audits mapped every footprint from
  code first, so each removal's shared-vs-exclusive boundary was known before any edit.
- **Results screen → forward-only (`js/drill-engine.js`, `css/style.css`):** removed the `actMistakes`
  ("Practice My Mistakes" shortcut), `actRetry` ("Practice Again"/"Retry"), and `actHarder` ("Increase Difficulty")
  buttons and their listeners, plus the now-dead restart machinery they were the only callers of — `_restartSession`,
  `_practiceMistakesRestart`, `_increaseDifficultyRestart`, `_initialCount`, `_canHarder`/`_curDiffLc`,
  `_primaryIsMistakes`. The results actions are now just **Continue Learning** (primary, full-width, always shown —
  `_continueLearning` already falls back to the Learn view when no chapter resolves) over **Back to Practice**
  (secondary, full-width). Share Achievement stays, always. The insight chips (incl. "N to review"), the
  `.session-insight-card`, and `_wrongCount` are untouched. CSS: `.drill-next` collapses to a stacked full-width column;
  the two-column `.drill-next-grid` rules were deleted.
- **Review My Mistakes — kept in full (deliberate boundary):** only the *results-screen shortcut* was removed. The
  review MODE — `reviewMode` plumbing, `generateMistakeReviewQuestions`, `getMistakes`, the Practice "Review Mistakes"
  card + launcher, the `review_mistakes` entitlement/paywall/analytics/docs — is unchanged and still reachable from the
  Practice section. Mistake *tracking* (`recordAnswer → progress.mistakes`) also feeds Firestore sync and the
  server-side AI coach, so it was never a removal candidate. "Remove the shortcut, not the feature."
- **Stats: removed "Performance Insights" + "Exam Readiness" (`js/views/stats-view.js`, `data/statMath.js`,
  `index.html`, `css/style.css`, `scripts/statmath.check.js`):** deleted the two sections' render functions
  (`_renderInsights`, `_renderReadiness`), their `renderStatsView` calls + `_toggleSection` lines, the `#insightsSection`
  /`#readinessSection` markup, the `.stats-insight-*`/`.stats-ready-*` CSS (and a now-orphaned `#statsInsights`-scoped
  rule), and the two check-script IIFEs. In `statMath` the exclusive derivations `comparativeInsights`, `examReadiness`
  and its private `_hardAccuracy` helper (plus the now-unused `_CONF_FACTOR`) were removed with their exports.
- **Deliberately kept (shared surfaces):** the `performance_insights` entitlement is shared — it still gates Subject
  Mastery, Study Next and QuanAI Recommends — so it and its paywall/marketing copy stay (nothing advertises a removed
  section; the copy maps to the retained premium-analytics tier). All shared `statMath` helpers (`accuracyWindows`,
  `deriveMastery`, `consistency`, `evidence`, `_barClass`, …) stay. The planner's separate `examReadinessScore`
  subsystem (`services/*`, `planner-view.js`) and the drill `.session-insight-card` are unrelated and untouched.
- **Post-implementation hardening (same release):** three independent adversarial re-audits (results / Stats /
  regression) confirmed no functional regressions and no dangling product-code references. They surfaced only
  housekeeping: `overallAccuracy` had become dead (its sole callers were the removed `_hardAccuracy`/`examReadiness`)
  so it and its export were removed; a stale `statmath.check.js` header and two stale `ROADMAP.md` lines (naming the
  removed "Exam Readiness"/"comparative insights") were corrected.
- **Topic cards never overflow + Settings (`css/style.css`, `index.html`):** `.dt-name` replaces
  `white-space:nowrap; text-overflow:ellipsis` with a two-line clamp (`overflow-wrap:anywhere` + `-webkit-line-clamp:2`);
  `.drill-topic` gains `min-height` + `align-items:flex-start` for equal card heights and aligned icons; `.drill-topics`
  stacks to one column ≤360px. Settings toggle renamed "Ask Subject Before Quick Start" → **"Ask Subject"** with a
  clearer subtitle; the `practiceAskSubject` key + bindings are unchanged.
- **Consequences:** the results screen reads as one forward motion (badge/insight → metrics → strongest → focus-next →
  speed benchmark → Continue Learning → Back to Practice); Stats is shorter and every section still resolves; the last
  topic-name clip is gone at 320/768/landscape in all four theme combinations. Verified: full 25-check harness green
  (statmath.check 713/0 after trimming), CSS braces balanced, `node --check` on the edited JS, and an 80-assertion
  Playwright sweep (4 themes × 320/768) confirming the results actions, topic-card overflow/equal-height, Stats section
  removal, and Settings label — 0 app errors. SW `v203 → v204`.

## ADR-088 — Drill Engine hardening round 2: complete theme coverage + audit fixes (2026-07-02)
- **Context:** the assume-nothing drill quality-gate was re-run — three fresh independent audits (logic/results/a11y,
  CSS/theming, performance/figures/regression) + direct code re-reads + the full harness, trusting no prior summary.
  The ADR-086/087 fixes were **re-verified correct from code** (D1/D2/D4, timer/listener teardown, results-math
  crash-safety, figure clipping, SW precache, 25-check chain). The pass surfaced one regression I'd introduced, a latent
  bug, accessibility gaps, and — the main finding — that ADR-087 tokenised only the *new* components while the older
  results/feedback/interactive components still rendered classic blue/violet/pastel in Playful.
- **Correctness + a11y (reproduced, then browser-verified fixed):** **A1 (regression)** — `_practiceMistakesRestart`
  set `count=10` then `_restartSession()` overwrote it with `_initialCount`, so Practice-Mistakes replayed the prior
  mode's size and `=10` was dead; `_restartSession(overrideCount)` now takes an optional size and Practice-Mistakes
  passes 10. **A2** — a timed test expiring with zero answers fed `avgRaw=0` into `computeSpeedScore` → "Faster than
  ~37%"; `finish()` now scores an unanswered session 0. **A3** — removed the unreachable, wrong-signature duel branch
  in `checkAnswer`. **A4** — MCQ `aria-label` now escapes `"`. **A5** — `.drill-progress-bar` gains
  `role="progressbar"` + `aria-valuenow/min/max` + label (both render paths). **A6** — the results card gets
  `role="status"` + focus lands on the "Session Complete" heading. **A7** — pause overlay gains `aria-modal="true"`.
  **A8** — the pie-legend label yields room to the full value so a large value can't clip the 320 viewBox; set-mode
  progress clamped.
- **Real bug (B):** `.session-upgrade-banner` had ONLY a `body.dark-mode` rule — completely unstyled in Light +
  Playful. Authored a token-driven base rule (banner + text + CTA + dismiss); the CTA uses `--qr-surface-solid` over
  `--qr-accent`, contrast-safe in every theme.
- **Complete Playful theme (C):** added a consolidated `body.theme-playful` override block (tokens, covering Playful
  light + dark) for the primary CTA + share button (→ Playful blue→teal), performance badges + adaptive pills, the
  speed-benchmark card + `.benchmark-*`, session-insight / auto-explain / wrong-answer / percentile-delta, MCQ options
  + correct/wrong reveal, feedback text, the progress label and the active-drill skip. Nudged Playful `--qr-warn`
  `#b45309 → #9a4708` so warn-as-badge-text clears AA on the warm surfaces. **Invariant held:** no `:root`/base/
  `body.dark-mode` rule was touched, so **Classic + Dark are byte-identical** (computed-verified — classic button still
  blue, benchmark still violet, badges still pastel, MCQ still white); only Playful re-themes. All 11 new Playful pairs
  pass **WCAG AA** (contrast validator).
- **Pixel polish (D):** audited — the flagged inconsistencies (benchmark px vs rem, bespoke shadows/radii, the
  Submit-vs-Skip height difference) either have no pixel-identical token to map to, or would alter Classic/Dark, or are
  defensible hierarchy (prominent Submit vs secondary Skip). No safe pixel-identical improvement was available, so none
  was forced — the drill renders cleanly (matrix 6/6, 0 overflow).
- **Verification:** full `npm test` green (25 checks); D1/D2/D4/A1/A2/A5–A7 reproduced-then-fixed in headless Chromium;
  computed-style audit confirmed Classic/Dark byte-identical + Playful fully themed across the 4 variants; WCAG
  validator 11/11 AA; cross-theme journey matrix (light/dark/playful × 320/768) 6/6 clean. SW v202 → v203.
- **Intentional limitations:** the numpad's bespoke per-theme palette (already fully themed incl. Playful teal) and
  neutral shadows/scrims are retained; in Playful-dark a few secondary cards (MCQ base, insight) fall to the
  near-identical classic-dark navy via `body.dark-mode` source order — the distinctive accent elements (buttons,
  benchmark, badges) win; app-wide non-drill tokenisation stays out of scope.

## ADR-087 — Drill Engine final verification, hardening + complete Playful theme identity (2026-07-02)
- **Context:** a no-assumptions production quality-gate on the shipped ADR-086 drill redesign — prove it correct from
  the code (trusting no prior summary) and fix anything blocking production. Ran three independent Explore audits
  (engine logic, CSS/theming, integration) + direct code re-reads + the full harness. Verified-clean: numpad rewrite
  is backward-compatible (onboarding safely uses the legacy default; duel skips pause+loader), SW v201 precaches
  `answer-format.js`, script load order correct, keyboard coverage still 35k/0, no stale `#tryAgainBtn/#homeBtn`, no
  TODO/FIXME. But the audit surfaced three real correctness bugs and an incomplete Playful theme.
- **Correctness bugs (each reproduced + browser-verified fixed):** **D1 —** Reflex Drill silently skipped a question:
  the 350 ms next-guard re-enabled the Next button while the 600 ms `_autoAdvanceTimer` was still pending, so a manual
  tap in that window advanced and then the timer advanced again. `nextQuestion()` now cancels both transition timers at
  its top (idempotent advance). **D2 —** pausing inside that window stranded the session (the auto-advance fired under
  the overlay, wiping it + starting a per-Q timer while `_paused`): `pauseSession()` now clears the transition timers
  and re-enables Next; `startPerQTimer()` no-ops while paused. **D3/D4 —** review "Retry" replayed an inflated count
  (review re-queues wrong questions with `count++`, never reset): captured `_initialCount` and restore it on restart.
- **Safety + hygiene:** `finish()` made idempotent; the "All Caught Up" and generation-error terminal cards now tear
  down the visibility auto-pause listener; removed the unreachable Word-Problems live-session launcher
  (`practice-modes.js`, shadowed by the Coming-Soon intercept), the never-called `_shareTextFallback`, and the
  redundant `mode === 'Reflex Drill'` literal; unified the `13.5rem ↔ 13.75rem` numpad-height drift behind one
  `--qr-numpad-h` token; consolidated the duplicate `.results-share-btn` rule (+ its `!important`); wired the orphaned
  `mock-engine.check.js` into `npm test` (now 25 checks).
- **Complete Playful theme identity (per explicit user direction):** Playful was only a surface/border reskin — its
  accent, text, status and focus tokens fell back to the default palette, so token-driven drill components rendered in
  the default blue while the numpad wore a playful teal. Extended `body.theme-playful` (+ its dark variant) to a
  **complete semantic palette** (`--qr-bg`, its own blue `--qr-accent`, warm ink, success/danger/warn/info, an
  accent-matched focus ring) and **tokenized the drill components** that still hardcoded colour (`.drill-explain-btn`
  → `--qr-info`; drill/results/duel session-shell backgrounds → `--qr-bg`; playful-dark numpad submit → its signature
  blue→teal; exit-button safe-area parity). **Invariant held:** the `:root`/`dark-mode` token blocks were never
  touched, and every tokenised literal equalled its theme's token value, so **Classic + Dark are byte-identical**
  (computed-style-verified) — only Playful intentionally re-themes. All theme pairs are **WCAG AA-verified** by a
  contrast validator (text-on-surface ≥4.5, accent-as-text ≥4.5, status-fg-on-bg ≥4.5, on-accent ≥4.5).
- **Verification:** full `npm test` green (quant 112,949/0 recompute-0; answer-format 34,989/0; +mock-engine 100/0);
  D1/D2/D4 reproduced-then-fixed in headless Chromium; cross-theme × size journey matrix (light/dark/playful ×
  320/768, start→Q→feedback→MCQ→results) 6/6 clean — 0 overflow, 0 page errors, every state renders; per-theme token
  audit + WCAG validator all AA. SW v201 → v202.
- **Intentional limitations:** the numpad's bespoke per-theme hex palette is retained (it is already fully themed per
  variant, incl. the playful teal — not a default fallback; tokenising it wouldn't be pixel-identical); neutral
  decorative shadows/scrims and on-accent `#fff` / dark active-ink are left as-is; `AIFeatures.renderWordProblemsSetup`
  is kept (staged "coming soon" feature, not dead); app-wide re-tokenisation of non-drill screens is out of scope (the
  now-complete Playful palette means token-consuming screens inherit it automatically).

## ADR-086 — Complete Drill Engine redesign: the drill journey as one premium product (2026-07-01)
- **Context:** the drill screen is QuantReflex's flagship, yet a full audit (three Explore passes + firsthand reading)
  found it inconsistent and, in places, broken: a persistent 4×4 keypad reserved a ~14rem dead band under every MCQ,
  showed a **dead `%` key** on every question, and **omitted `/`** so the fraction answer `"3/8"` was literally
  un-typeable; MCQ was second-class; the explanation was a cramped `createTextNode` box; **Reflex auto-advance was
  silently dead** (label `'🧠 Reflex Drill'` never matched the `'Reflex Drill'` guard); charts/figures clipped; and
  there were no semantic colour tokens (every theme hand-painted). The mandate: redesign the **entire journey** — start
  → loading → question loop → feedback → results → next actions — across **all three themes**, with a keyboard whose
  completeness is **enforced by code, not convention**.
- **Decision 1 — spec-driven adaptive keyboard, proven complete.** A single `answer-format.js` registry (`answerFormat(q)`
  → `{kind, keys, normalize, validateKeystroke}`) is the one source of truth consumed by the grader (`normalize`), the
  adaptive keypad (`keys` + `validateKeystroke`) **and** the coverage check. The pad exposes only the digits + symbols
  a given answer can contain (added `/`, dropped dead `%`), blocks invalid sequences (2nd `.`, mid-string `-`,
  double separators), and stays visually stable. `scripts/answer-format.check.js` sweeps every Quant/DI/LR category ×
  difficulty (**~35k assertions, 0 failed**): every numeric answer's characters ⊆ its keys **and** typeable
  keystroke-by-keystroke; every MCQ carries options. An un-typeable future question is therefore impossible to ship.
- **Decision 2 — the whole journey, every mode.** Redesigned as one cohesive flow: a **premium start screen**
  (badge + question count · estimated duration · difficulty · timer profile · dominant CTA); an **honest loading state**
  (subtle 3-orb motion, no fake progress, shown only while a deck is actually generated, deferred one frame so the tap
  feels instant; pre-built decks skip it); first-class **MCQ-in-dock** layouts; a **teaching correction panel** (verdict
  · correct-answer chip · formatted "Why" steps · Learn concept-link · preserved AI Explain + auto-tip/paywall); the
  revived **Reflex auto-advance** (now an explicit `opts.autoAdvance` flag); a **completion dashboard** (score · accuracy
  · avg time · streak · strongest & focus-next topic from a per-category tally · mistakes-to-review · within-session
  speed trend · personal-best reference · speed benchmark) with **context-aware next actions** (Practice My Mistakes ·
  Retry · Increase Difficulty · Continue Learning · Back — each an in-engine restart or clean exit, no dead buttons);
  and **pause/resume** (freezes both countdowns, shifts timing anchors so a pause never counts against the user,
  auto-pauses on tab-background, Escape/focus a11y). Every failure path is graceful — a generator throw or empty deck
  surfaces a Retry error card instead of a blank/frozen screen; rotation is handled by the fixed-inset session shell;
  offline is a non-issue (generation is fully client-side).
- **Decision 3 — all three themes from one token system.** Semantic design tokens (`--qr-text`, `--qr-surface(-2/-3)`,
  `--qr-border`, `--qr-success/-danger/-warn/-info`, `--qr-focus-ring`, motion durations…) seeded from the existing hex
  literals (no new hues) drive every redesigned component. `default (light)`, `dark`, `theme-playful` and
  `theme-playful.dark-mode` share identical structure/spacing/motion/a11y — only the token values differ, so a future
  theme is a token-only add. Cross-theme computed-style + functional matrix (light/dark/playful × 320/768) confirmed
  0 horizontal overflow, correct per-theme contrast, and every state rendering with 0 page errors.
- **Guardrails honoured:** no new deps/Firestore/colours/gamification; **no generator or answer-format changes**
  (`q.answerFormat` is an optional additive field only — the recompute harness stays 0-mismatch); numeric entry stays
  custom-keyboard-only; Duel/Sets/Mock/Adaptive/Review keep working (Duel is explicitly excluded from pause + the loader).
  Shipped as small, independently-green commits (P0–P9), each `npm test`-green + browser-verified. SW v190 → v200.

## ADR-085 — Dragon-Boss whole-app production audit (2026-07-01)
- **Context:** a final, no-assumptions production-readiness sweep of the entire main-app (not just Quant) — runtime/
  static analysis, PWA/service-worker, security, data integrity, cross-feature regression, dead-code, and docs. Ran
  three independent parallel Explore sweeps, then **re-verified every claim against the actual code** (the mandate was
  to trust no report, including the agents'). Most agent "CRITICAL" findings dissolved on inspection — recorded below
  so the audit trail is honest.
- **Verified-clean (evidence gathered, unchanged):** SW precache covers every local `./js`/`./css` asset (independently
  cross-checked); cache versioning + old-cache purge + network-first-for-code + SPA fallback correct; manifest complete
  (icons/maskable/theme/scope). Security: consistent `_esc()`/`textContent` escaping (no XSS sites), Firebase web
  config intentionally public, server secrets from env, webhook HMAC + timing-safe + idempotent, storage reads
  try/catch-guarded, no debug flags/`debugger`/TODO. Code health: 0 orphan files, 0 dead code, all `npm test` scripts +
  vercel fns + deps resolve. Engines already proven (harness 113,001/0; 32,400-question stress 0-dirty; DI/LR suites).
- **Rejected agent claims (checked → false):** signup callback double-fire (each branch fires once then returns —
  auth.js:169–196); drill-session strand (nav teardown calls BOTH `cleanup()` + `_exitDrillSession()` — app.js:1122–
  1136); logout loses pending writes (`resetSyncState` flushes before clearing — firestore-sync.js:165–179; plus
  beforeunload/visibility flush); duel `_myAnswerCache` never cleared (cleared — duel-manager.js:665); `_memoryCache`
  "race" (JS is single-threaded).
- **Fix 1 — drill-engine stray-timer cancellation (real, low-severity):** the Reflex-mode auto-advance
  `setTimeout(nextQuestion, 600)` and the 350 ms next-guard `setTimeout` were fire-and-forget (no stored id), so
  `cleanup()` couldn't cancel them; exiting a Reflex drill within that window fired `nextQuestion`/`finish` into a
  torn-down engine (a possible duplicate session-record on a hidden view). Stored both ids engine-scoped and
  `clearTimeout` them in `cleanup()` alongside the existing `overallTimer`/`perQTimer` clears. **Browser-proven:**
  a headless Reflex drill that answers then exits within the window schedules the 600 ms timer, `cleanup()` cancels it
  (1/1), and the drill does NOT advance to Q2 (stays "Question 1 / 2"), 0 page errors. SW v189→v190.
- **Fix 2 — documentation rot (docs/comments only, zero runtime risk):** `README.md` "File Structure" listed **7 HTML
  files that don't exist** (`practice.html`, `learn.html`, …) — the app is a pure SPA with only `index.html`; rewrote
  it to the real SPA layout. Corrected stale "14/12 Quant categories" → **36** in `README.md`, `services/quantTopics.js`,
  `scripts/quant-engine.check.js` (×2), `data/subjects.js`, and the `index.html` load-order comment.
- **Intentional exclusions:** duplicate `_ri`/`_pick`/`_shuffle` across the four independently-tested DI/LR engines
  (deliberate engine isolation — sharing a dep adds coupling + regression risk for a ~4-line dedup); no CSP header
  (deployment-level, not app code; a mis-scoped policy could break the Firebase CDN scripts).

## ADR-084 — Quant Gold Audit + Excellence Pass (premium discoverability, Quick-Reference, generator craft) (2026-07-01)
- **Context:** ADR-083 shipped complete Quant coverage (36 drill categories + Learn chapters, zero orphans, harness
  113k/0). A production-readiness audit (4 independent Explore passes, each finding re-verified) found the coverage was
  real but **not fully discoverable**: the Practice "Choose Category" picker + several display surfaces held frozen
  14-item snapshots, so the 22 newer categories were invisible there and rendered as raw keys in Stats/Planner/Duel.
  Plus generator scenario-diversity, explanation, Learn-consistency and dead-code polish opportunities.
- **Decision:** make category surfacing fully **registry-derived** (a future topic needs only a central edit), redesign
  the picker as a premium collapsible/searchable/personalized experience, build a premium **Quick-Reference revision
  library**, and land the content-craft polish — all without regressions, new deps/Firestore, or lowering the DI/LR bar.
- **Batch 9 — final production audit fix (pipes-cisterns easy variety):** the independent final audit ran a 32,400-
  question stress sweep and flagged **one** low-variety tier: `pipes-cisterns/easy` produced only **3 distinct stems**
  (the clean-integer constraint `ab mod (a+b) = 0` over the tiny pool `a∈[2,3,4,6]` yields just 3 valid pairs, so a
  student re-drilling easy pipes saw the same 3 questions forever). Fixed by drawing both pipe times for the easy tier
  from a shared wider pool `[3,4,5,6,10,12,15,20,24,30]` — **18 distinct stems** now (6×), still clean small integer
  answers, recompute unchanged (harness 113,001/0). Full 32,400-question re-sweep: **no** tier below 5 distinct stems.
  The audit also found a **stale test-only whitelist**: `scripts/knowledge-base.check.js` `DRILL_CATS` was a frozen
  14-item array used to validate the syllabus layer's `drillable`/`signals` category references — a subset of the real
  36, so a future syllabus entry pointing at any of the other 22 categories would have wrongly failed the check. Now
  derived from `services/quantTopics.js` `CATEGORY_LABELS` (all syllabus refs re-verified valid; 3,654/0). Finally, an
  independent dead-code sweep confirmed the only external consumer of `js/utils/generative-helpers.js` is `questions.js`
  (5 members: gcd/lcm/shuffle/name/twoNames; api/duel.js goes through questions.js) — trimmed the leftover unused
  content-pool exports `NAMES`/`ITEMS`/`item` and the redundant `sample` alias (QRGen surface 21→17), keeping the
  coherent numeric primitive toolbox. Regression proof for the shared helper: DI/LR suites green (di-engine 15,246/0,
  di-set 13,681/0, lr-engine 28,692/0, lr-set 5,155/0). SW v188→v189.
- **Batch 8 — global validation + ship verdict (ADR-084 COMPLETE):** whole-engine acceptance sweep after all batches.
  Full `npm test` green (harness **112,993 assertions / 0 mismatches**; category-source, quick-ref 382/0, learn/statmath/
  subjects counts all pass). Node stress: **4,320-question** cross-topic sweep (36 categories × 3 tiers × 40) found **0
  dirty answers, 0 throws**, all **24 shared names** surface across word problems, longest stem 146 chars. Real browser
  at 360 / 390 / 768 / 1280px, light **and** dark: the redesigned category picker (70 buttons, 11 collapsible sections,
  For-You strip, no overflow) and the Quick-Reference library (5 sections, 21 cards, 42 cross-links, live search, no
  overflow) both render with **0 page errors**. **Ship verdict — GO:** coverage is complete AND discoverable (zero stale
  category lists — every surface derives from the source of truth), the Quant engine matches the DI/LR production bar,
  no regressions, no new deps/Firestore/paywall, no dead code. Docs-only batch → no SW bump.
- **Batch 3 — premium Quick-Reference revision library:** the AskUserQuestion direction was to treat Quick Reference as
  a premium differentiator, not stop at Learn-only tables. Built a curated, standalone revision library at the Learn
  sub-route `#learn/quick-ref` (a hub entry chip opens it). New `js/quick-reference/quick-ref-data.js` holds **21
  curated cards** across 5 sections (Number Sense · Arithmetic & Commercial · Algebra · Geometry & Mensuration · Modern
  Math) — divisibility, HCF/LCM, squares/cubes grids, fraction⇄decimal⇄percent, multiplication shortcuts, speed/time,
  SI/CI, profit-percentage, algebraic identities, AP/GP, log rules, surds & indices, area/volume/surface, trig standard
  values + identities, coordinate geometry, geometry properties, nPr/nCr, probability. `quick-ref-renderer.js` renders
  them into collapsible sections (reusing the global `toggleSection` + `.collapsible-card`), with an **instant search**
  and **per-card Learn/Practice cross-links** (only shown when the target chapter/drill genuinely exists). Tables render
  through the shared `BlockRenderers.table` (same `.math-table` + dark-mode + phone horizontal-scroll); grids reuse
  `.math-grid`. Content is **free** (no paywall flags, no new Firestore). New `scripts/quick-ref.check.js` (into
  `npm test`) enforces the zero-stale-links contract: every card's section, Learn id and drill category must resolve
  and every block must be well-formed (382 assertions). Real-browser verified at 360/768px, light + dark: 5 sections,
  21 cards (19 tables + 2 grids), 42 cross-links, search filters live, empty-state works, no overflow, 0 errors.
  SW v187→v188.
- **Batch 7 — dead-code cleanup:** removed the unused `_round1()` from `js/questions.js` (it kept its own copy; DI
  engines have their own local one) and eight never-called exports from `js/utils/generative-helpers.js` — `mcq`,
  `nearMissDistractors`, `frac`, `commaGroup`, `pluralize`, `gcdArr`, `lcmArr` (function + export each) and `factorize`
  from the public export only (still used internally by `numFactors`). Each was re-grepped across `main-app/`, `api/`
  and `scripts/` before deletion (the apparent `mcq`/`frac` script hits were test-label strings and `fracExponent`
  substrings, not calls). QRGen surface shrinks 29→21 keys; the dual browser/Node export and the duel Node path are
  intact; full `npm test` green. SW v186→v187.
- **Batch 6 — Learn consistency + high-value tables:** five published chapters lacked the "How toppers handle these"
  **exam** block that the rest of the Learn set carries (`multiplication`, `fractions`, `squares`, `cubes`,
  `permutation-combination`) — added one to each so every chapter now teaches strategy, not just method. Added scannable
  comparison **tables** to three formula-dense chapters: `progressions` (AP vs GP), `set-theory` (region → formula), and
  `statistics-basics` (the four measures) — these render in Learn today and are ready to feed the Quick-Reference library.
  A few `searchTerms` added to `squares`/`cubes` for discoverability. Pure content, no schema/renderer change; learn-
  content (588) + learn-render (15) + full `npm test` all green. SW v185→v186.
- **Batch 5 — archetype + explanation + difficulty polish:** four easy tiers each carried only a **single** archetype,
  so the easy band felt monotonous. Added a genuine 2nd easy archetype to each (extending the harness TIER_KEYS + an
  independent recompute case where numeric): **logarithms** → `solveLog` (rewrite logₐx = k as x = aᵏ); **partnership**
  → `shareRatio` (divide profit in the investment ratio, string answer); **ages** → `presentAge` (back-calculate from
  "t years ago"); **simple-interest** → `amount` (P + SI). Enriched six terse explanations to method → working →
  shortcut/trap depth (`logarithms:evalLog`, `surds:indexLaw`, `inequalities:countRange`, `trigonometry:identity`,
  `quadratic:productRoots`, `progressions:gpSum`). Unified the logarithms hard/medium base set to include **10** (the
  common log, previously absent from the product/power/solve archetypes). Recompute-safe — harness re-derives every new
  numeric archetype independently (112,993/0). SW v184→v185.
- **Batch 4 — generator scenario/name diversity:** the shared `NAMES`/`ITEMS`/`twoNames()`/`item()` pools in
  `generative-helpers.js` were built in ADR-083 but **never used** — every word problem hardcoded "A and B" / one fixed
  context, so drills felt templated over a long session. Wired named characters + expanded context pools into the
  word-problem generators: **partnership**, **ages** (ratio-sum + age-difference), **ratios** (divide), **mixtures**
  (8 commodities), **trigonometry** height (7 structures), **set-theory** (14 context pairs). **Recompute-safe** —
  names/items carry no digits so `nums()`-based recompute is byte-identical (harness still 113,050/0). Verified: 20
  distinct names surface across partnership/ages samples; commodities/structures/contexts all vary. SW v183→v184.
- **Batch 2b — personalization + favourites:** the picker gained a **"For You" strip** built entirely from existing
  signals (no new Firestore): **Recommended** (exam-relevance `weightedCategories` for the active exam / overall
  priority), **Continue** (`LearnProgress.recent()` → drillCategory), **Recently practised** (a small localStorage list
  written on focus-drill start via `CategoryPicker.noteRecent`), and **Pinned/Favourites** (localStorage
  `qr_pinned_cats`, a per-row ☆/★ star toggle). Most-asked categories carry a subtle 🔥. The star is a child of the
  `.category-btn`, so the practice click-delegation ignores it; `practice-modes` now reads `data-label` (not
  `textContent`) so button decorations never leak into the drill label. Verified in-browser: strip rows populate from
  seeded signals, pinning updates the strip live, 0 errors, no overflow at 390px. SW v182→v183.
- **Batch 2a — dynamic, discoverable category picker:** the Practice "Choose Category" grid was static HTML frozen at
  the original 14 Quant categories (DI/LR listed in full) — so 22 ADR-083 categories were unreachable there. New
  `js/ui/category-picker.js` renders `#categorySelect` at runtime from the source of truth (registry section grouping +
  `quantTopics` labels; DI/LR from their engines) into **collapsible sections with topic counts and a live search**.
  All 36 Quant categories now appear, grouped Numbers/Arithmetic/Commercial/Algebra/Modern/Geometry/Mensuration, with
  DI + LR (LR tiered; set-only `lr-seating`/`lr-puzzle` excluded as before). The rendered buttons keep the exact
  `.category-btn[data-cat]` click contract, so `practice-modes`/`practice-config` (focus single-select + custom
  multi-select) work unchanged. Sections collapse by default with session-remembered state (localStorage). Verified in
  a real browser: 36/36 Quant present, search filters live, collapse toggles, 0 errors, no overflow at 390px. SW
  v181→v182.
- **Batch 1 — zero stale category lists:** `js/app.js` `formatCategoryName` now resolves Quant labels from
  the single source of truth (`services/quantTopics.js` `CATEGORY_LABELS`) instead of a frozen 14-item map; the same
  derivation replaces the stale snapshots in `js/views/planner-view.js` (`drillName` → `formatCategoryName`) and
  `js/duel-ui.js` (`_categoryEntries` → `QuantTopics.CATEGORY_LABELS`). New categories now render their real names in
  results/stats/history/planner/duel. Intentional narrowed subsets (`ai-features.js WP_CATEGORIES`, `onboarding.js
  EASY_QUESTIONS`) annotated. New `scripts/category-source.check.js` (into `npm test`) asserts
  `categoryGenerators` keys == `CATEGORY_LABELS` keys, every label is real (non-key), and the subject layer derives the
  exact set — so a stale hardcoded list can never ship again. SW v180→v181.

## ADR-083 — Quant Engine Master Overhaul (evolution to the DI/LR bar, complete coverage) (2026-07-01)
- **Context:** Quant is the flagship subject but its engine is the *original* one — DI (ADR-078) and LR (ADR-079) were
  later rebuilt far past it. A 3-agent audit found Quant at ~60% of that bar: 14 numeric generators in `js/questions.js`
  with **no per-generator explanations** (only generic post-hoc tips), **no validation harness**, mixed/lazy difficulty
  (squares/cubes/area/volume just scaled numbers), no archetype registry, no shared helpers, and Learn↔Practice orphans.
  The generators are dual-exported (browser + Node) and power duels — a hard constraint.
- **Decision:** a single coherent, phased overhaul (Foundation → overhaul existing → complete coverage → calibration →
  global validation), every topic production-grade (archetypes · earned difficulty · premium explanations · deterministic
  recompute-validation · exam-authentic wording), zero orphan content. Generators stay **exam-agnostic** (reasoning is
  universal — exam fit lives in ordering/metadata + adaptive bias, not faked math) and **numeric-entry** (except the one
  genuinely-MCQ format, quantity-comparison, which reuses the drill engine's existing options path).
- **Phase 1 (this entry) — foundation + proof:** new `js/utils/generative-helpers.js` (dual browser/Node: RNG, gcd/lcm,
  factorise, clean-check, name/item pools, `mcq`, near-miss distractors). An **archetype framework** in `questions.js`
  (`ARCH = {easy,medium,hard}` of `{k,skill,build}` + `PRIMARY` clean fallback; `_genArch` picks in-tier, retries in-tier,
  never downgrades; tags `subtype:'diff:key'`; attaches a teaching `explanation`). Refactored the 5 laziest/flagship
  generators — **squares, cubes, area, volume, percentages** — to earned-difficulty archetype pools with premium
  explanations (method → working → shortcut/trap) and wording variety. New `scripts/quant-engine.check.js` (into
  `npm test`): structural checks over all 14 categories × 3 difficulties + independent **recompute** for the refactored
  5 + earned-tier / no-downgrade / archetype-diversity assertions.
- **Consequences:** `quant-engine.check` green — 27,917 assertions, 2,250 answers independently recomputed, **0
  mismatches**; full suite green; Node duel path intact; browser boot clean (0 page errors, `QRGen` loaded). No new
  colours/deps/Firestore, no gamification. Phases 2–5 (overhaul remaining 9 generators; add the full missing-topic roster
  with Learn + drill + harness; calibration; global validation) follow under this ADR. SW v167→v168, Bible 2.81→2.82.
- **Phase 2 — overhaul the remaining 9 generators:** brought fractions, multiplication, ratios, averages, profit-loss,
  time-speed-distance, time-and-work, simplification and number-series to the same bar — per-tier archetype pools
  (e.g. TSD = distance/time/speed/avg-speed; averages = mean/missing/weighted/new-member; profit-loss = SP-from-profit/
  loss/profit%/find-CP/successive; number-series = arithmetic/geometric/growing-gap), earned difficulty that never
  downgrades, premium explanations, and exam-authentic wording (word problems, ₹, real scenarios) replacing the old
  robotic "CP = 200, Profit = 25%. SP = ?" stems. Extended `quant-engine.check.js` to recompute **all 14** categories
  (arithmetic stems re-evaluated independently; series next-term re-detected; keyed recompute elsewhere). Result:
  **43,503 assertions, 5,638 answers independently recomputed, 0 mismatches**; full suite + Node duel path green. SW
  v168→v169, Bible 2.82→2.83.
- **Verification interlude (before Phase 3):** an independent regression audit + real-app checks confirmed Phases 1–2
  safe (subtype `diff:key` handled by all consumers, `q.explanation` renders free/ungated, duel/Node path intact, no
  accidental MCQ). Two prep fixes: drill-engine suppresses the generic auto-tip when a written explanation exists (it
  was redundant, and its paywall lock sat contradictorily next to a free explanation); dropped the dead `PI` constant.
- **Phase 3 (batch A) — close the commercial-math practice orphans:** new production-grade generators for
  **simple-interest** (find-SI / amount / find-rate / find-principal), **compound-interest** (amount / CI / CI−SI
  difference) and **partnership** (capital share / capital×time share) — archetype pools, earned difficulty, premium
  explanations, exam-authentic ₹ wording, realistic magnitudes. Registered in `categoryGenerators` + `quantTopics` +
  the random pool; set each Learn topic's `drillCategory` (Learn↔Practice parity); harness recomputes all three
  (**52,956 assertions, ~7,000 recomputed, 0 mismatches**). subjects roster 14→17. SW v169→v170, Bible 2.83→2.84.
- **Phase 3 (batch B) — close the arithmetic practice orphans:** new generators for **ages** (ratio-sum / age-difference
  / father-son multiple), **mixtures-alligations** (alligation-ratio / mean-price / alligation-quantity) and
  **pipes-and-cisterns** (two-inlets-together / inlet-outlet net-fill) — pipes' `drillComingSoon` flag retired now that a
  real dedicated bank exists. Wired + `drillCategory` set on all three Learn topics; harness recomputes the numeric
  archetypes (**62,155 assertions, ~8,000 recomputed, 0 mismatches**). subjects roster 17→20. SW v170→v171, Bible
  2.84→2.85.
- **Phase 4 & 5 — final calibration + global validation (ADR-083 COMPLETE):** a whole-engine sweep confirmed the
  acceptance criteria. **Coverage:** 36 Quant drill categories, each with an archetype generator (earned difficulty,
  premium explanations, exam-authentic wording) AND a gold-standard Learn chapter, cross-linked both ways — **zero
  orphan content** (verified in a script: 0 drills without Learn, 0 Learn without a drill). **Correctness:** the
  recompute harness independently re-derives every numeric archetype across all 36 categories × 3 tiers — **113,039
  assertions, ~14,800 answers recomputed, 0 mismatches**; earned-tier / no-downgrade / archetype-diversity all pass.
  **Number realism:** a 4,320-question cross-topic stress run found 0 dirty answers (all integer or ≤2-dp or valid
  MCQ string), longest stem 146 chars, longest explanation 128 chars. **UI:** real-browser boot clean (KB 62 topics,
  all 15 new categories generate client-side, no JS errors); the longest set-theory stem + the quantity-comparison MCQ
  render with **no horizontal overflow at 360px** and full-width MCQ options. **Metadata/analytics:** every published
  topic carries exam-relevance (statmath 62/62); `subtype:'diff:key'` is consistent for scoring/auto-tips; the whole
  `npm test` suite is green. **Excluded (documented, unchanged):** Races, Data Sufficiency, full plane-geometry proofs/
  constructions/graph-plotting, matrices & determinants, base systems, functions-graphs, algebraic-identities (folded),
  Clocks & Calendars (live under LR). The Quant engine now matches the DI/LR production bar end-to-end. Bible 2.94→2.95.
- **Phase 3 (batch G-b) — quantity-comparison (Phase 3 COMPLETE):** the final new topic — **quantity-comparison**, the
  one genuinely-MCQ Quant format (Banking/CET). The generator computes Quantity I and Quantity II from varied
  sub-problems (percentage / product / linear-solve / average / square) and returns the correct relation
  (I > II · I < II · I = II) via the drill engine's existing `q.options` MCQ path — zero UI work, and Quant stays
  numeric-entry for every other category. Learn chapter (arithmetic) + exam-relevance (order 36) added. **This completes
  Phase 3: 36 Quant drill categories, 36 Quant Learn chapters, zero orphan content, harness 113,039 assertions /
  0 mismatches.** Learn graph 61→62; subjects roster 35→36. SW v179→v180, Bible 2.93→2.94.
- **Phase 3 (batch G-a) — close the last drill-only orphans:** gold-standard Learn chapters for **multiplication**,
  **fractions**, **squares** and **cubes** — the four foundational speed-calc drills that had a bank but no Learn
  content. With these, **every Quant drill has a Learn chapter and every Quant Learn chapter has a drill — zero orphan
  content** (verified in a script). exam-relevance metadata added (orders 32–35); numbers category 3→7 topics; Learn
  graph 57→61. SW v178→v179, Bible 2.92→2.93.
- **Phase 3 (batch F-b) — complete Modern-Math:** two NEW topics — **set-theory** (two-set union/only/neither/both +
  three-set inclusion–exclusion, built from disjoint Venn regions so every count is consistent) and **statistics-basics**
  (median / mode / range / mean). Generator + Learn chapter + harness + exam-relevance each. Modern-Math is now complete
  at 4 topics with zero orphans. Harness **109,447 assertions, 0 mismatches**; Learn graph 55→57; subjects roster 33→35.
  SW v177→v178, Bible 2.91→2.92.
- **Phase 3 (batch F-a) — close the Modern-Math practice orphans:** drill generators for the two drill-less Modern-Math
  Learn chapters — **permutation-combination** (factorial / arrangement / nPr / nCr / committee / handshakes, ASCII
  "7P3"/"8C3" notation so the harness parses it) and **probability** (single-draw / complement / all-heads / multiples,
  clean decimal answers within the numpad's `.`-entry). `drillCategory` set on both (Modern-Math now has zero orphans).
  Harness recomputes via an independent factorial/nCr path — **103,145 assertions, 0 mismatches**; subjects roster
  31→33. SW v176→v177, Bible 2.90→2.91.
- **Phase 3 (batch E-b) — trigonometry + surface-area:** **trigonometry** (standard-angle eval, complementary angles,
  Pythagorean identities, 45° heights-and-distances) with answers restricted to {0, ½, 1}/integer angles/heights so
  numeric entry stays exact and recompute is independent (native `Math.sin/cos/tan`); **surface-area** (cube/cuboid/
  cylinder/sphere, under Mensuration). Heights-and-distances is folded into the trigonometry drill+chapter rather than
  a thin standalone (per "fewer excellent generators"). **Backfilled exam-relevance metadata for all 10 new algebra +
  geometry topics** and pointed statmath.check at the algebra/geometry knowledge files, so every published Learn topic
  is exam-weighted for readiness/planner. Harness **96,837 assertions, 0 mismatches**; Learn graph 53→55; subjects
  roster 29→31. SW v175→v176, Bible 2.89→2.90.
- **Phase 3 (batch E-a) — open the Geometry category:** a NEW `geometry` Learn category (subject: quant, order 45)
  plus two diagram-free topics — **geometry-basics** (angles, triangle angle-sum, Pythagoras via triples, polygon
  angles) and **coordinate-geometry-basics** (distance, midpoint, slope, section). Generator + Learn chapter + harness
  each. Coordinates are generated non-negative so the sign-stripping `nums()` recompute stays exact; slope is the one
  archetype whose answer may be negative (harness exempts it from the non-negative assertion). Pythagorean triples keep
  distance/hypotenuse answers integer. Harness **90,515 assertions, 0 mismatches**; Learn graph 51→53; subjects roster
  27→29. SW v174→v175, Bible 2.88→2.89. *(Geometry ships numeric/formula-only — full plane-geometry proofs,
  constructions and graph-plotting remain excluded per the ADR-083 scope, as they need figures.)*
- **Phase 3 (batch D-b) — complete the Algebra category:** three more fully-packaged topics — **logarithms**,
  **progressions** (AP & GP), **inequalities-modulus** — generator + Learn chapter + harness each. Log stems use
  ASCII-readable bases ("log to base 2 of 8") so the harness parses them; progression stems use a real ordinal helper
  (1st/2nd/3rd) that preserves digits for recompute; modulus/inequality answers are integer counts or the larger root.
  Harness **84,201 assertions, 0 mismatches**; Learn graph 48→51; subjects roster 24→27. Algebra is now complete (6
  topics). SW v173→v174, Bible 2.87→2.88.
- **Phase 3 (batch D-a) — open the Algebra category:** a NEW `algebra` Learn category (subject: quant, order 35) plus
  the first three fully-packaged algebra topics — **linear-equations**, **quadratic-equations**, **surds-indices**.
  Each ships a drill generator (archetype pools + earned difficulty + premium explanations) AND a gold-standard Learn
  chapter, cross-linked via `drillCategory` + `related`. Quadratics use the canonical x² − Bx + C = 0 form (positive
  integer roots) so answers stay sign-clean and the harness can recompute roots/sum/product/discriminant independently;
  linear systems recompute via Cramer's rule; surds via independent power/log evaluation. Harness **74,751 assertions,
  0 mismatches**; Learn graph 45→48; subjects roster 21→24. SW v172→v173, Bible 2.86→2.87.
  *(Deliberately excluded from the algebra drill roster, documented here: `functions_graphs` — the interesting cases need
  a plotted curve; pure numeric evaluation is too trivial and overlaps linear-equations. `algebraic_identities` — folded
  into squares' difference-of-squares archetype + simplification rather than fragmenting into a thin standalone drill.)*
- **Phase 3 (batch C) — close the last existing-Learn orphan (number-system):** new **number-properties** generator
  (archetypes: HCF · LCM · unit-digit-via-cyclicity · number-of-factors) using the shared `QRGen` gcd/lcm helpers.
  Wired into the category map + quantTopics + the number-system Learn topic's `drillCategory`, so **every existing Learn
  Quant chapter now has a drill** (existing-Learn orphan closure complete). The harness recomputes each archetype
  through a genuinely-independent path — modular exponentiation for unit digits, trial-division divisor count for factor
  counts — (**65,279 assertions, 0 mismatches**). subjects roster 20→21. SW v171→v172, Bible 2.85→2.86.

## ADR-082 — Learn UX polish: subject filter, squares/cubes reference, settings-row fix (2026-06-30)
- **Context:** A craftsmanship pass on the Learn tab plus a Settings layout regression and an extension of the
  squares/cubes quick-reference grids. On a narrow phone the "Ask Subject Before Quick Start" settings row clipped its
  toggle (the text column wouldn't shrink, shoving the fixed-width toggle past the card padding). The Learn hub had no
  way to focus one subject. The user clarified the squares/cubes ask is the **reference grids**, not Learn chapters,
  and confirmed **no new Learn chapters** this pass (library stays 45). Constraints: no new colours/animation libs,
  no new deps, no Firestore, no gamification, don't over-engineer for 2–3k users.
- **Decision:**
  - **Settings overflow fix** (`css/style.css` `.settings-label`): add `min-width:0` — the canonical flexbox fix so
    the text column shrinks and a long subtitle wraps *inside* its own column instead of pushing the toggle off-card;
    `.goal-input` gets `flex-shrink:0` for the same robustness. Shared rule → every settings row benefits; verified no
    clipping at 360 light+dark, toggle stays centered.
  - **Squares 1²–30² → 1²–50², Cubes 1³–20³ → 1³–30³** (`learn-view.js` grid loops + value pad widths 3→4 / 4→5;
    `index.html` headers). Pure reference-grid extension, no new topics.
  - **Subject filter** (`learn-view.js` + `.kx-filter*` CSS): a sticky pill row (All · Quant · DI · LR) above the
    category list; pills toggle a `.is-hidden` class on `data-subject` groups (instant swap, animated active-state — no
    re-render/reload). Last choice persists in `localStorage['qr_learn_filter']`, mirroring `qr_active_exam`; clamped
    to a subject that still has content; an override stops the inter-subject divider painting on a now-leading group.
  - **Subtle progress** (`_subjectHeaderHtml`): a quiet "x read" using the completion the app already tracks — reusing
    the existing resume strips + card ticks; no XP/levels/badges.
  - **Search aliases** (`searchTerms`, additive): `ap/gp/hp/progression` → number-series, `p&c` → permutation-
    combination, `tsd` → time-speed-distance, `family tree/genealogy/kinship` → blood-relations; +4 search asserts.
- **Alternatives rejected:** authoring ~50 squares / ~30 cubes Learn chapters (the literal first reading — user
  clarified it meant the grids; would have violated the brief's own "no filler / no tiny topics" rules); shrinking the
  settings fonts (treats the symptom, not the flexbox cause); virtualizing the hub (~45 cards render instantly);
  building new exam chapters (surds/logs/progressions/quadratics/set-theory/data-sufficiency) — noted as a *future*
  option, not in scope.
- **Consequences:** No engine/Firestore/dependency change; library stays 45 (`learn-content` counts unchanged, now 425
  with the alias asserts). Verified via Playwright (real CSS + KB): settings toggle un-clipped light+dark, squares=50 /
  cubes=30, filter switches instantly + persists, 0 page errors. SW v165→v166, Bible 2.79→2.80 (Arch unchanged 2.53).
- **Addendum — final verification & excellence pass (2026-06-30):** a 3-agent read-only audit (independently
  re-verified) confirmed ADR-082 **Fully implemented, zero regressions**, and the 45-topic library **100% spine-
  consistent** — one audit agent's "lr-cause-effect / lr-course-of-action missing formula" and "lr-coded-inequalities
  missing trick" claims were **false on inspection** (all three carry the full spine). Real fixes applied: (a)
  `js/tables.js` — all 5 `SoundEngine.play()` calls routed through a guarded `_sfx()` helper (the rest of the app
  already guards with `typeof`), and the dead `renderMultiplicationTables()` (zero callers) removed. Surgical content
  enrichment (Phase 6 — additive optional blocks, counts unchanged): a "which % sits on which base" comparison **table**
  on `profit-loss`, and **exam-strategy** blocks on `time-and-work` and `lr-blood-relations` (both very-high frequency).
  Deliberately left: subtle-Learn-divider vs Settings-divider and subject>category font hierarchy (intentional), filter
  pill 38px (adequate tap target). SW v166→v167, Bible 2.80→2.81.

## ADR-081 — Learn experience & UI refinement: premium textbook, unified across subjects (2026-06-30)
- **Context:** The Learn tab was content-complete (45 gold-standard topics) but read like a stack of expandable cards,
  and the three subjects (authored at different times) diverged in structure, icons and richness. Every section showed
  a generic repeated heading ("Concept · Concept · Table"); all 20 LR topics shared the default 📘 icon and all 6 DI
  topics had none; 13 LR topics carried only one of the trick/trap callouts; comparisons (perm vs comb, SI vs CI, bar
  vs line, mirror vs water, syllogism all/some/no) lived as prose, not tables. Two just-added decorations (the Practice
  "EXAM-STYLE" rail/eyebrow and an over-long Settings row) added clutter.
- **Decision:** A craftsmanship pass — no new colours/animations/deps, no Firestore — using the existing block system.
  (1) **Reading experience (transforms all 45 pages at once):** each section is now headed by its real name — a concept
  by its own title, a table by its caption, others by richer labels (Overview · Key Formulae · At a Glance · Shortcuts
  & Tricks · Common Mistakes · Exam Strategy · Solved Example · Memory Hook · Key Takeaways); the sticky pills are a true
  table of contents; self-headed blocks no longer get a duplicate eyebrow; more chapter rhythm in the CSS. A new OPTIONAL
  `exam` block (📌 indigo callout) carries "how toppers approach it" — added to the schema/validator/renderer/CSS/check,
  used where it adds value (not forced on every topic). (2) **Icons:** a distinct, meaningful emoji for every one of the
  45 topics (verified unique). (3) **Tables:** comparison tables (reusing `.math-table`) on syllogisms, mirror/water/
  dice, permutation-vs-combination, SI-vs-CI, and a bar/line/pie chart guide. (4) **Callout parity:** every LR topic now
  has BOTH a Shortcuts and a Common-Mistakes callout (added to 13). (5) **Cleanups:** removed the Practice rail/eyebrow
  (Subject-Set cards are plain `.mode-card`s grouped by their header) and made the Settings row concise.
- **Alternatives rejected:** a literal 12-section rewrite of all 45 topics (the brief's hierarchy is illustrative —
  forcing When-to-use/Difficulty-progression/Practice-tips everywhere would bloat content and risk errors; the spirit is
  delivered via named sections + tables + both callouts + exam-strategy on a unified spine); converting tab SVG icons to
  emoji (different surface); forcing `memory` mnemonics onto LR/DI (kept optional — no fake mnemonics).
- **Consequences:** No engine/Firestore/dependency change; the `learn-content` (45 / per-category counts, required
  blocks) and `learn-render` (every renderer incl. `exam` + `sectionLabel`; XSS escape) checks stay green. Verified by
  rendering Quant/DI/LR topic pages (light + dark) — chapter-style named sections, tables fit, distinct icons, no
  overflow. SW v163→v164, Bible 2.77→2.78 (Arch unchanged 2.53).
- **Addendum — final craftsmanship verification pass (2026-06-30):** a 3-agent read-only audit ("assume bugs, prove
  it") of the ADR-080/081 work found the bulk correct (named sections, the `exam` block, tables, callout parity, the
  Stats hierarchy + no gamification, `statMath`/`QR_EXAMREL`, tests/docs/counts all verified green). It surfaced a
  real **icon-distinctness** miss: the earlier "45/45 unique" self-check compared topics only against each other, so
  six topic icons that duplicated their **parent category** glyph slipped through (`di-bar-line`=`di-charts` 📊,
  `number-system`=`numbers` 🔢, `simplification`=`arithmetic` 🧮, `area`=`mensuration` 📐, `probability`=`modern-math`
  🎲, `profit-loss`=`commercial-math` 💰) — visible side-by-side in the hub head + topic breadcrumb. **Fix:** keep the
  precise topic icons; broaden the 5 Quant **category** glyphs (🔟 ➗ 🏷️ 🃏 📏) and give the one outlier DI topic a
  distinct icon (`di-bar-line` 📊→📉). The full 45-topic + 7-category set (52 glyphs) is now verified unique. Also:
  tightened the two longest concept bodies (`ratio-proportion`, `di-bar-line`) to crisper leads; reordered the
  `practice-subject-modal.js` script before its caller; deleted dead `.category-stat-row`/`.cat-accuracy` theme CSS;
  and **added four scripts the precache list was missing** (`security-events`, `maintenance-gate`, `ui/coming-soon`,
  `views/inbox-view` — an offline-robustness gap; the `../shared/auth-validators.js` one is out of SW scope, so left).
  SW v164→v165, Bible 2.78→2.79.

## ADR-080 — Practice · Learn · Stats UX craftsmanship pass (one cohesive premium platform) (2026-06-30)
- **Context:** QuantReflex grew tab-by-tab (Quant → DI → LR), so Practice, Learn and Stats read as three modules
  bolted onto a shared shell. A craftsmanship pass (not a redesign) to make them feel like one designed product —
  keeping the premium-blue identity, the Battle-Archives modal, and the existing motion vocabulary; **no** new colors/
  gradients/animation libraries, **no** gamification (the user was explicit: a premium productivity tool, not a game —
  no XP/coins/levels/badge-walls/daily rewards).
- **Decision (5 phases, each independently green):**
  - **Data foundation.** Enriched the per-answer recorder (`js/progress.js`) with per-category solving time + last-
    practiced + a difficulty-mix counter + a day-reset `todayCats` tally — all additive/guarded, flowing through the
    existing save/sync (**no new Firestore collection, no migration**). New **exam-relevance metadata layer**
    (`data/knowledge/exam-relevance.js`, `QR_EXAMREL`) keyed by topic id: per-track importance (CAT · SNAP/NMAT ·
    Banking · SSC), overall priority, recommended study order, most-asked flag — authored for all 45 topics. It lives
    UNDER the hood (drives readiness, recommendations, ordering, contextual badges, future exam filters), never a badge
    wall. Six new **pure** `statMath` derivations (timeInvested · masteryDetail · comparativeInsights · examReadiness ·
    weakestTopics · nextRecommendation), all confidence-damped so thin data can't read "90% ready". New
    `scripts/statmath.check.js` (537 assertions) wired into `npm test`.
  - **Practice.** Re-sectioned into Quick Start / **Subject Sets** (the premium exam-style DI/Reasoning sets, given
    hero emphasis) / Advanced; killed the dead band above "Quick Start". Quick/Reflex/Timed now open a **subject
    picker** (`js/ui/practice-subject-modal.js`, reusing the Battle-Archives shell) so a session is scoped to Quant/DI/
    LR/Mixed — remembered, with a "Don't ask again" option (a Settings toggle, default on).
  - **Learn.** Subject sections now breathe (blurb + count + difficulty coverage + divider); LR's 20-topic wall (and
    DI) split into pedagogical **render-time sub-groups** (no drill/analytics/subjects change); single high-value
    **contextual badge** per card only — "⭐ For <exam>" when a target exam is set, else "🔥 Most Asked".
  - **Stats.** Rebuilt to answer **"Am I becoming better at aptitude?"**: Today · Momentum · Subject Mastery ·
    Performance Insights (QuanAI-style comparative lines) · Exam Readiness (per-exam scores, target pinned first) ·
    Time Invested · Study Next (ranked weakest, deep-linking to drills) · QuanAI Recommends (one decisive step). Honest
    throughout — empty states + confidence damping, never fabricated numbers.
  - **Cross-cutting.** Unified the Practice/Stats section-title styling; fixed `value-sm` mid-word wrapping; everything
    else reuses the shared card/bar/badge/motion tokens.
- **Alternatives rejected:** gamification (forbidden — premium-tool feel); permanent per-exam badges on every card
  (metadata stays under the hood; surface only contextual indicators); a Stats heatmap + achievements persistence layer
  (new stored state for little gain at ~2-3k users — readiness + time-invested + weakest-topics deliver the motivation
  honestly); splitting `lr-reasoning` into real categories (would ripple into subjects/drill/analytics for zero gain
  over a presentational `group`); per-category weekly insight claims (no per-category daily history is stored — we don't
  fabricate them, only the comparisons the stored data supports).
- **Consequences:** No new deps, no new Firestore I/O, no migration. Readiness/insights are O(cats) pure functions. Two
  new client files precached; SW v161→v162; Bible 2.76→2.77 (Arch unchanged 2.53). Verified with seeded render
  harnesses (Practice + subject modal, Learn hub, Stats premium + free) at 360/768 × light/dark — no overflow/clip, no
  JS errors; `npm test` green incl. the new statmath check.

## ADR-079 — Logical Reasoning Excellence: hybrid generative + authored + visual (2026-06-30)
- **Context:** LR (ADR-075) was correctness-bulletproof but pedagogically v1: 7 generators with FLAT difficulty (a
  tier just picked a random pattern — difficulty was not *earned* by reasoning depth like DI's ADR-078 archetypes),
  thin scenarios, numeric-only odd-one-out and analogy, 6 hard-coded blood-relation compositions, no per-category
  teaching tips (LR fell through `getAutoTip`'s generic fallback), and no puzzle SETS. A sourced syllabus study across
  MBA (CAT/XAT/SNAP/NMAT/CMAT/MAH CET), Banking/Insurance (IBPS/SBI/RBI/NABARD/LIC) and SSC/RRB established the LR
  topic universe and a hard truth: **only ~65% of high-frequency LR is procedurally generatable** with a unique
  machine-checkable answer (coding, blood, directions, ranking, syllogisms, coded inequalities, series, calendars,
  clocks, input-output, seating/scheduling via a solver). **~25% requires authored natural-language content**
  (critical reasoning, statement-assumption/conclusion/argument, cause-effect, course-of-action, decision making —
  CAT/XAT-critical, cannot be generated at exam quality). **~10% is visual/figure** (mirror/water/dice/cube/figure
  series-analogy generatable; paper folding/cutting and complex embedded figures need authored art).
- **Decision:** Evolve LR into a **hybrid platform** — generative where it genuinely works, authored where educational
  quality demands it, deterministic-visual where figures can be generated and auto-validated — all riding the SAME
  drill/test/stats/planner/QuanAI/bookmark pipeline so students never feel two engines. **This intentionally relaxes
  the ADR-075 "generative-only / no-authored-content" moat** for verbal/critical reasoning, a deliberate choice that
  correctness of education outranks ideological purity (user-sanctioned). Three pillars:
  - **Generative core (Pillars stay the default):** `lr-engine.js` rebuilt around earned-difficulty archetype tables
    per topic (difficulty from logical steps, never longer reading); deepened coding (letter/number/symbol/new-pattern
    subtypes), generative blood-relation solver + coded blood relations, direction turns/bearings, multistep & circular
    ranking, verbal/letter odd-one-out and analogy, syllogism possibility/either-or/3-statement (Boolean model-checker
    extended). New generatable topics: coded inequalities (transitive-closure solver), letter/alphanumeric series,
    calendars, clocks, machine input-output.
  - **LR puzzle SET engine:** NEW `js/lr-set-engine.js` — a constraint generator + brute-force solver builds a valid
    seating/floor/scheduling arrangement, derives a clue subset, **verifies the clues admit exactly one solution**,
    and emits a shared text `context` + 3–6 progressive distinct-skill linked MCQs. REUSES the drill `opts.diSet`
    set-mode wholesale (no second runner).
  - **Authored hybrid subsystem:** NEW `data/lr-authored/*` content banks behind a real schema (id, topic, subtype,
    difficulty, exam map, explanation + version, tags, review status, metadata) + a pure `validateItem()`; NEW
    `js/lr-authored-engine.js` registers authored categories into `categoryGenerators`, samples unseen items (no
    in-session repetition), is searchable for Learn, and maps to the drill schema with a rich teaching `explanation`.
    A new drill **explanation-display seam** shows authored explanations on reveal; **bookmark/review** now stores the
    full question object so authored + generated LR are reviewable (was filtered out). Every item is gated by
    `scripts/lr-authored.check.js` (answer∈options, distinct options, no placeholder/dup-id, length sanity, valid
    exams). Quality over quantity — the validator is the gate, not a target count.
  - **Generative visual engine:** NEW `js/ui/lr-figures.js` (pure SVG `render(spec)`/`describe(spec)` mirroring
    `di-charts.js`: viewBox vector = DPI-independent, dark-mode CSS overrides, `role="img"`+aria, XSS-safe) + NEW
    `js/lr-visual-engine.js` deterministic generators (mirror/water/dice/cube/figure-series/figure-analogy via
    rotation/reflection/translation/shading transforms). A drill **figure-option seam** renders SVG inside option
    buttons. Every visual question has a single deterministic answer, no ambiguity.
- **Syllabus hierarchy (the finalized map):** Foundation (coding, blood, direction, series, analogy, odd-one-out) ·
  Core (ranking, syllogisms, coded inequalities, calendars, clocks) · Advanced (seating set, puzzle set, input-output)
  · Verbal/Critical authored (critical reasoning, statement-X, cause-effect, course-of-action, decision making) ·
  Visual (mirror, water, dice, cube, figure series, figure analogy). Practice groups buttons by these tiers.
- **Alternatives rejected:** stay strictly generative (leaves a real CAT/XAT gap; user chose educational quality);
  a full non-verbal art subsystem now (paper folding/cutting, complex embedded — need an authored-art pipeline;
  deferred but architected to plug into `lr-figures.js`); Tournaments/Games sets (CAT-only, large bespoke solver, low
  ROI for ~2–3k users); stored per-archetype mastery (Firestore migration — forbidden; analytics stay derived-on-read).
- **Consequences:** No Firestore footprint, no new deps. New categories auto-roll-up under subject `lr` via
  `subjects.js#_lrCats()` → `LREngine.categories()`. Each category validated in `npm test`
  (lr-engine/lr-set-engine/lr-authored/lr-figures checks — independent recompute, model-checking, unique-solution,
  schema validation). SW bumped, Bible/Arch versioned. (Counts/versions finalized at ship.)
- **Hardening (2026-06-30, ADR-079 follow-up):** a trust-nothing re-audit (3 adversarial agents — integration-
  completeness, dead-code/architecture, difficulty/authored-quality/docs) confirmed the engine sound (green tests, 0
  Firestore I/O, all 25 categories integrated, docs counts exact, 57 authored items all defensible) and drove targeted
  fixes: (a) **visual difficulty calibration** — `lr-dice` was FLAT (ignored difficulty) and mirror/water/figure-series
  tiered cosmetically; now each escalates by REASONING (dice: opposite → five-hidden-sum (21−top) → two-dice bottoms;
  mirror/water: 1→2→3-glyph strings where a real mirror reverses glyph order; figure-series: constant → alternating
  two-step; figure-analogy hard = an unambiguous glyph reflection — deliberately NOT a rotation-vs-reflection arrow
  analogy, which is ambiguous from one example, because correctness outranks a difficulty label); (b) **Learn gap** —
  added 3 missing topics (Input-Output, Cause & Effect, Course of Action) so every drillable single-question LR
  category has teaching (42 → 45 published); (c) **authored easy-tier balance** — +7 easy items (57 → 64); (d) **dead
  code** — removed 4 unused public exports (`_compose2`/`_codeOps`, `_buildRaw`/`_perms`; functions stay, used
  internally). Still derived-only, no migration, no deps. `lr-figures.check` recompute branches updated for every new
  visual form; stress 51,004 questions + 39,600 figures, 0 defects. SW v159→v160, Bible 2.74→2.75 (Arch unchanged 2.53).
- **Content-excellence pass (2026-06-30, ADR-079 follow-up):** a quality-over-quantity pass on the *content itself*
  (not the engine), driven by "I'd rather have 300 outstanding questions than 3000 generic ones." Research re-confirmed
  the real LR question forms across CAT/XAT/CMAT/NMAT/SNAP and IBPS/SBI/RRB/SSC; no questions copied verbatim — premium
  items are original but carry an `inspiredBy` exam-pattern tag for transparency (never mislabelled as official PYQs).
  Changes: (a) **validator hardening** (`lr-authored.check.js`) — added duplicate-stem, duplicate stem+options, and an
  *exploitable-length give-away* gate (correct answer must not be >35% longer than every distractor — a "pick the
  longest" tell), excluding verdict and data-adequacy banks where short options are authentic; this caught and forced
  the rewrite of ~11 lazy dismissive distractors into believable full statements arising from real reasoning mistakes.
  (b) **authored expansion by genuine value** — premium CR items (evaluate/complete/method/parallel subtypes added to
  the schema) and +4 medium decision dilemmas (hospital conduct, disaster-relief priority, hiring conflict-of-interest,
  retail mis-selling); bank 64 → **77 items**, lifting the thin medium-decision pool 6 → 10. (c) **generative
  authenticity** — wider real-word/name/noun pools (coding 20→62, names 12→32, syllogism nouns 16→40), six more
  odd-one-out groups, eight more verbal analogies, and human scene-setting on direction/ranking stems so generated
  questions stop reading as templated ("A person…" → varied actors/openers). All correctness-safe: every code/relation/
  syllogism is recomputed from its token, so the harness still re-derives all of them. (d) **clock easy variety** — was
  one question form (angle at H:00, 6 possible answers → felt repetitive); now five genuine exam forms (H:00 / H:30
  angle, minute-hand and hour-hand degrees), lifting a 40-draw variety probe 11/40 → ~32/40. (e) **ring safeguard**
  (`lr-authored-engine.js`) — on a pool smaller than the recent-id ring, never re-serve the immediately-previous item
  (a back-to-back repeat is the one thing a user always notices). (f) **UI robustness** — `.mcq-option` now wraps long
  text defensively and paragraph-length options (>48 chars, the new statement/decision distractors) left-align as prose
  via a `mcq-para` modifier instead of centred labels. A near-term **variety metric** was added to the stress harness
  (40-draw window, full stem+options+figure signature; ≥0.70 for generative/visual; authored asserted against the real
  engine ring window) — it flags genuine small-pool weaknesses, not natural bounded-pool collision. Still derived-only,
  no migration, no deps. Full `npm test` green; stress 51,003 questions + 39,600 figures, 0 defects, 0 low-variety
  tiers, 0 ring failures. SW v160→v161, Bible 2.75→2.76 (Arch unchanged 2.53).

## ADR-078 — Data Interpretation Engine v2: earned difficulty, multi-series renderer, DI sets (2026-06-30)
- **Context:** DI (ADR-074) was architecturally clean but pedagogically v1: difficulty was reasoning-based yet had a
  dishonest fallback (a "hard" question whose data wouldn't compute cleanly silently emitted `hard:read`) and a
  mislabeled single-% "project" archetype; data was unrealistic (every value a multiple of 10); charts were
  single-series only (no authentic cross-series DI); the free-tier wrong-answer tip had no DI keys (generic fallback);
  and real exams test SETS (one chart, 3–6 linked questions) which the app couldn't do. A sourced exam-syllabus study
  (CAT/XAT, IBPS/SBI/RRB, SSC, Insurance) grounded the priorities: tables/bar/pie/line + %/ratio/avg/share = Very High;
  grouped/stacked bars, multi-line, missing-data, caselets, cross-series = High→Very High; radar/bubble/area = Low
  (out of scope).
- **Decision:** Overhaul DI in-place along four axes, reusing everything and adding no Firestore footprint.
  - **Earned difficulty:** `di-engine.js` is rebuilt around an explicit `ARCHETYPES` table `{key, tier, skill, build}`.
    A tier picks an in-tier archetype and constructs data so the answer is clean BY DESIGN; if a random build can't be
    clean it retries within the SAME tier, and each tier has a guaranteed-clean primary — so a label is never unearned
    (the `hard:read` bug is impossible). `project` retired. Data is realistic (varied integers; time-series trends with
    bounded continuity). New archetypes: rank, missing-value/reverse, ratio, contribution, weighted/overall growth,
    "by how much".
  - **Multi-series renderer:** `di-charts.js` gains an optional `series:[{name,values}]` + `stacked` model rendered by
    shared lean SVG helpers (grouped/stacked bars, multi-line; tables already multi-column). **Back-compat is a test:**
    a spec with `values` (no `series`) renders byte-identically. This is the seam future chart kinds plug into. Enables
    authentic cross-series archetypes (combined, cross-diff, ratio-across-series, trend-compare, series-share).
  - **DI sets (the second engine):** NEW `js/di-set-engine.js` `generateSet()` returns one shared dataset + chart (or
    caselet context) + 3–6 progressive, distinct-skill questions, each independently validated. It REUSES
    `DIEngine._datasets/_charts/_arch` (no parallel data model). **Presentation reuses the drill engine**, not a second
    runner: a guarded `opts.diSet` set-mode renders the shared context ONCE in a persistent region and swaps only the
    question block per question (dataset cached, never regenerated), reusing scoring/feedback/recordAnswer/timers/
    results/exit. The single-question and Quant render paths are bypassed by an early-return guard (zero regression).
  - **Teaching + Learn:** `scoring-service.getAutoTip` gains per-chart-type + per-archetype-key DI tips (reasoning +
    shortcut + the specific trap: %-point vs %, unit, total-vs-avg). New Learn topic "DI Sets & Multi-Series Charts".
  - **Analytics derived-only:** set answers ride existing `categoryStats` di-* keys via `recordAnswer` exactly like
    single questions; `subjectRollup` unchanged. Per-difficulty/calc-type mastery storage is **declined** (it needs a
    Firestore migration the project forbids) — documented as a future recommendation; chart-type mastery already shows
    in Stats.
- **Alternatives rejected:** a stored `subjectStats`/difficulty-breakdown (Firestore migration — forbidden); a second
  parallel set-runner UI (would duplicate and risk the proven drill engine); persistent-DOM via re-architecting
  `renderQuestion` for all modes (chose an isolated set-mode branch instead — protects the existing path); radar/
  bubble/area charts (Low exam relevance).
- **Consequences:** No schema/AI-contract change, no new deps. Validated hard: di-engine.check (2400 samples, 100%
  independently recomputed, earned-tier + no-`hard:read` assertions), di-set-engine.check (4403 set questions, 100%
  recomputed, progressive + distinct-skill), di-charts.check (multi-series), plus a stress pass (6400 charts + 8771 set
  questions, 0 render defects). DI 5→6 Learn topics (31→32). SW v156→v157. Bible 2.71→2.72, Arch 2.50→2.51.
- **Hardening (2026-06-30, ADR-078 follow-up):** a trust-nothing re-audit (3 adversarial agents) confirmed the engine
  sound and drove: (a) **calibration** — the single-question multi-series HARD pool dropped bare cross-series add/
  subtract (genuinely medium; the Sets engine already tiered them right) for earned cross-series reasoning (percent-
  difference, ratio, contribution, grand-total share, trend comparison); (b) **realism** — theme pools ~12 → ~40
  domains with per-theme value ranges, caselet contexts 6 → 16 (banking/government narratives, explicit second group);
  (c) **horizontal bar charts** — a back-compatible single-series `_hbar` path (common in Banking/SSC), renderer
  architecture preserved; (d) faculty-grade wording; (e) fixed the DI-set session-summary category (was 'mixed').
  Still derived-only, no migration, no deps. SW v157→v158, Bible/Arch 2.73/2.52.

## ADR-077 — Final Craftsmanship Pass: premium refinement, not redesign (2026-06-30)
- **Context:** With the three-subject Speed-Aptitude spine complete and stabilized (Phase 4.5: no functional
  regressions), the remaining gap was *craftsmanship* — making every screen feel noticeably more premium without a
  redesign. The user's guardrails were explicit: preserve QuantReflex's identity (Quant stays the strongest pillar),
  no new design language, no new features, and **"if a change doesn't meaningfully improve the student experience,
  don't make it."** Three read-only audits (design-system · interactions/motion · Learn/QuanAI/IA/a11y) converged that
  the product is already premium and surfaced a small set of real, low-risk refinements — plus a few "findings" that
  conflicted with the project's own constraints.
- **Decision:** Ship only the high-leverage, low-risk refinements; decline the rest, and record why.
  - **MCQ feel (the newest surface):** align `.mcq-option` to the app's button system (token radius, `.6rem` gap, 1rem
    text, more generous tap targets) + a tablet/desktop `max-width` so the two columns read as a tidy pair; add a
    press-down `.pressed` state with **parity to the numpad** — wired by a *delegated* pointer listener in `numpad.js`
    that toggles only a visual class and **never grades or advances**, so the three subjects feel like one input
    surface with zero risk to answer state.
  - **Accessibility hardening (additive only):** the QuanAI bottom-sheet gains Escape-to-close, focus-into-dialog on
    open, and focus-restore on each new turn; the Practice category picker wraps each subject in a labelled
    `role="group"` (with a `.category-group` spacing rule to preserve the inter-group rhythm the old sibling selector
    provided); onboarding goal buttons expose `aria-pressed`; the Stats 7-day sparkline gains `role="img"`.
  - **QuanAI parity:** `blockHTML` applies `\n`→`<br>` consistently across the free-text `say`/`callout` blocks (was
    only `card`); `Companion.showLoading` is exported and reused by `planner-view.open()` so opening an existing plan
    shows the **same staged shimmer** the Coach/Insights use (perceived-performance parity), not a flat line.
  - **One copy voice — evolve, don't replace:** onboarding intro/Learn copy and the About mission move from Quant-only
    phrasing to the Quant/DI/LR spine and name QuanAI, while keeping the QuantReflex name and Quant-as-strongest-pillar.
    Already-correct identity surfaces (hero, "What is QuantReflex?", meta, manifest) were left as-is.
- **Explicitly declined (with reasons):** (1) tokenising the ~2,260 hardcoded hex colors — large, risky, and contrary
  to "no over-engineering for ~2-3k users"; (2) rewriting the V1 category-grid spacing — pre-V2 critical-path code,
  imperceptible benefit, real regression risk. Both recorded as future recommendations, not done now. The Learn
  "empty subject header" finding was a non-issue (the renderer already derives groups from real category presence).
- **Consequences:** Pure client polish — **no logic, schema, or AI-contract change**; the ~38k-assertion suite stays
  green. SW v154→v155. Bible 2.69→2.70, Arch 2.48→2.49.

## ADR-076 — Unified Aptitude Intelligence: one cross-subject platform (V2 Phase 4) (2026-06-30)
- **Context:** Phases 1-3 shipped three Speed-Aptitude subjects (Quant, DI, LR) that already reuse the pipeline, but
  the *intelligence* and *analytics* were still per-category and the identity still read "mental math". Phase 4 is the
  FINAL V2 phase — **integration & polish, not expansion** (no new subjects, no syllabus growth): make the app feel
  like one platform with QuanAI at its core. A pre-flight regression audit confirmed the foundation was stable; its one
  live finding — `computeSessionInsight` leaking raw `di-bar`/`lr-syllogism` ids in the post-session line — was fixed
  by routing through the engine-aware `formatCategoryName`.
- **Decision:** Build the cross-subject view ONCE in the existing derivation layer and let every consumer read it.
  - **The rollup (the keystone):** `statMath.subjectRollup(stats, subjectCats)` + `weakestSubject(...)` added to the ONE
    derivation layer (ADR-053). Pure and dependency-free — the subject→categories map is **passed in** (callers source
    it from `subjects.js`), so client Analytics and server QuanAI compute the identical per-subject picture and **can
    never disagree**. DERIVED on read from `categoryStats`; **no `subjectStats`, no Firestore migration.**
  - **QuanAI is now cross-subject (one intelligence, no duplicate prompts):** `studentProfile.build` adds
    `ctx.masteryBySubject` + `ctx.weakestSubject`; `serialize()` emits one `SUBJECTS: Quant X% · DI Y% · LR Z%` line
    with a single instruction to *coach across subjects* (a percentages gap slows DI; weak pattern-spotting hurts LR) —
    so Coach, Insights, Planner and Chat (all read the same `serialize`) connect subjects naturally. The QuanAI persona
    was unified from "quantitative-aptitude mentor" to "Speed Aptitude mentor" spanning Quant/DI/LR.
  - **Unified analytics:** the Stats view renders an "aptitude by subject" breakdown (Quant/DI/LR accuracy + tier)
    above the per-category list — derived from the SAME rollup, reusing the category bar/strength styling (one design),
    shown only once a 2nd subject has data. Overall → subject → category, no new screen, no clutter.
  - **Mixed Aptitude practice:** a new one-tap mode draws a fresh balanced cross-subject spread (Quant-heavy, mirroring
    a sectional test) via the existing `generateMultiTopic` — the clearest "one platform" practice surface. Custom
    Training already enabled cross-subject sessions; this makes it a single tap.
  - **Identity:** user-facing copy moved from "mental math / quantitative aptitude" to **"Speed Aptitude"** (meta,
    hero, About, manifest, share) now that three subjects ship; feature-specific "Mental Math Tricks" copy kept.
- **Deliberately deferred (documented, not built):** full DI/LR **in duels** (the duel prompt schema is text-only —
  needs to carry chart specs / MCQ options) and Planner **DI/LR drill scheduling** (needs syllabus topic changes,
  out of scope). The cross-subject AI context delivers the intelligence without those.
- **Consequences:** statMath +2 pure functions; studentProfile/aiPrompts/stats-view/practice-modes/scoring-service +
  identity copy. One duplicated Quant label map removed (scoring-service). No Firestore/security/payment change, no new
  collection/field, no new dependency. subjects.check +7 rollup assertions; full suite green. SW v152→v154 (v154 =
  final-audit polish: the Stats subject-breakdown bar colour + label now use the same pct cuts as the category list).
  Bible 2.67→2.68, Architecture 2.46→2.47.

## ADR-075 — Generative Logical Reasoning engine + MCQ drill support (V2 Phase 3) (2026-06-30)
- **Context:** Phase 3 completes the Speed-Aptitude spine (Quant → DI → **LR**). The mandate: "Speed LR", not generic
  LR — only topics that are **procedurally generatable**, produce many variations, reward fast reasoning, and fit the
  AI/analytics ecosystem. Topics needing handcrafted content (large seating arrangements, floor puzzles, reading-heavy
  / analytical puzzles, statement-conclusion/assumption, cause-effect) are **excluded** (they fail the Generation Test
  and edge into the authored-content/VARC zone ADR-067 deliberately avoids).
- **Decision:** A generative LR engine + the one piece of new infrastructure it needs (MCQ input), both reusing the
  existing pipeline.
  - **Engine (`js/lr-engine.js`), 7 topics:** Coding-Decoding, Blood Relations, Direction Sense, Ranking & Ordering,
    Odd One Out, Analogies, Syllogisms. Each is procedurally generated with genuine easy/medium/hard (direct →
    multi-step → multi-condition/inference). **Numeric** answers where natural (coding-sum, direction-distance,
    ranking, analogies → numpad, duel-grade-able) and **multiple-choice** otherwise (blood, odd-one-out, syllogisms,
    coding-cipher, direction-MCQ). Self-registers into `questions.js`'s `categoryGenerators` (same dedup/difficulty/
    focus/custom/timed/adaptive pipeline); kept OUT of the random Quant pool (`generators[]`) and OUT of duels (server
    never `require`s it). MCQ stems embed their data (e.g. odd-one-out lists the numbers) so the engine's text-dedup
    still varies. **Syllogisms** use a curated, convention-independent (Boolean-logic) template set; their correctness
    is re-verified in tests by an **independent 256-region set-logic model-checker** — no debatable answers ship.
  - **MCQ drill support (the only new infra):** when a question carries `options[]`, the drill engine renders option
    buttons in place of the numeric input, suppresses the numpad, and hides Submit (a tap IS the submit) — then reuses
    the **exact** string grader, feedback, `recordAnswer`, and "Next →" flow, and reveals the correct option / marks
    the wrong pick. **Numeric Quant/DI is completely untouched** (guarded on `q.options`).
  - **Reuse everywhere else:** `data/subjects.js` registers the `lr` subject (categories lazy-sourced from the engine —
    no duplicated list); the Practice picker gains a third grouped section (no new tab); Learn gets `data/knowledge/
    lr.js` (7 gold-standard topics, hub groups by subject); QuanAI/Stats label LR via the engine and LR rides
    `stats.categoryStats`, so Coach/Insights/`topWeakCategory`/analytics work with no redesign.
  - **Duel assessment:** the numeric LR topics (coding-sum, direction-distance, ranking, analogies) are *duel-ready in
    principle* (numpad + string/number grading), but enabling LR in duels needs the server to load the engine and the
    duel prompt schema to carry MCQ options — so, like DI, **LR is fenced out of duels this phase** (a documented later
    step). MCQ-in-duels specifically would require a schema change; deferred to preserve duel fairness/flow.
- **Excluded (per philosophy, not stubbed):** seating arrangements, floor/analytical puzzles, reading-heavy LR,
  statement-conclusion/assumption, cause-effect, input-output — none are cleanly generatable at quality.
- **Consequences:** New `js/lr-engine.js`, `data/knowledge/lr.js`; one conditional MCQ branch in the drill engine;
  subject/labeler/picker/Learn touch-ups. **No Firestore migration** — `categoryStats` gains `lr-*` keys, subject still
  derived. No new dependencies, no new functions, no security/payment change. New `scripts/lr-engine.check.js` (incl.
  the model-checker); Learn 24→31 topics. SW v149→v152 (v151 colour-blind ✓/✗ on MCQ; v152 = independent-audit fixes:
  odd-one-out single-misfit uniqueness + an MCQ null-guard). Bible 2.66→2.67, Architecture 2.45→2.46.

## ADR-074 — Data Interpretation engine: a generative, chart-based Speed-Aptitude subject (V2 Phase 2) (2026-06-30)
- **Context:** Phase 1 (ADR-073) opened the derived subject seam. Phase 2 fills it with the first new subject, **Data
  Interpretation (DI)** — the strongest fit for the moat (DI *is* calculation on charts; it generates; speed still
  means something). The hard requirement: DI must feel native — reuse Learn, Practice, drills, analytics, QuanAI,
  Premium, Firestore and the subject layer rather than fork a parallel system.
- **Decision:** DI is a **generative** subject (no static banks) that rides the EXISTING pipeline.
  - **Engine (`js/di-engine.js`).** Synthesizes a small dataset and asks a calculation about it, for 5 families —
    `di-bar`, `di-line`, `di-pie`, `di-table`, `di-caselet`. Difficulty changes the THINKING (easy = one lookup;
    medium = a 2-step total/difference/average/share; hard = % change, deviation-from-average, combined share,
    projection). Answers are ALWAYS numeric and **"clean" (integer or one decimal), generated by retry-until-clean**,
    so the app's numpad + answer tolerance grade them fairly with zero new input UI. The engine **self-registers** its
    generators into `questions.js`'s `categoryGenerators`, so `generateQuestion(s)`/`generateMultiTopic` route DI
    through the SAME dedup/difficulty/focus/custom/timed/adaptive pipeline — but it is deliberately kept OUT of the
    random Quant pool (`generators[]` untouched, so a blind mix never sprouts a chart) and OUT of duels (the server
    never `require`s di-engine, and the duel prompt schema is text-only).
  - **Renderer (`js/ui/di-charts.js`).** Dependency-free, responsive inline **SVG** (bar/line/pie) + HTML table — no
    Chart.js/D3 ("~2–3k users, don't over-engineer"). Value labels are printed ON the chart (DI is about reading
    numbers) and it is accessible (`role="img"` + a data-rich `aria-label`) and XSS-escaped. The drill engine gets a
    SINGLE hook: render `q.chart` above the stem; grading/numpad/feedback are 100% reused.
  - **Subject + Practice.** `data/subjects.js` registers the `di` subject (categories resolved lazily from di-engine —
    no duplicated list). The Practice picker is grouped into "Quantitative Aptitude" + "Data Interpretation" sections —
    one picker, **no new tab/navigation**. Focus = single DI category; Custom = mix DI + Quant.
  - **Learn.** `data/knowledge/di.js` adds a DI category + **5 gold-standard topics** (same schema/depth gate as Quant)
    that deep-link to DI drills; the Learn hub now **groups categories by subject** (activating the Phase-1 seam).
  - **QuanAI + analytics — reuse, not duplicate.** DI flows through `stats.categoryStats` (keyed by `di-*`), so Coach/
    Insights/Stats see DI per-category mastery automatically and `topWeakCategory` can surface a weak chart type. The
    server (`studentProfile.label`) and client (`formatCategoryName`) labelers fall back to the DI engine's labels so
    DI reads as "Bar Graphs", not "Di Bar"/"General Math". **Explanations are grounded**: `DICharts.describe()` prepends
    a compact text summary of the chart's data to the question before AI Explain (the pixels aren't sent; the numbers
    are). No duplicate prompts. The Planner already schedules DI **study** (the syllabus weights `di_tables_charts`
    very-high for Banking/CAT); linking those topics to DI *drills* is a deliberate follow-up.
- **Deliberately deferred (documented, not stubbed):** DI in **duels** (needs the duel prompt schema to carry a chart
  spec) and DI in **Review Mistakes** (a stored mistake has no chart to replay — DI is excluded from replay but still
  counts in stats); the **statMath per-subject rollup** (a "DI vs Quant" headline) stays Phase 4; per-category **par-time
  tuning** for DI's slower pace is a recommendation.
- **Consequences:** New `js/di-engine.js`, `js/ui/di-charts.js`, `data/knowledge/di.js`; one drill-engine render hook;
  subject/labeler/Learn-hub touch-ups. **No Firestore migration, no new collections** — `categoryStats` simply gains
  `di-*` keys (subject still derived). No new dependencies, no new serverless functions, no security/payment change.
  New tests `scripts/di-engine.check.js` (1800 questions independently recomputed) + `scripts/di-charts.check.js`;
  Learn counts 19→24. SW v147→v149. Bible 2.65→2.66, Architecture 2.44→2.45.

## ADR-073 — Subject abstraction: the Speed-Aptitude spine as a derived lens (V2 Phase 1) (2026-06-30)
- **Context:** QuantReflex is evolving from **Quant-first** to **Speed Aptitude-first** (the strategy of the V2
  Expansion Study): expand only along the **generative-speed axis** — Quant → Data Interpretation → *generatable*
  Logical Reasoning — and never into VARC/RC, puzzle-LR, or GK (they fail the **Generation Test** — questions must be
  generated, not authored at scale — and the **Speed Test** — a speed score only where speed is the skill). Today there
  is **no "subject" concept**: everything is implicitly Quant. The taxonomy is a flat set of **14 drill categories**
  (`services/quantTopics.js`), and `stats.categoryStats` (14 keys) is the single source of truth for progress. This is
  **Phase 1 of 4** (foundation + subject layer + Learn integration); DI (Phase 2), generatable LR (Phase 3), and the
  AI/analytics/duel subject polish (Phase 4) build on the seam this opens.
- **Decision:** Introduce a **lightweight, derived subject layer** — the cheapest change that makes the architecture
  subject-first without touching what users see.
  - **Subject is DERIVED, never stored.** New `data/subjects.js` is the ONE place that knows which categories belong to
    which subject. Analytics/AI roll subjects up **on read** from the existing `categoryStats` via
    `subjectToCategories()`. There is **no `subjectStats` field, no Firestore migration, no dual-write** (both research
    agents proposed a stored rollup — rejected as a "prefer derived / no duplicated storage" violation).
  - **No duplicated category list.** Quant's category set is resolved from `quantTopics.CATEGORY_LABELS` (the single
    source of truth), not re-typed. To make that work in the browser too, `quantTopics.js` was converted to the same
    dual-export IIFE pattern as `statMath.js`/`syllabus.js` (it was node-only `module.exports`, which would crash in a
    browser) and is now loaded client-side before `subjects.js`.
  - **No placeholder DI/LR in code.** `subjects.js` declares **only Quant** — the one subject with content. DI and LR
    join the registry *with their generators/content* in Phases 2–3; the Quant→DI→LR spine is documented here and in
    the ROADMAP, not stubbed as empty objects (honors "no placeholder architecture / no dead code").
  - **Learn is the first beneficiary.** Each Learn category declares its `subject` (`data/knowledge/categories.js`,
    all 5 → `quant`); the registry stores/projects it and gains `bySubject(id)` + `categoriesBySubject(id)` (mirroring
    `byCategory`). `statMath` stays the **ONE derivation layer** (ADR-053) so Analytics and the Coach can never disagree
    — its per-subject rollup helper is **deferred to Phase 4**, where it has a real consumer (no dead code now).
  - **Zero user-visible change this phase.** With a single subject, nothing in the UI groups or renames. The visible
    "Speed Aptitude" language and the Learn-hub subject grouping land with DI in Phase 2, when the breadth is *true* —
    so existing users do not feel the product became something else.
- **Consequences:** New `data/subjects.js` (+ a browser global for `quantTopics`); registry gains subject-awareness;
  new `scripts/subjects.check.js` (drill categories → exactly one known subject; Quant set = quantTopics keys; helpers
  pure/total) + extended `learn-content.check.js` (every Learn category declares a known subject; `bySubject`/
  `categoriesBySubject` verified). No Firestore, security, payment, or AI-cost surface change. SW v146→v147. Bible
  2.64→2.65, Architecture 2.43→2.44.

## ADR-072 — Final security lockdown: single-active-device sessions + token-revocation hardening (2026-06-29)
- **Context:** Final pre-launch security audit (Premium-protection + secret-protection) by three independent
  adversarial agents reading the repo directly. **Verified already-solid:** Premium cannot be forged — entitlement is
  server-authoritative (`aiService.resolvePlan` via Admin SDK, self-heals expiry), payments are HMAC-verified
  server-side with payment-owner binding + a transactional `payments/{id}` replay lock, Firestore rules
  `entitlementFieldsSafe()` make client plan/trial writes downgrade-only, and every AI endpoint gates on the
  server-resolved `req.userPremium`; and no secret is client-reachable (OpenAI/service-account/Razorpay all server-only
  `env`, no git-history leak, `.gitignore` covers them, no source maps, the SW caches only static assets, errors don't
  leak). The genuine gaps: **no single-active-device enforcement existed** (the new explicit requirement), **token
  revocation was not checked** in main-app + super-admin (coaching-admin already did), and one uncapped chat input.
- **Decision:** Close the gaps without weakening the verified posture.
  - **Single active device (newest-login-wins).** A server-written `users/{uid}.activeSessionId` is the single source
    of truth for which device is active. Enforced two ways: a **client listener** on the root user doc (instant,
    graceful UX logout when displaced) and a **server hard-check** in `withAuth` — folded into the existing
    `resolveUserAuth` single user-doc read (no extra Firestore read) — that returns **409 `SESSION_REPLACED`** when a
    request's `X-Session-Id` header ≠ the stored id. The client owns a stable per-device id (`session.js`, localStorage
    `qr_session_id`, shared across tabs) sent on **every** authed request (a missing header would 409 the legit active
    user, so all 9 authed fetch sites attach it). A genuine login claims the session via `api/session.js?action=claim`
    (wrapped `withAuth({skipSession:true})` so a new device — which can't yet hold the active id — can claim);
    `activeSessionId` is **Admin-SDK-write-only** and Firestore rules deny any client write, so it can't be forged,
    stolen, or cleared. Lockout-safety invariants: enforce only once a session is claimed (no deploy-time mass logout);
    claim before the listener starts (no self-eviction on fresh login); multi-tab shares one id; a 409 or
    listener-mismatch routes to the SAME graceful sign-out (no loop).
  - **Token revocation.** `admin.auth().verifyIdToken(token, true)` in `aiService.verifyIdToken` (main-app) and the
    super-admin middleware, matching coaching-admin — a disabled/deleted/revoked account is rejected immediately
    instead of staying valid until the ~1h token expiry.
  - **Input cap.** `_chat` `userTurn` is capped (`.slice(0,400)`) like the sibling chat fields.
- **Declined (recommendations, not implemented):** **Firebase App Check** (adds a build/config moving part + failure
  mode; endpoints are already auth + rate-limited, the key is server-side, premium can't be forged — not required at
  2–3k users) and a **refund/chargeback auto-revoke webhook** (`payment.refunded`/`reversed`; today a refund is a
  manual super-admin revoke, which works). Client-only cosmetic gates (hard mode, themes) are left — bypassing them
  unlocks only a local UX toggle, costs no money and exposes no secret.
- **Consequences:** New `users` fields `activeSessionId`/`activeSessionAt` (server-only); new endpoint
  `main-app/api/session.js`; `resolveUserAuth` replaces the `resolvePlan` read in middleware (same single read, now
  also returns the session id); one persistent root-user-doc listener per active client (torn down on logout). No
  change to the premium or secret posture. Independent reject-it audit: NO DEFECTS. SW v145→v146. Bible 2.63→2.64,
  Architecture 2.42→2.43, Firestore 2.20→2.21, Security 2.14→2.15.

## ADR-071 — Ecosystem Firestore audit: aiDaily TTL, remove unread profile/data, one-time legacy-orphan cleanup, decline a permanent cleanup UI (2026-06-29)
- **Context:** A senior-Firebase-architect audit of the entire 3-app ecosystem (Student `main-app`, `super-admin-app`,
  `coaching-admin-app`, one shared Firestore project) mapped every read, write, listener, cache, rule, index, and the
  documented schema vs. reality. **Verdict: production-grade and exceptionally well-governed** — all 26 composite
  indexes used (100%, zero orphans), every collection has an explicit rule + default-deny, server-authoritative
  entitlements/duels/AI-memory, `count()`-based metrics, field-masked + capped + paged admin scans, token-revocation
  auth gates, exactly two owned realtime listeners (notifications, duel room — no leaks), and intentional layered
  caches. No critical issues, no security gaps, no missing indexes, no broken ecosystem flows. Per the ≈2–3k-user
  scale (no enterprise complexity; student responsiveness wins), the audit's job was to verify + report and fix only
  genuinely-justified, low-risk debt.
- **Decision:** Ship three small, verified improvements; change nothing else.
  - **(1) Bound the `aiDaily` accumulator.** `aiDaily/{uid}_{feature}_{YYYY-M-D}` is written once per user/feature/day
    and never read after its day, but (unlike `aiRequests`) had no TTL → unbounded growth. Mirror the proven
    `aiRequests` pattern: `_putDaily` now stamps `expiresAt: Date.now()+2*86400000` and `super-admin cron/sweep` adds
    a paged, non-fatal prune of `aiDaily where expiresAt < now` (single-field range → auto-indexed, no composite). A
    48h buffer can't expire a still-readable same-day cache.
  - **(2) Remove the unread `users/{uid}/profile/data` dual-write.** Verified (grep across all three apps) that
    **nothing reads it** — every consumer reads the root `users.profile` map + root plan fields. Removed
    `_syncProfileSubcollection` + its 3 low-frequency call sites + the seed (`firestore-sync.js`). The defensive
    account-deletion/purge delete of the `profile` subcollection is **kept** (for any existing docs). Note:
    `performance/overall` + `practice/data` were verified **actively read** by the coaching Student-360 detail
    (`coaching-admin students.js`) and are untouched.
  - **(3) One-time legacy-orphan cleanup script, not a permanent UI.** `firestore/migrations/2026-06-29-cleanup-
    legacy-orphans.js` (dry-run by default; `--apply` to delete; paged/batched; idempotent) wipes the verified-
    orphaned legacy collections `aiMissions`/`aiCoachV2`/`aiInsightsV2`/`duelInvitations`, stale `aiDaily` (missing/
    past `expiresAt`), and legacy `profile/data` per-user docs (strict id match). `usage/wordProblems` is intentionally
    **not** targeted — it still has a live lazy-migration reader (`aiService._loadUsage` folds it into the canonical
    `usage/ai` on next AI use), so it self-resolves and deleting it could zero a legacy user's quota counters. Follows
    the established operator-run migration governance (6 prior scripts).
- **Declined — permanent Super-Admin orphan-scanner / collection-delete UI:** (a) the orphan set is a known fixed list
  from documented migrations — a one-time script fully solves it, not an open-ended discovery problem; (b) ongoing
  lifecycle cleanup is already automated (cron: `aiRequests` prune, archived-user purge past 30-day hold, inactive
  flagging; `user-lifecycle.purgeUser`); (c) an always-on "delete Firestore collections" admin surface is a
  high-blast-radius capability (accidental data loss) that adds auth + maintenance burden disproportionate to a
  one-time pre-launch cleanup at 2–3k users; (d) versioned, reviewable, dry-run-able migration scripts are the repo's
  governance pattern. Adding `aiDaily` to the cron covers the only *ongoing* accumulation gap.
- **Consequences:** Bounded `aiDaily`; one fewer write per profile/premium change + a dead subcollection gone; a safe
  operator path to clear pre-existing legacy docs. No rules/index/schema-redesign change, no UX-affecting read change,
  no new deps; admin/coaching read paths, listeners, and security model unchanged. The cleanup script is authored
  only — the operator runs it against the live DB. SW v144→v145. Firestore 2.19→2.20, Bible 2.62→2.63, Architecture
  unchanged (2.42 — no topology/contract change). FIRESTORE_BLUEPRINT 1.12→1.13.
- **Final release audit (2026-06-29):** two independent adversarial agents re-verified the whole changeset from the
  repo — `profile/data` removal complete (zero readers; defensive deletes retained), `aiDaily` TTL sound (sole writer;
  same-day reads can't expire), no other unbounded accumulator missed, cleanup script safe/idempotent, security rules
  coherent (no new gap), all 26 indexes still used, docs consistent. **Verdict: production-safe.** Only one nit found
  and fixed: a stale comment in `firestore/rules/firestore.rules` still listed the removed `profile` subcollection
  (rule logic was already correct) — comment corrected. The no-op `_flushPendingSystemNotifications` shim and the
  dated root `AUDIT-REPORT.md` were consciously left. No version/SW bump (comment-only).

## ADR-070 — QuanAI cohesion pass: Planner Start Over, perceived-performance thinking states, natural branding (2026-06-28)
- **Context:** A full read-only audit of the QuanAI stack (server flow, client UX, deterministic layer, docs) found the
  AI ecosystem already mature and heavily optimized — deterministic-first (the LLM only writes short, schema-
  constrained prose), one canonical profile (`studentProfile.js`, 6h `aiContext` cache) + one derivation layer, layered
  caching (daily Coach/Insights, per-question Explain, client session env-cache), structured outputs + retries,
  prompt-injection hardening, budget/throttle/quota, tier-0 deterministic skip, request dedup, staged loading, and the
  `intelligence-consistency` proof. The owner asked for a **focused** pass (explicitly **no prompt/cache rewrites** —
  intelligence & consistency over micro-latency), sized for ~2–3k users. The genuine gaps were: the Planner had
  **Adjust** but no clean **reset**; the wait could *feel* more like QuanAI thinking; and the engine name barely
  surfaced (a modal badge only), so users didn't recognize QuanAI as the intelligence behind the app.
- **Decision:** Ship three things and consciously leave the optimized architecture intact.
  - **Planner Start Over (the headline).** Three distinct, non-overlapping actions (no duplicate regen control):
    **Adjust** reopens the setup wizard preserving the plan; **Rebuild my plan** is the single regeneration workflow
    (`op:regen`, now a persistent footer action instead of only appearing at end-of-block); **Start over** is a fully
    destructive reset (`op:reset` → `aiBrain.plannerReset`) behind an explicit confirm. New server op deletes
    `aiPlanner/{uid}` and clears ONLY the mirrored exam-config fields from `aiMemory`
    (examName/examDate/goal/dailyMinutes) — practice stats, `categoryStats`, mistakes, and the durable learning memory
    (wins/timeline/preferredDepth/knownWeakConcepts/recentTopicsExplained) are deliberately preserved. With the exam
    cleared, `examStrategy.assemble` returns null so Coach/Insights gracefully degrade to exam-agnostic coaching (the
    ADR-057 "never dumber" invariant). The client confirm enumerates exactly what is deleted vs. what stays (no silent
    loss); on confirm it clears `qr_active_exam`, stamps `qr_ai_dirty_at`, and reopens the setup wizard. Centered
    confirm overlay reuses the shared modal motion (`paywallScaleIn`).
  - **Perceived performance (reuse-only).** Every AI surface now opens with a personalized "QuanAI is thinking" state
    built from the student's real local numbers (accuracy + streak) the client already holds — no extra fetch, no
    logic duplication, falls back gracefully for brand-new users. No streaming/SSE (over-engineering at this scale);
    instant-open env-cache and staggered block reveal already cover the "started immediately" feel; no prefetch (it
    would spend API budget for users who never tap).
  - **Natural QuanAI branding (understated).** Surface the engine where it builds trust, Apple-Intelligence-style, not
    on every button: the App Guide AI section (engine intro), About modal (2 lines), the three AI paywall lock
    messages, the planner empty/onboarding state, and the thinking states. Generic CTAs ("Talk to your coach",
    "Generate Plan") stay for clarity. Established casing `QuanAI` kept (ADR-043); no third spelling introduced.
- **Consequences:** New planner contract op (`reset`) — Architecture bump. CSS-only confirm dialog + footer actions
  (reuses centered-modal language). Client copy/branding touches; one personalized loading helper. Conservative
  cleanup: stale `studentContext.js` filename references in service comments corrected to `studentProfile.js` after
  the earlier rename (the historical root `AUDIT-REPORT-QUANAI.md` and the staged Word-Problems server path were left
  intact — neither is dead code). `planner-brain.check.js` extended with a `plannerReset` assertion proving the doc is
  deleted, `plannerGet` returns null, the exam-config memory mirror is cleared, and durable memory is preserved. No
  prompt or cache-architecture changes; no new dependencies; no Firestore schema/index change (an existing-collection
  delete). SW v142→v143. Bible 2.60→2.61, Architecture 2.41→2.42.
- **Production-readiness hardening follow-up (2026-06-28, same ADR — a11y + robustness, no new contract):** a 13-phase
  verification (three independent adversarial audits) confirmed the ecosystem production-ready (zero code defects, all
  suites green, branding/docs accurate) and surfaced four polish-grade items, now fixed. (1) **Start-over confirm
  a11y:** default focus moved from the destructive button to **Cancel** (a stray Enter can't fire the irreversible
  reset), focus **returns to the opener** on close, `aria-describedby` announces the deleted/kept lists, and the
  background is scroll-locked via the existing `body.modal-open` rule (no new CSS). (2) **`plannerReset` fail-fast:** a
  failed plan delete now returns `{ok:false}` *before* clearing the exam-config memory mirror, so a transient Firestore
  error can't leave Coach/Insights exam-blind while the plan persists (the client already retries on `ok:false`). (3) a
  `planner-brain.check.js` assertion covering that delete-failure path (the stub `delete()` rejects for a sentinel uid;
  103→107 assertions). (4) a stale TECHNICAL_BIBLE date. Two audit flags were verified **false positives** (the
  `op:reset` doc entry already existed; reset already returned `ok:false` on delete failure). Client a11y + a one-line
  server guard + test + docs; no prompt/cache/schema change, no new deps. SW v143→v144. Bible 2.61→2.62, Architecture
  unchanged (2.42 — no new op/contract).

## ADR-069 — Learn Knowledge Engine: knowledge objects, hub→topic graph, responsive design system (2026-06-28, phased)
- **Context:** The Learn tab worked but was a single long scroll page of thin, flat content — `js/formulas.js`
  built 8 topics × ~28 `{title, formula, tip}` items as pre-baked HTML strings, with the rest hard-coded in
  `index.html`. The rich metadata in `data/syllabus.js` (50 topics: difficulty, commonMistakes, drillable,
  revisionIntervalDays) was never surfaced. No topic pages, deep links, hierarchy, Practice/Planner reuse, or
  progress; the global scroller is capped at 480px so tablet/desktop is a centred phone column. The owner wants
  Learn rebuilt as the **knowledge backbone** of QuantReflex — a deep-linkable hub→topic knowledge graph built from
  reusable **knowledge objects** (not static HTML), a true responsive design system reusable app-wide, quality-first
  authored content, and zero new tech debt — engineered to last 5 years. **Hard constraint: NO AI in the Learn tab.**
- **Decision:** Replace static HTML with a **knowledge-object engine** consumed by many features (Learn, Search,
  Revision/cheat-sheets, Practice/Planner links) — never duplicated.
  - **Knowledge object** (`js/knowledge/schema.js`, pure + dual-exported): a topic = `{id(slug), title, icon,
    category, difficulty, examFrequency, status('published'|'scaffold'), drillCategory→quantTopics,
    syllabusTopicId→syllabus, related[], revisionIntervalDays, searchTerms[], sections[]}` where `sections` are
    ordered **typed blocks** (overview·concept·formula·trick·trap·example·table·memory·revision·related). A new
    content kind = a new block `type` + a renderer — never a schema rewrite.
  - **Registry** (`js/knowledge/registry.js`): in-memory KnowledgeBase (categories + topics) answering
    get/all/categories/byCategory/related/siblings + a graph integrity validator. Data modules
    (`data/knowledge/<category>.js`) self-register; idempotent.
  - **Renderers** (Phase 2, `js/knowledge/blocks.js`): one DOM renderer per block type; `table` reuses the existing
    `.math-table` and `formula` the existing `.formula-block` markup so QuantReflex's identity (and the loved
    tables) is preserved exactly; richer blocks add `.kx-*` classes. Ships with the topic-page UI + CSS that mount
    and style it (not in P1 — a renderer with no caller/test doesn't ship). **No AI surfaces.**
  - **Search** (`js/learn/learn-search.js`): a real weighted in-memory index over the registry (title ≫ searchTerms/
    aliases ≫ formula names ≫ concept text), symbol/synonym aware — replaces the old DOM text-scan.
  - **Routing:** `router.js` parses `#learn/<topicId>` deep links (single-segment hashes unchanged — backwards
    compatible) and toggles a `view-learn-active` body class (mirrors the existing `view-practice-active` hook) so
    the 480px cap is overridden **only** for Learn via one reusable responsive shell.
  - **Projections, not duplication:** cheat-sheet / one-page revision are filtered views over the same `sections`.
  - **Validation:** `scripts/learn-content.check.js` (in `npm test`) asserts every object against the schema +
    resolves related/drill references, so content can't ship broken or drift.
- **Phased delivery (each phase backwards-compatible + audit-gated):** **P1 (shipped)** — engine (schema/registry/
  search) + data model + first faithful migration of the 8 legacy formula topics + router deep-links + validator;
  old Learn page untouched. **P2 (shipped)** — block renderers (`blocks.js`, now DOM-stub + browser-path tested) +
  the hub (category → topic cards with difficulty/exam-frequency/status badges) + deep-linkable topic pages
  (breadcrumbs · sticky section nav with scroll-spy · typed sections · related · prev/next) + registry-backed search
  + the responsive `.kx-*` design system (phone/tablet/desktop via the `view-learn-active` shell). `#view-learn` cut
  over; legacy `formulas.js` retired (content fully migrated), old DOM-scan search + jump-nav removed. Quick-Reference
  tables, custom topics, bookmarks, and all premium gates preserved.
  **P3 (shipped)** — authored **14 gold-standard topics** (full depth: overview · concepts · formulas with
  when/trap · tricks · traps · worked examples · memory · revision) across a **5-category taxonomy** (Numbers ·
  Arithmetic · Commercial Math · Modern Math · Mensuration) — Number System, Simplification, Percentages, Ratio &
  Proportion, Averages, Time & Work, Pipes & Cisterns, Time-Speed-Distance, Profit & Loss, Simple Interest, Compound
  Interest, Probability, Area, Volume; 5 honest scaffolds (Number Series, Ages, Mixtures, Partnership, P&C). Original
  exam-grade content (cheat sheets as *organisation* inspiration only); a content-quality gate in
  `learn-content.check` enforces gold-standard depth on every published topic. **P4 (shipped)** — integrations, NO AI:
  a localStorage-primary **progress module** (`js/learn/learn-progress.js`, dual-exported, pure recency/spaced-due
  helpers under unit test) with best-effort Firestore mirror via the EXISTING `FirestoreSync.queueUpdate` path (new
  owner-writable user-doc fields `learnProgress` + `learnTopicBookmarks` — same denylist-safe path as
  customTopics/bookmarks, **no new collection, no rule change**); a topic **action bar** (Practise this → existing
  focus-drill entry via `drillCategory`; Quick-revision **cheat-sheet projection** = a filtered view over the
  authored revision/formula/trick/trap blocks, no duplication; Mark-complete; Save); hub **Continue learning** +
  spaced **Due for revision** strips (`revisionIntervalDays`) + live completion ticks on cards; and a **data-level
  Planner link** — every applicable topic now carries a validated `syllabusTopicId` referencing `data/syllabus.js`
  (the knowledge graph formally references the planner's syllabus graph; no AI-adjacent button added inside Learn).
  **P5 (shipped)** — polish + cleanup, NO AI: pruned all now-inert legacy Learn CSS (`.learn-jump-*`, `.learn-group-*`,
  `mark.search-highlight`, and the residual `.learn-searchable` marker — 21 dead rule-sets removed across base/dark/
  theme-playful variants + both tap-delay/ripple selector lists + `app.js` RIPPLE_SELECTORS + `learn-manager.js`);
  micro-polish (badge type .62→.66rem, `.kx-crumb` 2.25rem touch target, a reduced-motion-guarded `kx-fade-in` topic
  entrance); a deliberate performance decision to NOT add lazy per-category loading (render-on-route + a once-built
  search index already keep the DOM/work minimal for 19 small precached topics — premature complexity otherwise);
  SW v133→v134. A final independent multi-agent production audit closed the initiative.
- **Consequences:** content becomes reusable, pedagogical, and deep-linkable; render-on-route shrinks the DOM vs
  today's everything-at-once; the responsive primitives become an app-wide pattern. P1 is pure additive engine
  (no Firestore/rules/payment change; old UI unchanged) — verified by 35 new pure assertions + the full suite green.
  Architecture 2.33→2.34, Bible 2.47→2.48 (Firestore/Security/Payment unchanged). P4 adds two owner-writable user-doc
  fields (`learnProgress`, `learnTopicBookmarks`) documented in FIRESTORE_BLUEPRINT — Firestore track 2.18→2.19;
  Security unchanged (existing `entitlementFieldsSafe()` denylist already permits owner writes to non-entitlement
  fields, exactly like customTopics/bookmarks). P5 is client-only cleanup/polish (no Firestore/Security/Payment
  change): Architecture 2.36→2.37, Bible 2.51→2.52. Future-proof: videos/flashcards/notes/diagrams are additive block
  types or hooks, no rewrite. AI intentionally excluded from Learn. **All five phases shipped — ADR-069 complete.**
- **Final-review polish (2026-06-28, post-completion):** an independent multi-agent production review (clean — no dead
  code, no broken refs, integrations/gating correct, no regressions, no AI) drove two client-only elevations in the
  most-weighted areas: **(a) topic-page accessibility semantics** — `h1→h2→h3` heading outline (section labels `<h2>`,
  block heads `<h3>`), `<nav>`/`<aside>` landmarks, `aria-current` on the active section pill, an `aria-live` search
  results region (zero visual change; class-based styling); **(b) landscape-tablet layout** — the reading-column +
  side-rail now activates at ≥960px (was ≥1100), so landscape iPads/foldables get a true two-column reading+rail.
  SW v134→v135. No Firestore/Security/Payment change. Architecture 2.37→2.38, Bible 2.52→2.53.
- **Premium UX polish + 4 bug fixes (2026-06-28, post-completion):** (1) horizontal scroll of `.kx-section-nav` /
  `.kx-resume-row` could trip the global tab-swipe (`swipe-nav.js` had no scroll-container awareness) → the
  `touchstart` denylist now exempts `[data-no-swipe]` + those scrollers; (2) the opaque sticky section-nav "dark
  strip" → subtle glass (`backdrop-filter` blur, the `.card` language) so it blends; (3) the topic **Save** persisted
  but was never surfaced (dead UI) → a hub **"★ Saved"** strip from `LearnProgress.bookmarkedIds()` + save toast;
  (4) **Pipes & Cisterns** `drillCategory:'time-and-work'` launched wrong questions → `drillCategory:null` +
  `drillComingSoon` non-interactive "Practice coming soon" chip. Scaffold cards restyled to read as *planned*; bounded
  token-based visual polish (card elevation/press, resume edge-fade, glassy pills, search focus), reduced-motion-
  guarded. SW v135→v136. No Firestore/Security/Payment change. Architecture 2.38→2.39, Bible 2.53→2.54.
- **Ship-readiness fixes (2026-06-28, final adversarial audit):** two read-only reviewer agents (trying to reject the
  PR) confirmed the system otherwise sound; 5 real low-risk fixes, several other findings consciously rejected as
  non-issues/anti-patterns (synchronous-render spinner, harmless `.kx-revision` wrapper, intentional token
  differentiation, gated/GC'd listeners, grid-not-scroller, out-of-scope `.card` @supports). Fixed: (1) **focus
  management** on route change → topic `<h1>` / `#learnHeading` (`tabindex="-1"`, `focus({preventScroll:true})`,
  WCAG 2.4.3); (2) **glass `@supports` fallback** so `.kx-section-nav` is near-opaque where `backdrop-filter` is
  unsupported (no content bleed); (3) **AA contrast** — faint `#64748b` labels → `#475569`; (4) **hub strip de-dup**
  ("Continue" excludes "Due" ids; Saved authoritative); (5) **hub scroll restoration** on Back. SW v136→v137. No
  Firestore/Security/Payment change. Architecture 2.39→2.40, Bible 2.54→2.55.
- **Content completion (2026-06-28):** authored the last **5 scaffolds → gold-standard published** (Number Series,
  Ages, Mixtures & Alligations, Partnership, Permutation & Combination; 10–11 sections each), so the curated
  5-category scope is **19/19 gold with zero placeholders** (the `scaffold` status stays in code for future
  categories). Every formula/example hand- + independent-agent-verified (zero math errors). `number-series` gets a
  real Practise button; the other 4 keep `drillCategory:null` (no misleading drill). `learn-content.check` 161→196
  (gold-depth gate over all 19). One reduced-motion-guarded hub entrance animation. SW v137→v138. Content/client-only,
  Arch unchanged (same engine, more data); Bible 2.55→2.56. **The Learn redesign is feature- AND content-complete.**

## ADR-068 — Battle Archive: Premium duel history + rivalry/personal stats + achievements (2026-06-28)
- **Context:** The duel system stored only a capped (50), thin `users/{uid}/duelHistory` row per finished duel
  (`opponentName, outcome, myScore, oppScore, mySpeed, oppSpeed, accuracy, playedAt`) and **no aggregates at all**.
  The owner wants a Premium-only, expandable "Battle Archive" below the Home Duel card: complete paginated history,
  head-to-head **rivalry** stats, **personal** lifetime stats, and auto-unlocked **achievements** — premium-game
  polish, instant, Spark-cheap, with NO page redesign and NO future migrations as features (replay, ELO, seasons,
  leaderboards) are added. Pre-launch (zero users → no backfill). A 3-agent read-only audit of the whole duel stack
  preceded this.
- **Decision:** Build the Archive as a **read-only client layer over server-maintained truth** — the client never
  computes outcomes or aggregates.
  - **List source = `users/{uid}/duelHistory`** (persists forever; self-contained), NOT the TTL'd `duels` rooms.
    Paginated `orderBy(playedAt desc).limit(15).startAfter(cursor)` — never loads all.
  - **Aggregates = one server-only doc `users/{uid}/duelStats/summary`** (`{duelAggregates, rivals{}, achievements{}}`),
    maintained **inside the existing `_finalizeTxn` transaction** with the pure module `services/duelStats.js`
    (`applyDuelToSummary` + derive views — shared with the `scripts/duel-archive.check.js` harness so server + UI
    can't drift). O(1) reads for rivalry/personal/achievements; zero new writes (folded into the one finalize txn)
    and **zero new serverless functions** (main-app stays 8/12).
  - **Extend the `duelHistory` write** (normal + no_contest) with denormalized facts the room doc can't supply after
    its 30-day TTL: `opponentUid, oppAccuracy, challengerUid, iChallenged, difficulty, questionCount, myAnswered,
    durationMs`. Additive — existing readers ignore the new keys.
  - **Remove the ADR-065 `DUEL_HISTORY_CAP` (50) + `_pruneDuelHistory`** so history is COMPLETE; pagination keeps it
    Spark-safe (tiny docs, never all loaded).
  - **3 composite indexes** on `duelHistory`: `(outcome, playedAt desc)`, `(difficulty, playedAt desc)`,
    `(opponentUid, playedAt desc)`. The All tab + time-range ride the single-field `playedAt` index (range is an
    inequality on the same orderBy field, compatible with every composite); name-search is client-side over loaded
    pages. The query uses ONE indexed primary dimension (rival → outcome → difficulty) + the time inequality; the
    non-primary dimension + search are residual client filters.
  - **Security:** `duelStats/summary` is **server-write-only, owner-read** (new rule block mirroring the
    `duelHistory` carve-out — a client can never forge stats/wins/achievements). Added `duelStats` to the
    `account.js` deletion subcollections (GDPR completeness).
  - **Premium gating = visibility only:** the section renders **only if `canAccessFeature('math_duel')`** — free
    users never see it (not greyed/blurred); the `#homeDuelCard` layout is intact when it's absent. Data is harmless
    if read (no PII beyond the uid+name already present).
  - **Auto-update with no new listener:** `DuelManager._showResults` (the single local-completion convergence point
    for both "I finished last" and "opponent finished last") invalidates the Archive cache → it reflects the new
    result on next Home render or live if expanded.
  - **Expand-in-place, never navigate:** the section and each battle card expand inline; the architecture is ready
    for a future `#duel-replay` screen (history docs are self-contained).
- **Achievements (from stored data only):** firstBlood, firstWin, ten/fifty/hundredWins, streak5/streak10,
  perfectDuel (100% accuracy), lightning (a win averaging <5s/question), revenge (beat an opponent you were on a
  losing run against). Stored as `name→unlockedAt` so the UI can date each badge. **Deferred** (need signals we
  don't store / future ELO): David-vs-Goliath, Comeback King.
- **Dropped, non-mapping requirements (surfaced honestly):** "Pending/Cancelled" filters and
  "accepted-immediately-vs-later" don't exist in the *synchronous* lobby model (only completed/no_contest duels
  enter history) → omitted. "Who challenged whom" IS kept (`iChallenged`, host vs joiner).
- **Consequences:** Archive open ≈ 2 reads (summary + page 1); +1 read/page on scroll; filters are indexed (no
  scans); duel-finish cost unchanged except one extra doc-set folded into the existing transaction. New client
  module `js/duel-archive.js` (+SW v127→v128 precache). Risk concentrated on touching `_finalizeTxn` (duel
  completion hot path) → mitigated by keeping the change purely additive (`txn.set(..., {merge:true})` behind the
  existing winner/outcome logic) + a full duel regression pass. The `rivals{}` map is bounded (≤ hundreds of
  opponents ≪ 1MB); if ever a concern it migrates to a `rivals` subcollection with no user impact. Verified by 45
  new pure-math assertions (`scripts/duel-archive.check.js`, in `npm test`). No migration (pre-launch, zero users).
  Firestore 2.17→2.18, Architecture 2.32→2.33, Security 2.13→2.14, Bible 2.46→2.47.
- **Post-implementation audit hardening (2026-06-28, same ADR — client-only, no schema change):** an independent
  production audit (architecture/Firestore/security/UI/UX/regression/dead-code) found the server/data/rules/indexes
  correct and confirmed PASS on premium-gating, XSS, reads-before-writes, finalize call-frequency (≤2×/duel), no
  listener leaks, and cross-app consistency. Five client refinements applied: (1) **filter model** — global `outcome`
  and `difficulty` are now **mutually exclusive** (each resets the other) so every global filter is a clean indexed
  server query with no residual-pagination empty-page gaps; residual filtering survives only in **rivalry mode**
  (a single rival's set is small/bounded) + name-search, with honest "load more to search older battles" copy; (2) a
  **request-token** in `_loadPage` so a stale in-flight page can't append under a newer filter's key; (3) **fastest
  win** recomputed from the player's OWN total solve time, not the whole-duel wall clock (gated by the slower
  player); (4) the search debounce timer is cleared on collapse; (5) re-expanding the Archive on a Home revisit
  **paints from the in-memory cache** (no refetch, pages preserved) unless a local duel finish invalidated it.
  **Acknowledged debt:** replaying duels older than the 30-day room TTL is not possible (per-question data lives only
  in the TTL'd room docs, not in `duelHistory`) — replay remains future work, additively via a `duelReplays/{code}`
  doc written at finalize; ELO/seasons/leaderboards are likewise additive (no migration). No version-track bump
  (client correctness + one stat-definition refinement; pre-launch, no data).
- **UI follow-up (2026-06-28): inline expandable section → centered premium modal.** The archive cramped the Home
  duel card and didn't read as "your competitive career." It's now a compact **"⚔️ Battle Archive · N" trigger** on
  the duel card that opens a **centered modal** (reuses the paywall dim/scale/scroll shell + keyframes; `body.modal-
  open` lock; Escape/overlay-click close; focus-to-title on open, return-to-trigger on close; `min(760px,100%)`/90vh,
  sticky glass header — scales phone→desktop). **Presentation-only**: `js/duel-archive.js` `_toggle`/`_renderExpanded`
  → `_openModal`/`_closeModal`/`_loadAndPaint`; the Firestore read/cache/filter/pagination/aggregate-math layer and
  `scripts/duel-archive.check.js` (45 assertions) are **unchanged**. Free users still render nothing. Client UI only;
  Arch 2.40→2.41 (presentation topology), no Firestore/Security/Payment/gating change.
- **Cohesion follow-up (2026-06-28, CSS-only): one modal-motion language app-wide.** With Battle Archive, paywall,
  table, and coming-soon all centering + scale-ins, the **About / App-Guide info modal** was the last outlier — it
  slid in from the right as a 480px side panel. It now **centers + scale-ins** too: `.info-modal-overlay` flex-
  centers and `.info-modal-content` becomes a centered card (`min(560px,100%)`, 92vh + internal scroll,
  `var(--qr-card-radius)`, reusing the shared `paywallScaleIn` keyframe); the right-slide `infoModalSlideIn`/`Out`
  keyframes are removed and the `.closing` exit defers to the overlay fade. `settings.js` `openInfoModal` changes only
  its one show line (`block`→`flex`) so the overlay flex-centers the card; the close logic is unchanged.
  Same pass: the lone inset `.collapsible-header:focus-visible` ring (`-2px`) matches the ~30 others at `+2px`, and a
  grep-verified dead-CSS sweep removed 4 unused custom properties (`--qr-accent-soft`, `--sp-xl`, `--sp-2xl`,
  `--qr-card-gap`) + the shadowed duplicate `@keyframes duelPulse`. SW v141→v142. No JS logic, data, routing, or
  gating change; reduced-motion + a11y preserved. Bible 2.59→2.60, no Arch bump (no topology/contract change).

## ADR-067 — Focused speed-maths catalog rebuild + Timed Mock (2026-06-24)
- **Context:** QuantReflex served 26 exams across every Indian exam family, diluting positioning and including
  exams (JEE/Olympiad/GMAT/CLAT/NDA) where no-calculator mental-calculation speed is not the rank lever.
  Pre-launch (zero users) — freedom to curate ruthlessly with no migration/back-compat.
- **Decision:** Reposition as the best speed-maths trainer for a curated catalog, grounded in the books students
  actually use.
  - **Catalog:** 26 → 17 exams in 4 tiers (MBA, Banking, Foundation, Government); remove 11 misfits + the
    `defense` family; add MAT, ATMA, RBI Assistant (per `docs/NEW_EXAM_CANDIDATE_AUDIT.md`; NABARD rejected —
    its quant is qualifying-only). `other` retained as a hidden engine fallback.
  - **Metadata:** per-exam `tier`, exam-mechanics `pattern`, and `book`; a BOOKS registry with R.S. Aggarwal as
    default topic order and the Arihant MAH-CET guide for MBA CET. The planner sequences topics in book order.
  - **Readiness:** replace the flat 12% speed weight with pattern-derived profiles (speed-critical/concept/
    balanced), keeping the 7-factor breakdown honest by returning the weights used.
  - **Coaching:** `examStrategy` emits an "EXAM MECHANICS" line so Coach/Planner/Insights give exam-true strategy.
  - **Drills:** add Simplification + Number Series (the core of banking/SSC speed) as generators + drillable
    topics. DI and Quadratic-Comparison deferred (need a relational/tabular answer format).
  - **Timed Mock (Premium):** a pure `js/mock-engine.js` builds a weightage-true quant-section deck under the
    exam's real clock + marking scheme, run via the existing drill engine; gated by a new `timed_mocks`
    entitlement; the exam-accurate score is shown via a new additive drill-engine `onResults` hook.
- **Consequences:** sharper positioning and far lower onboarding load (4 tiers vs a 26-item list); one engine,
  data-differentiated per exam (no per-exam code forks). The server picks up the curated catalog via the same
  `data/syllabus.js` (`aiBrain`, `examStrategy`). Strategy/audit docs added (`PRODUCT_STRATEGY.md`,
  `EXAM_AUDIT.md`, `NEW_EXAM_CANDIDATE_AUDIT.md`). Verified by a post-implementation audit (3654 + 79 + 100
  assertions). Follow-ups: feed standalone-mock results into the planner's `_mockTrend` (server write);
  DI/Quadratic drills; a multi-section sectional mock. No migration (pre-launch, zero users).

## ADR-066 — Universal Notification Inbox: one model · one pipeline (2026-06-15, in progress)
- **Context:** Notifications were fragmented across 5+ paths; most bypassed the in-app Inbox, so on push failure
  the notification was lost. FCM is unreliable on **Spark** (the scheduled Cloud Functions never run; web push is
  inherently flaky). Mandate: ONE notification object that ALWAYS lands in the Inbox (source of truth) with push as
  an optional channel; exactly one pipeline; no parallel/client-only notification logic; no special cases.
- **Architecture (decided with user):** ONE canonical pipeline in main-app, exposed via an authenticated internal
  endpoint. The 3 apps deploy separately and `shared/` is NOT bundled cross-app, so a `require`d shared file won't
  work — instead Coaching Admin + Super Admin become **pure clients** that POST to `main-app /api/notify`
  (server-to-server secret); main-app's own producers call the service in-process. One implementation; change it
  once, not three times.
- **M1 (done):** `services/notificationModel.js` (the one model: type/category/priority enums + per-category
  icon/deepLink/push defaults + `buildNotification`; enriched doc — sender, deepLink, archived, pinned, expiresAt,
  metadata, `delivery{inbox,pushAttempted,pushDelivered,pushFailed,openedAt}`); `services/notificationService.js`
  (`notify(db,messaging,{recipients,notification,push})` — Inbox write to ALL recipients FIRST, best-effort
  chunked FCM with stale-token cleanup, one `notificationLogs` entry; centralizes recipient resolution
  uids/segment/coaching/audience and **replaces the 4 duplicated FCM blocks**); `api/notify.js` (Bearer
  `NOTIFY_INTERNAL_SECRET`). New `scripts/notifications.check.js` (16 assertions: Inbox-always even when push
  throws, push respects opt-out but Inbox doesn't, urgent overrides opt-out, stale cleanup, segment/coaching
  resolution, validation). `npm test` green (KB 4736 + engine 238 + brain 97 + consistency 79 + notifications 16).
- **M2 (done):** every source routes through the pipeline — duel finish, premium expiry (resolvePlan self-heal),
  super-admin broadcast/bulk-remind/entitlement grant-revoke, coaching notices (≈150 dup lines → one call); the
  admin apps are now **pure clients** of `/api/notify` (thin `notifyClient` HTTP helper). New `reminderCron.js`
  (the one server-side producer, Vercel-cron, Blaze-free, idempotent/day: streak/daily/expiry). Client 7/1/7
  timers + client `createSystemNotification` retired; app-update reload stays a local toast.
- **M3/M4 (done):** Inbox UI renders category badges + pipeline icon + relative time + **tap → mark-read +
  deep-link** (account.js + listener carry the enriched fields; archived hidden; openedAt stamped; archive
  supported). **Rules: the Inbox is server-write-only** — clients read + delete (archive) only; create/update
  denied (no forged notifications). 18 pipeline assertions. SW v124→v126.
- **Deploy:** needs `NOTIFY_INTERNAL_SECRET` (main-app) + `NOTIFY_ENDPOINT_URL`/`MAIN_APP_URL` +
  `NOTIFY_INTERNAL_SECRET` (both admin apps), and a `firestore:rules` deploy (server-write-only Inbox).

## ADR-065 — Duel system bug fixes (robustness/scale/cleanup) (2026-06-15)
- **Context:** The deep Duel audit found the critical paths (grading/finalize/winner/security) bug-free, but four
  concrete robustness/scale/cleanup defects. This change fixes ONLY those — no features, no rematch, no rules
  change, no gameplay/scoring change.
- **Bug 1 — dead Cloud Function:** `functions/index.js cleanupExpiredDuels` queried obsolete statuses
  (`waiting/ready/...`) that Duel V2 never uses → it matched zero docs and silently did nothing. Repointed to the
  real V2 condition (`status=='lobby' && createdAt < now-2h → 'expired'`, oldest-first, index-backed), so it works
  as the scheduled backstop it claims to be.
- **Bug 2 — cron scale:** `api/duel.js _cronSweep` used `limit(300)` with no ordering. Now orders each scan
  oldest-first (`totalDeadline`/`createdAt ASC`) with early-break and a larger batch (1000); added the
  `(status, totalDeadline)` composite index for the active-finalize scan.
- **Bug 3 — unbounded growth:** (a) `cron-sweep` now hard-deletes terminal rooms (complete/abandoned/expired)
  older than 30 days incl. `players/*` + `private/key` subdocs (oldest-first, ≤200/run); (b) post-finalize
  best-effort `_pruneDuelHistory` caps `users/{uid}/duelHistory` to the newest 50 (count-then-trim — the finalize
  transaction itself is untouched).
- **Bug 4 — missing retries:** `duel-core.js api()` gained a bounded retry (2 attempts, 600ms) for TRANSIENT
  failures only (network drop or HTTP 5xx; never 4xx/auth — server mutations are idempotent); `heartbeat` gained
  one delayed retry so a brief blip doesn't age presence into a false "Reconnecting…".
- **Consequences:** `node --check` clean (api/duel.js, functions/index.js, duel-core.js); indexes JSON valid;
  `npm test` green (4736 + 238 + 97 + 79). New index + the repointed Cloud Function require a Firebase deploy
  (`firestore:indexes` + functions). SW v123→v124 (duel-core is a client asset). No client-visible behaviour
  change beyond fewer spurious errors/"Reconnecting…" flickers.

## ADR-064 — Duel end-of-match UX: premium transition, skip-aware results, full match review (2026-06-15)
- **Context:** After the final duel question the screen froze ~1–2s then snapped to a basic results card (too high
  on short devices), and there was no way to review which questions you got right/wrong, the correct answer, or
  why — gutting the educational value. Goal: make finishing a duel feel intentional + rewarding + educational,
  without touching gameplay/matchmaking/scoring, reusing the existing AI Explanation.
- **Data constraint:** `duels/{code}.prompts[]` (text+category) is client-readable, but the correct answers live
  in a server-only `private/key` doc and a player's own answers aren't cached. So review needs (a) a client answer
  cache during solving and (b) an additive server step returning each player THEIR OWN per-question review.
- **Decision:**
  - **M1 transition + centering** (`duel-manager.js`, `duel-ui.js showCalculating/hideCalculating`, css): a branded
    "Submitting → Syncing with {opp} → Calculating results" overlay (held ~900ms min) replaces the dead gap; the
    results card reveals with a spring entrance. Fixed `#duelResults` centering — neutralised `.duel-screen`'s
    `min-height:100%` + nav-padding inside the overlay + made it scroll/safe-area aware.
  - **M2 results** (`duel-ui.js renderResults`): skip-aware — shows Attempted + Skipped rows when
    `config.allowSkip` (derived from `perPlayer.answeredCount` + `effectiveQuestionCount`), plus a prominent
    "Review all questions" action.
  - **M3 review** (additive `api/duel.js _buildReview` → persisted on the player's OWN `players/{uid}.review`,
    returned via `finish`/`state` `myReview`; `duel-core.js fetchMyResult` for the listener path; client
    `_myAnswerCache`; `duel-ui.js renderReview`): a per-question list — Q#, category, ✓/✗/Skipped, your answer,
    correct answer, and a 🧠 Explain button that calls the EXISTING `AIFeatures.showExplanationModal(q, correct,
    category)` (same path drill-engine uses). Scoring (`_grade`/winner) untouched; opponent per-question answers
    stay private (own-doc only).
- **Consequences:** `node --check` clean on all four duel files; `npm test` green (4736 + 238 + 97 + 79 — no
  engine/test files). SW v122→v123. Out of scope honoured: no gameplay/matchmaking/scoring/networking change; only
  additive Firestore field `players/{uid}.review`.

## ADR-063 — Duel header redesign + real player name (2026-06-15)
- **Context:** The Math Duel solving screen showed a near full-width Exit button, no clear opponent identity, and
  the player name as the email prefix ("itskrishnabajaj") instead of the onboarding name ("Krishna").
- **Cause:** `_duelHeaderHTML()` gave Exit `class="btn btn-secondary btn-sm"` — `.btn` is 54px + `width:100%` and
  `.btn-sm` is unstyled, so it ballooned. `_myName()` tried `FirestoreSync.getProfile()` (doesn't exist → throws)
  then fell through to `email.split('@')[0]`. The canonical onboarding name (`users/{uid}.profile.name`) was
  already cached at `FirestoreSync._getCache().profile.name` (used by home greeting + drill share card).
- **Decision:** Redesigned the header (`js/duel-manager.js` + `css/style.css`) into a two-zone layout — opponent
  identity LEFT (a structured avatar-slot + name + status that flexes & truncates), compact Exit button RIGHT
  (own `.duel-exit-btn`, 36px, not the 54px `.btn`); kept `id="duExit"` so the `_promptExit` wiring is untouched.
  `_updateOppChip()` now sets name via `textContent` (XSS-safe), an avatar initial, and the status dot. Fixed
  `_myName()` to read the cached `profile.name` first (no new Firestore read), with fallback order display-name →
  email-prefix (last resort) → 'Anonymous'. The left zone is future-proof for avatar/premium/league/streak badges
  with no further refactor.
- **Out of scope (untouched):** gameplay, timers, matchmaking, scoring, animations, question rendering,
  networking, Firestore schema, lobby/results/waiting renderers, exit-confirmation modal.
- **Consequences:** `node --check` clean; `npm test` green (4736 + 238 + 97 + 79 — no engine/test files touched).
  SW v121→v122. Manual on-device pass recommended (header balance, long-name truncation, dark mode).

## ADR-062 (AI V2 POLISH) — Flagship polish of every AI feature, no rewrite (2026-06-15)
- **Context:** The God-Mode audit scored Planner 8.5 / Explanation 7 / Coach 6.5 / Insights 5.5, with confirmed
  bugs and two UX trust problems. Mandate: polish EXISTING features to ~10/10 without changing the architecture
  (deterministic brain + one gpt-4o-mini voice + KB); keep cost (~$0.05/user/mo) and performance flat. Future
  research (BKT/IRT/forgetting-curves/spaced-rep/lessons/RAG/memory) explicitly OUT OF SCOPE.
- **M1 — bugs + dead metadata:** fixed the `formulaSheet` key mismatches (now real `js/formulas.js` ids; nulled
  the ones with no sheet) + a `knowledge-base.check` assertion that would have caught it; added `getTopicForCat`
  + `FORMULA_SHEET_IDS`; account deletion now removes `aiPlanner`/`aiContext`/`aiDaily` + `aiEvents`/`duelHistory`
  (GDPR); `refundWordProblemQuota` refunds a burned unit on generation failure; client `api()` de-dups in-flight
  AI calls. **Honest:** the audit's "unbounded growth" and "duel not gated" findings were OUTDATED/false —
  dailyHistory(90d)/blockHistory(12)/responseTimes(200) already capped; duel already premium-gated.
- **M2 — Planner clarity/trust:** Exam Readiness is no longer a black box — `examStrategy` keeps the score's
  `parts` and builds `readinessBreakdown {summary, factors}`; the ring is tappable ("Most limited by syllabus
  covered (0%) — lift that to move up fastest") with labelled factor bars. Time reads "≈3.7 hours of study"; every
  progress bar names ONE thing ("% ready"; stats bars captioned as accuracy).
- **M3 — Coach → reasoning mentor:** `examStrategy.coachBrief` feeds structured LEVERS (top move + what it unlocks
  = dependency compounding + skip cost, strength to keep, what's slowing them, target math); `coach.daily@9`
  reasons WHY, answers the student's real questions, writes a 2-paragraph mentorNote where every line teaches,
  and BANS generic motivation. Shared `RAILS` constant keeps cost flat.
- **M4 — Insights → discoveries:** `examStrategy._discoveries` computes relationships a student wouldn't spot
  (dependency leverage, marks concentration, effort misallocation, momentum split); `insights.analyze@10` leads
  with the discovery + "so what" and is told NOT to restate the plan; dashboard de-dups discoveries vs the
  ADR-061 cards.
- **M5 — Explanation grounding:** seeds the `mistakes` from the KB's real `commonMistakes`, names the prereq, and
  flags high-practice patterns (`explain.base@6`, cache-busting bump) — making `commonMistakes`/`formulaSheet`/
  `practiceIntensity` live consumers.
- **M6/M7 — hygiene + validation:** RAILS + tightened prompts (cost ~flat: removed the `motivation` field,
  trimmed boilerplate); `intelligence-consistency.check` extended to 79 (readiness breakdown, coachBrief names the
  planner's top focus = one source of truth, discoveries well-formed). `npm test` green (KB 4736 + engine 238 +
  brain 97 + consistency 79). SW v119→v121.
- **HONEST RE-SCORECARD (previous → new):** Planner **8.5→9.0** (transparent readiness + clear labels; IRT capped),
  Coach **6.5→8.0** (reasons over levers/compounding; cross-session memory + style-adaptation need out-of-scope
  longitudinal memory), Insights **5.5→8.0** (real discoveries, de-duped; "learned" pattern discovery still needs
  a model), Explanation **7.0→8.0** (grounded in KB traps/prereq; true method validation needs a solver),
  Prompt-engineering **7.5→8.5**, Trustworthiness **7.5→8.5**. **The realistic ceiling for polish is ~8–9; a true
  10 on Coach/Insights/Explanation/Planner requires the out-of-scope learner model — stated plainly, not faked.**

## ADR-061 (V2 · Milestones 4–7) — Behaviour-aware Coach, analyst Insights, proven consistency (2026-06-15)
- **Context:** Coach summarised instead of mentoring (no behaviour history); Insights motivated instead of
  analysing; and nothing PROVED the three roles stay consistent. The user wants Coach = WHY/HOW (a real mentor
  that notices habits), Insights = HOW-YOU'RE-DOING (an analyst), and a guarantee they never contradict.
- **Decision (M4 — Coach):** `examStrategy` now derives `behaviour` signals from the planner doc with no extra
  persistence — `postponed` (topics scheduled-but-skipped on past days), `neglectedSections` (a section the
  student keeps avoiding), `stale` (strong topics not studied in 14+ days) — and serialises them ("postponed
  Geometry 3×… marks at stake"). `coach.daily@8` becomes a long-form **mentor**: a `mentorNote` field (3–5
  sentences of connected reasoning over behaviour + analytics + plan) that names avoidance patterns kindly,
  ties them to marks, prescribes a small momentum step, and may point to external material (the app is the
  planner+drills, not the content). Rendered as a "Your coach" card.
- **Decision (M5 — Insights):** deterministic **analyst** blocks assembled from the strategy (figures never
  hallucinated): a forecast WITH confidence, **opportunity cost** (marks left unclaimed by triaged topics), a
  **dependency bottleneck** (a weak prereq capping several unlocks), **revision debt**, and a stale-topic read.
  `insights.analyze@9` reasons in marks/ROI/leakage terms with stated prediction confidence.
- **Decision (M6/M7 — shared intelligence + validation):** new `scripts/intelligence-consistency.check.js`
  simulates beginner / advanced / last-minute / inconsistent / regressing / avoidant / no-exam profiles across
  CAT/SNAP/IBPS/JEE/NDA/GMAT and asserts ONE source of truth: the path is real sections, the schedule is a pure
  projection of the roadmap, **the topic Coach would prescribe == a topic the Planner scheduled**, recovery
  overrides agree across roles, avoidance reaches the prompt, the forecast is bounded, the KB drives per-exam
  behaviour, and no exam → null (graceful degradation).
- **Consequences:** No model/schema-shape/rules change; one LLM call per feature. `npm test` green across **four**
  harnesses (KB 4686 + planner-engine 238 + planner-brain 97 + consistency 61). No client assets changed (SW
  unchanged). **QuantReflex V2 (ADR-059→061) complete: one researched knowledge base → one exam-agnostic engine
  → Planner/Coach/Insights as three honest, consistent views.**

## ADR-060 (V2 · Milestones 2–3) — Real section path + session-typed study blocks (2026-06-15)
- **Context:** The planner displayed fabricated phase names ("Build Arithmetic Foundation", "Complete High-ROI
  Arithmetic") and the timetable had Drill buttons (navigation, not planning). The user wants the path to be the
  REAL syllabus sections + topics, and the schedule to say WHAT/WHEN with session types — drills are only a
  suggestion (clean separation: Planner plans, Drills execute).
- **Decision (engine, M2):** `planningEngine.buildStrategy` now emits `sections` (the real path: each syllabus
  section with `weightage`, `topicCount`, `progressPct`, `marks`, `status`, and its real `topics` ordered by
  ROI) instead of synthetic milestones — the foundation/core/revision phase logic stays INTERNAL to roadmap
  ordering only. Every roadmap/schedule block now carries a `sessionType` (`first-learning`/`practice`/
  `revision`/`mock`, derived from how well the student knows the topic) plus `durationMin`, `weightage`, `roi`,
  `pyqFreq`, `formulaSheet`, `unlocks`, and a drill SUGGESTION (never an action). `examStrategy` persists
  `sections`; `_nextObjective`/serialize use the active section.
- **Decision (UI, M3):** `planner-view.js` renders the section path (expandable to real topics with weightage +
  ROI), a Focus-Next card enhanced with priority `x/10`, PYQ %, effort, unlocks + why, and a real coaching
  timetable — `Topic — Nmin (Session Type)` + reason + unlocks + drill *suggestion text*. **All Drill buttons
  removed from the planner**; completion tracking kept. Never implies in-app content the app lacks ("study from
  your books/notes" for study-only topics).
- **Consequences:** Verified live — CAT path now reads *Arithmetic (11 topics, Very High, …) → Algebra →
  Number System → Data Interpretation → Geometry*, with blocks like *Ratio & Proportion — 60m (First Learning),
  drill suggestion: Ratios*. `npm test` green (KB 4686 + planner-engine 238 + planner-brain 97). SW v118→v119.
  Milestones 4–7 (behaviour-aware Coach → analytical Insights → shared-intelligence audit → validation) follow.

## ADR-059 (V2 · Milestone 1) — The canonical Quant Knowledge Base (2026-06-15)
- **Context:** The user's review (screenshots) showed the planner "path" displaying fabricated phase names
  ("Build Arithmetic Foundation") and `syllabus.js` carrying thin, per-FAMILY weightages (all 8 MBA exams
  identical). The user wants the knowledge base to be QuantReflex's flagship asset: real topics only, **per-exam
  researched weightages for all 26 exams**, rich metadata, sourced with a strict hierarchy (official patterns +
  PYQ trends > coaching consensus > web), confidence-scored, no fabrication. The engine must stay exam-agnostic.
- **Decision:** Rebuilt `data/syllabus.js` (SYLLABUS_VERSION 2) as two layers: (1) a **canonical `TOPICS`
  library** — 50 real, exam-independent topics with universal metadata (synonyms, section, difficulty, prereqs,
  `unlocks` derived as the exact reverse of prereqs, avgMinutes, revision cadence, formulaSheet, drillable,
  signals, commonMistakes, practiceIntensity, confidence); (2) **per-family weight profiles** (mba/banking/ssc/
  defense/school/generic) with researched weightage **bands** (very-high/high/medium/low) + PYQ frequency, plus
  **per-exam overrides + nuance** where an exam genuinely differs. `resolveSyllabus(examId)` MERGES library +
  per-exam weights into the SAME topic shape every consumer already reads (importance from band, frequency from
  band, ROI 0..10 + weightage/pyqFreq/confidence passed through) — so planningEngine/examStrategy/readiness/
  signals are untouched. Fixed a latent resolution bug (`resolveSyllabus` called with a syllabus-id fell through
  to generic) — `examStrategy` now resolves by `examId`; `getSyllabus` stays backward-compatible with legacy
  family keys.
- **Honesty:** weightages are confidence-scored bands, not invented precise %; the file header documents the
  SOURCES & METHOD; uncertain metadata marked `confidence:'med'`. Authored from established, reliable coaching-
  syllabus knowledge (Arun Sharma / TIME / IMS / CL consensus + official patterns + PYQ trends).
- **Consequences:** Per-exam differentiation is now real (GMAT→Data Sufficiency very-high, no Indian DI/Trig;
  NDA→Trigonometry very-high; JEE→Coordinate Geometry/Quadratics very-high; IBPS→Simplification/Series; CLAT a
  light 20-topic set). New `scripts/knowledge-base.check.js` (**4686** assertions: every exam resolves; topic/
  prereq/signal integrity; acyclic graph; unlocks==reverse-prereqs; valid bands/confidence; ROI 0..10; per-exam
  differentiation). `npm test` green (KB 4686 + planner-engine 237 + planner-brain 97). SW v117→v118. Milestones
  2–7 (engine → planner UI → Coach → Insights → shared-intelligence audit → validation) follow.

## ADR-058 — Planner v3 complete: the strategy IS the schedule + the strategy-dashboard UI (2026-06-15)
- **Context:** ADR-057 stood up the layered brain but left the persisted planner block generated by the legacy
  `plannerEngine.generateBlock` (its own planning logic) and the Planner UI as a calendar. The user wants the
  end-state: the Strategy Engine is the **sole planner**, the schedule is a **projection**, and the UI is a
  **strategy dashboard**, not a calendar.
- **Decisions:**
  - **Endpoints → projector (sole planner).** `plannerSetup`/`plannerRegenBlock` now build the block via
    `examStrategy.assemble` → `scheduleProjector.project` (the block is a pure projection of the strategy's
    roadmap); `plannerToggle` credits coverage then **re-derives the strategy** so milestones/readiness/
    projection reflect the tick; `plannerGet` re-derives the **live** strategy each open (the persisted block
    keeps completion state). The plan doc is **v3**: it persists the `strategy` (milestones/focus/skip/recovery/
    verdict/projection) + a numeric `targetScore`. `generateBlock` is **retired from the production path**
    (kept only as a tested library helper); `rebalanceMissed`/`applyCompletion` remain the mechanical helpers.
  - **Planner UI = strategy dashboard** (`planner-view.js` + CSS). Leads with readiness + an honest verdict, the
    **milestone path** (Build {Section} Foundation → … → Final Revision, with status + % + objective), a
    **recovery override** banner when recent analytics conflict with the plan, **Focus next** (topics with
    *why* + score impact, deep-linking to drill or "your resources"), and a **triage** line (parked topics +
    marks-at-risk). The 14-day schedule is kept *below* as the projection it renders; legacy docs without a
    strategy fall back to a basic readiness panel.
- **Consequences:** One planner, one schedule, everywhere. Verified by `npm test` (planner-engine **235**,
  planner-brain **97**: setup returns a v3 doc carrying milestones; the block is a projection; toggling credits
  coverage and re-derives the strategy). Fixed a latent bug: `examReadinessScore` returns `{score,…}` — Layer 2
  now reads `.score` (readiness was collapsing to 0). SW v116→v117 (planner-view + css). UI verified by data
  contract + tests; visual pass is the user's on-device check.

## ADR-057 — One intelligence, three roles: Profile → (optional) Exam Strategy → Coach/Insights/Planner (2026-06-15)
- **Context:** The user specified a strict **layered decision model**, not one universal plan output: (1) a
  permanent **Student Intelligence Profile** (Layer 1, every user); (2) an **optional Exam Strategy** (Layer 2,
  only when an exam exists) that is the **sole planner** — it thinks in **milestones/objectives first**, then a
  schedule is a pure **projection** with no planning logic of its own, rebuilt whenever state changes; (3)
  **roles** (Layer 3) that reason over Profile (+ Strategy) and degrade gracefully with no exam. No feature
  talks to another — every behavioural detection is **canonicalized as a signal on the Profile**, which the
  Strategy consumes. Coach (mentor) / Insights (analyst) / Planner (optimizer) are three expressions of one mind.
- **Decisions:**
  - **Layer 1 pure.** Removed the embedded planner from the profile (`ctx.planner`/`_plannerData` deleted);
    `studentProfile.build()` is now exam-agnostic and adds `ctx.recentRegressionTopics` (strong topics now in
    recent mistakes) for the Strategy to consume.
  - **Layer 2 sole planner.** New `services/examStrategy.js` (`assemble` is pure + unit-tested; `build` reads
    `aiPlanner/{uid}`, returns **null when no exam**). It runs the upgraded `planningEngine.buildStrategy`, now
    **milestone-first**: subject-aware objectives (*Build {Section} Foundation → High-ROI {Section} → … → Mock
    Readiness → Final Revision*, dynamic — never hardcoded) → an ordered, calendar-agnostic **roadmap**. The new
    pure `services/scheduleProjector.js` bin-packs that roadmap into the day schedule with **zero planning
    logic** (proven: same roadmap → identical days regardless of marks).
  - **Bidirectional via the Profile.** `buildStrategy` consumes Profile signals deterministically: `burnout` →
    lighter workload; `retentionRisk` → revision earlier; `recentRegressionTopics` → a **Recovery objective
    placed first**; `mockTrend` → re-rank. The Strategy reads the one evolving picture — features never message.
  - **Layer 3 roles.** Coach/Insights build `examStrategy.build()` and **reason WITH** it (adherence, ahead/
    behind, a recovery override when recent analytics conflict with the plan order), rendering readiness/plan
    blocks from it; with **no exam** they render a rich Profile-only envelope and the prompts (`coach.daily@7`,
    `insights.analyze@8`) are instructed to invent no plan. To avoid a Coach↔Planner-screen divergence before
    the UI pass, the strategy surfaces the persisted `block` as its schedule while the brain drives the reasoning.
- **Consequences:** No model/schema/rules change; one LLM call per feature. Verified by `npm test`
  (planner-engine **235**, planner-brain **96**): Layer 1 has no `ctx.planner`; Layer 2 null with no exam +
  empty plan text (degradation); milestones-first + ordered roadmap; projector deterministic/order-only; burnout/
  retention/regression/mock signals reshape the plan; Coach renders the readiness ring only with an exam. **Next
  pass: the strategy-dashboard Planner UI (milestones/readiness/triage/projection) — at which point
  `plannerSetup`/`regen`/`toggle` generate the persisted block via the projector, retiring `generateBlock`.**

## ADR-056 (Planner v3, brain) — The canonical planning engine: maximize expected marks (2026-06-15)
- **Context:** The Study Planner felt like a checklist (day→topic→drill). The user wants it rebuilt as the
  **central intelligence** of QuantReflex — a reusable planning *service* (not a screen) that thinks like an
  experienced mentor and optimizes ONE objective: **maximize expected marks before the exam** (not topic
  completion). Built **brain-first, fully testable**, then the UI; consumed by every feature (Planner, Coach,
  Insights, reminders, revision, mocks, adaptive practice, future web) so nobody invents their own plan.
- **Decision:** New pure/deterministic `services/planningEngine.js` `buildStrategy(input)` → a marks-maximizing
  `strategy`. Inputs: the resolved exam **syllabus graph** (canonical ~30–40 natural topics with importance/
  frequency/difficulty/prereqs/estMinutes), `daysToExam`, study time, `targetScore`, and per-topic `readiness`
  (reusing `readiness.readinessMap`). It computes each topic's **marks weight** (`importance×frequency`),
  expected marks **gain** to target, **hours needed**, **marks-per-hour**, and **downstream unlock value**;
  then greedily selects the path that maximizes expected marks **within the available study-hours budget,
  prerequisites first** — topics that don't fit are **triaged to skip** (with the marks-at-risk quantified).
  It generates **dynamic phases** (Foundations→Core→Advanced→Revision, + a Mock phase only under urgency — by
  data, not hardcoded), an honest **projection** (projected score, achievable?, plain verdict), and per-topic
  **rationale answering the five mentor questions** (why / why now / score impact / what it unlocks / what
  skipping costs). The schedule is an OUTPUT of the strategy, not the UI.
- **Consequences:** Pure (no Firestore/LLM/DOM) → fully testable and reusable. Verified by `npm test`
  (planner-engine **225**, incl.: time-budget scales with days-to-exam; a tight deadline triages more topics and
  reports marks-at-risk; the plan fits the hours; prereqs are never skipped before a LEARN; phases are dynamic
  and the Mock phase appears only near the exam; every topic carries the five rationale fields; projection +
  achievability are real numbers). **Next: wire the engine as the profile's `strategy` (Coach/Insights/Planner
  all consume it), then build the strategy-dashboard UI that renders it.**

## ADR-055 (Part 1) — Stop faking intelligence: an honest, evidence-bounded reasoning model (2026-06-15)
- **Context:** After ADR-054 the AI sees real data but **fabricates** on top of it. Screenshots from a today-only
  account: Insights claims *"Accuracy (7d): 64%"* and *"you've been stuck at 64%"* (a week/month of history that
  doesn't exist), and *"Speed 0.0 s/Q"* (impossible). Coach swaps `64%→62%` and repeats itself (template
  substitution, not reasoning). The user: *"Don't make the AI sound smarter — make it actually smarter… no
  fabricated history, no fake trends, no template substitution."*
- **Root causes (file:line):** (1) per-question time is recorded in **seconds** (`drill-engine.js:302`) so
  `dailyHistory.sumTimes` is seconds, but `statMath.speed` mis-named it `recentMsPerQ` and every AI display
  **divided by 1000** → `0.0 s/Q`. (2) `statMath.accuracyWindows` returns `d7===d30===today` for a 1-day account
  and `serialize()` fed the model *"Accuracy 7d 64% vs 30d 64% (flat)"* with **no data-span note**, while
  `insights.analyze` invited "find patterns" with **no honesty guard** → the model invented history. (3) Coach
  got raw numbers but **no computed "what changed since last session and why."**
- **Decisions:**
  - **Evidence/confidence spine.** `statMath.evidence(stats)` → `{activeDays, totalAttempted, hasMultiDayHistory,
    confidence: first-session|early|established|rich}` materialized as `profile.evidence`. Every claim is bounded
    by it. `serialize()` leads with an EVIDENCE line instructing the model to never exceed it.
  - **No invented windows.** `accuracyWindows`/`speed` return `direction: null` (not a fabricated "flat") and a
    `multiDay` flag when there are <2 active days; `serialize()` emits 7d/30d trend lines and metric clusters
    label them "(7d)" **only** with real multi-day history — otherwise honest "today" numbers. Both prompts get
    an explicit honesty guard ("first read", never "stuck"/"held flat"/"7-day"/"over a month").
  - **Speed fixed end-to-end (seconds).** `statMath.speed`/`today` return `recentSecPerQ`/`avgSecPerQ` (1-dp
    seconds); removed the `/1000` at all display + serialize sites; `signals.speedScore` re-based to seconds.
    Speed reads `4.9s/Q`, never `0.0`.
  - **Real reasoning, not templates.** `profile.lastChange` = latest-vs-previous session diff (accuracy &
    attempts Δ); `serialize()` feeds it with an instruction to reason about WHY it changed; `coach.daily@6` /
    `insights.analyze@7` reason over it. All three features read the same `build()` profile (one understanding).
- **Consequences:** No model/schema/rules change. Verified by `node --check`, `npm test` (planner-engine 209 +
  planner-brain **89**, incl.: a today-only account is `first-session`, has `direction:null` (no fake trend), no
  7d/30d data line in `serialize`, metrics labelled "today", speed in real seconds never `0.0`, `lastChange`
  null with one session). SW v115→v116. **Part 2 (the mentor-grade Study Planner redesign — strategy/phases over
  a canonical syllabus graph + new UI) is the next, larger step.**

## ADR-054 — The AI must never discard the student's real data on a Firestore read hiccup (2026-06-15)
- **Context:** A user with Analytics showing 11 attempted / 63.6% / 1 drill session opened Coach and Insights,
  which said *"I don't know much about you yet"* / *"I haven't seen you solve yet"* and fell back to the
  hard-coded "Percentages" recommendation. So the server-built profile had `totalAttempted: 0` AND
  `mastery: []` while the client demonstrably had data — a **data-sourcing** bug (changing the copy again would
  not fix it).
- **Root cause (traced, exact line):** the AI profile is built server-side from Firestore via `firebase-admin`
  (`studentProfile.build()` → `users/{uid}` read). The client's authoritative live stats are passed as a
  **floor** (`opts.clientStats` → `_floorStats`) — the only bridge between "what the student did" (client) and
  "what the AI sees" (server). **That bridge was discarded on the read-failure path:** `studentProfile.js`'s
  `catch` returned `_coldContext(uid, {})`, which hardcoded `totalAttempted: 0` and **ignored `opts.clientStats`**.
  So whenever the `users/{uid}` read threw (most likely a missing/invalid `FIREBASE_SERVICE_ACCOUNT` in the
  serverless env, or a transient/permission error), `build()` returned a zero profile regardless of the floor →
  the "I haven't seen you solve yet" onboarding. (The LLM call succeeds separately, so the user still got a
  rendered — but cold — envelope.) A second hole: `firestore-sync.js queueUpdate` **silently dropped** writes
  when Firebase/auth wasn't ready yet, so a first session could never persist to `users/{uid}.stats`, leaving
  the floor as the only safety net — which then had the first hole.
- **Decisions:**
  - **The client floor is honored on EVERY path (the architectural fix).** `studentProfile.build()` no longer
    returns a cold profile on a read error — it degrades to empty server stats and **falls through to the same
    `_floorStats(stats, opts.clientStats)` path**, rebuilding a real profile from the client's data + whatever
    else is reachable. Invariant: *if `clientStats.totalAttempted > 0`, the built profile is never `coldStart`
    and `totalAttempted ≥` the client value.* `_coldContext` is now unused and was deleted.
  - **Tripwire instrumentation.** `build()` `console.warn`s a structured `INVARIANT VIOLATION` (uid, clientTotal,
    serverTotal, flooredTotal, readOk) if a positive client floor ever yields a cold profile — so the exact
    divergence is visible in server logs and any regression is caught. (With the fix it should never fire.)
  - **Close the persistence hole.** `firestore-sync.js queueUpdate` now **buffers** the update instead of
    dropping it when Firebase/auth isn't ready, and `_flushPending()` flushes the buffer once the user loads —
    so a first session always reaches `users/{uid}.stats` and Firestore catches up (defense-in-depth; the AI is
    already correct via the floor regardless).
  - **Out of scope / not the bug:** the persona, LLM/prompts, renderer, `/api/ai` actions, and engines are
    unchanged. The `FIREBASE_SERVICE_ACCOUNT` env value (if that's the trigger) is a deploy-config concern set
    securely in the host's environment variables — the code is now resilient to it either way.
- **Consequences:** A Firestore read failure can no longer make QuanAI disown a student who has data. No model/
  schema/rules change. Verified by `node --check`, `npm test` (planner-engine 209 + planner-brain **78**, incl.
  a simulated admin read-failure: `build`/`coachToday`/`insights` with a client floor stay warm — real total,
  `coldStart:false`, real mastery, no "I haven't seen you solve" phrasing). SW v114→v115.

## ADR-053 — One canonical Student Intelligence Profile + one derivation layer (2026-06-15)
- **Context:** QuanAI *felt* like four features pretending to know the student. A full 3-pass re-audit
  confirmed the persona, orchestrator (`aiBrain`), renderer (`companion-ui`), `/api/ai` endpoint, prompts, LLM
  seam, and the deterministic planner/readiness engines were **already unified and correct** — so a ground-up
  rewrite would only regress a tested production system. The genuine fragmentation was two things: (1) the
  canonical profile was never *materialized* as one object — the picture was scattered across `ctx` + a
  separate per-call `aiPlanner` read (`aiBrain._plannerData`, run by both Coach and Insights) + `aiMemory` +
  client `progress.js`, and Explanation bypassed the context engine entirely; (2) the **client** (`progress.js`,
  `stats-view.js`) computed accuracy/weak-topic/speed/trend **independently** from the **server**
  (`studentContext`), so Analytics and QuanAI could disagree (the root of "Analytics knows me but Coach
  doesn't"). User decision: surgical foundational redesign — not a rewrite.
- **Decisions:**
  - **One derivation layer — `data/statMath.js`.** A pure, self-contained, dual-exported module (loaded as a
    `<script>` on the client, `require()`'d on the server, like `syllabus.js`) holds the ONLY implementation of
    every stat-derived signal: per-category mastery/tiers, weakest/strongest, overall accuracy, the 7d/30d
    accuracy windows, speed (recent vs baseline), today, and streak/consistency — with the thresholds
    (`MIN_ATTEMPTS=3`, weak `<0.6`/strong `≥0.8`, the window/direction cut-offs) defined once. The server
    `studentProfile` and the client `progress.js`/`stats-view.js` both consume it, so for the same `stats` they
    cannot disagree. (`dailyHistory` keys are `toDateString()` on both sides — no migration.)
  - **One materialized profile — `studentContext.js` → `studentProfile.js`, `buildContext` → `build`.** `build()`
    now returns the whole picture as ONE object: it folds the study planner in (`profile.planner` =
    readiness/forecast/today's tasks/adherence, from one `aiPlanner` read — `aiBrain._plannerData` deleted) and
    materializes `profile.recommendation` (the single "what next"), `profile.tier` (the single experience tier —
    `aiBrain._tier` deleted), and `profile.masteryByCat` (any category's mastery). Every feature consumes
    `profile.*`; none re-assembles its own understanding.
  - **Every feature on the one profile.** Coach/Insights read `ctx.planner`/`ctx.tier`/`ctx.recommendation`
    instead of re-reading/re-deriving. **Explanation** now calls `build()` (cached) instead of its bespoke
    `users/{uid}` read, pulling mastery + recent mistakes + exam + plan from the same object — truly personal,
    never divergent. Planner mutations (toggle/regen/setup) bump the `qr_ai_dirty_at` stamp so the folded-in
    planner snapshot is never stale.
  - **Preserved (already correct/tested):** the persona/voice layer, `aiBrain` orchestrator shape,
    `companion-ui` renderer, the six `/api/ai` actions, the prompt registry, `llmProvider`, and the
    `plannerEngine`/`readiness`/`signals` engines. `progress.getAvgResponseTime` is intentionally left on its
    `responseTimes` source (a different metric with a latent seconds/ms naming quirk) — out of scope here.
- **Consequences:** Fewer moving parts (two responsibilities consolidated into `statMath` + a fuller
  `studentProfile`; `_plannerData`/`_focus`/`_tier` and the client mastery loops + `MASTERY_MIN_ATTEMPTS`
  deleted). No model/schema/rules change; one LLM call per feature preserved. Verified by `node --check`,
  `npm test` (planner-engine 209 + planner-brain **70**, incl. profile folds planner/recommendation/tier/
  masteryByCat, `statMath` is the single weak/mastery implementation that the profile derives from, and
  Explanation reads mastery from the profile), plus grep-gates (one derivation layer; every feature on
  `build()`; deleted helpers gone). SW v113→v114. The felt "same tutor" continuity still wants a real-device pass.

## ADR-052 — Remove the "I don't know you yet" cold-start gate; one canonical profile, graceful degradation (2026-06-15)
- **Context:** Analytics clearly knew the student (it reads live localStorage) while Coach/Insights said "I
  don't know you yet — give me about 10 questions," breaking the one-tutor illusion. A 3-pass audit confirmed
  the data plumbing is already one source of truth and already fresh (the `clientStats` floor + the
  dirty-stamp `shouldForce` rebuild; no stale cache, no refresh/second session needed). The real fault was a
  single **hard gate**: `studentContext.buildContext` early-returned a *fake* `_coldContext`
  (`accuracy:0, mastery:[], trends:null`) when `totalAttempted < 20 && today.attempted < 8`, and
  Coach/Insights branched on `isColdStart` to an onboarding **lock**. So a student with 5–19 lifetime questions
  was refused coaching even though Analytics showed their session. (The only "secondary" client lock,
  `showInsufficientDataModal`, was already a no-op that just opened Insights.)
- **Decisions:**
  - **No cold-start gate.** `buildContext` is the ONE canonical profile and ALWAYS returns the real student,
    computed from whatever data exists (even zero) — deleted the early-return and the `COLD_START_ATTEMPTS`/
    `COACH_MIN_TODAY` constants. `accuracy` is `null` ("no data yet"), never `0` ("0%"). `coldStart` is now a
    *framing flag only* (`totalAttempted === 0 && today.attempted === 0`), never a gate; `_coldContext` survives
    solely as the read-failure/empty fallback (same valid shape). A brand-new user skips the practiceSessions
    read (nothing to fetch).
  - **Coach/Insights always render, gracefully.** Removed the `isColdStart` locks. Data **richness** (`_tier`,
    0–4) now decides how rich the answer is, never whether it works. `tier === 0` (0–5 lifetime) gets a
    deterministic, genuinely-helpful early read (`_coachLowData`/`_insightsLowData`: real accuracy/mastery/
    readiness it already has + an actionable mission, framed as "the more you practise, the sharper I get") —
    no LLM (controlled copy avoids generic output near zero data; cost stays flat). `tier >= 1` is the existing
    LLM living dashboard. A 6–19-question student now gets real LLM coaching where they used to be cold-locked.
  - **One data-state rule.** Deleted the cold constants; the only richness thresholds left are `_tier`
    (single def) and the mastery floor `<3` (`masteryForCat`/`_deriveMastery`, reused by `signals.js`). Aligned
    the client analytics weak/strong floor (`progress.js`, was `>= 10`) to the same `>= 3` (`MASTERY_MIN_ATTEMPTS`)
    so "weak topic" means one thing everywhere. Removed the no-op `<5` insufficient-data branch in `stats-view`
    and the dead `showInsufficientDataModal` shim.
  - **Copy.** No more "I don't know you / give me 10 questions / unlock." Thin-data framing is growth-oriented;
    a zero-data user gets "I don't know much about you yet, but here's how we'll build your profile…" + a start.
  - **Out of scope:** the Premium paywall (`ai_coach`/`ai_study_plan`/`ai_explain`) is monetization, not this
    bug — unchanged.
- **Consequences:** No model/schema/rules change; one LLM call per feature preserved (tier-0 is deterministic).
  Verified by `node --check`, `npm test` (planner-engine 209 + planner-brain **62**, incl. 5-question profile is
  real-not-fake, zero-data profile is valid-not-locked, low-data Coach/Insights have zero banned cold-lock
  phrasing and still offer a mission, and tier-0 makes no LLM call), and a banned-phrasing grep gate. SW
  v112→v113. The premium feel of the low-data dashboards still wants a real-device pass.

## ADR-051 — One source of truth (freshness + mastery) + Explanation as a premium learning document (2026-06-15)
- **Context:** A from-first-principles sign-off audit (4 parallel investigations) confirmed QuanAI is
  architecturally clean (zero dead prompts/exports/files, zero duplicate calls/reads, zero legacy refs) but
  found two real "one brain" gaps. (1) The `clientStats` freshness floor — which lets a feature reflect a drill
  finished during the debounced `syncStats` window — was applied to Coach/Insights/planner-setup/toggle/regen
  but **dropped by `plannerGet`, `chatTurn`, and `wordProblem`**, so opening the Planner or the conversational
  coach right after practice could disagree with the Coach dashboard. (2) Explanation was the only feature not
  wired to the canonical mastery model and rendered only concept + steps + a one-line mistake/tip.
- **Decisions:**
  - **One freshness source, everywhere.** Thread the existing `_sanitizeClientStats` → `buildContext({clientStats})`
    floor into `plannerGet` (server-only — the client already sent it at companion-ui.js:438, the server just
    discarded it), `chatTurn` (client `sendTurn`/drill payloads now send `clientStats`+`clientDate`; `_chat`
    sanitizes + passes), and `wordProblem` (plumbed server-side; the WP AI path is currently future-ready — the
    live client uses the pre-generated question bank). Now every feature reads the same live "today."
  - **One mastery source, no drift.** Exported `studentContext._deriveMastery` + a `masteryForCat(stats, cat)`
    convenience as THE canonical weak/strong resolver. Explanation now reads its category's mastery from the
    **same function** Coach/Insights/Planner feed from (computed live from `categoryStats`), retiring the ad-hoc
    "have they asked to explain this before" heuristic as the tone driver. "If Coach says Percentages is a
    weakness, Explanation agrees automatically."
  - **Explanation = a premium learning document; chips extend, not reveal.** Per the product owner: every
    explanation now renders always-visible sections — concept → step-by-step → **Common mistakes** (2–3, with a
    personalized lead when it's a live weak spot) → **Faster method** → **Exam Insight** (deterministic from the
    bundled syllabus: frequency/difficulty/time-target for the student's exam) → **Mastery Status** (the
    canonical "{acc}% over {n}", never invented) → **Recommended next step** (mastery-tiered drill mission) —
    then the Simpler/Go-deeper/Another/Drill chips *extend* it. `explain.base@4→5` (busts the shared
    per-question cache; `mistake`→`mistakes[]`, `tip`→`shortcut` with when-to-use). One LLM call preserved; the
    personalized sections are deterministic so numbers are never hallucinated and the shared cache stays
    user/exam-agnostic.
- **Consequences:** No model/schema/rules change; one LLM call per feature preserved. Explanation does one
  `users/{uid}` read (same count as before — it yields both stats and memory) and no extra aiPlanner read on
  that high-frequency path. The two canonical resolvers (the `clientStats` floor; `_deriveMastery`) are now the
  single sources of truth for freshness and mastery. Verified by `node --check`, `npm test` (planner-engine 209
  + planner-brain **48**, incl. masteryForCat≡_deriveMastery, the premium-document sections, no-invented-numbers
  on low data, and plannerGet/chatTurn floor wiring), and a grep gate. SW v111→v112. Visual polish + animation
  smoothness still need a real-device QA pass (can't run a browser here).

## ADR-050 — Coach + Insights as living dashboards: one AI brain, no backend rewrite (2026-06-15)
- **Context:** Coach and Insights worked but felt like "a paragraph + a button," and still opened by telling the
  student to "go practice / warm up / unlock." A 3-pass audit found the backend *already computes* almost
  everything a premium, living dashboard needs (`ctx` readiness signals, behavioural flags, trends, error
  patterns; the planner's readiness/forecast/adherence; `aiMemory` wins + recentTopicsExplained) — it just never
  surfaced it. So this is an **assembly + experience** redesign, not new analytics and not a backend rewrite.
- **Decisions:**
  - **Deterministic dashboard assembly, one LLM call each (unchanged cost).** Each feature still makes exactly one
    LLM call (the prose lines only); the server assembles 8–12 deterministic blocks from `ctx` + the single
    existing `aiPlanner` read. `_plannerNote` became `_plannerData(uid, clientDate)` returning a struct
    `{note, readiness, forecast, todayTasks, adherencePct}` so Coach/Insights can emit ring/metric/callout/
    progress/mission blocks — no new reads, no new endpoints, no extra model calls.
  - **Value first, then recommend.** The warm Coach orders: greeting → readiness **ring** → biggest win →
    one worry (driven by the dominant behavioural flag) → metric cluster (tier-gated) → this-week **progress**
    (plan adherence) → days-to-exam callout → today's recommendation **mission** → motivation → conversational
    chips. Insights reads like an analyst: "I found N patterns" → pattern cards from the previously-dead flags
    (`careless`/`speedRegression`/`plateau`/`inconsistent`/`burnout`) + a planner prediction ("ready N days
    early" / "+15 min/day → finish sooner") → every pattern ends in an action.
  - **Experience tiers (0–4) gate WHICH blocks show, never WHETHER they're computed.** `_tier(ctx)` from lifetime
    volume (0–5 / 6–29 / 30–99 / 100–499 / 500+). The metric cluster appears from tier 2; ring/mission/forecast
    appear whenever the data exists.
  - **Cold start = curious onboarding, never "go practice."** `_coachOnboard`/`_insightsOnboard` say "I don't know
    you yet — ~10 questions and I'll build your profile," preview what unlocks, and warmly acknowledge any
    `today.attempted`. No "practice to unlock / warm up" copy remains in either path (grep-gated).
  - **Two new block types, reusing existing CSS.** `ring` reuses the planner `.pr-ring` SVG/CSS; `progress`
    wires the already-defined-but-unused `.cb-progress*` CSS. `renderEnvelope` staggers each block child
    (`--bi` → `animation-delay`) for a cascading reveal; both added to the reduced-motion guard.
  - **Closed two dead loops.** `studentContext.serialize()` now surfaces `recentTopicsExplained` (Explain writes
    it; Coach/Insights never saw it) so "you keep asking about X" is possible; Coach calls
    `aiService.updateMemory(uid,{addWin})` on a genuine improvement so `aiMemory.wins` (previously never written)
    gives continuity. `coach.daily@5`, `insights.analyze@6` (flag-reactive prose; deterministic fallback fills
    every field so numbers are never hallucinated).
  - **Scope guard.** The "make today easier/harder" ask stays **conversational/navigational** (a chat turn +
    "open my planner" chip), NOT a new planner-mutation endpoint — keeping the backend reused, not redesigned.
- **Consequences:** No model/schema/rules change; cost unchanged (one call per feature). The `fmtMin` client
  helper was left duplicated on purpose — the two copies emit different strings (`" min"`/no-round vs `"m"`/round),
  so merging would change user-visible text (ADR-047's "don't merge helpers with different behavior"). Verified by
  `node --check`, `npm test` (planner-engine 209 + planner-brain **37**, incl. warm-dashboard ≥6 blocks + ring,
  cold-onboarding no-banned-phrasing, flag→pattern, and recentTopicsExplained→serialize assertions), and the
  banned-phrasing grep gate. SW v110→v111. The animated multi-section feel still needs a real-device pass.

## ADR-049 — QuanAI product polish: one premium AI, correct dates, modal planner (2026-06-14)
- **Context:** Post-hardening, the features worked but didn't *feel* like one premium product. A 3-pass audit
  root-caused a set of correctness + UX issues for the final polish before paid launch.
- **Decisions:**
  - **Coach/Insights freshness (cold-start despite data).** Root cause: the per-day `aiDaily` envelope cache was
    bypassed only on `opts.force`, not `opts.clientStats` — so a cold-start envelope cached when the account was
    new that morning was served all day even after the student accumulated attempts. Fixed to
    `!opts.force && !opts.clientStats` (mirrors `studentContext`'s own cache rule). (The ADR-048 floor already
    rebuilds a warm context; this stops the earlier short-circuit.)
  - **Local-date anchor (timezone).** "Today" was computed in UTC on client + server (`toISOString().slice(0,10)`),
    so at 3 AM in a positive-offset zone the planner anchored to *yesterday* (and the calendar's `is-today`
    landed on the wrong cell, making selection feel broken). The client now sends its **local** `clientDate`
    (`YYYY-MM-DD` from local getters); the server uses `clientDate || _todayIso()` at every anchor
    (`plannerGet/Setup/Toggle/RegenBlock/_plannerEnvelope` + Coach/Insights today-match). Pure date-string math
    is unchanged; only the anchor is local.
  - **Planner as a bottom-sheet.** The full-page `#view-planner` router view became the existing premium
    companion modal (`.companion-overlay`/`.companion-sheet`: backdrop blur, slide-up, rounded top, dismiss-on-
    backdrop, desktop-centered) + a grabber and drag-down-to-dismiss. `Planner.renderInto(modal, plan)` draws the
    calendar into the same sheet (seamless setup→calendar). This also fixed the broken scroll (one
    `.companion-scroll` container vs the old nested `.spa-view`/`.container`/unstyled `.planner-detail`), added
    safe-area + small-screen breakpoints, and calendar micro-polish.
  - **One vocabulary + cleanup.** Standardized on "Study Planner"; removed the dead router mount
    (`ensureSection`/`activate`/`root`/`openCalendar`/`Planner.render`) and orphaned `.planner-back` CSS.
  - **One AI.** A shared `_plannerNote` grounds BOTH Coach and Insights in the live planner (today's tasks +
    readiness/on-track); `insights.analyze@5`.
- **Consequences:** No model/schema/rules change; the planner API gains an optional `clientDate`. Verified by
  `node --check`, `npm test` (planner-engine 209 + planner-brain 25, incl. new clientDate-anchor + aiDaily-bypass
  assertions), and grep gates (zero router refs, one vocabulary). SW v109→v110. Timezone/modal/scroll behaviors
  still need a real-device pass.

## ADR-048 — Final pre-production hardening of the QuanAI system (2026-06-14)
- **Context:** A full pre-launch architecture audit (three forensic passes — dead-code/dependency graph,
  stale-data/freshness, prompts/personalization/UX) confirmed the QuanAI system is architecturally clean and
  largely launch-ready: one orchestrator, one context engine, one prompt registry, one planner; zero orphan
  modules, zero dead helpers, zero dead prompts; the ADR-047 legacy-Mission removal complete; all "duplication"
  intentional. The audit surfaced a small set of verified correctness/consistency/UX gaps to close before paid
  launch.
- **Decisions:**
  - **Awaited planner writes (data integrity).** The planner's Firestore writes (setup/toggle/regen + the
    `plannerGet` auto-catch-up) were fire-and-forget (`.set().catch(log)`), so the API returned success even
    when the write failed → a checked task could silently revert on reload. Now AWAITED via a `_writePlanner`
    helper; failures return `write_failed` → the API maps it to a **retryable 503**, and the calendar rolls back
    the optimistic checkbox (with a toast) instead of showing a falsely-saved state.
  - **Coach/Insights use the `clientStats` floor.** The ADR-046 accuracy-floor was applied to the planner path
    only; Coach/Insights, in the few-second `syncStats` debounce window right after a drill, used `force` to
    bypass the cache but then read still-unsynced Firestore stats → a stale `today`/accuracy. They now thread the
    same `clientStats` floor (reusing `_floorStats` + `_sanitizeClientStats`) — the freshness fix is now uniform.
  - **Uniform exam-awareness.** `planner.narrate` and `explain.followup` were the only prompts not injecting the
    student's exam; both now use `sys(role, examName)` (versions bumped, version-honest `promptId`s). The
    planner `rationaleSeed` gains `daysToExam` so encouragement matches exam proximity.
  - **`NO_AUTH` UX.** `companion-ui.renderError` now handles the auth-failure code with a "sign in again"
    message and no retry button (it isn't transient).
  - **Dead-code removal.** Deleted `aiService.generateWordProblems` + `_shuffleInPlace` (a deprecated
    Firestore-`questions` path with zero callers) and the unused `checkWordProblemQuota`; the live Word Problems
    feature keeps its `wp.generate` LLM path.
- **Consequences:** No model/schema/rules/index change. Verified by `node --check`, `npm test`
  (planner-engine 209 + planner-brain 23, incl. a new Coach clientStats-floor assertion), and a zero-reference
  grep for the removed exports. SW cache v108→v109. Remaining (manual, browser-only) verification noted in the
  CHANGELOG.

## ADR-047 — Post-merge forensic remediation: one authoritative planner + restore dropped UX (2026-06-14)
- **Context:** `main` was produced by merging two parallel QuanAI efforts — the pushed "production audit" (ADR-045:
  exam-aware persona, version-honesty, freshness, `quantTopics`/`planLogic`) and the ADR-046 Planner branch (which
  also carried a parallel ADR-045 draft). The merge took the audit wholesale for shared AI logic and layered the
  Planner additively, which **silently dropped a cluster of the Planner branch's non-conflicting UX improvements**
  and left **two competing planners** in the tree. A three-agent forensic audit of the final `main` blobs (not git
  metadata — the actual code) confirmed six regressions and the duplication.
- **Regressions found & restored (R1):** (1) `ctx.today` had collapsed to `{cats}` (a planner-recency shape) so
  Coach/Insights/Planner reads of `ctx.today.attempted` returned `undefined`/`NaN` — restored the live count-signal
  (`_deriveToday → {attempted,correct,accuracy,avgMsPerQ}`); (2) the cold-start gate had regressed to lifetime-only —
  restored the two-gate "coach, don't gate" unlock (`today.attempted < COACH_MIN_TODAY`); (3) `serialize()` had
  stopped leading with the TODAY line; (4) the cold coach computed a personalized `coldMsg` then discarded it for a
  hardcoded warm-up `say()`; (5) Explain's "Drill this" emitted a navigating `chipDeep` (the wired in-place
  `startMicroDrill` was unreachable) — restored `chipDrill`; (6) `preferredDepth` was read then ignored
  (`depth:'standard'`) — restored `depth: depth`.
- **Decision — one authoritative planner (R2):** the ADR-046 Planner is the product; **the legacy Mission was
  removed entirely**, no dormant code. Deleted `missionGet/Generate/Today`, `_missionEnvelope`, the mission-only
  `_topicList`/`_weakCats`, `plan.generate`, `action=mission`, `openMission`/`runInterview`, the dead `plan_regen`
  chip, `services/planLogic.js`, and `quantTopics.nearestCategory`/`KEYWORDS` (only `planLogic` used them). Coach
  now reads only `aiPlanner`. Parity: nothing from `planLogic` needed migrating — the Planner already computes
  progress/coverage/adherence deterministically. Removing the Mission also made `ctx.today.cats`/`weekCats` and
  `studentContext._toMillis` dead → deleted. **Verification gate:** a repo-wide `git grep` for every legacy-Mission
  symbol returns zero runtime references (comments/ADR history excepted).
- **Decision — consolidate identical helpers (R3):** the byte-identical `round`/`clamp`/`todayIso` (duplicated
  across studentContext/aiBrain/plannerEngine/readiness/signals) moved to one pure `services/aiMath.js`; importers
  rebind to it (zero behavior change). Helpers that only *look* similar stay separate **by responsibility**: the two
  `_ms` parse different key formats (toDateString vs ISO), `addDays`/`dowOf` are ISO-date-specific.
- **Consequences:** smaller, single-planner codebase; no model/rules/index change. Tests repointed — all 16
  `test-ai.js` assertions were legacy (nearestCategory + planLogic), so `npm test` now runs the authoritative
  harnesses (`planner-engine.check` 209 + `planner-brain.check` 22, incl. new today-signal/two-gate regression
  assertions). Also fixed a merge artifact: AI_INTERACTION_SYSTEM §0 said "90s cache" while the code/§7 use 6h.
  SW cache v107→v108.

## ADR-046 — QuanAI Planner: a living, adaptive, syllabus-driven study planner (2026-06-14)
- **Context:** The "Mission" (ADR-039) was a one-shot LLM blob (`{rationale, weekFocus[], phases[]}` in
  `aiMissions/{uid}`) from a 4-pill interview. It had no day-by-day schedule, no checkboxes, no replanning, and
  ignored real analytics — it even reported "no accuracy" for a student with 26 answers at 78%. The ask: a
  premium, future-proof planner that schedules from a REAL per-exam syllabus, treats the app's 12 drillable
  micro-topics as **signals not limits** (every syllabus topic is scheduled; drillable → in-app drill + real
  analytics, others → "study from your resources"), generates only the next 14 days day-by-day, and replans
  each block from measured progress — with readiness, forecast, revision, catch-up, adaptive difficulty,
  adaptive buffers, a calendar, and explainability, as ONE engine.
- **Root cause of the accuracy bug:** `studentContext.buildContext` read the Firestore `users/{uid}.stats`
  doc, which lags the live local session (`syncStats` debounced ~2s; zero-initialised at login). A stale
  `totalAttempted:0` tripped the cold-start gate, which hard-returned `accuracy:0`.
- **Decision (deterministic engine; the LLM only narrates — same doctrine as `studentContext.js`):**
  - **Bundled syllabus DB** `data/syllabus.js` (NOT Firestore): 26 exams → 5 real syllabi (CAT/MBA, Banking/
    SSC, Defense, Foundation, Generic), 104 topics, each with importance/frequency/difficulty/prereqs/revision
    cadence/est-minutes, a `drillable` link (one of 12 cats or null), and a weighted `signals[]` map. Read-heavy
    reference data, shared by client + server, dual-exported like `questions.js`. The ONLY coupling to the
    drillable universe is `signals[]`, so a 13th drillable cat plugs in with no engine change.
  - **Engine** (`signals.js` → `readiness.js` → `plannerEngine.js`, pure functions): infers per-topic readiness
    from in-app practice (never "no data" — falls back to lifetime accuracy, then neutral 0.5); a 0..100
    multi-signal Exam Readiness Score; a dynamic Completion Forecast (buffer, pace projection, "+15 min/day");
    and a 14-day scheduler with priority scoring, prereq cascade-unlock, revision interleaving, adaptive
    difficulty, adaptive buffer/mock days, and Smart Catch-up. The LLM (`planner.narrate@1`) only phrases the
    engine's `rationaleSeed`; it never schedules and is never required (deterministic fallback copy).
  - **Doc** `aiPlanner/{uid}` v2 (replaces `aiMissions`): setup answers, current 14-day `block` (per-day tasks
    with completion), persistent `topicState` (coverage/mastery/revision), `blockHistory`, readiness + forecast
    snapshots. API `action=planner` (ops get/setup/toggle/regen).
  - **Accuracy fix:** the planner request carries a `clientStats` snapshot; `studentContext` merges it as a
    NON-AUTHORITATIVE FLOOR (only ever raises a count, bypasses the 90s cache, validated/size-capped in
    `api/ai.js`), fenced to the planner path. Cold-start never blocks the planner — the engine runs on signals.
  - **Front end:** a multi-screen setup wizard in the companion (searchable exam selector, calendar date, study
    slider to 8h, days/week, prep level, preferred time) and a new `#view-planner` calendar (readiness ring,
    forecast, day cells by kind, task checkboxes, per-task explainability, drillable deep-links). Home card →
    "Open your Study Planner ✨". Coach plan-note reads `aiPlanner` (falls back to legacy `aiMissions`).
- **Key decisions / trade-offs flagged:** (1) bundled syllabus vs Firestore — chose bundled (offline, no rules
  surface, one source via `SYLLABUS_VERSION`); (2) calendar as a new router view vs the chat modal — chose the
  view (the premium UX the brief needs); (3) the client-stats floor relaxes the "no client-sent stats" rule to a
  fenced, raise-only floor for the planner path only.
- **Consequences:** New `aiPlanner` collection (own-doc read/write, same ownership rules as `aiMissions`);
  syllabus is bundled, not stored. Legacy `aiMissions` + `action=mission` kept dormant for back-compat (the Home
  card no longer opens them). gpt-4o-mini unchanged; one short narrate call per block, behind the budget breaker.
  Phased P1 (syllabus) → P2 (engine + 209-assert harness) → P3 (API/brain + accuracy fix + 19-assert harness) →
  P4 (setup wizard) → P5 (calendar) → P6 (auto catch-up) → P7 (this record + docs). SW cache v106→v107.

## ADR-045 — QuanAI production audit: exam-aware persona, freshness, plan grounding, version-honesty (2026-06-14)
- **Context:** A deep production-readiness audit of the QuanAI ecosystem (Coach, Insights, Explain, Study Planner)
  found the architecture sound but several **trust / one-mentor-identity / "feels-alive"** gaps a paying Premium
  user notices. Full findings: [AUDIT-REPORT-QUANAI.md](../../AUDIT-REPORT-QUANAI.md).
- **Decision (gpt-4o-mini unchanged — architecture, not model size):**
  - **One universal exam-aware persona:** `aiPrompts.sys(role, examName)` drops the hardcoded "CAT speed-math
    coach". QuanAI is a universal quantitative-aptitude mentor that adapts examples/priorities/pacing to the
    student's actual exam (injected, wrapped as data, never trusted as instructions). The Study-Plan interview
    gains a free-text "Other…" so any exam is honored by name, never coerced to CAT.
  - **Version-honesty / trust:** `meta.promptId` is derived from the registry version (kills `@2/@3` drift); the
    `explanations` cache is version-keyed so a prompt bump busts stale text; fallback envelopes are never cached.
  - **Freshness:** `force` is threaded through `buildContext`; finishing a drill stamps `qr_ai_dirty_at` so each AI
    surface force-refreshes once on next open (+ a manual "↻"), instead of repeating stale advice for the 6h cache.
  - **Plan grounding:** model plans are deterministically grounded (free-text topics → real drillable categories via
    the new `quantTopics.nearestCategory`) and feasibility-normalized (phase durations sum to days remaining); the
    daily drill is driven by the plan's own weekly focus, so the stated plan and the launched drill never diverge.
  - **One source of truth:** the topic vocabulary is extracted to `services/quantTopics.js` (shared by
    `studentContext` and the new `services/planLogic.js`); a drifted `CATEGORY_LABELS` copy in `aiService.js` removed.
- **Consequences:** No model/schema/rules change. New deterministic, unit-tested modules `quantTopics.js` +
  `planLogic.js`; `scripts/test-ai.js` (16 tests, `npm test`). Superseded an earlier parallel "live-context" draft
  that briefly also carried the ADR-045 label. The QuanAI Planner (ADR-046) layers on top of this audited base.

## ADR-044 — Eliminate stale-duel resurrection: export `ackResult` + durable acknowledgement ledger (2026-06-14)
- **Symptom:** A duel finished long ago reappeared on Home as "Results ready → View Results" after every app
  restart/refresh/PWA-reopen. Pressing Finish Duel cleared it for the session, but it returned on the next launch —
  forever.
- **Root cause (two layers):**
  1. **Primary bug — `DuelCore.ackResult` was never exported.** `duel-manager._finishDuel` (and `suspend`) call
     `DuelCore.ackResult(code)` to clear the server recovery mirror `users.activeDuelId`. But `ackResult` was missing
     from the `DuelCore` return object, so `DuelCore.ackResult` was `undefined` and every call threw a `TypeError`
     that `_finishDuel`'s `try/catch` **silently swallowed**. The mirror was therefore **never cleared on Finish**.
     On boot, `DuelCore.recover()` reads the still-set `activeDuelId`, fetches the (still-`complete`) duel, and the
     Home card renders "Results ready" — every launch, indefinitely.
  2. **Design fragility — acknowledgement had no durable record.** Even with the export fixed, the mirror-clear is a
     best-effort, non-awaited network call (`/api/duel?action=ackResult`) with no offline/crash-safe persistence, so a
     finish performed offline or interrupted mid-request could still leak a stale pointer.
- **Decision:** Make acknowledgement **terminal and durable**, and make recovery **incapable of resurrecting a
  finished duel**, without breaking the legitimate per-user "opponent hasn't viewed the result yet" case.
  1. **Export `ackResult`** from `DuelCore` (the one-line correctness fix).
  2. **Durable acknowledgement ledger** (`duel-core.js`): `ackResult(code)` now **synchronously** records the code in
     a bounded localStorage tombstone (`qr_duel_acked`, FIFO≤30) **before** firing the best-effort server clear. The
     tombstone survives refresh, PWA restart, browser/device restart, and SW updates (it is independent of the SW
     cache).
  3. **Recovery guard** (`DuelCore.recover`): a candidate code that is in the tombstone is **never** returned (and the
     stale server mirror is self-healed); `abandoned`/`expired` rooms are dropped too. An un-acked `complete` room
     still surfaces the passive "Results ready" card — this is **per-user** (the opponent who hasn't acked still
     sees it), exactly as the multi-device spec requires.
  4. **Finish ordering:** `_finishDuel` now acks (writes the durable tombstone) **first**, then resets local state and
     navigates — so the tombstone is guaranteed even if a later step throws. `createDuel`/`joinDuel` clear any stale
     tombstone for the (re)entered code (defensive against the astronomically-rare code reuse).
- **Why this class of bug can't recur:** the durable, on-device tombstone — not a fragile network round-trip — is the
  authority for "this device has finished this duel," and `recover()` consults it before resuming anything. A finished
  duel is now impossible to reopen after Finish, online or offline.
- **Validated:** a deterministic harness loads the real `duel-core.js` against mocked Firestore/fetch/localStorage and
  passes all 16 lifecycle scenarios (unacked-complete surfaces for opponent B; acked never resurrects; offline finish
  never resurrects + self-heals; lobby/active still resume; abandoned/expired dropped; code-reuse re-enterable; ledger
  bounded). The service worker already bypasses `/api/` + Firestore (never a state cache); cache bumped v104→v105.
- **Scope:** `main-app/js/duel-core.js` (export + ledger + guard), `main-app/js/duel-manager.js` (finish ordering +
  comment), `main-app/service-worker.js` (cache bump). No Firestore schema, rules, index, or server-endpoint change —
  the server lifecycle was already correct; the client never durably acted on it.

## ADR-043 — AI persona rename "Reflex" → "QuanAI" (2026-06-14)
- **Context:** Branding decision — the AI companion across the ecosystem is renamed from "Reflex" to **QuanAI**
  so the assistant reads as one cohesive, premium learning mentor. The prior name collided conceptually with the
  **QuantReflex** product brand and the **"Reflex Drill"** practice mode, which are unrelated and must stay.
- **Decision:** A **display-name / branding migration only.** The ADR-039 architecture already centralized the
  persona name into a single `PERSONA` constant, so the rename is surgical: flip `PERSONA = 'Reflex'` → `'QuanAI'`
  in the server source-of-truth `services/aiPrompts.js` (injected into all five system prompts via `sys()`, e.g.
  "You are QuanAI, …") and its client mirror `js/companion-ui.js` (modal badge + throttle copy). **Personality is
  unchanged** — the existing shared `sys()` voice rules already define the intended mentor voice (calm, warm,
  concise, data-grounded, never chatbot-y), and one shared helper guarantees an identical persona across Coach,
  Insights, Explain, Chat, and Study-Plan. No voice rewrites, to avoid regressing the ADR-039/040-audited AI.
- **Bug fixed alongside:** `services/aiBrain.js` cold-start coach welcome referenced `ctxEngine.PERSONA`, but
  `studentContext` never exported `PERSONA` → it rendered "I'm your coach, **undefined**." Repointed to the
  exported `prompts.PERSONA`, so onboarding now correctly reads "I'm your coach, QuanAI."
- **Explicitly NOT renamed:** the **QuantReflex** brand (manifests/package/URLs/Firebase `quant-reflex-trainer`/
  CORS/share-card), the **"Reflex Drill"/"Reflex Mode"** practice feature, `quant_reflex_*` storage keys, the
  "Reflex Master" achievement label, and generic "train your reflexes" copy.
- **Consequences:** Zero data/routing/analytics/cache impact — no Firestore field, `aiMemory`, `aiEvents` key,
  cache key, or route ever embedded the persona name (verified). Stored conversations, prompt routing, and the
  context engine are unaffected. `AI_INTERACTION_SYSTEM.md` (current-state) updated; the ADR-039 record below is
  left intact as accurate history. SW cache v103→v104 so installed PWAs pick up the new badge string.

## ADR-042 — Premium pricing update ₹299/₹499 → ₹349/₹599 + Word Problems "Coming Soon" polish (2026-06-14)
- **Context:** A pre-launch polish pass. Two staged Word Problems controls had regressed into dead UI (the Practice
  card was fully hidden via `display:none`; the Duel "Word Problems" pill was a `disabled` button whose click handler
  never fired), and Premium pricing was being raised ahead of launch. The repo has **zero live users** — all existing
  payment/account data is internal test data slated for deletion before launch — so the codebase is optimized for
  internal consistency over preserving test records.
- **Decision (pricing):** Raise the single Premium tier from **₹299/6mo, ₹499/12mo** to **₹349 (34900 paise) / 6
  months** (`premium_6m`) and **₹599 (59900 paise) / 12 months** (`premium_12m`), effective **2026-06-14**.
  Plan keys, **durations (182 / 365 days)**, the single-tier model, and all entitlement gates (`plan === 'premium'`)
  are **unchanged** — only the charged/displayed amounts move.
- **Scope:** Updated every *current-state* reference so UI ↔ backend stay perfectly synced — the charge path
  (`paymentService.PLAN_CONFIG.amountPaise`), the canonical price constant (`shared/constants/entitlements.js`),
  the revenue-accounting maps (`aiService.PREMIUM_PRICE_PAISE`, `super-admin metrics.js` — updated to 34900/59900 as
  there is no production historical data to preserve), the paywall display (`₹349`/`₹599`, ≈₹58/mo & ≈₹50/mo, "Save
  14% vs 6 months"), the in-app FAQ/About copy, and the current-state docs. Razorpay orders charge `amountPaise`
  directly; new payment docs persist the actual `amount`, so revenue analytics remain correct.
- **Decision (Word Problems polish):** Word Problems stays intentionally staged, but as a *visible, premium "Coming
  Soon" experience* rather than missing/dead UI. The Practice card is restored (always visible, "Coming soon" badge,
  tap → shared `showComingSoon` modal). The Duel pill is now live: tapping it animates a brief selection onto Word
  Problems, slides/fades back to Quick Math, then opens the same modal — Quick Math remains the selected, effective
  question type.
- **Consequences:** Historical pricing in prior ADRs / CHANGELOG / VERSIONS is left intact (accurate record of the
  ₹299/₹499 era); this ADR is the authoritative record of the ₹349/₹599 change. No schema or entitlement migration
  is required.
- **Pricing follow-up (2026-06-28): 12-month ₹599 → ₹499** (6-month ₹349 unchanged). Same discipline as above — the
  **server charge constant** moves, not just the display: `paymentService.PLAN_CONFIG.premium_12m.amountPaise`
  59900→**49900**, plus `entitlements.PRICING.PREMIUM_12M`, `aiService`/`super-admin metrics` `PREMIUM_PRICE_PAISE`,
  the paywall display (≈₹42/mo, **"Save 28%"**), the About/FAQ copy, and the current-state payment/entitlement docs.
  Verified **zero `₹599`/59900 remain** in current-state files and **no test asserts the amount**. Plan keys,
  durations, single-tier model and all gates unchanged; no migration (zero/near-zero live payment data). Payment
  track 2.3→2.4.

## ADR-041 — Launch-readiness pass for the first 1–2k users (2026-06-14)
- **Context:** Following the zero-assumption monorepo audit, the owner scoped a launch pass to the first 1,000–2,000
  users: fix correctness/UX/security/reliability NOW; treat pure hyperscale (10k+) work as documented debt. The audit
  surfaced real blockers AND several overclaims; both were reconciled against the code before acting.
- **Fixed (launch blockers):**
  - **Forgot-password** — `Auth.resetPassword` (Firebase `sendPasswordResetEmail`, account-enumeration-safe) + a
    "Forgot password?" link on the login screen (`auth.js`, `app.js`, `index.html`, `style.css`). Previously a
    locked-out user had no recovery path.
  - **Plan is server-authoritative on the client** — `firestore-sync._normalizeMonetization` no longer WRITES its
    in-memory entitlement defaults back to Firestore. The prior `docRef.set(patch)` could clobber a fresh server
    grant (rules permit client downgrade-to-free), silently dropping a user's premium. Now normalize-in-memory only.
  - **Practice-after-suspend closed server-side** — the `users/{userId}` update rule now also requires
    `resource.data.get('accountStatus','active') == 'active'`, so a suspended/archived user's still-valid token can't
    write stats/streak before it expires. Admin SDK (restore) bypasses; missing field defaults to active.
  - **Dangerous admin actions gated** — super-admin Suspend now confirms; Archive (schedules a 30-day purge) and
    Reset-progress (irreversible wipe) require a **typed** ARCHIVE / RESET confirmation; enabling the **payment** or
    **AI** kill switch (halts a core system for ALL users) requires typing `STOP PAYMENTS` / `STOP AI`. (Hard-purge
    already had type-DELETE.)
  - **Coaching broadcast** — a two-tap confirm naming the audience ("Tap again to send to ALL students →") prevents
    an accidental, un-sendable blast.
  - **Metric honesty** — the AI Cost Center subtitle now states all $ figures are token-based **estimates**; the WP
    "Coming soon" placeholder card is hidden (no placeholder experiences at launch).
- **Verified already-correct (audit overclaims):** duel `onSnapshot` IS unsubscribed on teardown (`_resetState →
  DuelCore.stopListening`); register DOES differentiate coaching-not-found (404) vs inactive (403); the displayed
  active-premium metric ALREADY subtracts expired + trials (`premiumTotal − trials − expired`); duels are strictly
  2-player (no hyperscale write risk); client writes are debounced/dirty-gated (NOT per-question).
- **AI re-validated (gpt-4o-mini only):** 0 strict-mode schema keywords; all 6 registry prompts consumed; full gate
  chain (kill-switch → premium → throttle → enforced budget); injection sanitize + delimiter-wrap on all user inputs;
  deterministic fallbacks in every catch; daily-cache + cold-start-skip kill duplicate calls. No new AI code needed.
- **Deferred as documented debt (see ROADMAP §Scale-debt) — WHY:** these only bite at 10k+ users or are non-blocking
  for the first cohort: failed-grants N+1 scan (rare admin tab); coaching roster full-text search (1000-fallback fine
  at this scale); pre-aggregating coaching dashboard metrics (5000-cap scan fine); refund webhook (zero payments yet;
  manual admin revoke covers it); field-mask on the coaching detail read; startup skeleton-first render; display-name
  edit + results per-category breakdown (features, not blockers); App Check + shared-package extraction + design-token
  unification (maintainability, not user-facing).
- **Verification:** node --check all 7 touched JS; rules 58/58; CSS 2458/2458; duel-sim 47/47; AI invariant grep clean.
  SW v101→v102. Gate: owner two-device pass on the entitlement/suspend/forgot-password flows before relying on them.
- **Consequence:** the realistic day-one blockers (recovery, entitlement authority, suspend integrity, destructive-
  action safety, broadcast safety, metric honesty) are closed; hyperscale work is deferred with rationale. Bible 2.29→2.30.

## ADR-040 — AI Ecosystem adversarial-audit remediation (2026-06-14)
- **Context:** ADR-039 passed every static check (node --check, brace balance, unit tests) but a 3-agent adversarial
  trace of the real execution path found **two production-blocking bugs neither catchable by static checks** — the AI
  *looked* built but was non-functional — plus correctness defects and ~1,500 lines of dead code.
- **P0 fixes (without these the AI never works):**
  - **Strict-mode schema breach.** Every schema in `aiPrompts.js` used `maxLength`/`minItems`/`maxItems` — keywords
    OpenAI Structured-Outputs `strict:true` **rejects with a 400**, so EVERY model call failed and silently fell
    through to its deterministic fallback (no real model output, ever). Removed all unsupported keywords; brevity is
    now enforced by prompt instructions + **server-side clipping** in `aiBrain` (`_clip`); the `validate` checks
    (computedAnswer / 4-option) are unchanged.
  - **Deep-link silent no-op.** `startDrillFromPractice` early-returns unless the Practice-view DOM is present; called
    from a Home-tab AI modal it did nothing (the core advice→action loop was dead). `companion-ui.deepLink` now calls
    `Router.showView('practice')` then launches on the next tick.
- **P1 fixes:** every "calculated-but-ignored" context field resolved — `serialize()` now feeds the model the
  `sessionImprovementPct` signal (the dormant metric the whole audit targeted), a recent-session snapshot, and the
  student's first name; the unused `mastery[].trend`/`errorPatterns.topWeakCats`/`bestStreak` were deleted. Failed LLM
  calls now bill their spent tokens (`if (e.usage) trackGptCost`). Initial-load Retry re-invokes the original feature
  (not a generic chat turn). Chat history no longer double-counts the current turn. The dead `quiz`+`progress` block
  renderers were removed (mini-challenge moved to a documented roadmap item, AI_INTERACTION_SYSTEM §10).
- **P2 fixes:** Coach now reads `aiMissions` and injects today's plan focus (a real cross-feature link, not just
  memory). Removed the broken/unwired `Companion.openWordProblem`. **Dead-code purge (~1,500 lines):** `aiService.js`
  −511 (the 3 legacy generators + study-plan fns + their private helpers), `ai-features.js` −967 (the old one-shot
  modal bodies, fetch/cache helpers, and the entire legacy study-plan wizard whose `_spPost` even called the removed
  `?action=study-plan`). The kept future-ready Word-Problems bank path (`generateWordProblems` + `_shuffleInPlace`) is
  retained deliberately.
- **Verification:** node --check all 11 files; **schema grep → zero** unsupported keywords; zero remaining callers of
  any removed function; `duel-sim` 47/47 (no regression from any edit); CSS 2454/2454; rules 58/58; deterministic core
  re-tested (new signals present). SW v100→v101.
- **Consequence:** the AI now actually produces model output and its prescriptions launch real drills — the two things
  ADR-039 silently failed to do. Bible 2.28→2.29.

## ADR-039 — AI Ecosystem: one brain, five experiences, gpt-4o-mini only (2026-06-14)
- **Context:** A grounded 3-agent audit found QuantReflex's AI loses to "paste it into ChatGPT" for one reason —
  it discards its only unfair advantage. Rich per-student signal (`dailyHistory` 90-day accuracy+speed,
  `practiceSessions` first/second-half speed + `sessionImprovementPct`, `responseTimes[200]`, `mistakes[50]`,
  `duelHistory`, per-mode splits) is stored but fed to NO prompt; every feature ran on shallow client-sent totals
  (a trust hole), one-shot paragraph dumps, no memory, no interactivity, five isolated GPT prompts. Verdict: <20%
  would return *because* of the AI. **Owner mandate:** stay 100% on **gpt-4o-mini**; make it feel far smarter via
  architecture, not model size. Build the complete foundation AND redesign all five features in one cohesive pass.
  Keep all five visible entry points (Explain/Coach/Insights/Study Plan/Word Problems) but unify into ONE brain.
- **Decision (the doctrine — make gpt-4o-mini punch above its weight):** (1) **Move the analysis out of the model.**
  A new server-authoritative **Student Context Engine** (`services/studentContext.js`) derives trends, mastery,
  error patterns and behavioral flags (burnout/plateau/careless/speed-regression/cold-start) by pure arithmetic —
  the model only writes language. (2) **The model returns small language objects; the server assembles the UI**
  block envelopes (`services/aiBrain.js`) from real data — the key reliability lever. (3) **Durable AI memory**
  (`users/{uid}.aiMemory`, server-authoritative, rules-protected) gives continuity + cross-feature awareness
  ("one brain"). (4) **Versioned prompt registry** (`services/aiPrompts.js`) + a **single-model provider seam**
  (`services/llmProvider.js`: injection sanitize + delimiter wrap, strict json_schema, retries, accumulated usage).
  (5) **Interaction**: every response ends in chips; replies → `?action=chat` turns; missions deep-link real drills
  via `startDrillFromPractice`. (6) **Cost made load-bearing**: ENFORCED daily budget breaker (`enforceAiBudget`,
  503 over cap), per-feature token ceilings, consolidated `aiDaily` cache, shared `aiContext` (6h), **cold-start
  users skip the LLM entirely**. (7) **AI Interaction Design System** (new Bible doc `AI_INTERACTION_SYSTEM.md`)
  is the canonical contract: persona "Reflex", the block vocabulary (say/card/metric/progress/steps/mission/quiz/
  timeline/celebrate/callout + chips), conversation patterns, states, personalization. One renderer
  (`js/companion-ui.js`). (8) **Analytics**: owner-write immutable `aiEvents` (`js/services/ai-analytics.js`,
  lazy-batched) rolled up by the **single shared cron** (`services/aiCron.js`, piggybacked on the duel sweep —
  Vercel Hobby = 1 cron, fully guarded) into `systemMetrics/ai_engagement_{date}`.
- **Feature roles (no overlap):** Explain = interactive concept learning; Coach = daily mentor / accountability
  (flag-driven prescription + deep-link); Insights = weakness discovery → **actionable missions, not reports**;
  Study Plan = **living Mission** (chip interview → analytics inference → daily action → weekly adaptation,
  replaces the static `aiStudyPlans` timeline → `aiMissions`); Word Problems = context-aware generation targeting
  `knownWeakConcepts` (future-ready, kept behind the coming-soon gate).
- **Single model:** gpt-4o-mini only. A future stronger-model candidate (deep Mission generation / weekly review)
  is documented in `AI_INTERACTION_SYSTEM.md §10` and is a separate future ADR — NOT implemented.
- **Spark/Vercel:** all server logic in the existing `api/ai.js` (new modules live in `services/`, bundled — ZERO
  new functions, still ≤12). New collections: `aiContext`, `aiDaily`, `aiMissions` (server-only, default-deny),
  `users/{uid}.aiMemory` (client-write denied), `users/{uid}/aiEvents` (owner create-only, immutable).
- **Verification:** `node --check` all 11 touched/new JS; deterministic core unit-tested (context serialize ≤1400
  chars, weak-pick, prompt schemas valid); CSS balanced; rules balanced + aiMemory/aiEvents tested; function count
  unchanged. Gate: owner on-device end-to-end (every feature interactive, personalized to real data, remembers,
  deep-links a real drill) before push.
- **Consequence:** Five features become one intelligent tutor that knows the student — a moat ChatGPT structurally
  can't have — on the cheapest model, with hard cost ceilings and an engagement-attribution loop.

## ADR-038 — Math Duel production polish: PWA-only lock, premium result/share/answering, legacy-CSS purge (2026-06-14)
- **Context:** With the lifecycle finally working (ADR-037), the owner asked for production-grade *feel* on par with
  Practice/Drill/Test: duels were to be **playable only inside the installed PWA** (browser play was both broken and
  unwanted), the result screen had to be **truly** (perceptually) centered with **all** data kept, the share image
  needed to be a dedicated premium card (not a screenshot), and the shared answering screen needed a calmer spacing
  rhythm + one skip-button design across every mode. Plus a final dead-code/listener/lifecycle audit.
- **Decision:**
  - **PWA-only lock (access policy).** `js/duel-manager.js` gains `_pwaOk()` (mirrors `_premiumOk`; reads
    `body.pwa-mode`/`.web-mode` with a `matchMedia('(display-mode: standalone)')` + `navigator.standalone` fallback).
    **Every** duel entry is gated BEFORE premium — `openSetup`, `_openJoinWith` (covers Create / Join / `?duel=CODE`
    deep-link), `_resumeActiveDuel`; recovery routing (`_routeRecovered`) in a browser surfaces only the passive Home
    card, never auto-enters. In a browser the entry points render `DuelUI.renderInstallGate` — a premium gate
    (⚔️, "Math Duels live in the app", Install / Not-now) reusing the modal shell; Install calls
    `window._deferredPrompt.prompt()` when available, else shows add-to-home guidance. No bypass. The Home duel card
    stays visible (discoverability); tapping it in a browser shows the gate.
  - **Result screen — perceptually centered, full data.** Both player columns carry a **fixed-height crown slot**
    (👑 on the winner, empty on the loser) so the columns are exactly equal height (kills the perceived tilt); the
    winner highlight is a **subtle avatar ring**, not an extra text line; scores are **restrained** (1.9rem). The
    stats card is **three perfectly equal rows** (`.rs-row`, each its own symmetric `1fr·auto·1fr` grid, equal
    min-height, hairline dividers): Correct · Accuracy · Speed. Win-reason is smaller/lighter. A **latent bug** was
    fixed: a dead V1 `.duel-result-actions { flex-direction:column }` was the only direction declaration and was
    silently **stacking** the live Share/Finish row — removing it restores the intended side-by-side (`flex 1 : 1.5`).
  - **Share image — premium esports card** (`share-service._generateDuelCard`, full rewrite). Brand header → winner
    banner → two **frosted player blocks** each with a gradient avatar (initial), name, big score, **accuracy +
    speed** → centered VS badge, over a dark gradient with accent glows + a **gold ring/glow on the winner**. Fixes a
    real defect: the old code passed a 7th "fill" arg to `_roundRect` (which only builds a path) so the score boxes
    **never rendered**. `js/duel-ui.js` now passes `mySpeed`/`opSpeed`/`total` into the share `data`.
  - **Answering screen (shared engine — all modes).** The fixed-shell vars give a calmer rhythm:
    `--drill-card-gap` (larger card→Submit) + `--drill-submit-gap` (Submit lifts OFF the numpad); the **duel** card
    `bottom` now includes `--drill-submit-gap` too, so Practice/Focus/Drills/Tests/**Duels** share an identical
    card → Submit → numpad cadence. **One** skip design everywhere: `.has-skip .skip-btn { flex: 0 0 33% }` + clean
    secondary fill, Submit takes the remaining ~67%, equal height. Duel header is opponent-chip ~66% (left) / Exit
    ~33% (right). Countdown overlay upgraded (z-index 1000 + blur) and the digit now **pops** each tick.
  - **Legacy-CSS purge.** Removed ~495 lines of dead/duplicated duel CSS: the twice-duplicated "Math Duel V2 —
    Countdown Overlay / Premium Results" block (`.duel-results-card-v2`, `-comparison-grid`, `-big-score`,
    `-stat-row`, `duelCrownBounce`…), the dead "Active Duel Mini Card", and the dead V1 results block
    (`.duel-results-card`, `.duel-result-title`, `-comparison`, `-player`, `duelCelebrate`, `.mode-card-duel`,
    `.duel-question-area`). The duplicate `.duel-result-crown { animation: duelCrownBounce }` had also been making the
    new crown slot bounce. Kept the genuinely-live `#duelResults` host + `.duel-result-score` + small-phone responsive
    rule. Zero JS refs to any removed selector (grep-verified).
- **Verification:** `node --check` all touched JS (incl. SW); CSS braces balanced (2344/2344, −114 pairs);
  `duel-sim` 47/47; dead-selector grep clean. SW v98→v99 (network-first JS/CSS picks up the deploy). Gate: owner
  two-device full lifecycle on v99 (browser → install gate, no play; PWA → create→join→solve on the roomier answering
  screen→centered result→premium Share→Finish→both idle→repeat; no stale rooms/listeners/console errors).
- **Consequence:** Duels are installed-app-only with a premium gate; the result screen reads as one centered
  celebration with all data; the share card is a shareable esports artifact; the answering screen breathes uniformly;
  ~495 lines of legacy CSS and a silent stacking bug are gone. No schema/rules/index change (additive client + CSS).

## ADR-037 — Math Duel P0 stabilization: guest-no-questions, Finish Duel, no result-trap, Rematch removed (2026-06-14)
- **Context:** A two-device test still failed: the **guest received no questions** (host fine), the **Done** control
  did nothing / looked like text, completed duels **trapped the user on the result screen on reopen**, **Rematch was
  broken**, and the result screen felt like a dashboard with a **ghost Home card**.
- **Decision:**
  - **Guest-no-questions (P0) — a regression from ADR-036.** ADR-036's solving-exit-forfeit-03 fix made
    `_startSolving` gate `_engine.start()` on `setPresence('solving')` resolving. On the guest's slower link that
    Firestore write could be slow/hang, so the engine never started → blank screen. Fix: **start the engine
    immediately**; fire `setPresence` in parallel (the first-answer rule race stays covered by `writeAnswer`'s
    retry-on-`permission-denied`). Also **lock the question set** into `_solvePrompts` at the active-transition so a
    snapshot can never clobber `_duel.prompts`, preserve prompts in `_onSnapshot`, and add a 1.2s start watchdog.
  - **Finish Duel (replaces Done).** A real prominent primary button with FULL cleanup: `ackResult` → `_resetState`
    (listener/timers/poll/recover cleared; `_code`/`_duel`/`_solvePrompts` nulled; phase idle) → Home card idle →
    Home. The user can immediately create/join a new duel.
  - **No result-trap.** `_routeRecovered` no longer auto-opens results for a completed duel on reopen — it shows the
    passive "Results ready" Home card and stays on Home; results open only on intentional tap (`_resumeActiveDuel`)
    or when the duel just completed. The `_onSnapshot` 'complete' branch renders ONCE (no rebind mid-click). Leaving
    results via the nav acks + resets (no ghost card).
  - **Rematch removed** entirely (button + handler + both manager callbacks; no dead code) — to be reintroduced later.
  - **Result redesign:** winner banner → player comparison → ONE key metric (accuracy · speed) → one honest sentence
    → Share + Finish Duel. Removed the 4-tile grid + the text-link Done.
- **Verification:** `node --check` all; `duel-sim` 47/47; SW v96→v97. Gate: owner two-device full-lifecycle pass
  (both receive the same questions → solve → finish → Finish Duel → both idle on Home → both can immediately re-create
  → reopen shows no hijack/ghost).
- **Consequence:** Both players can actually play; results no longer trap or ghost; the result screen is a clean
  celebration with a single decisive exit.

## ADR-036 — Math Duel release-blocking audit + remediation (2026-06-14)
- **Context:** Before opening the Duel to real users, a 20-phase adversarial audit (12 dimension-auditors over the
  real code, every finding independently verified, refute-by-default) surfaced **68 issues — 2 critical · 7 high ·
  24 medium · 35 low**. The keystone critical explained every prior "host doesn't see guest / opponent chip frozen /
  waiting stalls" report.
- **Decision (root cause + fixes; all duel-scoped — Practice engine + generator untouched):**
  - **KEYSTONE (realtime-sync-01, C):** `Router.showView('duel')` → `_cleanupOverlays()` tore down the live duel
    Firestore listener on EVERY internal re-render (the render fns run inside `_onSnapshot`), so realtime sync died
    after one snapshot. Fix: `_cleanupOverlays(targetViewId)` suspends the duel ONLY when navigating AWAY
    (`!== 'duel'`); a real nav-away calls `DuelManager.suspend()` (stops listener + lobby/deadline/recover timers,
    keeps state for the Home "Resume" card).
  - **Back button (solving-exit-forfeit-01, C):** the solving runner never set the JS session flag, so hardware Back
    silently left an un-submitted duel. Fix: `DuelManager.handleBackNav()` + a router popstate hook → Submit & Leave
    modal (solving) / absorb (countdown).
  - **Highs:** nav-away timer leak → `suspend()`; no guest-leave path → new server **`leaveLobby`** action;
    first-answer rule race → `await setPresence('solving')` + `writeAnswer` retry-on-denied; one-shot deadline poll →
    resilient recurring poll; **post-deadline answer-write bypass** → rule rejects writes past `totalDeadline`;
    countdown keepalive finalizing a 0-answer loss → beacon `solving`-only; multi-device reopen force-finish → a
    presence-freshness gate.
  - **Mediums/lows:** word-problem **top-up** (never a partial set) + blank-prompt skip; `_start` opponent-liveness +
    a lobby heartbeat; clamped `clientMs`; forged-index ignored in `_grade`; presence can't arm `solving` during
    lobby (rule); single-flight countdown; **recursive** cron delete (no orphaned subcollections); honest result
    copy; canonical SW deep-link cache key; touch targets / dark-mode contrast / notch safe-area.
  - **Accepted-risks (documented, NOT faked):** the per-question timer is a client convenience — the server
    `totalDeadline` is the rule-enforced authority; `presence.lastSeenAt` is client-written (a spoof only
    self-disadvantages and can't forge a result); `duelHistory` is a forward-looking write for the planned History
    view (its accuracy denominator + no_contest coverage were corrected).
- **Verification:** `main-app/scripts/duel-sim.js` drives the REAL server scoring/state-machine functions
  (`_grade`/`_decideWinner`/`_budgets`/`_isCorrect`/`_validConfig`) + `generateMultiTopic` across every scenario
  (honest speed, no fake winner, no-contest, forged-index, clamp, string answers, all timer modes, end-to-end) —
  **47/47**. Rules deployed to cloud.firestore; code on Vercel.
- **Consequence:** The Duel is server-authoritative and reliable end-to-end — realtime sync is instant again, and
  there is no un-submitted-leave / lockout / fake-result / timer-bypass path. A Node simulation now guards the
  scoring invariants.

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
