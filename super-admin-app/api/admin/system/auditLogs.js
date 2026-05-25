const { withAdminAuth, methodGuard, formatError } = require('../../../_lib/middleware');
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
    
    // We aggregate logs from multiple collections to create a unified Audit Log timeline
    const [entitlementSnaps, notifSnaps] = await Promise.all([
      db.collection('entitlementLogs').orderBy('timestamp', 'desc').limit(25).get(),
      db.collection('notificationLogs').orderBy('timestamp', 'desc').limit(25).get()
    ]);

    const auditLogs = [];

    entitlementSnaps.forEach(doc => {
      const d = doc.data();
      auditLogs.push({
        id: doc.id,
        type: 'entitlement',
        action: d.action,
        target: d.uid,
        admin: d.adminUid || d.adminEmail || 'System',
        timestamp: d.timestamp ? d.timestamp.toMillis() : 0
      });
    });

    notifSnaps.forEach(doc => {
      const d = doc.data();
      auditLogs.push({
        id: doc.id,
        type: 'notification',
        action: `Broadcast to ${d.segment}`,
        target: `Sent: ${d.successCount}, Failed: ${d.failureCount}`,
        admin: d.adminUid || 'System',
        timestamp: d.timestamp ? d.timestamp.toMillis() : 0
      });
    });

    // Sort combined by timestamp desc
    auditLogs.sort((a, b) => b.timestamp - a.timestamp);

    // Convert timestamps to ISO string for client
    auditLogs.forEach(l => {
      l.timestamp = new Date(l.timestamp).toISOString();
    });

    return res.status(200).json(auditLogs);
  } catch (err) {
    console.error('Error fetching audit logs:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
