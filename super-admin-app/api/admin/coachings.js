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
  if (methodGuard(req, res, 'GET')) return;

  try {
    const db = admin.firestore();
    const snapshot = await db.collection('coachings').orderBy('createdAt', 'desc').get();
    
    const coachings = [];
    snapshot.forEach(doc => {
      coachings.push({
        id: doc.id,
        ...doc.data(),
        // serialize timestamps
        createdAt: doc.data().createdAt ? doc.data().createdAt.toDate().toISOString() : null,
        updatedAt: doc.data().updatedAt ? doc.data().updatedAt.toDate().toISOString() : null
      });
    });

    return res.status(200).json(coachings);
  } catch (err) {
    console.error('Error fetching coachings:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
