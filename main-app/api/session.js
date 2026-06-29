/**
 * Session domain API (ADR-072) — single-active-device enforcement.
 *
 *   POST ?action=claim  { sessionId }  → claim THIS device as the one active session for the caller.
 *
 * Wrapped with withAuth({ skipSession:true }): the claim must be reachable by a NEW device that does not yet hold the
 * active session id (otherwise the per-request session check would 409 it and a new device could never sign in). Auth
 * is still required — a caller can only ever claim a session for their OWN uid (req.userId from the verified token;
 * no uid is accepted from the body). The write goes through the Admin SDK (aiService.claimSession); Firestore rules
 * deny any client write of `activeSessionId`, so the field can never be forged or cleared by a client.
 */

const { withAuth, parseBody, formatError } = require('./_lib/middleware');
const admin = require('firebase-admin');
/* Requiring aiService initializes the Firebase Admin singleton. */
const aiService = require('../services/aiService');

if (!admin.apps.length) {
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  } catch (err) {
    console.error('Firebase admin initialization failed:', err);
  }
}

async function handler(req, res) {
  const action = req.query.action || '';
  if (action !== 'claim' || req.method !== 'POST') {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown session action: ' + action } });
  }
  try {
    const body = await parseBody(req);
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
    const claimed = await aiService.claimSession(req.userId, sessionId);
    return res.status(200).json({ ok: true, sessionId: claimed });
  } catch (err) {
    if (err && err.code === 'BAD_SESSION') {
      return res.status(400).json({ error: { code: 'BAD_SESSION', message: err.message, retryable: false } });
    }
    console.error('[Session API] claim error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAuth(handler, { skipSession: true });
