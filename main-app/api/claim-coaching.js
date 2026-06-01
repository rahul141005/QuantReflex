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
    const userRef = db.collection('users').doc(req.userId);
    const newCoachingRef = db.collection('coachings').doc(cleanCoachingId);

    await db.runTransaction(async (transaction) => {
      // 1. Read the new coaching document
      const newCoachingDoc = await transaction.get(newCoachingRef);
      if (!newCoachingDoc.exists) {
        throw new Error('NOT_FOUND: Coaching ID does not exist.');
      }

      const coachingData = newCoachingDoc.data();
      if (coachingData.isActive === false || coachingData.status === 'expired') {
        throw new Error('INACTIVE: Coaching ID is inactive or expired.');
      }

      // 2. Read user document to check for existing coaching
      const userDoc = await transaction.get(userRef);
      let oldCoachingId = null;
      if (userDoc.exists) {
        oldCoachingId = userDoc.data().coachingId;
      }

      // 3. If already claimed the same coaching, do nothing
      if (oldCoachingId === cleanCoachingId) return;

      // 4. Increment the new coaching document's student count
      transaction.update(newCoachingRef, {
        studentsCount: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 5. Decrement the old coaching document's student count (if any)
      if (oldCoachingId && typeof oldCoachingId === 'string' && oldCoachingId.trim().length > 0) {
        const oldCoachingRef = db.collection('coachings').doc(oldCoachingId);
        const oldDoc = await transaction.get(oldCoachingRef);
        if (oldDoc.exists) {
          transaction.update(oldCoachingRef, {
            studentsCount: admin.firestore.FieldValue.increment(-1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }

      // 6. Update user document
      transaction.set(userRef, {
        coachingId: cleanCoachingId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });

    return res.status(200).json({ success: true, message: 'Coaching claimed successfully.' });
  } catch (err) {
    console.error('Error claiming coaching:', err);
    
    // Parse custom transaction errors to return proper HTTP 400
    if (err.message && err.message.startsWith('NOT_FOUND:')) {
      return res.status(400).json({ error: { code: 'NOT_FOUND', message: 'Coaching ID does not exist.' } });
    }
    if (err.message && err.message.startsWith('INACTIVE:')) {
      return res.status(400).json({ error: { code: 'INACTIVE', message: 'Coaching ID is inactive or expired.' } });
    }
    
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAuth(handler);
