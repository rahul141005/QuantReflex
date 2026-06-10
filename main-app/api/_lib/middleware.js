/**
 * Shared middleware for Vercel serverless API routes.
 *
 * Provides:
 *   withAuth(handler)  — wraps a handler with Firebase ID token verification
 *                        and entitlement resolution (userId, userPremium)
 *   formatError(err)   — consistent JSON error envelope
 *   methodGuard(req, res, allowed) — reject non-matching HTTP methods
 */

const aiService = require('../../services/aiService');

/**
 * Allowed CORS origins.
 * Production domains + localhost for development.
 */
var _ALLOWED_ORIGINS = [
  'https://quantreflex.app',
  'https://dev.quantreflex.app',
  'https://admin.quantreflex.app'
];
if (process.env.NODE_ENV !== 'production') {
  _ALLOWED_ORIGINS.push('http://localhost:3000', 'http://localhost:5500', 'http://localhost:5173');
}

/**
 * Set CORS headers if the request origin is in the allowlist.
 * @param {object} req
 * @param {object} res
 */
function _setCorsHeaders(req, res) {
  var origin = req.headers.origin;
  if (origin && _ALLOWED_ORIGINS.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
}

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
 *   req.userId      — Firebase UID
 *   req.userPremium — boolean (plan === 'premium', not expired)
 *
 * @param {function} handler - async (req, res) => void
 * @returns {function} Vercel-compatible handler
 */
function withAuth(handler) {
  return async function (req, res) {
    /* Handle CORS preflight — required for POST with Authorization header */
    if (req.method === 'OPTIONS') {
      _setCorsHeaders(req, res);
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(200).end();
    }

    /* Set CORS headers for non-preflight requests too */
    _setCorsHeaders(req, res);

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
      /* v2: single entitlement — req.userPremium is true iff plan==='premium'
         (and not expired). resolvePlan self-heals expired premium/trials. */
      req.userPremium = await aiService.isUserPremium(decoded.uid);
    } catch (entitlementErr) {
      return res.status(503).json({ error: formatError(entitlementErr) });
    }

    return handler(req, res);
  };
}

/**
 * Wrap a serverless handler with Firebase auth verification, requiring Admin access.
 *
 * @param {function} handler - async (req, res) => void
 * @returns {function} Vercel-compatible handler
 */
function withAdminAuth(handler) {
  return async function (req, res) {
    if (req.method === 'OPTIONS') {
      _setCorsHeaders(req, res);
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, DELETE, PUT');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(200).end();
    }

    /* Set CORS headers for non-preflight requests too */
    _setCorsHeaders(req, res);

    var authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    }

    var idToken = authHeader.substring(7);
    var decoded;
    try {
      decoded = await aiService.verifyIdToken(idToken);
    } catch (tokenErr) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication failed.' } });
    }
    
    if (!decoded || !decoded.uid) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token.' } });
    }

    // Verify Admin Custom Claim
    if (decoded.admin !== true) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin privileges required.' } });
    }

    req.userId = decoded.uid;
    return handler(req, res);
  };
}

/**
 * Canonical coaching active-state check (audit M4).
 *
 * Single source of truth for "can this coaching accept students / be claimed".
 * Previously three endpoints disagreed: register checked status
 * 'suspended'/'deleted', while claim/validate checked status 'expired'
 * (a value the admin tooling never writes) — so a suspended coaching could
 * slip through claim/validate unless `isActive:false` happened to be set too.
 *
 * Canonical rule: a coaching is active IFF `status === 'active'` when a
 * `status` field is present; otherwise fall back to `isActive !== false`
 * for legacy documents that predate the status field.
 *
 * @param {object} data - coachings/{id} document data
 * @returns {boolean}
 */
function isCoachingActive(data) {
  if (!data) return false;
  if (typeof data.status === 'string' && data.status.length > 0) {
    return data.status === 'active';
  }
  return data.isActive !== false;
}

module.exports = { withAuth, withAdminAuth, formatError, methodGuard, parseBody, isCoachingActive, setCorsHeaders: _setCorsHeaders };
