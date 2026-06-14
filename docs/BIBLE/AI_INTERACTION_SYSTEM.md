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
7. **Cache + skip.** Reuse context (90s — short enough to stay live to the current session; `force` bypasses after a
   drill), plus a fresh "today" layer read every call, shared explanations, daily caches; **cold-start users never
   hit the model** (deterministic copy). Cheap and instant. (ADR-045 — was 6h, which froze QuanAI to the session.)

---

## 1. Persona — "QuanAI"

One personality across all five features. The name is the `PERSONA` constant, defined in two mirrored places:
the server source-of-truth `services/aiPrompts.js` (injected into every system prompt + exported as `prompts.PERSONA`)
and the client `js/companion-ui.js` (modal badge + throttle copy). Change both to re-brand.

- **Role:** a sharp, encouraging CAT speed-math coach who has watched this student practice every day.
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

### Chip
```jsonc
Chip = { "label": string, "value": string, "icon"?: string,
         "kind": "reply" | "deeplink" | "drill" | "dismiss",
         "deepLink"?: { "mode": string, "category"?: string, "count"?: number },  // when kind=deeplink
         "drill"?:    { "category": string, "label": string } }                   // when kind=drill (ADR-045)
```
- `reply` → sends `value` back as the next `chat` turn (continues the conversation).
- `deeplink` → calls `startDrillFromPractice(mode, category, label)` (`practice-modes.js`) and logs `deeplink`.
  Used for deliberate session starts (Coach/Insights/Mission "start a set").
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
- **Cold-start** (`totalAttempted < 20`): deterministic, friendly copy + a "do 10 to unlock" mission. **No LLM call.**
- **Cross-feature awareness (one brain):** Explain writes the struggled concept; Insights writes discovered
  weaknesses; Coach reads today's plan + recent insights + explained concepts; Study Plan & Word Problems target
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
- **Empty/insufficient data:** the cold-start deterministic path (no LLM), with a clear unlock mission.
- **Offline:** features that have a cached AIResponse render it (read-only, "offline" callout); others show the
  retry callout.

---

## 6. The five features — one brain, distinct roles (no overlap)

| Feature | Single responsibility | Must NOT do |
|---|---|---|
| **AI Explain** | Interactive concept learning + adaptive explanations (simpler/deeper/another/got-it) | Give study strategy or trends |
| **AI Coach** | Daily mentor: accountability, motivation, ONE prescribed next action, remembers convos | Re-explain a question; build a multi-day plan |
| **AI Insights** | Performance intelligence: weakness discovery + trends → **actionable missions, not reports** | Daily check-in chatter; teach a concept |
| **AI Study Plan** | Living roadmap that adapts continuously to real progress (interview → daily action → weekly review) | One-off advice; per-question explanation |
| **Word Problems** | Context-aware practice generation targeting the student's weakest concepts (future-ready) | Coaching, planning |

Every feature: consumes Context + Memory, renders via the block vocabulary, ends in chips, deep-links real drills,
shows a **"Was this helpful?"** chip pair (logs `helpful_yes/no`, feeds `preferredDepth`).

---

## 7. Token & cost discipline (enforced)

- `max_tokens` ceilings per prompt: `chat` 256–384, `explain` 512, `coach` 768, `insights` 768, `plan` 2048.
- Serialized student context capped (~1400 chars) by `studentContext.serialize()` (drops lowest-priority fields).
- Caches: `aiContext/{uid}` 90s (shared, live to the session; `force` bypasses — ADR-045) with a fresh "today"
  layer each call; `explanations/{hash}` (shared base); `aiDaily/{uid}_{date}` (coach/insights/today consolidated,
  per-day — the real LLM-cost bound); chat turns uncached. Cold-start skips the model entirely.
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
re-evaluate later **per feature** (do not implement now): deeper multi-step Mission generation and long-context
weekly review could benefit from a stronger reasoning model. Any such change is a separate ADR.

**Roadmap (product, not model) — the top deferred items, in priority order:**
1. ~~**Interactive mini-challenge**~~ — **SHIPPED (ADR-045)** as the in-place `drill` chip / micro-drill.
2. **SSE streaming** of the prose `say` field (perceived-latency polish; staged skeletons cover it today).
3. **Automated weekly Mission review** as a per-user cron pass (today the Mission adapts via the live context rebuild
   + a manual "Adjust my plan"; a scheduled LLM re-plan is deferred for cost/timeout reasons on the single cron).
