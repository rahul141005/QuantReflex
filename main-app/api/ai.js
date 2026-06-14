/**
 * AI domain API (ADR-017, redesigned ADR-039) — ONE serverless function (Vercel Free: ≤12 functions).
 * withAuth (JWT + entitlement). Every action requires Premium.
 *
 * Gating order: methodGuard(POST) → aiKillSwitch → premium → aiThrottle → enforceAiBudget → dispatch.
 *
 * The AI brain (services/aiBrain.js) is the single orchestrator. The client sends ONLY the action + minimal
 * inputs; ALL student context is read server-authoritatively (no client-sent stats). Responses carry an
 * AIResponse block envelope (AI_INTERACTION_SYSTEM §2) under `response`.
 *
 *   POST ?action=explain        { question, answer, category }            → interactive explanation
 *   POST ?action=coach                                                    → daily mentor
 *   POST ?action=insights                                                 → performance intelligence
 *   POST ?action=chat           { feature, topic, userTurn, history }     → conversational turn
 *   POST ?action=mission        { op:'get'|'today'|'generate'|'regen', ... } → living study plan
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
  aiService.trackExplanationUsage(req.userId).catch(function (e) { console.warn('[api/ai] explain usage track failed:', e.message); });
  return res.json({ response: response });
}

async function _coach(req, res) {
  var response = await aiBrain.coachToday(req.userId, { force: !!(req.body && req.body.force) });
  aiService.trackGlobalAIUsage('coach', 1).catch(function () {});
  return res.json({ response: response });
}

async function _insights(req, res) {
  var response = await aiBrain.insights(req.userId, { force: !!(req.body && req.body.force) });
  aiService.trackInsightsUsage(req.userId).catch(function () {});
  return res.json({ response: response });
}

async function _chat(req, res) {
  var body = req.body || {};
  var response = await aiBrain.chatTurn(req.userId, {
    feature: typeof body.feature === 'string' ? body.feature.slice(0, 16) : 'chat',
    topic: typeof body.topic === 'string' ? body.topic.slice(0, 50) : '',
    userTurn: typeof body.userTurn === 'string' ? body.userTurn : '',
    history: Array.isArray(body.history) ? body.history : []
  });
  return res.json({ response: response });
}

async function _mission(req, res) {
  var body = req.body || {};
  var op = typeof body.op === 'string' ? body.op : 'get';

  var force = !!body.force;
  if (op === 'get') {
    var got = await aiBrain.missionGet(req.userId);
    if (!got.plan) return res.json({ plan: null });
    var todayEnv = await aiBrain.missionToday(req.userId, { force: force });
    return res.json({ plan: got.plan, response: todayEnv.envelope || null });
  }
  if (op === 'today') {
    var t = await aiBrain.missionToday(req.userId, { force: force });
    return res.json({ plan: t.plan || null, response: t.envelope || null });
  }
  if (op === 'generate' || op === 'regen') {
    var examName = typeof body.examName === 'string' ? body.examName.trim().substring(0, 100) : '';
    var examDate = typeof body.examDate === 'string' ? body.examDate.trim() : '';
    if (examDate && !/^\d{4}-\d{2}-\d{2}$/.test(examDate)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'examDate must be YYYY-MM-DD.', retryable: false } });
    }
    var result = await aiBrain.missionGenerate(req.userId, {
      examName: examName || 'CAT', examDate: examDate,
      dailyMinutes: body.dailyMinutes, goal: typeof body.goal === 'string' ? body.goal : '',
      confidence: typeof body.confidence === 'string' ? body.confidence : 'medium'
    });
    return res.json({ plan: result.plan || null, response: result.envelope || null });
  }
  return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Unknown mission op: ' + op, retryable: false } });
}

async function _wordProblems(req, res) {
  var body = req.body || {};
  var category = typeof body.category === 'string' ? body.category.slice(0, 50) : '';
  var difficulty = (body.difficulty === 'easy' || body.difficulty === 'hard') ? body.difficulty : 'medium';
  var result = await aiBrain.wordProblem(req.userId, category, difficulty, req.userPremium);
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
  if (!req.userPremium) {
    return res.status(403).json({ error: { code: 'PREMIUM_REQUIRED', message: 'This feature requires Premium. Upgrade to continue.', retryable: false } });
  }

  /* Per-user admin throttle (ADR-022) then the ENFORCED daily cost breaker (ADR-039). */
  try {
    await aiService.enforceAiThrottle(req.userId);
    await aiService.enforceAiBudget();
  } catch (err) {
    if (err && err.code === 'AI_THROTTLED') return res.status(429).json({ error: { code: 'AI_THROTTLED', message: err.message, retryable: false } });
    if (err && err.code === 'AI_BUDGET_EXCEEDED') return res.status(503).json({ error: { code: 'AI_BUDGET_EXCEEDED', message: err.message, retryable: true } });
    return res.status(500).json({ error: formatError(err) });
  }

  var action = req.query.action || '';
  try {
    if (action === 'explain') return await _explain(req, res);
    if (action === 'coach') return await _coach(req, res);
    if (action === 'insights') return await _insights(req, res);
    if (action === 'chat') return await _chat(req, res);
    if (action === 'mission') return await _mission(req, res);
    if (action === 'wordproblems') return await _wordProblems(req, res);
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown AI action: ' + action, retryable: false } });
  } catch (err) {
    console.error('[api/ai] action ' + action + ' failed:', err.message);
    return res.status(500).json({ error: formatError(err) });
  }
});
