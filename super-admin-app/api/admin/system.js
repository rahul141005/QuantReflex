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
  const action = req.query.action || 'dashboard';

  try {
    const db = admin.firestore();

    if (action === 'dashboard' && req.method === 'GET') {
      const usersSnap = await db.collection('users').count().get();
      const totalUsers = usersSnap.data().count;

      const premiumPlusSnap = await db.collection('users').where('isPremiumPlus', '==', true).count().get();
      const premiumPlusUsers = premiumPlusSnap.data().count;

      const premiumOnlySnap = await db.collection('users')
        .where('isPremium', '==', true)
        .where('isPremiumPlus', '==', false)
        .count().get();
      const premiumUsers = premiumOnlySnap.data().count;

      const trialSnap = await db.collection('users').where('isTrial', '==', true).count().get();
      const trialUsers = trialSnap.data().count;

      const freeUsers = Math.max(0, totalUsers - premiumUsers - premiumPlusUsers - trialUsers);

      return res.status(200).json({
        totalUsers: totalUsers,
        freeUsers: freeUsers,
        trialUsers: trialUsers,
        premiumUsers: premiumUsers,
        premiumPlusUsers: premiumPlusUsers,
        aiTokens: 0
      });
    }

    if (action === 'health' && req.method === 'GET') {
      const now = Date.now();
      const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000);
      const issues = [];
      const expiredPremiumPlusSnap = await db.collection('users').where('isPremiumPlus', '==', true).where('premiumPlusExpiry', '<', now).limit(100).get();
      if (!expiredPremiumPlusSnap.empty) { issues.push({ type: 'EXPIRED_PREMIUM_PLUS', severity: 'high', message: `Found ${expiredPremiumPlusSnap.size} users with active Premium+ but expired timestamps.`, actionPayload: { fixEndpoint: '/api/admin/entitlements/mutate', action: 'revoke_expired' } }); }
      const orphanDuelsSnap = await db.collection('duels').where('status', 'in', ['waiting', 'ready']).where('createdAt', '<', thirtyMinutesAgo).limit(100).get();
      if (!orphanDuelsSnap.empty) { issues.push({ type: 'ORPHANED_DUELS', severity: 'medium', message: `Found ${orphanDuelsSnap.size} stale duel rooms clogging the database.`, actionPayload: { fixEndpoint: '/api/admin/duels/cleanup' } }); }
      const recentUsers = await db.collection('users').orderBy('createdAt', 'desc').limit(50).get();
      let missingUsernameCount = 0; const usernameChecks = [];
      recentUsers.forEach(doc => { const u = doc.data(); if (u.username) { usernameChecks.push(db.collection('publicUsernames').doc(u.username.toLowerCase()).get().then(uDoc => { if (!uDoc.exists) missingUsernameCount++; })); } });
      await Promise.all(usernameChecks);
      if (missingUsernameCount > 0) { issues.push({ type: 'MISSING_PUBLIC_USERNAMES', severity: 'critical', message: `Found ${missingUsernameCount} recent users missing their publicUsernames index (Duel invitations will fail).`, actionPayload: { fixEndpoint: '/api/admin/system/repair-usernames' } }); }
      return res.status(200).json({ status: issues.length > 0 ? 'issues_found' : 'healthy', issues: issues, scannedAt: new Date().toISOString() });
    }

    if (action === 'auditLogs' && req.method === 'GET') {
      const [entitlementSnaps, notifSnaps] = await Promise.all([ db.collection('entitlementLogs').orderBy('timestamp', 'desc').limit(25).get(), db.collection('notificationLogs').orderBy('timestamp', 'desc').limit(25).get() ]);
      const auditLogs = [];
      entitlementSnaps.forEach(doc => { const d = doc.data(); auditLogs.push({ id: doc.id, type: 'entitlement', action: d.action, target: d.uid, admin: d.adminUid || d.adminEmail || 'System', timestamp: d.timestamp ? d.timestamp.toMillis() : 0 }); });
      notifSnaps.forEach(doc => { const d = doc.data(); auditLogs.push({ id: doc.id, type: 'notification', action: `Broadcast to ${d.segment}`, target: `Sent: ${d.successCount}, Failed: ${d.failureCount}`, admin: d.adminUid || 'System', timestamp: d.timestamp ? d.timestamp.toMillis() : 0 }); });
      auditLogs.sort((a, b) => b.timestamp - a.timestamp);
      auditLogs.forEach(l => { l.timestamp = new Date(l.timestamp).toISOString(); });
      return res.status(200).json(auditLogs);
    }

    if (action === 'aggregate-metrics' && req.method === 'POST') {
      const now = Date.now(); const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000); const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
      const dauSnapshot = await db.collection('users').where('updatedAt', '>=', admin.firestore.Timestamp.fromDate(oneDayAgo)).count().get(); const dau = dauSnapshot.data().count;
      const mauSnapshot = await db.collection('users').where('updatedAt', '>=', admin.firestore.Timestamp.fromDate(thirtyDaysAgo)).count().get(); const mau = mauSnapshot.data().count;
      const aiUsageSnap = await db.collectionGroup('usage').where('tokens', '>', 0).get();
      let totalAiTokens = 0; aiUsageSnap.forEach(doc => { if (doc.ref.id === 'ai') { totalAiTokens += (doc.data().tokens || 0); } });
      const todayStr = new Date().toISOString().split('T')[0]; const metricsRef = db.collection('metrics').doc(todayStr);
      const payload = { dau: dau, mau: mau, totalAiTokens: totalAiTokens, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
      await metricsRef.set(payload, { merge: true });
      await db.collection('metrics').doc('latest').set(payload, { merge: true });
      return res.status(200).json({ success: true, metrics: payload });
    }

    return res.status(404).json({ error: 'System action not found' });
  } catch (err) {
    console.error('System Route Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
