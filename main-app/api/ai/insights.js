/**
 * POST /api/ai/insights
 * Generate AI coaching insights from user stats.
 * Requires Premium+ entitlement.
 */

const { withAuth, formatError, methodGuard } = require('../_lib/middleware');
const aiService = require('../../services/aiService');

module.exports = withAuth(async function (req, res) {
  if (methodGuard(req, res, 'POST')) return;

  try {
    if (!req.userPremiumPlus) {
      return res.status(403).json({
        error: { code: 'PREMIUM_PLUS_REQUIRED', message: 'This feature requires Premium+. Upgrade to continue.', retryable: false }
      });
    }

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
    res.json({ insights: result, type: type });
  } catch (err) {
    console.error('Insights error:', err.message);
    res.status(500).json({ error: formatError(err) });
  }
});
