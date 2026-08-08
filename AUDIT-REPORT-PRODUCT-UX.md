# QuantReflex Main App — Product, UI & UX Deep Audit

**Date:** 2026-07-02 · **Scope:** student-facing app (`main-app/`) as a finished commercial product, pre-launch.
**Method:** three exhaustive codebase sweeps (shell/IA, session engine, design system/premium), the strategy docs (`docs/PRODUCT_STRATEGY.md`, `docs/BIBLE/ROADMAP.md`), and a live browser walkthrough of the running app at 390×844 (auth, home, practice, learn, stats, settings, a full Quick Drill including wrong-answer feedback and the Session Complete screen, the paywall, dark mode, and the Playful theme). Every claim is tied to a file/line or an observed screen state.

---

## 0. What this product actually is — and the one-sentence verdict

QuantReflex's core is a **genuinely excellent drill machine**: client-side generative questions across Quant/DI/LR, a purpose-built adaptive numpad, honest pause semantics, offline-first operation, and a wrong-answer teaching panel that most exam apps never bother to build. The engine is closer to world-class than almost anything else in the Indian exam-prep space.

**The verdict:** the product's inner loop is ready; its **identity layer, emotional layer, and trust layer are not**. The app doesn't know who the student is (no exam selection in the free path), it says contradictory things at the most emotional moment (Session Complete), it decorates a "premium" product with platform emoji, and it shows users a **fabricated percentile**. None of these are engine problems. All of them are fixable before launch without touching the drill engine.

### The user's journey today (first-principles walkthrough)

A CAT aspirant and an IBPS Clerk aspirant both install the app. Both see the same email/password form (no Google sign-in). Both are asked their *name* (required) and a daily goal (10 or 20) — but **never their exam**. Both land on the same Home, drill the same default mix (a 5-question "warmup" that can serve trigonometry), see the same Learn tree, the same Stats. The product's own strategy doc (`docs/PRODUCT_STRATEGY.md §1`) defines success as *"opens the app, picks their exam in two taps, and the plan mirrors their prep"* — and then the shipped app gates exam selection inside the **premium Study Planner** (`js/companion-ui.js` `runPlannerSetup`). The single most important promise in the strategy is unimplemented for 100% of free users and 100% of the first session.

### Competitor lens

If I were building against QuantReflex: I would not attack the drill engine — I'd lose. I would attack (1) the exam-blind free experience ("we ask your exam first and everything is CET-shaped"), (2) the 20-question daily cap + 5-lifetime AI explanations ("we're generous where they're stingy"), (3) trust ("their percentile is simulated; ours is real"), and (4) language ("Marathi/Hindi UI for the Nagpur market they claim as their beachhead" — QuantReflex is English-only). All four attacks work today.

### CEO lens

Would I put ₹10M into this? Into the engine and the doc/governance culture — yes, without hesitation; this codebase is unusually disciplined (ADR log, schema checks, verified explanations). Into the funnel as shipped — no. Sign-up friction, exam-blindness, a paywall whose price is below the fold, no refund policy, and a fabricated social-proof number are exactly the things that make retention and word-of-mouth underperform a great engine. The fixes are weeks, not months.

---

## 1. CRITICAL — must fix before launch

### C1. The app never asks the student who they are (exam identity)
- **What:** Exam selection (tier → exam, already well-designed per ADR-067) exists only inside the premium Study Planner. Onboarding asks name + daily goal only (`js/onboarding.js`). Home, Practice, Learn, and Stats are exam-agnostic for every free user.
- **Why it matters:** Exam identity is the #1 personalization primitive in this category. It drives par-times (Banking ~34s/Q vs CAT depth), topic weighting, Learn badges (the `QR_EXAMREL` layer **already exists** — `data/knowledge/exam-relevance.js`), motivation copy, and the feeling of "this app is for *me*." Every serious competitor asks it first.
- **User problem solved:** "Is this app for my exam?" answered in the first 10 seconds instead of never.
- **Fix:** Move the existing tier→exam picker (from `companion-ui.js`, cards already built) into onboarding for all users, storing `targetExam` on the profile. Free tier uses it for labels, Learn ordering (`recommendedOrder`), and par-time defaults; the premium Planner keeps the date/daily-time steps. "Not sure? Foundation" stays as the escape hatch.
- **Expected impact:** Very high (activation, D1 retention, perceived relevance). **Severity:** Critical. **Confidence:** High. **Worth it:** Unambiguously. **Trade-off:** +2 onboarding taps; mitigated because name/goal steps can be trimmed (see M9). **Philosophy fit:** It IS the philosophy — the strategy doc demands it.

### C2. The "Faster than N% of users" percentile is fabricated
- **What:** `computePercentile` = `clamp(round(speedScore*0.92), 5, 95)` plus ±3 random jitter (`js/services/scoring-service.js:51-55`). There is no cohort. The Session Complete screen presents it as a comparison with real users ("Faster than 44% of users" — captured live).
- **Why it matters:** This is invented social proof. The moment one sharp student (or a competitor, or a reviewer) reads the source of a plain-JS PWA, this becomes "the app lies to you" — a story that kills an education brand. It also corrupts the user's self-model: a struggling student told they beat 44% of users delays remediation.
- **Fix:** Rename the block to **Speed Score** (the honest 0–100 metric that already exists) with the user's own trend ("↑ +6 vs your last session" — self-referential comparison is already computed). Reintroduce percentile only when a real cohort distribution ships (Firestore aggregates make this feasible later).
- **Expected impact:** Removes a trust landmine; self-comparison is also better psychology (mastery orientation beats norm orientation for anxious learners). **Severity:** Critical (integrity). **Confidence:** High — the code is unambiguous. **Trade-off:** Loses a persuasive-looking number; that's the point. **Philosophy fit:** The Bible culture is "verified, honest, deterministic" — this is the one dishonest number in the product.

### C3. Session Complete is emotionally incoherent — the most important screen contradicts itself
- **What (captured live on a 1/5, 20%-accuracy session):** stacked verdicts — "🎉 New Personal Best!" (true only because it was the first session; best-accuracy trigger fires trivially, `drill-engine.js:1052-1061`), "🌱 Growth in Progress" (positive words on danger-red styling), "📚 Tough session — review the concepts and try again with fewer questions," "💪 STRONGEST Trigonometry 100% · 1/1" (n=1), "📝 4 to review" (a dead chip — not tappable, and Review Mistakes is premium anyway), and a cryptic "🏅 Best 20% · 49 spd". Meanwhile the insight literally recommends "try again with fewer questions" but ADR-089 removed every retry affordance.
- **Why it matters:** This is the reward moment — the screen that decides whether the user comes back tomorrow. Great products give it a single verdict, a single number, a single next action. Four conflicting emotional signals read as machine-generated noise, and a "Personal Best" on a failed session reads as flattery the user can't trust (which then devalues *real* personal bests).
- **Fix (one hierarchy):**
  1. **One verdict** — pick the highest-priority true statement (personal best only when a prior baseline of ≥3 sessions exists; otherwise the accuracy-band badge OR the insight, never all three).
  2. **Suppress n<3 strongest/weakest** topic cards.
  3. Make "N to review" **the primary CTA** when accuracy <70% ("Review these 4 now") — see H5 for the free-tier version.
  4. Add **one contextual retry** ("Try 5 easier questions") when the insight recommends it — keep forward-only as the default, break it only when the app itself tells the user to retry.
  5. Decode the chips ("Best 20%" and "49 spd" → plain words or remove).
- **Expected impact:** Very high on retention and perceived intelligence. **Severity:** Critical. **Confidence:** High for the contradiction problem; Medium-high for each specific remedy. **Trade-off:** Less "stuff" on the screen — that's the win. **Philosophy fit:** "Action-first — every tap moves you closer" (About modal) — currently the screen offers analysis with no action.

### C4. Emoji is the app's icon system — it caps the product at "hobby project" perceived quality
- **What:** Functional iconography across the paywall (🧠 hero, 🤖, a date-showing 📅, 🏆), all Settings rows, all Practice mode cards, page headers ("Settings" preceded by an emoji gear), verdict/insight chips, and the bottom nav (colored emoji-style SVGs of a house/pencil/book/gear — visually identical to emoji). Confirmed across every screenshot.
- **Why it matters:** Emoji render differently per platform/vendor, carry no brand, vary in visual weight, and read as childish next to "India's precision training platform." No product this audit benchmarks against (Linear, Stripe, Superhuman, Notion) uses emoji as system iconography. This is the single highest-leverage *visual* change available: one consistent stroke-style SVG set (Lucide-class, self-hosted, currentColor-tinted so it themes automatically) would move perceived quality more than any redesign.
- **Scope for launch:** paywall + bottom nav + settings rows + practice cards + page headers. Emoji can stay in *celebration copy* (🎉 in a toast is voice, not UI).
- **Expected impact:** Very high on "feels premium"; zero functional risk. **Severity:** Critical for the stated goal (world-class feel). **Confidence:** High. **Trade-off:** A day or two of asset work; slightly less "friendly" — recoverable via the Playful theme doing actual playfulness (H12). **Philosophy fit:** "Precision" brand demands precise iconography.

### C5. No Google Sign-In
- **What:** Email + password (+ optional Coaching ID) is the only path (`index.html:24-73`; grep confirms no `GoogleAuthProvider` anywhere).
- **Why it matters:** The target demographic (Indian students on Android) lives in Google accounts. Email/password is the highest-friction auth pattern: typing two fields on mobile, password-reset support burden, and abandonment at the very top of the funnel — before the product has shown anything. Firebase makes Google one-tap nearly free to add.
- **Expected impact:** High single-digit to double-digit signup conversion lift (typical for this change). **Severity:** Critical (funnel). **Confidence:** High. **Trade-off:** Popup/redirect handling in a PWA needs care (works; Firebase supports both). **Philosophy fit:** Speed-first product should not have the slowest possible front door.

### C6. The product contradicts itself in shipped copy and defaults (drift bundle)
- **What (each verified):**
  - `manifest.json:4` and the About modal target **GMAT/GRE, NTSE/Olympiad, school students Class 6-12** — exams the strategy explicitly *removed* (`PRODUCT_STRATEGY.md §2`: "Remove (10): GMAT, CLAT, JEE, Olympiad…").
  - Daily goal: onboarding offers **10/20** ("Goals above 20 require Premium"), Settings defaults to **50** (range 10-500), Home ring markup says **50**, home-view logic says **20**.
  - The tab says **"Stats"**, the screen says **"Analytics"**, the App Guide says both.
  - Greeting fallback renders **"Good afternoon, QuantReflex"** — the app greets itself (`home-view.js:258`).
  - `#dailyGoalCard` widget is titled **"Daily Training Ring"** — the name of the mechanism, not the meaning ("Today's Goal").
- **Why it matters:** Individually trivial; collectively these are exactly what makes a product feel unfinished to a careful user (and every CAT aspirant is a careful user). Positioning drift (GMAT) also re-blurs the focus the strategy fought for.
- **Fix:** One copy-sync pass: manifest + About aligned to the 4-tier catalog; one goal default (20) and one range everywhere; "Stats" everywhere (shorter, matches the tab); greeting falls back to "there" or drops the name; ring renamed "Today's Goal."
- **Severity:** Critical as a bundle. **Confidence:** High (all verified in code). **Trade-off:** None. **Philosophy fit:** The Bible's own rule — "no change is complete until docs and code are synchronized" — applied to user-facing copy.

### C7. The paywall under-sells and the commercial trust layer is missing
- **What (verified live + `js/paywall.js`):**
  - **Price is below the fold**: hero + 7 benefit chips + a 13-row comparison table come before the plans; on a 390×844 phone the user scrolls ~2 screens to learn it costs ₹349. Screenshot confirms no price visible.
  - Benefit chips and the comparison table **say the same things twice**.
  - **"AI explanations: 5 total"** (lifetime) sits in the free column — it reads like a typo and frames the brand as stingy at the exact moment you're asking for money.
  - **No refund/cancellation/support line anywhere** in the app (searched: zero hits for refund/money-back). For prepaid one-time payments from students, absence of a refund line depresses conversion and invites disputes; Razorpay disputes without a stated policy resolve badly.
  - The advertised premium benefit **"Advanced Themes" is a near-invisible tint** — see H12; selling it as a headline benefit invites "I paid for *this*?"
- **Fix:** Plans + price + CTA visible on the first screen; single benefits list (cut the chips or the table); reframe the AI-explanation free allowance (per-day, or "5 free to try"); add one trust row: "One-time payment · No auto-renewal · 7-day refund · quantreflex@gmail.com"  <!-- SUPERSEDED by ADR-143 (2026-08-04): the canonical refund policy is a 24-HOUR request window, provider-neutral. The 7-day wording is preserved as the period-accurate record of this audit and must NOT be implemented; shipped copy reads "24-Hour Refund". See docs/BIBLE/PAYMENT_ARCHITECTURE.md 5.1. -->; replace "Advanced Themes" in the benefits list with something real (e.g., Timed Mocks, which IS gated and IS valuable).
- **Expected impact:** Direct conversion lift; fewer support disputes. **Severity:** Critical (revenue + trust). **Confidence:** High on structure; Medium on exact copy choices. **Trade-off:** A refund policy costs some refunds — cheaper than chargebacks and distrust. **Philosophy fit:** "One-time payment, no auto-renewal" is already the most trustworthy pricing in the category — finish the thought.

---

## 2. HIGH IMPACT

### H1. Success is punished less than failure is celebrated — reversed reinforcement
- **What:** Wrong answer → sound (`wronganswer.mp3`) + triple haptic + shake + rich panel. Correct answer → *silence*, single haptic, small "✓ Correct" (`drill-engine.js:701-719`; there is no correct-answer sound file at all in `sounds/`).
- **Why:** Basic reinforcement design: the rewarded event should be the *desired* one. Duolingo's most-copied asset is its correct-chime. For an anxious aspirant, an app that only ever makes noise at failure trains dread.
- **Fix:** Short, satisfying correct sound + a subtle in-session streak tick ("3 in a row" glow at 3/5/10); *soften* the wrong state (keep the panel, drop the shake or make it 1 subtle pulse). Respect the sound toggle and reduced-motion as today.
- **Impact:** High (session feel + habit). **Severity:** High. **Confidence:** High. **Trade-off:** Sound design taste; keep one family. **Philosophy fit:** "Rewarding" without becoming a toy — no coins, no confetti storms.

### H2. Reflex-timer expiry is mislabeled as a wrong answer
- **What:** Per-question timeout auto-submits an empty answer → same "Not quite" + wrong-answer sound + shake as an actual error (`drill-engine.js:1337-1356` → `checkAnswer`).
- **Why:** Running out of time and being wrong are different failures with different remedies (pace vs concept). For the exam-anxiety persona, being *told you were wrong when you never answered* is disheartening and inaccurate.
- **Fix:** Distinct "⏱ Time's up" verdict, no wrong-sound (or a neutral tick), correct answer still shown; stats can still count it as unattempted-wrong internally (already tracked as null response time for speed).
- **Impact:** Medium-high. **Severity:** High. **Confidence:** High. **Trade-off:** None meaningful.

### H3. The numpad squats on the learning moment
- **What:** After answering, the numpad (13.75rem ≈ 40% of the viewport) stays visible while the explanation panel gets clipped inside the card and needs inner scrolling — captured in the feedback screenshot (the "📖 Review…" link is cut off mid-card).
- **Fix:** On answer, collapse/hide `#customNumpad` and let the feedback panel take the full height; restore on next question. The engine already re-renders per state, so this is a state-class change.
- **Impact:** High (the wrong-answer explanation is the app's pedagogical crown jewel — it deserves the screen). **Severity:** High. **Confidence:** High. **Trade-off:** A layout shift between states; animate it (respecting reduced-motion).

### H4. The daily loop costs 3 taps; it should cost 1
- **What:** Home "Start Training" → full-screen pre-session interstitial (5 Questions / ≈1.8 min / Medium / Relaxed) → "Begin Challenge" → (optionally a subject picker) → first question. The interstitial shows the *same four facts every single day*.
- **Why:** This is the Superhuman test: the habitual path must be instant. The interstitial is valuable for Custom/Mock/DI-Set (real decisions) and worthless for the daily warmup (no decisions).
- **Fix:** The Home warmup CTA starts the drill immediately (keep the interstitial for Practice-tab modes, or first-run only). "Ask Subject" default off for warmup.
- **Impact:** High (daily friction compounds). **Severity:** High. **Confidence:** High for warmup; Medium for whether to keep interstitials elsewhere (keep them). **Trade-off:** Loses a "breath" moment before drilling; acceptable for a 5-question warmup.

### H5. Free users are shown their mistakes and then locked out of learning from them
- **What:** Results chip says "📝 4 to review"; Review Mistakes is premium (`_LOCKED_FEATURES`), and the chip isn't tappable anyway.
- **Why:** Pedagogically, reviewing your own errors is the highest-value action in the product; commercially, *experiencing* review-then-losing-history converts better than never touching it. Currently it's the worst of both: visible, dead, gated.
- **Fix:** Free = review **this session's** mistakes immediately from the results screen; Premium = the cross-session mistake archive + spaced re-queue. The chip becomes the CTA (see C3).
- **Impact:** High (learning outcomes + conversion). **Severity:** High. **Confidence:** High. **Trade-off:** Gives away a slice of a premium feature; the archive remains the durable value.

### H6. Cold-start surfaces read as failure before the user has done anything
- **What:** First Home shows "🔥 0" streak badge, "0 / 0% / 0" hero stats, "0/20 questions." First Practice shows "Daily Questions 0/20."
- **Why:** Zeros are the app saying "you are nothing yet." Duolingo hides the streak until day 1; Apple Fitness shows an empty ring, not "0%."
- **Fix:** Hide the streak chip until ≥1; hero stats show "—" or a "First session →" prompt pre-first-drill; quota bar hidden until ≥1 question used.
- **Impact:** Medium-high (first impression). **Severity:** High. **Confidence:** High. **Trade-off:** None.

### H7. Dark mode ignores the OS
- **What:** Zero `prefers-color-scheme` usage (verified); dark is a manual toggle only. Students drill at night; first launch at 11pm is blinding white.
- **Fix:** Default = follow system (`matchMedia` at boot before paint — the early-apply hook already exists at `app.js:54-59`); Settings becomes System/Light/Dark. Keep manual override persistent.
- **Impact:** Medium-high. **Severity:** High. **Confidence:** High. **Trade-off:** Tiny migration for existing settings values.

### H8. Timers have no urgency state
- **What:** Both timers render as a static text line "⏱ 32s" (`drill-engine.js:1324,1339`); verified no low-time styles exist. In a *speed training* app, time pressure is the product — and it's invisible.
- **Fix:** ≤5s: color shift to danger + gentle pulse on the numeral (static color-only under reduced-motion). Timed Test: a thin depleting bar reads faster than digits.
- **Impact:** Medium-high (core identity). **Severity:** High. **Confidence:** High. **Trade-off:** Must stay subtle to avoid anxiety amplification — color + weight, not klaxons.

### H9. Math Duel is the biggest thing on Home, and at launch it's an empty room
- **What:** Duel is the first Explore card with a primary "Create Duel" button; both paths are PRO-gated; and on launch day there is no one to duel. A free user's most prominent Home CTA below the warmup leads to a paywall for a feature with zero liquidity.
- **Fix for launch:** demote Duel below AI Coach/Planner (or behind Practice), and/or ship a "vs. the clock ghost" (race your own best) until real liquidity exists; show the lock state on the card itself rather than after the tap.
- **Impact:** Medium-high (avoids day-one bait-and-disappoint). **Severity:** High. **Confidence:** High on the liquidity problem; Medium on the ghost-mode remedy. **Trade-off:** Duel is a real differentiator later — this is sequencing, not deletion.

### H10. Contrast and selection basics
- **What:** `--qr-text-mut: #94a3b8` on white ≈ 2.6:1 used for paywall price-per-month, CTA note, and free-column values — fails WCAG AA precisely on the money screen. Global `user-select: none` on `*` (style.css:87-93) means students cannot copy a question or explanation to notes/study groups.
- **Fix:** Bump muted to ≥ #64748b where it carries meaning; allow selection on `.question-text`, explanation panels, and Learn content.
- **Impact:** Medium. **Severity:** High (accessibility + sharing is organic growth). **Confidence:** High.

### H11. Performance envelope for the actual target device
- **What:** One 394KB render-blocking unminified CSS file + 93KB index.html + ~40 script files. Target market = low-end Android on flaky 4G (the SW mitigates repeat loads; first load and every post-deploy network-first CSS fetch still pay it).
- **Fix:** Minify CSS/JS in the build; split the monolith at least into shell vs views; keep the no-framework philosophy.
- **Impact:** Medium (first-visit conversion, PWA install funnel). **Severity:** High for the market. **Confidence:** High that it's cheap; Medium on measured gain (run Lighthouse on a low-end/3G profile before and after).

### H12. Playful theme must be visibly a theme
- **What:** Premium "Playful Professional" changes bg `#f8fafc→#faf9f7` and accent `#2563eb→#2a63c6` — side-by-side screenshots are nearly indistinguishable. It's a paid feature a buyer cannot see.
- **Fix:** Either make it real (warm accent family, rounded display font for numerals, softer shadows — an actual mood) or stop selling it (remove from paywall benefits; keep as a free easter egg). Don't ship a paid invisible.
- **Impact:** Medium (premium integrity). **Severity:** High because it's *sold*. **Confidence:** High on the problem; theme design itself is taste work.

---

## 3. MEDIUM IMPACT

- **M1. Remove the "Word Problems — Coming soon" card** from Practice (`index.html:400`). Launch products don't advertise their absences; it also breaks the grid's promise that every card starts a session. Re-add when it ships. *(High confidence.)*
- **M2. Exit dialog copy is false:** "Your progress will be lost" — per-question answers/stats are already recorded (the engine batches to Firestore during the drill). Say what's true: "End this session? Answered questions are saved; the session won't get a summary." Honesty also reduces exit anxiety. *(High confidence.)*
- **M3. Skip is governed by three invisible conditions** (setting ON + entitlement + difficulty ≠ hard, `drill-engine.js:542-544`). A student who had Skip yesterday loses it silently on Hard. Either always render it (disabled with a reason on hard) or simplify the rule. *(Medium confidence on remedy, high on the confusion.)*
- **M4. DI charts print exact values on every bar/point** (`di-charts.js`) — real exam DI requires *reading* the chart. Hide value labels at hard difficulty (the renderer already knows difficulty via the spec); keep them at easy as scaffolding. Improves exam fidelity, the product's stated purpose. *(Medium-high confidence.)*
- **M5. Tablet is a phone in the middle of the screen** for Practice/drill (container 480px; only Learn widens, style.css:283, 11023-11026). A two-column Session Complete and a wider drill card at ≥768px are cheap wins for the coaching-institute context (shared tablets). *(Medium confidence on priority.)*
- **M6. No Hindi/Marathi anywhere** despite the Nagpur/Maharashtra beachhead strategy and the Marathi-medium R.S. Aggarwal edition being cited as a reason for the strategy. Full i18n is post-launch scale work, but the *decision* (string-table scaffold vs hardcoded copy) is a pre-launch architecture choice — every week of new hardcoded strings raises the cost. Flag now, scaffold early. *(High confidence on strategic mismatch; Medium on timing.)*
- **M7. Design-token debt:** broken `var(--text-secondary)` (never defined; `inbox-view.js:167`), 40+ raw z-index values (0→10010), 234 inline style writes across 22 JS files, duration tokens defined but unused. One consolidation pass; add the missing tokens; adopt them in new code. *(High confidence; incremental.)*
- **M8. Reminder opt-in is buried in Settings.** Ask at the first high-motivation moment (first daily-goal completion): "Want a nudge to protect your streak tomorrow?" — the single best-converting notification prompt pattern. Never ask at first launch. *(High confidence.)*
- **M9. Onboarding requires a name** and blocks Next/Skip until typed (`onboarding.js:439-451`). Make it optional (fallback "Aspirant"); asking for exam (C1) is worth a step, a mandatory name is not. *(High confidence.)*
- **M10. Pause affordance is a tiny low-contrast ⏸ top-left** (visible in screenshots), and DI/LR Set sessions have no pause at all while being the *longest* sessions. Enlarge the target; add pause to set-mode. *(High confidence.)*
- **M11. MCQ verdicts should not be color-only:** ensure `.mcq-correct`/`.mcq-wrong` also carry ✓/✗ glyphs for color-blind users (the wrong-answer panel helps, but option-level state is color-coded). *(Medium confidence — verify current rendering, then fix.)*
- **M12. "5 total" AI explanations** for free (paywall table) — if kept as lifetime, expect it to read as broken when it runs out mid-week. Convert to a small daily or weekly allowance; the marginal API cost is bounded by the existing 30/day premium cap. *(Overlaps C7; called out because it's also a product decision, not just paywall copy.)*

---

## 4. NICE TO HAVE

- **N1. A signature numeral face.** Questions are 90% digits; a distinctive tabular display font for stems/results (self-hosted, subsetted) would give QuantReflex a recognizable "look" the way Duolingo's face or Linear's grays do. System fonts are fine; they're just anonymous. Also: the current stack leads with `'Segoe UI'` — a Windows-first choice for a mobile-first product.
- **N2. Streak insurance.** One "streak shield" earned per week of goal-hits (auto-consumed on a missed day). The single most retention-positive mechanic from the Duolingo playbook that doesn't infantilize a serious trainer.
- **N3. Weekly recap card** (Mon morning: questions, accuracy delta, best day, one recommendation) — shareable, feeds the inbox that currently sits mostly empty.
- **N4. Sound design pass:** one coherent family for correct/wrong/finish/tab (current files are unrelated one-offs); correct-chime pitch rising with in-session streak is a cheap delight.
- **N5. Session-complete share card** already exists (`ShareService.shareAsImage`) — brand it properly once C4's icon work lands; organic acquisition in study WhatsApp groups is this product's natural channel.
- **N6. Home avatar system** (initial → photo/color pick) — the "Q" initial default reinforces the greeting bug (C6).

---

## 5. LEAVE AS IS — do not touch these

- **L1. The drill engine's interaction core.** Stable never-shifting numpad grid with contextual symbol slot (`numpad.js`), answer-format-driven keys/validation (`answer-format.js`), no native keyboard ever, hold-to-repeat/hold-to-clear backspace, tolerance-based grading, pause that truly freezes timing anchors, auto-pause on backgrounding, honest "Preparing your questions…" loader, idempotent finish/race guards. This is the best-engineered part of the product and better than most native apps. **Any redesign should treat it as load-bearing.**
- **L2. The wrong-answer teaching panel structure** (verdict → correct answer chip → "Why" steps → Learn link). Best-in-class pattern; C3/H3 refine its placement, not its substance.
- **L3. No XP, no coins, no levels.** Correct call for a serious trainer. Resist the urge; strengthen personal records and streaks instead (H1, N2).
- **L4. One-time payment, no auto-renewal.** A genuine trust differentiator in a market burned by auto-renewing subscriptions. Keep it and say it louder (C7 trust row).
- **L5. Offline-first, client-generated questions + the SW strategy** (network-first app code, cache-first assets, never-cache API). Architecture is right.
- **L6. Plain-text Unicode math.** For this domain (arithmetic/speed), ², √, × as text is fast, accessible, and honest. KaTeX would be weight without benefit.
- **L7. The no-framework vanilla discipline and the Bible/ADR governance culture.** It's why this audit could verify everything.
- **L8. Adaptive difficulty's visible pill** ("Medium ●") — quiet, honest, informative. Good as is.

---

## 6. Closing

**If I were personally responsible for shipping QuantReflex to millions of users, these are the changes I would insist on before release:** ask every student their exam in onboarding and shape the app around the answer (C1); delete the fabricated percentile and replace it with the honest Speed Score trend (C2); rebuild Session Complete around one verdict, one number, one next action — with mistakes reviewable on the spot (C3, H5); replace emoji with one real icon set on the paywall, nav, and headers (C4); add Google Sign-In (C5); run the copy/default sync pass so the product stops contradicting itself (C6); and put the price, a single benefits list, and a refund/support line on the first paywall screen (C7). With those seven done, the excellent engine underneath finally gets the product it deserves — and I would ship it.
