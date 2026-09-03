# AI Model Replacement Analysis for QuantReflex (`main-app`)

## Executive Summary

**Direct answer:** **Only under certain conditions.**

- If your goal is **higher output quality** for Coach/Insights/Explain with minimal engineering risk, replacing `gpt-4o-mini` with a stronger **API model** is realistic.
- If your goal is to **run the LLM locally** on i3 11th Gen + 8 GB RAM, this codebase and workload are not a good fit for high-quality local inference.
- The repository is architected so the model call is centralized (`services/llmProvider.js`), so same-provider swaps are easy, but cross-provider swaps require API/telemetry adaptation.

**My practical choice for this codebase:** a stronger cloud model through the same OpenAI chat-completions path (single-model first), then evaluate per-feature split only if cost/latency is unacceptable.

---

## Repository/Codebase Findings

### Scope actually inspected
- `/home/runner/work/confidential/confidential/main-app/api/ai.js`
- `/home/runner/work/confidential/confidential/main-app/services/aiBrain.js`
- `/home/runner/work/confidential/confidential/main-app/services/aiPrompts.js`
- `/home/runner/work/confidential/confidential/main-app/services/llmProvider.js`
- `/home/runner/work/confidential/confidential/main-app/services/aiService.js`
- `/home/runner/work/confidential/confidential/main-app/services/aiPricing.js`
- `/home/runner/work/confidential/confidential/main-app/services/studentProfile.js`
- `/home/runner/work/confidential/confidential/main-app/js/companion-ui.js`
- `/home/runner/work/confidential/confidential/main-app/js/ai-features.js`
- `/home/runner/work/confidential/confidential/main-app/js/drill-engine.js`
- `/home/runner/work/confidential/confidential/main-app/js/duel-manager.js`
- `/home/runner/work/confidential/confidential/main-app/js/views/planner-view.js`
- `/home/runner/work/confidential/confidential/main-app/vercel.json`
- `/home/runner/work/confidential/confidential/main-app/package.json`

### Ground truth summary
- AI calls are server-side via `api/ai.js` + `services/aiBrain.js` + `services/llmProvider.js`.
- Model is hardcoded to **`gpt-4o-mini`** in `llmProvider.js`.
- One OpenAI call abstraction is used for all student-facing AI features.
- Client never calls OpenAI directly.
- AI outputs are mostly structured JSON with strict schema mode.

---

## AI Architecture

## End-to-end path (common)
1. UI triggers in `js/drill-engine.js`, `js/duel-manager.js`, `js/ai-features.js`, `js/companion-ui.js`.
2. Client calls `POST /api/ai?action=...` (`js/companion-ui.js:72`).
3. Auth + entitlement + throttles + budget gates in `api/_lib/middleware.js` and `api/ai.js`.
4. Feature dispatch in `api/ai.js` to `aiBrain` methods.
5. `aiBrain` builds deterministic context from `studentProfile` / planner state.
6. `aiPrompts` builds prompt + schema.
7. `llmProvider.complete()` executes OpenAI chat completion with retries.
8. `aiBrain` transforms parsed model output into deterministic block envelopes for UI.

## Provider/model layer
- Provider SDK: `openai` (`services/llmProvider.js`, `services/aiService.js`, `main-app/package.json`).
- LLM API used: `client.chat.completions.create(...)` (`services/llmProvider.js:96`).
- Model constant: `AI_MODEL = 'gpt-4o-mini'` (`services/llmProvider.js:19`).

## Output contract
- Structured mode: `response_format: { type:'json_schema', json_schema:{ strict:true } }` (`services/llmProvider.js:90-95`).
- Parse path: JSON.parse model content (`services/llmProvider.js:103-105`).
- Optional semantic validation per prompt (`validate`) and retry on failure.

## Retry behavior
- Default retries: 2 (total up to 3 attempts) (`services/llmProvider.js:75,79`).
- Temperature decays each retry by 0.2 (`services/llmProvider.js:87`).
- Backoff: fixed 800 ms between attempts (`services/llmProvider.js:111`).

## Streaming behavior
- Non-streaming blocking completions only (`services/llmProvider.js`, comment lines 13-15). No SSE implementation observed.

## Caching/persistence relevant to AI quality
- Daily envelope cache for coach/insights: `aiDaily/{uid_feature_date}` (`services/aiBrain.js:108-124`).
- Shared per-question explanation cache: `explanations/{hash_version_lang}` (`services/aiBrain.js:67-71,455,471-473,490`).
- Planner persistence: `aiPlanner/{uid}` (`services/aiBrain.js:658+`).
- User AI memory: `users/{uid}.aiMemory` (`services/aiService.js:1152+`).

## Gating/rate/cost controls
- API kill switch (`api/ai.js:194-197`).
- Middleware per-user request cap (`api/_lib/middleware.js:89-90,200-205`).
- Admin per-user daily AI throttle (`services/aiService.js:1097+`).
- Daily budget breaker (`services/aiService.js:1206+`).
- Free explain credits for non-premium (`api/ai.js:212+`, `services/aiService.js:1044+`).

---

## AI Drill Explanations

## Where implemented
- Trigger from drill flow: `js/drill-engine.js:931-963`.
- Trigger from duel review: `js/duel-manager.js:536-545`.
- UI orchestration: `js/ai-features.js:160`, `js/companion-ui.js:601-605`.
- API handler: `api/ai.js` (`action=explain`, `_explain`).
- Core feature: `services/aiBrain.js` (`explainBase`).
- Prompt/schema: `services/aiPrompts.js` (`explain.base`, `explain.followup`).

## Model usage
- Base explanation: one call to `llm.complete` via prompt `explain.base`.
- Follow-ups (“Simpler”, “Deeper”, “Another”, drill-result reactions): `chat` path via `explain.followup` or `chat.turn`.

## Prompt architecture (verified)
- System prompt uses shared `sys(...)` persona + safety rails.
- User prompt includes wrapped question, answer, topic label, known mistakes, prerequisite hint, heavy-practice hint (`aiPrompts.js:165-176`).
- Schema required fields (`explain.base`): `concept`, `steps[]`, `mistakes[]`, `shortcut`, `computedAnswer` (`aiPrompts.js:157-164`).
- Semantic validator checks computed answer matches expected answer (`aiPrompts.js:177-184`).

## Context supplied
- Question text (possibly enriched with DI chart/figure descriptions) from client.
- Student profile-derived personalization from `studentProfile.build`.
- Memory signals (`knownWeakConcepts`, `recentTopicsExplained`, `preferredDepth`) (`aiBrain.js:460-477`).
- Syllabus-derived known mistakes/prereq/usage frequency (`aiBrain.js:477-483`).

## Response handling
- If cache hit: no model call (`aiBrain.js:471-473`).
- If generation fails: deterministic fallback envelope with retry chip (`aiBrain.js:491-495`).
- Final UI always composed server-side from deterministic block builders (`say/card/steps/metric/callout`).

## Parameters/limits
- Prompt ID `explain.base` version 6, `maxTokens=560`, `temperature=0.3`.
- Follow-up prompt `explain.followup` version 2, `maxTokens=360`, `temperature=0.3`.
- Input limits at API boundary: question truncated to 500 chars (`api/ai.js:26,30`), answer to 50 chars (`api/ai.js:39`).

---

## AI Coach

## Where implemented
- UI entry: `js/ai-features.js:62,162`; opener `js/companion-ui.js:606`.
- API: `api/ai.js` (`action=coach`, `_coach`).
- Core: `services/aiBrain.js` (`coachToday`).
- Prompt/schema: `services/aiPrompts.js` (`coach.daily`).

## Model usage
- One model call for non-tier0 users via `coach.daily`.
- Tier 0 low-data users skip LLM, deterministic output (`aiBrain.js:141-147,239+`).
- Daily cache may avoid model call (`aiBrain.js:132`).

## Prompt architecture
- System: “personal mentor”, causality focus, explicit honesty rails, no generic motivation (`aiPrompts.js:87-99`).
- User: serialized profile context + optional plan + strategy levers + prescribed focus topic (`aiPrompts.js:100-103`).
- Structured schema required fields: `greeting`, `mentorNote`, `biggestWin`, `oneWorry`, `todayRecommendation`, `missionWhy`, `celebrate` (`aiPrompts.js:84-86`).

## Parameters
- Prompt version 9, `maxTokens=640`, `temperature=0.55`.

## Data supplied
- `studentProfile.serialize(ctx)`.
- Strategy summary + coach brief when exam plan exists (`aiBrain.js:153-155`).
- Flags note (burnout/careless/plateau/etc) (`aiBrain.js:150,101-106`).

## Malformed/failure handling
- Schema/parse/validation failures handled by retry in `llmProvider`; then feature fallback (`aiBrain.js:160-163`).
- Envelope not cached when fallback used (`aiBrain.js:164`).

---

## AI Insights

## Where implemented
- UI entry: `js/ai-features.js:161`; opener `js/companion-ui.js:607`.
- API: `api/ai.js` (`action=insights`, `_insights`).
- Core: `services/aiBrain.js` (`insights`).
- Prompt/schema: `services/aiPrompts.js` (`insights.analyze`).

## Model usage
- One model call for non-tier0 users.
- Tier0 users use deterministic low-data insights (`aiBrain.js:316-321,413+`).
- Daily cache may bypass model (`aiBrain.js:310`).

## Prompt architecture
- System role: analyst discovering hidden trade-offs and implications (`aiPrompts.js:127-135`).
- User prompt includes profile context, optional plan note, deterministic “discovery” seed, top weakness label (`aiPrompts.js:136-143`).
- Required output schema: `patternsIntro`, `headline`, `weaknessInsight`, `nextStepLabel` (`aiPrompts.js:124-126`).

## Parameters
- Prompt version 10, `maxTokens=440`, `temperature=0.4`.

## Data supplied
- Serialized student context.
- Strategy-derived top discovery and plan state.
- Weakness label from deterministic profile ranking.

## Response handling
- Model writes only compact prose.
- Metrics/pattern cards/forecast cards are deterministic server rendering (`aiBrain.js:362-410`).
- Failure -> deterministic fallback (`aiBrain.js:334-337,438-442`).

---

## AI Study Plan Generator

## Where implemented
- UI entry: `js/ai-features.js:97,163`; companion flow `js/companion-ui.js:614+`; planner view `js/views/planner-view.js`.
- API: `api/ai.js` (`action=planner`, op `setup/get/toggle/regen/reset`).
- Core planning: `services/aiBrain.js` + `services/examStrategy.js` + `services/planningEngine.js` + `services/plannerEngine.js`.
- LLM prompt: `services/aiPrompts.js` (`planner.narrate`).

## What is actually model-generated
- The schedule/strategy itself is deterministic (not LLM-generated).
- LLM is used for **narration text only** (`rationale`, `encouragement`) in `_narratePlan` (`aiBrain.js:729-746`).

## Prompt architecture
- Schema fields: `rationale`, `encouragement` (`aiPrompts.js:239-241`).
- User prompt includes wrapped JSON seed (`focusTopics`, `onTrack`, `readinessScore`, `examName`, language) (`aiBrain.js:739`).

## Parameters
- Prompt version 2, `maxTokens=320`, `temperature=0.4`.

## Failure behavior
- Cold start or LLM failure returns deterministic fallback narration (`aiBrain.js:731-737,743-746`).

---

## GPT-4o-mini Usage Map

## Verified references in executable main-app code
1. `services/llmProvider.js:19` → `var AI_MODEL = 'gpt-4o-mini';` (actual request model).
2. `services/aiPricing.js:14,18` → pricing/default fallback model for cost accounting.
3. All feature calls route through `llm.complete(...)` in `services/aiBrain.js`:
   - Coach (`line ~155`)
   - Insights (`~329`)
   - Explain base (`~487`)
   - Explain follow-up (`~587`)
   - Generic chat (`~606`)
   - Planner narration (`~740`)
   - Word problems (`~944`)

## Centralization assessment
- **Model selection is centralized** in `llmProvider.js`.
- **Provider assumptions are centralized** there too (OpenAI chat-completions schema behavior).
- Swap impact:
  - Same OpenAI API family: small change (plus `aiPricing.js` update).
  - Different provider SDK/response format: moderate refactor.

## Multimodal/tool-calling usage
- Tool/function calling: **not used**.
- Structured output JSON schema: **used heavily**.
- Multimodal image/file input to model: **not observed** (DI/LR visuals converted to text before send in `drill-engine.js:947-958`).

---

## Actual AI Requirements (derived from code)

## Hard requirements
1. Reliable structured JSON output compatible with strict schema behavior (or equivalent).
2. Strong instruction-following under compact but strict prompts.
3. Good arithmetic/explanation consistency (explain validator checks computed answer equality).
4. Stable non-streaming synchronous API usage.
5. API-accessible from serverless Node runtime.
6. Must tolerate retries and low-latency user experience in 60s function window (`vercel.json`).

## Important requirements
1. Good coaching-quality prose under constrained fields.
2. Strong deterministic-context grounding (avoid inventing trends beyond evidence line).
3. Low malformed-output rate (to avoid retries/fallbacks).
4. Reasonable cost per call since app has free explanations and budget breaker.
5. Good multilingual prose quality for `en/hi/mr` values.

## Nice-to-have requirements
1. Better long-form clarity in `mentorNote` and `headline`.
2. Better robustness to prompt-injection-like user text despite sanitization.
3. Better latency predictability under burst.

---

## Candidate Models (research-backed constraints)

**Important evidence note:** In this environment, direct fetches to many official provider doc domains (OpenAI, Anthropic, Google, xAI, Mistral, DeepSeek) failed due network/DNS restrictions. Therefore exact 2026 pricing/context numbers are **not determinable here**.

### Providers researched (URL-level evidence)
- OpenAI models/pricing docs URLs discovered via web research.
- Anthropic model/pricing docs URLs discovered via web research.
- Google Gemini model/pricing docs URLs discovered via web research.
- xAI/Mistral/DeepSeek official docs URLs discovered via web research.

### Practical short-list for this codebase
- **OpenAI stronger-than-mini model** (same API family) — easiest integration.
- **Anthropic mid/high model tier** — high quality candidate, requires provider integration refactor.
- **Google Gemini mid/high model tier** — strong candidate, requires provider integration refactor.
- **Mistral/Qwen/DeepSeek cloud APIs** — possible, but higher integration uncertainty with strict-schema and telemetry compatibility.

---

## Hardware Analysis (Your i3/8GB/256GB laptop)

## What laptop limits in this architecture
- For **cloud API inference**, laptop hardware mostly affects local dev ergonomics, not model intelligence.
- Current app performs LLM inference server-side via external API.

## What laptop limits for local model inference
- 8 GB RAM + i3 CPU + likely no strong discrete GPU makes high-quality local reasoning models impractical for this workload.
- Small quantized models may run, but likely too slow/weak for Coach/Insights/Explain quality expectations.
- Additional context and structured reliability demands increase failure risk on tiny local models.

---

## Model Comparison (for QuantReflex workload)

| Candidate class | Overall intelligence | Math/explanation quality | Structured output reliability | Integration ease | Cost control | Local feasibility on i3/8GB | Overall suitability |
|---|---|---|---|---|---|---|---|
| OpenAI stronger model (same family) | High | High | High (closest to current strict-schema path) | **High** | Medium | N/A (cloud) | **Best** |
| Anthropic stronger model | High | High | Medium-High (needs adaptation) | Medium | Medium | N/A (cloud) | Strong alternative |
| Gemini stronger model | High | Medium-High to High | Medium-High (needs adaptation) | Medium | Medium | N/A (cloud) | Strong alternative |
| Budget open model via API (Qwen/DeepSeek/Mistral class) | Medium-High | Medium-High | Medium (varies) | Medium-Low | **High** | N/A (cloud) | Best value if validated |
| Local small quantized model | Low-Medium for this task | Low-Medium | Low-Medium | Medium | Low runtime cost | **Weak** | Not recommended for primary AI |

---

## Benchmark/Evidence Analysis

## Verified facts
- Current implementation requires strict structured JSON for most features.
- Current model call is centralized and non-streaming.
- Deterministic architecture already handles much of “reasoning scaffolding” outside LLM.

## Analysis/inference
- Since outputs are tightly scoped and deterministic scaffolding is strong, upgrading model quality should primarily improve prose quality/consistency and reduce fallback/retry rates.

## Unknown / Not determinable from available code
- Real production token volume, p95 latency, and provider-specific failure rates.
- Current external benchmark winner for your exact prompt mix.
- Exact September 2026 pricing/context limits (official pages unreachable in this runtime).

---

## Local vs Cloud Analysis

## A) Cloud API usage from your laptop
- Fully realistic on your hardware.
- This is how code already works.
- Quality gains depend on chosen remote model, not local RAM/CPU.

## B) Local model usage on your laptop
- Possible technically with tiny quantized models.
- For this app’s coaching/explanation quality bar + strict structured outputs, **practically weak**.

**Best local model recommendation:** **No local model is recommended for this workload on this hardware.**

---

## Integration Analysis

## If replacing with a stronger OpenAI model
- Likely **configuration-only + pricing update**:
  - `services/llmProvider.js` (`AI_MODEL` constant)
  - `services/aiPricing.js` (rate table + default if changed)
  - cost tests in `main-app/scripts/ai-cost.check.js`

## If replacing with non-OpenAI provider
- **Moderate refactor** likely needed:
  - `services/llmProvider.js` request/response mapping
  - structured output compatibility adaptation
  - usage accounting field mapping (`prompt_tokens_details.cached_tokens` equivalent may differ)
  - env/config plumbing and possibly dependency changes

## Risk of parsing breakage
- High if provider does not match strict JSON schema behavior and response shape expected by `llmProvider`.

---

## Hidden Problems Found (quality-impacting)

1. **Single-model global choice:** no per-feature model routing; planner narration and explain share same model path even though quality/cost profiles differ.
2. **Strict output without schema-level length constraints:** enforced by prompt + clipping; malformed verbosity can still waste tokens before clipping.
3. **No provider fallback model:** hard failures degrade to deterministic fallback, but no automatic model failover.
4. **Blocking-only calls:** no streaming path; user-perceived latency depends on skeleton UX and retries.
5. **Retry policy is fixed:** same backoff and attempt policy for all features; not feature-sensitive.

---

## Model vs Prompt/Architecture Analysis

If `gpt-4o-mini` output is mediocre, based on code:

- The architecture is already strong (deterministic context, strict schemas, server-composed UI, explicit evidence rails).
- So remaining quality issues are likely a **combination** of:
  1. Model capability ceiling on nuanced coaching prose / insight sharpness.
  2. Prompt tuning opportunities (especially compression pressure from strict short fields).

Most likely biggest gain order for this codebase:
1. **Better model** (same architecture)
2. **Prompt refinement** for coach/insights narrative depth
3. **Feature-specific model routing** (only if cost/latency require it)
4. **Output validation refinement**

---

## Ranked Recommendations

## 🥇 Best overall replacement
**A stronger OpenAI chat-completions model in the same family as current deployment (replace `AI_MODEL` in `llmProvider.js`).**

Why:
- Minimal migration risk.
- Highest compatibility with existing strict schema + usage accounting path.
- Fastest path to measurable quality gain.

Tradeoffs:
- Higher cost likely.
- Need re-check of budget breaker thresholds and pricing table.

## 🥈 Best alternative
**Anthropic top/mid-tier Claude API model (cloud).**

Why:
- Strong instruction-following/coaching narrative potential.

Tradeoffs:
- Requires llm provider refactor and structured-output compatibility validation.

## 🥉 Best value option
**Low-cost open-model cloud API tier (Qwen/DeepSeek/Mistral class) after strict-schema A/B validation.**

Why:
- Potentially strong cost reduction.

Tradeoffs:
- Higher malformed-output risk and integration variance.

## Best local model
**No local model is recommended for this workload on this hardware.**

---

## Should You Replace GPT-4o-mini?

**Answer:** **Only under certain conditions.**

Replace if:
- You are willing to pay more per token for better quality.
- You keep cloud API inference.
- You can run a controlled A/B on real prompts and watch fallback/retry rates.

Do not replace yet if:
- Cost ceiling is very tight and current outputs are acceptable.
- You cannot validate new model reliability against strict JSON requirements.

## One model or multiple models?
- Start with **one stronger model for everything** (lowest complexity).
- Move to multi-model only if telemetry shows planner narration can use a cheaper model without quality loss.

---

## Final Recommendation

If this were my QuantReflex project on your i3/8GB laptop, I would:

1. Keep cloud inference architecture.
2. Replace `gpt-4o-mini` with a stronger **OpenAI-compatible** model first (same API path).
3. Update `aiPricing.js` and rerun cost controls/tests.
4. Run prompt-level A/B for Coach/Insights/Explain quality and fallback rate.
5. Only then consider per-feature model split.

**Expected improvement:** better coaching nuance, clearer explanation quality, stronger insight phrasing, fewer schema retries/fallbacks.

**Major disadvantage:** likely higher cost.

**Implementation difficulty:** low for same-provider swap; moderate for cross-provider.

**Local inference:** not worth targeting as primary path on this hardware.

---

## Sources

## Code sources (primary truth)
- `/home/runner/work/confidential/confidential/main-app/services/llmProvider.js`
- `/home/runner/work/confidential/confidential/main-app/services/aiPrompts.js`
- `/home/runner/work/confidential/confidential/main-app/services/aiBrain.js`
- `/home/runner/work/confidential/confidential/main-app/services/studentProfile.js`
- `/home/runner/work/confidential/confidential/main-app/services/aiService.js`
- `/home/runner/work/confidential/confidential/main-app/services/aiPricing.js`
- `/home/runner/work/confidential/confidential/main-app/api/ai.js`
- `/home/runner/work/confidential/confidential/main-app/api/_lib/middleware.js`
- `/home/runner/work/confidential/confidential/main-app/js/companion-ui.js`
- `/home/runner/work/confidential/confidential/main-app/js/ai-features.js`
- `/home/runner/work/confidential/confidential/main-app/js/drill-engine.js`
- `/home/runner/work/confidential/confidential/main-app/js/duel-manager.js`
- `/home/runner/work/confidential/confidential/main-app/js/views/planner-view.js`
- `/home/runner/work/confidential/confidential/main-app/vercel.json`
- `/home/runner/work/confidential/confidential/main-app/package.json`

## External research links captured during this run
- OpenAI models docs URL (discovered): `https://platform.openai.com/docs/models`
- OpenAI pricing URL (discovered): `https://platform.openai.com/pricing`
- Anthropic models docs URL (discovered): `https://docs.anthropic.com/claude/docs/models-overview`
- Anthropic pricing URL (discovered): `https://docs.anthropic.com/claude/docs/pricing`
- Google Gemini models URL (discovered): `https://ai.google.dev/models`
- Google Gemini pricing URL (discovered): `https://ai.google.dev/pricing`
- xAI docs URL (discovered): `https://developer.x.ai/docs`
- Mistral docs URL (discovered): `https://docs.mistral.ai/platform/endpoints/`
- DeepSeek docs URL (discovered): `https://platform.deepseek.com/docs/intro`

> Note: direct fetching of many official provider pages was blocked in this execution environment; exact up-to-date numerical model specs/pricing could not be independently verified here.
