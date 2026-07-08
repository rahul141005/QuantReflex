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
