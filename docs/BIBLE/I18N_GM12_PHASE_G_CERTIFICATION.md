# G-M12 — Phase-G Learn-Library Playwright Certification (ADR-111)

**Scope:** the complete Phase-G study-content surface — the 62-topic Learn knowledge base, the 21-card Quick-Reference
library, the 92-item authored Logical-Reasoning bank, and the 85 auto-tips — verified through their REAL render paths in
हिन्दी and मराठी.
**Status:** ✅ **CERTIFIED — zero unresolved critical findings.** The i18n feature flag remains OFF.
**Branch:** `claude/quantreflex-product-audit-5d7p2n`.

## 1. Method

Phase G is certified by three complementary Playwright harnesses, each loading the REAL `js/i18n.js` + all three
catalogs and the real renderers, driving `QRI18n.setLanguages(app, study)` under the preview flag:

1. **`i18n-phaseG-kb.js` (this milestone)** — Learn KB topics through `KnowledgeBase.get` (study-language merged view) →
   `BlockRenderers`, plus the bilingual `LearnSearch` index and an auto-tip reveal. 9 representative topics spanning
   every category family (number-system, percentages, profit-loss, linear-equations, permutation-combination,
   geometry-basics, area, di-bar-line, lr-blood-relations) — overview / concept / formula / table / example / memory /
   revision blocks.
2. **`i18n-phaseG-quickref.js` (G-M9)** — the 21-card Quick-Reference library through `QuickRef.render`.
3. **`i18n-phaseG-authored.js` (G-M10)** — the authored-LR bank through `LRAuthoredEngine.generate` → `LRAuthoredI18n`.

## 2. Learn-KB results (G-M12)

| Case | app | study | vw | topics | overflow | Result |
|---|---|---|---|---|---|---|
| English (unchanged) | en | en | 360 | 9 | 0 | ✅ |
| aligned | hi | hi | 360 | 9 | 0 | ✅ |
| aligned | hi | hi | 820 | 9 | 0 | ✅ |
| aligned | mr | mr | 360 | 9 | 0 | ✅ |
| **DIVERGED** | en | hi | 360 | 9 | 0 | ✅ |
| **DIVERGED** | en | hi | 820 | 9 | 0 | ✅ |
| EN restore | en | en | 360 | 9 | 0 | ✅ |

Per topic (aligned/diverged): title + block content Devanagari; **no Devanagari numerals** (digits stay 0-9); formulas
/ `expr` present in the merged view unchanged; block-chrome section labels follow the app language; no overflow; zero
console errors. The eyeballed 820px screenshot (`pg-kb-hi.png`, full 9-topic render) shows overview prose, formula
blocks, tables, worked examples, trap/mistake callouts, memory hooks and revision points all rendering correctly in
Hindi with symbols and digits intact.

- **Bilingual search:** an English query (`"percentage"`) AND a language query (hi `"प्रतिशत"`, mr `"शेकडेवारी"`) both
  return topic hits — the search index carries EN + translated `searchTerms`.
- **Tip reveal:** `QRI18n.tc('tips.cat_percentages')` returns Devanagari under study=hi/mr.
- **EN restore:** re-rendering all 9 topics in English after switching to hi/mr yields byte-identical HTML to the first
  English render.

## 3. Quick-Reference (G-M9) — see I18N_GM9_QUICKREF_CERTIFICATION.md

21/21 cards; phone/tablet/desktop + diverged; bilingual search; card `id` stability (bookmarks/AI-reco/spaced-revision
schema-stable); 0 overflow, 0 console errors. CERTIFIED.

## 4. Authored-LR (G-M10) — see I18N_GM10_AUTHORED_LR_CERTIFICATION.md

92/92 items across five families; answer-by-index correctness guarantee; 5 banks × en/hi/mr + diverged; tap-grade 5/5
per case; 0 overflow, 0 console errors. CERTIFIED.

## 5. Auto-tips (G-M11)

85/85 tips × en/hi/mr; EN byte-identical to the `getAutoTip` maps; `tc()` returns Devanagari for hi/mr and English for
en; i18n.check parity + no-Latin-leak green.

## 6. Static verification

`npm test` full suite green, including `scripts/learn-i18n.check.js` (KB 62/62, quick-ref 21/21, authored-LR 92/92 in
both languages — congruence / forbidden-field / digit-multiset / Latin-leak / merged-schema / options-parity) and
`scripts/i18n.check.js` (tips parity + no-leak). Legacy `learn-content.check.js`, `quick-ref.check.js`,
`lr-authored.check.js` untouched and green.

## 7. Verdict

**✅ CERTIFIED.** Every Phase-G study-content surface localizes correctly into हिन्दी and मराठी through its real render
path; English is byte-identical; app-chrome and study-content diverge correctly; bilingual search, digit-safety,
formula preservation, EN restore, responsive layout and console-cleanliness hold at 360/820 with zero console errors.
**No unresolved critical findings.** The feature flag stays OFF until the Phase-H Final Localization Certification.
