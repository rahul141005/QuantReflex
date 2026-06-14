# QuanAI — Deep Production Audit & Remediation (ADR-045)

**Date:** 2026-06-14 · **Scope:** the QuanAI AI ecosystem inside `main-app` — Coach, Insights, Explain,
Study Planner (+ shared brain, prompts, context engine, renderer). **Method:** read-only trace of every
feature path, then targeted remediation. **Model:** unchanged — `gpt-4o-mini` only (compensate with
architecture, not a bigger model). **Verification:** `node --check` on every changed file + 16 deterministic
unit tests (`cd main-app && npm test`) + the manual QA checklist (§ end).

> **Headline:** the architecture was already unusually disciplined (ADR-039 "one brain, one voice":
> deterministic analysis in `studentContext.js`, versioned prompts, a single LLM seam, one renderer). The
> defects that remained were not "does it work" bugs — they were the subtle **trust**, **one-mentor
> identity**, and **"feels-alive"** gaps that decide whether a Premium user renews. Those are now fixed.

---

## 1. Everything that changed

**New modules (pure, no `firebase-admin` → unit-testable):**
- `main-app/services/quantTopics.js` — the **single source of truth** for the 12 quant categories +
  `nearestCategory()` (maps an LLM free-text topic to a real drillable category).
- `main-app/services/planLogic.js` — `normalizePlan()` (feasibility + topic grounding) and
  `missionProgress()` (deterministic live progress).
- `main-app/scripts/test-ai.js` — 16 tests; wired as `npm test`.

**Edited:**
- `services/aiPrompts.js` — universal exam-aware persona; `examName` threaded into every prompt; Explain
  follow-ups made deterministic; planner constrained to real categories + summing phases; **all 6 prompt
  versions bumped**.
- `services/aiBrain.js` — registry-derived `promptId` (drift killed); `examName` into every call; fallback
  envelopes no longer cached; `force` threaded into `buildContext`; version-keyed explain cache; cold-start
  copy fix; plan grounded + normalized + persisted with real categories; `_missionEnvelope` rewritten to
  render real progress and drive the daily drill from the plan's own focus.
- `services/studentContext.js` — imports the shared topic map; computes `today.cats` + `weekCats` (no extra
  read); `force` honored.
- `services/aiService.js` — removed an unused, drifted `CATEGORY_LABELS` copy.
- `api/ai.js` — `force` accepted on the mission `get`/`today` ops.
- `js/companion-ui.js` — per-feature freshness (practice-dirty → force once); header "↻" refresh; free-text
  **"Other…"** exam step.
- `js/drill-engine.js` — stamps `qr_ai_dirty_at` when a session is recorded.
- `css/style.css` — refresh button + free-text input styles.
- Bible sync: `AI_INTERACTION_SYSTEM.md`, `CHANGELOG.md`.

---

## 2. Every bug found (and fixed)

| # | Severity | Bug | Evidence (pre-fix) | Fix |
|---|----------|-----|--------------------|-----|
| B1 | 🟠 Trust | **Prompt-version drift.** `meta.promptId` was hardcoded `insights.analyze@2`, `explain.base@2`, `plan.generate@2`, `chat.turn@1` while the registry was at v3 — so the A/B traceability + `shown` analytics the doctrine promises were wrong. | `aiBrain.js` literals vs `aiPrompts.js` versions | `promptId` derived from `prompts.get().version`; all entries bumped. |
| B2 | 🟠 Trust | **Fallback cached all day.** A transient model failure cached the degraded fallback envelope in `aiDaily`, and Coach exposed no refresh → user stuck with bad advice till tomorrow. | `_putDaily(uid,'coach',env)` unconditional | Guard: never cache `meta.fallback`. |
| B3 | 🟠 Trust | **`force` never reached the context engine.** Even `force:true` reused the 6h `aiContext` cache — refresh was a no-op for stats. | `coachToday`/`insights` called `buildContext(uid)` | `buildContext(uid,{force})` threaded everywhere. |
| B4 | 🟠 Identity | **Hardcoded "CAT" persona** for every exam — a Bank PO / SSC / GMAT student was coached as a "CAT speed-math coach". | `aiPrompts.sys()` | Universal exam-aware persona. |
| B5 | 🟠 Identity | **Custom exam silently discarded.** Interview mapped "Other" → `'CAT'`. | `['Other','CAT']` | Free-text "Other…" step; honored by name end-to-end. |
| B6 | 🟡 Consistency | **Plan ≠ drill.** "This week's focus" came from the model while "Today: drill X" came from a *separate* `topWeakCategory` → the stated plan and the launched drill could differ. | `_missionEnvelope` | Daily drill driven by the plan's own `weekFocus[0].cat`. |
| B7 | 🟡 Trust | **Planner could hallucinate a syllabus / impossible timeline** — free-text topics, phase durations that didn't sum to the time left, no feasibility check. | `plan.generate` had no validator | `normalizePlan()` grounds topics + scales durations; tested. |
| B8 | 🟡 Alive | **Progress never tracked.** Timeline `done:false` hardcoded; `progress:{}` never used → the "living plan" was static. | `_missionEnvelope` | `missionProgress()` renders real done/current + practiced ✓ + stale-week nudge. |
| B9 | 🟡 Consistency | **Stale explanations forever.** `explanations/{hash}` had no version key → a prompt bump kept serving old, off-voice text. | cache id = `_hash(q:a)` | Version-keyed id `…_v{n}` + stored `promptVersion`. |
| B10 | 🟢 Copy | Cold-start Coach said "I'm your coach, QuanAI" (addresses the *student* as QuanAI). | `aiBrain.js:64` | "I'm QuanAI, your coach." |
| B11 | 🟢 Hygiene | Unused, **drifted** `CATEGORY_LABELS` duplicate in `aiService.js` (`'Squares & Square Roots'` vs `'Squares & Roots'`). | `aiService.js:45` | Removed; one source of truth. |

**Verified already-fixed (no action):** the `ai/usage` vs `usage/ai` schema drift (M1) — `firestore-sync.js`
confirms the legacy mirror was removed and `users/{uid}/usage/ai` is the single quota source; deep-link
no-op (ADR-040); chat-history double-count (ADR-040); undefined PERSONA (ADR-043).

---

## 3. Every UX improvement

- **Freshness you can feel:** finish the drill your Coach prescribed → reopen → it reflects the new data
  (per-feature, once per practice burst) instead of repeating itself. Plus a manual header **"↻"**.
- **Living plan:** real phase progress (done / in-progress), per-topic accuracy with a ✓ when you've
  practiced it this week, a "done today ✓ — extra set" state, and a "this week's plan is N days old" nudge.
- **Any exam, by name:** free-text "Other…" so the experience speaks about *your* exam (XAT, SBI PO, NDA,
  campus placement, …), not a generic one.
- **Honest refresh copy:** a subtle "Updated from your latest practice" callout when a surface force-refreshes.
- **No dead-ends preserved:** every surface still ends in chips; fallbacks still actionable.

## 4. Every AI-prompt improvement

- One **universal exam-aware** persona (`sys(role, examName)`): identity is constant, coaching adapts; exam
  injected **wrapped as `<<<DATA>>>`** (injection-safe), with an explicit "never fabricate a syllabus" guard.
- **Deterministic Explain follow-ups:** the `chat.turn` system prompt now encodes that *simpler* = same
  concept, fewer/bigger/plainer steps (never longer); *deeper* = same concept + the reasoning why; *another*
  = same concept, **same difficulty**, different numbers. No longer luck-of-the-draw.
- **Planner constrained:** must choose `weekFocus` only from the real category list and make phase
  `durationDays` sum to the days remaining (and then `normalizePlan` enforces it deterministically anyway).
- **Version governance honored:** every edited entry bumped (coach.daily→4, insights.analyze→4,
  explain.base→4, chat.turn→3, plan.generate→4, wp.generate→3).

## 5. Every architectural improvement

- **One topic vocabulary** (`quantTopics.js`) shared by the context engine, the planner, and tests — drift
  eliminated; `nearestCategory()` is the new bridge from model language → drillable action.
- **Pure, testable planner logic** (`planLogic.js`) split out from the admin-coupled brain → 16 unit tests
  with zero new tooling.
- **Freshness model** (ADR-045): a single client stamp + per-feature last-seen compare; `force` plumbed end
  to end (client → `api/ai` → `aiBrain` → `buildContext`). Clean, bounded, no new infra.
- **`promptId` sourced from the registry** — analytics and A/B are now structurally correct.

## 6. Every performance improvement

- **No extra Firestore reads** for the new progress/freshness signals — `today.cats`/`weekCats` are derived
  from the sessions `buildContext` already fetches; progress is pure in-memory math.
- **Freshness is bounded:** at most one forced rebuild per feature per practice burst (not per open), still
  behind the enforced daily budget breaker. Cold-start still skips the model entirely.
- **Removed dead code** (the duplicate label map) — smaller surface, no drift maintenance.
- **Version-keyed explain cache** keeps the shared-cache hit-rate win while guaranteeing correctness on bumps.

## 7. Every personalization improvement

- Coaching, examples, topic priorities and pacing now adapt to the **student's actual exam** across all four
  features, while the personality stays one QuanAI.
- The planner targets **real weak categories** (grounded), annotates focus topics with the student's **real
  accuracy**, and reacts to **what they practiced today / this week**.
- Custom exams are first-class (free-text), future-proofing the product beyond CAT.

## 8. Every premium-experience improvement

- The plan **feels alive** (progress, "done today", stale-week nudge) — the single biggest "why I paid"
  upgrade for the flagship feature.
- Coach/Insights **keep up with you** the same day you practice, instead of feeling like a static daily card.
- The "↻" refresh + honest "updated from your latest practice" build visible trust that QuanAI is watching.

## 9. Every consistency improvement

- The stated weekly plan and the launched drill can no longer diverge.
- One persona / voice / topic vocabulary / version scheme across Coach, Insights, Explain, Planner.
- Analytics `promptId` matches the real prompt that ran.

## 10. Trust audit result

QuanAI never fabricates statistics — every number is server-computed (`studentContext.js`); the model only
phrases. This pass extended that honesty to the planner (no invented syllabus, no impossible timeline), to
caching (no stale fallback, no stale explanation, no stale post-practice advice), and to analytics (true
prompt versions). When data is thin, cold-start copy is explicit and skips the model. ✅ No fabricated
intelligence found or introduced.

---

## Production verdict

### ✅ Premium quality — top of the band, entering 🌟 on the core loops

For the **Coach / Insights / Explain / Study-Planner** loops a Premium user lives in, this is now genuinely
"*exactly why I paid*": grounded in real numbers, one consistent exam-aware mentor, a plan that visibly
adapts to today's practice, and no stale or inconsistent output to erode trust. The deterministic surround is
either unit-tested or covered by the manual checklist below.

I am **not** rating it 🌟 World-class / 👑 Best-in-class, honestly, because of deliberately-deferred items that
a true world-class bar would include (none are regressions — they're roadmap):
- **No token streaming** — perceived latency relies on staged skeletons (real product polish gap).
- **No interactive in-conversation mini-challenge** (the flagship "feel-alive" item, deferred since ADR-040).
- **In-session-only Coach memory** — no durable multi-session conversation (deferred P3).
- **`gpt-4o-mini` reasoning ceiling** for deep weekly review (intentional cost choice).
- **Word Problems** is "Coming Soon", not yet a live differentiator.

Closing streaming + the mini-challenge would, on their own, move the core experience to a defensible 🌟.

---

## Manual QA checklist (live, real-key sign-off)

Run signed in as a **Premium** user unless noted. ✅ = expected.

**Cold start / data states**
- [ ] New user (0 Qs): Coach & Insights show deterministic "do ~10/20 to unlock" copy, **no LLM call**, cold-start chips.
- [ ] Partial (≥20 Qs): real metrics appear; weak topics grounded to real categories.
- [ ] Heavy user: trends/mastery populate; no truncation errors.

**Exam-aware**
- [ ] Run the planner interview for each: CAT, GMAT, Bank PO, SSC CGL → plan + coach reference that exam.
- [ ] Choose **Other…**, type "XAT" / "SBI PO" / "campus placement" → the typed name is used everywhere (not "CAT").
- [ ] Empty/odd typed exam → falls back gracefully to "my exam", no crash.

**Explain → Drill → Return**
- [ ] Explain a question → **Simpler** yields fewer/plainer steps; **Go deeper** adds reasoning; **Another like this** = same concept, same difficulty, different numbers.
- [ ] **Drill this** launches the matching focused drill (view switches, drill starts).
- [ ] Re-explain the SAME question after a prompt version bump → fresh text (version-keyed cache).

**Freshness / cache invalidation**
- [ ] Open Coach → note advice. Practice a set. Reopen Coach → it force-refreshes (note "Updated from your latest practice"), reflects new stats. Repeat once for Insights and once for Plan (each refreshes independently).
- [ ] Tap the header **↻** on Coach/Insights/Plan → forced refresh.
- [ ] Without practicing, reopen same-day → served from cache (fast, no forced LLM).

**Study Planner (living)**
- [ ] Generate a plan: phase durations **sum to the days-to-exam**; weekFocus topics are all real categories.
- [ ] "Today: drill X" matches `weekFocus[0]`; after practicing it today → shows "Done today ✓ — extra set".
- [ ] Timeline marks elapsed phases done + current phase "in progress".
- [ ] Leave a plan untouched > 7 days → "this week's plan is N days old" nudge appears; **Adjust my plan** regenerates.
- [ ] Long plan (180d) and short plan (30d) both feasible; missed days → Adjust reshuffles.

**Premium vs free / errors / offline**
- [ ] Free user: Coach/Insights/Plan show paywall (`PREMIUM_REQUIRED`); Explain works.
- [ ] Force a model failure (or budget cap): friendly callout + Retry; **fallback NOT cached** (retry later succeeds and is cached).
- [ ] Network drop mid-generation: error callout + Retry re-invokes the original action.
- [ ] Refresh-during-generation: closing/reopening doesn't wedge state.

**Sync / analytics**
- [ ] `qr_ai_dirty_at` set on session save; `qr_ai_seen_{coach,insights,plan}` advance only after a successful forced render.
- [ ] `aiEvents` `shown` carries the correct `promptId@version`; quota reads/writes hit `users/{uid}/usage/ai` only.

**Automated:** `cd main-app && npm test` → 16 passed (quantTopics grounding, plan normalization/feasibility,
mission progress). Re-run after any change to the deterministic helpers.
