const { withAdminAuth, methodGuard, formatError } = require('../../_lib/middleware');
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
    const now = Date.now();
    const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000);

    const issues = [];

    // 1. Check for Expired Premium+ users that the Cloud Function missed
    const expiredPremiumPlusSnap = await db.collection('users')
      .where('isPremiumPlus', '==', true)
      .where('premiumPlusExpiry', '<', now)
      .limit(100)
      .get();
      
    if (!expiredPremiumPlusSnap.empty) {
      issues.push({
        type: 'EXPIRED_PREMIUM_PLUS',
        severity: 'high',
        message: `Found ${expiredPremiumPlusSnap.size} users with active Premium+ but expired timestamps.`,
        actionPayload: { fixEndpoint: '/api/admin/entitlements/mutate', action: 'revoke_expired' }
      });
    }

    // 2. Check for Orphaned Duels (Waiting for > 30 mins)
    const orphanDuelsSnap = await db.collection('duels')
      .where('status', 'in', ['waiting', 'ready'])
      .where('createdAt', '<', thirtyMinutesAgo)
      .limit(100)
      .get();
      
    if (!orphanDuelsSnap.empty) {
      issues.push({
        type: 'ORPHANED_DUELS',
        severity: 'medium',
        message: `Found ${orphanDuelsSnap.size} stale duel rooms clogging the database.`,
        actionPayload: { fixEndpoint: '/api/admin/duels/cleanup' }
      });
    }

    // 3. Sample check for missing PublicUsernames (takes latest 50 users)
    const recentUsers = await db.collection('users')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
      
    let missingUsernameCount = 0;
    const usernameChecks = [];
    
    recentUsers.forEach(doc => {
      const u = doc.data();
      if (u.username) {
        usernameChecks.push(
          db.collection('publicUsernames').doc(u.username.toLowerCase()).get().then(uDoc => {
            if (!uDoc.exists) missingUsernameCount++;
          })
        );
      }
    });

    await Promise.all(usernameChecks);

    if (missingUsernameCount > 0) {
      issues.push({
        type: 'MISSING_PUBLIC_USERNAMES',
        severity: 'critical',
        message: `Found ${missingUsernameCount} recent users missing their publicUsernames index (Duel invitations will fail).`,
        actionPayload: { fixEndpoint: '/api/admin/system/repair-usernames' }
      });
    }

    return res.status(200).json({
      status: issues.length > 0 ? 'issues_found' : 'healthy',
      issues: issues,
      scannedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Audit Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

module.exports = withAdminAuth(handler);
