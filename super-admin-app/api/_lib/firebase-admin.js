/**
 * Shared middleware for Admin API routes.
 *
 * Provides:
 *   withAdmin(handler) — wraps a handler with Firebase ID token + admin claim verification
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

const db = admin.firestore();
const auth = admin.auth();

/* In-memory per-admin rate limiter — defense-in-depth */
var _adminRateLimitMap = {};
var _adminRateLimitCheckCount = 0;
var ADMIN_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; /* 1 hour */
var ADMIN_MAX_REQUESTS_PER_HOUR = 30;

function _checkAdminRateLimit(uid) {
  var now = Date.now();
  _adminRateLimitCheckCount++;
  if (_adminRateLimitCheckCount >= 30) {
    _adminRateLimitCheckCount = 0;
    var keys = Object.keys(_adminRateLimitMap);
    for (var i = 0; i < keys.length; i++) {
      if (now - _adminRateLimitMap[keys[i]].windowStart > ADMIN_RATE_LIMIT_WINDOW_MS) {
        delete _adminRateLimitMap[keys[i]];
      }
    }
  }
  if (!_adminRateLimitMap[uid]) {
    _adminRateLimitMap[uid] = { count: 1, windowStart: now };
    return true;
  }
  var entry = _adminRateLimitMap[uid];
  if (now - entry.windowStart > ADMIN_RATE_LIMIT_WINDOW_MS) {
    entry.count = 1;
    entry.windowStart = now;
    return true;
  }
  entry.count++;
  return entry.count <= ADMIN_MAX_REQUESTS_PER_HOUR;
}

/**
 * Wrap a handler with admin authentication.
 * Verifies Firebase ID token AND checks admin custom claim.
 */
function withAdmin(handler) {
  return async function (req, res) {
    /* CORS preflight */
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(200).end();
    }

    var authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    try {
      var token = authHeader.substring(7);
      var decoded = await auth.verifyIdToken(token);

      if (!decoded.admin) {
        return res.status(403).json({ error: 'Admin privileges required.' });
      }

      /* Per-admin rate limiting */
      if (!_checkAdminRateLimit(decoded.uid)) {
        console.warn('[admin:middleware] rate limit exceeded for admin uid:', decoded.uid);
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
      }

      req.adminUid = decoded.uid;
      return handler(req, res);
    } catch (err) {
      console.error('[middleware] Auth error:', err.message);
      return res.status(401).json({ error: 'Authentication failed.' });
    }
  };
}

module.exports = { withAdmin, db, auth, admin };
