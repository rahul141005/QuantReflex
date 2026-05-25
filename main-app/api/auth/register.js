const { methodGuard, formatError, parseBody } = require('../_lib/middleware');
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
const usernameRegex = /^[a-zA-Z0-9_]{4,30}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async (req, res) => {
  // CORS for public access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (methodGuard(req, res, 'POST')) return;

  const body = parseBody(req);
  const { username, email, password, coachingId } = body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Username, email, and password are required.' } });
  }

  if (!usernameRegex.test(username)) {
    return res.status(400).json({ error: { code: 'INVALID_USERNAME', message: 'Username must be 4-30 characters, alphanumeric and underscores only.' } });
  }

  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: { code: 'INVALID_EMAIL', message: 'Invalid email address.' } });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: { code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters long.' } });
  }

  try {
    const db = admin.firestore();

    // 1. Validate Username uniqueness (Case insensitive via publicUsernames)
    const lowerUsername = username.toLowerCase();
    const usernameDoc = await db.collection('publicUsernames').doc(lowerUsername).get();
    if (usernameDoc.exists) {
      return res.status(409).json({ error: { code: 'USERNAME_TAKEN', message: 'This username is already taken.' } });
    }

    // 2. Validate Coaching ID (if provided)
    if (coachingId) {
      const coachingDoc = await db.collection('coachings').doc(coachingId).get();
      if (!coachingDoc.exists) {
        return res.status(404).json({ error: { code: 'COACHING_NOT_FOUND', message: 'The provided Coaching ID does not exist.' } });
      }
      const cData = coachingDoc.data();
      if (cData.isActive === false || cData.status === 'suspended' || cData.status === 'deleted') {
        return res.status(403).json({ error: { code: 'COACHING_INACTIVE', message: 'This Coaching ID is currently inactive or suspended.' } });
      }
    }

    // 3. Create Firebase Auth User
    let authUser;
    try {
      authUser = await admin.auth().createUser({
        email: email,
        password: password,
        displayName: username
      });
    } catch (authErr) {
      if (authErr.code === 'auth/email-already-exists') {
        return res.status(409).json({ error: { code: 'EMAIL_EXISTS', message: 'The email address is already in use by another account.' } });
      }
      throw authErr;
    }

    const uid = authUser.uid;

    // 4. Atomic Firestore Setup
    const batch = db.batch();

    // User Profile
    const userRef = db.collection('users').doc(uid);
    batch.set(userRef, {
      uid: uid,
      username: username,
      email: email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      coachingId: coachingId || null,
      
      // Entitlement Defaults (Safe)
      isPremium: false,
      isPremiumPlus: false,
      hasPaid: false,
      isTrial: false,
      trialEnd: null,
      premiumPlusExpiry: null,
      premiumPlusStatus: null
    });

    // Public Username Entry
    const publicRef = db.collection('publicUsernames').doc(lowerUsername);
    batch.set(publicRef, {
      uid: uid,
      username: username,
      displayName: username,
      isPremiumPlus: false
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

    // 5. Generate Custom Token for immediate client login
    const customToken = await admin.auth().createCustomToken(uid);

    return res.status(200).json({ success: true, token: customToken, uid: uid });

  } catch (err) {
    console.error('Signup Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
};
