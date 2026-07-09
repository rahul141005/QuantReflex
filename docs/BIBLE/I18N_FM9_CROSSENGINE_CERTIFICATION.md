# F-M9 — Comprehensive Cross-Engine Playwright Certification (ADR-111)

**Scope:** the complete Phase-F generated-content surface — Quant, DI, LR and LR-visual — validated together in one run
through the REAL `js/i18n.js` and the REAL renderers (`DICharts`, `LRFigures`), in the drill's own question markup.
**Status:** ✅ **CERTIFIED — zero unresolved critical findings.** The i18n feature flag remains OFF.
**Branch:** `claude/quantreflex-product-audit-5d7p2n`.

The per-engine milestones (F-M2…M4 Quant, F-M5 DI, F-M6 LR, F-M7 LR-visual) each certified their engine in isolation.
F-M9 proves they compose correctly in the actual render path, and — its unique contribution — proves the **diverged
app/study language case**: chrome in one language, generated content in another, simultaneously in the same DOM.

## 1. Method

`i18n-phaseF-full.js` loads the REAL `i18n.js` + all three catalogs (so chrome strings resolve via `QRI18n.t()` at the
APP language) + the real `DICharts` / `LRFigures` renderers, and renders live-generated questions (one per engine
family, all three languages) using a faithful reproduction of the drill's question markup (chart → figure → `h2`
question-text → MCQ buttons `data-opt` / numpad input placeholder). It drives `QRI18n.setLanguages(app, study)` under
the preview flag and asserts, per cell: content Devanagari with 0-9 digits (no Devanagari numerals), DI chart SVG text
localized, options tap-grade (`data-opt === answer`), no overflow, zero console errors — plus the chrome-language check.

## 2. Results (6 cases × 4 engine families)

| Case | app | study | Chrome (`drill.yourAnswer`) | Content | tap-grade | Result |
|---|---|---|---|---|---|---|
| **DIVERGED** @360 | en | hi | **"Your answer"** (EN) | Devanagari | 3/3 | ✅ |
| **DIVERGED** @820 | en | hi | **"Your answer"** (EN) | Devanagari | 3/3 | ✅ |
| aligned @360 | hi | hi | "आपका उत्तर" (HI) | Devanagari | 3/3 | ✅ |
| aligned @360 | mr | mr | "तुमचे उत्तर" (MR) | Devanagari | 3/3 | ✅ |
| aligned @820 | mr | mr | "तुमचे उत्तर" (MR) | Devanagari | 3/3 | ✅ |
| English (unchanged) | en | en | "Your answer" (EN) | English | 3/3 | ✅ |

Every case: `bodyOverflow = 0`, zero console errors, no Devanagari numerals, DI chart text Devanagari in the hi/mr runs.

## 3. The diverged-language proof

With **appLanguage = en** and **studyLanguage = hi**, the same DOM shows the numpad placeholder / options-aria in
**English** ("Your answer") — driven by `QRI18n.t()` on the app channel — while every question stem, option, explanation
and DI chart label renders in **Devanagari** — produced by the engines on the study channel. This is the two-channel
architecture (ADR-111 appLanguage vs studyLanguage) proven end-to-end across all four engines at once. The eyeballed
screenshot shows it directly: Percentages / Ratios / DI-bar / LR-blood / LR-syllogism / LR-visual-mirror all in Hindi
with an English "Your answer" chrome, options tap-graded green.

## 4. Cross-engine coverage in one render path

- **Quant** (Percentages, Ratios word-problem): Devanagari stem + explanation, numpad chrome, 0-9 digits, ₹ preserved.
- **DI** (bar): localized chart title / axis / entity labels (जनसंख्या, कर्नाटक…) with 0-9 values, localized stem.
- **LR** (Blood, Syllogism): Devanagari stems + native option terms, tap-grade on the correct index.
- **LR-visual** (Mirror): SVG prompt + SVG option-figures, letter-badged buttons, tap-grade on the mirror option.

All rendered through the real `DICharts.render` / `LRFigures.render` and the drill's own markup — proving the renderers
and the drill DOM handle localized content with no regression.

## 5. Verdict

**✅ CERTIFIED.** The four Phase-F engines compose correctly in the real render path; app-chrome and study-content
diverge correctly across every engine; English is unchanged; layout, tap-grading, chart localization, digit-safety and
console-cleanliness hold at 360 and 820. **No unresolved critical findings.** This completes the Phase-F generated-content
Playwright certification; the feature flag stays OFF until Phase H.
