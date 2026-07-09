# F-M6 — LR Generated-Content Localization Certification (ADR-111)

**Scope:** the procedurally-generated Logical Reasoning engine (`js/lr-engine.js`) and its per-language packs
(`locales/gen/{en,hi,mr}.lr.js`) — 12 archetype families × 3 difficulty tiers, rendered in English + हिन्दी + मराठी.
**Status:** ✅ **PRODUCT-CERTIFIED — zero unresolved critical findings.** The feature flag (`QRI18n.ENABLED`) remains
OFF; this certifies the LR content layer for the eventual Phase-H gate, it does not ship it.
**Branch:** `claude/quantreflex-product-audit-5d7p2n`. Interim milestone report; the ADR-111 addendum + Bible bump land
with the Phase-F governance milestone (F-M10).

---

## 1. Engine refactor summary

The LR engine was refactored from an English-hardcoded generator to a **rich-pack architecture**: the engine retains
**all** RNG, math, dataset construction, MCQ distractor selection, the syllogism model-checker, and kinship composition;
every user-visible **string** moved into `locales/gen/<lang>.lr.js`, resolved live via `_P()` = `GI.lrPack() || en`.

- **RNG draw order is preserved exactly.** Localized pools are passed to `_mcq`/`_pick` with the SAME length as EN, so
  for a fixed seed the identical sequence of `Math.random()` draws produces the identical answer, option-index set,
  subtype and difficulty in every language — only the surface wording differs.
- **Kinship generic/specific split.** `_compose2(r1,r2)` returns a **generic English relation-id** (dedup-clean, so EN
  option sets never collapse); `_specifier(combo,r2)` derives the lineage side (pat/mat/sons/daughters/bro/sis); the
  pack's `relTerm(id, spec)` renders the **specific** native word for the answer (मामा/चाचा/नाना; काका/मामा/आजोबा) and
  the **canonical** word for distractors. `relGeneric` stays the English id list in every language.
- **One EN-preserving engine change** beyond string routing: the syllogism sentence terminator moved into the pack
  (`syllo.period`) so hi can use the danda "।" while EN/mr keep ".". EN bytes are unchanged.

**Byte-identity proof:** `scripts/lr-census.js` hashes (djb2) a 4000-sample deterministic output sequence per
category×difficulty. All **36/36** frozen hashes in `fixtures/lr-census.json` reproduce **exactly** after the refactor —
EN generation is provably unchanged.

## 2. LR category coverage (12 families × 3 tiers, EN + HI + MR)

| # | Category | HI | MR | Notes |
|---|---|---|---|---|
| 1 | Coding–Decoding | ✅ | ✅ | cipher substrate (CAT→DBU) stays Latin (DNT); prose localized |
| 2 | Blood Relations | ✅ | ✅ | kinship relTerm — see §3 |
| 3 | Direction Sense | ✅ | ✅ | HI उत्तर-पूर्व compounds; MR Sanskrit intercardinals ईशान्य/आग्नेय/नैऋत्य/वायव्य |
| 4 | Ranking & Ordering | ✅ | ✅ | ordinals HI n+वें, MR n+व्या |
| 5 | Odd One Out | ✅ | ✅ | numeric/letter script-free; word-groups fully translated (12×10) |
| 6 | Analogies | ✅ | ✅ | verbal quads translated (16×5, index-aligned); numeric/letter script-free |
| 7 | Syllogisms | ✅ | ✅ | R.S. Aggarwal (HI) / MPSC (MR) quantifier forms; 40 nouns translated |
| 8 | Letter & Number Series | ✅ | ✅ | Latin/numeric terms; prose localized |
| 9 | Coded Inequalities | ✅ | ✅ | symbol legend + 5 verdicts (by index) |
| 10 | Calendars | ✅ | ✅ | weekdays + months translated |
| 11 | Clocks | ✅ | ✅ | angle/mirror prose localized; times stay H:MM |
| 12 | Input–Output | ✅ | ✅ | sorting-machine narration localized |

`gen-i18n.check §9` reports `lr.hi authored=true, lr.mr authored=true`. Both packs register via `GI.registerLR`.

## 3. Kinship validation matrix

The single highest-correctness-risk area. `scripts/fixtures/lr-kinship.json` is a **hand-written gold-standard truth
table** over **all 36 ordered primitive pairs** (r1,r2 ∈ {father,mother,son,daughter,brother,sister}); `lr-kinship.check.js`
asserts the engine's composition + specifier and every pack's `relTerm` reproduce it exactly.

- **36 pairs** checked (4 logically-ambiguous up-down pairs correctly return null and are skipped) × **3 languages**.
- **Correctness confirmed by composition**, e.g. mother→mother = maternal grandmother → HI **नानी** / MR **आजी**;
  brother→mother = maternal uncle → **मामा** (both); son→sister = sister's son → HI **भांजा** / MR **भाचा**.
- **Language systems are genuinely distinct** (Marathi is NOT a Hindi calque): Hindi splits grandparent lineage
  (दादा/नाना, पोता/नाती); Marathi collapses it (आजोबा, नातू cover both) but splits nephew/niece (पुतण्या/भाचा) and
  uncle/aunt (काका/मामा). Each language's real system is encoded and verified.
- **Option-safety proof:** canonical terms are pairwise-distinct per language, and every specific answer term is proven
  absent from every OTHER generic's canonical set — so a blood-relation MCQ can never silently de-duplicate its answer.

## 4. Cross-language invariance proofs

`gen-i18n.check §11` (the LR behavioural-equivalence gate): for a fixed RNG seed, across en/hi/mr, over
**12 categories × 3 difficulties × 60 seeds = 2160 samples/language**, it asserts identical **subtype**, identical
**option count**, and identical **answer INDEX** (text-MCQ answers are language-specific strings — Daughter/पुत्री/मुलगी
— so correctness is compared by index, never text; numeric answers by value). It also asserts **digit-multiset
preservation** (digits stay 0-9) and, on the authored hi/mr surfaces, **no Latin leak** and **no Devanagari numerals**.
All assertions green. EN byte-identity is proven separately by the exact-hash census (§1).

## 5. Playwright & automated test results

| Check | Result |
|---|---|
| `lr-census.js` (byte-identity) | 36/36 hashes reproduced |
| `lr-engine.check.js` | 28724 passed, 0 failed |
| `lr-kinship.check.js` | 36 pairs × {en,hi,mr}, option-safety — passed |
| `gen-i18n.check.js` (§11 invariance + §9 coverage) | passed |
| `di-engine.check.js` (EN pin unaffected) | 15228 passed, 0 failed |
| **Full `npm test` suite** | **ALL GREEN** (38 check scripts) |
| Playwright LR sweep (`i18n-phaseF-lr.js`) | 6/6 viewport configs PASS |

The Playwright sweep renders **72 live-generated cells** (all 12 categories × 3 tiers × hi/mr) into a drill-like card
DOM with the real bundled Devanagari face. Per cell it asserts no card/stem/option overflow, Devanagari present (where
translatable prose exists), no Devanagari numerals, and — for all **46 MCQ cells** — that clicking the correct option
tap-grades correct.

## 6. Responsive validation

All 6 configurations PASS with `bodyOverflow = 0` and zero clipped cards/stems/options:

| Config | Viewport | Result |
|---|---|---|
| phone-portrait | 360×800 | PASS |
| phone-landscape | 740×360 | PASS |
| tablet-portrait | 820×1180 | PASS |
| tablet-landscape | 1180×820 | PASS |
| desktop | 1280×900 | PASS |
| TWA-narrow | 320×640 | PASS |

Long stems (coded inequalities, input-output, coded blood relations) wrap cleanly; option grids reflow to a single
column below 420px. Screenshots (phone-portrait, tablet-landscape, and a focused clip of the complex categories) were
eyeballed — Devanagari matra/conjunct shaping (क्या, न्या, ष्ट, त्र, ळ) renders correctly with no overlap or clipping.

## 7. Accessibility & performance verification

- **Font:** `document.fonts.check('14px "Noto Sans Devanagari"')` returns true on every viewport; Devanagari renders in
  the bundled face, not a fallback.
- **Digits:** every stem/option carries 0-9 digits only (Devanagari-numeral detector clean) — screen readers and
  numeric parsing stay consistent across languages.
- **Interaction:** MCQ options are real focusable buttons; tap-grading verified for all 46 MCQ cells.
- **Offline:** LR generation is fully client-side; the study-language packs are SW-precached (`hi.lr.js`, `mr.lr.js` in
  `service-worker.js` ASSETS) and lazy-loaded via `QRPacks.ensure` — questions generate offline in any language.
- **Performance:** full 72-cell render + font load ≤ **170 ms** on every viewport (well within budget). The engine does
  zero extra RNG work per language; pack lookup is a single object deref (`_P()`).

## 8. Glossary additions

`docs/BIBLE/GLOSSARY_I18N.md` gained the **LR generated-content vocabulary** section: the full kinship generic→hi→mr
`relTerm` table (with the दादा/नाना vs आजोबा distinction documented), directions (incl. MR Sanskrit intercardinals),
syllogism + inequality verdicts, quantifier forms, and the HI/MR grammar-engineering notes (gender-safe possessive
frames, marker/copula maps, ordinal suffixes, the appositive dash frame, Latin `km`). One concept = one rendering.

## 9. Remaining documented limitations (all intentional, none critical)

Recorded in `docs/BIBLE/I18N_KNOWN_LIMITS.md` (Phase F-M6 section):
1. **Syllogism noun number-agreement** — a single plural-neutral noun form under every quantifier is a mild, logic-
   neutral approximation (the model-checker runs on A/B/C/D scaffolds, never the surface nouns).
2. **Marathi grandparent/grandchild lineage collapse** — intentional (आजोबा/नातू cover both sides); Marathi's real
   kinship system, encoded and verified in the truth table, not a missing Hindi distinction.
3. **Latin cipher/variable/symbol/km tokens** — cipher substrates, single variable letters, coded symbols, Roman
   numerals, and the unit `km` stay Latin by exam-book convention (allowlisted by the leak heuristic).
4. **Per-language sentence terminator** — EN/MR ".", HI danda "।" (EN-preserving; census unaffected).

## 10. Final production-readiness verdict

**✅ CERTIFIED for the Phase-H gate.** The LR generated-content layer renders in English, Hindi and Marathi with:
- provably unchanged English (36/36 exact-hash census);
- 100 % behavioural equivalence across all three languages (subtype/option-count/answer-index/digit-multiset over 2160
  samples/language);
- exhaustively-verified kinship correctness (36-pair truth table × 3 languages, option-safety proven);
- first-class, exam-register Hindi and Marathi (Marathi authored from its own kinship/direction systems, not calqued);
- zero layout/overflow/rendering regressions across 6 device configurations with correct Devanagari shaping;
- offline parity and ≤170 ms render.

**No unresolved critical findings.** Cleared to proceed to F-M7 (LR-visual). The feature flag stays OFF until Phase H.
