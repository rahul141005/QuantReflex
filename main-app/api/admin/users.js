const { withAdminAuth, methodGuard, formatError } = require('../_lib/middleware');
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
  if (methodGuard(req, res, 'GET')) return;

  try {
    const db = admin.firestore();
    const { limit = '100', startAfter } = req.query;
    
    let query = db.collection('users').orderBy('createdAt', 'desc').limit(parseInt(limit, 10));

    if (startAfter) {
      // Decode the cursor (assuming it's a timestamp string or ID)
      // Since we order by createdAt desc, we need the doc to start after.
      const doc = await db.collection('users').doc(startAfter).get();
      if (doc.exists) {
        query = query.startAfter(doc);
      }
    }

    const snapshot = await query.get();
    
    const users = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      // Don't send entire object if it's too large, but for now we send what's needed.
      users.push({
        id: doc.id,
        uid: doc.id,
        username: data.username || 'Unknown',
        email: data.email || '',
        coachingId: data.coachingId || null,
        isPremium: !!data.isPremium,
        isPremiumPlus: !!data.isPremiumPlus,
        premiumPlusStatus: data.premiumPlusStatus || null,
        createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
        updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : null,
      });
    });

    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    const nextCursor = lastDoc ? lastDoc.id : null;

    return res.status(200).json({
      data: users,
      nextCursor: nextCursor
    });

  } catch (err) {
    console.error('Error fetching users:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
