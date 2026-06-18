# QuantReflex Product Strategy — The Focused Speed-Maths Platform

**A senior-EdTech product-architecture blueprint for narrowing QuantReflex into the best speed-maths platform for MBA, Banking, Foundation, and Government-Aptitude aspirants — built for Nagpur/Maharashtra first, scalable nationally.**

- **Date:** 2026-06-17 · **Owner mandate:** clean-slate, pre-launch (no users, no backward-compat).
- **Companion docs:** `docs/EXAM_AUDIT.md` (26-exam baseline audit), `docs/NEW_EXAM_CANDIDATE_AUDIT.md` (5 candidate exams).
- **Labels:** `[CODE]` codebase fact · `[FACT]` verified external fact · `[ASSESS]` reasoned recommendation.

---

## 1. Strategic thesis

QuantReflex's old promise — "speed maths for every Indian competitive exam (26 of them)" — is a positioning trap: it is generic, overwhelming at onboarding, and includes exams (JEE, Olympiad, GMAT, CLAT, NDA) where mental-calculation speed is *not* the rank lever, so the product over-promises and under-delivers.

**New thesis:** become the **#1 speed-maths trainer for the exams where fast, no-calculator calculation genuinely decides rank**, and own **Maharashtra/Nagpur** as the beachhead. Quality over quantity: ~15 curated exams in 4 clear tiers, each modelled on the **books students actually study from**, with exam-specific strategy instead of one generic plan.

**Success looks like:** a Nagpur banking or MAH-CET aspirant opens the app, picks their exam in two taps, and the plan mirrors their R.S. Aggarwal / Arun Sharma prep — so the app feels like the speed-drill companion to the book already on their desk.

---

## 2. PHASE 1+2 — Catalog re-evaluation (Keep / Merge / Hide / Remove)

Decision principle: **keep an exam only if (a) no-calculator speed maths is a genuine rank lever and (b) there is a large, reachable Maharashtra market.** Full reasoning per exam in `EXAM_AUDIT.md`; verdicts:

- **Keep (14 user-facing):** CAT, XAT, SNAP, NMAT, CMAT, MAH MBA CET · IBPS PO, IBPS Clerk, SBI PO · Foundation · SSC CGL, SSC CHSL, SSC MTS, RRB NTPC.
- **Merge:** generic *Bank PO* → folds into IBPS/SBI PO (it was a redundant generic duplicate).
- **Remove (10):** GMAT, CLAT, JEE, Olympiad (owner mandate; speed not the lever) · NDA (calculus/theoretical) · CDS, AFCAT (defense niche, small reachable market) · CUET (thin numerical slice) · NTSE (suspended by NCERT since 2021) · IPMAT (UG-entry, out of focus).
- **Hidden internal:** `other` (generic) retained **only** as the engine fallback, not user-selectable.

**Pipeline (from candidate audit):** add **RBI Assistant, ATMA, MAT** (Phase 2); **RBI Grade B** after launch; **never NABARD** (Quant is 20/200 and qualifying-only).

This removes precisely the exams that made the product feel generic, and keeps a coherent set unified by one promise: *win on calculation speed*.

---

## 3. PHASE 3 — Target catalog & four-tier structure

| Tier | Name | Launch exams | Phase-2 additions | Defining trait |
|---|---|---|---|---|
| 1 | **MBA Entrance** | CAT, XAT, SNAP, NMAT, CMAT, MAH MBA CET | MAT, ATMA | Speed + DI; CAT/XAT concept-leaning, rest speed-leaning |
| 2 | **Banking** | IBPS PO, IBPS Clerk, SBI PO | RBI Assistant *(+ RBI Grade B later)* | Brutal time pressure (~34 s/Q), simplification + DI |
| 3 | **Foundation** | Foundation | — | Beginner fluency / general-aptitude on-ramp |
| 4 | **Government Aptitude** | SSC CGL, SSC CHSL, SSC MTS, RRB NTPC | — | High-volume no-calculator speed sprints + mensuration |

`[ASSESS]` Foundation and Government Aptitude are **separate tiers**: Foundation is the gentle on-ramp that graduates a beginner *into* a target tier; Government Aptitude is a distinct, high-volume SSC/Railways segment with its own mechanics (SSC Tier-1 speed, SSC MTS no-negative section, RRB mensuration). Conflating them would blur both the UX and the per-exam strategy.

---

## 4. PHASE 4 — Exam-selection UX (categories-first)

**Problem `[CODE]`:** today `companion-ui.js` (`runPlannerSetup` → `screenExam`, L454–564) renders a **single flat searchable button list** of every exam — the exact "overwhelming, unfocused" experience to kill.

**Redesign — progressive disclosure (researched against modern EdTech onboarding):**
1. **Step 1 — Four tier cards:** *MBA Entrance · Banking · Foundation · Government Aptitude*, each with a one-line descriptor and example exams. A quiet **"Not sure? Start with Foundation"** removes decision paralysis. (Four meaningful choices beat a 15-item scan; it mirrors how aspirants self-identify.)
2. **Step 2 — Exam within tier:** only that tier's 4–6 exams as cards; a **search box remains** as a secondary affordance (searches across all exams for power users).
3. **Smart defaults:** pre-highlight the most popular exam per tier (MAH CET for MBA in Maharashtra; IBPS Clerk for Banking); one tap to continue.
4. **Flow:** Tier → Exam → Date → Daily-time → done (4 light steps).

**Implementation `[ASSESS]`:** add a `tier` field per exam in `syllabus.js`; extend the setup screen list `['exam',…]` → `['tier','exam',…]`; render cards from the catalog grouped by tier; keep `searchExams()` for the search box; **delete** the hardcoded fallback list (regenerate from the catalog).

---

## 5. PHASE 5–7 — Book-grounded planner & topic mapping

**Principle:** stop generic topic assumptions; sequence the plan the way the student's book does, so the app aligns with their offline prep.

### 5.1 Two book spines `[FACT]`
- **R.S. Aggarwal — *Quantitative Aptitude for Competitive Examinations* (S. Chand)** — the de-facto standard for Banking, Government, Foundation, and easier MBA (MAH CET, CMAT, SNAP, NMAT, MAT, ATMA). 39 chapters in a clean progression. **Marathi-medium edition exists** → directly relevant to Nagpur. → becomes the **canonical topic ordering**.
- **Arun Sharma — *How to Prepare for QA for CAT* (McGraw Hill)** — standard for CAT/XAT, with **LOD-1/2/3** difficulty tiers → maps onto the app's easy/medium/hard. → the **difficulty-progression layer** for the concept-leaning MBA exams.

### 5.2 Canonical topic order (R.S. Aggarwal sequence) `[ASSESS]`
Reorder/tag the `syllabus.js` topic library to follow:
> Number System → HCF & LCM → Simplification & Approximation → Squares/Cubes & Roots → Average → Percentage → Profit & Loss → Ratio & Proportion → Partnership → Time & Work → Pipes & Cisterns → Time & Distance → Trains/Boats & Streams → Simple & Compound Interest → Mixtures & Alligation → Area (2D) → Volume & Surface Area (3D) → Permutations & Combinations → Probability → Number Series → Data Interpretation.

The existing 12 drillable categories already map onto this; the work is **ordering metadata + a few book-familiar renames** (e.g. "Time & Distance", "Boats & Streams", "Simplification & Approximation").

### 5.3 Book Mode `[ASSESS]`
The Planner sequences topics in the order the chosen book presents them (R.S. Aggarwal order by default; Arun Sharma LOD progression for CAT/XAT), so the plan feels familiar.

### 5.4 Per-exam topic-map matrix (Phase 7)
Format: **Book chapter → QR topic → importance → weightage → difficulty → speed relevance → planner priority → recommended drill → AI strategy.** Built from the verified weight bands in `syllabus.js` + book research. Representative matrices (full set generated per exam during build):

**IBPS Clerk (Tier 2 — pure speed):**
| Book ch. (R.S.A.) | QR topic | Importance | Weightage | Diff. | Speed | Priority | Drill | AI strategy |
|---|---|---|---|---|---|---|---|---|
| Simplification | simplification | Critical | very-high | Easy | 10 | 1 | Reflex/Timed | "Clear simplification first; ~20s each" |
| Series | number_series | Critical | very-high | Med | 9 | 2 | Reflex | "Pattern-spot fast; skip the 1 oddball" |
| Tables/Graphs | di_tables_charts | Critical | very-high | Med | 8 | 3 | DI drill | "Approximate; don't over-compute" |
| Percentage | percentages | Critical | very-high | Easy | 9 | 4 | Reflex | "Fraction-% conversions by heart" |
| Profit & Loss | profit_loss | Important | high | Med | 8 | 5 | Timed | "CP base discipline" |

**MAH MBA CET (Tier 1 — high-volume speed):**
| Book ch. | QR topic | Importance | Weightage | Diff. | Speed | Priority | Drill | AI strategy |
|---|---|---|---|---|---|---|---|---|
| Percentage | percentages | Critical | very-high | Easy | 9 | 1 | Reflex/Timed | "200Q/150min — attempt everything, **no negative**" |
| Ratio | ratio_proportion | Critical | very-high | Easy | 9 | 2 | Reflex | "Scale, don't add ratios" |
| DI (Tables) | di_tables_charts | Critical | very-high | Med | 8 | 3 | DI drill | "Speed over rigour" |
| Avg/P&L/TSD | averages/profit_loss/tsd | Important | high | Med | 8 | 4 | Timed | "Throughput maximisation" |

**CAT (Tier 1 — concept-leaning):**
| Book ch. (Arun Sharma LOD) | QR topic | Importance | Weightage | Diff. | Speed | Priority | Drill | AI strategy |
|---|---|---|---|---|---|---|---|---|
| Numbers (LOD-2/3) | remainders/factors | Critical | high | Hard | 5 | 1 | Concept + Timed | "CAT favourite; depth first, then speed" |
| Arithmetic (LOD-2) | percentages/ratio/tsd | Critical | very-high | Med | 6 | 2 | Timed | "Calc fluency to free DILR time" |
| Algebra (LOD-2/3) | quadratics/inequalities | Important | high | Hard | 4 | 3 | Concept | "Concept practice; on-screen calc available" |
| DI/Caselet | di_tables_charts/di_caselet | Critical | very-high | Hard | 6 | 4 | DI sets | "Selection + accuracy > raw speed" |

### 5.5 Capability gaps to close `[CODE]`/`[ASSESS]`
The high-weight topics that are currently **study-only (undrillable)** are exactly the core of these exams: **Simplification/Approximation, Number Series, Data Interpretation, Quadratic Comparison**. These become new drill categories (Phase D) — the single biggest content investment.

---

## 6. PHASE 8 — Does the planner need a rebuild? No — evolve it.

`[CODE]` The deterministic, marks-maximizing engine (`planningEngine.js`, `examStrategy.js`, `scheduleProjector.js`, `readiness.js`) is architecturally sound (the LLM only narrates). Rebuilding would discard a genuine asset. Three high-leverage evolutions:
1. **Tier-aware speed weighting** — replace the flat **12% speed weight** in `readiness.js` with a per-tier/per-exam value (Banking/Government high; MBA-speed high; CAT/XAT lower). This was the #1 systemic flaw in the audit.
2. **Exam-mechanics metadata** in `syllabus.js` — `questions`, `durationMin`, `sectionalTiming`, `negativeMark`, `noNegative`, `calculator`, `tier` — so plans teach real strategy (attempt-all vs skip, calculator vs mental).
3. **Book-order sequencing** (§5). Everything else (greedy ROI, milestones, projector) stays.

---

## 7. PHASE 9 — Exam-strategy personalization (one engine, data-differentiated)

| Group | Readiness speed weight | Primary drills | Coaching framing |
|---|---|---|---|
| **Banking (Tier 2)** | High | Reflex/Timed, Simplification, Number-Series, DI; sectional-timer mock | "~34 s/Q; clear simplification+series first; mind −0.25" |
| **Government (Tier 4)** | High | SSC-T1 speed + mensuration (area/volume); RRB mensuration | "SSC-T1 speed sprint; SSC-T2 geometry/trig concept; MTS Session-I has **no negative** — attempt all" |
| **Foundation (Tier 3)** | Medium | Fluency drills, gentlest progression | "Build calculation fluency; graduate into your target exam" |
| **MBA-speed (MAH CET, CMAT, SNAP, NMAT, MAT, ATMA)** | High | Reflex/Timed + DI; 30 s/Q preset for ATMA | "Attempt-everything for no-negative exams (NMAT, MAH CET); pace ruthlessly" |
| **MBA-concept (CAT, XAT)** | Lower | Concept + DI-set practice | "Depth + selection; on-screen calculator available; accuracy > attempts" |

All behaviour is driven by the per-exam metadata — the engine stays single; the **data** differentiates the plan, drills, insights, coach advice, readiness, and revision cadence.

---

## 8. PHASE 10 — Product simplification (reduce cognitive load)

- **Onboarding:** Tier → Exam → Date → Time (4 taps); "Not sure → Foundation" default.
- **Catalog:** 14–15 curated exams vs 26 flat; no misfit exams to confuse positioning.
- **Topic lists:** book-ordered, surfacing only the top-priority topics first (the rest fold under "more").
- **Confidence:** because the audience is narrow and well-modelled, recommendations can be assertive ("Do simplification today") rather than hedged.
- **Defaults:** smart per-tier pre-selection; beginners never face a blank decision.

---

## 9. PHASE 11 — Implementation roadmap

**Deliverables (this stage, no app code):** `docs/NEW_EXAM_CANDIDATE_AUDIT.md` ✓, `docs/PRODUCT_STRATEGY.md` ✓ (this file).

**Phased code rebuild:**
- **Phase A — Curation (data only):** prune `EXAMS` to the launch catalog; add `tier` + exam-mechanics metadata; reorder topic library to R.S. Aggarwal sequence; update `scripts/knowledge-base.check.js` + `intelligence-consistency.check.js` (drop gmat/clat/jee/olympiad assertions; add SSC/banking checks); fix the `companion-ui.js` fallback list. *Lowest risk, fully test-covered.*
- **Phase B — UX:** categories-first selector in `runPlannerSetup`; smart defaults; flag-gated.
- **Phase C — Planner evolution:** tier-aware speed weight (`readiness.js`); metadata-driven strategy (`examStrategy.js`); book-order sequencing; per-tier coach/insight framing (`aiPrompts.js`).
- **Phase D — New exams + drills:** add `mat`/`atma`/`rbiassistant` profiles; build the missing drill categories (Simplification, Number Series, DI, Quadratic Comparison); add a sectional-timer mock mode; later `rbigradeb` once analytical-DI drilling exists.

**Migration / backward-compat:** none — pre-launch, delete cleanly.
**Database:** `aiPlanner/{uid}` shape unchanged (still `examId`); only catalog data + `syllabus.js` metadata change.
**Question bank:** new drill categories need new generators (Phase D); existing 12 categories untouched.
**Testing:** update the two `scripts/*.check.js` validators; assert every kept exam resolves to a non-trivial syllabus and removed ids appear in no code path; manual onboarding walkthrough per tier.
**Rollback:** git revert per phase; UX behind a flag during Phase B.
**Risks:** removing govt/defense could disappoint a future segment (mitigated by clean re-add path); new drills are real content work (staged to D); book-order reorder must preserve the prereq/unlock graph (covered by `knowledge-base.check.js`).
**Benefits:** sharp positioning, far lower decision fatigue, book-familiar plans, honest per-exam strategy, a maintainable catalog.

---

## 10. If rebuilt from scratch — the ten principles

1. Speed weight is **exam-dependent**, never a flat constant.
2. Model **exam mechanics** (timing, negative marking, calculator), not just topics.
3. **Categories-first** selection; never a flat list.
4. The plan mirrors the student's **book**.
5. Drill the **high-weight topics** (simplification, series, DI), not only arithmetic.
6. A **sectional-timer mock** is a first-class mode.
7. Teach **strategy** (attempt-all vs skip), not just topics.
8. **One engine, data-differentiated** per exam — no per-exam code forks.
9. **Maharashtra-first** content choices (R.S. Aggarwal Marathi edition, MAH CET as flagship).
10. Curate **ruthlessly**; every exam must earn its place against the speed-maths promise.
