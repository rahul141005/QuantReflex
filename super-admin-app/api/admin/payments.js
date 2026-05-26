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

/** Safely convert any timestamp to ISO string */
function _safeTS(val) {
  if (val == null) return null;
  if (typeof val.toDate === 'function') { try { return val.toDate().toISOString(); } catch (_) { return null; } }
  if (typeof val === 'string') { var d = new Date(val); return isNaN(d.getTime()) ? null : d.toISOString(); }
  if (val instanceof Date) { return isNaN(val.getTime()) ? null : val.toISOString(); }
  if (typeof val === 'number' && isFinite(val)) { return new Date(val < 1e12 ? val * 1000 : val).toISOString(); }
  if (typeof val === 'object' && val._seconds != null) { try { return new Date(val._seconds * 1000).toISOString(); } catch (_) { return null; } }
  return null;
}

async function handler(req, res) {
  if (methodGuard(req, res, 'GET')) return;

  try {
    const db = admin.firestore();
    
    // Fetch last 50 entitlement logs
    const snapshot = await db.collection('entitlementLogs').orderBy('timestamp', 'desc').limit(50).get();
    
    const logs = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      logs.push({
        id: doc.id,
        uid: data.uid || null,
        action: data.action || 'unknown',
        adminUid: data.adminUid || data.adminId || null,
        adminEmail: data.adminEmail || null,
        timestamp: _safeTS(data.timestamp)
      });
    });

    return res.status(200).json(logs);

  } catch (err) {
    console.error('Error fetching payment logs:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
