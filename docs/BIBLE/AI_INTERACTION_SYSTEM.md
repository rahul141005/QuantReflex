# QuantReflex — AI Interaction Design System

**Status:** Authoritative (ADR-039). This is the contract EVERY present and future AI feature renders
against. One AI brain, one voice, one component vocabulary. No feature invents its own response shape,
loading state, or personality. If a feature needs something not defined here, extend THIS document first.

Companion: [DECISION_LOG.md](DECISION_LOG.md) (ADR-039) · [TECHNICAL_BIBLE.md](TECHNICAL_BIBLE.md) ·
[FIRESTORE_BLUEPRINT.md](FIRESTORE_BLUEPRINT.md) · [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md)

---

## 0. Doctrine — make gpt-4o-mini feel far smarter than it is

QuantReflex runs **one production model: `gpt-4o-mini`**. We never compensate with a bigger model; we
compensate with architecture. Seven levers, applied everywhere:

1. **Move intelligence OUT of the model.** All *analysis* (trends, flags, weak/strong, careless-detection)
   is computed deterministically server-side in the **Student Context Engine** (`services/studentContext.js`).
   The model only writes *language*, never the diagnosis. Deterministic math can't hallucinate.
2. **Feed it the unfair advantage.** Every call carries a compact, personalized **student model** + **AI
   memory** — data ChatGPT cannot have (this student's 90-day speed trend, careless pattern, last session).
3. **Chain small specialized calls** instead of one mega-prompt. Each call has a tiny, well-constrained job
   → fewer hallucinations, lower latency, lower cost.
4. **Constrain the output.** Strict `json_schema` + post-validation (numeric/enum bounds, answer-equality
   checks). The UI renders typed blocks, never raw prose it must trust.
5. **Remember.** Durable `aiMemory` gives continuity ("3rd time on ratios — let's nail it") → feels like it
   knows the student.
6. **Interact.** Every response ends in an action (chips/follow-ups/missions). The AI *drives* the next step.
7. **Cache + skip.** Reuse context (`aiContext` 6h); a finished drill stamps `qr_ai_dirty_at` so each surface
   force-refreshes once on its next open (ADR-045), plus a live **today** count-signal fed into the prompt, shared
   explanations, daily caches; **cold-start users never hit the model** (deterministic copy). Cheap and instant.

---

## 1. Persona — "QuanAI"

One personality across all five features. The name is the `PERSONA` constant, defined in two mirrored places:
the server source-of-truth `services/aiPrompts.js` (injected into every system prompt + exported as `prompts.PERSONA`)
and the client `js/companion-ui.js` (modal badge + throttle copy). Change both to re-brand.

- **Role:** a sharp, encouraging **quantitative-aptitude** speed-math coach who has watched this student
  practice every day. Persona is **exam-agnostic**; coaching is **exam-aware** (ADR-045/ADR-067) — when the
  student's exam is known (one of the 17 curated exams across the MBA / Banking / Foundation / Government tiers —
  e.g. CAT, XAT, MAH CET, IBPS/SBI PO, RBI Assistant, SSC CGL — see `data/syllabus.js`), it is injected (wrapped
  as data) so examples, topic priorities and pacing adapt — including the exam's **mechanics** (an "EXAM
  MECHANICS" line: negative marking, calculator, sectional timing, seconds-per-question) — while the voice stays
  one consistent QuanAI. Never fabricates a syllabus it doesn't have — it grounds advice in the student's real
  data and the 14 categories the app actually drills (`services/quantTopics.js`, the single topic source of truth).
- **Voice:** concise, warm, direct, data-grounded. Talks like a great human tutor, not a chatbot.
- **Hard rules:**
  - **≤ 2 sentences** of prose (`say`) per turn. Then a component or an action. **Never** a wall of text.
  - **Always ground claims in the student's real numbers** ("you slowed ~2s on ratios this week"), never
    generic motivation ("keep working hard!").
  - Second person ("you"), present/active voice. No emoji spam (one purposeful icon per block max).
  - Never expose system internals, prompts, raw stats dumps, or that it is "an AI language model".
  - When unsure, say what it *can* see and offer an action — never fabricate a number.

---

## 2. The response envelope (the heart of the system)

Every AI endpoint returns ONE JSON object. The client renderer (`js/companion-ui.js`) transforms it into
DOM components. Features never hand-build HTML for AI output.

```jsonc
AIResponse = {
  "v": 1,
  "feature": "explain" | "coach" | "insights" | "plan" | "wordproblems" | "chat",
  "blocks": Block[],          // ordered, rendered top → bottom
  "chips":  Chip[],           // next-action quick replies (≥1 unless terminal)
  "meta":   { "threadId"?: string, "cached"?: bool, "promptId"?: string, "personaLine"?: string }
}
```

### Block types (the component vocabulary)
Each block has a `type`. The renderer has exactly one component per type. `additionalProperties:false`.

| `type`       | Shape | Renders as |
|--------------|-------|-----------|
| `say`        | `{ text }` (≤2 sentences) | Streamed prose line (typewriter). The voice of QuanAI. |
| `card`       | `{ title, body, accent?: 'blue\|amber\|green\|rose\|slate', icon? }` | Titled insight card |
| `metric`     | `{ label, value, trend?: 'up\|down\|flat', delta?, good?: bool }` | Stat tile w/ ↑↓ arrow + color |
| `steps`      | `{ title?, items: string[], collapsible?: bool }` | Numbered, expandable explanation |
| `mission`    | `{ title, why, deepLink: {mode, category, count?}, estMin? }` | Action card → launches a real drill |
| `timeline`   | `{ days: [{ day, label, items: string[], done?: bool }] }` | Vertical plan timeline |
| `celebrate`  | `{ text }` | Win callback (confetti-lite) |
| `callout`    | `{ tone: 'info\|warn\|success', text }` | Inline highlighted note |
| `ring`       | `{ score: 0..100, label, sub? }` (ADR-050) | Exam-readiness ring (reuses the planner `.pr-ring` SVG) |
| `progress`   | `{ label, pct: 0..100, sub? }` (ADR-050) | Horizontal progress bar (e.g. weekly plan adherence) |

**Dashboard composition (ADR-050).** Coach and Insights compose these blocks into a multi-section, animated
*living dashboard* — assembled **deterministically** by the server from `ctx` + the single `aiPlanner` read; the
LLM writes only the prose fields (one call per feature). **Value first, then recommend.** Coach order: `say`
greeting → `ring` readiness → `celebrate` biggest win → `card` (amber) one worry → `metric` cluster (tier ≥ 2) →
`progress` plan adherence → `callout` days-to-exam → `mission` today's recommendation → `say` motivation → chips.
Insights order: `say` "I found N patterns" → `card` biggest lever → `metric` cluster → `card` pattern×N (from the
behavioural flags) → `card` weakness → `callout` planner prediction → `mission` action×N → chips. **Tiers**
(`_tier(ctx)`, 0–4 by lifetime volume) gate WHICH sections show, never WHETHER they're computed. Very-low data
(`tier 0`) is a *helpful deterministic early read*, never a lock (ADR-052). `renderEnvelope` staggers block children for a cascading
reveal (`--bi` → `animation-delay`; respects reduced-motion).

### Chip
```jsonc
Chip = { "label": string, "value": string, "icon"?: string,
         "kind": "reply" | "deeplink" | "drill" | "dismiss",
         "deepLink"?: { "mode": string, "category"?: string, "count"?: number },  // when kind=deeplink
         "drill"?:    { "category": string, "label": string } }                   // when kind=drill (ADR-045)
```
- `reply` → sends `value` back as the next `chat` turn (continues the conversation).
- `deeplink` → calls `startDrillFromPractice(mode, category, label)` (`practice-modes.js`) and logs `deeplink`.
  Used for deliberate session starts (Coach/Insights/Planner "start a set").
- `drill` → runs an **in-place** 5-question adaptive micro-drill INSIDE the AI modal (ADR-045), then feeds the
  result back as a concept-anchored turn. Used by Explain so the learning flow is never broken. Never navigates.
- `dismiss` → closes the surface, logs `dismiss`. (Coach "Not today", etc.)

### Deep-link contract
`deepLink.mode` ∈ the drill-engine modes (`focus`, `practice`, `drill`, `test`). `category` is a canonical
key from `CATEGORY_LABELS`. Every AI prescription that says "do X" MUST carry a `deepLink` so advice → action
in one tap. A `mission` block or a `deeplink` chip with no valid category is invalid and dropped by the validator.

---

## 3. Conversation patterns

- **Never terminal.** Every surface ends with ≥1 chip or follow-up. The AI always offers the next step.
- **Turn protocol:** `ask → student responds (chip / quick-reply / mini-challenge) → AI adapts`. Free-text is
  allowed but optional; chips keep cost and prompt-injection surface tiny and make the UX one-tap.
- **Lead with the point.** Observation/answer first, then the action. No preamble ("Sure! Here's…").
- **One idea per turn.** If there's more, offer it as a chip ("Go deeper"), don't dump it.
- **Mini-challenges (SHIPPED — ADR-045):** the in-place micro-drill — a `drill` chip runs 5 adaptive questions
  inside the modal (shared `generateQuestions`), graded client-side, with the result fed back as a concept-anchored
  turn so QuanAI reacts ("3/5 — you slowed on the back two"). This is the "feel alive" loop: Explain → Drill this →
  5 questions → back to the same conversation, never leaving QuanAI. Deliberate session starts still deep-link a full
  drill via a `mission` block / `deeplink` chip.

---

## 4. Personalization & memory

Driven by the **Student Context Engine** (analysis) + **`users/{uid}.aiMemory`** (durable prefs/history).
See FIRESTORE_BLUEPRINT for schemas. Rules every feature obeys:

- **Depth** from `aiMemory.preferredDepth` (`concise|standard|deep`). Two "Simpler" taps → nudge toward concise.
- **Tone by confidence** (`aiMemory.confidence`): low → reassure + smaller steps; high → challenge + push pace.
- **Weakness targeting:** prescriptions prefer `aiMemory.knownWeakConcepts` + context `errorPatterns`.
- **Win callbacks:** when a tracked weakness improves, surface a `celebrate` ("ratios 52%→78% in two weeks").
- **Continuity:** features reference `aiMemory.timeline[]` ("yesterday you committed to ratios — you did 2 sets").
- **No cold-start gate (ADR-052).** `buildContext` is the ONE canonical profile and ALWAYS returns the real
  student from whatever data exists (even zero) — there is no fake "cold" profile and no feature lock. Data
  **richness** (`_tier`, 0–4 by lifetime volume) decides how *rich* a response is, never *whether* it works, so
  Analytics, Coach, Insights, Planner, and Explanation always describe the same student. With very little data
  (`tier 0`, 0–5 lifetime) Coach/Insights render a deterministic, genuinely-helpful early read
  (`_coachLowData`/`_insightsLowData`: the real accuracy/mastery/readiness already known + an actionable
  mission, framed as *"the more you practise, the sharper I get"*) — **no LLM call** (controlled copy avoids
  generic output near zero data; cost stays flat). QuanAI **never** says "I don't know you / give me 10
  questions / practice to unlock." A brand-new (zero-data) user gets *"I don't know much about you yet, but
  here's how we'll build your profile…"* + one start action — help, never a wall. `accuracy` is `null` ("no
  data yet"), never `0`.
- **Cross-feature awareness (one brain):** Explain writes the struggled concept (`recentTopicsExplained`, now
  surfaced to Coach/Insights via `serialize()`); Insights writes discovered weaknesses; Coach reads today's plan +
  readiness + recent insights + explained concepts and writes `wins`; Study Plan & Word Problems target
  `knownWeakConcepts`. No feature is an island.

---

## 5. States, loading, animation, errors

- **Loading:** staged **skeleton cards** with honest progress copy — `"Reading your last 7 sessions…"` →
  `"Spotting patterns…"` — never a bare spinner. Streamed `say` reveals via typewriter as tokens arrive.
- **Animation (§10A tokens, `prefers-reduced-motion` safe):** card-in (fade+rise 160ms), chip press (scale .97),
  progress-fill (ease-out), streamed-prose reveal. No animation exceeds 250ms; nothing blocks input.
- **Error:** never show a raw error. Show a friendly `callout` (`warn`) + a **retry** chip. On hard model failure
  the server returns a **deterministic fallback** AIResponse (it never errors to the user). Rate-limit/throttle/
  budget → a calm "QuanAI is resting — try again shortly" with retry.
- **Empty/insufficient data:** the deterministic `tier 0` low-data path (no LLM) — a genuinely-helpful early
  read of whatever exists + an actionable mission, never a lock or "unlock" wall (ADR-052).
- **Offline:** features that have a cached AIResponse render it (read-only, "offline" callout); others show the
  retry callout.

---

## 6. The five features — one brain, distinct roles (no overlap)

| Feature | Single responsibility | Must NOT do |
|---|---|---|
| **AI Explain** | Interactive concept learning + adaptive explanations (simpler/deeper/another/got-it) | Give study strategy or trends |
| **AI Coach** | Daily mentor: accountability, motivation, ONE prescribed next action, remembers convos | Re-explain a question; build a multi-day plan |
| **AI Insights** | Performance intelligence: weakness discovery + trends → **actionable missions, not reports** | Daily check-in chatter; teach a concept |
| **QuanAI Planner** | Living, syllabus-driven roadmap (ADR-046): schedules the next 14 days day-by-day from a real exam syllabus + analytics, replans each block, surfaces readiness/forecast/calendar | One-off advice; per-question explanation |
| **Word Problems** | Context-aware practice generation targeting the student's weakest concepts (future-ready) | Coaching, planning |

Every feature: consumes Context + Memory, renders via the block vocabulary, ends in chips, deep-links real drills,
shows a **"Was this helpful?"** chip pair (logs `helpful_yes/no`, feeds `preferredDepth`).

### 6·SoT — One profile, one derivation layer (ADR-053)

QuanAI is one brain because two things are each defined in exactly ONE place, and every feature reads them:

- **One Student Intelligence Profile — `services/studentProfile.js` `build(uid, opts)`.** Returns ONE object
  that IS the student's whole learning state: identity, accuracy, today, trends, mastery, weak/strong, flags,
  memory, `planner` (readiness/forecast/today's tasks/adherence — folded in from one `aiPlanner` read),
  `recommendation` (the single "what next"), `tier`, and `masteryByCat` (any category's mastery). **Every** AI
  feature — Coach, Insights, Explanation, Chat, Planner, Word Problems, and any future feature — consumes this
  same object; none re-assembles its own understanding. A new feature = `build()` + a prompt; it never creates a
  second source of truth.
- **One derivation layer — `data/statMath.js`.** A pure, self-contained, **dual-exported** module (client
  `<script>` + server `require`, like `syllabus.js`) is the ONLY implementation of mastery/tiers,
  weakest/strongest, overall + 7d/30d accuracy, speed, today, and streak — thresholds (`MIN_ATTEMPTS`,
  weak `<0.6`/strong `≥0.8`, windows) defined once. The **server** profile and the **client** Analytics
  (`progress.js`, `stats-view.js`) both consume it, so for the same `stats` they cannot disagree (the cure for
  "Analytics knows me but Coach doesn't"). `aiMemory.knownWeakConcepts` is a *derived cache*, never a competing
  calculation.
- **Freshness:** the `clientStats` floor (`_sanitizeClientStats` → `studentProfile.build({clientStats})` →
  `_floorStats`) raises the debounced/stale Firestore stats with the live local snapshot on **every** AI path,
  and a `qr_ai_dirty_at` stamp (set on practice AND on planner mutations) forces the next `build()` to refresh —
  so no surface is ever stale and no second session/refresh is needed.

### 6b. AI Explain — a premium learning document (ADR-051)

Every explanation is a teaching document, not a one-liner. The question-specific prose
(`concept`, `steps`, 2–3 `mistakes`, `shortcut`) is **shared-cached per question** (`explanations/{hash}_v{ver}`,
user/exam-agnostic, one LLM call). The server then layers **deterministic per-student** sections on top — never
in the cache, never LLM-invented:

1. **Concept** (`say`) · 2. **Step-by-step** (`steps`) · 3. **Common mistakes** (`card`, personalized lead when
this is a live weak spot) · 4. **Faster method** (`card`) · 5. **Exam Insight** (`card`, deterministic from the
bundled syllabus: frequency/difficulty/time-target for the student's exam) · 6. **Mastery Status** (`metric`, the
canonical "{acc}% over {n}", only when data exists) · 7. **Recommended next step** (`callout` + `mission`, by
mastery tier). The Simpler/Go-deeper/Another-like-this/Drill chips then **extend** the document — they never
reveal core value that should have been there from the start.

### 6a. QuanAI Planner — a deterministic engine the model only narrates (ADR-046)

The Planner is the strongest expression of §0's doctrine: **all scheduling is deterministic; the LLM only writes
prose.** It is the ONE study planner — the legacy one-shot Mission (`aiMissions` + `plan.generate` + `planLogic`)
was fully removed in ADR-047.

- **Syllabus DB** (`main-app/data/syllabus.js`, bundled not Firestore; ADR-067): 17 exams → 5 family syllabi, 50 topics,
  each with importance/frequency/difficulty/prereqs/revision-cadence/est-minutes, a `drillable` link to one of
  the 14 cats (or null), and a weighted `signals[]` map. **The 14 drillable cats are SIGNALS, not limits** — every
  syllabus topic is scheduled; non-drillable ones say "study from your resources". A new drillable cat plugs into
  `signals[]` with no engine change.
- **Engine** (`signals.js` → `readiness.js` → `plannerEngine.js`, pure): infers per-topic readiness from in-app
  practice (**never "no data"** — lifetime accuracy, then neutral 0.5); a 0..100 Exam Readiness Score; a
  Completion Forecast (buffer, pace, "+15 min/day"); and a 14-day scheduler (priority, prereq cascade-unlock,
  revision interleaving, adaptive difficulty, adaptive buffer/mock, Smart Catch-up).
- **LLM** (`planner.narrate@1`, ≤320 tok, one call per block): turns the engine's `rationaleSeed` into the
  rationale + encouragement only. Cold-start / failure → deterministic copy. Never schedules, never required.
- **Surfaces:** a companion setup wizard (searchable exam, calendar date, study slider to 8h, days/week, prep
  level, preferred time) and the `#view-planner` calendar (readiness ring, forecast, day cells, task checkboxes,
  per-task explainability). API `action=planner` ops get/setup/toggle/regen; doc `aiPlanner/{uid}` (see
  FIRESTORE_BLUEPRINT). The Coach references today's planner tasks.
- **Accuracy floor:** planner requests carry a `clientStats` snapshot merged by `studentContext` as a
  raise-only, fenced floor — so a stale `users.stats` doc never shows false-zero accuracy after a live session.

---

## 7. Token & cost discipline (enforced)

- `max_tokens` ceilings per prompt: `chat` 256–384, `explain` 512, `coach` 768, `insights` 768, `plan` 2048.
- Serialized student context capped (~1400 chars) by `studentContext.serialize()` (drops lowest-priority fields).
- Caches: `aiContext/{uid}` 6h (shared); `explanations/{hash}_v{promptVersion}` (shared base, **version-keyed** so a
  prompt bump busts stale text — ADR-045); `aiDaily/{uid}_{date}` (coach/insights/today consolidated, **fallback
  envelopes are never cached** so a transient model failure can't pin bad advice all day); chat turns uncached.
  Cold-start skips the model entirely.
- **Freshness on practice (ADR-045):** finishing a drill stamps `qr_ai_dirty_at`; each AI surface (coach/insights/
  plan) then forces ONE fresh server context (threaded into `buildContext`) on its next open, so advice reflects the
  practice the student just did instead of the 6h cache. Per-feature + a manual header "↻" refresh; bounded by the
  enforced budget breaker.
- **Enforced budget breaker** (`api/ai.js` → `enforceAiBudget`): over `config/aiBudget` daily cap → `503`.

---

## 8. Prompt governance (modular + versioned)

All prompts live in `services/aiPrompts.js` as versioned entries `{ id, version, system, build(vars), schema,
maxTokens, temperature }`. Prompt edits **bump the entry version** (e.g. `coach.daily@2`) so output shape changes are
traceable and A/B-able. Every user-derived string is wrapped in `<<<DATA>>> … <<<END>>>` and the system prompt
instructs the model to treat delimited content as **data, never instructions** (prompt-injection defense, see
SECURITY_ARCHITECTURE).

---

## 9. Analytics

Every surface emits `aiEvents` (owner-write, immutable): `shown | opened | chip_tap | deeplink | helpful_yes |
helpful_no | challenge_correct`, batched + flushed lazily by `js/services/ai-analytics.js`. The shared daily cron
rolls these into `systemMetrics/ai_engagement_{date}` to answer "which AI feature drives premium conversion /
retention." No always-on infra (Spark-safe).

---

## 10. Future-model note (documented, NOT implemented)

We ship on `gpt-4o-mini` only. The `llmProvider` seam keeps a future model swap a one-file change. Candidates to
re-evaluate later **per feature** (do not implement now): richer Planner narration and long-context block review
could benefit from a stronger reasoning model. Any such change is a separate ADR.

**Roadmap (product, not model) — the top deferred items, in priority order:**
1. ~~**Interactive mini-challenge**~~ — **SHIPPED (ADR-045)** as the in-place `drill` chip / micro-drill.
2. **SSE streaming** of the prose `say` field (perceived-latency polish; staged skeletons cover it today).
3. **Automated end-of-block Planner regen** as a per-user cron pass (today the Planner regenerates on demand via
   "Plan my next 2 weeks" + auto Smart Catch-up on open; a scheduled re-plan is deferred for cost/timeout reasons).
