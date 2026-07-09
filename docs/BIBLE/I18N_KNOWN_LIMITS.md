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

- **String:** the static fallback `Version v223` in the About modal (index.html, "Version &
  Updates" section).
- **Status:** intentionally NOT tagged with `data-i18n`.
- **Rationale:** this node is **always** overwritten synchronously by `settings.js`
  `updateAboutUserStatus()` — which runs *before* the modal is shown (settings.js:429 calls
  `updateAboutUserStatus()` then `openInfoModal('aboutModal')`) — with the already-localized,
  parameter-bearing `settings.versionLine` key (`Version {version}` / `संस्करण {version}` /
  `आवृत्ती {version}`). The static text is therefore never rendered. Tagging it with a param-free
  `data-i18n` would either hard-code a build version that drifts on every SW bump (a maintenance
  trap under this project's strict version-lockstep discipline) or render a literal `{version}`
  token. The node **is** localized — via the existing JS path — so this is not untranslated
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
