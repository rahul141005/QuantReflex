# QuantReflex Changelog

All notable code + documentation changes. Format: dated entries, newest first. Each code change references its audit finding / ADR ID and the affected file:line, lists the documentation kept in sync, and (per [GOVERNANCE.md](GOVERNANCE.md)) any version bump.

Source-of-truth docs: [README.md](README.md) · [TECHNICAL_BIBLE.md](TECHNICAL_BIBLE.md) · [FIRESTORE_BLUEPRINT.md](FIRESTORE_BLUEPRINT.md) · [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md) · [PAYMENT_ARCHITECTURE.md](PAYMENT_ARCHITECTURE.md) · [VERSIONS.md](VERSIONS.md) · [DECISION_LOG.md](DECISION_LOG.md)

---

## 2026-07-06 — Reporting: P0 taxonomy-load fix + premium bottom-sheet redesign (ADR-099)

The owner's screenshots showed the "Report a problem" sheet rendering empty. Root cause was a **production load
bug**, not weak design: the modal's taxonomy was loaded from `../shared/constants/report-types.js`, but `shared/`
sits outside the main-app deploy root, so the SPA catch-all rewrite served index.html → SyntaxError →
`window.ReportTypes` undefined → empty grid (reporting unusable since ADR-096). The same bug silently disabled
`AuthValidators`. This fixes the P0 by serving both from the app origin, then redesigns the whole experience as a
companion-style bottom sheet. No new infra; no rules/index change. Full detail in ADR-099.

```
### fix(P0): serve the report taxonomy + auth-validators from the main-app origin
- js/ui/report-taxonomy.js (NEW): browser copy of the taxonomy (window.ReportTypes), same-origin so it can't 404.
- js/utils/auth-validators.js (NEW): local copy; restores client-side email/password validation.
- index.html: replaced the two broken ../shared/* <script> tags with the local paths; QR_APP_VERSION v216→v217.
- js/ui/report-modal.js: _types()/_groups() gain a built-in defensive fallback (never render an empty grid).
- service-worker.js: ASSETS += report-taxonomy.js + utils/auth-validators.js; APP_VERSION v216→v217.
### feat(taxonomy): enriched, index-safe report types (ADR-099)
- shared/constants/report-types.js + js/ui/report-taxonomy.js + api/_lib/report-schema.js: question family →
  answer_wrong/solution_wrong/explanation_wrong/options_wrong/formula_wrong/typo/visual/unclear/
  difficulty_mismatch/wrong_topic/duplicate/question_other (drops question_wrong/formatting); app adds ui_issue;
  ai_issue moves to its own 'ai' group with a new reason set. Each type carries an icon + one-line helper.
- Type values are index-agnostic — the (classification.type, createdAtMs) index covers them; no new index/rules.
- shared/schemas/report-schema.json: classification.type enum updated. super-admin views/reports.js: TYPE_LABELS
  cover every new type (legacy question_wrong/formatting retained so old rows still label).
- api/_lib/report-schema.js: a question report filed from Settings (no attached question) now requires a note.
### feat(ui): report modal → premium companion-style bottom sheet
- js/ui/report-modal.js: full rewrite — .report-sheet-overlay/.report-sheet with grabber, drag-to-dismiss, rise,
  responsive→centred ≥600px. Settings = guided category chooser → scoped reason grid; in-drill = contextual
  question header (auto chips: Q N/count · topic · difficulty · session type + preview) + reason grid + escape;
  AI = purpose-built QuanAI reason grid + read-only "what's attached" (no provider/model). QuanAI-voice wording,
  reassurance + success/offline/retry states; typed-input restore on terminal error.
- css/style.css: replaced the .report-modal block with the .report-sheet system (dark/playful/reduced-motion/
  safe-area/tablet); added a 'flag' qr-ico mask.
- js/drill-engine.js: the in-drill ⚑ renders via qrIco('flag','⚑').
### test(reporting): 4-surface lockstep + rebuilt browser sweep
- scripts/report.check.js → 518 assertions (browser↔shared↔server↔super-admin lockstep, new-taxonomy validity,
  Settings-question substance guard, legacy-id removal).
- Playwright sweep → 54 (loads via the LOCAL taxonomy path — proves the grid renders; Settings/drill/AI flows +
  payloads; QuanAI no-leak; offline queue; defensive fallback; Escape/backdrop; responsive centring; z-index).
```
Docs: DECISION_LOG ADR-099; FIRESTORE_BLUEPRINT (enriched classification.type list + browser taxonomy is main-app-local);
VERSIONS (Bible 2.119→2.120 / Firestore 2.26→2.27 — type value-set change). SW v216→v217.

## 2026-07-06 — QuanAI identity: no LLM/provider leakage in reporting + final-pass hardening (ADR-098)

Final independent verification pass. Enforced the QuanAI product-identity requirement (users must never learn the
underlying LLM) — which ADR-097 had violated by surfacing the raw model/provider client-side — and fixed the
low-severity items two independent re-audits surfaced. No new infra; Vercel-Hobby intact. Full detail in ADR-098.

```
### fix(identity): strip LLM/provider from every client-reachable path (QuanAI)
- services/aiBrain.js: explain envelope meta no longer carries model/provider (reverted the ADR-097 usedModel
  plumbing + cache model write); model stays only in server-side recordAiRequest/aiRequests telemetry.
- js/companion-ui.js: report ai bundle = { explanation, promptId } (dropped model + provider); explainCtx drops model.
- js/ui/report-modal.js: banner + tech preview show the QuanAI explanation version (promptId), never a model;
  _submit whitelists the outgoing ai bundle to {explanation, promptId} so no caller can leak model/provider into
  the POST body or offline queue.
- api/_lib/report-schema.js: sanitizeAi keeps only { explanation, promptId } — a client-sent model/provider is ignored.
- shared/schemas/report-schema.json + super-admin views/reports.js: ai = {explanation, promptId}; admin shows
  "Explanation version", not Model/Provider.
- scrubbed provider names from 3 view-source-reachable client-JS comments (companion-ui, ai-features,
  question-bank-service).
### fix(reporting): final-pass audit items
- js/duel-manager.js: duel-review explanation now passes reportCtx so a report from it carries the item
  (AI-explanation reporting complete everywhere explanations appear).
- super-admin api/admin/reports.js: "oldest open" analytics spans all open statuses (matches openTotal); openCount
  adjust logs on failure instead of swallowing.
- super-admin js/views/reports.js: added the 'archived' filter chip.
- api/_lib/report-schema.js: _capScalar caps answer/selectedAnswer/options so a crafted oversized value can't
  defeat the question byte-cap.
- js/ui/report-modal.js: restores typed text + sub-reason + rating on a terminal-error re-render (no lost input).
### chore + test
- index.html + service-worker.js: v215 → v216 (QR_APP_VERSION in lockstep).
- scripts/report.check.js: 254 assertions (QuanAI no-leak guards + super-admin VIEW label-map lockstep). Playwright
  sweep: 52 assertions (tech preview + POST body + offline localStorage carry no gpt/openai; promptId retained).
  All prior suites green.
```

## 2026-07-06 — AI-explanation reporting + reporting-system adversarial hardening (ADR-097)

A code-first adversarial re-verification of ADR-096. Added the missing **"Report this explanation"** path from AI
explanations (auto-capturing the question snapshot + full explanation text + model + prompt version) and fixed the
defects the audit surfaced — headlined by a data-loss bug in the Super-Admin list pagination. Still no email / no
attachments. Full detail in ADR-097.

```
### feat(reporting): AI-explanation reporting
- services/aiBrain.js: explainBase() envelope meta now includes model (+ provider); model persisted in the
  explanation cache so cache hits expose it too. (env.meta.promptId already carried the prompt version.)
- js/ai-features.js + js/drill-engine.js: showExplanationModal forwards a 4th reportCtx {question, session} from
  the drill explain button (live question + session snapshot).
- js/companion-ui.js: ⚑ "Report this explanation" button in the explain sheet header (feature-gated); captures
  promptId/model/lastExplanation and opens ReportModal(source:'ai_explain', question, session, ai:{…}).
- js/ui/report-modal.js: source 'ai_explain' pre-scopes to ai_issue, renders form directly (Back closes), 2-tap
  (no free text required), attaches the ai bundle + question snapshot; tech preview shows model/prompt/snippet.
- api/_lib/report-schema.js: sanitizeAi() (explanation≤8000, promptId/model/provider); source 'ai_explain' accepted;
  question snapshot captured for ai_explain; api/report.js stores top-level `ai`; shared/schemas/report-schema.json
  documents `ai` + the new source. super-admin api/admin/reports.js `_shapeRow` returns `ai`; js/views/reports.js
  renders an AI explanation block (model · provider · prompt version · full text).
- css/style.css: .report-modal-overlay z-index 700 (above the companion sheet's 600) + .companion-report button.
### fix(reporting): adversarial audit findings
- super-admin api/admin/reports.js (HIGH): list pagination no longer skips matching reports under an in-memory
  refinement — cursor is the last DISPLAYED row (lossless re-scan), hasMore accounts for truncated matches.
- api/_lib/report-schema.js: _str preserves \t\n\r (multi-line free text no longer collapsed); rating-only feedback
  accepted (present rating counts as content); report.js dedupe now runs BEFORE the rate-limit (idempotent retries
  never spuriously 429'd); dropped dead `reasonKey`.
- super-admin js/views/reports.js: Actions tab renders the internal-note thread; page-local-search banner persists
  across mutations (state-backed).
- js/services/report-queue.js: a missing token is a transient failure (kept + retried), not a fatal drop.
- js/ui/report-modal.js: star-rating state cleared on type switch.
### chore + test
- index.html + service-worker.js: v214 → v215 (QR_APP_VERSION in lockstep).
- scripts/report.check.js: 226 assertions (adds ai-bundle sanitize, ai_explain source + 2-tap, rating-only, newline
  preservation, tri-surface enum lockstep incl. super-admin). Playwright browser sweep: 47 assertions (adds AI-report
  payload capture, z-index layering, rating-only, multi-line). All prior suites green.
```

## 2026-07-06 — Ultimate Reporting System (ADR-096)

Complete user-reporting ecosystem across the main app and the Super-Admin app: a premium "Report a Problem" modal
(Settings + a fast in-drill ⚑ button that auto-scopes to the current question), a server-authoritative Firestore
model, an offline-safe queue, and a full Super-Admin Reports triage section. Reports are **self-contained in
Firestore with the Super-Admin dashboard as the source of truth — NO email / notification service**, and **NO
screenshots in v1** (maximized auto-context replaces them). Both are clean, migration-free future seams. Full
detail in ADR-096.

```
### feat(reporting): shared schema + enums + rules + indexes
- shared/constants/report-types.js: canonical 16-type enum set (+ statuses, priorities, per-type sub-reasons, caps,
  rate-limit) — dual-exported for the browser modal + the check.
- shared/schemas/report-schema.json: draft-07 schema documenting reports/{id} (context/question maximized;
  attachments deliberately omitted with a documented seam).
- firestore/rules/firestore.rules: reports/{id} + questionReports/{signature} all-deny (Admin-SDK only).
- firestore/indexes/firestore.indexes.json: 7 reports composites (status / status+priority / type / priority /
  assignedTo / reporter.uid / questionSignature × createdAtMs).
### feat(reporting): main-app backend (no email, no attachments)
- main-app/api/report.js: withAuth ?action=create — validate, per-uid rate-limit (15/hr, 60/day) + dedupe, assemble
  the doc server-side (never trusts body uid/plan/priority), write reports/{id} + transactional questionReports
  aggregate. One comment marks the future notify seam (implemented as nothing).
- main-app/api/_lib/report-schema.js: pure inline enum copy + validation/sanitizers/signature/rate-limit/dedupe
  (lockstep with the shared constants, tested by report.check.js).
- main-app/vercel.json: api/report.js maxDuration.
### feat(reporting): main-app client
- js/services/report-context.js: MAXIMIZED auto-context collector + question snapshot.
- js/services/report-queue.js: offline-safe localStorage queue (qr_report_queue) w/ backoff + clientKey idempotency.
- js/ui/report-modal.js: premium multi-step glass modal (type picker → fields → tech-details preview → success);
  no file input; focus-trap/Escape/aria.
- js/app.js: error ring-buffer (window.onerror + unhandledrejection → getRecentErrors) for the auto-context.
- js/settings.js + index.html: "Report a Problem" Feedback card (#openReportProblem).
- js/drill-engine.js: #drillReportBtn (⚑) in both render paths; live question + session snapshot; overlay/duel guards.
- css/style.css: report modal + in-drill button styling (dark/playful/phone).
- index.html: window.QR_APP_VERSION='v214' + report module <script> tags; service-worker.js v213→v214 + ASSETS.
### feat(reporting): Super-Admin Reports section
- super-admin-app/api/admin/reports.js: withAdminAuth list/details/analytics + update-status/assign/priority/label/
  note/merge-duplicate; maintains questionReports.openCount; every mutation writes an auditLogs row (category:'report').
- js/services/api.js: getReports/getReportDetails/getReportsAnalytics + mutation methods.
- js/views/reports.js: SplitView dashboard (stat strip + top-questions) + master list (chips/priority/search/Load more)
  + detail tabs Overview/Question/Context/History/Actions.
- index.html + js/app.js: Reports nav item + #view-reports + DOMAINS.reports.
- js/views/command-center.js: DRILL.reports_pending='#reports'; api/admin/system.js: reports_pending alert.
- css/admin-style.css: badge-open/badge-progress, priority pills, report dashboard/detail styling.
### test(reporting)
- main-app/scripts/report.check.js: 212 assertions (enum lockstep, validation, signature, rate-limit/dedupe,
  sanitizers) wired into npm test. Playwright browser sweep (35 assertions): both entry points, payload capture
  (maximized context + question snapshot, no forged uid/plan), offline queue, a11y — all green. All prior suites green.
```

## 2026-07-03 — RC verification: pause regression fix + backlog execution (ADR-095)

Release-candidate verification of the ADR-094 fixes (cross-checked by an independent adversarial review). C1 + H2
verified correct; one regression fixed; the remaining backlog executed. Full detail in ADR-095.

```
### fix(regression): keyboard entry no longer fires under the pause overlay
- js/ui/numpad.js: the ADR-094 keydown handler bailed only on !_numpadInput; pause doesn't null it, so Enter graded
  the frozen answer / could advance under the overlay. Now also bails when #drillPauseOverlay is present.
### fix(quant): H3-extended — hard-tier de-dilution across ~14 more categories
- js/questions.js: squares, simple-interest, profit-loss, compound-interest, ages, mixtures, number-properties,
  progressions, surface-area, trigonometry, quadratic, number-series, simplification, probability hard tiers no
  longer re-include their easy/medium archetypes; time-and-work gains a real hard archetype (inverseTogether).
  PRIMARY.hard repointed for squares/simple-interest/ages/time-and-work off the easy keys they injected.
- scripts/quant-engine.check.js: TIER_KEYS updated in lockstep + inverseTogether recompute; the "no downgrade" guard
  is now meaningful. P3: value-based recompute added for string archetypes (fractions/ratios/mixtures) — +857 checks.
### fix(ui/a11y/robustness): backlog batch
- js/views/stats-view.js: fingerprint includes entitlement → premium cards unlock on in-session upgrade (P2).
- js/views/home-view.js + css/style.css: daily-goal ring uses theme-aware --qr-accent/--qr-success (P4).
- css/style.css: .category-btn 44px + no selection reflow; dark --qr-text-mut ≥AA contrast (P5).
- js/firestore-sync.js: removed dead duplicate updateCoachingId; js/drill-engine.js: accuracy zero-guard (P5).
- js/controllers/practice-modes.js: limit banner via addEventListener + getDailyQuestionLimit() (P5).
- service-worker.js: network-first JS/CSS timeout (lie-fi → cache); CACHE_NAME derived from APP_VERSION; v210→v211 (P5/P6).
- js/state/store.js: implemented the documented legacy→canonical localStorage read-time migration (P7).
```

Docs: DECISION_LOG (ADR-095) · VERSIONS (Bible bump). All 26 suites green (quant 0 recompute mismatches).

### fix(regression, follow-up): keyboard guard was incomplete — also yield under the exit-session modal
- js/ui/numpad.js: the F1 guard only checked #drillPauseOverlay; the same Enter-grades-frozen-answer / advance-under-
  overlay bypass existed under the exit-session dialog (body.modal-open, reachable mid-question). Guard now bails under
  the pause overlay OR any body.modal-open modal. service-worker.js v211→v212. (found by independent RC re-review)
### fix(a11y): MCQ options also inert under a blocking overlay
- js/drill-engine.js: option <button>s stay focusable under the pause/exit overlay, so keyboard Enter/Space (a
  synthetic click) could grade while paused / with the exit dialog open. Added a shared _blockedByOverlay() guard to
  both MCQ click handlers; normal mouse/tap selection unaffected. Now no answer grades under any overlay. SW v212→v213.

## 2026-07-03 — Full-repository audit: submission bug + Critical/High remediation (ADR-094)

Complete first-principles audit (three independent investigations, each finding cross-checked against the code). The
reported P0 ("cannot submit answers in any drill") did NOT reproduce on the mainline pipeline; one real
submission-blocking defect in review mode was found and fixed, plus the High-severity quality gaps. Full findings,
rationale and the Medium/Low backlog in ADR-094.

```
### fix(critical): review-mode re-queue no longer strips MCQ options
- js/drill-engine.js: a wrong MCQ mistake was re-queued as {question,answer,category,subtype} (no options), so its
  2nd encounter rendered as a numeric numpad for a text answer — un-answerable. Now re-queues Object.assign({},q).
### feat(a11y): physical-keyboard numeric answer entry
- js/ui/numpad.js: global keydown mirrors the on-screen numpad (same validateKeystroke, 15-char cap, submit cb),
  auto-scoped by _numpadInput (inert on MCQ + post-answer), gated to the format's key set, never focus()es. Digits
  and symbols type into the readonly answer field; Enter submits; Backspace deletes. Desktop/switch users can answer.
### fix(content): authored-LR difficulty honesty + depth (ADR-094 H2)
- js/lr-authored-engine.js: tier-aware _tierPool (prefer exact tier → nearest EASIER → harder) replaces the
  whole-pool dump that let Easy silently serve Hard.
- data/lr-authored/{statement,cause,course,decision}.js: +15 approved items (77→92); Statement/Cause/Course now
  4 easy / 5 hard, Decision 4 easy (was 1). New Course answer keys diversified. All pass lr-authored.check.
### fix(quant): hard-tier de-dilution (ADR-094 H3 — difficulty earned, not just bigger numbers)
- js/questions.js: percentages hard = pctChange/successive/netTrap (drops the medium direct/reverse/whatPct);
  ratios hard drops the easy 'divide'; averages hard = weighted/newMember (drops mean/missing); multiplication moves
  the non-scaling mentalSquare down to medium. _PCT_PRIMARY.hard repointed to the always-clean netTrap.
- scripts/quant-engine.check.js: TIER_KEYS updated in lockstep — the "no earned-tier downgrade" guard is now
  meaningful (previously toothless) and green over 112,990 assertions, 0 recompute mismatches.
### chore(SW)
- service-worker.js: qr-cache v209→v210.
```

Docs: DECISION_LOG (ADR-094) · VERSIONS (Bible bump). All 26 check suites green.

## 2026-07-03 — Visual question ecosystem redesign + Quant recalibration (ADR-093)

Product-level rebuild of visual reasoning, a presentation stage for visual questions, and a difficulty/wording
audit of all 36 Quant families (full rationale + archetype tables in ADR-093). Code changes:

```
### feat(figures): LRFigures v2 — exam-grade primitive vocabulary
- js/ui/lr-figures.js: + shape (10 forms, none/solid/half fills w/ unique clipPath ids), compo (anchored inner
  elements, 8-anchor cycle), seg (0..3 lattice line figures), paper (folds/holes/unfolded), net (cross cube net),
  die3 (three visible faces), grid3 (3×3 matrix); flip/rot on all new kinds; describe() for each; dark-mode classes.
### feat(engine): lr-visual-engine v2 — 10 categories, ~34 verified archetypes
- js/lr-visual-engine.js: mirror/water rebuilt (glyph + figure + cluster + CHIRAL seg tiers); dice + net-folding
  + two-position deduction; painted cube + at-least-one + cuboid; series/analogy on compositions with double-rule
  hard tiers; NEW lr-odd-fig, lr-paper, lr-pattern, lr-embedded (segment-subset proofs). Explanations on every
  question; anti-repetition rings; trap-informed distractors; spec-distinct options guaranteed.
- Registration: js/ui/category-picker.js Visual Reasoning tier → 10 keys; scoring-service auto-tips for the four
  new categories (+ sharper fseries/fanalogy tips); questions.js NEEDS_CONTEXT excludes new visual categories
  from mistake-review; data/knowledge/lr.js non-verbal chapter refreshed (nets, two-position dice, paper folding).
### feat(presentation): the figure is the hero
- js/drill-engine.js: question-text-compact for figure/chart/long stems (single + set mode); .q-figure-stage wrap;
  A–D letter badges + descriptive aria on picture options; teach panel shows "Option C" for figure MCQs.
- css/style.css: stage panel, compact stem, option letter badges, new lr-fig-* classes (seg/paper/net/facelbl/
  grid) with dark variants; figure-option grid capped at 420px and letter-badged.
- js/di-engine.js: rotating natural lead-ins replace the fixed "Study the chart and answer:" prefix.
### feat(quant): recalibration + wording (ADR-093 rules: numeric token order preserved; no digits in phrasing)
- js/questions.js: cubes hard → cubeRoot5 + diffCubes (plain big-number direct removed); TSD medium + unitConvert,
  hard → avgSpeed/relativeSpeed/trainCrossing; fractions hard → fracOfFrac + addFrac (lowest-terms guard);
  pipes hard → inverseFill + leakEmpty; PnC hard → circular + atLeastOne; quadratic hard + rootRelation;
  series hard + squaresSeries + alternating; averages hard PRIMARY → weighted build. Wording variety added to
  area/volume/SI/CI/surface-area/geometry/progressions (scenario nouns, named actors via _one()).
### chore(checks + SW)
- scripts/lr-figures.check.js REWRITTEN: renderer contracts for every primitive + 10×3×150 engine sweep with
  fully independent recompute (own lattice/anchor math, fold re-unfolding, die-pair deduction, subset tests).
- scripts/quant-engine.check.js: TIER_KEYS recalibrated + recompute branches for 12 new archetypes;
  js/answer-format.js: fractions:addFrac → '/'.
- service-worker.js: qr-cache v207→v208.
### fix(final audit pass — repetition metrics + rendered-output review over 200 samples/category-tier)
- js/lr-visual-engine.js: fanalogy medium `reflect` archetype was DEAD (0/200 — its rotation distractor
  `_rotAt(atC, 2)` always coincided with the corner-anchor reflection, so `_distinct` never passed and the
  builder silently fell through) → distractor now `_rotAt(atC, 4)`; generates ~40% of medium. Stem phrasing
  variants (pick pools) added to fseries/fanalogy/odd-fig/pattern. Cube variety: medium n∈{4,6},
  hard paint5 n∈{5,7}. Paper hole positions widened to a 3-value pool per axis. Embedded distractor hosts
  built via `_extendHost(..., forbid)` so they can never re-absorb the removed motif segments.
- js/ui/lr-figures.js + css/style.css: marker dots on solid/half-filled shapes were invisible (same fill) →
  knockout dots (`lr-fig-dotknock`: contrasting fill + stroke, dark-mode variant) when the outer is shaded.
- js/drill-engine.js: AI-explain prompt for figure MCQs now appends `LRFigures.describe()` of each lettered
  option, grounding explanations in what the student actually sees.
- service-worker.js: qr-cache v208→v209.
```

Docs: DECISION_LOG (ADR-093) · VERSIONS (Bible 2.114, Arch 2.60).

## 2026-07-03 — Learn reimagined: study spine, guided revision, one reference home (ADR-092)

First-principles redesign of the Learn tab around its three jobs — Study, Revise, Look up (full reasoning +
owner decisions in ADR-092). Code changes:

```
### feat(hub): a short router, not an archive
- index.html: Learn view restructured — #learnUpNext + #learnReviseCard + #learnResume, Quick-Reference entry +
  hub Multiplication Tables (kept by owner decision), "All topics" browse, collapsed "My notes" (merges custom
  topics + starred formulas; paywall untouched). REMOVED: static Fraction→%, Squares, Cubes, Mental-Math cards
  and the "Your Topics"/"Quick Reference" heading blocks. New #learnRevise container + revise-flow.js script tag.
- js/views/learn-view.js: _renderUpNext (recommended next chapter — order/filter/exam-aware), _renderReviseCard
  (due count), _weakStripHtml ("Needs practice" via QR_STATMATH.weakestTopics + drillCategory), category heads
  gain "· N read", topic cards de-badged (difficulty + one contextual badge), _buildHub grid loops deleted.
### feat(revise): Guided Revision flow (ADR-092 centerpiece)
- js/learn/revise-flow.js (NEW): #learn/revise — due topics one at a time as their revision projection
  (formula/trick/trap/revision via BlockRenderers), progress bar, "Revised ✓ · Next" re-arms the spaced interval
  (LearnProgress.markViewed), caught-up/completion screens; pure buildQueue dual-exported for the check.
- js/views/learn-view.js: renderLearnRoute dispatches path==='revise'; _leaveHub factored (scroll stash + search
  clear shared by topic/quick-ref/revise branches).
### feat(library): the ONE home for condensed reference
- js/quick-reference/quick-ref-data.js: squares 1–50, cubes 1–30, frac-pct full 34-row table, mult-tricks +×75/×125.
- js/quick-reference/quick-ref-renderer.js: QuickRef.reveal(cardId) — expand section, scroll, flash (+data-card).
### feat(search): one search over everything
- js/learn/learn-search.js: queryCards() over QR_QUICKREF (title/searchTerms/section haystack); query() contract
  untouched. js/views/learn-view.js _runSearch renders grouped Topics + Quick-reference results; card tap →
  library + reveal. Search placeholder: "Search topics, formulas, tables…".
### feat(topic page): one reading spine
- js/views/learn-view.js: breadcrumb → single "← Learn" back link; aside removed; end-of-chapter footer (Mark
  complete + Practise synced via shared _completeBtn/_syncCompleteButtons, Next-up card, related chips, Previous
  link).
- css/style.css: .kx-topic-body single centred 720px column (≥960px grid + .kx-aside/.kx-pn/.kx-crumbs rules
  deleted); .kx-chapter-foot/.kx-foot-*; quieter .kx-sec-pill; .kx-overview as lede; ADR-092 block (.kx-upnext,
  .kx-revise-card, .kx-rc-acc, .kx-search-group, .kx-rev-*, .kx-mynotes-sub, .qr-card-flash) with dark-mode +
  reduced-motion coverage.
### chore(checks + SW)
- scripts/learn-progress.check.js: +5 ReviseFlow.buildQueue tests; scripts/learn-browser.check.js: loads
  quick-ref-data + revise-flow, asserts queryCards/ReviseFlow globals (13 checks).
- service-worker.js: qr-cache v206→v207; js/learn/revise-flow.js pre-cached.
### fix(final audit pass): five findings from the end-to-end verification sweep
- js/views/home-view.js: Home "Quick Study" learn links rerouted (fractionTable/mentalTricks/squaresSection →
  library card reveal; formulaSections → library root — it had NO DOM target since ADR-069; bookmarksSection →
  My notes). [shipped in the main ADR-092 commit; listed here for the record]
- css/style.css: .kx-hub-head:focus outline suppressed (the programmatically-focused Quick-Reference heading
  showed a loud UA ring); #learnRevise capped to the same 720px centred measure as topic pages at ≥960px.
- js/views/learn-view.js: category "· N read" counts now refresh live after completions (_catCountText +
  data-cat, hub builds once); the LAST topic of a category no longer dead-ends — its footer "Next up" hands
  off to the next category of the same subject (recommended order, labelled with its category); the guided
  revision flow hides the Learn search bar for the session; stale file-header comment rewritten for ADR-092.
```

Docs: DECISION_LOG (ADR-092) · VERSIONS (Bible 2.112→2.113, Arch 2.58→2.59).

## 2026-07-02 — Product Excellence Pass: remaining audit items (ADR-091)

Independent re-evaluation + implementation of the audit's remaining recommendations (full reasoning incl. two
already-solved closures and one rejected-as-wrong item in ADR-091). Code changes:

```
### feat(H1+H2): feedback rebalance + honest timeout
- sounds/correctanswer.wav (NEW, ~15KB synthesized chime) + soundEngine.js map entry + SW precache.
- js/drill-engine.js: checkAnswer(raw, opts) with opts.timedOut (from _perQTick expiry); correct path plays
  correctAnswer; timeout path = "⏱ Time's up" amber verdict (.drill-verdict-timeout), single haptic, NO wrong
  sound; 🔥 N-in-a-row chip beside "✓ Correct" from streak ≥3; wrong-answer card shake removed.
- css/style.css: .drill-streak-chip, .drill-verdict-timeout; .feedback-shake/keyframes deleted (dead).
### feat(H3+H4): numpad yields + 1-tap warmup
- js/drill-engine.js: hideCustomNumpad() on answer (kept during Reflex auto-advance) — existing MCQ layout rules
  give the explanation full height; re-render restores.
- js/controllers/practice-modes.js: startDrillFromPractice forwards opts.skipStartScreen;
  js/views/home-view.js: warmup CTA passes it — Home → Question 1 directly.
### feat(H6+H7): cold-start honesty + Appearance System/Light/Dark
- js/views/home-view.js: streak badge hidden at 0; hero Accuracy/Best "—" until data; quota bar hidden until
  the first question of the day.
- js/settings.js: appearanceMode/resolveDarkMode/applyAppearance + live prefers-color-scheme listener; the
  darkModeToggle block → appearanceSelect handler (writes settings.appearance, mirrors settings.darkMode).
- js/app.js: both dark-mode apply sites route through resolveDarkMode (guarded). index.html: toggle row →
  three-option .theme-select row ("Appearance · Follow your device, or set light or dark").
### feat(H8/M5/M7/M10/N1): timers, tablet, tokens, pause, typography
- css/style.css: .timer calm by default + .timer-low danger/pulse (JS toggles at ≤5s perQ / ≤10s total);
  ≥768px block centers drill card/keypad/actions at 640px + 3-col results grid; legacy token aliases in :root
  (--text-primary/-secondary, --accent-primary, --bg-surface/-elevated, --border-color → --qr-*); pause/exit
  44px visible-circle targets; body font stack system-ui-first; tabular-nums on question/timer/result digits;
  #drillResultsHeading:focus outline suppressed.
- js/drill-engine.js: set-mode header gains the pause button (pauseSession is mode-agnostic).
```

Closed with no change: M11 (MCQ ✓/✗ glyphs already existed), M3 (Skip toggle already paywall- and hard-mode-gated
in Settings). Rejected: M4 (hiding DI value labels makes exact-equivalence grading unanswerable). Deferred: M6
i18n scaffold, N2/N3/N5/N6.
Verification: npm test (26 checks) green; Playwright sweep — 1-tap warmup, Time's-up verdict, numpad collapse,
timer-low class, cold-start dashes, Appearance×colorScheme emulation, tablet 640px/3-col, set-mode pause.
Final independent review addendum: empty Submit taps are now ignored in practice (a stray tap must never burn the
question with a failure verdict + sound; duels keep empty "lock in" submits — set-mode never runs in duels), and the
App Guide's Settings section now describes Appearance instead of the removed Dark Mode toggle. Both re-verified live.
SW v205→v206.
> Bible 2.111→2.112, Arch 2.57→2.58, Firestore 2.22→2.23 (settings.appearance).

## 2026-07-02 — Critical launch-readiness resolution (ADR-090)

The 7 Critical findings of `AUDIT-REPORT-PRODUCT-UX.md`, independently re-evaluated then implemented (full reasoning
in ADR-090). Summary of code changes:

```
### feat(C1): target-exam identity
- js/services/target-exam.js (NEW): TargetExam.get/set/clear/label — canonical settings.targetExam (synced) +
  qr_active_exam legacy mirror; all 4 readers (practice-modes mock, learn-view, stats-view, category-picker) and
  the Planner writers (companion-ui ×2, planner-view reset) go through it. Registered in index.html + SW precache.
- js/onboarding.js: 6→7 screens — new tier→exam step (QR_SYLLABUS.TIERS / examsByTier, skippable, Foundation
  quick-pick); name now optional; TargetExam.set persisted in _markCompleted.
- index.html + js/settings.js: Settings "Target Exam" select (optgroups by tier, canonical write path).
- js/views/home-view.js + index.html + css: hero exam chip; one-time exam nudge banner for pre-existing users.
### fix(C2): fabricated percentile removed
- js/services/scoring-service.js: computePercentile/getPercentileClass/PERCENTILE_KEY deleted; getSpeedScoreClass +
  loadLastSpeedScore/saveLastSpeedScore (qr_last_speed_score) added.
- js/drill-engine.js: Speed Benchmark card → Speed Score card (score/100, self-delta vs last session, Your Best);
  "Best N% · N spd" chip removed; shareData.percentile → speedScore.
- js/ai-features.js: benchmark copy self-referential (no rankings); percentile arg retired.
- js/services/share-service.js: card + text fallback → "Speed Score N/100".
### feat(C3): Session Complete verdict hierarchy + free session review
- js/drill-engine.js: one verdict slot (PB gated on ≥3 prior sessions + real improvement; <50% = neutral
  "Needs Review" badge-review class); qr_sessions_count hoisted (counts for everyone); topic cards need ≥3
  attempts/category; sessionWrongQuestions collected in checkAnswer; "Review these N now" primary CTA
  (in-memory replay via _preloadedQuestions + new skipStartScreen opt); insight strings de-duplicated.
- js/controllers/practice-modes.js: startSessionReview launcher (daily-limit-guarded, standard finish handler).
- css/style.css: .badge-review (neutral slate; dark + playful variants).
### fix(C6): copy/default coherence
- Daily goal 20 default / 10–100 range (index.html, settings.js); "Stats" everywhere (header, App Guide);
  greeting name-fallback removed (home-view.js); "Today's Goal" ring; manifest.json + meta + About → 4-tier
  catalog (no GMAT); exit dialog honest copy (session-manager.js, index.html).
### feat(C7): paywall price-first + trust row
- js/paywall.js: order hero→accent→plans+CTA→8-row table; _VALUE_CARDS deleted; trust = Secure Payments ·
  7-Day Refund · Instant Activation (qrIco triples); footer + About + CTA note carry the refund promise +
  support email; "5 free to try"; "Premium theme"; css: dead .pw-value* removed, secondary copy #64748b (AA).
### feat(C4): QR icon system — two-personality themes (owner directive)
- css/style.css: "QR ICON SYSTEM" block — playful renders --qri-* data-URI masks in currentColor via
  body.theme-playful .qr-ico::before (~36 glyphs); context size/tint rules; nav selectors migrated
  img/.nav-emoji → .qr-ico; --qr-grad-a/b + --qr-shadow-playful tokens replace hardcoded literals; playful
  bento soft tiles.
- index.html: nav, view headers, settings rows, mode cards, bento, clear-data, install card, action buttons
  wrapped in qr-ico spans (classic renders the same emoji as before — wrappers only).
- js/app.js: qrIco() string-builder; updateNavigationIcons/_NAV_SVGS/_HEADER_LABELS deleted; tab-pop wiring
  targets .qr-ico. js/settings.js: applyTheme is a pure class toggle.
- appicons/tab/*.svg DELETED (8.3MB of PNG-in-SVG), removed from SW precache. SW v204→v205.
### feat(C5): Google Sign-In + server-side provisioning
- api/account.js: idempotent ensure-profile action (register.js-shaped seed, missing-fields-only merge,
  usage/ai via .create(); fixes the claimSession skeleton-doc latent bug). api/auth/register.js: anti-drift
  cross-reference comment.
- js/auth.js: loginWithGoogle (popup-first, redirect fallback), provider error map, ensure-profile →
  Session.claim chain on genuinely-new provider logins, getRedirectResult handling.
- index.html + js/app.js + css: "Continue with Google" button, divider, loading/reset wiring.
- js/firestore-sync.js: dead client-side _createDefaultDocument write → ensure-profile + re-get (all accounts).
- js/settings.js + index.html: provider-aware delete re-auth (reauthenticateWithPopup, password field hidden);
  Profile modal surfaces bind-once claim-coaching while unbound.
- scripts/ensure-profile.check.js (NEW, 15 assertions). FIREBASE_SETUP.md: console steps + redirect/unlink caveats.
```

Verification: all 26 `scripts/*.check.js` green (incl. new ensure-profile 15/15); Playwright walkthrough at 390×844 —
onboarding exam step end-to-end (targetExam = settings + mirror), 0/5 session shows ONE neutral verdict + Speed Score
card + working "Review these 5 now" replay, paywall price-above-fold with refund row, classic emoji parity + playful
mask icons across light/dark; zero page errors. Docs: ADR-090, this entry, VERSIONS row, SECURITY_ARCHITECTURE
(ensure-profile), FIRESTORE_BLUEPRINT (settings.targetExam/targetTier). SW v204→v205.
> Bible 2.110→2.111, Arch 2.56→2.57, Firestore 2.21→2.22, Security 2.15→2.16.

## 2026-07-02 — Final UI cleanup: forward-only results actions + Stats section removals (ADR-089)

Production polish (not a redesign). Removed the last UX debt from the results and Stats surfaces, fixed the results
topic-card overflow, and tightened Settings — small green commits, mapped from three read-only audits first.

```
### refactor(ADR-089 A): results screen — forward-only actions
- js/drill-engine.js: removed the actMistakes (Practice My Mistakes shortcut), actRetry (Practice Again/Retry) and
  actHarder (Increase Difficulty) buttons + listeners; the results actions are now Continue Learning (btn-primary,
  full-width, always) over Back to Practice (btn-secondary, full-width). Share Achievement stays, always shown.
- js/drill-engine.js: deleted the now-dead restart machinery these were the only callers of — _restartSession,
  _practiceMistakesRestart, _increaseDifficultyRestart, _initialCount, _canHarder/_curDiffLc, _primaryIsMistakes.
  Kept the insight chips (incl. "N to review"), .session-insight-card, and _wrongCount.
- css/style.css: .drill-next collapses to a stacked full-width column; removed the two-column .drill-next-grid rules.
- KEPT IN FULL — Review My Mistakes: reviewMode plumbing, generateMistakeReviewQuestions, getMistakes, the Practice
  "Review Mistakes" card + launcher, the review_mistakes entitlement/paywall/analytics/docs. Only the results-screen
  shortcut was removed. Mistake tracking (recordAnswer → progress.mistakes) untouched (feeds Firestore + AI coach).

### refactor(ADR-089 C): remove Stats "Performance Insights" + "Exam Readiness"
- js/views/stats-view.js: deleted _renderInsights + _renderReadiness, their renderStatsView calls + _toggleSection
  lines, and the "exam readiness" name-drop in the mastery-locked copy.
- data/statMath.js: removed comparativeInsights, examReadiness, the private _hardAccuracy helper and the now-unused
  _CONF_FACTOR, plus their exports. Kept all shared helpers (accuracyWindows, deriveMastery, consistency, evidence,
  _barClass, …).
- index.html: removed #insightsSection + #readinessSection. css/style.css: removed .stats-insight-* / .stats-ready-*
  and a now-orphaned #statsInsights-scoped rule. scripts/statmath.check.js: removed the two dead IIFEs.

### chore(ADR-089 hardening): post-implementation audit — close residual items
- Three independent adversarial re-audits (results / Stats / regression+settings+docs) found no functional regressions
  and no dangling product-code references. Closed the only residual housekeeping:
- data/statMath.js: removed overallAccuracy (function + export) — it became dead once _hardAccuracy/examReadiness were
  removed (a full-repo grep confirmed zero callers).
- scripts/statmath.check.js: corrected the stale file header (dropped "comparative insights" + the deleted examReadiness
  bounded/monotonic/damped assertions).
- docs/BIBLE/ROADMAP.md: reworded two stale references — "Exam Readiness" → "the planner's exam-readiness score", and
  dropped "comparative insights" — so the roadmap no longer names removed Stats derivations as live.
- KEPT: the shared performance_insights entitlement (still gates Subject Mastery / Study Next / QuanAI Recommends) +
  its paywall/marketing copy; the separate planner examReadinessScore subsystem; the drill .session-insight-card.

### fix(ADR-089 D): results topic cards never overflow + Settings rename
- css/style.css: .dt-name two-line clamp (overflow-wrap:anywhere + -webkit-line-clamp:2) replacing the single-line
  nowrap+ellipsis; .drill-topic min-height + align-items:flex-start for equal heights + aligned icons; .drill-topics
  stacks to one column ≤360px.
- index.html: Settings toggle "🎚️ Ask Subject Before Quick Start" → "🎚️ Ask Subject", clearer subtitle. The
  practiceAskSubject key + bindings are unchanged.

### chore(ADR-089 E): verify + docs + SW
- Dead-code grep gates clean (no actRetry/actMistakes/actHarder/_restartSession/…/.drill-next-grid/#insightsSection/
  #readinessSection/comparativeInsights/examReadiness/_hardAccuracy references). CSS braces balanced; node --check on
  edited JS. Harness 25/25 green (statmath.check 713/0). 80-assertion Playwright sweep (4 themes × 320/768): results
  actions, topic-card overflow/equal-height, Stats section removal, Settings label — 0 app errors.
- service-worker.js: v203 → v204 (APP_VERSION + CACHE_NAME).
```

Docs kept in sync: [DECISION_LOG.md](DECISION_LOG.md) ADR-089 · [VERSIONS.md](VERSIONS.md) Bible 2.110.

---

## 2026-07-02 — Drill Engine hardening round 2: theme coverage + audit fixes (ADR-088)

Re-ran the assume-nothing drill quality-gate (three fresh independent audits + code re-reads + full harness). ADR-086/
087 re-verified correct from code. Fixed the items the round-2 pass found, as small green commits R2-A…R2-C.

```
### fix(ADR-088 R2-A): correctness + accessibility
- js/drill-engine.js: A1 _restartSession(overrideCount) — Practice-Mistakes now requests 10 (was overwritten by the D4
  _initialCount restore, so it replayed the prior mode's size). A2 finish() scores a 0-answer timed expiry as
  speedScore 0 (was inflated to ~37th percentile via avgRaw=0). A3 removed the unreachable/mismatched duel branch in
  checkAnswer. A4 MCQ aria-label escapes '"'. A5 .drill-progress-bar role=progressbar + aria-valuenow/min/max + label
  (both render paths). A6 results card role=status + focus to the "Session Complete" heading. A7 pause overlay
  aria-modal=true. A8 set-mode progressPct clamp.
- js/ui/di-charts.js: A8 pie-legend label yields room to the full value so a large value can't clip the 320 viewBox.

### fix(ADR-088 R2-B): session-upgrade-banner unstyled in Light/Playful
- css/style.css: authored the token-driven base rule (banner + text + CTA + dismiss) — previously ONLY a
  body.dark-mode rule existed. CTA text uses --qr-surface-solid over --qr-accent (contrast-safe in every theme).

### feat(ADR-088 R2-C): complete the Playful drill/results identity
- css/style.css: added a consolidated body.theme-playful override block (tokens → covers Playful light + dark) for the
  primary CTA + share button (blue→teal), performance badges + adaptive pills, speed-benchmark card + benchmark-*,
  session-insight / auto-explain / wrong-answer / percentile-delta, MCQ options + correct/wrong, feedback text, progress
  label, active-drill skip. Playful --qr-warn #b45309 -> #9a4708 (warn-as-badge-text AA on warm surfaces). No :root/
  base/body.dark-mode rule touched — Classic + Dark byte-identical (computed-verified); all 11 new Playful pairs AA.
```

Pixel polish (Phase 19) was audited: the flagged inconsistencies either lack a pixel-identical token to map to, would
alter Classic/Dark, or are defensible hierarchy — so none was forced (the drill renders cleanly, matrix 6/6). SW
v202 -> v203; Bible 2.108 -> 2.109.

## 2026-07-02 — Drill Engine final verification, hardening + Playful identity (ADR-087)

A no-assumptions production quality-gate on the shipped ADR-086 drill engine: three independent Explore audits (engine
logic, CSS/theming, integration) + direct code re-reads + the full harness. Verified-clean on numpad back-compat, SW
precache, load order, keyboard coverage (35k/0). Surfaced and fixed three real correctness bugs (each reproduced then
verified fixed in headless Chromium) plus dead code, spacing/CSS drift, an orphaned test, and an incomplete Playful
theme. Shipped as small green commits H1–H6.

```
### fix(ADR-087 H1): Reflex double-advance/skip, pause-window strand, review-retry count + safety guards
- js/drill-engine.js: nextQuestion() clears _autoAdvanceTimer + _nextGuardTimer at top (D1 — manual tap in the
  350–600ms window no longer double-advances/skips). pauseSession() clears both transition timers + re-enables Next
  when answered, and startPerQTimer() no-ops while _paused (D2 — pausing in the auto-advance window no longer strands
  the session). Captured _initialCount and restore it in _restartSession (D4 — review Retry replays the original
  count, not the re-queue-inflated one). finish() early-returns if _isFinished (idempotent). "All Caught Up" +
  generation-error paths now _removeVisibilityGuard() (no leaked global listener).

### chore(ADR-087 H2+H3): dead-code removal, spacing/CSS consolidation, wire orphaned mock check
- js/controllers/practice-modes.js: removed the unreachable Word-Problems live-session launcher (~35 lines; the
  Coming-Soon intercept returns first).
- js/drill-engine.js: removed never-called _shareTextFallback; dropped the redundant `mode === 'Reflex Drill'` literal.
- css/style.css: --qr-numpad-h token unifies the 13.5rem↔13.75rem drift; consolidated the duplicate .results-share-btn.
- package.json: wired scripts/mock-engine.check.js (npm test now 25 checks, all green).

### feat(ADR-087 H4): complete Playful theme identity + drill-component tokenization
- css/style.css: extended body.theme-playful (+ dark) to a full semantic palette (--qr-bg, its own --qr-accent, warm
  --qr-text*, success/danger/warn/info, accent-matched --qr-focus-ring) — WCAG AA-verified. Tokenized drill components
  that still hardcoded colour: .drill-explain-btn -> var(--qr-info); drill/results/duel session-shell backgrounds ->
  var(--qr-bg); playful-dark numpad submit -> signature blue→teal; exit-button safe-area parity. Classic + Dark stay
  byte-identical (:root/dark-mode blocks untouched; every tokenised literal equals its theme's token value); only
  Playful re-themes.

### chore(ADR-087 H5): finish the .results-share-btn dedup
- css/style.css: removed the leftover premium-gradient !important override (merged into the single base rule; renders
  identically). Verified via cross-theme journey matrix (6/6 clean) + per-theme token/contrast audit.
```

SW v201 -> v202. Bible 2.107 -> 2.108.

## 2026-07-01 — Complete Drill Engine redesign (ADR-086)

The entire drill journey redesigned as one premium product across all three themes, shipped as small green commits
P0–P9 (each `npm test`-green + browser-verified). No generator or answer-format changes — the recompute harness stays
0-mismatch; `q.answerFormat` is an optional additive field only.

```
### feat(ADR-086 P0): semantic design-token system (all 3 themes × light/dark)
- css/style.css: added --qr-text/-dim/-mut, --qr-surface(-2/-3/-solid), --qr-border(-strong), --qr-success/-danger/
  -warn/-info(+fg/bg/border), --qr-focus-ring, --qr-dur*/--qr-ease, seeded from existing hex literals (no new hues) on
  :root, body.dark-mode, body.theme-playful, body.theme-playful.dark-mode. No behaviour change.

### feat(ADR-086 P1): answer-format registry + code-enforced keyboard coverage
- js/answer-format.js (NEW, dual browser/Node export): answerFormat(q) -> {kind, keys, normalize, validateKeystroke}
  inferred from category/subtype/options. One source of truth for grader + keypad + coverage.
- js/drill-engine.js: checkAnswer grades via QRAnswerFormat.normalize (guarded fallback).
- scripts/answer-format.check.js (NEW): sweeps every Quant/DI/LR category x difficulty (~35k assertions, 0 failed) —
  every numeric answer's chars are a subset of its keys AND typeable keystroke-by-keystroke; every MCQ has options.
- index.html, service-worker.js: load + precache answer-format.js.

### feat(ADR-086 P2-P4): adaptive dock + first-class MCQ + teaching feedback + Reflex fix
- js/ui/numpad.js, css/style.css: keypad built at runtime from answerFormat(q).keys with keystroke validation; added
  '/', dropped dead '%'; conditional dead-space reservation removes the ~14rem blank band under MCQ.
- js/drill-engine.js: MCQ layouts (2/3/4/long/picture) first-class; wrong answers show a teaching panel (verdict +
  correct-answer chip + formatted "Why" steps + Learn concept-link), preserving AI Explain + auto-tip/paywall.
- js/controllers/practice-modes.js, js/drill-engine.js: Reflex auto-advance revived via explicit opts.autoAdvance
  (the old mode==='Reflex Drill' string guard never matched the emoji-prefixed label).

### feat(ADR-086 P5): premium start screen + honest loading state
- js/drill-engine.js: renderStart shows a badge + question count/est. duration/difficulty/timer stat grid + dominant
  CTA; _renderLoading shows a subtle no-fake-progress loader for heavy deck generation (deferred one frame; pre-built
  decks skip it; _loadingTimer cancelled in cleanup).

### feat(ADR-086 P6): completion performance dashboard + next-action routing
- js/drill-engine.js: new sessionCategoryStats (per-category correct/total) drives Strongest/Focus-next topics; insight
  chips (speed trend, mistakes-to-review, personal-best); context-aware next actions (Practice My Mistakes / Retry /
  Increase Difficulty / Continue Learning / Back), each an in-engine restart or clean exit. begin() clears _isFinished.

### fix(ADR-086 P7): pause/resume + graceful session-flow
- js/drill-engine.js: countdowns hoisted to engine scope so a ⏸ pause freezes them and resume restarts from the exact
  second; qStart/overallStart shifted forward so a pause never counts against time; visibilitychange auto-pause on
  background (non-duel); Escape/focus a11y on the overlay; deck generation wrapped -> Retry error card on failure;
  global countdown painted immediately on question render.

### fix(ADR-086 P8): chart/figure label clipping
- js/ui/di-charts.js: long bar/line/legend labels truncate with an ellipsis sized to the slot.
- js/ui/lr-figures.js: a multi-item `row` figure scales its max-width by item count (~84px/item, capped 340) so a
  3-4 figure series stays legible instead of squashed by the 130px cap.

### chore(ADR-086 P9): cross-theme verification + docs
- Cross-theme functional matrix (light/dark/playful x 320/768) + computed-style contrast check: 0 horizontal overflow,
  correct per-theme tokens, every state renders, 0 page errors. Coverage stress re-run (34,991/0).
- docs/BIBLE/{DECISION_LOG,VERSIONS,CHANGELOG}.md: ADR-086 recorded; Bible 2.106->2.107, Arch 2.55->2.56.
- service-worker.js: SW v190 -> v200 across the phases.
```

## 2026-07-01 — Dragon-Boss whole-app production audit (ADR-085)

A no-assumptions production-readiness sweep of the entire main-app. Three parallel Explore sweeps (runtime, PWA/
security, code-health/docs), then every claim re-verified against the actual code. Verified-clean on PWA precache,
cache/update flow, manifest, XSS escaping, secrets, storage, webhook, dead-code, config. Five agent "critical" claims
rejected as false after code inspection (signup double-fire, drill-session strand, logout data-loss, duel cache leak,
`_memoryCache` race). Two real defects fixed:

```
### fix(ADR-085): drill-engine stray-timer cancellation + documentation rot
- js/drill-engine.js: the Reflex auto-advance setTimeout(nextQuestion,600) and the 350ms next-guard setTimeout were
  fire-and-forget; stored both ids engine-scoped and clearTimeout them in cleanup() so a fast exit can't fire
  nextQuestion/finish into a torn-down engine.
- README.md: replaced the "File Structure" block (listed 7 non-existent per-page .html files) with the real SPA layout;
  "14/12 Quant categories" -> 36.
- services/quantTopics.js, scripts/quant-engine.check.js (x2), data/subjects.js, index.html: stale "14 categories"
  comments -> 36.
```

Verification: full `npm test` exit 0 (harness 0 mismatches; all suites green). Browser-proven for the timer fix — a
headless Reflex drill that answers then exits within the auto-advance window schedules the 600ms timer, `cleanup()`
cancels it (1/1), and the drill does not advance to Q2, 0 page errors. **Docs:** DECISION_LOG ADR-085, VERSIONS
2.105→2.106, this entry. **SW** v189→v190.

---

## 2026-07-01 — Quant Gold Audit (ADR-084) Batch 9: final production-audit fixes

An independent strict production-readiness audit (3 parallel repo sweeps + a 32,400-question stress run) found three
real items; all fixed.

```
### fix/quant(ADR-084): production-audit fixes
- js/questions.js: pipes-cisterns easy tier drew both pipe times from a tiny pool ([2,3,4,6]) under the clean-integer
  constraint, yielding only 3 possible questions. Now draws from a shared wider pool [3,4,5,6,10,12,15,20,24,30] → 18
  distinct stems (6x), still clean small-integer answers, recompute unchanged.
- scripts/knowledge-base.check.js: DRILL_CATS was a frozen 14-item whitelist (a stale subset of the 36) used to
  validate the syllabus layer's drillable/signals category refs; now derived from services/quantTopics.js
  CATEGORY_LABELS so it validates all 36 and never goes stale.
- js/utils/generative-helpers.js: removed leftover unused exports NAMES, ITEMS, item (+ the ITEMS/item defs) and the
  redundant `sample` alias — the only external consumer (questions.js) uses gcd/lcm/shuffle/name/twoNames. QRGen
  surface 21 -> 17 keys; the numeric primitive toolbox is retained.
```

Verification: recompute harness 113,001 assertions / 0 mismatches; 32,400-question re-sweep — 0 dirty, 0 throws, no
tier below 5 distinct stems; full `npm test` exit 0; DI/LR regression clean (di-engine 15,246/0, di-set 13,681/0,
lr-engine 28,692/0, lr-set 5,155/0). **Docs:** DECISION_LOG ADR-084 (Batch 9), VERSIONS 2.104→2.105, this entry.
**SW** v188→v189.

---

## 2026-07-01 — Quant Gold Audit (ADR-084) Batch 8: global validation + ship verdict (COMPLETE)

Whole-engine acceptance sweep and final ship review across all ADR-084 batches. No code change — validation + docs.

Verification:
- Full `npm test` exit 0 — recompute harness 112,993 assertions / 0 mismatches; category-source, quick-ref (382/0),
  learn-content/render/browser/progress, statmath, subjects all green.
- Node stress: 4,320-question cross-topic sweep (36 categories × 3 tiers × 40) → 0 dirty answers, 0 throws, 24 distinct
  shared names surface across word problems, longest stem 146 chars.
- Real browser at 360/390/768/1280px, light + dark: category picker (70 buttons, 11 sections, For-You strip, no
  overflow) and Quick-Reference library (5 sections, 21 cards, 42 cross-links, live search, no overflow) — 0 errors.

**Ship verdict — GO.** Quant coverage is complete AND discoverable (zero stale category lists; every surface derives
from the source of truth), the engine matches the DI/LR production bar, and the batches introduced no regressions, new
dependencies, new Firestore collections, paywall flags, or dead code. **Docs:** DECISION_LOG ADR-084 (Batch 8 /
COMPLETE), VERSIONS 2.103→2.104. Docs-only — no SW bump.

---

## 2026-07-01 — Quant Gold Audit (ADR-084) Batch 3: premium Quick-Reference revision library

Build a curated, standalone revision library as a Learn sub-view — a premium exam-day differentiator.

```
### feat/learn(ADR-084): Quick-Reference revision library (#learn/quick-ref)
- js/quick-reference/quick-ref-data.js (NEW): 21 curated cards across 5 sections (Number Sense, Arithmetic & Commercial,
  Algebra, Geometry & Mensuration, Modern Math); each card = table/grid block + optional Learn/Practice cross-links.
- js/quick-reference/quick-ref-renderer.js (NEW): QuickRef.render/filter — collapsible sections (reuse toggleSection +
  .collapsible-card), instant search, session-remembered expand state, Learn/Practice cross-link buttons. Tables via
  BlockRenderers.table; grids via .math-grid.
- index.html: #learnQuickRef container + hub entry chip (#quickRefEntry) + two script tags.
- js/views/learn-view.js: renderLearnRoute branch for path === 'quick-ref'; wire the hub entry to Router.showView.
- css/style.css: .qr-lib-entry / .qr-lib-head / .qr-search-input / .qr-sec-count / .qr-card* / .qr-link* (light + dark).
- scripts/quick-ref.check.js (NEW): cross-link + block-shape integrity (into npm test).
```

Verification: quick-ref.check 382/0; full `npm test` exit 0; real browser at 360/768px light+dark — 5 sections, 21
cards (19 tables + 2 grids), 42 Learn/Practice cross-links, search filters live, empty-state works, no overflow, 0
errors. Content is free — no new Firestore or paywall flags. **Docs:** DECISION_LOG ADR-084 (Batch 3), VERSIONS
2.102→2.103 / Arch 2.54→2.55, this entry. **SW** v187→v188.

---

## 2026-07-01 — Quant Gold Audit (ADR-084) Batch 7: dead-code cleanup

Remove verified-dead helpers so the generator toolbox reads honestly.

```
### chore/quant(ADR-084): drop unused helpers
- js/questions.js: removed unused _round1().
- js/utils/generative-helpers.js: removed mcq, nearMissDistractors, frac, commaGroup, pluralize, gcdArr, lcmArr
  (function + export) and factorize from the public export (kept as internal helper for numFactors). Header comment
  updated to match. QRGen export surface 29 -> 21 keys.
```

Verification: each name re-grepped across main-app/api/scripts before deletion (apparent mcq/frac script hits were
test-label strings / fracExponent substrings). Module + generative-helpers require OK, numFactors still works, full
`npm test` exit 0, dual browser/Node export intact. **Docs:** DECISION_LOG ADR-084 (Batch 7), VERSIONS 2.101→2.102,
this entry. **SW** v186→v187.

---

## 2026-07-01 — Quant Gold Audit (ADR-084) Batch 6: Learn consistency + high-value tables

Bring every Quant chapter to the same structural bar and add scannable comparison tables where they aid revision.

```
### content/learn(ADR-084): exam blocks + comparison tables
- data/knowledge/numbers.js: exam block added to multiplication, fractions, squares, cubes; extra searchTerms on
  squares/cubes.
- data/knowledge/modern.js: exam block added to permutation-combination; region→formula table added to set-theory;
  four-measures table added to statistics-basics.
- data/knowledge/algebra.js: AP-vs-GP comparison table added to progressions.
```

Verification: learn-content.check 588/0, learn-render.check 15/0, full `npm test` exit 0. Pure content — no schema or
renderer change. **Docs:** DECISION_LOG ADR-084 (Batch 6), VERSIONS 2.100→2.101, this entry. **SW** v185→v186.

---

## 2026-07-01 — Quant Gold Audit (ADR-084) Batch 5: archetype + explanation + difficulty polish

Add a 2nd easy archetype to the four single-archetype easy tiers, enrich terse explanations, unify the log base set.

```
### feat/quant(ADR-084): 2nd easy archetypes + richer explanations
- js/questions.js: logarithms easy gains solveLog; partnership easy gains shareRatio (_pRatio, string ratio); ages easy
  gains presentAge (_agePresent); simple-interest easy gains amount. Enriched explanations: quadratic productRoots,
  surds indexLaw, logarithms evalLog, progressions gpSum, inequalities countRange, trigonometry identity (method →
  working → shortcut/trap). Logarithms product/power/solve base set now includes 10 (common log).
- scripts/quant-engine.check.js: TIER_KEYS updated for the four easy tiers; added ages `presentAge` recompute case.
```

Verification: `node -e "require('./js/questions.js')"` OK; quant harness 112,993 assertions / 0 mismatches (14,759
independently recomputed); full `npm test` exit 0; every new easy archetype earns its tier and hard never downgrades.
**Docs:** DECISION_LOG ADR-084 (Batch 5), VERSIONS 2.99→2.100, this entry. **SW** v184→v185.

---

## 2026-07-01 — Quant Gold Audit (ADR-084) Batch 4: generator scenario/name diversity

Wire the shared name/item/context pools into the word-problem generators so drills stop feeling templated.

```
### feat/quant(ADR-084): generator scenario + name diversity
- js/questions.js: added _two()/_one() bridges to QRGen.twoNames()/name(); wired _two() into partnership (_pShare,
  _pShareTime), ages (_ageRatioSum, _ageDiff), ratios (_ratDivide) so two-actor stems draw from the 20-name pool
  instead of "A and B". Commodity variety in mixtures (_mixRatio/_mixMean/_mixQty via _MIX_ITEMS); structure variety
  in trigonometry height (_trigHeight object pool); _SET_CTX expanded 5→14 context pairs for set-theory.
- Recompute-safe: names/items/contexts carry no digits, so nums(stem) is unchanged → answers byte-identical.
```

Verification: `node -e "require('./js/questions.js')"` loads OK; recompute harness 113,050 assertions / 0 mismatches;
full `npm test` exit 0; sampled stems draw from 20 distinct names across partnership/ages. **Docs:** DECISION_LOG
ADR-084 (Batch 4), VERSIONS 2.98→2.99, this entry. **SW** v183→v184.

---

## 2026-07-01 — Quant Gold Audit (ADR-084) Batch 2b: picker personalization + favourites

Add a "For You" strip and per-row favourites to the category picker, from existing signals only.

```
### feat/practice(ADR-084): For-You strip + pin favourites
- js/ui/category-picker.js: "For You" strip — Recommended (exam-relevance weightedCategories + active exam / priority),
  Continue (LearnProgress.recent → drillCategory), Recently practised (localStorage qr_recent_cats via
  CategoryPicker.noteRecent, written on focus-drill start), Pinned (localStorage qr_pinned_cats via a per-row ☆/★
  star). Subtle 🔥 marks most-asked categories. Pin toggle rebuilds only the strip (preserves expand/search state).
- js/controllers/practice-modes.js: focus-select reads data-label (not textContent) so the star/🔥 never leak into
  the drill label; calls CategoryPicker.noteRecent on drill start.
- css/style.css: .cat-star + .category-foryou-row (light + dark).
```

Verification: `npm test` exit 0; real-browser — strip rows populate from seeded signals (Pinned/Recommended/Recently),
pinning a section star updates the Pinned row live, 64 stars across rows, 0 errors, no overflow at 390px. **Docs:**
DECISION_LOG ADR-084 (Batch 2b), VERSIONS 2.97→2.98, this entry. **SW** v182→v183.

---

## 2026-07-01 — Quant Gold Audit (ADR-084) Batch 2a: dynamic category picker

Render the Practice "Choose Category" grid from the source of truth so all 36 Quant categories are discoverable.

```
### feat/practice(ADR-084): dynamic collapsible/searchable category picker
- js/ui/category-picker.js (NEW): renders #categorySelect at runtime from the Learn registry (Quant section grouping)
  + quantTopics labels + DI/LR engines. Collapsible sections with topic counts, live search, session-remembered
  expand state (localStorage). Same .category-btn[data-cat] contract → practice-modes/practice-config unchanged.
- index.html: replaced the static 14-Quant/DI/LR button grid with a search box + #categoryGroups render target.
- css/style.css: .category-search-input + .category-section* styles (light + dark).
- js/controllers/practice-modes.js: CategoryPicker.render() on focus/custom entry.
- Wired script + SW precache.
```

Verification: `npm test` exit 0; real-browser render — 36/36 Quant categories present in 7 sections (Numbers 7,
Arithmetic 9, Commercial 4, Algebra 6, Modern 4, Geometry 3, Mensuration 3) + DI 5 + LR 23 (set-only seating/puzzle
excluded); live search filters; collapse toggles; 0 page errors; no overflow at 390px. **Docs:** DECISION_LOG ADR-084
(Batch 2a), VERSIONS 2.96→2.97 / Arch 2.53→2.54, this entry. **SW** v181→v182.

---

## 2026-07-01 — Quant Gold Audit (ADR-084) Batch 1: zero stale category lists

Make every category-display surface derive from the single source of truth so new categories never render as raw keys.

```
### fix/quant(ADR-084): derive category surfaces from services/quantTopics.js
- js/app.js: formatCategoryName resolves Quant labels via QuantTopics.CATEGORY_LABELS (removed frozen 14-item map).
- js/views/planner-view.js: drillName → formatCategoryName (removed stale DRILL_NAMES snapshot).
- js/duel-ui.js: _categoryEntries derives from QuantTopics.CATEGORY_LABELS (all 36 duel-able), labels via formatCategoryName.
- js/ai-features.js WP_CATEGORIES + js/onboarding.js EASY_QUESTIONS annotated as intentional feature subsets.
- scripts/category-source.check.js (NEW, into npm test): asserts categoryGenerators keys == CATEGORY_LABELS keys,
  every label is real (non-key), and subjectToCategories('quant') == the label set. 110 passed.
```

Verification: `npm test` exit 0 (category-source 110/0; full suite green); real-browser boot clean — formatCategoryName
now returns real labels for all new categories (linear-equations→"Linear Equations", etc.), 0 page errors. **Docs:**
DECISION_LOG ADR-084 (Batch 1), VERSIONS 2.95→2.96, this entry. **SW** v180→v181.

---

## 2026-07-01 — Quant Master Overhaul, Phases 4 & 5: calibration + global validation (ADR-083 COMPLETE)

Whole-engine acceptance sweep — no code changes, validation + docs only.

```
### chore/quant(ADR-083): final calibration + global validation
- Zero-orphan verified programmatically: 36 Quant drill categories, 36 Learn chapters, 0 drills without Learn,
  0 Learn without a drill.
- Recompute harness: 113,039 assertions, ~14,800 answers independently recomputed, 0 mismatches (36 cats × 3 tiers).
- Cross-topic stress (4,320 questions): 0 dirty answers, longest stem 146 chars, longest explanation 128 chars.
- Real-browser boot: KB 62 topics, all 15 new categories generate client-side, no JS errors. Longest set-theory stem +
  quantity-comparison MCQ render with no horizontal overflow at 360px; MCQ options full-width.
- exam-relevance covers all 62 published topics (statmath 62/62); subtype 'diff:key' consistent; full npm test green.
```

Verification: `npm test` exit 0; zero-orphan + stress + browser-boot + 360px-render checks all clean. **Docs:**
DECISION_LOG ADR-083 (Phases 4 & 5, acceptance verdict), VERSIONS 2.94→2.95, this entry. No SW change (validation only).

---

## 2026-07-01 — Quant Master Overhaul, Phase 3 batch G-b: quantity-comparison (Phase 3 COMPLETE) (ADR-083)

The one genuinely-MCQ Quant format finishes complete coverage. Full suite green.

```
### feat/quant(ADR-083): quantity-comparison MCQ (Banking/CET)
- js/questions.js: genQuantityComparison — computes Quantity I and II from 5 sub-problem archetypes (pct/product/
  solve/average/square) and returns the relation (I>II / I<II / I=II) as a shuffled q.options MCQ. Reuses the drill
  engine's existing MCQ path; Quant stays numeric-entry everywhere else.
- data/knowledge/arithmetic.js: + quantity-comparison Learn chapter (arithmetic topicCount 8→9).
  exam-relevance.js: metadata (order 36).
- quantTopics: 1 new label. quant-engine.check: TIER_KEYS (string-answer → structural + diversity only) — 113,039
  assertions, 0 mismatches. subjects 35→36; learn-content 61→62 topics.
- Phase 3 complete: 36 Quant drill categories, 36 Quant Learn chapters, zero orphan content (verified).
```

Verification: `npm test` exit 0 (quant-engine 113,039/0; learn-content 62 topics; statmath 62/62; subjects 36;
zero-orphan check clean). **Docs:** DECISION_LOG ADR-083 (Phase 3G-b), VERSIONS 2.93→2.94, this entry. **SW** v179→v180.

---

## 2026-07-01 — Quant Master Overhaul, Phase 3 batch G-a: close the last drill-only orphans (ADR-083)

Learn chapters for the 4 foundational speed-calc drills → zero orphan content. Full suite green.

```
### feat/learn(ADR-083): Learn chapters for multiplication, fractions, squares, cubes
- data/knowledge/numbers.js: 4 gold-standard chapters (speed-calc tricks, ends-in-5 squaring, cube-root last-digit
  map, fraction⇄percent table). drillCategory points at the existing drills; cross-linked via related.
- data/knowledge/exam-relevance.js: metadata (orders 32–35). numbers category topicCount 3→7.
- Verified: every Quant drill has a Learn chapter and every Quant Learn chapter has a drill (zero orphans).
- learn-content 57→61 topics; learn-browser 57→61; statmath metadata 61/61.
```

Verification: `npm test` exit 0 (learn-content 61 topics; statmath 61/61; zero-orphan check clean). **Docs:**
DECISION_LOG ADR-083 (Phase 3G-a), VERSIONS 2.92→2.93, this entry. **SW** v178→v179.

---

## 2026-07-01 — Quant Master Overhaul, Phase 3 batch F-b: set-theory + statistics-basics (ADR-083)

Complete Modern-Math with two new topics. Full suite green.

```
### feat/quant(ADR-083): set-theory + statistics-basics generators + Learn
- js/questions.js: genSetTheory (union/onlyA/neither/both/threeUnion via inclusion–exclusion, three-set built from
  disjoint Venn regions for consistency), genStatistics (median/mode/range/mean — integer answers).
- data/knowledge/modern.js: + set-theory + statistics-basics Learn chapters (Modern-Math now 4 topics, zero orphans).
- data/knowledge/exam-relevance.js: metadata for both (orders 30–31).
- quantTopics: 2 new labels. quant-engine.check: TIER_KEYS + recompute (inclusion–exclusion, sort-and-pick) —
  109,447 assertions, 0 mismatches. subjects 33→35; learn-content 55→57 topics, modern-math topicCount 2→4.
```

Verification: `npm test` exit 0 (quant-engine 109,447/0; learn-content 57 topics; statmath 57/57; subjects 35).
Samples spot-checked correct + clean. **Docs:** DECISION_LOG ADR-083 (Phase 3F-b), VERSIONS 2.91→2.92, this entry.
**SW** v177→v178.

---

## 2026-07-01 — Quant Master Overhaul, Phase 3 batch F-a: modern-math practice orphans (ADR-083)

Close the two drill-less Modern-Math Learn chapters with production-grade generators. Full suite green.

```
### feat/quant(ADR-083): permutation-combination + probability generators
- js/questions.js: genPermutationCombination (factorial/arrange/nPr/nCr/committee/handshakes, ASCII 7P3/8C3),
  genProbability (bagSingle/complement/allHeads/multipleProb, clean decimal answers). Independent _fact/_nPr/_nCr.
- data/knowledge/modern.js: drillCategory set on probability + permutation-combination (were null) → Modern-Math
  has zero orphans. (Learn chapters + exam-relevance already existed.)
- quantTopics: 2 new labels. quant-engine.check: TIER_KEYS + recompute (independent factorial/nCr) — 103,145
  assertions, 0 mismatches. subjects.check 31→33.
```

Verification: `npm test` exit 0 (quant-engine 103,145/0; subjects 33). Samples spot-checked correct + clean.
**Docs:** DECISION_LOG ADR-083 (Phase 3F-a), VERSIONS 2.90→2.91, this entry. **SW** v176→v177.

---

## 2026-07-01 — Quant Master Overhaul, Phase 3 batch E-b: trigonometry + surface-area (ADR-083)

Add trigonometry and surface-area; backfill exam-relevance for all new algebra/geometry topics. Full suite green.

```
### feat/quant(ADR-083): trigonometry + surface-area generators + Learn; exam-relevance backfill
- js/questions.js: genTrigonometry (standardEval {0,½,1} / complementary / identity / 45° heightElev — native-Math
  recompute), genSurfaceArea (cube TSA·LSA / cuboid TSA / cylinder CSA·TSA / sphere SA, π = 3.14).
- data/knowledge/geometry.js: + trigonometry chapter (incl. standard-angle table + heights-and-distances).
  data/knowledge/mensuration.js: + surface-area chapter.
- data/knowledge/exam-relevance.js: metadata for all 10 new ADR-083 algebra/geometry topics (orders 20–29).
  scripts/statmath.check.js + learn-browser.check.js now load algebra + geometry knowledge files.
- quantTopics: 2 new labels. quant-engine.check: TIER_KEYS + recompute — 96,837 assertions, 0 mismatches.
  subjects.check 29→31; learn-content 53→55 topics, mensuration topicCount 2→3.
```

Verification: `npm test` exit 0 (quant-engine 96,837/0; learn-content 55 topics; statmath metadata 55/55; subjects 31).
Samples spot-checked correct + clean. **Docs:** DECISION_LOG ADR-083 (Phase 3E-b), VERSIONS 2.89→2.90, this entry.
**SW** v175→v176.

---

## 2026-07-01 — Quant Master Overhaul, Phase 3 batch E-a: Geometry category (ADR-083)

Open the Geometry category with two diagram-free topics (generator + Learn + harness). Full suite green.

```
### feat/quant(ADR-083): geometry category — geometry-basics, coordinate-geometry-basics
- js/questions.js: genGeometryBasics (complement/supplement/triangleThird/isosceles/pythHyp/pythLeg/polygonSum/
  polygonEach), genCoordinateGeometry (distance/midpointX/slope/sectionX). Pythagorean triples table for clean roots;
  coordinates non-negative for sign-safe recompute; section ratio m≠n.
- data/knowledge/geometry.js (NEW): 2 gold-standard Learn chapters. categories.js: NEW 'geometry' category (order 45).
  Wired into index.html + service-worker + learn-content.check requires.
- quantTopics: 2 new labels. quant-engine.check: TIER_KEYS + recompute (Pythagoras/distance/section) + slope
  negative-answer exemption — 90,515 assertions, 0 mismatches. subjects.check 27→29; learn-content 51→53 topics,
  6→7 quant categories.
```

Verification: `npm test` exit 0 (quant-engine 90,515/0; learn-content 53 topics; subjects 29). Samples spot-checked
correct, clean, exam-authentic. **Docs:** DECISION_LOG ADR-083 (Phase 3E-a), VERSIONS 2.88→2.89, this entry. **SW**
v174→v175.

---

## 2026-07-01 — Quant Master Overhaul, Phase 3 batch D-b: complete Algebra (ADR-083)

Finish the Algebra category with logarithms, progressions and inequalities-modulus. Full suite green.

```
### feat/quant(ADR-083): logarithms, progressions, inequalities-modulus generators + Learn
- js/questions.js: genLogarithms (evalLog/logSum/logPower/solveLog), genProgressions (apNth/apSum/gpNth/gpSum),
  genInequalities (linIneqMin/modLarger/countRange/modIneqCount/modIneqCountLe). Added _ord() ordinal helper so AP/GP
  "nth term" wording reads 1st/2nd/3rd while keeping digits for the recompute harness. Log stems use ASCII bases.
- data/knowledge/algebra.js: 3 more gold-standard Learn chapters (algebra now complete at 6 topics).
- quantTopics: 3 new labels. quant-engine.check: TIER_KEYS + independent recompute (modular log, series formulas,
  band counting) — 84,201 assertions, 0 mismatches. subjects.check 24→27; learn-content 48→51 topics.
```

Verification: `npm test` exit 0 (quant-engine 84,201/0; learn-content 51 topics; subjects 27). Generator samples
spot-checked correct, clean, exam-authentic (ordinals fixed). **Docs:** DECISION_LOG ADR-083 (Phase 3D-b),
VERSIONS 2.87→2.88, this entry. **SW** v173→v174.

---

## 2026-07-01 — Quant Master Overhaul, Phase 3 batch D-a: Algebra category (ADR-083)

Open the Algebra category with three fully-packaged topics (generator + Learn chapter + harness). Full suite green.

```
### feat/quant(ADR-083): algebra category — linear-equations, quadratic-equations, surds-indices
- js/questions.js: genLinearEquations (solveOne/solveOneSub/bracket/sumDiff/system2), genQuadraticEquations
  (larger/smaller root, sum/product/discriminant via Vieta on x²−Bx+C), genSurdsIndices (powerEval/fracExponent/
  indexLaw/solveExp). Archetype pools, earned difficulty, premium explanations. System coefficients ≥2 (clean wording +
  stable recompute indices); LCM/quadratic forms sign-clean.
- data/knowledge/algebra.js (NEW): 3 gold-standard Learn chapters, cross-linked via drillCategory + related.
- data/knowledge/categories.js: NEW 'algebra' category (subject quant, order 35). Wired into index.html + service-worker
  precache + learn-content.check requires.
- services/quantTopics.js: 3 new CATEGORY_LABELS. scripts/quant-engine.check.js: TIER_KEYS + independent recompute
  (Cramer / Vieta / log). subjects.check 21→24; learn-content counts 45→48 topics, 5→6 quant categories.
```

Verification: `npm test` exit 0 (quant-engine 74,751/0; learn-content 48 topics; subjects 24). Generator samples
spot-checked correct, clean and exam-authentic. **Docs:** DECISION_LOG ADR-083 (Phase 3D-a), VERSIONS 2.86→2.87, this
entry. **SW** v172→v173.

---

## 2026-07-01 — Quant Master Overhaul, Phase 3 batch C: number-properties drill (ADR-083)

Close the last existing-Learn orphan (number-system → drill). Full suite green.

```
### feat/quant(ADR-083): number-properties generator (HCF · LCM · unit-digit · factor-count)
- js/questions.js: genNumberProperties with archetypes hcf / lcm / unitDigit (cyclicity table) / numFactors
  (prime-factorisation), using the shared QRGen gcd/lcm helpers. Earned difficulty + premium explanations. Fixed the
  LCM archetype to never pick a == b (no degenerate "LCM of 20 and 20").
- Wired: categoryGenerators + random pool + quantTopics CATEGORY_LABELS. number-system Learn topic drillCategory set →
  every existing Learn Quant chapter now has a drill (existing-Learn orphan closure complete).
- scripts/quant-engine.check.js: independent gcd/modpow/divisorCount helpers + TIER_KEYS + recompute (65,279 passed,
  0 mismatches). subjects.check 20→21.
```

Verification: `npm test` exit 0 (quant-engine 65,279/0; subjects/learn-content green); generator samples spot-checked
correct + clean. **Docs:** DECISION_LOG ADR-083 (Phase 3C), VERSIONS 2.85→2.86, this entry. **SW** v171→v172.

---

## 2026-07-01 — Quant Master Overhaul, Phase 3 batch B: arithmetic practice orphans (ADR-083)

Close the remaining arithmetic Learn↔Practice orphans with production-grade generators. Full suite green.

```
### feat/quant(ADR-083): ages, mixtures-alligations, pipes-and-cisterns generators
- js/questions.js: genAges (ratio-sum / age-difference-multiple / father-son-multiple), genMixtures (alligation-ratio
  [string] / mean-price / alligation-quantity), genPipes (two-inlets-together / inlet-outlet net-fill). Archetype
  pools, earned difficulty, premium explanations, exam-authentic wording, realistic magnitudes.
- Wired: categoryGenerators + random pool + quantTopics CATEGORY_LABELS. drillCategory set on the ages,
  mixtures-alligations and pipes-and-cisterns Learn topics; pipes' `drillComingSoon` flag removed (real bank now ships).
- scripts/quant-engine.check.js: TIER_KEYS + recompute for the 3 (62,155 passed, 0 mismatches). subjects.check 17→20.
```

Verification: `npm test` exit 0 (quant-engine 62,155/0; subjects 105/0; learn-content 431/0); browser boot clean
(20 quant categories, generators work, 0 page errors); samples spot-checked correct + realistic. **Docs:** DECISION_LOG
ADR-083 (Phase 3B), VERSIONS 2.84→2.85, this entry. **SW** v170→v171.

---

## 2026-07-01 — Quant Master Overhaul, Phase 3 batch A: commercial-math orphans + Phase 1-2 verification (ADR-083)

Independent Phase 1-2 regression audit (clean) + two prep fixes, then the first Phase-3 coverage batch. Node duel path
preserved; full suite green.

```
### fix(ADR-083): Phase 1-2 verification prep
- js/drill-engine.js: on a wrong answer, suppress the generic auto-tip when the question ships a written explanation —
  it was redundant with, and its "Unlock explanations" paywall lock contradicted, the free explanation shown below.
- js/questions.js: remove the dead `PI` constant (generators use literal 3.14).

### feat/quant(ADR-083): close the commercial-math practice orphans (Learn↔Practice parity)
- js/questions.js: new generators genSimpleInterest (find-SI/amount/find-rate/find-principal), genCompoundInterest
  (amount/CI/CI−SI-difference), genPartnership (capital share / capital×time share) — archetype pools, earned
  difficulty, premium explanations, exam-authentic ₹ wording, realistic magnitudes.
- Registered in categoryGenerators + the random `generators` pool; services/quantTopics.js CATEGORY_LABELS +3;
  data/knowledge/commercial.js: set drillCategory on simple-interest / compound-interest / partnership (were null).
- scripts/quant-engine.check.js: TIER_KEYS + recompute for the 3 new categories. 52,956 passed, ~7,000 recomputed,
  0 mismatches. scripts/subjects.check.js: drill-category roster assertion 14→17.
```

Verification: `npm test` exit 0 (quant-engine 52,956/0; subjects 102/0; learn-content 428/0; all suites green); browser
boot clean (new categories generate, 0 page errors); partnership magnitudes calibrated to realistic profits. **Docs:**
DECISION_LOG ADR-083 (verification + Phase 3A), VERSIONS 2.83→2.84, this entry. **SW** v169→v170.

---

## 2026-07-01 — Quant Engine Master Overhaul, Phase 2: overhaul the remaining 9 generators (ADR-083)

Bring every existing Quant generator to the DI/LR bar (Phase-1 refactored 5; this phase does the other 9). No new
colours/deps/Firestore/gamification; Node duel path preserved.

```
### feat/quant(ADR-083): archetype-refactor the remaining generators
- js/questions.js: fractions (frac↔%), multiplication (multiply/divide/3-factor/mental-square),
  ratios (divide-in-ratio/find-term/combine A:B:C/percent↔ratio), averages (mean/missing/weighted/new-member),
  profit-loss (SP-from-profit/loss, profit%, find-CP reverse, successive), time-speed-distance (distance/time/speed/
  avg-speed), time-and-work (together/work-done-%/workers-scale), simplification (BODMAS tiers), number-series
  (arithmetic/geometric/growing-gap). Each: per-tier {k,skill,build} pools + clean PRIMARY fallback, earned difficulty
  (never downgrades), premium explanations (method → working → shortcut/trap), and exam-authentic word-problem wording
  replacing robotic "CP = 200, Profit = 25%. SP = ?" stems.

### test/quant(ADR-083): recompute all 14 categories
- scripts/quant-engine.check.js: TIER_KEYS + recompute extended to all 14 — pure arithmetic stems (multiplication,
  simplification) re-evaluated via an independent expression evaluator; number-series next-term re-detected
  independently; keyed recompute for the rest. 43,503 passed, 5,638 recomputed, 0 mismatches.
```

Verification: `npm test` exit 0 (quant-engine 43,503/0, 0 recompute mismatches; all 20 other suites unchanged); Node
`require('js/questions.js')` duel path green; sampled hard questions across categories show authentic wording + honest
archetypes + teaching explanations. **Docs:** DECISION_LOG ADR-083 (Phase 2), VERSIONS 2.82→2.83, this entry. **SW** v168→v169.

---

## 2026-07-01 — Quant Engine Master Overhaul, Phase 1: foundation (ADR-083)

Bring the original Quant engine up to the DI/LR generative bar. Phase 1 of a phased, single-ADR overhaul (Foundation →
overhaul existing → complete coverage → calibration → global validation). No new colours/deps/Firestore, no gamification;
Node duel path preserved.

```
### feat/quant(ADR-083): shared generative helpers
- js/utils/generative-helpers.js (NEW, dual browser/Node): randInt/pick/shuffle/pickN, sum/min/max, round1/2, isClean,
  gcd/lcm/gcdArr/lcmArr, factorize/numFactors/isPrime, pluralize/frac, exam-native name+item pools, mcq(), and
  near-miss distractor builder. Consolidates the RNG/gcd duplicated across di-engine/lr-engine.

### feat/quant(ADR-083): archetype framework + earned difficulty + explanations
- js/questions.js: _genArch(category, ARCH, PRIMARY) — each topic exposes per-tier {k,skill,build} archetype pools and
  a guaranteed-clean PRIMARY fallback; picks an in-tier archetype, retries in-tier, NEVER downgrades; tags
  subtype:'diff:key' and attaches a teaching explanation (method → working → shortcut/trap). Mirrors di-engine._genFromArch.
- Refactored the 5 laziest/flagship generators to the new bar: squares (direct/inverse/diff-of-squares),
  cubes (direct/inverse), area (square/rectangle/triangle/parallelogram/circle/trapezium/border),
  volume (cube/cuboid/cylinder/sphere/cone), percentages (direct/reverse/what-%/change/successive/±x-trap).

### test/quant(ADR-083): recompute validation harness
- scripts/quant-engine.check.js (NEW → package.json): structural checks over ALL 14 categories × 3 difficulties;
  independent answer RE-COMPUTE for the refactored 5; earned-tier + no-downgrade + archetype-diversity assertions.
  Result: 27,917 passed, 2,250 recomputed, 0 mismatches.

### chore(ADR-083): wiring
- index.html loads generative-helpers.js before questions.js; service-worker precache + v167→v168.
```

Verification: `npm test` exit 0 (quant-engine 27,917/0 with 0 recompute mismatches; all 20 other suites unchanged);
browser boot clean (window.QRGen present, generateQuestion returns explanations + diff:key subtypes, 0 page errors);
Node `require('js/questions.js')` (duel path) still works. **Docs:** DECISION_LOG ADR-083, VERSIONS 2.81→2.82, this entry.

---

## 2026-06-30 — Final verification & excellence pass (ADR-082 addendum)

A 3-agent read-only audit (independently re-verified) confirmed ADR-082 fully correct, zero regressions, and the
45-topic library 100% spine-consistent — one agent's "missing formula/trick" outliers were false on inspection. Only
real fixes + a tight content increment shipped. Full suite green (learn-content 425/0, learn-render 15/0).

```
### fix/tables(ADR-082): guard SoundEngine + drop dead code
- js/tables.js: route all 5 SoundEngine.play() calls through a guarded _sfx() helper (typeof check — mirrors the
  rest of the app; the table-modal path was unguarded). Remove the unused renderMultiplicationTables() (zero callers).

### content/learn(ADR-082): surgical exam-value blocks (Phase 6 — additive, counts unchanged)
- data/knowledge/commercial.js profit-loss: a "which % sits on which base" comparison table (CP vs MP bases).
- data/knowledge/arithmetic.js time-and-work: an exam-strategy block (LCM-units default; mid-way join/leave; invert
  efficiency for time).
- data/knowledge/lr.js lr-blood-relations: an exam-strategy block (always sketch; collapse self-references; decode
  coded-relation symbols into the same tree).
```

Deliberately NOT changed (intentional design, verified): the subtle Learn dividers vs heavier Settings dividers, the
subject(1.35rem) > category(1.2rem) font hierarchy, and the 38px filter-pill (≈48px effective tap target). No new
chapters/colours/deps/Firestore/gamification. Verification: `npm test` exit 0; Playwright (light+dark) — the new
table/exam blocks render with no overflow, settings toggle un-clipped, squares=50/cubes=30, filter persists, 0 page
errors. **Docs:** DECISION_LOG ADR-082 addendum, VERSIONS 2.80→2.81, this entry. **SW** v166→v167.

---

## 2026-06-30 — Learn UX polish: subject filter, squares/cubes, settings fix (ADR-082)

A craftsmanship pass on Learn + a Settings layout regression. No new Learn chapters (user-confirmed; library stays
45), no new colours/deps/Firestore, no gamification. Full check suite green (learn-content 421→425 with alias asserts).

```
### fix/settings(ADR-082): "Ask Subject" row clipped its toggle on narrow phones
- css/style.css .settings-label: add min-width:0 so the text column shrinks and a long subtitle wraps INSIDE its
  column instead of pushing the fixed-width toggle past the card padding (the flexbox-overflow fix). .goal-input gets
  flex-shrink:0. Shared rule → every settings row benefits; toggle stays centered, no clip (360 light+dark verified).

### feat/learn(ADR-082): squares/cubes reference grids extended
- js/views/learn-view.js + index.html: Squares 1²–30² → 1²–50² (value pad 3→4), Cubes 1³–20³ → 1³–30³ (pad 4→5).

### feat/learn(ADR-082): subject filter + subtle progress
- js/views/learn-view.js + css .kx-filter*: a sticky All · Quant · DI · LR pill row above the category list; pills
  toggle .is-hidden on data-subject groups (instant, animated active-state, no re-render). Last choice persists in
  localStorage qr_learn_filter (clamped to a subject with content); divider-override stops a stray top border on the
  leading visible group. _subjectHeaderHtml shows a quiet "x read" from existing completion tracking (no gamification).

### feat/search(ADR-082): exam abbreviation aliases
- data/knowledge/{numbers,modern,arithmetic,lr}.js searchTerms += ap/gp/hp/progression (number-series), p&c
  (permutation-combination), tsd (time-speed-distance), family tree/genealogy/kinship (blood-relations).
- scripts/learn-content.check.js: +4 alias search asserts.
```

Verification: `npm test` exit 0 (learn-content 425/0, +18 suites). Playwright (real CSS + KB, light+dark): settings
toggle un-clipped (toggleRight ≤ card inner edge), squares grid = 50 / cubes = 30, filter switches subjects instantly
+ persists (`qr_learn_filter='di'`), 0 page errors. **Docs:** DECISION_LOG ADR-082, VERSIONS 2.79→2.80, this entry.
**SW** v165→v166.

---

## 2026-06-30 — Final craftsmanship verification pass (ADR-081 addendum)

A 3-agent read-only audit of the ADR-080/081 work ("assume bugs, prove it"). The bulk verified correct; these are the
real fixes it surfaced. No new colours/deps/Firestore; full check suite green.

```
### fix/learn(ADR-081): icon distinctness — topic vs category collisions
- The earlier "45/45 unique" check compared topics only to each other, missing six topic icons that duplicated their
  PARENT CATEGORY glyph (visible side-by-side in the hub head + topic breadcrumb).
- data/knowledge/categories.js: broaden the 5 Quant category icons so each flagship topic keeps its exact glyph —
  Numbers 🔢→🔟, Arithmetic 🧮→➗, Commercial 💰→🏷️, Modern 🎲→🃏, Mensuration 📐→📏.
- data/knowledge/di.js: di-bar-line topic 📊→📉 (di-charts category keeps 📊). All 52 topic+category glyphs now unique.

### polish/learn(ADR-081): tighten the two longest concept bodies
- data/knowledge/arithmetic.js (ratio-proportion) + di.js (di-bar-line): crisper leads; no block add/remove.

### fix/infra(ADR-081): script order + offline precache + dead CSS
- index.html: load js/ui/practice-subject-modal.js BEFORE its caller practice-modes.js (was typeof-guarded; now clean).
- service-worker.js: precache four scripts index.html loads but the list was missing — js/security-events.js,
  js/maintenance-gate.js, js/ui/coming-soon.js, js/views/inbox-view.js (offline-robustness; ../shared/auth-validators.js
  is out of SW scope, left as-is).
- css/style.css: delete dead .category-stat-row / .cat-accuracy theme-override rules (orphaned after the Stats rebuild;
  kept the still-shared .cat-name rule). Braces balanced.
```

Verification: `npm test` exit 0 (learn-content 421/0, learn-render 15/0, statmath 537/0, +17 suites); icon-uniqueness
script over the live KB → 52/52 distinct, 0 collisions; Playwright render (real CSS + KB, light + dark, 360/768) →
distinct hub/breadcrumb icons, di-bar-line table no overflow, tightened concepts render as chapter sections, 0 page
errors. **Docs:** DECISION_LOG ADR-081 addendum, VERSIONS 2.78→2.79, this entry. **SW** v164→v165.

---

## 2026-06-30 — Learn experience & UI refinement: premium textbook (ADR-081)

Make the Learn tab read like a premium textbook and unify Quant/DI/LR. No new colours/animations/deps, no Firestore.
Shipped as independently-green commits.

```
### feat/learn(ADR-081): topic pages read as textbook chapters
- js/knowledge/blocks.js + js/views/learn-view.js: section headings are real names — a concept by its own title, a
  table by its caption, others by richer labels (Key Formulae · Common Mistakes · Exam Strategy · Key Takeaways…);
  sticky pills become a true TOC; self-headed blocks drop the duplicate eyebrow.
- js/knowledge/schema.js + blocks.js + css: new OPTIONAL `exam` block (📌 callout) = exam strategy; + learn-render case.
- css/style.css: more chapter rhythm (section spacing, concept-title as a heading).

### feat/learn(ADR-081): a distinct, meaningful icon for every topic
- data/knowledge/{lr,di,*}.js: 20 LR + 6 DI topics given unique on-theme emoji (were all 📘 / none); Quant 📈 collision
  fixed (compound-interest 💹), simplification 🧮, percentages 💯. Verified 45/45 unique.

### feat/learn(ADR-081): comparison tables + callout parity + exam strategy
- Tables (.math-table): syllogisms (premise→conclusion), mirror/water/dice, perm-vs-comb, SI-vs-CI, bar/line/pie guide.
- Every LR topic now has BOTH a Shortcuts and a Common-Mistakes callout (added the missing one to 13).
- Exam-strategy callouts on syllogisms, seating, percentages, DI sets.

### chore/ui(ADR-081): Practice + Settings clutter removed
- index.html + css: dropped the Subject-Set blue accent rail + "EXAM-STYLE" eyebrow (cards are plain .mode-card);
  shortened the Settings "Ask subject before Quick Start" row to a concise title + one-line subtitle.
```

**Verification:** `learn-content.check` (45 / per-category counts, required blocks) + `learn-render.check` (every
renderer incl. `exam` + `sectionLabel`; XSS escape) green; full npm test green; rendered Quant/DI/LR pages light + dark
with no overflow. **SW v163→v164, Bible 2.77→2.78.**

---

## 2026-06-30 — Practice · Learn · Stats UX craftsmanship pass (ADR-080)

One cohesive premium platform, not three modules. Same blue identity, no new colors/animations, **no gamification**.
Shipped as five independently-green commits (data foundation → Practice → Learn → Stats → cross-cutting).

```
### feat/data(ADR-080): foundation — recorder enrichment + exam-relevance + statMath derivations
- progress.js: categoryStats gains sumTime/timedCount/lastTs; new global byDifficulty; day-reset todayCats. Additive,
  guarded, flows through the existing save/sync — NO new Firestore collection, NO migration.
- data/knowledge/exam-relevance.js (NEW, QR_EXAMREL): per-topic importance for CAT/SNAP-NMAT/Banking/SSC + priority +
  recommendedOrder + mostAsked, for all 45 topics. Powers readiness, recommendations, ordering, contextual badges,
  future exam filters — under the hood, not a badge wall.
- data/statMath.js: timeInvested · masteryDetail · comparativeInsights · examReadiness · weakestTopics ·
  nextRecommendation (all pure, dual-export, confidence-damped). scripts/statmath.check.js (NEW, 537 assertions) in npm test.

### feat/practice(ADR-080): subject picker + Subject Sets section + spacing/hierarchy
- index.html: Quick Start / Subject Sets (hero DI+Reasoning) / Advanced; dead band above "Quick Start" removed.
- js/ui/practice-subject-modal.js (NEW): Quant/DI/LR/Mixed picker before quick/reflex/timed, reusing the
  Battle-Archives modal shell; remembered + "Don't ask again" (Settings toggle, default on).
- practice-modes.js: quick/reflex/timed route through the picker and launch scoped to the chosen subject.

### feat/learn(ADR-080): subjects that breathe + LR/DI sub-groups + contextual badges
- learn-view.js: richer subject headers (blurb + count + difficulty coverage + divider); presentational sub-groups for
  LR (Foundations/Analytical&Puzzles/Critical/Visual) and DI; ONE contextual badge per card ("⭐ For <exam>" / "🔥 Most
  Asked"). No drill/analytics/subjects change.

### feat/stats(ADR-080): rebuilt to "Am I becoming better at aptitude?"
- stats-view.js + index.html: Today · Momentum · Subject Mastery · Performance Insights · Exam Readiness · Time
  Invested · Study Next · QuanAI Recommends. Honest empty states + confidence damping; premium gating preserved.

### polish/ui(ADR-080): section-title parity (Practice == Stats) + value-sm wrapping fix
```

**Docs:** DECISION_LOG (ADR-080), VERSIONS (Bible 2.76→2.77), ROADMAP. **Verification:** full `npm test` green
(incl. statmath.check); seeded render harnesses for all three tabs + the modal at 360/768 × light/dark — no
overflow/clip, no JS errors; premium + free Stats paths. No new deps, no new Firestore I/O. **SW v161→v162.**

---

## 2026-06-30 — LR content-excellence pass (ADR-079 follow-up)

Quality-over-quantity pass on LR *content* (not the engine): research-grounded, original-but-exam-faithful questions,
believable distractors, earned variety. No questions copied verbatim; premium items carry an `inspiredBy` tag and are
never mislabelled as official PYQs.

```
### test/lr(ADR-079): authored validator hardening
- scripts/lr-authored.check.js: gate duplicate stems, duplicate stem+option sets, and EXPLOITABLE-LENGTH give-aways
  (correct answer must not be >35% longer than every distractor — a "pick the longest" tell; verdict + data-adequacy
  banks excluded where short options are authentic). Reports inspiredBy coverage.

### feat/lr(ADR-079): authored expansion by genuine value (64 -> 77 items)
- data/lr-authored/schema.js: optional inspiredBy field; +4 CR subtypes (evaluate/complete/method/parallel).
- data/lr-authored/critical.js: +9 premium CR items; ~11 weak dismissive distractors rewritten into believable full
  statements that arise from real reasoning mistakes (no second-valid-answer introduced).
- data/lr-authored/decision.js: +4 medium dilemmas (hospital conduct, disaster-relief priority, hiring
  conflict-of-interest, retail mis-selling); medium-decision pool 6 -> 10.

### feat/lr(ADR-079): generative authenticity (stop reading as templated)
- lr-engine.js: coding words 20->62 (3-7 letters), names 12->32, syllogism nouns 16->40, +6 odd-one-out groups,
  +8 verbal analogies; human scene-setting (_actor/_rowOpen/_qOpen) on direction/ranking stems. Locked tokens the
  harness parses are preserved; every code/relation/syllogism is recomputed from its token (correctness-safe).
- lr-engine.js + scripts/lr-engine.check.js: clock easy was ONE form (angle at H:00) -> five exam forms (H:00/H:30
  angle, minute-hand and hour-hand degrees); independent-recompute branches added. 40-draw variety probe 11/40 -> ~32/40.

### fix/lr(ADR-079): authored ring + long-option UI
- lr-authored-engine.js: on a pool smaller than the recent-id ring, never re-serve the immediately-previous item.
- drill-engine.js + css/style.css: .mcq-option wraps long text defensively; paragraph-length options (>48 chars, the
  new statement/decision distractors) left-align as prose via a .mcq-para modifier instead of centred labels.
```

**Docs:** DECISION_LOG (ADR-079 content-excellence note), VERSIONS (Bible 2.75→2.76), ROADMAP, README authored count.
**Verification:** full `npm test` green; stress harness 51,003 questions + 39,600 figures, **0 defects, 0 low-variety
tiers, 0 ring failures**. No new Firestore I/O, no new deps. **SW v160→v161.**

---

## 2026-06-30 — LR final production audit & stabilization (ADR-079 hardening)

Trust-nothing audit of the shipped LR overhaul (3 adversarial agents: integration-completeness · dead-code/
architecture · difficulty/authored-quality/docs), every claim re-verified against source. Verdict: production-grade
(green tests, 0 new Firestore I/O, all 25 categories integrated, docs counts exact, all 57 authored items defensible).
Targeted fixes only — no rebuild.

```
### fix/lr(ADR-079 hardening): visual difficulty now earned by reasoning
- lr-visual-engine.js: lr-dice was FLAT (ignored difficulty) → easy=opposite(7−top), medium=five hidden faces
  (21−top), hard=two dice bottoms (14−a−b). lr-mirror/lr-water cosmetic → easy 1 glyph, medium/hard 2/3-glyph STRINGS
  (a real mirror reverses glyph order AND flips each; water flips each, keeps order). lr-fseries → hard is an
  ALTERNATING two-step turn (not just a wider angle). lr-fanalogy hard → an unambiguous glyph reflection (a
  rotation-vs-reflection arrow analogy was rejected: ambiguous from one example — correctness > difficulty label).
- lr-engine.js: lr-io easy now queries position 2–3 (tests the swap, not just "find the smallest").
- scripts/lr-figures.check.js: independent recompute branches added for string-mirror order+flip, dice
  hidden-sum/two-dice, alternating series, glyph-reflection analogy.

### feat/lr(ADR-079 hardening): close the Learn teaching gap + balance authored tiers
- data/knowledge/lr.js: +3 gold-standard topics (Input-Output, Cause & Effect, Course of Action) so every drillable
  single-question LR category has teaching (42 → 45 published); learn-content/learn-browser counts updated.
- data/lr-authored/*: +7 easy items across cause/course/decision/statement/critical (57 → 64); easy/medium/hard less
  lopsided. Validator-gated.

### chore/lr(ADR-079 hardening): dead-code + SW
- Removed 4 unused public exports: LREngine._compose2/_codeOps, LRSetEngine._buildRaw/_perms (functions stay, used
  internally; the check harnesses are fully independent). SW v159→v160. Bible 2.74→2.75 (Arch unchanged).
- npm test green (19 suites); stress 51,004 questions + 39,600 figures, 0 defects.
```

## 2026-06-30 — Logical Reasoning Excellence: hybrid generative + authored + visual (ADR-079)

LR went from 7 flat-difficulty generators (~60–70% production-ready) to a 25-category hybrid platform across a
Foundation → Core → Advanced → Verbal/Critical → Visual syllabus, after a sourced study of the MBA/Banking/SSC LR
syllabus established that ~65% of high-frequency LR is procedurally generatable, ~25% needs authored content, ~10% is
visual. Generative stays the default; authored content is sanctioned where exam quality requires it (the deliberate
moat relaxation recorded in ADR-079). No Firestore migration, no new deps.

```
### feat/lr(ADR-079 P1): earned-difficulty generative core
- lr-engine.js restructured around per-tier archetype POOLS (difficulty from reasoning depth, not longer reading)
- blood: generative kinship via a verified _compose2 algebra (replaces 6 hard-coded compositions) + coded relations
- coding: + number-code, position-shift & reverse-shift ciphers; direction: + turn simulation; ranking: + interchange
- odd-one-out: + letter-pair (gap) + curated word-category; analogy: + letter + curated verbal; faculty-grade ordinals
- syllogism: + 3-statement / 4-term cases (Boolean-valid only); lr-engine.check: N-term model-checker + recompute

### feat/lr(ADR-079 P2): five new generatable topics
- lr-series (letter/alphanumeric/interleaved), lr-inequality (coded; transitive-closure verdict incl. Either-Or),
  lr-calendar (Zeller, leap years), lr-clock (angle + mirror time), lr-io (machine input selection-sort)
- all auto-roll-up under subject 'lr'; every subtype independently recomputed (calendar cross-checked vs JS Date)

### feat/lr(ADR-079 P3): puzzle SET engine
- js/lr-set-engine.js: constraint generator + brute-force solver → UNIQUE arrangement → 3–6 linked distinct-skill MCQs
  (seating row + floor stack via a vocab map). drill-engine set-mode extended to render MCQ options (LR sets are MCQ)
- scripts/lr-set-engine.check.js re-solves the human-facing clue TEXT over all N! arrangements → exactly 1 == solution

### feat/lr(ADR-079 P4): authored hybrid content subsystem
- data/lr-authored/schema.js (item schema + pure validateItem/validateBank) + 5 family banks = 57 premium items
  (Critical Reasoning, Statement, Cause-Effect, Course-of-Action, Decision Making) with teaching explanations
- js/lr-authored-engine.js self-registers authored categories into categoryGenerators (recent-id ring, searchable)
- drill-engine: explanation-display seam (shows 'Why this answer' on reveal); progress/questions: LR text-MCQ +
  authored items now bookmarkable in Review (DI/sets/visual still need context → excluded)

### feat/lr(ADR-079 P5): generative visual engine
- js/ui/lr-figures.js: reusable pure SVG render/describe (viewBox vector, dark-mode classes, role=img+aria)
- js/lr-visual-engine.js: deterministic mirror/water/dice/cube/figure-series/figure-analogy generators
- drill-engine: render q.figure above stem + figures inside MCQ option buttons; scripts/lr-figures.check.js

### feat/lr(ADR-079 P6): one-engine integration
- index.html: tiered LR Practice picker (Foundation&Core / Verbal&Critical / Visual) + 'Reasoning Set' card
- practice-modes.js startLrSet; app.js formatCategoryName resolves set/authored/visual labels
- scoring-service getAutoTip: teaching tips for all 25 LR categories + reasoning sub-skill key tips
- data/knowledge/lr.js: 10 new gold-standard Learn topics (32 → 42 published)
- subjects.js: subject 'lr' = union of core + set + authored + visual engine categories (derived-only)

### chore/docs+sw(ADR-079): SW v158→v159 (+9 LR assets precached); Bible 2.74 / Arch 2.53
- npm test green (lr-set-engine / lr-authored / lr-figures checks added); stress 51,002 questions + 39,600 figures, 0 defects
```

## 2026-06-30 — DI Engine validation & excellence pass (ADR-078 hardening)

Senior-architect verification + completion pass on the shipped DI overhaul: three adversarial audits (engine/datasets/
difficulty · set-mode DOM bug-hunt · Learn/docs/dead-code), findings triaged against the code, then targeted fixes +
the user-requested dataset-realism investment. Engine confirmed sound; no redesign.

```
### fix+feat/di(ADR-078 hardening): earned hard cross-series + ~40 realistic domains + horizontal bars
- di-engine.js difficulty: _multiQuestion no longer emits bare cross-series add (m_combined) / subtract (m_crossDiff)
  as "hard" (they are medium — the Sets engine already tiers them right). Hard now = m_pctDiff, m_ratioYear,
  m_seriesShare, m_combinedShare (grand-total share), m_trendCompare only. If none is clean the multi loop already
  falls back to the single-series hard primary, so the tier is never downgraded.
- di-engine.js datasets: ENTITY_THEMES 7→23 and TIME_THEMES 5→14 across ~40 realistic domains (states/population &
  crop, countries/exports, hospitals, e-commerce, telecom, power, tourism, railways, airports, insurers, funds,
  rainfall, factories, GDP, imports, digital payments…), with an optional per-theme range:[min,max,step] honoured by
  the dataset builders so numbers are domain-realistic. Caselet contexts 6→16 (banking/government/CAT narratives);
  the second group is now stated explicitly (no "the rest are" inference).
- di-charts.js: new _hbar single-series horizontal-bar path (spec.horizontal), back-compatible (specs without the flag
  render byte-identically); di-engine emits horizontal on ~40% of single-series di-bar charts. Renderer architecture
  (series model + shared helpers) untouched.
- Wording (faculty-grade): entity diff "exceed or trail"→"differ from"; ratio "express in simplest form a:b and enter
  a"; pctMore "differs … by what percent? (absolute value)"; reworded m_ratioYear / m_seriesShare / m_trendCompare;
  standardized "(to 1 decimal place)".
- drill-engine.js: savePracticeSession now records a DI set's real category (was 'mixed'). Per-question stats were
  already correct.
- scoring-service.js: tips for m_pctDiff / m_combinedShare / m_trendCompare.
- Tests: di-engine.check (new keys + recompute, 2400 samples 100% recomputed, earned-tier + no-easy-key-at-hard),
  di-charts.check (horizontal + back-compat), di-set unaffected. Stress: 8000 charts (489 horizontal) + 158 distinct
  titles, 0 defects. Full suite green. Zero new Firestore I/O / deps. SW v157→v158. Bible 2.72→2.73, Arch 2.51→2.52.
```

---

## 2026-06-30 — Data Interpretation Engine Overhaul: exam-accurate, multi-series, set-based (ADR-078)

A complete quality overhaul of the DI engine, grounded in a sourced exam-syllabus study. Goal: better questions, not
more — earned difficulty, authentic diversity, multi-series charts, and real exam-style SETS. No new subjects, no
Firestore migration, no new dependencies.

```
### feat/di(ADR-078): earned difficulty + archetypes + multi-series renderer + DI sets
- di-engine.js REBUILT around an explicit ARCHETYPES→tier table. Killed the dishonest hard:read fallback (a tier now
  constructs a clean in-tier question by design); retired the mislabeled single-% "project"; realistic data (dropped
  all-×10; time-series now trends with bounded continuity). New archetypes: rank, missing-value, ratio, contribution,
  weighted/overall growth, "by how much"; cross-series: m_combined/m_crossDiff/m_ratioYear/m_trendCompare/m_seriesShare.
- di-charts.js: back-compatible series[] + stacked model → grouped/stacked bars, multi-line, multi-column tables via
  shared SVG helpers (_legend/_seriesOf/_stackMax). Single-series specs render byte-identically. describe()/aria carry
  every series for AI-Explain grounding + screen readers.
- NEW di-set-engine.js: generateSet() → one shared dataset + chart + 3–6 progressive, distinct-skill questions,
  independent validation. Reuses DIEngine._datasets/_charts/_arch (no parallel data model).
- drill-engine.js: guarded diSet set-mode renders the shared context ONCE (persistent) and swaps only the question
  block per question, REUSING checkAnswer/recordAnswer/timers/results/exit. Single-question + Quant paths untouched
  (early-return guard). AI-Explain prepends caselet context for grounding. New 📊 DI Set practice mode (practice-modes.js
  startDiSet + index.html mode card). di-set-engine.js precached; loaded after di-charts.js.
- scoring-service.js getAutoTip: per-chart-type DI tips + per-archetype-key tips (reasoning + shortcut + the specific
  trap) — fixes the broken generic fallback for every wrong DI answer.
- data/knowledge/di.js: new "DI Sets & Multi-Series Charts" topic (grouped/stacked reading, set strategy, missing data,
  %-point trap). DI 5→6 topics, total 31→32.
- Analytics: derived-only — set answers ride existing categoryStats di-* keys (subjectRollup unchanged). No schema
  change, no new reads/writes/listeners, no new deps.
- Tests: NEW di-set-engine.check (4403 set questions, 100% recomputed, progressive+distinct-skill); di-engine.check
  rewritten (2400 samples, 100% recomputed, earned-tier + no-hard:read assertions, multi-series); di-charts.check
  multi-series. Stress: 6400 charts + 8771 set questions, 0 render defects. learn-content/browser counts → 32.
- SW v156→v157. Full suite green. Bible 2.71→2.72, Arch 2.50→2.51.
```

---

## 2026-06-30 — ADR-077 craftsmanship verification & production sign-off

Independent re-audit of the polish commit (`5e8b2e8`) treated as someone else's work. Three read-only audits
(polish-change verification · docs/versions/dead-code/Firestore · adversarial bug-hunt), each finding re-verified
against the live code. Result: all 8 ADR-077 changes correct; version coherence, precache, dead-code, Firestore and
the ~38k-assertion suite clean. Two minor fixes; one bug-hunt finding rejected with proof.

```
### fix/verify(ADR-077): showLoading interval self-termination + TECHNICAL_BIBLE header sync
- companion-ui.js showLoading(): the rotation setInterval now guards `document.body.contains(msg)` so it self-clears
  within one tick when the sheet is closed mid-load (X / backdrop / Escape / drag) instead of writing to a detached
  node until the caller's stop() fires. Source-level fix → benefits all callers (Coach/Insights/Planner); zero
  behavioural change while the sheet is open.
- TECHNICAL_BIBLE.md header synced (Doc 1.23→1.24, Arch 2.47→2.49, date 2026-06-30) — missed by the ADR-077 commit.
- REJECTED with proof: the bug-hunt's "stale MCQ .pressed leak". numpad.js _releaseOpts queries the LIVE DOM on the
  document-level pointerup/pointercancel (always fire on release) and clears every visible .pressed; the stale
  _activeOpt is a detached node used only for an identity check + no-op removeClass. .pressed cannot stick to a
  visible option. No change made.
- SW v155→v156 (companion-ui.js is a precached asset). Full npm test suite green. Bible 2.70→2.71, Arch 2.49→2.50.
```

---

## 2026-06-30 — QuantReflex V2 Final Craftsmanship Pass (ADR-077)

Premium polish, not redesign: identity + architecture preserved, no new features. Grounded in three read-only
craftsmanship audits (design-system · interactions/motion · Learn/QuanAI/IA/a11y) which converged that the product is
already premium; this ships only the focused, low-risk refinements they surfaced.

```
### polish(ADR-077): MCQ feel + a11y hardening + QuanAI parity + unified Speed-Aptitude copy voice
- MCQ (drill UX): css/style.css mcq-option → token-aligned & generous (padding .8/.7→.95/.9rem, radius 12px→
  var(--qr-btn-radius), gap .55→.6rem, font .98→1rem) + 640px max-width so options read as a tidy pair on tablet/
  desktop. New .mcq-option.pressed press-state (+ dark + reduced-motion); wired by a DELEGATED pointer listener in
  js/ui/numpad.js that toggles only the visual class (never grades/advances) → parity with the numpad key feel.
- A11y: companion-ui.js modal gains Escape-to-close + tabindex + focus-into-dialog + focus-restore on each new turn;
  index.html category picker wraps each subject in <div role="group" aria-labelledby> (+ .category-group spacing rule
  to preserve the inter-group rhythm the old sibling selector gave); onboarding.js goal buttons expose aria-pressed;
  stats-view.js 7-day sparkline gains role="img".
- QuanAI: companion-ui blockHTML now applies \n→<br> to 'say'/'callout' (parity with 'card'); Companion.showLoading
  exported and reused by planner-view.js open() so opening an existing plan shows the same staged shimmer as Coach/
  Insights (perceived-performance parity) instead of a flat "Loading…" line.
- Copy (one voice, evolve not replace): onboarding intro + Learn line + About mission moved from Quant-only to the
  Quant/DI/LR spine, naming QuanAI, keeping the QuantReflex identity and Quant as the strongest pillar; LR picker hint
  aligned to DI's action tone.
- Declined (project constraints): no tokenisation of ~2,260 hardcoded colors; no rewrite of the V1 category-grid
  spacing (pre-V2 critical path, imperceptible gain). Documented as future recommendations only.
- SW v154→v155. Full npm test suite green (~38k assertions; no generator/derivation logic touched). Bible 2.69→2.70,
  Arch 2.48→2.49.
```

---

## 2026-06-30 — QuantReflex V2 Phase 4.5: integration verification & stabilization audit

Whole-repo, cross-subject re-read of Phases 1–4 treated as someone else's code (assume mistakes exist, try to break it).
Three read-only audit agents (dead-code/duplication, cross-subject consistency, QuanAI/analytics/Firestore/perf/docs)
plus direct re-reads of the hot paths. **No functional regressions found** — every cross-subject path flows through one
shared seam, and the audit's "MAJOR" candidates were all false positives, verified against the code.

```
### chore/audit: Phase 4.5 stabilization — false-positive triage + stale-doc fix (no client code touched)
- Verified renderQuestion() (drill-engine.js:159) rebuilds the WHOLE container per question → findings 1.1 (MCQ→numeric
  numpad loss), 3.1 (input stays disabled), 8.1 (skip stuck disabled), 1.2 (double-tap race) are all FALSE.
- Verified .di-chart-svg{width:100%;height:auto} + viewBox/preserveAspectRatio (style.css:11016) → 2.1 chart overflow
  FALSE; chart text uses CSS classes with body.dark-mode overrides (11025-27) → 2.2 dark-repaint FALSE.
- Verified _mixedAptitudeTopics() runs at click time after engines load (practice-modes.js:84) → 5.1 quant-only
  fallback FALSE; Mixed is non-adaptive (75) → 10.1 FALSE; formatCategoryName cascades quant→DI→LR (app.js:311) → 6.1
  FALSE; long MCQ options get mcq-wide→grid-column:1/-1 (190/10980) → 7.1 already handled.
- Every data/knowledge/* topic maps to ONE specific drillCategory across all 3 subjects (Quant percentages, DI di-bar,
  LR lr-coding) → 4.1/4.2 "too narrow" is consistent-by-design, not a bug. Kept test-only subject/registry exports
  (deleting them would gut coverage) and app.js short labels (consolidating changes labels app-wide = regression risk).
- ONLY real defect: ARCHITECTURE.md header was stale (ADR-070/SW v143) → refreshed to the 3-subject spine, ADR-076,
  SW v154. Docs-only → no SW bump. Full npm test suite green (~38k assertions). Bible 2.68→2.69, Arch 2.47→2.48.
```

---

## 2026-06-30 — QuantReflex V2 Phase 4: Unified Aptitude Intelligence (ADR-076)

The final V2 phase — integration & polish (no new subjects). Make Quant/DI/LR feel like one platform with QuanAI at the
core, built on ONE cross-subject derivation. No Firestore migration, no new dependency.

```
### feat/unify(ADR-076): cross-subject rollup + QuanAI + analytics + Mixed mode + identity (V2 Phase 4)
- data/statMath.js: NEW subjectRollup(stats, subjectCats) + weakestSubject(...) in the ONE derivation layer. Pure
  (subject→categories map PASSED IN → stays dependency-free); derived on read from categoryStats, no subjectStats.
- QuanAI cross-subject: studentProfile.build adds ctx.masteryBySubject + ctx.weakestSubject; serialize() emits a
  "SUBJECTS: Quant·DI·LR" line + one "coach across subjects" instruction → Coach/Insights/Planner/Chat (all read the
  same serialize) connect subjects with no duplicate prompts. aiPrompts persona unified to "Speed Aptitude mentor".
- Unified analytics: stats-view renders an "aptitude by subject" breakdown above the per-category list (same rollup,
  reuses cat-bar/strength styling, shown once a 2nd subject has data) — overall→subject→category, no new screen.
- Mixed Aptitude: new one-tap practice mode (12 Qs, balanced cross-subject spread via generateMultiTopic).
- Identity: meta/hero/About/manifest/share copy → "Speed Aptitude" (kept feature-specific "Mental Math Tricks").
- Regression-audit fix: computeSessionInsight now labels via formatCategoryName (was a Quant-only map leaking raw
  di-bar/lr-syllogism ids post-session); removed that duplicated label map. Button label "Ranking & Order"→"Ordering".
- SW v152→v154 (v154 = final-audit polish: Stats subject-breakdown bar colour + label now use the same pct cuts as
  the category list, so the two adjacent lists read identically). subjects.check +7 rollup assertions. Full suite green.
```

Docs kept in sync: [DECISION_LOG.md](DECISION_LOG.md) (ADR-076), [TECHNICAL_BIBLE.md](TECHNICAL_BIBLE.md), [ROADMAP.md](ROADMAP.md)
(Phase 4 shipped — V2 complete), [FIRESTORE_BLUEPRINT.md](FIRESTORE_BLUEPRINT.md) (subject rollup derived, no schema change),
[VERSIONS.md](VERSIONS.md) (Bible 2.67→2.68, Arch 2.46→2.47), [README.md](README.md).

## 2026-06-30 — QuantReflex V2 Phase 3: generative Logical Reasoning engine + MCQ support (ADR-075)

LR completes the Speed-Aptitude spine. 7 procedurally-generated topics reusing the whole pipeline; the only new
capability is multiple-choice input (conditional). No new deps, **no Firestore migration**.

```
### feat/lr(ADR-075): generative Logical Reasoning + MCQ (V2 Phase 3)
- NEW js/lr-engine.js: 7 generators — Coding-Decoding, Blood Relations, Direction Sense, Ranking & Ordering, Odd One
  Out, Analogies, Syllogisms. Numeric (numpad) where natural; MCQ otherwise. Genuine easy/medium/hard. Syllogisms use
  curated convention-independent logic, re-verified by an independent 256-region set-logic model-checker. Self-
  registers into questions.js categoryGenerators; OUT of the random Quant pool + OUT of duels.
- js/drill-engine.js: MCQ support — q.options[] ⇒ option buttons replace the numeric input, numpad suppressed, Submit
  hidden (tap=submit); reuses the EXACT grader/feedback/recordAnswer/Next; marks correct/wrong on answer. Numeric
  Quant/DI untouched. js/questions.js: LR excluded from Review Mistakes.
- data/subjects.js: register the 'lr' subject (categories lazy from lr-engine — no duplicated list).
- Practice picker (index.html): third grouped section "Logical Reasoning" (7 buttons), no new tab.
- Learn: NEW data/knowledge/lr.js (LR category + 7 gold-standard topics, deep-linking to LR drills); hub groups by subject.
- QuanAI/analytics: studentProfile.label (server) + formatCategoryName (client) fall back to LR labels; LR rides
  categoryStats. Duels: LR fenced out this phase (numeric LR is duel-ready in principle; MCQ needs a schema change).
- CSS: .mcq-options grid + states (light+dark, reduced-motion safe; colour-blind ✓/✗ indicator). SW v149→v152
  (+ precache lr-engine.js, lr.js).
- TESTS: NEW scripts/lr-engine.check.js (15512 assertions, incl. odd-one-out uniqueness); extended subjects/learn-
  content/learn-browser (Learn 24→31 topics, 7th category). Full suite green.
- Independent-audit fixes (post-ship): odd-one-out now enforces a SINGLE valid misfit at generation (was: ~50% of
  sets had a second defensible answer → grader could mark a correct pick wrong); guarded an MCQ null-deref
  (`ui.answerInputEl.disabled` threw on every option answer — core flow survived but it was an uncaught exception);
  MCQ feedback is now an aria-live region + the option `data-opt` escapes quotes (latent hardening).
```

Docs kept in sync: [DECISION_LOG.md](DECISION_LOG.md) (ADR-075), [TECHNICAL_BIBLE.md](TECHNICAL_BIBLE.md), [ROADMAP.md](ROADMAP.md)
(Phase 3 shipped), [FIRESTORE_BLUEPRINT.md](FIRESTORE_BLUEPRINT.md) (categoryStats gains lr-* keys; still derived),
[VERSIONS.md](VERSIONS.md) (Bible 2.66→2.67, Arch 2.45→2.46), [README.md](README.md).

## 2026-06-30 — QuantReflex V2 Phase 2: Data Interpretation engine (generative) + Practice/Learn/AI (ADR-074)

DI as a first-class, generative Speed-Aptitude subject — reusing the whole existing pipeline. No static banks, numeric
clean answers, lightweight SVG charts, no new dependencies, no new navigation, **no Firestore migration**.

```
### feat/di(ADR-074): Data Interpretation engine + Practice + Learn + QuanAI (V2 Phase 2)
- NEW js/di-engine.js: generators for 5 DI families (bar/line/pie/table/caselet); genuine easy(lookup)/medium(2-step)/
  hard(interpretation); answers ALWAYS numeric + clean (retry-until-clean). Self-registers into questions.js
  categoryGenerators (same dedup/difficulty/focus/custom/timed/adaptive pipeline). Kept OUT of the random Quant pool
  and OUT of duels (server never requires it). 1800 questions independently recomputed in tests.
- NEW js/ui/di-charts.js: dependency-free responsive SVG (bar/line/pie) + HTML table; on-chart value labels; role=img
  + data-rich aria-label; XSS-escaped. Plus describe() → text summary used to ground AI Explain.
- js/drill-engine.js: ONE hook renders q.chart above the stem (grading/numpad/feedback reused); DI Explain prepends
  the chart data. js/questions.js: DI excluded from Review Mistakes (no stored chart to replay).
- data/subjects.js: register 'di' subject (categories sourced lazily from di-engine — no duplicated list).
- Practice picker (index.html): grouped into "Quantitative Aptitude" + "Data Interpretation" — one picker, no new tab.
- Learn: NEW data/knowledge/di.js (DI category + 5 gold-standard topics, deep-linking to DI drills); learn-view hub now
  GROUPS categories by subject (activates the Phase-1 seam).
- QuanAI/analytics: studentProfile.label (server) + formatCategoryName (client) fall back to DI labels so Coach/
  Insights/Stats name DI categories ("Bar Graphs"); DI per-category mastery flows through categoryStats automatically.
- CSS: DI chart/table + subject-group/label styles (light+dark, reduced-motion safe).
- index.html + service-worker.js (v147→v149): load/precache di-engine, di-charts, di.js (v149 = pie-label
  contrast + biggestJump wording polish from the independent audit).
- TESTS: NEW scripts/di-engine.check.js (full answer recompute) + scripts/di-charts.check.js; extended subjects/
  learn-content/learn-browser checks (Learn 19→24 topics, 6th category). Full suite green.
```

Docs kept in sync: [DECISION_LOG.md](DECISION_LOG.md) (ADR-074), [TECHNICAL_BIBLE.md](TECHNICAL_BIBLE.md),
[ROADMAP.md](ROADMAP.md) (Phase 2 shipped), [FIRESTORE_BLUEPRINT.md](FIRESTORE_BLUEPRINT.md) (categoryStats gains di-*
keys; still derived), [VERSIONS.md](VERSIONS.md) (Bible 2.65→2.66, Arch 2.44→2.45), [README.md](README.md).

## 2026-06-30 — QuantReflex V2 Phase 1: Speed-Aptitude subject layer (derived) + Learn integration (ADR-073)

Foundation for the Quant → Data Interpretation → generatable Logical Reasoning spine. Makes the architecture
subject-first **internally** with **zero user-visible change** (only Quant has content). Subject is a derived lens over
the existing 14 categories — **no Firestore migration, no stored `subjectStats`.**

```
### feat/architecture(ADR-073): derived subject layer + Learn integration (V2 Phase 1)
- NEW data/subjects.js: the ONE subject registry + derived subject↔category map. Declares only Quant (the subject with
  content); DI/LR join with their generators in Phases 2-3. Subject is DERIVED on read from categoryStats — no
  subjectStats field, no migration. Quant's category set is resolved from quantTopics.CATEGORY_LABELS (no duplicated
  list). Helpers: subjects(), subject(id), label(id), categoryToSubject(cat), subjectToCategories(id); pure + total
  (unknown → null/[]) + defensive copies.
- services/quantTopics.js: converted node-only module.exports → dual-export IIFE (window.QuantTopics) so subjects.js can
  derive Quant's categories in the browser too. Server require() shape unchanged.
- js/knowledge/registry.js: registerCategory stores meta.subject; categories() projects it; new bySubject(id) +
  categoriesBySubject(id) (mirror byCategory). data/knowledge/categories.js: all 5 Learn categories tagged subject:'quant'.
- Learn hub rendering UNCHANGED this phase (single subject ⇒ identical output); subject grouping UI lands in Phase 2
  with DI, where it both renders and is testable (avoids a dormant/untested branch).
- index.html: load services/quantTopics.js then data/subjects.js in the data layer. SW v146→v147 (+ precache both).
- TESTS: NEW scripts/subjects.check.js (26 assertions: 14 categories → exactly one known subject; subjectToCategories
  (quant) = quantTopics keys; helpers pure/total/copy-safe). Extended learn-content.check.js (every Learn category
  declares a known subject; bySubject/categoriesBySubject verified). Full suite green.
```

Docs kept in sync: [DECISION_LOG.md](DECISION_LOG.md) (ADR-073), [TECHNICAL_BIBLE.md](TECHNICAL_BIBLE.md) (14 categories
reframed as the Quant subject), [FIRESTORE_BLUEPRINT.md](FIRESTORE_BLUEPRINT.md) (subject is derived, never stored),
[ROADMAP.md](ROADMAP.md) (V2 Phases 2-4), [VERSIONS.md](VERSIONS.md) (Bible 2.64→2.65, Arch 2.43→2.44).

## 2026-06-29 — Final security lockdown: single-active-device sessions + auth hardening (ADR-072)

Final pre-launch security audit (3 adversarial agents). Verified already-solid: Premium cannot be forged
(server-authoritative entitlement + HMAC-verified payments + downgrade-only rules + admin-only grant) and no secret is
client-reachable (server-only env, no git leak, no source maps, SW caches static only). Closed the genuine gaps.

```
### feat/security(ADR-072): single active device + token-revocation + input cap
- Single active device (newest-login-wins): server-written users/{uid}.activeSessionId (Admin-SDK only; firestore
  rules entitlementFieldsSafe() now deny client writes to activeSessionId/activeSessionAt). New js/session.js owns a
  stable per-device id (localStorage qr_session_id, shared across tabs) sent as X-Session-Id on EVERY authed request
  (all 9 fetch sites updated — a missing header would 409 the legit active user). aiService.resolveUserAuth does the
  SINGLE user-doc read withAuth already did and returns {premium, activeSessionId} → middleware 409s SESSION_REPLACED
  on mismatch (no extra Firestore read). New api/session.js?action=claim (withAuth skipSession) lets a fresh device
  claim + displace others; claim runs BEFORE the firestore-sync root-doc listener starts (no self-eviction). Client:
  listener + 409 handler route a displaced device to one graceful sign-out (app.js shows a "opened on another device"
  toast). Lockout-safe: enforce only once a session is claimed (no deploy-time mass logout).
- Token revocation: admin.auth().verifyIdToken(idToken, true) in main-app aiService + super-admin middleware (was
  missing; coaching-admin already did it) — disable/delete propagates immediately, not after ~1h.
- Input cap: ai.js _chat userTurn capped to 400 chars (was uncapped).
- Declined (recommendations): Firebase App Check; refund/chargeback auto-revoke webhook (manual super-admin revoke
  exists). Client-only cosmetic gates left (no money/secret).
- Verify: cd main-app && npm test green; node --check all touched/new JS; independent reject-it security audit: NO
  DEFECTS (lockout-safety, can't-forge-session, header-omission-still-409, no extra read, no listener leak). SW
  v145→v146.
- Docs: DECISION_LOG (ADR-072), FIRESTORE_BLUEPRINT 1.13→1.14 (activeSessionId/activeSessionAt fields),
  SECURITY_ARCHITECTURE, VERSIONS (Bible 2.63→2.64, Arch 2.42→2.43, Firestore 2.20→2.21, Security 2.14→2.15), ROADMAP.
```

---

## 2026-06-29 — Ecosystem Firestore audit + targeted hardening (ADR-071)

A full senior-Firebase-architect audit of all three apps (one shared Firestore project) verified the architecture is
production-grade — all 26 composite indexes used, every collection ruled + default-deny, server-authoritative
entitlements/duels/AI-memory, no leaked listeners, intentional layered caches, schema doc matches reality. Only three
small, verified improvements were warranted (≈2–3k-user scale; student responsiveness wins).

```
### perf/cleanup(ADR-071): aiDaily TTL + prune; remove unread profile/data dual-write; legacy-orphan cleanup script
- aiDaily TTL: aiBrain._putDaily now stamps expiresAt (now+48h) on the per-day Coach/Insights cache; super-admin
  cron/sweep.js gains a paged, non-fatal prune of aiDaily where expiresAt < now (mirrors the aiRequests pattern;
  single-field range → auto-indexed, no composite). Bounds the one unbounded accumulator. A 48h buffer can't expire a
  still-readable same-day cache.
- Removed users/{uid}/profile/data dual-write: verified zero readers across all three apps (every consumer reads the
  root users.profile map + root plan fields). Deleted firestore-sync.js _syncProfileSubcollection + its 3 call sites
  + the seed write + header comment. KEPT the defensive account-deletion delete of the profile subcollection.
  performance/overall + practice/data were verified ACTIVELY read by the coaching Student-360 detail and are untouched.
- New firestore/migrations/2026-06-29-cleanup-legacy-orphans.js: dry-run-by-default, --apply to delete, paged/batched,
  idempotent. Wipes verified-orphaned legacy collections (aiMissions, aiCoachV2, aiInsightsV2, duelInvitations), stale
  aiDaily (missing/past expiresAt), and legacy profile/data per-user docs (strict id match). usage/wordProblems is
  intentionally NOT targeted — it has a live lazy-migration reader (aiService._loadUsage folds it into the canonical
  usage/ai), so it self-resolves and deleting it could zero a legacy user's quota counters. Operator-run (no live
  Firestore change made by this commit).
- DECLINED a permanent Super-Admin orphan-scanner / collection-delete UI (fixed orphan set; ongoing cleanup already
  automated; always-on delete surface is disproportionate risk at this scale — ADR-071).
- Verify: cd main-app && npm test green; node --check on every touched/new JS; user-schema.json valid; re-grep proves
  zero profile/data readers + zero runtime refs to the legacy collections. SW v144→v145.
- Docs: DECISION_LOG (ADR-071), FIRESTORE_BLUEPRINT 1.12→1.13 (profile/data removed, aiDaily.expiresAt + prune),
  VERSIONS (Firestore 2.19→2.20, Bible 2.62→2.63), ROADMAP, schema-docs, seed README, shared/schemas/user-schema.json.
  No rules/index/schema-redesign change; no UX-affecting read change; no new deps; Architecture unchanged (2.42).
- Final release audit (2 independent adversarial agents): verified the changeset production-safe (profile/data removal
  complete, aiDaily TTL sound, no missed accumulator, cleanup script safe, rules coherent, indexes/docs consistent).
  One nit fixed: a stale comment in firestore.rules still listed the removed `profile` subcollection (rule logic was
  already correct). No version/SW bump (comment-only).
```

---

## 2026-06-28 — QuanAI production-readiness hardening (ADR-070 follow-up)

A 13-phase production-readiness verification (three independent adversarial audits — correctness/regressions,
branding+UX+docs, code+repo health) found the QuanAI ecosystem production-ready: zero code defects, all 9 suites green,
branding consistent, docs accurate, no regressions. This change implements ONLY the genuine hardening items surfaced;
the optimized architecture is left intact. Two audit flags were verified false positives (the `op:reset` doc entry
already exists; `plannerReset` already returns `ok:false` on delete failure).

```
### fix(ADR-070 follow-up): Start-over confirm a11y + plannerReset fail-fast + test + doc freshness
- Confirm-dialog a11y (planner-view.js startOver): default focus moved from the destructive "Start over" button to
  Cancel (a stray Enter/Space can no longer trigger the irreversible reset); focus RETURNS to the opener element on
  close (Cancel/Escape/overlay-click/success all route through close()); added aria-describedby pointing at the body
  so screen readers announce the deleted/kept lists; background scroll locked while open by reusing the existing
  body.modal-open { overflow:hidden } rule (no new CSS). No visual redesign.
- plannerReset fail-fast (aiBrain.js): on a real delete failure (permissions/network) the function now returns
  { ok:false } BEFORE clearing the exam-config memory mirror — so a transient error can't leave Coach/Insights
  exam-blind while the plan still exists. The client already shows retry on ok:false; nothing changed server-side, so
  the retry is clean. Happy path unchanged.
- Test (planner-brain.check.js): the firestore stub's delete() now rejects for a sentinel uid (/resetfail/); new
  assertions prove a failed delete → { ok:false }, the aiPlanner doc stays intact, and updateMemory is NOT called to
  clear the exam mirror (fail-fast held). 103→107 assertions, all green.
- Doc freshness: TECHNICAL_BIBLE "Last updated" 2026-06-24 → 2026-06-28 (Arch 2.42 already correct).
- Verify: npm test green (all suites); node --check on touched JS; CSS braces balanced. SW v143→v144.
- Docs: DECISION_LOG (ADR-070 hardening addendum), VERSIONS (Bible 2.61→2.62, Arch unchanged 2.42). No prompt/cache/
  schema change; no new deps.
```

---

## 2026-06-28 — QuanAI cohesion pass: Planner Start Over + perceived performance + natural branding (ADR-070)

A focused pass after a full read-only audit of the QuanAI stack found it already mature/optimized (the owner chose
"focused high-value", no prompt/cache rewrites; ~2–3k users). Three deliverables; the optimized architecture (caching,
deterministic-first, structured outputs, dedup, tier-0 skip) is left intact.

```
### feat(ADR-070): Planner Start Over; perceived-performance thinking states; natural QuanAI branding
- Planner Start Over (headline): three distinct, non-overlapping actions — Adjust (reopen setup wizard, PRESERVE the
  plan), Rebuild my plan (the SINGLE regeneration workflow, op:regen — archive block + re-derive a fresh 14-day
  projection from current progress; now a persistent footer action, not only end-of-block), and a NEW fully
  destructive Start over (op:reset). Server: api/ai.js _planner gains op:'reset'; aiBrain.plannerReset(uid) deletes
  aiPlanner/{uid} and clears ONLY the mirrored exam-config aiMemory fields (examName/examDate/goal/dailyMinutes) via
  the existing updateMemory — practice stats, categoryStats, mistakes and durable learning memory (wins/timeline/
  preferredDepth/knownWeakConcepts/recentTopicsExplained) are preserved. With the exam cleared, examStrategy.assemble
  returns null so Coach/Insights degrade to exam-agnostic coaching (ADR-057 "never dumber"). Client (planner-view.js):
  a de-emphasized, hairline-separated "Start over" link opens a centered confirm overlay (reuses the shared
  paywallScaleIn modal motion; z above the companion sheet) that ENUMERATES exactly what is deleted vs. what stays
  (no silent loss); on confirm → op:reset, clear localStorage.qr_active_exam, stamp qr_ai_dirty_at, reopen the setup
  wizard. settings-style destructive-confirm precedent reused conceptually.
- Perceived performance (reuse-only): companion-ui.js showLoading now leads with a personalized "QuanAI is reviewing
  your 78% accuracy and 5-day streak…" line built from the real local stats the client already holds (no extra fetch,
  no logic duplication), then rotates into the existing feature stages; falls back to generic copy for brand-new
  users. No streaming/SSE, no prefetch (cost/quality balance) — instant-open env-cache + staggered reveal already
  cover the "started immediately" feel.
- Natural QuanAI branding (understated): App Guide AI section reframed as "Powered by QuanAI" (engine intro), About
  modal AI lines name QuanAI, the three AI paywall lock messages name QuanAI, and the planner empty/onboarding state
  introduces it once. Generic CTAs ("Talk to your coach", "Generate Plan") kept for clarity; QuanAI casing unchanged
  (ADR-043) — no third spelling introduced.
- Cleanup: stale studentContext.js filename references in 6 service-comment headers corrected to studentProfile.js
  (post-rename). The historical root AUDIT-REPORT-QUANAI.md and the staged Word-Problems server path are left intact
  (neither is dead code).
- Tests/verify: planner-brain.check.js extended (+ firestore-stub delete(), updateMemory capture) with a plannerReset
  assertion proving the doc is deleted, plannerGet → null, the exam-config memory mirror cleared, durable memory kept
  (103 passed). Full npm test green; CSS braces balanced; node --check on every touched JS. SW v142→v143.
- Docs: AI_INTERACTION_SYSTEM (three planner actions + reset op + thinking states), DECISION_LOG (ADR-070), VERSIONS
  (Bible 2.60->2.61, Arch 2.41->2.42), main-app/ARCHITECTURE.md. No prompt/cache-architecture change; no new deps; no
  Firestore schema/index change (existing-collection delete).
```

---

## 2026-06-28 — Cross-app modal cohesion + grep-verified CSS cleanup (CSS + 1-line JS)

A verification + consistency pass (no redesign, no new features, no new deps; ~2–3k-user sizing). Two read-only
inventory agents confirmed the prior Battle Archive modal + Learn-hub hierarchy are present/correct, so this pass is
small and high-signal: fix the one genuine "feels like a different app" outlier and do the requested dead-code cleanup.

```
### refactor: unify info-modal motion (center + scale-in); focus-ring consistency; remove grep-verified dead CSS
- Info modal cohesion: the About / App-Guide info modal slid in from the RIGHT as a side panel while every other
  modal (paywall, table, Battle Archive, coming-soon) centers + scale-ins — the #1 inconsistency a reviewer flags.
  css/style.css: .info-modal-overlay now flex-centers (align/justify center + 1rem padding); .info-modal-content
  converted from a right-anchored 480px panel to a CENTERED CARD — position:relative, width:min(560px,100%),
  max-height:92vh, margin:auto, border-radius var(--qr-card-radius), reuses the shared paywallScaleIn keyframe
  (not duplicated); inner .info-hero sticky + .info-modal-scroll unchanged (still fills the card + scrolls on small
  phones). The .closing slide-out drops to animation:none (the overlay's infoModalFadeOut carries the exit). JS:
  settings.js openInfoModal's one show line changes block->flex so the overlay actually flex-centers the card on open
  (the inline display:none default + the .closing/Escape/sound close logic are unchanged).
- Focus-ring consistency: .collapsible-header:focus-visible used outline-offset:-2px (inset) — the lone outlier
  among ~30 rings at +2px. Now +2px so keyboard focus looks identical app-wide.
- Repo cleanup (zero behavior change, grep-verified 0 var()/ref consumers): removed 4 unused custom properties
  (--qr-accent-soft, --sp-xl, --sp-2xl, --qr-card-gap); removed the now-dead infoModalSlideIn/infoModalSlideOut
  keyframes; removed the shadowed duplicate @keyframes duelPulse (6926, opacity-only) — the later opacity+scale
  definition (9964) already won globally for all three consumers, so deletion is a pure no-op.
- Verification: CSS braces balanced (3126/3126); npm test green (all suites); grep proves 0 infoModalSlideIn/Out
  refs, 0 removed-token refs, single @keyframes duelPulse, paywallScaleIn present.
- Docs synced: VERSIONS (Bible 2.59->2.60, Arch unchanged — UI/CSS-only), DECISION_LOG (consistency note),
  service-worker.js SW v141->v142.
```

---

## 2026-06-28 — Premium UI polish: Battle Archive → centered modal + Learn hub hierarchy (reuse-only)

A UI/UX refinement pass — no new features, no new deps (sized for ~2–3k users; "less UI, more quality"). Two named
deliverables; the rest of the brief's app-wide aspiration was consciously scoped to reuse-only touches (the app
already passed several premium audits — churning every screen adds risk for little gain).

```
### refactor(ADR-068)/feat: Battle Archive centered modal; Learn hub hierarchy + blue accent tokens
- Battle Archive: was an inline expandable section inside the Home duel bento card (cramped). Now the duel card hosts
  a compact "⚔️ Battle Archive · N" trigger that opens a CENTERED PREMIUM MODAL. Presentation-only refactor of
  js/duel-archive.js: _toggle/_renderHeader/_renderExpanded -> _renderTrigger/_openModal/_closeModal/_loadAndPaint;
  the data/cache/filter/pagination/aggregate-math layer (and scripts/duel-archive.check.js, 45 assertions) is
  UNCHANGED. The modal REUSES the paywall shell language (rgba dim + backdrop blur, paywallScaleIn/FadeIn/FadeOut
  keyframes — not duplicated), body.modal-open scroll-lock, Escape + overlay-click close, focus-to-title on open and
  return-to-trigger on close; width min(760px,100%), max-height 90vh, sticky glass header — scales phone->desktop.
  Free users unchanged (nothing rendered). css/style.css: .ba-toggle/.ba-section.is-open reveal removed; .ba-open
  trigger + .ba-modal-* shell added; all other .ba-* (stats/rivalry/filters/cards/achievements) re-home into the
  modal unchanged; stale reduced-motion selector updated to the modal.
- Learn hub hierarchy: one calm header language — a subtle blue accent bar (::before) on .kx-cat-title and a new
  .kx-hub-head used by the "Quick Reference" and "Your Topics" headings (index.html), each with a single faint top
  hairline (--qr-card-border-light) + ~1.9rem breathing room, so the three major groups read as distinct WITHOUT
  divider-lines-everywhere. No rainbow, no gradients.
- Shared cleanup: canonical --qr-accent (#2563eb / dark #60a5fa) + --qr-accent-soft tokens in :root/body.dark-mode;
  used by the new Battle-Archive + Learn accents. Existing hard-coded #2563eb usages left as-is (no churn).
- Consciously out of scope (lightweight): no app-wide restyle of Home/Practice/Planner/Settings, no card-radius
  unification, no modal-util abstraction, no skeletons where render is synchronous.
- Service worker v140 -> v141. Docs: VERSIONS (Bible 2.58->2.59, Arch 2.40->2.41), DECISION_LOG (ADR-068 follow-up),
  TECHNICAL_BIBLE arch header.
- Verified: node --check duel-archive.js + learn-view.js; CSS braces balanced (3135/3135); npm test green
  (duel-archive.check 45, learn checks unchanged); zero stale ba-toggle/_expanded refs.
```

---

## 2026-06-28 — Verification pass: Word Problems "Coming soon" consistency + honest Speed Benchmark copy

Self-audit of the prior About/Guide/pricing pass surfaced two truthfulness issues (no pricing change). Client copy
only; no schema/gate/architecture change.

```
### fix: present Word Problems as "Coming soon" everywhere; soften Speed Benchmark claim
- Word Problems is intentionally staged (practice-modes.js opens showComingSoon; Practice card has a "Coming soon"
  pill; Duel pill "· Soon"), but the refreshed copy presented it as live. Fixed:
  - index.html About modal (Platform Features "🤖 AI Word Problems (coming soon)"; Premium "with AI Word Problems
    coming soon"); App Guide (Practice Modes + Premium AI features now carry a "Coming soon" badge; FAQ says
    "plus AI Word Problems, coming soon").
  - js/paywall.js: removed the misleading "AI Word Problems · 5 lifetime / 30 per day" comparison row, and swapped
    the "AI Word Problems" value card for the live "Review Mistakes" — the paywall now advertises only features that
    work today. (Compare table 14→13 rows; 7 value cards unchanged in count.)
- Speed Benchmark honesty: the percentile is computed locally per session (scoring-service.js), not a real
  cross-user cohort. Softened About + Guide copy from "ranks/stacks up against other users" / "performance rankings"
  to "a per-session speed score that tracks how your pace is improving."
- Service worker v139 -> v140. Docs: VERSIONS (Bible 2.57->2.58).
- Verified: node --check js/paywall.js; CSS braces balanced (3118/3118); npm test green; zero ₹599/59900 in
  current-state files; no remaining "against other users" copy; no user-facing surface implies Word Problems is live.
```

---

## 2026-06-28 — Pricing ₹599→₹499 (12-month) + About/Guide/ecosystem refresh

Product-consistency pass (no architecture change, no new deps; sized for ~2–3k users). The 12-month Premium price
drops to ₹499 (synced across the server charge path, client display, and docs), and the About modal + App Guide are
brought up to date with the shipped product, including the three-app ecosystem.

```
### feat: 12-month Premium ₹599 -> ₹499; rewrite About + App Guide; ecosystem wording; light paywall polish
- Pricing (server is source of truth — charge constants updated, not just display):
  - shared/constants/entitlements.js PRICING.PREMIUM_12M 59900 -> 49900 (paise).
  - main-app/services/paymentService.js PLAN_CONFIG.premium_12m.amountPaise 59900 -> 49900 (the actual Razorpay
    charge) + doc comment.
  - main-app/services/aiService.js + super-admin-app/api/_lib/metrics.js PREMIUM_PRICE_PAISE.premium_12m -> 49900
    (revenue accounting / fallback).
  - main-app/js/paywall.js PLANS.premium_12m price 599->499, perMonth 50->42, "Save 14%"->"Save 28%", header comment.
  - index.html About + Guide-FAQ price lines ₹599 -> ₹499.
  - Docs: PAYMENT_ARCHITECTURE (table/derived/paise), FIRESTORE_BLUEPRINT (fallback map), ENTITLEMENT_SYSTEM,
    TECHNICAL_BIBLE, super-admin ARCHITECTURE_MASTER_GUIDE. Verified zero ₹599/59900 remain in current-state files;
    no test asserts the amount. Durations/plan-keys/gates/Razorpay-flow unchanged.
- About modal (index.html) rewritten to today's product: Learn Knowledge Engine (19 topics / 5 categories, search,
  saved topics, spaced revision, "Practise this"), responsive + offline PWA, and the three-app ecosystem (Student
  app links to a coaching institute via coaching ID; managed by the QuantReflex platform). Version 2.0.0 -> 2.1.0.
- App Guide (index.html): the Learn section fully rewritten to the hub->topic-pages model (search, ★ Save, Continue
  / Due-for-revision, Quick revision cheat-sheet, Practise this, Mark complete, Quick Reference, custom topics);
  removed the retired "Learn Vault" / "Quant Formulas list" / "Jump Navigation" wording. Added a "Getting around"
  block (swipe between tabs; horizontal rows scroll without switching tabs; shareable Learn links).
- Paywall polish: darkened the "Save 28%" and per-month text to WCAG AA (#15803d / #64748b) + dark-mode variants.
- Service worker v138 -> v139. Governance: VERSIONS (Bible 2.56->2.57, Payment 2.3->2.4), DECISION_LOG (pricing note).
- Verified: node --check the 5 changed JS files; CSS braces balanced (3118/3118); npm test green.
```

---

## 2026-06-28 — Learn content completion: last 5 topics → gold, scope now 19/19 (ADR-069)

Content-completion phase: authored the final 5 scaffold topics to full gold-standard depth and published them, so the
curated 5-category Learn scope has zero scaffolds / zero placeholder experiences. Reuses the knowledge-object schema,
renderers, search, progress, practice and navigation — no architecture change, no duplicated data. NO AI.

```
### feat(ADR-069): author Number Series, Ages, Mixtures, Partnership, Permutation & Combination to gold standard
- 5 topics flipped scaffold -> published with 10-11 sections each (overview, concepts, formula, speed trick, traps,
  2 worked examples, memory hook, revision): data/knowledge/numbers.js (number-series),
  data/knowledge/arithmetic.js (ages, mixtures-alligations), commercial.js (partnership),
  modern.js (permutation-combination). Existing metadata kept; searchTerms enriched.
- Math: every formula and worked example hand-verified AND independently re-computed by a second agent -> ZERO
  errors (e.g. 4,9,19,39,79->159; LEVEL=5!/(2!2!)=30; 8C3=56; alligation 30/45->40 = 1:2; 40L replace 8L twice =
  25.6L; partnership 8000x12:12000x6 = 4:3; ages 4:3 then 6:5 after 6y -> 12).
- Drill honesty: number-series gets a real "Practise this" (dedicated drill category); ages/mixtures/partnership/
  perm-comb keep drillCategory:null (no Practise button) rather than mapping to a related drill that would launch
  the wrong questions (same principle as the Pipes & Cisterns fix).
- Behaviour: former scaffold cards now navigate normally (no "Coming soon" toast/badge); topic pages render full
  sections; search/bookmark/complete/progress + Continue/Due/Saved strips all work for the new topics.
- Test: scripts/learn-content.check.js published-count assertion 14 -> 19; the gold-depth gate now validates all 19
  published (learn-content.check 161 -> 196). KB.count()===19 unchanged (scaffolds were already counted).
- Premium touch (restrained): one-time reduced-motion-guarded staggered entrance (kx-rise) on the <=5 hub category
  sections. Consciously NOT added: skeleton loaders (engine is synchronous), heavy scroll-reveal (distracting).
- Service worker v137 -> v138. Docs: VERSIONS (Bible 2.55->2.56, Arch unchanged), DECISION_LOG, ROADMAP,
  TECHNICAL_BIBLE (now "19 gold", Doc 1.18), main-app/ARCHITECTURE.md (SW v138).
- Verified: node --check the 4 data files; CSS braces balanced (3116/3116); npm test green; zero AI in Learn.
```

---

## 2026-06-28 — Learn ship-readiness fixes: focus, glass fallback, contrast, dedup, scroll (ADR-069)

Final adversarial production audit (two read-only Explore agents acting as reviewers trying to reject the PR). The
system was confirmed otherwise sound; 5 real low-risk issues fixed below, and ~6 flagged items were consciously
rejected as non-issues/anti-patterns (loading spinner for synchronous render; `.kx-revision` harmless wrapper;
intentional radius/shadow differentiation; gated/GC'd listeners; `.table-selector` is a grid not a scroller; app-wide
`.card` @supports out of scope). Client-only; scoped to Learn; no Firestore/Security/Payment/architecture change; NO AI.

```
### fix(ADR-069): route-change focus, glass @supports fallback, AA contrast, strip dedup, hub scroll restore
- Focus management (WCAG 2.4.3): renderLearnRoute now moves keyboard/SR focus to the topic <h1 class="kx-th-title">
  (given tabindex="-1") on topic open, and to the Learn heading (#learnHeading, tabindex="-1" in index.html) on hub
  return, via focus({preventScroll:true}). Mouse users get no ring (CSS :focus outline:none on those targets) and no
  scroll jump. Previously focus was stranded on the hidden element.
- Glass robustness: .kx-section-nav gained an @supports not (backdrop-filter) fallback to a near-opaque background
  (rgba .97) in light + dark, so on browsers without backdrop-filter the page no longer bleeds through the sticky nav.
- Contrast (AA): faint #64748b secondary labels — .kx-cat-count, .kx-cat-blurb, .kx-search-cat, .kx-status-scaffold,
  .kx-action-soon — darkened to #475569 (light); dark .kx-action-soon text #94a3b8 -> #cbd5e1.
- Hub strip de-duplication: _renderResume "Continue learning" now excludes ids already in "Due for revision" so the
  same topic can't appear in two strips; "★ Saved" stays authoritative (every saved topic shows).
- Hub scroll restoration: renderLearnRoute saves .container.scrollTop before opening a topic and restores it on hub
  return (module var _hubScroll), so Back from a topic returns to the prior reading position; topic open still
  starts at top.
- Service worker v136 -> v137. Docs: VERSIONS (Bible 2.54->2.55, Arch 2.39->2.40), DECISION_LOG, TECHNICAL_BIBLE
  (1.17), main-app/ARCHITECTURE.md (SW v137).
- Verified: node --check (learn-view.js, service-worker.js); CSS braces balanced (3109/3109); npm test green;
  zero AI refs in Learn.
```

---

## 2026-06-28 — Learn premium UX polish + 4 critical bug fixes (ADR-069)

Polish + bug-fix pass on the shipped Learn tab (no new features/widgets). Two Explore agents root-caused the four
reported bugs; all fixed at the source. Plus a bounded, token-based visual-polish pass. Client-only; scoped to
`.kx-*` / `body.view-learn-active`; no Firestore/Security/Payment/architecture change; NO AI.

```
### fix(ADR-069): swipe-vs-scroll, glass section-nav, real Save, Pipes practice; premium polish
- Bug #1 (root cause): swipe-nav.js listened on document with exemptions only for modals/inputs, so horizontally
  scrolling .kx-section-nav / .kx-resume-row cleared the 40px/0.25 swipe threshold and fired Router.showView()
  (tab switch). Fix: the touchstart denylist now also exempts [data-no-swipe], .kx-section-nav, .kx-resume-row,
  .kx-table-scroll (one line, established pattern). Resume rows also tagged data-no-swipe in learn-view.js.
- Bug #2: the sticky .kx-section-nav painted an opaque band (var(--qr-bg)/hard #0f172a) that read as a disconnected
  dark strip. Now subtle glass — translucent page-bg + backdrop-filter: blur(10px) (the same language as .card) —
  so it blends into the page; pills got a glassy surface, active-pill shadow, and a press scale.
- Bug #3: the topic "Save" toggled LearnProgress.toggleBookmark but nothing surfaced saved topics (dead UI). Now the
  hub renders a "★ Saved" strip from LearnProgress.bookmarkedIds() (reusing _stripHtml), and saving toasts.
- Bug #4: pipes-and-cisterns had drillCategory:'time-and-work', so "Practise this" launched the WRONG questions. Set
  drillCategory:null + drillComingSoon:true (data/knowledge/arithmetic.js); _buildActionBar now shows a
  non-interactive "Practice coming soon" chip instead. learn-content.check stays green (162->161; the drill
  assertion only runs for non-null drillCategory).
- "Soon" scaffold topics: dropped the muddy opacity:.72; now a softer dashed/inviting card surface + full-opacity
  title + "Coming soon" badge so they read as planned, not broken.
- Polish (token-based, reduced-motion-guarded): topic/resume card hover+press elevation; resume-strip right
  edge-fade (mask-image); glassy section pills; search input focus ring/radius; warmer placeholder. New :active
  transforms added to the reduced-motion guard lists.
- Service worker v135 -> v136. Docs: VERSIONS (Bible 2.53->2.54, Arch 2.38->2.39), DECISION_LOG (ADR-069 polish
  note), main-app/ARCHITECTURE.md (SW v136).
- Verified: node --check (swipe-nav, learn-view, arithmetic, service-worker); CSS braces balanced (3105/3105);
  npm test green; zero AI refs in Learn.
```

---

## 2026-06-28 — Learn final-review polish: a11y semantics + landscape-tablet layout (ADR-069)

Final production review of the (already-shipped, 96/100) Learn system. A fresh read-only multi-agent sweep found
the codebase clean — zero dead code, zero broken refs, integrations/premium/gating all correct, no regressions, no
AI — so nothing was broken. Two client-only quality elevations were made in the two areas the review weighted most:
accessibility semantics and the tablet (landscape) experience. No architecture/data/routing/Firestore change.

```
### feat(ADR-069): topic-page a11y semantics + landscape-tablet two-column layout (NO AI)
- A11y (js/views/learn-view.js, js/knowledge/blocks.js): section labels div -> <h2>; block heads
  (concept/formula -> h3; trick/trap/memory/example callout heads div -> h3) give a correct h1->h2->h3 outline.
  Breadcrumb -> <nav aria-label="Breadcrumb">; in-page section nav -> <nav aria-label="On this page">;
  related/prev-next/back -> <aside aria-label>. Active scroll-spy pill now sets aria-current="true" (kept in sync
  in _setupSectionSpy and the revision-mode reset). #learnSearchResults is now role="region" aria-live="polite"
  so result counts / "No topics match" announce (index.html).
- CSS: .kx-callout-head and .kx-example-head gained margin-top:0 so the new heading tags don't add top space
  (visually identical; all .kx-* styling is class-based). No other visual change.
- Responsive (css/style.css): landscape-tablet two-column reading+rail now activates at >=960px (was 1100) via a
  new 900px container step; .kx-topic-body becomes minmax(0,1fr) 240px at >=960 and keeps the capped/centred
  minmax(0,720px) 280px at >=1100; hub topic-grid 3-col moved to >=960. Phones + portrait tablets (<960) unchanged.
- Service worker v134 -> v135.
- Docs: VERSIONS (Bible 2.52->2.53, Arch 2.37->2.38), DECISION_LOG (ADR-069 final-review note), TECHNICAL_BIBLE
  (Doc 1.15), main-app/ARCHITECTURE.md (SW v135).
- Verified: node --check (learn-view.js, blocks.js); CSS braces balanced; npm test green (learn-render.check asserts
  by class not tag, so the heading swaps stay green); zero AI refs in Learn.
```

---

## 2026-06-28 — Learn Knowledge Engine — Phase 5: polish + cleanup, NO AI (ADR-069 COMPLETE)

Final phase of the Learn rebuild: remove all dead legacy CSS the engine replaced, apply the deferred micro-polish,
add one tasteful entrance animation, and lock the performance posture. Client-only; no Firestore/Security/Payment
change. ADR-069 is now complete (all 5 phases shipped).

```
### chore(ADR-069): Phase 5 — prune inert legacy Learn CSS, micro-polish, entrance animation
- Dead-CSS prune (21 rule-sets, CSS 3109->3092 braces, zero remaining refs):
  - .learn-jump-nav / .learn-jump-btn / :active / .active across base + body.dark-mode + body.theme-playful +
    body.theme-playful.dark-mode (css/style.css); removed the .learn-jump-btn token from the tap-delay selector
    list and the press-feedback selector list; removed it from RIPPLE_SELECTORS (js/app.js).
  - .learn-group-title / .learn-group-subtitle across all four theme variants (css/style.css).
  - mark.search-highlight across all four theme variants (css/style.css).
  - .learn-searchable residual marker class removed from the 5 Quick-Reference cards (index.html) and the custom
    topic card builder (js/learn-manager.js) — no JS ever read it.
- Polish: .kx-badge .62rem->.66rem (+padding) for AA legibility/premium feel; .kx-crumb now a 2.25rem touch target;
  new reduced-motion-guarded kx-fade-in entrance on .kx-topic-main (topic pages).
- Performance: documented decision NOT to add lazy per-category loading — render-on-route mounts only the active
  topic and the search index builds once; 19 small topics are all precached, so lazy-loading is premature complexity.
- Service worker v133 -> v134.
- Final-audit minors fixed: renderLearnRoute now canonicalizes the address bar (#learn/<bad-id> -> #learn) when a
  stale/unknown topic id falls back to the hub (js/views/learn-view.js); corrected the stale "12 categories" header
  in services/quantTopics.js to 14 (simplification + number-series, ADR-067).
- Docs: DECISION_LOG (ADR-069 P5 shipped / complete), VERSIONS (Bible 2.51->2.52, Arch 2.36->2.37), ROADMAP
  (ADR-069 shipped), TECHNICAL_BIBLE + main-app/ARCHITECTURE.md headers refreshed.
- Verified: node --check (app.js, learn-manager.js, learn-view.js); CSS braces balanced (3092/3092); npm test green;
  zero references to any pruned selector remain. NO AI in Learn.
```

---

## 2026-06-28 — Learn Phase 1–4 pre-Phase-5 verification audit hardening (ADR-069 follow-up)

Independent multi-agent audit of Phases 1–4 against live code (foundation, content+math, full-app regressions,
CSS/responsive/a11y, docs sync). **Content correctness re-verified: every formula + worked example across all 14
published topics recomputed by hand — zero math errors.** Phases 1–3 and regressions/docs APPROVED; two real
gating items fixed below + one cheap a11y/contrast win. No version bump (pre-Phase-5 polish to already-versioned
work); no Firestore/rules/payment change; no AI.

```
### fix(ADR-069): pre-Phase-5 audit — collapsible a11y, badge contrast, doc freshness
- A11y (real, gating): the preserved Quick-Reference "Multiplication Tables" collapsible header was a non-focusable
  <div onclick> with no role/tabindex/aria-expanded/keyboard handler → unusable by keyboard + screen readers
  (the brief required aria-expanded/controls on collapsibles). Now role="button" tabindex="0" aria-expanded +
  aria-controls (index.html); toggleSection syncs aria-expanded on every collapsible-header; a document-level
  delegated keydown makes Enter/Space activate ALL collapsible-headers (Learn + home), wired once
  (js/views/learn-view.js); added a .collapsible-header:focus-visible ring (css/style.css).
- Contrast (real, polish): .kx-diff-foundation badge text #16a34a → #15803d (lifts the .62rem badge to WCAG AA on
  its light tint; dark-mode variant already AA).
- Docs: main-app/ARCHITECTURE.md header "Phases 1–3, SW v132" → "Phases 1–4, SW v133" (the one stale doc artifact).
- Verified: node --check; CSS braces balanced (3109/3109); npm test green (4360 assertions, 0 failed). NO AI.
```

---

## 2026-06-28 — Learn Knowledge Engine — Phase 4: integrations, NO AI (ADR-069)

Phase 4 wires the knowledge engine into the rest of the app — progress, spaced revision, a topic action bar, a
cheat-sheet projection, and the data-level Planner link — without any AI surface in Learn. Backwards-compatible
(every new field is additive and degrades to localStorage-only with no DOM/Firestore). Firestore track bumped for
two new owner-writable user-doc fields; Security/Payment unchanged (the existing `entitlementFieldsSafe()` denylist
already permits owner writes to non-entitlement fields, exactly like `customTopics`/`bookmarks`).

```
### feat(ADR-069): Learn Phase 4 — progress, revision mode, action bar, Planner link (NO AI)
- Progress module (new js/learn/learn-progress.js, dual-exported): localStorage-primary per-topic
  {viewedAt, completedAt} + topic bookmarks, with best-effort FirestoreSync.queueUpdate mirror. Pure
  computeRecent/computeDue helpers (spaced revision via revisionIntervalDays, oldest-first) unit-tested in a new
  scripts/learn-progress.check.js (32 assertions, in npm test).
- Topic action bar (js/views/learn-view.js): Practise this (→ existing startDrillFromPractice('focus', drillCategory)
  via _tryPracticeAction guard) · Quick revision (cheat-sheet projection — a filtered VIEW that hides all but the
  authored revision/formula/trick/trap sections, no duplicated content) · Mark complete (toggle) · Save (topic
  bookmark toggle). markViewed fires on every published-topic open.
- Hub strips: "Due for revision" (spaced) + "Continue learning" (recent), live completion ticks on topic cards;
  refreshed on every hub show (#learnResume container added to index.html).
- Planner link (data-level): every applicable knowledge topic now carries a validated syllabusTopicId referencing
  data/syllabus.js (the knowledge graph formally references the planner's syllabus graph). learn-content.check now
  asserts each syllabusTopicId resolves against syllabus.TOPICS (144→162 assertions). No AI-adjacent button added
  inside Learn (the Planner is AI-driven; only the data link is established).
- Firestore: two new owner-writable users/{uid} fields — learnProgress (map) + learnTopicBookmarks (array) —
  documented in FIRESTORE_BLUEPRINT (Doc 1.11→1.12). Hydrated on login (firestore-sync loadFromFirestore) and
  cleared on user switch (_USER_STORAGE_KEYS). No new collection, no rule change.
- CSS: .kx-actionbar / .kx-action(+variants), .kx-resume strips, .kx-topic-card.is-complete tick, and the
  #learnTopic.kx-revision-only cheat-sheet projection — all under body.view-learn-active, dark-mode + reduced-motion
  variants included. Service worker v132→v133 (precache + new learn-progress.js asset).
- Docs: DECISION_LOG ADR-069 (P4 shipped), FIRESTORE_BLUEPRINT, VERSIONS (Bible 2.50→2.51 / Arch 2.35→2.36 /
  Firestore 2.18→2.19). Verified: node --check all touched JS; CSS braces balanced; npm test green (incl. the new
  32-assertion progress check + 162-assertion content check); NO AI in Learn.
```

---

## 2026-06-28 — Learn Phase 1–3 verification audit hardening (ADR-069 follow-up)

Independent pre-Phase-4 audit (3 review agents + direct inspection). **Content correctness: all 14 topics' formulas
and worked examples re-computed — zero math errors.** Code/regression/SW-parity/docs verified clean. Fixed 4 real
UX/polish items + 3 doc-freshness items; dismissed false positives with evidence. No version bump (pre-release
polish to Phase 3); no Firestore/rules/payment change; no AI.

```
### fix(ADR-069): Phase 1-3 audit hardening — scaffold UX, scroll-spy, section separation, doc freshness
- Scaffold UX (real): scaffold ("coming soon") topic CARDS no longer strand the user on a near-empty page — they
  now show a "coming soon" toast and stay on the hub (js/views/learn-view.js). Direct deep links still render a
  graceful coming-soon page (header + related + back).
- Scroll-spy (real): IntersectionObserver rootMargin widened -45%/-50% (a 5% band) → -15%/-75% so the sticky
  section-nav pill reliably tracks the section being read on long (10+ section) pages.
- Section separation (real, polish): .kx-section gains a subtle bottom divider + more spacing (1.1rem → 1.5rem +
  1rem padding; last-child borderless; dark variant) so the 8-11 stacked sections read as distinct blocks.
- Docs: main-app/ARCHITECTURE.md "last updated" 2026-05-07/SWv72 → 2026-06-28/SWv132; main-app/README.md Learn
  section now describes the 5-category / 14-gold-topic Knowledge Engine; pipes-and-cisterns drillCategory gains an
  inline comment explaining the intentional 'time-and-work' reuse.
- Dismissed (evidence): "dark-mode text escape" — FALSE POSITIVE (the Phase-2-audit base `body.dark-mode
  #learnTopic{color:#e2e8f0}` already lights all inherited callout/revision/example text). Touch targets kept at
  2.25rem/36px (consistent with the app's existing pills; exceeds WCAG AA). Ultra-wide grid already centred by the
  1140px container cap.
- Verified clean: no regressions outside Learn; index.html↔SW v132 precache parity; all drillCategory refs valid;
  no console/TODO/dead refs; 14 emitted renderer classes all styled.
- Version bumps: none. Verification: node --check; npm test green (content 144 + render 13 + browser 10 + full
  suite); CSS braces balanced.
- Deferred to P5 polish (ROADMAP): inert legacy Learn CSS (.learn-jump-*/.learn-group-*/.search-highlight) +
  learn-searchable class; optional section-nav scroll-fade hint + hub category jump-nav.
```

## 2026-06-28 — Learn Knowledge Engine — Phase 3: gold-standard content (ADR-069)

Authored premium, exam-grade study content for the core quantitative-aptitude topics and gave Learn a real
category taxonomy. Content-only/client-only; no Firestore/rules/payment change; no AI. Backwards compatible (topic
ids preserved → deep links + bookmarks intact).

```
### feat(ADR-069): Learn Phase 3 — 14 gold-standard topics across a 5-category taxonomy
- Impacted systems: Student App only (client content). No Firestore / Rules / Payments / AI.
- Taxonomy (data/knowledge/categories.js): Numbers · Arithmetic · Commercial Math · Modern Math · Mensuration.
- Gold-standard topics (full depth — overview/concepts/formulas-with-when&trap/tricks/traps/worked-examples/memory/
  revision): Number System, Simplification (numbers.js); Percentages, Ratio & Proportion, Averages, Time & Work,
  Pipes & Cisterns, Time-Speed-Distance (arithmetic.js); Profit & Loss, Simple Interest, Compound Interest
  (commercial.js); Probability (modern.js); Area, Volume (mensuration.js) — 14 published.
- Honest scaffolds (status:'scaffold', "coming soon", never filler): Number Series, Ages, Mixtures & Alligations,
  Partnership, Permutation & Combination.
- Original content; the provided cheat sheets informed ORGANISATION only. Every formula + worked example
  hand-verified (e.g. 7¹⁰¹→7, CI−SI=P(R/100)², avg speed 2xy/(x+y), pipes net-rate LCM method).
- profit-loss moved arithmetic→commercial-math; ID unchanged so #learn/profit-loss deep links + related edges still
  resolve. Cross-category related links validated.
- Wiring: index.html + service-worker (v131→v132) add numbers/commercial/modern data modules (html↔SW parity).
- Tests: learn-content.check grew to 144 — incl. a CONTENT-QUALITY GATE asserting every published topic has ≥6
  sections + overview/formula/example/revision + trap-or-trick + searchTerms (enforces "no filler"); registry
  count/category/sibling/cross-category assertions updated. learn-browser.check updated (19 topics, 5 categories).
- Schema/API delta: none. Version bumps: Bible 2.49→2.50 (content milestone; Arch/Firestore/Security/Payment
  unchanged). Migration: none.
- Deferred to P4 (revision mode): the cheat-sheet projection VIEW + cross-topic formula explorer — the underlying
  revision/formula/trap blocks are authored now; P4 adds the projection UI alongside spaced revision.
- Verification: node --check all data + harnesses; npm test green (content 144 + render 13 + browser 10 + full
  suite); index↔SW precache parity; validateAll 0 errors (19 topics, all related/drill refs resolve).
```

## 2026-06-28 — Learn Phase 1 & 2 audit hardening (ADR-069 follow-up)

Independent pre-Phase-3 audit of Phases 1 & 2 (2 review agents + direct inspection). Server/data/engine/routing
verified clean; **9 real issues fixed** (client + docs only). No version-track bump (pre-release fixes to Phase 2;
no Firestore/rules/payment change; no AI).

```
### fix(ADR-069): Learn audit hardening — dark mode, a11y, responsive, nav, docs
- DARK MODE (P0, real): the app has no base body-color flip, so un-coloured Learn topic text (callout/example/
  revision lists + headings) inherited light-mode near-black → invisible in dark mode. Fixed with a light base
  `body.dark-mode #learnTopic { color:#e2e8f0 }` (+ `.kx-table-caption` dark). css/style.css.
- REDUCED MOTION (P0): section-nav pill smooth-scroll now respects prefers-reduced-motion (js/views/learn-view.js
  _scrollBehavior); added `.kx-topic-card:active` to the reduced-motion guard.
- READING WIDTH (P0): desktop topic grid capped to `minmax(0,720px) 280px` + `justify-content:center` (no 150-char
  lines on wide monitors).
- TOUCH TARGETS (P1): `.kx-sec-pill`/`.kx-chip`/`.kx-back` min-height 2.25rem; `.kx-pn`/`.kx-crumb` padding bumped.
  The taller sticky nav (~3.35rem) now matches the section `scroll-margin-top:3.4rem`.
- TOKEN (P1): defined `--qr-bg` (+ dark) used by the sticky section nav instead of a bare fallback.
- NAV BUG (real, agents missed): tapping the Learn tab while on a topic page (#learn/<id>) was a no-op (tab already
  "active"); now returns to the hub (js/app.js — `_onLearnSubRoute` exception in the nav skip guard).
- LOAD ORDER: index.html loads js/views/learn-view.js (defines toggleSection) before home-view.js (uses it).
- DOCS: removed the deleted formulas.js from main-app/README.md, main-app/ARCHITECTURE.md, and the TECHNICAL_BIBLE
  script-load-order list (replaced with the knowledge engine modules).
- Schema/API delta: none. Version bumps: none (client polish + doc sync). SW v130→v131 (re-cache fixed assets).
- Verification: node --check all touched JS; npm test green (full suite + learn-content 35 + learn-render 13 +
  learn-browser 10); CSS braces balanced.
- Deferred to P5 polish (documented in ROADMAP): prune inert legacy Learn CSS (.learn-jump-*/.learn-group-*/
  .search-highlight) + residual `learn-searchable` class on reference cards; collapsible aria-expanded.
```

## 2026-06-28 — Learn Knowledge Engine — Phase 2: hub + topic pages + responsive design system (ADR-069)

Cuts the Learn tab over to the knowledge engine: a deep-linkable **hub → topic-page** knowledge graph with a
reusable responsive design system. Backwards-compatible (Quick-Reference tables, custom topics, bookmarks, premium
gates all preserved). Client-only; no Firestore/rules/payment change. **No AI in Learn.**

```
### feat(ADR-069): Learn Phase 2 — hub, topic pages, renderers, responsive .kx-* system
- Impacted systems: Student App only (client). No Firestore / Rules / Payments / AI.
- Renderers: js/knowledge/blocks.js reintroduced (deferred in P1 until it had a caller + tests) — one DOM renderer
  per block type; table→.math-table, formula→.formula-block reused (identity + loved tables preserved); HTML-escaped.
- View: js/views/learn-view.js rewritten as a render-on-route controller — no path → HUB (KnowledgeBase categories →
  topic cards w/ difficulty+exam-frequency+status badges; preserved Quick-Reference tables/squares/cubes/fraction/
  mental; bookmarks; custom topics), #learn/<id> → TOPIC PAGE (breadcrumbs, sticky section nav w/ IntersectionObserver
  scroll-spy, typed sections via BlockRenderers, related chips, prev/next, back). In-Learn nav routes through
  Router.showView('learn',{path}) for real back/forward; app.js onShow('learn') now calls renderLearnRoute(params).
- Search: wired learn-search.js to the search box (results deep-link to topics); removed the legacy DOM-scan
  performLearnSearch/highlightText and the jump-nav (updateCustomTopicJumpNav).
- Responsive: new .kx-* design system in css/style.css scoped to body.view-learn-active — lifts the 480px cap on
  tablet/desktop (560/720/1040/1140), auto-fit topic grid, topic-page reading column + right rail on desktop,
  sticky section pills, dark mode, focus-visible, reduced-motion. Reusable by other sections later.
- index.html: #view-learn restructured into #learnHub + #learnTopic (reference cards/bookmarks/custom preserved);
  retired #topicSections + jump-nav. service-worker v129→v130 (+blocks.js, −formulas.js precache).
- Removed (superseded/dead): js/formulas.js (8 topics fully migrated to knowledge objects); performLearnSearch,
  highlightText, updateCustomTopicJumpNav, orphaned initLearnView.
- Tests: scripts/learn-render.check.js (13 — every renderer via a DOM stub, incl. XSS escaping) + scripts/
  learn-browser.check.js (10 — the real modules run in a simulated browser context: global wiring, load order,
  data self-registration, search, related-title resolution) wired into npm test.
- Schema/API delta: none. Version bumps: Architecture 2.34→2.35, Bible 2.48→2.49 (Firestore/Security/Payment
  unchanged). Migration: none (pre-launch; faithful content migration, no user-data change).
- Verification: node --check all touched JS; npm test green (full suite + learn-content 35 + learn-render 13 +
  learn-browser 10); CSS braces balanced; no dead refs (formulas.js/performLearnSearch/topicSections all gone);
  deep-link #learn/<topic> + back/forward + breadcrumbs + related + prev/next + search all traced; old tables/
  custom topics/bookmarks/premium gates intact.
```

## 2026-06-28 — Learn Knowledge Engine — Phase 1: foundation (ADR-069)

First phase of rebuilding the Learn tab into the **knowledge backbone** of QuantReflex: a reusable knowledge-object
engine, deep-link routing, and a content validator. **Pure additive engine — the existing Learn page is untouched
and fully working** (backwards compatible). No Firestore/rules/payment change. **No AI in Learn (by design).**

```
### feat(ADR-069): Learn Knowledge Engine — Phase 1 (engine, data model, deep links, validator)
- Requested change: rebuild Learn as a deep-linkable hub→topic knowledge graph of reusable knowledge objects
  (not static HTML), with a responsive design system, quality-first content, and no future rewrite — phased.
- Impacted systems: Student App only (client). No Firestore / Rules / Payments / AI.
- New (engine): js/knowledge/schema.js (pure, dual-exported topic/block schema + validators); js/knowledge/
  registry.js (in-memory KnowledgeBase: categories/topics, get/all/categories/byCategory/related/siblings +
  integrity validator incl. duplicate-id detection); js/learn/learn-search.js (weighted symbol/synonym index over
  the registry — becomes the Learn search when wired in Phase 2; the legacy performLearnSearch still drives the
  live page).
- New (data): data/knowledge/categories.js (arithmetic, mensuration) + data/knowledge/arithmetic.js (6 topics) +
  data/knowledge/mensuration.js (2 topics) — a faithful migration of the 8 legacy js/formulas.js topics into the
  schema (each {title,formula,tip} → a formula item {name,expr,when}; concise factual overviews added). No filler.
- Routing: js/router.js parses #learn/<topicId> deep links (new _parseHash; single-segment hashes unchanged →
  backwards compatible) and toggles a view-learn-active body class (mirrors the view-practice-active hook) — inert
  until Phase 2 CSS/markup consumes it.
- Wiring: index.html script tags (schema→registry→data→search, order-correct); service-worker v128→v129 +
  precache the 6 new modules (offline-first preserved).
- Validation: new scripts/learn-content.check.js (35 assertions: schema validity, category/related/drill-reference
  resolution, search ranking by word/symbol/synonym, registry helpers, schema negative tests) wired into npm test.
- Not in this phase (per ADR-069): the block renderers (js/knowledge/blocks.js) + hub/topic UI + responsive .kx-*
  CSS (Phase 2 — a renderer with no caller/test doesn't ship early), gold-standard content (Phase 3),
  Practice/Planner/progress/revision integrations (Phase 4). The old Learn page remains the live UI.
- Schema/API delta: none (no Firestore/endpoint). Version bumps: Architecture 2.33→2.34, Bible 2.47→2.48
  (Firestore/Security/Payment unchanged). Migration: none.
- Verification: node --check all new JS + router; npm test green (full suite + learn-content.check 35); old Learn
  page renders unchanged; #learn and #learn/<topic> both resolve to the Learn view (no home fallback).
```

## 2026-06-28 — Battle Archive audit hardening (ADR-068 follow-up)

Independent post-implementation production audit of the Battle Archive (architecture / Firestore / security / UI /
UX / regression / dead-code). **Server, data, rules, and indexes audited correct** (premium-gating, XSS,
reads-before-writes, finalize call-frequency ≤2×/duel, no listener leaks, cross-app consistency all PASS). Five
**client-only** refinements + one stat-semantics fix; **no schema/rules/index change, no version-track bump.**

```
### fix(ADR-068): Battle Archive audit hardening — client correctness + fastest-win semantics
- Impacted systems: Student App only. No Firestore schema / Rules / Indexes / Payments change.
- Fixes (file):
  - js/duel-archive.js — (1) FILTER MODEL: global outcome+difficulty are now mutually exclusive (each resets the
    other) so every global filter is a clean indexed server query — no residual-pagination empty-page gaps; residual
    filtering survives only in rivalry mode (small bounded set) + name-search, with honest "load more to search
    older battles" copy. (2) PAGINATION: added a monotonic request token so a stale in-flight page response can't
    append under a newer filter's query key (rapid chip switching). (3) SEARCH: debounce timer hoisted to module
    scope + cleared on collapse (no fire into a hidden body). (4) RE-EXPAND: paints from the in-memory cache on a
    Home revisit when the filter key is unchanged + cache valid (no refetch, scrolled pages preserved);
    onLocalDuelComplete still invalidates so a post-duel revisit refreshes.
  - services/duelStats.js + api/duel.js (_finalizeTxn statParams) — fastestWinSec now = the winner's OWN total
    solve time (totalSolveMs/1000), not the whole-duel wall clock (gated by the slower player). New statParam
    mySolveTotalSec; durationMs still stored on the history row for the card's "Duration".
- Acknowledged debt (ROADMAP DEBT-4/5): replay of duels older than the 30-day room TTL needs a future
  duelReplays/{code} doc (per-question data isn't in duelHistory); ELO/seasons/leaderboards are additive (no
  migration).
- Schema/API delta: none. Version bumps: none (client correctness + one stat-definition refinement; pre-launch, no data).
- Verification: node --check (duel-archive.js / duelStats.js / api/duel.js); scripts/duel-archive.check.js now 45
  assertions (added fastest-win-from-solve-time + ignores-wall-clock cases); full `npm test` green.
```

## 2026-06-28 — Battle Archive: Premium duel history + rivalry/personal stats + achievements (ADR-068)

A Premium-only, expandable **Battle Archive** below the Home Duel card — complete paginated duel history,
head-to-head **rivalry** stats, lifetime **personal** stats, and auto-unlocked **achievements** — built as a
read-only client layer over **server-maintained** truth (the client never computes outcomes/aggregates). Premium-
only and **HIDDEN** for free users (not greyed/blurred). Spark-cheap, no new serverless function (main-app stays
8/12), no page redesign, no migration (pre-launch, zero users).

```
### feat(ADR-068): Battle Archive — premium duel history, rivalry/personal stats, achievements
- Requested change: a premium expandable Battle Archive under the Duel card — full history (paginated, newest-
  first, instant), rivalry head-to-head when viewing an opponent, personal lifetime stats, auto achievements,
  filters (outcome/difficulty/time/search), expand-in-place (no nav), premium-only & hidden for free, auto-update
  on duel finish, Spark-friendly (no scans, maintained aggregates), empty state with CTA.
- Impacted systems: Student App | Firestore | Rules | (Entitlements: visibility only). No Payments/AI/Admin.
- Bible docs updated: DECISION_LOG (ADR-068); FIRESTORE_BLUEPRINT (duelHistory new fields + duelStats/summary +
  3 indexes, Doc 1.10→1.11, Firestore 2.17→2.18); SECURITY_ARCHITECTURE (duelStats deny rule + account-deletion,
  Doc 1.7→1.8, Security 2.13→2.14); TECHNICAL_BIBLE (Battle Archive section, Doc 1.8→1.9, Arch 2.32→2.33).
- Schema delta:
  - users/{uid}/duelHistory/{code} — ADDED opponentUid, oppAccuracy, challengerUid, iChallenged, difficulty,
    questionCount, myAnswered, durationMs (denormalized; room docs TTL at 30d). Additive — old readers ignore them.
    REMOVED the ADR-065 50-cap (DUEL_HISTORY_CAP/_pruneDuelHistory) → history is complete + paginated.
  - users/{uid}/duelStats/summary — NEW server-only aggregate doc {duelAggregates, rivals{}, achievements{}},
    maintained inside the existing _finalizeTxn transaction via the pure services/duelStats.js (no new write/fn).
  - +3 composite indexes on duelHistory: (outcome,playedAt desc) / (difficulty,playedAt desc) / (opponentUid,playedAt desc).
- API delta: none (no new endpoint/function — the existing api/duel.js finalize path now also writes the aggregate;
  the Archive is client reads). main-app stays 8/12.
- Security review: duelStats/summary is owner-read, client-write-DENIED (explicit carve-out overriding the blanket
  users/{uid}/{sub} owner-write grant — mirrors duelHistory; a client can never forge stats/wins/achievements).
  account.js deletion subcollections now include duelStats. Premium gating is client-visibility only; data is
  harmless if read (uid+name already present). No new secrets.
- Cross-app compatibility: only main-app reads/writes duelHistory/duelStats. Super-admin User-360 already reads
  duelHistory (recent duels) and ignores the new fields. No coaching-app impact.
- Files: main-app/services/duelStats.js (new, pure); main-app/api/duel.js (_finalizeTxn: up-front summary reads +
  extended history + applyDuelToSummary writes; removed cap/prune + DUEL_HISTORY_CAP); main-app/api/account.js
  (+duelStats deletion); main-app/js/duel-archive.js (new client module); main-app/js/views/home-view.js
  (DuelArchive.render gating); main-app/js/duel-manager.js (_showResults → DuelArchive.onLocalDuelComplete);
  main-app/index.html (#duelArchiveSection + script tag); main-app/css/style.css (.ba-* styles, +dark/reduced-
  motion); firestore/rules/firestore.rules (duelStats deny block); firestore/indexes/firestore.indexes.json (+3);
  main-app/service-worker.js (v127→v128 + precache js/duel-archive.js).
- Version bumps: Firestore 2.17→2.18, Architecture 2.32→2.33, Security 2.13→2.14, Bible 2.46→2.47 (Payment 2.3 unchanged).
- Migration: none — pre-launch, zero users; forward-only (new duels write the extended history + summary). Deploy
  rules + indexes: firebase deploy --only firestore:rules,firestore:indexes.
- Verification: node --check on duel.js / duelStats.js / duel-archive.js; new scripts/duel-archive.check.js (45
  pure-math assertions: aggregates, streaks, milestones, rivalry head-to-head, revenge, top rivals, avg accuracy/
  solve, fastest-win-from-solve-time, non-mutation) wired into `npm test` → full suite green; CSS braces balanced; indexes JSON valid.
```

## 2026-06-24 — Deep bible↔code drift reconciliation

Doc-only governance pass: a 3-app drift audit (TECHNICAL_BIBLE vs all 3 apps; FIRESTORE+SECURITY vs
rules/indexes/code; PAYMENT+AI vs services/api) re-synced the living bibles to the **actual code** where they had
drifted from features added after the docs were last touched. **No app code / rules / indexes / data touched.**

```
### docs(reconcile-drift): sync living bibles to actual code across all 3 apps
- Requested change: make the bibles reflect the whole repo, not just catalog numbers.
- Impacted systems: docs only.
- Fixed (doc vs code, file:line):
  - TECHNICAL_BIBLE.md §3 main-app row — AI actions explain|coach|insights|chat|planner|wordproblems
    (`api/ai.js:190-195`) + added the `duel` and `notify` (ADR-066) endpoints; coaching row — removed the
    non-existent `leaderboard`; §3.1 counts main-app 6→8, coaching 6→5 (super-admin 8 unchanged), 6/12→8/12.
  - SECURITY_ARCHITECTURE.md:121/133 — admin rate limit 30→300/hr (`super-admin-app/api/_lib/middleware.js:51`
    `ADMIN_MAX_REQUESTS_PER_HOUR = 300`).
  - FIRESTORE_BLUEPRINT.md §4 — added the two real `aiRequests` composite indexes (feature,ts / uid,ts).
  - AI_INTERACTION_SYSTEM.md:68 — response-envelope feature `plan`→`planner` + a chat / `ai_study_plan` naming note.
- Verified clean (no change): payment actions/prices(₹349/₹599)/durations(182/365)/entitlement fields; rules
  table + custom claims; register 10/hr/IP + coaching 8/min limits; duel rules; entitlementLogs CG index;
  model `gpt-4o-mini`; AI caches; `enforceAiBudget`; super-admin function count 8.
- Schema delta: none (documented two already-deployed indexes). API delta: none.
- Security review: doc-only correction of a stale rate-limit number; no rule/claim/secret change.
- Cross-app compatibility: docs only.
- Version bumps: Bible 2.45→2.46, Architecture 2.31→2.32, Firestore 2.16→2.17, Security 2.12→2.13; Payment 2.3 unchanged.
- Migration: none (doc-only).
- Verification: `cd main-app && npm test` (4098) + `node scripts/mock-engine.check.js` (100); re-grep confirms no
  stale `study-plan` / `leaderboard` / `main-app **6` / `30/hr` in TECHNICAL_BIBLE / SECURITY.
```

## 2026-06-24 — Documentation-consistency reconciliation (ADR-067 / ADR-032)

Doc-only governance pass: the code had shipped the ADR-067 rebuild, but several **living** docs still described the
pre-rebuild state and the per-doc version headers + README footer had drifted far behind the registry. Read-only
code verification + doc edits only — **no app code / rules / indexes / data touched**.

```
### docs(reconcile-067): sync living docs + version stamps to as-built code
- Requested change: reconcile docs to verified code (post-ADR-067 catalog) + re-stamp versions consistently.
- Impacted systems: docs only — no Student App / Admin / Coaching / Firestore / Rules / Payments / AI / API change.
- Verified ground truth: 17 user-facing exams + hidden `other`; `SYLLABUS_VERSION` 3; 14 drillable categories;
  5 family syllabi; 50 canonical topics; serverless fns 8/8/5 (≤12, ADR-017); `aiStudyPlans` composite ABSENT
  and not needed (live planner `aiPlanner/{uid}`, doc-per-user); test suite ≈4,098 assertions + mock-engine 100.
- Bible docs updated:
  - Version stamps → registry: README.md footer (1.0×5 → 2.45/2.31/2.16/2.12/2.3); TECHNICAL_BIBLE.md:3
    (Arch 2.9→2.31, Doc 1.6→1.7); FIRESTORE_BLUEPRINT.md:3 (Firestore 2.12→2.16, Doc 1.8→1.9);
    SECURITY_ARCHITECTURE.md:3 (Security 2.10→2.12, Doc 1.5→1.6); PAYMENT_ARCHITECTURE.md:3 (Payment 2.1→2.3,
    Doc 2.1→2.2); `Last updated` → 2026-06-24 on each.
  - ADR-067 catalog numbers: AI_INTERACTION_SYSTEM.md §6 (26→17 exams, 104→50 topics, 12→14 cats; fixes the
    §1-vs-§6 contradiction); FIRESTORE_BLUEPRINT.md:129 (12→14 authoritative categories); PRODUCT_STRATEGY.md
    dated note (no rewrite).
  - TECHNICAL_BIBLE.md §6: `syncCoachingStudentCount` corrected to retired/no-op + request-path maintenance (ADR-032).
  - FIRESTORE_BLUEPRINT.md §indexes: `aiStudyPlans` composite note resolved (verified absent; legacy; `aiPlanner/{uid}`).
  - ROADMAP.md TEST-1: "no automated tests exist" → the real ~4,098-assertion suite; re-statused Partial.
- Schema delta: none. API delta: none.
- Security review: no change. Stale Security/Payment header stamps corrected to the current registry; the SEC1
  App-Check/M7 hardening and ADR-023 admin password-rotation/MFA items remain tracked (not modified).
- Cross-app compatibility: docs only; no reader/writer contract touched.
- Version bumps: Bible 2.44→2.45, Architecture 2.30→2.31, Firestore 2.15→2.16; Security 2.12 + Payment 2.3 unchanged.
- Migration: none (doc-only).
- Verification: `cd main-app && npm test` (4098 passed) + `node scripts/mock-engine.check.js` (100); grep confirms
  no living-doc "26 exam / 12 cat / 104 topic / 12 authoritative" hits remain (only append-only history).
```

## 2026-06-24 — Focused speed-maths catalog rebuild + Timed Mock (ADR-067)

Repositioned QuantReflex from "every Indian exam" to the best **speed-maths** trainer for a curated catalog,
and shipped the supporting engine + UX work (verified by a post-implementation audit). Highlights:
- **Catalog curated 26 → 17 exams in 4 user-facing tiers** — MBA (CAT, XAT, SNAP, NMAT, CMAT, MAH CET, MAT,
  ATMA), Banking (IBPS PO/Clerk, SBI PO, RBI Assistant), Foundation, Government (SSC CGL/CHSL/MTS, RRB NTPC);
  `other` kept hidden as the engine fallback. Removed 11 misfits (GMAT, CLAT, JEE, Olympiad, NDA, CDS, AFCAT,
  CUET, NTSE, IPMAT, generic Bank PO) and the unused `defense` family. Added MAT, ATMA, RBI Assistant.
- **Per-exam metadata** in `data/syllabus.js`: `tier`, verified exam-mechanics `pattern`
  {q,marks,dur,sectional,neg,calc,quantQ,quantMin}, and a `book` field + BOOKS registry — R.S. Aggarwal is the
  default study order; **MBA CET follows the Arihant MAH-CET guide**. `SYLLABUS_VERSION` 2→3.
- **Categories-first onboarding** (4 tier cards + smart defaults) replacing the flat exam list (`companion-ui.js`).
- **Tier/mechanics-aware readiness** (`services/readiness.js`): the flat 12% speed weight is replaced by
  profiles (speed-critical 0.22 / concept 0.08 / balanced 0.12) chosen from each exam's `pattern`; the readiness
  breakdown reports the weights actually used. **Book-order plan sequencing** in `services/planningEngine.js`.
- **Exam-mechanics coaching**: `services/examStrategy.js` emits an "EXAM MECHANICS" line (no-negative /
  calculator / sectional / seconds-per-question) so the AI gives tier-appropriate strategy.
- **Two new drill categories** — Simplification & Number Series (generators + drillable topics + UI buttons).
- **Timed Mock (Premium)**: `js/mock-engine.js` (`buildMock`/`buildMockDeck`/`score`) runs a weightage-true
  quant section under the exam's real clock + marking scheme and shows the exam-accurate score; gated by the
  new `timed_mocks` entitlement; surfaced via an additive drill-engine `onResults` hook.
- **Post-implementation audit fixes**: corrected a 12→14 category test assertion + added a generator/label
  parity guard; filled three stale category label maps; made the mock deck exactly blueprint-sized; removed a
  dead `saveMockResult` call.

Pre-launch (zero users) → no migration. No Firestore collection/rules/payment-flow change (`timed_mocks` uses
the existing single-premium entitlement). New check: `scripts/mock-engine.check.js`. SW v126→v127.
Bible 2.43→2.44, Arch 2.29→2.30. See ADR-067.

## 2026-06-15 — AI never discards the student's real data on a Firestore read hiccup (ADR-054)

Coach/Insights showed "I haven't seen you solve yet" for a user with 11 attempted / 63.6% in Analytics. Root
cause: the server builds the profile from Firestore via firebase-admin, and the client's authoritative stats
are passed as a floor — but the read-failure `catch` returned `_coldContext(uid, {})`, **discarding that
floor** and hardcoding `totalAttempted: 0`. So a Firestore read error (e.g. bad `FIREBASE_SERVICE_ACCOUNT`)
made the AI cold despite real data. No model/schema/rules change. SW v114→v115. Bible 2.42→2.43, Arch 2.28→2.29.

- **`studentProfile.build()`**: on a `users/{uid}` read error, degrade to empty server stats and fall through
  to the **same `_floorStats(opts.clientStats)` path** instead of returning a cold profile. Invariant: a
  positive client floor can never yield a cold/zero profile. Deleted the now-unused `_coldContext`.
- **Tripwire**: `build()` warns a structured `INVARIANT VIOLATION` if a positive client floor ever yields a
  cold profile (server-log evidence + regression guard).
- **`firestore-sync.js`**: `queueUpdate` now **buffers** instead of silently dropping a write when Firebase/auth
  isn't ready, and `_flushPending()` flushes it once the user loads — so a first session reaches
  `users/{uid}.stats` and Firestore catches up (defense-in-depth; the floor already makes the AI correct).
- **Verify**: `node --check`; `npm test` 209 + 78 — a simulated admin read-failure with a client floor keeps
  `build`/`coachToday`/`insights` warm (real total, `coldStart:false`, real mastery, no "I haven't seen you
  solve" phrasing).

## 2026-06-15 — One canonical Student Intelligence Profile + one derivation layer (ADR-053)

QuanAI felt like four features pretending to know the student. The audit found the persona/orchestrator/
renderer/APIs/prompts/engines were already unified; the real fragmentation was no materialized profile + the
client computing stats separately from the server. Surgical foundational redesign (no rewrite). No model/schema/
rules change; one LLM call per feature. SW v113→v114. Bible 2.41→2.42, Arch 2.27→2.28.

- **One derivation layer** (`data/statMath.js`, new): a pure, self-contained, dual-exported module
  (client `<script>` + server `require`, like `syllabus.js`) holding the ONLY implementation of mastery/tiers,
  weakest/strongest, accuracy (overall + 7d/30d), speed, today, and streak — thresholds defined once. The
  server profile AND the client (`progress.js`, `stats-view.js`) both consume it, so Analytics and QuanAI can
  never disagree for the same `stats`. Deleted the client's bespoke mastery loops + `MASTERY_MIN_ATTEMPTS`.
- **One materialized profile**: `services/studentContext.js` → **`studentProfile.js`**, `buildContext` →
  **`build`**. `build()` returns the whole picture as ONE object — folds the study planner in
  (`profile.planner`, one `aiPlanner` read — `aiBrain._plannerData` deleted) and materializes
  `profile.recommendation`, `profile.tier` (`aiBrain._tier` deleted), and `profile.masteryByCat`.
- **Every feature on the profile**: Coach/Insights read `ctx.planner`/`ctx.tier`/`ctx.recommendation`;
  **Explanation** now calls `build()` (cached) instead of its own `users/{uid}` read, so its mastery/recent
  mistakes/exam/plan come from the same object. Planner mutations bump `qr_ai_dirty_at` so the folded-in plan
  is never stale.
- **Preserved** (already correct/tested): persona, `aiBrain` shape, `companion-ui` renderer, the six `/api/ai`
  actions, prompts, `llmProvider`, `plannerEngine`/`readiness`/`signals`. `getAvgResponseTime` left as-is.
- **Verify**: `node --check`; `npm test` 209 + 70 (profile folds planner/recommendation/tier/masteryByCat;
  `statMath` is the single weak/mastery impl the profile derives from; Explanation reads mastery from the
  profile); grep-gates (one derivation layer; every feature on `build()`; deleted helpers gone).

## 2026-06-15 — Remove the "I don't know you yet" cold-start gate (ADR-052)

Analytics knew the student while Coach/Insights said "I don't know you yet — give me 10 questions." The data
plumbing was already one fresh source of truth (audit-confirmed); the fault was a single hard gate. Removed it.
No model/schema/rules change; one LLM call per feature preserved. SW v112→v113. Bible 2.40→2.41, Arch 2.26→2.27.

- **No cold-start gate** (`studentContext.js`): deleted the `buildContext` early-return + the
  `COLD_START_ATTEMPTS`/`COACH_MIN_TODAY` constants. `buildContext` always returns the real canonical profile
  from whatever data exists; `accuracy` is `null` not `0` with no data; `coldStart` is now a framing flag only;
  `_coldContext` survives only as the read-failure fallback.
- **Coach/Insights always render, gracefully** (`aiBrain.js`): removed the `isColdStart` locks. Data richness
  (`_tier`) decides how rich, never whether it works. `tier 0` (0–5 lifetime) → deterministic helpful early read
  (`_coachLowData`/`_insightsLowData`: real accuracy/mastery/readiness + a mission, framed as growth — no LLM,
  cost-flat); `tier ≥ 1` → the existing LLM living dashboard. A 6–19-question student now gets real coaching.
- **One data-state rule**: aligned the client weak/strong floor (`progress.js`, was `≥10`) to the canonical
  `≥3` (`MASTERY_MIN_ATTEMPTS`); removed the no-op `<5` lock in `stats-view.js` + the dead
  `showInsufficientDataModal` shim in `ai-features.js`.
- **Copy**: no more "I don't know you / 10 questions / unlock"; thin-data framing is growth-oriented.
- **Out of scope**: the Premium paywall is monetization, not this bug — unchanged.
- **Verify**: `node --check`; `npm test` 209 + 62 (5-question profile real-not-fake; zero-data profile
  valid-not-locked; low-data Coach/Insights no banned phrasing + still a mission; tier-0 no LLM call); grep gate.

## 2026-06-15 — One source of truth + Explanation as a premium learning document (ADR-051)

Final sign-off audit (4 from-first-principles investigations): the system is architecturally clean; two
"one brain" gaps fixed. No model/schema/rules change; one LLM call per feature preserved. SW v111→v112.
Bible 2.39→2.40, Architecture 2.25→2.26.

- **One freshness source.** The `clientStats` floor was dropped by `plannerGet` (server discarded what the
  client already sent), `chatTurn`, and `wordProblem` — so they could disagree with the Coach dashboard right
  after a drill. Threaded the existing `_sanitizeClientStats`→`buildContext({clientStats})` floor into all
  three (`api/ai.js` + `aiBrain.js`; client `sendTurn`/drill payloads now send `clientStats`+`clientDate`).
- **One mastery source (no drift).** Exported `studentContext._deriveMastery` + `masteryForCat(stats, cat)` as
  THE canonical weak/strong resolver; Explanation now reads its category's mastery from the same function
  Coach/Insights/Planner use, replacing the ad-hoc "asked-to-explain-before" heuristic.
- **Explanation = premium learning document.** Always-visible sections: concept → step-by-step → Common
  mistakes (2–3, personalized when it's a live weak spot) → Faster method → Exam Insight (deterministic from
  the bundled syllabus: frequency/difficulty/time-target for the student's exam) → Mastery Status (canonical
  "{acc}% over {n}", never invented) → Recommended next step (mastery-tiered drill mission). The
  Simpler/Go-deeper/Another/Drill chips now *extend* it rather than reveal missing content. `explain.base@5`
  (`mistake`→`mistakes[]`, `tip`→`shortcut` with when-to-use; busts the shared per-question cache). All
  sections render with existing block types (no new client blocks); the personalized layer is deterministic so
  numbers are never hallucinated and the shared cache stays user/exam-agnostic.
- **Verify:** `node --check`; `npm test` 209 + 48 (masteryForCat≡_deriveMastery single-source proof; premium
  document sections present with data; no invented numbers on low data; plannerGet/chatTurn floor wiring); grep
  gate. Visual polish + animation smoothness still need a real-device QA pass.

## 2026-06-15 — Coach + Insights as living dashboards (ADR-050)

Turned Coach and Insights from "paragraph + button" into animated, multi-section dashboards from one AI brain.
Reuse-not-rewrite: same `studentContext`, same one-LLM-call-per-feature, same caches, same `aiPlanner` read.
No model/schema/rules change; cost unchanged. SW v110→v111. Bible 2.38→2.39, Architecture 2.24→2.25.

- **Deterministic dashboard assembly** (`aiBrain.js`): `_plannerNote`→`_plannerData(uid, clientDate)` returns
  `{note, readiness, forecast, todayTasks, adherencePct}` from the single existing `aiPlanner` read. `coachToday`
  rebuilt as `_coachDashboard` (greeting → readiness ring → win → worry → metric cluster → plan progress →
  days-to-exam callout → today's mission → motivation → conversational chips); `insights` rebuilt as
  `_insightsDashboard` (patterns intro → biggest-lever card → metrics → pattern cards → weakness → planner
  prediction → action missions). `_detectPatterns(ctx)` turns the previously-dead behavioural flags
  (`careless`/`speedRegression`/`plateau`/`inconsistent`/`burnout`) + `sessionImprovementPct` into pattern cards.
- **Tiers** (`_tier`, 0–4 from lifetime volume) gate WHICH sections show, never WHETHER they're computed.
- **Cold start = curious onboarding** (`_coachOnboard`/`_insightsOnboard`): "I don't know you yet — ~10 questions
  and I'll build your profile" + a preview of what unlocks; warmly acknowledges `today.attempted`. Zero
  "practice to unlock / go practice / warm up" copy (grep-gated).
- **Closed two dead loops**: `studentContext.serialize()` now surfaces `recentTopicsExplained` (Explain→Coach);
  Coach writes `aiMemory.wins` via `updateMemory({addWin})` on a real improvement (continuity).
- **New blocks** (`companion-ui.js`): `ring` (reuses planner `.pr-ring` SVG/CSS) + `progress` (wires the
  already-defined `.cb-progress*` CSS). `renderEnvelope` staggers block children (`--bi`→`animation-delay`);
  `.cb-ring`/`.cb-stagger` added, both in the reduced-motion guard.
- **Prompts**: `coach.daily@5` (greeting/biggestWin/oneWorry/todayRecommendation/motivation, flag-reactive),
  `insights.analyze@6` (patternsIntro, flag-reactive). One call each; deterministic fallback fills every field.
- **Left as-is on purpose**: the duplicated client `fmtMin` emits different strings (`" min"` vs `"m"`/round) —
  merging would change visible text, so kept separate per ADR-047's "don't merge helpers with different behavior".
- **Verify**: `node --check`; `npm test` 209 + **37** (warm dashboard ≥6 blocks incl. ring; cold onboarding no
  banned phrasing for Coach+Insights; flag→pattern; `recentTopicsExplained`→serialize; `_tier` mapping); the
  banned-phrasing grep gate. Animated multi-section feel still needs a real-device pass.

## 2026-06-14 — QuanAI product polish: one premium AI, correct dates, modal planner (ADR-049)

A 3-pass audit root-caused the remaining correctness/UX issues. No model change. SW v109→v110.

- **Coach/Insights cold-start despite data**: the `aiDaily` envelope cache was bypassed only on `force`, not
  `clientStats`, so a cold envelope cached when the account was new that morning was pinned all day. Now
  `!force && !clientStats`.
- **Timezone**: "today" was UTC on client+server → at 3am in a +offset zone the planner anchored to yesterday
  (and made calendar selection feel stuck). The client now sends its LOCAL `clientDate`; the server anchors on
  `clientDate || _todayIso()` everywhere.
- **Premium modal**: the full-page `#view-planner` becomes the companion bottom-sheet (blur, slide-up, rounded
  top, dismiss-on-backdrop, grabber + drag-to-dismiss) via `Planner.renderInto`; fixes the broken scroll (single
  `.companion-scroll`), adds safe-area + small-screen breakpoints + calendar micro-polish.
- **Consistency/cleanup**: one "Study Planner" vocabulary; removed the dead router mount + orphaned CSS.
- **One AI**: shared `_plannerNote` grounds Coach AND Insights in the live planner (tasks + readiness);
  `insights.analyze@5`.
- **Verify**: `node --check`; `npm test` 209 + 25 (new clientDate-anchor + aiDaily-bypass assertions); gates
  green. ADR-049. Bible 2.37→2.38, Arch 2.23→2.24.

## 2026-06-14 — Final pre-production hardening of QuanAI (ADR-048)

A full pre-launch architecture audit (dead-code/dependency graph, stale-data/freshness, prompts/personalization/
UX) confirmed the system is clean — zero orphans/dead-helpers/dead-prompts, ADR-047 cleanup complete. Remaining
verified fixes, no model change (gpt-4o-mini). SW v108→v109.

- **Planner writes awaited (data integrity)**: setup/toggle/regen + auto-catch-up writes were fire-and-forget,
  so the API reported success on a failed Firestore write → a checked task could silently revert. Now awaited
  (`_writePlanner`); failures → `write_failed` → API 503 (retryable); the calendar rolls back the optimistic
  checkbox + toasts.
- **Coach/Insights clientStats floor**: extended the ADR-046 accuracy-floor (was planner-only) to Coach/Insights
  so a drill finished moments ago isn't missed during the `syncStats` debounce.
- **Uniform exam-awareness**: `planner.narrate` (@2) + `explain.followup` (@2) now inject the exam via
  `sys(role, examName)`; narrate seed gains `daysToExam`; version-honest `promptId`s.
- **UX**: `renderError` handles `NO_AUTH` (sign-in-again message, no retry loop).
- **Dead code**: removed `aiService.generateWordProblems` + `_shuffleInPlace` (deprecated, zero callers) and the
  unused `checkWordProblemQuota`.
- **Verify**: `node --check`; `npm test` 209 + 23 (new Coach clientStats-floor assertion); zero refs to removed
  exports. ADR-048. Bible 2.36→2.37, Arch 2.22→2.23. _Manual (browser, not run here): drill→Coach shows the just-
  finished session; toggle on throttled network rolls back; planner narration names the exam; logged-out user
  sees the re-login message._

## 2026-06-14 — Post-merge forensic remediation: one planner + restore dropped UX (ADR-047)

A three-agent forensic audit of the merged `main` found the merge silently dropped a cluster of the Planner
branch's non-conflicting UX improvements and left two competing planners. No model change (gpt-4o-mini). SW v107→v108.

- **R1 — restored 6 regressions** (best-combined on the audited base): live `today` count-signal (`_deriveToday`)
  so Coach/Insights/Planner stop reading `undefined`/`NaN`; two-gate "coach-don't-gate" cold-start; `serialize()`
  leads with TODAY again; cold coach uses its computed `coldMsg`; Explain "Drill this" → `chipDrill` (in-place
  micro-drill reachable again); Explain honors `preferredDepth`.
- **R2 — removed the legacy Mission entirely** (one authoritative planner): deleted `missionGet/Generate/Today`,
  `_missionEnvelope`, `_topicList`/`_weakCats`, `plan.generate`, `action=mission`, `openMission`/`runInterview`,
  the dead `plan_regen` chip, `services/planLogic.js`, and `quantTopics.nearestCategory`/`KEYWORDS`; Coach reads
  only `aiPlanner`; dropped the now-dead `ctx.today.cats`/`weekCats` + `_toMillis`. Repo-wide grep proves zero
  runtime references to any legacy-Mission symbol.
- **R3 — consolidated identical helpers**: `round`/`clamp`/`todayIso` → one pure `services/aiMath.js`; kept the
  intentionally-different `_ms` parsers and planner date helpers separate.
- **Tests/docs**: all 16 `test-ai.js` assertions were legacy → `npm test` now runs `planner-engine.check` (209) +
  `planner-brain.check` (22, incl. today-signal/two-gate assertions). Fixed an AI_INTERACTION_SYSTEM §0 "90s vs 6h"
  merge artifact; FIRESTORE_BLUEPRINT marks `aiMissions` removed. ADR-047. Bible 2.35→2.36, Arch 2.21→2.22.

## 2026-06-14 — QuanAI Planner: living, adaptive, syllabus-driven study planner (ADR-046)

Adds a deterministic planning engine the LLM only narrates (§0 doctrine), alongside the audited Coach/Insights/
Explain/Mission stack (ADR-045 below). No model change (still gpt-4o-mini). SW v106→v107.

- **Syllabus DB** — new `main-app/data/syllabus.js` (bundled, dual-exported like `questions.js`; `SYLLABUS_VERSION`):
  26 exams → 5 real syllabi (CAT/MBA, Banking/SSC, Defense, Foundation, Generic), 104 topics, each with importance/
  frequency/difficulty/prereqs (acyclic) /revision-cadence/est-minutes, a `drillable` link to one of the 12 cats
  (or null), and a weighted `signals[]` map. The 12 cats are **signals, not limits** — every topic is scheduled.
- **Engine** — `services/signals.js` (infers readiness from in-app practice; never "no data"), `services/
  readiness.js` (per-topic readiness, 0..100 Exam Readiness Score, Completion Forecast), `services/
  plannerEngine.js` (14-day scheduler: priority, prereq cascade-unlock, revision interleaving, adaptive difficulty,
  adaptive buffer/mock, `applyCompletion`, `rebalanceMissed` Smart Catch-up). Pure functions, no Firestore/LLM.
- **Brain/API** — `aiBrain.js` plannerGet/Setup/Toggle/RegenBlock over `aiPlanner/{uid}` v2; `aiPrompts.js`
  `planner.narrate@1` (narrative only); `api/ai.js` `action=planner` (get/setup/toggle/regen) with `clientStats`
  sanitization.
- **Accuracy fix** — `studentContext.buildContext` merges a NON-AUTHORITATIVE, raise-only `clientStats` floor
  (fenced to the planner path) so a stale `users.stats` doc no longer reports false-zero accuracy after a live
  session.
- **Client** — `companion-ui.js` setup wizard (searchable exam selector, calendar date, study slider to 8h, days/
  week, prep level, preferred time) + `js/views/planner-view.js` `#view-planner` calendar (readiness ring,
  forecast, day cells by kind, task checkboxes, per-task explainability, drillable deep-links). Home card →
  "Open your Study Planner ✨". `data/syllabus.js` + `planner-view.js` registered in `index.html` + service worker.
- **Coexistence** — the audited one-shot Mission (`aiMissions` + `action=mission` + `planLogic`) stays; the Home
  card now opens the new Planner. Coach/Insights keep ADR-045's exam-aware grounding.
- **Verify** — `scripts/planner-engine.check.js` (209 invariant assertions) + `scripts/planner-brain.check.js`
  (19 wiring assertions, mock Firestore/LLM); `node --check` on every changed file. No rules/index change (catch-all
  default-deny covers `aiPlanner`).

## 2026-06-14 — QuanAI production audit: exam-aware persona, freshness, plan grounding, version-honesty (ADR-045)

Deep production audit of the QuanAI ecosystem (Coach, Insights, Explain, Study Planner). The architecture was already
sound; this pass closes the trust / one-mentor-identity / "feels-alive" gaps a paying Premium user actually notices.
New deliverable: [AUDIT-REPORT-QUANAI.md](../../AUDIT-REPORT-QUANAI.md). New deterministic + unit-tested modules:
`services/quantTopics.js`, `services/planLogic.js`, `scripts/test-ai.js` (16 tests, `npm test`).

- **One universal exam-aware persona** — `aiPrompts.sys()` no longer hardcodes "CAT speed-math coach"; QuanAI is a
  universal quantitative-aptitude mentor that adapts examples/priorities/pacing to the student's actual exam (injected,
  wrapped as data). Study-Plan interview gains a free-text **"Other…"** so ANY exam (XAT, SBI PO, NDA, campus tests, …)
  is honored by name instead of being silently coerced to CAT.
- **Trust / version-honesty** — `meta.promptId` is now derived from the registry version (killed `@2/@3` drift vs the
  real versions); all six prompt entries bumped; `explanations` cache is **version-keyed** so a prompt bump busts stale
  text; **fallback envelopes are no longer cached** for the day.
- **Freshness ("watches you every day")** — `force` is now threaded into `buildContext` (it wasn't), so a refresh
  actually refetches; finishing a drill stamps `qr_ai_dirty_at` and each AI surface force-refreshes once + a manual
  "↻" control. No more repeating yesterday's advice after you practice.
- **Living Study Planner** — model plans are deterministically **grounded** (free-text topics → real drillable
  categories) and **feasibility-normalized** (phase durations sum to the days remaining); the daily drill is driven by
  the plan's own weekly focus (no divergence); timeline phases show real done/in-progress state; weekly focus shows
  real accuracy + ✓ practiced; a stale-week nudge appears after 7 days. Replaced hardcoded `done:false`.
- **Cleanup** — removed an unused, drifted `CATEGORY_LABELS` copy in `aiService.js`; topic vocabulary now has one
  source of truth (`quantTopics.js`). Cold-start Coach copy fixed ("I'm QuanAI, your coach.").

## 2026-06-14 — Fix stale-duel resurrection: export `ackResult` + durable ack ledger (ADR-044)

A duel finished long ago kept reappearing as "Results ready" on Home after every restart. Root cause + permanent fix.
Bible 2.32→2.33, Arch 2.18→2.19. SW v104→v105.

- **Primary bug** — `DuelCore.ackResult` was **never exported** from `duel-core.js`, so `duel-manager`'s Finish-Duel
  call `DuelCore.ackResult(code)` threw a `TypeError` swallowed by its `try/catch`. The server recovery mirror
  `users.activeDuelId` was therefore **never cleared on Finish** → boot recovery resurrected the completed duel every
  launch. Fix: add `ackResult` to the `DuelCore` export.
- **Durability** — `ackResult(code)` now records the code in a bounded localStorage tombstone (`qr_duel_acked`,
  FIFO≤30) **synchronously**, before the best-effort server clear. Survives refresh/PWA/browser/device restart + SW
  updates → a finished duel can't resurrect even if the network clear never lands (offline).
- **Recovery guard** — `DuelCore.recover()` never returns a tombstoned code (self-heals the stale mirror) and drops
  `abandoned`/`expired` rooms. An un-acked `complete` room still surfaces for the opponent who hasn't viewed it
  (per-user, as designed). `_finishDuel` acks first, then resets+navigates; `create`/`join` clear stale tombstones.
- **Verify:** node --check ×3; a deterministic harness loads real `duel-core.js` and passes all 16 lifecycle
  scenarios (multi-device A/B, offline finish, lobby/active resume, abandoned/expired, code-reuse, bounded ledger).
  SW already bypasses `/api/`+Firestore (no state cache). Docs: ADR-044, FIRESTORE_BLUEPRINT, VERSIONS.

## 2026-06-14 — AI persona rename "Reflex" → "QuanAI" (ADR-043)

Branding migration: the AI companion is now **QuanAI** everywhere it surfaces. Display-name only — no personality,
data, routing, analytics, or caching changes. Bible 2.31→2.32. SW v103→v104.

- **Persona constant** — `services/aiPrompts.js` + `js/companion-ui.js`: `PERSONA` `'Reflex'`→`'QuanAI'`. This
  single constant drives all five system prompts (`sys()` → "You are QuanAI, …"), the AI-modal badge, and the
  throttle copy ("QuanAI is resting for a bit…"), so the whole AI surface re-brands from two lines.
- **Bug fix** — `services/aiBrain.js` cold-start coach used `ctxEngine.PERSONA` (never exported by
  `studentContext` → rendered "undefined"); repointed to `prompts.PERSONA` → "I'm your coach, QuanAI."
- **Personality unchanged** — the shared `sys()` voice rules (calm, warm, concise, data-grounded, non-chatbot)
  already define the intended mentor; not edited, to preserve the ADR-039/040-audited behavior.
- **Preserved (not renamed):** the QuantReflex brand, the "Reflex Drill"/"Reflex Mode" practice feature,
  `quant_reflex_*` storage keys, "Reflex Master" badge, generic "reflexes" copy. The ADR-039 DECISION_LOG record
  naming the old persona stays as history; new ADR-043 documents the change.
- **Verify:** node --check ×3; `grep -rn "Reflex" main-app` → only QuantReflex brand + Reflex-Drill feature copy
  remain; both `PERSONA` constants read `'QuanAI'`; no `ctxEngine.PERSONA`. Docs: ADR-043, AI_INTERACTION_SYSTEM, VERSIONS.

## 2026-06-14 — Premium pricing ₹349/₹599 + Word Problems "Coming Soon" polish (ADR-042)

Pre-launch polish pass. Raised Premium pricing and restored the two staged Word Problems controls from dead UI to
intentional "Coming Soon" experiences. Durations, plan keys, and entitlement gates unchanged. Bible 2.30→2.31. SW v102→v103.

- **Pricing → ₹349/₹599** (paise 34900/59900), every current-state location, UI ↔ backend kept in sync:
  - **Charge path** — `services/paymentService.js` `PLAN_CONFIG.amountPaise` 29900→34900, 49900→59900 (what Razorpay charges).
  - **Constants** — `shared/constants/entitlements.js` `PRICING`; revenue maps `services/aiService.js` + `super-admin api/_lib/metrics.js` `PREMIUM_PRICE_PAISE` (no production data to preserve → updated for consistency).
  - **Display** — `js/paywall.js` `PLANS` (₹349/₹599, ≈₹58/mo & ≈₹50/mo, "Save 14% vs 6 months"); `index.html` FAQ + About copy.
  - Historical pricing in prior ADR/CHANGELOG/VERSIONS entries left intact (accurate ₹299/₹499-era record).
- **Practice Word Problems card restored** — `index.html` removed `display:none`; card is always visible with its
  "Coming soon" badge and taps into the shared `showComingSoon` modal (`practice-modes.js`, unchanged) — no dead control.
- **Duel Word Problems pill** — `js/duel-ui.js`: removed `disabled`/`is-soon` (a disabled button never fired its
  handler). Tapping now animates a brief selection onto Word Problems, slides/fades back to Quick Math, then opens the
  Coming Soon modal; Quick Math stays the effective question type. `css/style.css`: pill transition extended for the
  fade, dead `.timer-pill.is-soon` rule removed.
- **Verify:** node --check on all edited JS; repo grep confirms no ₹299/₹499 or 29900/49900 outside historical docs;
  paywall ₹ == `PLAN_CONFIG.amountPaise / 100`. Docs: ADR-042, VERSIONS.

## 2026-06-14 — Launch-readiness pass for the first 1–2k users (ADR-041)

Post-audit launch hardening, scoped to correctness/UX/security/reliability (hyperscale deferred → ROADMAP §Scale-debt).
Bible 2.29→2.30. SW v101→v102.

- **Forgot-password** — `main-app/js/auth.js` `resetPassword` (enumeration-safe `sendPasswordResetEmail`) + login-screen
  link (`app.js`, `index.html`, `css/style.css`). Closes the no-recovery dead-end.
- **Plan server-authoritative on client** — `firestore-sync._normalizeMonetization` no longer writes entitlement
  defaults to Firestore (in-memory only); stops a stale client normalization from clobbering a fresh server grant.
- **Suspend write-guard** — `firestore.rules` user-update now requires `accountStatus=='active'`, closing
  practice-after-suspend server-side.
- **Destructive admin friction** — `super-admin users.js`: Suspend confirms; Archive + Reset-progress require typed
  ARCHIVE/RESET; `command-center.js`: enabling payment/AI kill switch requires typing STOP PAYMENTS/STOP AI.
- **Coaching broadcast** — two-tap confirm naming the audience (`engagement.js`).
- **Metric honesty** — AI Cost Center subtitle marks $ as token-based estimates (`super-admin ai.js`); WP "Coming soon"
  placeholder hidden (`index.html`).
- **Verified already-correct (audit overclaims):** duel listener teardown, register error differentiation, premium-count
  expired-exclusion, 2-player duels, debounced (not per-question) writes. **AI re-validated** (0 strict keywords, all
  6 prompts used, full gate chain, injection hardening, deterministic fallbacks) — no new AI code needed.
- **Verify:** node --check ×7; rules 58/58; CSS 2458/2458; duel-sim 47/47; AI invariant grep clean. Docs: ADR-041,
  ROADMAP §Scale-debt, VERSIONS.

## 2026-06-14 — AI Ecosystem adversarial-audit remediation (ADR-040)

A 3-agent adversarial trace of the ADR-039 AI found two production-blocking bugs (the AI *looked* built but was
non-functional) + correctness defects + ~1,500 lines of dead code. All fixed. Bible 2.28→2.29.

- **P0 — `services/aiPrompts.js`:** removed `maxLength`/`minItems`/`maxItems` from every schema (OpenAI
  `strict:true` 400s on them → every model call was failing into the deterministic fallback). Brevity now enforced
  by prompt text + server-side `_clip` in `services/aiBrain.js`.
- **P0 — `js/companion-ui.js`:** `deepLink()` now `Router.showView('practice')` then launches `startDrillFromPractice`
  on the next tick (it previously silently no-op'd from a Home-tab modal → advice→action loop was dead).
- **P1 — `services/studentContext.js`:** `serialize()` now feeds the model `sessionImprovementPct`, a recent-session
  snapshot, and the student's first name; deleted the unused `mastery[].trend`/`errorPatterns.topWeakCats`/`bestStreak`.
- **P1 — `services/aiBrain.js`:** failed LLM calls now bill spent tokens (`trackGptCost(e.usage)`); Coach reads
  `aiMissions` for a real cross-feature link. **`js/companion-ui.js`:** initial-load Retry re-runs the original
  feature (not a chat turn); chat history no longer double-counts the turn; removed dead `quiz`/`progress` block
  renderers + unwired `openWordProblem`.
- **P2 — dead-code purge (~1,500 lines):** `services/aiService.js` −511 (3 legacy generators + study-plan fns +
  private helpers), `js/ai-features.js` −967 (old modal bodies, fetch/cache helpers, entire legacy study-plan wizard).
  Public wrappers are now clean Companion delegations.
- **Bible:** ADR-040; AI_INTERACTION_SYSTEM §10 roadmap (mini-challenge = top deferred item). **SW v100→v101.**
- **Verify:** node --check ×11; schema grep → 0 unsupported keywords; 0 callers of removed fns; duel-sim 47/47;
  CSS 2454/2454; rules 58/58; deterministic core re-tested.

## 2026-06-14 — AI Ecosystem: one brain, five experiences, gpt-4o-mini only (ADR-039)

A full redesign of every AI feature into one intelligent tutor that leverages the student data ChatGPT can't have
— on the single production model (gpt-4o-mini), intelligence coming from architecture not model size. New canonical
Bible doc **[AI_INTERACTION_SYSTEM.md](AI_INTERACTION_SYSTEM.md)**. Bumps: Bible 2.27→2.28, Arch 2.17→2.18,
Firestore 2.13→2.14, Security 2.11→2.12. Additive client + server modules (ZERO new serverless functions).

- **Foundation (new `main-app/services/`):** `studentContext.js` (Student Context Engine — server-authoritative
  trends/mastery/flags from the unused goldmine, pure arithmetic, 6h `aiContext` cache, ≤1400-char serialize,
  cold-start), `llmProvider.js` (single-model gpt-4o-mini seam: injection sanitize + `<<<DATA>>>` wrap, strict
  json_schema, retries, accumulated usage), `aiPrompts.js` (versioned registry — model writes only small language
  objects), `aiBrain.js` (assembles AIResponse block envelopes from real data + memory; deterministic fallbacks).
  `aiService.js` gains `getMemory`/`updateMemory` (server-authoritative `users.aiMemory`, field-capped) and the
  **enforced** `enforceAiBudget` daily cost breaker (config/aiBudget → 503 over cap; 30s-TTL, fail-open).
- **API (`api/ai.js` rewrite):** client sends action only (no more trusted `body.stats`); gate order adds
  `enforceAiBudget`; actions `explain | coach | insights | chat | mission | wordproblems`, all returning a block
  envelope under `response`.
- **Client:** `js/companion-ui.js` (the one renderer + conversation engine + chip handling + deep-links + staged
  loading + chip-driven Mission interview), `js/services/ai-analytics.js` (lazy-batched owner-write `aiEvents`).
  `js/ai-features.js` re-points Explain/Coach/Insights/Study-Plan to Companion (signatures preserved). `index.html`
  + `css/style.css` add the AI component system (bottom-sheet, blocks, chips, typing, reduced-motion).
- **Five features, one brain:** Explain (interactive — Simpler/Deeper/Another/Drill), Coach (flag-driven daily
  mentor + deep-link), Insights (weaknesses → actionable missions), Study Plan → **living Mission** (`aiMissions`,
  interview + daily action + weekly adaptation; replaces static `aiStudyPlans`), Word Problems (context-aware
  generation, future-ready behind the coming-soon gate). Cross-feature awareness via shared context + `aiMemory`.
- **Spark/Vercel + rules:** AI daily batch (`services/aiCron.js`, `aiEvents`→`systemMetrics/ai_engagement_{date}`)
  piggybacks the SINGLE existing cron inside the duel sweep — fully guarded, no 2nd cron, no `vercel.json` change.
  Rules: `aiMemory` client-write denied (entitlement guard), `aiEvents` owner create-only + immutable,
  `aiContext`/`aiDaily`/`aiMissions` server-only (default-deny).
- **Verify:** `node --check` all 11 touched/new JS; deterministic core unit-tested; CSS 2454/2454; rules 58/58;
  function count unchanged. Docs synced: ADR-039, AI_INTERACTION_SYSTEM.md, FIRESTORE_BLUEPRINT, SECURITY, VERSIONS.

## 2026-06-14 — Math Duel production polish: PWA-only lock, premium result/share/answering, legacy-CSS purge (ADR-038)

Production-grade *feel* pass on the now-working duel lifecycle (Bible 2.26→2.27, Arch 2.16→2.17; additive client + CSS, no schema/rules/index change).

- **PWA-only lock** (`main-app/js/duel-manager.js`, `js/duel-ui.js`, `css/style.css`): new `_pwaOk()` gates **every**
  duel entry before premium — `openSetup`, `_openJoinWith` (Create / Join / `?duel=CODE`), `_resumeActiveDuel`;
  recovery routing in a browser surfaces only the passive Home card. Browser entry → `DuelUI.renderInstallGate` (⚔️
  "Math Duels live in the app", Install → `window._deferredPrompt.prompt()` / add-to-home guidance, Not-now). No
  bypass; Home card stays discoverable.
- **Result screen perceptually centered, full data** (`js/duel-ui.js` `_resultCol`/`_statRow`, `css/style.css`):
  fixed-height crown slot on **both** columns (equal height → no tilt), subtle winner avatar ring (not a text line),
  restrained 1.9rem score, stats as **three equal `.rs-row` rows** (Correct · Accuracy · Speed) with dividers. Fixed a
  latent bug — a dead V1 `.duel-result-actions { flex-direction:column }` was silently **stacking** the live
  Share/Finish row; removed → intended side-by-side `flex 1 : 1.5`.
- **Premium share card** (`js/services/share-service.js` `_generateDuelCard`, full rewrite): brand header → winner
  banner → two frosted player blocks (gradient avatar + name + big score + **accuracy + speed**) → centered VS badge →
  dark gradient + accent glows + **gold winner ring**. Fixed a real defect — the old `_roundRect(…, fill)` 7th arg was
  ignored so the score boxes **never rendered**. `js/duel-ui.js` now passes `mySpeed`/`opSpeed`/`total`.
- **Answering screen rhythm, unified across modes** (`css/style.css`, `js/duel-manager.js`): `--drill-card-gap`
  (larger card→Submit) + `--drill-submit-gap` (Submit lifts off the numpad); the **duel** card `bottom` now includes
  `--drill-submit-gap` so Practice/Focus/Drills/Tests/**Duels** share one cadence. One skip design everywhere
  (`.has-skip .skip-btn { flex: 0 0 33% }`, Submit ~67%, equal height). Duel header 66/33 (opponent chip / Exit).
  Countdown overlay upgraded (z-index 1000 + blur) and the digit pops each tick (`_popCount`).
- **Legacy-CSS purge** (`css/style.css`, −~495 lines): removed the twice-duplicated "Math Duel V2 — Countdown
  Overlay / Premium Results" block, the dead "Active Duel Mini Card", and the dead V1 results block; the duplicate
  `.duel-result-crown { animation: duelCrownBounce }` had been making the new crown slot bounce. Kept live `#duelResults`
  + `.duel-result-score` + responsive rule. Zero JS refs to any removed selector (grep-verified).
- **Verify:** `node --check` all touched JS (incl. service-worker); CSS braces 2344/2344; `node main-app/scripts/duel-sim.js`
  47/47; dead-selector grep clean. **SW v98→v99.** Docs synced: [DECISION_LOG.md](DECISION_LOG.md) ADR-038, [VERSIONS.md](VERSIONS.md).

## 2026-06-14 — Math Duel P0 stabilization + result redesign (ADR-037)

A two-device test surfaced P0s beyond the audit. **Guest received no questions** — root-caused to ADR-036's own
`solving-exit-forfeit-03` change (it gated `_engine.start()` on `setPresence('solving')` resolving; a slow guest
write left the engine un-started). Fixed in `js/duel-manager.js`: start the engine immediately + `setPresence` in
parallel (`writeAnswer` retry covers the rule race); lock the question set in `_solvePrompts` (snapshot-clobber
proof) + a start watchdog. **Done → "Finish Duel"** real primary button with full cleanup (ackResult + _resetState +
Home idle). **Result-trap fixed:** `_routeRecovered` shows the passive "Results ready" Home card instead of
auto-opening results; results render once; nav-away from results acks (no ghost). **Rematch removed** (button +
handler + both callbacks). **Result screen redesigned** (`js/duel-ui.js` + `css/style.css`): banner → comparison →
one metric → one sentence → Share + Finish Duel. SW v96→v97. `duel-sim` 47/47. Docs: [ADR-037](DECISION_LOG.md),
[VERSIONS.md](VERSIONS.md) (Bible 2.26). Gate: owner two-device full-lifecycle pass.
- **Follow-up (SW v98):** fixed a **Finish-Duel deadlock** ("Finishing…" forever) — `_finishDuel` now does local
  cleanup + navigation FIRST/synchronously then ackResult in the background, plus a 2.5s results-screen **failsafe**
  (`DuelManager.forceReset()` + force-Home) so a missing handler / hung cleanup / SW version mismatch can never trap
  the user. **Result screen** layout regression fixed: full data restored (correct/score/accuracy/speed comparison +
  win reason) in a **mathematically centered** composition — VS row + stats table are symmetric `1fr·auto·1fr` grids.

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
