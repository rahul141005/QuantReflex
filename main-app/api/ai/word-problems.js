/**
 * POST /api/ai/word-problems
 *
 * DEPRECATED: No longer calls OpenAI for runtime generation.
 * Now reads from the centralized Firestore `questions` collection
 * (pre-generated, curated, and approved via the Super Admin pipeline).
 *
 * Server-side quota enforcement and Premium+ validation remain as
 * defense-in-depth — the client now fetches directly from Firestore
 * as the primary path, but this endpoint stays as a fallback.
 *
 * Requires Premium+ entitlement.
 */

const { withAuth, formatError, methodGuard } = require('../_lib/middleware');
const aiService = require('../../services/aiService');

var VALID_CATEGORIES = ['squares', 'cubes', 'area', 'volume', 'percentages', 'multiplication', 'fractions', 'averages', 'ratios', 'profit-loss', 'time-speed-distance', 'time-and-work'];

module.exports = withAuth(async function (req, res) {
  if (methodGuard(req, res, 'POST')) return;

  try {
    if (!req.userPremiumPlus) {
      return res.status(403).json({
        error: { code: 'PREMIUM_PLUS_REQUIRED', message: 'This feature requires Premium+. Upgrade to continue.', retryable: false }
      });
    }

    var remaining = await aiService.checkWordProblemQuota(req.userId, req.userPremiumPlus);
    if (remaining <= 0) {
      var msg = req.userPremiumPlus ? 'Daily word problem limit reached. Come back tomorrow.' : 'Free word problem limit reached. Upgrade to Premium+ for more.';
      return res.status(429).json({ error: { code: 'QUOTA_EXCEEDED', message: msg, retryable: false } });
    }

    var body = req.body || {};
    var category = typeof body.category === 'string' ? body.category.substring(0, 50) : '';
    var difficulty = typeof body.difficulty === 'string' ? body.difficulty.substring(0, 20) : '';
    var count = body.count;

    if (!category || !difficulty || !count) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Missing required fields: category, difficulty, count', retryable: false } });
    }
    if (VALID_CATEGORIES.indexOf(category) === -1) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid category.', retryable: false } });
    }
    var validDifficulties = ['easy', 'medium', 'hard'];
    if (validDifficulties.indexOf(difficulty) === -1) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid difficulty. Must be easy, medium, or hard.', retryable: false } });
    }

    var clampedCount = Math.min(Math.max(parseInt(count) || 5, 1), 25);
    clampedCount = Math.min(clampedCount, remaining);

    /* DEPRECATED: was aiService.generateWordProblems(category, difficulty, clampedCount)
       Now reads from centralized question bank (Firestore `questions` collection). */
    var questions = await aiService.generateWordProblems(category, difficulty, clampedCount);
    await aiService.consumeWordProblemQuota(req.userId, req.userPremiumPlus, questions.length);
    res.json({ questions: questions, remaining: remaining - questions.length });
  } catch (err) {
    console.error('Word problems error:', err.message);
    res.status(500).json({ error: formatError(err) });
  }
});

