# Phase F — Architecture Freeze & Readiness Report (ADR-111)

**Date:** 2026-07-09 · **Bible 2.142** · Branch `claude/quantreflex-product-audit-5d7p2n` · Feature flag OFF.

This freezes the Phase-F architecture ahead of Phase G. Audited from the repository, not asserted.

## Readiness confirmations (all ✅)

1. **No Phase G/H work requires redesigning Phase F architecture.** Phase G (Learn KB, authored LR bank, tips) is
   ADDITIVE: Learn/authored content uses the existing `tc()` study-content channel + the reserved `CONTENT_NS`
   namespaces (`gen`, `learnContent`, `tips`, `study`) and rides the existing `QRPacks.ensure` lazy loader; the merged
   knowledge-overlay resolver (`KnowledgeBase.registerTranslations`) is a documented G-M1 insertion point (blueprint
   §6.4.1) that adds a resolver, not a redesign. Phase H (certification + flag flip) reads existing surfaces only.
2. **All intended extension points exist or have documented insertion points.** Future engines → `registerRich(engine,
   lang, pack)` / `richPack()` (generic, en-fallback). Learn/tips content packs → `QRPacks.GEN` list + `ensure()`
   ("Extended in Phase G" is written into the loader). Coaching analytics / adaptive learning / AI review / spaced
   repetition → `QRMistakeArchive` v3 (`query`/`facets`/`groupByQuestion`/`scheduleReview`/`ext`/`gen` — extensibility-
   certified). Knowledge overlay → `registerTranslations` (G-M1). Every one is present or documented.
3. **Stable infrastructure.** Firestore schema (no collection/path/index change in Phase F — mistakes stay the
   `practice/data.mistakes` array), localStorage keys, SW precache (v223), sync (guarded merge-by-id), analytics /
   achievements / streaks / XP / billing (untouched — `recordAnswer`'s `meta` is additive, the correct/streak/XP path
   is unchanged), offline (all packs SW-precached; archive localStorage-backed), and the multilingual infrastructure
   (`QRI18n` t/tc channels, catalogs, gen packs, bundled font, `i18n.check` + `gen-i18n.check`) are all stable.
4. **Every known limitation is intentionally documented** in `I18N_KNOWN_LIMITS.md` (Phase D DI + Phase F-M6/M7/M8
   sections) — syllogism number-agreement, Marathi lineage collapse, Latin cipher/km tokens, figure aria-label,
   mistake-replay language freeze, shared-context SETs, archive cap-100. None accidentally deferred.
5. **No TODOs / temporary implementations / shims / experimental paths** in the Phase-F surface (grep-clean across
   `gen-i18n.js`, `i18n-packs.js`, `mistake-archive.js`, the four engines, and all 12 gen packs). No `.bak`/dead
   skeletons; every gen pack registers. npm test = **40 scripts, all green**.

## Frozen modules

| Module | Role |
|---|---|
| `js/gen-i18n.js` (`QRGenI18n`) | render/slots registry (quant) + generic rich-pack registry (`registerRich`/`richPack`) |
| `js/i18n-packs.js` (`QRPacks`) | lazy loader for study-language packs (extensible list) |
| `js/di-engine.js`, `js/lr-engine.js`, `js/lr-visual-engine.js` | rich-pack engines (own RNG/math/figures) |
| `locales/gen/{en,hi,mr}.{quant,di,lr,lrv}.js` | 12 generated-content packs |
| `js/mistake-archive.js` (`QRMistakeArchive`) | durable v3 archive foundation |
| `scripts/{di,lr,lrv}-census.js`, `gen-i18n.check.js`, `lr-kinship.check.js`, `mistake-archive.check.js` + fixtures | the enforcement harness |

## Public extension points

- **New engine:** `GI.registerRich('<engine>', lang, pack)` + `GI.richPack('<engine>')` (en-fallback so generation never breaks).
- **New study-content pack (Learn/tips/authored):** append to `QRPacks.GEN` (or the Phase-G content list) → auto lazy-load + SW-precache.
- **Knowledge overlay (Phase G):** `KnowledgeBase.registerTranslations(lang, categoryId, TOPICS_L)` (merged per-field resolution, en base).
- **Mistake-archive features:** `query`/`facets`/`groupByQuestion` (analytics, weak-topic), `scheduleReview`/`dueTs` (spaced repetition), `bookmarked` (favorites), `ext` namespace (AI coaching notes), `gen` (exact re-generation), `exportArchive`/`importArchive`.

## Invariants that must never be broken

- Feature flag (`QRI18n.ENABLED` + inline `I18N_ON`) stays OFF until the Phase-H certification passes; while OFF, English is byte-identical.
- Machine data never translates (ids, subtypes, `expr`, related ids, chart/figure spec field NAMES, Firestore field names, error codes).
- Generated content: for a fixed RNG seed the answer / option-index / subtype / figure-spec are identical across en/hi/mr; digit multiset preserved (digits 0-9, never Devanagari numerals); explanations keep `→` as the step separator; EN census hashes must reproduce exactly.
- Mistake archive: stable `id` (dedup) + `qkey` (grouping); records are additive and `normalize()` preserves unknown fields; merge is by id (no dup/loss/corruption).

## Migration rules

- No data migration is required by Phase F or introduced for Phase G. Mistake records upgrade lazily on read (`normalize` v1→v2→v3); the Firestore shape is unchanged; the hydration merge is guarded (falls back to the prior value on any error).
- New locale-bearing files must be added to the SW `ASSETS` precache + a `<script>` tag / loader entry in the SAME commit (enforced by `i18n.check` §5).

## Compatibility guarantees

- Old app versions read new records without crashing (unknown fields ignored); new code reads old records (normalize upgrades). EN generation and the warmed AI cache are untouched. No prompt-version bumps. `recordAnswer(…, meta)` 4-arg callers behave identically.

## Assumptions carried into Phase G

- The `tc()` study-content channel + `CONTENT_NS` reserved namespaces are the vehicle for Learn/tips content; `QRPacks` is the loader; the glossary-first workflow (research → `GLOSSARY_I18N.md` → author) governs every content batch.
- Learn EN content files (`data/knowledge/*`, quick-ref, authored LR) remain the certified reference and are NOT edited — translations are structural OVERLAYS keyed by stable id (no `expr`/ids translated).
- SW stays v223 (unreleased); all Phase-G packs ride it. The Phase-H Final Localization Certification is the only gate that flips the flag.

**Status: FROZEN & READY.** Phase G may proceed additively with zero Phase-F redesign.
