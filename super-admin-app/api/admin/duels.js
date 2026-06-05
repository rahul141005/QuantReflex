const { withAdminAuth, methodGuard, formatError } = require('../_lib/middleware');
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

  try {
    const db = admin.firestore();
    
    // Find duels that have been stuck in 'waiting' for more than 24 hours,
    // or 'in_progress' for more than 4 hours.
    
    const now = Date.now();
    const waitingThreshold = now - (24 * 60 * 60 * 1000); // 24 hours ago
    const activeThreshold = now - (4 * 60 * 60 * 1000);   // 4 hours ago

    const snapshot = await db.collection('duels').where('status', 'in', ['waiting', 'active']).get();
    
    let deletedCount = 0;
    const batch = db.batch();

    snapshot.forEach(doc => {
      const data = doc.data();
      const createdAt = data.createdAt ? (typeof data.createdAt.toMillis === 'function' ? data.createdAt.toMillis() : Date.parse(data.createdAt)) : 0;
      
      let shouldDelete = false;
      if (data.status === 'waiting' && createdAt < waitingThreshold) {
        shouldDelete = true;
      } else if (data.status === 'active' && createdAt < activeThreshold) {
        shouldDelete = true;
      }

      if (shouldDelete) {
        batch.delete(doc.ref);
        deletedCount++;
      }
    });

    if (deletedCount > 0) {
      await batch.commit();
    }

    return res.status(200).json({ success: true, deletedCount: deletedCount });
  } catch (err) {
    console.error('Error cleaning up duels:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
