/**
 * POST /api/ai/explain
 * Generate an AI explanation for a math question.
 * Requires Premium entitlement.
 */

const { withAuth, formatError, methodGuard } = require('../_lib/middleware');
const aiService = require('../../services/aiService');

var MAX_QUESTION_INPUT_LENGTH = 500;

module.exports = withAuth(async function (req, res) {
  if (methodGuard(req, res, 'POST')) return;

  try {
    if (!req.userPremium) {
      return res.status(403).json({
        error: { code: 'PREMIUM_REQUIRED', message: 'This feature requires Premium. Upgrade to continue.', retryable: false }
      });
    }

    var body = req.body || {};
    var question = typeof body.question === 'string' ? body.question.substring(0, MAX_QUESTION_INPUT_LENGTH) : '';
    var answer = body.answer;
    var category = body.category;

    if (!question || answer === undefined) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Missing required fields: question, answer', retryable: false } });
    }

    var answerStr = String(answer).substring(0, 50);
    var explanation = await aiService.generateExplanation(question, answerStr, category);
    try {
      await aiService.trackExplanationUsage(req.userId);
    } catch (e) {
      console.warn('[api/ai/explain] usage tracking failed (uid: ' + req.userId + '):', e.message);
    }
    res.json({ explanation: explanation });
  } catch (err) {
    console.error('Explanation error:', err.message);
    res.status(500).json({ error: formatError(err) });
  }
});
