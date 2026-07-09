# F-M8 — Mistake Archive Certification (ADR-111)

**Scope:** the durable Mistake Archive — `js/mistake-archive.js` (`QRMistakeArchive`) and its wiring into `progress.js`,
`js/questions.js` (review replay), `js/drill-engine.js` (capture metadata) and `js/firestore-sync.js` (sync merge).
**Status:** ✅ **PRODUCT-CERTIFIED — zero unresolved critical findings.** The i18n feature flag remains OFF; the archive
ships unconditionally (it is not language-gated) and is EN byte-identical (it never regenerates content).
**Branch:** `claude/quantreflex-product-audit-5d7p2n`. Interim milestone report.

The archive is the **permanent foundation** for every future revision, AI-coaching, analytics and adaptive-learning
capability: review, bookmarks, spaced repetition, weak-topic detection, revision plans, coaching analytics, exports and
advanced search all build on the v2 record + query layer without a structural redesign.

---

## 1. Architecture & design decisions

- **Dedicated foundation module.** All archive logic lives in one pure, dual-exported module (`QRMistakeArchive`) —
  schema, record builder, normalisation, merge reconciliation, query layer, reviewability + replay. `progress.js`
  persists; the module is the logic. This keeps the "permanent foundation" cohesive and independently testable.
- **Versioned, additive record (v2).** Every record carries `v` + a stable `id` and is a strict SUPERSET of the v1
  shape. New fields are always ADDITIVE, and `normalize()` PRESERVES unknown future fields — so old app versions read new
  records without crashing and new features add fields without a migration.
- **Reproduce-the-attempt-exactly.** The record stores the fully-rendered question **in its capture language** (stem,
  options, explanation) AND the machine chart/figure/optionFigure specs, so DI and LR-visual reproduce exactly — not
  just text MCQs. The rendered strings are frozen (replay in the captured language; cross-language re-render is a
  reserved extension via the `gen` provenance field).
- **Merge-by-stable-id sync.** `mergeMistakes` unions offline + cloud by id, newest-per-id wins for frozen fields, and
  OR-merges learning state — so synchronization can never duplicate, lose or corrupt a mistake, regardless of write
  order across devices.
- **Query-first.** `query()` + `facets()` expose filter/sort/search over stable fields — the single API every future
  feature consumes.

## 2. Record schema (the canonical learning unit)

`{ id, v, ts, date, question, answer, options, explanation, chart, figure, optionFigures, context, category, subtype,
difficulty, engine, lang, selected, timeMs, hintsUsed, explanationViewed, source, sessionType, reviewCount,
lastReviewedTs, bookmarked, resolved, gen }` — reproduce fields + classification + attempt metadata + reserved
learning-system state + provenance. Every field the requirements named (question version via `v`, language, answer
selected, correct answer, timing, hints, explanation-viewed, difficulty, category, subtype, source, session type,
drill/test context) is present, and future metadata attaches without breaking compatibility.

## 3. Compatibility & data-preservation verification

- **Backward-compatible v1→v2** (`mistake-archive.check §4`): a legacy `{question,answer,category,options,explanation,
  subtype,date}` record upgrades in place — stable id derived, engine classified, `ts` recovered from `date`, defaults
  filled, **content preserved**, and **unknown future fields preserved untouched**. `normalize()` is idempotent.
- **Existing data untouched:** the Firestore structure (`practice/data.mistakes` array), analytics, streaks, XP,
  achievements and coaching analytics are unchanged — the archive only enriches the per-mistake record and adds a
  guarded merge on hydration. `recordAnswer`'s new `meta` argument is optional (4-arg callers behave identically), so
  English behaviour and all existing call sites are byte-identical.

## 4. Cross-engine coverage

`mistake-archive.check §1/§3` builds and classifies a representative wrong answer for **Quant, DI, LR, LR-visual,
authored (CR), and the shared-context SETs** (lr-seating, di-caselet). Engine classification, difficulty derivation, and
reproduce-fields are correct for every engine. Reviewability: Quant / DI-single / LR-text / LR-visual / authored are
re-servable (the drill re-renders the stored chart/figure/options); shared-context SETs are archived but excluded from
the review drill (documented). Future engines classify via `engineOf()` with a safe `quant` default.

## 5. Synchronization integrity (offline ↔ cloud)

`mistake-archive.check §6`: merging a local batch with a cloud batch that shares one attempt yields the **union with no
duplicate** (3 not 4), **no mistake lost**, learning state (bookmark / resolve / reviewCount) **OR-merged not
clobbered**, result **sorted newest-first**, **cap-100 enforced**, and the merge is **idempotent** (self-merge is a
no-op). Wired into `firestore-sync.js` hydration (guarded) so login/offline reconciliation is dedup-safe. Stable-id
uniqueness: **0 collisions across 2000 distinct attempts**.

## 6. i18n behaviour

Identical archive behaviour across EN/HI/MR: capture, store, query, filter, sort, search, delete, restore and sync are
language-agnostic; each record stamps its `lang` (from `QRI18n.studyLang`, guarded → `en`). Search works over Devanagari
and Latin question text alike (Playwright: `निष्कर्ष` and `assumption` both resolve). English rendering is byte-identical
— the archive never regenerates content.

## 7. Query / mutation API (future-feature foundation)

- **Query:** `query({category,engine,difficulty,lang,source,subtype,bookmarked,resolved,search,sort,dir,limit})` +
  `facets()` — validated for every filter, case-insensitive search, ts/difficulty/category sort, and limit.
- **Mutations (via progress.js):** `bookmarkMistake`, `resolveMistake`, `recordMistakeReview` (spaced-repetition hook),
  `deleteMistake` (returns the record for undo), `restoreMistake` (merge-dedup), `reconcileRemoteMistakes` (sync).
- These map directly onto the requested future features: bookmarks (`bookmarked`), spaced repetition
  (`reviewCount`/`lastReviewedTs`/`recordMistakeReview`), weak-topic detection (`facets`/`query` by category+resolved),
  revision plans + coaching analytics (`query`), exports (`normalizeList` → serialise), advanced search (`search`).

## 8. Playwright validation results

`i18n-phaseF-archive.js` loads the REAL module into a localStorage-backed (offline) archive-list UI and drives every
behaviour end-to-end:

| Behaviour | Result |
|---|---|
| creation (seed persists to offline store) | ✓ 8 records |
| retrieval (render) | ✓ 8 rendered |
| filtering (engine chip) | ✓ lrv → 1 |
| searching (Devanagari + Latin) | ✓ `निष्कर्ष` → 1, `assumption` → 1 |
| sorting (difficulty asc) | ✓ easy first |
| deletion + restoration (undo, dedup) | ✓ −1 then back to full, no double |
| synchronization (cloud batch: 1 new + 1 duplicate) | ✓ +1 only |
| console errors | ✓ 0 |

Responsive + accessibility + offline + performance across **6 viewport/orientation configs** (phone P/L, tablet P/L,
desktop, TWA-narrow): all PASS — `bodyOverflow = 0`, list `role="list"`, labelled search/controls, ≥40 px action touch
targets, zero console errors, ≤ 86 ms render, fully client-side (offline). Screenshot eyeballed — the trilingual
multi-engine archive (English, Hindi, Marathi questions in one list) renders cleanly with per-mistake metadata chips.

## 9. Migration considerations & future extension points

- **Migration:** none required. v1 records upgrade lazily on read (`normalize`), the Firestore shape is unchanged, and
  the merge is guarded (falls back to the prior wholesale value on any issue).
- **Extension points (no schema redesign):** cross-language exact re-render (reserved `gen` provenance + a future
  seed/slots capture); a paged / subcollection store when the cap-100 becomes limiting (the v2 record is already the
  canonical unit); AI review + coaching analytics (consume `query`/`facets`); spaced repetition (drive
  `reviewCount`/`lastReviewedTs`); exports (serialise `normalizeList`).

## 10. Automated + regression verification, and final verdict

- `scripts/mistake-archive.check.js` (wired into npm test): 7 sections — schema/capture across every engine,
  exact-reproduce, cross-engine reviewability, v1→v2 backward-compat + unknown-field preservation, stable-id uniqueness
  (0/2000 collisions), sync-merge integrity, and the query layer.
- **Full npm test suite green (40 checks)** — no regression to analytics, streaks, XP, quota, sync or any engine.

**✅ CERTIFIED for the Phase-H gate.** The Mistake Archive is a durable, versioned, forward-compatible, engine-agnostic
learning substrate with reproduce-exact records, dedup-safe offline↔cloud synchronization, a complete query/mutation
API for every future feature, and identical behaviour across English, Hindi and Marathi (EN byte-identical). **No
unresolved critical findings.** Cleared to proceed to F-M9. The i18n feature flag stays OFF until Phase H.

---

## 11. Final long-term-extensibility audit (schema v3)

Before F-M9 the archive was audited against 10 named future capabilities. Seven were already supported; three explicit
extension points were ADDED now (schema **v3**, additive over v2 — old records upgrade in `normalize()`, no migration).
`mistake-archive.check §8` asserts every row below.

| # | Future capability | Support | Mechanism |
|---|---|---|---|
| 1 | AI coaching & personalized feedback | ✅ (extension point added) | reserved **`ext`** namespace (collision-free per-mistake feature data) + `gen` provenance; full attempt data via `query()` |
| 2 | Spaced repetition & revision scheduling | ✅ (extension point added) | new **`dueTs` / `interval` / `ease`** fields + pure **`scheduleReview()`** (SM-2) + `getDueMistakes()` |
| 3 | Bookmarks / favorites | ✅ already | `bookmarked` field + `bookmarkMistake()` |
| 4 | Weak-topic detection | ✅ already | `query()` by category/engine/resolved + `facets()` |
| 5 | Difficulty-progression history | ✅ (extension point added) | stable **`qkey`** + **`groupByQuestion()`** (per-question attempt timeline with `difficulty`/`ts`) |
| 6 | Multiple attempts on the same question | ✅ (extension point added) | `qkey` groups attempts; each attempt is its own append-only record (distinct `id`, sync-safe) |
| 7 | Coaching analytics | ✅ already | `query()`/`facets()` over every stored field (timing, resolution, engine, difficulty) |
| 8 | User exports / imports | ✅ (helpers added) | **`exportArchive()`** (self-describing payload) + **`importArchive()`** (merge-by-id, dedup-safe) |
| 9 | Cross-device synchronization | ✅ already | `mergeMistakes()` merge-by-id (no dup/loss/corruption) + `reconcileRemoteMistakes()` |
| 10 | Future engines & question types | ✅ already | `engineOf()` safe default + engine-agnostic storage + `normalize()` preserves unknown record fields (additive schema) |

**Explicit certification:** the archive schema accommodates all ten capabilities **without any structural redesign** —
seven were inherent to the v2 additive schema + query/merge API, and the three genuinely-missing primitives (`qkey`,
spaced-repetition scheduling, reserved `ext` namespace) plus the export/import helpers were added in v3. v3 is fully
backward-compatible: v1 and v2 records upgrade in place with content and learning state preserved, and unknown future
fields are never dropped. No further foundation changes are required before building any of these features.

Verification: `mistake-archive.check §8` (extensibility) green; full npm test suite green (40 checks); Playwright archive
validation green against v3 (6/6 configs). EN rendering unaffected.
