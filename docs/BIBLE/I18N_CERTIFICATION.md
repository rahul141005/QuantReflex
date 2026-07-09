# QuantReflex Internationalization — Final Localization Certification (ADR-111, Phase H)

**Verdict:** ✅ **CERTIFIED — zero open critical findings.** Localization into English + हिन्दी + मराठी is release-ready
**pending two explicit gates that remain the user's to close** (see §10): (1) the live-AI manual matrix, which cannot be
run in this environment, and (2) the user's go-ahead to flip the feature flag. **The feature flag was NOT flipped;** it
remains `QRI18n.ENABLED = false` / `I18N_ON = false`. No merge to `main` and no production-facing change was made.

**Branch:** `claude/quantreflex-product-audit-5d7p2n`. **Bible:** 2.143. **SW:** v223 (unreleased).
**Audit stance:** adversarial — every phase was treated as a claim to be falsified, including fresh-eyes subagent review
of the Hindi and Marathi content by reviewers who did not author it.

---

## 1. Scope certified

End-to-end, across every user-facing surface and both target languages:

- **Generated content:** Quant (36 categories), DI (5), LR (12), LR-visual (27 explanations) — Phase F.
- **Study library:** Learn KB (62 topics), Quick-Reference (21 cards), authored-LR bank (92 items), auto-tips (85) — Phase G.
- **App chrome:** nav, home, practice, drill, stats, settings, auth/onboarding, About, App Guide, all modals, duel,
  planner, companion — Phases A–E (421 tagged static nodes in index.html: 309 `data-i18n` + 20 `-attr` + 92 `-html`).
- **Mistake Archive**, **server/AI seam** (QuanAI, notifications), **offline/sync/analytics/billing/entitlement**.
- Aligned (app=study) and **diverged (app≠study)** language scenarios, at phone / tablet / desktop viewports.

## 2. English byte-identity (release invariant)

The master flag is OFF; `setLanguages()` hard-coerces both channels to `en`. Proven adversarially in a **fresh Node
process with preview never set** (`cert-proofs.js` §A): `setLanguages('hi','mr')` → `appLang='en'`, `studyLang='en'`;
`t()`/`tc()` return the EN catalog value verbatim for every sampled key. Content overlays are no-ops at `en`
(`resolve()` returns the base object; verified byte-identical for KB / quick-ref / authored-LR / generated engines in the
Phase F/G harnesses). **Existing English users see exactly today's product.**

## 3. Automated correctness proofs — `cert-proofs.js` (15/15 pass)

| Proof | Result |
|---|---|
| Catalog key-set parity en/hi/mr | ✅ **1662** flat keys identical across all three |
| EN byte-identity (flag OFF, fresh process) | ✅ t()/tc() = EN value; app+study coerced to en |
| Plural integrity (14 plural keys × 0/1/2/5 × 3 langs) | ✅ all resolve; no literal `{count}` |
| Interpolation integrity (all `{token}` keys × 3 langs) | ✅ no literal `{token}` after substitution |
| No Devanagari numerals (०-९) in hi/mr catalogs | ✅ none |
| Locale tags | ✅ en-IN / hi-IN-u-nu-latn / mr-IN-u-nu-latn (digits pinned 0-9) |
| 3×3 app/study switch matrix | ✅ **9/9** cells — chrome follows app channel, content follows study channel |
| Persistence / reload | ✅ fresh QRI18n boots; setLanguages survives |

## 4. Rendered-DOM zero-untranslated audit

- **App chrome — `cert-chrome.js`: ALL CLEAN.** The REAL index.html body (all 421 i18n tags, app-boot scripts stripped)
  was rendered through `QRI18n.applyDom` under aligned hi and mr, and every text node + `aria-label`/`placeholder`/
  `title`/`alt` was walked: **0 Latin leaks, 0 Devanagari numerals, 0 literal `{tokens}`, EN-restore byte-identical**
  (after normalising the persistent `data-i18n-orig*` stash attributes). The diverged app=en case is intentionally
  English chrome (chrome follows the app channel) and is covered by the content harnesses, not here.
- **Study content — Phase-G harnesses (re-run this phase, all pass):** `i18n-phaseG-kb.js` (9 KB topics: overview /
  concept / formula / table / example / memory / revision), `i18n-phaseG-quickref.js` (21 cards, phone/tablet/desktop),
  `i18n-phaseG-authored.js` (5 authored-LR banks). Each: content Devanagari, digits 0-9, formulas/`expr` preserved,
  **diverged app=en/study=hi** proven (English chrome over Devanagari content), bilingual search, answer-by-index
  tap-grade, EN restore byte-identical, 0 console errors, no overflow at 360/820/1280.
- **Generated content — Phase-F harnesses:** Quant/DI/LR/LR-visual through the real drill DOM + DICharts/LRFigures, incl.
  the diverged case and the digit-multiset / render-purity / kinship-truth-table guards (`gen-i18n.check`, `lr-kinship.check`).
- **Toast/notification sink grep:** no raw-English `showToast(...)` literals outside `t()/tc()` — all user toasts routed.

## 5. Adversarial content review (fresh eyes, not the author)

Two independent subagents (Hindi, Marathi) reviewed every study-content file cell-by-cell against its EN twin — terminology
(Arihant/R.S. Aggarwal for hi; K'Sagar/Target/MPSC for mr), grammar (आप-/तुम्ही-form, gender/agreement), math/digit/DNT
integrity, and — the release-blocking category — **answer-correctness** (does the keyed-correct option stay uniquely
defensible in translation?).

- **CRITICAL: none.** Authored-LR answer-correctness is protected by construction (options are index-aligned; the resolver
  derives the answer by index) AND was verified item-by-item by the reviewers. Every worked example re-derives its stated
  answer in both languages. No dropped/altered digits, no corrupted formulas, no Devanagari-numeral leaks.
- **MAJOR: 1, fixed** — mr `lr-nonverbal-images` used the nonstandard "खाल" for "bottom" (water-image rule); corrected to
  "खाली" throughout (5 sites). Re-verified.
- **MINOR: 7, all fixed** — hi mensuration scaling verb (मापित→गुना/समानुपाती/अनुपात में, 7 strings); hi `cr-par-002`
  अगिनत→"बिना गिने रह गए"; mr di-pie पाय/नांगर calques → वर्तुळ/संदर्भबिंदू; mr di दुर्लक्षा/दुर्लक्षायला → दुर्लक्ष करा/करायला;
  mr `CAT वर्बल`→`CAT शाब्दिक` (searchTerm); mr quick-ref probability कॅट→पत्ते. All re-verified green by `learn-i18n.check`.

Post-fix, both reviewers' surfaces are clean; `learn-i18n.check` passes with hard coverage gates: **KB 62/62, quick-ref
21/21, authored-LR 92/92** in both hi and mr (congruence / forbidden-field / digit-multiset / Latin-leak / options-parity
/ merged-schema).

## 6. Findings ledger (this phase)

| # | Sev | Surface | Finding | Resolution |
|---|---|---|---|---|
| 1 | MAJOR | mr lr-nonverbal-images | "खाल" (nonstandard) for bottom | Fixed → "खाली" (5 sites); re-verified |
| 2 | MINOR | hi mensuration (area/volume) | "मापित होता है" (measured) for "scales by" | Fixed → गुना/समानुपाती/अनुपात में (7 strings) |
| 3 | MINOR | hi critical cr-par-002 | "अगिनत" nonstandard | Fixed → "बिना गिने रह गए" |
| 4 | MINOR | mr di di-pie / speed-math | पाय/नांगर literal calques | Fixed → वर्तुळ (पाई) / संदर्भबिंदू |
| 5 | MINOR | mr di di-foundations/bar-line | दुर्लक्षा/दुर्लक्षायला wrong verb form | Fixed → दुर्लक्ष करा/करायला |
| 6 | MINOR | mr lr searchTerms | `CAT वर्बल` transliteration | Fixed → `CAT शाब्दिक` |
| 7 | MINOR | mr quick-ref probability | "कॅट" casual for deck | Fixed → "पत्ते" |
| 8 | MINOR (a11y) | auth logo | `alt="QuantReflex Logo"` not localized | Fixed → `data-i18n-attr` + `auth.logoAlt` (en/hi/mr) |

All eight findings are **CLOSED**. No finding remains open.

## 7. Non-localization regression (offline / sync / analytics / billing / achievements / coaching / Firestore / user data)

The localization is **purely additive** — display overlays keyed by immutable id, plus flag-gated chrome — and the master
flag coerces both channels to `en` when off, so pre-launch behaviour is byte-identical. Every subsystem's own check is
green in the full suite (**`npm test`: 13,212 assertions across 41 scripts, 0 failures**), specifically: quota/billing
(`quota-policy`, `daily-limit`, `entitlement-parity`, `free-explain`), notifications (`notifications`, `ai-lang`),
reporting (`report`), auth (`auth-validators`, `ensure-profile`), sync/archive (`mistake-archive` — merge-by-id offline↔cloud),
knowledge/planner/AI-cost, and the update/SW lockstep (`update`, `i18n.check` §5). Machine data (ids, `expr`, `related`,
Firestore field names, deep-links, chip `value` codes, error codes) is never translated (enforced). **No localization
regression detected in any non-localization subsystem.**

## 8. Layout / typography / responsive / accessibility

- **Overflow:** every harness asserts `scrollWidth − clientWidth ≤ 2` on body and cards at 360 / 820 (and 1280 for
  quick-ref). No horizontal overflow in any surface × language × viewport.
- **Typography:** bundled Noto Sans Devanagari (data-URI in harnesses); matra/conjunct shaping eyeballed in screenshots
  for KB topics, quick-ref grid, authored-LR drill, chrome — clean.
- **Accessibility:** `cert-chrome` walks and clears `aria-label`/`placeholder`/`title`/`alt` — all localized. `html lang`
  reflects the app language; toast regions are `aria-live`; focus order unaffected (string-length only). One documented
  non-blocking a11y limitation (§9: study-content container `lang` in the diverged case).

## 9. Known limitations — classified

Every entry in `docs/BIBLE/I18N_KNOWN_LIMITS.md` was validated to still hold. **All are INTENTIONAL / non-blocking.**
Highlights:

- **Symbolic machine fields stay English/notation:** formula `expr` strings + numeric table cells (frozen), math symbols
  and single-letter variables in tips, ids / `related` / cross-links / `searchTerms` machine role, cipher substrates,
  Roman I/II labels, DNT tokens (product/exam/unit/URL). — *math notation, not language.*
- **JS-composed dynamic fields:** `#settingsUserStatusMessage` (plan) and `#aboutVersionLine` (version) carry an English
  static placeholder but are localized at render by settings.js via already-localized keys (`settings.planFree` /
  `settings.versionLine`); they are deliberately un-tagged because tagging would reset the live value. — *localized in practice.*
- **Server/stored language snapshots:** SW push fallback constants; inbox notifications delivered before a language switch;
  planner LLM prose stored in a plan until "Rebuild"; mistakes captured before Phase F replay in their captured language;
  word-problem bank items in their stored language; EN entries in the shared explain cache (per-language siblings exist).
- **NEW this phase (non-blocking, fast-follow recommended):** **study-content container `lang` in the diverged case.**
  `html lang` follows the app language; in the diverged app=en/study=hi setting a screen reader voices Devanagari study
  content with the app-language voice (WCAG 3.1.2 "Language of Parts", AA). Impact is bounded — diverged is an opt-in
  power-user setting and this affects screen-reader users only; the aligned majority and all chrome are correct. Recommended
  fast-follow: set `lang=studyLanguage` on the drill question, Learn topic body, quick-ref host and companion envelope. Not
  release-blocking.

## 10. Gates that remain open (the user's to close)

1. **Live-AI manual matrix (H-M8) — could not be executed here** (no live model API key in this environment). The server
   language seam is proven correct by `ai-lang.check` (byte-identical `sys()` EN snapshot; hi/mr directive + DNT list;
   `_explainCacheId` EN-identical + `_hi`/`_mr` siblings; per-action lang threading; gate-order checksum) and the Phase-E
   fixture harness. **Before the flag flips, run ≥3 samples each of explain / coach / insights / chat / planner in hi and
   mr against the real API** and confirm: prose language + register, DNT preservation, no script-mixing, JSON intact, cache
   round-trip. This is a required manual step, not a code defect.
2. **Feature-flag flip + release — awaiting explicit user go-ahead.** Not performed. When approved, the flip is one commit
   (`QRI18n.ENABLED = true` + inline `I18N_ON = true`, kept in lockstep by `i18n.check` §5) riding SW v223; then a flag-on
   smoke pass without the preview override; then governance (Bible 2.144 + release entry). Merge to `main`/production only
   on the user's explicit instruction.

## 11. Rollback runbook

Rollback is one revert commit (both flags → `false`) + SW bump + redeploy. User-persisted `appLanguage`/`studyLanguage`
become inert (flag-off hard-coerces both channels to `en` — built and covered by `i18n.check` §7). Catalogs/packs stay
cached but unused (harmless); Firestore hi/mr cache docs remain (inert). No data migration, no destructive step.

## 12. Overall risk assessment

**LOW.** English byte-identity is proven and mechanically guarded; the feature is fully behind an OFF flag with a clean
one-commit rollback; content correctness (especially authored-LR answers) is protected by construction and verified by
adversarial fresh-eyes review; 13,212 automated assertions + rendered-DOM detectors + per-surface Playwright (incl.
diverged, all viewports) are green with zero open critical findings. The only residual items are (a) the live-AI manual
matrix, which is a required pre-flip manual step the environment cannot automate, and (b) one non-blocking diverged-case
a11y refinement. **Recommendation: the localization is release-ready; flip the flag only after the live-AI matrix passes
and with explicit go-ahead.**

---

*Evidence scripts (scratchpad, re-runnable): `cert-proofs.js`, `cert-chrome.js`, `i18n-phaseG-kb.js`,
`i18n-phaseG-quickref.js`, `i18n-phaseG-authored.js`, plus the Phase A–F harnesses. Per-milestone certifications:
`I18N_GM9_QUICKREF_CERTIFICATION.md`, `I18N_GM10_AUTHORED_LR_CERTIFICATION.md`, `I18N_GM12_PHASE_G_CERTIFICATION.md`,
`I18N_FM9_CROSSENGINE_CERTIFICATION.md`.*
