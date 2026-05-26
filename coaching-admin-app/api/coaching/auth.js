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
  }
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
    return _handleRegister(req, res);
  }

  return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown auth action.' } });
}

async function _handleRegister(req, res) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { email, password, coachingId } = body;

    // ── Input Validation ──
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: { code: 'INVALID_EMAIL', message: 'A valid email address is required.' } });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: { code: 'INVALID_PASSWORD', message: 'Password must be at least 6 characters.' } });
    }

    if (!coachingId || typeof coachingId !== 'string' || coachingId.trim().length === 0) {
      return res.status(400).json({ error: { code: 'INVALID_COACHING_ID', message: 'Coaching ID is required. Contact your coaching institute for this code.' } });
    }

    const cleanCoachingId = coachingId.trim().toUpperCase();
    const cleanEmail = email.trim().toLowerCase();
    const db = admin.firestore();

    // ── Verify Coaching Exists & Is Active ──
    const coachingDoc = await db.collection('coachings').doc(cleanCoachingId).get();
    if (!coachingDoc.exists) {
      return res.status(404).json({ error: { code: 'COACHING_NOT_FOUND', message: 'Coaching ID not found. Please verify the code with your institute.' } });
    }

    const coachingData = coachingDoc.data();
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
