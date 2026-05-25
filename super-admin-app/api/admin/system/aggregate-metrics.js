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
  if (methodGuard(req, res, 'POST')) return; // Triggered via POST

  try {
    const db = admin.firestore();
    
    // Calculate cutoff timestamps
    const now = Date.now();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    // 1. DAU: Users active in last 24 hours
    // Assuming we track 'lastActiveAt' on users (if not, we use createdAt/updatedAt as proxy for now)
    const dauSnapshot = await db.collection('users').where('updatedAt', '>=', admin.firestore.Timestamp.fromDate(oneDayAgo)).count().get();
    const dau = dauSnapshot.data().count;

    // 2. MAU: Users active in last 30 days
    const mauSnapshot = await db.collection('users').where('updatedAt', '>=', admin.firestore.Timestamp.fromDate(thirtyDaysAgo)).count().get();
    const mau = mauSnapshot.data().count;

    // 3. AI Tokens (Total all-time for now, or we can aggregate a subcollection)
    // For God-tier analytics, we fetch all users' ai usage subcollections and sum them up
    // Warning: At high scale, this requires a distributed counter or a BigQuery stream.
    // We'll simulate a batch sum for now.
    const aiUsageSnap = await db.collectionGroup('usage').where('tokens', '>', 0).get();
    let totalAiTokens = 0;
    aiUsageSnap.forEach(doc => {
      if (doc.ref.id === 'ai') {
        totalAiTokens += (doc.data().tokens || 0);
      }
    });

    // Save to pre-aggregated doc
    const todayStr = new Date().toISOString().split('T')[0];
    const metricsRef = db.collection('metrics').doc(todayStr);
    
    const payload = {
      dau: dau,
      mau: mau,
      totalAiTokens: totalAiTokens,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await metricsRef.set(payload, { merge: true });
    
    // Also update a 'latest' pointer for fast dashboard reads
    await db.collection('metrics').doc('latest').set(payload, { merge: true });

    return res.status(200).json({ success: true, metrics: payload });
  } catch (err) {
    console.error('Error aggregating metrics:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}

// NOTE: In production, you would secure this with a secret token (e.g. `req.headers.authorization === process.env.CRON_SECRET`)
// rather than `withAdminAuth` if it's called by a CRON service. 
// For this pass, we leave it as withAdminAuth to let Super Admin trigger it manually.
module.exports = withAdminAuth(handler);
