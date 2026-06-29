/**
 * Shared middleware for Super Admin App Vercel serverless API routes.
 * Decoupled from aiService to prevent MODULE_NOT_FOUND crashes.
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
      admin.initializeApp();
    }
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
  }
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return {};
}

function methodGuard(req, res, allowed) {
  if (req.method === allowed) return false;
  res.setHeader('Allow', allowed);
  res.status(405).json({
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Only ' + allowed + ' is accepted.', retryable: false }
  });
  return true;
}

function formatError(err) {
  return { code: 'INTERNAL_ERROR', message: err.message || 'An unexpected error occurred.', retryable: true };
}

/* Per-admin in-memory rate limiter (audit M5/M6 — defense-in-depth, per
   serverless instance). Previously only firebase-admin.js#withAdmin was
   rate-limited (used by questions.js); the sensitive endpoints that use
   withAdminAuth (entitlements, payments, coachings, …) had NO limit. */
var _adminRateLimitMap = {};
var _adminRateLimitCheckCount = 0;
var ADMIN_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; /* 1 hour */
/* Best-effort per-serverless-instance abuse ceiling (ADR-024). Raised 30→300 (5/min sustained): the
   old 30/hr throttled a normal interactive User-360 session (open a few users, check tabs, do 2-3
   actions) and surfaced "Too many requests". 300/hr is generous for governance work yet still bounds
   a runaway client. Not a security control — the real gate is withAdminAuth's admin:true claim. */
var ADMIN_MAX_REQUESTS_PER_HOUR = 300;

function _checkAdminRateLimit(uid) {
  var now = Date.now();
  if (++_adminRateLimitCheckCount >= 30) {
    _adminRateLimitCheckCount = 0;
    Object.keys(_adminRateLimitMap).forEach(function (k) {
      if (now - _adminRateLimitMap[k].windowStart > ADMIN_RATE_LIMIT_WINDOW_MS) delete _adminRateLimitMap[k];
    });
  }
  var entry = _adminRateLimitMap[uid];
  if (!entry || now - entry.windowStart > ADMIN_RATE_LIMIT_WINDOW_MS) {
    _adminRateLimitMap[uid] = { count: 1, windowStart: now };
    return true;
  }
  entry.count++;
  return entry.count <= ADMIN_MAX_REQUESTS_PER_HOUR;
}

/**
 * Canonical Super-Admin auth wrapper (audit M5).
 * Verifies the Firebase ID token + `admin:true` claim, applies a per-admin
 * rate limit, and exposes BOTH `req.userId` and `req.adminUid` so either
 * naming convention works across endpoints.
 */
function withAdminAuth(handler) {
  return async function (req, res) {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, DELETE, PUT');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(200).end();
    }

    var authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    }

    var idToken = authHeader.substring(7);
    var decoded;
    try {
      // checkRevoked=true (ADR-072): admin tokens are high-value — a revoked/disabled admin is cut off immediately
      // rather than staying valid until the ~1h token expiry. Matches the coaching-admin pattern.
      decoded = await admin.auth().verifyIdToken(idToken, true);
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

    if (!_checkAdminRateLimit(decoded.uid)) {
      console.warn('[admin:middleware] rate limit exceeded for admin uid:', decoded.uid);
      return res.status(429).json({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', retryable: true } });
    }

    req.userId = decoded.uid;
    req.adminUid = decoded.uid; /* alias — canonical going forward (audit M5) */
    req.adminEmail = decoded.email || null; /* for auditLogs actorEmail (Super Admin Phase 1) */
    return handler(req, res);
  };
}

module.exports = { withAdminAuth, formatError, methodGuard, parseBody };
