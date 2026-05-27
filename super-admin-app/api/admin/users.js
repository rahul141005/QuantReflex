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

/**
 * Safely convert any timestamp value to an ISO string.
 * Handles: Firestore Timestamp, ISO string, Date, unix number, null, malformed.
 * NEVER crashes — returns null for unparseable values.
 */
function safeTimestampToISO(val) {
  if (val == null) return null;
  // Firestore Timestamp (.toDate method)
  if (typeof val.toDate === 'function') {
    try { return val.toDate().toISOString(); } catch (_) { return null; }
  }
  // Already an ISO string
  if (typeof val === 'string') {
    var d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  // Date object
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val.toISOString();
  }
  // Unix timestamp (number)
  if (typeof val === 'number' && isFinite(val)) {
    var ms = val < 1e12 ? val * 1000 : val;
    return new Date(ms).toISOString();
  }
  // Raw Firestore JSON { _seconds, _nanoseconds }
  if (typeof val === 'object' && val._seconds != null) {
    try {
      return new Date(val._seconds * 1000 + Math.floor((val._nanoseconds || 0) / 1e6)).toISOString();
    } catch (_) { return null; }
  }
  return null;
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
          displayName: (data.profile && data.profile.name) || data.email || 'Unknown',
          email: data.email || '',
          coachingId: data.coachingId || null,
          isPremium: !!data.isPremium,
          isPremiumPlus: !!data.isPremiumPlus,
          isTrial: !!data.isTrial,
          trialEnd: safeTimestampToISO(data.trialEnd),
          premiumPlusExpiry: safeTimestampToISO(data.premiumPlusExpiry),
          premiumPlusStatus: data.premiumPlusStatus || null,
          createdAt: safeTimestampToISO(data.createdAt),
          updatedAt: safeTimestampToISO(data.updatedAt),
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
          displayName: (userData.profile && userData.profile.name) || userData.email || 'Unknown',
          email: userData.email || '',
          coachingId: userData.coachingId || null,
          isPremium: !!userData.isPremium,
          isPremiumPlus: !!userData.isPremiumPlus,
          isTrial: !!userData.isTrial,
          trialEnd: safeTimestampToISO(userData.trialEnd),
          premiumPlusStatus: userData.premiumPlusStatus || null,
          premiumPlusExpiry: safeTimestampToISO(userData.premiumPlusExpiry),
          createdAt: safeTimestampToISO(userData.createdAt),
        },
        aiUsage: aiSnapshot.exists ? aiSnapshot.data() : { tokens: 0, count: 0 },
        recentDuels: [],
        entitlementLogs: []
      };

      duelsSnapshot.forEach(doc => {
        const d = doc.data();
        details.recentDuels.push({
          id: doc.id,
          status: d.status || 'unknown',
          winner: d.winner || null,
          result: d.result || null,
          createdAt: safeTimestampToISO(d.createdAt)
        });
      });

      entitlementLogs.forEach(doc => {
        const d = doc.data();
        details.entitlementLogs.push({
          id: doc.id,
          action: d.action || 'unknown',
          adminUid: d.adminUid || d.adminId || null,
          adminEmail: d.adminEmail || null,
          timestamp: safeTimestampToISO(d.timestamp)
        });
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
