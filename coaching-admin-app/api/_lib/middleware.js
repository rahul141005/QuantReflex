/**
 * middleware.js — Shared middleware for Coaching Admin App Vercel serverless API routes.
 *
 * Provides:
 *   - withCoachingAuth()  — Verifies JWT, checks coaching_admin claim, extracts coachingId
 *   - parseBody()         — Safe request body parser
 *   - formatError()       — Consistent error formatting
 *
 * SECURITY: Every authenticated endpoint verifies coaching_admin === true
 * AND extracts coachingId from the JWT claims. This ensures data scoping.
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

function formatError(err) {
  return { code: 'INTERNAL_ERROR', message: err.message || 'An unexpected error occurred.', retryable: true };
}

/**
 * Safely convert any timestamp value to ISO string.
 * Handles: Firestore Timestamp, ISO string, Date, unix number, null, malformed.
 * NEVER crashes — returns null for unparseable values.
 */
function safeTimestamp(val) {
  if (val == null) return null;
  if (typeof val.toDate === 'function') { try { return val.toDate().toISOString(); } catch (_) { return null; } }
  if (typeof val === 'string') { var d = new Date(val); return isNaN(d.getTime()) ? null : d.toISOString(); }
  if (val instanceof Date) { return isNaN(val.getTime()) ? null : val.toISOString(); }
  if (typeof val === 'number' && isFinite(val)) { return new Date(val < 1e12 ? val * 1000 : val).toISOString(); }
  if (typeof val === 'object' && val._seconds != null) { try { return new Date(val._seconds * 1000).toISOString(); } catch (_) { return null; } }
  return null;
}

/**
 * Auth middleware for coaching admin endpoints.
 * Verifies:
 *   1. Bearer token present
 *   2. Token is valid
 *   3. coaching_admin === true custom claim
 *   4. coachingId claim is present
 *
 * Attaches req.userId and req.coachingId for downstream handlers.
 */
function withCoachingAuth(handler) {
  return async function (req, res) {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
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
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (tokenErr) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication failed.' } });
    }

    if (!decoded || !decoded.uid) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token.' } });
    }

    // Verify Coaching Admin Custom Claim
    if (decoded.coaching_admin !== true) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Coaching admin privileges required.' } });
    }

    // Extract coachingId from claims
    if (!decoded.coachingId) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'No coaching association found. Contact support.' } });
    }

    req.userId = decoded.uid;
    req.coachingId = decoded.coachingId;
    return handler(req, res);
  };
}

module.exports = { withCoachingAuth, formatError, parseBody, safeTimestamp };
