const { withAuth, methodGuard, parseBody, formatError } = require('./_lib/middleware');
const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
  } catch (err) {
    console.error('Firebase admin initialization failed:', err);
  }
}

async function handler(req, res) {
  if (methodGuard(req, res, 'POST')) return;

  const body = parseBody(req);
  const coachingId = body.coachingId;

  if (!coachingId || typeof coachingId !== 'string' || coachingId.trim().length === 0) {
    return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Missing coaching ID.' } });
  }

  const cleanCoachingId = coachingId.trim();

  try {
    const db = admin.firestore();
    
    // Validate coaching again (ensure it exists and is active)
    const coachingDoc = await db.collection('coachings').doc(cleanCoachingId).get();
    if (!coachingDoc.exists) {
      return res.status(400).json({ error: { code: 'NOT_FOUND', message: 'Coaching ID does not exist.' } });
    }

    const data = coachingDoc.data();
    if (data.isActive === false || data.status === 'expired') {
      return res.status(400).json({ error: { code: 'INACTIVE', message: 'Coaching ID is inactive or expired.' } });
    }

    // Assign coachingId to user via Admin SDK
    await db.collection('users').doc(req.userId).set({
      coachingId: cleanCoachingId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return res.status(200).json({ success: true, message: 'Coaching claimed successfully.' });
  } catch (err) {
    console.error('Error claiming coaching:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAuth(handler);
