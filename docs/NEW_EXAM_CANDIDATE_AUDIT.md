# New-Exam Candidate Audit — MAT · ATMA · RBI Grade B · RBI Assistant · NABARD Grade A

**Independent, evidence-based research audit to decide whether each candidate exam deserves to enter QuantReflex.**

- **Date:** 2026-06-17
- **Status:** Research-only. No code, no database, no implementation. Companion to `docs/EXAM_AUDIT.md` and `docs/PRODUCT_STRATEGY.md`.
- **Method:** Live multi-source verification (2025–26 cycle) against official bodies (AIMA, AIMS/ATMA, RBI `opportunities.rbi.org.in`, NABARD) and reputable coaching aggregators (Careers360, Oliveboard, Adda247/BankersAdda, EduTap, Career Power, PracticeMock, Testbook, Anuj Jindal). Confidence flags (High/Med/Low) noted; sources listed per exam.
- **Labels:** `[FACT]` verified external fact · `[CODE]` fact about the current QuantReflex codebase · `[ASSESS]` reasoned judgement.

> **Scoring rubrics.** Parts 4/5/8/11 use 0–10 scales. Speed/mental-maths/shortcut/calc-intensity/time-pressure measure how much *fast no-calculator calculation* drives rank. Concept-depth/formula-recall measure conceptual load. Compatibility (Part 5) measures how well the *current* QuantReflex serves the exam with no new work. All scores are `[ASSESS]` calibrated to the verified facts.

---

## Executive verdict

| Rank | Exam | QR Fit /10 | Speed /10 | Dev cost /10 | Maint /10 | User demand /10 | Revenue /10 | Strategic /10 | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **RBI Assistant** | 9 | 9 | 3 | 2 | 9 | 8 | 9 | ✅ **Add immediately** (Phase 2) |
| 2 | **ATMA** | 8 | 8.5 | 3 | 2 | 6 | 7 | 7 | ✅ **Add** (Phase 2) |
| 3 | **MAT** | 7 | 7 | 3 | 2 | 8 | 7 | 7 | ✅ **Add** (Phase 2) |
| 4 | **RBI Grade B** | 6 | 6 | 5 | 4 | 8 | 7 | 6 | 🟡 **Add after launch** |
| 5 | **NABARD Grade A** | 3 | 4 | 6 | 5 | 3 | 3 | 2 | ❌ **Do not support** |

Dev/Maintenance are cost scales (lower = cheaper). Priority order: **RBI Assistant → ATMA → MAT → RBI Grade B → ✗ NABARD.**

**One-line rationale:** RBI Assistant is a near-clone of the IBPS-Clerk speed profile QuantReflex already nails (huge pool, trivial to add). ATMA and MAT are arithmetic-heavy, no-calculator MBA exams with strong Nagpur coaching and R.S. Aggarwal as the shared spine. RBI Grade B is valuable but DI/concept-heavy (a *partial* speed play) and premium/low-volume — worth adding once core launch lands. **NABARD fails the core test**: its Quant is only 20/200 and merely *qualifying*; the exam is decided by agriculture/economics domain knowledge a speed-maths app cannot touch.

---

# 1. RBI Assistant — ✅ Add immediately

### Part 1 — Overview `[FACT]`
- **Body / site:** Reserve Bank of India · `opportunities.rbi.org.in`. **Frequency:** annual. **Eligibility:** graduate, age 20–28. **Vacancies (2026):** ~650. **Applicants:** official count not yet released; ~0.5–1M estimated from the 650-vacancy/IBPS-Clerk parallel (Med). **Trend:** stable-to-growing; mass-market entry-level banking. (Career Power, BankersAdda)

### Part 2 — Pattern `[FACT]` (High)
- **Prelims (qualifying):** 100 Q / 100 marks / 60 min, **20-min sectional timing**. English 30, **Numerical Ability 35/35**, Reasoning 35. **−0.25**, no calculator, fixed (non-adaptive), English+Hindi.
- **Mains (merit):** 200 Q / 200 marks / 135 min — Reasoning 40, English 40, **Numerical Ability 40/40**, General Awareness 50, Computer 30. −0.25. Then a qualifying regional Language Proficiency Test.
- **Quant pace:** Prelims **34 s/question** — among the most brutal in the banking ecosystem.

### Part 3 — Quant breakdown `[FACT]`/`[ASSESS]`
Simplification & Approximation **30–35%** · Arithmetic word problems **25–35%** · Data Interpretation **20–25%** (simple tables/caselets) · Number Series **10–15%** · Quadratic Comparison **10–15%** · misc (mensuration/number system) 5–10%. Difficulty: **Easy–Moderate**, speed-bound.

### Part 4 — Speed-math scoring `[ASSESS]`
Speed **9** (simplification-dominant, 34 s/Q) · Mental Calc **10** (sub-10s arithmetic, no calculator) · Shortcuts **10** (Vedic/approximation essential) · Calc Intensity **9** · Formula Recall **8** · Accuracy **7** (−0.25, but attempt-rate prioritised) · Concept Depth **5** (plug-and-calculate) · Time Pressure **10** (the defining constraint).

### Part 5 — Current QuantReflex compatibility — **9/10** `[CODE]`/`[ASSESS]`
Syllabus: arithmetic core already modelled. Drills: 8 of the 12 categories map directly. Planner/readiness/tests: banking family already exists (`bankpo`/`ibpsclerk` profile). The app's 15s-baseline speed scoring is *purpose-built* for this exam. The only gaps are content categories shared with all banking (below).

### Part 6 — Missing content `[ASSESS]`
Simplification/Approximation drill · Number Series drill · DI drill (simple tables/caselets) · Quadratic Comparison drill · sectional-timer (20-min) mock mode · `rbiassistant` syllabus profile + exam-mechanics metadata. (All shared with the banking tier — near-zero marginal cost once built for IBPS.)

### Part 7 — Books `[FACT]`
**R.S. Aggarwal** (S. Chand) is the de-facto standard (speed-oriented chapters), supplemented by fast-track simplification material (Anuj Jindal / Adda247). Maps cleanly to the R.S. Aggarwal canonical ordering. Nagpur coaching (IBT, Winner, S&S, Achieve Max) uses it.

### Part 8 — Value — **Excellent Fit** `[ASSESS]`
If QuantReflex shipped today unchanged, an RBI-Assistant aspirant would benefit immediately: the prelims numerical section *is* speed-arithmetic under a clock, the app's core competency.

### Part 9 — Product strategy — **Core (Banking tier)** `[ASSESS]`
Highest-volume, lowest-effort, perfect-fit candidate. Anchor exam for the Banking tier alongside IBPS Clerk.

### Part 10 — ROI `[ASSESS]`
Dev **3/10** (reuses banking family) · Maint **2/10** · Users **9/10** (lakhs) · Marketing **8/10** · Revenue **8/10** · Overlap with IBPS Clerk **very high** (a feature, not redundancy — shared prep). Net: **strongly accretive.**

### Part 11 — Verdict: **✅ Add immediately.** Sources: BankersAdda, Career Power, Oliveboard, Testbook (2025-26).

---

# 2. ATMA — ✅ Add

### Part 1 — Overview `[FACT]`
- **Body / site:** AIMS (Association of Indian Management Schools) · `atmaaims.com`. **Frequency:** ~4×/yr. **Eligibility:** graduate. **Acceptance:** 750+ institutes. **Applicants:** ~20–30K/yr (Med). **Trend:** stable; positioned as the inclusive (non-engineer) MBA test. (Careers360, IMS)

### Part 2 — Pattern `[FACT]` (High)
- 180 Q / 180 marks / 180 min, **6 sections of 30 (Verbal ×2, Analytical Reasoning ×2, Quantitative Skills ×2)**, **strict 30-min hard-stop per section, no backtrack**. **−0.25.** **No calculator (confirmed).** English only. Online CBT, fixed.
- **Quant:** 60 Q across two parts (~25% DI), **30 s/question** — severe.

### Part 3 — Quant breakdown `[FACT]`/`[ASSESS]`
Arithmetic **35–40%** · DI **20–25%** · Algebra **15–18%** · Modern Math **8–10%** · Geometry/Mensuration **13–18%** · Number System **8–10%** · Trig ~2–3%.

### Part 4 — Speed-math scoring `[ASSESS]`
Speed **8** · Mental Calc **9** (30 s/Q, no calculator) · Shortcuts **9** · Calc Intensity **7** (DI-heavy) · Formula Recall **8** · Accuracy **8** (−0.25) · Concept Depth **5** · Time Pressure **9** (the #1 aspirant complaint).

### Part 5 — Compatibility — **7/10** `[CODE]`/`[ASSESS]`
Arithmetic + mensuration (area/volume drills) map well; the easier-MBA weight profile resembles SNAP/CMAT already modelled. Gap: DI drilling + a 30-min sectional mock to mirror the hard-stops.

### Part 6 — Missing content `[ASSESS]`
`atma` syllabus profile + metadata (30-min sectional, no-calculator) · DI drill · sectional-timer mock · 30 s/Q drill preset.

### Part 7 — Books `[FACT]`
**R.S. Aggarwal** standard; **Rajesh Verma "Fast Track Objective Arithmetic"** popular as the speed add-on (ATMA-specific). NCERT 9–10 as foundation. Nagpur coaching (IMS, Career Launcher) confirmed.

### Part 8 — Value — **Excellent Fit** `[ASSESS]`
A 30 s/Q no-calculator exam is precisely the pain QuantReflex solves; high willingness-to-pay for speed tools.

### Part 9 — Product strategy — **Core/Secondary (MBA tier)** `[ASSESS]`
Smaller pool than MAT but stickier need; pairs naturally with the MBA-speed group.

### Part 10 — ROI `[ASSESS]`
Dev **3** · Maint **2** · Users **6** · Marketing **7** (clear pain) · Revenue **7** · Overlap with MAT/CMAT high. Net: **accretive.**

### Part 11 — Verdict: **✅ Add (Phase 2).** Sources: Careers360, IMS, CollegeDekho, ATMA official.

---

# 3. MAT — ✅ Add

### Part 1 — Overview `[FACT]`
- **Body / site:** AIMA · `mat.aima.in`. **Frequency:** 4×/yr (Feb/May/Sep/Dec). **Acceptance:** 800+ B-schools. **Applicants:** ~80–100K/yr (20K+/session). **Trend:** growing (+~20% post-COVID; rising women participation). (Careers360, AIMA)

### Part 2 — Pattern `[FACT]` (High)
- 150 Q / 150 marks / 120 min, **5 sections of 30** (Language, **Mathematical Skills**, Reasoning, **Data Analysis & Sufficiency**, Economic & Business Env — last excluded from percentile). **No sectional timing.** **−0.25.** Fixed. (2024+ restructure: 200→150 Q, 150→120 min, IBT mode dropped.)
- **Quant (Mathematical Skills):** 30 Q; with free time allocation ~90–120 s/Q effective.

### Part 3 — Quant breakdown `[FACT]`/`[ASSESS]`
Arithmetic **50–55%** · Algebra **15–20%** · Modern Math **10–12%** · Geometry **8–10%** · Number System **5–8%** · Mensuration 3–5% · Trig 2–3%. (DI is a separate section.)

### Part 4 — Speed-math scoring `[ASSESS]`
Speed **7** · Mental Calc **6** · Shortcuts **8** · Calc Intensity **5** (easier than CAT) · Formula Recall **7** · Accuracy **9** (−0.25 vs 1-mark questions) · Concept Depth **6** · Time Pressure **7** (~48 s/Q overall).

### Part 5 — Compatibility — **7/10** `[CODE]`/`[ASSESS]`
Arithmetic-dominant Mathematical-Skills section is squarely in the app's wheelhouse; easier-MBA weight profile already exists. DI lives in a separate section (would benefit from a DI drill).

### Part 6 — Missing content `[ASSESS]`
`mat` syllabus profile + metadata (no sectional timing; 4×/yr) · DI drill (for the Data Analysis section) · accuracy-first coaching framing.

### Part 7 — Books `[FACT]`
**R.S. Aggarwal** standard for MBA Tier-2 (MAT/CMAT/MAT bundle); Quantum CAT / Arun Sharma as advanced add-ons. Strong Nagpur coaching presence.

### Part 8 — Value — **Good Fit** `[ASSESS]`
Speed moderately important (7); large, growing, low-gatekeeping pool that also feeds CAT prep — good top-of-funnel.

### Part 9 — Product strategy — **Core (MBA tier)** `[ASSESS]`
Biggest user pool of the candidates after RBI Assistant; cheap to add.

### Part 10 — ROI `[ASSESS]`
Dev **3** · Maint **2** · Users **8** · Marketing **7** · Revenue **7** · Overlap with CAT/CMAT/ATMA high. Net: **accretive.**

### Part 11 — Verdict: **✅ Add (Phase 2).** Sources: Careers360, TopRankers, MBAUniverse, AIMA.

---

# 4. RBI Grade B — 🟡 Add after launch

### Part 1 — Overview `[FACT]`
- **Body / site:** RBI · `opportunities.rbi.org.in`. **Frequency:** annual. **Eligibility:** graduate ≥60%, age 21–30. **Vacancies:** 60 (2026) / 120 (2025). **Applicants:** **107,045 General-cadre (2025)** [High]; ratio ~890:1. **Trend:** intensely competitive, premium ("dream job"); cutoffs rising 54→67→77.5. (BankersAdda)

### Part 2 — Pattern `[FACT]` (High)
- **Phase 1:** 160 Q / 200 marks / 120 min, strict sectional timing. GA 40, Reasoning 40, English 40, **Quant 30/30 in 25 min (50 s/Q)**. −0.25, no calculator (on-screen calc only in DSIM Phase-2 paper).
- **Phase 2:** ESI + Finance & Management (objective) + English (descriptive).

### Part 3 — Quant breakdown `[FACT]`/`[ASSESS]`
**Data Interpretation 40–50%** (analytical, calculation-heavy) · Arithmetic word problems 17–23% · Number Series 7–10% · Quadratic Comparison 7–10% · Simplification/Approximation only **3–7%** · misc algebra/mensuration. Difficulty **Moderate–Hard**.

### Part 4 — Speed-math scoring `[ASSESS]`
Speed **6** (simplification minor) · Mental Calc **7** · Shortcuts **8** · Calc Intensity **8** (DI) · Formula Recall **8** · Accuracy **9** (DI errors cascade) · **Concept Depth 9** · Time Pressure **8**.

### Part 5 — Compatibility — **6/10** `[CODE]`/`[ASSESS]`
Arithmetic drills help the smaller arithmetic slice, but the exam's centre of gravity is **analytical DI + conceptual depth**, which the app does not drill. A *partial* speed play.

### Part 6 — Missing content `[ASSESS]`
`rbigradeb` profile + metadata · **advanced/analytical DI drill** (the differentiator) · DI-set practice mode · concept-framed coaching (speed is secondary here).

### Part 7 — Books `[FACT]`
**Arun Sharma (DI)** + **R.S. Aggarwal** foundation + **Anuj Jindal** for Phase-2 ESI/FM. Nagpur coaching tier-1 institutes cover it.

### Part 8 — Value — **Partial Fit** `[ASSESS]`
QuantReflex helps clear the (sectional-cutoff) Quant, but cannot deliver the DI-analytics + Phase-2 domain content that actually decides selection.

### Part 9 — Product strategy — **Secondary, after launch** `[ASSESS]`
High prestige + marketing halo ("prep for RBI"), but DI-drill capability must exist first; otherwise the app over-promises.

### Part 10 — ROI `[ASSESS]`
Dev **5** (needs real DI capability) · Maint **4** · Users **8** (107K) · Marketing **8** (prestige) · Revenue **7** · Overlap with SBI/IBPS PO mains. Net: **accretive once DI drilling exists.**

### Part 11 — Verdict: **🟡 Add after launch** (post-DI-drill). Sources: BankersAdda, Oliveboard, EduTap, Anuj Jindal.

---

# 5. NABARD Grade A — ❌ Do not support

### Part 1 — Overview `[FACT]`
- **Body / site:** NABARD · `nabard.org`. **Frequency:** irregular/annual. **Vacancies:** ~91 (recent). **Applicants:** not reliably published; pool far smaller than RBI/IBPS (Med). **Trend:** niche, domain-specialist.

### Part 2 — Pattern `[FACT]` (High)
- **Phase 1:** 200 Q / 200 marks / 120 min, **composite timing**. Sections: Reasoning 20, English 30, Computer 20, **Quantitative Aptitude 20/20**, Decision Making 10, General Awareness 20, **Economic & Social Issues 40**, **Agriculture & Rural Development 40**. −0.25.
- **CRITICAL:** Quant (and English/Reasoning/Computer/Decision-Making) are **qualifying only** — **merit is computed from GA + ESI + ARD** (domain knowledge). **Phase 2:** descriptive English + stream paper.

### Part 3 — Quant breakdown `[FACT]`/`[ASSESS]`
Within the 20-question qualifying slice: Arithmetic, DI, Number Series — moderate difficulty. **But quant is 10% of Phase-1 marks and contributes 0 to merit.**

### Part 4 — Speed-math scoring `[ASSESS]`
Speed **4** · Mental Calc **5** · Shortcuts **5** · Calc Intensity **4** · Formula Recall **5** · Accuracy **6** · Concept Depth **5** · Time Pressure **5** — *all moot* because the section is a small qualifying gate, not a rank lever.

### Part 5 — Compatibility — **3/10** `[CODE]`/`[ASSESS]`
The app could drill the 20 qualifying questions, but cannot touch the agriculture/economics/social-issues domain syllabus that *is* the exam.

### Part 6 — Missing content `[ASSESS]`
Everything that matters for NABARD (ESI/ARD domain content) is **out of scope** for a speed-maths product and will never be built.

### Part 7 — Books `[FACT]`
QA: R.S. Aggarwal / Anuj Jindal NABARD-specific. But aspirants spend ~90% of effort on ESI/ARD domain books, not quant.

### Part 8 — Value — **Weak Fit / Not Recommended** `[ASSESS]`
QuantReflex would help a NABARD aspirant clear a minor qualifying gate at best — a marginal, hard-to-market benefit.

### Part 9 — Product strategy — **Not Supported** `[ASSESS]`
Adding it dilutes the "speed-maths platform" promise and invites users the app cannot truly serve.

### Part 10 — ROI `[ASSESS]`
Dev **6** · Maint **5** · Users **3** (tiny pool) · Marketing **3** (mismatched promise) · Revenue **3** · Overlap: shares only the generic banking-quant slice. Net: **complexity > value.**

### Part 11 — Verdict: **❌ Do not support.** Sources: NABARD, Testbook, BankersAdda, Oliveboard, PracticeMock.

---

## Confidence & caveats
Patterns are current to the 2025–26 cycle; volatile per-section splits (RBI Assistant 2026 applicant count, RBI Grade B 2026 vacancy/cutoff) should be re-checked against the year's official notification before launch marketing. Speed/fit/ROI scores are reasoned assessments (±1 analyst variance). RBI Assistant applicant volume is an estimate (official count unreleased). NABARD's *qualifying-only* quant is the decisive, well-sourced fact behind its rejection.
