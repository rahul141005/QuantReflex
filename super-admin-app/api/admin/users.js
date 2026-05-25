const { withAdminAuth, formatError } = require('../_lib/middleware');
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
  const action = req.query.action || 'list';

  try {
    const db = admin.firestore();

    if (action === 'list' && req.method === 'GET') {
      const { limit = '100', startAfter } = req.query;
      let query = db.collection('users').orderBy('createdAt', 'desc').limit(parseInt(limit, 10));

      if (startAfter) {
        const doc = await db.collection('users').doc(startAfter).get();
        if (doc.exists) {
          query = query.startAfter(doc);
        }
      }

      const snapshot = await query.get();
      
      const users = [];
      snapshot.forEach(doc => {
        const data = doc.data();
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
    }

    if (action === 'details' && req.method === 'GET') {
      const { uid } = req.query;
      if (!uid) return res.status(400).json({ error: 'Missing uid' });

      const [userDoc, aiSnapshot, duelsSnapshot, entitlementLogs] = await Promise.all([
        db.collection('users').doc(uid).get(),
        db.collection('users').doc(uid).collection('usage').doc('ai').get(),
        db.collection('duels').where(`participants.${uid}.status`, 'in', ['finished', 'exited']).limit(10).get(),
        db.collection('entitlementLogs').where('uid', '==', uid).orderBy('timestamp', 'desc').limit(5).get()
      ]);

      if (!userDoc.exists) {
        return res.status(404).json({ error: 'User not found' });
      }

      const userData = userDoc.data();
      
      const details = {
        profile: {
          uid: uid,
          username: userData.username || 'Unknown',
          email: userData.email || '',
          coachingId: userData.coachingId || null,
          isPremium: !!userData.isPremium,
          isPremiumPlus: !!userData.isPremiumPlus,
          premiumPlusStatus: userData.premiumPlusStatus || null,
          premiumPlusExpiry: userData.premiumPlusExpiry ? userData.premiumPlusExpiry.toDate().toISOString() : null,
          createdAt: userData.createdAt ? userData.createdAt.toDate().toISOString() : null,
        },
        aiUsage: aiSnapshot.exists ? aiSnapshot.data() : { tokens: 0, count: 0 },
        recentDuels: [],
        entitlementLogs: []
      };

      duelsSnapshot.forEach(doc => {
        details.recentDuels.push({ id: doc.id, status: doc.data().status, winner: doc.data().winner, createdAt: doc.data().createdAt ? doc.data().createdAt.toDate().toISOString() : null });
      });

      entitlementLogs.forEach(doc => {
        details.entitlementLogs.push({ id: doc.id, ...doc.data(), timestamp: doc.data().timestamp ? doc.data().timestamp.toDate().toISOString() : null });
      });

      return res.status(200).json(details);
    }

    return res.status(404).json({ error: 'User action not found' });
  } catch (err) {
    console.error('Error in user routes:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
