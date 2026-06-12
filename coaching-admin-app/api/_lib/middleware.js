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
    throw new Error('FATAL: Firebase Admin could not be initialized.');
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
 * Coaching status gate (ADR-029) — a coaching that the super-admin has suspended/deleted must lose
 * access even though its admin still holds a coaching_admin claim. Reads coachings/{id}.status with a
 * short in-memory cache (per serverless instance) to bound reads. Fails OPEN on a transient read error
 * (a Firestore blip must not lock out a healthy coaching) — the authoritative cutoff is the token
 * revocation done by super-admin mutate + checkRevoked below.
 */
var _coachingStatusCache = {};
var COACHING_STATUS_TTL_MS = 60 * 1000;
async function _coachingActive(coachingId) {
  var now = Date.now();
  var cached = _coachingStatusCache[coachingId];
  if (cached && (now - cached.at) < COACHING_STATUS_TTL_MS) return cached;
  try {
    var doc = await admin.firestore().collection('coachings').doc(coachingId).get();
    var data = doc.exists ? (doc.data() || {}) : {};
    var status = data.status || (data.isActive === false ? 'suspended' : 'active');
    var active = doc.exists && status !== 'suspended' && status !== 'deleted' && data.isActive !== false;
    var entry = { active: active, status: status, at: now };
    _coachingStatusCache[coachingId] = entry;
    return entry;
  } catch (_) {
    return cached || { active: true, status: 'unknown', at: now }; // fail-open on transient error
  }
}

/**
 * Auth middleware for coaching admin endpoints.
 * Verifies:
 *   1. Bearer token present
 *   2. Token is valid AND not revoked (checkRevoked — so a suspend/delete that revokes refresh tokens
 *      cuts off existing sessions immediately instead of leaving a ~1h window)
 *   3. coaching_admin === true custom claim
 *   4. coachingId claim is present
 *   5. the coaching itself is still active (status gate — ADR-029)
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
      decoded = await admin.auth().verifyIdToken(idToken, true); // checkRevoked = true (ADR-029)
    } catch (tokenErr) {
      var revoked = tokenErr && (tokenErr.code === 'auth/id-token-revoked' || tokenErr.code === 'auth/user-disabled');
      return res.status(401).json({ error: { code: revoked ? 'SESSION_REVOKED' : 'UNAUTHORIZED', message: revoked ? 'Your session has ended. Please sign in again.' : 'Authentication failed.' } });
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

    // Coaching status gate (ADR-029): block suspended/deleted coachings even with a valid claim.
    var statusCheck = await _coachingActive(decoded.coachingId);
    if (!statusCheck.active) {
      return res.status(403).json({ error: { code: 'COACHING_INACTIVE', message: 'This coaching is suspended or closed. Contact your administrator.' } });
    }

    req.userId = decoded.uid;
    req.coachingId = decoded.coachingId;
    return handler(req, res);
  };
}

/**
 * Convert any Firestore-like timestamp value to milliseconds.
 * Handles: number, string, Firestore Timestamp, Date object.
 * @param {*} val
 * @returns {number} milliseconds since epoch, or 0
 */
function toMillis(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') { const p = Date.parse(val); return isNaN(p) ? 0 : p; }
  if (typeof val.toDate === 'function') { try { return val.toDate().getTime(); } catch (_) { return 0; } }
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'object' && val._seconds != null) return val._seconds * 1000;
  return 0;
}

module.exports = { withCoachingAuth, formatError, parseBody, safeTimestamp, toMillis };
