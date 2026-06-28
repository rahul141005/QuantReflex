# QuantReflex Changelog

All notable code + documentation changes. Format: dated entries, newest first. Each code change references its audit finding / ADR ID and the affected file:line, lists the documentation kept in sync, and (per [GOVERNANCE.md](GOVERNANCE.md)) any version bump.

Source-of-truth docs: [README.md](README.md) · [TECHNICAL_BIBLE.md](TECHNICAL_BIBLE.md) · [FIRESTORE_BLUEPRINT.md](FIRESTORE_BLUEPRINT.md) · [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md) · [PAYMENT_ARCHITECTURE.md](PAYMENT_ARCHITECTURE.md) · [VERSIONS.md](VERSIONS.md) · [DECISION_LOG.md](DECISION_LOG.md)

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
