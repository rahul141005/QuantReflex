# QuantReflex — Complete Exam Research & Speed-Math Relevance Audit

**"Dragon Boss" audit · single source of truth for every supported exam**

- **Date:** 2026-06-17
- **Scope:** Read-only product + research audit. No application code was modified.
- **Author:** Automated research audit (Claude Code), grounded in the QuantReflex codebase + live multi-source verification of exam patterns.
- **Status of figures:** Exam patterns change yearly; all pattern facts below reflect the **latest available cycle (2025–2026)** at the time of writing. Where official conducting-body pages were not machine-fetchable, reputable coaching aggregators that mirror the official notification were cross-verified, and confidence is flagged.

---

## 0. How to read this report (methodology & labels)

Every claim is tagged so facts and opinions never blur:

- **`[CODE]`** — a verified fact read directly from the QuantReflex source (file + line cited).
- **`[FACT]`** — an exam-pattern fact verified against official / trusted sources (2025–26 cycle). Confidence (High/Med/Low) noted where it matters.
- **`[ASSESS]`** — an analytical judgement (topic relevance, speed scoring, fit scoring, strategy). These are reasoned opinions, not sourced facts.

**Scoring rubrics used throughout (all `[ASSESS]`):**

- **Speed-Math Importance (0–10):** How much *fast mental calculation* directly improves rank. Driven by seconds-available-per-question, calculator availability, question volume, and how "calculation-bound" vs "concept-bound" the quant is. 10 = elite calc speed is the rank differentiator; 0 = speed is irrelevant.
- **Accuracy Importance (0–10):** How much per-question correctness (vs raw attempt count) governs outcome — driven by negative marking severity and cutoff structure.
- **Mental-Maths Importance (0–10):** Reliance on doing arithmetic *in the head / on paper without a calculator*.
- **QuantReflex Fit (0–10):** How well the app *as it exists today* (12 arithmetic speed-drill categories + 6 practice modes + a deterministic topic planner) serves this exam.
- **Planner Accuracy (0–10):** How correct the in-code treatment is — categorisation, topic weights, exclusions, and whether it would misguide a real aspirant.

**Confidence note on the analytical scores:** Speed/Fit/Planner scores are expert assessments calibrated against the verified pattern facts. Reasonable analysts could shift any score ±1.

**Key sources by family:** IIM CAT (iimcat.ac.in), XLRI XAT (xatonline.in), GMAC (mba.com / nmat.org), Symbiosis SNAP (snaptest.org), NTA (cmat.nta.nic.in, cuet.nta.nic.in, jeemain.nta.nic.in), MAHA CET Cell (cetcell.mahacet.org), IIM Indore (iimidr.ac.in), IBPS (ibps.in), SBI (sbi.co.in), RRB (rrbapply.gov.in), SSC (ssc.gov.in), UPSC (upsc.gov.in), AFCAT (afcat.cdac.in), Consortium of NLUs (consortiumofnlus.ac.in), NCERT (ncert.nic.in), HBCSE (olympiads.hbcse.tifr.res.in), plus Testbook / Adda247 / Oliveboard / Career Power / Careers360 / PW / Embibe for cross-verification.

---

## Executive snapshot (read this first)

| Finding | Detail |
|---|---|
| **Exam count** | **26** exams, all enabled, none hidden/disabled. `[CODE]` `main-app/data/syllabus.js:220–282` |
| **Architecture** | Each exam = a **family weight profile + per-exam overrides** (`null` = topic dropped). No per-exam logic. `[CODE]` `syllabus.js:313` |
| **No exam-mechanics metadata** | The model stores **zero** question counts, durations, negative-marking schemes, calculator policies, or adaptivity flags. It reasons purely on topic-importance bands + PYQ-frequency. `[CODE]` |
| **Speed is globally fixed at 12%** | Speed is **12% of the readiness score for every exam alike** (`readiness.js` weights). A banking-prelims aspirant (speed ≈ 90% of the game) and a JEE aspirant (speed nearly irrelevant) are scored on the same speed weight. `[CODE]` |
| **Drills cover arithmetic only** | 12 drillable categories are all arithmetic/mensuration. No drills for algebra, number theory, geometry/trig, DI, data sufficiency, or quadratic comparison. `[CODE]` `services/quantTopics.js` |
| **No mock / sectional-timing mode** | 6 practice modes exist; none simulates a full sectional paper, sectional timers, or negative marking. `[CODE]` `practice-modes.js` |
| **Two factual errors in the catalog** | **JEE syllabus excludes calculus** — the single largest block (~25%) of JEE Main Maths. **NTSE** is modeled as live but has been **suspended by NCERT since 2021**. `[FACT]` |
| **Best-fit exams** | Banking (IBPS/SBI/Bank PO), SSC Tier-1, MAH CET, SNAP, NMAT, Foundation — fast arithmetic under brutal time limits is exactly what the app trains. |
| **Worst-fit exams** | Olympiad, JEE, NDA — concept/proof/calculus-bound, speed is secondary; the app's arithmetic drills barely move the needle. |

---

## STEP 1 — Every supported exam (from source)

`[CODE]` Master list: `main-app/data/syllabus.js` lines **220–282** (`EXAMS` array), `SYLLABUS_VERSION = 2`, documented by ADR-059. Weight bands: `BAND = { 'very-high':0.93, 'high':0.78, 'medium':0.58, 'low':0.40 }` (`syllabus.js:40`). Each exam inherits a **family profile** (`MBA`, `BANKING`, `SSC`, `DEFENSE`, `SCHOOL`, `GENERIC`) and applies `overrides` (a `null` value **drops** the topic).

| # | ID | Display name | Family | Overrides / exclusions | Nuance string (verbatim) |
|---|----|--------------|--------|------------------------|--------------------------|
| 1 | `cat` | CAT | mba | none | "Hardest, concept-deep; rewards Number System + Algebra mastery and DI/Caselet speed." |
| 2 | `xat` | XAT | mba | mensuration↑, set_theory↑, di_caselet↓ | "Tricky, application-heavy QA; strong Arithmetic + Mensuration; trustworthy slow accuracy." |
| 3 | `gmat` | GMAT | mba | data_sufficiency very-high; DI low; **trig dropped**; coordinate_geometry low | "Problem-Solving + Data Sufficiency … no Indian-style DI." |
| 4 | `snap` | SNAP | mba | remainders↓, functions↓, p&c↓ | "Easier & speed-driven; reward fast Arithmetic + basic Algebra." |
| 5 | `nmat` | NMAT | mba | di_tables high, functions↓ | "Speed exam, no negative marking; attempt everything fast." |
| 6 | `cmat` | CMAT | mba | remainders med, functions↓ | "NTA exam, moderate difficulty; solid Arithmetic + DI core." |
| 7 | `mbacet` | MBA CET | mba | di_tables very-high; functions/logs/base↓ | "High-volume, speed-and-accuracy … depth lighter than CAT." |
| 8 | `ipmat` | IPMAT | mba | progressions/logs/set_theory↑ | "After-class-12 entry; cleaner school-grade Algebra + Arithmetic." |
| 9 | `bankpo` | Bank PO | banking | none | "DI + Simplification + Arithmetic word problems; speed is everything." |
| 10 | `ibpspo` | IBPS PO | banking | none | "DI-heavy with Caselet & quadratic comparison." |
| 11 | `ibpsclerk` | IBPS Clerk | banking | caselet/quad-comp med; **p&c, prob low** | "Simpler than PO — Simplification + Number Series + basic Arithmetic dominate." |
| 12 | `sbipo` | SBI PO | banking | di_caselet very-high; p&c high | "Hardest banking QA — newest DI patterns." |
| 13 | `rrbntpc` | RRB NTPC | banking | mensuration↑, di_caselet↓, simplification↑ | "Railway exam — broader basic Arithmetic + Mensuration." |
| 14 | `ssccgl` | SSC CGL | ssc | none | "Advanced maths — Algebra identities, Geometry, Trig, Mensuration all heavy." |
| 15 | `sscchsl` | SSC CHSL | ssc | trig med; **coordinate_geom, statistics dropped** | "Slightly easier than CGL; more Arithmetic weight." |
| 16 | `sscmts` | SSC MTS | ssc | trig/quad low; **coord_geom, statistics dropped** | "Basic arithmetic-led; light Algebra/Geometry." |
| 17 | `nda` | NDA | defense | none | "Maths is 300/900 marks — Trig, Algebra, Matrices, Calculus-adjacent, Statistics, Probability." |
| 18 | `cds` | CDS | defense | matrices med; %/P&L/TSD↑ | "Elementary-maths breadth — Arithmetic + Algebra + Geometry + Trig + Mensuration evenly." |
| 19 | `afcat` | AFCAT | defense | trig med; **matrices dropped**; arithmetic↑ | "Lighter, speed-based numerical ability." |
| 20 | `cuet` | CUET | school | trig/coord↓; di_tables high | "General Test quant — school Arithmetic + basic Algebra + DI." |
| 21 | `clat` | CLAT | school | %/ratio/avg very-high; **quad, progressions, surds, trig, coord, circles dropped** | "Elementary maths from passages — Percentages, Ratio, Averages, basic DI only." |
| 22 | `ntse` | NTSE | school | trig/coord med | "Class-10 MAT/SAT maths." |
| 23 | `jee` | JEE (Quant) | school | quad/functions/coord/trig very-high; **profit_loss, interest, di_tables dropped** | "Advanced 11–12 maths." |
| 24 | `olympiad` | Olympiad | school | remainders/p&c very-high; **di_tables, profit_loss dropped** | "Number theory + combinatorics + geometry proofs — depth over speed." |
| 25 | `foundation` | Foundation | school | **remainders, functions, trig, coord, prob dropped** | "Building the basics — calculation fluency, fractions, percentages, ratio." |
| 26 | `other` | Other | generic | none | "A balanced general quantitative-aptitude plan." |

**Difficulty mapping `[CODE]`:** there is **no exam-level difficulty field**. Difficulty is a *per-topic* number (0.25 → 0.70) in the topic library, e.g. `multiplication_fluency` 0.25, `remainders` 0.65, `trigonometry`/`functions`/`probability` 0.70. Exam difficulty is only *implied* by which topics it weights.

**The 12 drillable categories `[CODE]` (`services/quantTopics.js`):** squares, cubes, area, volume, fractions, percentages, multiplication, ratios, averages, profit-loss, time-speed-distance, time-and-work. **Everything else** (number theory, algebra, geometry/trig, DI, DS, quadratic comparison, P&C, probability, stats) is *study-only* — no in-app drill; readiness is *inferred* from related drill categories via `signals`.

**6 practice modes `[CODE]` (`practice-modes.js`):** Quick (5 Q), Reflex (10 Q @ 15s), Timed (10 Q / 180s), Focus (single category), Custom (1–100 Q multi-topic), Review (mistakes). **No full-length sectional mock; no negative-marking simulation; no sectional timers.**

---

## STEP 2–7 — Per-exam deep dives

> Each exam follows the same template: **Basics → Pattern (verified) → Quant math-type grid → Quant section details → Topic mapping → Speed score → Real-student strategy → QuantReflex Fit → Planner audit → Improvements.**
>
> **Math-type grid legend** (Y = yes / P = partially / N = no): **Math** = formal mathematics · **QA** = quantitative aptitude · **NA** = numerical ability · **DI** = data interpretation · **LM** = logical/reasoning math · **BA** = basic arithmetic · **HM** = higher (11–12) math · **EM** = engineering math · **Stat** = statistics · **MA** = mental ability · **SM** = speed maths · **Calc** = calculation-heavy · **SC** = shortcut-reliant.

---

### FAMILY A — MBA / MANAGEMENT (8 exams)

---

#### 1. CAT — Common Admission Test

- **Basics `[FACT]`:** Conducted by the IIMs (rotating convener), iimcat.ac.in. Gateway to IIMs + 1,200+ B-schools. Once/year (late Nov). English only.
- **Pattern `[FACT]` (CAT 2024/2025, identical):** 3 sections — VARC, DILR, QA. **68 Q, 204 marks, 120 min**, **40 min/section, sectionally locked, fixed order** VARC→DILR→QA. MCQ +3/−1; **TITA (non-MCQ) carry no negative**. **On-screen basic calculator provided.** Fixed (non-adaptive), slot normalization.
- **Quant grid:** Math **Y** · QA **Y** · NA **Y** · DI **Y(DILR)** · LM **Y** · BA **Y** · HM **P** · EM **N** · Stat **P** · MA **P** · SM **P** · Calc **P** · SC **Y**
- **Quant section `[FACT]`+`[ASSESS]`:** Quantitative Ability = **22 Q, 66 marks, 40 min ≈ 1.8 min/Q**. Difficulty **Hard**. Distribution: Arithmetic ~40%, Algebra ~30%, Number System ~15%, Geometry/Mensuration ~10%, Modern Math ~5%. **Concept depth > raw speed**, but calculation fluency frees time for DILR. 95th–99th %ile needed for top IIMs; ~15–17 net in QA often clears 95+%ile. Students *do* run out of time, but the binding constraint is *idea selection*, not arithmetic speed.
- **Topic mapping `[ASSESS]`:** **Critical:** Percentages, Ratio, Profit&Loss, TSD, Time&Work, Number System (remainders, factors, cyclicity), Linear/Quadratic, DI. **Important:** Averages, Mixtures, SI/CI, Progressions, Inequalities, P&C, Geometry, Mensuration, Logarithms. **Useful:** Set theory, Data Sufficiency, Coordinate geometry. **Rare:** Trigonometry (occasional). **Not required:** Calculus, formal stats.
- **Speed-Math Importance: 6/10 — *Benefits from Speed Training*.** `[ASSESS]` Calculation speed is an enabler (it buys minutes for DILR and multi-step QA), but rank is decided by concept mastery and question selection, not mental-arithmetic raw speed. Calculator availability further caps speed's value.
- **Accuracy 9/10 · Mental-Maths 6/10.**
- **Real-student strategy `[ASSESS]`:** Toppers do ~22–28 min of "real" solving in QA, cherry-pick ~15–18 attempts, **skip aggressively** (negative marking + sectional lock), rely on concepts + selective shortcuts, and use the on-screen calculator sparingly. Accuracy >> attempts.
- **QuantReflex Fit: 6/10.** `[ASSESS]` **Strengths:** arithmetic-fluency drills (percentages/ratio/TSD/P&L) build the *foundation* CAT rewards and free DILR time. **Weaknesses/missing:** no drills for the topics CAT actually differentiates on — advanced number theory, algebra, P&C, DI/DILR sets, data sufficiency; no on-screen-calculator-aware practice; no sectional/lock simulation. **Recommend: concept practice >> speed drills** for CAT; speed drills are a warm-up, not the main event.
- **Planner audit: 8/10.** `[ASSESS]` Weights are well-judged (Arithmetic + DI very-high; remainders flagged "a CAT favourite"; Algebra/Geometry/Modern-Math graded sensibly). **Mismatches:** (a) speed is globally 12% — defensible for CAT but accidental, not exam-tuned; (b) no calculus is correct for CAT; (c) the planner cannot represent DILR set-based practice or the sectional lock; (d) it will *over-suggest arithmetic drills* relative to the concept work CAT needs.
- **Improvements `[ASSESS]`:** Keep support; **down-weight speed-drill recommendation, up-weight concept/DI set practice**; add DILR/DS as study-only topics with mock-set guidance.

---

#### 2. XAT — Xavier Aptitude Test

- **Basics `[FACT]`:** XLRI Jamshedpur, xatonline.in. Once/year (early Jan). English only.
- **Pattern `[FACT]` (XAT 2026):** 4 sections — Verbal & Logical, Decision Making, **QA & DI**, GK. **~95 Q, 180 min.** Part 1 (VALR+DM+QA/DI) = 170 min *free* time allocation (no per-section timer); GK = 10 min. +1/−0.25; **−0.10 per question beyond 8 consecutive un-attempts** (unique); GK no negative. **No calculator.** Fixed, MCQ.
- **Quant grid:** Math **Y** · QA **Y** · NA **Y** · DI **Y** · LM **Y** · BA **Y** · HM **P** · EM **N** · Stat **P** · MA **P** · SM **P** · Calc **Y** · SC **P**
- **Quant section `[FACT]`+`[ASSESS]`:** QA & DI ≈ **28 Q**, not separately timed (~60–65 min advisable, ≈ **2.2 min/Q**). Difficulty **Hard, "tricky"** — heavy on careful application; Arithmetic + Mensuration strong (per XAT history). **No calculator** raises mental-maths value vs CAT.
- **Topic mapping `[ASSESS]`:** **Critical:** Arithmetic core, Mensuration (2D+3D), DI. **Important:** Number system, Algebra, P&C, Probability, Set theory, Geometry. **Useful:** Logs, Progressions. **Rare:** Trigonometry. **Not required:** Calculus.
- **Speed-Math Importance: 5/10 — *Benefits*.** `[ASSESS]` XAT *rewards slow, trustworthy accuracy* (its own nuance string says so) and penalises reckless attempts. Speed helps but precision wins.
- **Accuracy 9/10 · Mental-Maths 7/10** (no calculator).
- **Real-student strategy `[ASSESS]`:** Manage time across the whole 170-min block; pick easy QA/DI first; **avoid the consecutive-unattempt penalty**; mental calculation matters (no calculator); shortcuts help but trap-spotting matters more.
- **QuantReflex Fit: 6/10.** `[ASSESS]` Mensuration drills (area/volume) + arithmetic are genuinely useful (the override raises mensuration to high — good). Missing: DI sets, P&C/probability, the "trap" style. Recommend balanced concept + moderate speed.
- **Planner audit: 8/10.** `[ASSESS]` The mensuration↑/set-theory↑/caselet↓ overrides correctly capture XAT's flavour. Mismatch: the app's speed emphasis is mildly *counter* to XAT's "slow accuracy" reality — speed drills should be de-emphasised here specifically.
- **Improvements:** Keep; tune planner to *favour accuracy framing over speed* for XAT.

---

#### 3. GMAT (Focus Edition)

- **Basics `[FACT]`:** GMAC, mba.com. On-demand, year-round; up to 5×/12 months. Global B-school admission. English only.
- **Pattern `[FACT]` (Focus Edition, since 2024):** 3 sections — **Quantitative Reasoning, Verbal Reasoning, Data Insights**. **64 Q, 135 min, 45 min/section**, free section order. Score 205–805. **Computer-ADAPTIVE (question-level)**; **no negative marking** (but unanswered hurts); **Question Review & Edit** (change up to 3/section). **On-screen calculator ONLY in Data Insights**, none in Quant.
- **Quant grid:** Math **Y** · QA **Y** · NA **Y** · DI **Y(Data Insights)** · LM **Y** · BA **Y** · HM **N** · EM **N** · Stat **P** · MA **P** · SM **N** · Calc **P** · SC **P**
- **Quant section `[FACT]`+`[ASSESS]`:** Quantitative Reasoning = **21 Q, 45 min ≈ 2.14 min/Q**. **Focus Edition Quant is pure Problem-Solving — geometry was dropped; arithmetic, algebra, number properties, word problems only.** Difficulty **Moderate–Hard but logic/translation-bound, not calc-bound.** Adaptive: early accuracy matters disproportionately.
- **Topic mapping `[ASSESS]`:** **Critical:** Number properties, Percentages/Ratio, Algebra, Word problems, Data Sufficiency-style logic (now in Data Insights). **Important:** Averages, Mixtures, Rates, Probability/Counting basics. **Rare/Not required:** Geometry (dropped in Focus), Trigonometry, Mensuration-heavy, Indian-style DI, calculus.
- **Speed-Math Importance: 4/10 — *Little Benefit*.** `[ASSESS]` Generous ~2.1 min/Q, adaptive logic, concept/translation focus. Mental-arithmetic speed barely moves the score.
- **Accuracy 9/10 (adaptive) · Mental-Maths 5/10.**
- **Real-student strategy `[ASSESS]`:** Master concepts + careful reading; **never leave blanks** (no penalty but unanswered hurts); pace evenly; the differentiator is reasoning, not calc speed.
- **QuantReflex Fit: 4/10.** `[ASSESS]` Arithmetic drills help a weak foundation, but GMAT's core (Data Sufficiency / Data Insights reasoning, problem-translation) is **not drillable in-app**. The app cannot simulate adaptivity. Recommend concept practice; speed drills low value.
- **Planner audit: 7/10.** `[ASSESS]` The overrides are smart — DS very-high, Indian DI low, **trig dropped**, coordinate geometry low — genuinely matching Focus Edition. **Mismatch:** geometry is still partly weighted though Focus dropped it; app can't drill DS (its differentiator); speed 12% is too high for GMAT. Net: catalog *categorisation* is good, *tooling fit* is weak.
- **Improvements:** Keep catalog accuracy; **flag GMAT as a concept-only/low-speed exam**; the app should honestly tell GMAT users speed drills are optional.

---

#### 4. SNAP — Symbiosis National Aptitude Test

- **Basics `[FACT]`:** Symbiosis International, snaptest.org. Annual (Nov–Dec), up to 3 attempts/cycle (best counts). English only.
- **Pattern `[FACT]` (SNAP 2025):** 3 sections — General English; Analytical & Logical Reasoning; **Quantitative, DI & Data Sufficiency**. **60 Q, 60 marks, 60 min**, single window, any order. +1/−0.25. **No calculator.** Fixed. *(Duration was halved from 120→60 min recently — high time pressure now.)*
- **Quant grid:** Math **Y** · QA **Y** · NA **Y** · DI **Y** · LM **Y** · BA **Y** · HM **P** · EM **N** · Stat **N** · MA **P** · SM **Y** · Calc **Y** · SC **Y**
- **Quant section `[FACT]`+`[ASSESS]`:** Quant+DI+DS = **20 Q, ≈ 1 min/Q** (within the shared 60-min window). Difficulty **Easy–Moderate, speed-driven.** Pace + accuracy beat depth.
- **Topic mapping `[ASSESS]`:** **Critical:** Percentages, Ratio, Arithmetic core, basic DI, basic Algebra. **Important:** Averages, P&L, TSD, Time&Work, Number basics, DS. **Useful:** Mensuration, P&C. **Rare:** Advanced number theory, Geometry-heavy. **Not required:** Calculus, Trig.
- **Speed-Math Importance: 8/10 — *Requires Speed Training*.** `[ASSESS]` ~1 min/Q, no calculator, easy-but-fast questions = speed is a direct rank lever.
- **Accuracy 8/10 · Mental-Maths 8/10.**
- **Real-student strategy `[ASSESS]`:** Solve fast, **attempt high volume** of easy/medium, skip the rare hard, lean on shortcuts and mental maths, manage the tight 60 min.
- **QuantReflex Fit: 8/10.** `[ASSESS]` **Excellent fit** — fast easy arithmetic under time pressure is the app's bullseye. Missing: DI/DS sets. Recommend **speed drills heavily** + DI practice.
- **Planner audit: 9/10.** `[ASSESS]` Nuance ("speed-driven … accuracy+pace") and overrides (depth topics↓) are spot-on. The app's speed bias *helps* here. Only gap: no DS/DI drilling.
- **Improvements:** Keep; **promote Reflex/Timed drills**; add DI/DS practice.

---

#### 5. NMAT by GMAC

- **Basics `[FACT]`:** GMAC, nmat.org. Testing window Jul–Jun, up to 3 attempts. NMIMS + 30+ schools. English only.
- **Pattern `[FACT]` (NMAT 2025):** 3 sections — Language, **Quantitative Skills**, Logical Reasoning. **108 Q (36/section), 120 min**, sectional timing (Quant **52 min**), free section order. +3/correct; **NO negative marking**. **Computer-adaptive.** No calculator.
- **Quant grid:** Math **Y** · QA **Y** · NA **Y** · DI **Y** · LM **Y** · BA **Y** · HM **P** · EM **N** · Stat **N** · MA **P** · SM **Y** · Calc **Y** · SC **Y**
- **Quant section `[FACT]`+`[ASSESS]`:** **36 Q, 52 min ≈ 1.44 min/Q.** Difficulty **Easy–Moderate, broad.** Includes DI-heavy content. **No negative marking ⇒ attempt everything.**
- **Topic mapping `[ASSESS]`:** **Critical:** Arithmetic core, Percentages/Ratio, DI. **Important:** Averages, P&L, TSD, Number basics, basic Algebra. **Useful:** Mensuration, P&C. **Not required:** Calculus, Trig, advanced number theory.
- **Speed-Math Importance: 8/10 — *Requires Speed Training*.** `[ASSESS]` Broad-but-easy + no negative + fixed sectional clock ⇒ raw throughput (speed) directly maximises score.
- **Accuracy 6/10 (no penalty for wrong) · Mental-Maths 7/10.**
- **Real-student strategy `[ASSESS]`:** **Attempt all 36** (no negative), guess the unsure, prioritise speed, finish within 52 min. Throughput > caution.
- **QuantReflex Fit: 8/10.** `[ASSESS]` Strong — exactly the speed-arithmetic profile the app trains. Missing: DI sets. Recommend speed drills + DI.
- **Planner audit: 9/10.** `[ASSESS]` Nuance ("no negative marking; attempt everything fast") and di_tables↑ override are correct. **One missed lever:** the planner doesn't model "no negative marking" anywhere, so it can't teach the *attempt-everything* strategy that NMAT uniquely rewards.
- **Improvements:** Keep; add a no-negative-marking strategy note; promote speed drills.

---

#### 6. CMAT — Common Management Admission Test

- **Basics `[FACT]`:** NTA (for AICTE), cmat.nta.nic.in. Once/year. 1,000+ AICTE institutes. English.
- **Pattern `[FACT]` (CMAT 2025/26):** 5 sections (20 Q each) — **Quantitative Techniques & DI**, Logical Reasoning, Language, General Awareness, Innovation & Entrepreneurship (mandatory since 2022). **100 Q, 400 marks, 180 min**, free switching. +4/−1. **On-screen calculator provided.** Fixed. *(Note: duration is 3 h, not 4 h.)*
- **Quant grid:** Math **Y** · QA **Y** · NA **Y** · DI **Y** · LM **Y** · BA **Y** · HM **P** · EM **N** · Stat **N** · MA **P** · SM **P** · Calc **P** · SC **P**
- **Quant section `[FACT]`+`[ASSESS]`:** Quant & DI = **20 Q, 80 marks**, ≈ **1.8 min/Q** if evenly split (but free time-sharing across 180 min makes it relaxed). Difficulty **Moderate.** On-screen calculator lowers calc-speed value.
- **Topic mapping `[ASSESS]`:** **Critical:** Arithmetic core, Percentages/Ratio, DI. **Important:** Averages, P&L, TSD, Time&Work, Number basics, Algebra basics, Mensuration. **Useful:** P&C, Probability. **Not required:** Calculus, Trig.
- **Speed-Math Importance: 6/10 — *Benefits*.** `[ASSESS]` Generous overall time + calculator soften the speed premium; volume across sections still rewards fluency.
- **Accuracy 8/10 (+4/−1) · Mental-Maths 5/10** (calculator).
- **Real-student strategy `[ASSESS]`:** Allocate time across 5 sections, accuracy-first (−1 stings), use the calculator for heavy arithmetic, concepts matter.
- **QuantReflex Fit: 7/10.** `[ASSESS]` Arithmetic + DI fluency useful; calculator availability means the app's *mental*-speed edge is partly moot. Balanced drills + concept.
- **Planner audit: 8/10.** `[ASSESS]` Moderate-difficulty Arithmetic+DI core captured well. Mismatch: the on-screen calculator (which *reduces* mental-speed payoff) isn't modeled, so the app may overstate speed value for CMAT.
- **Improvements:** Keep; flag calculator-available ⇒ moderate speed emphasis.

---

#### 7. MBA CET (MAH MBA/MMS CET)

- **Basics `[FACT]`:** Maharashtra State CET Cell, cetcell.mahacet.org. Once/year. Maharashtra B-schools. English.
- **Pattern `[FACT]` (2025/26):** 4 sections — Logical Reasoning (75), Abstract Reasoning (25), **Quantitative Aptitude (50)**, VARC (50). **200 Q, 200 marks, 150 min**, single window. **NO negative marking.** **No calculator.** Fixed.
- **Quant grid:** Math **Y** · QA **Y** · NA **Y** · DI **Y** · LM **Y** · BA **Y** · HM **P** · EM **N** · Stat **N** · MA **Y** · SM **Y** · Calc **Y** · SC **Y**
- **Quant section `[FACT]`+`[ASSESS]`:** QA = **50 Q, 50 marks**, ≈ **0.75 min/Q (~45 s)** if evenly shared across 150 min for 200 Q. Difficulty **Easy–Moderate, very high volume.** No negative ⇒ attempt all. **High-volume speed exam.**
- **Topic mapping `[ASSESS]`:** **Critical:** Percentages, Ratio, Arithmetic core, DI. **Important:** Averages, P&L, TSD, Time&Work, Number basics, basic Algebra, Mensuration. **Useful:** P&C. **Not required:** Calculus, Trig, advanced number theory.
- **Speed-Math Importance: 9/10 — *Requires Speed Training*.** `[ASSESS]` 200 Q in 150 min, no calculator, no negative — the purest "do more, faster" exam in the MBA set.
- **Accuracy 6/10 (no penalty) · Mental-Maths 9/10.**
- **Real-student strategy `[ASSESS]`:** Maximum throughput, **attempt everything**, never dwell, mental maths + shortcuts essential.
- **QuantReflex Fit: 8/10.** `[ASSESS]` Excellent — fast no-calculator arithmetic is exactly the app's strength. Add DI. Recommend speed drills heavily.
- **Planner audit: 8/10.** `[ASSESS]` di_tables very-high + depth-topics↓ overrides correct. **Missed lever:** no-negative-marking strategy isn't modeled; speed 12% understates how much speed matters here (this exam *should* weight speed far higher).
- **Improvements:** Keep; **raise speed emphasis specifically**; promote Timed drills.

---

#### 8. IPMAT (IIM Indore)

- **Basics `[FACT]`:** IIM Indore, iimidr.ac.in. Once/year. 5-yr IPM (after Class 12). English only.
- **Pattern `[FACT]` (2025):** 3 sections — **QA (Short Answer)**, **QA (MCQ)**, Verbal (MCQ). **90 Q, 360 marks, 120 min, 40 min/section, sectionally locked.** +4 all; **MCQ −1, Short-Answer no negative.** **Basic on-screen calculator.** Section split: QA-SA 15 Q/60, QA-MCQ 30 Q/120, Verbal 45 Q/180.
- **Quant grid:** Math **Y** · QA **Y** · NA **Y** · DI **P** · LM **Y** · BA **Y** · HM **P** · EM **N** · Stat **P** · MA **P** · SM **Y** · Calc **Y** · SC **Y**
- **Quant section `[FACT]`+`[ASSESS]`:** **2 quant sections, 45 Q, 180 marks, 80 min total.** SA ≈ 2.67 min/Q (no negative — attempt all), MCQ ≈ 1.33 min/Q (negative — be careful). **Two-thirds of the paper is quant** — the most quant-heavy MBA exam here. Difficulty **Moderate, clean school-grade Algebra + Arithmetic.**
- **Topic mapping `[ASSESS]`:** **Critical:** Algebra (progressions, logs, quadratics), Percentages/Ratio, Number system, Set theory. **Important:** P&L, TSD, Time&Work, Averages, P&C, Probability, Mensuration. **Useful:** Geometry, basic DI. **Not required:** Calculus, Trig.
- **Speed-Math Importance: 7/10 — *Requires Speed Training* (for MCQ section).** `[ASSESS]` MCQ section is fast (1.33 min/Q); SA section rewards careful working. Mixed but speed-leaning.
- **Accuracy 8/10 · Mental-Maths 6/10.**
- **Real-student strategy `[ASSESS]`:** SA section — **attempt all (no negative)**, show clean working; MCQ — accuracy-first. Strong school algebra is decisive.
- **QuantReflex Fit: 6/10.** `[ASSESS]` Arithmetic drills help; but IPMAT leans on **algebra** (progressions, logs, set theory) which the app doesn't drill. Concept + moderate speed.
- **Planner audit: 8/10.** `[ASSESS]` progressions/logs/set-theory↑ overrides correctly capture the school-algebra flavour. Mismatch: SA-vs-MCQ split + the two-quant-section structure isn't representable; app under-serves the algebra need with arithmetic drills.
- **Improvements:** Keep; emphasise algebra concept practice; note SA section's no-negative attempt-all strategy.

---

### FAMILY B — BANKING / RAILWAYS (5 exams)

> **All banking prelims share the killer trait:** ~**34–40 seconds per quant question**, no calculator, −0.25 negative. This is the single most speed-critical family — and **QuantReflex's best-fit family.**

---

#### 9. Bank PO (generic)

- **Basics `[FACT]`:** Umbrella term for PO recruitment (IBPS/SBI/individual banks). ibps.in / sbi.co.in. Annual. English + Hindi.
- **Pattern `[FACT]`:** Prelims (qualifying) → Mains (scoring) → Interview. Prelims: 3 sections, 100 Q, 100 marks, 60 min, **20-min sectional timing**. −0.25. No calculator. Fixed CBT.
- **Quant grid:** Math **P** · QA **Y** · NA **Y** · DI **Y** · LM **Y** · BA **Y** · HM **N** · EM **N** · Stat **N** · MA **Y** · SM **Y** · Calc **Y** · SC **Y**
- **Quant section `[FACT]`+`[ASSESS]`:** Numerical Ability ≈ **35 Q in 20 min ≈ 34 s/Q.** Difficulty **Easy–Moderate but brutally timed.** Simplification + DI + arithmetic word problems dominate.
- **Topic mapping `[ASSESS]`:** **Critical:** Simplification/Approximation, Number series, DI, Percentages, Ratio, Averages, P&L, SI/CI, TSD, Time&Work. **Important:** Mixtures, Partnership, Ages, Quadratic comparison. **Useful:** Mensuration, P&C, Probability. **Not required:** Geometry/Trig, Calculus, advanced number theory.
- **Speed-Math Importance: 10/10 — *Requires Speed Training*.** `[ASSESS]` 34 s/Q, no calculator, calculation-bound — **elite mental-calc speed is the rank differentiator.** This is the textbook case for the app.
- **Accuracy 9/10 · Mental-Maths 10/10.**
- **Real-student strategy `[ASSESS]`:** Speed maths + memorised tables/squares/cubes/fraction-%; do simplification & DI first; skip 2–3 toughest; shortcuts dominate; accuracy under the clock is everything.
- **QuantReflex Fit: 9/10.** `[ASSESS]` **Near-perfect fit.** Drills on multiplication, fractions, percentages, ratios, averages, P&L, TSD, Time&Work map directly. Gaps: simplification/approximation as a *drill type*, DI sets, number series, quadratic comparison. Recommend speed drills as the primary mode.
- **Planner audit: 9/10.** `[ASSESS]` Nuance ("speed is everything"), simplification/series/DI very-high — all correct. The app's speed bias *finally* matches reality here. Gap: 12% speed weight *understates* speed for banking; sectional 20-min timing not simulated.
- **Improvements:** **Make this the flagship use-case.** Add Simplification + Number-Series + DI drill types; build a 20-min sectional-timer mode; raise speed weight for banking.

---

#### 10. IBPS PO

- **Basics `[FACT]`:** IBPS, ibps.in. Annual. 11+ PSBs. English + Hindi.
- **Pattern `[FACT]`:** Prelims (100 Q/100/60 min, 20-min sectional) → Mains (objective ~155 Q + descriptive, ~225 marks, sectional timing) → Interview. −0.25. No calculator. Fixed.
  - Prelims QA: **35 Q / 20 min ≈ 34 s/Q.** Mains DI: **35 Q / 50 marks / 45 min ≈ 77 s/Q.**
- **Quant grid:** as Bank PO, plus DI/Caselet + quadratic comparison emphasised. Calc **Y**, SM **Y**.
- **Quant section `[ASSESS]`:** Prelims = speed sprint; Mains = harder DI/Caselet + quadratic comparison, more time but tougher sets.
- **Topic mapping `[ASSESS]`:** **Critical:** Simplification, Number series, DI (tables/caselet), Quadratic comparison, Percentages, Ratio, P&L, SI/CI, Averages. **Important:** TSD, Time&Work, Mixtures, DS. **Useful:** P&C, Probability, Mensuration. **Not required:** Geometry/Trig, Calculus.
- **Speed-Math Importance: 10/10 — *Requires Speed Training*.** Prelims is pure speed; Mains rewards DI calculation fluency.
- **Accuracy 9/10 · Mental-Maths 10/10.**
- **Real-student strategy `[ASSESS]`:** Clear prelims on speed; in Mains, master Caselet DI + quadratic comparison; accuracy-first under −0.25.
- **QuantReflex Fit: 9/10.** `[ASSESS]` Same near-perfect arithmetic fit; biggest gap is Caselet-DI and quadratic-comparison drilling.
- **Planner audit: 9/10.** `[ASSESS]` Nuance + family weights correct. Gaps as Bank PO; quadratic-comparison is in syllabus but **not drillable** (study-only).
- **Improvements:** Add DI/Caselet and quadratic-comparison drill types; sectional-timer mode.

---

#### 11. IBPS Clerk

- **Basics `[FACT]`:** IBPS, ibps.in. Annual. Two stages (Prelims → Mains, no interview). English + Hindi.
- **Pattern `[FACT]`:** Prelims: Numerical Ability **35 Q / 35 marks / 20 min ≈ 34 s/Q** (most brutal pace). −0.25. Mains Quant ≈ 50 Q (numbers revised by cycle — Med confidence), ~45 min ≈ 54 s/Q. No calculator. Fixed.
- **Quant grid:** Math **P** · QA **Y** · NA **Y** · DI **Y** · LM **Y** · BA **Y** · SM **Y** · Calc **Y** · SC **Y**; HM/EM/Stat **N**.
- **Quant section `[ASSESS]`:** **Simplification + Number series + basic arithmetic** dominate; easier than PO (override drops P&C/probability to low — correct).
- **Topic mapping `[ASSESS]`:** **Critical:** Simplification, Number series, Percentages, Ratio, Averages, P&L, SI/CI, basic DI. **Important:** TSD, Time&Work, Mixtures, Ages. **Useful:** Quadratic comparison, basic Mensuration. **Rare/Not required:** P&C, Probability, Geometry/Trig, Calculus.
- **Speed-Math Importance: 10/10 — *Requires Speed Training*.** Easiest content, fastest clock ⇒ pure speed game.
- **Accuracy 9/10 · Mental-Maths 10/10.**
- **Real-student strategy `[ASSESS]`:** Maximise easy attempts at speed; simplification & series first; minimal skipping; speed maths decisive.
- **QuantReflex Fit: 9/10.** `[ASSESS]` **Arguably the single best-fit exam** for the app — easy arithmetic at maximum speed. Add Simplification + Number-series drills.
- **Planner audit: 9/10.** `[ASSESS]` Overrides (p&c/probability low) correctly model the easier paper. Speed under-weighted vs reality.
- **Improvements:** Flagship-tier; add simplification/series drills, sectional timer, raise speed emphasis.

---

#### 12. SBI PO

- **Basics `[FACT]`:** SBI, sbi.co.in/careers. Annual. English + Hindi.
- **Pattern `[FACT]` (2025 change):** Prelims QA **reduced 35→30 Q / 30 marks / 20 min ≈ 40 s/Q**; **no sectional cutoff in prelims**. Mains **Data Analysis & Interpretation 30 Q / 60 marks / 45 min ≈ 90 s/Q** (most weighted/relaxed quant here, but hardest sets). −0.25. No calculator. Fixed.
- **Quant grid:** as IBPS PO; DI-Caselet very-high, P&C high.
- **Quant section `[ASSESS]`:** Prelims speed sprint (slightly easier pace post-2025); Mains = **hardest, newest DI patterns** in banking + tougher word problems.
- **Topic mapping `[ASSESS]`:** **Critical:** DI/Caselet (advanced), Simplification, Number series, Percentages, Ratio, P&L, SI/CI, Averages, Quadratic comparison. **Important:** TSD, Time&Work, Mixtures, P&C, DS. **Useful:** Probability, Mensuration. **Not required:** Geometry/Trig, Calculus.
- **Speed-Math Importance: 9/10 — *Requires Speed Training*.** Prelims speed-critical; Mains rewards DI calculation stamina + accuracy over raw speed.
- **Accuracy 10/10 (toughest cutoffs) · Mental-Maths 9/10.**
- **Real-student strategy `[ASSESS]`:** Speed through prelims; in Mains, conquer advanced Caselet DI; accuracy is paramount (highest competition).
- **QuantReflex Fit: 9/10.** `[ASSESS]` Strong arithmetic fit; biggest gap is **advanced Caselet DI** — exactly SBI's differentiator — which the app cannot drill.
- **Planner audit: 9/10.** `[ASSESS]` di_caselet very-high + p&c high overrides correctly model "hardest banking QA". Gap: advanced DI not drillable; speed under-weighted.
- **Improvements:** Add advanced Caselet-DI practice; sectional timer.

---

#### 13. RRB NTPC

- **Basics `[FACT]`:** Railway Recruitment Boards, rrbapply.gov.in. Irregular large cycles (~2–3 yrs). 15 languages. No calculator. Score normalization across shifts.
- **Pattern `[FACT]`:** CBT-1 (100 Q/100/90 min): Maths **30 Q/30**. CBT-2 (120 Q/120/90 min): Maths **35 Q/35**. **No sectional timing** (single combined window — more forgiving than banking). **−1/3 negative** (harsher than banking's −0.25).
- **Quant grid:** Math **P** · QA **Y** · NA **Y** · DI **P** · LM **Y** · BA **Y** · SM **Y** · Calc **Y** · SC **Y**; HM/EM **N**, Stat **P**.
- **Quant section `[ASSESS]`:** Nominal ~26–27 s/Q but no sectional timer ⇒ self-paced. **Broader basic arithmetic + mensuration**, lighter DI than bank PO. Difficulty **Easy–Moderate.**
- **Topic mapping `[ASSESS]`:** **Critical:** Number system/simplification, Percentages, Ratio, Averages, P&L, SI/CI, TSD, Time&Work, Mensuration (2D). **Important:** Number series, DI, Mensuration (3D), basic Algebra, Geometry basics. **Useful:** LCM/HCF, Mixtures. **Not required:** Trig, Calculus, advanced number theory.
- **Speed-Math Importance: 8/10 — *Requires Speed Training*.** `[ASSESS]` No calculator + volume reward speed; the lack of a sectional timer slightly lowers the premium vs banking prelims.
- **Accuracy 9/10 (−1/3 is harsh) · Mental-Maths 9/10.**
- **Real-student strategy `[ASSESS]`:** Balance speed with caution (harsher negative); basic arithmetic + mensuration fluency; shortcuts help.
- **QuantReflex Fit: 8/10.** `[ASSESS]` Strong — arithmetic + the app's **area/volume mensuration drills** (rare to find) directly help. Add number series, DI.
- **Planner audit: 9/10.** `[ASSESS]` mensuration↑ + di_caselet↓ + simplification↑ overrides correctly model the railway flavour. Gap: harsher −1/3 marking not modeled (so the "be slightly more careful" nuance is lost).
- **Improvements:** Keep; model the −1/3 negative for strategy; promote speed + mensuration drills.

---

### FAMILY C — SSC (3 exams)

---

#### 14. SSC CGL

- **Basics `[FACT]`:** Staff Selection Commission, ssc.gov.in. Annual. Graduate-level govt posts. English + Hindi.
- **Pattern `[FACT]`:** **Tier 1** (qualifying, CBT): 4 sections, 100 Q/200/60 min, no sectional timing; **Quant 25 Q/50 ≈ 36 s/Q**; **−0.50**; no calculator. **Tier 2** (merit, restructured post-2022): Mathematical Abilities **30 Q/90** within a shared 60-min Section-1; **−1**; **on-screen scientific calculator provided**; **advanced maths** (algebraic identities, geometry, trig, mensuration 2D/3D).
- **Quant grid:** Math **Y** · QA **Y** · NA **Y** · DI **Y** · LM **P** · BA **Y** · HM **P** · EM **N** · Stat **P(JSO paper)** · MA **P** · SM **Y(T1)** · Calc **Y** · SC **Y**
- **Quant section `[ASSESS]`:** **Tier 1 = speed** (36 s/Q, no calculator); **Tier 2 = advanced concept** (geometry/trig/mensuration heavy, calculator available ⇒ speed less critical). A two-personality exam.
- **Topic mapping `[ASSESS]`:** **Critical:** Percentages, P&L, Ratio, SI/CI, Averages, TSD, Time&Work, Algebraic identities, Geometry (triangles/circles), Trigonometry, Mensuration (2D+3D), DI. **Important:** Number series, Simplification, Mixtures, Linear/Quadratic, Coordinate geometry. **Useful:** Surds/indices, Partnership, Ages. **Not required:** Calculus, P&C/probability-heavy.
- **Speed-Math Importance: 7/10 overall (T1 **9**, T2 **6**) — *Requires/Benefits*.** `[ASSESS]` Tier 1 is a no-calculator speed sprint; Tier 2's calculator + heavy geometry/trig shift the premium to concept.
- **Accuracy 9/10 · Mental-Maths 8/10 (T1).**
- **Real-student strategy `[ASSESS]`:** Tier 1 — speed maths, attempt fast, watch −0.50; Tier 2 — master geometry/trig/mensuration concepts, use calculator, accuracy with −1.
- **QuantReflex Fit: 7/10.** `[ASSESS]` Tier-1 arithmetic + the app's area/volume drills are strong; **but the app cannot drill the geometry, trigonometry, and algebraic-identity content that defines Tier 2** (trig is the single highest-frequency CGL topic and is study-only). Recommend speed drills for T1 + heavy concept work for T2.
- **Planner audit: 7/10.** `[ASSESS]` Family weights (algebraic identities high, trig high "every year", geometry/mensuration high) are accurate and well-researched. **Mismatch:** the app's *tooling* can't drill its own high-weighted trig/geometry topics; one paper (T1) is speed-pure and the other (T2) calculator-assisted — a single weight profile can't capture both.
- **Improvements:** Keep weights; **flag that the highest-weighted CGL topics (trig/geometry) are concept-only in-app**; add geometry/trig drills to truly serve CGL.

---

#### 15. SSC CHSL

- **Basics `[FACT]`:** SSC, ssc.gov.in. Annual. 10+2-level posts. English + Hindi.
- **Pattern `[FACT]`:** Tier 1: Quant **25 Q/50/ (60-min paper) ≈ 36 s/Q**, −0.50, no calculator. Tier 2: Mathematical Abilities **30 Q/90**, −1, on-screen calculator; a notch below CGL T2 depth.
- **Quant grid:** like CGL but lighter; statistics/coordinate-geometry dropped by override `[CODE]`. SM **Y(T1)**, Calc **Y(T2)**.
- **Quant section `[ASSESS]`:** T1 speed sprint; T2 moderate (algebra, geometry, mensuration, DI), trig reduced to medium per override.
- **Topic mapping `[ASSESS]`:** **Critical:** Percentages, P&L, Ratio, SI/CI, Averages, TSD, Time&Work, Mensuration, Algebra basics, DI. **Important:** Number series, Simplification, Geometry, Trig (medium). **Useful:** Quadratic, Surds. **Not required:** Coordinate geometry, Statistics (dropped), Calculus.
- **Speed-Math Importance: 7/10 (T1 **9**, T2 **6**) — *Requires/Benefits*.**
- **Accuracy 9/10 · Mental-Maths 8/10 (T1).**
- **Real-student strategy `[ASSESS]`:** As CGL but slightly easier; T1 speed, T2 concept + calculator.
- **QuantReflex Fit: 7/10.** `[ASSESS]` Good T1 arithmetic fit; T2 geometry/trig concept gap (smaller than CGL since trig is medium). 
- **Planner audit: 8/10.** `[ASSESS]` Sensible overrides (trig medium, coordinate-geom/stats dropped) match the easier-than-CGL reality well.
- **Improvements:** Keep; same geometry/trig drill gap note as CGL.

---

#### 16. SSC MTS

- **Basics `[FACT]`:** SSC, ssc.gov.in. Annual. Entry-level (Group C). English + Hindi + 13 regional languages.
- **Pattern `[FACT]` (2024/25):** Single CBT, 2 sessions × 45 min. **Numerical & Mathematical Ability 20 Q/60** in Session I; **NO negative marking in Session I** (−1 in Session II); +3/correct. ≈ **1.1 min/Q.** No calculator. Basic (Class-10) level.
- **Quant grid:** Math **P** · QA **Y** · NA **Y** · DI **P** · LM **Y** · BA **Y** · SM **Y** · Calc **Y** · SC **P**; HM/EM/Stat **N**.
- **Quant section `[ASSESS]`:** **Basic arithmetic only** — number sense, arithmetic, simple data handling. No advanced algebra/trig/geometry (overrides drop trig low, quad low, coord-geom/stats dropped — correct). **No negative on the math section** ⇒ attempt all.
- **Topic mapping `[ASSESS]`:** **Critical:** Multiplication/calculation, Fractions, Percentages, Ratio, Averages, P&L, SI/CI, TSD, Time&Work. **Important:** Number series, Simplification, basic Mensuration, LCM/HCF. **Useful:** Mixtures. **Not required:** Trig, Coordinate geometry, Statistics, Calculus, advanced anything.
- **Speed-Math Importance: 7/10 — *Requires Speed Training*.** `[ASSESS]` Basic content, no calculator, no negative on math ⇒ throughput + fluency win.
- **Accuracy 6/10 (no negative on math) · Mental-Maths 8/10.**
- **Real-student strategy `[ASSESS]`:** Attempt all math (no penalty), solve fast, fundamentals + shortcuts.
- **QuantReflex Fit: 8/10.** `[ASSESS]` **Excellent** — basic arithmetic at speed is the app's core; almost everything MTS needs is drillable.
- **Planner audit: 8/10.** `[ASSESS]` Overrides correctly strip the exam to basics. Missed lever: no-negative-on-Session-I strategy not modeled.
- **Improvements:** Keep; promote speed drills; note attempt-all on math.

---

### FAMILY D — DEFENSE (3 exams)

---

#### 17. NDA

- **Basics `[FACT]`:** UPSC, upsc.gov.in. Twice/year. Offline **pen-paper OMR**. English + Hindi. **No calculator.**
- **Pattern `[FACT]`:** Two papers — **Mathematics (120 Q, 300 marks, 150 min, +2.5/−0.83 ≈ 1.25 min/Q)** + GAT (600). Total written 900. **Class 11–12 level: algebra, matrices & determinants, trigonometry, 2D/3D coordinate geometry, differential & integral calculus, vectors, statistics & probability.**
- **Quant grid:** Math **Y** · QA **P** · NA **P** · DI **N** · LM **P** · BA **P** · HM **Y** · EM **P** · Stat **Y** · MA **N** · SM **P** · Calc **Y** · SC **P**
- **Quant section `[ASSESS]`:** Maths is **300 of 900 marks (33%)** — huge. But it is **higher mathematics** (calculus, vectors, matrices, trig) — concept-bound, not calculation-speed-bound.
- **Topic mapping `[ASSESS]`:** **Critical:** Trigonometry, Algebra (quadratics, complex, sequences), Matrices & determinants, Calculus (differentiation/integration), Coordinate geometry (2D/3D), Vectors, Probability/Statistics. **Important:** Mensuration, Percentages/Ratio/arithmetic basics, Sets/relations. **Useful:** P&L, TSD, Time&Work. **Not required (in app's scope):** speed-arithmetic shortcuts as a *primary* skill.
- **Speed-Math Importance: 5/10 — *Benefits*.** `[ASSESS]` 1.25 min/Q is moderate; success depends on knowing calculus/trig/matrices, not mental-arithmetic speed. Speed helps clear the easier algebra/arithmetic quickly.
- **Accuracy 8/10 · Mental-Maths 6/10 (no calculator).**
- **Real-student strategy `[ASSESS]`:** Master 11–12 concepts (esp. calculus, trig, vectors); arithmetic fluency is a minor enabler; watch −0.83.
- **QuantReflex Fit: 4/10.** `[ASSESS]` The app drills arithmetic/mensuration, but **NDA Maths is dominated by calculus, trig, matrices, vectors — none drillable, and calculus isn't even in the topic library.** The app can build the small arithmetic base only. Strongly recommend concept practice elsewhere.
- **Planner audit: 6/10.** `[ASSESS]` Defense family correctly weights trig very-high ("heaviest defense topic"), matrices high, statistics/probability — good *topic* coverage. **But:** there is **no calculus topic** in the library at all, so a core NDA block is invisible to the planner; the nuance even says "Calculus-adjacent" — acknowledging the gap. Arithmetic-speed tooling is largely irrelevant to NDA.
- **Improvements:** **Add calculus + vectors to the syllabus** if NDA is to be supported seriously; otherwise label NDA as "concept-prep, app builds fundamentals only" and de-emphasise speed drills.

---

#### 18. CDS

- **Basics `[FACT]`:** UPSC, upsc.gov.in. Twice/year. Offline OMR. English + Hindi. No calculator.
- **Pattern `[FACT]`:** IMA/INA/AFA candidates take **Elementary Mathematics (100 Q, 100 marks, 120 min, +1/−0.33 ≈ 1.2 min/Q)** + English + GK. **OTA candidates have NO maths paper.** **Matriculation/Class-10 level, no calculus** (key difference from NDA).
- **Quant grid:** Math **Y** · QA **Y** · NA **Y** · DI **P** · LM **P** · BA **Y** · HM **P** · EM **N** · Stat **P** · MA **N** · SM **P** · Calc **Y** · SC **P**
- **Quant section `[ASSESS]`:** Even breadth — arithmetic, basic algebra, geometry, trig, mensuration, statistics at Class-10 level. Concept + moderate speed.
- **Topic mapping `[ASSESS]`:** **Critical:** Percentages, P&L, Ratio, TSD, Time&Work, SI/CI, Number system, Mensuration (2D/3D), basic Trig, Geometry. **Important:** Averages, Mixtures, Algebra (linear/quadratic), Statistics. **Useful:** Matrices (medium), LCM/HCF. **Not required:** Calculus, P&C-heavy.
- **Speed-Math Importance: 7/10 — *Requires/Benefits*.** `[ASSESS]` No calculator + 100 Q in 120 min + elementary content ⇒ arithmetic speed genuinely helps (more than NDA).
- **Accuracy 8/10 · Mental-Maths 7/10.**
- **Real-student strategy `[ASSESS]`:** Solid Class-10 concepts + arithmetic speed; broad coverage; watch −0.33.
- **QuantReflex Fit: 7/10.** `[ASSESS]` Good — arithmetic + area/volume drills directly help; gap is trig/geometry concept (study-only). The override (%/P&L/TSD↑) sensibly tilts toward the app's strengths.
- **Planner audit: 8/10.** `[ASSESS]` Nuance + arithmetic↑ overrides match the elementary breadth well. matrices→medium correctly lighter than NDA.
- **Improvements:** Keep; note OTA-stream has no maths; add basic trig/geometry drills for completeness.

---

#### 19. AFCAT

- **Basics `[FACT]`:** Indian Air Force (delivered by CDAC), afcat.cdac.in. Twice/year. **Online CBT.** **English only.** No calculator.
- **Pattern `[FACT]`:** Single paper, 4 sections (GA, English, **Numerical Ability**, Reasoning & Military Aptitude). **100 Q, 300 marks, 120 min, +3/−1, no sectional timing.** Numerical Ability ≈ **20 Q (~60 marks)** — *not officially fixed* (Med confidence). **Class-10 basic arithmetic** (much lighter than NDA).
- **Quant grid:** Math **P** · QA **Y** · NA **Y** · DI **P** · LM **Y** · BA **Y** · SM **Y** · Calc **Y** · SC **Y**; HM/EM **N**, Stat **P**.
- **Quant section `[ASSESS]`:** Basic arithmetic only — decimals/fractions, simplification, %, ratio, average, P&L, SI, TSD, Time&Work, simple area. ≈ 1.2 min/Q. **Lightest defense maths.**
- **Topic mapping `[ASSESS]`:** **Critical:** Simplification, Decimals/Fractions, Percentages, Ratio, Averages, P&L, SI, TSD, Time&Work. **Important:** Mixtures, basic Mensuration (area/perimeter). **Useful:** Number system basics. **Not required:** Trig (medium), Matrices (dropped), Calculus, advanced geometry.
- **Speed-Math Importance: 7/10 — *Requires Speed Training*.** `[ASSESS]` Basic, no-calculator arithmetic across a fast paper ⇒ speed helps directly.
- **Accuracy 8/10 (−1) · Mental-Maths 8/10.**
- **Real-student strategy `[ASSESS]`:** Quick basic arithmetic; the numerical section is "free marks" if fast and accurate; watch −1.
- **QuantReflex Fit: 7/10.** `[ASSESS]` Good — the app's arithmetic drills cover virtually all AFCAT numerical content. 
- **Planner audit: 8/10.** `[ASSESS]` Override (arithmetic↑, matrices dropped, trig medium) correctly makes AFCAT the light, arithmetic-led defense exam. Well modeled.
- **Improvements:** Keep; promote speed drills; note numerical is a small but high-yield slice.

---

### FAMILY E — SCHOOL / FOUNDATION / APTITUDE (6 exams)

---

#### 20. CUET (UG)

- **Basics `[FACT]`:** NTA, cuet.nta.nic.in. Annual. Undergraduate admission to central universities. 13 languages. CBT.
- **Pattern `[FACT]` (2025):** **General Test = 50 MCQs (all compulsory since 2025), 60 min, 250 marks, +5/−1.** Numerical/quant is a *subset* (~10–15 Q, not fixed) mixed with GK/reasoning. No calculator. Fixed. *(There is also a separate Domain "Mathematics" subject; this audit covers the General Test numerical portion the app implies.)*
- **Quant grid:** Math **P** · QA **Y** · NA **Y** · DI **Y** · LM **Y** · BA **Y** · SM **Y** · Calc **P** · SC **Y**; HM/EM/Stat **N**.
- **Quant section `[ASSESS]`:** Basic numerical aptitude (~up to Class 8) + simple DI — %, ratio, averages, TSD, P&L, basic charts. ≈ 1.2 min/Q overall. **Speed + accuracy.**
- **Topic mapping `[ASSESS]`:** **Critical:** Percentages, Ratio, Averages, Arithmetic core, basic DI. **Important:** P&L, TSD, Time&Work, Number basics, basic Algebra. **Useful:** Mensuration basics. **Not required:** Trig (low), Coordinate geometry (low), Calculus, advanced topics.
- **Speed-Math Importance: 7/10 — *Requires Speed Training*.** `[ASSESS]` Basic, no-calculator, mixed-section time pressure ⇒ fast accurate arithmetic helps secure the numerical marks.
- **Accuracy 8/10 (+5/−1) · Mental-Maths 7/10.**
- **Real-student strategy `[ASSESS]`:** Quick basic arithmetic + DI; +5 per question makes each numerical item high-value; watch −1.
- **QuantReflex Fit: 7/10.** `[ASSESS]` Good for the numerical-ability slice; the app can't simulate the mixed General-Test format. di_tables↑ override is sensible.
- **Planner audit: 8/10.** `[ASSESS]` trig/coord↓ + di↑ overrides correctly model the basic-school-arithmetic flavour. Minor: app doesn't distinguish General-Test numerical from the Domain-Mathematics subject.
- **Improvements:** Keep; clarify which CUET component is targeted; promote speed + DI drills.

---

#### 21. CLAT (UG)

- **Basics `[FACT]`:** Consortium of NLUs, consortiumofnlus.ac.in. Annual (Dec). Law school admission. English only.
- **Pattern `[FACT]`:** **120 MCQs, 120 marks, 2 h, +1/−0.25.** 5 sections, all **passage/comprehension-based**. **Quantitative Techniques is the smallest section (~10% ≈ 13–15 Q)** and is **elementary maths derived from passages/graphs/tables.** No calculator. Fixed.
- **Quant grid:** Math **P** · QA **Y** · NA **Y** · DI **Y** · LM **P** · BA **Y** · HM **N** · EM **N** · Stat **N** · MA **P** · SM **P** · Calc **P** · SC **P**
- **Quant section `[ASSESS]`:** **The defining feature: quant is embedded in reading passages** — you extract numbers from a data set and apply %, ratio, averages, basic mensuration, simple algebra. **The bottleneck is comprehension + careful extraction, not calculation speed.** Class-10 level.
- **Topic mapping `[ASSESS]`:** **Critical:** Percentages, Ratio, Averages, basic DI/data extraction. **Important:** P&L, SI/CI, basic arithmetic. **Useful:** basic Mensuration (2D). **Not required (dropped by override `[CODE]`):** Quadratics, Progressions, Surds, Trig, Coordinate geometry, Circles — correctly excluded.
- **Speed-Math Importance: 5/10 — *Benefits*.** `[ASSESS]` The maths is easy; what's hard is reading the passage and extracting the right figures. Mental-calc speed is a modest help, not the lever.
- **Accuracy 8/10 · Mental-Maths 5/10.**
- **Real-student strategy `[ASSESS]`:** Read the data passage carefully, extract correct values, apply elementary arithmetic; speed comes from comprehension, not calculation.
- **QuantReflex Fit: 5/10.** `[ASSESS]` The app trains the right *operations* (%, ratio, averages) but **cannot simulate the passage-based extraction that is CLAT's actual challenge.** Standalone speed drills only partially transfer.
- **Planner audit: 7/10.** `[ASSESS]` The override is genuinely well-researched — boosts %/ratio/averages to very-high and **drops all the irrelevant higher topics** correctly; the nuance explicitly notes "from passages." **Mismatch:** the app's drill format (standalone problems) doesn't match the passage format, so fit < catalog accuracy.
- **Improvements:** Keep weights; add passage/data-set-based DI practice to truly serve CLAT; de-emphasise pure speed.

---

#### 22. NTSE

- **⚠️ STATUS `[FACT]`:** **National NTSE has been suspended by NCERT since 2021** ("on hold till further orders"; the scheme's sanction lapsed 31 Mar 2021). **No national NTSE has been conducted since the 2020–21 cycle.** State-level talent searches (e.g., NMMSS) continue independently. **The app lists NTSE as a live, supported exam — this is factually outdated.**
- **Basics `[FACT]`:** NCERT, ncert.nic.in. Was Class-10 talent search.
- **Pattern `[FACT]` (last-conducted, historical):** MAT (Mental Ability, 100 Q/100/120 min) + SAT (Scholastic Aptitude, 100 Q/100/120 min incl. ~20 maths Q). No negative marking. Class 9–10 NCERT level.
- **Quant grid:** Math **Y** · QA **Y** · NA **Y** · DI **P** · LM **Y(MAT)** · BA **Y** · HM **P** · Stat **P** · MA **Y** · SM **P** · Calc **P** · SC **P**; EM **N**.
- **Quant section `[ASSESS]`:** ~20 maths Q at Class 9–10 NCERT level (algebra, geometry, mensuration, arithmetic, statistics) + a strong **Mental Ability** component (which the app does not address). ~1.2 min/Q.
- **Topic mapping `[ASSESS]`:** **Critical:** Arithmetic core, Percentages, Ratio, Algebra basics, Geometry, Mensuration. **Important:** Trig (medium), Coordinate geometry (medium), Statistics, Number system. **Useful:** Probability. **Not required:** Calculus.
- **Speed-Math Importance: 6/10 — *Benefits*.** `[ASSESS]` Class-10 concept + reasoning; speed moderate.
- **Accuracy 7/10 · Mental-Maths 6/10.**
- **QuantReflex Fit: 5/10.** `[ASSESS]` Arithmetic + mensuration help the SAT maths; the app **cannot address the Mental Ability Test** (analogies, series, pattern perception), which is half of NTSE. Plus the exam isn't running.
- **Planner audit: 4/10.** `[ASSESS]` Topic weights (trig/coord medium) are reasonable *for the historical maths paper*, **but the catalog presents a suspended exam as live with no status caveat**, and ignores the MAT half entirely. A real student would be misled.
- **Improvements:** **Add a "suspended/historical" status flag** or fold into a generic Class-10 track; do not present as a current target.

---

#### 23. JEE (Quant) — JEE Main Mathematics

- **Basics `[FACT]`:** NTA, jeemain.nta.nic.in. **Twice/year** (Jan + Apr). Engineering (NIT/IIIT/IIT-gateway). 13 languages. CBT. **No calculator.**
- **Pattern `[FACT]` (2025):** Paper 1 = Maths + Physics + Chemistry, 75 Q/300/3 h. **Mathematics = 25 Q (20 MCQ + 5 numerical, all compulsory since 2025) / 100 marks**, +4/−1 (negative now on Section B too). ≈ **2.4 min/Q.**
- **Quant grid:** Math **Y** · QA **P** · NA **P** · DI **N** · LM **P** · BA **P** · HM **Y** · EM **P** · Stat **Y** · MA **N** · SM **N** · Calc **Y** · SC **P**
- **Quant section `[ASSESS]`:** **Advanced Class 11–12.** **Calculus ~20–25% (largest block)**, Algebra ~20–25% (matrices, complex numbers, quadratics, sequences, probability, P&C, binomial), Coordinate geometry ~15%, Trig ~5–7%, plus vectors, 3D, statistics. **Concept-bound; ~2.4 min/Q is generous.**
- **Topic mapping `[ASSESS]`:** **Critical:** Calculus (limits/derivatives/integrals/diff-eqns) — **and it is absent from the app's syllabus**, Coordinate geometry, Trigonometry, Functions/graphs, Quadratics, Sequences/series, Matrices/determinants, Complex numbers, P&C, Probability, Vectors, 3D geometry. **Important:** Logarithms, Surds/indices, Statistics, Binomial. **Useful:** Number system basics. **Not required (correctly dropped `[CODE]`):** Profit&Loss, Interest, DI — correctly excluded.
- **Speed-Math Importance: 2/10 — *Little/No Benefit*.** `[ASSESS]` JEE Maths is decided by deep concept mastery (especially calculus). Mental-arithmetic speed is almost irrelevant.
- **Accuracy 9/10 · Mental-Maths 3/10.**
- **Real-student strategy `[ASSESS]`:** Years of concept building (calculus, coordinate geometry, algebra); problem-solving depth; speed maths plays no meaningful role.
- **QuantReflex Fit: 2/10.** `[ASSESS]` **Poor.** The app's arithmetic speed drills barely touch JEE's syllabus; its single largest topic (calculus) **isn't even modeled.** Strongly recommend concept practice elsewhere.
- **Planner audit: 3/10.** `[ASSESS]` Correctly boosts quadratics/functions/coordinate-geom/trig/P&C and **correctly drops P&L/interest/DI** — good instincts. **Critical error:** **calculus is missing from the entire topic library**, so the largest, most decisive block of JEE Maths is invisible. A JEE plan from this engine would be fundamentally incomplete.
- **Improvements:** **Either add calculus + vectors + complex numbers to the library, or stop presenting JEE as supported.** As-is, the JEE plan is misleading.

---

#### 24. Olympiad (IOQM / RMO / INMO)

- **Basics `[FACT]`:** HBCSE/TIFR (with MTA), olympiads.hbcse.tifr.res.in. Annual pathway to IMO. English (+ Hindi). **No calculator at any stage.**
- **Pattern `[FACT]`:** **IOQM:** 30 integer-answer Q (00–99), 3 h, 100 marks, **no negative** (≈ 6 min/Q). **RMO:** 6 proof problems, 3 h. **INMO:** 6 proof problems, 4.5 h (~30–45 min/problem). **Pre-calculus olympiad maths: number theory, combinatorics, Euclidean geometry, algebra (inequalities, polynomials, functional equations). No calculus, no statistics.**
- **Quant grid:** Math **Y** · QA **N** · NA **N** · DI **N** · LM **Y** · BA **N** · HM **Y** · EM **N** · Stat **N** · MA **P** · SM **N** · Calc **N** · SC **N**
- **Quant section `[ASSESS]`:** **Depth over speed, fundamentally.** Creative proof construction over 30–45 min per problem. This is the **opposite** of what QuantReflex trains.
- **Topic mapping `[ASSESS]`:** **Critical:** Number theory (remainders, primes, divisors), Combinatorics (P&C), Euclidean geometry (triangles/circles), Algebra (inequalities, polynomials, functional equations). **Important:** Sequences, Functions. **Not required:** ALL speed-arithmetic, %, P&L, DI, TSD, calculus.
- **Speed-Math Importance: 1/10 — *No Benefit*.** `[ASSESS]` Elite calculation speed is irrelevant; rank comes from insight and rigorous proof.
- **Accuracy 8/10 (proof correctness) · Mental-Maths 2/10.**
- **Real-student strategy `[ASSESS]`:** Years of olympiad-specific training in number theory/combinatorics/geometry proofs; depth, creativity, written rigor.
- **QuantReflex Fit: 1/10.** `[ASSESS]` **Essentially no fit.** The app's speed-arithmetic model is antithetical to olympiad preparation. Its only marginal value: basic number-system fluency for very young beginners.
- **Planner audit: 5/10.** `[ASSESS]` The override is *intellectually* correct — boosts number theory/combinatorics/geometry, drops DI/P&L, nuance says "depth over speed." **But** the app has **no tooling** for proof-based maths, and presenting an Olympiad plan via a speed-drill engine sets wrong expectations; difficulty cap (topic difficulty maxes at 0.70) can't represent olympiad hardness.
- **Improvements:** **Consider disabling/hiding Olympiad** or relabeling it "number-system foundations only — not olympiad proof training," to avoid misrepresenting the app's value.

---

#### 25. Foundation

- **⚠️ STATUS `[FACT]`:** **"Foundation" is NOT a standardized exam.** It is a generic Class 6–10 maths/curriculum track (sold by coaching institutes). No conducting body, official site, pattern, marks, or negative marking. The app correctly treats it as a *basics track*, not an exam.
- **Basics `[ASSESS]`:** Target: early learners (Class 6–10) building calculation fluency.
- **Pattern:** N/A (no exam).
- **Quant grid:** Math **Y** · QA **P** · NA **Y** · DI **P** · BA **Y** · SM **Y** · Calc **Y** · SC **P**; HM/EM/Stat **N**, MA **P**.
- **Topic mapping `[ASSESS]`:** **Critical:** Multiplication/calculation, Fractions, Percentages, Ratio, basic Geometry/Mensuration. **Important:** Averages, basic Algebra, LCM/HCF. **Useful:** P&L, TSD basics. **Not required (correctly dropped `[CODE]`):** Remainders, Functions, Trig, Coordinate geometry, Probability.
- **Speed-Math Importance: 6/10 — *Benefits*.** `[ASSESS]` Building calculation fluency *is* the goal — the app's purpose aligns with foundation learning, though "speed" should be framed as "fluency" not "exam speed."
- **Accuracy 7/10 · Mental-Maths 8/10.**
- **QuantReflex Fit: 8/10.** `[ASSESS]` **Excellent** — fluency drills on the 12 categories are exactly what foundation learners need.
- **Planner audit: 6/10.** `[ASSESS]` Overrides correctly strip advanced topics; the only issue is presenting it alongside real exams (a category/labeling nuance, harmless).
- **Improvements:** Keep; frame as a fluency-building track; ideal entry point / on-ramp to the app.

---

### FAMILY F — GENERIC (1)

---

#### 26. Other (fallback)

- **Basics `[CODE]`:** Generic family, balanced quant core. Used when `examId` is unknown.
- **Topic coverage `[CODE]`:** Multiplication, Fractions, Percentages, Ratio, Averages, P&L, Interest, TSD, Time&Work, Mensuration, DI, Simplification, Number series — the everyday arithmetic core.
- **Speed-Math Importance: 6/10 — *Benefits*.** `[ASSESS]` Balanced default.
- **QuantReflex Fit: 7/10.** `[ASSESS]` Good general-purpose mapping to the app's drills.
- **Planner audit: 8/10.** `[ASSESS]` Sensible balanced fallback; correctly conservative.
- **Improvements:** Keep as the safe default.

---

## STEP 8 — Final ranking (all 26 exams)

> Notation: **Quant Q / Quant Time** use the most representative *primary* stage (banking = prelims; SSC = Tier-1; NDA/CDS = the maths paper). **Difficulty** = overall quant difficulty `[ASSESS]`. Scores are `[ASSESS]` 0–10. Time in minutes. Sorted by **Speed-Math Importance** (the app's core value axis), high → low.

| Exam | Total Q | Quant Q | Total Time | Quant Time | Quant Wt | Difficulty | Speed | Accuracy | Mental-Maths | Fit | Planner Acc. | Top recommended improvement |
|------|--------:|--------:|-----------:|-----------:|---------:|------------|------:|---------:|-------------:|----:|-------------:|------------------------------|
| **IBPS Clerk** | 100 | 35 | 60 | 20 | 35% | Easy | **10** | 9 | 10 | 9 | 9 | Add simplification/series drills + 20-min sectional timer |
| **Bank PO** | 100 | ~35 | 60 | 20 | 35% | Easy-Mod | **10** | 9 | 10 | 9 | 9 | Flagship: simplification + DI drills, sectional timer |
| **IBPS PO** | 100 | 35 | 60 | 20 | 35% | Easy-Mod | **10** | 9 | 10 | 9 | 9 | DI/Caselet + quadratic-comparison drills |
| **SBI PO** | 100 | 30 | 60 | 20 | 30% | Moderate | **9** | 10 | 9 | 9 | 9 | Advanced Caselet-DI practice |
| **MBA CET** | 200 | 50 | 150 | ~38 | 25% | Easy-Mod | **9** | 6 | 9 | 8 | 8 | Raise speed weight; no-negative attempt-all strategy |
| **SNAP** | 60 | 20 | 60 | ~20 | 33% | Easy-Mod | **8** | 8 | 8 | 8 | 9 | Promote Reflex/Timed drills + DI/DS |
| **NMAT** | 108 | 36 | 120 | 52 | 33% | Easy-Mod | **8** | 6 | 7 | 8 | 9 | No-negative strategy; DI sets |
| **RRB NTPC** | 100 | 30 | 90 | shared | 30% | Easy-Mod | **8** | 9 | 9 | 8 | 9 | Model −1/3 marking; mensuration + series drills |
| **SSC CGL** | 100 (T1) | 25 | 60 | ~15 | 25% | T1 Easy / T2 Hard | **7** | 9 | 8 | 7 | 7 | Add geometry/trig drills (its top topics) |
| **SSC CHSL** | 100 (T1) | 25 | 60 | ~15 | 25% | Easy-Mod | **7** | 9 | 8 | 7 | 8 | Geometry/trig drills for T2 |
| **SSC MTS** | 90 | 20 | 90 | ~22 | 22% | Easy | **7** | 6 | 8 | 8 | 8 | Promote speed; attempt-all (no-neg) note |
| **AFCAT** | 100 | ~20 | 120 | shared | ~20% | Easy | **7** | 8 | 8 | 7 | 8 | Promote speed drills (high-yield slice) |
| **CDS** | 100 | 100 | 120 | 120 | 33% | Moderate | **7** | 8 | 7 | 7 | 8 | Add basic trig/geometry drills |
| **CUET (GT)** | 50 | ~10–15 | 60 | shared | ~25% | Easy | **7** | 8 | 7 | 7 | 8 | Clarify GT vs Domain-Maths; DI drills |
| **IPMAT** | 90 | 45 | 120 | 80 | 50% | Moderate | **7** | 8 | 6 | 6 | 8 | Algebra concept practice; SA no-neg note |
| **CAT** | 68 | 22 | 120 | 40 | 32% | Hard | **6** | 9 | 6 | 6 | 8 | Shift toward concept/DI sets; add DILR/DS |
| **CMAT** | 100 | 20 | 180 | ~36 | 20% | Moderate | **6** | 8 | 5 | 7 | 8 | Flag calculator-available → moderate speed |
| **Foundation** | — | — | — | — | — | Basic | **6** | 7 | 8 | 8 | 6 | Frame as fluency on-ramp |
| **NTSE** ⚠️ | 100 (SAT) | ~20 | 120 | ~24 | 20% | Moderate | **6** | 7 | 6 | 5 | 4 | Add suspended-status flag; can't address MAT |
| **Other** | — | — | — | — | — | Balanced | **6** | 7 | 7 | 7 | 8 | Keep as default |
| **XAT** | ~95 | ~28 | 180 | ~60 | ~29% | Hard | **5** | 9 | 7 | 6 | 8 | Favour accuracy framing over speed |
| **CLAT** | 120 | ~13–15 | 120 | shared | ~11% | Easy | **5** | 8 | 5 | 5 | 7 | Passage-based DI practice; de-emphasise speed |
| **NDA** | 120 | 120 | 150 | 150 | 33% | Hard (HM) | **5** | 8 | 6 | 4 | 6 | Add calculus/vectors or label "fundamentals only" |
| **GMAT** | 64 | 21 | 135 | 45 | 33% | Moderate | **4** | 9 | 5 | 4 | 7 | Flag concept-only; add DS practice |
| **JEE (Quant)** | 75 | 25 | 180 | ~60 | 33% | Very Hard | **2** | 9 | 3 | 2 | 3 | Add calculus or stop presenting as supported |
| **Olympiad** | 30 (IOQM) | 30 | 180 | 180 | 100% | Extreme | **1** | 8 | 2 | 1 | 5 | Disable/relabel — proof maths, not speed |

---

## STEP 9 — Executive summary (the 10 strategic questions)

**1. Which exams benefit MOST from QuantReflex?**
`[ASSESS]` The **banking family (IBPS Clerk, Bank PO, IBPS PO, SBI PO)** above all — 34–40 s/question, no calculator, calculation-bound. Then **MBA CET, SNAP, NMAT** (high-volume speed MBA exams), **SSC Tier-1 / SSC MTS**, **AFCAT**, and **Foundation** (fluency building). These are the exams where mental-calc speed *is* the rank lever.

**2. Which exams barely need speed maths?**
`[ASSESS]` **Olympiad (1/10)**, **JEE (2/10)**, **GMAT (4/10)** — and to a lesser degree **NDA, XAT, CLAT (5/10)**. For these, concept depth, proof skill, calculus, reading comprehension, or adaptive logic dominate.

**3. Which exams require conceptual mathematics more than speed?**
`[ASSESS]` **JEE** (calculus/coordinate geometry), **NDA** (calculus/trig/matrices/vectors), **Olympiad** (number theory/combinatorics/proofs), **GMAT** (reasoning/DS), **SSC CGL Tier-2** (geometry/trig/algebraic identities), **CAT** (advanced number theory/algebra/DILR), **XAT** (application + traps).

**4. Which exams should receive specialised AI-Planner logic?**
`[ASSESS]` (a) **Banking** — needs sectional-timer simulation + speed as the dominant weight. (b) **No-negative-marking exams** (NMAT, MBA CET, SSC MTS Session-I, IPMAT SA, CUET-style scoring, Olympiad IOQM) — should teach an *attempt-everything* strategy. (c) **Calculator-available exams** (CAT, CMAT, IPMAT, SSC Tier-2, GMAT Data Insights) — should *lower* mental-speed emphasis. (d) **JEE/NDA** — need a calculus-aware syllabus or an honest "fundamentals-only" label. (e) **Two-paper exams** (SSC CGL/CHSL, defense) — need stage-specific plans.

**5. Which exams should recommend different practice modes?**
`[ASSESS]` Banking/MBA-CET/SNAP/NMAT/SSC-T1/MTS/AFCAT → **Reflex + Timed speed drills**. CAT/XAT/GMAT/IPMAT/CGL-T2 → **concept practice + (future) word-problem/DI mode**. CLAT → **passage-based DI**. JEE/NDA/Olympiad → **concept study** (app provides only foundational fluency).

**6. Which exams should prioritise drills over tests?**
`[ASSESS]` **Foundation, SSC MTS, AFCAT, CUET, Bank/IBPS Clerk** — building raw fluency on basic operations is the whole job; drills first.

**7. Which exams should prioritise tests over drills?**
`[ASSESS]` **CAT, XAT, GMAT, SBI PO Mains, IBPS PO Mains, SSC CGL** — at this level the binding constraint is full-paper/sectional simulation, question selection, and stamina, not isolated category speed. (The app currently has *no* full-paper mock mode — a gap for these.)

**8. Which exams require the biggest improvements in QuantReflex?**
`[ASSESS]` **JEE** (missing calculus = broken plan), **NDA** (missing calculus/vectors), **Olympiad** (wrong paradigm entirely), **NTSE** (suspended + MAT not addressed), **SSC CGL** (its top topics — trig/geometry — aren't drillable), and **all banking** (needs sectional-timer + simplification/DI drills to fully deliver).

**9. Which exams are already well supported?**
`[ASSESS]` **Banking prelims, SNAP, NMAT, MBA CET, SSC MTS, AFCAT, CDS, Foundation, Other** — the catalog weights are accurate and the app's tooling genuinely matches the need. CAT/XAT/CMAT/CUET/IPMAT are well-categorised but tooling-limited (no DI/concept modes).

**10. If rebuilding QuantReflex from scratch around these exams, what would change?**
`[ASSESS]`
1. **Make speed weight exam-dependent**, not a flat 12%. Banking should weight speed ~40%+; JEE/Olympiad near 0%.
2. **Add exam-mechanics metadata** (question count, duration, sectional timing, negative-marking scheme, calculator policy, adaptivity) to the syllabus model so plans reflect real exam constraints — today there is none.
3. **Build a sectional-mock / full-paper mode** with real timers and negative-marking scoring — the single biggest missing capability for serious aspirants.
4. **Expand drillable categories** beyond arithmetic: Simplification/Approximation, Number Series, Data Interpretation, Data Sufficiency, Quadratic Comparison, and at least basic Algebra/Geometry/Trig — these are high-weight topics that are currently study-only.
5. **Fix the syllabus gaps:** add Calculus, Vectors, Complex numbers (for JEE/NDA), or de-scope those exams honestly.
6. **Teach strategy, not just topics:** attempt-all vs skip, calculator vs mental, accuracy vs throughput — derived from each exam's real marking scheme.
7. **Correct stale/non-exam entries:** flag NTSE as suspended; relabel Foundation as a track; reconsider Olympiad.
8. **Segment the product:** a "Speed" product line (banking/SSC-T1/MBA-speed exams) where the app is world-class, and a "Concept" line (CAT/JEE/NDA) where it's a supplement — rather than treating all 26 identically.

---

## Cross-cutting findings (systemic, affect many exams)

`[ASSESS]` (all framed as findings — **nothing was implemented**)

1. **Flat 12% speed weighting is the central mismatch.** `readiness.js` weights speed at 12% for every exam. For banking that should be ~3–4× higher; for JEE/Olympiad it should be near zero. The deterministic planner is otherwise sound, but this one constant makes it simultaneously *under*-emphasise speed for banking and *over*-emphasise it for JEE.

2. **No exam-mechanics model at all.** `[CODE]` The catalog stores topic weights only — no question counts, durations, negative marking, calculator policy, or adaptivity. So the planner cannot tailor strategy to *how* an exam is scored, only *what* it tests. Every "attempt-all vs skip", "calculator vs mental", and "sectional timing" insight in this report is invisible to the current engine.

3. **Drill coverage is arithmetic-only.** `[CODE]` 12 drillable categories, all arithmetic/mensuration. High-weight topics across many exams — Simplification, Number Series, DI, Data Sufficiency, Quadratic Comparison, Algebra, Geometry, Trigonometry — are study-only, with readiness merely *inferred* from arithmetic drills. For SSC CGL this means its **top topics (trig/geometry) cannot be practised in-app**; for banking it means **simplification/DI (its core) aren't drillable**.

4. **No full-paper / sectional-mock mode.** `[CODE]` The 6 modes are all short drills. Exams whose challenge is stamina + selection + sectional timing (CAT, banking mains, SSC, all sectionally-locked MBA exams) are under-served.

5. **Two factual catalog errors.** `[FACT]` (a) **JEE syllabus omits calculus**, the largest JEE-Maths block. (b) **NTSE is presented as live but suspended since 2021.** Both would mislead a real aspirant.

6. **Paradigm mismatch for Olympiad.** `[ASSESS]` A speed-drill engine cannot represent proof-based olympiad maths; the catalog weights are intellectually right but the tooling can't deliver.

---

## Appendix — fact vs assessment ledger & confidence notes

- **All exam-pattern figures** in Steps 2–7 and the ranking are `[FACT]` from the 2025–26 cycle, cross-verified across official + coaching sources. Highest-confidence: CAT, SNAP, NDA, CDS, AFCAT, SSC, JEE, Olympiad, CUET, CLAT structure. **Lower-confidence (verify against the specific year's official notification PDF before high-stakes use):** XAT 2026 per-section counts; IBPS Clerk Mains exact split; SBI PO Mains English marks; AFCAT per-section quant count (~20, not officially fixed); CUET/CLAT exact quant sub-counts (bodies publish weightage %, not fixed counts); on-screen-calculator confirmation for SSC Tier-2 (established rule, not restated on current coaching pages).
- **All Speed / Accuracy / Mental-Maths / Fit / Planner-Accuracy scores** are `[ASSESS]` — reasoned judgements calibrated to the verified facts, not sourced numbers (±1 is reasonable analyst variance).
- **All codebase claims** are `[CODE]` from `main-app/data/syllabus.js`, `main-app/services/{planningEngine,planning... }`, `main-app/services/readiness.js`, `main-app/services/quantTopics.js`, and `main-app/js/controllers/practice-modes.js`, read directly during this audit.
- **Source disagreements encountered:** CAT marks change was 2024 not 2025 (coaching sites mislabel); CMAT is 3 h not 4 h; SBI PO 2025 reduced prelims Quant 35→30; SNAP halved to 60 min — older sources are stale. Where official vs coaching conflicted, official patterns + PYQ trends were treated as authoritative.

*End of audit.*
