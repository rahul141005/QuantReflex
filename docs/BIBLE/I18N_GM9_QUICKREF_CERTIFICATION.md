# G-M9 — Quick-Reference Library Localization Certification (ADR-111)

**Scope:** the complete Quick-Reference library (21 cards across 6 sections) — the exam-day revision surface at
`#learn/quick-ref` — validated as a **permanent, language-agnostic learning resource** in हिन्दी and मराठी through the
REAL render path (`QuickRef.render` → `QR_QUICKREF` data → `QRQuickRefI18n` overlay resolver → `BlockRenderers` tables +
`.math-grid`), driven by the REAL `js/i18n.js` and all three catalogs.
**Status:** ✅ **CERTIFIED — zero unresolved critical findings.** The i18n feature flag remains OFF.
**Branch:** `claude/quantreflex-product-audit-5d7p2n`.

## 1. Architecture — designed as a permanent resource, not a static translation

Each card keeps ONE immutable identity. `id`, `section`, the `learn`/`drill` cross-links and `block.kind` are machine
fields that stay on the English base for every language (enforced by `_FORBIDDEN = {id, section, icon, learn, drill,
kind}` in `quick-ref-i18n.js`). A hi/mr overlay carries ONLY display fields (title, table caption/headers/rows), keyed
by the same `id`; `resolve(card)` returns a MERGED view (EN base, per-field overlay wins, arrays merged by index,
`searchTerms` BILINGUAL). Consequences, all proven below:

- **Bookmarks, AI recommendations, future spaced-revision** key on the immutable `card.id` — the id-set is byte-identical
  across languages, so none of these features needs a schema change to gain a language.
- **Adding a card** = append to `CARDS` (+ optionally an overlay); no code or schema change. The resolver, renderer,
  search index and check all iterate the data — nothing is hard-coded per card.
- **EN is a no-op**: `resolve()` returns the base card unchanged when the study language is `en` or no overlay exists, so
  English rendering is byte-identical to today.

Card CONTENT localizes to the **study** language via the overlay; library CHROME (heading, section titles, search
placeholder/aria, Learn/Practice buttons, empty-state) follows the **app** language via `_t()` → `QRI18n.t('learn.*')`.

## 2. Method

`i18n-phaseG-quickref.js` loads the REAL `i18n.js` + all three catalogs + `BlockRenderers` + `quick-ref-data.js` +
`quick-ref-i18n.js` + `i18n/hi.js` + `i18n/mr.js` + `quick-ref-renderer.js`, and calls `QuickRef.render()` exactly as the
Learn sub-view does. It drives `QRI18n.setLanguages(app, study)` under the preview flag and asserts, per card: title
Devanagari (aligned/diverged), table headers Devanagari, NO Devanagari numerals anywhere (`/[०-९]/`), digits stay 0-9,
no card horizontal overflow, and the stable `data-card` id. Plus: chrome-language check, bilingual search probe, id-set
stability, body-overflow and zero console errors.

## 3. Results (8 cases + cross-checks)

| Case | app | study | vw | Chrome heading | Content | tablesDeva | overflow | Result |
|---|---|---|---|---|---|---|---|---|
| English (unchanged) | en | en | 360 | "⚡ Quick Reference" (EN) | English | 0/19 | 0 | ✅ |
| aligned | hi | hi | 360 | "⚡ त्वरित संदर्भ" (HI) | Devanagari | 17/19 | 0 | ✅ |
| aligned | hi | hi | 820 | "⚡ त्वरित संदर्भ" (HI) | Devanagari | 17/19 | 0 | ✅ |
| aligned | hi | hi | 1280 | "⚡ त्वरित संदर्भ" (HI) | Devanagari | 17/19 | 0 | ✅ |
| aligned | mr | mr | 360 | "⚡ त्वरित संदर्भ" (MR) | Devanagari | 17/19 | 0 | ✅ |
| aligned | mr | mr | 820 | "⚡ त्वरित संदर्भ" (MR) | Devanagari | 17/19 | 0 | ✅ |
| **DIVERGED** | en | hi | 360 | **"⚡ Quick Reference" (EN)** | Devanagari | 17/19 | 0 | ✅ |
| **DIVERGED** | en | hi | 1280 | **"⚡ Quick Reference" (EN)** | Devanagari | 17/19 | 0 | ✅ |

`cards = 21` in every case; zero console errors; no Devanagari numerals; no card/body overflow at phone (360), tablet
(820) and desktop (1280).

*`tablesDeva = 17/19`: 17 of the 19 table cards carry translatable prose headers (all rendered Devanagari); the other 2
are all-symbolic/all-numeric tables (e.g. squares/cubes grids, pure-value rows) whose cells are digits and math symbols
by design and correctly stay language-neutral.*

## 4. The diverged-language proof

With **appLanguage = en** and **studyLanguage = hi**, the same DOM shows the library heading, section titles, search
placeholder and Learn/Practice buttons in **English** (via `QRI18n.t()` on the app channel) while every card title and
table header renders in **Devanagari** (via the overlay on the study channel). The eyeballed desktop screenshot
(`pg-qr-diverged-desktop.png`) shows English section chrome — "Number Sense", "Arithmetic & Commercial", "Algebra",
"Geometry & Mensuration", "Modern Math" — over Hindi card content.

## 5. Bilingual search + id-stability

- **Bilingual search:** an English query (`"divisibility"`) AND a Hindi/Marathi query (`"विभाज्यता"`) both filter to the
  right card, in hi, mr and the diverged case. `data-terms` indexes the translated title + the EN title + the union of
  EN and translated `searchTerms`, so a student searching in either script finds the card. Clearing the query restores
  all 21 cards.
- **Id-stability:** the sorted `data-card` id-set is identical across en and hi (21 ids). Bookmarks, AI recommendations
  and future spaced-revision that key on `card.id` are schema-stable across languages.

## 6. Offline / sync / responsive / a11y

- **Offline:** `quick-ref-i18n.js`, `i18n/hi.js`, `i18n/mr.js` are in the service-worker precache (`service-worker.js`
  lines 110–113); `QRPacks.CONTENT` carries `js/quick-reference/i18n/{lang}.js`, lazy-loaded on boot + study-language
  switch and precached — the library renders in any language offline once installed. EN users load zero extra bytes.
- **Sync:** no per-user schema; card content derives entirely from the immutable base + language overlay. Nothing about
  the library is synced per user, so there is nothing to migrate or reconcile.
- **Responsive:** no body or card horizontal overflow at 360 / 820 / 1280; tables scroll inside their own wrap
  (`.di-table-wrap` / `BlockRenderers.table`), not the card.
- **Accessibility:** the search `aria-label` and section `aria-expanded` localize with the app language; the topic/section
  chrome is real buttons/headers; zero console errors across the crawl. Devanagari shaping (matras/conjuncts) eyeballed
  in `pg-qr-hi-phone.png`, `pg-qr-hi-expanded.png` (full expanded library) and `pg-qr-mr-tablet.png`.

## 7. Static + runtime verification

- `scripts/learn-i18n.check.js` §2 validates the overlays: congruence (merge-by-index), forbidden-field absence,
  Latin-leak heuristic, digit-multiset equality, coverage — **hi 21/21, mr 21/21 cards overlaid**, all green.
- Full `npm test` suite green (all scripts, 0 failures) after the G-M9 wiring (index.html script tag, SW precache,
  `QRPacks.CONTENT` template, `gen-i18n.check` content-pack path assertion).
- Runtime merge smoke test: EN byte-identity across all 21 cards; hi/mr coverage 21/21; translated titles
  (विभाज्यता के नियम, म.स.प. व ल.स.प., वर्ग (1–50)); bilingual `searchTerms` union; machine fields stable.

## 8. Verdict

**✅ CERTIFIED.** The Quick-Reference library localizes correctly through the real render path in हिन्दी and मराठी;
app-chrome and study-content diverge correctly; English is unchanged; bilingual search, id-stability, offline precache,
responsive layout, accessibility and digit-safety hold at 360 / 820 / 1280 with zero console errors. The library is a
schema-stable, additively-extensible permanent resource. **No unresolved critical findings.** The feature flag stays OFF
until the Phase-H Final Localization Certification.
