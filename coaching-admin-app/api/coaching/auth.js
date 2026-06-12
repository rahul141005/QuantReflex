/**
 * auth.js — Coaching Admin Registration Endpoint
 *
 * Handles self-registration for coaching admins.
 * This is a PRE-AUTH endpoint — no withCoachingAuth middleware.
 *
 * POST ?action=register
 *   Body: { email, password, coachingId }
 *   1. Validates inputs
 *   2. Verifies coachingId exists and is active
 *   3. Verifies coaching doesn't already have an admin
 *   4. Creates Firebase Auth user
 *   5. Sets custom claims: { coaching_admin: true, coachingId }
 *   6. Updates coaching doc with adminUid + adminEmail
 *   7. Returns custom token for auto-login
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (sa) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
    } else {
      admin.initializeApp();
    }
  } catch (err) {
    console.error('Firebase admin initialization failed:', err);
    throw new Error('FATAL: Firebase Admin could not be initialized.');
  }
}

/* In-memory per-instance rate limit (ADR-029) for this PRE-AUTH, admin-privilege-granting endpoint —
   blunts brute-forcing the registration token. Best-effort (per serverless instance; App Check / a shared
   counter is the durable cap — ROADMAP M6/M7). */
var _rl = {};
var _rlN = 0;
var RL_WINDOW_MS = 60 * 1000;
var RL_MAX = 8;
function _rateLimited(ip) {
  var now = Date.now();
  if (++_rlN >= 50) { _rlN = 0; for (var k in _rl) { if (now - _rl[k].t > RL_WINDOW_MS) delete _rl[k]; } }
  var e = _rl[ip];
  if (!e || now - e.t > RL_WINDOW_MS) { _rl[ip] = { c: 1, t: now }; return false; }
  e.c++;
  return e.c > RL_MAX;
}

async function handler(req, res) {
  // CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(200).end();
  }

  const action = req.query.action || 'register';

  if (action === 'register' && req.method === 'POST') {
    return await _handleRegister(req, res);
  }

  return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown auth action.' } });
}

async function _handleRegister(req, res) {
  try {
    var ip = req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || 'unknown';
    if (_rateLimited(String(ip).split(',')[0].trim())) {
      return res.status(429).json({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many attempts. Please wait a minute and try again.' } });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { email, password, registrationToken } = body;

    // ── Input Validation ──
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: { code: 'INVALID_EMAIL', message: 'A valid email address is required.' } });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: { code: 'INVALID_PASSWORD', message: 'Password must be at least 6 characters.' } });
    }

    if (!registrationToken || typeof registrationToken !== 'string' || registrationToken.trim().length === 0) {
      return res.status(400).json({ error: { code: 'INVALID_TOKEN', message: 'Registration Token is required. Contact the Super Admin for this secure code.' } });
    }

    const cleanToken = registrationToken.trim().toUpperCase();
    const cleanEmail = email.trim().toLowerCase();
    const db = admin.firestore();

    // ── Verify Coaching Exists & Is Active by Registration Token ──
    const coachingsSnap = await db.collection('coachings').where('registrationToken', '==', cleanToken).limit(1).get();
    if (coachingsSnap.empty) {
      return res.status(404).json({ error: { code: 'TOKEN_NOT_FOUND', message: 'Invalid or expired Registration Token.' } });
    }

    const coachingDoc = coachingsSnap.docs[0];
    const coachingData = coachingDoc.data();
    const cleanCoachingId = coachingDoc.id;

    if (coachingData.status === 'suspended' || coachingData.status === 'deleted') {
      return res.status(403).json({ error: { code: 'COACHING_INACTIVE', message: 'This coaching institute is currently inactive. Contact support.' } });
    }

    // ── Verify No Existing Admin ──
    if (coachingData.adminUid) {
      return res.status(409).json({ error: { code: 'ADMIN_EXISTS', message: 'This coaching already has an admin account. If you are the admin, please use the Login option.' } });
    }

    // ── Create Firebase Auth User ──
    let userRecord;
    try {
      userRecord = await admin.auth().createUser({
        email: cleanEmail,
        password: password,
        displayName: coachingData.name + ' Admin'
      });
    } catch (authErr) {
      if (authErr.code === 'auth/email-already-exists') {
        return res.status(409).json({ error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists. Please use Login instead.' } });
      }
      if (authErr.code === 'auth/invalid-email') {
        return res.status(400).json({ error: { code: 'INVALID_EMAIL', message: 'The email address format is invalid.' } });
      }
      if (authErr.code === 'auth/weak-password') {
        return res.status(400).json({ error: { code: 'WEAK_PASSWORD', message: 'The password is too weak. Use at least 6 characters.' } });
      }
      throw authErr;
    }

    // ── Set Custom Claims ──
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      coaching_admin: true,
      coachingId: cleanCoachingId
    });

    // ── Update Coaching Document ──
    await db.collection('coachings').doc(cleanCoachingId).update({
      adminUid: userRecord.uid,
      adminEmail: cleanEmail,
      registrationToken: admin.firestore.FieldValue.delete(), // Nullify token after use for security
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // ── Generate Custom Token for Auto-Login ──
    const customToken = await admin.auth().createCustomToken(userRecord.uid);

    return res.status(200).json({
      success: true,
      token: customToken,
      coachingId: cleanCoachingId,
      coachingName: coachingData.name || cleanCoachingId
    });

  } catch (err) {
    console.error('[Coaching Auth] Registration error:', err);
    return res.status(500).json({
      error: {
        code: 'REGISTRATION_FAILED',
        message: err.message || 'Account creation failed. Please try again.'
      }
    });
  }
}

module.exports = handler;
