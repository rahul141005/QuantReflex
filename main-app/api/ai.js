/**
 * AI domain API (ADR-017) — consolidates ai/explain + ai/insights + ai/study-plan into ONE
 * serverless function (Vercel Free: ≤12 functions/project). withAuth (JWT + entitlement).
 * All three actions require Premium.
 *   POST ?action=explain     → generateExplanation
 *   POST ?action=insights    → coach / insights (body.type: 'coach' | 'insights')
 *   POST ?action=study-plan  → study-plan ops. Outer routes on ?action; study-plan's INNER
 *                              body.action sub-ops (generate/get_active/finalize/update_progress)
 *                              are preserved unchanged.
 */

const { withAuth, formatError, methodGuard } = require('./_lib/middleware');
const aiService = require('../services/aiService');
const { isEnabled } = require('./_lib/config-flags');

var MAX_QUESTION_INPUT_LENGTH = 500;

/* ── ?action=explain ── */
async function _explain(req, res) {
  try {
    var body = req.body || {};
    var question = typeof body.question === 'string' ? body.question.substring(0, MAX_QUESTION_INPUT_LENGTH) : '';
    var answer = body.answer;
    var category = body.category;

    if (!question || answer === undefined) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Missing required fields: question, answer', retryable: false } });
    }

    var answerStr = String(answer).substring(0, 50);
    var explanation = await aiService.generateExplanation(question, answerStr, category, req.userId);
    try {
      await aiService.trackExplanationUsage(req.userId);
    } catch (e) {
      console.warn('[api/ai/explain] usage tracking failed (uid: ' + req.userId + '):', e.message);
    }
    return res.json({ explanation: explanation });
  } catch (err) {
    console.error('Explanation error:', err.message);
    return res.status(500).json({ error: formatError(err) });
  }
}

/* ── ?action=insights ── */
async function _insights(req, res) {
  try {
    var body = req.body || {};
    var rawStats = body.stats;
    if (!rawStats) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Missing required field: stats', retryable: false } });
    }

    var stats = {
      totalAttempted: parseInt(rawStats.totalAttempted) || 0,
      totalCorrect: parseInt(rawStats.totalCorrect) || 0,
      dailyStreak: parseInt(rawStats.dailyStreak) || 0,
      drillSessions: parseInt(rawStats.drillSessions) || 0,
      timedTestSessions: parseInt(rawStats.timedTestSessions) || 0,
      mistakes: Array.isArray(rawStats.mistakes) ? rawStats.mistakes.slice(0, 50) : [],
      responseTimes: Array.isArray(rawStats.responseTimes) ? rawStats.responseTimes.slice(0, 100).map(Number).filter(function (n) { return !isNaN(n); }) : [],
      categoryStats: {}
    };

    if (rawStats.categoryStats && typeof rawStats.categoryStats === 'object') {
      var catKeys = Object.keys(rawStats.categoryStats).slice(0, 20);
      catKeys.forEach(function (key) {
        var safeKey = String(key).substring(0, 50);
        var d = rawStats.categoryStats[key];
        if (d && typeof d === 'object') {
          stats.categoryStats[safeKey] = { attempted: parseInt(d.attempted) || 0, correct: parseInt(d.correct) || 0 };
        }
      });
    }

    var type = body.type || 'coach'; // Default to coach for backwards compatibility

    var result;
    if (type === 'coach') {
      result = await aiService.generateCoachV2(stats, req.userId);
    } else if (type === 'insights') {
      result = await aiService.generateInsightsV2(stats, req.userId);
    } else {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid type. Use "coach" or "insights".', retryable: false } });
    }

    try {
      await aiService.trackInsightsUsage(req.userId);
    } catch (e) {
      console.warn('[api/ai/insights] usage tracking failed (uid: ' + req.userId + '):', e.message);
    }
    return res.json({ insights: result, type: type });
  } catch (err) {
    console.error('Insights error:', err.message);
    return res.status(500).json({ error: formatError(err) });
  }
}

/* ── ?action=study-plan ── (inner body.action sub-ops preserved) */
async function _studyPlan(req, res) {
  try {
    var body = req.body || {};
    var action = typeof body.action === 'string' ? body.action : 'generate';
    var planId = typeof body.planId === 'string' ? body.planId : '';

    // -- Handle Progress Update --
    if (action === 'update_progress') {
      if (!planId) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'planId is required.', retryable: false } });
      await aiService.updateStudyPlanProgress(req.userId, planId, body.dayIndex, body.completed);
      return res.json({ success: true });
    }

    // -- Handle Finalize --
    if (action === 'finalize') {
      if (!planId) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'planId is required.', retryable: false } });
      await aiService.finalizeStudyPlan(req.userId, planId);
      return res.json({ success: true });
    }

    // -- Handle Get Active --
    if (action === 'get_active') {
      var activePlan = await aiService.getActiveStudyPlan(req.userId);
      return res.json({ plan: activePlan });
    }

    // -- Handle Generation --
    var examName = typeof body.examName === 'string' ? body.examName.trim().substring(0, 100) : '';
    var examDate = typeof body.examDate === 'string' ? body.examDate.trim() : '';
    var dailyTimeMinutes = parseInt(body.dailyTimeMinutes) || 0;
    var targetScore = typeof body.targetScore === 'string' ? body.targetScore.trim() : '';
    var currentLevel = typeof body.currentLevel === 'string' ? body.currentLevel.trim() : 'Intermediate';
    var strongTopics = Array.isArray(body.strongTopics) ? body.strongTopics : [];
    var explicitWeakTopics = Array.isArray(body.weakTopics) ? body.weakTopics : [];
    var previousPlanId = typeof body.previousPlanId === 'string' ? body.previousPlanId : null;

    if (!examName) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Exam name is required.', retryable: false } });
    }
    if (!examDate || !/^\d{4}-\d{2}-\d{2}$/.test(examDate)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'A valid exam date (YYYY-MM-DD) is required.', retryable: false } });
    }

    var todayStr = new Date().toISOString().slice(0, 10);
    if (examDate <= todayStr) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Exam date must be a future date.', retryable: false } });
    }
    var examMs = new Date(examDate).getTime();
    var daysRemaining = Math.ceil((examMs - Date.now()) / (1000 * 60 * 60 * 24));

    if (dailyTimeMinutes < 15 || dailyTimeMinutes > 360) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Daily time must be between 15 and 360 minutes.', retryable: false } });
    }

    var rawStats = body.stats || {};
    var totalAttempted = parseInt(rawStats.totalAttempted) || 0;
    var totalCorrect = parseInt(rawStats.totalCorrect) || 0;
    var accuracy = totalAttempted > 0 ? ((totalCorrect / totalAttempted) * 100).toFixed(1) : '0';

    var autoWeakTopics = [];
    var autoStrongTopics = [];
    if (rawStats.categoryStats && typeof rawStats.categoryStats === 'object') {
      var catKeys = Object.keys(rawStats.categoryStats).slice(0, 20);
      catKeys.forEach(function (key) {
        var d = rawStats.categoryStats[key];
        if (d && typeof d === 'object') {
          var attempted = parseInt(d.attempted) || 0;
          var correct = parseInt(d.correct) || 0;
          if (attempted >= 5) {
            var catAcc = (correct / attempted) * 100;
            if (catAcc < 50) autoWeakTopics.push(String(key).substring(0, 50));
            if (catAcc > 80) autoStrongTopics.push(String(key).substring(0, 50));
          }
        }
      });
    }

    // Merge explicit overrides with auto-detected topics
    var finalWeakTopics = Array.from(new Set(autoWeakTopics.concat(explicitWeakTopics)));
    var finalStrongTopics = Array.from(new Set(autoStrongTopics.concat(strongTopics)));

    var plan = await aiService.generateStudyPlan({
      examName: examName,
      examDate: examDate,
      daysRemaining: daysRemaining,
      dailyTimeMinutes: dailyTimeMinutes,
      targetScore: targetScore,
      currentLevel: currentLevel,
      weakTopics: finalWeakTopics,
      strongTopics: finalStrongTopics,
      accuracy: accuracy,
      userId: req.userId,
      previousPlanId: previousPlanId
    });

    return res.json({ plan: plan });
  } catch (err) {
    console.error('Study plan error:', err.message);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAuth(async function (req, res) {
  if (methodGuard(req, res, 'POST')) return;

  /* Emergency AI kill switch (ADR-021) — never call OpenAI while enabled. */
  if (await isEnabled('aiKillSwitch')) {
    return res.status(503).json({
      error: { code: 'AI_DISABLED', message: 'AI features are temporarily disabled. Please try again later.', retryable: true }
    });
  }

  if (!req.userPremium) {
    return res.status(403).json({
      error: { code: 'PREMIUM_REQUIRED', message: 'This feature requires Premium. Upgrade to continue.', retryable: false }
    });
  }

  var action = req.query.action || '';
  if (action === 'explain') return _explain(req, res);
  if (action === 'insights') return _insights(req, res);
  if (action === 'study-plan') return _studyPlan(req, res);
  return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown AI action: ' + action, retryable: false } });
});
