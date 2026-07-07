# QuantReflex — Comprehensive Product Audit

**Doc Version:** 1.0 · **Date:** 2026-07-07 · **Scope:** `main-app/` (student PWA) + touch-points in `super-admin-app/`
**Status:** Reference audit for future development. Every finding is backed by repository evidence (`file:line`).
Companion: [README.md](README.md) · [TECHNICAL_BIBLE.md](TECHNICAL_BIBLE.md) · [ROADMAP.md](ROADMAP.md) · [DECISION_LOG.md](DECISION_LOG.md) · [PAYMENT_ARCHITECTURE.md](PAYMENT_ARCHITECTURE.md)

> **How to read this doc.** Section 1 is the verdict. Section 2 is a reference map of the whole product
> (feature-by-feature, free-vs-premium). Section 3 is the findings register, grouped by area — each finding is
> `ID [Severity]` with **Location · Evidence · Why it matters · Recommendation · User impact**. Section 4 records
> what is genuinely excellent. Section 5 is the prioritized roadmap. Section 6 states scope limits.
>
> Severity scale: **Critical** (breaks/loses data or forgeable revenue) · **High** (trust/UX damage many users hit) ·
> **Medium** (real defect or quality gap, bounded blast radius) · **Low** (localized) · **Polish** (cosmetic).

---

## 1. Executive summary

QuantReflex is a **Speed-Aptitude trainer** for Indian competitive exams (CAT/MBA-CET/Banking/SSC). Its defining
philosophy, enforced in code and docs, is twofold: **(a) grow only along the *generative* axis** — a subject ships
only if its questions can be programmatically generated (admits Quant, Data Interpretation, and generatable Logical
Reasoning; excludes VARC/GK) — and **(b) measure real improvement, never invent it** — history-dependent metrics
render an honest "collecting data" state rather than a fabricated number ([ROADMAP.md](ROADMAP.md) §V2, §Analytics
Foundation). The product is a vanilla-JS PWA (no framework), Firebase-backed, Razorpay-monetized, with a companion
Super-Admin app and a Coaching-Admin app.

**Overall verdict: this is a mature, high-craft codebase that materially over-delivers on engineering discipline for
its stage (~2–3k users).** The evidence for that is concrete and threaded throughout Section 4 — honest metrics with
no fabricated percentile, server-enforced premium that can't be forged client-side, a clock-tamper-resistant
entitlement model, an accessible pure-SVG question renderer, and a genuinely production-grade reporting + in-app
update system (the subjects of the four most recent ADRs, 096–102).

The findings below are therefore **overwhelmingly polish, consistency, and product-completeness gaps, not bugs.**
That distribution is itself the headline: there is no Critical finding and no data-loss/forgeable-revenue defect.
The highest-value opportunities cluster in three places: **(1) premium honesty** — the paywall advertises a free
allowance that does not exist; **(2) visual-question presentation** — the DI charts are one gridline-and-color pass
away from feeling exam-grade; and **(3) onboarding + guide completeness** — the two of three headline subjects
(DI, LR) that the app is proudest of are the least taught to a new user.

---

## 2. Product map (reference)

### 2.1 Ecosystem & shell
- Three independently-deployed vanilla-JS PWAs: **main-app** (student), **super-admin-app**, **coaching-admin-app**
  ([README.md](README.md)). Firebase Auth + Firestore; Vercel serverless (Hobby cap = 12 functions/app); Razorpay.
- Boot: `body{opacity:0}` → `.loaded` added at `js/app.js:411`; a 6-stage splash (`app.js:329-381`); a three-state
  auth machine `unauthenticated | hydrating | app` (`app.js:422-479`) with an 8 s auth timeout + 6 s hydration
  watchdog. Router (`js/router.js`) supports `#view/subpath` deep links, `popstate` interception during drills/duels,
  and `EventRegistry.clearAll()` teardown on logout.
- **5 tabs** (`index.html:1518-1523`): Home · Practice · Learn · Stats · Settings. Plus a 6th **`#view-duel`** with no
  tab (reached via `#duel`/DuelManager), and two `js/views/*` modules that are *not* routed views — Inbox (a drawer)
  and Planner (a companion bottom-sheet).

### 2.2 Practice (the core loop) — `js/controllers/practice-modes.js`, `practice-config.js`, `js/drill-engine.js`
Seven engine-launched modes (`practice-modes.js:113-121`) + Timed Mock + DI Set + LR Set + Session Review, surfaced
as 11 cards (`index.html:352-413`). MCQ vs typed/numeric is decided by `q.options`; the numpad's allowed keys come
from `QRAnswerFormat` (`js/answer-format.js`). Free vs premium:

| Mode | Free? | Gate (`showPaywall(...)`) |
|---|---|---|
| Quick Drill / Reflex / Timed Test | **Free** | — (subject to 20/day cap) |
| Focus Training (base) | **Free** | — |
| Mixed Aptitude | **Free** | — |
| DI Set / LR Set | **Free** *(but labeled "premium" — see PREM-2)* | none |
| Session Review (this session's misses) | **Free** (by design) | — |
| Custom Training | Premium | `custom_training` |
| Review Mistakes | Premium | `review_mistakes` |
| Timed Mock | Premium | `timed_mocks` |
| Focus **Timer** | Premium | `focus_timer` |
| Adaptive difficulty | Premium | `adaptive_training` |
| Hard difficulty | Premium | `hard_mode` (silent downgrade to medium if free) |
| Skip questions | Premium | `skip_question` |
| Word Problems | — | "Coming soon" placeholder (no session launches) |

Free tier ceiling: **20 questions/day** (`paywall.js:93-102`, client localStorage `todayAttempted`).

### 2.3 Question engines — **68 categories total**
- **Quant** (`questions.js` + `quantTopics.js`): 36 categories, archetype framework (ADR-083), earned difficulty.
- **DI** (`di-engine.js` + `ui/di-charts.js`): 5 categories (bar/line/pie/table/caselet), multi-series/stacked
  renderer, always-clean numeric answers; **DI Sets** via `di-set-engine.js`.
- **LR** (27 categories): 12 generative (`lr-engine.js`), 5 authored (`lr-authored-engine.js`), 10 visual
  (`lr-visual-engine.js` + `ui/lr-figures.js`); **LR Sets** via `lr-set-engine.js`.
- **Mock** (`mock-engine.js`): weightage-true blueprints from `QR_SYLLABUS`, real marking scheme.
- Difficulty resolver `_getDifficulty()` (`questions.js:30-46`) shared by all engines; **hard silently downgrades to
  medium for free users** (`:41-43`). Answer formats: `QRAnswerFormat.answerFormat(q)` → `{kind:'mcq'|'numeric', …}`
  (`answer-format.js:91-100`).

### 2.4 Learn — `js/views/learn-view.js` + `js/knowledge/*` + `data/knowledge/*`
**62 published topics, zero scaffolds** (36 Quant + 6 DI + 20 LR). Knowledge-object block system (overview/concept/
formula/trick/trap/exam/memory/example/table/revision/related → `blocks.js`). Hub groups by subject → category, with
"Continue / Due-for-revision / Needs-practice / Saved" strips, a unified search over topics + Quick-Reference cards,
a guided **Revise flow** (`#learn/revise`, `revise-flow.js`), and a Quick-Reference library (`js/quick-reference/*`).
Topic action bar: **Practise this** (focus drill), **Quick-revision cheat-sheet**, **Mark complete**, **Save**.
**Reading is entirely ungated**; only edge features (custom topics/formulas, full-screen tables) are premium.

### 2.5 QuanAI suite — `js/companion-ui.js`, `services/aiBrain.js`, `api/ai.js`
One endpoint, one renderer, one server-built envelope. Features: **Explain · Coach · Insights · Study Planner
(Mission) · Chat**. **Every AI action is premium-only, server-enforced** (`api/ai.js:179` → 403 for free users).
**QuanAI identity guarantee holds** — no provider/model string reaches the client; only `promptId`
(e.g. `explain.base@N`) is client-visible (verified across `companion-ui.js`, `ai-features.js`, `api/ai.js`,
`aiBrain.js`).

### 2.6 Math Duel — `js/duel-core.js`, `duel-manager.js`, `duel-ui.js`
Real-time 1v1 by code; **PWA-only** + **premium**, both server-enforced (`api/duel.js:357,407`). Reuses the drill
engine in capture-only mode (client never grades). Result screen + shareable image card + per-question review.
ELO/leaderboards/replay/rematch are acknowledged debt (ROADMAP DEBT-4/5) and correctly **not surfaced** in the UI.

### 2.7 Premium / entitlement — `docs/BIBLE/PAYMENT_ARCHITECTURE.md`, `js/paywall.js`, `js/firestore-sync.js`
One Premium tier, two durations (₹349/6-mo, ₹499/12-mo). `premium ⟺ plan==='premium' && (planExpiry==null ||
planExpiry>now)`; expiry self-heals to free on read, with a **clock-rewind guard** (`_clockSafeNow`,
`paywall.js:54-61`). Razorpay one-time Orders; double-submit-guarded client flow; idempotent server grant + webhook
safety net.

### 2.8 Reporting + Update systems
Reporting (ADR-096–101): 6 entry points (Settings, in-drill ⚑, AI-explain, Learn, drill/duel review), server-write-
only Firestore model, super-admin moderation dashboard, offline queue. Update (ADR-102): one shared `QRUpdateManager`
across all three apps. Both are recent, well-verified subsystems.

---

## 3. Findings register

### 3.1 Premium experience

**PREM-1 [High] The paywall advertises "5 free AI explanations," but QuanAI Explain has zero free credits.**
- **Location:** `js/paywall.js:331`; `api/ai.js:179-180`; `js/drill-engine.js:879-885`; `js/services/scoring-service.js:83-90`; `js/drill-engine.js:456-473`.
- **Evidence:** the paywall compare table row is `['AI explanations', '5 free to try', 'Unlimited']` (`paywall.js:331`).
  But the QuanAI Explain button locks for non-premium (`drill-engine.js:880` → `'🧠 Explain 🔒'`, `:883` opens the
  paywall) and the server 403s **every** free user before dispatch (`api/ai.js:179-180`). The only "5 credits" that
  exist (`scoring-service.js:85`, `qr_explain_credits`, default 5) are consumed by `_buildAutoTip`
  (`drill-engine.js:456-473`) which gates a **local, deterministic, non-AI rule-based tip** — not the LLM explanation.
- **Why it matters:** the app's stated identity is honesty ("measure real improvement, never invent it"). Advertising
  a free allowance that does not exist for the named feature is the one place the product contradicts that principle,
  and it's on the highest-intent screen (the paywall).
- **Recommendation:** pick one and align both sides — either (a) genuinely grant N free QuanAI explanations (a
  server-side per-user counter, since the client localStorage credit is bypassable and gates the wrong thing), or
  (b) change the compare row to describe what free users actually get (e.g. "Auto-tips" free / "QuanAI explanations"
  premium). (b) is the low-risk honest fix.
- **User impact:** a free user taps "Explain" expecting one of "5 free," hits a hard paywall → broken-promise moment
  at peak intent.

**PREM-2 [Medium] DI Set and LR Set are positioned as "premium exam-style modes" but are fully free.**
- **Location:** `index.html:367` (section comment "the premium exam-style modes"); `practice-modes.js:269-351`
  (`startDiSet`/`startLrSet`) + card handlers `:454-465`.
- **Evidence:** neither launcher nor card handler contains a `canAccessFeature(...)` check — only `hasReachedDailyLimit()`.
- **Why it matters:** either the label is wrong (free users see "premium" framing on a free mode) or a gate is missing
  (revenue leak on genuinely premium-intended content). Both are cheap to resolve once the intent is decided.
- **Recommendation:** decide the intended tier. If free, remove the "premium" framing; if premium, add the gate
  mirroring `custom_training`.
- **User impact:** confusing value messaging, or unmonetized premium content.

**PREM-3 [Medium] The 20/day free cap is only enforced at session launch, not mid-session.**
- **Location:** launch-only checks in `practice-modes.js:83` (+ `:241/:274/:316`); `checkAnswer`/`nextQuestion`/
  `recordAnswer` never re-check; `recordAnswer` increments `todayAttempted` unbounded (`progress.js:144`).
- **Evidence:** a free user at `todayAttempted=19` can start Timed (10), Reflex (10), Mixed (12), or Custom and complete
  the entire session, ending well past 20.
- **Why it matters:** the advertised free ceiling is porous — a motivated free user gets materially more than "20/day."
- **Recommendation:** if the cap is meant to be firm, check it per-question in the drill loop (soft-stop with the
  upgrade prompt at the boundary); otherwise document that it's a per-session-start gate by design.
- **User impact:** inconsistent enforcement; premium conversion pressure is weaker than intended.

**PREM-4 [Low] The daily cap is purely client-side and trivially resettable.** `todayAttempted` + the `toDateString`
reset live in localStorage (`progress.js`); no server generation gate. Contrast with premium expiry, which is
clock-safe (`paywall.js:54-61`). *Recommendation:* acceptable at current scale (question generation is free/local),
but note it — a server counter is the eventual fix if AI/generation cost ever attaches to volume.

**PREM-5 [Low] `startMockFromPractice` has no internal gate.** `practice-modes.js:177-232` — gating lives only in the
card handler (`:439-441`). A planner/deep-link caller would bypass both the paywall and the daily cap. *Recommendation:*
move the `canAccessFeature('timed_mocks')` + `hasReachedDailyLimit()` checks into the launcher itself.

**PREM-6 [Low] Semantic premium-key mismatches** (all correct today under one tier; would misfire if tiers ever split).
Stats deep-dive gates on `ai_coach` while the rest of Stats gates on `performance_insights` (`stats-view.js:15` vs
`:306`); the Home Study-Plan badge keys off `ai_coach` but its CTA paywalls `ai_study_plan` (`home-view.js:411`/`:456`);
the end-of-session upgrade probe uses `canAccessFeature('adaptive_training')` as a premium proxy
(`drill-engine.js:1433`, should be `hasPremiumAccess()`). *Recommendation:* normalize to `hasPremiumAccess()` / the
correct feature key.

**PREM-7 [Polish] Duplicated free-cap constant** — `paywall.js:94` hardcodes `20` independently of the canonical
`shared/constants/entitlements.js:79`. **PREM-8 [Polish] Paywall context line missing** for featureTypes
`settings|stats|daily_limit|premium_required|upgrade` (absent from `_contextAccent`, `paywall.js:303-325`) → those
paywalls open with a generic hero, unlike feature-specific opens.

### 3.2 Visual questions (Phase-5 priority)

*The visual engine is architecturally premium (pure inline SVG + `viewBox`, `role="img"` + rich `aria-label`, en-IN
number formatting, label-overflow guards). The findings below are the gap between "very good" and "exam-grade," and
are evidenced by rendered screenshots produced during this audit.*

**VIS-1 [Medium] DI charts have no y-axis scale or gridlines.** `js/ui/di-charts.js` `_bar`/`_hbar`/`_line` draw only
the baseline/left axis — no horizontal gridlines, no y-tick values. The chart leans entirely on printed data labels.
The scale ceiling is *already computed* (`_niceMax`, `di-charts.js:37-42`) but never drawn. **Why it matters:** the
absence of a gridded scale is the single biggest "this looks like a drill, not a mock" tell versus 2IIM/CAT-style
interfaces, and it makes relative magnitudes harder to eyeball when labels are dense. **Recommendation:** draw 3–4
faint gridlines + y-tick values from the existing `_niceMax` scale (new `.di-grid` class parallel to `.di-axis`).

**VIS-2 [Medium] `xLabel`/`yLabel` are captured in the spec but never rendered.** They exist
(`di-engine.js:207-209`, e.g. `xLabel:'Year'`) and are documented (`di-charts.js:17`), but the renderer only uses
`yLabel` as a series-name fallback (`:48`) — no axis titles are drawn (dead spec fields). **Recommendation:** render
`xLabel` centered under the baseline and `yLabel` as a rotated `<text>`; the data is already there.

**VIS-3 [Medium] Single-series bars are rainbow-colored.** `fill = PALETTE[i % len]` per bar (`di-charts.js:103,125`)
— confirmed visually (a 5-state population bar chart shows five different hues for one series). Color carries no
information in a single series; per-bar hue implies a grouping that doesn't exist (a recognized dataviz anti-pattern).
**Recommendation:** use one accent (`PALETTE[0]`/`--qr-accent`) for single-series; reserve per-index color for
multi-series only.

**VIS-4 [Low] DI series fills are not dark-mode-tuned** (hardcoded hex on the dark `#1e293b` card — only text/axis
colors flip) and **green `#22c55e` / red `#ef4444` are a colorblind collision** in multi-series
(`di-charts.js:25`). *Recommendation:* a `body.dark-mode` desaturated fill set; reorder the palette or add a second
encoding (dash/hatch) for multi-series. LR figures, by contrast, are fully theme-aware — a good internal model.

**VIS-5 [Low] LR stroke weights are inconsistent across categories** on the shared 100-unit grid: shapes `3.5`,
segments `5`, arrows `6`, solid shapes `2` (`style.css:11838/11854/11855/11858`). Elements meant to read as peers
render at visibly different weights. *Recommendation:* drive them from one `--lr-stroke` variable.

**VIS-6 [Low] LR figure caps are small** (`.lr-figure` 130px, option figures 88–96px, `style.css:11834/11895-11896`)
inside a 420px stage — confirmed visually (the embedded-figure "hero" is tiny in a large empty card). *Recommendation:*
`clamp(130px, 40vw, 200px)` so the hero fills more of the stage on larger screens.

**VIS-7 [Polish] Lettered-badge overlap risk** on wide `row` option figures (absolute-positioned A/B/C/D chip over a
centered figure). Low frequency; nudge the figure padding when a badge is present.

### 3.3 Reporting system

**REP-1 [Medium] The Super-Admin report detail never re-renders the reported chart/figure — only raw JSON.**
- **Location:** `super-admin-app/js/views/reports.js` `_tabQuestion` (`:362-391`); capture is complete in
  `main-app/js/services/report-context.js:119-165` (`chart`, `figure`, `optionFigures` all snapshotted).
- **Evidence:** the admin view renders options as text and dumps the spec into a raw-JSON `<pre>` (`reports.js:388`);
  there is no `DICharts.render`/`LRFigures.render` call anywhere in the super-admin app.
- **Why it matters:** the visual report reasons (`chart_wrong`/`figure_render`/`clipping`) are precisely the ones a
  moderator cannot triage without *seeing* the visual — and ADR-096 ships no screenshots by design, so the
  re-render is the only way to see it.
- **Recommendation:** load the dual-exported, dependency-free `di-charts.js` + `lr-figures.js` into the super-admin app
  and, in `_tabQuestion`, render `q.chart`/`q.figure`/`q.optionFigures` (mirroring `drill-engine.js:506-526`). Small,
  self-contained, closes the loop.
- **User impact:** admin-facing — slower/blind triage of exactly the reports that need an image.

*The rest of the reporting system is production-grade (complete capture, source-gated bundles, offline queue,
QuanAI-safe AI metadata) — see Section 4.*

### 3.4 Onboarding & learning experience

**ONB-1 [Medium] No global Back, and abandonment permanently suppresses onboarding.** `onboarding.js:119-131` writes
`onboardingCompleted=true` immediately on show (to defeat a double-show race), and the flow has no global Back — only
the exam picker's internal two-stage back. A user who abandons mid-flow never sees onboarding again and cannot revisit
the name/exam screens. *Recommendation:* mark "started" separately from "completed"; add a Back affordance across the
main steps.

**ONB-2 [Medium] Onboarding never teaches the core practice loop.** Only Learn (screen 2) and Stats (screen 3) are
explained; **Practice modes, Reflex/Timed/Focus/Custom, Math Duel, QuanAI, and tab navigation are never introduced**
(they live only in the App Guide, which a first-run user has no prompt to open). *Recommendation:* add one "here's how
you practice" screen (or a first-session coach-mark) before the warm-up.

**ONB-3 [Low/Med] The warm-up is arithmetic-only while the pitch promises DI + LR.** Screen 0 sells "quant, data
interpretation, and logical reasoning" (`onboarding.js:355`) but the only hands-on moment is pure arithmetic
(`EASY_QUESTIONS`, `:62-79`). *Recommendation:* seed one DI or LR sample into the warm-up (or soften the screen-0 copy).

**ONB-4 [Low] Goal choice is 10/20 only, with an immediate "Goals above 20 require Premium" note** before the user has
answered a single question (`onboarding.js:467-470`) — monetizing pre-value.

### 3.5 About modal & App Guide

**ABT-1 [Medium] The section-entry stagger animation silently collapses after the 6th section — in both the About
modal and the App Guide.** `.guide-animate-section` defines per-item delays only for `nth-child(2)…(6)`
(`style.css:2436-2440`); the About modal has ~13 such sections and the Guide ~11, so **child 1 and every child from 7
onward animate at delay 0** — Developer/Contact/Quote (About) and PWA/Streaks/Tips/FAQ (Guide) all appear at once,
and the elegant stagger stops two-thirds down. **Recommendation:** replace the fixed `nth-child` rules with a small
`nth-child(n)` formula or a JS-assigned `--i` custom property so the stagger scales to any count. Cheap, and visible on
the two screens where users judge polish.

**ABT-2 [Low] The displayed "Version 2.1.0" is a hardcoded literal disconnected from the build tag.** `index.html:1407`
prints `Version 2.1.0`, unrelated to `QR_APP_VERSION='v221'` (`index.html:16`) / the SW `APP_VERSION`. For a
precision-branded app, a hand-typed marketing version that can silently drift from the shipped build is worth
reconciling (source it from a single constant, or document the two schemes).

**GID-1 [Medium] The App Guide barely covers DI and LR despite them being headline pillars.** Mode descriptions are
quant/arithmetic-flavored (`index.html:963-996`); there is no DI-chart or LR-set walkthrough. Two of the three
advertised domains are under-served in the one document meant to teach the app. *Recommendation:* add a DI-reading and
an LR-set section with a worked example each.

**GID-2 [Low/Med] Audience inconsistency between the Guide and the rest of the app.** The Guide's "Built for" lists
"School students (Class 6–12)" and "NTSE/Olympiad" (`index.html:931-935`), while About + onboarding target
MBA/Banking/Government/Coaching. *Recommendation:* pick one audience definition and make all three agree.

**GID-3 [Low/Med] No visuals/worked examples; the Premium + AI marketing tier-cards are oversized and mid-flow**
(`index.html:1068-1236`, ~170 lines) — a first-timer looking for "how do I practice" wades through a sales pitch.
*Recommendation:* move the Premium/AI marketing after the how-to content; add a couple of annotated examples.
**GID-4 [Polish] Mixed straight/curly quotes** across the Guide copy.

### 3.6 Learn

**LRN-1 [Low] The scaffold / "coming soon" subsystem is 100% dead code.** All 62 topics are `status:'published'`;
~6 unreachable paths remain (`learn-view.js:172-175`, `:319-322`, `:405`, `:447-451`, `:469-475`) plus a dead
`drillComingSoon` branch (`:616-620`). *Recommendation:* prune (or keep with a one-line comment that it's a retained
seam) — currently it reads as live behavior that can never fire.

**LRN-2 [Low] DI + LR topics (26 of 62) silently use a 5-day revision fallback, and a comment claims the opposite.**
`revisionIntervalDays` is present only in the 7 Quant data files; DI/LR omit it, so `LearnProgress.computeDue` uses the
`|| 5` fallback (`learn-progress.js:69`) — and the comment "so this fallback never fires in production"
(`:67-68`) is wrong for 42% of the catalog. *Recommendation:* add explicit intervals to DI/LR topics (or fix the
comment + accept the uniform cadence deliberately).

**LRN-3 [Low] "Practise this" for DI/LR topics feeds engine categories into focus mode** (`di-bar`, `lr-coding`, …);
focus mode supports all subjects via `_subjectScope`, so this is very likely correct, but it was not verified
end-to-end from the Learn layer. *Recommendation:* a quick functional confirm that a DI/LR "Practise this" launches a
valid focus session.

### 3.7 Architecture / code health / consistency

**ARC-1 [Low] Dead HTML ids** `#masterySection` / `#timeSection` (`index.html:608/616`) are never toggled by
`stats-view.js` (only `weakestSection`/`recommendationSection` are). **ARC-2 [Low] `_renderDailyQuota` is misfiled** in
`home-view.js:593-633` but renders into Practice's `#dailyQuotaIndicator` and is invoked from `practice-modes.js:383`
— functionally correct, structurally misleading. **ARC-3 [Trivial] Small dead ends:** `onShare:function(){}` never read
(`duel-manager.js:487`); `api/ai?action=wordproblems` unused by the client (word problems serve from the question
bank); duplicated custom-count default (`practice-config.js:14` vs `:30`).

**ARC-4 [Low] Stale documentation/comments (doc-code drift):**
- `README.md` calls coaching-admin-app "Scaffold — not yet built," but it has functional views + APIs (dashboard/
  students/performance/engagement/settings) — the ROADMAP itself says so (§Coaching Portal).
- `ROADMAP.md` / Learn ADR-069 say "19/19 gold, zero scaffolds," but Learn now has **62** published topics.
- `data/knowledge/categories.js:14-16` says DI/LR content arrives "in V2.0/V2.5" — already shipped.
- `data/knowledge/exam-relevance.js:37` says "Quant 1–19" — actually 1–36.
- `js/learn/learn-progress.js:67-68` — the "never fires in production" comment (see LRN-2).
- *Recommendation:* a doc-truth sweep; these mislead future contributors/agents.

**ARC-5 [Low] `answer-format.js` lives at `js/`, not `js/services/`** — a path nit worth noting for module-map accuracy.

### 3.8 Settings polish — **PHASE 9 (implemented in this pass)**
**SET-1 [Polish — DONE] Contact-card email was oversized vs the About modal's typography.** `.contact-card-email` was
`font-size:1rem; font-weight:700` (`style.css:1934`) while the About contact link inherits `.info-block p`
(`.84rem/1.6`, `:2334-2338`). **Change applied:** reduced to `font-size:.84rem` + `line-height:1.6`, **retaining the
accent blue** (`#2563eb`/dark `#93c5fd`) because the Settings email is an interactive tap-to-email affordance — the
About link is non-interactive, so matching its muted slate would remove the affordance cue. Verified with computed-style
assertions (light + dark) + before/after screenshots; `npm test` green (CSS-only, no regression).

### 3.9 Accessibility — **strong**
Evidence of genuine care: figures carry `role="img"` + data-rich `aria-label` (`di-charts.js:71-83`,
`lr-figures.js:244-263`); Learn moves focus to the topic title on open and back to the hub heading on return
(`learn-view.js:839-858`); reduced-motion is honored globally (`@media (prefers-reduced-motion)` + a `.reduced-motion`
body class) and specifically zeroes `kx-*` transitions; 44px touch targets; focus-trap modals; `aria-live` on toasts
and search results. **Nit:** onboarding temporarily sets the bottom nav `pointer-events:none` while spotlighting the
Stats tab (`onboarding.js:230-247`) — intentional, but worth a screen-reader check.

### 3.10 Performance — **no evidence-backed problems found**
`EventRegistry.clearAll()` on teardown (no listener leaks across view/logout transitions); render-on-route mounts only
the active view/topic; the Learn search index builds once; visuals are vector SVG (no raster cost); the drill engine
guards next/advance with debounces. No redundant Firestore writes or observer churn were observed. *(This is an
absence-of-evidence statement scoped to what was read, not an exhaustive profiling pass.)*

---

## 4. What is already excellent (evidence-backed)

1. **Metric honesty is real, not aspirational.** No fabricated percentile anywhere (`stats-view.js`/`data/statMath.js`
   grep-clean; the old simulated "faster than N%" was removed, `scoring-service.js:44-47`). Thin-data trends render
   `—` / "collecting data / available in N days," never a fake "flat" (`statMath.js:88-94,111-115`). This is the
   product's soul, and it's enforced in code.
2. **Cold-start honesty on Home.** 0-streak badge is hidden (not "🔥 0"); accuracy/best show `—` not `0` before any
   attempts (`home-view.js:330-345`); the greeting never says "welcome back" to a new user.
3. **Premium can't be forged client-side.** AI and Duel are gated **server-side** (`api/ai.js:179`,
   `api/duel.js:357,407`); the client gates are UX only. Entitlement self-heals on expiry with a **clock-rewind guard**
   (`paywall.js:54-61`, `firestore-sync.js:555-579`).
4. **QuanAI identity guarantee holds.** No provider/model string is reachable by the client — only the QuanAI-owned
   `promptId` — verified across the full AI path. The real model lives only in server telemetry.
5. **The visual engine is genuinely premium engineering.** Dependency-free inline SVG + `viewBox` (crisp at any DPI),
   accessible, en-IN number formatting, label-overflow guards, theme-aware LR — a strong base that the VIS findings
   only *polish*.
6. **Robust boot/auth resilience** — a three-state machine with an 8 s auth timeout + 6 s hydration watchdog + retry
   loop (`app.js:404-529`).
7. **The reporting + update subsystems** (ADR-096–102) are production-grade: complete report capture, source-gated AI/
   Learn bundles, offline-safe queue, one shared `QRUpdateManager` with a lockstep guard and no reload-loop.
8. **Learn is coherent and honest** — 62 gold topics, no broken internal links, focus/scroll-spy/reduced-motion done
   right, and the entire *reading* experience is ungated.

---

## 5. Prioritized implementation roadmap (by impact)

| # | Item | Finding | Severity | Est. effort |
|---|---|---|---|---|
| 1 | **Contact-card typography** — *shipped in this pass* | SET-1 | Polish | ✅ done |
| 2 | Fix the "5 free AI explanations" honesty gap (grant real credits *or* correct copy) | PREM-1 | High | S (copy) / M (server counter) |
| 3 | Render reported charts/figures in Super-Admin (unblocks visual-report triage) | REP-1 | Medium | S |
| 4 | DI charts: gridlines + y-scale + axis titles + single-series color | VIS-1/2/3 | Medium | M |
| 5 | Resolve DI/LR-Set tier framing + daily-cap mid-session enforcement | PREM-2/3 | Medium | S–M |
| 6 | Fix the stagger-animation cutoff (About + App Guide) | ABT-1 | Medium | S |
| 7 | Onboarding: teach the core loop + add Back navigation | ONB-1/2 | Medium | M |
| 8 | App Guide: add DI/LR coverage + reconcile the audience definition | GID-1/2 | Medium | M |
| 9 | Prune dead code + correct stale docs/comments | LRN-1, ARC-1/3/4 | Low | S |
| 10 | Lower polish: LR stroke normalization + figure caps; version reconciliation; premium-key cleanup; dup constants | VIS-5/6, ABT-2, PREM-6/7 | Low/Polish | S each |

**Sequencing rationale:** items 2–3 are trust/operations wins with tiny footprints; item 4 is the single biggest
*perceived-quality* uplift (charts are what a CAT aspirant screenshots); items 5–8 tighten monetization integrity and
first-run comprehension; items 9–10 are hygiene.

---

## 6. Scope & limitations

- This audit read the **client** surfaces (main-app + the super-admin report view). It did **not** re-audit
  server-side payment/webhook signature verification, Firestore Security Rules, or the coaching-admin app in depth —
  those are covered by [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md) / [PAYMENT_ARCHITECTURE.md](PAYMENT_ARCHITECTURE.md)
  and prior ADRs, and are flagged here only as an out-of-scope follow-up.
- Findings are grounded in code as of 2026-07-07 (`QR_APP_VERSION=v221`). Line numbers may drift as the code evolves;
  the `file` + symbol names are the durable anchors.
- Visual-quality judgments (Section 3.2) are backed by screenshots rendered from the **real** engines + renderers +
  stylesheet during this audit, not by assumption.
- Everything in Sections 3.1–3.7 and 3.9–3.10 is a **recommendation**; only SET-1 (Phase 9) was implemented in this pass.
