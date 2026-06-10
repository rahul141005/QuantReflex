const { methodGuard, formatError, parseBody, isCoachingActive } = require('../_lib/middleware');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
  } catch (err) {
    console.error('Firebase admin initialization failed:', err);
  }
}

// Basic regex validations
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* audit H3: per-IP in-memory rate limiter for this PUBLIC, unauthenticated
   endpoint. Defense-in-depth (per serverless instance, like the AI/admin
   limiters) — blunts scripted account-creation abuse. For a hard global
   cap, front this with App Check / a captcha / a shared counter. */
const _regRateMap = {};
let _regCheckCount = 0;
const REG_WINDOW_MS = 60 * 60 * 1000; /* 1 hour */
const REG_MAX_PER_WINDOW = 10;        /* accounts per IP per hour */

function _registerRateLimited(ip) {
  if (!ip) return false; /* cannot identify caller — do not block */
  const now = Date.now();
  if (++_regCheckCount >= 100) {
    _regCheckCount = 0;
    Object.keys(_regRateMap).forEach((k) => {
      if (now - _regRateMap[k].windowStart > REG_WINDOW_MS) delete _regRateMap[k];
    });
  }
  const entry = _regRateMap[ip];
  if (!entry || now - entry.windowStart > REG_WINDOW_MS) {
    _regRateMap[ip] = { count: 1, windowStart: now };
    return false;
  }
  entry.count++;
  return entry.count > REG_MAX_PER_WINDOW;
}

module.exports = async (req, res) => {
  // CORS for public access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (methodGuard(req, res, 'POST')) return;

  /* Rate-limit by client IP (audit H3) */
  const fwd = req.headers['x-forwarded-for'];
  const clientIp = (typeof fwd === 'string' ? fwd.split(',')[0].trim() : '') || req.socket?.remoteAddress || '';
  if (_registerRateLimited(clientIp)) {
    console.warn('[register] rate limit exceeded for ip:', clientIp);
    return res.status(429).json({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many sign-up attempts. Please try again later.', retryable: true } });
  }

  const body = parseBody(req);
  const { email, password, coachingId } = body;

  if (!email || !password) {
    return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Email and password are required.' } });
  }

  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: { code: 'INVALID_EMAIL', message: 'Invalid email address.' } });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: { code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters long.' } });
  }

  try {
    const db = admin.firestore();

    // 1. Validate Coaching ID (if provided)
    if (coachingId) {
      const coachingDoc = await db.collection('coachings').doc(coachingId).get();
      if (!coachingDoc.exists) {
        return res.status(404).json({ error: { code: 'COACHING_NOT_FOUND', message: 'The provided Coaching ID does not exist.' } });
      }
      const cData = coachingDoc.data();
      if (!isCoachingActive(cData)) {
        return res.status(403).json({ error: { code: 'COACHING_INACTIVE', message: 'This Coaching ID is currently inactive or suspended.' } });
      }
    }

    // 2. Create Firebase Auth User
    // Display name derived from email local part
    const displayName = email.split('@')[0] || 'User';
    let authUser;
    try {
      authUser = await admin.auth().createUser({
        email: email,
        password: password,
        displayName: displayName
      });
    } catch (authErr) {
      if (authErr.code === 'auth/email-already-exists') {
        return res.status(409).json({ error: { code: 'EMAIL_EXISTS', message: 'The email address is already in use by another account.' } });
      }
      throw authErr;
    }

    const uid = authUser.uid;

    // 3. Atomic Firestore Setup
    const batch = db.batch();

    // User Profile — email-first, no username
    const userRef = db.collection('users').doc(uid);
    batch.set(userRef, {
      uid: uid,
      email: email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      coachingId: coachingId || null,

      // Entitlement Defaults (v2 — safe free tier)
      plan: 'free',
      planType: null,
      planExpiry: null,
      planSource: null,
      isTrial: false,
      trialEnd: null,
      planUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastPaymentId: null
    });

    // Subcollections Setup
    // Initialize AI usage to empty defaults
    const aiUsageRef = userRef.collection('usage').doc('ai');
    batch.set(aiUsageRef, {
      wordProblemsUsedLifetime: 0,
      wordProblemsUsedToday: 0,
      explanationsUsed: 0
    });

    await batch.commit();

    // 4. Generate Custom Token for immediate client login
    const customToken = await admin.auth().createCustomToken(uid);

    return res.status(200).json({ success: true, token: customToken, uid: uid });

  } catch (err) {
    console.error('Signup Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
};
