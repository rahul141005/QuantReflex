const { withAdminAuth, methodGuard, parseBody, formatError } = require('../../_lib/middleware');
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

async function handler(req, res) {
  if (methodGuard(req, res, 'POST')) return;

  const body = parseBody(req);
  const { coachingId, action } = body;

  if (!coachingId) {
    return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Coaching ID is required.' } });
  }

  if (!['suspend', 'activate', 'delete'].includes(action)) {
    return res.status(400).json({ error: { code: 'INVALID_ACTION', message: 'Action must be suspend, activate, or delete.' } });
  }

  try {
    const db = admin.firestore();
    const coachingRef = db.collection('coachings').doc(coachingId);
    
    // Use a transaction to ensure we read the latest state and update atomically
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(coachingRef);
      if (!doc.exists) {
        throw new Error('Coaching not found');
      }

      let newStatus = 'active';
      let isActive = true;

      if (action === 'suspend') {
        newStatus = 'suspended';
        isActive = false;
      } else if (action === 'delete') {
        newStatus = 'deleted';
        isActive = false;
      }

      transaction.update(coachingRef, {
        status: newStatus,
        isActive: isActive,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    // CASCADING EFFECT (Bulk operations cannot be in the same transaction easily if > 500)
    // Find all users belonging to this coaching
    if (action === 'suspend' || action === 'delete') {
      const usersSnapshot = await db.collection('users').where('coachingId', '==', coachingId).get();
      if (!usersSnapshot.empty) {
        // Chunk batches of 500
        const batches = [];
        let currentBatch = db.batch();
        let count = 0;

        usersSnapshot.forEach((userDoc) => {
          if (count === 500) {
            batches.push(currentBatch);
            currentBatch = db.batch();
            count = 0;
          }
          // Revoke entitlements when the coaching organization is suspended
          currentBatch.update(userDoc.ref, {
            isPremium: false,
            isPremiumPlus: false,
            premiumPlusStatus: 'revoked_org_suspended',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          count++;
        });

        if (count > 0) {
          batches.push(currentBatch);
        }

        // Commit all batches
        await Promise.all(batches.map(b => b.commit()));
      }
    }

    return res.status(200).json({ success: true, coachingId, newStatus: action });
  } catch (err) {
    console.error('Error mutating coaching:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
