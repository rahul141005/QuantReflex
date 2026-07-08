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
