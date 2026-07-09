# G-M10 — Authored Logical-Reasoning Bank Localization Certification (ADR-111)

**Scope:** the complete human-authored Logical-Reasoning bank — 92 items across five families (Critical Reasoning 26,
Statement & Argument 16, Cause & Effect 16, Course of Action 16, Decision Making 18) — translated into हिन्दी and मराठी
at textbook quality and served through the REAL drill pipeline (`LRAuthoredEngine.generate` → `LRAuthoredI18n.resolve`).
**Status:** ✅ **CERTIFIED — zero unresolved critical findings.** The i18n feature flag remains OFF.
**Branch:** `claude/quantreflex-product-audit-5d7p2n`.

## 1. Architecture — display-only overlay with an answer-by-index correctness guarantee

Each overlay item carries ONLY display fields — `{ id, stem, options[], explanation }` — keyed by the EN item's
immutable `id`. Every machine/metadata field (`topic`, `subtype`, `difficulty`, `exams`, `tags`, `meta`,
`reviewStatus`, `explanationVersion`, `inspiredBy`) stays on the EN base for every language.

**The correctness guarantee (the crown-jewel property of this milestone):** the translated `answer` is NEVER authored
separately. `LRAuthoredI18n._merge` finds the index of the EN answer within the EN options and derives the translated
answer as the translated option at that same index. Because the overlay's `options` are index-aligned with the EN
options (same length/order — enforced by the check), the correct choice stays the correct choice in every language *by
construction*. The engine's option-shuffle and the drill's string-grading keep working unchanged; an overlay can never
accidentally point the answer at the wrong translated option.

`LRAuthoredEngine._toQuestion` resolves the picked item to the study language before mapping to the drill schema
(guarded; `en`/flag-off is a byte-identical no-op). Adding an item = author it in the EN bank (+ optionally an overlay);
no code or schema change.

## 2. Educational-translation method

Exam-book register per `docs/BIBLE/GLOSSARY_I18N.md` — Hindi आप-form (CAT/XAT/IBPS/SSC vocabulary), Marathi तुम्ही-form
(MPSC/Target register). The keyed option was kept **uniquely most-defensible** in translation, and every distractor was
translated to describe the *actual* option (several EN explanations had drifted references, e.g. mentioning "resigning"
or "coin toss" for options that were really "bypass the manager" / "private promise" — the translations describe the
real option, improving pedagogical accuracy). Numbers, ₹, %, exam acronyms and DNT terms are preserved; the fictional
brand "SolarHome" transliterates to सोलरहोम; times render सुबह/दोपहर/शाम … बजे and सकाळी/दुपारी/संध्याकाळी … वाजता with
Latin digits intact.

## 3. Static verification — `scripts/learn-i18n.check.js` §3

For each of hi and mr, every one of the 92 EN items is validated:

| Check | Result |
|---|---|
| Display-only (no forbidden fields overlaid) | ✅ |
| Options index-alignment (count parity with EN) | ✅ |
| Digit-multiset preservation (per stem/option/explanation; no Devanagari numerals) | ✅ |
| Latin-leak heuristic over translated strings | ✅ |
| Merged-view passes the item schema (answer ∈ translated options, lengths, no placeholders) | ✅ |
| Coverage | **hi 92/92, mr 92/92** |

Full `npm test` suite green (all scripts, 0 failures), including the untouched `lr-authored.check.js` over the EN bank.

## 4. Runtime correctness proof

A node smoke test resolved all 92 items in en / hi / mr:

- **en:** `resolve()` is a byte-identical no-op (returns the base object); answer ∈ options 92/92.
- **hi:** answer ∈ options **92/92**; stem Devanagari **92/92**; no Devanagari numerals **92/92**; index-mismatch 0.
- **mr:** answer ∈ options **92/92**; stem Devanagari **92/92**; no Devanagari numerals **92/92**; index-mismatch 0.

This proves the answer-by-index derivation lands on a real, correct translated option for every item in every language.

## 5. Playwright drill-DOM certification

`i18n-phaseG-authored.js` loads the REAL `i18n.js` + all three catalogs + schema + all five EN banks + the resolver +
all ten overlays + the engine, and renders one live-generated question **per family** through the drill's own MCQ markup.

| Case | app | study | vw | cards | tap-grade | overflow | Result |
|---|---|---|---|---|---|---|---|
| English (unchanged) | en | en | 360 | 5 | 5/5 | 0 | ✅ |
| aligned | hi | hi | 360 | 5 | 5/5 | 0 | ✅ |
| aligned | mr | mr | 360 | 5 | 5/5 | 0 | ✅ |
| aligned | mr | mr | 820 | 5 | 5/5 | 0 | ✅ |
| **DIVERGED** | en | hi | 360 | 5 | 5/5 | 0 | ✅ |
| **DIVERGED** | en | hi | 820 | 5 | 5/5 | 0 | ✅ |

Every case: content Devanagari (aligned/diverged), no Devanagari numerals, the derived answer IS one of the rendered
options and **tap-grades green**, zero console errors, no overflow at phone (360) and tablet (820).

**The diverged proof (`pg-authored-diverged.png`, eyeballed):** with appLanguage=en and studyLanguage=hi, the drill's
`aria-label` chrome reads English ("Answer options") while all five stems, every option set and every explanation render
in Devanagari — the correct option graded green in each of Critical / Statement / Cause / Course / Decision, with digits
(40%/80%) intact. This is the two-channel architecture (app-chrome vs study-content) proven end-to-end on authored content.

## 6. Review-mode / archive readiness

Authored items already carry `_authoredId` through `_toQuestion`; the resolve happens at generation, so a mistake
captured in one language replays through the same resolve path in the current study language (same immutable id → same
item → current-language render), consistent with the Phase-F mistake-archive policy. No schema change.

## 7. Verdict

**✅ CERTIFIED.** All 92 authored Logical-Reasoning items localize correctly into हिन्दी and मराठी through the real drill
pipeline; the correct answer is preserved by construction; English is byte-identical; app-chrome and study-content
diverge correctly; digit-safety, options-parity, Latin-leak, merged-schema, tap-grading and layout all hold at 360/820
with zero console errors. **No unresolved critical findings.** The feature flag stays OFF until the Phase-H Final
Localization Certification.
