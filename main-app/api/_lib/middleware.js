/**
 * Shared middleware for Vercel serverless API routes.
 *
 * Provides:
 *   withAuth(handler)  — wraps a handler with Firebase ID token verification
 *                        and entitlement resolution (userId, userPremium, userPremiumPlus)
 *   formatError(err)   — consistent JSON error envelope
 *   methodGuard(req, res, allowed) — reject non-matching HTTP methods
 */

const aiService = require('../../services/aiService');

/**
 * Parse JSON body from the request.
 * Vercel typically auto-parses, but this is a safety net.
 */
function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return {};
}

/**
 * Reject requests that don't match the allowed HTTP method.
 * @param {object} req
 * @param {object} res
 * @param {string} allowed - e.g. 'POST'
 * @returns {boolean} true if method is NOT allowed (response already sent)
 */
function methodGuard(req, res, allowed) {
  if (req.method === allowed) return false;
  res.setHeader('Allow', allowed);
  res.status(405).json({
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Only ' + allowed + ' is accepted.', retryable: false }
  });
  return true;
}

/**
 * Format an error into a consistent JSON envelope.
 * @param {*} err
 * @returns {{ code: string, message: string, retryable: boolean }}
 */
function formatError(err) {
  if (err instanceof aiService.AIServiceError) {
    return { code: err.code, message: err.message, retryable: err.retryable };
  }
  return { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred. Try again later.', retryable: true };
}

/**
 * In-memory per-user rate limiter.
 * Limits AI requests to MAX_REQUESTS_PER_HOUR per user per serverless instance.
 * Not shared across Vercel instances — defense-in-depth, not a hard global limit.
 */
var _rateLimitMap = {};
var _rateLimitCheckCount = 0;
var RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; /* 1 hour */
var MAX_REQUESTS_PER_HOUR = 20;
var CLEANUP_INTERVAL = 50; /* purge stale entries every N checks */

function _checkRateLimit(uid) {
  var now = Date.now();

  /* On-demand cleanup: purge stale entries periodically instead of setInterval.
     Avoids keeping serverless instances warm with persistent timers. */
  _rateLimitCheckCount++;
  if (_rateLimitCheckCount >= CLEANUP_INTERVAL) {
    _rateLimitCheckCount = 0;
    var keys = Object.keys(_rateLimitMap);
    for (var i = 0; i < keys.length; i++) {
      if (now - _rateLimitMap[keys[i]].windowStart > RATE_LIMIT_WINDOW_MS) {
        delete _rateLimitMap[keys[i]];
      }
    }
  }

  if (!_rateLimitMap[uid]) {
    _rateLimitMap[uid] = { count: 1, windowStart: now };
    return true;
  }
  var entry = _rateLimitMap[uid];
  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    /* Window expired — reset */
    entry.count = 1;
    entry.windowStart = now;
    return true;
  }
  entry.count++;
  return entry.count <= MAX_REQUESTS_PER_HOUR;
}

/**
 * Wrap a serverless handler with Firebase auth verification.
 *
 * The wrapped handler receives (req, res) where:
 *   req.userId         — Firebase UID
 *   req.userPremium    — boolean
 *   req.userPremiumPlus — boolean
 *
 * @param {function} handler - async (req, res) => void
 * @returns {function} Vercel-compatible handler
 */
function withAuth(handler) {
  return async function (req, res) {
    /* Handle CORS preflight — required for POST with Authorization header */
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(200).end();
    }

    var authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required.', retryable: false }
      });
    }

    var idToken = authHeader.substring(7);
    var decoded;
    try {
      decoded = await aiService.verifyIdToken(idToken);
    } catch (tokenErr) {
      console.error('[middleware:withAuth] token verification threw:', tokenErr.message);
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Authentication failed. Please login again.', retryable: false }
      });
    }
    if (!decoded || !decoded.uid) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired authentication token.', retryable: false }
      });
    }

    /* Per-user rate limiting */
    if (!_checkRateLimit(decoded.uid)) {
      console.warn('[middleware:withAuth] rate limit exceeded for uid:', decoded.uid);
      return res.status(429).json({
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', retryable: true }
      });
    }

    req.userId = decoded.uid;
    try {
      var entitlement = await Promise.all([
        aiService.isUserPremium(decoded.uid),
        aiService.isUserPremiumPlus(decoded.uid)
      ]);
      req.userPremium = entitlement[0];
      req.userPremiumPlus = entitlement[1];
    } catch (entitlementErr) {
      return res.status(503).json({ error: formatError(entitlementErr) });
    }

    return handler(req, res);
  };
}

module.exports = { withAuth, formatError, methodGuard, parseBody };
