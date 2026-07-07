/**
 * AI domain API (ADR-017, redesigned ADR-039) — ONE serverless function (Vercel Free: ≤12 functions).
 * withAuth (JWT + entitlement). Premium unlocks every action; a FREE user gets 5 lifetime "explain" calls (ADR-103)
 * and nothing else.
 *
 * Gating order: methodGuard(POST) → aiKillSwitch → aiThrottle → enforceAiBudget → entitlement → dispatch.
 * Entitlement: premium → proceed; else action==='explain' → consume one free credit (or 403); else → 403.
 *
 * The AI brain (services/aiBrain.js) is the single orchestrator. The client sends ONLY the action + minimal
 * inputs; ALL student context is read server-authoritatively (no client-sent stats). Responses carry an
 * AIResponse block envelope (AI_INTERACTION_SYSTEM §2) under `response`.
 *
 *   POST ?action=explain        { question, answer, category }            → interactive explanation
 *   POST ?action=coach                                                    → daily mentor
 *   POST ?action=insights                                                 → performance intelligence
 *   POST ?action=chat           { feature, topic, userTurn, history }     → conversational turn
 *   POST ?action=planner        { op:'get'|'setup'|'toggle'|'regen', clientStats?, ... } → QuanAI Planner (the study plan)
 *   POST ?action=wordproblems   { category, difficulty }                  → context-aware practice (future-ready)
 */

const { withAuth, formatError, methodGuard } = require('./_lib/middleware');
const aiService = require('../services/aiService');
const aiBrain = require('../services/aiBrain');
const { isEnabled } = require('./_lib/config-flags');

var MAX_QUESTION_INPUT_LENGTH = 500;

async function _explain(req, res) {
  var body = req.body || {};
  var question = typeof body.question === 'string' ? body.question.substring(0, MAX_QUESTION_INPUT_LENGTH) : '';
  var answer = body.answer;
  var category = typeof body.category === 'string' ? body.category : '';
  if (!question || answer === undefined) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Missing required fields: question, answer', retryable: false } });
  }
  var response = await aiBrain.explainBase(question, String(answer).substring(0, 50), category, req.userId);
  /* Counter de-dup (ADR-103): a FREE user's explanation was already metered transactionally in the gate
     (consumeFreeExplain); count only PREMIUM users here for telemetry. One writer per user type keeps
     usage/ai.explanationsUsed an accurate total and stops a free user's 5 from burning down twice as fast. */
  if (req.userPremium) aiService.trackExplanationUsage(req.userId).catch(function (e) { console.warn('[api/ai] explain usage track failed:', e.message); });
  var out = { response: response };
  /* Echo the remaining free-explain count so the client can show "N free explanations left" (absent for premium). */
  if (req.freeExplain) out.freeExplain = req.freeExplain;
  return res.json(out);
}

/* The student's LOCAL calendar date ('YYYY-MM-DD'), sent by the client so "today" is never UTC (ADR-049). */
function _clientDate(body) {
  var d = body && typeof body.clientDate === 'string' ? body.clientDate.trim() : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined;
}

async function _coach(req, res) {
  // ADR-048: pass the clientStats floor (like the planner) so a drill finished moments ago isn't missed while
  // the debounced syncStats write is still in flight. ADR-049: clientDate so Coach matches the right day's plan.
  var response = await aiBrain.coachToday(req.userId, { force: !!(req.body && req.body.force), clientStats: _sanitizeClientStats(req.body && req.body.clientStats), clientDate: _clientDate(req.body) });
  aiService.trackGlobalAIUsage('coach', 1).catch(function () {});
  return res.json({ response: response });
}

async function _insights(req, res) {
  var response = await aiBrain.insights(req.userId, { force: !!(req.body && req.body.force), clientStats: _sanitizeClientStats(req.body && req.body.clientStats), clientDate: _clientDate(req.body) });
  aiService.trackInsightsUsage(req.userId).catch(function () {});
  return res.json({ response: response });
}

async function _chat(req, res) {
  var body = req.body || {};
  var response = await aiBrain.chatTurn(req.userId, {
    feature: typeof body.feature === 'string' ? body.feature.slice(0, 16) : 'chat',
    topic: typeof body.topic === 'string' ? body.topic.slice(0, 50) : '',
    userTurn: typeof body.userTurn === 'string' ? body.userTurn.slice(0, 400) : '',
    history: Array.isArray(body.history) ? body.history : [],
    // ADR-045: carry the Explain anchor so follow-ups deepen THIS question instead of drifting topics.
    question: typeof body.question === 'string' ? body.question.slice(0, 500) : '',
    lastExplanation: typeof body.lastExplanation === 'string' ? body.lastExplanation.slice(0, 900) : '',
    drill: typeof body.drill === 'string' ? body.drill.slice(0, 400) : '',
    // ADR-051: floor the context so a conversational turn agrees with the Coach dashboard on "today".
    clientStats: _sanitizeClientStats(body.clientStats), clientDate: _clientDate(body)
  });
  return res.json({ response: response });
}

/* Sanitize a client-sent stats snapshot before it is used as a NON-AUTHORITATIVE floor (ADR-046). Caps counts
   and object sizes so a malformed/oversized payload can't bloat reads or skew the model. Floors only ever raise. */
var _MAX_CATS = 40, _MAX_DAYS = 90, _NUM_CAP = 1e7;
function _num(x) { var n = Number(x); return (isFinite(n) && n >= 0) ? Math.min(n, _NUM_CAP) : 0; }
function _sanitizeClientStats(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var out = {
    totalAttempted: _num(raw.totalAttempted), totalCorrect: _num(raw.totalCorrect),
    todayAttempted: _num(raw.todayAttempted), todayCorrect: _num(raw.todayCorrect),
    dailyStreak: _num(raw.dailyStreak), categoryStats: {}, dailyHistory: {}
  };
  var cs = raw.categoryStats || {};
  Object.keys(cs).slice(0, _MAX_CATS).forEach(function (k) {
    if (typeof k === 'string' && k.length <= 40) out.categoryStats[k] = { attempted: _num(cs[k] && cs[k].attempted), correct: _num(cs[k] && cs[k].correct) };
  });
  var dh = raw.dailyHistory || {};
  Object.keys(dh).slice(0, _MAX_DAYS).forEach(function (k) {
    if (typeof k === 'string' && k.length <= 40) out.dailyHistory[k] = { attempted: _num(dh[k] && dh[k].attempted), correct: _num(dh[k] && dh[k].correct), sumTimes: _num(dh[k] && dh[k].sumTimes), count: _num(dh[k] && dh[k].count) };
  });
  return out;
}

/* Map a planner-op error to an HTTP response: a failed Firestore write is retryable (503) so the client can
   roll back and re-try; a missing plan/task is a 404 (ADR-048). */
function _plannerError(res, error) {
  if (error === 'write_failed') return res.status(503).json({ error: { code: 'WRITE_FAILED', message: 'Couldn\'t save your plan just now — please try again.', retryable: true } });
  return res.status(404).json({ error: { code: String(error).toUpperCase(), message: error, retryable: false } });
}

async function _planner(req, res) {
  var body = req.body || {};
  var op = typeof body.op === 'string' ? body.op : 'get';
  var clientStats = _sanitizeClientStats(body.clientStats);
  var clientDate = _clientDate(body);   // ADR-049: the student's LOCAL "today"

  if (op === 'get') {
    // ADR-051: pass the floor (client already sends it) so the on-load forecast/readiness reflect a fresh session.
    var got = await aiBrain.plannerGet(req.userId, { clientStats: clientStats, clientDate: clientDate });
    return res.json({ plan: got.plan || null, response: got.envelope || null });
  }
  if (op === 'setup') {
    var examDate = typeof body.examDate === 'string' ? body.examDate.trim() : '';
    if (examDate && !/^\d{4}-\d{2}-\d{2}$/.test(examDate)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'examDate must be YYYY-MM-DD.', retryable: false } });
    }
    var result = await aiBrain.plannerSetup(req.userId, {
      examId: typeof body.examId === 'string' ? body.examId.slice(0, 40) : 'other',
      examName: typeof body.examName === 'string' ? body.examName.slice(0, 100) : '',
      examDate: examDate, dailyMinutes: body.dailyMinutes, daysPerWeek: body.daysPerWeek,
      prepLevel: typeof body.prepLevel === 'string' ? body.prepLevel : 'average',
      preferredTime: typeof body.preferredTime === 'string' ? body.preferredTime : '',
      goal: typeof body.goal === 'string' ? body.goal : ''
    }, { clientStats: clientStats, clientDate: clientDate });
    if (result.error) return _plannerError(res, result.error);
    aiService.trackGlobalAIUsage('planner', 1).catch(function () {});
    return res.json({ plan: result.plan || null, response: result.envelope || null });
  }
  if (op === 'toggle') {
    var date = typeof body.date === 'string' ? body.date.trim() : '';
    var topicId = typeof body.topicId === 'string' ? body.topicId.slice(0, 60) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !topicId) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'toggle needs date (YYYY-MM-DD) and topicId.', retryable: false } });
    }
    var result2 = await aiBrain.plannerToggle(req.userId, {
      date: date, topicId: topicId, done: !!body.done,
      result: (body.result && typeof body.result === 'object') ? { accuracy: _num(body.result.accuracy) / (body.result.accuracy > 1 ? 100 : 1), attempted: _num(body.result.attempted), correct: _num(body.result.correct) } : null
    }, { clientStats: clientStats, clientDate: clientDate });
    if (result2.error) return _plannerError(res, result2.error);
    return res.json({ plan: result2.plan || null });
  }
  if (op === 'regen') {
    var r3 = await aiBrain.plannerRegenBlock(req.userId, { clientStats: clientStats, clientDate: clientDate });
    if (r3.error) return _plannerError(res, r3.error);
    aiService.trackGlobalAIUsage('planner', 1).catch(function () {});
    return res.json({ plan: r3.plan || null, response: r3.envelope || null });
  }
  if (op === 'reset') {
    // Start Over: fully destructive reset of the planner (deletes the plan + clears the exam-config memory mirror).
    var r4 = await aiBrain.plannerReset(req.userId);
    return res.json({ ok: !!(r4 && r4.ok) });
  }
  return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Unknown planner op: ' + op, retryable: false } });
}

async function _wordProblems(req, res) {
  var body = req.body || {};
  var category = typeof body.category === 'string' ? body.category.slice(0, 50) : '';
  var difficulty = (body.difficulty === 'easy' || body.difficulty === 'hard') ? body.difficulty : 'medium';
  var result = await aiBrain.wordProblem(req.userId, category, difficulty, req.userPremium, { clientStats: _sanitizeClientStats(body.clientStats) });
  if (result.error) {
    var map = { free_limit_reached: 403, daily_limit_reached: 429, generation_failed: 503 };
    return res.status(map[result.error] || 400).json({ error: { code: result.error.toUpperCase(), message: result.error, retryable: result.error === 'generation_failed' } });
  }
  return res.json({ problem: result.problem });
}

module.exports = withAuth(async function (req, res) {
  if (methodGuard(req, res, 'POST')) return;

  /* Emergency AI kill switch (ADR-021) — never call OpenAI while enabled. */
  if (await isEnabled('aiKillSwitch')) {
    return res.status(503).json({ error: { code: 'AI_DISABLED', message: 'AI features are temporarily disabled. Please try again later.', retryable: true } });
  }
  /* Per-user admin throttle (ADR-022) then the ENFORCED daily cost breaker (ADR-039). Applied to EVERY request that
     will call the model — free-tier explains included — and BEFORE any free credit is consumed, so a throttled or
     over-budget request never burns one of a free user's 5 explanations. */
  try {
    await aiService.enforceAiThrottle(req.userId);
    await aiService.enforceAiBudget();
  } catch (err) {
    if (err && err.code === 'AI_THROTTLED') return res.status(429).json({ error: { code: 'AI_THROTTLED', message: err.message, retryable: false } });
    if (err && err.code === 'AI_BUDGET_EXCEEDED') return res.status(503).json({ error: { code: 'AI_BUDGET_EXCEEDED', message: err.message, retryable: true } });
    return res.status(500).json({ error: formatError(err) });
  }

  var action = req.query.action || '';

  /* Entitlement (ADR-103). Premium unlocks every AI action (unchanged). A FREE user may use ONLY the real
     "Explain" feature, and only by spending one of their 5 lifetime free credits — every OTHER action stays fully
     Premium (strict `=== 'explain'` guard so coach/insights/chat/planner/wordproblems can never leak to free
     users). The credit is consumed here (server-authoritative, race-safe) and echoed to the client below. */
  if (!req.userPremium) {
    if (action !== 'explain') {
      return res.status(403).json({ error: { code: 'PREMIUM_REQUIRED', message: 'This feature requires Premium. Upgrade to continue.', retryable: false } });
    }
    var grant;
    try {
      grant = await aiService.consumeFreeExplain(req.userId);
    } catch (e) {
      console.error('[api/ai] consumeFreeExplain failed:', e.message);
      return res.status(500).json({ error: formatError(e) });
    }
    if (!grant.ok) {
      return res.status(403).json({ error: { code: 'PREMIUM_REQUIRED', message: 'You\'ve used all 5 free explanations. Upgrade to Premium for unlimited QuanAI explanations.', retryable: false } });
    }
    req.freeExplain = { remaining: grant.remaining };
  }

  try {
    if (action === 'explain') return await _explain(req, res);
    if (action === 'coach') return await _coach(req, res);
    if (action === 'insights') return await _insights(req, res);
    if (action === 'chat') return await _chat(req, res);
    if (action === 'planner') return await _planner(req, res);
    if (action === 'wordproblems') return await _wordProblems(req, res);
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown AI action: ' + action, retryable: false } });
  } catch (err) {
    console.error('[api/ai] action ' + action + ' failed:', err.message);
    /* ADR-103: a free user's credit was consumed in the gate, but the handler threw before delivering any content
       (explainBase's own generation catch returns a usable fallback, so it never lands here). Refund the credit so a
       transient server error never silently burns one of their 5 free explanations. Best-effort; never masks the 500. */
    if (req.freeExplain) { try { await aiService.refundFreeExplain(req.userId); } catch (_) {} }
    return res.status(500).json({ error: formatError(err) });
  }
});
