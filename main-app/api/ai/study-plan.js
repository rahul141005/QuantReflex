/**
 * POST /api/ai/study-plan
 * Manage AI study plans: generate, finalize, and update progress.
 * Requires Premium entitlement.
 */

const { withAuth, formatError, methodGuard } = require('../_lib/middleware');
const aiService = require('../../services/aiService');

module.exports = withAuth(async function (req, res) {
  if (methodGuard(req, res, 'POST')) return;

  try {
    if (!req.userPremium) {
      return res.status(403).json({
        error: { code: 'PREMIUM_REQUIRED', message: 'This feature requires Premium. Upgrade to continue.', retryable: false }
      });
    }

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

    res.json({ plan: plan });
  } catch (err) {
    console.error('Study plan error:', err.message);
    res.status(500).json({ error: formatError(err) });
  }
});
