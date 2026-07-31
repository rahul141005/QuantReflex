# QuantReflex Internationalization — Known Limits Register (ADR-111)

**Purpose.** This is the single authoritative list of every user-visible string that is
*intentionally* left English, transliterated-only, or frozen at capture time — each with a
rationale. The Final Localization Certification (Phase H) certifies against this register:
**anything English at certification time that is NOT listed here is a critical finding.** Every
entry must carry a rationale that still holds; when an entry stops being true, remove it.

Seeded in Phase D; appended to in every subsequent phase. Newest section last.

---

## Do-not-translate (DNT) tokens — Latin script by design

These appear verbatim inside otherwise-Devanagari strings and are allowlisted in
`scripts/i18n.check.js` (`LATIN_ALLOWLIST`) so the leak heuristic does not flag them:

- **Product / brand:** QuantReflex, QuanAI, Premium (chip form), Speed Score, Speed Aptitude,
  Math Duel, PRO (the `🔒 PRO` home premium badge), Playful (the "Playful Professional" theme).
- **Domains / discipline acronyms:** DI, LR, AI.
- **Exam names / acronyms:** CAT, MBA, CET, MAH, Bank, PO, SSC, CGL, IBPS, RRB, UPSC, MPSC, NDA,
  CDS, XAT, SNAP, NMAT, CMAT, SBI, Foundation.
- **Units / math:** km, kmph, cm, mm, kg, XP, AP, GP (digits always 0-9; ₹ and % untouched).
- **Third-party / proper nouns:** Google, Razorpay (payment processor), KrisVeltrix / KVt
  (developer), Android, Chrome, iPhone, Safari (install instructions), WhatsApp (duel invite),
  the product URLs (`https://www.quantreflex.app`, `www.quantreflex.app`, `quantreflex.app`), the
  login placeholder `you@example.com`, the duel room-code placeholder `ABC123`, the contact email
  `quantreflex@gmail.com` (About modal + Settings contact card).
- **Theme names:** Playful Professional, Classic Blue.

Rationale: these are proper nouns, brand/feature identities, exam-board names, or machine tokens
that Indian aspirants recognize in their Latin form; translating them would reduce, not improve,
comprehension.

---

## Phase D

### About modal — version line (`#aboutVersionLine`)

- **String:** the static fallback `Version <APP_VERSION>` in the About modal
  (`index.html` `#aboutVersionLine`, "Version & Updates" section). The literal tracks the
  service-worker `APP_VERSION` and is CI-enforced, so it is deliberately NOT quoted here — this entry
  quoted `v223`, then `v257`, and re-staled each time (ADR-129).
- **Status:** intentionally NOT tagged with `data-i18n`; **pinned to `APP_VERSION` and CI-enforced**
  (ADR-124, `scripts/update.check.js` — the literal must equal the service-worker `APP_VERSION`).
- **Rationale:** this node is **always** overwritten synchronously by `settings.js`
  `updateAboutUserStatus()` — which runs *before* the modal is shown (settings.js calls
  `updateAboutUserStatus()` then `openInfoModal('aboutModal')`; line numbers deliberately omitted, they have
  drifted twice) — with the already-localized,
  parameter-bearing `settings.versionLine` key (`Version {version}` / `संस्करण {version}` /
  `आवृत्ती {version}`). The static text is therefore never rendered in normal operation; it is visible
  only if `updateAboutUserStatus()` throws before assigning. A param-free `data-i18n` cannot serve here —
  it would render a literal `{version}` token — so the node stays untagged and is localized through the JS
  path. **Corrected by ADR-125:** this entry previously quoted `Version v223`, cited `settings.js:429`, and
  argued *against* pinning the literal as "a maintenance trap". ADR-124 pinned it deliberately and added the
  enforcing assertion, precisely because leaving it unpinned let it drift v223 → v247 → v255 unnoticed. The
  drift risk is now a CI failure rather than a silent staleness. The node **is** localized — via the existing JS path — so this is not untranslated
  content; it is a documented decision to localize it through JS rather than a static `data-i18n`
  fallback. The two sibling JS-written nodes with no embedded token (`#aboutUserStatusMessage`
  "Free Plan" → `about.s5Status`; `#aboutUpdateStatus` "Checking for updates…" → `about.s6Update`)
  ARE tagged for their pre-open state.

### Static single-file metadata (no per-user language)

- **`<meta name="description">`** (index.html:7) and **`manifest.json`** `name` / `description`.
- **Rationale:** these are single static documents consumed by crawlers / the OS install prompt
  before any user session or language preference exists; there is no per-user language to apply.
  English is the correct default. (Recorded here now; re-confirmed at certification.)

### App Guide — `info-premium-chip` badges

- **String:** the three `Premium` labels inside `<span class="info-premium-chip">` badges (App
  Guide sections "Premium modes", "My notes", "Theme").
- **Status:** left untagged; render `Premium` (Latin) in every language.
- **Rationale:** `Premium` is on the do-not-translate list (it appears as the Latin chip form
  everywhere in the product). Tagging these badges with a `data-i18n` key whose value is `Premium`
  in all three languages would be redundant. They render identically whether tagged or not, and are
  correctly allowlisted by the leak heuristic. The surrounding sentence text (e.g. "Premium modes",
  "the Playful Professional look is") IS tagged so its non-`Premium` words translate.

---

## Phase E

### Service-worker push fallback constants (English)

- **Strings:** `FALLBACK_BODY` and the `'QuantReflex'` notification title in `service-worker.js`.
- **Status:** intentionally English in every language.
- **Rationale:** these fire ONLY when a push arrives with a missing/malformed payload — a path that
  does not occur in practice, because `notificationService.notify()` always sends a fully-composed
  (and, from Phase E, already-localized) title/body. The SW has no language state (no `localStorage`
  in the SW context), so localizing them would require an IndexedDB/postMessage language handshake for
  a never-hit path. Certified as a bounded, no-user-impact exception.

### Stored planner LLM prose — frozen at generation language

- **Strings:** `strategy.verdict`, `focus[].whyNow`/`scoreImpact`, `block.rationale`, `tasks[].reason`
  stored inside a user's plan document.
- **Status:** rendered VERBATIM by the planner chrome (server-data boundary); localized at GENERATION
  time via the ADR-111 `sys()` response-language directive.
- **Rationale:** a plan generated while the study language was English keeps its stored English prose
  until the user taps **Rebuild my plan** (which regenerates it in the current language). The chrome
  and labels around it always localize, so the surface is never wholly English. Re-generation is the
  intended refresh path; translating stored prose in place would be machine translation (banned).

### Envelope- and planner-embedded topic / section labels — server language (until Phase G)

- **Strings:** topic and syllabus-section names embedded in QuanAI envelope mission titles and in the
  planner calendar (`sections[].name`, `tasks[].label`/`section`, `focus[].label`, `skip[].label`).
- **Status:** render in their server (English) language; the dedicated `syl.<topicId>` / `syl.sec_*`
  client display layer (blueprint §4.4.7) is deferred to **Phase G**, which owns syllabus chapter
  vocabulary. Drillable **category** names already localize via `formatCategoryName` (ADR-084).
- **Rationale:** these are strategy-engine / syllabus data, not chrome. Phase G authors the syllabus
  chapter names against the glossary and wires `_sylLabel(id, fallback)`; until then the fallback is
  the server label. The surrounding chrome is fully localized, so no surface is wholly English.

### Shared explanation cache — English entries + per-language siblings

- **Detail:** `explanations/{hash}_v{ver}` docs are English; hi/mr get `_hi`/`_mr` sibling docs
  (`_explainCacheId`, E-M2).
- **Rationale:** EN cache ids are byte-identical to the pre-i18n composition so the warmed cache is
  preserved; a language can never be served another language's cached explanation. Inert if the flag
  is rolled back (both channels hard-coerce to `'en'`).

### Inbox notification history — sent language

- **Detail:** an inbox notification stores the exact title/body that was delivered.
- **Rationale:** a notice delivered before a user switched languages correctly shows the language it
  was sent in — the inbox is a historical record of what was actually delivered, not a live re-render.

### Word-problems generation prompt — localized but client-dormant

- **Detail:** `action=wordproblems` has no client caller (grep-verified); its prompt builder is
  language-threaded for future-readiness only. The Firestore-curated word-problem BANK serves items in
  their stored language (out of client-generation scope; Phase F/known-limit).

### fmtMin unit abbreviations

- **Strings:** the `min` / `h` / `m` unit letters in `fmtMin` (companion-ui + planner-view).
- **Rationale:** treated as unit abbreviations (like `km/h`, `s/Q`) rather than translatable words —
  digits and the surrounding labels localize; the unit letters stay stable across languages.

## Phase F — generated quant content (ADR-111 F-M2)

The quant engine (`js/questions.js`, 36 categories) was refactored so each archetype `build()` returns
language-neutral `slots` + a fixed variant seed `v`, rendered by `QRGenI18n` from `locales/gen/en.quant.js`.
EN byte-identity is proven per category by the masked-shape census guard in `scripts/quant-engine.check.js`
(frozen baseline `scripts/fixtures/quant-census.json`). The following remain intentionally English pending
later Phase-F milestones:

### quantity-comparison — RESOLVED in F-M2.5 (no longer deferred)
- The MCQ option-render seam was built in F-M2.5: `render()` gained an opt-in `o(slots)`/`ans(slots)`
  channel, `_wrapArch` uses the rendered options/answer, and `quantity-comparison` was converted to slots
  with the answer relation + shuffled option order stored as INDICES (rendered from the shared `QC_REL`
  pool per language). All 36/36 quant categories are now slots-based; EN stays byte-identical (census).
  Only the hi/mr `QC_REL` phrases remain to be authored in F-M3 (content, not architecture).

### Hardcoded guaranteed-clean PRIMARY fallbacks — English
- **Strings:** the inline `{q, explain}` PRIMARY builders that do NOT call a refactored archetype helper —
  `_pctSafe`; `_AVG_PRIMARY.easy/medium`; all of `_PL_PRIMARY`, `_TW_PRIMARY`, `_PIPE_PRIMARY`, `_CI_PRIMARY`,
  `_PART_PRIMARY`, `_TSD_PRIMARY.hard`, `_AGE_PRIMARY.hard`, `_MIX_PRIMARY.easy/medium`.
- **Rationale:** these fire only when ~50 in-tier archetype attempts all return `null` (rare, clean-number
  guarantee). PRIMARY builders that CALL a refactored helper (e.g. `_ratDivide('easy')`) auto-localize; only
  the hardcoded-string fallbacks stay English. Low exposure; the census proves they are byte-unchanged. They
  will be migrated to slots opportunistically during F-M3/M4.

## Phase F — DI generated content (ADR-111 F-M5)

The DI engine (`js/di-engine.js`, 5 categories) was refactored so it owns only RNG + math (dataset numbers, answers,
chart NUMBERS) and reads all wording (themes, ~35 stem phrasers, chart titles/axes/columns, lead-ins, caselet contexts)
from a per-language pack (`locales/gen/<lang>.di.js`) resolved live via `QRGenI18n.diPack()`. EN byte-identity is proven
by the masked-shape census (`scripts/di-census.js`, `scripts/fixtures/di-census.json`; asserted in `di-engine.check` §6).
The following are intentional and bounded:

### Caselet survey acts — perfective past in hi/mr
- **Detail:** a few EN caselet acts are present-tense or passive ("support the new metro line", "use mobile banking",
  "own a smartphone", "were approved", "were discharged within a week"). Hindi/Marathi caselet stems place the count
  before the act with the ergative marker ने / नी, which grammatically requires a **transitive perfective** verb.
- **Decision:** every hi/mr act is authored as transitive perfective ("…का समर्थन किया", "…का उपयोग किया",
  "स्मार्टफ़ोन ख़रीदा", "स्वीकृति पाई", "छुट्टी पाई"). A survey result is a completed measurement, so the perfective
  reads natural to a Hindi/Marathi aspirant; the number, answer, difficulty and interpretation are unchanged. This is a
  meaning-preserving register choice, not a translation error — recorded so the certification does not flag the tense
  shift from the EN source.

### Entity oblique plurals — numeral + singular noun
- **Detail:** hi/mr DI stems read "5 कंपनी" / "5 विद्यालय" (numeral + singular) rather than the fully-inflected oblique
  plural ("5 कंपनियों"). This is the common, accepted exam-book convention for numeral+noun in DI stems and keeps the
  wording grammatically safe across all 22 diverse entity words (a per-entity oblique form is not maintained).

### Latin-script tokens inside Devanagari DI output — by design
- Single-letter entity codes (A–F, P–U, X, Y), quarter labels (Q1, Q2), all-caps org/scheme acronyms (LIC, HDFC, SBI,
  ICICI, BSNL, MTNL, ACT, KIMS, ELSS, UPI, GDP, AC, ICU, EV), unit symbols (₹, %, mm, MW, `'000`) and 0-9 digits stay
  Latin/symbolic in hi/mr — aspirants recognise these forms; they are allowlisted by the DI leak heuristic (gen-i18n.check
  §10 `DI_DNT` + all-caps strip).

### hi/mr DI packs — coverage
- `di.hi` authored in F-M5.2, `di.mr` in F-M5.3 — both now registered (`registerDI`); DI renders natively in EN + HI + MR. Until a language's DI pack is registered (`registerDI`), that language
  falls back to EN for DI (the leak/Devanagari checks skip it and report the gap), mirroring the quant coverage model.

### DI chart aria-label kind prefix — English
- **Detail:** di-charts.js `describe()` prefixes the accessible label with the chart KIND ("bar chart.", "line chart.",
  "pie chart.", "data table."). The data-rich remainder of the aria-label — the chart TITLE, entity labels and values —
  IS localized (it flows from the engine's localized chart spec). Only the one-word kind prefix stays English.
- **Rationale:** the blueprint scoped F-M5 to the ENGINE's text pools ("di-charts.js needs zero changes"); the kind
  prefix is renderer chrome, not engine content. Low exposure (screen-reader only, one word), and the localized title
  immediately follows. Can be localized in a later renderer-chrome pass; recorded so certification does not flag it.

## Phase F-M6 — LR generated content (locales/gen/{hi,mr}.lr.js)

### Syllogism noun number-agreement — intentional approximation
- **Detail:** the syllogism generator swaps a single plural-neutral noun form into every quantifier frame, so a noun
  reads correctly under "All"/"सभी"/"सर्व" (plural) but is a mild number-mismatch under "No"/"कोई…नहीं"/"एकही…नाही"
  (e.g. HI "कोई बिल्लियाँ, कुत्ते नहीं है"). One noun form cannot satisfy every quantifier's number simultaneously.
- **Rationale:** the model-checker operates on the A/B/C/D letter scaffolds, not the surface nouns, so this never
  affects logical validity or the answer; it matches how many printed Hindi/Marathi practice sets render these. A
  per-quantifier noun-inflection table is out of scope. The abstract categories ("Some farmers are roses") are also
  intentionally surreal — inherited from the EN noun-swap design and identical across languages.

### Marathi collapses grandparent/grandchild lineage — by design, NOT a Hindi calque
- **Detail:** Marathi renders both paternal and maternal grandfather as आजोबा (grandmother आजी), and both son's- and
  daughter's-side grandchild as नातू / नात — where Hindi distinguishes दादा/नाना, पोता/नाती. This is a genuine feature
  of the Marathi kinship system, not a missing distinction.
- **Rationale:** Marathi was authored from its own kinship terminology (it DOES distinguish काका/मामा, आत्या/मावशी,
  पुतण्या/भाचा — the distinctions Marathi speakers actually make). The 36-pair truth table (`fixtures/lr-kinship.json`,
  asserted by `lr-kinship.check.js`) encodes each language's real system; the collapse is expected and verified.

### Latin-script tokens inside Devanagari LR output — by design
- Cipher substrates (word puzzles like CAT→DBU), single variable letters (A–F, P–U, X, Y), coded operator/relation
  symbols (@ # & % $, > ≥ < ≤ =), Roman numerals (I, II) and 0-9 digits stay Latin/symbolic in hi/mr — aspirants solve
  letter-shift and coded puzzles on the English alphabet exactly as their exam books present them. Allowlisted by the LR
  leak heuristic (gen-i18n.check §11: all-caps strip + <3-letter-run rule). Distance keeps the Latin unit `km`
  (consistent with the quant/DI packs).

### Per-language sentence terminator (syllogism premises/conclusion)
- The premise/conclusion terminator lives in the pack (`syllo.period`): EN and MR use "." (modern Marathi / Maharashtra
  State Board convention), HI uses the danda "।". The engine change is EN-preserving — the EN period is unchanged, so
  the lr-census byte-identity (36/36 hashes) holds. Not a limitation; recorded so the mixed terminators are not flagged.

## Phase F-M7 — LR-visual generated content (locales/gen/{hi,mr}.lrv.js)

### Machine-figure aria-label (lr-figures.js describe()) — spec-derived English
- **Detail:** each rendered figure is wrapped in `<figure role="img" aria-label="…">` whose label comes from
  `lr-figures.js describe(spec)` — a spec-derived English sentence ("a die showing 3", "a row of figures: …"). The inner
  `<svg>` is `aria-hidden="true"`. The STEM and explanation (the actual question content) ARE fully localized; only this
  spec-derived figure label stays English.
- **Rationale:** the blueprint scoped F-M7 to the engine's stems + explanations ("figure data untouched — lr-figures.js
  renders machine specs"); `describe()` is renderer chrome, not engine content. Low exposure (screen-reader only, and the
  localized stem carries the question the figure merely illustrates). Directly consistent with the F-M5 DI chart
  kind-prefix known-limit. Can be localized in a later renderer-chrome pass; recorded so certification does not flag it.

### Figure SVG internal clip-path ids are per-render, not deterministic
- **Detail:** `lr-figures.js` mints unique `lrfclipN` ids per render() call (incrementing counter) for half-shaded
  shapes. Two renders of the SAME figure spec therefore differ only in these internal ids — NOT visually, and NOT by
  language. Cross-language figure identity is proven at the SPEC level (gen-i18n.check §12 asserts the figure specs are
  byte-identical across en/hi/mr) and at the render level after normalising the counter. Not a localisation limitation;
  recorded so the id churn is not mistaken for a rendering difference.

## Phase F-M8 — Mistake Archive (js/mistake-archive.js)

### Cross-language replay freezes in the captured language — by design (extension point reserved)
- **Detail:** a mistake replays in the language it was practised in (the archive stores the fully-rendered question —
  stem, options, explanation, machine specs — frozen). Switching study language later does NOT re-render an old mistake
  into the new language.
- **Rationale:** the rich engines (DI, LR, LR-visual) own their RNG and generate directly in the active language; exactly
  re-rendering a PAST question in a different language would require storing per-engine regeneration seeds/slots and
  re-running under a stubbed RNG — deferred. The `gen` provenance field is RESERVED for this future extension. Reviewing
  the exact question you got wrong, in the language you saw it, is pedagogically sound. English rendering is unaffected
  (the archive never regenerates content — EN byte-identity holds).

### Shared-context SETs are archived but not drill-re-servable
- **Detail:** lr-seating, lr-puzzle and di-caselet mistakes are captured with full metadata (searchable, filterable,
  analytics-ready) but are excluded from the review DRILL — a single stored question cannot reconstruct the shared
  scenario / caselet prose that spans the whole set.
- **Rationale:** DI single charts and LR-visual figures ARE re-servable now (the drill re-renders the stored spec); only
  genuine multi-question SETS are skipped. `QRMistakeArchive.isReviewable` owns this decision; recorded so certification
  does not flag the exclusion.

### Archive is capped at the 100 most-recent mistakes
- **Detail:** the archive keeps the 100 most-recent records (CAP), bounding localStorage and the Firestore `practice/data`
  doc; older mistakes age out. Unchanged from v1. Configurable via `QRMistakeArchive.CAP`; a future paged/subcollection
  store is an extension point that needs no record-schema redesign (the v2 record is already the canonical unit).

## Phase G — Learn library, Quick-Reference, authored-LR, auto-tips (structural-overlay translation)

### Learn-KB / Quick-Reference formula `expr` strings stay English (frozen machine field)
- **Detail:** in the Learn knowledge base and the Quick-Reference cards, a formula's machine field — the `expr` string
  (`"A = πr²"`, `"CI = P(1 + r/100)ⁿ − P"`) and per-row symbolic table cells — is NOT translated. The structural overlay
  carries only display prose (formula `name`, `when`, `whenNot`, `trap`; captions; prose cells); `expr` is a FORBIDDEN
  overlay field (`scripts/learn-i18n.check.js` fails if an overlay supplies it) and is served from the certified EN base.
- **Rationale:** `expr` is symbolic formula notation, not language — variables, operators and function names are universal;
  translating it would corrupt the notation and risks drift from the certified reference. The surrounding teaching prose IS
  translated, so the formula reads inside a Devanagari sentence. Digits stay 0-9; π/√/²/³/×/÷ are script-neutral.
  Certification treats symbolic `expr` / numeric-table cells as DNT, not as a leak.

### Formula symbols, single-letter variables and discipline acronyms inside auto-tips stay Latin
- **Detail:** the 85 auto-tips (`tips.*`) render in Devanagari but keep — by design — formula symbols (× ÷ = ² ³ π ≈ ≥ ≤
  > < − ° % ₹ ↔ →), single-letter variables/labels (a, b, r, h, x, y, n, and A…Z in `A=1…Z=26`, `D = S × T`,
  `|30×H − 5.5×M|`), digits 0-9, and the acronyms DI / LR (allowlisted in `scripts/i18n.check.js`). Book-form
  abbreviations render Devanagari: HCF/LCM → म.स./ल.स. (hi), म.सा.वि./ल.सा.वि. (mr).
- **Rationale:** these are mathematical notation, not prose; exam books keep them Latin. The `i18n.check` leak heuristic
  flags only Latin runs of 3+ letters after allowlist stripping, so single letters and 2-letter acronyms pass by design.

### Machine fields on translated content — ids, `related`, cross-links, `searchTerms` (EN retained)
- **Detail:** every study-content overlay (KB, quick-ref, authored-LR) leaves machine/metadata fields on the EN base —
  the `id`, `category`, `difficulty`, `examFrequency`, `status`, `related[]` topic ids, KB `learn`/`drill` deep-link ids,
  quick-ref `section`/`icon`/`kind`, authored-LR `topic`/`subtype`/`exams`/`tags`/`reviewStatus`. `searchTerms` is a
  bilingual UNION (EN terms retained, translated terms ADDED) so search works in either script.
- **Rationale:** these are stable keys the routing, dedup, bookmarks, AI-recommendations and spaced-revision logic key on;
  translating them would break those. Overlays are display-only by construction and the checks fail on any forbidden
  field. ids never render as prose, so this is not a leak.

### Authored-LR labels I / II and cipher substrates stay Latin
- **Detail:** authored Statement/Cause/Course items keep the statement/action labels I and II (`कथन I`, `विधान II`,
  `Courses of action: I. … II. …`) as Roman numerals, and any coding-decoding substrate stays on the English alphabet.
- **Rationale:** Roman numerals I/II are single/2-char tokens (pass the leak heuristic) and are the standard exam-book
  labels; Indian exam books pose letter-shift puzzles on the English alphabet. The prose around them is fully translated.

---

## Final Stabilization (second pass, 2026-07-09)

### AM/PM time notation in Battle Archive card details stays Latin
- **Detail:** `duel-archive.js _fmtTime` renders the duel's clock time as `h:mm AM/PM` in every language. Dates
  (day + month + year) ARE localized (`duel.archMonths` supplies Devanagari month abbreviations); durations and
  speeds are localized (`duel.archDurSecs` / `archDurMinSecs`); only the AM/PM meridiem token stays Latin.
- **Rationale:** AM/PM is the standard clock notation in Indian Hindi/Marathi UI convention (watch faces, tickets,
  phone lock screens); a 2-letter token, it passes the leak heuristic by design. Translating it (पूर्वाह्न/अपराह्न)
  would read as bureaucratic prose, not a clock.

### Score/margin notation `±`, `+`, `–` and the `{n}%` shapes stay symbolic
- **Detail:** the archive's closest-margin (`±3`), average-margin (`+1.5`), score separator (`7–4`) and all `%`
  values keep their mathematical notation in every language; the LABELS around them are fully localized.
- **Rationale:** mathematical notation, not prose (same rule as the formula-symbols entry above).

<!-- REMOVED (ADR-125): "Category-picker section hints are dead model data" — ADR-124 deleted the three
     English `hint` fields from `_diSections`/`_lrSections`, so the entry documented code that no longer
     exists. Per this register's own rule ("when an entry stops being true, remove it") it is retired rather
     than left standing. There is nothing left to declare here: `grep -n hint js/ui/category-picker.js`
     returns no matches. -->

---

## Language-transition scope limits (ADR-127) — unreachable by construction

The Translation Pass runs only on the screen that is visible when the language changes. Because the two
language selects live in the Settings view and nowhere else, several paths that a language switch would
otherwise touch are **not reachable through the product**. They are recorded here rather than fixed, so
that a future entry point (an onboarding language step, a second selector) knows exactly what it must
handle first. Each was verified from source during ADR-127.

- **`Router.refreshCurrentView()` passes no route `params`** (`js/router.js:52`). Only `Router.onShow('learn')`
  consumes params, so a refresh while reading `#learn/<topicId>` would call `renderLearnRoute(undefined)`
  and render the **hub**, clearing `#learnTopic`. Unreachable today: `refreshCurrentView()` is only ever
  invoked with `currentView === 'settings'`. A future non-Settings language control must fix this first.
- **A Practice refresh discards the mode configuration.** `_resetPracticeUiToModes()`
  (`js/controllers/practice-config.js:259-271`) unconditionally hides `#categorySelect`, shows `#modeSelect`
  and resets the timer, adaptive and custom-count controls.
- **Scroll capture covers `.container` only** (`js/i18n-transition.js`). While `body.view-practice-active`
  is set, `.container` is `overflow:hidden` and the real scroller is `#modeSelect.practice-container`
  (`css/style.css:3080-3100`), which would not be restored.
- **`view-duel` has no `onShow` hook**, so `refreshCurrentView()` returns `false` and the fallback
  `Router.showView('duel')` would run `_cleanupOverlays()` plus `scrollTo(0,0)` and `pushState` — closing
  sheets and resetting scroll.
- **A live drill keeps its own JS-rendered strings until the next question.** The commit deliberately skips
  the view refresh while `body.drill-session-active` (`drill-engine.js` renders 88 localized strings by
  innerHTML), and ADR-127 additionally skips the animation entirely so a timed question is never dimmed or
  nudged. Static chrome still retranslates through `applyDom`.
- **JS-built modals do not retranslate and do not animate.** Paywall, report sheet, AI companion, duel
  sheets and onboarding build their markup with `QRI18n.t()` at open time and register no `onChange`
  handler, so a language change behind an open one leaves it in the old language. They are deliberately
  excluded from the transition rather than animated, because dimming and revealing unchanged text is worse
  than not animating: it promises a change that does not happen. Unreachable while Settings is the only
  entry point. Static modals (About, App Guide, profile, delete-account, exit-session, clear-data) are
  `data-i18n` markup and **do** retranslate through `applyDom` — verified live.
- **`js/app.js:616` re-applies the language on every sign-in and account boundary** from the remote settings
  blob, with no transition and no announcement. This is app construction, not a user-initiated language
  change, so it is out of the transition's scope; noted because it is a second, silent write path to
  `QRI18n.init`.
- **The Learn hub's table selector is built once per document** (ADR-127). It carries no localized text
  ("Show All" / "Clear All" are hardcoded English — a separate, pre-existing i18n gap), and rebuilding it
  on every language change duplicated 30 buttons per switch.
- **At 320 px the Hindi language-row titles truncate** ("ऐप की …"). A static layout property of that
  breakpoint, present in the settled state and unrelated to the transition.
